#!/usr/bin/env node
/**
 * Headless smoke: launch Khayt via Electron, wait for UI, round-trip store via hubAPI.
 * Requires display (use xvfb-run on Linux CI).
 */
import { _electron as electron } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-e2e-'));

let electronApp;
try {
  electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: root,
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
    timeout: 120_000,
  });

  const window = await electronApp.firstWindow();
  await window.waitForSelector('.khayt-app', { timeout: 60_000 });
  await window.waitForFunction(
    () => typeof window.hubAPI?.loadStore === 'function' && typeof window.hubAPI?.saveStore === 'function',
    { timeout: 60_000 }
  );

  const version = await window.evaluate(() => window.hubAPI.appVersion());
  if (!version) throw new Error('hub:app-version returned empty');

  const saveResult = await window.evaluate(async () => {
    const data = (await window.hubAPI.loadStore()) || {};
    data.settings = data.settings || {};
    data.settings.shopName = 'E2E Smoke Test';
    data.printLog = data.printLog || [];
    return window.hubAPI.saveStore(data);
  });
  if (!saveResult?.ok) throw new Error(`saveStore failed: ${JSON.stringify(saveResult)}`);

  const reloaded = await window.evaluate(async () => {
    const data = await window.hubAPI.loadStore();
    return data?.settings?.shopName;
  });
  if (reloaded !== 'E2E Smoke Test') {
    throw new Error(`store round-trip mismatch: got ${JSON.stringify(reloaded)}`);
  }

  console.log('e2e-smoke: ok (version=%s, store round-trip)', version);
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
