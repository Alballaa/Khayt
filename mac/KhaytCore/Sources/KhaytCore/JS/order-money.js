'use strict';

/**
 * What one order is worth, and what is still owed on it, in the shop's own
 * currency.
 *
 * This is the single chokepoint for revenue in every reported figure — 53 call
 * sites — and it lived in `renderer/currency.js`, reaching for `global.settings`
 * and `global.clients`. That put it out of reach of anything that is not the
 * renderer, and the Mac app needed exactly these answers for its dashboard. The
 * alternative was a second implementation of "what counts as revenue", which is
 * how two apps come to disagree about a shop's year.
 *
 * So the bodies moved here and take their context as an argument.
 * `renderer/currency.js` keeps the same function names and passes its globals
 * in, so every one of those call sites is untouched.
 *
 * PURE: no globals of its own, no clock. `KhaytBusinessScope` is consulted the
 * way `currency.js` consulted it — through a `typeof` guard — because it is a
 * sibling `lib/` module present in both apps, and a build without it should
 * behave exactly as it did before.
 *
 * ── THE RULES, AND WHY EACH ONE IS HERE ────────────────────────────────────
 * A print marked "not business" earns nothing, everywhere at once — but still
 * wears the nozzle, which is why the flag stops at money.
 *
 * A parent order that was split into sub-orders has been replaced by them and
 * they carry its price between them; counting it too reports the job twice.
 *
 * Credit notes reduce a sale. Gift cards do NOT — a gift card is a tender, not
 * a discount, and netting it here would make it revenue nowhere at all. It pays
 * an order DOWN, so it appears in `owed` and not in `revenue`.
 */
(function (global) {

  const ctxOf = (ctx) => (ctx && typeof ctx === 'object' ? ctx : {});
  const settingsOf = (ctx) => ctxOf(ctx).settings || {};
  const clientsOf = (ctx) => {
    const c = ctxOf(ctx).clients;
    return Array.isArray(c) ? c : [];
  };

  const scope = () => (typeof globalThis !== 'undefined' ? globalThis.KhaytBusinessScope : undefined);

  /** Does this order count towards the shop's money at all? */
  function earns(o) {
    const S = scope();
    if (!S) return true;
    return S.countsForBusiness(o) && !S.isSuperseded(o);
  }

  /**
   * Into the shop's base currency.
   *
   * An unknown or non-positive rate returns the amount UNCONVERTED rather than
   * zero. Reporting a foreign order as worth nothing because a rate is missing
   * is the worse of the two wrong answers: it hides revenue instead of
   * misvaluing it, and a shop notices a wrong total sooner than a missing one.
   */
  function convertToBase(amount, fromCurrency, ctx) {
    const settings = settingsOf(ctx);
    const base = settings.currency || 'SAR';
    if (!fromCurrency || fromCurrency === base) return +amount || 0;
    const rate = (settings.exchangeRates || {})[fromCurrency];
    if (!rate || rate <= 0) return +amount || 0;
    return (+amount || 0) * rate;
  }

  function clientCurrency(clientId, ctx) {
    const settings = settingsOf(ctx);
    if (!clientId) return settings.currency || 'SAR';
    const c = clientsOf(ctx).find((x) => x && x.id === clientId);
    return (c && c.currency) ? c.currency : (settings.currency || 'SAR');
  }

  /**
   * An explicit per-order currency wins, then the client's, then the shop's.
   *
   * `known` is the caller's currency catalogue — `currency.js` passes CURRENCIES
   * so an order carrying a code the app does not support falls through to the
   * client rather than being trusted. Omitted, any non-empty code is accepted.
   */
  function orderCurrency(o, ctx, known) {
    const code = o && o.currency;
    if (code && (!known || known[code])) return code;
    return clientCurrency(o && o.clientId, ctx);
  }

  /** The gross invoiced figure. Right for a document, wrong for "what did we earn". */
  function orderRevenueBase(o, ctx, known) {
    return convertToBase(+((o && o.price)) || 0, orderCurrency(o, ctx, known), ctx);
  }

  function orderCreditedRaw(o) {
    return ((o && o.creditNotes) || []).reduce((s, cn) => s + (+((cn && cn.amount)) || 0), 0);
  }

  function orderCreditedBase(o, ctx, known) {
    return convertToBase(orderCreditedRaw(o), orderCurrency(o, ctx, known), ctx);
  }

  /** What the shop actually earned: the price, less credit notes. */
  function orderNetRevenueBase(o, ctx, known) {
    if (!earns(o)) return 0;
    return Math.max(0, orderRevenueBase(o, ctx, known) - orderCreditedBase(o, ctx, known));
  }

  /** What is still outstanding, in the order's OWN currency. */
  function orderOwedRaw(o) {
    if (!earns(o)) return 0;
    return Math.max(
      0,
      (+((o && o.price)) || 0) - (+((o && o.paidAmount)) || 0)
        - (+((o && o.giftCardDiscount)) || 0) - orderCreditedRaw(o),
    );
  }

  /** What is still outstanding, in the shop's base currency. */
  function orderOwedBase(o, ctx, known) {
    if (!earns(o)) return 0;
    const cur = orderCurrency(o, ctx, known);
    return Math.max(
      0,
      convertToBase(+((o && o.price)) || 0, cur, ctx)
        - convertToBase(+((o && o.paidAmount)) || 0, cur, ctx)
        - convertToBase(+((o && o.giftCardDiscount)) || 0, cur, ctx)
        - orderCreditedBase(o, ctx, known),
    );
  }

  const api = {
    convertToBase, clientCurrency, orderCurrency,
    orderRevenueBase, orderCreditedRaw, orderCreditedBase,
    orderNetRevenueBase, orderOwedRaw, orderOwedBase,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytOrderMoney = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
