'use strict';

// Khayt Cloud plan definitions. The figures come from
// docs/KHAYT-CLOUD-FEATURES-AND-PRICING.md §4 and are costed in
// docs/KHAYT-CLOUD-COST-PER-SHOP.md; these tests pin the properties that a
// careless edit would break quietly — a price that stops being struck through
// while nothing can collect it, or an annual figure that stops matching its
// own monthly.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const Plans = require('../lib/cloud-plans.js');

test('the ladder is free → cloud → branches', () => {
  assert.deepEqual(Plans.allPlans().map((p) => p.id), ['free', 'cloud', 'branches']);
});

test('prices are the ones the pricing doc sets', () => {
  assert.equal(Plans.planPrice('free', 'USD').amount, 0);
  assert.equal(Plans.planPrice('cloud', 'USD').amount, 9);
  assert.equal(Plans.planPrice('branches', 'USD').amount, 29);
  assert.equal(Plans.planPrice('cloud', 'SAR').amount, 35);
  assert.equal(Plans.planPrice('branches', 'SAR').amount, 109);
});

test('the ladder never goes down, in either currency', () => {
  for (const cur of Plans.CURRENCIES) {
    const amounts = Plans.allPlans().map((p) => Plans.planPrice(p.id, cur).amount);
    const sorted = [...amounts].sort((a, b) => a - b);
    assert.deepEqual(amounts, sorted, `${cur} prices are not in ascending order`);
  }
});

test('annual is ten months of the monthly price — in its OWN currency', () => {
  // The trap this guards: converting the annual USD figure into SAR instead of
  // multiplying the SAR monthly, which yields 337.50 and contradicts the
  // "two months free" the same table promises.
  for (const cur of Plans.CURRENCIES) {
    for (const p of Plans.allPlans()) {
      const { amount, annual } = Plans.planPrice(p.id, cur);
      assert.equal(annual, amount * 10, `${p.id}/${cur}: annual ${annual} != 10 × ${amount}`);
    }
  }
});

test('an unpriced currency falls back to USD rather than inventing a rate', () => {
  for (const cur of ['EUR', 'GBP', 'JPY', '', null, undefined, 'sar']) {
    const got = Plans.planPrice('cloud', cur);
    const expected = String(cur).toUpperCase() === 'SAR' ? 'SAR' : 'USD';
    assert.equal(got.currency, expected, `${cur} should price in ${expected}`);
  }
});

test('during beta, paid tiers are struck through and nothing is charged', () => {
  const beta = { betaFree: true };
  const cloud = Plans.planPrice('cloud', 'USD', beta);
  assert.equal(cloud.strike, true, 'a paid tier renders struck through during beta');
  assert.equal(cloud.charged, false, 'nothing is collected during beta');
  assert.equal(cloud.amount, 9, 'the price is still shown — beta does not zero it');
});

test('free is free forever, which is NOT the same as "not charged yet"', () => {
  for (const betaFree of [true, false]) {
    const free = Plans.planPrice('free', 'USD', { betaFree });
    assert.equal(free.free, true);
    assert.equal(free.charged, false);
    assert.equal(free.strike, false, 'zero is never struck through — there is no future price to reveal');
  }
});

test('after beta, paid tiers stop being struck through and start being charged', () => {
  const live = { betaFree: false };
  for (const id of ['cloud', 'branches']) {
    const p = Plans.planPrice(id, 'USD', live);
    assert.equal(p.strike, false);
    assert.equal(p.charged, true);
  }
});

test('BETA_FREE is still on — flipping it is a deliberate act, not a drive-by', () => {
  // Not style policing: the flag must not go false before payment collection
  // exists, or every tier advertises a price nothing can take. If this test is
  // failing because you flipped it, confirm billing can actually charge, then
  // update this test in the same commit so the two facts stay together.
  assert.equal(Plans.isBetaFree(), true);
  assert.equal(Plans.planPrice('cloud', 'USD').strike, true);
});

test('branches is marked unbuilt, because Phase 3 is', () => {
  // docs/KHAYT-3.0-CLOUD-STATUS.md: multi-shop tenancy is Not started. Listing a
  // price without saying so would be selling something that does not exist.
  assert.equal(Plans.planById('branches').soon, true);
  assert.equal(Plans.planById('cloud').soon, undefined);
});

test('every plan carries a label, tagline and features in en and ar', () => {
  for (const p of Plans.allPlans()) {
    for (const lang of ['en', 'ar']) {
      assert.ok(p.label[lang], `${p.id} label.${lang}`);
      assert.ok(p.tagline[lang], `${p.id} tagline.${lang}`);
      assert.ok(p.features.length, `${p.id} has features`);
      for (const f of p.features) assert.ok(f.label[lang], `${p.id}.${f.key} label.${lang}`);
    }
  }
});

test('planComparison renders a complete table and falls back per key', () => {
  const rows = Plans.planComparison('ar', 'SAR');
  assert.equal(rows.length, 3);
  assert.equal(rows[1].label, 'السحابة');
  assert.equal(rows[1].price.currency, 'SAR');
  assert.equal(rows[1].price.amount, 35);

  // A language with no translations at all still gets a full English table
  // rather than a grid of blanks.
  const none = Plans.planComparison('xx', 'USD');
  for (const r of none) {
    assert.ok(r.label && r.tagline, `${r.id} fell back to English`);
    for (const f of r.features) assert.ok(f.label, `${r.id}.${f.key} fell back to English`);
  }
});

test('planById / planPrice are safe on an unknown id', () => {
  assert.equal(Plans.planById('enterprise'), undefined);
  assert.equal(Plans.planPrice('enterprise', 'USD'), null);
});
