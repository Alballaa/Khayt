'use strict';

/**
 * Cost → price. The one place that decides what a customer is asked to pay.
 *
 * This arithmetic lived inside `renderer/build.js`, interleaved with reading
 * `<input>` values and writing `textContent`. That made it unreachable from
 * anywhere else: the LAN quote endpoint can cost a part with the desktop's own
 * maths (`lib/calculator-cost.js`) but could not turn that cost into a
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
 * PERCENTAGE EXTRAS (added 2026-08-09). An extra line may carry `pct` instead of
 * `amount` — a marketplace fee is a percentage, not a number the shop can know
 * before the price exists. Two decisions, both load-bearing:
 *
 *   The base is `subtotal + rushFee + shipping` — everything the buyer pays
 *   before extras. That is what Etsy and Shopify actually charge against: their
 *   fee includes the shipping the buyer was charged. Taking a percentage of the
 *   subtotal alone would under-state every quote that ships.
 *
 *   Percentages never compound. Every percentage line uses that same base, so
 *   two lines of 5% are 10%, not 10.25%, and REORDERING THE LINES CANNOT CHANGE
 *   THE TOTAL. A quote whose total depends on the order rows were typed in is
 *   indefensible when a customer asks why.
 *
 * A line is a percentage if and only if it carries a positive `pct`; otherwise
 * it is `amount`, exactly as before. Existing quotes have no `pct` and are
 * arithmetically untouched — test/pricing.test.js pins that against the original
 * formula over the same 4,000 randomised cases.
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
/**
 * A line is a percentage only when it says so with a positive `pct`.
 *
 * Absence is what every existing quote has, so absence must keep meaning
 * "fixed". A zero or negative pct is not a percentage line either — it would
 * contribute nothing and hide an `amount` that was meant to apply.
 */
function isPercentLine(l) {
  return !!l && num(l.pct) > 0;
}

function quoteTotal(input) {
  const i = input || {};
  const business = i.business !== false;
  const qty = Math.max(1, Math.round(num(i.qty, 1)));
  const baseCost = clampPositive(i.baseCost);

  const margin = business ? clampPositive(i.margin) : 0;
  const discountPct = business ? Math.min(100, clampPositive(i.discountPct)) : 0;
  const rushPct = business && i.rushEnabled ? clampPositive(i.rushPct) : 0;
  const shipping = business ? clampPositive(i.shippingCost) : 0;
  const lines = business && Array.isArray(i.extraLines) ? i.extraLines : [];
  // Fixed lines total as they always have. Percentage lines are resolved below,
  // once there is a base to take a percentage OF.
  const extrasFixed = lines.reduce(
    (s, l) => s + (isPercentLine(l) ? 0 : clampPositive(l && l.amount)), 0);

  const tier = i.priceTier;
  const priceBeforeDiscount = tier
    ? clampPositive(tier.pricePerUnit) * qty
    : baseCost * (1 + margin / 100);

  const discountAmount = priceBeforeDiscount * discountPct / 100;
  const subtotal = priceBeforeDiscount - discountAmount;
  const rushFee = subtotal * rushPct / 100;

  // What the buyer pays before extras — the base every percentage line uses.
  // Fixed extras are NOT in it, or a percentage would depend on how many fixed
  // lines happened to be above it.
  const extrasBase = subtotal + rushFee + shipping;
  const extrasPercent = lines.reduce(
    (s, l) => s + (isPercentLine(l) ? extrasBase * clampPositive(l.pct) / 100 : 0), 0);
  const extras = extrasFixed + extrasPercent;

  return {
    priceBeforeDiscount,
    discountAmount,
    subtotal,
    rushFee,
    shipping,
    extras,
    // Broken out so a screen can show "6.5% (SAR 12.50)" the way the rush chip
    // already does, without recomputing the base and risking a different answer.
    extrasFixed,
    extrasPercent,
    extrasBase,
    total: subtotal + rushFee + shipping + extras,
  };
}

/**
 * Resolve each line to money, for rendering.
 *
 * Returns the SAME numbers quoteTotal used — a second computation in the view is
 * how a breakdown ends up not adding up to the total above it.
 */
function resolveExtraLines(lines, extrasBase) {
  const base = clampPositive(extrasBase);
  return (Array.isArray(lines) ? lines : []).map((l) => (isPercentLine(l)
    ? { label: (l && l.label) || '', pct: clampPositive(l.pct), amount: base * clampPositive(l.pct) / 100 }
    : { label: (l && l.label) || '', pct: null, amount: clampPositive(l && l.amount) }));
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

const pricingApi = { quoteTotal, activePriceTier, resolveExtraLines, isPercentLine };
if (typeof module !== 'undefined' && module.exports) module.exports = pricingApi;
if (typeof globalThis !== 'undefined') globalThis.KhaytPricing = pricingApi;

})();
