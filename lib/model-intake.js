'use strict';
/**
 * One file in, one answer out: how long will this print and how much filament
 * will it use?
 *
 * The calculator used to ask the user to know which button to press — "Parse
 * G-code / 3MF" or "Estimate from STL" — and they answer very different
 * questions. This module makes that one decision, and it always prefers the
 * answer that is *measured* over the answer that is *guessed*:
 *
 *   1. The slicer already computed it.  A .gcode, or a 3MF saved by
 *      PrusaSlicer / OrcaSlicer / Bambu Studio after slicing, carries the real
 *      print time and filament weight. That is not an estimate; it is what the
 *      printer is about to do. `source: 'slicer'`, `exact: true`.
 *
 *   2. Nobody sliced it.  An STL, an OBJ, or a 3MF that is only geometry gives
 *      volume and a bounding box. Weight and time then come from assumptions —
 *      density, infill, wall fraction, flow rate — and are a starting point for
 *      a human, not a quote. `source: 'geometry'`, `exact: false`.
 *
 * The distinction is the whole point of the module. A geometric estimate can be
 * out by a large factor on a sparse or heavily-supported part, and a quote that
 * cannot tell the shop which kind of number it is holding is worse than no
 * number at all. `exact` is therefore never true for a geometric result, and
 * callers are expected to say which one they are showing. Same discipline as
 * the currency work: no number that looks more certain than it is.
 *
 * Pure and fs-free — it takes bytes, so it runs in the main process (from a
 * path read), in the renderer (from a FileReader), and under node --test.
 */

const { parseGcodeText } = require('./gcode-parse.js');
const { parseStl } = require('./stl-parse.js');
const { parseObj, accumulateTriangles } = require('./obj-parse.js');
const mf = require('./mf-convert.js');

/** Extensions we can say anything useful about. */
const SUPPORTED = ['gcode', 'gco', 'g', '3mf', 'stl', 'obj'];

const extOf = (filename) => {
  const s = String(filename || '');
  const dot = s.lastIndexOf('.');
  return dot === -1 ? '' : s.slice(dot + 1).toLowerCase();
};

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (ArrayBuffer.isView(bytes)) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (typeof bytes === 'string') return Buffer.from(bytes, 'utf8');
  return null;
}

/** A slicer answer is only usable if it carries BOTH numbers. */
const usable = (m) => !!(m && m.printTimeMins > 0 && m.filamentGrams > 0);

function blank(kind) {
  return {
    kind,
    exact: false,
    source: null,
    printTimeMins: null,
    filamentGrams: null,
    filamentType: null,
    filamentCost: null,
    slicer: null,
    geometry: null,
    warnings: [],
  };
}

/**
 * A 3MF is a ZIP. The slicer's summary lives in a compressed member, so reading
 * the raw file as text finds nothing at all for any normally-written project —
 * the metadata is DEFLATE'd and simply is not in those bytes. It has to be
 * unzipped.
 *
 * Three shapes exist in the wild and all three are checked:
 *   - PrusaSlicer / SuperSlicer: Metadata/Slic3r_PE.config, gcode-comment syntax
 *   - Bambu Studio / Orca:       Metadata/slice_info.config, XML-ish attributes
 *   - "sliced 3MF":              an actual .gcode member inside the archive
 */
function from3mf(buf, out) {
  let members;
  try { members = mf.readMembers(buf); } catch (e) { members = []; }
  if (!members || !members.length) {
    out.warnings.push('not-a-zip');
    return out;
  }

  // --- 1. gcode-comment metadata, wherever it lives -------------------------
  // Ordered: a real embedded .gcode first, then Prusa/Slic3r's config. Both
  // speak the same comment syntax, so one parser covers them.
  const textual = members.filter((m) => /\.(gcode|gco|config|txt)$/i.test(m.name) && m.data);
  textual.sort((a, b) => (/\.gcode$/i.test(b.name) ? 1 : 0) - (/\.gcode$/i.test(a.name) ? 1 : 0));
  for (const m of textual) {
    let parsed;
    try { parsed = parseGcodeText(m.data.toString('utf8')); } catch (e) { continue; }
    if (usable(parsed)) {
      out.exact = true;
      out.source = 'slicer';
      out.printTimeMins = parsed.printTimeMins;
      out.filamentGrams = parsed.filamentGrams;
      out.filamentType = parsed.filamentType;
      out.filamentCost = parsed.filamentCost;
      out.slicer = parsed.slicer;
      return out;
    }
  }

  // --- 2. Bambu / Orca slice_info + project settings ------------------------
  let meta = null;
  try { meta = mf.extractMeta(members); } catch (e) { meta = null; }
  if (meta && meta.totalGrams > 0 && meta.printMinutes > 0) {
    out.exact = true;
    out.source = 'slicer';
    out.printTimeMins = meta.printMinutes;
    out.filamentGrams = meta.totalGrams;
    out.slicer = out.slicer || 'Bambu/Orca';
    return out;
  }

  // --- 3. Geometry only -----------------------------------------------------
  // Nothing sliced this. Fall back to the mesh, and say so.
  let tris = null;
  try { tris = mf.extractTriangles(members); } catch (e) { tris = null; }
  if (tris && tris.length) {
    out.source = 'geometry';
    out.geometry = accumulateTriangles(tris);
  } else {
    out.warnings.push('no-geometry');
  }
  return out;
}

/**
 * @param {{filename?: string, bytes: Buffer|ArrayBuffer|TypedArray|string}} input
 * @returns {{
 *   kind: string, exact: boolean, source: 'slicer'|'geometry'|null,
 *   printTimeMins: number|null, filamentGrams: number|null,
 *   filamentType: string|null, filamentCost: number|null, slicer: string|null,
 *   geometry: {volumeMm3, areaMm2, bbox, triangleCount}|null,
 *   warnings: string[]
 * }}
 */
function intake(input) {
  const filename = (input && input.filename) || '';
  const kind = extOf(filename);
  const out = blank(kind);

  const buf = toBuffer(input && input.bytes);
  if (!buf || !buf.length) {
    out.warnings.push('empty');
    return out;
  }
  if (!SUPPORTED.includes(kind)) {
    out.warnings.push('unsupported');
    return out;
  }

  try {
    if (kind === 'gcode' || kind === 'gco' || kind === 'g') {
      // Prusa/Orca write their summary in the FOOTER, Cura near the head. The
      // caller may hand us head+tail rather than a whole 200 MB file; either
      // way this only ever reads text.
      const parsed = parseGcodeText(buf.toString('utf8'));
      out.printTimeMins = parsed.printTimeMins;
      out.filamentGrams = parsed.filamentGrams;
      out.filamentType = parsed.filamentType;
      out.filamentCost = parsed.filamentCost;
      out.slicer = parsed.slicer;
      if (usable(parsed)) { out.exact = true; out.source = 'slicer'; }
      else out.warnings.push('no-slicer-summary');
      return out;
    }

    if (kind === '3mf') return from3mf(buf, out);

    if (kind === 'stl') {
      out.source = 'geometry';
      out.geometry = parseStl(buf);
      return out;
    }

    if (kind === 'obj') {
      out.source = 'geometry';
      out.geometry = parseObj(buf);
      return out;
    }
  } catch (e) {
    out.warnings.push('parse-failed');
    out.source = null;
    out.geometry = null;
    return out;
  }
  return out;
}

module.exports = { intake, SUPPORTED, extOf };
