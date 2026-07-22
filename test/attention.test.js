const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  OFFLINE_AFTER_MISSED_POLLS,
  machineState,
  selectAttention,
} = require('../lib/attention');

// Fixed "now": 2026-07-22T12:00:00 local time.
const NOW = new Date(2026, 6, 22, 12, 0, 0).getTime();
// A day string relative to NOW (offset in whole days).
const ymd = (offsetDays) => {
  const d = new Date(2026, 6, 22 + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const machine = (over = {}) => ({ id: 'M1', name: 'Prusa MK4S', ...over });
const order = (over = {}) => ({ id: 'O1', project: 'Enclosure panels', status: 'printing', ...over });

/* ── machineState ──────────────────────────────────────────────── */

test('machineState: no telemetry configured reads idle, not offline', () => {
  assert.equal(machineState(machine(), undefined), 'idle');
  assert.equal(machineState(machine(), null), 'idle');
});

test('machineState: the manual offline flag wins over live telemetry', () => {
  const printing = { state: 'Printing', progress: 61 };
  assert.equal(machineState(machine({ isOffline: true }), printing), 'offline');
});

test('machineState: a missed poll is reconnecting, not offline', () => {
  // This is the false-positive guard. A CORE One takes 20-30s to answer after a
  // power cycle against a 30s poll interval, so misses 1 and 2 hit healthy hardware.
  for (let misses = 1; misses < OFFLINE_AFTER_MISSED_POLLS; misses++) {
    const entry = { error: 'ETIMEDOUT', consecutiveFailures: misses, state: 'Printing', progress: 61 };
    assert.equal(machineState(machine(), entry), 'reconnecting', `${misses} miss(es) must not read offline`);
  }
});

test('machineState: enough consecutive misses does mean offline', () => {
  const entry = { error: 'ETIMEDOUT', consecutiveFailures: OFFLINE_AFTER_MISSED_POLLS };
  assert.equal(machineState(machine(), entry), 'offline');
});

test('machineState: the offline threshold is the caller\'s to set', () => {
  const entry = { error: 'ETIMEDOUT', consecutiveFailures: 2 };
  assert.equal(machineState(machine(), entry, { offlineAfter: 2 }), 'offline');
  assert.equal(machineState(machine(), entry, { offlineAfter: 9 }), 'reconnecting');
  // A nonsense threshold falls back to the default rather than calling everything offline.
  assert.equal(machineState(machine(), entry, { offlineAfter: 0 }), 'reconnecting');
});

test('machineState: reads printing, error and idle from the state string', () => {
  assert.equal(machineState(machine(), { state: 'Printing', progress: 61 }), 'printing');
  assert.equal(machineState(machine(), { state: 'error: thermal runaway' }), 'error');
  assert.equal(machineState(machine(), { state: 'Operational', progress: 0 }), 'idle');
  // Progress without a recognisable state string still means work in flight.
  assert.equal(machineState(machine(), { state: '', progress: 47 }), 'printing');
});

/* ── selectAttention ───────────────────────────────────────────── */

test('selectAttention: a quiet shop produces an empty bar', () => {
  const got = selectAttention({
    machines: [machine(), machine({ id: 'M2' })],
    orders: [order({ dueDate: ymd(3) })],
    statusCache: { M1: { state: 'Printing', progress: 61 } },
    now: NOW,
  });
  assert.equal(got.count, 0);
  assert.deepEqual(got.items, []);
});

test('selectAttention: an offline printer is critical', () => {
  const got = selectAttention({
    machines: [machine()],
    statusCache: { M1: { error: 'ETIMEDOUT', consecutiveFailures: 4 } },
    now: NOW,
  });
  assert.equal(got.count, 1);
  assert.equal(got.items[0].severity, 'crit');
  assert.equal(got.items[0].kind, 'machine');
  assert.equal(got.items[0].name, 'Prusa MK4S');
  assert.equal(got.items[0].state, 'offline');
});

test('selectAttention: a reconnecting printer is NOT an attention item', () => {
  // The whole argument for exception-based design: if the bar fires on a 30s
  // blip the operator mutes it, and then the real fault is missed.
  const got = selectAttention({
    machines: [machine()],
    statusCache: { M1: { error: 'ETIMEDOUT', consecutiveFailures: 1, state: 'Printing', progress: 61 } },
    now: NOW,
  });
  assert.equal(got.count, 0);
});

test('selectAttention: an overdue order is a warning', () => {
  const got = selectAttention({
    orders: [order({ dueDate: ymd(-2) })],
    now: NOW,
  });
  assert.equal(got.count, 1);
  assert.equal(got.items[0].severity, 'warn');
  assert.equal(got.items[0].kind, 'order');
  assert.equal(got.items[0].daysLate, 2);
});

test('selectAttention: due today is not yet overdue', () => {
  const got = selectAttention({ orders: [order({ dueDate: ymd(0) })], now: NOW });
  assert.equal(got.count, 0);
});

test('selectAttention: completed, quoted and voided work cannot be overdue', () => {
  const got = selectAttention({
    orders: [
      order({ id: 'A', status: 'completed', dueDate: ymd(-5) }),
      order({ id: 'B', status: 'quote', dueDate: ymd(-5) }),
      order({ id: 'C', status: 'printing', dueDate: ymd(-5), voidedAt: '2026-07-01T00:00:00Z' }),
    ],
    now: NOW,
  });
  assert.equal(got.count, 0);
});

test('selectAttention: an order with no due date is never overdue', () => {
  const got = selectAttention({
    orders: [order({ dueDate: null }), order({ id: 'O2' }), order({ id: 'O3', dueDate: 'not-a-date' })],
    now: NOW,
  });
  assert.equal(got.count, 0);
});

test('selectAttention: machines outrank orders, and the longest-late order leads', () => {
  const got = selectAttention({
    machines: [machine()],
    orders: [
      order({ id: 'O1', dueDate: ymd(-1) }),
      order({ id: 'O2', dueDate: ymd(-9) }),
      order({ id: 'O3', dueDate: ymd(-4) }),
    ],
    statusCache: { M1: { error: 'ETIMEDOUT', consecutiveFailures: 5 } },
    now: NOW,
  });
  assert.equal(got.count, 4);
  assert.deepEqual(got.items.map(i => i.kind), ['machine', 'order', 'order', 'order']);
  assert.deepEqual(got.items.slice(1).map(i => i.id), ['O2', 'O3', 'O1']);
});

test('selectAttention: tolerates missing input entirely', () => {
  assert.equal(selectAttention().count, 0);
  assert.equal(selectAttention({}).count, 0);
  assert.equal(selectAttention({ machines: null, orders: null }).count, 0);
  // A null in the list must not throw.
  assert.equal(selectAttention({ machines: [null], orders: [null], now: NOW }).count, 0);
});
