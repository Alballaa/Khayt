/**
 * The wiring, not the logic — four places where a module was built and then not
 * plugged in, which is a whole feature that ships doing nothing.
 *
 * Every one of these was found by re-reading the diff rather than by a failing
 * test, which is why they are pinned here: a pure module with good tests and no
 * caller passes its own suite forever.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('enriching a print file survives a record with no file on disk', () => {
  // The library also holds entries made from a printer's own history, where
  // there is nothing to parse. Reading .ext off null threw from OUTSIDE the try,
  // so enrichment died before the work that needs no file either.
  const src = read('renderer/printfiles.js');
  const fn = src.slice(src.indexOf('async function enrichPrintFile'), src.indexOf('async function enrichPrintFile') + 900);
  const guard = fn.indexOf('!rec.sourceFile');
  const deref = fn.indexOf('rec.sourceFile.ext');
  assert.ok(guard !== -1, 'enrichPrintFile must guard a missing sourceFile');
  assert.ok(guard < deref, 'and the guard has to come BEFORE the dereference');
});

test('the catalog grid says which listings show no real photo', () => {
  // hasRealPhoto existed, was tested, and nothing called it — the label was
  // collected and never used for anything.
  const src = read('renderer/inventory.js');
  assert.match(src, /KhaytProductImages\.hasRealPhoto\(/, 'the grid must actually ask the question');
  assert.match(src, /product-norealphoto/, 'and show the answer');
});

test('the storefront publishes the labelled photos, not just one', () => {
  const src = read('renderer/settings.js');
  const build = src.slice(src.indexOf('const buildCatalog = '), src.indexOf('#storeCopy'));
  assert.match(build, /KhaytProductImages\.storefrontPhotos\(p\)/,
    'the storefront asks the module, so the selection is testable rather than sealed in a modal');
  assert.match(build, /it\.photos = photos/, 'more than one picture reaches the storefront');
  assert.match(build, /it\.photo = photos\[0\]\.src/,
    'the single-photo field stays, so an un-updated storefront page still renders');
  // The budget itself is asserted in catalogue-images-and-parts.test.js, where
  // it can be exercised rather than pattern-matched.
});

test('every lib module the renderer uses is loaded by both entry points', () => {
  // A module that is required but never <script>-loaded is a ReferenceError the
  // moment its first caller runs — the exact shape of the cloud sign-in freeze.
  const idx = read('renderer/index.html');
  const bed = read('renderer/bedready.html');
  for (const mod of ['product-images.js', 'part-from-print-file.js', 'nozzle-wear.js',
    'nozzle-wear-data.js', 'printer-facts.js']) {
    assert.ok(idx.includes(mod), `renderer/index.html must load ${mod}`);
    assert.ok(bed.includes(mod), `renderer/bedready.html must load ${mod}`);
  }
  // Order matters for the two that read each other at load time.
  assert.ok(idx.indexOf('nozzle-wear-data.js') < idx.indexOf('nozzle-wear.js'),
    'the data table must load before the model that reads it');
  assert.ok(idx.indexOf('printer-facts.js') < idx.indexOf('printer-catalog.js'),
    'the facts must load before the catalog that layers them on');
});
