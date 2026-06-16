#!/usr/bin/env node
/**
 * E2E: tab/nav smoke per Khayt-4 design shell (all selectable themes).
 * Linux CI: xvfb-run -a node scripts/e2e-theme-shells.mjs
 */
import fs from 'fs';
import {
  dismissWizard,
  launchApp,
  makeUserDataDir,
  switchTab,
} from './e2e/helpers.mjs';
import { buildScreenshotDemoStore } from './screenshot-demo-store.mjs';

const THEME_CASES = [
  { id: 'studio', bodyClass: 'khayt-studio', appearance: 'dark', dashSel: '#dashboardContent', dashMin: 80 },
  { id: 'ledger', bodyClass: 'khayt-ledger', appearance: 'light', dashSel: '#dashboardContent', dashMin: 80, ledger: true },
  { id: 'console', bodyClass: 'khayt-console', appearance: 'dark', dashSel: '#dashboardContent', dashMin: 80 },
  { id: 'atelier', bodyClass: 'khayt-atelier', appearance: 'light', dashSel: '#dashboardContent', dashMin: 80 },
  { id: 'vitrine', bodyClass: 'khayt-vitrine', appearance: 'dark', dashSel: '#dashboardContent', dashMin: 80 },
  { id: 'cockpit', bodyClass: 'khayt-cockpit', appearance: 'light', dashSel: '.ck-dash', dashMin: 40 },
  { id: 'atlas', bodyClass: 'khayt-atlas', appearance: 'dark', dashSel: '.atlas-floor-root', dashMin: 40, atlasNav: true },
  { id: 'workbench', bodyClass: 'khayt-workbench', appearance: 'light', dashSel: '.wb-dash', dashMin: 80 },
  { id: 'vivid', bodyClass: 'khayt-vivid', appearance: 'light', dashSel: '.vv-dash', dashMin: 80 },
  { id: 'command', bodyClass: 'khayt-command', appearance: 'light', dashSel: '.cmd-dash', dashMin: 80 },
];

const userData = makeUserDataDir();
let electronApp;

async function applyThemeCase(window, themeCase) {
  await window.evaluate(({ id, appearance }) => {
    settings.designTheme = id;
    settings.theme = appearance;
    if (typeof applyTheme === 'function') applyTheme(appearance);
    if (typeof applyDesignSettings === 'function') applyDesignSettings();
    window.KhaytShell?.switchTab?.('dashboard-tab');
  }, themeCase);

  await window.waitForFunction(
    ({ bodyClass, id }) => document.body.classList.contains(bodyClass)
      && document.documentElement.dataset.design === id,
    themeCase,
    { timeout: 15_000 },
  );

  if (themeCase.ledger) {
    await window.waitForFunction(
      () => document.querySelector('.khayt-body')?.dataset.ledgerLayout === 'mounted',
      { timeout: 10_000 },
    );
  }
}

async function assertDashboard(window, themeCase) {
  const dash = await window.evaluate(({ dashSel, dashMin }) => {
    const el = document.querySelector(dashSel);
    return { found: !!el, len: el?.innerHTML?.length || 0, min: dashMin };
  }, themeCase);
  if (!dash.found || dash.len < dash.min) {
    throw new Error(`${themeCase.id}: dashboard not rendered (${JSON.stringify(dash)})`);
  }
}

async function navigateSecondaryTab(window, themeCase) {
  if (themeCase.atlasNav) {
    await window.click('#atlasNav [data-atlas-tab="queue-tab"]');
  } else {
    await window.click('#tabbtn-queue-tab');
  }
  await window.waitForFunction(
    () => document.getElementById('queue-tab')?.classList.contains('active') === true,
    { timeout: 10_000 },
  );
  const queueReady = await window.evaluate(
    () => !!document.querySelector('#list-pending') && document.querySelectorAll('.kanban-col').length >= 5,
  );
  if (!queueReady) throw new Error(`${themeCase.id}: queue tab did not render kanban`);

  if (themeCase.atlasNav) {
    await window.click('#atlasNav [data-atlas-tab="settings-tab"]');
  } else {
    await switchTab(window, 'settings-tab');
  }
  const settingsReady = await window.evaluate(
    () => document.getElementById('settings-tab')?.classList.contains('active') === true
      && !!document.querySelector('#settings-panel-prefs'),
  );
  if (!settingsReady) throw new Error(`${themeCase.id}: settings tab did not activate`);
}

async function testRtlAtlas(window) {
  await window.evaluate(() => {
    settings.lang = 'ar';
    settings.designTheme = 'atlas';
    settings.theme = 'dark';
    i18n.set('ar');
    if (typeof applyTheme === 'function') applyTheme('dark');
    if (typeof applyDesignSettings === 'function') applyDesignSettings();
    window.KhaytShell?.switchTab?.('dashboard-tab');
  });
  await window.waitForFunction(
    () => document.documentElement.dir === 'rtl'
      && document.body.classList.contains('khayt-atlas')
      && !!document.querySelector('.atlas-floor-root'),
    { timeout: 15_000 },
  );
}

async function seedDemoStore(window) {
  const demoStore = buildScreenshotDemoStore();
  demoStore.settings = demoStore.settings || {};
  demoStore.settings.firstRun = false;
  demoStore.settings.firstRunDone = true;
  demoStore.settings.designTheme = 'studio';
  const saveResult = await window.evaluate(async (store) => window.hubAPI.saveStore(store), demoStore);
  if (!saveResult?.ok) throw new Error(`saveStore failed: ${JSON.stringify(saveResult)}`);
  await window.reload({ waitUntil: 'domcontentloaded' });
  await window.waitForSelector('.khayt-app', { timeout: 90_000 });
  await dismissWizard(window);
}

try {
  ({ electronApp } = await launchApp(userData));
  const window = await electronApp.firstWindow();
  await seedDemoStore(window);

  for (const themeCase of THEME_CASES) {
    await applyThemeCase(window, themeCase);
    await assertDashboard(window, themeCase);
    await navigateSecondaryTab(window, themeCase);
    console.log(`  ${themeCase.id}: dashboard + queue + settings ok`);
  }

  await testRtlAtlas(window);
  console.log('  atlas + ar RTL: ok');

  console.log('e2e-theme-shells: ok (9 themes + RTL atlas)');
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
