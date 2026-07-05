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

test('resin material uses per-kg formula', () => {
  global.inventory = [{ id: 'R1', materialType: 'resin' }];
  global.settings = { defaultPackagingCost: 0 };
  // spoolCost here is price-per-kg for resin: 150/kg × 20 g = 3.00
  const cost = computePartBaseCost({
    filamentId: 'R1', spoolCost: 150, spoolWeight: 1000, printWeight: 20, failureRate: 0,
  });
  assert.equal(cost, 3);
});

test('blended multicolour part never uses the resin per-kg branch', () => {
  // Regression: the planner sets spoolCost=Σmoney, spoolWeight=Σgrams and a
  // fallback filamentId that may point at a resin spool. The blended part must
  // still cost as the FDM ratio (spoolCost), not (spoolCost/1000)*grams.
  global.inventory = [{ id: 'R1', materialType: 'resin' }];
  global.settings = { defaultPackagingCost: 0 };
  const part = {
    filamentId: 'R1',            // dominant spool happens to be resin
    colours: [{ filamentId: 'R1', grams: 80, cost: 6 }, { filamentId: 'F2', grams: 20, cost: 2 }],
    spoolCost: 8, spoolWeight: 100, printWeight: 100, failureRate: 0,
  };
  assert.equal(computePartBaseCost(part), 8);           // true blended total, not ~0.8
  assert.equal(computePartBreakdown(part).material, 8); // preview agrees with committed
});
