'use strict';

/**
 * Loyalty & store-credit LEDGER math (Khayt 3.0). See
 * docs/KHAYT-3.0-LOYALTY-SPEC.md §2–§9.
 *
 * This is the PURE arithmetic core for the rewards system: it computes how many
 * points an order earns, folds the append-only ledger into current balances, and
 * builds the individual ledger entries (earn / redeem / referral / clawback).
 *
 * It deliberately does NOT touch the order payment math. Store credit redeems
 * through the SAME rail gift cards already use (`order.giftCardDiscount`, which
 * `payStatus`/`orderOwedBase` already handle correctly) — the renderer applies a
 * redemption to an order; this module only tracks the wallet balance behind it.
 * So there is no fs/renderer/Electron dependency here: balances are always the
 * deterministic sum of the ledger, which keeps them audit-friendly and testable.
 *
 * Ledger entry shape (a superset of what each kind needs):
 *   {
 *     type,        // 'earn' | 'redeem' | 'referral' | 'adjust' | 'clawback'
 *     points,      // signed integer delta (+earn, −redeem/clawback); 0 if none
 *     credit,      // signed SAR delta   (+referral/credit, −redeem); 0 if none
 *     orderId,     // source/target order, when applicable
 *     referredClientId, // referral target, when applicable
 *     ts,          // timestamp (ms or ISO) — caller-supplied, untouched here
 *   }
 *
 * Sign convention: a balance is the plain sum of the matching deltas across the
 * ledger. Earn/referral/adjust(+) push balances up; redeem and clawback push
 * them down via NEGATIVE deltas. points and credit are tracked SEPARATELY.
 *
 * Non-negativity rule: a real append-only ledger built only via the constructors
 * below can never drive a balance below zero (redeemEntry rejects over-redemption
 * and clawbackOnRefund caps removal at the originally-earned amount). As a
 * defensive, documented guard against hand-edited/corrupt ledgers, ledgerBalance
 * CLAMPS each running balance at 0 after applying every entry — credit/points can
 * never be reported negative.
 */

/** Round toward zero to an integer, treating non-finite/garbage as 0. */
function toInt(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : 0;
}

/** Coerce to a finite number, treating non-finite/garbage as 0. */
function toNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Points earned on an order's ex-VAT (by default) spend.
 *   floor(exVatAmount × pointsPerUnit × tierMultiplier)
 * Always a non-negative integer; negative/garbage input earns 0.
 *
 * @param {number} exVatAmount    countable spend (VAT-exclusive base by default)
 * @param {object} [opts]
 * @param {number} [opts.pointsPerUnit=1]  points per 1 unit (SAR) of spend
 * @param {number} [opts.tierMultiplier=1] multiplier from the client's tier
 * @returns {number} integer points (floored)
 */
function earnPoints(exVatAmount, { pointsPerUnit = 1, tierMultiplier = 1 } = {}) {
  const base = toNum(exVatAmount);
  const per = toNum(pointsPerUnit);
  const mult = toNum(tierMultiplier);
  const raw = base * per * mult;
  if (!(raw > 0)) return 0;
  return Math.floor(raw);
}

/**
 * Convert a point balance to its SAR store-credit value.
 *   credit = points × rate     (e.g. rate 0.01 ⇒ 100 pts = 1 SAR)
 * @param {number} points integer point count
 * @param {number} rate   SAR value of one point
 * @returns {number} credit value in SAR (never negative)
 */
function pointsToCredit(points, rate) {
  const p = toInt(points);
  const r = toNum(rate);
  const val = p * r;
  return val > 0 ? val : 0;
}

/**
 * Fold an append-only ledger into current balances.
 * @param {Array<object>} ledger entries with signed `points` / `credit` deltas
 * @returns {{ points:number, credit:number }} non-negative balances
 */
function ledgerBalance(ledger) {
  let points = 0;
  let credit = 0;
  if (Array.isArray(ledger)) {
    for (const entry of ledger) {
      if (!entry || typeof entry !== 'object') continue;
      points += toInt(entry.points);
      credit += toNum(entry.credit);
      // Clamp after every entry: a corrupt/hand-edited ledger can never make a
      // reported balance go negative (see module-level non-negativity rule).
      if (points < 0) points = 0;
      if (credit < 0) credit = 0;
    }
  }
  return { points, credit };
}

