const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  hashPin, verifyPin, isPbkdf2Hash, isLegacySha256Hash, isManagedHash, needsUpgrade,
} = require('../lib/pin-hash');

test('hashPin produces the salted PBKDF2 format and verifies', () => {
  const h = hashPin('1357', 50000); // fewer iters to keep the test fast
  assert.ok(isPbkdf2Hash(h));
  assert.equal(h.split('$').length, 4);
  assert.equal(verifyPin('1357', h), true);
  assert.equal(verifyPin('0000', h), false);
});

test('hashPin uses a fresh salt each time (no precomputation)', () => {
  assert.notEqual(hashPin('1357', 50000), hashPin('1357', 50000));
});

test('verifyPin accepts legacy unsalted SHA-256 hashes (backward compat)', () => {
  const legacy = crypto.createHash('sha256').update('4242').digest('hex');
  assert.ok(isLegacySha256Hash(legacy));
  assert.equal(verifyPin('4242', legacy), true);
  assert.equal(verifyPin('9999', legacy), false);
});

test('format detection: managed vs unrecognized (must not be wiped on length alone)', () => {
  const legacy = crypto.createHash('sha256').update('x').digest('hex');
  const salted = hashPin('x', 50000);
  assert.equal(isManagedHash(legacy), true);
  assert.equal(isManagedHash(salted), true);
  // Very-old base64 scheme / garbage → unrecognized, verify fails (re-prompt), not crash.
  assert.equal(isManagedHash('MTIzNA=='), false);
  assert.equal(verifyPin('1234', 'MTIzNA=='), false);
  assert.equal(verifyPin('1234', ''), false);
  assert.equal(verifyPin('1234', undefined), false);
});

test('needsUpgrade flags legacy hashes only', () => {
  assert.equal(needsUpgrade(crypto.createHash('sha256').update('x').digest('hex')), true);
  assert.equal(needsUpgrade(hashPin('x', 50000)), false);
});
