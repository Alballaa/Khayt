'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const lib = require('../lib/makerrun-library');
const State = require('../lib/makerrun-sync-state');

/**
 * Khayt re-downloaded a shop's whole MakerRun library on every sync, because the
 * payload gave it nothing to compare against. It now carries a per-file checksum
 * and a cursor. These pin the two things that are easy to get wrong about using
 * them: what the cursor may be trusted to prove, and what counts as "I already
 * have this".
 */

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mr-sync-'));
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

const item = (over = {}) => ({
  designId: 'd1', slug: 'thing', title: 'Thing', filename: 'Thing.3mf', fileType: '3mf',
  checksum: 'abc', checksumAlgo: 'md5', fileUpdatedAt: '2026-06-30T00:00:00Z',
  downloadUrl: 'https://example.test/f.3mf', ...over,
});

// ── The cursor ──────────────────────────────────────────────────────────────

test('with no cursor yet, one full fetch and the cursor is kept', async () => {
  const calls = [];
  const fake = async (_t, o) => { calls.push(o.since || null); return { items: [item()], count: 1, filtered: false, syncedAt: 'T1' }; };
  const r = await lib.syncLibrary('tok', { state: State.EMPTY, fetchLibrary: fake });
  assert.deepStrictEqual(calls, [null]);
  assert.strictEqual(r.syncedAt, 'T1');
  assert.strictEqual(r.unchanged, false);
});

test('"nothing changed" is answered from cache, with no second request', async () => {
  // The one answer `?since=` gives that is safe to act on alone. This is the
  // common case, and it costs one small response and NO signed URLs.
  const calls = [];
  const fake = async (_t, o) => { calls.push(o.since || null); return { items: [], count: 0, filtered: true, syncedAt: 'T2' }; };
  const cached = { syncedAt: 'T1', items: [item(), item({ designId: 'd2' })], files: {} };
  const r = await lib.syncLibrary('tok', { state: cached, fetchLibrary: fake });
  assert.deepStrictEqual(calls, ['T1']);
  assert.strictEqual(r.unchanged, true);
  assert.strictEqual(r.items.length, 2, 'the cached listing is served');
  assert.strictEqual(r.syncedAt, 'T1', 'the older cursor is kept — it can only widen the next question');
  assert.strictEqual(r.fetched, 1);
});

test('anything OTHER than "nothing changed" triggers a full fetch', async () => {
  /* `?since=` cannot report an UNSAVE: removing a design changes no row it would
     return. So its results are never merged into the cache — a positive answer
     only means "go ask properly", and the full list reflects removals because it
     is the whole list. This is the test that would fail if someone made the
     delta authoritative, which is the tempting optimisation. */
  const calls = [];
  const fake = async (_t, o) => {
    calls.push(o.since || null);
    return o.since
      ? { items: [item({ designId: 'd9' })], count: 1, filtered: true, syncedAt: 'T2' }
      : { items: [item()], count: 1, filtered: false, syncedAt: 'T3' };
  };
  const cached = { syncedAt: 'T1', items: [item(), item({ designId: 'gone' })], files: {} };
  const r = await lib.syncLibrary('tok', { state: cached, fetchLibrary: fake });
  assert.deepStrictEqual(calls, ['T1', null], 'the probe, then an authoritative full fetch');
  assert.strictEqual(r.fetched, 2);
  assert.strictEqual(r.items.length, 1, 'the full list replaces the cache, so an unsaved design disappears');
  assert.strictEqual(r.syncedAt, 'T3');
});

// ── What counts as already holding a file ───────────────────────────────────

test('a matching checksum on a file that still exists is a skip', () => {
  const d = dir();
  const f = path.join(d, 'Thing.3mf');
  fs.writeFileSync(f, 'bytes');
  const st = State.remember(State.EMPTY, item(), f);
  assert.strictEqual(State.alreadyHave(st, item()), f);
});

test('a manifest entry whose file was deleted is not a skip', () => {
  // Believing it would leave the shop with a library entry and no file, which
  // looks like it worked.
  const st = State.remember(State.EMPTY, item(), '/nowhere/gone.3mf');
  assert.strictEqual(State.alreadyHave(st, item()), null);
});

