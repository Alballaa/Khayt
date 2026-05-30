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
  ]) {
    assert.equal(typeof analytics[name], 'function', name);
  }
});
