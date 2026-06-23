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

  function orderOwedBase(o) {
    const cur = orderCurrency(o);
    // Credit notes reduce what's owed (refund / cancelled charge).
    const credited = (o.creditNotes || []).reduce((s, cn) => s + (+cn.amount || 0), 0);
    return Math.max(
      0,
      convertToBase(+o.price || 0, cur) -
        convertToBase(+o.paidAmount || 0, cur) -
        convertToBase(+o.giftCardDiscount || 0, cur) -
        convertToBase(credited, cur),
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
    orderOwedBase,
    refreshCurrencyLabels,
  };

  global.CURRENCIES = CURRENCIES;
  Object.assign(global, api);
  global.refreshCurrencyLabels = refreshCurrencyLabels;
  global.KhaytCurrency = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
