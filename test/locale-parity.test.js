'use strict';

// Guards against silent locale drift. `check-locale-files.js` only syntax-checks
// each bundle; this asserts key coverage. English is the source of truth.
//
// - Hard gate: Arabic must cover every English key. ar is the actively
//   maintained RTL locale, so a new English string without an ar translation
//   (which would silently fall back to English and break RTL) fails CI.
// - Soft signal: the other locales legitimately lag, so their missing-key
//   counts are reported in the test output instead of failing the build.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../renderer/locales');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
for (const f of files) require(path.join(dir, f));

const L = global.KhaytLocales || {};

test('all locale bundles load', () => {
  assert.ok(L.en, 'en bundle present');
  for (const code of ['ar', 'de', 'es', 'fr', 'ja', 'zh']) {
    assert.ok(L[code], `${code} bundle present`);
  }
});

test('Arabic covers every English key (RTL parity gate)', () => {
  const en = Object.keys(L.en);
  const ar = new Set(Object.keys(L.ar));
  const missing = en.filter((k) => !ar.has(k));
  assert.deepEqual(
    missing,
    [],
    `ar is missing ${missing.length} key(s) present in en: ${missing.slice(0, 20).join(', ')}`,
  );
});

test('locale coverage report (informational — does not fail)', () => {
  const en = new Set(Object.keys(L.en));
  for (const code of Object.keys(L).sort()) {
    if (code === 'en') continue;
    const keys = Object.keys(L[code]);
    const missing = [...en].filter((k) => !new Set(keys).has(k)).length;
    const orphans = keys.filter((k) => !en.has(k)).length;
    if (missing || orphans) {
      console.log(`  [locale-parity] ${code}: missingVsEn=${missing} orphans(notInEn)=${orphans}`);
    }
  }
  assert.ok(true);
});
