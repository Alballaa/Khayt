#!/usr/bin/env node
/**
 * E2E: groups and categories, on both screens.
 *
 * lib/organise.js is pure and unit-tested. What only a running app can show is
 * that a shop can REACH any of it — which is the failure this codebase keeps
 * shipping, most recently a module whose six unused functions survived a whole
 * release with every gate green.
 *
 * What it proves:
 *   a library filed before groups existed is already in one — `folder` is read;
 *   filing writes BOTH fields, so renderer/bedready-library.js still sees it;
 *   a name that matches one already in use ADOPTS ITS SPELLING, across screens —
 *     typing "saudi kings" on the catalogue joins the library's "Saudi Kings";
 *   both chip bars filter, and the two axes narrow together;
 *   the catalogue offers the library's names and vice versa.
 *
 * Requires display (use xvfb-run on Linux CI).
 */
import fs from 'fs';
import { dismissWizard, launchApp, makeUserDataDir, switchTab } from './e2e/helpers.mjs';

const userData = makeUserDataDir();
let electronApp;

async function seed(window) {
  await window.evaluate(() => {
    const f = (name) => ({ filename: name, originalName: name, size: 900, ext: 'stl', kind: 'model' });
    if (!Array.isArray(window.printFiles)) printFiles = [];
    printFiles.length = 0;
    const base = { createdAt: Date.now(), updatedAt: Date.now(), parsed: {}, colors: [], tags: [], material: '', favorite: false };
    // Filed the OLD way, under `folder`, with no `group` anywhere — this is what
    // every library in the wild looks like.
    printFiles.push({ ...base, id: 'E2E-K1', name: 'King Abdulaziz', sourceFile: f('k1.stl'), folder: 'Saudi Kings', category: 'Busts' });
    printFiles.push({ ...base, id: 'E2E-K2', name: 'King Saud', sourceFile: f('k2.stl'), folder: 'Saudi Kings', category: 'Busts' });
    printFiles.push({ ...base, id: 'E2E-B1', name: 'Cable clip', sourceFile: f('b1.stl'), folder: '', category: 'Functional' });
    printFiles.push({ ...base, id: 'E2E-U1', name: 'Unfiled thing', sourceFile: f('u1.stl') });
    if (!Array.isArray(window.products)) products = [];
    products.length = 0;
    products.push({ id: 'E2E-P1', nameEn: 'King Faisal bust', nameAr: '', description: '', defaultMargin: 30, priceTiers: [], parts: [], createdAt: '2026-09-02' });
    renderPrintFiles();
  });
  await window.waitForSelector('.pf-card[data-id="E2E-K1"]');
}

const chips = (window, sel) => window.evaluate((s) => [...document.querySelectorAll(s)]
  .map((b) => ({ label: b.textContent.trim().replace(/\s+/g, ' '), on: b.classList.contains('on'), val: b.dataset.folder ?? b.dataset.cat ?? b.dataset.val ?? '' })), sel);

const shownIds = (window) => window.evaluate(() =>
  [...document.querySelectorAll('#printfiles-tab .pf-card')].map((c) => c.dataset.id));

const rec = (window, id) => window.evaluate((i) =>
  JSON.parse(JSON.stringify(printFiles.find((r) => r.id === i) || products.find((p) => p.id === i))), id);

async function testAnOldLibraryIsAlreadyGrouped(window) {
  // Nothing was migrated. `folder` IS the group and is read as one.
  const bars = await chips(window, '.pf-folderbar [data-folder]');
  const kings = bars.find((c) => c.label.startsWith('Saudi Kings'));
  if (!kings) throw new Error(`no group chip for a folder-filed library: ${JSON.stringify(bars)}`);
  if (!/Saudi Kings 2/.test(kings.label)) throw new Error(`the group count is wrong: ${kings.label}`);
  const cats = await chips(window, '.pf-folderbar [data-cat]');
  if (!cats.some((c) => /Busts 2/.test(c.label))) throw new Error(`no category chip: ${JSON.stringify(cats)}`);
  if (!cats.some((c) => /Functional 1/.test(c.label))) throw new Error('the second category is missing');
}

async function testTheTwoAxesNarrowTogether(window) {
  await window.click('.pf-folderbar [data-cat="Busts"]');
  await window.waitForTimeout(60);
  let ids = await shownIds(window);
  if (ids.sort().join() !== 'E2E-K1,E2E-K2') throw new Error(`category filter showed ${ids}`);
  // Adding the group must not widen it back out.
  await window.click('.pf-folderbar [data-folder="Saudi Kings"]');
  await window.waitForTimeout(60);
  ids = await shownIds(window);
  if (ids.sort().join() !== 'E2E-K1,E2E-K2') throw new Error(`both filters together showed ${ids}`);
  // A group with nothing in that category shows nothing, rather than ignoring one.
  await window.click('.pf-folderbar [data-cat="Functional"]');
  await window.waitForTimeout(60);
  ids = await shownIds(window);
  if (ids.length) throw new Error(`the two filters stopped narrowing together: ${ids}`);
  // Clear both.
  await window.click('.pf-folderbar [data-cat="Functional"]');
  await window.click('.pf-folderbar [data-folder="Saudi Kings"]');
  await window.waitForTimeout(60);
  if ((await shownIds(window)).length !== 4) throw new Error('the filters did not clear');
}

