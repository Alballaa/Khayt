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
