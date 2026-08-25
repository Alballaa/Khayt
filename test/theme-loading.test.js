const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The renderer's theme registry, loaded outside a browser. */
function registry() {
  const ctx = { console, document: undefined };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('renderer/themes/registry-core.js'), ctx);
  return ctx.KhaytThemeRegistry;
}

const MANIFEST = { id: 'bench-dark', name: 'Bench Dark', tokens: 'tokens.css' };

test('a theme with no URL still registers, and carries its CSS as text', () => {
  const reg = registry();
  const css = [{ name: 'tokens.css', text: ':root{--accent:#0af}' }];
  const r = reg.registerCustomTheme(MANIFEST, null, css);
  assert.equal(r.ok, true, JSON.stringify(r.errors));

  const theme = reg.getTheme('custom:bench-dark') || reg.getTheme('bench-dark');
  assert.ok(theme, 'registered');
  assert.deepEqual(Array.from(theme.stylesheets), [], 'nothing to link — userData has no fetchable URL');
  assert.equal(JSON.stringify(theme.inlineCss), JSON.stringify(css), 'the CSS travels with it instead');
});

test('a bundled theme still links, exactly as before', () => {
  // The developer route must not regress: this is how a theme gets written.
  const reg = registry();
  reg.registerCustomTheme({ ...MANIFEST, compat: 'compat.css' }, 'themes/custom');
  const theme = reg.getTheme('custom:bench-dark') || reg.getTheme('bench-dark');
  assert.deepEqual(Array.from(theme.stylesheets), [
    'themes/custom/bench-dark/tokens.css',
    'themes/custom/bench-dark/compat.css',
  ]);
  assert.equal(theme.inlineCss, null);
});

test('injected CSS uses textContent, which cannot end the element', () => {
  // The single line the safety of injection rests on. innerHTML would let
  // `</style><script>` out of the stylesheet; textContent cannot, whatever the
  // string says. lib/theme-package.js refuses that construct twice as well, so
  // this is the third independent reason it does not work.
  const src = read('renderer/themes.js');
  const region = src.slice(src.indexOf('function loadCustomThemeStyles'), src.indexOf('function isBedReady'));
  // Comments stripped: the code explains why it does not use innerHTML, and
  // asserting over prose would forbid writing that down — which is the opposite
  // of what this repo does.
  const fn = region.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/createElement\('style'\)/.test(fn), 'inline CSS becomes a <style> element');
  assert.ok(/\.textContent\s*=\s*sheet\.text/.test(fn), 'set via textContent');
  assert.ok(!/innerHTML/.test(fn), 'never innerHTML');
});

test('unloading removes injected styles as well as linked ones', () => {
  // It selected link[...] only. A theme switched away from would have left its
  // <style> behind, so every design tried in one session would still be applied.
  const src = read('renderer/themes.js');
  const fn = src.slice(src.indexOf('function unloadCustomThemeStyles'), src.indexOf('function loadCustomThemeStyles'));
  assert.ok(/querySelectorAll\('\[data-khayt-theme-pack="custom"\]'\)/.test(fn),
    'matches any element carrying the marker, not just <link>');
});

test('an inline-only theme is not skipped by the empty-stylesheets guard', () => {
  const src = read('renderer/themes.js');
  const fn = src.slice(src.indexOf('function loadCustomThemeStyles'), src.indexOf('function isBedReady'));
  assert.ok(/inlineCss\?\.length/.test(fn), 'the early return accounts for inline-only themes');
});

test('the read handler judges the CSS again, every time', () => {
  // Install-time approval describes the file that arrived, not the file now.
  // userData is a directory the owner can open and anything running as that user
  // can write to, so loading on the old verdict is trust-on-first-use.
  const src = read('main.js');
  const h = src.slice(src.indexOf("ipcMain.handle('hub:themes-read'"), src.indexOf("ipcMain.handle('hub:themes-remove'"));
  assert.ok(h.includes('Pkg.inspectPackage'), 're-inspected on read');
  assert.ok(h.indexOf('Pkg.inspectPackage') < h.indexOf('return {\n    ok: true'), 'before anything is returned');
  assert.ok(h.includes('changedSinceInstall'), 'and says so, rather than failing vaguely');
  // Paths still come from the confined helpers, not built here.
  assert.ok(h.includes('Store.themeDir'), 'directory resolved by the store');
  assert.ok(h.includes('Store.isInsideRoot'), 'each file confined');
  assert.ok(h.includes('Store.SAFE_FILENAME'), 'each name checked as a name');
});

test('the loader reads the API the preload actually exposes', () => {
  // It was written against `khaytAPI`, which does not exist — the loader would
  // have returned [] forever and looked like "no themes installed".
  const exposed = /exposeInMainWorld\('([^']+)'/.exec(read('preload.js'))[1];
  const loader = read('renderer/themes/custom-loader.js');
  assert.ok(loader.includes(`global.${exposed}`), `loader must use ${exposed}`);
  for (const fn of ['themesList', 'themesRead']) {
    assert.ok(read('preload.js').includes(fn), `${fn} exposed`);
    assert.ok(loader.includes(fn), `${fn} used`);
  }
});

test('a broken or refused theme costs a design, not the app', () => {
  const loader = read('renderer/themes/custom-loader.js');
  assert.ok(/if \(t\.broken\) continue/.test(loader), 'a broken theme is skipped, not applied');
  assert.ok(/if \(!read \|\| !read\.ok\)/.test(loader), 'a refused read is skipped');
  // Both loaders are wrapped: this runs during boot and an exception would take
  // the renderer down over somebody else's stylesheet.
  assert.equal((loader.match(/catch \(e\)/g) || []).length, 2, 'both paths catch');
});

test('the whole chain agrees: install, store, read, register', () => {
  const Store = require('../lib/theme-store.js');
  const Pkg = require('../lib/theme-package.js');
  const os = require('os');

  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-load-'));
  const text = JSON.stringify({ manifest: MANIFEST, files: { 'tokens.css': ':root{--accent:#0af}' } });

  const parsed = Store.parseBundle(text);
  assert.equal(parsed.ok, true);
  assert.equal(Pkg.inspectPackage({ manifest: parsed.manifest, files: parsed.files }).ok, true);

  const plan = Store.planInstall(ud, parsed.manifest, parsed.files);
  fs.mkdirSync(plan.dir, { recursive: true });
  for (const w of plan.writes) fs.writeFileSync(w.path, w.contents, 'utf8');

  // Now read it back the way the handler does, and re-judge.
  const manifest = JSON.parse(fs.readFileSync(path.join(plan.dir, 'manifest.json'), 'utf8'));
  const files = { 'tokens.css': fs.readFileSync(path.join(plan.dir, 'tokens.css'), 'utf8') };
  const judged = Pkg.inspectPackage({ manifest, files });
  assert.equal(judged.ok, true);

  const reg = registry();
  const r = reg.registerCustomTheme(manifest, null, judged.files.map((n) => ({ name: n, text: files[n] })));
  assert.equal(r.ok, true, JSON.stringify(r.errors));

  // And the edited-after-install case, which is the reason the read re-judges.
  fs.writeFileSync(path.join(plan.dir, 'tokens.css'), 'a{background:url(https://evil.example/x)}', 'utf8');
  const after = Pkg.inspectPackage({
    manifest,
    files: { 'tokens.css': fs.readFileSync(path.join(plan.dir, 'tokens.css'), 'utf8') },
  });
  assert.equal(after.ok, false, 'a theme edited on disk is refused on the next read');

  fs.rmSync(ud, { recursive: true, force: true });
});
