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

/* ── a real completion ───────────────────────────────────────────────────── */

/**
 * Captured from a Snapmaker U1 on 2026-08-02, at the moment it finished a
 * five-hour print. Not written here — recorded by polling the machine every 20
 * seconds for 641 samples and keeping the two either side of the transition.
 *
 * captureCompletion had only ever been tested against payloads someone typed,
 * and it decides whether a measured cost reaches an order at all. Reading a
 * printer correctly is worth nothing if the reading is then dropped: both look
 * identical to a shop, as an order with no measured cost.
 */
const REAL_PRINTING = {
  state: 'printing',
  filename: 'KING-Abdulaziz-ART-200mm-U1_PLA_5h17m.gcode',
  progress: 100,
  actuals: { filamentMm: 47261.51896999817, filamentGrams: 140.9598209784628, durationS: 18502.834656031002, source: 'moonraker' },
  lastCompleted: null,
};
const REAL_COMPLETE = {
  state: 'complete',
  filename: 'KING-Abdulaziz-ART-200mm-U1_PLA_5h17m.gcode',
  progress: 100,
  actuals: { filamentMm: 47261.51896999817, filamentGrams: 140.9598209784628, durationS: 18517.255333580004, source: 'moonraker' },
};

test('a real finished print yields a measured cost', () => {
  const got = captureCompletion(REAL_PRINTING, REAL_COMPLETE, 1785667086668);
  assert.ok(got, 'the transition produced nothing — the job would land with no measured cost');
  assert.equal(got.filename, REAL_PRINTING.filename, 'the figures must be tied to the job they came from');
  assert.equal(got.actuals.filamentGrams, 140.9598209784628);
  assert.equal(got.actuals.durationS, 18517.255333580004, 'the completed reading, not the last in-flight one');
});

test('"complete" is a finished state, as this firmware spells it', () => {
  // The exact string a stock U1 reports. A state vocabulary that missed it
  // would leave every job looking like it was still running.
  assert.equal(isPrintingState('printing'), true);
  assert.equal(isPrintingState('complete'), false);
});

test('100% progress is not the same as finished', () => {
  // Observed for real: the last sample WHILE PRINTING already read 100%. The
  // printer was still laying its final layer. Anything keyed on progress rather
  // than state would have captured a cost while the job was still running, and
  // then never captured the real one.
  assert.equal(REAL_PRINTING.progress, 100);
  assert.equal(captureCompletion(REAL_PRINTING, REAL_PRINTING, 1), null,
    'still printing at 100% must not count as finished');
});

test('a completion is captured once, not on every poll after it', () => {
  // Moonraker keeps a finished job's stats until the next print starts, so the
  // same "complete" payload arrives again and again. Capturing repeatedly would
  // re-stamp the order on every poll.
  const first = captureCompletion(REAL_PRINTING, REAL_COMPLETE, 1785667086668);
  const after = { ...REAL_COMPLETE, lastCompleted: first };
  const second = captureCompletion(after, REAL_COMPLETE, 1785667106668);
  assert.equal(second, first, 'a second poll must return the same capture, not a fresh one');
});

test('a printer that clears its stats on finish still yields the cost', () => {
  // This U1 retained them, so the fallback did NOT run in the real capture —
  // stated plainly because "verified against hardware" must not imply more than
  // it covers. Other firmware zeroes on completion, and then the last reading
  // taken while printing is the only record that survives.
  const cleared = { ...REAL_COMPLETE, actuals: { filamentMm: 0, filamentGrams: 0, durationS: 0, source: 'moonraker' } };
  const got = captureCompletion(REAL_PRINTING, cleared, 1785667086668);
  assert.ok(got, 'a cleared completion must fall back, not lose the job');
  assert.equal(got.actuals.durationS, REAL_PRINTING.actuals.durationS, 'the last in-flight reading');
  assert.equal(got.actuals.filamentGrams, 140.9598209784628);
});

/* ============================================================
   Remembering more than one finished job
   ============================================================ */

const { findCompletion, isInJob, COMPLETIONS_KEPT } = require('../lib/printer-poll-cache.js');

const aJob = (name, g, s) => ({ state: 'printing', filename: name, actuals: { filamentGrams: g, durationS: s } });
const ended = (name, g, s) => ({ state: 'complete', filename: name, actuals: { filamentGrams: g, durationS: s } });

test('pausing a print is not a completion', () => {
  // The edge out of `printing` used to be enough. Pause is such an edge, so a
  // paused job had its mid-print figures recorded as if it had finished.
  const printing = mergePollSuccess(null, aJob('a.gcode', 40, 3600), 1000);
  const paused = mergePollSuccess(printing, { state: 'paused', filename: 'a.gcode', actuals: { filamentGrams: 41, durationS: 3700 } }, 2000);
  assert.equal(paused.lastCompleted, undefined, 'a paused job has not finished');
  assert.equal(isInJob('paused'), true);
  assert.equal(isInJob('pausing'), true);
  assert.equal(isInJob('complete'), false);
});

