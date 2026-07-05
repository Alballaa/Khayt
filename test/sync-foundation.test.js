/**
 * Phase 0 sync-foundation tests. See docs/KHAYT-3.0-PHASE0-SPEC.md §7.
 * KhaytSync is pure logic (no DOM) — require it directly.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const sync = require('../renderer/sync.js');

beforeEach(() => sync._resetIndex()); // each test starts with an empty index

function snap(over = {}) {
  return { printLog: [], clients: [], inventory: [], tombstones: [], ...over };
}

test('stamp: a new record gets rev:1 + updatedAt', () => {
  const s = snap({ clients: [{ id: 'c1', name: 'Acme' }] });
  const sum = sync.stampChanges(s);
  assert.equal(s.clients[0].rev, 1);
  assert.equal(typeof s.clients[0].updatedAt, 'string');
  assert.deepEqual(sum.created, [{ collection: 'clients', id: 'c1' }]);
});

test('stamp: an unchanged record across two saves does NOT bump rev (idempotency)', () => {
  const rec = { id: 'c1', name: 'Acme' };
  const s = snap({ clients: [rec] });
  sync.seedIndex(s);              // seed from loaded state (no bump)
  const sum = sync.stampChanges(s);
  assert.equal(rec.rev, undefined, 'seeded-but-unchanged record is never stamped');
  assert.equal(sum.created.length, 0);
  assert.equal(sum.changed.length, 0);
});

test('stamp: a content change bumps rev by exactly 1 and advances updatedAt', () => {
  const rec = { id: 'c1', name: 'Acme', rev: 3, updatedAt: '2020-01-01T00:00:00.000Z' };
  const s = snap({ clients: [rec] });
  sync.seedIndex(s);
  rec.name = 'Acme Corp';        // a real content change
  const sum = sync.stampChanges(s);
  assert.equal(rec.rev, 4, 'rev bumps by exactly 1');
  assert.ok(rec.updatedAt > '2020-01-01T00:00:00.000Z', 'updatedAt advances');
  assert.deepEqual(sum.changed, [{ collection: 'clients', id: 'c1' }]);
});

test('fingerprint excludes rev/updatedAt — changing only those is not a content change', () => {
  const rec = { id: 'c1', name: 'Acme', rev: 1, updatedAt: 'x' };
  const s = snap({ clients: [rec] });
  sync.seedIndex(s);
  rec.rev = 99; rec.updatedAt = 'y'; // touch only reserved fields
  const sum = sync.stampChanges(s);
  assert.equal(sum.changed.length, 0, 'reserved-field churn must not count as a change');
});

test('delete: emits a tombstone and does not resurrect on applyDeltas', () => {
  const s = snap({ clients: [{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'B' }] });
  sync.seedIndex(s);
  s.clients = s.clients.filter((c) => c.id !== 'c2'); // delete c2
  const sum = sync.stampChanges(s);
  assert.deepEqual(sum.deleted, [{ collection: 'clients', id: 'c2' }]);
  assert.equal(s.tombstones.length, 1);
  assert.equal(s.tombstones[0].id, 'c2');
  // applyDeltas with that tombstone must remove c2 if a stale delta re-adds it
  sync.applyDeltas(s, { deltas: [{ collection: 'clients', record: { id: 'c2', rev: 5 } }], tombstones: [] });
  sync.applyDeltas(s, { deltas: [], tombstones: s.tombstones });
  assert.equal(s.clients.some((c) => c.id === 'c2'), false, 'tombstone wins — no resurrection');
});

test('backfill: records missing rev get rev:1 + updatedAt; idempotent', () => {
  const s = snap({ inventory: [{ id: 'f1' }, { id: 'f2', rev: 7 }] });
  const n = sync.backfill(s, '2026-01-01T00:00:00.000Z');
  assert.equal(n, 1, 'only the record missing rev is backfilled');
  assert.equal(s.inventory[0].rev, 1);
  assert.equal(s.inventory[0].updatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(s.inventory[1].rev, 7, 'existing rev preserved');
  assert.equal(sync.backfill(s), 0, 'second backfill is a no-op');
});

test('id backfill: an id-less record gets a stable id, unchanged on next pass', () => {
  const s = snap({ shiftLogs: [{ note: 'opened' }] });
  sync.backfill(s);
  const id = s.shiftLogs[0].id;
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
  sync.seedIndex(s);
  sync.stampChanges(s);
  assert.equal(s.shiftLogs[0].id, id, 'id is stable across passes');
});

test('extractDeltas: returns only records past the cursor; empty when nothing changed', () => {
  const s = snap({ clients: [{ id: 'c1', rev: 2 }, { id: 'c2', rev: 5 }] });
  const out = sync.extractDeltas(s, { rev: 2, ts: '' });
  assert.equal(out.deltas.length, 1);
  assert.equal(out.deltas[0].record.id, 'c2');
  assert.equal(out.cursor.rev, 5);
  const none = sync.extractDeltas(s, { rev: 5, ts: '' });
  assert.equal(none.deltas.length, 0, 'cursor at high-water => no deltas');
});

test('applyDeltas: LWW by rev — higher rev wins, lower is rejected', () => {
  const s = snap({ clients: [{ id: 'c1', name: 'old', rev: 2 }] });
  const r1 = sync.applyDeltas(s, { deltas: [{ collection: 'clients', record: { id: 'c1', name: 'new', rev: 3 } }] });
  assert.equal(s.clients[0].name, 'new');
  assert.equal(r1.applied, 1);
  const r2 = sync.applyDeltas(s, { deltas: [{ collection: 'clients', record: { id: 'c1', name: 'stale', rev: 1 } }] });
  assert.equal(s.clients[0].name, 'new', 'lower-rev incoming is rejected');
  assert.equal(r2.skipped, 1);
});

test('applyDeltas: append-only collections are never overwritten (union)', () => {
  const s = snap({ shiftLogs: [{ id: 's1', note: 'a', rev: 1 }] });
  const r = sync.applyDeltas(
    s,
    { deltas: [
      { collection: 'shiftLogs', record: { id: 's1', note: 'EDIT', rev: 9 } }, // same id -> skipped
      { collection: 'shiftLogs', record: { id: 's2', note: 'b', rev: 1 } },    // new id -> added
    ] },
    { appendOnly: ['shiftLogs'] },
  );
  assert.equal(s.shiftLogs.find((x) => x.id === 's1').note, 'a', 'existing append-only entry untouched');
  assert.equal(s.shiftLogs.length, 2, 'new entry unioned in');
  assert.equal(r.applied, 1);
});

test('LocalBackend: status is "off" and push/pull are no-ops', async () => {
  assert.equal(sync.status(), 'off');
  sync.setBackend(sync.LocalBackend);
  assert.equal(sync.LocalBackend.status(), 'off');
  assert.deepEqual(await sync.LocalBackend.pullDeltas(), { deltas: [], tombstones: [], newCursor: null });
  sync.setBackend(null);
  assert.equal(sync.status(), 'off');
});

test('golden invariant: load (seed) → save with no edits → zero churn', () => {
  // The keystone: a cloud-off user who loads and saves without editing must see
  // no rev bumps and no tombstones — Phase 0 introduces no spurious diffs.
  const s = snap({
    printLog: [{ id: 'o1', status: 'completed', rev: 1, updatedAt: 't' }],
    inventory: [{ id: 'f1', rev: 1, updatedAt: 't' }],
    clients: [{ id: 'c1', rev: 1, updatedAt: 't' }],
  });
  sync.seedIndex(s);
  const sum = sync.stampChanges(s);
  assert.equal(sum.created.length + sum.changed.length + sum.deleted.length, 0);
  assert.equal(s.tombstones.length, 0);
  assert.equal(s.printLog[0].rev, 1, 'rev untouched');
});

test('tombstones are capped so they cannot grow without bound', () => {
  const many = Array.from({ length: 5100 }, (_, i) => ({ id: 'D' + i, collection: 'printLog', deletedAt: i }));
  const s = snap({ tombstones: many });
  sync.stampChanges(s);
  assert.equal(s.tombstones.length, 5000);
  assert.ok(s.tombstones.some(t => t.id === 'D5099'), 'newest tombstone kept');
  assert.ok(!s.tombstones.some(t => t.id === 'D0'), 'oldest tombstone dropped');
});
