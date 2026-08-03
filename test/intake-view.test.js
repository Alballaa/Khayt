/**
 * How a read file is PRESENTED — the branch that can cost a shop money.
 *
 * lib/model-intake.js decides whether a number came from a slicer or from
 * geometry. If that distinction is lost on the way to the screen, a shop quotes
 * an estimate as though it were a sliced figure and eats the difference. So the
 * assertions here are mostly about wording and emphasis, not arithmetic.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { presentIntake } = require('../lib/intake-view.js');
const { estimateFromStl } = require('../lib/stl-estimate.js');

const CUBE = { volumeMm3: 8000, areaMm2: 2400, bbox: { x: 20, y: 20, z: 20 }, triangleCount: 12 };
const opts = { infillPct: 0.2, estimate: estimateFromStl };
const keys = (v) => v.note.map((l) => l.key);

test('a slicer result is applied and named as the slicer\'s own figures', () => {
  const v = presentIntake({
    exact: true, source: 'slicer', printTimeMins: 193, filamentGrams: 41.83,
    slicer: 'PrusaSlicer', filamentType: 'PLA', filename: 'part.3mf',
  }, opts);
  assert.equal(v.mode, 'exact');
  assert.equal(v.weightG, 41.8);
  assert.equal(v.timeH, 3.22, '193 min → 3.22 h');
  assert.deepEqual(keys(v), ['intake.exact']);
  assert.equal(v.note[0].vars.slicer, 'PrusaSlicer');
  assert.equal(v.toast.kind, 'success');
  assert.equal(v.material, 'PLA');
  // The estimate wording must be nowhere near an exact result.
  assert.ok(!keys(v).some((k) => k.includes('estimate')), 'not called an estimate');
});

test('a geometry result is labelled an estimate, emphasised, before any number', () => {
  const v = presentIntake({ exact: false, source: 'geometry', geometry: CUBE }, opts);
  assert.equal(v.mode, 'estimate');
  assert.equal(v.note[0].key, 'intake.estimate_head');
  assert.equal(v.note[0].strong, true, 'the caveat is emphasised');
  assert.ok(keys(v).includes('intake.estimate_advice'), 'and says what to do about it');
  assert.equal(v.toast.kind, 'info', 'not a success — nothing was measured');
  assert.equal(v.material, null, 'no material is claimed from geometry alone');
  assert.ok(v.weightG > 0 && v.timeH > 0, 'but it still fills the form');
});

test('the caveat comes FIRST, so it cannot be missed', () => {
  // A reader who stops after one line must already know this is not measured.
  const v = presentIntake({ exact: false, source: 'geometry', geometry: CUBE }, opts);
  const headIdx = keys(v).indexOf('intake.estimate_head');
  const numbersIdx = keys(v).indexOf('stl.note_tpl');
  assert.ok(headIdx < numbersIdx, `caveat at ${headIdx}, numbers at ${numbersIdx}`);
});

test('exact is not honoured without both numbers', () => {
  // A truthy `exact` with a missing half would fill the form with a zero. The
  // flag alone is not trusted.
  const timeOnly = presentIntake({ exact: true, source: 'slicer', printTimeMins: 120, filamentGrams: null }, opts);
  assert.notEqual(timeOnly.mode, 'exact');
  const gramsOnly = presentIntake({ exact: true, source: 'slicer', printTimeMins: 0, filamentGrams: 10 }, opts);
  assert.notEqual(gramsOnly.mode, 'exact');
});

test('the note and the form field are rounded identically', () => {
  // If the note says 41.8 g and the field holds 41.83, the shop cannot tell
  // which one the price used.
  const v = presentIntake({
    exact: true, source: 'slicer', printTimeMins: 193, filamentGrams: 41.83, slicer: 'Orca',
  }, opts);
  assert.equal(v.note[0].vars.grams, v.weightG);
  assert.equal(v.note[0].vars.time, v.timeH);

  const e = presentIntake({ exact: false, source: 'geometry', geometry: CUBE }, opts);
  const tpl = e.note.find((l) => l.key === 'stl.note_tpl');
  assert.equal(tpl.vars.weight, e.weightG);
  assert.equal(tpl.vars.time, e.timeH);
});

test('a missing slicer name is left for the caller to fill, not blanked', () => {
  const v = presentIntake({ exact: true, source: 'slicer', printTimeMins: 60, filamentGrams: 5 }, opts);
  assert.equal(v.note[0].vars.slicer, null, 'null signals "substitute a default"');
});

test('the shop\'s infill drives the estimate', () => {
  const low = presentIntake({ exact: false, source: 'geometry', geometry: CUBE }, { ...opts, infillPct: 0.05 });
  const high = presentIntake({ exact: false, source: 'geometry', geometry: CUBE }, { ...opts, infillPct: 0.9 });
  assert.ok(high.weightG > low.weightG, `${high.weightG} should exceed ${low.weightG}`);
  const shown = (v) => v.note.find((l) => l.key === 'stl.note_assume').vars.infill;
  assert.equal(shown(low), 5);
  assert.equal(shown(high), 90);
});

test('an unreadable file explains which kind of unreadable', () => {
  const noSummary = presentIntake({ exact: false, source: null, warnings: ['no-slicer-summary'] }, opts);
  assert.equal(noSummary.mode, 'none');
  assert.equal(noSummary.toast.key, 'intake.no_summary');

  const unsupported = presentIntake({ exact: false, source: null, warnings: ['unsupported'] }, opts);
  assert.equal(unsupported.toast.key, 'intake.unsupported');

  const other = presentIntake({ exact: false, source: null, warnings: ['parse-failed'] }, opts);
  assert.equal(other.toast.key, 'calc.parse_failed');

  for (const bad of [null, undefined, {}]) {
    const v = presentIntake(bad, opts);
    assert.equal(v.mode, 'none', String(bad));
    assert.equal(v.weightG, null, 'and never invents a number');
  }
});

test('geometry with no estimator available degrades to "none", not to a raw volume', () => {
  // If stl-estimate did not load, showing 8000 mm3 in a grams field would be a
  // catastrophic misread. Better to say nothing.
  const v = presentIntake({ exact: false, source: 'geometry', geometry: CUBE }, { infillPct: 0.2 });
  assert.equal(v.mode, 'none');
  assert.equal(v.weightG, null);
});

test('a zero-volume mesh is not priced as a free part', () => {
  const v = presentIntake({ exact: false, source: 'geometry', geometry: { volumeMm3: 0, bbox: { x: 0, y: 0, z: 0 } } }, opts);
  assert.equal(v.mode, 'none');
});

/* ---- The options must actually arrive ---------------------------------
 * These exist because every test above passes an `opts` holding nothing but
 * `infillPct` and `estimate`, so none of them could notice that presentIntake
 * forwarded only the infill and dropped the rest. It did, and the calculator
 * quoted every unsliced file on the module defaults — PLA at 1.24 g/cm³ and a
 * shipped throughput — no matter what the shop had configured or measured.
 * ---------------------------------------------------------------------- */

