/**
 * Multi-currency catalogue and conversion (uses global settings, clients, fmtMoney).
 */
(function (global) {
  const CURRENCIES = {
    SAR: { symbol: 'SAR', label: 'Saudi Riyal (SAR)', pos: 'after' },
    AED: { symbol: 'AED', label: 'UAE Dirham (AED)', pos: 'after' },
    KWD: { symbol: 'KWD', label: 'Kuwaiti Dinar (KWD)', pos: 'after' },
    BHD: { symbol: 'BHD', label: 'Bahraini Dinar (BHD)', pos: 'after' },
    QAR: { symbol: 'QAR', label: 'Qatari Riyal (QAR)', pos: 'after' },
    OMR: { symbol: 'OMR', label: 'Omani Rial (OMR)', pos: 'after' },
    EGP: { symbol: 'EGP', label: 'Egyptian Pound (EGP)', pos: 'after' },
    MAD: { symbol: 'MAD', label: 'Moroccan Dirham (MAD)', pos: 'after' },
    TND: { symbol: 'TND', label: 'Tunisian Dinar (TND)', pos: 'after' },
    DZD: { symbol: 'DZD', label: 'Algerian Dinar (DZD)', pos: 'after' },
    IQD: { symbol: 'IQD', label: 'Iraqi Dinar (IQD)', pos: 'after' },
    JOD: { symbol: 'JOD', label: 'Jordanian Dinar (JOD)', pos: 'after' },
    USD: { symbol: '$', label: 'US Dollar (USD)', pos: 'before' },
    EUR: { symbol: '€', label: 'Euro (EUR)', pos: 'before' },
    GBP: { symbol: '£', label: 'British Pound (GBP)', pos: 'before' },
    CAD: { symbol: 'CA$', label: 'Canadian Dollar (CAD)', pos: 'before' },
    AUD: { symbol: 'A$', label: 'Australian Dollar (AUD)', pos: 'before' },
    CHF: { symbol: 'CHF', label: 'Swiss Franc (CHF)', pos: 'before' },
    TRY: { symbol: '₺', label: 'Turkish Lira (TRY)', pos: 'before' },
    INR: { symbol: '₹', label: 'Indian Rupee (INR)', pos: 'before' },
    JPY: { symbol: '¥', label: 'Japanese Yen (JPY)', pos: 'before' },
    CNY: { symbol: '¥', label: 'Chinese Yuan (CNY)', pos: 'before' },
    KRW: { symbol: '₩', label: 'South Korean Won (KRW)', pos: 'before' },
    BRL: { symbol: 'R$', label: 'Brazilian Real (BRL)', pos: 'before' },
    MXN: { symbol: '$', label: 'Mexican Peso (MXN)', pos: 'before' },
    ZAR: { symbol: 'R', label: 'South African Rand (ZAR)', pos: 'before' },
    NGN: { symbol: '₦', label: 'Nigerian Naira (NGN)', pos: 'before' },
  };

  const fmtMoney = (n) => global.fmtMoney(n);

  function fmtPrice(n) {
    const cur = CURRENCIES[global.settings?.currency] || CURRENCIES.SAR;
    const num = fmtMoney(n);
    return cur.pos === 'before' ? `${cur.symbol}\u202f${num}` : `${num}\u202f${cur.symbol}`;
  }

  function currencySymbol() {
    return (CURRENCIES[global.settings?.currency] || CURRENCIES.SAR).symbol;
  }

  function fmtMoneyIn(n, currencyCode) {
    const cur = CURRENCIES[currencyCode] || CURRENCIES[global.settings?.currency] || CURRENCIES.SAR;
    const val = fmtMoney(n);
    return cur.pos === 'before' ? `${cur.symbol} ${val}` : `${val} ${cur.symbol}`;
  }

  function clientCurrency(clientId) {
    const settings = global.settings || {};
    const clients = global.clients || [];
    if (!clientId) return settings.currency || 'SAR';
    const c = clients.find((x) => x.id === clientId);
    return c && c.currency ? c.currency : settings.currency || 'SAR';
  }

  /** Resolve an order's currency: an explicit per-order override wins, else the
   *  client's currency, else the shop base. Lets a single quote be priced in a
   *  currency that differs from the client default (or for a client-less quote). */
  function orderCurrency(o) {
    if (o && o.currency && CURRENCIES[o.currency]) return o.currency;
    return clientCurrency(o && o.clientId);
  }

  function convertToBase(amount, fromCurrency) {
    const settings = global.settings || {};
    const base = settings.currency || 'SAR';
    if (!fromCurrency || fromCurrency === base) return +amount || 0;
    const rate = (settings.exchangeRates || {})[fromCurrency];
    if (!rate || rate <= 0) return +amount || 0;
    return (+amount || 0) * rate;
  }

  function orderRevenueBase(o) {
    return convertToBase(+o.price || 0, orderCurrency(o));
  }

  /** Total credit notes issued against an order, in the ORDER's own currency. */
  function orderCreditedRaw(o) {
    return ((o && o.creditNotes) || []).reduce((s, cn) => s + (+cn.amount || 0), 0);
  }

  /** Total credit notes issued against an order, in the shop's base currency. */
  function orderCreditedBase(o) {
    return convertToBase(orderCreditedRaw(o), orderCurrency(o));
  }

  /**
   * Revenue actually EARNED on an order: the price less any credit notes.
   *
   * orderRevenueBase is the gross invoiced figure and is right for reproducing a
   * document (the invoice, a statement's charges line, a journal's invoice
   * entry). It is wrong for any question of the form "how much did the shop
   * earn", because a refund never touches price or paidAmount —
   * generateCreditNote records the credit only in creditNotes[], and sets
   * creditedAt only on a FULL credit. A PARTIAL refund therefore leaves a plain
   * completed order with no voidedAt and no other marker, so a status filter
   * books the full price as revenue and the full VAT with it.
   *
   * giftCardDiscount is deliberately NOT subtracted. Issuing a gift card does
   * not create an order (giftCards[] is its own collection), so redemption is
   * the only moment that money can be recognised as revenue — netting it here
   * would make it revenue nowhere at all. Every other path already treats it as
   * a tender, not a discount: payStatus adds it to cash paid, the client
   * statement totals it as its own settlement line, and the journal clears it
   * against the gift-card liability. Credit notes are the opposite: a genuine
   * reduction of the sale.
   */
  function orderNetRevenueBase(o) {
    /* A print the shop marked as not business earns nothing, everywhere at once.
     *
     * This function is the single chokepoint for revenue in stats — 53 call
     * sites, and NOT used by any order's own invoice, statement or work order,
     * which read `price` directly. So gating here excludes a personal print from
     * every reported figure without altering the document for the one order that
     * might still have a price on it.
     *
     * lib/business-scope.js says why the flag stops at money and trade counts:
     * the print still wears the nozzle and still occupies the machine. */
    if (typeof KhaytBusinessScope !== 'undefined' && !KhaytBusinessScope.countsForBusiness(o)) return 0;
    // A parent that was split into sub-orders has been replaced by them, and they
    // carry its price between them. Counting it too reports the job twice.
    if (typeof KhaytBusinessScope !== 'undefined' && KhaytBusinessScope.isSuperseded(o)) return 0;
    return Math.max(0, orderRevenueBase(o) - orderCreditedBase(o));
  }

  function orderOwedBase(o) {
    // Nothing is owed on a print that was never sold.
    if (typeof KhaytBusinessScope !== 'undefined' && !KhaytBusinessScope.countsForBusiness(o)) return 0;
    // Nor on a parent whose sub-orders now carry the debt between them.
    if (typeof KhaytBusinessScope !== 'undefined' && KhaytBusinessScope.isSuperseded(o)) return 0;
    const cur = orderCurrency(o);
    // Credit notes reduce what's owed (refund / cancelled charge).
    return Math.max(
      0,
      convertToBase(+o.price || 0, cur) -
        convertToBase(+o.paidAmount || 0, cur) -
        convertToBase(+o.giftCardDiscount || 0, cur) -
        orderCreditedBase(o),
    );
  }

  function refreshCurrencyLabels() {
    const sym = currencySymbol();
    document.querySelectorAll('[data-i18n="common.currency"]').forEach((el) => {
      el.textContent = sym;
    });
  }

  const api = {
    CURRENCIES,
    fmtPrice,
    currencySymbol,
    fmtMoneyIn,
    clientCurrency,
    orderCurrency,
    convertToBase,
    orderRevenueBase,
    orderCreditedRaw,
    orderCreditedBase,
    orderNetRevenueBase,
    orderOwedBase,
    refreshCurrencyLabels,
  };

  global.CURRENCIES = CURRENCIES;
  Object.assign(global, api);
  global.refreshCurrencyLabels = refreshCurrencyLabels;
  global.KhaytCurrency = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
