'use strict';

/**
 * Orca filament installer (main-process, Bed Ready). Installs an OrcaSlicer filament profile into the
 * user's Snapmaker Orca so it appears for the Snapmaker U1 — the desktop counterpart of the website's
 * /orca-filaments page. Unlike the browser version (Chromium-only File System Access API + a manual
 * folder pick), the app has full filesystem access on every OS: it auto-detects Snapmaker Orca's user
 * filament folder and writes the preset straight in.
 *
 * The profile library is served by bedready.io (the same baked, U1-targeted, Snapmaker-vocabulary-
 * filtered dataset the website uses): GET /orca-filaments/manifest.json + /orca-filaments/profiles/<id>.json.
 * We fetch on demand rather than bundling ~7 MB into the app. Node-only; never loaded in the renderer.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'https://bedready.io';
const MANIFEST_URL = BASE + '/orca-filaments/manifest.json';
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024; // the index is ~0.2 MB; cap defensively
const MAX_PROFILE_BYTES = 2 * 1024 * 1024;  // a single filament preset is a few KB

// Snapmaker Orca's config dir name varies by build ("Snapmaker_Orca" on this macOS install, but guard
// the other spellings). Ordered most-likely first.
const APP_DIR_NAMES = ['Snapmaker_Orca', 'SnapmakerOrca', 'Snapmaker Orca'];

/** Per-OS base dir that holds app config folders. */
function configBase() {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/**
 * Resolve where a filament preset should be written: <config>/<AppDir>/user/<profile>/filament.
 * Returns { dir, appFound }. If Snapmaker Orca isn't installed yet we still return a best-guess default
 * path (so the caller can create it), with appFound=false so the UI can warn.
 */
function resolveFilamentDir() {
  const base = configBase();
  for (const name of APP_DIR_NAMES) {
    const userDir = path.join(base, name, 'user');
    if (!isDir(userDir)) continue;
    // Prefer the "default" profile; otherwise the first real profile folder (skip *_backup* dirs).
    let profile = 'default';
    if (!isDir(path.join(userDir, 'default'))) {
      let subs = [];
      try { subs = fs.readdirSync(userDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { /* unreadable */ }
      profile = subs.find((n) => !/backup/i.test(n)) || subs[0] || 'default';
    }
    return { dir: path.join(userDir, profile, 'filament'), appFound: true };
  }
  return { dir: path.join(base, APP_DIR_NAMES[0], 'user', 'default', 'filament'), appFound: false };
}

/** Turn a preset name into a safe, single-segment filename base (Orca preset names are FS-safe already). */
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

/** GET the filament library index. Returns { machine, vendors[], types[], profiles[] }. */
async function fetchManifest() {
  const m = await getJson(MANIFEST_URL, MAX_MANIFEST_BYTES);
  if (!m || !Array.isArray(m.profiles)) throw new Error('The filament library index looks empty — try again later.');
  return m;
}

/**
 * Install one profile into the Snapmaker Orca filament folder. `item` is a manifest entry: needs
 * `file` (profiles/<id>.json, relayed from the manifest) and `name`. Returns { ok, path }.
 */
async function installProfile(item, targetDir) {
  const file = String((item && item.file) || '');
  const name = (item && item.name) || 'filament';
  // The path comes from our own manifest, but validate defensively — never let it escape the profiles set.
  if (!/^profiles\/[A-Za-z0-9._-]+\.json$/.test(file)) throw new Error('That filament has an invalid file reference.');

  const preset = await getJson(BASE + '/orca-filaments/' + file, MAX_PROFILE_BYTES);
  if (!preset || preset.type !== 'filament' || !preset.name) throw new Error('That filament profile is malformed.');

  const dir = targetDir || resolveFilamentDir().dir;
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, safeFileBase(name) + '.json');
  // Write-then-rename so a half-written file can't corrupt an existing preset.
  const tmp = out + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(preset, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmp, out);
  return { ok: true, path: out };
}

module.exports = { fetchManifest, installProfile, resolveFilamentDir, safeFileBase, configBase, BASE, APP_DIR_NAMES };
