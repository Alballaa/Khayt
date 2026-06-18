/**
 * Loyalty & store-credit ledger-math tests. See docs/KHAYT-3.0-LOYALTY-SPEC.md
 * §9 (Test plan & DoD). Pure arithmetic — no fs, no renderer, no DOM.
 *
 * Redemption is applied to an order via the existing `giftCardDiscount` rail in
 * the renderer; these tests only cover the wallet/ledger math behind it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/loyalty.js');

// ---- earnPoints: floor + tier multiplier + ex-VAT base ---------------------

test('earnPoints floors fractional results', () => {
  // 99.9 SAR ex-VAT × 1 pt/SAR = 99.9 → 99
  assert.equal(L.earnPoints(99.9, { pointsPerUnit: 1 }), 99);
  assert.equal(L.earnPoints(10, { pointsPerUnit: 0.33 }), 3); // 3.3 → 3
});

test('earnPoints applies the tier multiplier (115 SAR incl VAT ⇒ 100 ex-VAT × 1.5)', () => {
  // Caller passes the ex-VAT base (115 / 1.15 = 100); module just does the math.
  assert.equal(L.earnPoints(100, { pointsPerUnit: 1, tierMultiplier: 1.5 }), 150);
});

test('earnPoints defaults pointsPerUnit and tierMultiplier to 1', () => {
  assert.equal(L.earnPoints(50), 50);
  assert.equal(L.earnPoints(50, {}), 50);
});

test('earnPoints returns 0 for negative/zero/garbage spend', () => {
  assert.equal(L.earnPoints(-10), 0);
  assert.equal(L.earnPoints(0), 0);
  assert.equal(L.earnPoints(NaN), 0);
  assert.equal(L.earnPoints('abc'), 0);
});

// ---- pointsToCredit conversion ---------------------------------------------

test('pointsToCredit converts at the given rate (100 pts = 1 SAR ⇒ rate 0.01)', () => {
  assert.equal(L.pointsToCredit(100, 0.01), 1);
  assert.equal(L.pointsToCredit(250, 0.05), 12.5);
});

test('pointsToCredit clamps negatives to 0', () => {
  assert.equal(L.pointsToCredit(-100, 0.01), 0);
  assert.equal(L.pointsToCredit(100, -0.01), 0);
});

// ---- ledgerBalance: empty + folding ----------------------------------------

test('empty ledger folds to {points:0, credit:0}', () => {
  assert.deepEqual(L.ledgerBalance([]), { points: 0, credit: 0 });
  assert.deepEqual(L.ledgerBalance(undefined), { points: 0, credit: 0 });
  assert.deepEqual(L.ledgerBalance(null), { points: 0, credit: 0 });
});

test('ledgerBalance folds earn + redeem + referral + clawback correctly', () => {
  const ledger = [
    L.earnEntry({ orderId: 'o1', exVatAmount: 100, pointsPerUnit: 1, tierMultiplier: 1 }), // +100 pts
    L.referralEntry({ referredClientId: 'c2', credit: 25 }),                                // +25 credit
    L.redeemEntry({ points: 40, orderId: 'o2' }, { points: 100, credit: 25 }),             // -40 pts
    L.clawbackOnRefund({ originalEarnPoints: 100, refundFraction: 0.5 }),                   // -50 pts
  ];
  // points: 100 - 40 - 50 = 10 ; credit: 25
  assert.deepEqual(L.ledgerBalance(ledger), { points: 10, credit: 25 });
});

test('ledgerBalance tracks points and credit separately', () => {
  const ledger = [
    L.earnEntry({ orderId: 'o1', exVatAmount: 200 }),    // +200 pts, 0 credit
    L.referralEntry({ referredClientId: 'c9', credit: 25 }), // 0 pts, +25 credit
  ];
  assert.deepEqual(L.ledgerBalance(ledger), { points: 200, credit: 25 });
});

test('ledgerBalance ignores malformed entries', () => {
  const ledger = [null, 'x', 42, L.earnEntry({ exVatAmount: 30 }), {}];
  assert.deepEqual(L.ledgerBalance(ledger), { points: 30, credit: 0 });
});

// ---- redeem beyond balance is rejected -------------------------------------

test('redeemEntry rejects redeeming more points than available', () => {
  assert.throws(
    () => L.redeemEntry({ points: 150 }, { points: 100, credit: 0 }),
    /insufficient points/,
  );
});

test('redeemEntry rejects redeeming more credit than available', () => {
  assert.throws(
    () => L.redeemEntry({ credit: 30 }, { points: 0, credit: 25 }),
    /insufficient credit/,
  );
});

test('redeemEntry produces negative deltas within balance', () => {
  const e = L.redeemEntry({ points: 40, credit: 10, orderId: 'o3' }, { points: 100, credit: 25 });
  assert.equal(e.type, 'redeem');
  assert.equal(e.points, -40);
  assert.equal(e.credit, -10);
  assert.equal(e.orderId, 'o3');
});

test('redeemEntry accepts the (ledger, request) call form', () => {
  const ledger = [L.earnEntry({ exVatAmount: 100 })]; // 100 pts
  const e = L.redeemEntry(ledger, { points: 60, orderId: 'o4' });
  assert.equal(e.points, -60);
  // and rejects over-redemption against the folded ledger
  assert.throws(() => L.redeemEntry(ledger, { points: 101 }), /insufficient points/);
});

test('redeemEntry rejects empty and negative requests', () => {
  assert.throws(() => L.redeemEntry({}, { points: 100, credit: 100 }), /nothing to redeem/);
  assert.throws(() => L.redeemEntry({ points: -5 }, { points: 100 }), /non-negative/);
});

// ---- clawback removes proportional points on refund ------------------------

test('clawbackOnRefund removes the proportional (floored) points', () => {
  assert.equal(L.clawbackOnRefund({ originalEarnPoints: 100, refundFraction: 0.5 }).points, -50);
  assert.equal(L.clawbackOnRefund({ originalEarnPoints: 99, refundFraction: 0.5 }).points, -49); // floor(49.5)
  assert.equal(L.clawbackOnRefund({ originalEarnPoints: 100, refundFraction: 1 }).points, -100);
});

test('clawbackOnRefund clamps fraction to 0..1 and caps at originally earned', () => {
  assert.equal(L.clawbackOnRefund({ originalEarnPoints: 100, refundFraction: 2 }).points, -100);
  assert.equal(L.clawbackOnRefund({ originalEarnPoints: 100, refundFraction: -1 }).points, 0);
});

test('a full clawback exactly reverses the matching earn (net zero)', () => {
  const earn = L.earnEntry({ orderId: 'o1', exVatAmount: 100 }); // +100
  const claw = L.clawbackOnRefund({ originalEarnPoints: earn.points, refundFraction: 1 }); // -100
  assert.deepEqual(L.ledgerBalance([earn, claw]), { points: 0, credit: 0 });
});

// ---- balance never negative ------------------------------------------------

test('ledgerBalance clamps at 0 — a corrupt/over-removing ledger never goes negative', () => {
  const ledger = [
    L.earnEntry({ exVatAmount: 50 }),                  // +50 pts
    { type: 'clawback', points: -999, credit: 0 },     // hand-edited over-removal
    { type: 'adjust', credit: -999 },                  // corrupt credit removal
  ];
  assert.deepEqual(L.ledgerBalance(ledger), { points: 0, credit: 0 });
});

test('clamp does not strand later positive deltas at 0', () => {
  const ledger = [
    { type: 'clawback', points: -999 }, // clamps points to 0
    L.earnEntry({ exVatAmount: 30 }),   // +30 after the clamp
  ];
  assert.equal(L.ledgerBalance(ledger).points, 30);
});

// ---- entry constructors: shape ---------------------------------------------

test('earnEntry builds a well-formed earn entry', () => {
  const e = L.earnEntry({ orderId: 'o7', exVatAmount: 100, tierMultiplier: 2, ts: 123 });
  assert.equal(e.type, 'earn');
  assert.equal(e.points, 200);
  assert.equal(e.credit, 0);
  assert.equal(e.orderId, 'o7');
  assert.equal(e.ts, 123);
});

test('referralEntry builds a credit-only entry and clamps negatives', () => {
  const e = L.referralEntry({ referredClientId: 'c5', credit: 25, ts: 9 });
  assert.equal(e.type, 'referral');
  assert.equal(e.points, 0);
  assert.equal(e.credit, 25);
  assert.equal(e.referredClientId, 'c5');
  assert.equal(L.referralEntry({ referredClientId: 'c5', credit: -25 }).credit, 0);
});
