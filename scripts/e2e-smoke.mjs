#!/usr/bin/env node
/**
 * E2E critical flows: boot, tabs, order lifecycle, store I/O, LAN PIN gate.
 * Requires display (use xvfb-run on Linux CI).
 */
import fs from 'fs';
import zipWrite from '../lib/zip-write.js';
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
    // Regression: subscriptions + auditLog must survive the save/load round-trip
    // (they used to be stripped by normalizeStoreSnapshot and reset on restart).
    data.subscriptions = [{ id: 'SUB-e2e', clientId: 'C-e2e', amount: 250 }];
    data.auditLog = [{ at: 1, actor: 'e2e', action: 'test' }];
    return window.hubAPI.saveStore(data);
  });
  if (!saveResult?.ok) throw new Error(`saveStore failed: ${JSON.stringify(saveResult)}`);

  const reloaded = await window.evaluate(async () => {
    const data = await window.hubAPI.loadStore();
    return {
      shopName: data?.settings?.shopName,
      subCount: (data?.subscriptions || []).length,
      subId: (data?.subscriptions || [])[0]?.id,
      auditCount: (data?.auditLog || []).length,
    };
  });
  if (reloaded.shopName !== 'E2E Smoke Test') {
    throw new Error(`store round-trip mismatch: got ${JSON.stringify(reloaded)}`);
  }
  if (reloaded.subCount !== 1 || reloaded.subId !== 'SUB-e2e' || reloaded.auditCount !== 1) {
    throw new Error(`subscriptions/auditLog not persisted: ${JSON.stringify(reloaded)}`);
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
      catalogHidden: !vis('tabbtn-catalog-tab'),      // Product Catalog = commerce
      analyticsHidden: !vis('tabbtn-analytics-tab'),  // Analytics = commerce
      printfilesVisible: vis('tabbtn-printfiles-tab'),
      calcVisible: vis('tabbtn-calculator-tab'),
    };
    switchTab('logs-tab'); // hidden business tab → must bounce to dashboard
    out.guarded = document.querySelector('.tab-content.active')?.id === 'dashboard-tab';
    switchTab('catalog-tab'); // commerce tab → must bounce too
    out.catalogGuarded = document.querySelector('.tab-content.active')?.id === 'dashboard-tab';
    // Calculator stays, but its commerce affordances are hidden while the printer picker stays.
    switchTab('calculator-tab');
    out.calcQuoteHidden = !vis('btnSaveAsQuote');
    out.calcClientHidden = !vis('clientInput');
    out.calcPrinterVisible = vis('machineAssign');
    // beta.15: enthusiast must not show margin / discount / AI price-suggest, and
    // the "Project total" (a selling price) must be relabelled to Total cost.
    out.calcMarginHidden = !vis('margin');
    out.calcDiscountHidden = !vis('discountPct');
    out.calcAiPriceHidden = !vis('btnAiPrice');
    if (typeof updateGrandTotal === 'function') updateGrandTotal();
    out.calcTotalCostLabel = /cost/i.test(document.querySelector('.total-display .label')?.textContent || '');
    switchTab('printfiles-tab');
    out.pfRendered = document.querySelector('.tab-content.active')?.id === 'printfiles-tab'
      && (document.getElementById('printfiles-tab')?.innerHTML?.length || 0) > 50;
    printFiles.unshift({ id: 'PF-e2e', name: 'E2E Model', originalName: 'e2e.stl', sourceFile: { filename: 'm.stl', ext: 'stl' }, createdAt: 1, updatedAt: 1 });
    await window.hubAPI.saveStore(buildStoreSnapshot());
    const loaded = await window.hubAPI.loadStore();
    out.pfPersisted = Array.isArray(loaded.printFiles) && loaded.printFiles.some((x) => x.id === 'PF-e2e');
    // Enthusiast production queue must not expose commerce actions or client/price on cards.
    printLog.unshift({ id: 'K-e2e', project: 'E2E Print', client: 'E2E Client', status: 'completed', price: 42, parts: [{ material: 'PLA' }], date: '2026-01-01' });
    switchTab('queue-tab');
    if (typeof renderKanban === 'function') renderKanban();
    const qhtml = document.getElementById('queue-tab')?.innerHTML || '';
    out.enthQueueNoCommerce = !qhtml.includes('data-act="invoice"') && !qhtml.includes('data-act="pay"') && !qhtml.includes('data-act="bnpl-pay"');
    // Enthusiast global search must not leak commerce entities (orders/clients).
    clients.unshift({ id: 'C-e2e', nameEn: 'E2E Client' });
    if (typeof renderGlobalResults === 'function' && document.getElementById('globalSearchResults')) {
      renderGlobalResults('e2e');
      const gs = document.getElementById('globalSearchResults')?.innerHTML || '';
      out.enthSearchNoCommerce = !gs.includes('data-gs-action="client"') && !gs.includes('data-gs-action="order"');
    } else {
      out.enthSearchNoCommerce = true;
    }
    // Simple mode: business basics reachable (analytics/reports + catalog), Pro depth hidden (expenses).
    settings.mode = 'simple'; applyMode();
    out.simpleAnalyticsVisible = vis('tabbtn-analytics-tab'); // Sales reports available to small shops
    out.simpleCatalogVisible = vis('tabbtn-catalog-tab');
    out.simpleExpensesHidden = !vis('tabbtn-expenses-tab');   // Expense tracking = Pro only
    switchTab('analytics-tab'); // reachable (not bounced) in simple
    out.simpleAnalyticsReachable = document.querySelector('.tab-content.active')?.id === 'analytics-tab';
    // beta.15: ZATCA Phase 2 (Pro-only e-invoicing) must not render in Simple mode.
    if (typeof renderZatcaPhase2Settings === 'function') {
      renderZatcaPhase2Settings();
      out.simpleZatca2Empty = (document.getElementById('zatcaPhase2Section')?.innerHTML || '') === '';
    } else { out.simpleZatca2Empty = true; }
    settings.mode = 'professional'; applyMode();
    if (typeof renderZatcaPhase2Settings === 'function') {
      renderZatcaPhase2Settings();
      out.proZatca2Rendered = (document.getElementById('zatcaPhase2Section')?.innerHTML || '').length > 20;
    } else { out.proZatca2Rendered = true; }
    return out;
  });
  const bad = Object.entries(r).filter(([, v]) => v !== true).map(([k]) => k);
  if (bad.length) throw new Error(`enthusiast/print-file checks failed: ${bad.join(', ')} — ${JSON.stringify(r)}`);
}

