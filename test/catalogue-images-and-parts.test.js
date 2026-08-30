/**
 * The two things the catalog could not do, and one it did wrong.
 *
 *   A product had ONE picture slot. `imagePath` plus `thumbnail`, no `multiple`
 *   on the picker, and saving a new one deleted the old. A shop selling a
 *   printed part had to choose between a render, a photo of the real thing, a
 *   scale shot and a detail.
 *
 *   Nothing said which was which. The question a customer is really asking of a
 *   listing is "is that a render, or is that what arrives" — and getting it
 *   wrong is a refund. The print library already separates `thumb` from
 *   `userPhoto`; the idea existed and had never reached products.
 *
 *   A catalog part was born with printWeight 0 and printTime 0 and the shop
 *   typed both, while the print library held exactly those numbers. Even the
 *   order editor, which HAS a print-file picker, only copied the filename.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PI = require('../lib/product-images.js');
const PF = require('../lib/part-from-print-file.js');

/* ── images ───────────────────────────────────────────────────────────────── */

test('a product saved before this feature keeps its picture', () => {
  // The migration that matters: every existing product in every existing store.
  const p = { id: 'PRD-1', imagePath: 'prod-1.jpg', thumbnail: 'data:image/jpeg;base64,AAA' };
  const n = PI.normalise(p);
  assert.equal(n.images.length, 1);
  assert.equal(n.images[0].path, 'prod-1.jpg');
  assert.equal(n.images[0].thumbnail, 'data:image/jpeg;base64,AAA');
  // And it is NOT claimed to be a photo of a real print. Nobody said that.
  assert.equal(n.images[0].kind, 'render');
});

test('a product with no picture at all does not gain an empty one', () => {
  const n = PI.normalise({ id: 'PRD-2' });
  assert.deepEqual(n.images, []);
  assert.equal(n.imagePath, '');
  assert.equal(n.thumbnail, '');
});

test('the legacy fields stay in step with the primary image', () => {
  // Every other part of the app reads imagePath/thumbnail — the storefront, the
  // published portal, label printing. They are a VIEW of images[0], and a view
  // that drifts is worse than no view.
  const p = PI.apply({
    id: 'PRD-3',
    images: [
      { id: 'a', path: 'one.jpg', thumbnail: 't1', kind: 'render' },
      { id: 'b', path: 'two.jpg', thumbnail: 't2', kind: 'print' },
    ],
  });
  assert.equal(p.imagePath, 'one.jpg');
  PI.makePrimary(p, 'b');
  assert.equal(p.images[0].id, 'b');
  assert.equal(p.imagePath, 'two.jpg', 'promoting an image must move the legacy view with it');
  assert.equal(p.thumbnail, 't2');
});

test('removing the primary promotes the next one rather than leaving a dead path', () => {
  const p = PI.apply({
    id: 'PRD-4',
    images: [{ id: 'a', path: 'one.jpg', kind: 'render' }, { id: 'b', path: 'two.jpg', kind: 'print' }],
  });
  const gone = PI.remove(p, 'a');
  assert.equal(gone.path, 'one.jpg', 'the caller needs this to unlink the file');
  assert.equal(p.imagePath, 'two.jpg');
  // And removing the LAST one empties the view instead of pointing at nothing.
  //
  // This is the case where the two meanings of "empty array" collide: on load it
  // means "not migrated yet, rebuild from imagePath", and after a delete it
  // means "there are no pictures". Getting that wrong resurrected the image that
  // had just been unlinked, so the listing showed a file that no longer existed.
  PI.remove(p, 'b');
  assert.equal(p.imagePath, '');
  assert.equal(p.thumbnail, '');
  assert.deepEqual(p.images, []);
});

test('a picture can be labelled, and only with a kind that exists', () => {
  const p = PI.apply({ id: 'PRD-5', images: [{ id: 'a', path: 'one.jpg' }] });
  assert.equal(p.images[0].kind, 'render', 'an unlabelled picture defaults to the claim that cannot mislead');
  assert.equal(PI.setKind(p, 'a', 'print'), true);
  assert.equal(p.images[0].kind, 'print');
  assert.equal(PI.setKind(p, 'a', 'photograph'), false, 'an unknown kind is refused, not stored');
  assert.equal(p.images[0].kind, 'print');
});

