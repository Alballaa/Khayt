/**
 * Saving the Settings page must not destroy settings the page does not show.
 *
 * saveSettingsFromForm() REPLACES `settings` with an object literal built from
 * the form. Every key that literal does not name is gone — silently, on a save
 * the shop made for an unrelated reason, with a green "Saved" toast over it.
 *
 * The file tried to hold that line by hand: two "preserve fields managed
 * outside this form — never silently drop them" blocks listing ~25 keys. A
 * hand-maintained list of everything anyone might add later is a list that goes
 * stale, and it had: nineteen keys were being dropped by the time this was
 * found. The worst was `cloud` — the shop's account, token and sync KEYSET — so
 * typing a business name signed them out of Khayt Cloud and destroyed the key
 * material for their encrypted backups. Also `slicers` (re-detect), `privacy`
 * and `telemetry` (consent choices, reset without asking), and the migration
 * flags `__designV26Migrated` / `_idDedupeDone`, which then re-ran.
 *
 * The fix is to spread the existing settings first, so omission preserves
 * instead of destroying. This pins that, because the failure is invisible in
 * review: the literal looks exhaustive whatever it happens to be missing.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'settings.js'), 'utf8');

/** The body of the `settings = { … }` literal in saveSettingsFromForm. */
function collectorBody() {
  const fn = SRC.indexOf('function saveSettingsFromForm(');
  assert.notEqual(fn, -1, 'saveSettingsFromForm has been renamed — update this test');
  const open = SRC.indexOf('settings = {', fn);
  assert.notEqual(open, -1, 'saveSettingsFromForm no longer rebuilds settings from a literal');
  return SRC.slice(open + 'settings = {'.length, SRC.indexOf('\n  };', open));
}

test('the Settings save preserves keys the form does not name', () => {
  const body = collectorBody();
  // Comments first: the explanation of WHY lives at the top of the literal.
  const firstEntry = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.trim()).filter(Boolean)[0];
  assert.equal(firstEntry, '...settings,',
    'the settings rebuild must start by spreading the settings it replaces, or every key\n' +
    '  the form does not name is destroyed on save. It was `cloud` last time, which cost a\n' +
    '  shop its cloud account and its sync keyset.');
});

test('cloud, the migration flags and the consent choices survive a save', () => {
  const body = collectorBody();
  const spreads = /(^|\n)\s*\.\.\.settings\s*,/.test(body);
  // Named individually so a regression reads as the bug it is rather than as a
  // structural complaint. Either the spread carries them or the literal must.
  for (const key of ['cloud', 'slicers', 'privacy', 'telemetry', '__designV26Migrated', '_idDedupeDone']) {
    const named = new RegExp(`(^|\\n)\\s*${key}\\s*:`).test(body);
    assert.ok(spreads || named, `a Settings save would drop settings.${key}`);
  }
});

test('no other wholesale settings rebuild has crept in unspread', () => {
  // The hazard is the pattern, not the one function. Any `settings = {` that is
  // not a spread is another copy of this bug waiting for its own key to matter.
  const sites = [...SRC.matchAll(/(^|[^.\w])settings\s*=\s*\{/g)];
  for (const m of sites) {
    // Strip comments BEFORE slicing: the explanation above the spread is longer
    // than any fixed window, and a window that cuts a block comment in half
    // leaves an unterminated /* that the stripper cannot match.
    const after = SRC.slice(m.index).replace(/\/\*[\s\S]*?\*\//g, '').slice(0, 400);
    assert.ok(/\.\.\.\s*settings\b/.test(after),
      `a settings rebuild near "${SRC.slice(m.index, m.index + 60).split('\n')[0]}" does not spread the existing settings`);
  }
  assert.ok(sites.length >= 1, 'expected to find the settings rebuild');
});