// 3.1 beta.2: Colour studio renders (personal-core, incl. enthusiast); multicolour
// planner cost-trick is exact and completion deduction draws from each colour's spool.
async function testColourStudioAndPlanner(window) {
  const r = await window.evaluate(async () => {
    const out = {};
    // Colour tab is personal core → visible in enthusiast mode and renders.
    settings.mode = 'enthusiast'; applyMode();
    out.colorTabVisible = !!(document.getElementById('tabbtn-colorstudio-tab')?.offsetParent);
    switchTab('colorstudio-tab');
    out.csRendered = document.querySelector('.tab-content.active')?.id === 'colorstudio-tab'
      && !!document.getElementById('csMatchResults');
    settings.mode = 'professional'; applyMode();

    // Seed two coloured filaments.
    const red = { id: 'INV-red', material: 'PLA Red', color: '#E23B3B', colourVariant: 'Red', cost: 20, weight: 1000, materialType: 'fdm' };
    const blue = { id: 'INV-blue', material: 'PLA Blue', color: '#2C63E8', colourVariant: 'Blue', cost: 30, weight: 1000, materialType: 'fdm' };
    inventory.push(red, blue);

    // Matcher: nearest to pure red is the red spool.
    out.nearRed = KhaytColor.nearest('#FF0000', inventory.filter((i) => KhaytColor.hexToRgb(i.color)))[0]?.id === 'INV-red';

    // Synthesize a planned part exactly like the planner: 100 g red @0.02/g + 50 g blue @0.03/g.
    const gRed = 100, gBlue = 50;
    const cpg = (it) => it.cost / it.weight;
    const colours = [
      { filamentId: 'INV-red', hex: '#E23B3B', grams: gRed, cost: cpg(red) * gRed },   // 2.0
      { filamentId: 'INV-blue', hex: '#2C63E8', grams: gBlue, cost: cpg(blue) * gBlue }, // 1.5
    ];
    const totalGrams = gRed + gBlue;                            // 150
    const totalCost = colours.reduce((s, c) => s + c.cost, 0);  // 3.5
    const part = {
      name: 'MC', material: 'Multicolour', filamentId: 'INV-red',
      spoolCost: totalCost, spoolWeight: totalGrams, printWeight: totalGrams, supportWeight: 0,
      printTime: 0, qty: 1, extraMaterials: [], priceTiers: [], failureRate: 0, colours,
    };
    // The cost trick: material component of the synthesized part == Σ per-colour cost.
    out.costTrick = Math.abs(computePartBreakdown(part).material - totalCost) < 1e-6;

    // Completion deduction pulls each colour's grams from its own spool.
    settings.autoDeduct = true;
    deductFilamentForOrder({ id: 'ORD-mc', status: 'completed', parts: [{ ...part, id: 'PRT-mc' }] }, { skipRender: true });
    out.redDeducted = inventory.find((i) => i.id === 'INV-red').weight === 1000 - gRed;   // 900
    out.blueDeducted = inventory.find((i) => i.id === 'INV-blue').weight === 1000 - gBlue; // 950
    return out;
  });
  const bad = Object.entries(r).filter(([, v]) => v !== true).map(([k]) => k);
  if (bad.length) throw new Error(`colour-studio/planner checks failed: ${bad.join(', ')} — ${JSON.stringify(r)}`);
}

