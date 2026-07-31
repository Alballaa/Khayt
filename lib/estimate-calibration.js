'use strict';

(function (global) {
/**
 * Teaching the estimator what this shop's machines actually do.
 *
 * lib/stl-estimate.js turns geometry into a weight and a time using five
 * constants: density, infill, shell fraction, volumetric throughput and waste.
 * Four of them are the shop's own settings. The fifth — throughput — is the one
 * nobody can answer, because "effective volumetric flow including travel and
 * acceleration overhead" is not a number a shop knows about its own printer. It
 * has been 8 mm³/s for everyone since the estimator was written.
 *
 * It does not need to be guessed any more. Look at what the time estimate
 * actually computes:
 *
 *     volume = weight / density
 *     time   = volume / throughput
 *   ⇒ time   = weight / (density × throughput)
 *
 * Density and throughput only ever appear multiplied together, and that product
 * is **grams per hour** — which is measured directly by every job that reports
 * both its weight and its duration. So the two hardest constants to guess
 * collapse into one number the shop's own history already contains.
 *
 * What this module will not do:
 *
 *   - Learn from a job nobody measured. A typed figure is the shop's estimate of
 *     its own past, and calibrating an estimator against estimates is circular.
 *   - Learn from an apportioned job. When one duration was divided across four
 *     parts by their estimates, feeding that back in teaches the estimator its
 *     own assumptions.
 *   - Learn from one job. A single print says nothing about a machine, and a
 *     calibration confident after one sample is worse than no calibration.
 *   - Mix machines that disagree. A CoreXY and a bedslinger have genuinely
 *     different rates; averaging them fits neither.
 *
 * Pure: takes orders, returns numbers.
 */

const MIN_JOBS = 3;
/** Beyond this spread the jobs are not describing one rate. */
const MAX_RELATIVE_SPREAD = 0.6;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Grams-per-hour readings from the jobs entitled to teach us anything.
 *
 * @param {Array} orders
 * @param {{allocate: function}} deps  lib/order-file-link.js allocateActuals
 * @param {{machineId?: string}} [q]
 */
function readings(orders, deps, q = {}) {
  const list = Array.isArray(orders) ? orders.filter((o) => o && typeof o === 'object') : [];
  const allocate = deps && deps.allocate;
  if (typeof allocate !== 'function') return [];
  const out = [];
  for (const order of list) {
    if (q.machineId && order.machineId !== q.machineId) continue;
    for (const a of allocate(order)) {
      // Both conditions matter and neither implies the other: `exact` means
      // nothing was divided, `measured` means a printer said so.
      if (!a.exact || !a.measured) continue;
      const g = num(a.actGrams);
      const h = num(a.actHours);
      if (!g || !h) continue;
      out.push(g / h);
    }
  }
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * What this shop actually prints, in grams per hour.
 *
 * The median rather than the mean: one job that sat paused overnight, or one
 * where the shop typed the wrong hour, should not drag the figure it is meant to
 * establish.
 *
 * @returns {{gramsPerHour: number, jobs: number, spread: number}|null}
 *   null whenever there is not enough agreement to be worth trusting — the
 *   caller then keeps its configured value, which is the honest outcome.
 */
function learnGramsPerHour(orders, deps, q = {}) {
  const rates = readings(orders, deps, q);
  if (rates.length < MIN_JOBS) return null;

  const mid = median(rates);
  if (!(mid > 0)) return null;

  // How far the readings sit from that middle, relative to it. A shop whose jobs
  // disagree by more than this is not describing one rate, and averaging them
  // would produce a number that fits none of them.
  const spread = median(rates.map((r) => Math.abs(r - mid))) / mid;
  if (spread > MAX_RELATIVE_SPREAD) return null;

  return {
    gramsPerHour: Math.round(mid * 100) / 100,
    jobs: rates.length,
    spread: Math.round(spread * 100) / 100,
  };
}

/**
 * Calibration for one machine, falling back to the shop as a whole.
 *
 * A machine with its own history describes itself better than the shop average
 * does; a machine without one is still better served by the shop's other
 * printers than by a constant written years ago.
 */
function calibrate(orders, deps, q = {}) {
  if (q.machineId) {
    const own = learnGramsPerHour(orders, deps, { machineId: q.machineId });
    if (own) return Object.assign({ scope: 'machine' }, own);
  }
  const shop = learnGramsPerHour(orders, deps, {});
  if (shop) return Object.assign({ scope: 'shop' }, shop);
  return null;
}

/**
 * Fold a calibration into the options lib/stl-estimate.js takes.
 *
 * Expressed as a throughput so the estimator is unchanged: throughput is
 * gramsPerHour ÷ density ÷ 3.6, which is the same rearrangement as above read
 * backwards. The estimator keeps one way of computing a time; this only supplies
 * a better number for it.
 */
function applyCalibration(opts, cal) {
  const o = Object.assign({}, opts || {});
  if (!cal || !(cal.gramsPerHour > 0)) return o;
  const density = num(o.densityGPerCm3) || 1.24;
  o.throughputMm3PerS = cal.gramsPerHour / density / 3.6;
  // So a caller can say where the number came from rather than presenting a
  // measured rate and a guessed one identically.
  o.calibratedFrom = { scope: cal.scope || 'shop', jobs: cal.jobs };
  return o;
}

const api = {
  MIN_JOBS, MAX_RELATIVE_SPREAD,
  readings, learnGramsPerHour, calibrate, applyCalibration,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.KhaytEstimateCalibration = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
