/**
 * A cross-file call into an IIFE-private function is a silent no-op.
 *
 * Renderer modules are `(function (global) { … })(globalThis)` and publish a
 * hand-maintained `api` object. The convention for calling into another module
 * is `if (typeof someFn === 'function') someFn(...)` — which reads like a
 * defensive guard but is really the wiring. If the callee was never added to its
 * file's export list, that guard is permanently false and the call silently does
 * nothing. Nothing throws, nothing logs, no test fails.
 *
 * That is not hypothetical. When this check was first written it found five:
 *
 *   sha256Hex          app-security.js could not verify a legacy 64-hex PIN
 *                      hash — the branch was skipped and the function fell
 *                      through to `return false`, locking the operator out
 *   sanitizePrintHtml  inventory.js printed labels using its raw-HTML fallback
 *   fireQcWebhook      qc_failed and rma_opened webhooks never fired
 *   deliverWebhook     operations-extras.js never delivered through that path
 *   isSecretMasked     online.js showed a masked PIN as though it were real
 *
 * test/settings-exports.test.js covers the same failure for one file and one
 * naming convention (render*Settings). This covers the whole renderer.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'renderer');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.js'));
const SRC = new Map(FILES.map((f) => [f, fs.readFileSync(path.join(DIR, f), 'utf8')]));

/** Names invoked behind `typeof NAME === 'function'` — the cross-module call convention. */
function guardedCalls() {
  const used = new Map(); // name -> Set(files that call it)
  for (const [f, s] of SRC) {
    for (const m of s.matchAll(/typeof\s+([A-Za-z_]\w*)\s*===\s*['"]function['"]/g)) {
      if (!used.has(m[1])) used.set(m[1], new Set());
      used.get(m[1]).add(f);
    }
  }
  return used;
}

/** Top-level `function NAME(` declarations, per file. */
function declarations() {
  const decl = new Map(); // name -> [files]
  for (const [f, s] of SRC) {
    for (const m of s.matchAll(/^\s*(?:async )?function ([A-Za-z_]\w*)\s*\(/gm)) {
      if (!decl.has(m[1])) decl.set(m[1], []);
      decl.get(m[1]).push(f);
    }
  }
  return decl;
}

const isWrapped = (f) => /^\s*\(function\s*\(/m.test(SRC.get(f));

/**
 * Every name a file makes globally reachable, by any mechanism used in this
 * codebase. Missing one of these produces false positives, which is worse than
 * no check at all — a noisy guard gets deleted.
 */
function exportedBy(f) {
  const s = SRC.get(f);
  const out = new Set();
  // global.X = / window.X =
  for (const m of s.matchAll(/(?:global|window)\.([A-Za-z_]\w*)\s*=/g)) out.add(m[1]);
  // Object.assign(global, { a, b })
  for (const m of s.matchAll(/Object\.assign\((?:global|window)\s*,\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.split(':')[0].trim();
      if (/^\w+$/.test(n)) out.add(n);
    }
  }
  // const api = { … } / const pub = { … }, however they are laid out. Take the
  // whole file tail from the declaration so nested braces cannot truncate it.
  for (const m of s.matchAll(/const (?:api|pub)\s*=\s*\{/g)) {
    // Start AFTER the opening brace: including `const api = {` makes the first
    // entry of a single-line literal parse as "const api = { printOrderLabels"
    // and vanish, which is how this check first reported a false positive.
    const from = m.index + m[0].length;
    const assign = s.indexOf('Object.assign', from);
    for (const line of s.slice(from, assign === -1 ? undefined : assign).split(/[,\n]/)) {
      const n = line.split(':')[0].replace(/[{}();]/g, '').trim();
      if (/^\w+$/.test(n)) out.add(n);
    }
  }
  return out;
}

test('every cross-file typeof-guarded call reaches a function that is actually exported', () => {
  const used = guardedCalls();
  const decl = declarations();
  const unreachable = [];
  let checked = 0;

  for (const [name, callers] of used) {
    const where = decl.get(name);
    if (!where) continue;               // not declared in renderer/ — nothing to check
    for (const file of where) {
      if (!isWrapped(file)) continue;   // not IIFE-wrapped: a top-level declaration is global
      const external = [...callers].filter((c) => c !== file);
      if (!external.length) continue;   // only called from its own file
      checked++;
      if (!exportedBy(file).has(name)) {
        unreachable.push(`${name} (declared in ${file}, called from ${external.sort().join(', ')})`);
      }
    }
  }

  assert.ok(checked > 20, `expected many cross-file guarded calls, found ${checked}`);
  assert.deepEqual(unreachable.sort(), [],
    `these calls can never fire — the callee is private to its IIFE:\n  ${unreachable.sort().join('\n  ')}`);
});

test('the check can actually see the export mechanisms in use', () => {
  // Guards the guard. If exportedBy() silently stopped recognising a style, the
  // test above would still pass on an empty set of suspects only because
  // everything looked unreachable — or, worse, quietly flag nothing at all.
  const known = [
    ['app-state.js', 'saveAll'],            // multi-line const api
    ['tour.js', 'startTour'],               // Object.assign(global, { … })
    ['labels.js', 'printOrderLabels'],      // single-line const api
    ['color-planner.js', 'openColorPlanner'], // const pub
  ];
  for (const [file, name] of known) {
    if (!SRC.has(file)) continue;
    assert.ok(exportedBy(file).has(name), `${name} should be seen as exported from ${file}`);
  }
});
