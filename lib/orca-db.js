'use strict';
/**
 * Reads the filament preset database from an installed Snapmaker Orca / OrcaSlicer so the converter can
 * offer the maker the SAME filament list their slicer has — and write real preset names into a converted
 * U1 file (instead of the source's foreign "@BBL X1C" presets that Orca flags as customized).
 *
 * Orca stores system presets as JSON under <app>/resources/profiles/<Vendor>/filament/*.json, each with
 * an `inherits` chain. We only need the display name + filament_type, so a shallow inherit walk suffices.
 * Main-process only (filesystem). Returns empty when no slicer is found — callers fall back to "Generic".
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Candidate "profiles" roots for a Snapmaker-Orca-family slicer, most specific first.
function profileRoots() {
  const home = os.homedir();
  const roots = [];
  const add = (p) => { if (p) roots.push(p); };
  if (process.platform === 'darwin') {
    for (const base of ['/Applications', path.join(home, 'Applications')]) {
      for (const app of ['Snapmaker Orca.app', 'OrcaSlicer.app']) {
        add(path.join(base, app, 'Contents', 'Resources', 'profiles'));
      }
    }
  } else if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const lad = process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');
    for (const root of [pf, lad, path.join(lad, 'Programs')]) {
      for (const app of ['Snapmaker Orca', 'OrcaSlicer']) add(path.join(root, app, 'resources', 'profiles'));
    }
  } else {
    for (const d of ['/usr/share', '/opt', path.join(home, '.local', 'share')]) {
      for (const app of ['SnapmakerOrca', 'OrcaSlicer', 'orca-slicer']) add(path.join(d, app, 'resources', 'profiles'));
    }
  }
  return roots.filter((p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } });
}

let _cache = null; // memo for a session; cleared by refresh()

// All installed slicer profile roots (Snapmaker Orca + upstream OrcaSlicer). Unioning them gives the
// most comprehensive DB — OrcaSlicer ships far more generic/vendor filaments, Snapmaker Orca the U1
// machine + its filaments. OrcaSlicer ("original") first so its presets win on a name clash.
function allRoots() {
  if (_cache) return _cache.roots;
  const roots = profileRoots();
  roots.sort((a, b) => (/OrcaSlicer/i.test(a) ? 0 : 1) - (/OrcaSlicer/i.test(b) ? 0 : 1));
  _cache = { roots, filaments: null, machines: null };
  return roots;
}
function activeRoot() { return allRoots()[0] || null; }

/** Read a filament preset json + resolve its filament_type through the (shallow) inherits chain. */
function readFilamentType(dir, name, seen) {
  seen = seen || new Set();
  if (seen.has(name) || seen.size > 6) return null;
  seen.add(name);
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8')); } catch (_) { return null; }
  const ft = Array.isArray(j.filament_type) ? j.filament_type[0] : j.filament_type;
  if (ft) return String(ft);
  return j.inherits ? readFilamentType(dir, String(j.inherits), seen) : null;
}

/**
 * Every U1-compatible filament preset the installed slicer ships: [{ name, type }], de-duped, sorted.
 * "U1-compatible" = the preset name carries the "@U1" tag (how Orca scopes a preset to the U1) and isn't
 * an internal base template. Empty array when no slicer/profiles are found.
 */
