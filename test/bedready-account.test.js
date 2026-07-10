'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const acct = require('../lib/bedready-account');

function tmpDir() {
  const d = path.join(os.tmpdir(), 'bedready-acct-test-' + process.pid + '-' + Math.floor(process.hrtime()[1]));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

test('parseDeepLink reads tokens from the fragment', () => {
  const t = acct.parseDeepLink('bedready://auth#access_token=AAA&refresh_token=RRR&expires_at=1234');
  assert.deepEqual(t, { access: 'AAA', refresh: 'RRR', expires: 1234 });
});

test('parseDeepLink normalizes a millisecond expires_at to seconds', () => {
  // Supabase sends seconds; guard against contract drift that sends ms (else the token never refreshes).
  const t = acct.parseDeepLink('bedready://auth#refresh_token=R&expires_at=1700000000000');
  assert.equal(t.expires, 1700000000);
});

test('parseDeepLink rejects malformed / token-less links', () => {
  assert.equal(acct.parseDeepLink('bedready://auth'), null); // no fragment
  assert.equal(acct.parseDeepLink('bedready://auth#access_token=AAA'), null); // no refresh_token
  assert.equal(acct.parseDeepLink(''), null);
  assert.equal(acct.parseDeepLink(null), null);
});

test('link / isLinked / read / clear round-trip', () => {
  const dir = tmpDir();
  assert.equal(acct.isLinked(dir), false);
  assert.equal(acct.link(dir, { access: 'A', refresh: 'R', expires: 999 }), true);
  assert.equal(acct.isLinked(dir), true);
  assert.deepEqual(acct.read(dir), { access: 'A', refresh: 'R', expires: 999 });
  acct.clear(dir);
  assert.equal(acct.isLinked(dir), false);
  assert.equal(acct.read(dir), null);
});

test('link refuses tokens without a refresh token', () => {
  const dir = tmpDir();
  assert.equal(acct.link(dir, { access: 'A' }), false);
  assert.equal(acct.isLinked(dir), false);
});

test('getAccessToken returns the stored token when it is not near expiry (no network)', async () => {
  const dir = tmpDir();
  acct.link(dir, { access: 'STILL_GOOD', refresh: 'R', expires: 10_000 });
  const tok = await acct.getAccessToken(dir, /* now */ 5_000); // 5000s of headroom
  assert.equal(tok, 'STILL_GOOD');
});

test('getAccessToken throws a helpful error when not linked', async () => {
  const dir = tmpDir();
  await assert.rejects(() => acct.getAccessToken(dir), /Not linked/);
});
