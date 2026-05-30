const { test } = require('node:test');
const assert = require('node:assert/strict');
const analytics = require('../renderer/analytics.js');

test('KhaytAnalytics exports analytics tab entry points', () => {
  for (const name of [
    'renderAnalytics',
    'renderSimpleReports',
    'renderRevenueChart',
    'renderPnLSection',
    'renderClientSourceChart',
    'renderClientRetention',
    'renderCapacityGauge',
    'computeBreakEven',
    'exportAnalyticsReport',
  ]) {
    assert.equal(typeof analytics[name], 'function', name);
  }
});

test('computeBreakEven returns null when no fixed costs', () => {
  const prev = global.settings;
  global.settings = { fixedCosts: [] };
  assert.equal(analytics.computeBreakEven(), null);
  global.settings = prev;
});

test('computeBreakEven estimates revenue target from recent margin', () => {
  require('../renderer/format.js');
  require('../renderer/currency.js');
  const prev = {
    settings: global.settings,
    printLog: global.printLog,
    inventory: global.inventory,
    clients: global.clients,
  };
  global.settings = { currency: 'SAR', fixedCosts: [{ amount: 1000 }] };
  global.clients = [];
  global.inventory = [{ id: 'f1', cost: 50, weight: 1000 }];
  global.printLog = [{
    status: 'completed',
    date: new Date().toISOString().slice(0, 10),
    price: 200,
    parts: [{ filamentId: 'f1', printWeight: 100 }],
  }];
  const result = analytics.computeBreakEven();
  assert.ok(result);
  assert.equal(result.totalFixed, 1000);
  assert.ok(result.avgRevPerOrder > 0);
  assert.ok(result.breakEvenRevenue > result.totalFixed);
  global.settings = prev.settings;
  global.printLog = prev.printLog;
  global.inventory = prev.inventory;
  global.clients = prev.clients;
});
