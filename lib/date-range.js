'use strict';
/**
 * Which records fall in a period — "this month", "last quarter", a custom span.
 *
 * Every list in Khayt that has a range picker filtered through one function in
 * the renderer, `inRange`, which read the clock and two page-level globals for
 * the custom span. Lifted so the Mac app's Expenses, Waste and Reports screens
 * answer "this month" the same way — the same string-slicing rule, the same
 * local calendar, the same treatment of an unparseable date.
 *
 * PURE: the clock and the custom span are passed in. Dates are compared as
 * `YYYY-MM-DD` strings on purpose: a record's date is written in the shop's
 * local time, and comparing it as a Date would shift it by a day at either end
 * of the month for any shop not on UTC.
 */
(function (global) {

  const RANGES = ['all', 'month', 'last_month', 'quarter', 'last_quarter', 'year', 'custom'];

  const pad = (n) => String(n).padStart(2, '0');
  /** A Date as the shop writes a day: `YYYY-MM-DD`, in local time. */
  function localDay(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  /** `YYYY-MM`, in local time. */
  function localMonth(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  /**
   * @param {string} dateStr   the record's date, `YYYY-MM-DD` or an ISO stamp
   * @param {string} range     one of RANGES
   * @param {object} [ctx]     `{ now: Date, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`
   */
  function inRange(dateStr, range, ctx) {
    if (!range || range === 'all') return true;
    if (!dateStr) return false;
    if (isNaN(new Date(dateStr))) return false;
    const c = ctx || {};
    if (range === 'custom') {
      const from = c.from || '';
      const to = c.to || '';
      if (!from && !to) return true;
      const ds = String(dateStr).slice(0, 10);
      if (from && ds < from) return false;
      if (to && ds > to) return false;
      return true;
    }
    const now = c.now instanceof Date ? c.now : new Date();
    const nowY = now.getFullYear();
    const nowM = now.getMonth();
    const ds = String(dateStr).slice(0, 10);
    if (range === 'month') return ds.slice(0, 7) === `${nowY}-${pad(nowM + 1)}`;
    if (range === 'last_month') {
      const lm = new Date(nowY, nowM - 1, 1);
      return ds.slice(0, 7) === `${lm.getFullYear()}-${pad(lm.getMonth() + 1)}`;
    }
    if (range === 'quarter') {
      const nowQ = Math.floor(nowM / 3);
      const dsMonth = parseInt(ds.slice(5, 7), 10) - 1;
      const dsYear = parseInt(ds.slice(0, 4), 10);
      return dsYear === nowY && Math.floor(dsMonth / 3) === nowQ;
    }
    if (range === 'last_quarter') {
      const lastQEnd = new Date(nowY, nowM - (nowM % 3), 0);
      const lastQStart = new Date(lastQEnd.getFullYear(), Math.floor(lastQEnd.getMonth() / 3) * 3, 1);
      const fromStr = localDay(lastQStart);
      const toStr = localDay(lastQEnd);
      return ds >= fromStr && ds <= toStr;
    }
    if (range === 'year') return ds.slice(0, 4) === String(nowY);
    return true;
  }

  const api = { RANGES, inRange, localDay, localMonth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytDateRange = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
