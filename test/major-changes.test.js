'use strict';
/**
 * What a shop is asked to agree to, and — more importantly — what it is NOT.
 *
 * The gate is only worth having if it is rare. A prompt that appears on every
 * release is a prompt everybody learns to click through without reading, which
 * is worse than no prompt at all: it trains the habit and then one day carries
 * something that mattered. So most of these tests are about the section being
 * ABSENT, malformed, or merely mentioned in passing, and the answer in every
 * one of those cases being "no gate".
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMajorChanges, HEADING } = require('../lib/major-changes.js');

test('an ordinary release asks nobody to agree to anything', () => {
  for (const notes of [
    '',
    null,
    undefined,
    '### Fixed\n\n- A photo too big for the cloud is no longer sent and lost.',
    'See [README](https://github.com/KhaytApp/Khayt#readme) for full release notes.',
  ]) {
    const r = parseMajorChanges(notes);
    assert.equal(r.needsConsent, false, JSON.stringify(notes));
    assert.deepEqual(r.items, []);
  }
});

test('a release that declares one is read as a list of sentences', () => {
  const r = parseMajorChanges([
    '## [3.8.0] - 2026-09-09',
    '',
    '### Before you update',
    '',
    '- The buttons on a print file have moved into a ··· menu.',
    '- Folders are called Collections now. Nothing you filed has moved.',
    '',
    '### Fixed',
    '',
    '- Something unrelated.',
  ].join('\n'));
  assert.equal(r.needsConsent, true);
  assert.deepEqual(r.items, [
    'The buttons on a print file have moved into a ··· menu.',
    'Folders are called Collections now. Nothing you filed has moved.',
  ]);
});

test('the list stops at the next heading, and does not swallow the release', () => {
  const r = parseMajorChanges([
    '### Before you update',
    '- One thing.',
    '### Fixed',
    '- Not a thing anyone has to agree to.',
    '- Nor this.',
  ].join('\n'));
  assert.deepEqual(r.items, ['One thing.']);
});

test('an empty section is a drafting mistake, not a gate', () => {
  // Blocking an update on a heading with nothing under it asks somebody to
  // accept the unstated, which is worse than not asking.
  const r = parseMajorChanges('### Before you update\n\n### Fixed\n\n- x');
  assert.equal(r.needsConsent, false);
  assert.deepEqual(r.items, []);
});

test('merely mentioning the phrase does not gate a release', () => {
  const r = parseMajorChanges([
    '### Fixed',
    '- The dialog now says "before you update" in the right language.',
    '- Read this before you update your printer firmware.',
  ].join('\n'));
  assert.equal(r.needsConsent, false);
});

test('HTML notes are read too — GitHub does not always hand back markdown', () => {
  const r = parseMajorChanges(
    '<h3>Before you update</h3><ul><li>The buttons on a print file have moved.</li>'
    + '<li>Folders are called <strong>Collections</strong>.</li></ul><h3>Fixed</h3><ul><li>x</li></ul>');
  assert.equal(r.needsConsent, true);
  assert.deepEqual(r.items, [
    'The buttons on a print file have moved.',
    'Folders are called Collections.',
  ]);
});

test('markdown emphasis and links are stripped — this is a dialog, not a page', () => {
  const r = parseMajorChanges([
    '### Before you update',
    '- **Delete** moved into the `···` menu — see [the notes](https://example.com/x).',
  ].join('\n'));
  assert.deepEqual(r.items, ['Delete moved into the ··· menu — see the notes.']);
});

test('a wrapped bullet stays one change, not two', () => {
  const r = parseMajorChanges([
    '### Before you update',
    '- The buttons on a print file have moved into a ··· menu,',
    '  and Delete now sits under a divider at the bottom of it.',
  ].join('\n'));
  assert.equal(r.items.length, 1);
  assert.match(r.items[0], /divider at the bottom of it\.$/);
});

test('script and style content never reaches the dialog', () => {
  const r = parseMajorChanges(
    '<h3>Before you update</h3><script>alert(1)</script><ul><li>A real change.</li></ul>');
  assert.deepEqual(r.items, ['A real change.']);
  assert.ok(!JSON.stringify(r).includes('alert'));
});

test('the heading is exported, so the changelog and the parser cannot drift', () => {
  // scripts/check-major-changes.js and the CHANGELOG convention both read this
  // rather than each spelling the phrase out.
  assert.equal(HEADING, 'Before you update');
});
