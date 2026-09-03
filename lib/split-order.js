'use strict';
/**
 * Dividing one job's money across the sub-orders it was split into.
 *
 * `splitOrderAcrossMachines` creates one sub-order per machine, each with a
 * proportional share of the price. Money already TAKEN has to travel with the
 * price it was taken against: every sub-order used to be created
 * `paidAmount: 0`, so a job with a deposit came out the other side owing its
 * full value again and the customer was invoiced for money they had paid.
 *
 * The arithmetic lives here rather than inside that DOM-heavy async function so
 * it can be driven directly — the rounding rule is the part worth testing, and a
 * test that re-implements it proves nothing about the code that ships.
 *
 * Pure: no DOM, no fs, no Electron.
 */
(function (global) {

  /**
   * Split `price`, `paid` and `credited` across groups weighted by `costs`.
   *
   * The LAST group takes the remainder of every running total, so the shares add
   * back up to exactly what the customer was charged and exactly what they paid.
   * Splitting SAR 1,000.03 three ways must not quietly become SAR 1,000.02.
   *
   * @param {{price:number, paid:number, credited:number, costs:number[]}} input
   * @returns {{price:number, paidAmount:number, credited:number}[]} one per group
   */
  function splitMoney({ price = 0, paid = 0, credited = 0, costs = [] } = {}) {
    const weights = costs.map((c) => (+c || 0));
    const total = weights.reduce((s, c) => s + c, 0);
    const n = weights.length;
    if (!n) return [];
    // Every part costed zero (or none of them carry a cost): split evenly rather
    // than putting the whole price on one arbitrary machine.
    const even = total <= 0;
    let priceLeft = +price || 0;
    let paidLeft = +paid || 0;
    let creditLeft = +credited || 0;
    const round = (v) => Math.round(v * 100) / 100;

    return weights.map((w, i) => {
      const isLast = i === n - 1;
      const frac = even ? 1 / n : w / total;
      const take = (remaining, whole) => (isLast ? round(remaining) : round(whole * frac));
      const p = take(priceLeft, +price || 0);
      const pd = take(paidLeft, +paid || 0);
      const cr = take(creditLeft, +credited || 0);
      priceLeft = round(priceLeft - p);
      paidLeft = round(paidLeft - pd);
      creditLeft = round(creditLeft - cr);
      return { price: p, paidAmount: pd, credited: cr };
    });
  }

  /**
   * What a sub-order's payment status must be.
   *
   * payStatus() derives this whenever price > 0, but falls back to the STORED
   * field at price 0 — so a costless part handed 'unpaid' would sit in
   * receivables forever, and one handed nothing at all would read as paid.
   */
  function paymentStatusFor(price, paid) {
    const owed = +price || 0;
    const got = +paid || 0;
    if (owed <= 0) return got > 0 ? 'paid' : 'unpaid';
    if (got <= 0) return 'unpaid';
    return got >= owed ? 'paid' : 'partial';
  }

  const api = { splitMoney, paymentStatusFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytSplitOrder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
