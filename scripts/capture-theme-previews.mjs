#!/usr/bin/env node
/**
 * Capture Studio + Ledger theme preview images for the theme picker.
 * Linux CI: xvfb-run -a node scripts/capture-theme-previews.mjs
 */
import { _electron as electron } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildScreenshotDemoStore } from './screenshot-demo-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'renderer/themes/previews');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-theme-previews-'));

const THEMES = [
  { id: 'studio', appearance: 'dark', file: 'studio.png' },
  { id: 'ledger', appearance: 'light', file: 'ledger.png' },
];

const VIEWPORT = { width: 1280, height: 800 };

let electronApp;
try {
  fs.mkdirSync(outDir, { recursive: true });
  const demoStore = buildScreenshotDemoStore();
  demoStore.settings = demoStore.settings || {};
  demoStore.settings.firstRun = false;
  demoStore.settings.firstRunDone = true;
  demoStore.settings.designTheme = 'studio';

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

  for (const theme of THEMES) {
    await page.evaluate(({ id, appearance }) => {
      settings.designTheme = id;
      settings.theme = appearance;
      if (typeof applyTheme === 'function') applyTheme(appearance);
      if (typeof applyDesignSettings === 'function') applyDesignSettings();
      window.KhaytShell?.switchTab?.('dashboard-tab');
      const wiz = document.querySelector('#setup-wizard');
      if (wiz) wiz.style.display = 'none';
      document.querySelector('#toastContainer')?.replaceChildren();
    }, theme);

    await page.waitForFunction(
      (id) => document.documentElement.dataset.design === id || document.body.classList.contains(`khayt-${id}`),
      theme.id,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(900);

    const out = path.join(outDir, theme.file);
    await page.locator('.khayt-app').screenshot({ path: out, type: 'png' });
    console.log(`  ${theme.file}`);
  }

  console.log(`\nTheme previews saved to ${outDir}`);
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
