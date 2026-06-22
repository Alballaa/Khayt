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

test('reorderText builds a supplier-ready list (qty, restock, empty)', () => {
  const txt = R.reorderText([
    { label: 'PLA Black', suggestG: 600, low: false },
    { label: 'ABS', suggestG: 0, low: true },
    { label: 'PETG', suggestG: 0, low: false },
  ], { header: 'Reorder:' });
  assert.match(txt, /^Reorder:/);
  assert.match(txt, /PLA Black: ~600 g/);
  assert.match(txt, /ABS: restock/);
  assert.match(txt, /- PETG$/m);
  assert.equal(R.reorderText([]), '');
});

test('completionMs falls back to statusHistory when no completedAt', () => {
  const ms = R.completionMs({ statusHistory: [{ status: 'pending', at: at(9) }, { status: 'completed', at: at(3) }] });
  assert.equal(ms, Date.parse(at(3)));
  assert.equal(R.completionMs({ status: 'printing' }), null);
});

test('committedByItem sums grams from open orders only', () => {
  const orders = [
    { status: 'printing', parts: [{ filamentId: 'pla', grams: 200 }] },
    { status: 'pending', parts: [{ filamentId: 'pla', grams: 150 }] },
    { status: 'completed', completedAt: at(2), parts: [{ filamentId: 'pla', grams: 999 }] }, // not open
    { status: 'quote', parts: [{ filamentId: 'pla', grams: 999 }] }, // not open
  ];
  const c = R.committedByItem(orders, { partGrams });
  assert.equal(c.pla, 350);
});

test('open-order demand lowers days-left and raises the suggested qty', () => {
  const inventory = [{ id: 'pla', material: 'PLA', weight: 1000 }];
  // velocity: 600 g over 30d window = 20 g/day → 50 days on 1000g with no commitments
  const baseOrders = [{ status: 'completed', completedAt: at(10), parts: [{ filamentId: 'pla', grams: 600 }] }];
  const noOpen = R.reorderSuggestions(inventory, baseOrders, { now: NOW, partGrams, isLow: () => false, leadDays: 14, targetDays: 45 });
  assert.equal(noOpen.length, 0); // 50d left, healthy

  // add 700g of queued work → available 300g → 15 days left → surfaces
  const withOpen = baseOrders.concat([{ status: 'printing', parts: [{ filamentId: 'pla', grams: 700 }] }]);
  const sug = R.reorderSuggestions(inventory, withOpen, { now: NOW, partGrams, isLow: () => false, leadDays: 20, targetDays: 45 });
  const pla = sug.find((s) => s.id === 'pla');
  assert.ok(pla, 'should surface once committed demand is factored');
  assert.equal(pla.committedG, 700);
  assert.equal(pla.available, 300);
  assert.equal(pla.daysLeft, 15); // 300 / 20
  assert.ok(pla.suggestG > 0);
});

test('committed beyond stock → daysLeft 0 even with no usage history', () => {
  const inventory = [{ id: 'abs', material: 'ABS', weight: 100 }];
  const orders = [{ status: 'pending', parts: [{ filamentId: 'abs', grams: 400 }] }];
  const sug = R.reorderSuggestions(inventory, orders, { now: NOW, partGrams, isLow: () => false });
  const abs = sug.find((s) => s.id === 'abs');
  assert.ok(abs);
  assert.equal(abs.daysLeft, 0);
  assert.equal(abs.suggestG, 300); // shortfall 400 - 100
});
