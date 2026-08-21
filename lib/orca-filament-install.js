'use strict';

/**
 * Orca filament installer (main-process, Bed Ready). Installs an OrcaSlicer filament profile into a
 * user's Orca/Bambu-family slicer, retargeted to the printer they pick — the desktop counterpart of the
 * website's /orca-filaments page. Unlike the browser version (Chromium-only File System Access API + a
 * manual folder pick), the app has full filesystem access: it detects the installed slicers, reads each
 * one's own printer list + preset version straight from its config dir, and writes the preset in.
 *
 * Source library: bedready.io serves one baked, flattened, conservatively-filtered dataset (GET
 * /orca-filaments/manifest.json + /orca-filaments/profiles/<id>.json). That baseline is safe for every
 * Orca/Bambu-family slicer (they're all supersets of the filtered key set), so per-target install is just:
 * retarget `compatible_printers` to the chosen printer's machine names, stamp the target slicer's preset
 * `version`, and write to that slicer's user filament folder. Node-only; never loaded in the renderer.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// Deliberately still bedready.io, and NOT lib/makerrun's host. The 2026-08-21 split moved the design
// *library* to makerrun.com and left bedready.io as the converter; the filament dataset is neither an
// `/api/*` route nor a library URL, and it ships in the Bed Ready (converter) flavor, so on the evidence
// it stayed. If it did move with the library, this keeps working anyway: /orca-filaments is a page route,
// page routes 301 cross-origin to makerrun.com, and getJson below is a plain GET on the default
// redirect:'follow' — so the hop is transparent and nothing is lost (a 301 only eats a POST body).
// Guessing the other way is the one that breaks outright, so this waits for the contract to say.
const BASE = 'https://bedready.io';
const MANIFEST_URL = BASE + '/orca-filaments/manifest.json';
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_PROFILE_BYTES = 2 * 1024 * 1024;

/**
 * Known Orca/Bambu-family slicers, by their config-dir name(s) under the per-OS config base. All share
 * the same JSON preset format + a user/ + system/ layout. `version` is a fallback stamp for a fork that
 * REQUIRES a specific config version on user presets (Snapmaker Orca drops unversioned ones); most
 * slicers use no filament version, so we normally read it from the target's own presets and this is unset.
 */
const SLICERS = [
  { id: 'orcaslicer', label: 'OrcaSlicer', dirs: ['OrcaSlicer'] },
  { id: 'snapmaker', label: 'Snapmaker Orca', dirs: ['Snapmaker_Orca', 'SnapmakerOrca', 'Snapmaker Orca'], version: '02.03.01.10' },
  { id: 'bambustudio', label: 'Bambu Studio', dirs: ['BambuStudio', 'Bambu Studio'] },
  { id: 'crealityprint', label: 'Creality Print', dirs: ['Creality Print', 'CrealityPrint'] },
  { id: 'elegooslicer', label: 'Elegoo Slicer', dirs: ['ElegooSlicer', 'ELEGOO Slicer'] },
  { id: 'qidistudio', label: 'QIDI Studio', dirs: ['QIDIStudio'] },
  { id: 'sovolslicer', label: 'Sovol Slicer', dirs: ['SovolSlicer', 'Sovol Slicer'] },
  { id: 'anycubicnext', label: 'Anycubic Slicer Next', dirs: ['AnycubicSlicerNext', 'Anycubic Slicer Next'] },
];

/** Per-OS base dir that holds app config folders. KHAYT_ORCA_CONFIG_BASE overrides (tests / custom setups). */
function configBase() {
  if (process.env.KHAYT_ORCA_CONFIG_BASE) return process.env.KHAYT_ORCA_CONFIG_BASE;
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** Recursively collect files matching a predicate, capped so we never walk a giant tree forever. */
function collect(dir, pred, acc, cap) {
  if (acc.length >= cap) return acc;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (acc.length >= cap) break;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, pred, acc, cap);
    else if (e.isFile() && pred(p)) acc.push(p);
  }
  return acc;
}