test('"does this listing show the real thing" is answerable across the catalog', () => {
  const render = { id: 'A', images: [{ id: 'a', path: 'x.jpg', kind: 'render' }] };
  const real = { id: 'B', images: [{ id: 'b', path: 'y.jpg', kind: 'print' }] };
  const detail = { id: 'C', images: [{ id: 'c', path: 'z.jpg', kind: 'detail' }] };
  assert.equal(PI.hasRealPhoto(render), false);
  assert.equal(PI.hasRealPhoto(real), true);
  assert.equal(PI.hasRealPhoto(detail), true, 'a close-up of the finish is a photo of the real thing');
  assert.equal(PI.hasRealPhoto({ id: 'D' }), false);
});

test('an older build that drops the array does not lose the picture', () => {
  // A store edited by an old build comes back with images:[] and the legacy
  // fields still set. The array normally wins; empty is the one case it must not.
  const p = { id: 'PRD-6', images: [], imagePath: 'kept.jpg', thumbnail: 'tk' };
  const n = PI.normalise(p);
  assert.equal(n.images.length, 1);
  assert.equal(n.images[0].path, 'kept.jpg');
});

/* ── parts from print files ───────────────────────────────────────────────── */

test('a part fills in from the slicer numbers, in the units a part uses', () => {
  const rec = {
    id: 'PF-1', name: 'Bracket', originalName: 'Bracket_PLA_3h48m.gcode',
    parsed: { filamentGrams: 129.18, printTimeMins: 228, filamentType: 'PLA' },
    setups: [],
  };
  const { fields, from, missing } = PF.partPatch(rec);
  assert.equal(fields.printWeight, 129.18);
  // 228 minutes is 3.8 hours. parsed keeps minutes and a part keeps hours; a
  // factor of sixty here would not look like an error, it would look like a very
  // fast printer.
  assert.equal(fields.printTime, 3.8);
  assert.equal(from.printTime, 'slicer');
  assert.equal(fields.material, 'PLA');
  assert.equal(fields.printFileId, 'PF-1');
  assert.equal(fields.fileRef, 'Bracket_PLA_3h48m.gcode');
  assert.deepEqual(missing, []);
});

test('a file the library only has metadata about still fills what it knows', () => {
  // This is the real shape of the reporting shop's library: eleven records made
  // from a printer's own history, every one with no file on disk, so `parsed` is
  // empty. That is a legitimate state, not a failure, and the setup still knows
  // the material, the layer height and the machine.
  const rec = {
    id: 'PF-2', name: 'MBS-ART-200mm-U1', parsed: {},
    setups: [{ id: 'S1', name: 'SnapmakerOrca 0.12 mm PLA', material: 'PLA+ 2.0',
      layerHeightMm: 0.12, machineId: 'MACH-1', ok: 3, failed: 0 }],
  };
  const { fields, from, missing } = PF.partPatch(rec);
  assert.equal(fields.material, 'PLA+ 2.0');
  assert.equal(from.material, 'setup');
  assert.equal(fields.layerHeight, 0.12);
  assert.equal(fields.machineId, 'MACH-1');
  assert.equal(fields.setupId, 'S1');
  // And it is HONEST about the two it could not fill, rather than leaving zeros
  // the shop believes were filled in.
  assert.ok(missing.includes('printWeight'));
  assert.ok(missing.includes('printTime'));
  assert.equal(fields.printWeight, undefined);
});

test('the setup that has worked most often is the default, not the newest', () => {
  const rec = {
    id: 'PF-3', parsed: {},
    setups: [
      { id: 'new', material: 'PETG', ok: 1, failed: 2 },
      { id: 'proven', material: 'PLA', ok: 11, failed: 0 },
    ],
  };
  assert.equal(PF.partPatch(rec).setup.id, 'proven');
  // But a named setup always wins — the shop asked for that one.
  assert.equal(PF.partPatch(rec, 'new').setup.id, 'new');
  assert.equal(PF.partPatch(rec, 'new').fields.material, 'PETG');
});

