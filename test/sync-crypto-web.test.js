/**
 * Browser decrypt path (lib/sync-crypto-web.js) must be byte-compatible with the
 * desktop encryption (lib/sync-crypto.js). We encrypt with the desktop module,
 * then decrypt with the web module using WebCrypto subtle + Node scrypt as the
 * injected KDF (the PWA will inject scrypt-js with the same params).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sc = require('../lib/sync-crypto.js');
const web = require('../lib/sync-crypto-web.js');

const FAST_KDF = { algo: 'scrypt', N: 1024, r: 8, p: 1, keyLen: 32 };
// Node scrypt as the injected KDF (same params ⇒ same KEK as scrypt-js will give).
const scryptNode = (secretBytes, saltBytes, kdf) =>
  new Uint8Array(crypto.scryptSync(Buffer.from(secretBytes), Buffer.from(saltBytes), kdf.keyLen,
    { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 96 * 1024 * 1024 }));

const STORE = { printLog: [{ id: 'o1', project: 'Vase', price: 120 }], settings: { bizEn: 'Acme' } };

test('web module unlocks the same DEK the desktop wrapped', async () => {
  const { keyset } = sc.createKeyset('correct horse', { kdf: FAST_KDF });
  const desktopDek = sc.unlockWithPassphrase('correct horse', keyset); // Buffer
  const webDek = await web.unlockDek({ keyset, passphrase: 'correct horse', scrypt: scryptNode });
  assert.deepEqual([...webDek], [...desktopDek], 'same DEK bytes across implementations');
});

test('web module decrypts a desktop-encrypted store blob', async () => {
  const { keyset } = sc.createKeyset('s3cret-pass', { kdf: FAST_KDF });
  const dek = sc.unlockWithPassphrase('s3cret-pass', keyset);
  const blob = sc.encryptStore(STORE, dek);

  const webDek = await web.unlockDek({ keyset, passphrase: 's3cret-pass', scrypt: scryptNode });
  const out = await web.decryptStore(blob, webDek);
  assert.deepEqual(out, STORE, 'browser decrypt reproduces the store exactly');
});

test('wrong passphrase fails (GCM auth) in the web path', async () => {
  const { keyset } = sc.createKeyset('right', { kdf: FAST_KDF });
  await assert.rejects(() => web.unlockDek({ keyset, passphrase: 'wrong', scrypt: scryptNode }));
});

test('web ENCRYPT is desktop-readable (phone writes → desktop reads)', async () => {
  const { keyset } = sc.createKeyset('w-pass', { kdf: FAST_KDF });
  const dek = sc.unlockWithPassphrase('w-pass', keyset);
  const edited = { printLog: [{ id: 'o1', status: 'printing', rev: 3 }] };

  // Phone encrypts with WebCrypto…
  const blob = await web.encryptStore(edited, dek);
  assert.ok(blob.v && blob.iv && blob.ct && blob.tag, 'matches the desktop envelope shape');
  // …desktop decrypts it.
  const back = sc.decryptStore(blob, dek);
  assert.deepEqual(back, edited);
});

test('web encrypt → web decrypt round-trips', async () => {
  const { keyset } = sc.createKeyset('rt', { kdf: FAST_KDF });
  const dek = await web.unlockDek({ keyset, passphrase: 'rt', scrypt: scryptNode });
  const blob = await web.encryptStore(STORE, dek);
  assert.deepEqual(await web.decryptStore(blob, dek), STORE);
});

test('tampered store blob is rejected', async () => {
  const { keyset } = sc.createKeyset('p', { kdf: FAST_KDF });
  const dek = sc.unlockWithPassphrase('p', keyset);
  const blob = sc.encryptStore(STORE, dek);
  const webDek = await web.unlockDek({ keyset, passphrase: 'p', scrypt: scryptNode });
  const tampered = { ...blob, ct: blob.ct.slice(0, -4) + (blob.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA') };
  await assert.rejects(() => web.decryptStore(tampered, webDek));
});
