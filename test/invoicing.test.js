const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../renderer/format.js');
const { buildZatcaTLV, formatPrintDate, buildZatcaInvoiceXml, buildZatcaPhase2TLV } = require('../renderer/invoicing.js');

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

test('buildZatcaPhase2TLV encodes >255-byte value with 0x82 two-byte length', async () => {
  // No signing backend: skip tags 6–8, exercise tag-1 length encoding only.
  global.window = { hubAPI: { zatcaSignInvoice: async () => ({ ok: false }) } };
  const longName = 'A'.repeat(300); // 300 ASCII bytes → exceeds 255
  const b64 = await buildZatcaPhase2TLV({
    sellerName: longName,
    vatNumber: '300000000000003',
    timestamp: '2026-05-30T12:00:00Z',
    total: '115.00',
    vatAmount: '15.00',
    canonicalData: '',
  });
  const bytes = Buffer.from(b64, 'base64');
  // First field is tag 1 (seller name). With len=300 (>255) the header must be
  // [0x01, 0x82, 0x01, 0x2C] (300 = 0x012C) followed by the 300 value bytes.
  assert.equal(bytes[0], 0x01);
  assert.equal(bytes[1], 0x82);
  assert.equal(bytes[2], (300 >> 8) & 0xff); // 0x01
  assert.equal(bytes[3], 300 & 0xff);        // 0x2C
  assert.equal(bytes[4], 0x41);              // 'A'
  // Header (4) + value (300) for tag 1 alone.
  assert.ok(bytes.length >= 304);
  delete global.window;
});
