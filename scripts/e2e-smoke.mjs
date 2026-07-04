#!/usr/bin/env node
/**
 * E2E critical flows: boot, tabs, order lifecycle, store I/O, LAN PIN gate.
 * Requires display (use xvfb-run on Linux CI).
 */
import fs from 'fs';
import {
  E2E_LAN_PIN,
  E2E_LAN_PORT,
  assertStatus,
  dismissWizard,
  lanRequest,
  launchApp,
  makeUserDataDir,
  switchTab,
} from './e2e/helpers.mjs';

const userData = makeUserDataDir();
let electronApp;

async function testBootAndDashboard(window) {
  const boot = await window.evaluate(() => ({
    importClientsCsv: typeof importClientsCsv,
    dashboardLen: document.querySelector('#dashboardContent')?.innerHTML?.length || 0,
  }));
  if (boot.importClientsCsv !== 'function') {
    throw new Error('importClientsCsv is not on global scope — wireEvents may have failed');
  }
  if (boot.dashboardLen < 100) {
    throw new Error(`dashboard did not render (content length ${boot.dashboardLen})`);
  }
}

async function testSettingsNav(window) {
  await switchTab(window, 'settings-tab');
  await window.click('.settings-nav-item[data-settings-section="prefs"]');
  const prefsActive = await window.evaluate(
    () => document.querySelector('#settings-panel-prefs')?.classList.contains('active') === true
  );
  if (!prefsActive) throw new Error('settings sidebar navigation did not switch panels');
}

async function testStoreRoundTrip(window) {
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
  return version;
}

async function testTabNavigation(window) {
  await switchTab(window, 'queue-tab');
  const kanban = await window.evaluate(() => ({
    pending: !!document.querySelector('#list-pending'),
    printing: !!document.querySelector('#list-printing'),
    cols: document.querySelectorAll('.kanban-col').length,
  }));
  if (!kanban.pending || kanban.cols < 5) {
    throw new Error(`queue tab kanban not rendered: ${JSON.stringify(kanban)}`);
  }

  await switchTab(window, 'calculator-tab');
  const calcReady = await window.evaluate(
    () => !!document.querySelector('#margin') && typeof logPrint === 'function'
  );
  if (!calcReady) throw new Error('calculator tab did not load build UI');

  await switchTab(window, 'logs-tab');
  const logsReady = await window.evaluate(() => !!document.querySelector('#logTable tbody'));
  if (!logsReady) throw new Error('logs tab table not rendered');
}

async function testOrderLifecycle(window) {
  const orderId = await window.evaluate(async () => {
    const id = `E2E-${Date.now()}`;
    const order = {
      id,
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      project: 'E2E Lifecycle Order',
      status: 'pending',
      price: 150,
      material: 'PLA',
      printTime: 2,
      parts: [{ name: 'Test cube', qty: 1, material: 'PLA', baseCost: 50, printTime: 2 }],
      statusHistory: [{ status: 'pending', at: new Date().toISOString() }],
      queuePos: 1,
    };
    printLog.unshift(order);
    await saveAll();
    renderKanban();
    renderLogs();
    return id;
  });

  await switchTab(window, 'queue-tab');
  await window.waitForFunction(
    (id) => !!document.querySelector(`#list-pending [data-id="${id}"]`),
    orderId,
    { timeout: 15_000 }
  );

  await switchTab(window, 'logs-tab');
  await window.waitForFunction(
    (id) => (document.querySelector('#logTable tbody')?.textContent || '').includes(id),
    orderId,
    { timeout: 15_000 }
  );

  const newStatus = await window.evaluate(async (id) => {
    const order = printLog.find(o => o.id === id);
    if (!order) return null;
    order.status = 'printing';
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({ status: 'printing', at: new Date().toISOString() });
    await saveAll();
    renderKanban();
    renderLogs();
    return order.status;
  }, orderId);
  if (newStatus !== 'printing') throw new Error('order status update failed');

  await switchTab(window, 'queue-tab');
  await window.waitForFunction(
    (id) => !!document.querySelector(`#list-printing [data-id="${id}"]`),
    orderId,
    { timeout: 15_000 }
  );

  return orderId;
}

