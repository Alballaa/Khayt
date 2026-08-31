'use strict';
/**
 * Prints that happened, but were not business.
 *
 * A workshop prints things that are not jobs: a calibration cube, a bracket for
 * its own shelf, a gift, a test of a new filament. They ran on the machine and
 * they used the material, and counting them as trade makes a shop's own numbers
 * lie to it — an average order value dragged down by a run of free test prints
 * is worse than no average at all.
 *
 * Asked for directly: "is there an option to select a print as not applicable
 * for the business?" There was not.
 *
 * ── WHAT THE FLAG DOES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────
 *
 * It is scoped to MONEY AND TRADE COUNTS, and to nothing else, because the
 * print was real:
 *
 *   OUT of revenue, order counts and reports. That is the whole point.
 *
 *   IN for nozzle wear. A personal print wears a nozzle exactly as much as a
 *     paid one — the abrasive filament does not know who it was for — and a
 *     wear counter that ignored half a machine's work would warn late, in the
 *     direction that ruins parts. This is chosen, not overlooked.
 *
 *   IN for capacity and lead time. The machine is occupied either way, so a
 *     promise made to a customer has to account for it. Excluding it would
 *     quote a date against a printer that is busy.
 *
 *   IN for the catalogue. A part printed for the shop's own use can still be
 *     something the shop sells.
 *
 * Pure: no DOM, no fs, no Electron.
 */
(function (global) {

  /**
   * Does this order count as trade?
   *
   * Deliberately not "is it valid" — a non-business print is a real record with
   * real material behind it. This answers one question: should the money and
   * the count appear in what the shop reports as its business.
   */
  function countsForBusiness(order) {
    return !!order && order.nonBusiness !== true;
  }

  /** The trade subset of a queue, for the aggregations that report money. */
  function businessOrders(orders) {
    return (Array.isArray(orders) ? orders : []).filter(countsForBusiness);
  }

  /**
   * Mark or unmark, returning the order.
   *
   * Stores `true` or removes the key rather than storing `false`: every store in
   * every shop predates this, and a field that is absent on old records and
   * absent on unmarked new ones has one meaning instead of two.
   */
  function setNonBusiness(order, on) {
    if (!order) return order;
    if (on) order.nonBusiness = true;
    else delete order.nonBusiness;
    return order;
  }

  const api = { countsForBusiness, businessOrders, setNonBusiness };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytBusinessScope = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
