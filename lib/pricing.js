'use strict';

/**
 * Cost → price. The one place that decides what a customer is asked to pay.
 *
 * This arithmetic lived inside `renderer/build.js`, interleaved with reading
 * `<input>` values and writing `textContent`. That made it unreachable from
 * anywhere else: the LAN quote endpoint can cost a part with the desktop's own
 * maths (`renderer/calculator-cost.js`) but could not turn that cost into a
 * price without reimplementing this — and a second implementation means two
 * prices for one job, with the wrong one being whichever the shop happens to be
 * looking at.
 *
 * Extracted verbatim, not redesigned. The order of operations is load-bearing
 * and is preserved exactly:
 *
 *     priceBeforeDiscount = tier ? tier.pricePerUnit × qty : baseCost × (1 + margin%)
 *     discount            = priceBeforeDiscount × discount%
 *     subtotal            = priceBeforeDiscount − discount
 *     rushFee             = subtotal × rush%          ← after the discount, not before
 *     total               = subtotal + rushFee + shipping + extras
 *
 * Rush is charged on the discounted subtotal, and shipping and extras are added
 * after it, so neither is discounted or rushed. Those are business decisions
 * already baked into shipped quotes; changing them here would silently reprice
 * every future job.
 *
 * VAT is deliberately absent — it is applied at invoicing, not in the
 * calculator, so a quote total is pre-VAT and stays that way.
 */

// Wrapped, like every other lib/ module the renderer loads. Plain <script> tags
// share one global scope, so a top-level `const api` here collides with the same
// name in another module and the whole file fails to parse with
// "Identifier 'api' has already been declared" — taking its exports with it.
// Caught by scripts/e2e-populated-screens-smoke.mjs, which is the only check
// that loads every script together the way the app does.
(function () {

/** `num()` from renderer/format.js, duplicated so this file has no DOM lineage. */
function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
const clampPositive = (v) => Math.max(0, num(v, 0));

/**
 * @param {object} input
 * @param {number} input.baseCost      Total COST of the line or cart (already × qty).
 * @param {number} [input.qty=1]       Units — only used when a price tier applies.
 * @param {number} [input.margin=0]    Percent markup on cost. Ignored when a tier applies.
 * @param {{pricePerUnit:number}|null} [input.priceTier]  Fixed per-unit price that
 *        REPLACES cost-plus-margin. The caller decides whether it applies: in the
 *        desktop a tier is honoured only for a single live part, never for a
 *        multi-line cart, and that rule stays with the caller that knows it.
 * @param {number} [input.discountPct=0]
 * @param {boolean} [input.rushEnabled=false]
 * @param {number} [input.rushPct=0]
 * @param {number} [input.shippingCost=0]
 * @param {Array<{amount:number}>} [input.extraLines=[]]
 * @param {boolean} [input.business=true] False for the commerce-free (hobbyist)
 *        experience, which prices nothing: no margin, discount, fees or extras,
 *        so the "total" is pure cost. Zeroing here rather than at each call site
 *        is what stops a business surface leaking into that build.
 * @returns {{priceBeforeDiscount:number, discountAmount:number, subtotal:number,
 *            rushFee:number, shipping:number, extras:number, total:number}}
 */
function quoteTotal(input) {
  const i = input || {};
  const business = i.business !== false;
  const qty = Math.max(1, Math.round(num(i.qty, 1)));
  const baseCost = clampPositive(i.baseCost);

  const margin = business ? clampPositive(i.margin) : 0;
  const discountPct = business ? Math.min(100, clampPositive(i.discountPct)) : 0;
  const rushPct = business && i.rushEnabled ? clampPositive(i.rushPct) : 0;
  const shipping = business ? clampPositive(i.shippingCost) : 0;
  const extras = business
    ? (Array.isArray(i.extraLines) ? i.extraLines : [])
      .reduce((s, l) => s + clampPositive(l && l.amount), 0)
    : 0;

  const tier = i.priceTier;
  const priceBeforeDiscount = tier
    ? clampPositive(tier.pricePerUnit) * qty
    : baseCost * (1 + margin / 100);

  const discountAmount = priceBeforeDiscount * discountPct / 100;
  const subtotal = priceBeforeDiscount - discountAmount;
  const rushFee = subtotal * rushPct / 100;

  return {
    priceBeforeDiscount,
    discountAmount,
    subtotal,
    rushFee,
    shipping,
    extras,
    total: subtotal + rushFee + shipping + extras,
  };
}

/**
 * The tier that applies at this quantity, or null.
 *
 * Tiers with a zero or missing minQty/pricePerUnit are ignored — a half-filled
 * tier row in the UI must not silently price a job at zero.
 */
function activePriceTier(tiers, qty) {
  const usable = (Array.isArray(tiers) ? tiers : [])
    .filter((t) => t && num(t.minQty) > 0 && num(t.pricePerUnit) > 0);
  if (!usable.length) return null;
  const q = Math.max(1, Math.round(num(qty, 1)));
  return [...usable].sort((a, b) => num(b.minQty) - num(a.minQty))
    .find((t) => q >= num(t.minQty)) || null;
}

const pricingApi = { quoteTotal, activePriceTier };
if (typeof module !== 'undefined' && module.exports) module.exports = pricingApi;
if (typeof globalThis !== 'undefined') globalThis.KhaytPricing = pricingApi;

})();
