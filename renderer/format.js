/**
 * Pure number, money, CSV, and catalog pricing helpers (renderer + node:test).
 */
(function (global) {
  function num(v, fallback = 0) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function clampPositive(v) {
    return Math.max(0, num(v, 0));
  }

  function fmtMoney(n) {
    return (Math.round((+n || 0) * 100) / 100).toFixed(2);
  }

  /**
   * Thousands-grouped number for display.
   *
   * Bare `n.toLocaleString()` inherits the SYSTEM locale, so on a machine set to
   * Saudi Arabia it renders Arabic-Indic digits — ١٨٬٧٥٠ with U+066B/U+066C
   * separators — even when Khayt itself is in English. Sampling live Saudi
   * products (Al Rajhi, SNB, Absher, Tawakkalna, Salla, Zid, STC) found Western
   * digits essentially everywhere, including in Hijri dates, so pin them rather
   * than inherit whatever the OS happens to be set to.
   */
  function fmtCount(n) {
    const v = +n || 0;
    if (!Number.isFinite(v)) return '0';
    try { return v.toLocaleString('en-US'); } catch (e) { return String(v); }
  }

  function computeUnitPrice(p) {
    if (p?.unitPrice && +p.unitPrice > 0) return +p.unitPrice;
    const qty = +p?.quantity || 1;
    return (+p?.amount || 0) / qty;
  }

  /** Neutralize CSV formula injection (=, +, -, @, tab, CR). */
  function csvFormulaNeutralize(v) {
    const s = String(v ?? '');
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }

  const api = { num, clampPositive, fmtMoney, fmtCount, computeUnitPrice, csvFormulaNeutralize };

  global.KhaytFormat = api;
  global.num = num;
  global.clampPositive = clampPositive;
  global.fmtMoney = fmtMoney;
  global.fmtCount = fmtCount;
  global.computeUnitPrice = computeUnitPrice;
  global.csvFormulaNeutralize = csvFormulaNeutralize;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