function listU1Filaments() {
  if (!allRoots().length) return [];
  if (_cache.filaments) return _cache.filaments;
  const out = [];
  const seenNames = new Set();
  for (const root of allRoots()) {
    let vendors = [];
    try { vendors = fs.readdirSync(root); } catch (_) { continue; }
    for (const vendor of vendors) {
      const dir = path.join(root, vendor, 'filament');
      let files = [];
      try { files = fs.readdirSync(dir); } catch (_) { continue; }
      for (const f of files) {
        if (!/\.json$/i.test(f)) continue;
        const name = f.replace(/\.json$/i, '');
        if (!/@U1\b/i.test(name)) continue;          // scoped to the U1
        if (/\bbase\d*\b/i.test(name)) continue;      // internal base/base2 template, not user-selectable
        if (/\b0\.[0-9]+\s*nozzle/i.test(name) && !/\b0\.4\s*nozzle/i.test(name)) continue; // keep 0.4 (default) only
        if (seenNames.has(name)) continue;
        const type = readFilamentType(dir, name) || 'PLA';
        seenNames.add(name);
        out.push({ name, type });
      }
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  _cache.filaments = out;
  return out;
}

// Meta keys that describe the preset itself (not print settings) — dropped from a resolved merge.
const META_KEYS = new Set(['type', 'name', 'from', 'instantiation', 'inherits', 'setting_id',
  'filament_id', 'version', 'is_custom_defined', 'filament_settings_id']);

/** Locate a preset json across every root + vendor dir for a given kind (machine/process/filament). */
function findPresetFile(kind, name) {
  for (const root of allRoots()) {
    let vendors = [];
    try { vendors = fs.readdirSync(root); } catch (_) { continue; }
    for (const v of vendors) {
      const p = path.join(root, v, kind, name + '.json');
      try { if (fs.statSync(p).isFile()) return p; } catch (_) { /* keep looking */ }
    }
  }
  return null;
}

/** Resolve a preset's full settings by merging its `inherits` chain (root-first, child wins). */
function resolvePreset(kind, name, seen) {
  seen = seen || new Set();
  if (seen.has(name) || seen.size > 12) return {};
  seen.add(name);
  const file = findPresetFile(kind, name);
  if (!file) return {};
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; }
  const parent = j.inherits ? resolvePreset(kind, String(j.inherits), seen) : {};
  const out = Object.assign({}, parent);
  for (const k of Object.keys(j)) { if (!META_KEYS.has(k)) out[k] = j[k]; }
  return out;
}

/** Resolved Snapmaker U1 (0.4 nozzle) machine settings, or {} if not found. */
function u1MachineSettings() { return resolvePreset('machine', 'Snapmaker U1 (0.4 nozzle)'); }

/** U1 (0.4-nozzle) print/process presets the maker can choose: [{ name, layer }], sorted. */
function listU1Processes() {
  if (!allRoots().length) return [];
  const out = [];
  const seen = new Set();
  for (const root of allRoots()) {
    let vendors = [];
    try { vendors = fs.readdirSync(root); } catch (_) { continue; }
    for (const vendor of vendors) {
      const dir = path.join(root, vendor, 'process');
      let files = [];
      try { files = fs.readdirSync(dir); } catch (_) { continue; }
      for (const f of files) {
        if (!/\.json$/i.test(f)) continue;
        const name = f.replace(/\.json$/i, '');
        if (!/@Snapmaker U1 \(0\.4 nozzle\)/i.test(name)) continue; // 0.4 U1 process presets
        if (/_old\b/i.test(name) || /^fdm_/i.test(name)) continue;   // superseded / base templates
        if (seen.has(name)) continue;
        const layer = (resolvePreset('process', name).layer_height) || '';
        seen.add(name);
        out.push({ name, layer: String(layer) });
      }
    }
  }
  // Sort by layer height then name, so "0.20 Standard" etc. group naturally.
  out.sort((a, b) => (parseFloat(a.layer) || 9) - (parseFloat(b.layer) || 9) || a.name.localeCompare(b.name));
  return out;
}

/** The default U1 process preset name (0.20 Standard if present, else the first available). */
function defaultU1Process() {
  const list = listU1Processes();
  const std = list.find((p) => /0\.20 Standard/i.test(p.name));
  return (std || list[0] || {}).name || null;
}

/** Resolved settings for a named U1 process preset. */
function u1ProcessSettings(name) { return name ? resolvePreset('process', name) : {}; }

/** True when a Snapmaker-Orca-family filament DB was found on this machine. */
function available() { return !!activeRoot(); }

/** Drop the memo (e.g. after the user installs/updates their slicer). */
function refresh() { _cache = null; }

module.exports = {
  listU1Filaments, available, refresh, profileRoots,
  u1MachineSettings, listU1Processes, defaultU1Process, u1ProcessSettings, resolvePreset,
};
