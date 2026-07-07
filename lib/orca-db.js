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

let _cache = null; // { root, byVendor } — cheap memo for a session; cleared by refresh()

function activeRoot() {
  if (_cache) return _cache.root;
  const r = profileRoots()[0] || null;
  _cache = { root: r, filaments: null };
  return r;
}

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
  const root = activeRoot();
  if (!root) return [];
  if (_cache.filaments) return _cache.filaments;
  const out = [];
  const seenNames = new Set();
  let vendors = [];
  try { vendors = fs.readdirSync(root); } catch (_) { vendors = []; }
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
  out.sort((a, b) => a.name.localeCompare(b.name));
  _cache.filaments = out;
  return out;
}

/** True when a Snapmaker-Orca-family filament DB was found on this machine. */
function available() { return !!activeRoot(); }

/** Drop the memo (e.g. after the user installs/updates their slicer). */
function refresh() { _cache = null; }

module.exports = { listU1Filaments, available, refresh, profileRoots };
