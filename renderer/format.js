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

  const api = { num, clampPositive, fmtMoney, computeUnitPrice, csvFormulaNeutralize };

  global.KhaytFormat = api;
  global.num = num;
  global.clampPositive = clampPositive;
  global.fmtMoney = fmtMoney;
  global.computeUnitPrice = computeUnitPrice;
  global.csvFormulaNeutralize = csvFormulaNeutralize;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
