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

test('orderOwedBase subtracts payments and gift card credit', () => {
  const { orderOwedBase } = require('../renderer/currency.js');
  global.settings = { currency: 'SAR' };
  global.clients = [];
  assert.equal(orderOwedBase({ price: 100, paidAmount: 40, giftCardDiscount: 10 }), 50);
  assert.equal(orderOwedBase({ price: 100, paidAmount: 100 }), 0);
  // Credit notes reduce what's owed (refund / cancelled charge).
  assert.equal(orderOwedBase({ price: 100, paidAmount: 0, creditNotes: [{ amount: 100 }] }), 0);
  assert.equal(orderOwedBase({ price: 100, paidAmount: 0, creditNotes: [{ amount: 30 }] }), 70);
});
