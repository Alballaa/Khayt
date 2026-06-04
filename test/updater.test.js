const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron-updater') {
    const autoUpdater = {
      autoDownload: false,
      autoInstallOnAppQuit: true,
      on() {},
      checkForUpdates: () => ({ catch() {} }),
      downloadUpdate: async () => {},
      quitAndInstall() {},
    };
    return { autoUpdater };
  }
  return origRequire.apply(this, arguments);
};

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { registerUpdater } = require('../lib/updater');

test('write-update-backup copies store file when json is __COPY_STORE__', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-upd-'));
  const storePath = path.join(tmp, 'store.json');
  const backupsPath = path.join(tmp, 'backups');
  fs.mkdirSync(backupsPath);
  fs.writeFileSync(storePath, '{"encrypted":true}', 'utf8');

  const handlers = {};
  const ipcMain = {
    handle: (channel, fn) => { handlers[channel] = fn; },
  };

  registerUpdater({
    app: { isPackaged: false },
    fs,
    ipcMain,
    BrowserWindow: { getAllWindows: () => [] },
    encryptForDisk: (d) => d,
    dataFilePath: () => storePath,
    backupsDir: () => backupsPath,
  });

  const fn = handlers['hub:write-update-backup'];
  assert.ok(fn);
  const res = await fn({}, '__COPY_STORE__', '2.2.3');
  assert.equal(res.ok, true);
  assert.equal(res.copied, true);
  const files = fs.readdirSync(backupsPath);
  assert.equal(files.length, 1);
  assert.match(files[0], /^pre-update-v2\.2\.3-/);
  assert.equal(fs.readFileSync(path.join(backupsPath, files[0]), 'utf8'), '{"encrypted":true}');
});
