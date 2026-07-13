'use strict';

/**
 * Calibration → tuned OrcaSlicer filament profile (main-process, Bed Ready).
 *
 * OrcaSlicer's own calibration suite writes results back to NOTHING — every measured value (temp, flow
 * ratio, pressure advance, retraction, max volumetric speed) is eyeballed and hand-typed into filament
 * settings. This closes that loop: it takes one of the user's EXISTING filament presets as the base
 * (so the `inherits` chain and all other fields stay valid), applies the measured overrides, and writes
 * a new tuned preset straight into the slicer's user filament folder — the same place lib/orca-filament-
 * install.js installs into, reusing its slicer detection / version / filename machinery. Node-only.
 */
const fs = require('fs');
const path = require('path');
const orca = require('./orca-filament-install');

/** Map measured calibration inputs → OrcaSlicer filament keys (each a one-element string array). */
function overridesFromValues(values) {
  const v = values || {};
  const out = {};
  const num = (x) => (x != null && x !== '' && isFinite(Number(x)) ? String(Number(x)) : null);
  const temp = num(v.nozzleTemp);
  if (temp != null) { out.nozzle_temperature = [temp]; out.nozzle_temperature_initial_layer = [temp]; }
  const flow = num(v.flowRatio);
  if (flow != null) out.filament_flow_ratio = [flow];
  const pa = num(v.pressureAdvance);
  if (pa != null) { out.pressure_advance = [pa]; out.enable_pressure_advance = ['1']; }
  const ret = num(v.retractionLength);
  if (ret != null) out.filament_retraction_length = [ret];
  const mvs = num(v.maxVolSpeed);
  if (mvs != null) out.filament_max_volumetric_speed = [mvs];
  const bed = num(v.bedTemp);
  if (bed != null) { out.hot_plate_temp = [bed]; out.hot_plate_temp_initial_layer = [bed]; }
  return out;
}

/** First array element (Orca stores most filament values as one-element arrays), else the raw value. */
function readVal(j, key) {
  const v = j[key];
  if (Array.isArray(v)) return v.length ? String(v[0]) : '';
  return v != null ? String(v) : '';
}

/** The user's own filament presets for a detected slicer — the bases you can tune from. */
function listUserFilaments(slicer) {
  let ents = [];
  try { ents = fs.readdirSync(slicer.filamentDir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of ents) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    let j = null;
    try { j = JSON.parse(fs.readFileSync(path.join(slicer.filamentDir, e.name), 'utf8')); } catch { j = null; }
    if (!j || j.type !== 'filament') continue;
    out.push({
      name: j.name || path.basename(e.name, '.json'),
      file: e.name,
      type: Array.isArray(j.filament_type) ? j.filament_type[0] : (j.filament_type || ''),
      // Current values so the UI can prefill (empty when the value is inherited, not stored in the diff).
      current: {
        nozzleTemp: readVal(j, 'nozzle_temperature'),
        flowRatio: readVal(j, 'filament_flow_ratio'),
        pressureAdvance: readVal(j, 'pressure_advance'),
        retractionLength: readVal(j, 'filament_retraction_length'),
        maxVolSpeed: readVal(j, 'filament_max_volumetric_speed'),
      },
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Detected slicers we can save into, each with its printers + user filament presets. */
function calibrationTargets() {
  return orca.detectSlicers().map((s) => ({
    id: s.id, label: s.label,
    printers: orca.listPrinters(s),
    filaments: listUserFilaments(s),
  }));
}

/**
 * Write a tuned filament preset derived from a base user preset. `baseFile` is a bare filename from
 * listUserFilaments (path.basename confines it to the filament dir — no traversal). Throws with a
 * user-facing message on any problem.
 */
function saveCalibratedProfile({ slicerId, baseFile, printerLabel, name, values } = {}) {
  const slicers = orca.detectSlicers();
  const slicer = slicers.find((s) => s.id === slicerId) || slicers[0];
  if (!slicer) throw new Error('No supported slicer detected.');
  if (!baseFile) throw new Error('Pick a base filament to tune.');

  const basePath = path.join(slicer.filamentDir, path.basename(String(baseFile)));
  let preset;
  try { preset = JSON.parse(fs.readFileSync(basePath, 'utf8')); } catch { throw new Error('Could not read the base filament.'); }
  if (!preset || preset.type !== 'filament') throw new Error('That base isn’t a filament preset.');

  const overrides = overridesFromValues(values);
  if (!Object.keys(overrides).length) throw new Error('Enter at least one measured value to save.');

  const newName = String(name || '').trim() || (preset.name ? preset.name + ' (tuned)' : 'Tuned filament');
  Object.assign(preset, overrides);
  preset.name = newName;
  preset.from = 'User';
  delete preset.setting_id; // a new preset, not the base's cloud/library id

  const printer = orca.listPrinters(slicer).find((p) => p.label === printerLabel);
  if (printer) preset.compatible_printers = printer.machines.slice();
  const version = orca.resolveVersion(slicer);
  if (version) preset.version = version; else delete preset.version;

  fs.mkdirSync(slicer.filamentDir, { recursive: true });
  const out = path.join(slicer.filamentDir, orca.safeFileBase(newName) + '.json');
  const tmp = out + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(preset, null, 2), 'utf8');
  fs.renameSync(tmp, out);
  return { ok: true, path: out, slicer: slicer.label, name: newName, applied: Object.keys(overrides) };
}

module.exports = { calibrationTargets, saveCalibratedProfile, overridesFromValues, listUserFilaments };