test('a missing checksum is never a match', () => {
  // The API returns null for a gated design deliberately, and elsewhere null
  // means "could not be determined". Treating absence as agreement is how a
  // stale file survives for ever.
  const d = dir(); const f = path.join(d, 'a.3mf'); fs.writeFileSync(f, 'x');
  const st = State.remember(State.EMPTY, item(), f);
  assert.strictEqual(State.alreadyHave(st, item({ checksum: null })), null);
  const noneStored = State.remember(State.EMPTY, item({ checksum: null }), f);
  assert.strictEqual(State.alreadyHave(noneStored, item()), null);
});

test('the same digest under a different algorithm is not the same claim', () => {
  const d = dir(); const f = path.join(d, 'a.3mf'); fs.writeFileSync(f, 'x');
  const st = State.remember(State.EMPTY, item(), f);
  assert.strictEqual(State.alreadyHave(st, item({ checksumAlgo: 'sha256' })), null);
});

test('moved bytes are not a skip, even at the same checksum', () => {
  const d = dir(); const f = path.join(d, 'a.3mf'); fs.writeFileSync(f, 'x');
  const st = State.remember(State.EMPTY, item(), f);
  assert.strictEqual(State.alreadyHave(st, item({ fileUpdatedAt: '2026-08-01T00:00:00Z' })), null);
});

test('a retitled design is still the same file', () => {
  // Keyed on designId, not the slug or the path: a retitle moves both and moves
  // no bytes. Keying on either would re-download every rename.
  const d = dir(); const f = path.join(d, 'a.3mf'); fs.writeFileSync(f, 'x');
  const st = State.remember(State.EMPTY, item(), f);
  assert.strictEqual(State.alreadyHave(st, item({ slug: 'renamed', title: 'Renamed' })), f);
});

// ── Verification ────────────────────────────────────────────────────────────

test('the checksum algorithm is read, not assumed', () => {
  const body = Buffer.from('hello');
  assert.strictEqual(lib.verifyChecksum(body, { checksum: md5(body), checksumAlgo: 'md5' }), true);
  assert.strictEqual(lib.verifyChecksum(body, { checksum: 'nope', checksumAlgo: 'md5' }), false);
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  assert.strictEqual(lib.verifyChecksum(body, { checksum: sha, checksumAlgo: 'sha256' }), true,
    'a move to sha256 must not fail every download');
});

test('nothing to verify against is null — not false', () => {
  // null means unverified and the file is kept. Returning false would refuse a
  // gated design's file, or every file on a Node build without the algorithm,
  // which breaks the feature to protect against nothing.
  const body = Buffer.from('hello');
  assert.strictEqual(lib.verifyChecksum(body, { checksum: null, checksumAlgo: 'md5' }), null);
  assert.strictEqual(lib.verifyChecksum(body, { checksum: 'abc', checksumAlgo: null }), null);
  assert.strictEqual(lib.verifyChecksum(body, { checksum: 'abc', checksumAlgo: 'not-a-hash' }), null);
});

// ── State file ──────────────────────────────────────────────────────────────

test('a corrupt state file costs a full sync, never an error', () => {
  const d = dir();
  fs.writeFileSync(State.fileFor(d), '{ not json');
  assert.deepStrictEqual(State.read(d), State.EMPTY);
});

test('a state file from an older shape is discarded, not migrated', () => {
  const d = dir();
  fs.writeFileSync(State.fileFor(d), JSON.stringify({ version: 0, syncedAt: 'T1', items: [1, 2] }));
  assert.strictEqual(State.read(d).syncedAt, null);
});

test('what is written is what comes back', () => {
  const d = dir();
  State.write(d, { syncedAt: 'T1', items: [item()], files: { d1: { path: '/a' } } });
  const back = State.read(d);
  assert.strictEqual(back.syncedAt, 'T1');
  assert.strictEqual(back.items.length, 1);
  assert.strictEqual(back.files.d1.path, '/a');
});
