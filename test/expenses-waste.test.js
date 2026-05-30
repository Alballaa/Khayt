const { test } = require('node:test');
const assert = require('node:assert/strict');

test('calcNextDueDate advances monthly recurring date', () => {
  const { calcNextDueDate } = require('../renderer/expenses.js');
  assert.equal(calcNextDueDate('2026-01-15', 'monthly'), '2026-02-15');
});

test('KhaytExpenses and KhaytWaste export tab helpers', () => {
  const expenses = require('../renderer/expenses.js');
  const waste = require('../renderer/waste.js');
  assert.equal(typeof expenses.renderExpenses, 'function');
  assert.equal(typeof expenses.buildProfitabilityHtml, 'function');
  assert.equal(typeof waste.renderWasteLog, 'function');
});
