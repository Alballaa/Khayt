'use strict';
/**
 * Groups and categories — the rules, on their own.
 *
 * The wiring is guarded separately (test/organise-wiring.test.js and
 * scripts/e2e-organise-smoke.mjs), because this codebase's signature failure is
 * a module that is right and reachable from nothing.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const O = require('../lib/organise.js');

test('a record filed before groups existed is already in one', () => {
  // `folder` is where groups used to live. Nothing is migrated; it is read.
  assert.equal(O.groupOf({ folder: 'Saudi Kings' }), 'Saudi Kings');
  assert.equal(O.groupOf({ group: 'Saudi Kings' }), 'Saudi Kings');
  // group wins where both exist and disagree — it is the field being written now.
  assert.equal(O.groupOf({ group: 'Kings', folder: 'stale' }), 'Kings');
  // An empty `group` is not an answer; fall through to folder rather than
  // reading a half-written record as unfiled.
  assert.equal(O.groupOf({ group: '', folder: 'Saudi Kings' }), 'Saudi Kings');
  assert.equal(O.groupOf({}), '');
  assert.equal(O.groupOf(null), '');
});

test('filing a record writes the old field too', () => {
  // renderer/bedready-library.js reads `.folder` directly, and so does every
  // build older than this one. Writing only `group` would file a record
  // somewhere half the app cannot see.
  const patch = O.assign({}, { group: 'Saudi Kings' });
  assert.equal(patch.group, 'Saudi Kings');
  assert.equal(patch.folder, 'Saudi Kings', 'the old field was left behind');
});

test('a field not named in the patch is not touched', () => {
  // `assign(rec, {category})` must not clear a group by omission — that would
  // make every edit dialog that sets one field a dialog that empties the other.
  const patch = O.assign({ group: 'Saudi Kings' }, { category: 'Busts' });
  assert.deepEqual(Object.keys(patch), ['category']);
  // …but an empty string IS an instruction: the shop cleared the box.
  const cleared = O.assign({ group: 'Saudi Kings' }, { group: '' });
  assert.equal(cleared.group, '');
  assert.equal(cleared.folder, '');
});

test('a name that matches one in use adopts its spelling', () => {
  const known = ['Saudi Kings', 'Busts'];
  assert.equal(O.unify('saudi kings', known), 'Saudi Kings');
  assert.equal(O.unify('  SAUDI   KINGS  ', known), 'Saudi Kings');
  // Anything else is new and is kept exactly as typed. This normalises
  // collisions; it does not impose a house style.
  assert.equal(O.unify('DnD minis', known), 'DnD minis');
  assert.equal(O.unify('', known), '');
  assert.equal(O.unify('   ', known), '');
});

test('one collection is one chip, however it has been spelled', () => {
  const recs = [
    { folder: 'Saudi Kings' }, { group: 'saudi kings' }, { group: 'Saudi Kings' },
    { group: 'Dragons' },
  ];
  // The count is the real one, not one spelling's share — that is the whole
  // point. A shop with a split group finds a third of its own collection.
  assert.deepEqual(O.counts(recs, 'group'), [['Saudi Kings', 3], ['Dragons', 1]]);
  // The label is the spelling used most, since that is the one they settled on.
  assert.deepEqual(O.counts([{ group: 'kings' }, { group: 'Kings' }, { group: 'Kings' }], 'group'),
    [['Kings', 3]]);
});

test('print files and products count as one library', () => {
  // A shop with "Saudi Kings" in both screens has ONE group, not two. Both are
  // records with a name on them, so both are read by the same rule.
  const printFile = { id: 'PF1', sourceFile: {}, folder: 'Saudi Kings' };
  const product = { id: 'PROD1', nameEn: 'King Abdulaziz bust', group: 'Saudi Kings' };
  assert.deepEqual(O.counts([printFile, product], 'group'), [['Saudi Kings', 2]]);
});

test('a name is trimmed, collapsed and capped', () => {
  assert.equal(O.normalise('  Saudi   Kings \n'), 'Saudi Kings');
  assert.equal(O.normalise('x'.repeat(200)).length, O.MAX);
  assert.equal(O.normalise(null), '');
  assert.equal(O.normalise(undefined), '');
  // Capping must not leave trailing space where the cut landed mid-gap.
  assert.equal(O.normalise('y'.repeat(O.MAX - 1) + '  tail').endsWith(' '), false);
});

test('membership ignores spelling on both sides', () => {
  const recs = [{ group: 'Saudi Kings' }, { folder: 'saudi kings' }, { group: 'Dragons' }];
  assert.equal(O.membersOf(recs, 'group', 'SAUDI KINGS').length, 2);
  assert.equal(O.isIn(recs[0], 'group', 'saudi kings'), true);
  // "unfiled" is not a group. Asking for '' must not match every unfiled record.
  assert.equal(O.isIn({ group: '' }, 'group', ''), false);
  assert.equal(O.membersOf(recs, 'group', '').length, 0);
});

test('an unknown field answers nothing rather than guessing', () => {
  assert.deepEqual(O.counts([{ group: 'x' }], 'tags'), []);
  assert.equal(O.isIn({ group: 'x' }, 'tags', 'x'), false);
});
