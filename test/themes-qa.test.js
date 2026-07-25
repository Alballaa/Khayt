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

test('arabic locale includes theme design keys for RTL QA', () => {
  const ar = loadLocale('ar');
  const required = [
    'theme.design.label',
    'theme.design.workbench',
    'theme.design.command',
    'theme.design.vivid',
  ];
  for (const key of required) {
    assert.ok(ar[key], `ar.js missing ${key}`);
  }
});

test('each built-in theme maps to a distinct shell body class', () => {
  const seenShell = new Map();
  const seenClass = new Map();
  for (const [id, theme] of Object.entries(reg.BUILTIN_THEMES)) {
    if (theme.enabled === false) continue;
    assert.ok(theme.bodyClass, `${id} missing bodyClass`);
    assert.ok(theme.shell, `${id} missing shell`);
    // The name of this test promised distinctness but never checked it — two
    // themes sharing a shell or body class would have sailed through, and
    // applyBodyClasses() toggles on exactly these values.
    assert.equal(seenShell.get(theme.shell), undefined,
      `${id} reuses shell '${theme.shell}' already claimed by ${seenShell.get(theme.shell)}`);
    assert.equal(seenClass.get(theme.bodyClass), undefined,
      `${id} reuses bodyClass '${theme.bodyClass}' already claimed by ${seenClass.get(theme.bodyClass)}`);
    seenShell.set(theme.shell, id);
    seenClass.set(theme.bodyClass, id);
    // Convention: the body class is the shell name, khayt-prefixed.
    assert.equal(theme.bodyClass, `khayt-${theme.shell}`, `${id} body class must match its shell`);
  }
});

test('every enabled built-in theme has an implementation directory', () => {
  // The registry is a hand-maintained map and the directories are the code it
  // points at. An id with no directory means a theme the user can select that
  // renders nothing; a directory with no id is dead code kept alive by nobody.
  const dir = path.join(root, 'renderer/themes');
  const dirs = fs.readdirSync(dir)
    .filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
    .filter((d) => !d.startsWith('_') && d !== 'previews' && d !== 'custom');
  const ids = Object.entries(reg.BUILTIN_THEMES).filter(([, t]) => t.enabled !== false).map(([id]) => id);

  assert.deepEqual(ids.filter((i) => !dirs.includes(i)), [], 'selectable theme with no implementation');
  assert.deepEqual(dirs.filter((d) => !ids.includes(d)), [], 'theme directory no registry entry points at');
});

test('the theme e2e covers every theme a user can pick', () => {
  // e2e-theme-shells.mjs pins theme ids by hand. A new theme that is selectable
  // but unpinned ships with nothing rendering its dashboard or queue — which is
  // exactly how a broken top-bar search reached users before that suite was
  // added to CI.
  const e2e = fs.readFileSync(path.join(root, 'scripts/e2e-theme-shells.mjs'), 'utf8');
  const pinned = new Set([...e2e.matchAll(/id:\s*'([a-z]+)'/g)].map((m) => m[1]));
  const selectable = reg.listSelectableThemes().filter((t) => !t.startsWith('custom:'));
  const uncovered = selectable.filter((id) => !pinned.has(id));
  assert.deepEqual(uncovered, [], `selectable themes with no e2e coverage: ${uncovered.join(', ')}`);
});
