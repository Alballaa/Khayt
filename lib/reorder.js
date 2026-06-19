'use strict';
(function () {

/**
 * Reorder suggestions — consumption-aware restocking.
 *
 * Beyond the existing "low stock" badge (weight ≤ reorder point), this estimates
 * how fast each spool is consumed from completed-order history, projects
 * days-until-empty, and suggests how much to reorder to cover a target horizon.
 *
 * Pure + injected: the caller passes `partGrams` (the app's partGramsConsumed,
 * which mirrors the real deduction) and `isLow` (isLowStock), plus `now`, so the
 * whole thing is unit-testable with no globals.
 */

const DAY_MS = 86400000;

/** Best-effort completion timestamp (ms) for an order, or null. */
function completionMs(order) {
  const cand = order && (order.completedAt || order.deliveredAt);
  if (cand) { const t = Date.parse(cand); if (!Number.isNaN(t)) return t; }
  const hist = order && Array.isArray(order.statusHistory) ? order.statusHistory : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const h = hist[i];
    if (h && (h.status === 'completed' || h.status === 'delivered') && h.at) {
      const t = Date.parse(h.at); if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

/** Grams consumed per spool id over the window → { [spoolId]: gramsPerDay }. */
function consumptionByItem(orders, opts) {
  opts = opts || {};
  const partGrams = typeof opts.partGrams === 'function' ? opts.partGrams : (p) => (+(p && p.grams) || 0);
  const windowDays = opts.windowDays > 0 ? opts.windowDays : 30;
  const now = opts.now || 0;
  const since = now - windowDays * DAY_MS;
  const totals = {};
  for (const order of (orders || [])) {
    if (!order) continue;
    const done = completionMs(order);
    if (done == null || done < since || done > now) continue;
    const parts = Array.isArray(order.parts) ? order.parts : [];
    for (const p of parts) {
      const key = p && (p.spoolId || p.filamentId);
      if (!key) continue;
      totals[key] = (totals[key] || 0) + (+partGrams(p) || 0);
    }
  }
  const rates = {};
  for (const key of Object.keys(totals)) rates[key] = totals[key] / windowDays;
  return rates;
}

/**
 * Suggest reorders. Returns items that are low OR projected to deplete within
 * `leadDays`, each with { item, weight, gramsPerDay, daysLeft, low, suggestG },
 * sorted most-urgent first.
 */
function reorderSuggestions(inventory, orders, opts) {
  opts = opts || {};
  const isLow = typeof opts.isLow === 'function' ? opts.isLow : () => false;
  const leadDays = opts.leadDays > 0 ? opts.leadDays : 14;
  const targetDays = opts.targetDays > 0 ? opts.targetDays : 45;
  const rates = consumptionByItem(orders, opts);
  const out = [];
  for (const item of (inventory || [])) {
    if (!item || !item.id) continue;
    const weight = +item.weight || 0;
    const gramsPerDay = +rates[item.id] || 0;
    const daysLeft = gramsPerDay > 0 ? weight / gramsPerDay : Infinity;
    const low = !!isLow(item);
    if (!low && daysLeft > leadDays) continue; // healthy stock, skip
    // Cover targetDays of usage from now, beyond what's on hand.
    const needG = gramsPerDay > 0 ? Math.max(0, Math.ceil(gramsPerDay * targetDays - weight)) : 0;
    out.push({
      item,
      id: item.id,
      label: item.name || item.material || item.id,
      weight,
      gramsPerDay: Math.round(gramsPerDay * 10) / 10,
      daysLeft: daysLeft === Infinity ? null : Math.round(daysLeft),
      low,
      suggestG: needG,
    });
  }
  // Urgency: lowest daysLeft first (null/unknown last but still listed because low).
  out.sort((a, b) => {
    const da = a.daysLeft == null ? Infinity : a.daysLeft;
    const db = b.daysLeft == null ? Infinity : b.daysLeft;
    if (da !== db) return da - db;
    return (b.low ? 1 : 0) - (a.low ? 1 : 0);
  });
  return out;
}

/** Build a plain-text reorder list to paste/send to a supplier. */
function reorderText(suggestions, opts) {
  opts = opts || {};
  const header = opts.header || 'Reorder list:';
  const lines = (suggestions || []).map((s) => {
    const name = s.label || s.id;
    if (s.suggestG > 0) return `- ${name}: ~${Math.round(s.suggestG)} g`;
    if (s.low) return `- ${name}: restock`;
    return `- ${name}`;
  });
  return lines.length ? header + '\n' + lines.join('\n') : '';
}

const api = { DAY_MS, completionMs, consumptionByItem, reorderSuggestions, reorderText };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytReorder = api;

})();
