/**
 * Integrations registry — top-3 storefronts + top-3 payments per translated market.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MARKETS, forLocale, allStorefrontIds, allPaymentIds, storefront } = require('../lib/integrations-registry.js');

const LOCALES = ['ar', 'en', 'es', 'fr', 'de', 'ja', 'zh'];

test('every translated market has at least 3 storefronts + 3 payments', () => {
  for (const loc of LOCALES) {
    const m = MARKETS[loc];
    assert.ok(m, `market ${loc} exists`);
    assert.ok(m.storefronts.length >= 3, `${loc} storefronts`);
    assert.ok(m.payments.length >= 3, `${loc} payments`);
    assert.ok(m.country.en && m.country.ar, `${loc} country labels`);
    // ids unique within a market
    assert.equal(new Set(m.storefronts.map((s) => s.id)).size, m.storefronts.length, `${loc} storefront ids unique`);
    assert.equal(new Set(m.payments.map((p) => p.id)).size, m.payments.length, `${loc} payment ids unique`);
  }
});

test('entries are well-formed (id + name; storefront dir is in/out)', () => {
  for (const m of Object.values(MARKETS)) {
    for (const sf of m.storefronts) {
      assert.ok(sf.id && sf.name, 'storefront id+name');
      assert.ok(Array.isArray(sf.dir) && sf.dir.every((d) => d === 'in' || d === 'out'));
    }
    for (const p of m.payments) assert.ok(p.id && p.name, 'payment id+name');
  }
});

test('forLocale falls back to en for unknown locales', () => {
  assert.equal(forLocale('en'), forLocale('xx'));
  assert.equal(forLocale('ar').country.en, 'Saudi Arabia & Gulf');
});

test('id lookups', () => {
  assert.ok(allStorefrontIds().includes('shopify'));
  assert.ok(allPaymentIds().includes('alipay'));
  assert.equal(storefront('salla').name, 'Salla');
  assert.equal(storefront('nope'), null);
});
