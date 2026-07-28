/**
 * The extracted cost→price maths, and proof it is the SAME maths.
 *
 * This arithmetic decides what a customer is asked to pay, and it previously
 * lived inline in renderer/build.js between DOM reads and writes. Extracting it
 * is only safe if the numbers do not move: every quote a shop has already sent
 * was produced by the old expressions, and a refactor that shifts a total by a
 * rounding step reprices work silently.
 *
 * So the centrepiece here is an equivalence test. The ORIGINAL expressions are
 * reproduced verbatim below and compared against the extracted function across
 * thousands of randomised inputs. A characterisation test with three hand-picked
 * cases would pass just as happily on a subtly different formula.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { quoteTotal, activePriceTier } = require('../lib/pricing.js');

/**
 * The pricing block exactly as it stood in renderer/build.js, with the DOM reads
 * replaced by arguments and nothing else changed. This is the oracle.
 */
function originalFormula({ totalBase, qty, margin, activeTier, discountPct, rushEnabled, rushPct, shippingCost, extraLines, biz }) {
  const m = biz ? Math.max(0, margin) : 0;
  const priceBeforeDiscount = activeTier
    ? activeTier.pricePerUnit * qty
    : totalBase * (1 + m / 100);
  const dPct = biz ? Math.min(100, Math.max(0, discountPct)) : 0;
  const discountAmt = priceBeforeDiscount * dPct / 100;
  const subAfterDiscount = priceBeforeDiscount - discountAmt;
  const rPct = biz && rushEnabled ? rushPct : 0;
  const rushFeeAmt = subAfterDiscount * rPct / 100;
  const shipping = biz ? Math.max(0, shippingCost) : 0;
  const extras = biz ? extraLines.reduce((s, l) => s + Math.max(0, +l.amount || 0), 0) : 0;
  return subAfterDiscount + rushFeeAmt + shipping + extras;
}

/** Deterministic PRNG — a failing case must be reproducible, not a coin toss. */
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test('EQUIVALENCE: the extracted maths matches the original over random inputs', () => {
  const rnd = makeRandom(20260728);
  let checked = 0;

  for (let i = 0; i < 4000; i++) {
    const useTier = rnd() < 0.3;
    const c = {
      totalBase: Math.round(rnd() * 500000) / 100,
      qty: 1 + Math.floor(rnd() * 50),
      margin: Math.round(rnd() * 30000) / 100,
      activeTier: useTier ? { pricePerUnit: Math.round(rnd() * 50000) / 100 } : null,
      discountPct: Math.round(rnd() * 12000) / 100,   // deliberately exceeds 100 sometimes
      rushEnabled: rnd() < 0.4,
      rushPct: Math.round(rnd() * 5000) / 100,
      shippingCost: Math.round(rnd() * 20000) / 100,
      extraLines: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ amount: Math.round(rnd() * 10000) / 100 })),
      biz: rnd() < 0.85,
    };

    const expected = originalFormula(c);
    const got = quoteTotal({
      baseCost: c.totalBase, qty: c.qty, margin: c.margin, priceTier: c.activeTier,
      discountPct: c.discountPct, rushEnabled: c.rushEnabled, rushPct: c.rushPct,
      shippingCost: c.shippingCost, extraLines: c.extraLines, business: c.biz,
    }).total;

    assert.ok(Math.abs(got - expected) < 1e-9,
      `case ${i} differs: extracted ${got}, original ${expected}\n${JSON.stringify(c)}`);
    checked++;
  }
  assert.equal(checked, 4000);
});

test('the parts sum to the total — the UI can show a breakdown that adds up', () => {
  const r = quoteTotal({
    baseCost: 100, qty: 1, margin: 50, discountPct: 10,
    rushEnabled: true, rushPct: 25, shippingCost: 15,
    extraLines: [{ amount: 5 }, { amount: 2.5 }],
  });
  assert.equal(r.priceBeforeDiscount, 150);
  assert.equal(r.discountAmount, 15);
  assert.equal(r.subtotal, 135);
  assert.equal(r.rushFee, 33.75, 'rush is charged on the DISCOUNTED subtotal');
  assert.equal(r.extras, 7.5);
  assert.equal(r.total, 135 + 33.75 + 15 + 7.5);
});

