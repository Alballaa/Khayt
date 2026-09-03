'use strict';
/**
 * Extract a preview thumbnail (and, for 3MF, multicolour info) from a print file —
 * WITHOUT re-rendering anything. Slicers already embed a real preview:
 *
 *   - gcode/gco : Prusa/Orca/Bambu/Cura write one or more base64 PNG blocks in the
 *                 comments (`; thumbnail begin WxH len … ; thumbnail end`). We take
 *                 the largest.
 *   - 3mf       : a ZIP whose `Metadata/thumbnail*.png` (or `Metadata/plate_*.png`)
 *                 is the slicer's own coloured render. The `*.config` members carry
 *                 filament colours + usage, from which we derive colours[] + a
 *                 best-effort swap count.
 *
 * Pure-ish (Buffer + KhaytZip); no DOM. Main-process only. Never throws — returns
 * nulls/empties so a weird file can't crash the parse. STL has no embedded preview;
 * it is rendered separately by lib/stl-thumbnail.js.
 */
let KhaytZip = null;
try { KhaytZip = (typeof globalThis !== 'undefined' && globalThis.KhaytZip) || require('./zip-read'); } catch (_) { KhaytZip = null; }

/** Pull the largest embedded PNG thumbnail out of gcode text. */
function extractGcodeThumbnail(text) {
  if (!text) return { pngBase64: null, width: 0, height: 0 };
  const re = /;\s*thumbnail begin\s+(\d+)\s*[xX]\s*(\d+)\s+\d+([\s\S]*?);\s*thumbnail end/g;
  let m, best = null;
  while ((m = re.exec(text)) !== null) {
    const width = parseInt(m[1], 10), height = parseInt(m[2], 10);
    const b64 = m[3].replace(/;/g, '').replace(/\s+/g, '');
    /* A THUMBNAIL IS BASE64 OR IT IS NOT A THUMBNAIL.
     *
     * Stripping `;` and whitespace left `"`, `<`, `>`, `/` and `=` in place, and
     * this string is concatenated onto `data:image/png;base64,` and written into
     * an `src="…"`. HTML takes `/` as an attribute separator and CSS needs
     * neither a semicolon nor a space, so the stripping was not a defence.
     * Rejected here as well as at the sink, because a value that is not base64
     * is not a picture and should never reach a record. */
    if (!b64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) continue;
    const area = width * height;
    if (!best || area > best.area) best = { pngBase64: b64, width, height, area };
  }
  return best ? { pngBase64: best.pngBase64, width: best.width, height: best.height }
              : { pngBase64: null, width: 0, height: 0 };
}

function normHex(h) {
  if (!h) return null;
  let s = String(h).trim();
  if (s[0] !== '#') s = '#' + s;
  // Accept #RGB, #RRGGBB, #RRGGBBAA — normalise to #RRGGBB.
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(s);
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 8) hex = hex.slice(0, 6);
  return '#' + hex.toUpperCase();
}

