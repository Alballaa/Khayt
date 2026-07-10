'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const lib = require('../lib/bedready-library');

test('safeBase sanitizes and caps titles', () => {
  assert.equal(lib.safeBase('Hello World!'), 'Hello_World'); // trailing separator stripped
  assert.equal(lib.safeBase('a/b/c'), 'a_b_c'); // path separators never survive
  assert.ok(!lib.safeBase('../../etc/passwd').includes('/'));
  assert.equal(lib.safeBase(''), 'design');
  assert.equal(lib.safeBase(null), 'design');
  assert.ok(lib.safeBase('x'.repeat(200)).length <= 60);
});

test('extFor prefers declared fileType, then filename, then .3mf', () => {
  assert.equal(lib.extFor({ fileType: '3mf' }), '.3mf');
  assert.equal(lib.extFor({ fileType: 'STL' }), '.stl');
  assert.equal(lib.extFor({ filename: 'model.obj' }), '.obj');
  assert.equal(lib.extFor({ fileType: 'weird', filename: 'a.step' }), '.step');
  assert.equal(lib.extFor({}), '.3mf');
});

test('downloadItem returns null when the item has no downloadUrl (no network)', async () => {
  assert.equal(await lib.downloadItem({ title: 'x' }, '/tmp/nope'), null);
  assert.equal(await lib.downloadItem(null, '/tmp/nope'), null);
});

test('downloadAll skips file-less items without hitting the network', async () => {
  const items = [
    { title: 'A' }, // no downloadUrl → skipped
    { slug: 'b', downloadUrl: null }, // explicit null → skipped
  ];
  const r = await lib.downloadAll(items, '/tmp/should-not-be-created');
  assert.deepEqual(r.saved, []);
  assert.deepEqual(r.failed, []);
  assert.equal(r.skipped.length, 2);
});

test('downloadItem refuses a non-HTTPS download URL (SSRF guard, no network)', async () => {
  await assert.rejects(
    () => lib.downloadItem({ title: 'x', downloadUrl: 'http://bedready.io/f.3mf' }, '/tmp/nope'),
    /HTTPS/);
});

test('downloadItem refuses a URL resolving to a loopback/private address (SSRF guard, no network)', async () => {
  await assert.rejects(
    () => lib.downloadItem({ title: 'x', downloadUrl: 'https://127.0.0.1/f.3mf' }, '/tmp/nope'),
    /private|internal/);
});

test('fetchLibrary rejects an empty token before any request', async () => {
  await assert.rejects(() => lib.fetchLibrary(''), /Sign in to BedReady/);
  await assert.rejects(() => lib.fetchLibrary('   '), /Sign in to BedReady/);
});

test('signInUrl points at the BedReady app-link page', () => {
  assert.equal(lib.signInUrl(), 'https://bedready.io/app-link');
});
