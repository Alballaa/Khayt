/**
 * Shared helpers for Khayt Playwright/Electron E2E tests.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { _electron as electron } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.join(__dirname, '../..');
export const E2E_LAN_PORT = 13_219;
export const E2E_LAN_PIN = 'e2e-smoke-pin';

export function makeUserDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-e2e-'));

  // Pre-dismiss the first-run keychain explanation. It no longer gates boot —
  // the dialog was moved off hub:load-store onto the save (encrypt) and restore
  // (decrypt) paths — but the smoke suite saves a store containing a LAN PIN,
  // which is a secret, so hub:save-store would show the modal and hang with no
  // one to click it. Seeding the flag keeps automated saves non-interactive, the
  // same way the suites dismiss the setup wizard.
  fs.writeFileSync(path.join(dir, 'khayt-keychain-ok.flag'), '1');

  return dir;
}

export async function launchApp(userData) {
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: root,
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
    timeout: 120_000,
  });
  const window = await electronApp.firstWindow();
  await window.waitForSelector('.khayt-app', { timeout: 60_000 });
  await window.waitForFunction(
    () => typeof window.hubAPI?.loadStore === 'function'
      && typeof window.hubAPI?.saveStore === 'function'
      && typeof window.importClientsCsv === 'function'
      && (document.querySelector('#dashboardContent')?.innerHTML?.length || 0) > 100,
    { timeout: 60_000 }
  );
  return { electronApp, window };
}

export async function dismissWizard(window) {
  await window.evaluate(() => {
    const wiz = document.querySelector('#setup-wizard');
    if (wiz) wiz.style.display = 'none';
    if (typeof settings !== 'undefined' && settings) settings.firstRun = false;
  });
}

export async function lanRequest(port, pathname, { method = 'GET', pin, body } = {}) {
  const url = new URL(pathname, `http://127.0.0.1:${port}`);
  if (pin) url.searchParams.set('pin', pin);
  const headers = {};
  if (pin) headers['x-khayt-pin'] = pin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed;
  const text = await res.text();
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

export async function switchTab(window, tabId) {
  await window.evaluate((id) => window.KhaytShell?.switchTab?.(id), tabId);
  await window.waitForFunction(
    (id) => document.getElementById(id)?.classList.contains('active') === true,
    tabId,
    { timeout: 15_000 }
  );
}

export function assertStatus(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${actual}`);
  }
}

/** Apply a built-in design theme + appearance inside the renderer. */
export async function applyDesignTheme(window, { designId, appearance = 'dark' } = {}) {
  await window.evaluate(({ id, app }) => {
    settings.designTheme = id;
    settings.theme = app;
    if (typeof applyTheme === 'function') applyTheme(app);
    if (typeof applyDesignSettings === 'function') applyDesignSettings();
  }, { id: designId, app: appearance });
  await window.waitForFunction(
    (id) => document.documentElement.dataset.design === id,
    designId,
    { timeout: 15_000 },
  );
}
