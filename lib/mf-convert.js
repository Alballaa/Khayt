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

  const CFG_BAMBU = /Metadata\/(project_settings|model_settings|slice_info)\.config$/i;
  const CFG_PRUSA = /Metadata\/(Slic3r_PE|Prusa_?Slicer)\.config$/i;
  const GEOMETRY = /(^3D\/|^_rels\/|\.rels$|\[Content_Types\]\.xml$|\.model$)/i;

  function normHex(s) {
    const m = /#?([0-9a-fA-F]{6})/.exec(String(s || ''));
    return m ? ('#' + m[1].toUpperCase()) : null;
  }

  /** Read every member of a 3MF into { name, data:Buffer }. Returns [] on a bad file. */
  function readMembers(buf) {
    let zip;
    try { zip = zipRead.openZip(buf); } catch (_) { return []; }
    if (!zip || !zip.entries) return [];
    const out = [];
    for (const e of zip.entries) {
      const data = zip.file(e.name);
      if (data) out.push({ name: e.name, data });
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
    // Bambu/Orca JSON project settings.
    const projText = memberText(members, /project_settings\.config$/i)
      || memberText(members, /model_settings\.config$/i);
    const proj = tryJson(projText);
    if (proj && Array.isArray(proj.filament_colour)) {
      return proj.filament_colour.map((c, i) => ({ index: i, color: normHex(c) })).filter((f) => f.color);
    }
    // Bambu/Orca slice_info.config — <filament id="1" color="#hex" used_g="..">.
    const slice = memberText(members, /slice_info\.config$/i);
    if (slice) {
      const out = [];
      const re = /<filament\b[^>]*>/g; let m;
      while ((m = re.exec(slice))) {
        const color = normHex((/colou?r="([^"]+)"/i.exec(m[0]) || [])[1]);
        if (color) out.push({ index: out.length, color });
      }
      if (out.length) return out;
    }
    // PrusaSlicer: filament_colour = #a;#b;#c
    const prusa = memberText(members, CFG_PRUSA);
    if (prusa) {
      const line = /filament_colou?r\s*=\s*([#0-9a-fA-F;,\s]+)/i.exec(prusa);
      if (line) {
        return line[1].split(/[;,]/).map((s) => normHex(s)).filter(Boolean)
          .map((color, i) => ({ index: i, color }));
      }
    }
    return [];
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
    const model = (members.find((m) => /\.model$/i.test(m.name)) || {}).data;
    if (!model || model.length > 48 * 1024 * 1024) return null;
    const text = model.toString('utf8');
    const unit = ((/<model\b[^>]*\bunit="([^"]+)"/i.exec(text) || [])[1] || 'millimeter').toLowerCase();
    const scale = UNIT_MM[unit] || 1;

    // Each object → direct-vertex bbox and/or a list of {ref, transform} components.
    const objs = {};
    const objRe = /<object\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/object>/g; let om;
    while ((om = objRe.exec(text))) {
      const block = om[2];
      const comps = [];
      const cRe = /<component\b[^>]*\bobjectid="([^"]+)"[^>]*>/g; let cm;
      while ((cm = cRe.exec(block))) comps.push({ ref: cm[1], t: parseT((/transform="([^"]+)"/i.exec(cm[0]) || [])[1]) });
      const vRe = /<vertex\b([^>]*?)\/?>/g; let vm;
      let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity, has = false;
      while ((vm = vRe.exec(block))) { const va = vm[1]; const x = parseFloat((/\bx=["']?(-?[\d.]+(?:[eE][+-]?\d+)?)/.exec(va) || [])[1]), y = parseFloat((/\by=["']?(-?[\d.]+(?:[eE][+-]?\d+)?)/.exec(va) || [])[1]), z = parseFloat((/\bz=["']?(-?[\d.]+(?:[eE][+-]?\d+)?)/.exec(va) || [])[1]); if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue; has = true; if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z; }
      objs[om[1]] = { verts: has ? { mnx, mny, mnz, mxx, mxy, mxz } : null, comps };
    }
    if (!Object.keys(objs).length) return null;

    // Resolve an object's bbox in its own local space (memoized, cycle-guarded). Returns null if
    // any referenced component can't be resolved — the caller then bails rather than under-count.
    const memo = {};
    function resolve(id, seen) {
      if (memo[id]) return memo[id];
      const o = objs[id];
      if (!o || (seen && seen.has(id))) return null;
      const pts = [];
      if (o.verts) pts.push(...cornersOf(o.verts));
      for (const c of o.comps) {
        const child = resolve(c.ref, new Set(seen || []).add(id));
        if (!child) return null;
        for (const p of cornersOf(child)) pts.push(applyT(p, c.t));
      }
      if (!pts.length) return null;
      return (memo[id] = bboxOf(pts));
    }

    const buildBlock = (/<build\b[^>]*>([\s\S]*?)<\/build>/i.exec(text) || [])[1];
    const items = [];
    if (buildBlock) { const itRe = /<item\b[^>]*>/g; let im; while ((im = itRe.exec(buildBlock))) items.push(im[0]); }
    const pts = [];
    if (items.length) {
      for (const it of items) {
        const b = resolve((/objectid="([^"]+)"/i.exec(it) || [])[1], null);
        if (!b) return null; // an unresolvable item → don't trust the footprint
        for (const p of cornersOf(b)) pts.push(applyT(p, parseT((/transform="([^"]+)"/i.exec(it) || [])[1])));
      }
    } else {
      for (const id in objs) { const b = resolve(id, null); if (b) for (const p of cornersOf(b)) pts.push(p); }
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

  /** Tally per-filament (1-based paint state) usage across every .model member. */
  function tallyPaintUsage(members, n) {
    const usage = new Array(n).fill(0);
    if (!mfMesh || !mfMesh.dominantState) return usage;
    for (const m of members) {
      if (!/\.model$/i.test(m.name)) continue;
      const text = m.data.toString('utf8');
      const re = /paint_color="([0-9A-Fa-f]+)"/g; let mm;
      while ((mm = re.exec(text))) { const s = mfMesh.dominantState(mm[1]); if (s >= 1 && s <= n) usage[s - 1] += 1; }
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
    if (target.flavour !== 'orca') return null;              // Orca-only feature
    if (!(target.maxColors >= 1) || filaments.length <= target.maxColors) return null;
    const colors = filaments.map((f) => f.color).filter(Boolean);
    if (colors.length !== filaments.length) return null;     // need every colour known to mix safely
    const usage = tallyPaintUsage(members, colors.length);
    const physical = Array.isArray(opts.fsPhysical) && opts.fsPhysical.length === target.maxColors ? opts.fsPhysical : undefined;
    const physicalHex = Array.isArray(opts.fsPhysicalHex) ? opts.fsPhysicalHex : undefined;
    return fullSpectrum.planFullSpectrum(colors, usage, { physical, physicalHex });
  }

  /** Rewrite paint_color / mmu_segmentation codes in a .model member through a Full Spectrum plan. */
  function remapModelPaint(text, plan) {
    return text.replace(/(paint_color|mmu_segmentation)="([0-9A-Fa-f]+)"/g,
      (_m, attr, code) => `${attr}="${fullSpectrum.remapPaintCode(code, plan.stateMap)}"`);
  }

  /**
   * Turn a source Bambu/Orca project_settings.config into a Full Spectrum U1 config: keep only the 4
   * physical filaments (reindex every per-filament array to them), stamp the loaded head colours, and
   * add the mixed_filament_definitions + dithering keys that realise the extra colours as mixes.
   */
  function applyFullSpectrumConfig(obj, plan, srcCount, report) {
    const keep = plan.physical; // 0-based source indices, length = slots
    for (const k of Object.keys(obj)) {
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

      // Full Spectrum: >4 colours → 4 physical heads + dithered mixes (Snapmaker Orca). When active it
      // fully owns the colour mapping (paint codes + config), so it supersedes the plain slotMap remap.
      const fsPlan = planFS(members, filaments, target, opts);

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
        // Full Spectrum: rewrite the paint codec in the mesh so extra colours point at the mixed
        // (virtual) filament slots, and remap the XML part→extruder refs the same way.
        if (fsPlan && /\.model$/i.test(m.name)) {
          return { name: m.name, data: Buffer.from(remapModelPaint(m.data.toString('utf8'), fsPlan), 'utf8') };
        }
        if (fsPlan && /model_settings\.config$/i.test(m.name) && !tryJson(m.data.toString('utf8'))) {
          // Bambu model_settings.config is XML: <metadata key="extruder" value="N"/> (1-based).
          const text = m.data.toString('utf8').replace(
            /(key="extruder"\s+value=")(\d+)(")/g,
            (_a, pre, num, post) => { const old = parseInt(num, 10); const ni = old >= 1 && old <= fsPlan.map.length ? fsPlan.map[old - 1] + 1 : old; return `${pre}${ni}${post}`; });
          return { name: m.name, data: Buffer.from(text, 'utf8') };
        }
        if (/project_settings\.config$/i.test(m.name) || /model_settings\.config$/i.test(m.name)) {
          const text = m.data.toString('utf8');
          const obj = tryJson(text);
          if (obj) {
            // Re-profile fields (same-family only).
            if (reprofile) {
              if (target.printerModel) { obj.printer_model = target.printerModel; report.fieldsChanged.push('printer_model'); }
              if (target.printerModel) obj.printer_settings_id = target.printerModel;
              if (target.nozzle) obj.nozzle_diameter = Array.isArray(obj.nozzle_diameter) ? obj.nozzle_diameter.map(() => String(target.nozzle)) : String(target.nozzle);
              if (target.bed) {
                const { x, y, z } = target.bed;
                obj.printable_area = [`0x0`, `${x}x0`, `${x}x${y}`, `0x${y}`];
                report.fieldsChanged.push('printable_area');
                if (z) { obj.printable_height = String(z); report.fieldsChanged.push('printable_height'); }
              }
            }
            // Full Spectrum owns the colour mapping (only meaningful on project_settings, which holds
            // the filament palette + mixed-filament keys); otherwise apply the plain colour→slot remap.
            if (fsPlan && /project_settings\.config$/i.test(m.name)) {
              applyFullSpectrumConfig(obj, fsPlan, n, report);
            } else if (slotMap && !fsPlan) {
              report.colorsRemapped += remapJsonSettings(obj, slotMap, n);
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

      if (flavour === 'generic') report.warnings.push('Source slicer not recognized — geometry preserved, but no colour/printer settings were found to rewrite.');
      if (fsPlan) {
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
      // Full Spectrum reduces the palette to the physical heads (mixes are virtual), so the round-trip
      // colour count is the target's slot count, not the source's.
      const expectColours = report.fullSpectrum ? (target.maxColors || filaments.length) : filaments.length;
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
    if (target.flavour !== 'orca' || !(target.maxColors >= 1) || filaments.length <= target.maxColors) {
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

  const api = { analyze, convert, fsPreview, readMembers, detectFlavour, extractFilaments, extractMeta, computeBounds, extractTriangles, extractTrianglesWithPaint, extractPlates, fitWarnings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') global.KhaytMfConvert = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
