/**
 * Pure part costing helpers (reads global inventory + settings at call time).
 */
(function (global) {
  /**
   * Per-unit cost of a part.
   *
   * `ctx` lets a caller supply the inventory and settings explicitly instead of
   * reading them off the global — the same pattern computeComponentsCost()
   * already uses below, and for the same reason. The renderer calls this with no
   * ctx and is unaffected; the LAN server needs it, because there is no renderer
   * global in the main process and quoting from the phone must run THIS code
   * rather than a second implementation. Two implementations means two prices
   * for one part, which is worse than not quoting on the phone at all.
   */
  function computePartBaseCost(part, ctx) {
    const inventory = (ctx && ctx.inventory) || global.inventory || [];
    const settings = (ctx && ctx.settings) || global.settings || {};

    const spoolCost = Math.max(0, +part.spoolCost || 0);
    const spoolWeight = Math.max(1, +part.spoolWeight || 1);
    const printWeight = Math.max(0, +part.printWeight || 0);
    const isResin = (() => {
      // A blended multicolour part carries a pre-summed spoolCost/spoolWeight
      // (both in grams), so its material cost is the FDM ratio by construction —
      // never the resin per-kg branch, even if its fallback filamentId is resin.
      if (part.colours && part.colours.length) return false;
      if (part.filamentId) {
        const invItem = inventory.find((i) => i.id === part.filamentId);
        if (invItem) return invItem.materialType === 'resin';
      }
      return false;
    })();
    const supportWeight = Math.max(0, +part.supportWeight || 0);
    const materialCost = isResin
      ? (spoolCost / 1000) * (printWeight + supportWeight)
      : (spoolCost / spoolWeight) * (printWeight + supportWeight);

    const printTime = Math.max(0, +part.printTime || 0);
    const wearCost = printTime * Math.max(0, +part.wearRate || 0);

    const powerDraw = Math.max(0, +part.powerDraw || 0);
    const elecRate = Math.max(0, +part.elecRate || 0);
    const powerCost = printTime * (powerDraw / 1000) * elecRate;

    const prepTime = Math.max(0, +part.prepTime || 0);
    const postTime = Math.max(0, +part.postTime || 0);
    const laborRate = Math.max(0, +part.laborRate || 0);
    const laborCost = (prepTime + postTime) * laborRate;

    const failureRate = Math.max(0, +part.failureRate || 0);
    let extraMatCost = 0;
    for (const em of part.extraMaterials || []) {
      if (!em.material || !em.weight) continue;
      const invItem = inventory.find((i) => i.material === em.material);
      if (invItem && invItem.cost > 0 && invItem.weight > 0) {
        const pricePerKg = (invItem.cost / invItem.weight) * 1000;
        extraMatCost += (em.weight / 1000) * pricePerKg;
      }
    }
    const packagingCost =
      Math.max(0, +settings.defaultPackagingCost || 0) / Math.max(1, +part.qty || 1);
    const baseCost = materialCost + wearCost + powerCost + laborCost + extraMatCost + packagingCost;
    return baseCost + baseCost * (failureRate / 100);
  }

  function getActivePriceTier(part) {
    if (!part.priceTiers || part.priceTiers.length === 0 || !part.qty) return null;
    const sorted = [...part.priceTiers].sort((a, b) => a.minQty - b.minQty);
    return [...sorted].reverse().find((ti) => +part.qty >= +ti.minQty) || null;
  }

  function computePartBreakdown(part, ctx) {
    const inventory = (ctx && ctx.inventory) || global.inventory || [];
    const settings = (ctx && ctx.settings) || global.settings || {};
    const spoolCost = Math.max(0, +part.spoolCost || 0);
    const spoolWeight = Math.max(1, +part.spoolWeight || 1);
    const printWeight = Math.max(0, +part.printWeight || 0);
    const isResin = (part.colours && part.colours.length)
      ? false
      : (part.filamentId
        ? inventory.find((i) => i.id === part.filamentId)?.materialType === 'resin'
        : false);
    const supportWt = Math.max(0, +part.supportWeight || 0);
    let material = isResin
      ? (spoolCost / 1000) * (printWeight + supportWt)
      : (spoolCost / spoolWeight) * (printWeight + supportWt);
    const printTime = Math.max(0, +part.printTime || 0);
    const machine =
      printTime * Math.max(0, +part.wearRate || 0) +
      printTime * (Math.max(0, +part.powerDraw || 0) / 1000) * Math.max(0, +part.elecRate || 0);
    const prepTime = Math.max(0, +part.prepTime || 0);
    const postTime = Math.max(0, +part.postTime || 0);
    const labor = (prepTime + postTime) * Math.max(0, +part.laborRate || 0);
    // Mirror computePartBaseCost so the live preview equals the committed cart cost:
    // include extra materials + packaging, and apply the failure buffer on the SAME base.
    let extraMatCost = 0;
    for (const em of part.extraMaterials || []) {
      if (!em.material || !em.weight) continue;
      const invItem = inventory.find((i) => i.material === em.material);
      if (invItem && invItem.cost > 0 && invItem.weight > 0) {
        const pricePerKg = (invItem.cost / invItem.weight) * 1000;
        extraMatCost += (em.weight / 1000) * pricePerKg;
      }
    }
    const packagingCost =
      Math.max(0, +settings.defaultPackagingCost || 0) / Math.max(1, +part.qty || 1);
    // Fold extra materials + packaging into the material bucket (no separate chip);
    // this keeps the {material, machine, labor, buffer} sum == committed base cost.
    material += extraMatCost + packagingCost;
    const base = material + machine + labor;
    const buffer = base * (Math.max(0, +part.failureRate || 0) / 100);
    return { material, machine, labor, buffer };
  }

  // BOM: cost of the non-printed components of an assembly — Σ (consumable.cost × qtyPerUnit).
  // Pass the consumables collection explicitly so this is pure/testable; falls back to the
  // global `consumables` at call time when omitted (renderer usage). A deleted consumable
  // contributes 0. Does NOT multiply by assemblyQty — the per-unit component cost folds into
  // the assembly's unit price, exactly like printed-part cost.
  function computeComponentsCost(components, cons) {
    const list = Array.isArray(components) ? components : [];
    const rows = cons || (typeof consumables !== 'undefined' ? consumables : []);
    let total = 0;
    for (const comp of list) {
      if (!comp || !comp.consumableId) continue;
      const row = (rows || []).find(c => c && c.id === comp.consumableId);
      const unit = row ? Math.max(0, +row.cost || 0) : 0;
      total += unit * Math.max(0, +comp.qtyPerUnit || 0);
    }
    return +total.toFixed(4);
  }

  /**
   * What one LINE of the cart actually costs — the per-unit cost times how many units.
   *
   * computePartBaseCost() is per-UNIT by construction: packaging is divided by qty, and
   * printWeight is a single unit's weight (partGramsConsumed multiplies by qty when
   * deducting stock). Summing it across an order and comparing that to the order's
   * revenue therefore understates cost by a factor of qty on every multi-unit line.
   *
   * Mirrors partGramsConsumed() in inventory.js — same shape, same reason.
   */
  function partTotalCost(part, ctx) {
    const qty = Math.max(1, +(part && part.qty) || 1);
    return computePartBaseCost(part, ctx) * qty;
  }

  const api = { computePartBaseCost, partTotalCost, getActivePriceTier, computePartBreakdown, computeComponentsCost };

  Object.assign(global, api);
  global.KhaytCalculatorCost = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
