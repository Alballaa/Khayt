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

test('pt-BR is a COMPLETE locale, not a partial one', () => {
  // t() falls back to STRINGS.en before it falls back to the key, so a partial
  // locale does not break — it silently serves English to someone who chose
  // Português. That is worse than not offering the language, which is why this
  // asserts parity rather than mere existence: pt-BR is in the picker, so it
  // has to actually be finished.
  const load = (lang) => {
    const ctx = vm.createContext({ globalThis: {} });
    ctx.globalThis = ctx;
    vm.runInContext(fs.readFileSync(path.join(root, `renderer/locales/${lang}.js`), 'utf8'), ctx, {
      filename: `${lang}.js`,
    });
    return ctx.globalThis.KhaytLocales?.[lang] || {};
  };
  const en = load('en');
  const pt = load('pt-BR');
  const missing = Object.keys(en).filter((k) => pt[k] === undefined);
  assert.deepEqual(missing.slice(0, 20), [], `pt-BR is missing ${missing.length} key(s)`);
  assert.equal(Object.keys(pt).length, Object.keys(en).length);

  // Placeholders must survive translation or the string breaks at runtime:
  // "{n} pedidos" is fine, "{numero} pedidos" silently renders the literal.
  const bad = [];
  for (const [k, v] of Object.entries(pt)) {
    const want = (String(en[k]).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
    const got = (String(v).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',');
    if (want !== got) bad.push(`${k}: expected ${want || '(none)'} got ${got || '(none)'}`);
  }
  assert.deepEqual(bad, [], 'placeholders altered in translation');
});

test('every locale the language picker offers is actually registered', () => {
  // A picker entry with no locale file (or one missing from i18n's valid list)
  // silently falls back to English while the dropdown claims otherwise.
  const i18n = fs.readFileSync(path.join(root, 'renderer/i18n.js'), 'utf8');
  const valid = (i18n.match(/const valid = \[([^\]]+)\]/) || [, ''])[1]
    .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

  for (const shell of ['renderer/index.html', 'renderer/bedready.html']) {
    const html = fs.readFileSync(path.join(root, shell), 'utf8');
    const offered = new Set([...html.matchAll(/<option value="([a-zA-Z-]{2,5})">/g)]
      .map((m) => m[1]).filter((v) => valid.includes(v) || /^[a-z]{2}(-[A-Z]{2})?$/.test(v)));
    for (const lang of offered) {
      if (!valid.includes(lang)) continue;   // not a language option
      assert.ok(fs.existsSync(path.join(root, `renderer/locales/${lang}.js`)),
        `${shell} offers ${lang} but renderer/locales/${lang}.js does not exist`);
      assert.match(html, new RegExp(`locales/${lang}\\.js`),
        `${shell} offers ${lang} but never loads its locale script`);
    }
  }
});

test('deleted themes leave no strings behind', () => {
  // cockpit, atlas and the console status bar were removed in 3.3, but their
  // locale keys stayed — 54 of them, times nine languages, translated and
  // maintained for UI that no longer exists. Anything reintroducing them is
  // almost certainly a revert, not a feature.
  const gone = ['cockpit.', 'atlas.', 'console.status.'];
  for (const lang of ['en', 'ar', 'de', 'es', 'fr', 'ja', 'tr', 'zh', 'pt-BR']) {
    const src = fs.readFileSync(path.join(root, `renderer/locales/${lang}.js`), 'utf8');
    for (const prefix of gone) {
      assert.equal(src.includes(`"${prefix}`), false,
        `${lang}.js still carries ${prefix}* keys for a deleted theme`);
    }
  }
  // And the markup those keys described must stay gone from BOTH shells — #514
  // removed it from index.html only, leaving bedready.html carrying it hidden.
  for (const shell of ['renderer/index.html', 'renderer/bedready.html']) {
    const html = fs.readFileSync(path.join(root, shell), 'utf8');
    assert.equal(html.includes('consoleStatusBar'), false, `${shell} still has the dead status bar`);
  }
});