/**
 * Build an 'earn' ledger entry for a completed+paid order.
 * @param {object} args
 * @param {string} [args.orderId]
 * @param {number} args.exVatAmount       countable (ex-VAT) spend
 * @param {number} [args.pointsPerUnit=1]
 * @param {number} [args.tierMultiplier=1]
 * @param {number|string} [args.ts]
 * @returns {object} ledger entry (type 'earn', points ≥ 0, credit 0)
 */
function earnEntry({ orderId, exVatAmount, pointsPerUnit = 1, tierMultiplier = 1, ts } = {}) {
  const points = earnPoints(exVatAmount, { pointsPerUnit, tierMultiplier });
  return { type: 'earn', points, credit: 0, orderId, ts };
}

/**
 * Build a 'redeem' entry (negative deltas) for points and/or credit, rejecting
 * any redemption that would exceed the available balance.
 *
 * Pass the current balance directly, OR pass the full ledger as the first arg
 * and the request as the second — both forms are supported:
 *   redeemEntry({ points, credit, orderId, ts }, balance)
 *   redeemEntry(ledger, { points, credit, orderId, ts })
 *
 * @returns {object} ledger entry (type 'redeem', points ≤ 0, credit ≤ 0)
 * @throws if requested points/credit exceed the available balance
 */
function redeemEntry(arg1, arg2) {
  let request;
  let balance;
  // Disambiguate the two call shapes: a ledger is an Array.
  if (Array.isArray(arg1)) {
    request = arg2 || {};
    balance = ledgerBalance(arg1);
  } else {
    request = arg1 || {};
    balance = arg2 && typeof arg2 === 'object'
      ? { points: toInt(arg2.points), credit: toNum(arg2.credit) }
      : { points: 0, credit: 0 };
  }

  const reqPoints = toInt(request.points);
  const reqCredit = toNum(request.credit);
  if (reqPoints < 0 || reqCredit < 0) {
    throw new Error('redeemEntry: request amounts must be non-negative');
  }
  if (reqPoints === 0 && reqCredit === 0) {
    throw new Error('redeemEntry: nothing to redeem');
  }
  if (reqPoints > balance.points) {
    throw new Error(`redeemEntry: insufficient points (have ${balance.points}, need ${reqPoints})`);
  }
  if (reqCredit > balance.credit) {
    throw new Error(`redeemEntry: insufficient credit (have ${balance.credit}, need ${reqCredit})`);
  }

  return {
    type: 'redeem',
    points: -reqPoints,
    credit: -reqCredit,
    orderId: request.orderId,
    ts: request.ts,
  };
}

/**
 * Build a 'referral' credit entry (single-sided: credits the referred client).
 * @param {object} args
 * @param {string} args.referredClientId
 * @param {number} args.credit  SAR credit to award (clamped ≥ 0)
 * @param {number|string} [args.ts]
 * @returns {object} ledger entry (type 'referral', credit ≥ 0, points 0)
 */
function referralEntry({ referredClientId, credit, ts } = {}) {
  const amount = toNum(credit);
  return {
    type: 'referral',
    points: 0,
    credit: amount > 0 ? amount : 0,
    referredClientId,
    ts,
  };
}

/**
 * Build a 'clawback' entry removing points proportional to a refunded fraction.
 *   removed = floor(originalEarnPoints × clamp(refundFraction, 0..1))
 * The delta is negative; removal is capped at the originally-earned amount so a
 * full refund (fraction 1) reverses exactly what was earned, never more.
 *
 * @param {object} args
 * @param {number} args.originalEarnPoints points originally earned on the order
 * @param {number} args.refundFraction     fraction refunded (0..1)
 * @param {number|string} [args.ts]
 * @returns {object} ledger entry (type 'clawback', points ≤ 0, credit 0)
 */
function clawbackOnRefund({ originalEarnPoints, refundFraction, ts } = {}) {
  const earned = toInt(originalEarnPoints);
  let frac = toNum(refundFraction);
  if (frac < 0) frac = 0;
  if (frac > 1) frac = 1;
  const removed = earned > 0 ? Math.floor(earned * frac) : 0;
  return { type: 'clawback', points: removed === 0 ? 0 : -removed, credit: 0, ts };
}

module.exports = {
  earnPoints,
  pointsToCredit,
  ledgerBalance,
  earnEntry,
  redeemEntry,
  referralEntry,
  clawbackOnRefund,
};