/** The user filament folder for a resolved config dir: user/<profile>/filament (prefers "default"). */
function userFilamentDir(configDir) {
  const userDir = path.join(configDir, 'user');
  let profile = 'default';
  if (!isDir(path.join(userDir, 'default'))) {
    let subs = [];
    try { subs = fs.readdirSync(userDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { /* none */ }
    profile = subs.find((n) => !/backup/i.test(n)) || subs[0] || 'default';
  }
  return path.join(userDir, profile, 'filament');
}

/** Detect installed Orca/Bambu-family slicers (config dir with a system/ tree we can read printers from). */
function detectSlicers() {
  const base = configBase();
  const out = [];
  for (const s of SLICERS) {
    for (const name of s.dirs) {
      const configDir = path.join(base, name);
      if (!isDir(path.join(configDir, 'system')) || !isDir(path.join(configDir, 'user'))) continue;
      out.push({ id: s.id, label: s.label, configDir, filamentDir: userFilamentDir(configDir), versionFallback: s.version || null });
      break; // first matching dir spelling wins
    }
  }
  return out;
}

// Fold nozzle-size variants together: handles both "Printer 0.4 nozzle" and "Printer (0.4 nozzle)".
const stripNozzle = (n) => n.replace(/\s*\(?\s*0\.\d+\s*nozzle\s*\)?\s*$/i, '').trim();

/**
 * The printers a slicer supports, from its bundled machine presets, grouped by base name (nozzle variants
 * folded together). Returns [{ label, machines: [full preset names] }] sorted. Reads only filenames — fast.
 */
function listPrinters(slicer) {
  const files = collect(path.join(slicer.configDir, 'system'), (p) => p.endsWith('.json') && /[\\/]machine[\\/]/.test(p), [], 4000);
  const groups = new Map();
  for (const f of files) {
    const name = path.basename(f, '.json');
    if (/^fdm_/i.test(name) || /^My[A-Z]/.test(name)) continue; // internal bases + generic templates (MyKlipper, MyMarlin…), not real printers
    const label = stripNozzle(name);
    if (!label) continue;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(name);
  }
  return [...groups.entries()]
    .map(([label, machines]) => ({ label, machines: machines.sort() }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The config version to stamp on a user preset for this slicer: its own user presets → fallback → none. */
function resolveVersion(slicer) {
  const counts = new Map();
  for (const f of collect(slicer.filamentDir, (p) => p.endsWith('.json'), [], 400)) {
    const v = (readJson(f) || {}).version;
    if (typeof v === 'string' && v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  if (counts.size) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return slicer.versionFallback || null;
}

/** Turn a preset name into a safe, single-segment filename base. */
function safeFileBase(name) {
  return String(name || 'filament').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120) || 'filament';
}

async function getJson(url, cap) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('Request failed (HTTP ' + res.status + ').');
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > cap) throw new Error('Response too large.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > cap) throw new Error('Response too large.');
  return JSON.parse(buf.toString('utf8'));
}

/** GET the filament library index. */
async function fetchManifest() {
  const m = await getJson(MANIFEST_URL, MAX_MANIFEST_BYTES);
  if (!m || !Array.isArray(m.profiles)) throw new Error('The filament library index looks empty — try again later.');
  return m;
}

/** Detected slicers, each with its grouped printer list + a default printer guess. */
function targets() {
  return detectSlicers().map((s) => {
    const printers = listPrinters(s);
    // default printer: the U1 for Snapmaker, else the first.
    let def = printers.find((p) => /snapmaker u1/i.test(p.label)) || printers[0] || null;
    return { id: s.id, label: s.label, filamentDir: s.filamentDir, printers, defaultPrinter: def ? def.label : null };
  });
}

/**
 * Install one profile. `opts.slicerId` + `opts.printerLabel` choose the target; falls back to the first
 * detected slicer and its default printer. Fetches the baseline preset, retargets it, and writes it.
 */
async function installProfile(item, opts = {}) {
  const file = String((item && item.file) || '');
  const name = (item && item.name) || 'filament';
  if (!/^profiles\/[A-Za-z0-9._-]+\.json$/.test(file)) throw new Error('That filament has an invalid file reference.');

  const detected = detectSlicers();
  if (!detected.length) throw new Error('No supported slicer found. Install/open OrcaSlicer or Snapmaker Orca first.');
  const slicer = detected.find((s) => s.id === opts.slicerId) || detected[0];

  const printers = listPrinters(slicer);
  const printer = printers.find((p) => p.label === opts.printerLabel)
    || printers.find((p) => /snapmaker u1/i.test(p.label)) || printers[0];
  if (!printer) throw new Error('Couldn’t find any printers for ' + slicer.label + '.');

  const preset = await getJson(BASE + '/orca-filaments/' + file, MAX_PROFILE_BYTES);
  if (!preset || preset.type !== 'filament' || !preset.name) throw new Error('That filament profile is malformed.');

  // Retarget: this printer's machine names + this slicer's preset version.
  preset.compatible_printers = printer.machines.slice();
  const version = resolveVersion(slicer);
  if (version) preset.version = version; else delete preset.version;

  fs.mkdirSync(slicer.filamentDir, { recursive: true });
  const out = path.join(slicer.filamentDir, safeFileBase(name) + '.json');
  const tmp = out + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(preset, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmp, out);
  return { ok: true, path: out, slicer: slicer.label, printer: printer.label };
}

/** Reveal a slicer's user filament folder in the OS file manager (creates it first). */
function filamentDirFor(slicerId) {
  const detected = detectSlicers();
  const slicer = detected.find((s) => s.id === slicerId) || detected[0];
  return slicer ? slicer.filamentDir : null;
}

/**
 * Filament preset basenames (without .json) already present in a slicer's user folder. The renderer
 * matches these against safeFileBase(profile.name) to pre-mark rows as installed — so the "Installed ✓"
 * state reflects what's actually on disk (prior sessions/installs), not just this session.
 */
function installedFilamentNames(slicerId) {
  const detected = detectSlicers();
  const slicer = detected.find((s) => s.id === slicerId) || detected[0];
  if (!slicer) return [];
  let ents = [];
  try { ents = fs.readdirSync(slicer.filamentDir, { withFileTypes: true }); } catch { return []; }
  return ents.filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => path.basename(e.name, '.json'));
}

module.exports = {
  fetchManifest, targets, installProfile, detectSlicers, listPrinters, resolveVersion,
  filamentDirFor, installedFilamentNames, safeFileBase, configBase, BASE, SLICERS,
};
