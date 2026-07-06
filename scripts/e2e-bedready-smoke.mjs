#!/usr/bin/env node
/**
 * Bed Ready flavor smoke test.
 *
 * Boots the app with KHAYT_FLAVOR=bedready and asserts the standalone maker
 * experience: it loads renderer/bedready.html, forces the commerce-free
 * enthusiast mode, exposes the maker surfaces (converter / colour studio /
 * print files / queue / inventory), does NOT ship the business modules, shows
 * no business navigation, and boots with no uncaught renderer errors.
 *
 * Requires a display (use xvfb-run on Linux CI). Run: node scripts/e2e-bedready-smoke.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { _electron as electron } from 'playwright-core';
import { makeUserDataDir } from './e2e/helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const userData = makeUserDataDir();
let electronApp;
const pageErrors = [];

function assert(label, cond) {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: root,
    // The flavor is what routes main.js to bedready.html and skips business wiring.
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1', KHAYT_FLAVOR: 'bedready' },
    timeout: 120_000,
  });

  const window = await electronApp.firstWindow();
  // Fail loudly on any uncaught renderer error (this is how a ReferenceError from a
  // dropped business module would surface at boot).
  window.on('pageerror', (err) => pageErrors.push(String(err && err.message || err)));

  await window.waitForSelector('.khayt-app', { timeout: 60_000 });
  await window.waitForFunction(
    () => typeof window.hubAPI?.loadStore === 'function'
      && (document.querySelector('#dashboardContent')?.innerHTML?.length || 0) > 100,
    { timeout: 60_000 }
  );

  console.log('\n[flavor + entry]');
  const entry = await window.evaluate(() => ({
    href: location.pathname,
    flavor: document.body.dataset.flavor || null,
    mode: (typeof settings !== 'undefined' && settings) ? settings.mode : null,
    modeClass: document.body.classList.contains('mode-enthusiast'),
    title: document.title,
  }));
  assert('entry document is bedready.html', entry.href.endsWith('bedready.html'));
  assert('body[data-flavor="bedready"]', entry.flavor === 'bedready');
  assert('mode forced to enthusiast', entry.mode === 'enthusiast');
  assert('body has mode-enthusiast class', entry.modeClass === true);
  assert('document title is "Bed Ready"', entry.title === 'Bed Ready');

  console.log('\n[business modules NOT shipped]');
  const bizScripts = await window.evaluate(() => {
    const BUSINESS = ['analytics.js', 'order-flows.js', 'integrations.js', 'invoicing.js',
      'clients.js', 'operations-extras.js', 'expenses.js', 'logs.js', 'waiting-list.js',
      'views.js', 'online.js'];
    const srcs = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
    return {
      present: BUSINESS.filter((b) => srcs.includes(b)),
      shimFirst: srcs[0] === 'bedready-shim.js',
    };
  });
  assert(`no business <script> tags in document (${bizScripts.present.join(',') || 'none'})`, bizScripts.present.length === 0);
  assert('bedready-shim.js is the first script', bizScripts.shimFirst === true);

  console.log('\n[maker modules present + shared core]');
  const maker = await window.evaluate(() => ({
    renderKanban: typeof renderKanban,
    renderInventory: typeof renderInventory,
    renderDashboard: typeof renderDashboard,
    converter: typeof window.hubAPI?.mfAnalyze,
    switchTab: typeof window.KhaytShell?.switchTab,
  }));
  assert('renderKanban present (kanban.js)', maker.renderKanban === 'function');
  assert('renderInventory present (inventory.js)', maker.renderInventory === 'function');
  assert('renderDashboard present (dashboard.js home)', maker.renderDashboard === 'function');
  assert('converter IPC bridge present', maker.converter === 'function');
  assert('shell.switchTab present', maker.switchTab === 'function');

  console.log('\n[maker tabs reachable + populate]');
  for (const tab of ['converter-tab', 'colorstudio-tab', 'printfiles-tab', 'inventory-tab', 'queue-tab']) {
    const ok = await window.evaluate(async (id) => {
      window.KhaytShell.switchTab(id);
      await new Promise((r) => setTimeout(r, 150));
      const el = document.getElementById(id);
      return el && el.classList.contains('active') && (el.innerHTML.length > 20);
    }, tab);
    assert(`${tab} activates and renders content`, ok === true);
  }

  console.log('\n[no visible business navigation]');
  const bizNavVisible = await window.evaluate(() => {
    const bizButtons = [...document.querySelectorAll('.tab-btn.biz-only, .nav-group.biz-only')];
    // offsetParent === null => not rendered/visible
    return bizButtons.filter((b) => b.offsetParent !== null).length;
  });
  assert('zero visible .biz-only nav elements', bizNavVisible === 0);

  const modeSwitchVisible = await window.evaluate(() => {
    const card = document.querySelector('#brExperienceCard');
    return card ? card.offsetParent !== null : false;
  });
  assert('mode switcher card hidden', modeSwitchVisible === false);

  console.log('\n[bespoke Bed Ready identity]');
  const design = await window.evaluate(() => ({
    dataApp: document.documentElement.dataset.app || null,
    designTheme: (typeof settings !== 'undefined') ? settings.designTheme : null,
    designPickerHidden: (() => { const el = document.querySelector('#brDesignFields'); return el ? el.offsetParent === null : true; })(),
    altThemeCss: [...document.styleSheets].map((s) => s.href || '')
      .filter((h) => /themes\/(ledger|console|atelier|vitrine|cockpit|atlas|workbench|vivid|command)\//.test(h)).length,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-h').trim(),
    brandFont: getComputedStyle(document.querySelector('h1, h2, .sec-title') || document.body).fontFamily,
  }));
  assert('html[data-app="bedready"] set', design.dataApp === 'bedready');
  assert(`design pinned to studio (was ${design.designTheme})`, design.designTheme === 'studio');
  assert('design/theme picker hidden', design.designPickerHidden === true);
  assert(`no alternate-theme CSS loaded (${design.altThemeCss})`, design.altThemeCss === 0);
  assert(`coral accent applied (--accent-h=${design.accent})`, design.accent === '12');
  assert(`Bricolage display font on headings (${design.brandFont.slice(0, 24)}…)`, /Bricolage/.test(design.brandFont));

  console.log('\n[no uncaught renderer errors during boot]');
  assert(`pageerror count === 0 (${pageErrors.join(' | ') || 'none'})`, pageErrors.length === 0);

  console.log('\n✅ Bed Ready smoke: all assertions passed');
}

main()
  .then(async () => { await electronApp?.close(); process.exit(0); })
  .catch(async (err) => {
    console.error('\n❌ Bed Ready smoke FAILED:', err.message);
    if (pageErrors.length) console.error('   pageerrors:', pageErrors);
    await electronApp?.close();
    process.exit(1);
  });
