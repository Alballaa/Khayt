#!/usr/bin/env node
/**
 * E2E: a library the size of a real one.
 *
 * Measured before this existed: painting every card cost 95 ms at 400 records
 * and 701 ms at 3,415 — paid on every filter press, every star, and every round
 * of the thumbnail migration v3.7.0-beta.24 runs. Nearly a second of frozen
 * window, on the screen this app is for.
 *
 * A page is drawn now and the rest arrives as you reach it. What that must NOT
 * change is what anything MEANS: the filters still narrow the whole library, the
 * counts still count all of it, and "select all shown" still holds every match
 * rather than the hundred and twenty that happen to be painted.
 *
 * Requires display (use xvfb-run on Linux CI).
 */
import fs from 'fs';
import { dismissWizard, launchApp, makeUserDataDir, switchTab } from './e2e/helpers.mjs';

const userData = makeUserDataDir();
let electronApp;
const N = 1200;              // enough to page several times; fast enough for CI

async function seed(window, n) {
  await window.evaluate((count) => {
    if (!Array.isArray(window.printFiles)) printFiles = [];
    printFiles.length = 0;
    for (let i = 0; i < count; i++) {
      printFiles.push({
        id: 'BIG-' + i, name: 'Model ' + i, originalName: 'm' + i + '.stl',
        createdAt: Date.now(), updatedAt: Date.now() - i,
        sourceFile: { filename: 'm' + i + '.stl', originalName: 'm' + i + '.stl', size: 4200000, ext: 'stl', kind: 'model' },
        parsed: {}, colors: [], tags: i % 5 === 0 ? ['resin'] : [],
        group: i % 100 === 0 ? 'Saudi Kings' : '', category: i % 2 === 0 ? 'Busts' : 'Minis',
        thumb: null, thumbFile: null, material: 'PLA', favorite: false,
      });
    }
    renderPrintFiles();
  }, n);
  await window.waitForSelector('.pf-card');
}

const painted = (window) => window.evaluate(() => document.querySelectorAll('#printfiles-tab .pf-card').length);
const moreLabel = (window) => window.evaluate(() => document.querySelector('.pf-more-n')?.textContent.trim() || '');

async function testOnlyAPageIsPainted(window) {
  const n = await painted(window);
  if (n >= N) throw new Error(`every card was painted (${n}) — the whole point is that it is not`);
  if (n < 20) throw new Error(`only ${n} cards painted; that is not a usable page`);
  const label = await moreLabel(window);
  // The count must speak for the LIBRARY, not the page.
  if (!label.includes(String(N))) throw new Error(`the count does not say how many there really are: "${label}"`);
}

async function testScrollingGrowsThePageWithoutPressingAnything(window) {
  // The observer is attached by renderList(); renderPrintFiles() builds the
  // tab's markup ITSELF and did not attach it, so the first screen a shop saw
  // stopped at one page until the button was pressed. The button works, which
  // is why pressing it was not a test of this.
  const before = await painted(window);
  await window.evaluate(() => document.getElementById('pfMore')?.scrollIntoView({ block: 'center' }));
  await window.waitForTimeout(400);
  const after = await painted(window);
  if (after <= before) {
    throw new Error(`scrolling to the end painted ${after}, was ${before} — the observer is not attached on a fresh render`);
  }
}

async function testTheRestArrivesWhenAskedFor(window) {
  const before = await painted(window);
  await window.click('[data-act="pf-more"]');
  await window.waitForTimeout(120);
  const after = await painted(window);
  if (after <= before) throw new Error(`asking for more painted ${after}, was ${before}`);
}

async function testFiltersNarrowTheWholeLibraryNotThePage(window) {
  // 12 of the 1200 are Saudi Kings, and none of them is in the first page —
  // a filter that only searched what was painted would find nothing.
  await window.click('.pf-folderbar [data-folder="Saudi Kings"]');
  await window.waitForTimeout(120);
  const n = await painted(window);
  if (n !== 12) throw new Error(`filtering a paged library showed ${n} cards, expected 12`);
  // …and it went back to the top rather than staying deep in the previous list.
  const label = await moreLabel(window);
  if (label) throw new Error(`a 12-card result still offers more: "${label}"`);
  await window.click('.pf-folderbar [data-folder="Saudi Kings"]');
  await window.waitForTimeout(120);
}

