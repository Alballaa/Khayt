/**
 * Accounting-export wiring: orders -> invoice rows -> tested CSV core.
 * No DOM needed (ordersToInvoiceRows + buildInvoiceCsv are data functions).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('ordersToInvoiceRows maps non-quote orders; buildInvoiceCsv applies VAT split', () => {
  require('../renderer/format.js');
  require('../renderer/currency.js');
  const acct = require('../lib/accounting-export.js');
  const exp = require('../renderer/expenses.js');

  global.settings = { currency: 'SAR', enableVat: true, vatRate: 15 };
  global.clients = [{ id: 'c1', name: 'Acme' }];
  global.printLog = [
    { id: 'INV-1', status: 'completed', date: '2026-06-01', price: 115, clientId: 'c1' },
    { id: 'Q-1', status: 'quote', date: '2026-06-02', price: 50, clientId: 'c1' }, // excluded
    { id: 'Z-1', status: 'completed', date: '2026-06-03', price: 0, clientId: 'c1' }, // excluded (no price)
  ];

  const rows = exp.ordersToInvoiceRows();
  assert.equal(rows.length, 1, 'only non-quote priced orders become invoice rows');
  assert.equal(rows[0].id, 'INV-1');
  assert.equal(rows[0].clientName, 'Acme');
  assert.equal(rows[0].vatRate, 15);
  assert.equal(rows[0].currency, 'SAR');

  const csv = acct.buildInvoiceCsv(rows, { format: 'generic' });
  assert.ok(csv.includes('INV-1'), 'invoice id present');
  assert.ok(csv.includes('Acme'), 'customer present');
  assert.ok(csv.includes('100'), 'ex-VAT subtotal of 115 @15% = 100');
  assert.ok(csv.includes('15'), 'VAT amount present');
});

test('VAT disabled → vatRate 0 on rows', () => {
  require('../renderer/currency.js');
  const exp = require('../renderer/expenses.js');
  global.settings = { currency: 'SAR', enableVat: false };
  global.clients = [];
  global.printLog = [{ id: 'INV-2', status: 'delivered', date: '2026-06-01', price: 200, clientId: null }];
  const rows = exp.ordersToInvoiceRows();
  assert.equal(rows[0].vatRate, 0);
});
