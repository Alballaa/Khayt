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

/* ============================================================
   Freezing what a finished job actually used
   ============================================================ */

const { captureCompletion, isPrintingState } = require('../lib/printer-poll-cache.js');

const printing = (actuals, filename = 'bracket.gcode') =>
  ({ state: 'Printing', filename, actuals });
const done = (actuals, filename = 'bracket.gcode') =>
  ({ state: 'complete', filename, actuals });
const READING = { filamentMm: 14025.6, filamentGrams: 41.83, durationS: 11560, source: 'moonraker' };

test('a job that finishes has its figures frozen', () => {
  // The counters reset when the next print starts, so the transition out of
  // printing is the only moment these numbers are still true.
  const prev = mergePollSuccess(null, printing({ ...READING, filamentGrams: 39 }), 1000);
  const after = mergePollSuccess(prev, done(READING), 2000);
  assert.ok(after.lastCompleted, 'nothing was captured');
  assert.equal(after.lastCompleted.at, 2000);
  assert.equal(after.lastCompleted.filename, 'bracket.gcode');
  assert.equal(after.lastCompleted.actuals.filamentGrams, 41.83);
});

test('the FINISHED reading wins over the last mid-print one', () => {
  // The final poll before the end can be several percent short, and both
  // Moonraker and OctoPrint keep a completed job's stats until the next begins.
  const prev = mergePollSuccess(null, printing({ filamentGrams: 39, durationS: 11000 }), 1000);
  const after = mergePollSuccess(prev, done({ filamentGrams: 41.83, durationS: 11560 }), 2000);
  assert.equal(after.lastCompleted.actuals.filamentGrams, 41.83);
  assert.equal(after.lastCompleted.actuals.durationS, 11560);
});

test('a printer that clears its counters instantly falls back to the last reading', () => {
  const prev = mergePollSuccess(null, printing({ filamentGrams: 39, durationS: 11000 }), 1000);
  const after = mergePollSuccess(prev, done(null), 2000);
  assert.ok(after.lastCompleted, 'the mid-print reading should have been kept');
  assert.equal(after.lastCompleted.actuals.filamentGrams, 39);
});

test('nothing is captured while the job is still running', () => {
  const a = mergePollSuccess(null, printing(READING), 1000);
  const b = mergePollSuccess(a, printing(READING), 2000);
  assert.equal(b.lastCompleted, undefined);
});

test('an idle printer that stays idle captures nothing', () => {
  // Otherwise every poll of a parked machine would re-stamp a completion.
  const a = mergePollSuccess(null, done(null), 1000);
  const b = mergePollSuccess(a, done(null), 2000);
  assert.equal(b.lastCompleted, undefined);
});

test('a completion survives later polls and a failed one', () => {
  // The shop marks the order done minutes or hours later. Losing the capture to
  // a Wi-Fi blip in between would send them back to typing.
  const prev = mergePollSuccess(null, printing(READING), 1000);
  const finished = mergePollSuccess(prev, done(READING), 2000);
  const idleAgain = mergePollSuccess(finished, done(null), 3000);
  assert.equal(idleAgain.lastCompleted.actuals.filamentGrams, 41.83, 'still there');

  const blip = mergePollFailure(idleAgain, 'ETIMEDOUT', 4000);
  assert.equal(blip.lastCompleted.actuals.filamentGrams, 41.83, 'survived a missed poll');
});

test('a NEW job overwrites the previous capture', () => {
  const first = mergePollSuccess(
    mergePollSuccess(null, printing(READING, 'a.gcode'), 1000),
    done(READING, 'a.gcode'), 2000);
  const second = mergePollSuccess(
    mergePollSuccess(first, printing({ filamentGrams: 12, durationS: 600 }, 'b.gcode'), 3000),
    done({ filamentGrams: 12, durationS: 600 }, 'b.gcode'), 4000);
  assert.equal(second.lastCompleted.filename, 'b.gcode');
  assert.equal(second.lastCompleted.actuals.filamentGrams, 12);
});

test('a job that reported nothing captures nothing rather than a zero', () => {
  // A Bambu, or a printer whose API gives neither figure. Recording 0 g would
  // tell the shop the print was free.
  const prev = mergePollSuccess(null, printing({ filamentGrams: null, durationS: null }), 1000);
  const after = mergePollSuccess(prev, done({ filamentGrams: null, durationS: null }), 2000);
  assert.equal(after.lastCompleted, undefined);

  const zeros = mergePollSuccess(
    mergePollSuccess(null, printing({ filamentGrams: 0, durationS: 0 }), 1000),
    done({ filamentGrams: 0, durationS: 0 }), 2000);
  assert.equal(zeros.lastCompleted, undefined);
});

test('a time-only measurement is still worth freezing', () => {
  // PrusaLink reports duration but no filament.
  const after = mergePollSuccess(
    mergePollSuccess(null, printing({ filamentGrams: null, durationS: 900 }), 1000),
    done({ filamentGrams: null, durationS: 900 }), 2000);
  assert.equal(after.lastCompleted.actuals.durationS, 900);
});

test('printing states are recognised across vendors', () => {
  for (const s of ['Printing', 'printing', 'busy', 'Running', 'working']) {
    assert.equal(isPrintingState(s), true, s);
  }
  for (const s of ['complete', 'standby', 'Operational', 'idle', 'error', 'paused', '', null, undefined]) {
    assert.equal(isPrintingState(s), false, String(s));
  }
});

test('captureCompletion tolerates junk', () => {
  assert.doesNotThrow(() => captureCompletion(null, null, 1));
  assert.equal(captureCompletion(null, null, 1), null);
  assert.equal(captureCompletion({}, {}, 1), null);
});
