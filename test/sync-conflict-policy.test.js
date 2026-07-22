const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyDeltas } = require('../renderer/sync.js');

/**
 * The delta sync engine is not wired to a backend yet — the live cloud is
 * whole-snapshot backup/restore with an optimistic rev guard.
 *
 * Concurrent edits used to leave two devices holding different records with no
 * signal to anyone. One edit is still lost — `rev` is a counter, not a causal
 * clock — but the devices now agree on WHICH, so they converge instead of
 * silently drifting apart.
 */

/* ── concurrent edits ────────────────────────────────────────────────────── */

const base = (p, t) => ({ id: 'o1', rev: 4, project: p, updatedAt: t });

test('two devices editing from the same base CONVERGE', () => {
  // rev is a per-record counter, not a causal clock, so one edit is lost either
  // way. What must not happen is each device keeping its own and both believing
  // they are correct — that is silent, permanent divergence.
  const A = base('A edit', '2026-07-22T10:00:00Z');
  const B = base('B edit', '2026-07-22T10:00:05Z');
  const devA = { orders: [{ ...A }] };
  const devB = { orders: [{ ...B }] };
  applyDeltas(devA, { deltas: [{ collection: 'orders', record: { ...B } }] });
  applyDeltas(devB, { deltas: [{ collection: 'orders', record: { ...A } }] });
  assert.equal(devA.orders[0].project, devB.orders[0].project, 'devices diverged');
});

test('the winner does not depend on who pulled first', () => {
  const A = base('A edit', '2026-07-22T10:00:00Z');
  const B = base('B edit', '2026-07-22T10:00:05Z');
  const one = { orders: [{ ...A }] };
  const two = { orders: [{ ...B }] };
  applyDeltas(one, { deltas: [{ collection: 'orders', record: { ...B } }] });
  applyDeltas(two, { deltas: [{ collection: 'orders', record: { ...A } }] });
  assert.equal(one.orders[0].project, 'B edit', 'later updatedAt should win');
  assert.equal(two.orders[0].project, 'B edit');
});

test('identical timestamps still converge, without a coin flip', () => {
  const A = base('A edit', '2026-07-22T10:00:00Z');
  const B = base('B edit', '2026-07-22T10:00:00Z');
  const devA = { orders: [{ ...A }] };
  const devB = { orders: [{ ...B }] };
  applyDeltas(devA, { deltas: [{ collection: 'orders', record: { ...B } }] });
  applyDeltas(devB, { deltas: [{ collection: 'orders', record: { ...A } }] });
  assert.equal(devA.orders[0].project, devB.orders[0].project);
});

test('a conflict is reported, not swallowed', () => {
  const snap = { orders: [base('A edit', '2026-07-22T10:00:00Z')] };
  const r = applyDeltas(snap, {
    deltas: [{ collection: 'orders', record: base('B edit', '2026-07-22T10:00:05Z') }],
  });
  assert.equal(r.conflicts.length, 1, 'nothing can surface a conflict that is never recorded');
  assert.equal(r.conflicts[0].id, 'o1');
  assert.equal(r.conflicts[0].tookIncoming, true);
});

test('a re-sent identical record is not a conflict', () => {
  const rec = base('same', '2026-07-22T10:00:00Z');
  const snap = { orders: [{ ...rec }] };
  const r = applyDeltas(snap, { deltas: [{ collection: 'orders', record: { ...rec } }] });
  assert.equal(r.conflicts.length, 0, 'a duplicate delivery must not look like a conflict');
  assert.equal(r.skipped, 1);
});

test('a lower rev never overwrites a higher one', () => {
  const snap = { orders: [{ id: 'o1', rev: 9, project: 'newer' }] };
  const r = applyDeltas(snap, { deltas: [{ collection: 'orders', record: { id: 'o1', rev: 4, project: 'older' } }] });
  assert.equal(snap.orders[0].project, 'newer');
  assert.equal(r.conflicts.length, 0, 'a clear ordering is not a conflict');
});
