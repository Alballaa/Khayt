/**
 * Teaching the estimator what this shop's machines actually do.
 *
 * lib/stl-estimate.js needs a volumetric throughput, and "effective flow
 * including travel and acceleration overhead" is not something a shop knows
 * about its own printer. It has been 8 mm³/s for everyone since the estimator
 * was written — which, with PLA, implies about 35 g/h. Real FDM machines do not
 * sustain that, so every geometric time estimate has been optimistic.
 *
 * It never needed guessing. Density and throughput only appear multiplied
 * together, and that product is grams per hour — measured by every job that
 * reports both a weight and a duration.
 *
 * Most of these tests are about which jobs are ALLOWED to teach.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  MIN_JOBS, MAX_RELATIVE_SPREAD, readings, learnGramsPerHour, calibrate, applyCalibration,
} = require('../lib/estimate-calibration.js');
const { allocateActuals } = require('../lib/order-file-link.js');
const { estimateFromStl } = require('../lib/stl-estimate.js');

const deps = { allocate: allocateActuals };
const measured = { time: 'moonraker', weight: 'moonraker' };

/** A single-part, printer-measured job — the only kind that may teach. */
const job = (hours, grams, over = {}) => Object.assign({
  machineId: 'M1',
  actualPrintTime: hours, actualWeight: grams, actualsSource: measured,
  parts: [{ id: 'p', printFileId: 'F1', setupId: 'S1', printTime: hours, printWeight: grams, qty: 1 }],
}, over);

/** A shop that really prints about 12 g/h. */
const REAL_SHOP = [job(3, 36), job(4, 49), job(2, 23), job(5, 62)];

test('a shop\'s own rate is learned from its measured jobs', () => {
  const c = calibrate(REAL_SHOP, deps, { machineId: 'M1' });
  assert.ok(c, 'nothing was learned');
  assert.equal(c.scope, 'machine');
  assert.equal(c.jobs, 4);
  assert.ok(Math.abs(c.gramsPerHour - 12.1) < 0.2, `got ${c.gramsPerHour}`);
});

test('the hardcoded default really was wrong, and this is the size of it', () => {
  // 8 mm³/s × 1.24 g/cm³ × 3.6 = about 35 g/h. The demonstration matters more
  // than the arithmetic: the fix changes a real quote by nearly 3×.
  const cube = { volumeMm3: 8000, bbox: { x: 20, y: 20, z: 20 } };
  const before = estimateFromStl(cube, { infillPct: 0.2 });
  const impliedDefault = before.estWeightG / before.estPrintTimeH;
  assert.ok(impliedDefault > 30, `the old default implied ${impliedDefault.toFixed(1)} g/h`);

  const after = estimateFromStl(cube, applyCalibration({ infillPct: 0.2 }, calibrate(REAL_SHOP, deps, {})));
  const impliedLearned = after.estWeightG / after.estPrintTimeH;
  assert.ok(Math.abs(impliedLearned - 12.1) < 0.5, `learned rate did not reach the estimator: ${impliedLearned}`);
  assert.ok(after.estPrintTimeH > before.estPrintTimeH * 2, 'the honest estimate is much longer');
  assert.equal(after.estWeightG, before.estWeightG, 'and the WEIGHT is untouched — only the time was guessed');
});

test('one job teaches nothing', () => {
  // A calibration confident after a single print is worse than none.
  assert.equal(calibrate([job(3, 36)], deps, {}), null);
  assert.equal(calibrate([job(3, 36), job(4, 49)], deps, {}), null);
  assert.ok(MIN_JOBS >= 3);
  assert.ok(calibrate([job(3, 36), job(4, 49), job(2, 23)], deps, {}));
});

test('a typed figure is not evidence', () => {
  // Calibrating an estimator against somebody's estimate of their own past is
  // circular.
  const typed = REAL_SHOP.map((o) => Object.assign({}, o, {
    actualsSource: { time: 'manual', weight: 'manual' } }));
  assert.equal(calibrate(typed, deps, {}), null);

  const none = REAL_SHOP.map((o) => { const c = Object.assign({}, o); delete c.actualsSource; return c; });
  assert.equal(calibrate(none, deps, {}), null, 'no recorded provenance means assume typed');
});

test('an apportioned job is not evidence either', () => {
  // Its actuals were divided across parts BY THEIR ESTIMATES. Feeding that back
  // in teaches the estimator its own assumptions.
  const shared = REAL_SHOP.map((o) => Object.assign({}, o, {
    parts: [
      o.parts[0],
      { id: 'other', printFileId: 'F2', setupId: 'S2', printTime: 1, printWeight: 10, qty: 1 },
    ],
  }));
  assert.equal(readings(shared, deps, {}).length, 0);
  assert.equal(calibrate(shared, deps, {}), null);
});

test('jobs that disagree wildly describe no single rate', () => {
  // A shop whose readings are all over the place is not telling us a rate, and
  // averaging them produces a number that fits none of the jobs.
  const wild = [job(1, 60), job(10, 20), job(2, 90), job(8, 15)];
  assert.equal(calibrate(wild, deps, {}), null);
  assert.ok(MAX_RELATIVE_SPREAD > 0 && MAX_RELATIVE_SPREAD < 1);
});

