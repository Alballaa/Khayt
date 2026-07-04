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
   * Analyze a 3MF: flavour, ordered filament colours, whether it holds geometry.
   * @returns {{ ok:boolean, flavour?:string, filaments?:Array, colorCount?:number, memberCount?:number, hasGeometry?:boolean, error?:string }}
   */
  function analyze(buf) {
    const members = readMembers(buf);
    if (!members.length) return { ok: false, error: 'Not a readable 3MF/ZIP file.' };
    const hasGeometry = members.some((m) => /\.model$/i.test(m.name));
    const filaments = extractFilaments(members);
    return {
      ok: true,
      flavour: detectFlavour(members),
      filaments,
      colorCount: filaments.length,
      memberCount: members.length,
      hasGeometry,
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

  /**
   * Convert a 3MF for a target printer.
   * @param {Buffer} buf source 3MF
   * @param {{ targetId:string, mode?:('retarget'|'normalize'), slotMap?:number[] }} opts
   * @returns {{ ok:boolean, buffer?:Buffer, report?:object, error?:string }}
   */
  function convert(buf, opts = {}) {
    const members = readMembers(buf);
    if (!members.length) return { ok: false, error: 'Not a readable 3MF/ZIP file.' };
    if (!members.some((m) => /\.model$/i.test(m.name))) {
      return { ok: false, error: 'This 3MF has no model geometry to convert.' };
    }
    const flavour = detectFlavour(members);
    const target = profiles.getProfile(opts.targetId) || profiles.GENERIC;
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

      out = out.map((m) => {
        if (/project_settings\.config$/i.test(m.name) || /model_settings\.config$/i.test(m.name)) {
          const text = m.data.toString('utf8');
          const obj = tryJson(text);
          if (obj) {
            // Re-profile fields.
            if ('printer_model' in obj || 'printer_settings_id' in obj || flavour !== 'prusa') {
              if (target.printerModel) { obj.printer_model = target.printerModel; report.fieldsChanged.push('printer_model'); }
              if (target.printerModel) obj.printer_settings_id = target.printerModel;
              if (target.nozzle) obj.nozzle_diameter = Array.isArray(obj.nozzle_diameter) ? obj.nozzle_diameter.map(() => String(target.nozzle)) : String(target.nozzle);
              if (target.bed) {
                const { x, y } = target.bed;
                obj.printable_area = [`0x0`, `${x}x0`, `${x}x${y}`, `0x${y}`];
                report.fieldsChanged.push('printable_area');
              }
            }
            // Colour → slot remap.
            if (slotMap) { report.colorsRemapped += remapJsonSettings(obj, slotMap, n); }
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
          if (target.printerModel) { text = text.replace(/^printer_model\s*=.*$/im, `printer_model = ${target.printerModel}`); report.fieldsChanged.push('printer_model'); }
          if (target.nozzle) text = text.replace(/^nozzle_diameter\s*=.*$/im, `nozzle_diameter = ${target.nozzle}`);
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
      if (target.maxColors && n > target.maxColors) report.warnings.push(`Source uses ${n} colours but ${target.name} supports ${target.maxColors}. Extra colours will need manual mapping in your slicer.`);
      report.fieldsChanged = [...new Set(report.fieldsChanged)];
    }

    const zipped = zipWrite.writeZip(out);
    if (!zipped) return { ok: false, error: 'Failed to repackage the 3MF.' };
    return { ok: true, buffer: zipped, report };
  }

  const api = { analyze, convert, readMembers, detectFlavour, extractFilaments };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') global.KhaytMfConvert = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
