const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeEodMetrics, eodMetricsToCsv } = require('../lib/eod-report');

test('computeEodMetrics aggregates daily shop stats', () => {
  const m = computeEodMetrics({
    today: '2026-05-30',
    printLog: [
      { id: '1', status: 'completed', completedAt: '2026-05-30T10:00:00Z', price: 100, revenue: 100 },
      { id: '2', status: 'completed', deliveredAt: '2026-05-30T12:00:00Z' },
      { id: '3', status: 'printing', dueDate: '2026-05-30' },
      { id: '4', status: 'pending', dueDate: '2026-05-30' },
    ],
    wasteLog: [{ date: '2026-05-30', weight: 50 }],
    timeEntries: [{ date: '2026-05-30', durationMins: 90 }],
  });
  assert.equal(m.completedCount, 1);
  assert.equal(m.deliveredCount, 1);
  assert.equal(m.revenueToday, 100);
  assert.equal(m.inProgressCount, 2);
  assert.equal(m.wasteTotalG, 50);
  assert.equal(m.timeTotalMins, 90);
  assert.equal(m.overdueOrders.length, 2);
});

test('eodMetricsToCsv includes header rows', () => {
  const csv = eodMetricsToCsv({
    completedCount: 2,
    deliveredCount: 1,
    revenueToday: 500,
    paymentsTotal: 200,
    inProgressCount: 3,
    wasteTotalG: 10,
    timeTotalMins: 60,
    overdueOrders: [],
  }, '2026-05-30');
  assert.match(csv, /Orders Completed,2/);
  assert.match(csv, /Date,2026-05-30/);
});
