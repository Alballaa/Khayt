'use strict';
/**
 * A failed print, written down by hand.
 *
 * The waste log has two writers: a QC failure (`lib/qc-failure.js`, shared)
 * and this — the form a shop fills in when a print failed outside inspection.
 * This was renderer/waste.js's save handler, built inline from nine controls,
 * so only the Electron window could log one.
 *
 * ONE DELIBERATE FIX. The form deducted the wasted grams from the first spool
 * of that material and wrote NO `spoolId` on the entry — while the delete
 * path restores the grams by `entry.spoolId`. So a manually logged failure
 * took filament off the shelf that deleting the entry could never put back.
 * The entry now records which spool it came off. The renderer's delete path
 * needed no change: it was already reading the field nothing wrote.
 *
 * PURE: no DOM, no clock. `ctx.inventory` IS MUTATED when the entry deducts,
 * the way the shelf rules mutate — the caller saves the collection it passed.
 */
(function (global) {

  const FAILURE_TYPES = ['bed_adhesion', 'nozzle_jam', 'warping', 'stringing', 'operator_error',
                         'design_issue', 'power_failure', 'material_quality', 'other'];

  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const trim = (v) => String(v == null ? '' : v).trim();

  /**
   * What wasted grams of a material cost, from the first spool of it on the
   * shelf. Nothing when the material is not on the shelf or the spool has no
   * cost or no weight recorded — a cost invented from a spool that does not
   * exist is worse than none.
   */
  function costOf(material, grams, inventory) {
    const g = Math.max(0, num(grams));
    if (!material || g <= 0) return 0;
    const spool = (inventory || []).find((i) => i && i.material === material);
    if (!spool || !(num(spool.cost) > 0) || !(num(spool.weight) > 0)) return 0;
    return g * (num(spool.cost) / num(spool.weight));
  }

  /**
   * One entry, as the log records it.
   *
   * `input`: `{ date, material, failureType, weight, cost, reason, notes, orderId, machineId, deduct }`
   * `ctx`:   `{ id, today, inventory }`
   * Returns `{ entry }`, or `{ refused: 'material' }` when no material was given.
   */
  function newEntry(input, ctx) {
    const i = input || {};
    const c = ctx || {};
    const material = trim(i.material);
    if (!material) return { refused: 'material' };
    const weight = Math.max(0, num(i.weight));
    const entry = {
      id: c.id,
      date: i.date || c.today,
      material,
      failureType: FAILURE_TYPES.includes(i.failureType) ? i.failureType : 'other',
      weight,
      cost: Math.max(0, num(i.cost)),
      reason: trim(i.reason),
      notes: trim(i.notes),
      orderId: trim(i.orderId) || null,
      machineId: trim(i.machineId) || null,
    };
    if (i.deduct && weight > 0) {
      const spool = (c.inventory || []).find((f) => f && f.material === material);
      if (spool) {
        spool.weight = Math.max(0, num(spool.weight) - weight);
        // So deleting the entry can put the grams back. See the header.
        if (spool.id != null) entry.spoolId = spool.id;
      }
    }
    return { entry };
  }

  /**
   * Take an entry out of the log, and put its grams back on the spool it
   * came off. `wasteLog` and `ctx.inventory` are mutated. Returns the entry
   * removed, or null when the id is not in the log.
   */
  function removeEntry(wasteLog, id, ctx) {
    const log = wasteLog || [];
    const idx = log.findIndex((w) => w && w.id === id);
    if (idx < 0) return null;
    const entry = log[idx];
    log.splice(idx, 1);
    if (entry.spoolId && num(entry.weight) > 0) {
      const spool = ((ctx || {}).inventory || []).find((i) => i && i.id === entry.spoolId);
      if (spool) spool.weight = num(spool.weight) + num(entry.weight);
    }
    return entry;
  }

  /** What the log comes to: entries, grams, cost, and failures by category. */
  function totals(wasteLog) {
    const byFailureType = {};
    let grams = 0, cost = 0, count = 0;
    for (const w of wasteLog || []) {
      if (!w) continue;
      count++;
      grams += num(w.weight);
      cost += num(w.cost);
      const ft = w.failureType || 'other';
      byFailureType[ft] = (byFailureType[ft] || 0) + 1;
    }
    return { count, grams, cost, byFailureType };
  }

  const api = { FAILURE_TYPES, costOf, newEntry, removeEntry, totals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytWasteEntry = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
