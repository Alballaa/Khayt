const { test } = require('node:test');
const assert = require('node:assert/strict');

test('KhaytAppExports exports document helpers', () => {
  const exp = require('../renderer/app-exports.js');
  assert.equal(typeof exp.exportQuoteApprovalPage, 'function');
  assert.equal(typeof exp.generateWorkOrder, 'function');
  assert.equal(typeof exp.maybeAutoBackup, 'function');
});

test('KhaytAppBoot exports initWizard', () => {
  const boot = require('../renderer/app-boot.js');
  assert.equal(typeof boot.initWizard, 'function');
});
