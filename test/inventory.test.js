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
});
