'use strict';
/*
 * Painted-mesh extraction for the 3MF preview — a Node port of the bedready.io web extractor
 * (src/lib/paint.ts), which is the reference implementation this app's preview is modelled on.
 *
 * The important part is the paint codec: a 3MF `paint_color` / `mmu_segmentation` value is NOT a
 * filament index — it's a recursive triangle-subdivision bitstream (Orca/Bambu/Prusa
 * FacetsAnnotation::get_triangle_as_string). Each hex digit is 4 bits LSB-first and the digits are
 * PREPENDED, so the string reads right-to-left. dominantState() walks that stream and returns the
 * face's representative filament state (1-based; 0 = base). Colour = palette[state-1].
 *
 * Output is flat, non-indexed typed arrays (9 floats / face) so millions of triangles cost little
 * memory and hand straight to a GPU buffer. Handles the production-extension object graph
 * (build items → objects → cross-file components) with composed transforms, Bambu/Orca per-part
 * filament assignment, PrusaSlicer multi-volume colouring and Full-Spectrum palettes, build plates,
 * and stride-samples big models down to a preview budget (the full mesh still converts).
 */
(function (global) {
  const zipRead = (typeof require === 'function') ? require('./zip-read') : global.KhaytZip;

  const strFromU8 = (u8) => Buffer.isBuffer(u8) ? u8.toString('utf8') : Buffer.from(u8.buffer || u8, u8.byteOffset || 0, u8.byteLength).toString('utf8');
  const strToU8 = (s) => Buffer.from(String(s), 'utf8');

  function normalizeHex(h) {
    const s = (h || '').replace('#', '');
    return s.length >= 6 ? '#' + s.slice(0, 6).toUpperCase() : '#FFFFFF';
  }

  // ---------- paint codec ----------
  function hexToBits(h) {
    const bits = [];
    for (let j = h.length - 1; j >= 0; j--) {
      const d = parseInt(h[j], 16);
      if (!Number.isFinite(d)) continue;
      for (let b = 0; b < 4; b++) bits.push((d >> b) & 1);
    }
    return bits;
  }
  function bitsToHex(bits) {
    let h = '';
    for (let i = 0; i < bits.length; i += 4) {
      let nib = 0;
      for (let b = 0; b < 4 && i + b < bits.length; b++) nib |= bits[i + b] << b;
      h = nib.toString(16).toUpperCase() + h;
    }
    return h;
  }
  function encodeSolidPaint(state) {
    const bits = [0, 0];
    if (state >= 3) { bits.push(1, 1); for (let i = 0; i < 4; i++) bits.push((state - 3) >> i & 1); }
    else { bits.push(state & 1, (state >> 1) & 1); }
    return bitsToHex(bits);
  }
  // Representative (first-leaf) state of a paint code — the preview's per-face colour.
  function dominantState(hex) {
    const bits = hexToBits(hex);
    let p = 0;
    const rd = (k) => { let n = 0; for (let i = 0; i < k; i++) n |= (bits[p++] || 0) << i; return n; };
    let st = 0;
    (function tri() {
      const ss = rd(2);
      if (ss) { rd(2); for (let c = 0; c < ss + 1; c++) tri(); }
      else { const lo = rd(2); const s = lo === 3 ? rd(4) + 3 : lo; if (st === 0) st = s; }
    })();
    return st;
  }

  // PrusaSlicer "multi-volume" (per-colour triangle ranges) → synthesized paint_color per triangle.
  function applyPrusaVolumePaint(entries) {
    const cfgEntry = Object.entries(entries).find(([p]) => p.toLowerCase().endsWith('slic3r_pe_model.config'));
    if (!cfgEntry) return entries;
    const cfgXml = strFromU8(cfgEntry[1]);
    const objects = new Map();
    for (const om of cfgXml.matchAll(/<object id="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)) {
      const oid = parseInt(om[1], 10);
      const body = om[2];
      const objExtruder = parseInt((body.match(/key="extruder" value="(\d+)"/) || [])[1] || '1', 10);
      const vols = [];
      for (const vm of body.matchAll(/<volume firstid="(\d+)" lastid="(\d+)"[^>]*>([\s\S]*?)<\/volume>/g)) {
        vols.push({ first: parseInt(vm[1], 10), last: parseInt(vm[2], 10), extruder: parseInt((vm[3].match(/key="extruder" value="(\d+)"/) || [])[1] || String(objExtruder), 10) });
      }
      objects.set(oid, { objExtruder, vols });
    }
    const withVols = [...objects.values()].filter((o) => o.vols.length);
    if (!withVols.length) return entries;
    const onlyObj = objects.size === 1 ? [...objects.values()][0] : null;
    const out = Object.assign({}, entries);
    for (const [path, data] of Object.entries(entries)) {
      if (!path.toLowerCase().endsWith('.model')) continue;
      let changed = false;
      const xml = strFromU8(data).replace(/<object id="(\d+)"([^>]*)>([\s\S]*?)<\/object>/g, (block, oidStr) => {
        const info = objects.get(parseInt(oidStr, 10)) || onlyObj;
        if (!info || !info.vols.length) return block;
        const extOf = (t) => { for (const v of info.vols) if (t >= v.first && t <= v.last) return v.extruder; return info.objExtruder; };
        let t = -1;
        return block.replace(/<triangle\b([^>]*?)\s*\/>/g, (tri, attrs) => {
          t++;
          if (/paint_color=|mmu_segmentation=/.test(attrs)) return tri;
          changed = true;
          return `<triangle${attrs} paint_color="${encodeSolidPaint(extOf(t))}"/>`;
        });
      });
      if (changed) out[path] = strToU8(xml);
    }
    return out;
  }

  function paletteFromFullSpectrum(entries) {
    const ent = Object.entries(entries).find(([p]) => /full_spectrum\.json$/i.test(p));
    if (!ent) return null;
    try {
      const o = JSON.parse(strFromU8(ent[1]));
      const all = [...(o.physical_extruders || []), ...(o.virtual_extruders || [])].filter((e) => e.id && e.color);
      if (!all.length) return null;
      const maxId = Math.max(...all.map((e) => e.id));
      const pal = new Array(maxId).fill('#FFFFFF');
      for (const e of all) pal[e.id - 1] = normalizeHex(e.color);
      return pal;
    } catch (_) { return null; }
  }

  // ---------- geometry ----------
  const PREVIEW_BUDGET = 1_500_000;
  const HARD_CAP = 30_000_000;
  const TRI_RE = /<triangle[ />]/g;
  const IDENTITY4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function transform12to16(t) {
    if (!t || t.length < 12) return IDENTITY4.slice();
    return [t[0], t[1], t[2], 0, t[3], t[4], t[5], 0, t[6], t[7], t[8], 0, t[9], t[10], t[11], 1];
  }
  function matMul(A, B) {
    const R = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += A[r * 4 + k] * B[k * 4 + c]; R[r * 4 + c] = s; }
    return R;
  }
  const attr = (s, name) => (s.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`)) || [])[1];
  const stripSlash = (p) => p.replace(/^\//, '');

  // members: [{ name, data:Buffer }] from zip-read. Returns MeshData (flat typed arrays).
  function extractMeshFromMembers(members, maxFaces, hardCap) {
    maxFaces = maxFaces || PREVIEW_BUDGET; hardCap = hardCap || HARD_CAP;
    const raw = {};
    for (const m of members) raw[m.name] = m.data;
    const entries = applyPrusaVolumePaint(raw);

    let palette = [], prusaPalette = [], baseState = 1;
    const faceCountToExtr = new Map(), faceCountToName = new Map(), idToExtr = new Map();
    const plateDefs = [];
    const files = new Map();
    let buildPath = '';
    const buildItems = [];

    for (const [path, data] of Object.entries(entries)) {
      const lower = path.toLowerCase();
      const base = lower.split('/').pop() || '';
      if (base === 'project_settings.config') {
        try { palette = (JSON.parse(strFromU8(data)).filament_colour || []).map(normalizeHex); } catch (_) { /* */ }
      } else if (base === 'slic3r_pe.config') {
        const text = strFromU8(data);
        const grab = (key) => { const m = text.match(new RegExp(`^;?\\s*${key}\\s*=\\s*(.+)$`, 'm')); return m ? m[1].trim().split(/[;,]/).map((s) => normalizeHex(s.trim())).filter(Boolean) : []; };
        const fc = grab('filament_colour'), ec = grab('extruder_colour');
        const distinct = (a) => new Set(a).size;
        prusaPalette = distinct(fc) >= 2 ? fc : distinct(ec) >= 2 ? ec : fc.length ? fc : ec;
      } else if (base === 'model_settings.config') {
        const xml = strFromU8(data);
        const first = xml.match(/key="extruder" value="(\d+)"/);
        if (first) baseState = parseInt(first[1], 10);
        for (const om of xml.matchAll(/<object\b[^>]*>([\s\S]*?)<\/object>/g)) {
          const body = om[1];
          const ex = parseInt((body.match(/key="extruder" value="(\d+)"/) || [])[1] || '0', 10);
          const fc = parseInt((body.match(/face_count="(\d+)"/) || [])[1] || '0', 10);
          const nm = (body.match(/key="name" value="([^"]*)"/) || [])[1];
          if (fc > 0) { if (ex > 0) faceCountToExtr.set(fc, ex); if (nm) faceCountToName.set(fc, nm); }
          for (const pm of body.matchAll(/<part\b([^>]*)>([\s\S]*?)<\/part>/g)) {
            const pid = parseInt(attr(pm[1], 'id') || '-1', 10);
            if (pid < 0) continue;
            const pe = parseInt((pm[2].match(/key="extruder" value="(\d+)"/) || [])[1] || '0', 10);
            idToExtr.set(pid, pe > 0 ? pe : ex > 0 ? ex : baseState);
          }
        }
        for (const pm of xml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
          const body = pm[1];
          const name = (body.match(/key="plater_name" value="([^"]*)"/) || [])[1] || '';
          const objectIds = [...body.matchAll(/key="object_id" value="(\d+)"/g)].map((m) => parseInt(m[1], 10));
          if (objectIds.length) plateDefs.push({ name, objectIds });
        }
      } else if (lower.endsWith('.model')) {
        const xml = strFromU8(data);
        const objs = new Map();
        for (const om of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
          const id = parseInt(attr(om[1], 'id') || '-1', 10);
          if (id < 0) continue;
          const body = om[2];
          const meshM = body.match(/<mesh>([\s\S]*?)<\/mesh>/);
          if (meshM) { objs.set(id, { mesh: meshM[1] }); }
          else {
            const comps = [];
            for (const cm of body.matchAll(/<component\b([^>]*?)\/?>/g)) {
              const oid = parseInt(attr(cm[1], 'objectid') || '-1', 10);
              if (oid < 0) continue;
              const cp = attr(cm[1], 'path'), tStr = attr(cm[1], 'transform');
              comps.push({ path: cp ? stripSlash(cp) : stripSlash(path), objectid: oid, transform: transform12to16(tStr ? tStr.trim().split(/\s+/).map(Number) : []) });
            }
            objs.set(id, { comps });
          }
        }
        files.set(stripSlash(path), objs);
        if (/<build[\s>]/.test(xml)) {
          buildPath = stripSlash(path);
          for (const im of xml.matchAll(/<item\b([^>]*?)\/?>/g)) {
            const oid = parseInt(attr(im[1], 'objectid') || '-1', 10);
            if (oid < 0) continue;
            const tStr = attr(im[1], 'transform');
            buildItems.push({ objectid: oid, transform: transform12to16(tStr ? tStr.trim().split(/\s+/).map(Number) : []) });
          }
        }
      }
    }

    const triCountOf = (node) => { if (node.triCount == null) node.triCount = node.mesh ? (node.mesh.match(TRI_RE) || []).length : 0; return node.triCount; };
    const walk = (path, oid, M, depth, onLeaf) => {
      if (depth > 64) return;
      const node = (files.get(path) || new Map()).get(oid);
      if (!node) return;
      if (node.mesh != null) { onLeaf(node, M, oid); return; }
      for (const c of node.comps || []) walk(c.path, c.objectid, matMul(c.transform, M), depth + 1, onLeaf);
    };

    if (palette.length === 0 && prusaPalette.length) palette = prusaPalette;
    const fsPal = paletteFromFullSpectrum(entries);
    if (fsPal && fsPal.length > palette.length) palette = fsPal;

    let roots = buildItems.map((it) => ({ path: buildPath, objectid: it.objectid, transform: it.transform }));
    if (roots.length === 0) { roots = []; for (const [path, objs] of files) for (const [id, node] of objs) if (node.mesh != null) roots.push({ path, objectid: id, transform: IDENTITY4.slice() }); }

    let triangleCount = 0; const rootBase = [], rootName = [];
    for (const r of roots) {
      let n = 0; walk(r.path, r.objectid, r.transform, 0, (node) => { n += triCountOf(node); });
      triangleCount += n;
      rootBase.push(faceCountToExtr.get(n) != null ? faceCountToExtr.get(n) : baseState);
      rootName.push(faceCountToName.get(n) || '');
    }

    const emptyMesh = (skipped) => ({ positions: new Float32Array(0), faceState: new Uint8Array(0), palette, baseState, triangleCount, skipped, sampled: false, parts: [], plates: [] });
    if (triangleCount === 0) return emptyMesh(false);
    if (triangleCount > hardCap) return emptyMesh(true);

    const stride = triangleCount > maxFaces ? Math.ceil(triangleCount / maxFaces) : 1;
    const cap = stride === 1 ? triangleCount : Math.ceil(triangleCount / stride);
    const positions = new Float32Array(cap * 9);
    const faceState = new Uint8Array(cap);
    let vc = 0, fc = 0, gtri = 0;

    const emit = (seg, M, baseExtr) => {
      const nv = (seg.match(/<vertex\b/g) || []).length;
      const vx = new Float32Array(nv * 3);
      let i = 0;
      for (const m of seg.matchAll(/<vertex[^>]*\/>/g)) {
        const tag = m[0];
        const x = +((tag.match(/x="([^"]+)"/) || [])[1] || 0), y = +((tag.match(/y="([^"]+)"/) || [])[1] || 0), z = +((tag.match(/z="([^"]+)"/) || [])[1] || 0);
        vx[i++] = x * M[0] + y * M[4] + z * M[8] + M[12];
        vx[i++] = x * M[1] + y * M[5] + z * M[9] + M[13];
        vx[i++] = x * M[2] + y * M[6] + z * M[10] + M[14];
      }
      for (const m of seg.matchAll(/<triangle ([^>]*?)\/>/g)) {
        if (gtri++ % stride !== 0) continue;
        const a = m[1];
        const v1 = +((a.match(/v1="(\d+)"/) || [])[1] || 0), v2 = +((a.match(/v2="(\d+)"/) || [])[1] || 0), v3 = +((a.match(/v3="(\d+)"/) || [])[1] || 0);
        const pc = a.match(/(?:paint_color|mmu_segmentation)="([0-9A-Fa-f]+)"/);
        faceState[fc++] = pc ? dominantState(pc[1]) : baseExtr;
        positions[vc++] = vx[v1 * 3]; positions[vc++] = vx[v1 * 3 + 1]; positions[vc++] = vx[v1 * 3 + 2];
        positions[vc++] = vx[v2 * 3]; positions[vc++] = vx[v2 * 3 + 1]; positions[vc++] = vx[v2 * 3 + 2];
        positions[vc++] = vx[v3 * 3]; positions[vc++] = vx[v3 * 3 + 1]; positions[vc++] = vx[v3 * 3 + 2];
      }
    };

    const partRanges = [];
    roots.forEach((r, ri) => {
      partRanges.push({ name: rootName[ri], objectId: r.objectid, start: fc });
      walk(r.path, r.objectid, r.transform, 0, (node, M, leafOid) => emit(node.mesh, M, idToExtr.get(leafOid) != null ? idToExtr.get(leafOid) : rootBase[ri]));
    });
    const parts = partRanges.map((pr, i) => {
      const end = i + 1 < partRanges.length ? partRanges[i + 1].start : fc;
      return { name: pr.name, objectId: pr.objectId, start: pr.start, end, triangleCount: end - pr.start };
    }).filter((p) => p.triangleCount > 0);

    const plates = plateDefs.map((pd) => ({
      name: pd.name,
      partIndices: parts.map((p, i) => (pd.objectIds.includes(p.objectId) ? i : -1)).filter((i) => i >= 0),
    })).filter((pl) => pl.partIndices.length > 0);

    return {
      positions: vc === positions.length ? positions : positions.subarray(0, vc),
      faceState: fc === faceState.length ? faceState : faceState.subarray(0, fc),
      palette, baseState, triangleCount, skipped: false, sampled: stride > 1, parts, plates,
    };
  }

  // Convenience: extract straight from a 3MF Buffer.
  function extractMeshFromBuffer(buf, maxFaces, hardCap) {
    let zip; try { zip = zipRead.openZip(buf); } catch (_) { zip = null; }
    const members = [];
    if (zip && zip.entries) for (const e of zip.entries) { const d = zip.file(e.name); if (d) members.push({ name: e.name, data: d }); }
    return extractMeshFromMembers(members, maxFaces, hardCap);
  }

  const api = { extractMeshFromMembers, extractMeshFromBuffer, dominantState, hexToBits, bitsToHex, encodeSolidPaint, normalizeHex, PREVIEW_BUDGET, HARD_CAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') global.KhaytMfMesh = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