// 3.1 beta.3: multi-slicer — legacy single slicer migrates into slicers[]; the settings
// list renders a row per slicer and the default helper honours defaultSlicerId.
async function testMultiSlicer(window) {
  const r = await window.evaluate(async () => {
    const out = {};
    // Start from the legacy single-slicer shape.
    settings.slicers = undefined;
    settings.defaultSlicerId = null;
    settings.slicer = { path: '/x/PrusaSlicer.app', args: '-a' };
    switchTab('settings-tab');
    renderSlicerSettings(); // runs the one-time migration
    out.migrated = Array.isArray(settings.slicers) && settings.slicers.length === 1
      && settings.slicers[0].path === '/x/PrusaSlicer.app';
    out.rows1 = document.querySelectorAll('#slicerSettingsSection .slicer-row').length === 1;

    // Add a second slicer and make it default.
    settings.slicers.push({ id: 'sl-orca', name: 'OrcaSlicer', path: '/x/OrcaSlicer.exe', args: '' });
    settings.defaultSlicerId = 'sl-orca';
    out.list2 = KhaytSlicers.listSlicers(settings).length === 2;
    out.defOrca = KhaytSlicers.defaultSlicer(settings).id === 'sl-orca';
    renderSlicerSettings();
    out.rows2 = document.querySelectorAll('#slicerSettingsSection .slicer-row').length === 2;
    // Default is mirrored into the legacy field for slice-and-print consumers.
    out.mirror = settings.slicer.path === '/x/OrcaSlicer.exe';

    // Auto-detect scans the machine and returns a well-formed {ok, slicers[]}
    // list of {name, path}; merging never duplicates paths already listed.
    const det = await window.hubAPI.detectSlicers();
    out.detectShape = !!(det && det.ok === true && Array.isArray(det.slicers)
      && det.slicers.every((s) => s && typeof s.name === 'string' && typeof s.path === 'string'));
    const before = settings.slicers.length;
    const added = await detectAndMergeSlicers();
    out.mergeNoDupes = settings.slicers.length === before + added && added >= 0;
    const paths = settings.slicers.map((s) => s.path.toLowerCase());
    out.uniquePaths = new Set(paths).size === paths.length;

    // Reset.
    settings.slicers = undefined; settings.defaultSlicerId = null;
    settings.slicer = { path: '', args: '' }; settings.slicersAutoDetected = false;
    return out;
  });
  const bad = Object.entries(r).filter(([, v]) => v !== true).map(([k]) => k);
  if (bad.length) throw new Error(`multi-slicer checks failed: ${bad.join(', ')} — ${JSON.stringify(r)}`);
}

