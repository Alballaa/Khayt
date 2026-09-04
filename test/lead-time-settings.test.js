const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
const JS = fs.readFileSync(path.join(ROOT, 'renderer', 'settings.js'), 'utf8');
const STATE = fs.readFileSync(path.join(ROOT, 'renderer', 'app-state.js'), 'utf8');

/**
 * A settings field that is rendered but never read back is a field a shop fills
 * in and Khayt ignores — and for these, ignoring it means publishing a delivery
 * date computed from something the shop did not choose.
 *
 * The publish toggle is the one that matters most: if it renders and is not
 * collected, a shop can tick "let my store show a date", see it tick, and have
 * nothing published — or worse, untick it and keep publishing.
 */

const FIELDS = [
  'set_leadDailyHours',
  'set_leadDaysPerWeek',
  'set_leadFinishingDays',
  'set_leadDispatchDays',
  'set_leadSafetyDays',
  'set_leadPublish',
];

test('every lead-time field is in the form, populated, and collected', () => {
  const missing = [];
  for (const id of FIELDS) {
    if (!HTML.includes(`id="${id}"`)) missing.push(`${id}: not in index.html`);
    // Both directions go through the same `$('#id')` lookup, so two occurrences
    // is the round trip: one to fill the form, one to read it back.
    const uses = JS.split(`'#${id}'`).length - 1;
    if (uses < 2) missing.push(`${id}: appears ${uses}× in settings.js — needs populate AND collect`);
  }
  assert.deepEqual(missing, [], missing.join('\n  '));
});

test('the defaults match the engine, so a blank form is not a faster shop', () => {
  // A field left empty must fall back to what lib/lead-time.js would have used.
  // Defaulting hours-per-day high, or days-per-week to seven, would quietly
  // promise a shop that works round the clock.
  assert.match(STATE, /dailyHours:\s*8/);
  assert.match(STATE, /workingDaysPerWeek:\s*5/);
  assert.match(STATE, /safetyDays:\s*1/);
  assert.match(STATE, /publishToCloud:\s*false/, 'publishing must be opt-in');
});

test('the collector clamps to the range the cloud endpoint enforces', () => {
  // A value the endpoint would refuse should be refused here, where somebody can
  // see why — not silently fail to publish hours later with nothing said. The
  // rule is lib/settings-edit.js now, so this asks it with values past each edge.
  require('../lib/tax.js');
  const { apply } = require('../lib/settings-edit.js');
  const out = apply({}, { leadTime: { dailyHours: '30', workingDaysPerWeek: '9', finishingDays: '120',
                                      dispatchDays: '-4', safetyDays: '91', publishToCloud: true } }, { year: 2026 }).leadTime;
  assert.equal(out.dailyHours, 24, 'dailyHours caps at 24, as the endpoint does');
  assert.equal(out.workingDaysPerWeek, 7, 'workingDaysPerWeek caps at 7');
  assert.equal(out.finishingDays, 90, 'the day buffers cap at 90');
  assert.equal(out.safetyDays, 90);
  assert.equal(out.dispatchDays, 0, 'and cannot go below zero');
  assert.equal(apply({}, { leadTime: { dailyHours: '0' } }, { year: 2026 }).leadTime.dailyHours, 1,
    'and hours per day cannot be zero');
});

test('staleAfterHours is preserved, not silently dropped', () => {
  // It is not on the form — it describes the publish schedule rather than a
  // business decision — so the rule must spread the existing object rather
  // than rebuild it, or saving settings would erase it.
  require('../lib/tax.js');
  const { apply } = require('../lib/settings-edit.js');
  const out = apply({ leadTime: { staleAfterHours: 6, dailyHours: 10 } },
                    { leadTime: { dailyHours: '9' } }, { year: 2026 }).leadTime;
  assert.equal(out.staleAfterHours, 6, 'the rule must preserve fields the form does not show');
  assert.equal(out.dailyHours, 9);
});

test('the safety margin explains that it is not on the shop\'s own board', () => {
  // Otherwise a shop sees its schedule disagree with what it told a customer and
  // assumes one of them is broken.
  assert.match(HTML, /data-i18n="set\.lead_safety_hint"/);
});
