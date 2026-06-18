/**
 * Phase 1 E2E crypto tests. See docs/KHAYT-3.0-PHASE1-SPEC.md §3 / §11 and
 * docs/KHAYT-3.0-SECURITY-MODEL.md §4. Pure crypto — no network, no DOM.
 *
 * Uses low scrypt cost (FAST_KDF) so the suite stays quick; production keysets
 * carry their own params, so this only affects test speed, not the contract.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sc = require('../lib/sync-crypto.js');

const FAST_KDF = { algo: 'scrypt', N: 1024, r: 8, p: 1, keyLen: 32 };
const mk = (pass) => sc.createKeyset(pass, { kdf: FAST_KDF });
const STORE = { printLog: [{ id: 'o1', price: 100 }], clients: [{ id: 'c1', name: 'سارة' }] };

test('round-trip: passphrase unlocks the DEK and the store decrypts equal', () => {
  const { keyset } = mk('correct horse battery');
  const dek = sc.unlockWithPassphrase('correct horse battery', keyset);
  const blob = sc.encryptStore(STORE, dek);
  assert.deepEqual(sc.decryptStore(blob, dek), STORE);
});

test('recovery key unlocks the same DEK (Arabic content survives the round-trip)', () => {
  const { keyset, recoveryKey } = mk('pass-1');
  const dekP = sc.unlockWithPassphrase('pass-1', keyset);
  const dekR = sc.unlockWithRecovery(recoveryKey, keyset);
  assert.deepEqual(dekP, dekR, 'both paths recover the identical DEK');
  const blob = sc.encryptStore(STORE, dekP);
  assert.equal(sc.decryptStore(blob, dekR).clients[0].name, 'سارة');
});

test('wrong passphrase throws (GCM auth tag is the wrong-secret check)', () => {
  const { keyset } = mk('right');
  assert.throws(() => sc.unlockWithPassphrase('wrong', keyset));
});

test('wrong recovery key throws', () => {
  const { keyset } = mk('p');
  assert.throws(() => sc.unlockWithRecovery('AAAA-BBBB-CCCC-DDDD', keyset));
});

test('decrypting a store blob with the wrong DEK throws', () => {
  const a = mk('a'); const b = mk('b');
  const dekA = sc.unlockWithPassphrase('a', a.keyset);
  const dekB = sc.unlockWithPassphrase('b', b.keyset);
  const blob = sc.encryptStore(STORE, dekA);
  assert.throws(() => sc.decryptStore(blob, dekB));
});

test('tampering with ciphertext is detected (authenticated encryption)', () => {
  const { keyset } = mk('p');
  const dek = sc.unlockWithPassphrase('p', keyset);
  const blob = sc.encryptStore(STORE, dek);
  const ctBuf = Buffer.from(blob.ct, 'base64'); ctBuf[0] ^= 0x01;        // flip a bit
  const tampered = { ...blob, ct: ctBuf.toString('base64') };
  assert.throws(() => sc.decryptStore(tampered, dek));
});

test('changePassphrase: old fails, new works, recovery still works, blob still decrypts', () => {
  const { keyset, recoveryKey } = mk('old-pass');
  const dek0 = sc.unlockWithPassphrase('old-pass', keyset);
  const blob = sc.encryptStore(STORE, dek0);          // encrypted under the original DEK
  const rotated = sc.changePassphrase(keyset, 'old-pass', 'new-pass');

  assert.throws(() => sc.unlockWithPassphrase('old-pass', rotated), 'old passphrase no longer unlocks');
  const dekNew = sc.unlockWithPassphrase('new-pass', rotated);
  assert.deepEqual(dekNew, dek0, 'DEK unchanged across passphrase rotation');
  assert.deepEqual(sc.decryptStore(blob, dekNew), STORE, 'existing blob still decrypts (no re-encryption)');
  // recovery key is unaffected by a passphrase change
  assert.deepEqual(sc.unlockWithRecovery(recoveryKey, rotated), dek0);
});

test('recovery key encode/decode round-trips and is human-grouped', () => {
  const { recoveryKey } = mk('p');
  assert.match(recoveryKey, /^[A-Z2-7]{4}(-[A-Z2-7]{4})+/, 'grouped base32');
  // decode→encode is stable
  const raw = sc.decodeRecovery(recoveryKey);
  assert.equal(sc.encodeRecovery(raw), recoveryKey);
  // tolerant of spaces / lowercase / missing dashes on input
  const messy = recoveryKey.toLowerCase().replace(/-/g, ' ');
  assert.deepEqual(sc.decodeRecovery(messy), raw);
});

test('server-can\'t-decrypt by construction: the keyset carries no usable key', () => {
  const { keyset } = mk('super-secret-passphrase');
  // What the server would store. It must contain NO plaintext DEK/passphrase.
  const serverHas = JSON.stringify(keyset);
  assert.ok(!serverHas.includes('super-secret-passphrase'), 'passphrase never stored');
  // The DEK is only obtainable via a secret the server never has:
  assert.throws(() => sc.unlockWithPassphrase('', keyset));
  // wrapped entries are opaque {salt,iv,ct,tag} — no raw key field
  for (const w of [keyset.wrappedByPassphrase, keyset.wrappedByRecovery]) {
    assert.deepEqual(Object.keys(w).sort(), ['ct', 'iv', 'salt', 'tag']);
  }
});

test('two keysets for the same passphrase yield different DEKs (random DEK + salt)', () => {
  const a = mk('same'); const b = mk('same');
  const dekA = sc.unlockWithPassphrase('same', a.keyset);
  const dekB = sc.unlockWithPassphrase('same', b.keyset);
  assert.notDeepEqual(dekA, dekB, 'each connection gets an independent DEK');
});