// 3.1 beta.5: 3MF converter — the Converter tab renders, and the real main-process
// pipeline analyzes a synthesized Bambu 3MF and retargets it (re-profile + slot remap).
async function testConverter(window) {
  const model = '<?xml version="1.0"?><model unit="millimeter"><resources><object id="1"/></resources></model>';
  const proj = JSON.stringify({ printer_model: 'Orig', nozzle_diameter: ['0.4'], filament_colour: ['#FF0000', '#00FF00'], filament_type: ['PLA', 'PLA'] });
  const srcPath = `${userData}/conv-src.3mf`;
  const outPath = `${userData}/conv-out.3mf`;
  fs.writeFileSync(srcPath, zipWrite.writeZip([
    { name: '3D/3dmodel.model', data: model },
    { name: 'Metadata/project_settings.config', data: proj },
  ]));

  const r = await window.evaluate(async ({ src, out }) => {
    const res = {};
    switchTab('converter-tab');
    res.tabRendered = document.querySelector('.tab-content.active')?.id === 'converter-tab'
      && (document.getElementById('converter-tab')?.innerHTML?.length || 0) > 50;
    res.hasProfiles = !!(globalThis.KhaytPrinterProfiles && KhaytPrinterProfiles.listProfiles().length >= 4);
    // 3.2: batch pickers exposed, and the custom-printer manager renders in the tab.
    res.pickers = typeof window.hubAPI.mfPickMulti === 'function' && typeof window.hubAPI.mfPickOutdir === 'function';
    res.cpManager = (document.getElementById('converter-tab')?.innerHTML || '').includes('conv-cp');
    const a = await window.hubAPI.mfAnalyze(src);
    res.analyzeOk = !!a.ok; res.flavour = a.flavour; res.colorCount = a.colorCount;
    res.hasMeta = !!(a.meta && typeof a.meta === 'object');
    // 3.2: convert for a user-defined printer via an explicit target profile (no registry entry).
    const cust = await window.hubAPI.mfConvert({ path: src, targetId: 'x', mode: 'retarget', intoVaultId: 'PF-conv-cust',
      targetProfile: { id: 'custom-e2e', name: 'E2E Bot', flavour: 'bambu', maxColors: 4, bed: { x: 300, y: 300, z: 300 }, nozzle: 0.4, printerModel: 'E2E Bot' } });
    res.customOk = !!(cust.ok && cust.report && /E2E Bot/.test(cust.report.targetName || ''));
    const c = await window.hubAPI.mfConvert({ path: src, targetId: 'snapmaker-u1', mode: 'retarget', slotMap: [1, 0], outPath: out });
    res.convertOk = !!c.ok; res.target = c.report && c.report.target; res.remapped = c.report && c.report.colorsRemapped;

    // 3.1: in-app destination — convert straight into a print-file vault (no folder dialog).
    const vaultId = 'PF-conv-e2e';
    const v = await window.hubAPI.mfConvert({ path: src, targetId: 'snapmaker-u1', mode: 'retarget', slotMap: [1, 0], intoVaultId: vaultId });
    res.vaultOk = !!(v.ok && v.vault && v.filename && v.outPath);
    const files = await window.hubAPI.printLibList(vaultId);
    res.vaultListed = Array.isArray(files) && files.some((f) => f.filename === v.filename);
    if (typeof importConvertedAsNew === 'function') {
      await importConvertedAsNew({ vaultId, filename: v.filename, ext: v.ext, size: v.size, targetId: 'snapmaker-u1', targetName: 'Snapmaker U1', sourceName: 'conv-src.3mf' });
      res.recordCreated = (printFiles || []).some((p) => p.id === vaultId);
    }
    return res;
  }, { src: srcPath, out: outPath });

  const checks = {
    tabRendered: r.tabRendered === true,
    hasProfiles: r.hasProfiles === true,
    pickers: r.pickers === true,
    cpManager: r.cpManager === true,
    analyzeOk: r.analyzeOk === true,
    hasMeta: r.hasMeta === true,
    customOk: r.customOk === true,
    flavourBambu: r.flavour === 'bambu',
    colorCount2: r.colorCount === 2,
    convertOk: r.convertOk === true,
    targetU1: r.target === 'snapmaker-u1',
    remapped: r.remapped >= 1,
    outWritten: fs.existsSync(outPath) && fs.statSync(outPath).size > 0,
    vaultConvertOk: r.vaultOk === true,
    vaultListed: r.vaultListed === true,
    recordCreated: r.recordCreated === true,
  };
  const bad = Object.entries(checks).filter(([, v]) => v !== true).map(([k]) => k);
  if (bad.length) throw new Error(`converter checks failed: ${bad.join(', ')} — ${JSON.stringify(r)}`);
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
  await testColourStudioAndPlanner(window);
  await testConverter(window);

  console.log(
    'e2e-smoke: ok (version=%s, tabs + order %s + store + LAN PIN gate)',
    version,
    orderId
  );
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
