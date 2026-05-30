'use strict';

/** Base64-encode UTF-8 XML for ZATCA API payload. */
function xmlToBase64(xml) {
  return Buffer.from(String(xml || ''), 'utf8').toString('base64');
}

/** Whether Phase 2 submission prerequisites are met. */
function zatcaPhase2Ready(settings) {
  const z2 = settings?.zatcaPhase2;
  return !!(settings?.enableZatca && z2?.enabled && (z2.pcsid || z2.csid));
}

/** Next invoice counter value for a new submission (reuse pending ICV on retry). */
function nextZatcaIcv(z2, order) {
  if (order?.zatcaSubmission?.icv) return order.zatcaSubmission.icv;
  return (z2?.invoiceCounter || 0) + 1;
}

/** True when order is eligible for ZATCA reporting. */
function orderEligibleForZatcaSubmit(order) {
  if (!order || order.voidedAt) return false;
  return order.status === 'completed' || order.status === 'delivered';
}

/** Interpret Fatoorah HTTP response as accepted/rejected. */
function zatcaSubmitAccepted(httpOk, body) {
  if (!httpOk) return false;
  const status = body?.validationResults?.status || body?.reportingStatus || body?.clearanceStatus;
  if (status && String(status).toUpperCase() === 'REJECTED') return false;
  return true;
}

/** Build submission log entry (trimmed for store). */
function buildZatcaLogEntry({ order, payload, result, manual, status, message }) {
  return {
    orderId: order.id,
    invoiceNumber: payload.invoiceNumber,
    uuid: payload.uuid,
    icv: payload.invoiceCounter,
    at: new Date().toISOString(),
    status,
    httpStatus: result?.status ?? null,
    message: message || '',
    manual: !!manual,
  };
}

function appendZatcaSubmissionLog(z2, entry) {
  const log = Array.isArray(z2.submissions) ? [...z2.submissions] : [];
  log.unshift(entry);
  z2.submissions = log.slice(0, 100);
}

module.exports = {
  xmlToBase64,
  zatcaPhase2Ready,
  nextZatcaIcv,
  orderEligibleForZatcaSubmit,
  zatcaSubmitAccepted,
  buildZatcaLogEntry,
  appendZatcaSubmissionLog,
};
