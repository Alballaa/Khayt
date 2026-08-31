/**
 * Which languages a shop writes its content in.
 *
 * Khayt's interface speaks nine languages; its content spoke exactly two,
 * hard-coded. A shop selling only in Arabic still faced an English field, and a
 * Turkish or German shop could not enter its own language at all — the
 * interface translated for them, the thing they sell did not.
 *
 * The catalogue was inconsistent even within its two: a product had `nameEn`
 * and `nameAr` and a single `description`. The name could be bilingual and the
 * paragraph a customer reads to decide could not.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const CL = require('../lib/content-languages.js');

test('a shop that has never chosen gets exactly what it has today', () => {
  // The store file of a shop that never opens this setting must not change.
  assert.deepEqual(CL.contentLangs(undefined), ['en', 'ar']);
  assert.deepEqual(CL.contentLangs({}), ['en', 'ar']);
  assert.deepEqual(CL.contentLangs({ contentLangs: [] }), ['en', 'ar']);
});

test('a shop can pick one language, or two, and which ones', () => {
  assert.deepEqual(CL.contentLangs({ contentLangs: ['ar'] }), ['ar']);
  assert.deepEqual(CL.contentLangs({ contentLangs: ['tr'] }), ['tr']);
  assert.deepEqual(CL.contentLangs({ contentLangs: ['de', 'tr'] }), ['de', 'tr']);
  // The order is the shop's: it decides which field comes first.
  assert.deepEqual(CL.contentLangs({ contentLangs: ['ar', 'en'] }), ['ar', 'en']);
});

test('nonsense falls back rather than leaving a form with no fields', () => {
  // A product editor with no name field is a worse failure than one showing a
  // language the shop did not pick.
  assert.deepEqual(CL.contentLangs({ contentLangs: ['klingon'] }), ['en', 'ar']);
  assert.deepEqual(CL.contentLangs({ contentLangs: [null, ''] }), ['en', 'ar']);
  assert.deepEqual(CL.contentLangs({ contentLangs: 'en' }), ['en', 'ar']);
  assert.deepEqual(CL.contentLangs({ contentLangs: ['en', 'en'] }), ['en'], 'duplicates collapse');
  assert.equal(CL.contentLangs({ contentLangs: ['en', 'ar', 'tr'] }).length, 2, 'capped');
});

test('English and Arabic keep the keys every existing record uses', () => {
  // The whole back-compatibility story. Renaming these would be a migration
  // across the invoice templates, the storefront payload and the CSV importers
  // to buy nothing.
  assert.equal(CL.fieldKey('name', 'en'), 'nameEn');
  assert.equal(CL.fieldKey('name', 'ar'), 'nameAr');
  assert.equal(CL.fieldKey('description', 'en'), 'descriptionEn');
  // Everything else is suffixed, so a shop that stays on en/ar has a store file
  // identical to the one it has today.
  assert.equal(CL.fieldKey('name', 'tr'), 'name_tr');
  assert.equal(CL.fieldKey('name', 'pt-BR'), 'name_pt-BR');
});

test('reading falls back through the shop\'s languages, then anything filled in', () => {
  const p = { nameEn: 'Bracket', nameAr: 'حامل', name_tr: 'Braket' };
  assert.equal(CL.read(p, 'name', 'ar'), 'حامل');
  assert.equal(CL.read(p, 'name', 'tr'), 'Braket');
  // Asked for a language this product has no name in: fall back to the shop's.
  assert.equal(CL.read(p, 'name', 'de', { contentLangs: ['ar', 'en'] }), 'حامل');
  // A product filled in ONLY in a language nobody asked for still shows.
  // A Turkish name is a far better answer than a blank where the product goes.
  assert.equal(CL.read({ name_tr: 'Braket' }, 'name', 'en'), 'Braket');
  assert.equal(CL.read({}, 'name', 'en'), '');
});

test('an empty string is not an answer', () => {
  // A blank Arabic name must fall through to the English one, not win because
  // the key happens to exist.
  const p = { nameEn: 'Bracket', nameAr: '   ' };
  assert.equal(CL.read(p, 'name', 'ar'), 'Bracket');
});

test('the old single description is not lost', () => {
  // Products saved before this carry `description` with no language on it.
  const p = { description: 'A sturdy bracket.' };
  assert.equal(CL.read(p, 'description', 'en'), 'A sturdy bracket.');
  // And folding it in puts it where the shop will see and can edit it.
  CL.migratePlain(p, 'description', { contentLangs: ['ar', 'en'] });
  assert.equal(p.descriptionAr, 'A sturdy bracket.',
    'the first content language, which is a decision to keep it visible rather than a guess about what language it is in');
  // Never overwrites something already there.
  const q = { description: 'old', descriptionEn: 'new' };
  CL.migratePlain(q, 'description', { contentLangs: ['en'] });
  assert.equal(q.descriptionEn, 'new');
});

test('writing one language leaves the others alone', () => {
  const p = { nameEn: 'Bracket', nameAr: 'حامل' };
  CL.write(p, 'name', 'tr', 'Braket');
  assert.deepEqual(p, { nameEn: 'Bracket', nameAr: 'حامل', name_tr: 'Braket' });
  CL.write(p, 'name', 'ar', '');
  assert.equal(p.nameAr, '', 'clearing a field is a real edit, not a no-op');
  assert.equal(p.nameEn, 'Bracket');
});

test('every supported language has a name a shop would recognise', () => {
  for (const l of CL.SUPPORTED) {
    assert.ok(CL.languageName(l) && CL.languageName(l) !== l, `${l} needs a readable name`);
  }
  // In its OWN language: a shop picking Arabic should see العربية, not "Arabic".
  assert.equal(CL.languageName('ar'), 'العربية');
  assert.equal(CL.languageName('tr'), 'Türkçe');
});

/* ── the app-wide conversion ──────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const RENDERER = path.join(__dirname, '..', 'renderer');
const jsFiles = () => fs.readdirSync(RENDERER).filter((f) => f.endsWith('.js'))
  .map((f) => [f, fs.readFileSync(path.join(RENDERER, f), 'utf8')]);

test('nothing reads the shop\'s own text as a hard-coded English/Arabic pair', () => {
  /* `settings.bizEn || settings.bizAr` appeared in eighteen files. It is correct
   * for a shop writing those two languages and returns an EMPTY STRING for one
   * writing Turkish — so a Turkish shop printed an invoice with a blank business
   * name, published a storefront with no shop name, and had no way to notice
   * except by looking at the document.
   *
   * shopField() runs the same fallback chain everywhere instead.
   */
  const offenders = [];
  for (const [file, src] of jsFiles()) {
    // app-helpers.js holds the fallback shopField() itself uses when the module
    // is absent, which is the one place the raw fields are still the answer.
    if (file === 'app-helpers.js') continue;
    for (const m of src.matchAll(/settings\.(biz|addr|footer|invTerms|tagline)(En|Ar)\b/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      // A WRITE is fine — the settings form and the wizard have to put text
      // somewhere, and they choose the key from the shop's languages.
      const context = src.slice(Math.max(0, m.index - 60), m.index + m[0].length + 20);
      if (/=\s*$|=\s*[^=]/.test(context.slice(context.indexOf(m[0]) + m[0].length))) continue;
      offenders.push(`${file}:${line}  ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these read the shop's text as English-or-Arabic and return '' for any other language:\n  ${offenders.join('\n  ')}`);
});

test('the settings form builds its fields from the chosen languages', () => {
  const src = fs.readFileSync(path.join(RENDERER, 'settings.js'), 'utf8');
  assert.match(src, /function renderContentFields\(\)/,
    'the five shop-text fields are built per language, not hard-coded as pairs');
  assert.match(src, /\.\.\.readContentFields\(\)/,
    'and read back from whatever fields are on screen');
  // The old ten hard-coded save lines are gone.
  assert.doesNotMatch(src, /bizEn:\s*\$\('#set_bizEn'\)/);
  assert.doesNotMatch(src, /invTermsAr:\s*\$\('#set_invTermsAr'\)/);
});

test('a language the shop stops using keeps its text', () => {
  // Removing a language must not erase what was written in it: putting the
  // language back should bring the text with it. readContentFields only reads
  // fields that are ON SCREEN, and the save spreads over the existing settings.
  const src = fs.readFileSync(path.join(RENDERER, 'settings.js'), 'utf8');
  const fn = src.slice(src.indexOf('function readContentFields()'), src.indexOf('function renderContentLangsPicker'));
  assert.match(fn, /if \(el\) out\[key\] = el\.value\.trim\(\);/,
    'only on-screen fields are collected, so the rest survive the spread');
});

test('an interface language the shop does not write in does not win', () => {
  /* A shop that writes only Turkish, viewed on an English interface, must show
   * its TURKISH name — not the stale `bizEn` left over from setup, which is a
   * name it stopped using and may not recognise. What the reader's interface is
   * set to does not decide what the business is called.
   *
   * Found because shopField() defaults to the interface language: with the
   * module reading correctly, the helper still returned 'Khayt' for a shop
   * called Atölye Baskı.
   */
  const shop = { bizEn: 'Khayt', biz_tr: 'Atölye Baskı' };
  const settings = { contentLangs: ['tr'] };
  assert.equal(CL.read(shop, 'biz', 'en', settings), 'Atölye Baskı');
  assert.equal(CL.read(shop, 'biz', 'tr', settings), 'Atölye Baskı');
  // But a shop that DOES write English still gets English when English is asked for.
  assert.equal(CL.read(shop, 'biz', 'en', { contentLangs: ['en', 'tr'] }), 'Khayt');
  assert.equal(CL.read(shop, 'biz', 'tr', { contentLangs: ['en', 'tr'] }), 'Atölye Baskı');
  // With no settings at all, the caller's request is all there is to go on.
  assert.equal(CL.read(shop, 'biz', 'en'), 'Khayt');
});