test('one freak job does not move the answer', () => {
  // A print that sat paused overnight, or an hour typed wrong. The median holds;
  // a mean would not.
  const withFreak = [...REAL_SHOP, job(40, 30)];
  const c = calibrate(withFreak, deps, {});
  assert.ok(c, 'one outlier should not disqualify an otherwise consistent shop');
  assert.ok(Math.abs(c.gramsPerHour - 12.1) < 1.5, `the outlier moved it to ${c.gramsPerHour}`);
});

test('a machine with its own history describes itself', () => {
  const twoMachines = [
    ...REAL_SHOP,                                              // M1, ~12 g/h
    job(2, 60, { machineId: 'M2' }), job(3, 88, { machineId: 'M2' }),
    job(1, 31, { machineId: 'M2' }),                           // M2, ~30 g/h
  ];
  const m1 = calibrate(twoMachines, deps, { machineId: 'M1' });
  const m2 = calibrate(twoMachines, deps, { machineId: 'M2' });
  assert.equal(m1.scope, 'machine');
  assert.equal(m2.scope, 'machine');
  assert.ok(m2.gramsPerHour > m1.gramsPerHour * 2, 'the two machines are not averaged together');
});

test('a machine with no history borrows the shop\'s', () => {
  // Better than a constant written years ago, and honest about where it came
  // from.
  const c = calibrate(REAL_SHOP, deps, { machineId: 'BRAND-NEW' });
  assert.ok(c);
  assert.equal(c.scope, 'shop');
});

test('nothing learned means the configured value is kept', () => {
  // The honest outcome. A shop with no history keeps whatever it set.
  const opts = { infillPct: 0.2, throughputMm3PerS: 8, densityGPerCm3: 1.24 };
  assert.deepEqual(applyCalibration(opts, null), opts);
  assert.deepEqual(applyCalibration(opts, { gramsPerHour: 0 }), opts);
  assert.deepEqual(applyCalibration(opts, {}), opts);
});

test('a calibrated estimate says where the number came from', () => {
  // A measured rate and a guessed one must not present identically.
  const cal = calibrate(REAL_SHOP, deps, { machineId: 'M1' });
  const applied = applyCalibration({ infillPct: 0.2 }, cal);
  assert.deepEqual(applied.calibratedFrom, { scope: 'machine', jobs: 4, spread: cal.spread });
  assert.equal(applyCalibration({ infillPct: 0.2 }, null).calibratedFrom, undefined);
});

test('how far the jobs disagreed travels with the rate', () => {
  // Grams-per-hour is not a machine constant: on one real printer it ran from
  // 1.9 to 48.6 g/h across 67 jobs, following the part rather than the machine,
  // while the slicer's own time estimate for those jobs held to about ±5%. The
  // median is still the best single number, but a caller handed it WITHOUT the
  // spread cannot tell the shop how much of a number it is holding — so the
  // spread has to survive the hop, not be recomputed or guessed downstream.
  const cal = calibrate(REAL_SHOP, deps, { machineId: 'M1' });
  assert.ok(Number.isFinite(cal.spread), 'calibrate reports a spread');
  const applied = applyCalibration({ infillPct: 0.2 }, cal);
  assert.equal(applied.calibratedFrom.spread, cal.spread, 'and applyCalibration forwards it');

  // A calibration that somehow carries no spread must say so rather than
  // inventing a zero, which would read as "every job agreed exactly".
  const noSpread = applyCalibration({ infillPct: 0.2 }, { gramsPerHour: 20, jobs: 5, scope: 'shop' });
  assert.equal(noSpread.calibratedFrom.spread, null);
});

test('the calibration respects the density it is applied against', () => {
  // grams-per-hour is fixed; the throughput that expresses it depends on what
  // the filament weighs. A shop on a denser material must not have its time
  // estimate silently change.
  const cal = { gramsPerHour: 12, scope: 'shop', jobs: 5 };
  const pla = applyCalibration({ densityGPerCm3: 1.24 }, cal);
  const petg = applyCalibration({ densityGPerCm3: 1.27 }, cal);
  assert.ok(petg.throughputMm3PerS < pla.throughputMm3PerS);
  // Both still express 12 g/h.
  assert.ok(Math.abs(pla.throughputMm3PerS * 1.24 * 3.6 - 12) < 1e-9);
  assert.ok(Math.abs(petg.throughputMm3PerS * 1.27 * 3.6 - 12) < 1e-9);
});

test('junk in, nothing out', () => {
  for (const bad of [null, undefined, 'x', 42, [], [null, 5]]) {
    assert.equal(calibrate(bad, deps, {}), null, JSON.stringify(bad));
    assert.deepEqual(readings(bad, deps, {}), [], JSON.stringify(bad));
  }
  assert.deepEqual(readings(REAL_SHOP, null, {}), [], 'no allocator, no readings');
  assert.deepEqual(readings(REAL_SHOP, {}, {}), []);
  assert.doesNotThrow(() => calibrate(REAL_SHOP, deps));
  // A job with a zero on either axis teaches nothing rather than dividing by it.
  assert.equal(readings([job(0, 30), job(3, 0)], deps, {}).length, 0);
});

test('learnGramsPerHour reports how much agreement it found', () => {
  const c = learnGramsPerHour(REAL_SHOP, deps, {});
  assert.equal(c.jobs, 4);
  assert.ok(c.spread >= 0 && c.spread <= MAX_RELATIVE_SPREAD);
});