async function testLedgerTabNavigation(window) {
  await window.evaluate(() => {
    settings.designTheme = 'ledger';
    settings.theme = 'light';
    if (typeof applyDesignSettings === 'function') applyDesignSettings();
    if (typeof applyTheme === 'function') applyTheme('light');
  });
  await window.waitForFunction(
    () => document.body.classList.contains('khayt-ledger')
      && document.querySelector('.khayt-body')?.dataset.ledgerLayout === 'mounted',
    { timeout: 10_000 }
  );

  await window.click('#tabbtn-queue-tab');
  await window.waitForFunction(
    () => document.getElementById('queue-tab')?.classList.contains('active') === true,
    { timeout: 10_000 }
  );
  const queueReady = await window.evaluate(
    () => !!document.querySelector('#list-pending') && document.querySelectorAll('.kanban-col').length >= 5
  );
  if (!queueReady) throw new Error('ledger theme: queue tab did not activate after click');

  await window.click('#tabbtn-settings-tab');
  await window.waitForFunction(
    () => document.getElementById('settings-tab')?.classList.contains('active') === true,
    { timeout: 10_000 }
  );

  await window.evaluate(() => {
    settings.designTheme = 'studio';
    if (typeof applyDesignSettings === 'function') applyDesignSettings();
  });
  await window.waitForFunction(
    () => document.body.classList.contains('khayt-studio')
      && !document.body.classList.contains('khayt-ledger'),
    { timeout: 10_000 }
  );
}

async function testLanPinGate(window) {
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

  assertStatus('GET /api/status?format=json', (await lanRequest(port, '/api/status?format=json')).status, 200);
  assertStatus('GET /intake', (await lanRequest(port, '/intake')).status, 200);
  assertStatus('GET /api/orders without PIN', (await lanRequest(port, '/api/orders')).status, 401);

  const ordersWithPin = await lanRequest(port, '/api/orders', { pin: E2E_LAN_PIN });
  assertStatus('GET /api/orders with PIN', ordersWithPin.status, 200);
  if (!Array.isArray(ordersWithPin.body)) {
    throw new Error('GET /api/orders with PIN expected array body');
  }

  assertStatus(
    'POST /api/inventory without PIN',
    (await lanRequest(port, '/api/inventory', { method: 'POST', body: { material: 'PLA', weightTotal: 1000 } })).status,
    401
  );
  assertStatus(
    'POST /api/inventory with PIN',
    (await lanRequest(port, '/api/inventory', {
      method: 'POST',
      pin: E2E_LAN_PIN,
      body: { material: 'PLA', weightTotal: 1000 },
    })).status,
    201
  );

  await window.evaluate(() => window.hubAPI.stopLanServer());
}

// 3.1: enthusiast (hobbyist) mode hides commerce; print-file library tab works.
async function testEnthusiastAndPrintFiles(window) {
  const r = await window.evaluate(async () => {
    settings.mode = 'enthusiast'; applyMode();
    const vis = (id) => { const b = document.getElementById(id); return !!(b && b.offsetParent !== null); };
    const out = {
      body: document.body.classList.contains('mode-enthusiast'),
      logsHidden: !vis('tabbtn-logs-tab'),
      clientsHidden: !vis('tabbtn-clients-tab'),
      printfilesVisible: vis('tabbtn-printfiles-tab'),
      calcVisible: vis('tabbtn-calculator-tab'),
    };
    switchTab('logs-tab'); // hidden business tab → must bounce to dashboard
    out.guarded = document.querySelector('.tab-content.active')?.id === 'dashboard-tab';
    switchTab('printfiles-tab');
    out.pfRendered = document.querySelector('.tab-content.active')?.id === 'printfiles-tab'
      && (document.getElementById('printfiles-tab')?.innerHTML?.length || 0) > 50;
    printFiles.unshift({ id: 'PF-e2e', name: 'E2E Model', originalName: 'e2e.stl', sourceFile: { filename: 'm.stl', ext: 'stl' }, createdAt: 1, updatedAt: 1 });
    await window.hubAPI.saveStore(buildStoreSnapshot());
    const loaded = await window.hubAPI.loadStore();
    out.pfPersisted = Array.isArray(loaded.printFiles) && loaded.printFiles.some((x) => x.id === 'PF-e2e');
    settings.mode = 'professional'; applyMode();
    return out;
  });
  const bad = Object.entries(r).filter(([, v]) => v !== true).map(([k]) => k);
  if (bad.length) throw new Error(`enthusiast/print-file checks failed: ${bad.join(', ')} — ${JSON.stringify(r)}`);
}

try {
  ({ electronApp } = await launchApp(userData));
  const window = await electronApp.firstWindow();
  await dismissWizard(window);

  await testBootAndDashboard(window);
  await testSettingsNav(window);
  const version = await testStoreRoundTrip(window);
  await testTabNavigation(window);
  await testLedgerTabNavigation(window);
  const orderId = await testOrderLifecycle(window);
  await testLanPinGate(window);
  await testEnthusiastAndPrintFiles(window);

  console.log(
    'e2e-smoke: ok (version=%s, tabs + order %s + store + LAN PIN gate)',
    version,
    orderId
  );
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
