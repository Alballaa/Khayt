#!/usr/bin/env node
/**
 * Dev helper: launch the app with the Workbench theme + demo data and screenshot
 * one or more tabs. Usage:
 *   node scripts/shot-workbench.mjs [tab ...] [--dark]
 * Tabs default to the full set. Output: .wb-shots/<tab>[-dark].png
 */
import { _electron as electron } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildScreenshotDemoStore } from './screenshot-demo-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, '.wb-shots');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-wb-shots-'));

const argv = process.argv.slice(2);
const dark = argv.includes('--dark');
const tabs = argv.filter((a) => !a.startsWith('--'));
const TABS = tabs.length ? tabs : [
  'dashboard-tab', 'calculator-tab', 'queue-tab', 'inventory-tab',
  'clients-tab', 'logs-tab', 'analytics-tab', 'settings-tab',
];

const VIEWPORT = { width: 1280, height: 820 };

let electronApp;
try {
  fs.mkdirSync(outDir, { recursive: true });
  const demoStore = buildScreenshotDemoStore();
  demoStore.settings = demoStore.settings || {};
  demoStore.settings.firstRun = false;
  demoStore.settings.firstRunDone = true;
  demoStore.settings.designTheme = 'workbench';
  demoStore.settings.theme = dark ? 'dark' : 'light';

  electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: root,
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
    timeout: 120_000,
  });

  const page = await electronApp.firstWindow();
  await page.setViewportSize(VIEWPORT);
  await page.waitForSelector('.khayt-app', { timeout: 90_000 });

  const saveResult = await page.evaluate(async (store) => window.hubAPI.saveStore(store), demoStore);
  if (!saveResult?.ok) throw new Error(`saveStore failed: ${JSON.stringify(saveResult)}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.khayt-app', { timeout: 90_000 });
  await page.waitForFunction(
    () => document.querySelector('#setup-wizard')?.style.display === 'none',
    { timeout: 60_000 },
  );
  // loadAll() applies the disk store asynchronously after boot — wait for the
  // demo orders to actually land before rendering, else screens show seed data.
  await page.waitForFunction(
    () => typeof printLog !== 'undefined' && printLog.length > 5,
    { timeout: 30_000 },
  );

  await page.evaluate((appearance) => {
    settings.designTheme = 'workbench';
    settings.theme = appearance;
    if (typeof applyTheme === 'function') applyTheme(appearance);
    if (typeof applyDesignSettings === 'function') applyDesignSettings();
  }, dark ? 'dark' : 'light');

  await page.waitForFunction(
    () => document.body.classList.contains('khayt-workbench'),
    { timeout: 15_000 },
  );

  for (const tab of TABS) {
    await page.evaluate((t) => {
      window.KhaytShell?.switchTab?.(t);
      const wiz = document.querySelector('#setup-wizard');
      if (wiz) wiz.style.display = 'none';
      document.querySelector('#toastContainer')?.replaceChildren();
    }, tab);
    await page.waitForTimeout(700);
    const out = path.join(outDir, `${tab}${dark ? '-dark' : ''}.png`);
    await page.locator('.khayt-app').screenshot({ path: out, type: 'png' });
    console.log(`  ${path.relative(root, out)}`);
  }
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
