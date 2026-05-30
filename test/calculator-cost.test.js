const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computePartBaseCost, getActivePriceTier, computePartBreakdown } = require('../renderer/calculator-cost.js');

test('computePartBaseCost for simple FDM part', () => {
  global.inventory = [];
  global.settings = { defaultPackagingCost: 0 };
  const cost = computePartBaseCost({
    spoolCost: 100,
    spoolWeight: 1000,
    printWeight: 50,
    printTime: 2,
    wearRate: 1,
    powerDraw: 0,
    elecRate: 0,
    prepTime: 0,
    postTime: 0,
    laborRate: 0,
    failureRate: 0,
  });
  assert.equal(cost, 7);
});

test('getActivePriceTier picks highest matching tier', () => {
  const tier = getActivePriceTier({
    qty: 10,
    priceTiers: [
      { minQty: 1, price: 9 },
      { minQty: 5, price: 8 },
    ],
  });
  assert.equal(tier.price, 8);
});

test('computePartBreakdown splits cost buckets', () => {
  global.inventory = [];
  const b = computePartBreakdown({
    spoolCost: 100,
    spoolWeight: 100,
    printWeight: 10,
    printTime: 1,
    wearRate: 2,
    powerDraw: 0,
    elecRate: 0,
    prepTime: 0,
    postTime: 0,
    laborRate: 0,
    failureRate: 10,
  });
  assert.ok(b.material > 0);
  assert.ok(b.machine > 0);
  assert.ok(b.buffer > 0);
});
