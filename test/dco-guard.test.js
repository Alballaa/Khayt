const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verdict } = require('../scripts/check-dco.js');

/**
 * CONTRIBUTING.md claimed unsigned PRs "can't be merged" while nothing checked,
 * so they could. These pin down what the guard demands and — the part that
 * decides whether it survives — what it must NOT block: a guard that fails a PR
 * for GitHub's own "Update branch" merge gets switched off within a week.
 */

const commit = (over = {}) => ({
  sha: 'a'.repeat(40),
  author: 'Turki Alballaa',
  email: 'alballaa@gmail.com',
  body: 'do a thing',
  ...over,
});

test('a commit with no sign-off is refused', () => {
  const r = verdict([commit()]);
  assert.equal(r.ok, false);
  assert.equal(r.unsigned.length, 1);
  assert.match(r.unsigned[0].why, /no Signed-off-by/);
});

test('a properly signed commit passes', () => {
  const r = verdict([commit({ body: 'do a thing\n\nSigned-off-by: Turki Alballaa <alballaa@gmail.com>' })]);
  assert.equal(r.ok, true);
});

test('the sign-off email must be the AUTHOR — someone else signing certifies nothing', () => {
  const r = verdict([commit({ body: 'do a thing\n\nSigned-off-by: Someone Else <someone@else.com>' })]);
  assert.equal(r.ok, false);
  assert.match(r.unsigned[0].why, /authored by alballaa@gmail\.com/);
});

test('email comparison ignores case, so GitHub casing quirks do not fail a real sign-off', () => {
  const r = verdict([commit({ email: 'Alballaa@Gmail.com', body: 'x\n\nSigned-off-by: T <alballaa@gmail.com>' })]);
  assert.equal(r.ok, true);
});

test('several sign-offs pass as long as one is the author', () => {
  const body = 'x\n\nSigned-off-by: Reviewer <rev@example.com>\nSigned-off-by: Turki Alballaa <alballaa@gmail.com>';
  assert.equal(verdict([commit({ body })]).ok, true);
});

test('a Co-Authored-By line is not a sign-off', () => {
  const r = verdict([commit({ body: 'x\n\nCo-Authored-By: Claude <noreply@anthropic.com>' })]);
  assert.equal(r.ok, false);
});

test('one unsigned commit among signed ones still fails, and names only that one', () => {
  const signed = commit({ sha: 'b'.repeat(40), body: 'x\n\nSigned-off-by: T <alballaa@gmail.com>' });
  const r = verdict([signed, commit({ sha: 'c'.repeat(40) })]);
  assert.equal(r.ok, false);
  assert.equal(r.unsigned.length, 1);
  assert.equal(r.unsigned[0].sha, 'c'.repeat(40));
});

test('an empty range passes — a CI wiring gap is not a contributor error', () => {
  assert.equal(verdict([]).ok, true);
  assert.equal(verdict(undefined).ok, true);
});

test('trailing whitespace and odd spacing in the trailer still count', () => {
  const r = verdict([commit({ body: 'x\n\nSigned-off-by:   Turki Alballaa   <alballaa@gmail.com>   ' })]);
  assert.equal(r.ok, true);
});
