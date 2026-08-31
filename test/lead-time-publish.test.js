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

/* ── a printer that is printing is not a free lane ────────────────────────
 *
 * The queue was built from ORDERS alone, so a machine running a job sent to it
 * straight from a slicer counted as available and the shop quoted a customer a
 * turnaround that assumed an idle printer. Reported from the bench: a U1 five
 * hours into a print, with Khayt showing it idle.
 */
const Pub = require('../lib/lead-time-publish.js');

test('a printer mid-job adds its remaining time to that lane', () => {
  const machines = [{ id: 'M1', printerApi: { type: 'moonraker' } }];
  const cache = { M1: { state: 'printing', progress: 40, timeRemaining: 7200, lastUpdated: 1 } };
  const { queue, occupied } = Pub.printerInFlight(machines, cache, []);
  assert.deepEqual(queue, [{ hours: 2, machineId: 'M1' }]);
  assert.deepEqual(occupied, []);
});

test('a printer mid-job with no usable estimate takes the lane out of service', () => {
  /* Klipper reports no usable remaining time below ~1% of a job, so this is the
   * normal state for the first minutes of every print. Inventing hours would put
   * a guess inside a date a customer holds the shop to; dropping the lane says
   * "busy, duration unknown", which is what is actually known. */
  const machines = [{ id: 'M1', printerApi: { type: 'moonraker' } }];
  const cache = { M1: { state: 'printing', progress: 0, timeRemaining: null, lastUpdated: 1 } };
  const { queue, occupied } = Pub.printerInFlight(machines, cache, []);
  assert.deepEqual(queue, []);
  assert.deepEqual(occupied, ['M1']);
});

test('a machine that already has an active order is not counted twice', () => {
  // The order on that machine IS the job on the bed. Counting both would inflate
  // every promise the shop makes while it is working normally.
  const machines = [{ id: 'M1', printerApi: { type: 'moonraker' } }];
  const cache = { M1: { state: 'printing', progress: 40, timeRemaining: 7200, lastUpdated: 1 } };
  const orders = [{ id: 'O1', status: 'printing', machineId: 'M1', printTime: 2 }];
  const { queue, occupied } = Pub.printerInFlight(machines, cache, orders);
  assert.deepEqual(queue, []);
  assert.deepEqual(occupied, []);
});

test('an idle or unpolled printer changes nothing', () => {
  const machines = [{ id: 'M1', printerApi: { type: 'moonraker' } }, { id: 'M2' }];
  assert.deepEqual(Pub.printerInFlight(machines, { M1: { state: 'Operational', progress: 0 } }, []),
    { queue: [], occupied: [] });
  // No reading at all: machineState says 'unknown', not 'printing'. A machine
  // nobody has heard from must not silently remove capacity either.
  assert.deepEqual(Pub.printerInFlight(machines, {}, []), { queue: [], occupied: [] });
});

test('the promise gets longer once the printer is counted', () => {
  const settings = { leadTime: { publishToCloud: true, dailyHours: 8, workingDaysPerWeek: 5, safetyDays: 0, finishingDays: 0, dispatchDays: 0 } };
  const machines = [{ id: 'M1', printerApi: { type: 'moonraker' } }];
  const base = { settings, printLog: [], machines, today: '2026-08-31', nowIso: '2026-08-31T09:00:00.000Z' };
  const idle = Pub.buildSnapshot({ ...base, statusCache: {} });
  const busy = Pub.buildSnapshot({ ...base, statusCache: { M1: { state: 'printing', progress: 40, timeRemaining: 3600 * 20, lastUpdated: 1 } } });
  /* snapshot() publishes a DATE, not hours — that is what a storefront quotes,
   * so that is what this asserts. Twenty hours on the bed at eight hours a day
   * is three working days, and 2026-08-31 is a Monday. */
  assert.equal(idle.availableFrom, '2026-08-31', 'an idle shop can start today');
  assert.equal(busy.availableFrom, '2026-09-03',
    'a printer twenty hours from finishing must push the date a customer is given');
});

test('a snapshot still builds when nothing has ever been polled', () => {
  const settings = { leadTime: { publishToCloud: true } };
  assert.doesNotThrow(() => Pub.buildSnapshot({
    settings, printLog: [], machines: [{ id: 'M1' }], today: '2026-08-31', nowIso: '2026-08-31T09:00:00.000Z',
  }));
});
