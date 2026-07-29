const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron-updater') {
    const autoUpdater = {
      autoDownload: false,
      autoInstallOnAppQuit: true,
      allowPrerelease: false,
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
const {
  registerUpdater,
  applyUpdateOptions,
  isVersionNewer,
  isPrereleaseVersion,
  interpretUpdateCheckResult,
  canSelfUpdate,
} = require('../lib/updater');

test('isVersionNewer compares dotted versions', () => {
  assert.equal(isVersionNewer('2.3.2', '2.3.1'), true);
  assert.equal(isVersionNewer('2.3.1', '2.3.2'), false);
  assert.equal(isVersionNewer('2.3.1', '2.3.1'), false);
});

test('isVersionNewer treats a stable release as newer than its prerelease', () => {
  // The beta→stable graduation: a 2.4.0-beta.2 user must be offered final 2.4.0.
  assert.equal(isVersionNewer('2.4.0', '2.4.0-beta.2'), true);
  assert.equal(isVersionNewer('2.4.0-beta.2', '2.4.0'), false);
  // Prerelease ordering within the same number.
  assert.equal(isVersionNewer('2.4.0-beta.2', '2.4.0-beta.1'), true);
  assert.equal(isVersionNewer('2.4.0-beta.1', '2.4.0-beta.2'), false);
  assert.equal(isVersionNewer('2.4.0-rc.1', '2.4.0-beta.9'), true);
  // A newer number still wins regardless of prerelease tags.
  assert.equal(isVersionNewer('2.4.1', '2.4.0-beta.2'), true);
  assert.equal(isVersionNewer('2.4.0-beta.1', '2.4.0-beta.1'), false);
});

test('isPrereleaseVersion detects beta, rc, and alpha tags', () => {
  assert.equal(isPrereleaseVersion('2.4.0-beta.1'), true);
  assert.equal(isPrereleaseVersion('2.4.0-rc.1'), true);
  assert.equal(isPrereleaseVersion('2.3.2'), false);
});

test('interpretUpdateCheckResult ignores prerelease offers unless allowBeta', () => {
  const blocked = interpretUpdateCheckResult({
    isPackaged: true,
    currentVersion: '2.3.2',
    updateInfo: { version: '2.4.0-beta.1' },
    allowBeta: false,
  });
  assert.equal(blocked.status, 'not-available');
  assert.equal(blocked.latestVersion, '2.3.2');

  const allowed = interpretUpdateCheckResult({
    isPackaged: true,
    currentVersion: '2.3.2',
    updateInfo: { version: '2.4.0-beta.1' },
    allowBeta: true,
  });
  assert.equal(allowed.status, 'available');
  assert.equal(allowed.version, '2.4.0-beta.1');
});

test('applyUpdateOptions stores allowBeta preference', () => {
  assert.deepEqual(applyUpdateOptions({ allowBeta: false }), { allowBeta: false });
  assert.deepEqual(applyUpdateOptions({ allowBeta: true }), { allowBeta: true });
});

test('interpretUpdateCheckResult handles dev, available, and up to date', () => {
  assert.equal(
    interpretUpdateCheckResult({ isPackaged: false, currentVersion: '2.3.2' }).status,
    'dev',
  );
  const available = interpretUpdateCheckResult({
    isPackaged: true,
    currentVersion: '2.3.1',
    updateInfo: { version: '2.3.2', releaseNotes: '- Bug fix', releaseDate: '2026-06-05' },
  });
  assert.equal(available.status, 'available');
  assert.equal(available.version, '2.3.2');
  assert.equal(available.releaseNotes, '- Bug fix');
  assert.equal(
    interpretUpdateCheckResult({
      isPackaged: true,
      currentVersion: '2.3.2',
      updateInfo: { version: '2.3.2' },
    }).status,
    'not-available',
  );
});

test('interpretUpdateCheckResult never offers a downgrade (guards the auto update-available gate)', () => {
  // Running a prerelease; /releases/latest resolves to an OLDER stable → must NOT offer it,
  // even with beta updates enabled. This is what the gated auto event relies on.
  assert.equal(
    interpretUpdateCheckResult({
      isPackaged: true,
      currentVersion: '3.1.0-beta.3',
      updateInfo: { version: '3.0.0' },
      allowBeta: true,
    }).status,
    'not-available',
  );
  // Same number, older prerelease offered while on a newer prerelease → not an update.
  assert.equal(
    interpretUpdateCheckResult({
      isPackaged: true,
      currentVersion: '3.1.0-beta.3',
      updateInfo: { version: '3.1.0-beta.2' },
      allowBeta: true,
    }).status,
    'not-available',
  );
  // A genuinely newer prerelease with beta on → available.
  assert.equal(
    interpretUpdateCheckResult({
      isPackaged: true,
      currentVersion: '3.1.0-beta.3',
      updateInfo: { version: '3.1.0-beta.4' },
      allowBeta: true,
    }).status,
    'available',
  );
});

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
    app: { isPackaged: false, getVersion: () => '2.3.2' },
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

/**
 * Linux installs that cannot replace themselves.
 *
 * electron-updater only updates AppImage on Linux — it detects that via the
 * APPIMAGE environment variable and declines otherwise. A .deb install therefore
 * gets a check that succeeds with NO updateInfo, which fell through to
 * "not-available": the app told the user they were on the latest version while a
 * newer one existed.
 *
 * That was unreachable while no latest-linux.yml was ever published — the check
 * failed earlier, for a different reason. Publishing the manifest (so AppImage
 * users can finally update at all) is exactly what made it reachable, which is
 * why the two changes belong together.
 */
test('a .deb install is told to download, not that it is up to date', () => {
  const r = interpretUpdateCheckResult({
    isPackaged: true,
    currentVersion: '3.4.0',
    updateInfo: undefined,      // what an inactive updater returns
    selfUpdatable: false,
  });
  assert.equal(r.status, 'manual', 'must not claim "not-available"');
  assert.match(r.message, /cannot update itself/i);
  assert.ok(r.releasesUrl, 'and must say where to get it');
});

test('an install that CAN self-update is unaffected', () => {
  const r = interpretUpdateCheckResult({
    isPackaged: true,
    currentVersion: '3.3.0',
    updateInfo: { version: '3.4.0' },
    selfUpdatable: true,
  });
  assert.equal(r.status, 'available');
  assert.equal(r.version, '3.4.0');
});

test('selfUpdatable defaults to true, so existing callers are unchanged', () => {
  const r = interpretUpdateCheckResult({
    isPackaged: true, currentVersion: '3.3.0', updateInfo: { version: '3.4.0' },
  });
  assert.equal(r.status, 'available');
});

test('the unpackaged dev message still wins over the manual one', () => {
  // Running from source is not a .deb problem, and saying "download the latest
  // version" to someone with the repo open would be nonsense.
  const r = interpretUpdateCheckResult({
    isPackaged: false, currentVersion: '3.4.0', selfUpdatable: false,
  });
  assert.equal(r.status, 'dev');
});

test('canSelfUpdate: only Linux without AppImage or Snap is excluded', () => {
  assert.equal(canSelfUpdate('darwin', {}), true, 'macOS always can');
  assert.equal(canSelfUpdate('win32', {}), true, 'Windows always can');
  assert.equal(canSelfUpdate('linux', { APPIMAGE: '/opt/Khayt.AppImage' }), true, 'AppImage can');
  assert.equal(canSelfUpdate('linux', { SNAP: '/snap/khayt' }), true, 'Snap updates itself via the store');
  assert.equal(canSelfUpdate('linux', {}), false, 'a .deb cannot');
});
