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

  // Commerce-free affordances (the enthusiast/maker gating, now Bed-Ready-only after the
  // Khayt "enthusiast mode" retirement): the calculator shows no selling-price knobs and
  // the production queue exposes no invoice/pay actions.
  console.log('\n[commerce-free affordances]');
  const aff = await window.evaluate(async () => {
    const vis = (id) => { const b = document.getElementById(id); return !!(b && b.offsetParent !== null); };
    window.KhaytShell.switchTab('calculator-tab');
    await new Promise((r) => setTimeout(r, 120));
    const calc = { margin: vis('margin'), discount: vis('discountPct'), aiPrice: vis('btnAiPrice'), saveQuote: vis('btnSaveAsQuote') };
    if (Array.isArray(printLog)) printLog.unshift({ id: 'BR-e2e', project: 'E2E', status: 'completed', parts: [{ material: 'PLA' }], date: '2026-01-01' });
    window.KhaytShell.switchTab('queue-tab');
    if (typeof renderKanban === 'function') renderKanban();
    await new Promise((r) => setTimeout(r, 120));
    const qhtml = document.getElementById('queue-tab')?.innerHTML || '';
    return { ...calc, queueNoCommerce: !qhtml.includes('data-act="invoice"') && !qhtml.includes('data-act="pay"') && !qhtml.includes('data-act="bnpl-pay"') };
  });
  assert('calculator hides margin', aff.margin === false);
  assert('calculator hides discount', aff.discount === false);
  assert('calculator hides AI price-suggest', aff.aiPrice === false);
  assert('calculator hides save-as-quote', aff.saveQuote === false);
  assert('production queue exposes no commerce actions', aff.queueNoCommerce === true);

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
  // Bespoke bedready.io palette (teal accent) + geometric display face.
  assert(`teal accent applied (--accent-h=${design.accent})`, design.accent === '176');
  assert(`Space Grotesk display font on headings (${design.brandFont.slice(0, 24)}…)`, /Space Grotesk/.test(design.brandFont));

  console.log('\n[branded Bed Ready home]');
  const home = await window.evaluate(() => {
    if (window.KhaytShell?.switchTab) window.KhaytShell.switchTab('dashboard-tab');
    const hero = document.querySelector('.br-hero');
    return {
      hasHero: !!hero,
      headline: (hero?.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim(),
      stickers: document.querySelectorAll('.br-hero .br-sticker').length,
      noKhaytText: !/\bKhayt\b/i.test(document.querySelector('#dashboardContent')?.textContent || ''),
    };
  });
  assert('Bed Ready home hero renders on dashboard', home.hasHero === true);
  assert(`hero headline is the Bed Ready tagline (${home.headline.slice(0, 32)}…)`, /any bed/i.test(home.headline));
  assert(`hero shows sticker badges (${home.stickers})`, home.stickers >= 3);
  assert('dashboard home has no "Khayt" text', home.noKhaytText === true);

  // Orca filament installer: home card present + the modal API is exposed (Bed Ready flavor only).
  const orcaFila = await window.evaluate(() => ({
    card: !!document.querySelector('#dashboardContent [data-filaments]'),
    api: typeof window.BedReadyFilaments?.open,
    bridge: typeof window.hubAPI?.orcaFilaManifest,
  }));
  assert('filament installer card present on home', orcaFila.card === true);
  assert('window.BedReadyFilaments.open exposed', orcaFila.api === 'function');
  assert('hubAPI.orcaFilaManifest bridge exposed', orcaFila.bridge === 'function');

  // ── Branding guard: the standalone product must never surface "Khayt" ──────────────────────────────
  // Bed Ready shares Khayt's locale files + shared core, so leaks recur as features land. Assert the
  // three surfaces that have leaked before: localized strings, generated files, and the native menu.
  console.log('\n[branding — no "Khayt" leaks]');

  // (a) Every en-locale value that contains "Khayt" must rebrand when rendered via t().
  const locale = await window.evaluate(() => {
    const en = (window.KhaytLocales && window.KhaytLocales.en) || {};
    const bearing = Object.keys(en).filter((k) => typeof en[k] === 'string' && /Khayt/.test(en[k]));
    const leaks = bearing.filter((k) => /\bKhayt\b/.test(window.t(k)));
    return { checked: bearing.length, leaks };
  });
  assert(
    `all ${locale.checked} "Khayt"-bearing locale keys rebrand via t() (${locale.leaks.length ? 'LEAKS: ' + locale.leaks.slice(0, 6).join(', ') : '0 leaks'})`,
    locale.checked > 0 && locale.leaks.length === 0
  );

  // (b) The generated recovery-code file must be product-branded, not "Khayt".
  const recovery = await window.evaluate(() =>
    (window.KhaytAppSecurity && typeof window.KhaytAppSecurity.buildRecoveryCodeFile === 'function')
      ? String(window.KhaytAppSecurity.buildRecoveryCodeFile('AAAA-BBBB-CCCC-DDDD') || '') : '(unavailable)');
  assert(`recovery-code file is not "Khayt"-branded (${recovery.split('\n')[0]})`, recovery !== '' && !/Khayt/.test(recovery));

  // (c) The native macOS menu bar (About / Hide / Quit …) must read the product name, not "khayt".
  // The app menu only exists on darwin; on other platforms items[0] is the File menu, so skip there.
  if (process.platform === 'darwin') {
    const menu = await electronApp.evaluate(({ Menu }) => {
      const appMenu = Menu.getApplicationMenu()?.items?.[0];
      return {
        label: appMenu?.label || '',
        items: (appMenu?.submenu?.items || []).map((i) => i.label).filter(Boolean),
      };
    });
    assert(`native menu app label not "khayt" (${menu.label})`, !/khayt/i.test(menu.label));
    assert(`native menu items free of "khayt" (${menu.items.join(', ')})`, menu.items.length > 0 && !menu.items.some((l) => /khayt/i.test(l)));
  } else {
    console.log('  – native menu check skipped (darwin-only)');
  }

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
