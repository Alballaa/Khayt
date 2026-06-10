const { test } = require('node:test');
const assert = require('node:assert/strict');

const reg = require('../renderer/themes/registry-core.js');

test('normalizeDesignId maps classic to ledger', () => {
  assert.equal(reg.normalizeDesignId('classic'), 'ledger');
  assert.equal(reg.normalizeDesignId('studio'), 'studio');
  assert.equal(reg.normalizeDesignId('unknown'), 'studio');
});

test('selectable themes include studio, ledger, and console', () => {
  const selectable = reg.listSelectableThemes();
  assert.ok(selectable.includes('studio'));
  assert.ok(selectable.includes('ledger'));
  assert.ok(selectable.includes('console'));
  assert.ok(!selectable.includes('cockpit'));
});

test('coming soon lists reserved Khayt-4 themes', () => {
  const soon = reg.listComingSoonThemes();
  assert.ok(!soon.includes('console'));
  assert.ok(soon.includes('atelier'));
  assert.ok(soon.includes('vitrine'));
  assert.ok(soon.includes('cockpit'));
});

test('usesHandoffScreens covers studio, ledger, and console shells', () => {
  assert.equal(reg.usesHandoffScreens('studio'), true);
  assert.equal(reg.usesHandoffScreens('ledger'), true);
  assert.equal(reg.usesHandoffScreens('console'), true);
  assert.equal(reg.usesHandoffScreens('cockpit'), false);
});

test('console default accent is signal with four presets', () => {
  assert.equal(reg.defaultAccentForTheme('console'), 'signal');
  const accents = reg.accentsForTheme('console');
  assert.ok(accents.signal);
  assert.ok(accents.amber);
  assert.ok(accents.cyan);
  assert.ok(accents.white);
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
