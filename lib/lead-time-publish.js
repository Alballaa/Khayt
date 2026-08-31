'use strict';

/**
 * Turning a shop's live queue into the snapshot a storefront quotes from.
 *
 * Split out from main.js so the decisions below are testable without an Electron
 * app, a clock or a network — every one of them changes a date a customer will
 * be given, and "it looked right on my machine" is not a way to check that.
 */

const LeadTime = require('./lead-time.js');
const Attention = require('./attention.js');

/** Statuses that still represent work to do. `completed` and `delivered` do not. */
const ACTIVE = new Set(['queued', 'pending', 'printing', 'post', 'qc', 'on_hold']);

/**
 * Which lanes may take a new order.
 *
 * lib/lead-time.js will put a job on any lane it is given and cannot know
 * better — so filtering here is not tidiness, it is the difference between a
 * promise and a promise made against a printer that was never going to print it.
 *
 * Offline machines are excluded, because a shop with one printer down is a shop
 * with less capacity and a customer should be told the true date rather than the
 * one that assumes a repair.
 *
 * Material is deliberately NOT filtered on. The basket is not known when the
 * snapshot is published — that is the whole point of publishing a snapshot
 * rather than answering a question — so this is the shop's general availability.
 * A shop whose printers take genuinely different materials will publish a date
 * that is right for its fastest lane; that is a known limit, written down here
 * rather than discovered later.
 */
function usableMachines(machines) {
  return (Array.isArray(machines) ? machines : [])
    .filter((m) => m && m.id && !m.isOffline && m.status !== 'offline' && m.status !== 'retired')
    .map((m) => String(m.id));
}

/** Outstanding print hours per job, from the queue the shop actually has. */
function activeQueue(printLog) {
  const out = [];
  for (const o of Array.isArray(printLog) ? printLog : []) {
    if (!o || !ACTIVE.has(String(o.status || 'pending'))) continue;
    const hours = Number(o.printTime);
    // A job with no estimate is not a job with no work. Skipping it would
    // shorten every promise a shop makes while it has unestimated orders in the
    // queue — which is exactly when it is busiest.
    out.push({ hours: Number.isFinite(hours) && hours > 0 ? hours : 0, machineId: o.machineId || '' });
  }
  return out;
}

/**
 * Work the PRINTERS are doing that the order book knows nothing about.
 *
 * The queue above is built entirely from orders, so a machine running a job sent
 * to it straight from a slicer counted as free — and the shop quoted a customer
 * a turnaround as if a printer sitting five hours into a print were available.
 * Reported from the bench: a U1 mid-job, and Khayt calling it idle.
 *
 * This is the same lesson lib/moonraker-history.js already records for filament:
 * for "what is this machine actually doing", the printer is the ground truth and
 * the order log is a sample of it. It had never been applied to capacity.
 *
 * TWO CASES, AND ONLY ONE OF THEM IS A NUMBER.
 *
 *   Remaining time known → real queue load on that lane, in hours.
 *   Remaining time NOT known → the machine is occupied and nobody can say for
 *     how long. Klipper reports no usable estimate below about 1% of a job, so
 *     this is the normal state for the first minutes of every print. The lane is
 *     dropped from the usable set instead: "busy, duration unknown" is the truth,
 *     and inventing hours to stand in for it would put a guess into a date a
 *     customer holds the shop to.
 *
 * A machine that ALREADY has an active order against it is skipped: that order
 * is presumably the job on the bed, and counting both would inflate every
 * promise the shop makes while it is working normally.
 */
function printerInFlight(machines, statusCache, printLog) {
  const cache = statusCache || {};
  const ordered = new Set();
  for (const o of Array.isArray(printLog) ? printLog : []) {
    if (o && o.machineId && ACTIVE.has(String(o.status || 'pending'))) ordered.add(String(o.machineId));
  }
  const queue = [];
  const occupied = [];
  for (const m of Array.isArray(machines) ? machines : []) {
    if (!m || !m.id || ordered.has(String(m.id))) continue;
    if (Attention.machineState(m, cache[m.id]) !== 'printing') continue;
    const secs = Number(cache[m.id] && cache[m.id].timeRemaining);
    if (Number.isFinite(secs) && secs > 0) {
      queue.push({ hours: Math.round((secs / 3600) * 100) / 100, machineId: String(m.id) });
    } else {
      occupied.push(String(m.id));
    }
  }
  return { queue, occupied };
}

/**
 * Build the snapshot, or return null when the shop has not asked for this.
 *
 * @param {object} input
 * @param {object} input.settings   settings.leadTime
 * @param {object[]} input.printLog
 * @param {object[]} input.machines
 * @param {string} input.today      the shop's LOCAL day, 'YYYY-MM-DD'
 * @param {string} input.nowIso     injected clock
 */
function buildSnapshot(input) {
  const i = input || {};
  const lt = (i.settings && i.settings.leadTime) || {};
  if (!lt.publishToCloud) return null;
  const inFlight = printerInFlight(i.machines, i.statusCache, i.printLog);
  return LeadTime.snapshot({
    computedAt: i.nowIso,
    today: i.today,
    queue: [...activeQueue(i.printLog), ...inFlight.queue],
    // A printer that is mid-job for an unknown remaining time is not a lane a
    // new order can be promised against.
    machineIds: usableMachines(i.machines).filter((id) => !inFlight.occupied.includes(id)),
    dailyHours: lt.dailyHours,
    workingDaysPerWeek: lt.workingDaysPerWeek,
    finishingDays: lt.finishingDays,
    dispatchDays: lt.dispatchDays,
    safetyDays: lt.safetyDays,
    staleAfterHours: lt.staleAfterHours,
  });
}

/**
 * Has anything changed enough to be worth publishing?
 *
 * `computedAt` moves every time this runs, so comparing whole snapshots would
 * publish on every tick and never say anything new. What a storefront reads is
 * the rest of it, so that is what is compared — and a republish that says
 * exactly what the last one said only costs the shop's cursor its freshness.
 *
 * The freshness IS the point though: an unchanged snapshot still needs
 * republishing before `staleAfterHours` runs out, or the storefront stops
 * quoting. So this answers "different", and the caller decides how often to
 * publish regardless.
 */
function differs(a, b) {
  if (!a || !b) return true;
  const strip = (s) => JSON.stringify({ ...s, computedAt: null });
  return strip(a) !== strip(b);
}

module.exports = { buildSnapshot, usableMachines, activeQueue, printerInFlight, differs, ACTIVE };
