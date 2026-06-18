/**
 * Render-path regression tests.
 *
 * These exercise renderer functions that write into the real DOM (via the
 * jsdom harness loading renderer/index.html). They lock in fixes from the 2.7
 * QA pass that previously could only be verified by standalone scripts because
 * they live on the render path, not in pure-compute helpers.
 */
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupDom } = require('./helpers/dom.js');

let dom;
beforeEach(() => { dom = setupDom(); });
afterEach(() => { dom.teardown(); });

test('harness: $ / $$ resolve real index.html elements', () => {
  assert.ok($('#invoice-print-area'), '#invoice-print-area should exist in index.html');
  assert.ok($('#stat-revenue'), '#stat-revenue should exist in index.html');
  assert.ok($$('[data-i18n]').length > 0, '$$ should find translatable nodes');
});

test('renderInvoice: populates print area without throwing (C1 subtotalShown)', () => {
  dom.loadI18n();
  require('../renderer/format.js');
  require('../renderer/currency.js');
  require('../renderer/app-helpers.js');
  const inv = require('../renderer/invoicing.js');

  global.settings = { currency: 'SAR', vatEnabled: true, vatRate: 15, businessName: 'Khayt' };
  global.clients = [];
  global.printLog = [];

  const order = {
    id: 'o1', orderName: 'Test', clientId: null, status: 'completed',
    date: '2026-06-01', price: 115, qty: 1, item: 'Widget',
  };

  assert.doesNotThrow(() => {
    inv.renderInvoice(order, {
      qrSvg: '', payQrSvg: '', total: 115, vatAmount: 15,
      subtotal: 100, subtotalShown: '100.00', vatRate: 15, shipping: 0,
    });
  });

  const area = $('#invoice-print-area');
  assert.ok(area.innerHTML.length > 0, 'print area should be populated');
  assert.ok(area.innerHTML.includes('100.00'), 'subtotalShown value should appear in the invoice');
});

function loadAnalyticsStack() {
  dom.loadI18n();
  require('../renderer/format.js');
  require('../renderer/currency.js');
  require('../renderer/app-helpers.js');
  require('../renderer/dashboard.js'); // renderMaterialUsageChart / renderFilamentAnalytics
  require('../renderer/analytics.js');
}

test('renderAnalytics: renders the full analytics tree without throwing', () => {
  loadAnalyticsStack();
  dom.seedState({
    settings: { currency: 'SAR', fixedCosts: [] },
    printLog: [
      { id: 'a', status: 'completed', date: '2026-06-01', price: 115, printTime: 2.5, clientId: null },
      { id: 'b', status: 'printing', date: '2026-06-03', price: 50, printTime: 3, clientId: null },
    ],
  });
  // A regression that throws in any sub-renderer (PnL, SLA, charts, operator,
  // filament …) surfaces here — this guards the whole analytics render path.
  assert.doesNotThrow(() => global.renderAnalytics());
  assert.ok($('#pnlSection').innerHTML.length > 0, 'P&L section should render (M4)');
  assert.ok($('#slaSection').innerHTML.length > 0, 'SLA section should render (M5)');
});

test('renderAnalytics: hours sum spans all in-range orders, not just completed (H6)', () => {
  loadAnalyticsStack();
  dom.seedState({
    settings: { currency: 'SAR', fixedCosts: [] },
    printLog: [
      { id: 'a', status: 'completed', date: '2026-06-01', price: 115, printTime: 2.5, clientId: null },
      { id: 'b', status: 'printing', date: '2026-06-02', price: 200, printTime: 1.5, clientId: null },
      { id: 'c', status: 'pending', date: '2026-06-03', price: 50, printTime: 3, clientId: null },
    ],
  });
  global.renderAnalytics();
  // 2.5 + 1.5 + 3 = 7.0 — includes printing/pending, not just completed.
  assert.equal($('#stat-hours').textContent, '7.0');
});

test('renderAnalytics: quote conversion stays within the created cohort, never >100% (H7)', () => {
  loadAnalyticsStack();
  dom.seedState({
    settings: { currency: 'SAR', fixedCosts: [] },
    printLog: [
      // sent + accepted in range → counts as created AND converted
      { id: 'b', status: 'completed', date: '2026-06-02', price: 200, printTime: 1, clientId: null, quoteSentAt: '2026-05-20', quoteAcceptedAt: '2026-05-25' },
      // sent in range, not accepted → created, not converted
      { id: 'c', status: 'printing', date: '2026-06-03', price: 50, printTime: 1, clientId: null, quoteSentAt: '2026-05-21' },
      // accepted but NEVER sent → must NOT inflate the rate above 100%
      { id: 'd', status: 'completed', date: '2026-06-04', price: 80, printTime: 1, clientId: null, quoteAcceptedAt: '2026-05-26' },
    ],
  });
  global.renderAnalytics();
  assert.equal($('#stat-quotes-created').textContent, '2', 'only quotes with quoteSentAt count as created');
  assert.equal($('#stat-conv-rate').textContent, '50%', '1 of 2 created quotes converted; the unsent-but-accepted order is excluded');
});
