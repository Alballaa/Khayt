'use strict';

const path = require('path');
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

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
    if (storeSnapshot && typeof storeSnapshot === 'object') {
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
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 250);
  });

  ipcMain.handle('hub:check-for-updates', () => autoUpdater.checkForUpdates().catch(() => {}));

  ipcMain.handle('hub:write-update-backup', async (_e, jsonString, newVersion) => {
    if (!jsonString || typeof jsonString !== 'string' || jsonString.length > 20_000_000) {
      return { ok: false, error: 'invalid' };
    }
    let parsed;
    try { parsed = JSON.parse(jsonString); } catch { return { ok: false, error: 'bad json' }; }
    const safeVer  = String(newVersion || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '');
    const dateStr  = new Date().toISOString().split('T')[0];
    const filename = `pre-update-v${safeVer}-${dateStr}.json`;
    const fullPath = path.join(backupsDir(), filename);
    try {
      await fs.promises.writeFile(fullPath, JSON.stringify(encryptForDisk(parsed)), 'utf8');
      return { ok: true, path: fullPath };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  return { setupAutoUpdater };
}

module.exports = { registerUpdater };
