const { test } = require('node:test');
const assert = require('node:assert/strict');

const reg = require('../renderer/themes/registry-core.js');

test('normalizeDesignId falls stale ids back to the default', () => {
  // 'classic' and the six deleted legacy designs all resolve to workbench now.
  assert.equal(reg.normalizeDesignId('classic'), 'workbench');
  assert.equal(reg.normalizeDesignId('unknown'), 'workbench');
  for (const gone of ['ledger', 'console', 'atelier', 'vitrine', 'cockpit', 'atlas']) {
    assert.equal(reg.normalizeDesignId(gone), 'workbench', `${gone} was deleted`);
  }
  // studio survives in the registry for Bed Ready, which pins to it directly.
  assert.equal(reg.normalizeDesignId('studio'), 'studio');
});

test('selectable themes are exactly the three 2.6 designs', () => {
  const selectable = reg.listSelectableThemes();
  assert.deepEqual(selectable.filter((id) => !id.startsWith('custom:')).sort(),
    ['command', 'vivid', 'workbench']);
});

test('the six deleted legacy designs are gone from the registry', () => {
  for (const gone of ['ledger', 'console', 'atelier', 'vitrine', 'cockpit', 'atlas']) {
    assert.equal(reg.BUILTIN_THEMES[gone], undefined, `${gone} should be deleted`);
    assert.equal(reg.registry[gone], undefined, `${gone} should be deleted`);
  }
});

test('studio is retained but unselectable — Bed Ready pins to it', () => {
  assert.ok(reg.BUILTIN_THEMES.studio, 'studio must survive for Bed Ready');
  assert.equal(reg.BUILTIN_THEMES.studio.legacy, true);
  assert.ok(!reg.listSelectableThemes().includes('studio'));
});

test('coming soon lists Frontier Pulse and Stream only', () => {
  const soon = reg.listComingSoonThemes();
  assert.ok(!soon.includes('console'));
  assert.ok(!soon.includes('atlas'));
  assert.ok(!soon.includes('cockpit'));
  assert.ok(soon.includes('pulse'));
  assert.ok(soon.includes('stream'));
});

test('usesHandoffScreens is now studio-only', () => {
  // The other four handoff shells went with the legacy deletion; studio is the
  // last one, and only Bed Ready reaches it.
  assert.equal(reg.usesHandoffScreens('studio'), true);
  for (const shell of ['ledger', 'console', 'atelier', 'vitrine', 'cockpit', 'atlas', 'workbench']) {
    assert.equal(reg.usesHandoffScreens(shell), false, `${shell} is not a handoff shell`);
  }
});






test('each surviving theme has a default accent inside its own preset set', () => {
  for (const id of ['workbench', 'command', 'vivid', 'studio']) {
    const def = reg.defaultAccentForTheme(id);
    assert.ok(reg.accentsForTheme(id)[def], `${id} default accent ${def} missing from its set`);
  }
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
    // Was 'studio'. A custom theme adopting that shell would switch on
    // body.khayt-handoff for a Khayt user, re-activating Bed Ready's screen
    // layer through the back door — so custom themes now pick a Khayt shell.
    shell: 'workbench',
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

test('custom manifests may only claim shells that still exist', () => {
  const base = { id: 'shop', name: 'Shop', tokens: 'tokens.css' };
  // Regression: 'ledger' was an accepted shell until the 3.3 legacy deletion
  // removed it — a manifest naming it validated clean and then rendered nothing.
  assert.ok(reg.validateCustomManifest({ ...base, shell: 'ledger' }).some((e) => /shell/.test(e)));
  // 'studio' is Bed Ready's shell, not a Khayt one.
  assert.ok(reg.validateCustomManifest({ ...base, shell: 'studio' }).some((e) => /shell/.test(e)));
  for (const shell of reg.CUSTOM_THEME_SHELLS) {
    assert.deepEqual(reg.validateCustomManifest({ ...base, shell }), [], `${shell} should be allowed`);
  }
});
