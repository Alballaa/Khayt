/**
 * Every local module the app requires must be inside the packaged build.
 *
 * `build.files` in package.json is an ALLOWLIST. A file can exist in the repo,
 * be required at startup, pass every test and every e2e — and simply not be in
 * the shipped bundle, because nothing here runs from a bundle. The app then dies
 * on launch for every user, with CI green and the release artefacts uploaded.
 *
 * scripts/verify-release.mjs catches that after publishing, by downloading the
 * build and launching it. This catches it on the pull request, which is the
 * cheaper place: a release that has to be re-cut has already moved the stable
 * pointer and, on Linux, already been offered to the updater.
 *
 * The allowlist is read from package.json rather than restated, so widening it is
 * what makes new paths legal — not editing this file.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PATTERNS = pkg.build.files;

/**
 * Does a repo-relative path survive packaging?
 *
 * electron-builder's globs are richer than this, but the project only uses two
 * shapes — an exact file, and `dir/**\/*`. Anything else appearing in build.files
 * fails loudly below rather than being silently treated as "not matched", because
 * a matcher that quietly under-approximates would turn this test into noise and
 * then into a suppression.
 */
function isPackaged(rel) {
  return PATTERNS.some((p) => {
    if (p === rel) return true;
    const m = /^(.+?)\/\*\*\/\*$/.exec(p);
    if (m) return rel === m[1] || rel.startsWith(m[1] + '/');
    if (!p.includes('*')) return false;
    throw new Error(`build.files carries a glob this test cannot evaluate: ${p}`);
  });
}

/** Files that run in the packaged app's main process. */
function mainProcessSources() {
  const out = ['main.js', 'preload.js'];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel))) {
      const r = path.join(rel, entry);
      if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r);
      else if (entry.endsWith('.js')) out.push(r);
    }
  };
  walk('lib');
  return out;
}

/** Resolve a require target the way Node would, relative to the requiring file. */
function resolveLocal(fromRel, spec) {
  const base = path.join(path.dirname(path.join(ROOT, fromRel)), spec);
  for (const candidate of [base, base + '.js', base + '.json', path.join(base, 'index.js')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.relative(ROOT, candidate).split(path.sep).join('/');
    }
  }
  return null;
}

test('every local require in the main process is inside the packaged build', () => {
  const sources = mainProcessSources();
  assert.ok(sources.length >= 20, `only found ${sources.length} main-process files — the walk broke`);

  const missing = [];
  const unresolved = [];
  let checked = 0;

  for (const rel of sources) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      checked++;
      const target = resolveLocal(rel, m[1]);
      if (!target) { unresolved.push(`${rel} → ${m[1]}`); continue; }
      if (!isPackaged(target)) missing.push(`${rel} → ${m[1]}  (resolves to ${target})`);
    }
  }

  assert.ok(checked >= 40, `only found ${checked} local requires — the extraction broke, this test is blind`);
  assert.deepEqual(unresolved, [], 'these require a file that does not exist');
  assert.deepEqual(missing, [],
    'these are required at runtime but excluded from build.files — the packaged app would die on launch');
});

test('every script the renderer loads is inside the packaged build', () => {
  // The renderer shell lists its modules by hand. One added outside renderer/ —
  // or a path that walks up out of it — packages away just as silently.
  const shell = path.join('renderer', 'index.html');
  const html = fs.readFileSync(path.join(ROOT, shell), 'utf8');
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
    .filter((s) => !/^https?:/.test(s));
  assert.ok(srcs.length >= 20, `only found ${srcs.length} script tags — the extraction broke`);

  const bad = [];
  for (const s of srcs) {
    const abs = path.join(ROOT, 'renderer', s);
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (!fs.existsSync(abs)) bad.push(`${s} — no such file`);
    else if (!isPackaged(rel)) bad.push(`${s} — resolves to ${rel}, which build.files excludes`);
  }
  assert.deepEqual(bad, []);
});

test('the entry point named in package.json is itself packaged', () => {
  // The one file whose absence needs no require to bite.
  const entry = pkg.main || 'index.js';
  assert.ok(fs.existsSync(path.join(ROOT, entry)), `package.json main is ${entry}, which does not exist`);
  assert.ok(isPackaged(entry), `package.json main is ${entry}, which build.files excludes`);
});

test('the check can actually see an excluded file', () => {
  // A guard that cannot fail is decoration. Feed the matcher the shapes it must
  // separate, using the real patterns from package.json.
  assert.equal(isPackaged('main.js'), true);
  assert.equal(isPackaged('lib/branch-summary.js'), true);
  assert.equal(isPackaged('lib/deep/nested/thing.js'), true);
  assert.equal(isPackaged('renderer/locales/ar.js'), true);

  // Real files in the repo that are deliberately NOT shipped — if any of these
  // ever start matching, build.files has been widened too far.
  assert.equal(isPackaged('scripts/verify-release.mjs'), false);
  assert.equal(isPackaged('test/packaged-files.test.js'), false);
  assert.equal(isPackaged('privacy.html'), false);
  assert.equal(isPackaged('docs/RELEASE-HOLD.md'), false);
});