async function testFilingWritesBothFields(window) {
  await window.evaluate(() => {
    const r = printFiles.find((x) => x.id === 'E2E-U1');
    // Through the same call the edit dialog makes.
    Object.assign(r, KhaytOrganise.assign(r, { group: 'saudi kings', category: 'busts' },
      { group: KhaytOrganise.known(printFiles.concat(products), 'group'),
        category: KhaytOrganise.known(printFiles.concat(products), 'category') }));
    saveAll(); renderPrintFiles();
  });
  const r = await rec(window, 'E2E-U1');
  // The spelling already in use wins — otherwise the collection splits in two.
  if (r.group !== 'Saudi Kings') throw new Error(`a matching name did not adopt its spelling: ${r.group}`);
  if (r.category !== 'Busts') throw new Error(`the category did not adopt its spelling: ${r.category}`);
  // renderer/bedready-library.js reads .folder directly, and so does every
  // older build. Writing only `group` files a record half the app cannot see.
  if (r.folder !== 'Saudi Kings') throw new Error(`the old field was left behind: ${r.folder}`);
  const bars = await chips(window, '.pf-folderbar [data-folder]');
  if (!bars.some((c) => /Saudi Kings 3/.test(c.label))) {
    throw new Error(`the collection did not grow to 3: ${JSON.stringify(bars)}`);
  }
}

async function testTheCatalogueSharesTheNames(window) {
  await switchTab(window, 'catalog-tab');
  await window.waitForSelector('.product-card[data-id="E2E-P1"]');
  // The library's groups are offered on the catalogue: one shop, one set of names.
  const offered = await window.evaluate(() => organiseKnown('group'));
  if (!offered.includes('Saudi Kings')) throw new Error(`the catalogue cannot see the library's groups: ${offered}`);
  // File the product the same way the editor does, and it joins the collection.
  await window.evaluate(() => {
    const p = products.find((x) => x.id === 'E2E-P1');
    Object.assign(p, organiseAssign(p, { group: 'SAUDI KINGS', category: 'busts' }));
    saveAll(); renderCatalog();
  });
  const p = await rec(window, 'E2E-P1');
  if (p.group !== 'Saudi Kings') throw new Error(`the product did not join the collection: ${p.group}`);
  if (p.category !== 'Busts') throw new Error(`the product's category drifted: ${p.category}`);
  const bar = await chips(window, '#catalogFilters [data-act="cat-filter-group"]');
  if (!bar.some((c) => /Saudi Kings 1/.test(c.label))) {
    throw new Error(`the catalogue has no group bar: ${JSON.stringify(bar)}`);
  }
  // And the chip filters the grid.
  await window.click('#catalogFilters [data-act="cat-filter-category"][data-val="Busts"]');
  await window.waitForTimeout(60);
  const shown = await window.evaluate(() => [...document.querySelectorAll('#catalogGrid .product-card')].map((c) => c.dataset.id));
  if (shown.join() !== 'E2E-P1') throw new Error(`the catalogue category filter showed ${shown}`);
}

async function testTheStorefrontPublishesTheProductsOwnCategory(window) {
  // The bug the price already had: sf.categories was the ONLY source, so a shop
  // that had categorised its catalogue published a storefront with none.
  const cat = await window.evaluate(() => {
    const p = products.find((x) => x.id === 'E2E-P1');
    return { fromRecord: productCategoryOf(p), group: productGroupOf(p) };
  });
  if (cat.fromRecord !== 'Busts') throw new Error(`the publisher cannot read the product's category: ${cat.fromRecord}`);
  if (cat.group !== 'Saudi Kings') throw new Error(`the publisher cannot read the product's group: ${cat.group}`);
}

try {
  ({ electronApp } = await launchApp(userData));
  const window = await electronApp.firstWindow();
  window.setDefaultTimeout(120_000);
  await dismissWizard(window);
  await switchTab(window, 'printfiles-tab');
  await seed(window);

  await testAnOldLibraryIsAlreadyGrouped(window);
  await testTheTwoAxesNarrowTogether(window);
  await testFilingWritesBothFields(window);
  await testTheCatalogueSharesTheNames(window);
  await testTheStorefrontPublishesTheProductsOwnCategory(window);

  console.log('e2e-organise: ok (old folders read as groups, two axes narrow together, one spelling across both screens, catalogue filters, storefront reads the record)');
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