async function testANewQuestionStartsAtTheTop(window) {
  // Page deep into the library, then narrow. A shop that picks a filter is
  // asking something new, and should not land nine hundred cards down — nor
  // should nine hundred cards be PAINTED for a question just asked.
  for (let i = 0; i < 6; i++) { await window.click('[data-act="pf-more"]'); await window.waitForTimeout(60); }
  const deep = await painted(window);
  if (deep < 500) throw new Error(`paging six times only reached ${deep} cards`);
  await window.click('.pf-folderbar [data-cat="Busts"]');   // 600 of the 1200
  await window.waitForTimeout(150);
  const after = await painted(window);
  if (after >= deep) throw new Error(`narrowing kept ${after} cards painted — the page did not reset`);
  if (after > 200) throw new Error(`narrowing left ${after} cards painted, expected one page`);
  await window.click('.pf-folderbar [data-cat="Busts"]');
  await window.waitForTimeout(150);
}

async function testSearchFindsWhatWasNeverPainted(window) {
  await window.evaluate(() => {
    const s = document.getElementById('pfSearch');
    s.value = 'Model 1199';
    s.dispatchEvent(new Event('input'));
  });
  await window.waitForTimeout(300);
  const found = await window.evaluate(() =>
    [...document.querySelectorAll('.pf-card .pf-name')].map((e) => e.textContent.trim()));
  if (!found.includes('Model 1199')) {
    throw new Error(`the last record in the library was not findable: ${found.slice(0, 5)}`);
  }
  await window.evaluate(() => {
    const s = document.getElementById('pfSearch');
    s.value = ''; s.dispatchEvent(new Event('input'));
  });
  await window.waitForTimeout(300);
}

async function testSelectAllShownMeansEveryMatchNotThePage(window) {
  await window.click('[data-act="pf-select-toggle"]');
  await window.waitForSelector('.pf-bulk');
  const paintedNow = await painted(window);
  await window.click('[data-act="pf-pick-all"]');
  await window.waitForTimeout(150);
  const held = await window.evaluate(() =>
    Number((document.querySelector('.pf-bulk-n')?.textContent.match(/\d+/) || [0])[0]));
  if (held !== N) {
    throw new Error(`"select all shown" held ${held} of ${N} — it took the painted page (${paintedNow}), not the match`);
  }
  await window.click('[data-act="pf-select-off"]');
}

async function testPaintingAPageIsFast(window) {
  // The number this exists for. Generous against CI, and still ~20x under what
  // painting every card cost.
  const ms = await window.evaluate(() => {
    const a = performance.now();
    renderPrintFiles();
    return performance.now() - a;
  });
  if (ms > 250) throw new Error(`painting took ${Math.round(ms)} ms at ${N} records — the page is not bounding the work`);
  console.log(`  (render at ${N} records: ${Math.round(ms)} ms)`);
}

try {
  ({ electronApp } = await launchApp(userData));
  const window = await electronApp.firstWindow();
  window.setDefaultTimeout(120_000);
  await dismissWizard(window);
  await switchTab(window, 'printfiles-tab');
  await seed(window, N);

  await testOnlyAPageIsPainted(window);
  await testScrollingGrowsThePageWithoutPressingAnything(window);
  await testTheRestArrivesWhenAskedFor(window);
  await testFiltersNarrowTheWholeLibraryNotThePage(window);
  await testANewQuestionStartsAtTheTop(window);
  await testSearchFindsWhatWasNeverPainted(window);
  await testSelectAllShownMeansEveryMatchNotThePage(window);
  await testPaintingAPageIsFast(window);

  console.log('e2e-big-library: ok (a page is painted, the rest on demand, filters and search see all of it, select-all means every match)');
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
