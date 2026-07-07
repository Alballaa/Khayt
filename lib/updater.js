'use strict';

const path = require('path');
const { autoUpdater } = require('electron-updater');
const { safeJsonParse } = require('./safe-json');
const { formatReleaseNotesForDisplay } = require('./release-notes');
const { normalizeStoreSnapshot } = require('./store-validate');
const { isBedReady, productName } = require('./flavor');

// Bed Ready ships from this same repo but on its OWN release lane: the public
// KhaytApp/bedready repo (wired as the `publish` provider in
// electron-builder.bedready.js, so app-update.yml points there — NOT at Khayt's
// feed). The manual "get the latest build" link points at that repo's releases.
const RELEASES_URL = isBedReady
  ? 'https://github.com/KhaytApp/bedready/releases/latest'
  : 'https://github.com/khaytapp/Khayt/releases/latest';

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
// Never auto-offer an older release as an "update" (electron-updater can emit a
// downgrade when the running build is a prerelease and /releases/latest is stable).
autoUpdater.allowDowngrade = false;

/** @param {string} v */
function isPrereleaseVersion(v) {
  return /-(alpha|beta|rc)(\.|$)/i.test(String(v || ''));
}

/** @param {string} v */
function versionParts(v) {
  return String(v || '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
}

/** Prerelease tag after the first '-', or '' for a stable release. */
function prereleaseTag(v) {
  const s = String(v || '');
  const i = s.indexOf('-');
  return i < 0 ? '' : s.slice(i + 1);
}

/** Semver prerelease precedence: returns >0 if `a` is higher, <0 if lower, 0 if equal. */
function comparePrerelease(a, b) {
  if (a === b) return 0;
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1; // shorter set of identifiers is lower precedence
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = parseInt(x, 10) - parseInt(y, 10);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1; // numeric identifiers rank lower than alphanumeric
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * True when `latest` is strictly greater than `current` (semver-aware).
 * Numeric parts compare first; on a tie a stable release outranks any
 * prerelease of the same number (e.g. 2.4.0 > 2.4.0-beta.2 > 2.4.0-beta.1).
 */
function isVersionNewer(latest, current) {
  const a = versionParts(latest);
  const b = versionParts(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  // Numeric parts equal — compare prerelease precedence.
  const pa = prereleaseTag(latest);
  const pb = prereleaseTag(current);
  if (pa === pb) return false;
  if (!pa) return true;   // latest is the stable release of the same number → newer
  if (!pb) return false;  // latest is a prerelease of an already-released number → not newer
  return comparePrerelease(pa, pb) > 0;
}

/**
 * @param {{ isPackaged: boolean, currentVersion: string, updateInfo?: { version?: string }, error?: unknown, allowBeta?: boolean }} input
 */
function interpretUpdateCheckResult({ isPackaged, currentVersion, updateInfo, error, allowBeta = false }) {
  if (!isPackaged) {
    return {
      status: 'dev',
      currentVersion,
      releasesUrl: RELEASES_URL,
      message: isBedReady
        ? `In-app updates work in the installed Bed Ready app. Get the latest build at ${RELEASES_URL}.`
        : 'In-app updates work in the installed Khayt app. Download the latest release from GitHub, or build/install the DMG.',
    };
  }
  if (error) {
    const message = String(error?.message || error || 'Update check failed');
    return { status: 'error', currentVersion, message };
  }
  const latest = updateInfo?.version;
  if (latest && !allowBeta && isPrereleaseVersion(latest)) {
    return {
      status: 'not-available',
      currentVersion,
      latestVersion: currentVersion,
    };
  }
  if (latest && isVersionNewer(latest, currentVersion)) {
    const releaseNotes = typeof updateInfo?.releaseNotes === 'string'
      ? updateInfo.releaseNotes
      : '';
    return {
      status: 'available',
      currentVersion,
      version: latest,
      releaseDate: updateInfo?.releaseDate || null,
      releaseNotes,
    };
  }
  return {
    status: 'not-available',
    currentVersion,
    latestVersion: latest || currentVersion,
  };
}

/**
 * Auto-updater event wiring and hub:*-update* IPC handlers.
 * @param {{ app: import('electron').App, fs: typeof import('fs'), ipcMain: import('electron').IpcMain, BrowserWindow: typeof import('electron').BrowserWindow, encryptForDisk: Function, dataFilePath: () => string, backupsDir: () => string }} deps
 */
/** @type {{ allowBeta: boolean }} */
let updatePrefs = { allowBeta: false };

/** @param {{ allowBeta?: boolean }} opts */
function applyUpdateOptions(opts = {}) {
  if (typeof opts.allowBeta === 'boolean') {
    updatePrefs.allowBeta = opts.allowBeta;
  }
  autoUpdater.allowPrerelease = updatePrefs.allowBeta;
  return { ...updatePrefs };
}

function registerUpdater({ app, fs, ipcMain, BrowserWindow, encryptForDisk, dataFilePath, backupsDir }) {
  // Bed Ready ships only on its beta line (1.0.0-beta.*), so it must accept
  // prerelease versions as updates by default — otherwise every beta→beta update
  // would be filtered out as "prerelease not allowed" and it would never update.
  // Khayt defaults to the stable channel (allowBeta off).
  applyUpdateOptions({ allowBeta: isBedReady });

  function setupAutoUpdater(win) {
    autoUpdater.on('update-available', (info) => {
      if (!win || win.isDestroyed()) return;
      // Gate the automatic event through the SAME logic as the manual check so the
      // update modal only auto-pops for a genuinely newer, allowed release. Without
      // this, electron-updater's raw event can prompt a beta when beta updates are
      // off, or even offer a downgrade — the "glitchy" repeated/incorrect prompts.
      const interpreted = interpretUpdateCheckResult({
        isPackaged: true,
        currentVersion: app.getVersion(),
        updateInfo: info,
        allowBeta: updatePrefs.allowBeta,
      });
      if (interpreted.status !== 'available') return;
      win.webContents.send('update-available', {
        version:      info.version,
        releaseDate:  info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('update-not-available', {
        version: info.version,
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('update-download-progress', {
        percent:        Math.round(progress.percent),
        transferred:    progress.transferred,
        total:          progress.total,
        bytesPerSecond: progress.bytesPerSecond
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      if (!win || win.isDestroyed()) return;
      win.webContents.send('update-downloaded', { version: info.version });
    });

    autoUpdater.on('error', (err) => {
      console.error('[updater]', err?.message || err);
      if (!win || win.isDestroyed()) return;
      win.webContents.send('update-error', { message: String(err?.message || err || 'Unknown update error') });
    });

    // Poll once shortly after boot. Both flavors have a publish feed baked in
    // (Khayt → KhaytApp/Khayt, Bed Ready → KhaytApp/bedready via app-update.yml),
    // so each checks its OWN release lane.
    if (app.isPackaged) {
      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 12_000);
    }
  }

  ipcMain.handle('hub:start-update-download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      const message = String(err?.message || err || 'Download failed');
      console.error('[updater] downloadUpdate failed:', message);
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send('update-error', { message });
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('hub:install-update', async (_e, storeSnapshot) => {
    // Renderer should flush via hub:save-store before calling this. Re-writing the full
    // snapshot here duplicated encrypt+write and could hang the UI on large stores.
    if (storeSnapshot && typeof storeSnapshot === 'object' && storeSnapshot.__forceFlush) {
      try {
        const draft = { ...storeSnapshot };
        delete draft.__forceFlush;
        const { normalized, errors } = normalizeStoreSnapshot(draft);
        if (errors?.length) {
          console.error('[update] flush-save skipped: invalid snapshot', errors);
        } else {
          const serialized = JSON.stringify(encryptForDisk(normalized));
          if (serialized.length <= 50_000_000) {
            const fp  = dataFilePath();
            const tmp = fp + '.tmp';
            await fs.promises.writeFile(tmp, serialized, 'utf8');
            await fs.promises.rename(tmp, fp);
          } else {
            console.error('[update] flush-save skipped: snapshot exceeds 50 MB');
          }
        }
      } catch (e) {
        console.error('[update] flush-save failed:', e?.message);
      }
    }
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 150);
  });

  ipcMain.handle('hub:set-update-options', async (_e, opts) => {
    return { ok: true, ...applyUpdateOptions(opts || {}) };
  });

  ipcMain.handle('hub:check-for-updates', async () => {
    const currentVersion = app.getVersion();
    if (!app.isPackaged) {
      return interpretUpdateCheckResult({ isPackaged: false, currentVersion });
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      const interpreted = interpretUpdateCheckResult({
        isPackaged: true,
        currentVersion,
        updateInfo: result?.updateInfo,
        allowBeta: updatePrefs.allowBeta,
      });
      if (interpreted.status === 'error') {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send('update-error', { message: interpreted.message });
        }
      }
      return interpreted;
    } catch (err) {
      console.error('[updater] checkForUpdates failed:', err?.message || err);
      const interpreted = interpretUpdateCheckResult({
        isPackaged: true,
        currentVersion,
        error: err,
      });
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('update-error', { message: interpreted.message });
      }
      return interpreted;
    }
  });

  ipcMain.handle('hub:format-release-notes', (_e, releaseNotes, opts) =>
    formatReleaseNotesForDisplay(releaseNotes, opts || {}));

  ipcMain.handle('hub:write-update-backup', async (_e, jsonString, newVersion) => {
    const safeVer  = String(newVersion || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '');
    const dateStr  = new Date().toISOString().split('T')[0];
    const filename = `pre-update-v${safeVer}-${dateStr}.json`;
    const fullPath = path.join(backupsDir(), filename);
    const storePath = dataFilePath();

    // Fast path: copy the on-disk store (already encrypted) — avoids multi‑MB IPC + re-encrypt.
    if (!jsonString || jsonString === '__COPY_STORE__') {
      try {
        if (!fs.existsSync(storePath)) return { ok: false, error: 'no store file' };
        await fs.promises.copyFile(storePath, fullPath);
        return { ok: true, path: fullPath, copied: true };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    }

    if (typeof jsonString !== 'string' || jsonString.length > 20_000_000) {
      return { ok: false, error: 'invalid' };
    }
    let parsed;
    try { parsed = safeJsonParse(jsonString); } catch { return { ok: false, error: 'bad json' }; }
    try {
      await fs.promises.writeFile(fullPath, JSON.stringify(encryptForDisk(parsed)), 'utf8');
      return { ok: true, path: fullPath };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  return { setupAutoUpdater };
}

module.exports = {
  registerUpdater,
  applyUpdateOptions,
  isVersionNewer,
  isPrereleaseVersion,
  interpretUpdateCheckResult,
  RELEASES_URL,
};
