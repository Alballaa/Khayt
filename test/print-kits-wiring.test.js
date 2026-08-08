/**
 * Kits, as wired into the print log.
 *
 * lib/print-kits.js is where the totalling is tested. What can only go wrong
 * here is the plumbing, and three of those failures are quiet enough to ship:
 *
 *   1. A kit that does not survive a Settings save. `settings` is REBUILT from
 *      the form by saveSettingsFromForm(), so anything written elsewhere is
 *      dropped unless it is carried across explicitly — silently, on the next
 *      unrelated visit to Settings. printLibrary carries a comment about exactly
 *      this; kits is the second field to need it.
 *   2. A rollup shown without saying how much of it was measured. The whole
 *      point of lib/print-kits.js is that a total can omit jobs; printing the
 *      total and hiding the count puts the bug back at the last step.
 *   3. A button wired to a function the other IIFE cannot see, or a listener
 *      bound to a node that is re-rendered out from under it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const logs = read('renderer/logs.js');
const settingsJs = read('renderer/settings.js');
const wire = read('renderer/wire-events.js');
const html = read('renderer/index.html');

test('a kit survives a Settings save', () => {
  // saveSettingsFromForm() rebuilds `settings` from the DOM. A kit is created by
  // the log's batch bar and has no field on that page, so without this line it
  // is dropped the next time anyone saves Settings for an unrelated reason.
  const at = settingsJs.indexOf('function saveSettingsFromForm(');
  assert.ok(at > -1, 'saveSettingsFromForm went missing');
  const body = settingsJs.slice(at, settingsJs.indexOf('\n}', at));
  assert.match(body, /kits:\s*settings\.kits \|\| \[\]/,
    'kits are not carried across the settings rebuild — they vanish on the next Settings save');
});

test('the rollup never shows a total without saying what is behind it', () => {
  const at = logs.indexOf('function renderKitStrip(');
  const body = logs.slice(at, logs.indexOf('\n}', at));
  assert.match(body, /r\.measuredTime < r\.jobs/,
    'a partly-measured kit is displayed as if every job counted');
  assert.match(body, /mixedCurrency/, 'two currencies would be shown added together');
});

test('the strip reads the tested module rather than totalling inline', () => {
  // A second implementation of the sum is a second place for the null bug.
  const at = logs.indexOf('function renderKitStrip(');
  const body = logs.slice(at, logs.indexOf('\n}', at));
  assert.match(body, /KhaytPrintKits\.groupByKit\(printLog, settings\.kits/);
  assert.doesNotMatch(body, /reduce\(/, 'the strip totals things itself instead of using the module');
});

test('the module is actually loaded, or the strip is dead on arrival', () => {
  assert.match(html, /<script src="\.\.\/lib\/print-kits\.js"><\/script>/,
    'lib/print-kits.js is never loaded, so KhaytPrintKits is undefined at render time');
});

test('the strip is guarded for the flavour that does not load the module', () => {
  // bedready.html does not ship logs-tab and does not load this lib. The guard
  // is what stops a ReferenceError if renderLogs is ever reached there.
  const at = logs.indexOf('function renderKitStrip(');
  const body = logs.slice(at, logs.indexOf('\n}', at));
  assert.match(body, /typeof KhaytPrintKits === 'undefined'/, 'no guard for a shell without the module');
});

test('every kit control is wired to something that exists and is exported', () => {
  assert.match(html, /id="btnBatchKit"/, 'the batch-bar button is not in the markup');
  assert.match(html, /id="kitStrip"/, 'the strip has nowhere to render');
  assert.match(wire, /#btnBatchKit'\)\?\.addEventListener/, 'a dead button');
  // The strip is re-rendered on every renderLogs(), so per-button listeners
  // would be lost on the next draw — the disband click has to be delegated.
  assert.match(wire, /#kitStrip'\)\?\.addEventListener\('click'/,
    'disband is bound to buttons that get replaced on the next render');
  const at = logs.indexOf('const api = {');
  assert.ok(at > -1, "logs.js's export object moved — this check is anchored on it");
  const api = logs.slice(at, at + 1600);
  for (const fn of ['batchAddToKit', 'renderKitStrip', 'disbandKit']) {
    assert.match(logs, new RegExp(`function ${fn}\\(`), `${fn} is not defined`);
    assert.match(api, new RegExp(`\\b${fn},`), `${fn} is not exported — its control does nothing`);
  }
});

test('the strip is drawn whenever the log is', () => {
  const at = logs.indexOf('function renderLogs(');
  const body = logs.slice(at, logs.indexOf('\n}\n', at));
  assert.ok(body.includes('renderKitStrip()'), 'the strip only appears if something else redraws it');
});

test('disbanding a kit does not touch the prints', () => {
  const at = logs.indexOf('async function disbandKit(');
  const body = logs.slice(at, logs.indexOf('\n}', at));
  assert.match(body, /delete o\.kitId/, 'jobs keep pointing at a kit that no longer exists');
  assert.doesNotMatch(body, /printLog\s*=\s*|splice\(|\.filter\(\(o\)/,
    'disbanding removes print-log entries — it must only unfile them');
  assert.match(body, /confirmModal/, 'a kit is disbanded with no confirmation');
});

test('a job in a deleted kit still shows as filed', () => {
  // groupByKit keeps orphans; the row badge has to agree, or the same job reads
  // as "in a kit" in the strip and "not in one" in the table.
  assert.match(logs, /log\.kitId\s*\n?\s*\?/, 'the badge is keyed on the definition rather than the link');
  assert.match(logs, /kitOf \? kitOf\.name : \(t\('kit\.orphaned'\)/,
    'an orphaned job shows a blank badge instead of saying the kit is gone');
});

test('two kits are not created for the same name', () => {
  const at = logs.indexOf('async function batchAddToKit(');
  const body = logs.slice(at, logs.indexOf('\n}', at));
  assert.match(body, /toLowerCase\(\) === clean\.toLowerCase\(\)/,
    'typing an existing kit name mints a second kit and splits the rollup in half');
});

test('the section is translated everywhere, placeholders intact', () => {
  const keys = ['kit.add_to', 'kit.name_prompt', 'kit.jobs', 'kit.measured', 'kit.vs_estimate',
    'kit.mixed_currency', 'kit.orphaned', 'kit.disband', 'kit.disband_confirm', 'kit.disbanded'];
  for (const code of ['en', 'ar', 'de', 'es', 'fr', 'ja', 'pt-BR', 'tr', 'zh']) {
    const loc = read(`renderer/locales/${code}.js`);
    for (const k of keys) assert.ok(loc.includes(`"${k}":`), `${code} is missing ${k}`);
    const line = loc.split('\n').find((l) => l.includes('"kit.disband_confirm"'));
    assert.ok(line.includes('{name}'), `${code}'s kit.disband_confirm dropped {name}`);
  }
});
