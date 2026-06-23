'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildComparables, materialFamily, pickPrice } = require('../lib/ai-price.js');

const mk = (id, status, price, costBasis, material, date) =>
  ({ id, status, price, costBasis, date, parts: [{ material }] });

test('materialFamily extracts the family token', () => {
  assert.equal(materialFamily('PETG - Black (Brand)'), 'PETG');
  assert.equal(materialFamily('pla'), 'PLA');
  assert.equal(materialFamily(''), '');
});

test('buildComparables prefers same-material realized margins', () => {
  const log = [
    mk('A', 'completed', 100, 50, 'PLA Black', '2026-05-01'),  // 50%
    mk('B', 'delivered', 200, 120, 'PLA White', '2026-05-10'), // 40%
    mk('C', 'completed', 100, 70, 'PLA Grey', '2026-05-20'),   // 30%
    mk('D', 'completed', 100, 10, 'PETG', '2026-05-21'),       // 90% (other material)
    mk('E', 'quote', 100, 50, 'PLA', '2026-05-22'),            // ignored (not done)
  ];
  const c = buildComparables(log, { material: 'PLA' });
  assert.equal(c.basis, 'material');
  assert.equal(c.count, 3);
  assert.equal(c.medianMarginPct, 40);
  assert.equal(c.suggestedMargin, 40);
  assert.equal(c.minMarginPct, 30);
  assert.equal(c.maxMarginPct, 50);
  assert.ok(!c.examples.some((e) => e.project === 'D')); // PETG excluded
});

test('falls back to all priced jobs when a material has <3 comparables', () => {
  const log = [
    mk('A', 'completed', 100, 50, 'PLA', '2026-05-01'),
    mk('B', 'completed', 100, 60, 'PETG', '2026-05-02'),
    mk('C', 'completed', 100, 70, 'ABS', '2026-05-03'),
  ];
  const c = buildComparables(log, { material: 'TPU' }); // no TPU history
  assert.equal(c.basis, 'all');
  assert.equal(c.count, 3);
});

test('no priced history → basis none, count 0', () => {
  assert.deepEqual(buildComparables([], { material: 'PLA' }), { basis: 'none', material: 'PLA', count: 0 });
  const onlyQuotes = [{ id: 'Q', status: 'quote', price: 100, costBasis: 50, parts: [] }];
  assert.equal(buildComparables(onlyQuotes, { material: 'PLA' }).basis, 'none');
});

test('pickPrice validates the model output, falls back on garbage', () => {
  assert.equal(pickPrice({ foo: 1 }, null), null);
  const p = pickPrice({ suggestedMargin: 42.37, suggestedPrice: 71.555, rationale: ' good ' });
  assert.equal(p.suggestedMargin, 42.4);
  assert.equal(p.suggestedPrice, 71.56);
  assert.equal(p.rationale, 'good');
});
