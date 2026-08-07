'use strict';
(function (global) {

/**
 * Builds: several printed jobs that are one physical object.
 *
 * A figure printed as Head, Hand, Body and Legs is four jobs and four print-log
 * entries, and Khayt has no idea they are the same thing. "What did that figure
 * cost me" is arithmetic across four rows, done by hand, and nobody does it.
 *
 * NOT the BOM assembly in lib/assembly.js. That is one ORDER holding several
 * parts plus non-printed components, gated on QC — a thing you sell. This is a
 * grouping ACROSS orders, over work already done. The two can coexist on the
 * same shop and mean different things, which is why this does not reuse the word.
 *
 * Why across orders rather than merging them into one multi-part order: actuals
 * (`actualPrintTime`, `actualWeight`) live on the ORDER and nowhere else — no
 * part in this codebase carries its own measurement. Folding four jobs into one
 * order would replace four measured numbers with one, which is exactly the data
 * the estimator calibrates from. Grouping keeps every measurement intact.
 *
 * Pure: no DOM, no fs, no clock.
 */

// `+null` is 0 and `+''` is 0, so the obvious one-liner turns "never measured"
// into "measured, and it was zero" — which is the single bug this whole module
// exists to avoid. Absent must stay absent all the way to the caller.
const num = (v) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = +v;
  return Number.isFinite(n) ? n : null;
};
const str = (v) => String(v == null ? '' : v).trim();

/** Statuses whose numbers are real. A cancelled job's figures are not the build's. */
const COUNTED = new Set(['completed', 'delivered']);

/**
 * Total a build's jobs.
 *
 * The trap this exists to avoid: summing `actualPrintTime` across entries where
 * some are null yields a number that LOOKS like the build's total and silently
 * omits whatever was never measured. So the count of what went into each total
 * is returned beside it, and a caller that shows the total without the count is
 * the bug. `measuredOf` is not decoration.
 *
 * Cost is only summed within one currency. Two currencies in a build is a shop
 * mid-migration, and 12 SAR + 3 EUR = 15 of nothing.
 */
function rollup(entries) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && COUNTED.has(str(e.status)));
  const out = {
    jobs: list.length,
    estHours: 0, estGrams: 0,
    actualHours: 0, actualGrams: 0,
    cost: 0, currency: null, mixedCurrency: false,
    measuredTime: 0, measuredWeight: 0, costed: 0,
  };
  const currencies = new Set();
  for (const e of list) {
    const est = num(e.printTime); if (est !== null) out.estHours += est;
    const at = num(e.actualPrintTime);
    if (at !== null) { out.actualHours += at; out.measuredTime += 1; }
    const aw = num(e.actualWeight);
    if (aw !== null) { out.actualGrams += aw; out.measuredWeight += 1; }
    // The slicer's own weight, summed only where a job carries one, so estGrams
    // and actualGrams are comparable over the same jobs.
    for (const p of (Array.isArray(e.parts) ? e.parts : [])) {
      const pw = num(p && p.printWeight); if (pw !== null) out.estGrams += pw;
    }
    const c = num(e.costBasis);
    if (c !== null) {
      const cur = str(e.currency) || null;
      if (cur) currencies.add(cur);
      out.cost += c; out.costed += 1;
    }
  }
  out.mixedCurrency = currencies.size > 1;
  out.currency = currencies.size === 1 ? [...currencies][0] : null;
  if (out.mixedCurrency) out.cost = null;      // refuse rather than add nonsense
  // Round only at the edges; the sums above stay exact.
  out.estHours = +out.estHours.toFixed(2);
  out.actualHours = +out.actualHours.toFixed(2);
  out.estGrams = +out.estGrams.toFixed(2);
  out.actualGrams = +out.actualGrams.toFixed(2);
  if (out.cost !== null) out.cost = +out.cost.toFixed(2);
  return out;
}

/**
 * How far the estimate was off across the build, or null when there is nothing
 * honest to compare.
 *
 * Returns null unless EVERY counted job was measured. A build where three of
 * four are measured has a real per-job story but no build-level delta — the
 * estimate covers four jobs and the actual covers three, and dividing one by the
 * other invents a number.
 */
function accuracy(r) {
  if (!r || !r.jobs || r.measuredTime !== r.jobs) return null;
  const out = { time: null, weight: null };
  if (r.estHours > 0) out.time = +(((r.actualHours - r.estHours) / r.estHours) * 100).toFixed(1);
  if (r.estGrams > 0 && r.measuredWeight === r.jobs) {
    out.weight = +(((r.actualGrams - r.estGrams) / r.estGrams) * 100).toFixed(2);
  }
  return out;
}

/**
 * Group print-log entries into builds.
 *
 * A buildId with no definition still produces a build rather than vanishing —
 * a deleted definition must not take the shop's history off the screen with it.
 *
 * @param {Array} entries      printLog, newest-first (order is preserved within a build)
 * @param {Array} defs         store.builds — [{id, name}]
 * @returns {{builds: Array, ungrouped: Array}}
 */
function groupByBuild(entries, defs) {
  const byId = new Map();
  for (const d of (Array.isArray(defs) ? defs : [])) {
    const id = str(d && d.id); if (id) byId.set(id, str(d.name));
  }
  const order = [];
  const groups = new Map();
  const ungrouped = [];
  for (const e of (Array.isArray(entries) ? entries : [])) {
    const id = str(e && e.buildId);
    if (!id) { if (e) ungrouped.push(e); continue; }
    if (!groups.has(id)) { groups.set(id, []); order.push(id); }
    groups.get(id).push(e);
  }
  const builds = order.map((id) => {
    const list = groups.get(id);
    const r = rollup(list);
    return {
      id,
      // An orphaned build keeps a name derived from its work rather than showing
      // a raw id, which reads as corruption to anyone looking at it.
      name: byId.get(id) || str(list[0] && list[0].project) || id,
      orphaned: !byId.has(id),
      entries: list,
      rollup: r,
      accuracy: accuracy(r),
    };
  });
  return { builds, ungrouped };
}

/** Is this build finished — every job in it counted and measured? */
function isComplete(build) {
  const r = build && build.rollup;
  return !!(r && r.jobs > 0 && r.measuredTime === r.jobs && r.measuredWeight === r.jobs);
}

const api = { groupByBuild, rollup, accuracy, isComplete, COUNTED };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.KhaytPrintBuilds = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
