/**
 * Reorder-suggestion engine (lib/reorder.js) — pure consumption math.
 * Injected partGrams + isLow + now, so it's deterministic with no globals.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../lib/reorder.js');

const DAY = 86400000;
const NOW = 1_000_000_000_000; // fixed clock
const partGrams = (p) => +p.grams || 0;
const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();

test('consumptionByItem sums completed-order grams within the window into g/day', () => {
  const orders = [
    { status: 'completed', completedAt: at(10), parts: [{ filamentId: 'pla', grams: 300 }] },
    { status: 'delivered', completedAt: at(20), parts: [{ filamentId: 'pla', grams: 300 }] },
    { status: 'completed', completedAt: at(40), parts: [{ filamentId: 'pla', grams: 999 }] }, // outside 30d window
    { status: 'printing', parts: [{ filamentId: 'pla', grams: 500 }] },                        // not completed
  ];
  const rates = R.consumptionByItem(orders, { windowDays: 30, now: NOW, partGrams });
  assert.equal(rates.pla, 600 / 30); // 20 g/day
});

test('reorderSuggestions flags soon-to-deplete + low items with a suggested qty', () => {
  const inventory = [
    { id: 'pla', name: 'PLA Black', weight: 200 },   // 200g, ~20 g/day → ~10 days left → within leadDays
    { id: 'petg', name: 'PETG', weight: 5000 },       // tons left, not low → skip
    { id: 'abs', name: 'ABS', weight: 50 },           // no usage history but low stock → still listed
  ];
  const orders = [
    { status: 'completed', completedAt: at(5), parts: [{ filamentId: 'pla', grams: 200 }] },
    { status: 'completed', completedAt: at(15), parts: [{ filamentId: 'pla', grams: 400 }] },
  ];
  const isLow = (it) => it.id === 'abs'; // ABS is low; others above reorder point
  const sug = R.reorderSuggestions(inventory, orders, { windowDays: 30, now: NOW, partGrams, isLow, leadDays: 14, targetDays: 45 });

  const ids = sug.map((s) => s.id);
  assert.ok(ids.includes('pla'), 'pla projected to deplete soon → suggested');
  assert.ok(ids.includes('abs'), 'abs low-stock → suggested even without usage history');
  assert.ok(!ids.includes('petg'), 'petg healthy → not suggested');

  const pla = sug.find((s) => s.id === 'pla');
  assert.equal(pla.gramsPerDay, 20);
  assert.equal(pla.daysLeft, 10);
  assert.equal(pla.suggestG, Math.ceil(20 * 45 - 200)); // cover 45 days beyond the 200 on hand
});

test('most-urgent (fewest days left) sorts first', () => {
  const inventory = [
    { id: 'a', name: 'A', weight: 100 }, // 100/20 = 5 days
    { id: 'b', name: 'B', weight: 300 }, // 300/20 = 15 days (but leadDays 30 keeps it)
  ];
  const orders = [
    { status: 'completed', completedAt: at(10), parts: [{ filamentId: 'a', grams: 600 }, { filamentId: 'b', grams: 600 }] },
  ];
  const sug = R.reorderSuggestions(inventory, orders, { windowDays: 30, now: NOW, partGrams, isLow: () => false, leadDays: 30 });
  assert.equal(sug[0].id, 'a', 'fewest days-left first');
});

test('completionMs falls back to statusHistory when no completedAt', () => {
  const ms = R.completionMs({ statusHistory: [{ status: 'pending', at: at(9) }, { status: 'completed', at: at(3) }] });
  assert.equal(ms, Date.parse(at(3)));
  assert.equal(R.completionMs({ status: 'printing' }), null);
});
