const { test } = require('node:test');
const assert = require('node:assert/strict');

test('BNPL_CATALOG includes Tabby and Stripe entries', () => {
  require('../renderer/integrations.js');
  assert.ok(Array.isArray(global.BNPL_CATALOG));
  assert.ok(global.BNPL_CATALOG.some((s) => s.id === 'tabby'));
  assert.ok(global.BNPL_CATALOG.some((s) => s.id === 'stripe'));
});

test('getCarrierTrackingUrl builds Aramex link', () => {
  const { getCarrierTrackingUrl } = require('../renderer/integrations.js');
  const url = getCarrierTrackingUrl('aramex', '12345');
  assert.match(url, /aramex\.com/i);
  assert.match(url, /12345/);
});

test('hijriDate is exported from app-helpers', () => {
  const { hijriDate, toArabicNumerals } = require('../renderer/app-helpers.js');
  assert.equal(typeof hijriDate, 'function');
  assert.equal(toArabicNumerals('12'), '١٢');
});