test('the shop\'s density reaches the estimate, not just its infill', () => {
  const light = presentIntake({ exact: false, source: 'geometry', geometry: CUBE },
    { ...opts, densityGPerCm3: 1.04 });          // ABS
  const heavy = presentIntake({ exact: false, source: 'geometry', geometry: CUBE },
    { ...opts, densityGPerCm3: 4.0 });           // a filled filament
  assert.ok(heavy.weightG > light.weightG * 3,
    `density is being ignored: ${heavy.weightG} vs ${light.weightG}`);
  // And the note must quote the shop's figure, not the default it fell back to.
  const shown = (v) => v.note.find((l) => l.key === 'stl.note_assume').vars.density;
  assert.equal(shown(light), 1.04);
  assert.equal(shown(heavy), 4.0);
});

test('the shop\'s wall thickness reaches the estimate', () => {
  const thin = presentIntake({ exact: false, source: 'geometry', geometry: CUBE },
    { ...opts, wallThicknessMm: 0.4 });
  const thick = presentIntake({ exact: false, source: 'geometry', geometry: CUBE },
    { ...opts, wallThicknessMm: 3.6 });
  assert.ok(thick.weightG > thin.weightG,
    `wall thickness is being ignored: ${thick.weightG} vs ${thin.weightG}`);
});