test('the slicer wins on numbers, the setup wins on how it is actually printed', () => {
  const rec = {
    id: 'PF-4',
    parsed: { filamentGrams: 100, printTimeMins: 60, filamentType: 'Generic PLA' },
    setups: [{ id: 'S', material: 'Sunlu PETG', layerHeightMm: 0.2, ok: 5 }],
  };
  const { fields, from } = PF.partPatch(rec);
  assert.equal(fields.printWeight, 100, 'grams come from the file that was sliced');
  assert.equal(fields.material, 'Sunlu PETG', 'the material is what the shop actually ran');
  assert.equal(from.material, 'setup');
});

test('nothing to fill says so, instead of quietly doing nothing', () => {
  const empty = PF.partPatch({ id: 'PF-5', parsed: {}, setups: [] });
  assert.equal(Object.keys(empty.from).length, 0);
  assert.match(PF.describe(empty), /no slicer data and no recorded setup/i);
  // And a partial fill names what is still missing.
  const partial = PF.partPatch({ id: 'PF-6', parsed: {}, setups: [{ id: 'S', material: 'PLA', ok: 1 }] });
  assert.match(PF.describe(partial), /still needs/i);
  assert.match(PF.describe(partial), /printWeight/);
});

test('a missing record does not throw', () => {
  assert.doesNotThrow(() => PF.partPatch(null));
  assert.doesNotThrow(() => PF.partPatch({}));
  assert.doesNotThrow(() => PF.describe(null));
});

/* ── what the storefront publishes ────────────────────────────────────────
 *
 * This lived inside the storefront modal's closure, which is unreachable from
 * an automation context — so it shipped with no way to check it short of
 * publishing a real catalog to a real shop. Moved into the module so it can be
 * asserted, which is the whole reason it is here.
 */

const img = (id, kind, bytes = 100) => ({ id, path: `${id}.jpg`, kind, thumbnail: 'data:image/jpeg;base64,' + 'A'.repeat(bytes) });

test('the primary photo leads, and the real-print photo is next', () => {
  // If only one survives the budget it should be the one the shop chose; if two
  // do, the second should be the honest one.
  const p = { id: 'P', images: [img('a', 'render'), img('b', 'scale'), img('c', 'print'), img('d', 'detail')] };
  const out = PI.storefrontPhotos(p);
  assert.deepEqual(out.map((x) => x.kind), ['render', 'print', 'scale']);
});

test('each published photo says what it is', () => {
  const out = PI.storefrontPhotos({ id: 'P', images: [img('a', 'print')] });
  assert.deepEqual(out, [{ src: 'data:image/jpeg;base64,' + 'A'.repeat(100), kind: 'print' }]);
});

test('the budget is real: too many, and too big, are both refused', () => {
  const many = { id: 'P', images: ['a', 'b', 'c', 'd', 'e'].map((k) => img(k, 'render')) };
  assert.equal(PI.storefrontPhotos(many).length, 3, 'at most three per listing');
  const huge = { id: 'P', images: [img('a', 'render', 300000), img('b', 'print', 50)] };
  const out = PI.storefrontPhotos(huge);
  assert.equal(out.length, 1, 'an oversized picture is dropped, not truncated');
  assert.equal(out[0].kind, 'print');
});

test('a product with no usable picture publishes none rather than a broken one', () => {
  assert.deepEqual(PI.storefrontPhotos({ id: 'P' }), []);
  assert.deepEqual(PI.storefrontPhotos({ id: 'P', images: [{ id: 'a', path: 'x.jpg', kind: 'render' }] }), [],
    'a picture with no data URI cannot be published — the storefront never sees the disk');
  assert.deepEqual(PI.storefrontPhotos({ id: 'P', images: [{ id: 'a', thumbnail: 'https://example.com/x.jpg' }] }), [],
    'and a remote URL is not a data URI');
});

test('a legacy single-image product still publishes its photo', () => {
  const out = PI.storefrontPhotos({ id: 'P', thumbnail: 'data:image/jpeg;base64,AAAA', imagePath: 'a.jpg' });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'render');
});
