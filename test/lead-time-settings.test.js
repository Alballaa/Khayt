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
  // see why — not silently fail to publish hours later with nothing said.
  const block = JS.slice(JS.indexOf('leadTime: {'), JS.indexOf('quoteFollowUp: {'));
  assert.match(block, /Math\.min\(24,/, 'dailyHours caps at 24, as the endpoint does');
  assert.match(block, /Math\.min\(7,/, 'workingDaysPerWeek caps at 7');
  assert.match(block, /Math\.min\(90,/, 'the day buffers cap at 90');
  assert.match(block, /Math\.max\(1,/, 'and hours per day cannot be zero');
});

test('staleAfterHours is preserved, not silently dropped', () => {
  // It is not on the form — it describes the publish schedule rather than a
  // business decision — so the collector must spread the existing object rather
  // than rebuild it, or saving settings would erase it.
  const block = JS.slice(JS.indexOf('leadTime: {'), JS.indexOf('quoteFollowUp: {'));
  assert.match(block, /\.\.\.\(settings\.leadTime \|\| \{\}\)/,
    'the collector must preserve fields the form does not show');
});

test('the safety margin explains that it is not on the shop\'s own board', () => {
  // Otherwise a shop sees its schedule disagree with what it told a customer and
  // assumes one of them is broken.
  assert.match(HTML, /data-i18n="set\.lead_safety_hint"/);
});
