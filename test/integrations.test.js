const { test } = require('node:test');
const assert = require('node:assert/strict');

test('KhaytIntegrations exports notification and export helpers', () => {
  const integrations = require('../renderer/integrations.js');
  assert.equal(typeof integrations.sendTelegramForOrder, 'function');
  assert.equal(typeof integrations.checkTelegramLowStock, 'function');
  assert.equal(typeof integrations.exportIcalFeed, 'function');
  assert.equal(typeof integrations.renderReferralAnalytics, 'function');
  assert.equal(typeof integrations.trackShipment, 'function');
});
