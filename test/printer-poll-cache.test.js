const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergePollSuccess, mergePollFailure, isOffline } = require('../lib/printer-poll-cache.js');

/**
 * The poller replaced the whole cache entry on any failed poll, so one missed
 * request threw away the last known job and progress and the fleet card went
 * from "printing 61%" to a red "offline" — then back on the next poll.
 *
 * A CORE One takes 20-30s to answer after a power cycle and the poll interval is
 * 30s, so this fired on entirely healthy hardware.
 */

const PRINTING = { state: 'printing', progress: 61, filename: 'gearbox.gcode' };

test('a successful poll clears any previous error', () => {
  const failed = mergePollFailure({ ...PRINTING, lastUpdated: 1000 }, 'ETIMEDOUT', 2000);
  const ok = mergePollSuccess(failed, PRINTING, 3000);
  assert.equal(ok.error, undefined, 'a stale error must not survive a good poll');
  assert.equal(ok.consecutiveFailures, 0);
  assert.equal(ok.lastOkAt, 3000);
});

test('a missed poll keeps the last known telemetry', () => {
  const prev = mergePollSuccess(null, PRINTING, 1000);
  const after = mergePollFailure(prev, 'ECONNREFUSED', 2000);
  assert.equal(after.progress, 61, 'progress lost — the card would blank out');
  assert.equal(after.state, 'printing');
  assert.equal(after.filename, 'gearbox.gcode');
  assert.equal(after.error, 'ECONNREFUSED');
});

test('consecutive misses accumulate, and a good poll resets them', () => {
  let e = mergePollSuccess(null, PRINTING, 1000);
  e = mergePollFailure(e, 'x', 2000);
  assert.equal(e.consecutiveFailures, 1);
  e = mergePollFailure(e, 'x', 3000);
  e = mergePollFailure(e, 'x', 4000);
  assert.equal(e.consecutiveFailures, 3);
  e = mergePollSuccess(e, PRINTING, 5000);
  assert.equal(e.consecutiveFailures, 0, 'a recovered printer must start clean');
});

test('lastOkAt records the last SUCCESS, and does not creep forward while failing', () => {
  // The subtle one: after the first failure `lastUpdated` is itself a failure
  // timestamp, so carrying it into lastOkAt again would keep advancing it and
  // make a long-dead printer look recently healthy.
  let e = mergePollSuccess(null, PRINTING, 1000);
  e = mergePollFailure(e, 'x', 2000);
  assert.equal(e.lastOkAt, 1000);
  e = mergePollFailure(e, 'x', 9000);
  assert.equal(e.lastOkAt, 1000, 'lastOkAt drifted forward during an outage');
});

test('a printer that has never answered still reports failures', () => {
  const e = mergePollFailure(undefined, 'EHOSTUNREACH', 1000);
  assert.equal(e.consecutiveFailures, 1);
  assert.equal(e.lastOkAt, null, 'never seen — no last-good time to claim');
});

test('offline is a threshold, not the first miss', () => {
  let e = mergePollSuccess(null, PRINTING, 1000);
  e = mergePollFailure(e, 'x', 2000);
  assert.equal(isOffline(e, 2), false, 'one miss is a blip, not a dead printer');
  e = mergePollFailure(e, 'x', 3000);
  assert.equal(isOffline(e, 2), true);
});

test('a healthy printer is never offline regardless of threshold', () => {
  const e = mergePollSuccess(null, PRINTING, 1000);
  assert.equal(isOffline(e, 1), false);
  assert.equal(isOffline(e, 0), false, 'no error means online even at threshold 0');
});
