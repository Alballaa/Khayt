'use strict';

/** Resolve GAZT VAT return period to inclusive YYYY-MM-DD bounds. */
function vatReturnPeriodBounds(period, year, now = new Date()) {
  const y = Number.isInteger(year) ? year : now.getFullYear();
  if (period === 'q1') return { fromDate: `${y}-01-01`, toDate: `${y}-03-31` };
  if (period === 'q2') return { fromDate: `${y}-04-01`, toDate: `${y}-06-30` };
  if (period === 'q3') return { fromDate: `${y}-07-01`, toDate: `${y}-09-30` };
  if (period === 'q4') return { fromDate: `${y}-10-01`, toDate: `${y}-12-31` };
  return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
}

/**
 * Compute GAZT-style VAT return boxes from plain order/expense rows.
 * Orders should include { date, status, revenue, vatRate, vatAmount }.
 * Expenses should include { date, amount, vatAmount }.
 */
function computeVatReturnBoxes(periodOrders, periodExpenses) {
  const completed = (periodOrders || []).filter(o => o.status === 'completed');
  const box1 = completed.reduce((s, o) => s + (+o.revenue || 0), 0);
  const box2 = completed.filter(o => +o.vatRate === 0).reduce((s, o) => s + (+o.revenue || 0), 0);
  const box3 = completed.reduce((s, o) => s + (+o.vatAmount || 0), 0);
  const expenses = periodExpenses || [];
  const box6 = expenses.reduce((s, e) => s + (+e.amount || 0), 0);
  const box7 = expenses.filter(e => +e.vatAmount > 0).reduce((s, e) => s + (+e.vatAmount || 0), 0);
  return {
    box1, box2, box3, box6, box7,
    netVat: box3 - box7,
  };
}

module.exports = {
  vatReturnPeriodBounds,
  computeVatReturnBoxes,
};
