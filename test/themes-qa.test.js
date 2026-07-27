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

test('each built-in theme declares a known shell and its own body class', () => {
  // Kept in step with applyBodyClasses() in renderer/themes.js — these are the
  // exact values it toggles on.
  const SHELLS = ['workbench', 'command', 'vivid', 'meridian', 'default'];
  const SHELL_CLASSES = ['bedready-ui', 'khayt-workbench', 'khayt-command', 'khayt-vivid', 'khayt-meridian'];
  const seenShell = new Map();
  const seenClass = new Map();
  for (const [id, theme] of Object.entries(reg.BUILTIN_THEMES)) {
    if (theme.enabled === false) continue;
    assert.ok(theme.bodyClass, `${id} missing bodyClass`);
    assert.ok(theme.shell, `${id} missing shell`);
    // The name of this test promised distinctness but never checked it — two
    // themes sharing a shell or body class would have sailed through, and
    // applyBodyClasses() toggles on exactly these values.
    // A shell MAY be shared. It used to be one-per-theme simply because there
    // were three themes and three shells, and this asserted that coincidence as
    // a rule. Reuse is the supported mechanism — CUSTOM_THEME_SHELLS exists so a
    // theme can pick an existing layout — and applyBodyClasses() handles it: it
    // toggles the shell class from theme.shell and adds theme.bodyClass
    // separately. Blueprint rides the Workbench shell, Nocturne rides Command.
    assert.ok(SHELLS.includes(theme.shell), `${id} declares unknown shell '${theme.shell}'`);

    // The body class, however, must still be unique: it is the per-theme hook
    // every identity stylesheet is scoped to, so a collision silently gives one
    // theme another's styling.
    assert.equal(seenClass.get(theme.bodyClass), undefined,
      `${id} reuses bodyClass '${theme.bodyClass}' already claimed by ${seenClass.get(theme.bodyClass)}`);
    seenShell.set(theme.shell, id);
    seenClass.set(theme.bodyClass, id);

    // The body class must actually end up on <body>, and there are exactly two
    // ways that happens in applyBodyClasses(): it is this theme's OWN shell
    // class (set by the shell toggle), or it is not a shell class at all (added
    // as the extra per-theme hook). Naming a DIFFERENT shell's class is the
    // trap — the toggle for it stays false because the shell does not match,
    // and the extra-hook branch explicitly skips shell classes, so the theme
    // gets no hook and its stylesheet never matches. Silently, with the
    // inherited layout still looking correct.
    const ownShellClass = `khayt-${theme.shell}`;
    assert.equal(
      theme.bodyClass === ownShellClass || !SHELL_CLASSES.includes(theme.bodyClass),
      true,
      `${id} bodyClass '${theme.bodyClass}' is another shell's class and would never be applied`,
    );
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

test('coming-soon cards are labelled with their own theme, not the fallback', () => {
  // getTheme() normalises first, and normalizeDesignId() maps anything
  // `enabled: false` onto workbench — correct for deciding what to RENDER (a
  // disabled theme must never be applied), wrong for describing one. The
  // picker's coming-soon loop went through getTheme(), so Pulse and Stream both
  // drew "Workbench / Native productivity app…" under a COMING SOON badge.
  // Found by opening the real Settings screen and reading the cards.
  for (const id of reg.listComingSoonThemes()) {
    const def = reg.getThemeDefinition(id);
    assert.ok(def, `${id} has no raw definition`);
    assert.equal(def.labelKey, `theme.design.${id}`, `${id} must be labelled as itself`);
    assert.equal(def.descKey, `theme.design.${id}_desc`, `${id} must describe itself`);
    // And the trap that caused it: the normalising lookup still resolves away.
    assert.equal(reg.getTheme(id).labelKey, 'theme.design.workbench',
      'getTheme() is expected to normalise a disabled theme — that is why the raw lookup exists');
  }
  // The picker must use the raw lookup for these cards.
  const src = fs.readFileSync(path.join(root, 'renderer/themes/theme-picker.js'), 'utf8');
  assert.match(src, /getThemeDefinition\(id\)/,
    'the coming-soon loop must label from getThemeDefinition, not getTheme');
});
