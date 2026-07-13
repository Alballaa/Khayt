'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('../lib/bedready-library');

// Literal public IP as the initial host so the SSRF guard passes without a DNS lookup (offline-safe).
const PUBLIC = 'https://93.184.216.34/f.3mf';
function withFetch(stub, fn) {
  const real = global.fetch;
  global.fetch = stub;
  return Promise.resolve().then(fn).finally(() => { global.fetch = real; });
}
// A minimal Response-ish object for a 200 with a small buffered body (no streaming branch).
const okBody = (bytes) => ({ ok: true, status: 200, headers: { get: () => null }, body: null, arrayBuffer: async () => bytes });

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

test('downloadItem re-validates a redirect hop and refuses one pointing at a private address (SSRF)', async () => {
  let calls = 0, fetchedInternal = false;
  await withFetch(async (url) => {
    calls++;
    if (String(url).includes('127.0.0.1')) { fetchedInternal = true; return okBody(Buffer.from('x')); }
    // First hop (the public host) 302s to loopback — the classic redirect-based SSRF bypass.
    return { status: 302, ok: false, headers: { get: (h) => (String(h).toLowerCase() === 'location' ? 'https://127.0.0.1/secret' : null) } };
  }, async () => {
    await assert.rejects(
      () => lib.downloadItem({ title: 'x', downloadUrl: PUBLIC }, path.join(os.tmpdir(), 'nope')),
      /private|internal/);
  });
  assert.equal(fetchedInternal, false, 'the internal redirect target must never be fetched');
  assert.equal(calls, 1, 'only the initial public host is fetched; the loopback hop is rejected pre-fetch');
});

test('downloadAll gives same-named designs distinct files instead of clobbering', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brl-dedup-'));
  try {
    await withFetch(async () => okBody(Buffer.from('data')), async () => {
      const items = [
        { title: 'Vase', downloadUrl: PUBLIC, fileType: '3mf' },
        { title: 'Vase', downloadUrl: PUBLIC, fileType: '3mf' }, // same title → would collide
        { title: 'Vase!', downloadUrl: PUBLIC, fileType: '3mf' }, // safeBase collapses "Vase!" → "Vase" too
      ];
      const r = await lib.downloadAll(items, dir);
      assert.equal(r.saved.length, 3, 'every design is saved');
      assert.equal(new Set(r.saved).size, 3, 'each to a unique path — no silent overwrite');
      for (const p of r.saved) assert.ok(fs.existsSync(p), 'file actually exists on disk');
      assert.equal(fs.readdirSync(dir).length, 3, 'three real files, not one clobbered');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('fetchLibrary rejects an empty token before any request', async () => {
  await assert.rejects(() => lib.fetchLibrary(''), /Sign in to BedReady/);
  await assert.rejects(() => lib.fetchLibrary('   '), /Sign in to BedReady/);
});

test('signInUrl points at the BedReady app-link page', () => {
  assert.equal(lib.signInUrl(), 'https://bedready.io/app-link');
});
