/**
 * Pure part costing helpers (reads global inventory + settings at call time).
 */
(function (global) {
  function computePartBaseCost(part) {
    const inventory = global.inventory || [];
    const settings = global.settings || {};

    const spoolCost = Math.max(0, +part.spoolCost || 0);
    const spoolWeight = Math.max(1, +part.spoolWeight || 1);
    const printWeight = Math.max(0, +part.printWeight || 0);
    const isResin = (() => {
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

  function computePartBreakdown(part) {
    const inventory = global.inventory || [];
    const spoolCost = Math.max(0, +part.spoolCost || 0);
    const spoolWeight = Math.max(1, +part.spoolWeight || 1);
    const printWeight = Math.max(0, +part.printWeight || 0);
    const isResin = part.filamentId
      ? inventory.find((i) => i.id === part.filamentId)?.materialType === 'resin'
      : false;
    const supportWt = Math.max(0, +part.supportWeight || 0);
    const material = isResin
      ? (spoolCost / 1000) * (printWeight + supportWt)
      : (spoolCost / spoolWeight) * (printWeight + supportWt);
    const printTime = Math.max(0, +part.printTime || 0);
    const machine =
      printTime * Math.max(0, +part.wearRate || 0) +
      printTime * (Math.max(0, +part.powerDraw || 0) / 1000) * Math.max(0, +part.elecRate || 0);
    const prepTime = Math.max(0, +part.prepTime || 0);
    const postTime = Math.max(0, +part.postTime || 0);
    const labor = (prepTime + postTime) * Math.max(0, +part.laborRate || 0);
    const base = material + machine + labor;
    const buffer = base * (Math.max(0, +part.failureRate || 0) / 100);
    return { material, machine, labor, buffer };
  }

  const api = { computePartBaseCost, getActivePriceTier, computePartBreakdown };

  Object.assign(global, api);
  global.KhaytCalculatorCost = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
