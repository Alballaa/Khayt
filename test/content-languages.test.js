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
