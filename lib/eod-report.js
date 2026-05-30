'use strict';

function dateStartsWith(isoOrDate, dayStr) {
  return String(isoOrDate || '').startsWith(dayStr);
}

/**
 * Compute end-of-day shop metrics for a calendar day (YYYY-MM-DD).
 * @param {{ printLog?: object[], wasteLog?: object[], timeEntries?: object[], today: string }} input
 */
function computeEodMetrics({ printLog = [], wasteLog = [], timeEntries = [], today }) {
  const completedToday = printLog.filter(o =>
    o.status === 'completed' && dateStartsWith(o.completedAt || o.date, today)
  );
  const deliveredToday = printLog.filter(o => dateStartsWith(o.deliveredAt, today));
  const revenueToday = completedToday.reduce((s, o) => s + (+o.revenue || +o.price || 0), 0);
  const paymentsToday = printLog.filter(o =>
    dateStartsWith(o.paidAt || o.paymentReceivedAt, today) && (+o.paidAmount || 0) > 0
  );
  const paymentsTotal = paymentsToday.reduce((s, o) => s + (+o.paidAmount || 0), 0);
  const inProgress = printLog.filter(o => ['pending', 'printing', 'post', 'qc'].includes(o.status));
  const wasteToday = wasteLog.filter(w => dateStartsWith(w.date, today));
  const wasteTotalG = wasteToday.reduce((s, w) => s + (+w.weight || 0), 0);
  const timeToday = timeEntries.filter(te => dateStartsWith(te.date || te.startedAt, today));
  const timeTotalMins = timeToday.reduce((s, te) => s + (+te.durationMins || 0), 0);
  const overdueOrders = printLog.filter(o =>
    o.dueDate === today && o.status !== 'completed' && o.status !== 'quote' && o.status !== 'delivered'
  );

  return {
    completedCount: completedToday.length,
    deliveredCount: deliveredToday.length,
    revenueToday,
    paymentsCount: paymentsToday.length,
    paymentsTotal,
    inProgressCount: inProgress.length,
    wasteTotalG,
    timeTotalMins,
    overdueOrders: overdueOrders.map(o => ({ id: o.id, project: o.project })),
  };
}

/** Build CSV rows for EOD export. */
function eodMetricsToCsv(metrics, today) {
  const lines = [
    'Metric,Value',
    `Date,${today}`,
    `Orders Completed,${metrics.completedCount}`,
    `Orders Delivered,${metrics.deliveredCount}`,
    `Revenue,${metrics.revenueToday}`,
    `Payments Received,${metrics.paymentsTotal}`,
    `In Progress,${metrics.inProgressCount}`,
    `Filament Used (g),${metrics.wasteTotalG}`,
    `Time Logged (min),${metrics.timeTotalMins}`,
  ];
  if (metrics.overdueOrders.length) {
    lines.push('Overdue (due today not completed),');
    metrics.overdueOrders.forEach(o => {
      lines.push(`,"${String(o.project || o.id).replace(/"/g, '""')}"`);
    });
  }
  return lines.join('\n');
}

module.exports = {
  computeEodMetrics,
  eodMetricsToCsv,
};
