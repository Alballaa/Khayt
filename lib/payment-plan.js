'use strict';

/**
 * Payment-plan SCHEDULE math — pure arithmetic over an order's payment plan.
 *
 * Spec: docs/KHAYT-3.0-PAYMENTS-SPEC.md. This module builds and reasons about an
 * `order.paymentPlan.schedule[]` of dated amounts and returns the numbers the
 * renderer feeds into the existing money flow. It is intentionally side-effect
 * free (inject `now`, no fs/renderer imports) so it can be unit-tested in
 * isolation and reused anywhere.
 *
 * IMPORTANT — this module is NOT a second ledger. `payStatus(order)`
 * (renderer/app-helpers.js) remains the single source of truth for
 * paid/partial/unpaid, deriving from price/paidAmount/giftCardDiscount/
 * creditNotes[]. We do NOT duplicate or replace it. We only:
 *   - build a schedule that sums EXACTLY to `total` (2-dp money), and
 *   - sum/inspect that schedule (scheduled/collected/remaining/nextDue/due).
 * The renderer maps a collected schedule onto `paidAmount`; `payStatus`/
 * `orderOwedBase` react as they already do.
 *
 * Money model: SAR, VAT-inclusive, rounded to 2 decimal places. The deposit (if
 * any) is installment 0, due immediately; the remainder is split evenly across
 * `installments`, with the LAST regular installment absorbing the rounding so the
 * schedule sums to `total` to the cent — no money is created or lost.
 */

const DAY_MS = 86400000;

/** Round a number to 2 decimal places (money), avoiding binary float drift. */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Coerce to a finite, non-negative number (0 on garbage). */
function pos(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Normalize a date input to an ISO 'YYYY-MM-DD' day string. */
function toIsoDay(input) {
  if (!input) return null;
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  const s = String(input);
  // Already a 'YYYY-MM-DD' (or longer ISO) string — keep the day part.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Add `days` to an ISO day string, returning a new ISO day string. */
function addDays(isoDay, days) {
  const base = isoDay ? new Date(`${toIsoDay(isoDay)}T00:00:00.000Z`) : new Date();
  return new Date(base.getTime() + (Number(days) || 0) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Build a payment-plan schedule.
 *
 * @param {object} opts
 * @param {number} opts.total            Plan total (SAR, VAT-inclusive).
 * @param {number} [opts.depositAmount]  Up-front deposit; becomes installment 0,
 *                                        due immediately, when > 0.
 * @param {number} opts.installments     How many regular installments split the
 *                                        remainder (after the deposit).
 * @param {string|Date} [opts.firstDueDate] Due date of the first regular
 *                                        installment (ISO day or Date). Defaults
 *                                        to today (the injected/system date).
 * @param {number} [opts.intervalDays]   Days between regular installments.
 * @returns {Array<{dueDate:string, amount:number, paidAt:null}>}
 *   A schedule whose amounts sum EXACTLY to `total` (to the cent). The deposit,
 *   when present, is the first entry (dueDate = today). The last regular entry
 *   absorbs any rounding remainder.
 */
function buildSchedule({ total, depositAmount = 0, installments, firstDueDate, intervalDays } = {}) {
  const grandTotal = round2(pos(total));
  const deposit = Math.min(round2(pos(depositAmount)), grandTotal);
  const count = Math.max(0, Math.trunc(Number(installments) || 0));
  const interval = Number(intervalDays) || 0;
  const today = toIsoDay(new Date());

  const schedule = [];

  // Deposit is installment 0 — due immediately — when > 0.
  if (deposit > 0) {
    schedule.push({ dueDate: today, amount: deposit, paidAt: null });
  }

  const remainder = round2(grandTotal - deposit);

  if (count <= 0 || remainder <= 0) {
    return schedule;
  }

  // Split the remainder evenly; the LAST entry absorbs the rounding so the whole
  // schedule sums to `total` to the cent.
  const per = round2(remainder / count);
  const start = toIsoDay(firstDueDate) || today;

  let scheduledSoFar = 0;
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const amount = isLast ? round2(remainder - scheduledSoFar) : per;
    scheduledSoFar = round2(scheduledSoFar + amount);
    schedule.push({
      dueDate: i === 0 ? start : addDays(start, interval * i),
      amount,
      paidAt: null,
    });
  }

  return schedule;
}

/** Sum of all scheduled amounts (== `total` for a built schedule). */
function scheduledTotal(schedule) {
  if (!Array.isArray(schedule)) return 0;
  return round2(schedule.reduce((sum, e) => sum + (Number(e && e.amount) || 0), 0));
}

/** Sum of amounts whose `paidAt` is set (i.e. collected). */
function collectedTotal(schedule) {
  if (!Array.isArray(schedule)) return 0;
  return round2(schedule.reduce(
    (sum, e) => sum + (e && e.paidAt ? (Number(e.amount) || 0) : 0),
    0,
  ));
}

/**
 * Plan balance snapshot.
 * @returns {{ scheduled:number, collected:number, remaining:number,
 *             nextDue:{dueDate:string, amount:number}|null }}
 *   `remaining` = scheduled − collected (clamped to >= 0). `nextDue` is the
 *   earliest unpaid entry (by dueDate, then schedule order), or null when none.
 */
function planBalance(schedule) {
  const scheduled = scheduledTotal(schedule);
  const collected = collectedTotal(schedule);
  const remaining = round2(Math.max(0, scheduled - collected));

  let nextDue = null;
  if (Array.isArray(schedule)) {
    const unpaid = schedule
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e && !e.paidAt);
    unpaid.sort((a, b) => {
      const da = a.e.dueDate || '';
      const db = b.e.dueDate || '';
      if (da !== db) return da < db ? -1 : 1;
      return a.i - b.i; // stable: earlier schedule position wins on a tie
    });
    if (unpaid.length) {
      nextDue = { dueDate: unpaid[0].e.dueDate, amount: unpaid[0].e.amount };
    }
  }

  return { scheduled, collected, remaining, nextDue };
}

/**
 * Mark a single installment collected. Pure — returns a NEW schedule (and new
 * entry objects), never mutating the input.
 * @param {Array} schedule
 * @param {number} index   Index of the entry to mark paid.
 * @param {string|Date} paidIso  When it was collected (ISO day; defaults today).
 * @returns {Array} a new schedule.
 */
function markInstallmentPaid(schedule, index, paidIso) {
  if (!Array.isArray(schedule)) return [];
  const paidAt = toIsoDay(paidIso) || toIsoDay(new Date());
  return schedule.map((entry, i) => {
    if (i !== index || !entry) return entry;
    return { ...entry, paidAt };
  });
}

/**
 * Unpaid entries that are due (dueDate <= now), earliest first. "Due" includes
 * overdue. Entries without a dueDate are never considered due here.
 * @param {Array} schedule
 * @param {string|Date} now  The injected current time.
 * @returns {Array} unpaid, due entries sorted by dueDate ascending.
 */
function dueInstallments(schedule, now) {
  if (!Array.isArray(schedule)) return [];
  const today = toIsoDay(now) || toIsoDay(new Date());
  return schedule
    .filter(e => e && !e.paidAt && e.dueDate && toIsoDay(e.dueDate) <= today)
    .slice()
    .sort((a, b) => {
      const da = toIsoDay(a.dueDate);
      const db = toIsoDay(b.dueDate);
      if (da !== db) return da < db ? -1 : 1;
      return 0;
    });
}

module.exports = {
  buildSchedule,
  scheduledTotal,
  collectedTotal,
  planBalance,
  markInstallmentPaid,
  dueInstallments,
  // low-level (exposed for tests / reuse)
  round2,
};
