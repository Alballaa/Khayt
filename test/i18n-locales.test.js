const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

test('locale files register KhaytLocales.en with app.title', () => {
  const ctx = vm.createContext({ globalThis: {} });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(root, 'renderer/locales/en.js'), 'utf8'), ctx, {
    filename: 'en.js',
  });
  assert.equal(ctx.globalThis.KhaytLocales?.en?.['app.title'], 'Khayt');
});

test('all seven locale files exist', () => {
  for (const lang of ['en', 'ar', 'de', 'es', 'fr', 'zh', 'ja']) {
    assert.ok(fs.existsSync(path.join(root, 'renderer/locales', `${lang}.js`)));
  }
});

test('arabic locale exposes RTL dir via i18n contract keys', () => {
  const ctx = vm.createContext({ globalThis: {} });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(root, 'renderer/locales/ar.js'), 'utf8'), ctx, {
    filename: 'ar.js',
  });
  const ar = ctx.globalThis.KhaytLocales?.ar || {};
  assert.ok(ar['theme.design.workbench']);
  assert.ok(ar['theme.design.command']);
});

/**
 * Every data-i18n key in the shipped HTML must exist in en.js.
 *
 * i18n.t() ends with `|| key`, and applyToDom assigns the result straight over
 * el.textContent — so a missing key does not fall back to the English text
 * written in the HTML, it REPLACES it with the raw dotted key. The user sees
 * "theme.design.studio_desc" sitting in the settings pane.
 *
 * check-locale-files.js only runs `node --check` on each locale, so nothing
 * caught this class before: #492 and #496 were the same shape in CSS custom
 * properties, and this is its i18n twin.
 *
 * en.js is the assertion target because t() falls back to STRINGS.en before it
 * falls back to the key, so a key present in en.js can never render raw.
 */
test('every data-i18n key in the HTML shells resolves in en.js', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');

  const en = fs.readFileSync(path.join(ROOT, 'renderer/locales/en.js'), 'utf8');
  const keys = new Set([...en.matchAll(/^\s*"([^"]+)"\s*:/gm)].map((m) => m[1]));

  // Bed Ready rebrands a set of shared strings at runtime: bedready-home.js
  // writes an override map over every loaded locale, so keys that exist ONLY
  // there still resolve (e.g. set.lang_theme_head). Counting them keeps this
  // guard from failing on copy that is demonstrably correct on screen.
  // Note the override map is English-only — it is the right home for Bed Ready
  // rebranding, and the wrong home for anything needing translation.
  const bdr = fs.readFileSync(path.join(ROOT, 'renderer/bedready-home.js'), 'utf8');
  for (const m of bdr.matchAll(/^\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'\s*:/gim)) keys.add(m[1]);

  const missing = [];
  for (const shell of ['renderer/index.html', 'renderer/bedready.html']) {
    const html = fs.readFileSync(path.join(ROOT, shell), 'utf8');
    for (const attr of ['data-i18n', 'data-i18n-placeholder', 'data-i18n-aria', 'data-i18n-title', 'data-i18n-html']) {
      const re = new RegExp(`${attr}="([^"]+)"`, 'g');
      for (const m of html.matchAll(re)) {
        // Currency unit labels come from settings, not locale strings —
        // applyToDom skips this key explicitly.
        if (m[1] === 'common.currency') continue;
        if (!keys.has(m[1])) missing.push(`${path.basename(shell)}: ${m[1]} (${attr})`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], [],
    `these render as their raw key instead of text:\n  ${[...new Set(missing)].join('\n  ')}`);
});
