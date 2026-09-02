'use strict';
/**
 * The consent gate is four pieces in four files, and it is worth nothing unless
 * all four are connected.
 *
 *   scripts/changelog-section.js  puts the version's notes INTO the release
 *   lib/major-changes.js          reads "Before you update" out of them
 *   lib/updater.js                sends the verdict WITH the update offer
 *   renderer/update-ui.js         disables the download until it is accepted
 *
 * Each is tested on its own elsewhere. What is pinned here is that they are
 * wired to each other, because every one of them can pass its own tests while
 * the gate quietly does nothing — the release notes could go back to being a
 * link, or the renderer could render the checkbox and never read it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the release carries its own notes, not a link to them', () => {
  const wf = read('.github/workflows/release.yml');
  assert.match(wf, /scripts\/changelog-section\.js/,
    'the release body is not built from the CHANGELOG, so the app has nothing to show');
  assert.match(wf, /--notes-file/);
  // The old body was the same sentence on every release ever published, and it
  // is what made the update dialog say "Release notes were not included".
  const createBlock = wf.slice(wf.indexOf('gh release create'), wf.indexOf('gh release create') + 400);
  assert.doesNotMatch(createBlock, /--notes "See \[README\]/,
    'the release is being created with the boilerplate note again');
});

test('the updater parses the notes and sends the verdict with the offer', () => {
  const src = read('lib/updater.js');
  assert.match(src, /require\('\.\/major-changes'\)/);
  const send = src.slice(src.indexOf("send('update-available'"), src.indexOf("send('update-available'") + 500);
  assert.match(send, /majorChanges: parseMajorChanges\(notes\)/,
    'the offer goes out without the verdict, so the renderer cannot gate on it');
});

test('the download is what is gated, and it is gated on the checkbox', () => {
  const src = read('renderer/update-ui.js');
  assert.match(src, /majorChanges: info\.majorChanges/, 'the verdict is dropped on arrival');
  assert.match(src, /data-upd="download"\$\{gated \? ' disabled' : ''\}/,
    'the download button is not disabled for a gated release');
  assert.match(src, /download\.disabled = !accept\.checked/,
    'ticking the box does not enable the download');

  /* Gating the INSTALL instead would be no gate at all: autoInstallOnAppQuit is
   * true, so a downloaded update lands on the next quit whether or not anybody
   * pressed anything. This asserts the reason still holds. */
  assert.match(read('lib/updater.js'), /autoUpdater\.autoInstallOnAppQuit = true/);
  assert.match(read('lib/updater.js'), /autoUpdater\.autoDownload = false/);
});

test('an ordinary release is not gated — the rarity is the point', () => {
  const src = read('renderer/update-ui.js');
  // `gated` must be false unless the section exists AND lists something.
  assert.match(src, /const gated = !!\(major && major\.needsConsent && Array\.isArray\(major\.items\) && major\.items\.length\)/,
    'the gate condition has loosened — a prompt on every release is one nobody reads');
});

test('the consent wording is translated, not English in nine languages', () => {
  for (const loc of ['en', 'ar', 'de', 'es', 'fr', 'ja', 'pt-BR', 'tr', 'zh']) {
    const src = read(`renderer/locales/${loc}.js`);
    for (const key of ['upd.consent_head', 'upd.consent_accept', 'upd.intro_consent']) {
      assert.match(src, new RegExp(`"${key.replace('.', '\\.')}":\\s*"`), `${loc} has no ${key}`);
    }
  }
});