test('a paused job still completes exactly once, with the finished figures', () => {
  let e = mergePollSuccess(null, aJob('a.gcode', 40, 3600), 1000);
  e = mergePollSuccess(e, { state: 'paused', filename: 'a.gcode', actuals: { filamentGrams: 41, durationS: 3700 } }, 2000);
  e = mergePollSuccess(e, aJob('a.gcode', 55, 4800), 3000);          // resumed
  e = mergePollSuccess(e, ended('a.gcode', 60, 5400), 4000);         // finished
  assert.equal(e.completions.length, 1, 'pause must not add a second entry');
  assert.equal(e.lastCompleted.actuals.filamentGrams, 60, 'the finished reading, not the paused one');
});

test('a second finished job no longer destroys the first', () => {
  // The whole point: one slot meant an overnight pair lost the earlier job.
  let e = mergePollSuccess(null, aJob('a.gcode', 10, 100), 1000);
  e = mergePollSuccess(e, ended('a.gcode', 100, 3600), 2000);
  e = mergePollSuccess(e, aJob('b.gcode', 10, 100), 3000);
  e = mergePollSuccess(e, ended('b.gcode', 200, 7200), 4000);

  assert.equal(e.completions.length, 2);
  assert.equal(e.completions[0].filename, 'b.gcode', 'newest first');
  assert.equal(e.completions[1].filename, 'a.gcode', 'and the older one survives');
  assert.equal(e.lastCompleted, e.completions[0], 'lastCompleted stays the head, so old readers are unaffected');
});

test('the history is bounded', () => {
  let e = null;
  for (let i = 0; i < COMPLETIONS_KEPT + 5; i++) {
    e = mergePollSuccess(e, aJob(`j${i}.gcode`, 10, 100), i * 100 + 1);
    e = mergePollSuccess(e, ended(`j${i}.gcode`, 20 + i, 200), i * 100 + 50);
  }
  assert.equal(e.completions.length, COMPLETIONS_KEPT, 'a long-running shop must not grow this without limit');
  assert.equal(e.completions[0].filename, `j${COMPLETIONS_KEPT + 4}.gcode`, 'and it keeps the newest');
});

test('the same job finishing at the same instant is one event, not two', () => {
  // Re-merging a poll that ALREADY read `complete` is handled a step earlier —
  // the state never leaves "not in job", so nothing is captured to duplicate.
  // The case the dedupe is actually for is a clock that does not advance: a
  // machine that starts and finishes again on the same timestamp produces a
  // byte-identical entry, and appending it would show the shop the same print
  // twice with no way to tell which was which.
  let e = mergePollSuccess(null, aJob('a.gcode', 10, 100), 1000);
  e = mergePollSuccess(e, ended('a.gcode', 100, 3600), 2000);
  assert.equal(e.completions.length, 1);

  e = mergePollSuccess(e, aJob('a.gcode', 10, 100), 2000);
  e = mergePollSuccess(e, ended('a.gcode', 100, 3600), 2000);
  assert.equal(e.completions.length, 1, 'same filename at the same instant is the same event');
});

test('findCompletion returns THIS job, not merely the latest', () => {
  let e = mergePollSuccess(null, aJob('wanted.gcode', 10, 100), 1000);
  e = mergePollSuccess(e, ended('wanted.gcode', 111, 3600), 2000);
  e = mergePollSuccess(e, aJob('other.gcode', 10, 100), 3000);
  e = mergePollSuccess(e, ended('other.gcode', 222, 7200), 4000);

  const hit = findCompletion(e, { filename: 'wanted.gcode' });
  assert.equal(hit.actuals.filamentGrams, 111, 'the order that names its file gets its own numbers');
  assert.equal(findCompletion(e, { filename: 'WANTED.GCODE  ' }).actuals.filamentGrams, 111, 'case and padding are not the shop\'s problem');
});

test('findCompletion falls back to the newest, which is what it always did', () => {
  let e = mergePollSuccess(null, aJob('a.gcode', 10, 100), 1000);
  e = mergePollSuccess(e, ended('a.gcode', 100, 3600), 2000);
  assert.equal(findCompletion(e, {}).actuals.filamentGrams, 100, 'no filename known');
  assert.equal(findCompletion(e, { filename: 'never-seen.gcode' }).actuals.filamentGrams, 100, 'no match');
  assert.equal(findCompletion(null, {}), null);
  assert.equal(findCompletion({}, {}), null);
});

test('findCompletion reads a cache saved before this change', () => {
  // Entries persisted by an older build have lastCompleted and no history.
  const old = { lastCompleted: { at: 5, filename: 'old.gcode', actuals: { filamentGrams: 7, durationS: 70 } } };
  assert.equal(findCompletion(old, {}).actuals.filamentGrams, 7);
  assert.equal(findCompletion(old, { filename: 'old.gcode' }).actuals.filamentGrams, 7);
});

test('a failed poll keeps the history', () => {
  let e = mergePollSuccess(null, aJob('a.gcode', 10, 100), 1000);
  e = mergePollSuccess(e, ended('a.gcode', 100, 3600), 2000);
  const blip = mergePollFailure(e, 'ETIMEDOUT', 3000);
  assert.equal(blip.completions.length, 1, 'a Wi-Fi hiccup must not cost a measurement');
});
