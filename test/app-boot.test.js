const { test } = require('node:test');
const assert = require('node:assert/strict');

test('KhaytAppBoot exports initWizard', () => {
  const boot = require('../renderer/app-boot.js');
  assert.equal(typeof boot.initWizard, 'function');
});
