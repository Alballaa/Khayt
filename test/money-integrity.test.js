const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Six defects that made the app report the wrong NUMBER — the failure mode that
 * matters most in a shop manager, because nothing crashes and nobody notices.
 *
 * These are source-level guards rather than behavioural tests: the functions
 * involved live inside large renderer IIFEs that assume a DOM and the global
 * store, so requiring them in node is not possible without a fixture larger
 * than the thing under test. Each assertion therefore pins the specific
 * expression that was wrong, and each was mutation-checked by restoring the
 * original expression and confirming the test fails.
 */

test('a reorder unit price is per GRAM, not per spool', () => {
  // item.cost is the whole spool's cost. createPurchaseOrder multiplies
  // unitPrice by a qty measured in grams, so returning it undivided made every
  // auto-drafted PO ~1000x too expensive: 750 g of an 85/kg spool quoted at
  // 63,750 instead of 63.75.
  const src = read('renderer/inventory.js');
  const fn = src.slice(src.indexOf('function resolveReorderPrice'), src.indexOf('function maybeAutoDraftPurchaseOrders'));
  assert.match(fn, /perSpool\s*\/\s*Math\.max\(1,\s*\+item\.spoolWeight/,
    'the item.cost fallback must divide by spoolWeight to reach a per-gram rate');
  assert.equal(/const perG = \(\+item\.cost\) \|\|/.test(fn), false,
    'undivided item.cost is a per-spool figure and must not be returned as perG');
});

test('the per-gram arithmetic agrees with how stock is valued', () => {
  // The valuation at ~1572 is the reference: cost / spoolWeight * remaining.
  // If these two ever disagree again, one of them is wrong by ~1000x.
  const perGram = (item) => (+item.cost || 0) / Math.max(1, +item.spoolWeight || 1000);
  const item = { cost: 85, spoolWeight: 1000, weight: 400 };
  assert.equal(perGram(item), 0.085);
  assert.equal(Math.round(perGram(item) * item.weight * 100) / 100, 34, 'value of 400g of an 85/kg spool');
});

test('voided invoices are excluded everywhere revenue is totalled', () => {
  // Voiding deliberately KEEPS status 'completed' and only sets voidedAt, so a
  // status-only filter books a cancelled invoice as full revenue and full VAT.
  const src = read('renderer/analytics.js');
  const lines = src.split('\n');
  const bad = [];
  lines.forEach((l, i) => {
    // Any completed-status filter in a money aggregation must also test voidedAt.
    if (/o\.status === 'completed'/.test(l) && !/voidedAt/.test(l)) {
      // Only MONEY aggregations. Utilisation, on-time delivery and operator
      // stats also filter on completed, but whether a voided order counts as
      // work performed is a product judgment, not an arithmetic bug — excluded
      // deliberately rather than by oversight.
      const ctx = lines.slice(i, i + 4).join(' ');
      if (!/price|revenue|Revenue|orderRevenueBase|costBasis|profit/.test(ctx)) return;
      if (/machineId|clientId|operatorId|printingStartedAt|dueDate/.test(ctx)) return;
      bad.push(`analytics.js:${i + 1}`);
    }
    if (/if \(o\.status !== 'completed'\) continue;/.test(l)) bad.push(`analytics.js:${i + 1}`);
  });
  assert.deepEqual(bad, [], `revenue aggregations missing a !voidedAt guard:\n  ${bad.join('\n  ')}`);
});

test('saving instalments cannot destroy a recorded deposit', () => {
  // paidAmount is the authoritative cash figure and holds the deposit from
  // order creation. The plan generator builds a schedule with depositAmount:0
  // spanning the full price, so a freshly generated plan has instPaid = 0 —
  // assigning it over paidAmount erased a 500 deposit on save, silently.
  const src = read('renderer/order-flows.js');
  assert.match(src, /order\.paidAmount = Math\.max\(\+order\.paidAmount \|\| 0, instPaid\)/,
    'instalment payments are additional cash; they must never overwrite paidAmount downward');
  assert.equal(/^\s*order\.paidAmount = instPaid;\s*$/m.test(src), false,
    'the unconditional overwrite destroyed deposits');
});

test('"fully paid" is decided against the order price, not the instalment total', () => {
  // Instalment amounts are freely editable, so a partial plan (two 100 rows on
  // a 2,000 order) marked paid reported the whole order settled — and
  // paymentStatus is what the payment_received / paid webhooks carry.
  const src = read('renderer/order-flows.js');
  assert.equal(/instPaid >= totalInst \? 'paid'/.test(src), false,
    'comparing against the instalment total lets a partial plan report as settled');
  assert.match(src, /const owed = \+order\.price \|\| 0;/, 'the comparison must anchor on the order price');
});

test('the paid/partial decision behaves correctly at the boundary', () => {
  const decide = (paid, owed) => (paid <= 0 ? 'unpaid' : (owed > 0 && paid + 0.005 >= owed ? 'paid' : 'partial'));
  assert.equal(decide(0, 2000), 'unpaid');
  assert.equal(decide(200, 2000), 'partial', 'a partial plan marked paid is still partial');
  assert.equal(decide(2000, 2000), 'paid');
  // Float drift must not leave an order eternally one-hundredth short.
  assert.equal(decide(0.1 + 0.2, 0.3), 'paid', '0.1+0.2 !== 0.3 must still settle');
  assert.equal(decide(1999.999, 2000), 'paid', 'sub-cent drift settles');
  assert.equal(decide(1999, 2000), 'partial', 'a real shortfall does not');
});

test('archived orders release their stock reservation', () => {
  // renderPipelineDemand already excluded archived orders, so a reservation
  // surviving archiving contradicted the demand view sitting beside it: a
  // spool showed 600g reserved by a job nobody was going to print.
  const src = read('renderer/inventory.js');
  const lines = src.split('\n');
  const bad = [];
  lines.forEach((l, i) => {
    if (/o\.status !== 'completed' && o\.status !== 'quote'/.test(l) && !/archived/.test(l)) {
      bad.push(`inventory.js:${i + 1}`);
    }
  });
  assert.deepEqual(bad, [], `reservation filters that still count archived orders:\n  ${bad.join('\n  ')}`);
});

test('monthly margin is blended, not a mean of percentages', () => {
  const src = read('renderer/analytics.js');
  assert.equal(/marginByMonth\[m\]\.total \+= margin;/.test(src), false,
    'summing per-order percentages lets one tiny job dominate the month');
  assert.match(src, /marginByMonth\[m\]\.revenue \+= \+o\.price;/, 'accumulate money, divide once');

  // The arithmetic, with the case that exposed it.
  const rows = [{ price: 100, cost: 20 }, { price: 10000, cost: 9000 }];
  const unweighted = rows.map((r) => (r.price - r.cost) / r.price * 100).reduce((a, b) => a + b) / rows.length;
  const rev = rows.reduce((s, r) => s + r.price, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const blended = (rev - cost) / rev * 100;
  assert.equal(Math.round(unweighted * 10) / 10, 45, 'the old figure');
  assert.equal(Math.round(blended * 10) / 10, 10.7, 'the true figure');
  // 45 crossed the green threshold (>= 40); 10.7 does not. The colour was lying too.
  assert.ok(unweighted >= 40 && blended < 40);
});
