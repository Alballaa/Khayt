'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lib = require('../lib/makerrun-library');

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

test('extFor never returns a non-model extension from a hostile filename', () => {
  // A renderer-supplied filename must not be able to land e.g. a .command/.bat in ~/Downloads.
  assert.equal(lib.extFor({ filename: 'payload.command' }), '.3mf');
  assert.equal(lib.extFor({ filename: 'x.bat' }), '.3mf');
  assert.equal(lib.extFor({ fileType: 'exe', filename: 'run.sh' }), '.3mf');
  assert.equal(lib.extFor({ filename: 'model.STL' }), '.stl'); // allowlisted, case-insensitive
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
    () => lib.downloadItem({ title: 'x', downloadUrl: 'http://makerrun.com/f.3mf' }, '/tmp/nope'),
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

test('fetchCoverDataUrl returns a data: URI for an image response', async () => {
  await withFetch(async () => ({
    ok: true, status: 200,
    headers: { get: (h) => { h = String(h).toLowerCase(); return h === 'content-type' ? 'image/png' : (h === 'content-length' ? '3' : null); } },
    body: null, arrayBuffer: async () => Buffer.from([1, 2, 3]),
  }), async () => {
    const d = await lib.fetchCoverDataUrl(PUBLIC);
    assert.match(d, /^data:image\/png;base64,/);
  });
});

test('fetchCoverDataUrl rejects a non-image, and a redirect to a private address (SSRF)', async () => {
  await withFetch(async () => ({ ok: true, status: 200, headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'text/html' : null) }, body: null, arrayBuffer: async () => Buffer.from('x') }),
    async () => { await assert.rejects(() => lib.fetchCoverDataUrl(PUBLIC), /not an image/); });
  await withFetch(async (url) => {
    if (String(url).includes('127.0.0.1')) return { ok: true, status: 200, headers: { get: () => null }, body: null, arrayBuffer: async () => Buffer.from('x') };
    return { status: 302, ok: false, headers: { get: (h) => (String(h).toLowerCase() === 'location' ? 'https://127.0.0.1/c.png' : null) } };
  }, async () => { await assert.rejects(() => lib.fetchCoverDataUrl(PUBLIC), /private|internal/); });
});

test('fetchLibrary rejects an empty token before any request', async () => {
  await assert.rejects(() => lib.fetchLibrary(''), /Sign in to MakerRun/);
  await assert.rejects(() => lib.fetchLibrary('   '), /Sign in to MakerRun/);
});

test('signInUrl points at the MakerRun app-link page', () => {
  assert.equal(lib.signInUrl(), 'https://makerrun.com/app-link');
});

test('downloadsDir keeps a pre-rename BedReady-Library folder, else uses the new name', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brl-dl-'));
  try {
    // Nothing downloaded before the rename → the new name.
    assert.equal(lib.downloadsDir(root), path.join(root, 'MakerRun-Library'));

    // A shop that downloaded designs before the rename keeps writing where its
    // existing designs already are, rather than scattering one library over two
    // folders with no hint that the older half exists.
    fs.mkdirSync(path.join(root, lib.LEGACY_LIBRARY_FOLDER));
    assert.equal(lib.downloadsDir(root), path.join(root, 'BedReady-Library'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('downloadsDir falls back to the new name when Downloads cannot be read', () => {
  // An unreadable Downloads must not throw out of an IPC handler — it just means
  // "no legacy folder that we can see", and the new name is the safe answer.
  const real = fs.existsSync;
  fs.existsSync = () => { throw new Error('EACCES'); };
  try {
    assert.equal(lib.downloadsDir('/some/downloads'), path.join('/some/downloads', 'MakerRun-Library'));
  } finally { fs.existsSync = real; }
});
