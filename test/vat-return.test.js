const { test } = require('node:test');
const assert = require('node:assert/strict');
const { vatReturnPeriodBounds, computeVatReturnBoxes } = require('../lib/vat-return');

test('vatReturnPeriodBounds resolves quarters', () => {
  assert.deepEqual(vatReturnPeriodBounds('q1', 2026), { fromDate: '2026-01-01', toDate: '2026-03-31' });
  assert.deepEqual(vatReturnPeriodBounds('year', 2026), { fromDate: '2026-01-01', toDate: '2026-12-31' });
});

test('computeVatReturnBoxes sums sales and input VAT', () => {
  const boxes = computeVatReturnBoxes(
    [
      { status: 'completed', revenue: 1000, vatRate: 15, vatAmount: 150 },
      { status: 'completed', revenue: 200, vatRate: 0, vatAmount: 0 },
      { status: 'pending', revenue: 500, vatRate: 15, vatAmount: 75 },
    ],
    [{ amount: 300, vatAmount: 45 }]
  );
  assert.equal(boxes.box1, 1200);
  assert.equal(boxes.box2, 200);
  assert.equal(boxes.box3, 150);
  assert.equal(boxes.box6, 300);
  assert.equal(boxes.box7, 45);
  assert.equal(boxes.netVat, 105);
});
