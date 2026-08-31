/**
 * What the app publishes, and what the storefront page actually reads.
 *
 * These are two repositories and nothing connected them, so a field could be
 * added to the payload, tested, shipped — and ignored by the page that receives
 * it. That is exactly what happened: the catalogue publish gained `photos` (up
 * to three, each labelled) and `alt` (the shop's second language), and
 * mobile/storefront.js read `it.photo`, `it.desc` and `it.nameAr` and nothing
 * else. A German-and-French shop published a catalogue whose own customers
 * could only read half of it, because the page's language was hard-coded:
 *
 *     const lang = (… === 'ar') ? 'ar' : 'en';
 *
 * Found by asking what the three verification passes structurally could not
 * see — all three ran inside the app.
 *
 * The storefront lives in khayt-cloud, which is a separate repo checked out at
 * khayt-cloud/ and gitignored, so it is absent in CI. The contract is pinned
 * here and cross-checked there when the repo is present.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SETTINGS = fs.readFileSync(path.join(ROOT, 'renderer', 'settings.js'), 'utf8');
const STOREFRONT = path.join(ROOT, 'khayt-cloud', 'mobile', 'storefront.js');

/** Fields the publish payload carries that the page has to understand. */
const CONTRACT = {
  'catalog.langs': /langs:\s*KhaytContentLanguages\.contentLangs/,
  'item.photos': /it\.photos = photos/,
  'item.alt': /it\.alt = \{ lang:/,
  'item.photo': /it\.photo = photos\[0\]\.src/,     // kept for older pages
  'item.nameAr': /nameAr: \(p\.nameAr \|\| ''\)/,   // kept for older pages
};

test('the publish payload still carries every field the storefront needs', () => {
  const build = SETTINGS.slice(SETTINGS.indexOf('const buildCatalog = '), SETTINGS.indexOf('#storeCopy'));
  for (const [field, re] of Object.entries(CONTRACT)) {
    assert.match(build, re, `the catalogue publish must send ${field}`);
  }
});

test('the storefront page reads them, where the cloud repo is checked out', {
  skip: fs.existsSync(STOREFRONT) ? false : 'khayt-cloud is a separate repo and is not present',
}, () => {
  const page = fs.readFileSync(STOREFRONT, 'utf8');
  for (const [field, marker] of [
    ['catalog.langs', /catalog && catalog\.langs/],
    ['item.photos', /it\.photos/],
    ['item.alt', /it\.alt/],
  ]) {
    assert.match(page, marker, `storefront.js must read ${field} — the app sends it`);
  }
  /* And the display language must not be hard-coded to two.
   *
   * `lang === 'ar' ? … : 'en'` is what made a German-and-French catalogue
   * unreadable: the page chose between a field that was German and one that
   * was empty.
   */
  assert.doesNotMatch(page, /const lang = \(\(qLang.*'ar'\) \? 'ar' : 'en'\);/,
    'the storefront language must come from the catalogue, not from a two-way guess');
  assert.match(page, /function pickLang\(\)/, 'it picks from the languages the catalogue declares');

  /* And the picking must happen AFTER the catalogue has arrived.
   *
   * This is not hypothetical tidiness — it is the bug this test was written
   * one revision too late to prevent. `applyStatic()` (which calls pickLang)
   * ran as the FIRST line of load(), six lines before `catalog = data.catalog`.
   * So it settled the language against a null catalogue, fell back to
   * en-or-ar, and the whole feature was inert while reading as correct.
   *
   * The page needs an early pass too, for the loading and not-found states
   * that never see a catalogue — so this asserts the SECOND one exists rather
   * than that the first does not.
   */
  const load = page.slice(page.indexOf('async function load()'));
  const assign = load.indexOf('catalog = data.catalog');
  assert.ok(assign > -1, 'load() must still be where the catalogue is assigned');
  assert.ok(load.indexOf('applyStatic()', assign) > -1,
    'the display language must be settled again after the catalogue loads, or it is picked from nothing');
  // Older catalogues, published before any of this, must still render.
  assert.match(page, /it\.photo \?/, 'a catalogue with a single unlabelled photo still shows it');
  assert.match(page, /it\.nameAr/, 'and one with only nameAr still shows an Arabic name');
});
