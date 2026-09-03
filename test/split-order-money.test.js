'use strict';
/**
 * Splitting a job across machines billed it twice and lost the deposit.
 *
 * `splitOrderAcrossMachines` creates one sub-order per machine, each carrying a
 * proportional share of the price, and leaves the parent behind with
 * `status:'split'` and its FULL PRICE INTACT.
 *
 * Nothing excluded that parent from the money. Receivables is filtered on
 * payment status alone — deliberately "regardless of status", because a job can
 * be owed for at any stage — so the parent's debt and the children's debt were
 * both counted. Measured before the fix:
 *
 *     one SAR 3,000 job, SAR 1,000 deposit taken, then split in two
 *       receivables shown : 5000.00
 *       actually owed     : 2000.00
 *
 * And every sub-order was created `paidAmount: 0`, so the deposit did not
 * travel: the customer was invoiced for the full value a second time.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const B = require('../lib/business-scope.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** Source with comments stripped — a guard must not match its own explanation. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const split = (extra = {}) => ({ id: 'O-1', price: 3000, status: 'split', splitInto: ['a', 'b'], ...extra });

test('a parent replaced by its sub-orders is superseded', () => {
  assert.equal(B.isSuperseded(split()), true);
});

test('nothing else is mistaken for a superseded parent', () => {
  // A job genuinely in progress must keep counting, and so must a parent whose
  // split was abandoned before any child existed.
  assert.equal(B.isSuperseded({ id: 'x', status: 'pending', price: 100 }), false);
  assert.equal(B.isSuperseded({ id: 'x', status: 'completed', price: 100 }), false);
  assert.equal(B.isSuperseded(split({ splitInto: [] })), false, 'no children means nothing carries the price');
  assert.equal(B.isSuperseded(split({ splitInto: undefined })), false);
  assert.equal(B.isSuperseded({ id: 'x', status: 'pending', splitInto: ['a'] }), false,
    'the status is what says the parent was replaced');
  assert.equal(B.isSuperseded(null), false);
  assert.equal(B.isSuperseded(undefined), false);
});

test('both money chokepoints exclude a superseded parent', () => {
  // Thirteen call sites total owed money and twenty total revenue. Gating the
  // two chokepoints is what makes all of them agree; patching call sites would
  // leave the next one wrong.
  const cur = code('renderer/currency.js');
  for (const fn of ['orderNetRevenueBase', 'orderOwedBase']) {
    const at = cur.indexOf(`function ${fn}(`);
    assert.ok(at > 0, `${fn} is gone`);
    const body = cur.slice(at, cur.indexOf('\n  }', at));
    assert.match(body, /KhaytBusinessScope\.isSuperseded\(o\)\) return 0;/,
      `${fn} still counts a parent whose sub-orders carry its price`);
  }
});

/* ---- the split itself, driving the real module -------------------------- */

const S = require('../lib/split-order.js');
const splitShares = (price, paid, credited, costs) => S.splitMoney({ price, paid, credited, costs });

test('the deposit is carried across, in the same proportion as the price', () => {
  const subs = splitShares(3000, 1000, 0, [60, 40]);
  assert.deepEqual(subs.map((s2) => s2.price), [1800, 1200]);
  assert.deepEqual(subs.map((s2) => s2.paidAmount), [600, 400]);
  assert.equal(subs.reduce((s2, x) => s2 + x.paidAmount, 0), 1000, 'money the customer paid went missing');
});

test('rounding never loses or invents a riyal', () => {
  // Three equal groups of a sum that does not divide: the last takes every
  // remainder, so the shares must add back to exactly what was charged and paid.
  for (const paid of [100, 0.01, 1000.03, 7, 333.33]) {
    const subs = splitShares(999.99, paid, 0, [1, 1, 1]);
    const gotPaid = +subs.reduce((s2, x) => s2 + x.paidAmount, 0).toFixed(2);
    const gotPrice = +subs.reduce((s2, x) => s2 + x.price, 0).toFixed(2);
    assert.equal(gotPaid, paid, `${paid} split three ways came back as ${gotPaid}`);
    assert.equal(gotPrice, 999.99, `the price came back as ${gotPrice}`);
  }
});

test('costless parts split evenly rather than loading one machine', () => {
  // total cost 0 used to divide by a fallback of 1, putting the whole price on
  // whichever group happened to be first.
  const subs = splitShares(100, 50, 0, [0, 0]);
  assert.deepEqual(subs.map((s2) => s2.price), [50, 50]);
  assert.deepEqual(subs.map((s2) => s2.paidAmount), [25, 25]);
});

test('credit notes are carried too, so a refund is not undone by a split', () => {
  const subs = splitShares(1000, 0, 250, [50, 50]);
  assert.equal(subs.reduce((s2, x) => s2 + x.credited, 0), 250);
});

test('a payment status is stated for every share, including a costless one', () => {
  assert.equal(S.paymentStatusFor(1800, 600), 'partial');
  assert.equal(S.paymentStatusFor(1800, 1800), 'paid');
  assert.equal(S.paymentStatusFor(1800, 0), 'unpaid');
  // price 0 is where payStatus() falls back to the stored field, so it matters.
  assert.equal(S.paymentStatusFor(0, 0), 'unpaid');
  assert.equal(S.paymentStatusFor(0, 10), 'paid');
});

test('the split writes the deposit, the credits and a derived payment status', () => {
  const src = code('renderer/order-flows.js');
  const at = src.indexOf('async function splitOrderAcrossMachines');
  assert.ok(at > 0, 'splitOrderAcrossMachines is gone');
  const body = src.slice(at, at + 5000);
  assert.match(body, /paidAmount: subPaid/, 'sub-orders are created with no deposit again');
  assert.ok(!/paidAmount: 0/.test(body), 'a sub-order is hardcoded to nothing paid');
  assert.match(body, /creditNotes: subCredit > 0/, 'credit notes are dropped by a split');
  assert.match(body, /paymentStatus: KhaytSplitOrder\.paymentStatusFor\(/,
    'payStatus falls back to the stored field at price 0, so it must be stated');
  assert.match(body, /KhaytSplitOrder\.splitMoney\(/,
    'the split does its own share arithmetic again instead of using the tested one');
});

test('the totals reconcile: children owe exactly what the parent owed', () => {
  const owed = (o) => (B.isSuperseded(o) ? 0
    : Math.max(0, (+o.price || 0) - (+o.paidAmount || 0) - (+o.credited || 0)));
  const parent = split({ paidAmount: 1000 });
  const subs = splitShares(3000, 1000, 0, [60, 40]);
  const shown = [parent, ...subs].reduce((s, o) => s + owed(o), 0);
  assert.equal(shown, 2000, `receivables show ${shown} where 2000 is owed`);
});

test('the split module is actually loaded by both entry documents', () => {
  // A pure module with no script tag is undefined at runtime and the split
  // throws on the first press — the failure mode a unit test cannot see.
  for (const html of ['renderer/index.html', 'renderer/bedready.html']) {
    const doc = read(html);
    assert.match(doc, /<script src="\.\.\/lib\/split-order\.js"><\/script>/,
      `${html} does not load lib/split-order.js`);
    assert.ok(doc.indexOf('lib/split-order.js') < doc.indexOf('order-flows.js'),
      `${html} loads split-order.js after the code that calls it`);
  }
});
