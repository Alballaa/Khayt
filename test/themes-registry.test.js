const { test } = require('node:test');
const assert = require('node:assert/strict');

const reg = require('../renderer/themes/registry-core.js');

test('normalizeDesignId maps classic to ledger', () => {
  assert.equal(reg.normalizeDesignId('classic'), 'ledger');
  assert.equal(reg.normalizeDesignId('studio'), 'studio');
  assert.equal(reg.normalizeDesignId('unknown'), 'workbench');
});

test('selectable themes are the three 2.6 designs; the seven legacy designs are hidden', () => {
  const selectable = reg.listSelectableThemes();
  assert.ok(selectable.includes('workbench'));
  assert.ok(selectable.includes('command'));
  assert.ok(selectable.includes('vivid'));
  for (const legacy of ['studio', 'ledger', 'console', 'atelier', 'vitrine', 'cockpit', 'atlas']) {
    assert.ok(!selectable.includes(legacy), `${legacy} should be hidden (legacy)`);
  }
});

test('coming soon lists Frontier Pulse and Stream only', () => {
  const soon = reg.listComingSoonThemes();
  assert.ok(!soon.includes('console'));
  assert.ok(!soon.includes('atlas'));
  assert.ok(!soon.includes('cockpit'));
  assert.ok(soon.includes('pulse'));
  assert.ok(soon.includes('stream'));
});

test('usesHandoffScreens covers studio through vitrine shells', () => {
  assert.equal(reg.usesHandoffScreens('studio'), true);
  assert.equal(reg.usesHandoffScreens('ledger'), true);
  assert.equal(reg.usesHandoffScreens('console'), true);
  assert.equal(reg.usesHandoffScreens('atelier'), true);
  assert.equal(reg.usesHandoffScreens('vitrine'), true);
  assert.equal(reg.usesHandoffScreens('cockpit'), false);
});

test('atelier and vitrine accent presets', () => {
  assert.equal(reg.defaultAccentForTheme('atelier'), 'clay');
  assert.equal(reg.defaultAccentForTheme('vitrine'), 'aurora');
  assert.ok(reg.accentsForTheme('atelier').sage);
  assert.ok(reg.accentsForTheme('vitrine').iris);
});

test('cockpit default accent is electric with four presets', () => {
  assert.equal(reg.defaultAccentForTheme('cockpit'), 'electric');
  const accents = reg.accentsForTheme('cockpit');
  assert.ok(accents.electric);
  assert.ok(accents.violet);
  assert.ok(accents.emerald);
  assert.ok(accents.flare);
});

test('atlas default accent is phosphor with four presets', () => {
  assert.equal(reg.defaultAccentForTheme('atlas'), 'phosphor');
  const accents = reg.accentsForTheme('atlas');
  assert.ok(accents.phosphor);
  assert.ok(accents.ember);
  assert.ok(accents.iris);
  assert.ok(accents.signal);
});

test('usesHandoffScreens excludes atlas frontier shell', () => {
  assert.equal(reg.usesHandoffScreens('atlas'), false);
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

test('validateCustomManifest rejects path traversal in stylesheet refs', () => {
  const base = { id: 'evil', name: 'Evil' };
  assert.ok(reg.validateCustomManifest({ ...base, tokens: '../../../etc/x.css' }).some((e) => /tokens/.test(e)));
  assert.ok(reg.validateCustomManifest({ ...base, tokens: 'ok.css', compat: 'a/b.css' }).some((e) => /compat/.test(e)));
  assert.ok(reg.validateCustomManifest({ ...base, tokens: 'ok.css', shellCss: '..\\win.css' }).some((e) => /shellCss/.test(e)));
  // A plain filename is accepted.
  assert.equal(reg.validateCustomManifest({ ...base, tokens: 'tokens.css' }).length, 0);
});

test('validateCustomManifest rejects malformed accents and bodyClass', () => {
  const base = { id: 'shop', name: 'Shop', tokens: 'tokens.css' };
  assert.ok(reg.validateCustomManifest({ ...base, accents: { x: { h: 999, s: '70%', l: '50%' } } }).some((e) => /h must/.test(e)));
  assert.ok(reg.validateCustomManifest({ ...base, accents: { x: { h: 200, s: 'red', l: '50%' } } }).some((e) => /s must/.test(e)));
  assert.ok(reg.validateCustomManifest({ ...base, bodyClass: 'a b" onload=x' }).some((e) => /bodyClass/.test(e)));
  // Valid accent (number or % forms) passes.
  assert.equal(reg.validateCustomManifest({ ...base, accents: { x: { h: 200, s: 70, l: '50%' } } }).length, 0);
});
