const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../renderer/util.js');
require('../renderer/format.js');

test('computeMaterialForecast flags overcommitted spools', () => {
  global.inventory = [{ id: 'S1', material: 'PLA', weight: 100 }];
  global.printLog = [{
    status: 'printing',
    parts: [{ filamentId: 'S1', printWeight: 120 }],
  }];
  const { computeMaterialForecast } = require('../renderer/inventory.js');
  const forecast = computeMaterialForecast();
  assert.equal(forecast.length, 1);
  assert.equal(forecast[0].material, 'PLA');
  assert.equal(forecast[0].available, -20);
  assert.equal(forecast[0].urgent, true);
});

test('KhaytInventory exports inventory tab entry points', () => {
  const api = require('../renderer/inventory.js');
  assert.equal(typeof api.renderInventory, 'function');
  assert.equal(typeof api.renderCatalog, 'function');
  assert.equal(typeof api.deductFilamentForOrder, 'function');
  assert.equal(typeof api.isLowStock, 'function');
});

test('isLowStock uses reorderPoint, then settings threshold, then 200 fallback', () => {
  const { isLowStock } = require('../renderer/inventory.js');
  // Explicit per-item reorder point wins.
  global.settings = { lowStockThreshold: 50 };
  assert.equal(isLowStock({ weight: 100, reorderPoint: 120 }), true);
  assert.equal(isLowStock({ weight: 130, reorderPoint: 120 }), false);
  // At-threshold counts as low (<=) so banner and badge agree.
  assert.equal(isLowStock({ weight: 120, reorderPoint: 120 }), true);
  // Falls back to settings.lowStockThreshold when no reorderPoint.
  assert.equal(isLowStock({ weight: 40 }), true);
  assert.equal(isLowStock({ weight: 60 }), false);
  // Falls back to 200 default when settings threshold is also absent.
  global.settings = {};
  assert.equal(isLowStock({ weight: 150 }), true);
  assert.equal(isLowStock({ weight: 250 }), false);
  assert.equal(isLowStock(null), false);
});

test('deductFilamentForOrder emits ONE aggregated toast and surfaces low-stock', () => {
  const api = require('../renderer/inventory.js');
  const toasts = [];
  global.settings = { autoDeduct: true, lowStockThreshold: 200 };
  global.inventory = [
    { id: 'S1', material: 'PLA', weight: 1000, reorderPoint: 100 },
    { id: 'S2', material: 'PETG', weight: 150, reorderPoint: 100 }, // will drop below 100
    { id: 'S3', material: 'ABS', weight: 500, reorderPoint: 100 },
  ];
  global.consumables = [];
  global.toast = (msg) => toasts.push(msg);
  global.t = (key, fields) => `${key}:${JSON.stringify(fields || {})}`;
  global.saveAll = () => {};
  global.renderInventory = () => {};
  global.renderConsumables = () => {};

  const order = {
    id: 'O1',
    parts: [
      { filamentId: 'S1', printWeight: 100, qty: 1 },  // 100g
      { filamentId: 'S2', printWeight: 60, qty: 1 },   // 60g → S2 -> 90 (low)
      { filamentId: 'S3', printWeight: 160, qty: 1 },  // 160g
    ],
  };
  api.deductFilamentForOrder(order, { skipRender: true });

  // Exactly one filament toast — not one per spool.
  assert.equal(toasts.length, 1);
  // Aggregated total = 320g across 3 spools, 1 now low (S2).
  assert.match(toasts[0], /inv\.deducted_summary_low/);
  assert.match(toasts[0], /"weight":320/);
  assert.match(toasts[0], /"spools":3/);
  assert.match(toasts[0], /"low":1/);
  assert.equal(order.materialDeducted, true);
});

test('deductFilamentForOrder uses non-low summary when nothing drops below', () => {
  const api = require('../renderer/inventory.js');
  const toasts = [];
  global.settings = { autoDeduct: true, lowStockThreshold: 200 };
  global.inventory = [{ id: 'S1', material: 'PLA', weight: 1000, reorderPoint: 100 }];
  global.consumables = [];
  global.toast = (msg) => toasts.push(msg);
  global.t = (key, fields) => `${key}:${JSON.stringify(fields || {})}`;
  global.saveAll = () => {};
  global.renderInventory = () => {};
  global.renderConsumables = () => {};

  api.deductFilamentForOrder({ id: 'O2', parts: [{ filamentId: 'S1', printWeight: 50, qty: 1 }] }, { skipRender: true });
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /inv\.deducted_summary:/);
  assert.match(toasts[0], /"low":0/);
});