test('a calibrated throughput changes the TIME and leaves the weight alone', () => {
  // The whole point of lib/estimate-calibration.js: only the time was ever
  // guessed. A calibration that moved the weight would be changing an answer
  // nobody asked it to.
  const base = presentIntake({ exact: false, source: 'geometry', geometry: CUBE }, opts);
  const slow = presentIntake({ exact: false, source: 'geometry', geometry: CUBE },
    { ...opts, throughputMm3PerS: 2.7, calibratedFrom: { scope: 'shop', jobs: 4 } });
  assert.ok(slow.timeH > base.timeH,
    `a slower measured rate must mean a longer job: ${slow.timeH} vs ${base.timeH}`);
  assert.equal(slow.weightG, base.weightG, 'calibration must not touch the weight');
});

test('a measured rate and a guessed one never read the same', () => {
  const guessed = presentIntake({ exact: false, source: 'geometry', geometry: CUBE }, opts);
  const measured = presentIntake({ exact: false, source: 'geometry', geometry: CUBE },
    { ...opts, throughputMm3PerS: 2.7, calibratedFrom: { scope: 'shop', jobs: 4 } });

  const keyOf = (v) => v.note.map((l) => l.key).find((k) => k.startsWith('stl.note_rate_'));
  assert.equal(keyOf(guessed), 'stl.note_rate_assumed');
  assert.equal(keyOf(measured), 'stl.note_rate_measured');
  assert.notEqual(keyOf(guessed), keyOf(measured));

  // The count is what makes "measured" checkable rather than a claim.
  const line = measured.note.find((l) => l.key === 'stl.note_rate_measured');
  assert.equal(line.vars.n, 4);
});

test('the rate in the note is the rate the time was built on', () => {
  // Shown in grams per hour because that is the only form a shop can measure;
  // the estimator works in mm3/s. If these drift apart the note is describing a
  // different estimate from the one in the form.
  const v = presentIntake({ exact: false, source: 'geometry', geometry: CUBE },
    { ...opts, densityGPerCm3: 1.24, throughputMm3PerS: 2.7, calibratedFrom: { scope: 'shop', jobs: 5 } });
  const line = v.note.find((l) => l.key === 'stl.note_rate_measured');
  assert.equal(line.vars.rate, Math.round(1.24 * 2.7 * 3.6 * 10) / 10);
  assert.equal(v.calibrated.gramsPerHour, line.vars.rate, 'the structured figure and the prose agree');
});

test('provenance is structured, not only prose', () => {
  // A caller styling the block, and a test asserting on it, must not have to
  // parse a translated sentence.
  const guessed = presentIntake({ exact: false, source: 'geometry', geometry: CUBE }, opts);
  assert.equal(guessed.calibrated, null);

  const measured = presentIntake({ exact: false, source: 'geometry', geometry: CUBE },
    { ...opts, calibratedFrom: { scope: 'machine', jobs: 6 } });
  assert.equal(measured.calibrated.scope, 'machine');
  assert.equal(measured.calibrated.jobs, 6);
});

test('a calibration nobody earned is not presented as measured', () => {
  // calibrate() returns null rather than a zero-job result, but the renderer
  // spreads whatever it is given — a malformed marker must not upgrade a guess.
  for (const bad of [{ scope: 'shop', jobs: 0 }, { scope: 'shop' }, {}]) {
    const v = presentIntake({ exact: false, source: 'geometry', geometry: CUBE },
      { ...opts, calibratedFrom: bad });
    assert.equal(v.calibrated, null, JSON.stringify(bad));
    assert.ok(v.note.some((l) => l.key === 'stl.note_rate_assumed'), JSON.stringify(bad));
  }
});

test('mode never claims more certainty than the source supports', () => {
  // The invariant the UI depends on.
  const cases = [
    { exact: true, source: 'slicer', printTimeMins: 100, filamentGrams: 10 },
    { exact: false, source: 'geometry', geometry: CUBE },
    { exact: false, source: null, warnings: ['unsupported'] },
  ];
  for (const c of cases) {
    const v = presentIntake(c, opts);
    if (v.mode === 'exact') assert.equal(c.source, 'slicer');
    if (v.mode === 'estimate') assert.equal(c.source, 'geometry');
    if (v.mode !== 'exact') {
      assert.ok(!v.note.some((l) => l.key === 'intake.exact'),
        'only an exact result may use the exact wording');
    }
  }
});
