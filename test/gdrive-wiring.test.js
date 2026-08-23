/**
 * Drive brings one credential that outranks everything else in the store.
 *
 * A leaked bucket key reaches one bucket. A leaked Drive refresh token reaches
 * every file Khayt ever put in the shop's Google account, and it does not
 * expire on its own. So the first half of this file is store-io's four lists —
 * miss any one and the token sits in the store as plaintext, or is handed to the
 * renderer, or is overwritten by the mask the next time anyone saves an
 * unrelated setting.
 *
 * The second half is the consent flow, where the failures are the quiet kind: a
 * scope widened past drive.file, a redirect anyone on the machine can claim, a
 * missing state check.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const mainJs = read('main.js');
const storeIo = read('lib/store-io.js');
const settingsJs = read('renderer/settings.js');
const wire = read('renderer/wire-events.js');
const preload = read('preload.js');
const html = read('renderer/index.html');
const drive = read('lib/gdrive-client.js');

test('the refresh token is on all four of store-io\'s lists', () => {
  // encryptForDisk / decrypt / mask-for-renderer / merge-from-disk. They are
  // four separate lists and being on three of them is a distinct bug each time.
  assert.match(storeIo, /d\.settings\.printLibrary\.gdrive\[k\] = encryptStoreField\(/,
    'the Drive token is written to the store in plaintext');
  assert.match(storeIo, /data\.settings\.printLibrary\.gdrive\[k\] = decryptStoreField\(/,
    'the token is never decrypted, so the connection silently stops working');
  assert.match(storeIo, /mask\(data\.settings\?\.printLibrary\?\.gdrive, 'refreshToken'\)/,
    'the renderer is handed the real token');
  assert.match(storeIo, /d\?\.settings\?\.printLibrary\?\.gdrive\?\.\[key\]/,
    'saving an unrelated setting writes the mask over the token and disconnects Drive');
  assert.match(storeIo, /needs\(s\.printLibrary\?\.gdrive\?\.\[k\]\)/,
    'a plaintext Drive token is not counted as one worth warning about');
});

test('the client secret is protected the same way', () => {
  assert.match(storeIo, /\['refreshToken', 'clientSecret'\]/, 'the client secret is not on the lists');
  assert.match(storeIo, /mask\(data\.settings\?\.printLibrary\?\.gdrive, 'clientSecret'\)/);
});

test('the scope stays drive.file', () => {
  // Widening it hands over the shop's whole Drive and pulls the project into
  // Google's restricted-scope programme, which bills an annual assessment.
  assert.match(drive, /const SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/drive\.file';/);
  const wider = /auth\/drive['"]|auth\/drive\.readonly|drive\.appdata/.exec(drive);
  assert.equal(wider, null, `a wider Drive scope appears in the client: ${wider && wider[0]}`);
});

test('consent opens in the real browser, never an embedded window', () => {
  // Google blocks embedded webviews, and the reason is sound: the app hosting
  // the window can read what is typed into it.
  const at = mainJs.indexOf('function gdriveAuthorize(');
  const body = mainJs.slice(at, at + 5000);
  assert.match(body, /shell\.openExternal\(/, 'the consent screen is not opened externally');
  assert.doesNotMatch(body, /new BrowserWindow|webContents\.loadURL/, 'consent is being hosted inside the app');
});

test('the loopback listener is bound to localhost only', () => {
  // Bound to 0.0.0.0 it would accept a redirect from anywhere on the network.
  const at = mainJs.indexOf('function gdriveAuthorize(');
  const body = mainJs.slice(at, at + 5000);
  assert.match(body, /server\.listen\(0, '127\.0\.0\.1'/, 'the sign-in listener is not confined to this machine');
  assert.match(body, /http:\/\/127\.0\.0\.1:\$\{server\.address\(\)\.port\}/,
    'localhost can resolve to ::1, which Google will not match as a redirect_uri');
});

test('the redirect is bound to the attempt that started it', () => {
  const at = mainJs.indexOf('function gdriveAuthorize(');
  const body = mainJs.slice(at, at + 5000);
  assert.match(body, /crypto\.timingSafeEqual/, 'the state is compared without constant time');
  // The state must be checked BEFORE the code is spent, or a mismatched code has
  // already been redeemed by the time it is rejected.
  const stateAt = body.indexOf('timingSafeEqual');
  const exchangeAt = body.indexOf('GD.exchangeCode');
  assert.ok(stateAt > -1 && exchangeAt > stateAt, 'the code is exchanged before the state is verified');
});

test('the token never takes its own route to disk', () => {
  // It is handed back to the renderer and saved through the ordinary settings
  // path, so store-io encrypts it like every other credential.
  const at = mainJs.indexOf("ipcMain.handle('hub:gdrive-connect'");
  const body = mainJs.slice(at, at + 1200);
  assert.match(body, /return \{ ok: true, refreshToken: r\.refreshToken \}/);
  assert.doesNotMatch(body, /writeFile|saveStore/, 'main is writing the token to disk on its own');
  assert.match(settingsJs, /savePrintLibGDrive\(\{ refreshToken: r\.refreshToken/,
    'the renderer never saves what the flow returned');
});

test('two consent flows cannot run at once', () => {
  assert.match(mainJs, /let gdriveConnecting = false;/);
  const at = mainJs.indexOf("ipcMain.handle('hub:gdrive-connect'");
  assert.match(mainJs.slice(at, at + 300), /if \(gdriveConnecting\)/,
    'two open consent screens race to write the same token');
});

test('the flow gives up rather than sitting open forever', () => {
  assert.match(mainJs, /GDRIVE_AUTH_TIMEOUT_MS/, 'an abandoned sign-in leaves a listener running');
});

test('status is a real round trip, not a look at the settings file', () => {
  // A revoked grant is indistinguishable from a working one on disk.
  const at = mainJs.indexOf("ipcMain.handle('hub:gdrive-status'");
  const body = mainJs.slice(at, at + 700);
  assert.match(body, /\.about\(\)/, 'connection status is reported without asking Drive');
});

test('Drive and S3 are interchangeable to everything downstream', () => {
  // The reason gdrive-client bothers to imitate the S3 client's head() shape.
  assert.match(mainJs, /function printLibRemote\(\)/, 'there is no shared backend seam');
  assert.match(mainJs, /return printLibS3\(\) \|\| printLibDrive\(\);/);
  for (const site of ['async function printLibMirrorFile(', 'async function printLibRehydrate(']) {
    const at = mainJs.indexOf(site);
    assert.ok(at > -1, `${site} went missing`);
    assert.match(mainJs.slice(at, at + 2500), /printLibRemote\(\)/,
      `${site} is hard-wired to S3, so Drive silently does nothing there`);
  }
});

test('the Drive controls are wired and exported', () => {
  for (const [id, fn] of [
    ['btnPlibGDSave', 'savePrintLibGDrive'],
    ['btnPlibGDConnect', 'connectPrintLibGDrive'],
    ['btnPlibGDDisconnect', 'disconnectPrintLibGDrive'],
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} is not in the page`);
    assert.ok(wire.includes(fn), `${id} is wired to nothing`);
    assert.match(settingsJs, new RegExp(`^\\s{4}${fn},`, 'm'), `${fn} is private to its IIFE`);
  }
  assert.match(preload, /gdriveConnect:/);
  assert.match(preload, /gdriveStatus:/);
});

test('the secret field is a password field and is never pre-filled', () => {
  assert.match(html, /id="set_plibGDSecret" autocomplete="new-password"/);
  const at = settingsJs.indexOf('async function renderPrintLibGDrive(');
  const body = settingsJs.slice(at, at + 1500);
  assert.match(body, /sec\.value = '';/, 'the client secret is rendered back into the page');
  assert.match(body, /secretFieldPlaceholder\(cfg\.clientSecret\)/);
});

test('disconnecting warns about models that only exist in Drive', () => {
  // Otherwise the shop turns it off and their tiered library stops opening, with
  // no connection drawn between the two.
  const at = settingsJs.indexOf('function disconnectPrintLibGDrive(');
  const body = settingsJs.slice(at, at + 900);
  assert.match(body, /confirm\(/);
  assert.match(body, /bring them back first/i, 'the warning does not mention tiered models');
});

test('the Drive section is translated everywhere', () => {
  const keys = [...html.matchAll(/data-i18n="(set\.plib_gd[^"]*)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 5, 'the Drive UI is not marked for translation');
  for (const lang of ['en', 'ar', 'de', 'es', 'fr', 'ja', 'pt-BR', 'tr', 'zh']) {
    const src = read(`renderer/locales/${lang}.js`);
    for (const k of keys) assert.ok(src.includes(`"${k}"`), `${lang} is missing ${k}`);
  }
});
