'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { taskStatus, dueTasks, markDone, WARN_FRACTION } = require('../lib/maintenance');

const NOW = '2026-06-18T00:00:00.000Z';
// Build an ISO timestamp `days` before NOW.
function daysAgo(days) {
  return new Date(new Date(NOW).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/* ----------------------------------------------------------------
   Hours interval: ok / warning / due / overdue at the boundaries
   ---------------------------------------------------------------- */
test('hours interval — ok below warn threshold', () => {
  const task = { id: 'a', machineId: 'm1', name: 'Lube', intervalHours: 100, lastDoneHours: 0 };
  assert.equal(taskStatus(task, 89.9, NOW).status, 'ok');
});

test('hours interval — warning at exactly 0.9 of interval', () => {
  const task = { id: 'a', machineId: 'm1', name: 'Lube', intervalHours: 100, lastDoneHours: 0 };
  const st = taskStatus(task, 90, NOW);
  assert.equal(st.status, 'warning');
  assert.equal(st.hoursRemaining, 10);
  assert.equal(st.daysRemaining, null);
});

test('hours interval — due at exactly the interval', () => {
  const task = { id: 'a', machineId: 'm1', name: 'Lube', intervalHours: 100, lastDoneHours: 0 };
  const st = taskStatus(task, 100, NOW);
  assert.equal(st.status, 'due');
  assert.equal(st.hoursRemaining, 0);
});

test('hours interval — overdue at 1.5x the interval', () => {
  const task = { id: 'a', machineId: 'm1', name: 'Lube', intervalHours: 100, lastDoneHours: 0 };
  assert.equal(taskStatus(task, 149.9, NOW).status, 'due');
  assert.equal(taskStatus(task, 150, NOW).status, 'overdue');
});

test('hours interval — lastDoneHours offsets the meter', () => {
  const task = { id: 'a', machineId: 'm1', name: 'Lube', intervalHours: 100, lastDoneHours: 500 };
  // used = 600 - 500 = 100 -> due
  assert.equal(taskStatus(task, 600, NOW).status, 'due');
  // used = 595 - 500 = 95 -> warning (>= 0.9*100)
  assert.equal(taskStatus(task, 595, NOW).status, 'warning');
});

test('WARN_FRACTION matches the existing 0.9 service threshold', () => {
  assert.equal(WARN_FRACTION, 0.9);
});

/* ----------------------------------------------------------------
   Date interval thresholds (inject `now`)
   ---------------------------------------------------------------- */
test('date interval — ok well before warn', () => {
  const task = { id: 'd', machineId: 'm1', name: 'Belt', intervalDays: 30, lastDoneAt: daysAgo(10) };
  assert.equal(taskStatus(task, 0, NOW).status, 'ok');
});

test('date interval — warning at 0.9 of interval', () => {
  const task = { id: 'd', machineId: 'm1', name: 'Belt', intervalDays: 30, lastDoneAt: daysAgo(27) };
  const st = taskStatus(task, 0, NOW);
  assert.equal(st.status, 'warning');
  assert.ok(Math.abs(st.daysRemaining - 3) < 1e-6);
  assert.equal(st.hoursRemaining, null);
});

test('date interval — due at the calendar boundary', () => {
  const task = { id: 'd', machineId: 'm1', name: 'Belt', intervalDays: 30, lastDoneAt: daysAgo(30) };
  assert.equal(taskStatus(task, 0, NOW).status, 'due');
});

test('date interval — overdue at 1.5x', () => {
  const task = { id: 'd', machineId: 'm1', name: 'Belt', intervalDays: 30, lastDoneAt: daysAgo(45) };
  assert.equal(taskStatus(task, 0, NOW).status, 'overdue');
});

test('date interval — no lastDoneAt baseline stays ok with full days remaining', () => {
  const task = { id: 'd', machineId: 'm1', name: 'Belt', intervalDays: 30 };
  const st = taskStatus(task, 0, NOW);
  assert.equal(st.status, 'ok');
  assert.equal(st.daysRemaining, 30);
});

/* ----------------------------------------------------------------
   Both intervals set -> the more-urgent status wins
   ---------------------------------------------------------------- */
test('both intervals — hours due beats date ok', () => {
  const task = {
    id: 'b', machineId: 'm1', name: 'Combo',
    intervalHours: 100, lastDoneHours: 0,
    intervalDays: 30, lastDoneAt: daysAgo(1),
  };
  const st = taskStatus(task, 100, NOW); // hours due, date barely used
  assert.equal(st.status, 'due');
});

test('both intervals — date overdue beats hours ok', () => {
  const task = {
    id: 'b', machineId: 'm1', name: 'Combo',
    intervalHours: 100, lastDoneHours: 0,
    intervalDays: 30, lastDoneAt: daysAgo(60),
  };
  const st = taskStatus(task, 10, NOW); // hours fine, date overdue
  assert.equal(st.status, 'overdue');
});

test('both intervals — exposes both remaining values', () => {
  const task = {
    id: 'b', machineId: 'm1', name: 'Combo',
    intervalHours: 100, lastDoneHours: 0,
    intervalDays: 30, lastDoneAt: daysAgo(10),
  };
  const st = taskStatus(task, 50, NOW);
  assert.equal(st.hoursRemaining, 50);
  assert.ok(Math.abs(st.daysRemaining - 20) < 1e-6);
});

/* ----------------------------------------------------------------
   markDone resets the counters (and does not mutate input)
   ---------------------------------------------------------------- */
test('markDone returns a non-mutating patch that clears the status', () => {
  const task = { id: 'a', machineId: 'm1', name: 'Lube', intervalHours: 100, lastDoneHours: 0 };
  assert.equal(taskStatus(task, 200, NOW).status, 'overdue');

  const patch = markDone(task, 200, NOW);
  assert.deepEqual(patch, { lastDoneHours: 200, lastDoneAt: NOW });
  // input untouched
  assert.equal(task.lastDoneHours, 0);
  assert.equal(task.lastDoneAt, undefined);

  // applying the patch resets both clocks
  const updated = { ...task, ...patch };
  assert.equal(taskStatus(updated, 200, NOW).status, 'ok');
});

test('markDone resets the date clock too', () => {
  const task = { id: 'd', machineId: 'm1', name: 'Belt', intervalDays: 30, lastDoneAt: daysAgo(60) };
  assert.equal(taskStatus(task, 0, NOW).status, 'overdue');
  const updated = { ...task, ...markDone(task, 0, NOW) };
  assert.equal(taskStatus(updated, 0, NOW).status, 'ok');
});

/* ----------------------------------------------------------------
   dueTasks: filters + sorts most-urgent first
   ---------------------------------------------------------------- */
test('dueTasks filters out ok tasks and sorts overdue > due > warning', () => {
  const tasks = [
    { id: 'ok', machineId: 'm1', name: 'fine', intervalHours: 100, lastDoneHours: 100 },        // used 50 -> ok
    { id: 'warn', machineId: 'm1', name: 'soon', intervalHours: 100, lastDoneHours: 60 },       // used 90 -> warning
    { id: 'due', machineId: 'm2', name: 'now', intervalHours: 100, lastDoneHours: 0 },          // used 100 -> due
    { id: 'over', machineId: 'm3', name: 'late', intervalHours: 100, lastDoneHours: 0 },         // used 200 -> overdue
  ];
  const hours = { m1: 150, m2: 100, m3: 200 };
  const result = dueTasks(tasks, hours, NOW);
  assert.deepEqual(result.map(t => t.id), ['over', 'due', 'warn']);
  assert.equal(result[0].status, 'overdue');
  assert.equal(result[2].status, 'warning');
  // annotated, original untouched
  assert.equal(result[0].hoursRemaining, -100);
  assert.equal(tasks[3].hoursRemaining, undefined);
});

test('dueTasks defaults missing machine hours to zero', () => {
  const tasks = [
    { id: 'x', machineId: 'unknown', name: 'h', intervalHours: 100, lastDoneHours: 0 },
    { id: 'd', machineId: 'unknown', name: 'd', intervalDays: 10, lastDoneAt: daysAgo(20) },
  ];
  const result = dueTasks(tasks, {}, NOW);
  // hours task: 0 used -> ok (filtered out); date task: overdue
  assert.deepEqual(result.map(t => t.id), ['d']);
});

/* ----------------------------------------------------------------
   Missing / zero interval handled; backwards meter
   ---------------------------------------------------------------- */
test('zero / missing interval is always ok', () => {
  assert.equal(taskStatus({ id: 'z', machineId: 'm1', name: 'none' }, 9999, NOW).status, 'ok');
  assert.equal(taskStatus({ id: 'z', machineId: 'm1', name: 'none', intervalHours: 0 }, 9999, NOW).status, 'ok');
  const st = taskStatus({ id: 'z', machineId: 'm1', name: 'none' }, 9999, NOW);
  assert.equal(st.hoursRemaining, null);
  assert.equal(st.daysRemaining, null);
});

test('backwards meter never produces a false due', () => {
  const task = { id: 'a', machineId: 'm1', name: 'Lube', intervalHours: 100, lastDoneHours: 500 };
  // meter dropped below lastDoneHours (orders deleted) -> clamp used to 0
  assert.equal(taskStatus(task, 400, NOW).status, 'ok');
  assert.equal(taskStatus(task, 400, NOW).hoursRemaining, 100);
});

/* ----------------------------------------------------------------
   Empty / malformed input is safe
   ---------------------------------------------------------------- */
test('empty and malformed input is safe', () => {
  assert.deepEqual(dueTasks([], {}, NOW), []);
  assert.deepEqual(dueTasks(null, null, NOW), []);
  assert.deepEqual(dueTasks(undefined, undefined), []);
  // null entries skipped
  assert.deepEqual(dueTasks([null, undefined], {}, NOW), []);
  // taskStatus tolerates an empty task object
  assert.equal(taskStatus({}, 0, NOW).status, 'ok');
  assert.equal(taskStatus(undefined, 0, NOW).status, 'ok');
});

test('taskStatus falls back to current time when now is omitted', () => {
  // lastDoneAt far in the past with a small interval -> overdue regardless of "now"
  const task = { id: 'd', machineId: 'm1', name: 'Belt', intervalDays: 1, lastDoneAt: '2000-01-01T00:00:00.000Z' };
  assert.equal(taskStatus(task, 0).status, 'overdue');
});
