'use strict';
/**
 * The Mac app's bundled logic must be `lib/` byte for byte.
 *
 * The native Mac app does not reimplement Khayt's business logic. It runs the
 * same modules in JavaScriptCore, so the tax engine, the pricing, the payment
 * plans and the split-order money are the code this suite already covers —
 * corrections from twenty-two review passes included.
 *
 * SPM resources have to live inside the package, so `mac/KhaytCore/.../JS/`
 * holds copies. A copy is a fork waiting to happen: `lib/` gets a fix, the copy
 * does not, and the Mac app quietly computes last month's VAT. Both would run.
 * Both would return a number.
 *
 * mac/KhaytCore has its own Swift test asserting the same thing AND that the two
 * engines produce identical values — but that needs macOS, and every job here
 * runs on Linux. A macOS runner bills at 10x, which is a decision rather than a
 * detail, so the free half of the guard lives here: the bytes must match. The
 * expensive half runs on a Mac.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'mac/KhaytCore/Sources/KhaytCore/JS');
const ENGINE = path.join(ROOT, 'mac/KhaytCore/Sources/KhaytCore/KhaytEngine.swift');

/** The module list, read out of the Swift source rather than kept twice. */
function declaredModules() {
  const src = fs.readFileSync(ENGINE, 'utf8');
  const at = src.indexOf('static let modules = [');
  assert.ok(at > 0, 'KhaytEngine.modules is gone');
  const block = src.slice(at, src.indexOf(']', at));
  return [...block.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
}

test('every module the Mac app bundles is identical to lib/', () => {
  for (const m of declaredModules()) {
    const original = fs.readFileSync(path.join(ROOT, 'lib', `${m}.js`));
    const copy = fs.readFileSync(path.join(JS_DIR, `${m}.js`));
    assert.ok(original.equals(copy),
      `mac/…/JS/${m}.js has drifted from lib/${m}.js — the Mac app would compute `
      + 'different numbers from the Electron app. Run mac/sync-js.sh; do not edit the copy.');
  }
});

test('the Swift list and the bundled folder agree', () => {
  const onDisk = fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(onDisk, declaredModules().sort(),
    'a bundled file nobody loads is dead weight; a listed module with no file fails at startup');
});

test('nothing the Mac app bundles needs Node', () => {
  // JavaScriptCore has no `require`, no `fs`, no `process`. A module that grew
  // one of those in lib/ would load here and throw at its first call — from
  // inside a screen, with no clue why.
  for (const m of declaredModules()) {
    const src = fs.readFileSync(path.join(ROOT, 'lib', `${m}.js`), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const forbidden of ["require('fs')", "require('path')", "require('crypto')", 'process.']) {
      assert.ok(!src.includes(forbidden),
        `lib/${m}.js now uses ${forbidden}, which does not exist in JavaScriptCore — `
        + 'either drop it or take the module off KhaytEngine.modules');
    }
  }
});

test('sync-js.sh exists and reads the same list', () => {
  // The fix for a drift failure. If it kept its own copy of the module list, it
  // would sync the wrong set and the guard above would stay red.
  const sh = fs.readFileSync(path.join(ROOT, 'mac/sync-js.sh'), 'utf8');
  assert.match(sh, /KhaytEngine\.swift/, 'sync-js.sh keeps its own module list instead of reading the Swift one');
});
