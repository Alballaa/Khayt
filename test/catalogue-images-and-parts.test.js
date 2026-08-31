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

/* ── the budget that is not per listing ───────────────────────────────────
 *
 * storefrontPhotos() budgets one listing at a time, and its own note reasoned
 * about "forty listings without going near it" against a limit that was not the
 * real one: the server caps a sanitised catalogue at 8 MB. Three photos at
 * 200 KB is 600 KB a listing, so a shop with about fourteen photo-rich products
 * could not publish AT ALL — 413, the whole catalogue rejected because of the
 * pictures on some of it.
 */

const shot = (bytes) => ({ src: 'data:image/png;base64,' + 'A'.repeat(bytes), kind: 'render' });
const listing = (n, bytes) => ({ photos: Array.from({ length: n }, () => shot(bytes)) });

test('a catalogue too heavy to publish is trimmed, not rejected', () => {
  const items = Array.from({ length: 20 }, () => listing(3, 200000));   // ~12 MB
  const r = PI.fitCatalogPhotos(items);
  assert.equal(r.fits, true);
  assert.ok(r.bytes <= PI.CATALOG_PHOTO_BUDGET);
  // And it cost nobody their only picture: every listing still shows something.
  assert.equal(items.every((it) => it.photos.length >= 1), true);
});

test('extra photos go before anyone\'s only photo', () => {
  // One listing with three, forty with one. The three must be cut down before a
  // single one of the forty loses the only picture it has.
  const fat = listing(3, 200000);
  const thin = Array.from({ length: 40 }, () => listing(1, 170000));
  PI.fitCatalogPhotos([fat, ...thin], 7 * 1024 * 1024);
  assert.equal(thin.every((it) => it.photos.length === 1), true,
    'a listing with one photo must not be trimmed while another has spares');
  assert.equal(fat.photos.length < 3, true);
});

test('the legacy photo field follows what survived', () => {
  const items = [listing(3, 200000)];
  items[0].photo = items[0].photos[0].src;
  PI.fitCatalogPhotos(items, 300000);   // only one 200 KB photo can fit
  assert.equal(items[0].photos.length, 1);
  assert.equal(items[0].photo, items[0].photos[0].src, 'photo mirrors photos[0], here as everywhere');
});

test('a budget nothing fits leaves listings without pictures, not a failed publish', () => {
  // The listing keeps its name, price and description and shows a placeholder,
  // which is a storefront. A 413 is not.
  const items = [listing(1, 200000), listing(1, 200000)];
  const r = PI.fitCatalogPhotos(items, 1000);
  assert.equal(r.fits, true);
  assert.equal(items.every((it) => !it.photos), true);
  assert.equal(items.every((it) => !it.photo), true, 'and the legacy field does not point at a dropped picture');
});

test('a catalogue already within budget is left exactly alone', () => {
  const items = [listing(3, 1000), listing(2, 1000)];
  const r = PI.fitCatalogPhotos(items);
  assert.equal(r.dropped, 0);
  assert.equal(items[0].photos.length, 3);
  assert.equal(items[1].photos.length, 2);
});

test('no photos, or junk, does not throw', () => {
  assert.doesNotThrow(() => PI.fitCatalogPhotos(null));
  assert.doesNotThrow(() => PI.fitCatalogPhotos([null, {}, { photos: [] }]));
});

/* ── linking a file fills the numbers ─────────────────────────────────────
 *
 * Reported: "when adding a catalogue item and linking a file it is not
 * automatically calculating the total weight and print time".
 *
 * partPatch() existed and worked. The change handler that links a file set
 * `printFileId`, cleared `setupId` and re-rendered — and never called it. The
 * numbers were behind a separate "fill" button, so weight and time sat at zero,
 * which looks exactly like zeros somebody typed.
 */

test('linking a print file fills weight and time', () => {
  const rec = {
    id: 'PF-1', originalName: 'Bracket.gcode',
    parsed: { filamentGrams: 129.18, printTimeMins: 228, filamentType: 'PLA' }, setups: [],
  };
  const part = { printWeight: 0, printTime: 0, material: '' };
  const { applied } = PF.autoFill(part, PF.partPatch(rec));
  assert.equal(part.printWeight, 129.18);
  assert.equal(part.printTime, 3.8, '228 minutes is 3.8 hours — a part stores hours');
  assert.equal(part.material, 'PLA');
  assert.ok(applied.includes('printWeight') && applied.includes('printTime'));
});

test('a number the shop typed survives linking the file', () => {
  /* The slicer's grams are an estimate; a scale is not. Same rule the nozzle
   * threshold settled on — suggest, never rewrite. */
  const rec = { id: 'PF-2', parsed: { filamentGrams: 129.18, printTimeMins: 228, filamentType: 'PLA' }, setups: [] };
  const part = { printWeight: 41.5, printTime: 0, material: 'Sunlu PETG' };
  const { applied, kept } = PF.autoFill(part, PF.partPatch(rec));
  assert.equal(part.printWeight, 41.5, 'the weighed figure is not replaced by the slicer estimate');
  assert.equal(part.material, 'Sunlu PETG');
  assert.equal(part.printTime, 3.8, 'but the empty one is filled');
  assert.deepEqual(kept.sort(), ['material', 'printWeight']);
  assert.ok(applied.includes('printTime'));
});

test('a file with no slicer data fills what it can and claims nothing else', () => {
  const rec = { id: 'PF-3', parsed: {}, setups: [{ id: 'S1', material: 'PLA+ 2.0', layerHeightMm: 0.12, ok: 3 }] };
  const part = { printWeight: 0, printTime: 0, material: '' };
  PF.autoFill(part, PF.partPatch(rec));
  assert.equal(part.material, 'PLA+ 2.0');
  assert.equal(part.printWeight, 0, 'still zero, and the caller says so rather than pretending');
  assert.ok(PF.partPatch(rec).missing.includes('printWeight'));
});

test('autoFill does not throw on junk', () => {
  assert.doesNotThrow(() => PF.autoFill(null, null));
  assert.doesNotThrow(() => PF.autoFill({}, {}));
  assert.deepEqual(PF.autoFill({}, {}), { applied: [], kept: [] });
});

test('the file-link handler actually calls it', () => {
  /* The defect was a wiring gap, not a logic gap, so the guard has to be about
   * wiring. `.part-printfile` is the select that links a file. */
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'inventory.js'), 'utf8');
  const handler = src.slice(src.indexOf(".part-printfile'"));
  const body = handler.slice(0, handler.indexOf('refreshParts()'));
  assert.match(body, /KhaytPartFromPrintFile\.autoFill/,
    'linking a print file must fill the part in, not just record the link');
});
