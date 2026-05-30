const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  xmlToBase64,
  zatcaPhase2Ready,
  nextZatcaIcv,
  orderEligibleForZatcaSubmit,
  zatcaSubmitAccepted,
  appendZatcaSubmissionLog,
} = require('../lib/zatca-submit');

test('xmlToBase64 encodes UTF-8 XML', () => {
  const b64 = xmlToBase64('<?xml version="1.0"?><Invoice/>');
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), '<?xml version="1.0"?><Invoice/>');
});

test('zatcaPhase2Ready requires enable flag and CSID', () => {
  assert.equal(zatcaPhase2Ready({ enableZatca: true, zatcaPhase2: { enabled: true, csid: 'x' } }), true);
  assert.equal(zatcaPhase2Ready({ enableZatca: false, zatcaPhase2: { enabled: true, csid: 'x' } }), false);
  assert.equal(zatcaPhase2Ready({ enableZatca: true, zatcaPhase2: { enabled: true } }), false);
});

test('nextZatcaIcv reuses pending ICV on retry', () => {
  const z2 = { invoiceCounter: 5 };
  const order = { zatcaSubmission: { icv: 6 } };
  assert.equal(nextZatcaIcv(z2, order), 6);
  assert.equal(nextZatcaIcv(z2, {}), 6);
});

test('orderEligibleForZatcaSubmit accepts completed orders only', () => {
  assert.equal(orderEligibleForZatcaSubmit({ status: 'completed' }), true);
  assert.equal(orderEligibleForZatcaSubmit({ status: 'printing' }), false);
  assert.equal(orderEligibleForZatcaSubmit({ status: 'completed', voidedAt: 'x' }), false);
});

test('zatcaSubmitAccepted interprets validation status', () => {
  assert.equal(zatcaSubmitAccepted(true, { validationResults: { status: 'PASS' } }), true);
  assert.equal(zatcaSubmitAccepted(true, { validationResults: { status: 'REJECTED' } }), false);
  assert.equal(zatcaSubmitAccepted(false, {}), false);
});

test('appendZatcaSubmissionLog keeps newest 100 entries', () => {
  const z2 = { submissions: [] };
  for (let i = 0; i < 105; i++) appendZatcaSubmissionLog(z2, { orderId: `o${i}` });
  assert.equal(z2.submissions.length, 100);
  assert.equal(z2.submissions[0].orderId, 'o104');
});
