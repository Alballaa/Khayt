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

/** Open (not yet consumed) orders whose parts commit grams against a spool. */
const OPEN_STATUSES = new Set(['pending', 'queued', 'printing', 'post', 'qc', 'on_hold']);

/** Grams already committed by OPEN orders per spool id → { [spoolId]: grams }. */
function committedByItem(orders, opts) {
  opts = opts || {};
  const partGrams = typeof opts.partGrams === 'function' ? opts.partGrams : (p) => (+(p && p.grams) || 0);
  const totals = {};
  for (const order of (orders || [])) {
    if (!order || !OPEN_STATUSES.has(order.status)) continue;
    for (const p of (Array.isArray(order.parts) ? order.parts : [])) {
      const key = p && (p.spoolId || p.filamentId);
      if (!key) continue;
      totals[key] = (totals[key] || 0) + (+partGrams(p) || 0);
    }
  }
  return totals;
}

/**
 * Suggest reorders. Returns items that are low OR projected to deplete within
 * `leadDays`, each with { item, weight, committedG, available, gramsPerDay,
 * daysLeft, low, suggestG }, sorted most-urgent first. Open orders' committed
 * grams are subtracted from on-hand stock, so the forecast accounts for work
 * already in the queue (not just past usage velocity).
 */
function reorderSuggestions(inventory, orders, opts) {
  opts = opts || {};
  const isLow = typeof opts.isLow === 'function' ? opts.isLow : () => false;
  const leadDays = opts.leadDays > 0 ? opts.leadDays : 14;
  const targetDays = opts.targetDays > 0 ? opts.targetDays : 45;
  const rates = consumptionByItem(orders, opts);
  const committed = committedByItem(orders, opts);
  const out = [];
  for (const item of (inventory || [])) {
    if (!item || !item.id) continue;
    const weight = +item.weight || 0;
    const committedG = +committed[item.id] || 0;
    const available = Math.max(0, weight - committedG); // headroom after queued work
    const gramsPerDay = +rates[item.id] || 0;
    const daysLeft = gramsPerDay > 0 ? available / gramsPerDay : (committedG > weight ? 0 : Infinity);
    const low = !!isLow(item);
    // Surface if low, projected to deplete within leadDays, OR open orders already
    // exceed stock.
    if (!low && daysLeft > leadDays && committedG <= weight) continue;
    // Cover targetDays of usage beyond what's available, plus any shortfall now.
    const needG = gramsPerDay > 0
      ? Math.max(0, Math.ceil(gramsPerDay * targetDays - available))
      : Math.max(0, Math.ceil(committedG - weight));
    out.push({
      item,
      id: item.id,
      label: item.name || item.material || item.id,
      weight,
      committedG: Math.round(committedG),
      available: Math.round(available),
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

/**
 * Pick which reorder suggestions should become *new* draft POs: only items with
 * a positive suggested quantity that don't already have an open (draft/ordered,
 * not-yet-received) purchase order — so auto-drafting never piles up duplicates.
 * Pure: caller passes suggestions + the current purchaseOrders list.
 */
function itemsNeedingDraftPo(suggestions, purchaseOrders) {
  const openByItem = new Set();
  for (const po of (purchaseOrders || [])) {
    if (po && po.itemId && po.status !== 'received' && po.status !== 'cancelled') openByItem.add(po.itemId);
  }
  return (suggestions || []).filter((s) => s && s.suggestG > 0 && s.item && !openByItem.has(s.item.id));
}

const api = { DAY_MS, completionMs, consumptionByItem, committedByItem, reorderSuggestions, reorderText, itemsNeedingDraftPo };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytReorder = api;

})();