test('rush is charged after the discount, not before', () => {
  // Order of operations is a business decision already baked into sent quotes.
  // Charging rush first would raise every rushed, discounted job.
  const after = quoteTotal({ baseCost: 100, discountPct: 50, rushEnabled: true, rushPct: 100 });
  assert.equal(after.total, 100, '100 → 50 after discount → +50 rush');
  assert.notEqual(after.total, 150, 'rushing before the discount would give this');
});

test('shipping and extras are neither discounted nor rushed', () => {
  const r = quoteTotal({
    baseCost: 100, discountPct: 100, rushEnabled: true, rushPct: 100,
    shippingCost: 20, extraLines: [{ amount: 5 }],
  });
  assert.equal(r.subtotal, 0, 'a 100% discount clears the goods');
  assert.equal(r.total, 25, 'but shipping and extras are still owed in full');
});

test('a price tier replaces cost-plus-margin entirely', () => {
  const withTier = quoteTotal({ baseCost: 1000, qty: 10, margin: 500, priceTier: { pricePerUnit: 25 } });
  assert.equal(withTier.priceBeforeDiscount, 250, 'tier price x qty, margin ignored');
});

test('the hobbyist experience prices nothing — the total is pure cost', () => {
  const r = quoteTotal({
    baseCost: 100, margin: 80, discountPct: 20, rushEnabled: true, rushPct: 25,
    shippingCost: 30, extraLines: [{ amount: 10 }], business: false,
  });
  assert.equal(r.total, 100, 'no margin, discount, fee, shipping or extras');
  assert.equal(r.priceBeforeDiscount, 100);
});

test('junk inputs cannot produce a NaN price', () => {
  // These reach the function from text inputs and from JSON over the LAN API.
  const r = quoteTotal({
    baseCost: 'abc', qty: null, margin: undefined, discountPct: NaN,
    rushEnabled: true, rushPct: 'x', shippingCost: {}, extraLines: [null, { amount: 'y' }, undefined],
  });
  for (const [k, v] of Object.entries(r)) {
    assert.ok(Number.isFinite(v), `${k} is ${v}`);
  }
  assert.equal(r.total, 0);
});

test('negative inputs cannot pay the customer', () => {
  const r = quoteTotal({ baseCost: -500, margin: -50, shippingCost: -20, extraLines: [{ amount: -10 }] });
  assert.equal(r.total, 0, 'a negative cost or fee is clamped, never credited');
});

test('a discount above 100% does not invert into a charge', () => {
  const r = quoteTotal({ baseCost: 100, discountPct: 250 });
  assert.equal(r.subtotal, 0, 'clamped at free, not negative');
});

// MARK: - tier selection

test('the highest tier the quantity reaches is the one that applies', () => {
  const tiers = [{ minQty: 5, pricePerUnit: 40 }, { minQty: 10, pricePerUnit: 30 }, { minQty: 50, pricePerUnit: 20 }];
  assert.equal(activePriceTier(tiers, 4), null, 'below every tier');
  assert.equal(activePriceTier(tiers, 5).pricePerUnit, 40);
  assert.equal(activePriceTier(tiers, 49).pricePerUnit, 30, 'the highest REACHED, not the cheapest listed');
  assert.equal(activePriceTier(tiers, 500).pricePerUnit, 20);
});

test('a half-filled tier row is ignored, not priced at zero', () => {
  // The UI lets a shop start typing a tier. An incomplete row must never become
  // "this job is free".
  assert.equal(activePriceTier([{ minQty: 10, pricePerUnit: 0 }], 100), null);
  assert.equal(activePriceTier([{ minQty: 0, pricePerUnit: 25 }], 100), null);
  assert.equal(activePriceTier([{}, null, undefined], 100), null);
  assert.equal(activePriceTier(null, 100), null);
});
