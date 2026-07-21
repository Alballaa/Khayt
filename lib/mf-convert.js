'use strict';
/**
 * 3MF converter engine (3.1) — the BedReady-style multi-printer tooling.
 *
 * A 3MF is a ZIP. This engine reads every member, rewrites ONLY the slicer metadata /
 * `Metadata/*.config` members, and repackages — the mesh (`3D/*.model`), relationships
 * (`_rels`, `[Content_Types].xml`) and thumbnails pass through byte-identical, so a
 * conversion can never corrupt geometry. Worst case a metadata field is imperfect and the
 * maker tweaks it in their slicer; the file always opens.
 *
 * Three operations (the maker picked all): retarget to a printer (re-profile: printer
 * model + bed + nozzle) combined with an optional colour→slot **remap**, and **normalize**
 * (strip vendor-locked metadata → a clean standard 3MF any slicer opens).
 *
 * Pure Node (Buffer + the zip read/write libs). Main-process only, no DOM.
 */
(function (global) {
  const zipRead = (typeof require === 'function') ? require('./zip-read') : global.KhaytZip;
  const zipWrite = (typeof require === 'function') ? require('./zip-write') : global.KhaytZipWrite;
  const profiles = (typeof require === 'function') ? require('./printer-profiles') : global.KhaytPrinterProfiles;
  const mfMesh = (typeof require === 'function') ? require('./mf-mesh') : global.mfMesh;
  const fullSpectrum = (typeof require === 'function') ? require('./full-spectrum') : global.fullSpectrum;
  const colorBands = (typeof require === 'function') ? require('./color-bands') : global.KhaytColorBands;
  const swapPauses = (typeof require === 'function') ? require('./swap-pauses') : global.KhaytSwapPauses;
  let orcaDb = null; // installed Snapmaker Orca profile DB (main-process only; absent in the renderer/browser)
  try { if (typeof require === 'function') orcaDb = require('./orca-db'); } catch (_) { orcaDb = null; }

  const CFG_BAMBU = /Metadata\/(project_settings|model_settings|slice_info)\.config$/i;
  const CFG_PRUSA = /Metadata\/(Slic3r_PE|Prusa_?Slicer)\.config$/i;
  const GEOMETRY = /(^3D\/|^_rels\/|\.rels$|\[Content_Types\]\.xml$|\.model$)/i;

  function normHex(s) {
    const m = /#?([0-9a-fA-F]{6})/.exec(String(s || ''));
    return m ? ('#' + m[1].toUpperCase()) : null;
  }

  // Zip-bomb defence: zip-read caps each member's inflated size, but a 3MF can hold many members.
  // Bound the CUMULATIVE inflated bytes (and the member count) so a multi-entry bomb can't OOM the
  // main process when a downloaded file is opened. 1 GiB is far above any real multicolour 3MF.
  const MEMBERS_TOTAL_BUDGET = 1024 * 1024 * 1024;
  const MEMBERS_MAX_COUNT = 4096;

  /** Read every member of a 3MF into { name, data:Buffer }. Returns [] on a bad file. */
  function readMembers(buf) {
    let zip;
    try { zip = zipRead.openZip(buf); } catch (_) { return []; }
    if (!zip || !zip.entries) return [];
    const out = [];
    let total = 0;
    for (const e of zip.entries) {
      if (out.length >= MEMBERS_MAX_COUNT) break;
      const data = zip.file(e.name);
      if (!data) continue;
      total += data.length;
      if (total > MEMBERS_TOTAL_BUDGET) break; // aggregate zip-bomb guard — stop inflating further
      out.push({ name: e.name, data });
    }
    return out;
  }

  function memberText(members, re) {
    const m = members.find((x) => re.test(x.name));
    return m ? m.data.toString('utf8') : null;
  }

  function detectFlavour(members) {
    const names = members.map((m) => m.name);
    if (names.some((n) => CFG_BAMBU.test(n))) {
      // Bambu vs Orca share the config family; slice_info's header hints at Orca.
      const si = memberText(members, /slice_info\.config$/i) || '';
      return /orca/i.test(si) ? 'orca' : 'bambu';
    }
    if (names.some((n) => CFG_PRUSA.test(n))) return 'prusa';
    return 'generic';
  }

  /** Lenient JSON parse of a *.config member (Bambu/Orca project settings). */
  function tryJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  /** Ordered filament colours from whatever config the file carries. */
  function extractFilaments(members) {
    let list = [];
    // Bambu/Orca JSON project settings.
    const projText = memberText(members, /project_settings\.config$/i)
      || memberText(members, /model_settings\.config$/i);
    const proj = tryJson(projText);
    if (proj && Array.isArray(proj.filament_colour)) {
      list = proj.filament_colour.map((c, i) => ({ index: i, color: normHex(c) })).filter((f) => f.color);
    }
    if (!list.length) {
      // Bambu/Orca slice_info.config — <filament id="1" color="#hex" used_g="..">.
      const slice = memberText(members, /slice_info\.config$/i);
      if (slice) {
        const out = [];
        const re = /<filament\b[^>]*>/g; let m;
        while ((m = re.exec(slice))) {
          const color = normHex((/colou?r="([^"]+)"/i.exec(m[0]) || [])[1]);
          if (color) out.push({ index: out.length, color });
        }
        if (out.length) list = out;
      }
    }
    if (!list.length) {
      // PrusaSlicer: filament_colour = #a;#b;#c
      const prusa = memberText(members, CFG_PRUSA);
      if (prusa) {
        const line = /filament_colou?r\s*=\s*([#0-9a-fA-F;,\s]+)/i.exec(prusa);
        if (line) {
          list = line[1].split(/[;,]/).map((s) => normHex(s)).filter(Boolean)
            .map((color, i) => ({ index: i, color }));
        }
      }
    }
    // PrusaSlicer "Full Spectrum" (ColorMix): the real palette is the physical bases PLUS the virtual
    // (mixed) colours in *_full_spectrum.json; filament_colour only carries the bases, so the mixed states
    // (5+) would otherwise be invisible to conversion + Full-Spectrum planning. Prefer the FS palette when
    // it's strictly longer — mirrors the preview reader (lib/mf-mesh.js).
    if (mfMesh && mfMesh.fullSpectrumFromMembers) {
      const fsPal = mfMesh.fullSpectrumFromMembers(members).palette;
      if (fsPal && fsPal.length > list.length) {
        list = fsPal.map((color, i) => ({ index: i, color: normHex(color) })).filter((f) => f.color);
      }
    }
    return list;
  }

  /**
   * Best-effort source metadata for the pre-convert summary: original printer, bed, nozzle,
   * layer height, per-filament grams, total grams and print time. Never throws — a field we
   * can't find is simply omitted.
   */
  function extractMeta(members) {
    const meta = { printerModel: null, nozzle: null, layerHeight: null, bed: null, grams: [], totalGrams: 0, printMinutes: null };
    const projText = memberText(members, /project_settings\.config$/i) || memberText(members, /model_settings\.config$/i);
    const proj = tryJson(projText);
    if (proj) {
      meta.printerModel = proj.printer_model || proj.printer_settings_id || null;
      const nz = proj.nozzle_diameter;
      meta.nozzle = Array.isArray(nz) ? Number(nz[0]) : (Number(nz) || null);
      meta.layerHeight = Number(proj.layer_height) || null;
      const pa = proj.printable_area; // ["0x0","256x0","256x256","0x256"]
      if (Array.isArray(pa) && pa.length >= 3) {
        let mx = 0, my = 0;
        for (const s of pa) { const c = /(-?[\d.]+)x(-?[\d.]+)/.exec(String(s)); if (c) { mx = Math.max(mx, +c[1]); my = Math.max(my, +c[2]); } }
        if (mx && my) meta.bed = { x: Math.round(mx), y: Math.round(my) };
      }
    }
    const slice = memberText(members, /slice_info\.config$/i);
    if (slice) {
      const re = /<filament\b[^>]*>/g; let m;
      while ((m = re.exec(slice))) { const g = parseFloat((/used_g="([\d.]+)"/i.exec(m[0]) || [])[1]); if (!isNaN(g)) meta.grams.push(g); }
      if (!meta.printerModel) { const pm = /(?:printer_model_id|Printer Model)"?\s*(?:=|value=)?\s*"?([^"<>]+)"?/i.exec(slice); if (pm) meta.printerModel = pm[1].trim(); }
      const pt = /prediction="?(\d+)"?/i.exec(slice); if (pt) meta.printMinutes = Math.round(+pt[1] / 60);
    }
    const prusa = memberText(members, CFG_PRUSA);
    if (prusa) {
      if (!meta.printerModel) { const p = /^printer_model\s*=\s*(.+)$/im.exec(prusa); if (p) meta.printerModel = p[1].trim(); }
      if (!meta.nozzle) { const nz = /^nozzle_diameter\s*=\s*([\d.]+)/im.exec(prusa); if (nz) meta.nozzle = +nz[1]; }
      if (!meta.layerHeight) { const lh = /^layer_height\s*=\s*([\d.]+)/im.exec(prusa); if (lh) meta.layerHeight = +lh[1]; }
      if (!meta.bed) { const bs = /^bed_shape\s*=\s*(.+)$/im.exec(prusa); if (bs) { const pts = bs[1].split(',').map((s) => s.split('x').map(Number)); const xs = pts.map((p) => p[0]).filter(Number.isFinite), ys = pts.map((p) => p[1]).filter(Number.isFinite); if (xs.length && ys.length) meta.bed = { x: Math.round(Math.max(...xs)), y: Math.round(Math.max(...ys)) }; } }
    }
    meta.totalGrams = Math.round(meta.grams.reduce((a, b) => a + b, 0) * 10) / 10;
    return meta;
  }

  const UNIT_MM = { micron: 0.001, micrometer: 0.001, millimeter: 1, centimeter: 10, meter: 1000, inch: 25.4, foot: 304.8 };
  const parseT = (s) => { const t = String(s || '').trim().split(/\s+/).map(Number); return (t.length === 12 && t.every(Number.isFinite)) ? t : null; };
  const cornersOf = (b) => { const o = []; for (const X of [b.mnx, b.mxx]) for (const Y of [b.mny, b.mxy]) for (const Z of [b.mnz, b.mxz]) o.push([X, Y, Z]); return o; };
  const applyT = (p, t) => t ? [p[0] * t[0] + p[1] * t[3] + p[2] * t[6] + t[9], p[0] * t[1] + p[1] * t[4] + p[2] * t[7] + t[10], p[0] * t[2] + p[1] * t[5] + p[2] * t[8] + t[11]] : p;
  const bboxOf = (pts) => { let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[2] < z0) z0 = p[2]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; if (p[2] > z1) z1 = p[2]; } return { mnx: x0, mny: y0, mnz: z0, mxx: x1, mxy: y1, mxz: z1 }; };

  /**
   * Overall model footprint (mm) from the mesh — the union of every build item's transformed
   * object bounding box, honouring the file's declared unit and resolving <component>-composed
   * assemblies recursively. Best-effort and safe-by-default: returns null (→ no fit verdict shown)
   * whenever geometry can't be fully resolved, so the bed-fit check never reports a false "Fits".
   */
  function computeBounds(members) {
    const norm = (p) => String(p || '').replace(/^\/+/, '').toLowerCase();
    // Parse EVERY .model member: Bambu/Orca "split" 3MFs keep geometry in 3D/Objects/*.model
    // referenced by p:path from the root, so a single-member read resolved to null (→ no fit
    // verdict). Objects are keyed "<normpath>#<id>" so cross-file <component> refs resolve;
    // the root is the member carrying the <build> block. Mirrors _extractCore's keying.
    const modelMembers = members.filter((m) => /\.model$/i.test(m.name) && m.data && m.data.length <= 48 * 1024 * 1024);
    if (!modelMembers.length) return null;

    const objs = {};
    let rootKey = null, rootText = '', scale = 1, firstKey = null, firstScale = 1;
    for (const mm of modelMembers) {
      let text;
      try { text = mm.data.toString('utf8'); } catch (_) { continue; } // over V8's string limit — skip, don't fail all
      const fkey = norm(mm.name);
      const fscale = UNIT_MM[((/<model\b[^>]*\bunit="([^"]+)"/i.exec(text) || [])[1] || 'millimeter').toLowerCase()] || 1;
      if (!firstKey) { firstKey = fkey; firstScale = fscale; }
      if (!rootKey && /<build\b[^>]*>[\s\S]*?<item\b/i.test(text)) { rootKey = fkey; rootText = text; scale = fscale; }
      const objRe = /<object\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/object>/g; let om;
      while ((om = objRe.exec(text))) {
        const block = om[2];
        const comps = [];
        const cRe = /<component\b([^>]*?)\/?>/g; let cm;
        while ((cm = cRe.exec(block))) {
          const ref = (/\bobjectid="([^"]+)"/i.exec(cm[1]) || [])[1];
          if (!ref) continue;
          const pp = (/\b(?:p:)?path="([^"]+)"/i.exec(cm[1]) || [])[1];
          comps.push({ ref, path: pp ? norm(pp) : fkey, t: parseT((/transform="([^"]+)"/i.exec(cm[1]) || [])[1]) });
        }
        const vRe = /<vertex\b([^>]*?)\/?>/g; let vm;
        let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity, has = false;
        while ((vm = vRe.exec(block))) { const va = vm[1]; const x = parseFloat((/\bx=["']?(-?[\d.]+(?:[eE][+-]?\d+)?)/.exec(va) || [])[1]), y = parseFloat((/\by=["']?(-?[\d.]+(?:[eE][+-]?\d+)?)/.exec(va) || [])[1]), z = parseFloat((/\bz=["']?(-?[\d.]+(?:[eE][+-]?\d+)?)/.exec(va) || [])[1]); if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue; has = true; if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z; }
        objs[fkey + '#' + om[1]] = { verts: has ? { mnx, mny, mnz, mxx, mxy, mxz } : null, comps };
      }
    }
    if (!Object.keys(objs).length) return null;
    if (!rootKey) { rootKey = firstKey; rootText = ''; scale = firstScale; } // no <build> → resolve every object

    // Resolve an object's bbox in its own local space (memoized, cycle-guarded). Returns null if
    // any referenced component can't be resolved — the caller then bails rather than under-count.
    const memo = {};
    function resolve(key, seen) {
      if (memo[key]) return memo[key];
      const o = objs[key];
      if (!o || (seen && seen.has(key))) return null;
      const pts = [];
      if (o.verts) pts.push(...cornersOf(o.verts));
      for (const c of o.comps) {
        const child = resolve(c.path + '#' + c.ref, new Set(seen || []).add(key));
        if (!child) return null;
        for (const p of cornersOf(child)) pts.push(applyT(p, c.t));
      }
      if (!pts.length) return null;
      return (memo[key] = bboxOf(pts));
    }

    const buildBlock = (/<build\b[^>]*>([\s\S]*?)<\/build>/i.exec(rootText || '') || [])[1];
    const items = [];
    if (buildBlock) { const itRe = /<item\b[^>]*>/g; let im; while ((im = itRe.exec(buildBlock))) items.push(im[0]); }
    const pts = [];
    if (items.length) {
      for (const it of items) {
        const b = resolve(rootKey + '#' + (/objectid="([^"]+)"/i.exec(it) || [])[1], null);
        if (!b) return null; // an unresolvable item → don't trust the footprint
        for (const p of cornersOf(b)) pts.push(applyT(p, parseT((/transform="([^"]+)"/i.exec(it) || [])[1])));
      }
    } else {
      for (const key in objs) { const b = resolve(key, null); if (b) for (const p of cornersOf(b)) pts.push(p); }
    }
    if (!pts.length) return null;
    const g = bboxOf(pts);
    return { x: Math.round((g.mxx - g.mnx) * scale * 10) / 10, y: Math.round((g.mxy - g.mny) * scale * 10) / 10, z: Math.round((g.mxz - g.mnz) * scale * 10) / 10 };
  }

  /**
   * Extract the model's triangle soup in global mm coordinates — vertices resolved through
   * each object's triangles, <component> assemblies (recursively) and the build items'
   * transforms, scaled by the file's declared unit. Used to write a 3MF back out to STL.
   * Returns null when geometry can't be fully resolved or the mesh is too large to scan.
   */
  // Core mesh reader. Parses EVERY .model member (Bambu/Orca "split" 3MFs keep geometry in
  // 3D/Objects/*.model referenced via p:path), keys objects "<normpath>#<id>", follows
  // components / build items. When wantPaint, also captures each triangle's per-facet paint
  // code (Bambu/Orca paint_color, Prusa mmu_segmentation) in emit order for true multicolour.
  function _extractCore(members, wantPaint, opts) {
    const norm = (p) => String(p || '').replace(/^\/+/, '').toLowerCase();
    // Cap per-member size only near V8's max string length (~512M chars) — a detailed model can
    // keep its whole mesh in one big 3D/Objects/*.model part, and dropping it left us with just
    // the component-reference root (no vertices) → an empty mesh. 480MB comfortably clears the
    // largest real files while staying under the toString() limit.
    const modelMembers = members.filter((m) => /\.model$/i.test(m.name) && m.data && m.data.length <= 480 * 1024 * 1024);
    if (!modelMembers.length) return null;
    // Preview thinning: a multi-million-triangle model only needs a representative slice on
    // screen. Rather than build every triangle as a nested array (gigabytes, seconds of stall,
    // and OOM in the main process) then decimate, count facets up front and keep only every
    // Nth during the parse. opts.maxTris caps the built mesh; without it we keep everything
    // (the STL-export path needs the full mesh). thinned flags that geometry was sampled.
    const maxTris = (opts && opts.maxTris > 0) ? opts.maxTris : 0;
    let stride = 1;
    if (maxTris) {
      let total = 0; const needle = Buffer.from('<triangle');
      for (const mm of modelMembers) { let i = 0; const b = mm.data; while ((i = b.indexOf(needle, i)) !== -1) { total++; i += needle.length; } }
      if (total > maxTris) stride = Math.ceil(total / maxTris);
    }
    const thinned = stride > 1;
    let gTri = 0; // running facet counter across all objects, for uniform stride sampling
    const paintRe = /\b(?:paint_color|(?:slic3r(?:pe)?:)?mmu_segmentation)="([^"]+)"/i;
    const objs = {};
    // Only the root file's text (the one with the <build> block) is needed after parsing; keeping
    // every file's text would double-hold a 200MB+ geometry part. Each non-root text is dropped as
    // its loop iteration ends so peak memory is ~one big file at a time.
    let rootKey = null, rootText = '', scale = 1, firstKey = null, firstScale = 1;
    for (const mm of modelMembers) {
      let text;
      try { text = mm.data.toString('utf8'); } catch (_) { continue; } // over V8's string limit — skip, don't fail all
      const fkey = norm(mm.name);
      const fscale = UNIT_MM[((/<model\b[^>]*\bunit="([^"]+)"/i.exec(text) || [])[1] || 'millimeter').toLowerCase()] || 1;
      if (!firstKey) { firstKey = fkey; firstScale = fscale; }
      if (!rootKey && /<build\b[^>]*>[\s\S]*?<item\b/i.test(text)) { rootKey = fkey; rootText = text; scale = fscale; }
      const objRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/g; let om;
      while ((om = objRe.exec(text))) {
        const id = (/\bid="([^"]+)"/i.exec(om[1]) || [])[1];
        if (!id) continue;
        const block = om[2];
        const verts = [];
        // Robust float parse: accepts scientific notation incl. negative exponents (1.5e-3),
        // single OR double quotes, in any x/y/z order — a single unparsed vertex would corrupt
        // every triangle that indexes it and collapse the whole mesh, so this must be forgiving.
        const vRe = /<vertex\b([^>]*?)\/?>/g; let vm;
        while ((vm = vRe.exec(block))) {
          const va = vm[1];
          const x = parseFloat((/\bx=["']?(-?[\d.]+(?:[eE][+-]?\d+)?)/.exec(va) || [])[1]);
          const y = parseFloat((/\by=["']?(-?[\d.]+(?:[eE][+-]?\d+)?)/.exec(va) || [])[1]);
          const z = parseFloat((/\bz=["']?(-?[\d.]+(?:[eE][+-]?\d+)?)/.exec(va) || [])[1]);
          // null (not [0,0,0]) for an unparseable vertex: keeps index alignment while letting the
          // a&&b&&c guards drop any triangle that references it — otherwise it spikes to the origin.
          verts.push((Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) ? [x, y, z] : null);
        }
        const tris = [];
        const paint = wantPaint ? [] : null;
        // `[^>]*?` (not `[^>/]*`) so an attribute value containing a "/" — some slicers put
        // one in paint/segmentation data — doesn't truncate the match and silently drop facets.
        const tRe = /<triangle\b([^>]*?)\/?>/g; let tm;
        while ((tm = tRe.exec(block))) {
          if (stride > 1 && (gTri++ % stride) !== 0) continue; // keep only every Nth facet
          const a = tm[1];
          const v1 = (/\bv1=["']?(\d+)/.exec(a) || [])[1], v2 = (/\bv2=["']?(\d+)/.exec(a) || [])[1], v3 = (/\bv3=["']?(\d+)/.exec(a) || [])[1];
          if (v1 == null || v2 == null || v3 == null) continue;
          tris.push([+v1, +v2, +v3]);
          if (wantPaint) { const pm = paintRe.exec(a); paint.push(pm ? pm[1] : null); }
        }
        const comps = [];
        const cRe = /<component\b([^>]*?)\/?>/g; let cm;
        while ((cm = cRe.exec(block))) {
          const ref = (/\bobjectid="([^"]+)"/i.exec(cm[1]) || [])[1];
          if (!ref) continue;
          const pp = (/\b(?:p:)?path="([^"]+)"/i.exec(cm[1]) || [])[1];
          comps.push({ ref, path: pp ? norm(pp) : fkey, t: parseT((/transform="([^"]+)"/i.exec(cm[1]) || [])[1]) });
        }
        objs[fkey + '#' + id] = { verts, tris, paint, comps };
      }
    }
    if (!Object.keys(objs).length) return null;
    if (!rootKey) { rootKey = firstKey; scale = firstScale; } // no <build> block → resolve every object

    const memo = {};
    function resolve(key, seen) {
      if (memo[key]) return memo[key];
      const o = objs[key];
      if (!o || (seen && seen.has(key))) return null;
      const geo = [], pnt = [];
      for (let i = 0; i < o.tris.length; i++) {
        const t = o.tris[i], a = o.verts[t[0]], b = o.verts[t[1]], c = o.verts[t[2]];
        if (a && b && c) { geo.push([a, b, c]); if (wantPaint) pnt.push(o.paint ? o.paint[i] : null); }
      }
      for (const cp of o.comps) {
        const child = resolve(cp.path + '#' + cp.ref, new Set(seen || []).add(key));
        if (child) for (let i = 0; i < child.geo.length; i++) { geo.push(child.geo[i].map((p) => applyT(p, cp.t))); if (wantPaint) pnt.push(child.pnt[i]); }
      }
      return (memo[key] = { geo, pnt });
    }

    const buildBlock = (/<build\b[^>]*>([\s\S]*?)<\/build>/i.exec(rootText || '') || [])[1];
    const items = [];
    if (buildBlock) { const itRe = /<item\b([^>]*?)\/?>/g; let im; while ((im = itRe.exec(buildBlock))) items.push(im[1]); }
    const soup = [], paintOut = [], objOut = [];
    // `oid` — the top-level (build-item) object id each facet belongs to, so the preview can
    // group triangles into build plates. Only tracked when wantPaint (the rich-preview path).
    const emit = (tri, code, t, oid) => { soup.push(tri.map((p) => { const q = applyT(p, t); return [q[0] * scale, q[1] * scale, q[2] * scale]; })); if (wantPaint) { paintOut.push(code); objOut.push(oid || null); } };
    if (items.length) {
      for (const it of items) {
        const oid = (/\bobjectid="([^"]+)"/i.exec(it) || [])[1];
        if (!oid) continue;
        const pp = (/\b(?:p:)?path="([^"]+)"/i.exec(it) || [])[1];
        const r = resolve((pp ? norm(pp) : rootKey) + '#' + oid, null);
        if (!r) continue; // skip an unresolved item rather than drop the whole mesh
        const t = parseT((/transform="([^"]+)"/i.exec(it) || [])[1]);
        for (let i = 0; i < r.geo.length; i++) emit(r.geo[i], wantPaint ? r.pnt[i] : null, t, oid);
      }
    } else {
      for (const k in objs) { const r = resolve(k, null); const oid = k.split('#')[1]; if (r) for (let i = 0; i < r.geo.length; i++) emit(r.geo[i], wantPaint ? r.pnt[i] : null, null, oid); }
    }
    // Last resort: the build/component graph resolved to nothing (unusual references, a broken
    // p:path, a build item pointing at a missing id…) but we DID parse real meshes. Render their
    // raw triangles untransformed rather than give up — a navigable model beats a flat image.
    if (!soup.length) {
      for (const k in objs) {
        const o = objs[k], oid = k.split('#')[1];
        for (let i = 0; i < o.tris.length; i++) {
          const t = o.tris[i], a = o.verts[t[0]], b = o.verts[t[1]], c = o.verts[t[2]];
          if (a && b && c) emit([a, b, c], wantPaint && o.paint ? o.paint[i] : null, null, oid);
        }
      }
    }
    if (!soup.length) return null;
    return wantPaint ? { triangles: soup, paint: paintOut, objIds: objOut, thinned } : soup;
  }

  // Build-plate assignments from a Bambu/Orca Metadata/model_settings.config: one entry per
  // <plate>, listing the object ids it holds (from its <model_instance> object_id metadata).
  // Lets the preview offer a per-plate view. Returns [] for single-plate / non-Bambu files.
  function extractPlates(members) {
    const text = memberText(members, /model_settings\.config$/i);
    if (!text) return [];
    const plates = [];
    const pRe = /<plate\b[\s\S]*?<\/plate>/gi; let pm;
    while ((pm = pRe.exec(text))) {
      const block = pm[0];
      const name = (/<metadata\b[^>]*\bkey="(?:plater_name|name)"[^>]*\bvalue="([^"]*)"/i.exec(block) || [])[1] || null;
      const ids = [];
      const iRe = /<metadata\b[^>]*\bkey="object_id"[^>]*\bvalue="([^"]+)"/gi; let im;
      while ((im = iRe.exec(block))) ids.push(im[1]);
      const objectIds = Array.from(new Set(ids));
      if (objectIds.length) plates.push({ name, objectIds });
    }
    return plates;
  }

  function extractTriangles(members, opts) { return _extractCore(members, false, opts); }
  // Like extractTriangles but returns { triangles, paint, objIds, thinned } — paint[i]/objIds[i]
  // align to triangles[i]. Powers the true-multicolour, multi-plate preview. Pass opts.maxTris to
  // thin huge meshes for the preview; omit it for a faithful full-mesh extraction (STL export).
  function extractTrianglesWithPaint(members, opts) { return _extractCore(members, true, opts); }

  // Bed-fit warnings for a retarget (footprint / height vs the target build volume).
  function fitWarnings(bounds, target) {
    const w = [];
    if (!bounds || !target || !target.bed) return w;
    const b = target.bed;
    if (bounds.x > b.x + 1 || bounds.y > b.y + 1) w.push(`Model footprint ${bounds.x}×${bounds.y} mm is larger than ${target.name}'s bed ${b.x}×${b.y} mm — it may not fit. Rotate or rescale in your slicer.`);
    if (b.z && bounds.z > b.z + 1) w.push(`Model height ${bounds.z} mm exceeds ${target.name}'s ${b.z} mm max — it may not fit.`);
    return w;
  }

  /**
   * Analyze a 3MF: flavour, ordered filament colours (with grams where known), source printer
   * metadata and model footprint.
   * @returns {{ ok:boolean, flavour?:string, filaments?:Array, colorCount?:number, memberCount?:number, hasGeometry?:boolean, meta?:object, bounds?:object|null, error?:string }}
   */
  function analyze(buf) {
    const members = readMembers(buf);
    if (!members.length) return { ok: false, error: 'Not a readable 3MF/ZIP file.' };
    const hasGeometry = members.some((m) => /\.model$/i.test(m.name));
    const filaments = extractFilaments(members);
    const meta = extractMeta(members);
    if (meta.grams.length) filaments.forEach((f, i) => { if (meta.grams[i] != null) f.grams = meta.grams[i]; });
    return {
      ok: true,
      flavour: detectFlavour(members),
      filaments,
      colorCount: filaments.length,
      memberCount: members.length,
      hasGeometry,
      meta,
      bounds: hasGeometry ? computeBounds(members) : null,
    };
  }

  // Reorder an array by a permutation: out[map[i]] = arr[i]. Holes keep the original.
  function permute(arr, map) {
    if (!Array.isArray(arr) || !Array.isArray(map)) return arr;
    const out = arr.slice();
    for (let i = 0; i < arr.length; i++) {
      const t = map[i];
      if (Number.isInteger(t) && t >= 0 && t < arr.length) out[t] = arr[i];
    }
    return out;
  }

  // Reorder every filament_* array of length === n inside a parsed settings object.
  function remapJsonSettings(obj, map, n) {
    let changed = 0;
    for (const k of Object.keys(obj)) {
      if (!/^filament_/i.test(k)) continue;
      const v = obj[k];
      if (Array.isArray(v) && v.length === n) { obj[k] = permute(v, map); changed++; }
    }
    return changed;
  }

  /** Parse the max X/Y of a printable_area polygon (["0x0","256x0",…]) → { x, y } bed size, or null. */
  function bedFromPrintableArea(area) {
    if (!Array.isArray(area) || !area.length) return null;
    let x = 0, y = 0;
    for (const s of area) { const p = String(s).split('x').map(Number); if (p.length === 2 && isFinite(p[0]) && isFinite(p[1])) { x = Math.max(x, p[0]); y = Math.max(y, p[1]); } }
    return x && y ? { x, y } : null;
  }

  /**
   * Re-tile a multi-plate file's object layout for a different bed size.
   *
   * Bambu/Orca lay every plate out in one big world-coordinate grid — plate (col,row) sits at
   * (bed/2 + col·stride, bed/2 − row·stride), stride = bed + inter-plate gap. When the target bed differs
   * from the source's, that baked grid no longer matches, so each plate drifts (worse the further from the
   * origin) and objects end up near/over the plate edge. We recover each object's offset within its plate,
   * then re-place it on a grid built from the TARGET bed (same gap), so every plate is centred again.
   * Returns the rewritten root .model text, or null when nothing to do (single plate / same bed / no build).
   */
  function retilePlatesForBed(members, target, srcBed, report) {
    if (!target.bed || !srcBed) return null;
    const root = members.find((m) => /3D\/3dmodel\.model$/i.test(m.name));
    const msc = members.find((m) => /model_settings\.config$/i.test(m.name));
    if (!root || !msc) return null;
    const rootTxt = root.data.toString('utf8');
    const buildMatch = rootTxt.match(/<build[\s\S]*?<\/build>/);
    if (!buildMatch) return null;
    const buildBlock = buildMatch[0];
    const plates = msc.data.toString('utf8').match(/<plate>[\s\S]*?<\/plate>/g) || [];
    if (plates.length < 2) return null; // single plate — nothing to re-tile
    const objPlate = {};
    plates.forEach((p, i) => { for (const m of p.matchAll(/object_id"\s+value="(\d+)"/g)) objPlate[m[1]] = i; });

    // Per-plate centroid of the item translations (transform indices 9,10 = tx,ty).
    const items = [];
    for (const it of buildBlock.match(/<item[^>]*>/g) || []) {
      const oid = (it.match(/objectid="(\d+)"/) || [])[1];
      const tr = (it.match(/transform="([^"]+)"/) || [])[1];
      if (!oid || !tr) continue;
      const n = tr.trim().split(/\s+/).map(Number);
      if (n.length >= 12) items.push({ oid, x: n[9], y: n[10] });
    }
    const byPlate = {};
    items.forEach((it) => { const pl = objPlate[it.oid]; if (pl == null) return; (byPlate[pl] = byPlate[pl] || []).push(it); });
    const centroid = {};
    Object.keys(byPlate).forEach((pl) => { const a = byPlate[pl]; centroid[pl] = { x: a.reduce((s, i) => s + i.x, 0) / a.length, y: a.reduce((s, i) => s + i.y, 0) / a.length }; });
    if (!Object.keys(centroid).length) return null;

    // Cluster centroids into grid columns (X) / rows (Y).
    const cluster = (vals, tol) => {
      const g = [];
      [...vals].sort((a, b) => a - b).forEach((v) => { const f = g.find((q) => Math.abs(q.c - v) < tol); if (f) { f.items.push(v); f.c = f.items.reduce((s, x) => s + x, 0) / f.items.length; } else g.push({ c: v, items: [v] }); });
      return g.map((q) => q.c);
    };
    const colCenters = cluster(Object.values(centroid).map((c) => c.x), 60).sort((a, b) => a - b);
    const rowCenters = cluster(Object.values(centroid).map((c) => c.y), 60).sort((a, b) => b - a); // row 0 = top
    const strideOf = (arr) => { if (arr.length < 2) return 0; let d = 0; for (let i = 1; i < arr.length; i++) d += Math.abs(arr[i] - arr[i - 1]); return d / (arr.length - 1); };
    const gapX = Math.max(0, (strideOf([...colCenters]) || srcBed.x) - srcBed.x);
    const gapY = Math.max(0, (strideOf(rowCenters) || srcBed.y) - srcBed.y);
    const tSX = target.bed.x + gapX, tSY = target.bed.y + gapY, tCX = target.bed.x / 2, tCY = target.bed.y / 2;
    const nearest = (centers, v) => { let bi = 0, bd = Infinity; centers.forEach((c, i) => { const d = Math.abs(c - v); if (d < bd) { bd = d; bi = i; } }); return bi; };

    let changed = 0;
    const newBuild = buildBlock.replace(/<item[^>]*>/g, (it) => {
      const oid = (it.match(/objectid="(\d+)"/) || [])[1];
      const pl = oid != null ? objPlate[oid] : null;
      const trM = it.match(/transform="([^"]+)"/);
      if (pl == null || !centroid[pl] || !trM) return it;
      const n = trM[1].trim().split(/\s+/).map(Number);
      if (n.length < 12) return it;
      const col = nearest(colCenters, centroid[pl].x), row = nearest(rowCenters, centroid[pl].y);
      n[9] = tCX + col * tSX + (n[9] - colCenters[col]);   // preserve offset from plate centre
      n[10] = tCY - row * tSY + (n[10] - rowCenters[row]);
      changed++;
      return it.replace(/transform="[^"]+"/, `transform="${n.join(' ')}"`);
    });
    if (!changed) return null;
    if (report) { report.platesRetiled = changed; report.fieldsChanged.push('plate_layout'); }
    return rootTxt.replace(buildBlock, newBuild);
  }

  /**
   * Tally per-filament (1-based paint state) usage across the model. Sources it from the shared mesh
   * reader (lib/mf-mesh.js), which resolves EVERY face's state — per-triangle paint_color, per-<part>
   * object colouring (idToExtr), and the base extruder — so an OBJECT-ENCODED multicolour file (coloured
   * per part, with zero paint_color in the mesh) tallies its colours correctly. A raw paint_color scan
   * (the previous implementation, kept as the fallback) reports zero usage for those files, which silently
   * breaks Full-Spectrum head selection. The mesh reader samples very large models to a preview budget,
   * but usage is a RELATIVE weight (most-used → physical head), so a representative sample is sufficient.
   */
  function tallyPaintUsage(members, n) {
    const usage = new Array(n).fill(0);
    if (mfMesh && mfMesh.extractMeshFromMembers) {
      try {
        const mesh = mfMesh.extractMeshFromMembers(members);
        const fs = mesh && mesh.faceState;
        if (fs && fs.length) {
          for (let i = 0; i < fs.length; i++) { const s = fs[i]; if (s >= 1 && s <= n) usage[s - 1] += 1; }
          // Only trust the mesh tally if it actually saw painted/assigned faces; otherwise fall through.
          if (usage.some((u) => u > 0)) return usage;
        }
      } catch (_) { /* fall back to the raw scan below */ }
    }
    // Fallback: raw paint_color scan (per-triangle codes only).
    if (mfMesh && mfMesh.dominantState) {
      for (const m of members) {
        if (!/\.model$/i.test(m.name)) continue;
        const text = m.data.toString('utf8');
        const re = /paint_color="([0-9A-Fa-f]+)"/g; let mm;
        while ((mm = re.exec(text))) { const s = mfMesh.dominantState(mm[1]); if (s >= 1 && s <= n) usage[s - 1] += 1; }
      }
    }
    return usage;
  }

  /**
   * Full Spectrum planning: keep 4 filaments physical, reproduce the rest as dithered mixes.
   * Only viable for a Snapmaker-Orca target (mixed_filament_definitions is Orca's feature) when the
   * source carries a palette and more colours than the target's 4 slots. Returns a plan or null.
   */
  function planFS(members, filaments, target, opts) {
    if (!opts || !opts.fullSpectrum) return null;
    if (!fullSpectrum || !fullSpectrum.planFullSpectrum) return null;
    // Mixed-filament dithering is a specific hardware feature (Snapmaker U1), NOT every Orca-flavour
    // printer — single-extruder Orca-family machines (Sovol/QIDI/Creality/…) cannot mix.
    if (!target.supportsMixedFilament) return null;
    if (!(target.maxColors >= 2) || filaments.length <= target.maxColors) return null;
    const colors = filaments.map((f) => f.color).filter(Boolean);
    if (colors.length !== filaments.length) return null;     // need every colour known to mix safely
    const usage = tallyPaintUsage(members, colors.length);
    const physical = Array.isArray(opts.fsPhysical) && opts.fsPhysical.length === target.maxColors ? opts.fsPhysical : undefined;
    const physicalHex = Array.isArray(opts.fsPhysicalHex) ? opts.fsPhysicalHex : undefined;
    return fullSpectrum.planFullSpectrum(colors, usage, { physical, physicalHex, maxPhysical: target.maxColors });
  }

  /** Rewrite paint_color / mmu_segmentation codes in a .model member through a colour plan (FS or band-swap). */
  function remapModelPaint(text, plan) {
    return text.replace(/(paint_color|mmu_segmentation)="([0-9A-Fa-f]+)"/g,
      (_m, attr, code) => `${attr}="${fullSpectrum.remapPaintCode(code, plan.stateMap)}"`);
  }

  /**
   * Band-swap planning (alternative to Full Spectrum): when a painted file is cleanly VERTICALLY
   * colour-banded, keep EVERY colour exactly by mapping each onto one of the target's physical heads and
   * inserting an M600 pause for each colour beyond the head count — no mixing, no dropped colours. Only for
   * a swap-capable target (Snapmaker U1) when `opts.bandSwap` is set and the model is banded with >1 band.
   * Mirrors the web reference (convert.ts band-swap branch). Returns a plan or null.
   */
  function planBandSwap(members, filaments, target, opts) {
    if (!opts || !opts.bandSwap) return null;
    if (!colorBands || !swapPauses || !mfMesh || !mfMesh.extractMeshFromMembers) return null;
    if (!target.supportsMixedFilament) return null; // swap-capable head layout (U1)
    const pal = filaments.map((f) => f.color).filter(Boolean);
    if (pal.length !== filaments.length) return null; // need every colour known to map safely
    let mesh;
    try { mesh = mfMesh.extractMeshFromMembers(members); } catch (_) { return null; }
    if (!mesh || !mesh.faceState || !mesh.faceState.length) return null;
    const baseState = mesh.baseState >= 1 ? mesh.baseState : 1;
    const bp = colorBands.detectColorBands(mesh.positions, mesh.faceState, baseState);
    if (!bp.banded || bp.bands.length <= 1) return null;
    const meta = extractMeta(members);
    const layerHeight = meta && meta.layerHeight ? meta.layerHeight : undefined;
    const pauseGcode = opts.pauseGcode || 'M600';
    const swap = swapPauses.buildBandSwapPlan(bp.bands, pal, pauseGcode, layerHeight, baseState);
    const headOf = swap.headOf; // Map(state → 0-based head)
    const heads = Math.min(target.maxColors && target.maxColors >= 1 ? target.maxColors : 4, 4);
    const baseHead = (headOf.has(baseState) ? headOf.get(baseState) : 0) + 1; // unpainted faces print here
    const stateMap = (s) => (s === 0 ? baseHead : (headOf.has(s) ? headOf.get(s) + 1 : 1));
    const firstOnHead = (h) => { for (const [st, hd] of headOf) if (hd === h) return st; return 1; };
    const headSrcIdx = [], headColors = [];
    for (let h = 0; h < heads; h++) { const st = firstOnHead(h); headSrcIdx.push(st - 1); headColors.push(normHex(pal[st - 1]) || '#FFFFFF'); }
    // config extruder refs (1-based source slot) → head (0-based); parallels fsPlan.map.
    const map = pal.map((_, i) => (headOf.has(i + 1) ? headOf.get(i + 1) : 0));
    return { stateMap, map, headColors, headSrcIdx, heads, baseHead, bands: bp.bands, instructions: swap.instructions, customGcodeXml: swap.customGcodeXml };
  }

  /**
   * Apply a band-swap plan to a project_settings.config object: reduce every per-filament array to the
   * physical heads (reindex to the head's loaded source slot) and stamp the head colours. No mixed-filament
   * keys (that's Full Spectrum) — the M600 custom_gcode member carries the swaps instead.
   */
  function applyBandSwapConfig(obj, plan, srcCount, report) {
    for (const k of Object.keys(obj)) {
      // ONLY per-filament arrays. Reindexing every array whose length happens to equal the
      // filament count corrupted unrelated config: a 4-filament model matches the FOUR
      // CORNERS of printable_area, turning the bed rectangle into a self-intersecting
      // bow-tie. remapJsonSettings (:474) already filters on ^filament_; this loop and
      // applyFullSpectrumConfig did not.
      if (!/^filament_/i.test(k)) continue;
      const v = obj[k];
      if (Array.isArray(v) && v.length === srcCount) obj[k] = plan.headSrcIdx.map((oldI) => (v[oldI] != null ? v[oldI] : v[0]));
    }
    obj.filament_colour = plan.headColors.slice();
    if (report) {
      report.bandSwap = true;
      report.bandSwaps = plan.instructions.length;
      report.fieldsChanged.push('filament_colour', 'custom_gcode_per_layer');
    }
  }

  /**
   * Turn a source Bambu/Orca project_settings.config into a Full Spectrum U1 config: keep only the 4
   * physical filaments (reindex every per-filament array to them), stamp the loaded head colours, and
   * add the mixed_filament_definitions + dithering keys that realise the extra colours as mixes.
   */
  function applyFullSpectrumConfig(obj, plan, srcCount, report) {
    const keep = plan.physical; // 0-based source indices, length = slots
    for (const k of Object.keys(obj)) {
      // Per-filament arrays only — same reason as applyBandSwapConfig above: an unrelated
      // array that happens to be srcCount long (printable_area's four corners) would be
      // permuted into nonsense.
      if (!/^filament_/i.test(k)) continue;
      const v = obj[k];
      if (Array.isArray(v) && v.length === srcCount) obj[k] = keep.map((oldI) => (v[oldI] != null ? v[oldI] : v[0]));
    }
    obj.filament_colour = plan.physicalHex.slice();
    obj.mixed_filament_definitions = fullSpectrum.serializeMixedDefs(plan.mixDefs);
    for (const [k, val] of Object.entries(fullSpectrum.MIXED_DITHERING_DEFAULTS)) obj[k] = val;
    if (report) {
      report.fullSpectrum = true;
      report.fullSpectrumMixes = plan.mixDefs.length;
      report.fieldsChanged.push('mixed_filament_definitions');
    }
  }

  // Bambu-flavour enum strings that Snapmaker Orca doesn't recognise (it silently "replaces" them and
  // warns on open). Normalise them to Orca's accepted values so the converted file loads clean. Mirrors
  // the web app's U1_VALUE_REMAP; keys hold string→string maps applied to scalars or per-object arrays.
  const ORCA_VALUE_REMAP = {
    ensure_vertical_shell_thickness: { disabled: 'none', enabled: 'ensure_all', partial: 'ensure_all' },
    support_style: { tree_organic: 'default' },
  };

  /**
   * Point each filament slot at a real Orca filament preset so the slicer stops flagging the source's
   * foreign preset (e.g. "Bambu PLA Basic @BBL X1C") as customized. Defaults every slot to the universal
   * "Generic <TYPE>" preset (what a clean U1 export uses); `opts.filaments[i]` (from the UI's per-slot
   * Orca-DB picker) overrides a slot with a specific preset name + type. Operates on the resolved
   * per-filament arrays already trimmed to the target's slots.
   */
  function applyOrcaFilaments(obj, opts, report) {
    const types = Array.isArray(obj.filament_type) ? obj.filament_type : null;
    const cols = Array.isArray(obj.filament_colour) ? obj.filament_colour : null;
    const count = (types && types.length) || (cols && cols.length) || 0;
    if (!count) return;
    const picks = Array.isArray(opts.filaments) ? opts.filaments : [];
    const ids = [], newTypes = [];
    for (let i = 0; i < count; i++) {
      const pick = picks[i] && picks[i].name ? picks[i] : null;
      const type = (pick && pick.type) || (types && types[i]) || 'PLA';
      ids.push(pick ? pick.name : `Generic ${type}`);
      newTypes.push(type);
    }
    obj.filament_settings_id = ids;
    obj.filament_type = newTypes;
    if (report) { report.fieldsChanged.push('filament_settings_id'); report.filamentPresets = ids.slice(); }
  }

  // Keys we set explicitly / manage elsewhere — never overwritten by the machine/process overlay.
  const U1_OVERLAY_SKIP = new Set(['printer_settings_id', 'print_settings_id', 'name', 'inherits',
    'printer_model', 'mixed_filament_definitions']);

  /**
   * Make the converted file's PRINTER + PROCESS settings genuinely native to the target printer by
   * overlaying the resolved machine profile (real start/end/tool-change G-code, flavour, build volume,
   * tool clearances) and a matching process preset (layer height, walls, speeds…) read from the maker's
   * INSTALLED Orca-family slicer. This is what stops the slicer's "please confirm this G-code is safe"
   * prompt — the embedded G-code is then the printer's own, not the source's. Works for any target that
   * names an `orcaMachine` (the built-in U1, or a printer picked from the slicer's catalogue). Filament
   * keys are left to applyOrcaFilaments; Full Spectrum keys are applied afterwards so they win. No-op
   * when the DB is absent or the machine isn't found (falls back to the plain reprofile).
   */
  function applyOrcaNative(obj, opts, target, report) {
    if (!orcaDb) return;
    const machineName = target.orcaMachine;
    if (!machineName) return;
    const machine = orcaDb.machineSettings(machineName);
    if (!machine || !Object.keys(machine).length) return; // slicer not installed → keep plain reprofile
    const procName = (opts && opts.process) || target.process || orcaDb.defaultProcessFor(machineName);
    const proc = procName ? orcaDb.resolvePreset('process', procName) : {};
    const overlay = (settings) => {
      for (const k of Object.keys(settings)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (U1_OVERLAY_SKIP.has(k) || k.indexOf('filament_') === 0) continue;
        obj[k] = settings[k];
      }
    };
    overlay(machine);
    overlay(proc);
    obj.printer_settings_id = machineName;
    if (machine.printer_model) obj.printer_model = machine.printer_model;
    if (procName) { obj.print_settings_id = procName; if (report) report.processPreset = procName; }
    if (report) { report.fieldsChanged.push('printer_gcode', 'process_settings'); report.u1Native = true; }
  }

  /** Rewrite known Bambu→Orca-incompatible enum values in a project_settings.config object in place. */
  function applyOrcaValueSafety(obj, report) {
    let changed = 0;
    for (const k of Object.keys(ORCA_VALUE_REMAP)) {
      if (!(k in obj)) continue;
      const map = ORCA_VALUE_REMAP[k];
      const fix = (v) => (typeof v === 'string' && v in map ? map[v] : v);
      const before = JSON.stringify(obj[k]);
      obj[k] = Array.isArray(obj[k]) ? obj[k].map(fix) : fix(obj[k]);
      if (report && before !== JSON.stringify(obj[k])) { report.fieldsChanged.push(k); changed++; }
    }
    return changed;
  }

  /**
   * Convert a 3MF for a target printer.
   * @param {Buffer} buf source 3MF
   * @param {{ targetId:string, mode?:('retarget'|'normalize'), slotMap?:number[], targetProfile?:object }} opts
   *        targetProfile — an explicit profile (e.g. a user-defined printer) used instead of
   *        the built-in registry lookup, so custom printers convert without server-side state.
   * @returns {{ ok:boolean, buffer?:Buffer, report?:object, error?:string }}
   */
  function convert(buf, opts = {}) {
    const members = readMembers(buf);
    if (!members.length) return { ok: false, error: 'Not a readable 3MF/ZIP file.' };
    if (!members.some((m) => /\.model$/i.test(m.name))) {
      return { ok: false, error: 'This 3MF has no model geometry to convert.' };
    }
    const flavour = detectFlavour(members);
    const custom = opts.targetProfile && typeof opts.targetProfile === 'object' && opts.targetProfile.id
      ? profiles.customProfile(opts.targetProfile) : null;
    const target = custom || profiles.getProfile(opts.targetId) || profiles.GENERIC;
    const mode = opts.mode === 'normalize' || target.id === profiles.GENERIC.id ? 'normalize' : 'retarget';
    const filaments = extractFilaments(members);
    const report = { flavour, target: target.id, targetName: target.name, mode, fieldsChanged: [], colorsRemapped: 0, warnings: [] };

    let out = members.map((m) => ({ name: m.name, data: m.data }));

    if (mode === 'normalize') {
      // Drop vendor-locked slicer configs; keep geometry, rels, content-types, thumbnails.
      const before = out.length;
      out = out.filter((m) => GEOMETRY.test(m.name) || /thumbnail.*\.png$/i.test(m.name) || /\.png$/i.test(m.name));
      report.fieldsChanged.push(`stripped ${before - out.length} slicer config member(s)`);
      if (target.id !== profiles.GENERIC.id) report.warnings.push('Normalized to a generic 3MF (target-specific settings not written).');
    } else {
      // Retarget: rewrite the JSON/text settings for the target printer + optional remap.
      const n = filaments.length;
      const slotMap = Array.isArray(opts.slotMap) && opts.slotMap.length === n ? opts.slotMap : null;

      // Band-swap: a cleanly vertically-banded painted model keeps ALL colours exactly by mapping each to a
      // physical head + M600 pauses (opt-in, U1 only). When active it supersedes Full Spectrum — the two are
      // mutually-exclusive colour strategies. Computed first so we skip the (expensive) FS mesh tally when
      // band-swap wins.
      const bandPlan = planBandSwap(members, filaments, target, opts);
      // Full Spectrum: >4 colours → 4 physical heads + dithered mixes (Snapmaker Orca). When active it
      // fully owns the colour mapping (paint codes + config), so it supersedes the plain slotMap remap.
      const fsPlan = bandPlan ? null : planFS(members, filaments, target, opts);
      // The active paint plan (band-swap or Full Spectrum) — both expose stateMap + map with the same shape.
      const paintPlan = bandPlan || fsPlan;

      // Re-profiling only makes sense within one config family (Bambu/Orca share a JSON
      // dialect; Prusa is separate). Across families we can't produce a coherent file by
      // rewriting metadata, so we keep the colour remap but DON'T write a foreign printer
      // model into the source's config — and tell the maker to use Generic instead.
      const srcFamily = profiles.configFamily(flavour);
      const tgtFamily = profiles.configFamily(target.flavour);
      const reprofile = srcFamily !== 'generic' && srcFamily === tgtFamily;
      report.reprofile = reprofile;
      if (!reprofile && srcFamily !== 'generic') {
        report.crossFamily = true;
        report.warnings.push(`${target.name} uses a different slicer format than this file (${flavour} → ${target.flavour}). Colours were remapped, but printer settings weren't rewritten — convert to "Generic 3MF" and pick ${target.name} in your slicer instead.`);
      }

      out = out.map((m) => {
        // Band-swap / Full Spectrum: rewrite the paint codec in the mesh so each colour points at its
        // physical head (band-swap) or mixed/virtual slot (FS), and remap the XML part→extruder refs the same way.
        if (paintPlan && /\.model$/i.test(m.name)) {
          return { name: m.name, data: Buffer.from(remapModelPaint(m.data.toString('utf8'), paintPlan), 'utf8') };
        }
        if (paintPlan && /model_settings\.config$/i.test(m.name) && !tryJson(m.data.toString('utf8'))) {
          // Bambu model_settings.config is XML: <metadata key="extruder" value="N"/> (1-based).
          const text = m.data.toString('utf8').replace(
            /(key="extruder"\s+value=")(\d+)(")/g,
            (_a, pre, num, post) => { const old = parseInt(num, 10); const ni = old >= 1 && old <= paintPlan.map.length ? paintPlan.map[old - 1] + 1 : old; return `${pre}${ni}${post}`; });
          return { name: m.name, data: Buffer.from(text, 'utf8') };
        }
        if (/project_settings\.config$/i.test(m.name) || /model_settings\.config$/i.test(m.name)) {
          const text = m.data.toString('utf8');
          const obj = tryJson(text);
          if (obj) {
            // Re-profile fields (same-family only).
            if (reprofile) {
              if (target.printerModel) { obj.printer_model = target.printerModel; report.fieldsChanged.push('printer_model'); }
              // Use the printer's EXACT library preset name (e.g. "Snapmaker U1 (0.4 nozzle)") so the
              // slicer matches it to an installed printer instead of flagging a "customized" preset.
              if (target.printerSettingsId || target.printerModel) obj.printer_settings_id = target.printerSettingsId || target.printerModel;
              if (target.nozzle) obj.nozzle_diameter = Array.isArray(obj.nozzle_diameter) ? obj.nozzle_diameter.map(() => String(target.nozzle)) : String(target.nozzle);
              // Prefer the printer's exact build-plate polygon when the profile carries it (keeps the
              // plate layout correct); otherwise derive a rectangle from the bed size.
              if (target.printableArea) {
                obj.printable_area = target.printableArea.slice();
                report.fieldsChanged.push('printable_area');
                if (target.printableHeight) { obj.printable_height = String(target.printableHeight); report.fieldsChanged.push('printable_height'); }
              } else if (target.bed) {
                const { x, y, z } = target.bed;
                obj.printable_area = [`0x0`, `${x}x0`, `${x}x${y}`, `0x${y}`];
                report.fieldsChanged.push('printable_area');
                if (z) { obj.printable_height = String(z); report.fieldsChanged.push('printable_height'); }
              }
            }
            // Overlay the real machine + process settings (from the installed slicer) so the printer
            // G-code and print settings are native — runs before Full Spectrum so mix keys win.
            if (/project_settings\.config$/i.test(m.name) && target.flavour === 'orca') applyOrcaNative(obj, opts, target, report);
            // Band-swap / Full Spectrum own the colour mapping (only meaningful on project_settings, which
            // holds the filament palette + mixed-filament keys); otherwise apply the plain colour→slot remap.
            if (bandPlan && /project_settings\.config$/i.test(m.name)) {
              applyBandSwapConfig(obj, bandPlan, n, report);
            } else if (fsPlan && /project_settings\.config$/i.test(m.name)) {
              applyFullSpectrumConfig(obj, fsPlan, n, report);
            } else if (slotMap && !paintPlan) {
              report.colorsRemapped += remapJsonSettings(obj, slotMap, n);
            }
            // Snapmaker Orca rejects a few Bambu enum spellings — normalise them so it opens clean.
            if (/project_settings\.config$/i.test(m.name) && target.flavour === 'orca') {
              applyOrcaValueSafety(obj, report);
              applyOrcaFilaments(obj, opts, report); // real Orca filament presets (+ per-slot picks)
            }
            return { name: m.name, data: Buffer.from(JSON.stringify(obj, null, 4), 'utf8') };
          }
          return m;
        }
        if (/slice_info\.config$/i.test(m.name) && slotMap) {
          // Renumber/reorder <filament id=".." color=".."> by the slot map (text-level).
          const text = m.data.toString('utf8');
          const tags = [];
          const re = /<filament\b[^>]*>/g; let mm;
          while ((mm = re.exec(text))) tags.push(mm[0]);
          if (tags.length === n) {
            const reordered = permute(tags, slotMap).map((tag, i) =>
              tag.replace(/id="\d+"/i, `id="${i + 1}"`));
            let k = 0;
            const next = text.replace(/<filament\b[^>]*>/g, () => reordered[k++] || '');
            report.colorsRemapped += 1;
            return { name: m.name, data: Buffer.from(next, 'utf8') };
          }
          return m;
        }
        if (CFG_PRUSA.test(m.name)) {
          let text = m.data.toString('utf8');
          if (reprofile) {
            if (target.printerModel) { text = text.replace(/^printer_model\s*=.*$/im, `printer_model = ${target.printerModel}`); report.fieldsChanged.push('printer_model'); }
            if (target.nozzle) text = text.replace(/^nozzle_diameter\s*=.*$/im, `nozzle_diameter = ${target.nozzle}`);
            if (target.bed) {
              const { x, y, z } = target.bed;
              text = text.replace(/^bed_shape\s*=.*$/im, `bed_shape = 0x0,${x}x0,${x}x${y},0x${y}`);
              report.fieldsChanged.push('bed_shape');
              if (z) { text = text.replace(/^max_print_height\s*=.*$/im, `max_print_height = ${z}`); report.fieldsChanged.push('max_print_height'); }
            }
          }
          if (slotMap) {
            text = text.replace(/^(filament_colou?r\s*=\s*)([#0-9a-fA-F;,\s]+)$/im, (_all, pre, val) => {
              const cols = val.split(/;/).map((s) => s.trim()).filter(Boolean);
              return cols.length === n ? pre + permute(cols, slotMap).join(';') : _all;
            });
            report.colorsRemapped += 1;
          }
          return { name: m.name, data: Buffer.from(text, 'utf8') };
        }
        return m;
      });

      // Re-tile the multi-plate object layout when the target bed size differs from the source's, so
      // plates stay centred instead of drifting to the edge. Operates on the already-rewritten output.
      if (reprofile && target.bed) {
        const srcCfgMember = members.find((mm) => /project_settings\.config$/i.test(mm.name));
        const srcCfg = srcCfgMember ? tryJson(srcCfgMember.data.toString('utf8')) : null;
        const srcBed = srcCfg ? bedFromPrintableArea(srcCfg.printable_area) : null;
        if (srcBed && (Math.abs(srcBed.x - target.bed.x) > 0.5 || Math.abs(srcBed.y - target.bed.y) > 0.5)) {
          const retiled = retilePlatesForBed(out, target, srcBed, report);
          if (retiled) { const ri = out.findIndex((mm) => /3D\/3dmodel\.model$/i.test(mm.name)); if (ri >= 0) out[ri] = { name: out[ri].name, data: Buffer.from(retiled, 'utf8') }; }
        }
      }

      // Band-swap: painted files have no custom_gcode_per_layer.xml, so add the synthesized one carrying the
      // M600 pauses at each manual-swap height (replacing any existing one).
      if (bandPlan) {
        out = out.filter((m) => !/Metadata\/custom_gcode_per_layer\.xml$/i.test(m.name));
        out.push({ name: 'Metadata/custom_gcode_per_layer.xml', data: Buffer.from(bandPlan.customGcodeXml, 'utf8') });
      }

      if (flavour === 'generic') report.warnings.push('Source slicer not recognized — geometry preserved, but no colour/printer settings were found to rewrite.');
      if (bandPlan) {
        const sw = bandPlan.instructions.length;
        report.warnings.push(`Colour-banded model: kept all ${n} colours exactly by mapping them onto ${bandPlan.heads} heads` +
          (sw ? ` with ${sw} manual filament swap(s) — M600 pauses were added at the swap heights. Load the head colours shown and swap the spool when ${target.name} pauses.` : ' — no manual swaps needed (fits the heads).'));
      } else if (fsPlan) {
        report.warnings.push(`Full Spectrum: kept ${target.maxColors} filaments physical and reproduced ${n - target.maxColors} extra colour(s) as ${fsPlan.mixDefs.length} dithered mix(es). Load the ${target.maxColors} head colours shown; ${target.name} prints the rest by mixing.`);
      } else if (target.maxColors && n > target.maxColors) {
        report.warnings.push(`Source uses ${n} colours but ${target.name} supports ${target.maxColors}. Extra colours will need manual mapping in your slicer.`);
      }
      const bounds = computeBounds(members);
      if (bounds) { report.bounds = bounds; for (const w of fitWarnings(bounds, target)) report.warnings.push(w); }
      report.fieldsChanged = [...new Set(report.fieldsChanged)];
    }

    const zipped = zipWrite.writeZip(out);
    if (!zipped) return { ok: false, error: 'Failed to repackage the 3MF.' };

    // Output self-check: re-open the file we just wrote and confirm it still parses with its
    // geometry (and, on a retarget, its colours) intact — cheap insurance behind the "it
    // always opens" guarantee. A failure is surfaced as a warning, not a hard error.
    try {
      const back = analyze(zipped);
      // Full Spectrum / band-swap reduce the palette to the physical heads (FS mixes are virtual; band-swap
      // folds colours onto heads), so the round-trip colour count is the target's slot count, not the source's.
      const expectColours = (report.fullSpectrum || report.bandSwap) ? (target.maxColors || filaments.length) : filaments.length;
      const coloursOk = mode === 'normalize' ? true : back.colorCount === expectColours;
      report.verified = !!(back && back.ok && back.hasGeometry && coloursOk);
    } catch (_) { report.verified = false; }
    if (report.verified === false) report.warnings.push('The converted file could not be re-validated — open it in your slicer to check before printing.');

    return { ok: true, buffer: zipped, report };
  }

  /**
   * Preview a Full Spectrum plan for the UI: which filaments load physically and how each extra colour
   * is reproduced as a mix. Returns { available:false } when FS doesn't apply (≤ slots, no palette,
   * non-Orca target). Pure read — no file is written.
   */
  function fsPreview(buf, opts = {}) {
    const members = readMembers(buf);
    if (!members.length) return { available: false };
    const custom = opts.targetProfile && typeof opts.targetProfile === 'object' && opts.targetProfile.id
      ? profiles.customProfile(opts.targetProfile) : null;
    const target = custom || profiles.getProfile(opts.targetId) || profiles.GENERIC;
    const filaments = extractFilaments(members);
    if (!target.supportsMixedFilament || !(target.maxColors >= 2) || filaments.length <= target.maxColors) {
      return { available: false, colours: filaments.length, slots: target.maxColors || null };
    }
    const plan = planFS(members, filaments, target, { fullSpectrum: true, fsPhysical: opts.fsPhysical, fsPhysicalHex: opts.fsPhysicalHex });
    if (!plan) return { available: false, colours: filaments.length, slots: target.maxColors };
    const heads = plan.physical.map((srcI, k) => ({ slot: k + 1, srcIndex: srcI, hex: plan.physicalHex[k] }));
    const mixes = plan.extras.map((e) => ({
      srcHex: e.srcHex, resultHex: e.resultHex, deltaE: Math.round(e.deltaE * 10) / 10,
      ids: e.recipe.ids, weights: e.recipe.weights, kind: e.recipe.kind,
    }));
    return { available: true, slots: target.maxColors, colours: filaments.length, targetName: target.name, heads, mixes };
  }

  /**
   * Read-only analysis: is this a cleanly VERTICALLY colour-banded model that a swap-capable printer
   * (e.g. the Snapmaker U1) can print with EXACT colours via manual filament-swap pauses — instead of
   * Full-Spectrum mixing? Extracts the painted mesh through the shared reader (object/part colouring +
   * paint codes resolved), runs the band detector, and — when banded with more colours than heads —
   * builds the swap plan (pause heights + a ready custom_gcode_per_layer.xml). Pure; writes nothing.
   * @param {Buffer} buf source 3MF
   * @param {{ heads?:number, pauseGcode?:string }} [opts] heads = physical toolheads (default 4)
   * @returns {{ available:boolean, banded?:boolean, reason?:string, colorCount?:number, bands?:object[],
   *            manualSwaps?:number, changeHeights?:number[], instructions?:object[], customGcodeXml?:string,
   *            purity?:number, palette?:string[] }}
   */
  function analyzeColorBands(buf, opts = {}) {
    if (!colorBands || !mfMesh || !mfMesh.extractMeshFromMembers) return { available: false };
    const members = readMembers(buf);
    if (!members.length) return { available: false };
    let mesh;
    try { mesh = mfMesh.extractMeshFromMembers(members); } catch (_) { return { available: false }; }
    if (!mesh || !mesh.faceState || !mesh.faceState.length) return { available: false };
    const baseState = mesh.baseState >= 1 ? mesh.baseState : 1;
    const plan = colorBands.detectColorBands(mesh.positions, mesh.faceState, baseState);
    const palette = Array.isArray(mesh.palette) ? mesh.palette.slice() : [];
    const base = {
      available: true,
      banded: plan.banded,
      reason: plan.reason,
      colorCount: plan.colorCount,
      bands: plan.bands,
      manualSwaps: plan.manualSwaps,
      changeHeights: plan.changeHeights,
      purity: Math.round(plan.purity * 1000) / 1000,
      sampled: !!mesh.sampled,
      palette,
    };
    if (!plan.banded || !swapPauses || !swapPauses.buildBandSwapPlan) return base;
    // Layer height (mm) for pause placement — from the source project settings when available.
    const meta = extractMeta(members);
    const layerHeight = meta && meta.layerHeight ? meta.layerHeight : undefined;
    const pauseGcode = opts.pauseGcode || 'M600';
    // heads = physical toolheads (default 4 = U1). heads:1 → a single-extruder M600 plan: a swap at every
    // colour change, so any pause-capable printer can print a vertically-banded multicolour file.
    const heads = opts.heads && opts.heads > 0 ? opts.heads : undefined;
    const swap = swapPauses.buildBandSwapPlan(plan.bands, palette, pauseGcode, layerHeight, baseState, heads);
    return Object.assign(base, {
      heads: heads || swapPauses.N_PHYSICAL,
      swaps: swap.instructions.length,
      instructions: swap.instructions,
      customGcodeXml: swap.customGcodeXml,
      headOf: [...swap.headOf.entries()].map(([state, head]) => ({ state, head })),
    });
  }

  const api = { analyze, convert, fsPreview, analyzeColorBands, readMembers, detectFlavour, extractFilaments, extractMeta, computeBounds, extractTriangles, extractTrianglesWithPaint, extractPlates, fitWarnings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') global.KhaytMfConvert = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
