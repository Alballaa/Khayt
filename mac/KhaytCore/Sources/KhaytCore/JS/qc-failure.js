'use strict';

/**
 * A job that failed inspection.
 *
 * Three records, and each one is read by something different:
 *
 *   the ORDER      `qcStatus: 'fail'`, `qcFailedAt`, `qcAt`, the inspector.
 *                  `qcStatusOf` reads these, `computeQcMetrics` counts them,
 *                  and a failure that writes none of them is not counted as a
 *                  failure — it is not counted at all, so the pass rate is
 *                  computed over a shrinking subset of the shop's work.
 *   a DEFECT       what went wrong, how badly, and the note. The analytics
 *                  screen's defects-by-type table is built from these.
 *   a WASTE row    the filament the failed print consumed and what it cost.
 *                  The waste screen labels and filters by `failureType`, so
 *                  inventing a category puts a value there it cannot name.
 *
 * All three were written in two places — `renderer/order-flows.js` and
 * `renderer/bedready-queue.js` — and they had drifted. Bed Ready's defect
 * carried no `severity` and no `photoRef`, and it never set the inspector: a
 * failure recorded there answered "how bad was it" with `undefined`, for ever.
 *
 * PURE: no globals, no clock. The cost of the wasted filament is derived from
 * the spool it came off, which is why `ctx.inventory` is here — the same list
 * `lib/order-deduction.js` draws from.
 */
(function (global) {

  /**
   * The failure categories, from `renderer/waste.js`'s own labels.
   *
   * A category this list does not contain reaches the waste screen as a value
   * it cannot name, so the list IS the contract rather than a suggestion.
   */
  const FAILURE_TYPES = [
    'bed_adhesion', 'nozzle_jam', 'warping', 'stringing', 'operator_error',
    'design_issue', 'power_failure', 'material_quality', 'other',
  ];

  /** How badly. `major` is the default, because an unclassified failure that
   *  reads as minor is one nobody goes back to look at. */
  const SEVERITIES = ['major', 'minor'];

  const ctxOf = (ctx) => (ctx && typeof ctx === 'object' ? ctx : {});
  const arrayOf = (v) => (Array.isArray(v) ? v : []);
  const numberOf = (v) => {
    const n = +v;
    return Number.isFinite(n) ? n : 0;
  };

  /**
   * What the wasted filament cost, from the spool it came off.
   *
   * Nothing when no weight was recorded and nothing when the material is not on
   * the shelf: a cost invented from a spool that does not exist is worse than
   * an honest zero, which at least reads as "not measured".
   */
  function wasteCost(materialName, grams, inventory) {
    const g = Math.max(0, numberOf(grams));
    if (g <= 0) return 0;
    const spool = arrayOf(inventory).find(i => i && i.material === materialName);
    if (!spool || numberOf(spool.weight) <= 0) return 0;
    return (numberOf(spool.cost) / numberOf(spool.weight)) * g;
  }

  /**
   * Record a QC failure against a job.
   *
   * `failure`: `{ failureType, severity, reason, weight, inspector, photoRef }`.
   * `ctx`: `{ now, inventory, wasteLog, wasteId, defaultReason }`.
   *
   * The waste row is unshifted onto `ctx.wasteLog` when one is supplied — newest
   * first, the way the waste screen reads it. The order is mutated in place.
   */
  function record(order, failure, ctx) {
    const f = failure || {};
    const c = ctxOf(ctx);
    const nowIso = new Date(typeof c.now === 'number' ? c.now : Date.now()).toISOString();
    const failureType = FAILURE_TYPES.indexOf(f.failureType) === -1 ? 'other' : f.failureType;
    const severity = SEVERITIES.indexOf(f.severity) === -1 ? 'major' : f.severity;
    const reason = f.reason || '';
    const weight = Math.max(0, numberOf(f.weight));

    const waste = {
      id: c.wasteId || null,
      date: nowIso.split('T')[0],
      material: order.material || '',
      machineId: order.machineId || null,
      weight: weight || 0,
      cost: wasteCost(order.material, weight, c.inventory),
      reason: reason || c.defaultReason || '',
      orderId: order.id,
      failureType,
    };
    const log = c.wasteLog;
    if (Array.isArray(log)) log.unshift(waste);

    order.qcStatus = 'fail';
    order.qcFailedAt = nowIso;
    order.qcAt = nowIso;
    // The inspector who found it, or the one already on the job. Never blanked
    // by a caller that does not keep a roster.
    order.inspector = f.inspector || order.inspector || null;

    if (!Array.isArray(order.defects)) order.defects = [];
    order.defects.push({
      type: failureType,
      severity,
      note: reason,
      photoRef: f.photoRef || null,
      at: nowIso,
    });

    return {
      waste,
      effects: [
        { type: 'save' },
        { type: 'render_waste' },
        { type: 'render_inventory' },
      ],
    };
  }

  const api = { FAILURE_TYPES, SEVERITIES, wasteCost, record };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytQcFailure = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
