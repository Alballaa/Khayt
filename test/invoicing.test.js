const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../renderer/format.js');
const { buildZatcaTLV, formatPrintDate, buildZatcaInvoiceXml } = require('../renderer/invoicing.js');

test('buildZatcaTLV returns base64 payload', () => {
  const b64 = buildZatcaTLV({
    sellerName: 'Khayt Shop',
    vatNumber: '300000000000003',
    timestamp: '2026-05-30T12:00:00Z',
    total: '115.00',
    vatAmount: '15.00',
  });
  assert.match(b64, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(Buffer.from(b64, 'base64').length > 20);
});

test('buildZatcaInvoiceXml includes invoice id', () => {
  const xml = buildZatcaInvoiceXml({
    invoiceNumber: 'INV-2026-0001',
    uuid: 'uuid-1',
    issueDate: '2026-05-30',
    issueTime: '12:00:00',
    sellerName: 'Shop',
    sellerStreet: 'Street',
    sellerCity: 'Riyadh',
    vatNumber: '300000000000003',
    buyerName: 'Buyer',
    total: 115,
    subtotal: 100,
    vatAmount: 15,
    vatRate: 15,
    itemName: 'Print job',
    invoiceCounter: 1,
    pih: 'hash',
  });
  assert.match(xml, /<cbc:ID>INV-2026-0001<\/cbc:ID>/);
});

test('formatPrintDate formats ISO date', () => {
  assert.match(formatPrintDate('2026-05-30'), /2026/);
  assert.equal(formatPrintDate(''), '');
});

test('buildZatcaTLV handles long seller names', () => {
  const longName = 'A'.repeat(140);
  const b64 = buildZatcaTLV({
    sellerName: longName,
    vatNumber: '300000000000003',
    timestamp: '2026-05-30T12:00:00Z',
    total: '115.00',
    vatAmount: '15.00',
  });
  const bytes = Buffer.from(b64, 'base64');
  assert.ok(bytes.length > 140);
});
