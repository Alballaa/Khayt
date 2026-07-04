/**
 * Feature tiers — the Enthusiast/Simple/Professional single source of truth.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  PRO_FEATURES, SIMPLE_CORE, BUSINESS_FEATURES,
  isProMode, isEnthusiast, showsBusiness, isFeatureEnabled, tierComparison,
} = require('../lib/feature-tiers.js');

test('isProMode: professional only (simple + enthusiast are not pro)', () => {
  assert.equal(isProMode('professional'), true);
  assert.equal(isProMode(undefined), true); // default mode is professional
  assert.equal(isProMode('simple'), false);
  assert.equal(isProMode('enthusiast'), false);
});

test('isEnthusiast + showsBusiness', () => {
  assert.equal(isEnthusiast('enthusiast'), true);
  assert.equal(isEnthusiast('simple'), false);
  assert.equal(showsBusiness('enthusiast'), false);
  assert.equal(showsBusiness('simple'), true);
  assert.equal(showsBusiness('professional'), true);
  assert.equal(showsBusiness(undefined), true);
});

test('isFeatureEnabled: pro gated by mode, business gated by enthusiast, core always on', () => {
  assert.equal(isFeatureEnabled('zatca', 'simple'), false);       // pro
  assert.equal(isFeatureEnabled('zatca', 'professional'), true);
  assert.equal(isFeatureEnabled('clients', 'simple'), true);      // business — on in simple
  assert.equal(isFeatureEnabled('clients', 'enthusiast'), false); // business — hidden for enthusiast
  assert.equal(isFeatureEnabled('quote', 'enthusiast'), true);    // core
  assert.equal(isFeatureEnabled('printFiles', 'enthusiast'), true); // core (personal library)
  assert.equal(isFeatureEnabled('colorMix', 'enthusiast'), true);   // core (colour mixer)
  assert.equal(isFeatureEnabled('unknownFeature', 'enthusiast'), true); // unknown = core
});

test('colorMix is a personal-core feature (present in SIMPLE_CORE, on in every mode)', () => {
  assert.ok(SIMPLE_CORE.some((f) => f.key === 'colorMix'), 'colorMix is core');
  assert.equal(isFeatureEnabled('colorMix', 'simple'), true);
  assert.equal(isFeatureEnabled('colorMix', 'professional'), true);
});

test('registries are non-empty and disjoint by key', () => {
  assert.ok(PRO_FEATURES.length >= 5 && SIMPLE_CORE.length >= 3 && BUSINESS_FEATURES.length >= 3);
  const proKeys = new Set(PRO_FEATURES.map((f) => f.key));
  const bizKeys = new Set(BUSINESS_FEATURES.map((f) => f.key));
  assert.ok(!SIMPLE_CORE.some((f) => proKeys.has(f.key) || bizKeys.has(f.key)), 'core keys are distinct');
  assert.ok(!BUSINESS_FEATURES.some((f) => proKeys.has(f.key)), 'business keys are not pro');
});

test('tierComparison returns three localized columns (en/ar)', () => {
  const en = tierComparison('en');
  assert.equal(en.enthusiast.length, SIMPLE_CORE.length);
  assert.equal(en.simple.length, BUSINESS_FEATURES.length);
  assert.equal(en.pro.length, PRO_FEATURES.length);
  assert.ok(en.pro[0].label.length > 0);
  const ar = tierComparison('ar');
  assert.notEqual(ar.pro[0].label, en.pro[0].label); // actually translated
});
