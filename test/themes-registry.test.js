const { test } = require('node:test');
const assert = require('node:assert/strict');

const reg = require('../renderer/themes/registry-core.js');

test('normalizeDesignId maps classic to ledger', () => {
  assert.equal(reg.normalizeDesignId('classic'), 'ledger');
  assert.equal(reg.normalizeDesignId('studio'), 'studio');
  assert.equal(reg.normalizeDesignId('unknown'), 'studio');
});

test('reserved themes are not selectable', () => {
  const selectable = reg.listSelectableThemes();
  assert.ok(selectable.includes('studio'));
  assert.ok(selectable.includes('ledger'));
  assert.ok(!selectable.includes('blueprint'));
  assert.ok(!selectable.includes('atlas'));
});

test('coming soon lists reserved themes', () => {
  const soon = reg.listComingSoonThemes();
  assert.ok(soon.includes('blueprint'));
  assert.ok(soon.includes('atlas'));
});

test('validateCustomManifest catches invalid ids', () => {
  const errors = reg.validateCustomManifest({ id: 'X', name: 'Bad' });
  assert.ok(errors.length > 0);
});

test('registerCustomTheme adds custom theme', () => {
  const result = reg.registerCustomTheme({
    id: 'test-shop',
    name: 'Test Shop',
    tokens: 'tokens.css',
    accents: { brand: { h: 200, s: '70%', l: '50%', label: 'Brand' } },
    shell: 'studio',
  });
  assert.equal(result.ok, true);
  assert.equal(reg.normalizeDesignId('custom:test-shop'), 'custom:test-shop');
  assert.equal(reg.defaultAccentForTheme('custom:test-shop'), 'brand');
});
