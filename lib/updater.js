'use strict';

const path = require('path');
const { autoUpdater } = require('electron-updater');
const { safeJsonParse } = require('./safe-json');
const { formatReleaseNotesForDisplay } = require('./release-notes');

const RELEASES_URL = 'https://github.com/Alballaa/Khayt/releases/latest';

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

/** @param {string} v */
function versionParts(v) {
  return String(v || '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
}

/** True when `latest` is strictly greater than `current` (semver-ish, pre-release stripped). */
function isVersionNewer(latest, current) {
  const a = versionParts(latest);
  const b = versionParts(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

/**
 * @param {{ isPackaged: boolean, currentVersion: string, updateInfo?: { version?: string }, error?: unknown }} input
 */
function interpretUpdateCheckResult({ isPackaged, currentVersion, updateInfo, error }) {
  if (!isPackaged) {
    return {
      status: 'dev',
      currentVersion,
      releasesUrl: RELEASES_URL,
      message:
        'In-app updates work in the installed Khayt app. Download the latest release from GitHub, or build/install the DMG.',
    };
  }
  if (error) {
    const message = String(error?.message || error || 'Update check failed');
    return { status: 'error', currentVersion, message };
  }
  const latest = updateInfo?.version;
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
function registerUpdater({ app, fs, ipcMain, BrowserWindow, encryptForDisk, dataFilePath, backupsDir }) {
  function setupAutoUpdater(win) {
    autoUpdater.on('update-available', (info) => {
      if (!win || win.isDestroyed()) return;
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
        const serialized = JSON.stringify(encryptForDisk(storeSnapshot));
        if (serialized.length <= 50_000_000) {
          const fp  = dataFilePath();
          const tmp = fp + '.tmp';
          await fs.promises.writeFile(tmp, serialized, 'utf8');
          await fs.promises.rename(tmp, fp);
        } else {
          console.error('[update] flush-save skipped: snapshot exceeds 50 MB');
        }
      } catch (e) {
        console.error('[update] flush-save failed:', e?.message);
      }
    }
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 150);
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

module.exports = { registerUpdater, isVersionNewer, interpretUpdateCheckResult, RELEASES_URL };
