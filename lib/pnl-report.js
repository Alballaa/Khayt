/**
 * P&L summary — turn a period's orders + expenses into an income-statement
 * summary and a spreadsheet-ready CSV. Pure (no DOM / no currency lookups) so
 * it is unit-testable; the renderer scopes the data to the selected analytics
 * date range, converts to base currency, then hands plain numbers in here.
 */
(function (global) {
  const round2 = (n) => Math.round((+n || 0) * 100) / 100;

  /**
   * @param {object} input
   * @param {Array<{revenue:number, cogs:number, vat?:number}>} input.orders base-currency per order
   * @param {Array<{amount:number, category?:string}>} input.expenses base-currency
   * @param {string} [input.label] period label (e.g. "This month")
   * @returns {object} summary with totals + expenses grouped by category
   */
  function computePnl(input) {
    input = input || {};
    const orders = Array.isArray(input.orders) ? input.orders : [];
    const expenses = Array.isArray(input.expenses) ? input.expenses : [];

    let revenue = 0, cogs = 0, vatCollected = 0;
    for (const o of orders) {
      revenue += +o.revenue || 0;
      cogs += +o.cogs || 0;
      vatCollected += +o.vat || 0;
    }
    const byCat = {};
    let expensesTotal = 0;
    for (const e of expenses) {
      const amt = +e.amount || 0;
      const cat = (e.category && String(e.category).trim()) || 'Uncategorized';
      byCat[cat] = (byCat[cat] || 0) + amt;
      expensesTotal += amt;
    }
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - expensesTotal;
    return {
      label: input.label || '',
      orderCount: orders.length,
      revenue: round2(revenue),
      cogs: round2(cogs),
      grossProfit: round2(grossProfit),
      grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
      expensesTotal: round2(expensesTotal),
      expensesByCategory: Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])
        .map((category) => ({ category, amount: round2(byCat[category]) })),
      vatCollected: round2(vatCollected),
      netProfit: round2(netProfit),
    };
  }

  // Spreadsheet-safe cell: quoted + quote-escaped. Numbers pass through as-is
  // (a leading "-" is a real value); only text gets formula-neutralized.
  function cell(v) {
    if (typeof v === 'number') return '"' + v + '"';
    const s = v == null ? '' : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return '"' + safe.replace(/"/g, '""') + '"';
  }

  /** Render a computed summary to a two-column CSV (Item, Amount). */
  function pnlToCsv(summary, opts) {
    opts = opts || {};
    const cur = opts.currency || '';
    const L = opts.labels || {};
    const lab = (k, d) => L[k] || d;
    const amtHeader = cur ? `${lab('amount', 'Amount')} (${cur})` : lab('amount', 'Amount');
    const rows = [
      [lab('title', 'P&L summary'), summary.label || ''],
      [lab('item', 'Item'), amtHeader],
      [lab('orders', 'Orders'), summary.orderCount],
      [lab('revenue', 'Revenue'), summary.revenue],
      [lab('cogs', 'Cost of goods sold'), -summary.cogs],
      [lab('gross', 'Gross profit'), summary.grossProfit],
      [lab('gross_margin', 'Gross margin %'), summary.grossMargin],
      ['', ''],
      [lab('opex', 'Operating expenses'), -summary.expensesTotal],
    ];
    for (const e of summary.expensesByCategory) rows.push(['  ' + e.category, -e.amount]);
    rows.push(['', '']);
    rows.push([lab('vat', 'VAT collected'), summary.vatCollected]);
    rows.push([lab('net', 'Net profit'), summary.netProfit]);
    return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  const api = { computePnl, pnlToCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.KhaytPnl = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
