const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/lead-time.js');

/**
 * A promise a customer will hold the shop to.
 *
 * The failure that matters is over-promising: telling somebody their order ships
 * Tuesday when the shop has a week of queue in front of it. Every test below is
 * either "does it account for the thing that makes it later" or "does it refuse
 * to answer rather than answer optimistically".
 */

const T = '2026-08-31'; // a Monday

test('the print time alone is never the answer', () => {
  // The whole reason this module exists. Same 3-hour job, two shops.
  const idle = L.promise({ jobHours: 3, today: T });
  const busy = L.promise({ jobHours: 3, queue: [{ hours: 40 }], today: T });
  assert.ok(busy.printedBy > idle.printedBy, 'a queue must push the date out');
  assert.equal(idle.queueHours, 0);
  assert.equal(busy.queueHours, 40);
});

test('the job goes BEHIND the queue, not alongside it', () => {
  // A shop does not start a new order the moment it arrives. A promise that
  // assumes it does breaks on the shop's busiest week — which is when it was made.
  const r = L.promise({ jobHours: 8, queue: [{ hours: 8 }], dailyHours: 8, workingDaysPerWeek: 7, today: T });
  assert.equal(r.workingDays, 2, '16 hours at 8/day is two days, not one');
});

test('a five-day week is longer in calendar days than a seven-day one', () => {
  const five = L.promise({ jobHours: 40, dailyHours: 8, workingDaysPerWeek: 5, today: T });
  const seven = L.promise({ jobHours: 40, dailyHours: 8, workingDaysPerWeek: 7, today: T });
  assert.ok(five.printedBy > seven.printedBy,
    'a shop that is shut at the weekend cannot promise a weekday shop’s date');
});

test('finishing and dispatch are working days; transit is not', () => {
  // A closed shop is not packing boxes. A carrier moves on its own days.
  const r = L.promise({
    jobHours: 1, dailyHours: 8, workingDaysPerWeek: 5,
    finishingDays: 1, dispatchDays: 1, transitDays: 3, today: T,
  });
  assert.ok(r.readyBy > r.printedBy);
  assert.ok(r.shipsBy > r.readyBy);
  assert.equal(r.deliveredBy, L.addDaysIso(r.shipsBy, 3));
});

test('no transit asked for means no delivery date invented', () => {
  const r = L.promise({ jobHours: 1, today: T });
  assert.equal(r.deliveredBy, null, 'a carrier estimate we were not given is not ours to guess');
});

test('a same-day shop can say so', () => {
  // Zero is a real answer for finishing and dispatch, not a missing one — which
  // is why they default only when nothing usable is given.
  const r = L.promise({ jobHours: 1, finishingDays: 0, dispatchDays: 0, today: T });
  assert.equal(r.readyBy, r.printedBy);
  assert.equal(r.shipsBy, r.printedBy);
});

test('a missing setting defaults, and does not become NaN', () => {
  // `Number(undefined)` is NaN and `NaN ?? 1` is still NaN — the first draft of
  // this file shipped exactly that, and it produced an Invalid Date rather than
  // a wrong one, which is the only reason it was noticed.
  const r = L.promise({ jobHours: 1, today: T });
  assert.equal(r.basis.finishingDays, 1);
  assert.equal(r.basis.dispatchDays, 1);
  assert.match(r.shipsBy, /^\d{4}-\d{2}-\d{2}$/);
});

test('a nonsense offset throws rather than silently promising today', () => {
  // Quietly treating it as zero would hand a customer today's date as a delivery
  // promise, which is the worst available way to be wrong.
  assert.throws(() => L.addDaysIso(T, NaN), /not a number/);
});

// ── Which lane the job lands on ─────────────────────────────────────────────

test('a free machine takes the job, because a shop would put it there', () => {
  const r = L.promise({
    jobHours: 3, queue: [{ hours: 40, machineId: 'a' }], machineIds: ['a', 'b'], today: T,
  });
  assert.equal(r.queueHours, 0, 'lane b is free');
});

test('unassigned work is not wished away across lanes', () => {
  // It is queued labour whoever ends up doing it. Ignoring it flatters the date;
  // so does spreading it so thin that the lightest lane looks empty.
  const spread = L.promise({ jobHours: 1, queue: [{ hours: 20 }], machineIds: ['a', 'b'], today: T });
  assert.equal(spread.queueHours, 10, '20 unassigned hours over two lanes is 10 each');
  const ignored = L.promise({ jobHours: 1, queue: [{ hours: 20, machineId: 'zzz' }], machineIds: ['a', 'b'], today: T });
  assert.equal(ignored.queueHours, 10, 'work assigned to a machine we were not given is still work');
});

test('a shop with no machines recorded still has a queue', () => {
  // Not "no machines, therefore nothing queued" — that is the reading that would
  // promise instantly to every single-printer shop that has not filled in a form.
  const r = L.promise({ jobHours: 1, queue: [{ hours: 16 }], today: T });
  assert.equal(r.queueHours, 16);
});

test('what the date rests on comes back with it', () => {
  // So a caller can say "based on 8 h/day, five days a week" instead of
  // presenting a date as though it were a fact about the future.
  const r = L.promise({ jobHours: 1, dailyHours: 6, workingDaysPerWeek: 6, today: T });
  assert.deepEqual(r.basis, {
    dailyHours: 6, workingDaysPerWeek: 6, finishingDays: 1, dispatchDays: 1, transitDays: 0,
  });
});
