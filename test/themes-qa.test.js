const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const reg = require('../renderer/themes/registry-core.js');

function loadEnLocale() {
  const ctx = vm.createContext({ globalThis: {} });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(root, 'renderer/locales/en.js'), 'utf8'), ctx, {
    filename: 'en.js',
  });
  return ctx.globalThis.KhaytLocales?.en || {};
}

function loadLocale(lang) {
  const ctx = vm.createContext({ globalThis: {} });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(root, `renderer/locales/${lang}.js`), 'utf8'), ctx, {
    filename: `${lang}.js`,
  });
  return ctx.globalThis.KhaytLocales?.[lang] || {};
}

test('every selectable built-in theme has a preview PNG', () => {
  const previewsDir = path.join(root, 'renderer/themes/previews');
  for (const id of reg.listSelectableThemes().filter((t) => !t.startsWith('custom:'))) {
    const theme = reg.getTheme(id);
    const file = theme.preview || `themes/previews/${id}.png`;
    const abs = path.join(root, 'renderer', file.replace(/^themes\//, 'themes/'));
    assert.ok(fs.existsSync(abs), `missing preview for ${id}: ${abs}`);
  }
});

test('en locale defines all built-in theme label and desc keys', () => {
  const en = loadEnLocale();
  for (const [id, theme] of Object.entries(reg.BUILTIN_THEMES)) {
    if (theme.enabled === false) continue;
    assert.ok(en[theme.labelKey], `${id} missing ${theme.labelKey}`);
    assert.ok(en[theme.descKey], `${id} missing ${theme.descKey}`);
    for (const accent of Object.values(theme.accents || {})) {
      if (accent.labelKey) assert.ok(en[accent.labelKey], `${id} missing accent ${accent.labelKey}`);
    }
  }
});

test('en locale defines reserved coming-soon theme keys', () => {
  const en = loadEnLocale();
  for (const [id, theme] of Object.entries(reg.RESERVED_THEMES)) {
    if (!theme.comingSoon) continue;
    assert.ok(en[theme.labelKey], `reserved ${id} missing ${theme.labelKey}`);
    assert.ok(en[theme.descKey], `reserved ${id} missing ${theme.descKey}`);
  }
});

test('cockpit skin and atlas accent keys exist in en locale', () => {
  const en = loadEnLocale();
  assert.ok(en['theme.cockpit.skin.label']);
  assert.ok(en['theme.cockpit.skin.poster']);
  assert.ok(en['theme.accent.phosphor']);
  assert.ok(en['theme.accent.ember']);
});

test('arabic locale includes theme design keys for RTL QA', () => {
  const ar = loadLocale('ar');
  const required = [
    'theme.design.label',
    'theme.design.studio',
    'theme.design.ledger',
    'theme.design.console',
    'theme.design.cockpit',
    'theme.design.atlas',
    'theme.cockpit.skin.label',
  ];
  for (const key of required) {
    assert.ok(ar[key], `ar.js missing ${key}`);
  }
});

test('each built-in theme maps to a distinct shell body class', () => {
  const shells = new Map();
  for (const [id, theme] of Object.entries(reg.BUILTIN_THEMES)) {
    if (theme.enabled === false) continue;
    assert.ok(theme.bodyClass, `${id} missing bodyClass`);
    assert.ok(theme.shell, `${id} missing shell`);
    shells.set(theme.shell, theme.bodyClass);
  }
  assert.equal(shells.get('studio'), 'khayt-studio');
  assert.equal(shells.get('atlas'), 'khayt-atlas');
  assert.equal(shells.get('cockpit'), 'khayt-cockpit');
});
