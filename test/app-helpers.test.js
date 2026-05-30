const { test } = require('node:test');
const assert = require('node:assert/strict');

test('payStatus treats gift card discount as payment', () => {
  global.settings = { currency: 'SAR' };
  const { payStatus } = require('../renderer/app-helpers.js');
  assert.equal(payStatus({ price: 100, paidAmount: 40, giftCardDiscount: 60 }), 'paid');
  assert.equal(payStatus({ price: 100, paidAmount: 0 }), 'unpaid');
});

test('getPriorityLevel normalises legacy boolean priority', () => {
  const { getPriorityLevel } = require('../renderer/app-helpers.js');
  assert.equal(getPriorityLevel({ priority: true }), 'high');
  assert.equal(getPriorityLevel({ priorityLevel: 'urgent' }), 'urgent');
  assert.equal(getPriorityLevel({}), 'normal');
});

test('inRange filters by month using date string slice', () => {
  const { inRange } = require('../renderer/app-helpers.js');
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  assert.equal(inRange(`${ym}-15`, 'month'), true);
  assert.equal(inRange('1999-01-01', 'month'), false);
});

test('hijriDate returns compact numeric string for valid ISO date', () => {
  const { hijriDate } = require('../renderer/app-helpers.js');
  const out = hijriDate('2026-01-15');
  assert.match(out, /^\d{4}\/\d{2}\/\d{2}$/);
});

test('KhaytAppHelpers exports shared helper entry points', () => {
  const helpers = require('../renderer/app-helpers.js');
  assert.equal(typeof helpers.localName, 'function');
  assert.equal(typeof helpers.openCsvImportModal, 'function');
  assert.equal(typeof helpers.toArabicNumerals, 'function');
});