/** Parse colours + usage + a swap estimate from the 3MF *.config members. */
function parse3mfColors(zip) {
  const colors = [];
  const seen = new Set();
  const push = (hex, grams, label) => {
    const h = normHex(hex);
    if (!h) return;
    if (seen.has(h)) {
      if (grams != null) { const e = colors.find((c) => c.hex === h); if (e && e.grams == null) e.grams = grams; }
      return;
    }
    seen.add(h);
    colors.push({ hex: h, grams: (grams != null ? grams : null), label: label || ('Filament ' + (colors.length + 1)) });
  };

  const cfgText = (name) => { const b = zip.file(name); return b ? b.toString('utf8') : ''; };

  // Bambu/Orca: slice_info.config — <filament id=.. color="#hex" used_g=".." />
  const slice = cfgText('Metadata/slice_info.config');
  let usedFilaments = 0;
  if (slice) {
    const fre = /<filament\b[^>]*>/g; let fm;
    while ((fm = fre.exec(slice)) !== null) {
      const tag = fm[0];
      const color = /\bcolou?r\s*=\s*"([^"]+)"/i.exec(tag);
      const usedG = /\bused_g\s*=\s*"([\d.]+)"/i.exec(tag);
      const tray  = /\btray_info_idx\b/i.test(tag);
      if (color) { push(color[1], usedG ? parseFloat(usedG[1]) : null, tray ? null : null); usedFilaments++; }
    }
  }

  // Bambu/Orca: project_settings.config (JSON) — "filament_colour": ["#hex", ...]
  if (!colors.length) {
    const proj = cfgText('Metadata/project_settings.config') || cfgText('Metadata/model_settings.config');
    const arr = /"filament_colou?r"\s*:\s*\[([^\]]*)\]/i.exec(proj);
    if (arr) {
      const hexes = arr[1].match(/#?[0-9a-fA-F]{6,8}/g) || [];
      hexes.forEach((h) => push(h));
    }
  }

  // PrusaSlicer MMU: config text — filament_colour = #hex;#hex;...
  if (!colors.length) {
    const prusa = cfgText('Metadata/Slic3r_PE.config') || cfgText('Metadata/Prusa_Slicer.config');
    const line = /filament_colou?r\s*=\s*([#0-9a-fA-F;,\s]+)/i.exec(prusa);
    if (line) (line[1].match(/#?[0-9a-fA-F]{6,8}/g) || []).forEach((h) => push(h));
  }

  // Swap estimate: prefer an explicit filament-change count if present, else the
  // single-extruder floor (one swap between each distinct colour used).
  let swapCount = 0;
  const chg = /(?:filament[_\s]*changes?|total[_\s]*filament[_\s]*change)\D*(\d+)/i.exec(slice || '');
  if (chg) swapCount = parseInt(chg[1], 10);
  else if (colors.length > 1) swapCount = colors.length - 1;

  return { colors, swapCount, usedFilaments };
}

/** Extract preview + colours from a 3MF buffer. */
function extract3mf(buf) {
  const out = { pngBase64: null, colors: [], swapCount: 0 };
  if (!KhaytZip || !buf) return out;
  let zip;
  try { zip = KhaytZip.openZip(buf); } catch (_) { return out; }
  if (!zip || !zip.entries.length) return out;
  // Prefer a plate render (coloured) then the generic thumbnail; take the biggest file.
  const pngs = zip.entries.filter((e) => /^metadata\/.*\.png$/i.test(e.name.replace(/^\.?\//, '')));
  if (pngs.length) {
    pngs.sort((a, b) => b.size - a.size);
    for (const e of pngs) {
      const png = KhaytZip.readEntry(buf, e);
      if (png && png.length) { out.pngBase64 = png.toString('base64'); break; }
    }
  }
  const c = parse3mfColors(zip);
  out.colors = c.colors;
  out.swapCount = c.swapCount;
  return out;
}

/**
 * Dispatch by extension.
 * @param {{ext:string, buf?:Buffer, text?:string}} input
 * @returns {{pngBase64:string|null, colors:Array, swapCount:number, source:string}}
 */
function extract(input) {
  const ext = String((input && input.ext) || '').toLowerCase().replace(/^\./, '');
  if (ext === 'gcode' || ext === 'gco' || ext === 'g') {
    const text = input.text != null ? input.text : (input.buf ? input.buf.toString('latin1') : '');
    const t = extractGcodeThumbnail(text);
    return { pngBase64: t.pngBase64, colors: [], swapCount: 0, source: t.pngBase64 ? 'embedded' : null };
  }
  if (ext === '3mf') {
    const r = extract3mf(input.buf);
    return { pngBase64: r.pngBase64, colors: r.colors, swapCount: r.swapCount, source: r.pngBase64 ? 'embedded' : null };
  }
  return { pngBase64: null, colors: [], swapCount: 0, source: null };
}

const api = { extract, extractGcodeThumbnail, extract3mf, parse3mfColors, normHex };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytThumb = api;
