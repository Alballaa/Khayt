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
const E2E_LAN_PORT = 13_219;
const E2E_LAN_PIN = 'e2e-smoke-pin';

async function lanRequest(port, pathname, { method = 'GET', pin, body } = {}) {
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

  const lanStart = await window.evaluate(async ({ port, pin }) => {
    const data = (await window.hubAPI.loadStore()) || {};
    data.settings = data.settings || {};
    data.settings.lanApi = { ...(data.settings.lanApi || {}), pin };
    const save = await window.hubAPI.saveStore(data);
    if (!save?.ok) return { ok: false, error: 'saveStore before LAN' };
    return window.hubAPI.startLanServer({ port, pin, bindLan: 'loopback' });
  }, { port: E2E_LAN_PORT, pin: E2E_LAN_PIN });
  if (!lanStart?.ok) throw new Error(`startLanServer failed: ${JSON.stringify(lanStart)}`);

  const port = lanStart.port || E2E_LAN_PORT;
  const statusPublic = await lanRequest(port, '/api/status');
  if (statusPublic.status !== 200) {
    throw new Error(`GET /api/status expected 200, got ${statusPublic.status}`);
  }

  const ordersNoPin = await lanRequest(port, '/api/orders');
  if (ordersNoPin.status !== 401) {
    throw new Error(`GET /api/orders without PIN expected 401, got ${ordersNoPin.status}`);
  }

  const ordersWithPin = await lanRequest(port, '/api/orders', { pin: E2E_LAN_PIN });
  if (ordersWithPin.status !== 200 || !Array.isArray(ordersWithPin.body)) {
    throw new Error(`GET /api/orders with PIN expected 200 array, got ${ordersWithPin.status}`);
  }

  const writeNoPin = await lanRequest(port, '/api/inventory', {
    method: 'POST',
    body: { material: 'PLA', weightTotal: 1000 },
  });
  if (writeNoPin.status !== 401) {
    throw new Error(`POST /api/inventory without PIN expected 401, got ${writeNoPin.status}`);
  }

  const writeWithPin = await lanRequest(port, '/api/inventory', {
    method: 'POST',
    pin: E2E_LAN_PIN,
    body: { material: 'PLA', weightTotal: 1000 },
  });
  if (writeWithPin.status !== 201) {
    throw new Error(`POST /api/inventory with PIN expected 201, got ${writeWithPin.status}`);
  }

  await window.evaluate(() => window.hubAPI.stopLanServer());

  console.log('e2e-smoke: ok (version=%s, store + LAN PIN gate)', version);
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
