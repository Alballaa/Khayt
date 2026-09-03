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

  /**
   * Push a superseded parent's recorded payments down onto its children.
   *
   * A job split BEFORE the deposit fix left every sub-order at `paidAmount: 0`
   * with the money recorded on the parent. Excluding that parent from what is
   * owed — correct, its children carry the debt — then credited the deposit to
   * NOTHING, so a SAR 3,000 job with SAR 1,000 paid read as SAR 3,000
   * outstanding instead of SAR 2,000. Better than the SAR 5,000 it used to
   * report, and still money the shop would chase a customer for.
   *
   * Idempotent by an explicit marker, not by inspection: `depositSplitAt` on the
   * parent. A shop may legitimately have paid one sub-order by hand since, and
   * "no child has been paid" would then be false for a parent that still needs
   * migrating — while running twice would credit the deposit twice, which is the
   * direction that costs the shop money.
   *
   * Refuses in every uncertain case. A parent whose children are missing, or
   * whose children's prices do not add up to a positive total, is left exactly
   * as it is: an unmigrated deposit is a figure someone can still find, and a
   * wrongly split one is not.
   *
   * @param {object[]} orders the whole print log, mutated in place
   * @returns {{migrated: number, moved: number}} parents fixed, and money moved
   */
  function migrateSplitDeposits(orders) {
    if (!Array.isArray(orders)) return { migrated: 0, moved: 0 };
    const byId = new Map(orders.filter((o) => o && typeof o.id === 'string').map((o) => [o.id, o]));
    let migrated = 0;
    let moved = 0;

    for (const parent of orders) {
      if (!parent || typeof parent !== 'object') continue;
      if (parent.depositSplitAt) continue;                       // already done
      if (parent.status !== 'split' || !Array.isArray(parent.splitInto) || !parent.splitInto.length) continue;

      const paid = +parent.paidAmount || 0;
      const credited = (parent.creditNotes || []).reduce((sum, c) => sum + (+c.amount || 0), 0);
      if (paid <= 0 && credited <= 0) continue;                  // nothing to move

      const children = parent.splitInto.map((id) => byId.get(id)).filter(Boolean);
      if (children.length !== parent.splitInto.length) continue; // a child is gone: leave it alone
      const total = children.reduce((sum, c) => sum + (+c.price || 0), 0);
      if (!(total > 0)) continue;                                // nothing to weigh the shares by

      const shares = splitMoney({ price: 0, paid, credited, costs: children.map((c) => +c.price || 0) });
      children.forEach((child, i) => {
        const share = shares[i];
        if (share.paidAmount > 0) {
          child.paidAmount = Math.round(((+child.paidAmount || 0) + share.paidAmount) * 100) / 100;
          child.paymentStatus = paymentStatusFor(+child.price || 0, child.paidAmount);
        }
        if (share.credited > 0) {
          child.creditNotes = [...(child.creditNotes || []),
            { id: `CN-SPLIT-${parent.id}-${i}`, amount: share.credited, at: new Date().toISOString(),
              reason: `Carried from ${parent.id}` }];
        }
      });
      parent.depositSplitAt = new Date().toISOString();
      migrated += 1;
      moved += paid + credited;
    }
    return { migrated, moved: Math.round(moved * 100) / 100 };
  }

  const api = { splitMoney, paymentStatusFor, migrateSplitDeposits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytSplitOrder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
