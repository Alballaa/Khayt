/**
 * A bucket as a backup target, on the seam the folder mirror already uses.
 *
 * Two failure modes here are silent and expensive, so both are pinned:
 *
 *   1. The credential. A secret that is not on every one of store-io's four
 *      lists is a secret that sits in the store as plaintext, or gets handed to
 *      the renderer, or gets overwritten with the mask the next time anyone
 *      saves an unrelated setting. The store is the file people copy around.
 *   2. Reading from the backup. A backup you read from is a second primary, and
 *      the two drift. Nothing on the read path may know the bucket exists.
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

test('the secret is encrypted on disk, and decrypted coming back', () => {
  assert.match(storeIo, /d\.settings\.printLibrary\.s3\.secretAccessKey = encryptStoreField\(/,
    'the bucket secret is written to the store in plaintext');
  assert.match(storeIo, /data\.settings\.printLibrary\.s3\.secretAccessKey = decryptStoreField\(/,
    'encrypted on the way in but never decrypted — the credential would be unusable');
});

test('the renderer is handed a mask, never the secret', () => {
  assert.match(storeIo, /mask\(data\.settings\?\.printLibrary\?\.s3, 'secretAccessKey'\)/,
    'the real bucket key is sent to the renderer');
  assert.match(settingsJs, /sec\.value = ''/, 'settings.js renders the secret back into the DOM');
});

test('saving any other setting cannot wipe the credential', () => {
  // The renderer holds a mask. Without the merge-back, saving the settings page
  // writes that mask over the real key on disk, and the next upload fails with
  // a credential nobody knowingly changed.
  // Scoped to mergeStoreSecretsFromDisk: the same path expression appears in
  // encryptForDisk, so a whole-file match cannot tell the merge-back is gone.
  const at = storeIo.indexOf('function mergeStoreSecretsFromDisk(');
  assert.ok(at > -1, 'mergeStoreSecretsFromDisk went missing');
  const merge = storeIo.slice(at, storeIo.indexOf('\n  function ', at + 10));
  assert.match(merge, /printLibrary\?\.s3\?\.secretAccessKey/,
    'mergeStoreSecretsFromDisk does not restore the bucket secret — saving the page would write the mask over it');
  assert.match(settingsJs, /secretAccessKey: secretInputSave\(cur\.secretAccessKey/,
    'an empty secret field clears the stored key instead of keeping it');
});

test('a plaintext secret still counts as one worth warning about', () => {
  assert.match(storeIo, /needs\(s\.printLibrary\?\.s3\?\.secretAccessKey\)/,
    'the keychain explanation would not mention a bucket key sitting in the clear');
});

test('no read path reaches into the bucket on its own', () => {
  // The rule needed restating when tiering landed, because read paths now DO
  // fetch from the cloud — and a test that still said "never" would have passed
  // for the wrong reason, on the indirection alone.
  //
  // The rule was never "the read path is offline". It is that a read path must
  // not decide for itself what the bucket is for. Mirroring and tiering write
  // the same key for opposite reasons — one is a spare copy that must never be
  // served, the other IS the file — and only printLibRehydrate() knows which
  // case it is looking at, because only it checks for a sidecar first. A handler
  // that called printLibS3() directly would happily serve the mirror of a file
  // the shop deleted.
  const s3Uses = [...mainJs.matchAll(/printLibS3\(\)/g)].length;
  assert.ok(s3Uses >= 1, 'the bucket is never consulted at all');
  for (const readHandler of ['printlib-list', 'printlib-read-bytes', 'printlib-load-image', 'printlib-mesh']) {
    const at = mainJs.indexOf(`ipcMain.handle('hub:${readHandler}'`);
    assert.ok(at > -1, `${readHandler} went missing`);
    const body = mainJs.slice(at, at + 900);
    assert.doesNotMatch(body, /printLibS3\(|S3C\./,
      `${readHandler} goes to the bucket itself instead of through printLibRehydrate()`);
  }
});

test('the upload happens after the primary write, and cannot fail it', () => {
  const at = mainJs.indexOf('async function printLibMirrorFile(');
  const body = mainJs.slice(at, at + 1800);
  assert.match(body, /out\.s3 = true;/, 'the bucket result is never recorded');
  assert.match(body, /catch \(e\) \{[\s\S]{0,120}out\.s3 = false;/,
    'an upload that throws would take the save down with it');
  // Read as bytes, not text: a string round trip corrupts a 3MF silently.
  assert.match(body, /fs\.promises\.readFile\(srcPath\)/, 'the file is not read as a Buffer before upload');
});

test('a half-configured bucket is not used', () => {
  const at = mainJs.indexOf('function printLibS3()');
  const body = mainJs.slice(at, at + 400);
  assert.match(body, /cfg\.enabled/, 'the bucket is used even when the shop switched it off');
  assert.match(body, /S3C\.isConfigured\(cfg\)/, 'a bucket missing its key would be attempted on every save');
});

test('the connection test proves a round trip, not just a reachable host', () => {
  // Credentials that look right and a bucket that refuses writes are
  // indistinguishable until the first model fails to upload.
  const at = mainJs.indexOf("ipcMain.handle('hub:printlib-s3-test'");
  const body = mainJs.slice(at, at + 1200);
  for (const step of [/s3\.put\(/, /s3\.get\(/, /s3\.del\(/]) {
    assert.match(body, step, `the test does not ${String(step)} — it cannot prove the bucket works`);
  }
  assert.match(body, /equals\(payload\)/, 'the test never compares what came back');
});

test('the test button and save button are wired to functions that exist', () => {
  for (const [id, fn] of [['btnPlibS3Save', 'savePrintLibS3'], ['btnPlibS3Test', 'testPrintLibS3']]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} is not in the markup`);
    assert.match(wire, new RegExp(`#${id}'\\)\\?\\.addEventListener`), `${id} has no listener — a dead button`);
    assert.match(settingsJs, new RegExp(`function ${fn}\\(`), `${fn} is not defined`);
    const api = settingsJs.slice(settingsJs.indexOf('const api = {'), settingsJs.indexOf('const api = {') + 700);
    assert.match(api, new RegExp(`\\b${fn},`), `${fn} is not exported — its button does nothing`);
  }
  assert.match(preload, /printLibS3Test:\s+\(\)\s+=> ipcRenderer\.invoke\('hub:printlib-s3-test'\)/);
});

test('the secret field is a password field, and never pre-filled', () => {
  assert.match(html, /id="set_plibS3Secret"[^>]*type="password"|type="password"[^>]*id="set_plibS3Secret"/,
    'the bucket secret is shown in the clear on screen');
});

test('the section is translated everywhere', () => {
  for (const code of ['en', 'ar', 'de', 'es', 'fr', 'ja', 'pt-BR', 'tr', 'zh']) {
    const loc = read(`renderer/locales/${code}.js`);
    for (const k of ['set.plib_s3_on', 'set.plib_s3_hint', 'set.plib_s3_test', 'set.plib_s3_ok']) {
      assert.ok(loc.includes(`"${k}":`), `${code} is missing ${k}`);
    }
  }
});
