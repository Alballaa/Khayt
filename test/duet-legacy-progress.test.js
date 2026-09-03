'use strict';
/**
 * Duet's legacy progress field, read both ways because the vendor cannot say.
 *
 * From the Duet3D wiki's JSON-responses page (fetched 2026-09-03), describing
 * the pre-RRF-3 `rr_status?type=3` response:
 *
 *     "fractionPrinted": Fraction of the file printed on a scale of
 *     0.0 to 100.0. This equals filePosition / fileSize
 *
 * Those two clauses cannot both be true — the second is a ratio between 0 and 1.
 * The adjacent `// one decimal place` comment leans towards 0-100 (one decimal
 * on a 0-1 fraction gives eleven usable values). The reprap.org mirror asserts
 * 0-1 but reasons from the field's NAME. `fileSize` is absent from the type-3
 * response, so the ratio cannot be recomputed independently.
 *
 * Khayt multiplied by 100 unconditionally:
 *
 *     progress: normalizeProgress((data.fractionPrinted || 0) * 100)
 *
 * If 0-100 is the right reading, every print from 1% onward showed as COMPLETE
 * after the clamp — on the one Duet surface nobody here can test, which is why
 * it could sit there unreported.
 *
 * docs/PRINTER-PROTOCOL-AUDIT.md records the sources; this pins the behaviour.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { legacyProgressPercent } = require('../lib/duet.js');
const { normalizeProgress } = require('../lib/printer-status.js');

const ROOT = path.join(__dirname, '..');
const code = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** What the queue would actually display. */
const shown = (raw) => normalizeProgress(legacyProgressPercent(raw));

test('under the 0-100 reading, a running print is not called finished', () => {
  // The bug. Every one of these used to clamp to 100.
  for (const [raw, want] of [[5, 5], [45, 45], [99.9, 100], [100, 100]]) {
    assert.equal(shown(raw), want, `fractionPrinted ${raw} showed as ${shown(raw)}%`);
  }
});

test('under the 0-1 reading, a fraction still scales correctly', () => {
  for (const [raw, want] of [[0.05, 5], [0.45, 45], [0.999, 100], [1, 100]]) {
    assert.equal(shown(raw), want, `fractionPrinted ${raw} showed as ${shown(raw)}%`);
  }
});

test('the boundary belongs to the fraction reading', () => {
  // 1 is "finished" as a fraction and "1%" as a percentage. Reporting 100 is the
  // safe way round: a print at 1% briefly reading high is a cosmetic error; a
  // finished print reading 1% would look stuck.
  assert.equal(shown(1), 100);
  assert.equal(shown(1.0001), 1, 'just above the boundary is read as a percentage');
});

test('the one case it gets wrong is named, not hidden', () => {
  // Under the 0-100 reading a genuine 0.5% is reported as 50%. That is the
  // accepted cost of not picking a reading, and it errs towards showing
  // progress rather than towards calling a running print complete.
  assert.equal(shown(0.5), 50);
});

test('junk is zero, not NaN and not a guess', () => {
  for (const v of [undefined, null, '', 'x', NaN, -1, -0.5, {}, []]) {
    assert.equal(shown(v), 0, `${JSON.stringify(v)} produced ${shown(v)}`);
  }
});

test('an over-range value is still clamped by the caller', () => {
  // legacyProgressPercent does not clamp; normalizeProgress does, and main.js
  // wraps one in the other. Both halves matter.
  assert.equal(legacyProgressPercent(250), 250);
  assert.equal(shown(250), 100);
});

test('main.js uses it, and still clamps', () => {
  // The RAW source, not the comment-stripped one. The stripper used elsewhere in
  // this suite removes the wrong region of main.js — some construct in a string
  // or regex looks enough like a block comment to start one — and it silently
  // ate this line, so the first version of this test failed against correct
  // code. main.js mentions fractionPrinted exactly once, so there is no comment
  // for either assertion to match by accident.
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.equal((main.match(/fractionPrinted/g) || []).length, 1,
    'fractionPrinted appears more than once — these assertions can no longer be trusted');
  assert.match(main, /normalizeProgress\(KhaytDuet\.legacyProgressPercent\(data\.fractionPrinted\)\)/,
    'the legacy Duet path multiplies by 100 again, or stopped clamping');
  assert.ok(!/\(data\.fractionPrinted \|\| 0\) \* 100/.test(main),
    'the unconditional multiplication is back');
});

test('the audit records the source, per its own rule', () => {
  // "an audit nobody can retrace is a rumour" — docs/PRINTER-PROTOCOL-AUDIT.md
  const doc = fs.readFileSync(path.join(ROOT, 'docs/PRINTER-PROTOCOL-AUDIT.md'), 'utf8');
  assert.match(doc, /fractionPrinted/, 'the finding is not in the audit');
  assert.match(doc, /JSON-responses/, 'the source is not cited');
});
