const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/lead-time-publish.js');

/**
 * Every decision here changes a date a customer is given before they order, and
 * each one has an optimistic failure mode that nothing would report. These pin
 * the pessimistic reading in each case.
 */

const ON = {
  publishToCloud: true, dailyHours: 8, workingDaysPerWeek: 5,
  finishingDays: 1, dispatchDays: 1, safetyDays: 1,
};
const build = (over = {}) => P.buildSnapshot({
  settings: { leadTime: { ...ON, ...(over.leadTime || {}) } },
  printLog: over.printLog || [],
  machines: over.machines || [{ id: 'm1' }],
  today: '2026-08-31',
  nowIso: '2026-08-31T09:00:00Z',
});

test('nothing is published unless the shop asked for it', () => {
  assert.equal(P.buildSnapshot({ settings: { leadTime: { publishToCloud: false } } }), null);
  assert.equal(P.buildSnapshot({ settings: {} }), null);
  assert.equal(P.buildSnapshot({}), null, 'a shop with no settings has not opted in');
});

test('finished work is not queued work', () => {
  const busy = build({ printLog: [{ status: 'queued', printTime: 40 }] });
  const done = build({ printLog: [{ status: 'completed', printTime: 40 }, { status: 'delivered', printTime: 40 }] });
  assert.ok(busy.availableFrom > done.availableFrom);
  assert.equal(done.availableFrom, '2026-08-31', 'a shop with only finished jobs is free today');
});

test('a job with no estimate still occupies the queue', () => {
  // Skipping it would shorten every promise a shop makes while it has
  // unestimated orders in front of it — which is exactly when it is busiest.
  const q = P.activeQueue([{ status: 'queued' }, { status: 'queued', printTime: 'oops' }]);
  assert.equal(q.length, 2, 'both are still work');
  assert.equal(q[0].hours, 0);
});

test('an offline printer is not capacity', () => {
  // A shop with one printer down has less capacity, and a customer should be
  // given the true date rather than one that assumes a repair.
  assert.deepEqual(P.usableMachines([{ id: 'a' }, { id: 'b', isOffline: true }, { id: 'c', status: 'offline' }]), ['a']);
  assert.deepEqual(P.usableMachines([{ id: 'd', status: 'retired' }]), []);
  assert.deepEqual(P.usableMachines(null), []);
});

test('a second working printer brings the date forward', () => {
  const one = build({ printLog: [{ status: 'queued', printTime: 40, machineId: 'm1' }], machines: [{ id: 'm1' }] });
  const two = build({ printLog: [{ status: 'queued', printTime: 40, machineId: 'm1' }], machines: [{ id: 'm1' }, { id: 'm2' }] });
  assert.ok(two.availableFrom < one.availableFrom, 'the free lane takes the next job');
});

test('the published snapshot never carries the queue', () => {
  const s = build({ printLog: [{ status: 'queued', printTime: 40 }] });
  const wire = JSON.stringify(s);
  assert.ok(!wire.includes('40'), 'hours booked must not leave the machine');
  assert.ok(!('queuedHours' in s) && !('machineIds' in s));
  assert.deepEqual(Object.keys(s).sort(), [
    'availableFrom', 'computedAt', 'dailyHours', 'handlingDays', 'staleAfterHours', 'workingDaysPerWeek',
  ]);
});

test('the shop\'s own buffers are summed, not published separately', () => {
  const s = build({ leadTime: { finishingDays: 2, dispatchDays: 1, safetyDays: 3 } });
  assert.equal(s.handlingDays, 6);
  assert.ok(!('safetyDays' in s), 'how the shop splits its margin is its business');
});

// ── When to republish ───────────────────────────────────────────────────────

test('a snapshot that says the same thing is not "different"', () => {
  // computedAt moves on every tick, so comparing whole snapshots would publish
  // constantly and never say anything new.
  const a = build({ printLog: [{ status: 'queued', printTime: 8 }] });
  const b = { ...a, computedAt: '2026-08-31T10:00:00Z' };
  assert.equal(P.differs(a, b), false);
});

test('a changed queue IS different', () => {
  const a = build({ printLog: [{ status: 'queued', printTime: 8 }] });
  const b = build({ printLog: [{ status: 'queued', printTime: 80 }] });
  assert.equal(P.differs(a, b), true);
});

test('having nothing to compare against counts as different', () => {
  // First publish after a restart must happen, not be optimised away.
  assert.equal(P.differs(null, build()), true);
  assert.equal(P.differs(build(), null), true);
});
