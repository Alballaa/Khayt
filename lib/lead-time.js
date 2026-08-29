'use strict';
(function (global) {

/**
 * When could a shop realistically have this printed, finished and posted?
 *
 * ── WHY THIS IS NOT "THE PRINT TIME" ───────────────────────────────────────
 *
 * A customer told "3 hours of printing" hears "tomorrow". If the shop has forty
 * hours queued ahead of it, prints eight hours a day and works five days a week,
 * the honest answer is next week — and the gap between those two numbers is
 * where a shop loses a customer it had already won.
 *
 * Khayt already knows every part of this. The queue is in the print log, the
 * per-machine projection is lib/schedule.js (which the Schedule board draws),
 * and print-time estimates are calibrated against the shop's own finished jobs.
 * What was missing is putting them together and saying a DATE outward.
 *
 * ── EVERY DEFAULT HERE ERRS LATE, ON PURPOSE ───────────────────────────────
 *
 * This produces a promise a customer will hold the shop to. Early is a delight
 * and late is a complaint, so where a choice exists this takes the pessimistic
 * one: the new job goes behind everything already queued, part-days round up,
 * and a shop that has stated no capacity is assumed to be busy rather than idle.
 *
 * Pure and clock-injected — no Date.now(), no fs — so a promise is reproducible
 * and a test can sit on a Friday.
 */

/** Days that must pass to cover `workingDays` at `perWeek` working days a week. */
function calendarDaysFor(workingDays, perWeek) {
  const w = Math.max(1, Math.min(7, Math.round(perWeek || 7)));
  if (w >= 7) return workingDays;
  const weeks = Math.floor(workingDays / w);
  const rem = workingDays - weeks * w;
  return weeks * 7 + rem;
}

function addDaysIso(iso, days) {
  const d = new Date(String(iso) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  // A non-finite offset THROWS rather than being quietly treated as zero.
  // Silently adding nothing would hand a customer today's date as a delivery
  // promise, which is the worst possible way to be wrong here — and it is
  // exactly what `Number(undefined)` produced in the first draft of this file,
  // where `Number(i.finishingDays) ?? 1` left NaN because `??` does not catch it.
  if (!Number.isFinite(days)) throw new TypeError('lead-time: day offset is not a number');
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)));
  return d.toISOString().slice(0, 10);
}

/** A number, or the fallback when nothing usable was given. `Number(undefined)`
 *  is NaN and `NaN ?? x` is NaN, so `??` alone does not do this job. */
function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Hours of work already committed on the lane this job would join.
 *
 * The LEAST loaded lane, because that is the machine a shop would actually put
 * it on — but never less than zero and never ignoring unassigned work, which is
 * queued labour whoever ends up doing it.
 *
 * A shop with no machines recorded is not a shop with no queue: everything falls
 * into one lane, which is the conservative reading and also the true one for the
 * single-printer shops this is mostly for.
 */
function laneLoadHours(queue, machineIds) {
  const lanes = new Map();
  for (const id of machineIds || []) lanes.set(String(id), 0);
  let unassigned = 0;
  for (const job of queue || []) {
    const hours = Math.max(0, Number(job && job.hours) || 0);
    const mid = job && job.machineId ? String(job.machineId) : '';
    if (mid && lanes.has(mid)) lanes.set(mid, lanes.get(mid) + hours);
    else unassigned += hours;
  }
  if (!lanes.size) return unassigned;
  // Unassigned work has to land somewhere. Spreading it evenly would flatter the
  // answer, so it is added to every lane before the lowest is chosen.
  const share = unassigned / lanes.size;
  return Math.min(...[...lanes.values()].map((h) => h + share));
}

/**
 * @param {object} input
 * @param {number} input.jobHours          this job's own print hours
 * @param {object[]} [input.queue]         [{ hours, machineId }] still to print
 * @param {string[]} [input.machineIds]    lanes that can actually take THIS job —
 *        the caller filters for material, nozzle and offline. This function
 *        cannot: given a second machine it will put the job there, so passing a
 *        lane the job cannot run on is how a promise gets made against a printer
 *        that was never going to print it.
 * @param {number} [input.dailyHours=8]    printing hours the shop achieves per working day
 * @param {number} [input.workingDaysPerWeek=5]
 * @param {number} [input.finishingDays=1] post-processing and QC after the last layer
 * @param {number} [input.dispatchDays=1]  packing and handover to the carrier
 * @param {number} [input.transitDays=0]   carrier time, if the caller wants a delivered date
 * @param {string} input.today             'YYYY-MM-DD', injected — and it must be
 *        the SHOP'S LOCAL day. All arithmetic here is anchored to T00:00:00Z and
 *        read back in UTC, so it cannot drift; the timezone decision is made once,
 *        by whoever supplies this, rather than smeared through the calculation.
 *        Passing a UTC-derived day from a +03:00 shop at 01:00 promises yesterday.
 * @returns {{printedBy,readyBy,shipsBy,deliveredBy,queueHours,jobHours,workingDays,basis}}
 */
function promise(input) {
  const i = input || {};
  const today = String(i.today || '1970-01-01');
  const jobHours = Math.max(0, num(i.jobHours, 0));
  const dailyHours = Math.max(1, num(i.dailyHours, 8));
  const perWeek = Math.max(1, Math.min(7, Math.round(num(i.workingDaysPerWeek, 5))));
  // Zero is a legitimate answer for both of these — a shop that posts the same
  // day it prints — so they default only when nothing usable was given.
  const finishing = Math.max(0, num(i.finishingDays, 1));
  const dispatch = Math.max(0, num(i.dispatchDays, 1));
  const transit = Math.max(0, num(i.transitDays, 0));

  const queueHours = laneLoadHours(i.queue, i.machineIds);

  // BEHIND the queue, not alongside it. A shop does not start a new order the
  // moment it arrives, and a promise that assumes it does is a promise that
  // breaks on the shop's busiest week — which is exactly when it was made.
  const totalHours = queueHours + jobHours;
  const workingDays = totalHours > 0 ? Math.max(1, Math.ceil(totalHours / dailyHours)) : 0;

  const printedBy = addDaysIso(today, calendarDaysFor(workingDays, perWeek));
  // Finishing and dispatch are working days too — a shop that is closed is not
  // packing boxes either.
  const readyBy = addDaysIso(printedBy, calendarDaysFor(finishing, perWeek));
  const shipsBy = addDaysIso(readyBy, calendarDaysFor(dispatch, perWeek));
  // Carriers move on their own days, so transit is calendar days.
  const deliveredBy = addDaysIso(shipsBy, transit);

  return {
    printedBy, readyBy, shipsBy,
    deliveredBy: transit > 0 ? deliveredBy : null,
    queueHours: Math.round(queueHours * 10) / 10,
    jobHours: Math.round(jobHours * 10) / 10,
    workingDays,
    // What the figure rests on, so a caller can say so rather than present a
    // date as though it were a fact about the future.
    basis: { dailyHours, workingDaysPerWeek: perWeek, finishingDays: finishing, dispatchDays: dispatch, transitDays: transit },
  };
}

const api = { promise, laneLoadHours, calendarDaysFor, addDaysIso };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.KhaytLeadTime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
