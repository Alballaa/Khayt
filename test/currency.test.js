const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../renderer/format.js');
const { convertToBase, clientCurrency, fmtPrice } = require('../renderer/currency.js');

test('convertToBase uses exchange rate', () => {
  global.settings = { currency: 'SAR', exchangeRates: { USD: 3.75 } };
  assert.equal(convertToBase(10, 'USD'), 37.5);
  assert.equal(convertToBase(10, 'SAR'), 10);
});

test('clientCurrency prefers client override', () => {
  global.settings = { currency: 'SAR' };
  global.clients = [{ id: 'c1', currency: 'USD' }];
  assert.equal(clientCurrency('c1'), 'USD');
  assert.equal(clientCurrency(null), 'SAR');
});

test('fmtPrice uses settings currency', () => {
  global.settings = { currency: 'USD' };
  assert.match(fmtPrice(10), /^\$\u202f10\.00$/);
});
