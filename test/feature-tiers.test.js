/**
 * Feature tiers — the Simple/Pro single source of truth.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PRO_FEATURES, SIMPLE_CORE, isProMode, isFeatureEnabled, tierComparison } = require('../lib/feature-tiers.js');

test('isProMode: default + simple', () => {
  assert.equal(isProMode('professional'), true);
  assert.equal(isProMode(undefined), true); // default mode is professional
  assert.equal(isProMode('simple'), false);
});

test('isFeatureEnabled: Pro features gated by mode; core always on', () => {
  assert.equal(isFeatureEnabled('zatca', 'simple'), false);
  assert.equal(isFeatureEnabled('zatca', 'professional'), true);
  assert.equal(isFeatureEnabled('quote', 'simple'), true);   // core
  assert.equal(isFeatureEnabled('unknownFeature', 'simple'), true); // unknown = core
});

test('registries are non-empty and disjoint by key', () => {
  assert.ok(PRO_FEATURES.length >= 5 && SIMPLE_CORE.length >= 3);
  const proKeys = new Set(PRO_FEATURES.map((f) => f.key));
  assert.ok(!SIMPLE_CORE.some((f) => proKeys.has(f.key)), 'no key is both core and pro');
});

test('tierComparison returns localized labels (en/ar)', () => {
  const en = tierComparison('en');
  assert.equal(en.pro.length, PRO_FEATURES.length);
  assert.ok(en.pro[0].label.length > 0);
  const ar = tierComparison('ar');
  assert.notEqual(ar.pro[0].label, en.pro[0].label); // actually translated
});
