'use strict';

/**
 * What a finished job takes off the shelf.
 *
 * Completing an order draws its grams from the spools that printed it, its
 * glue and isopropyl from the consumables its print hours consumed, its
 * bought-in components from their rows, and one of every packaging item from
 * the box it ships in. Get this wrong in either direction and a shop is either
 * ordering filament it already has or running out of it mid-print.
 *
 * The rules lived in `renderer/inventory.js`, reading `inventory`,
 * `consumables`, `machines` and `settings` off the renderer's globals and
 * calling `toast()` and `renderInventory()` in the middle of the arithmetic.
 * That put them out of reach of the Mac app, which is why its board can show
 * where the work is piling up but cannot let you drop a card on "completed":
 * the move itself is shared (`lib/order-status.js`), but the shelf it empties
 * was not, and a completion that silently failed to deduct would be worse than
 * no drag at all.
 *
 * So the bodies moved here and take their context as an argument.
 *
 * ── WHAT IT TOUCHES ────────────────────────────────────────────────────────
 * The spools and consumable rows it is HANDED, in place, plus `order`'s two
 * already-deducted flags. Nothing else. It returns:
 *
 *   - `notices` — message codes, because this module does not know which
 *     language the shop reads.
 *   - `effects` — saving and redrawing, in the order the original did them.
 *
 * The notices keep their order relative to each other and the effects keep
 * theirs; the two streams are no longer interleaved, because the caller runs
 * them one after the other. Nothing observable depends on a toast appearing
 * between a save and a redraw.
 *
 * ── THE TWO FLAGS ARE THE WHOLE SAFETY MODEL ───────────────────────────────
 * `materialDeducted` and `packagingDeducted` are what stop a job that is
 * completed, re-opened and completed again from being charged twice. They are
 * set at the END, and `materialDeducted` is set even when nothing was actually
 * deducted — a job with no filament assigned has still had its chance.
 *
 * `packagingDeducted` is the exception and it is deliberate: a shop with no
 * packaging stock leaves the job unflagged, so the deduction happens the day
 * they stock some. That asymmetry is in the original and is preserved.
 *
 * PURE: no globals, and no clock — `ctx.today` is the local `YYYY-MM-DD` that
 * goes into each spool's usage history.
 */
(function (global) {

  /** A spool remembers its last two hundred draws and no more. */
  const USAGE_CAP = 200;

  /** Below this many grams a spool is low, when nothing more specific is set. */
  const DEFAULT_LOW_STOCK = 200;

  const ctxOf = (ctx) => (ctx && typeof ctx === 'object' ? ctx : {});
  const arrayOf = (v) => (Array.isArray(v) ? v : []);

  /**
   * Is this spool low?
   *
   * Its own reorder point first, then the shop's threshold, then 200g. One
   * definition so the banner, the row badge, the reorder list and the
   * deduction never disagree about the same spool.
   */
  function isLowStock(item, settings) {
    if (!item) return false;
    const s = ctxOf(settings);
    const threshold = item.reorderPoint ?? s.lowStockThreshold ?? DEFAULT_LOW_STOCK;
    return (+item.weight || 0) <= threshold;
  }

  /**
   * Candidate spools in the order a multi-site shop should empty them: this
   * branch first, then the unassigned shared ones, then another branch.
   * Stable within each tier, so the shop's own ordering survives.
   */
  function spoolsByLocationPreference(candidates, locId) {
    const list = arrayOf(candidates).slice();
    if (!locId) return list;
    const tier = (s) => {
      if (s && s.locationId === locId) return 0;
      if (!s || !s.locationId) return 1;
      return 2;
    };
    return list
      .map((s, i) => ({ s, i, tier: tier(s) }))
      .sort((a, b) => (a.tier - b.tier) || (a.i - b.i))
      .map((x) => x.s);
  }

  /**
   * Grams a part consumes: print plus support, times quantity.
   *
   * MUST match what the deduction actually draws, because reservation,
   * over-commit and the forecast all quote this number — and a shop that is
   * told it has enough and then runs out mid-print stops trusting the figure.
   */
  function partGramsConsumed(p) {
    return ((+p.printWeight || 0) + (+p.supportWeight || 0)) * (+p.qty || 1);
  }

  /** Which branch a job belongs to: its own, else its machine's. */
  function orderLocationId(order, machines) {
    if (!order) return null;
    if (order.locationId) return order.locationId;
    const list = arrayOf(machines);
    const mid = order.machineId;
    const m = mid
      ? list.find(x => x.id === mid)
      : list.find(x => x.name && order.machine && x.name === order.machine);
    return (m && m.locationId) || null;
  }

  /** Draw `grams` from a spool, recording what it was for. */
  function drawFrom(spool, grams, order, today) {
    spool.weight = Math.max(0, (+spool.weight || 0) - grams);
    if (!spool.usageHistory) spool.usageHistory = [];
    spool.usageHistory.unshift({
      orderId: order.id, project: order.project || '', weightUsed: grams, date: today,
    });
    if (spool.usageHistory.length > USAGE_CAP) spool.usageHistory.length = USAGE_CAP;
  }

  /**
   * Take a job's materials off the shelf.
   *
   * `ctx`: `{ settings, inventory, consumables, machines, today }`.
   * `opts.skipRender` suppresses only the inventory redraw, as it did before.
   *
   * The shortfall rule matters and is easy to lose: a part draws from the spool
   * it was assigned FIRST, honouring the shop's pick, and covers whatever that
   * spool cannot supply from other spools of the same material. A chosen spool
   * that is already empty is not an error — it is a spool that ran out, and the
   * job still consumed the filament.
   */
  function deductForOrder(order, ctx, opts) {
    const c = ctxOf(ctx);
    const settings = ctxOf(c.settings);
    const inventory = arrayOf(c.inventory);
    const consumables = arrayOf(c.consumables);
    const today = c.today;
    const skipRender = !!ctxOf(opts).skipRender;
    const notices = [];
    const effects = [];

    if (!settings.autoDeduct) return { notices, effects };
    if (order.materialDeducted) return { notices, effects };

    let deductedAny = false;
    let totalDeducted = 0;
    const spoolsTouched = new Set();
    const nowLow = [];
    const orderLoc = orderLocationId(order, c.machines);

    /** Empty `remaining` grams out of `primary`, then out of its siblings. */
    const drawDown = (primary, remaining) => {
      const others = inventory.filter(s =>
        s.id !== primary.id && s.material === primary.material && (+s.weight || 0) > 0);
      const fallback = orderLoc ? spoolsByLocationPreference(others, orderLoc) : others;
      for (const sp of [primary, ...fallback]) {
        if (remaining <= 0) break;
        const avail = +sp.weight || 0;
        if (avail <= 0) continue;
        const take = Math.min(avail, remaining);
        drawFrom(sp, take, order, today);
        remaining -= take;
        deductedAny = true;
        totalDeducted += take;
        spoolsTouched.add(sp.id);
        if (isLowStock(sp, settings) && !nowLow.some(x => x.id === sp.id)) nowLow.push(sp);
      }
    };

    for (const part of (order.parts || [])) {
      // A multicolour part is several filaments in one part: each colour's
      // grams come out of its own spool, times the part's quantity.
      if (part.colours && part.colours.length) {
        const perQty = Math.max(1, +part.qty || 1);
        for (const col of part.colours) {
          const primary = col.filamentId && inventory.find(i => i.id === col.filamentId);
          if (!primary) continue;
          const grams = Math.max(0, (+col.grams || 0) * perQty);
          if (grams <= 0) continue;
          drawDown(primary, grams);
        }
        continue;
      }
      if (!part.filamentId || !part.printWeight) continue;
      const primary = inventory.find(i => i.id === part.filamentId);
      if (!primary) continue;
      // Grams the spool-switch flow already took off other spools are not owed
      // again — otherwise switching spools mid-print charges the job twice.
      const extra = (part.additionalSpools || []).reduce((s, a) => s + (+a.weight || 0), 0);
      const remaining = Math.max(0, partGramsConsumed(part) - extra);
      if (remaining <= 0) continue;
      drawDown(primary, remaining);
    }

    if (deductedAny) {
      // ONE summary, not one toast per spool. Per-spool toasts could blow the
      // toast cap and silently drop the low-stock warning, which is the only
      // part of this a shop actually needs to act on.
      const params = {
        weight: Math.round(totalDeducted), spools: spoolsTouched.size, low: nowLow.length,
      };
      notices.push({ code: nowLow.length > 0 ? 'filament_deducted_low' : 'filament_deducted', params });
      effects.push({ type: 'save' });
      if (!skipRender) effects.push({ type: 'render_inventory' });
    }

    // Consumables that are spent by the hour — glue, isopropyl, sandpaper.
    const printHrs = +order.printTime || 0;
    if (printHrs > 0) {
      consumables.forEach(item => {
        if (item.usagePerHour && item.usagePerHour > 0) {
          item.stock = Math.max(0, (item.stock || 0) - item.usagePerHour * printHrs);
          if (item.stock <= (item.minStock || 0)) {
            notices.push({ code: 'consumable_low', params: { name: item.name } });
          }
        }
      });
      effects.push({ type: 'save' });
      effects.push({ type: 'render_consumables' });
    }

    // Bought-in components of a BOM assembly. Low stock warns and never blocks:
    // the parts are already printed and the job is already finished.
    const comps = arrayOf(order.components);
    if (comps.length) {
      const assemblyQty = Math.max(1, +order.assemblyQty || 1);
      let touched = false;
      comps.forEach(comp => {
        if (!comp || !comp.consumableId) return;
        const item = consumables.find(x => x.id === comp.consumableId);
        if (!item) return;
        const draw = Math.max(0, (+comp.qtyPerUnit || 0) * assemblyQty);
        if (draw <= 0) return;
        item.stock = Math.max(0, (item.stock || 0) - draw);
        touched = true;
        if (item.stock <= (item.minStock || 0)) {
          notices.push({ code: 'consumable_low', params: { name: item.name } });
        }
      });
      if (touched) {
        effects.push({ type: 'save' });
        effects.push({ type: 'render_consumables' });
      }
    }

    // Set even when nothing was deducted: the job has had its chance, and a
    // re-completion must not get a second one.
    order.materialDeducted = true;
    return { notices, effects };
  }

  /**
   * One of every packaging item, for the box the job ships in.
   *
   * A shop with no packaging stocked is left UNFLAGGED on purpose, so the
   * deduction happens the day they stock some. Every other path here flags the
   * order and never looks again.
   */
  function deductPackaging(order, ctx) {
    const c = ctxOf(ctx);
    const consumables = arrayOf(c.consumables);
    const notices = [];
    const effects = [];

    if (order.packagingDeducted) return { notices, effects };
    const packaging = consumables.filter(x => x.isPackaging && x.stock > 0);
    if (packaging.length === 0) return { notices, effects };

    packaging.forEach(item => {
      item.stock = Math.max(0, (item.stock || 0) - 1);
      if (item.stock <= (item.minStock || 0)) {
        notices.push({ code: 'packaging_low', params: { name: item.name } });
      }
    });
    effects.push({ type: 'save' });
    effects.push({ type: 'render_consumables' });
    notices.push({ code: 'packaging_deducted', params: {} });
    order.packagingDeducted = true;
    return { notices, effects };
  }

  const api = {
    USAGE_CAP, DEFAULT_LOW_STOCK,
    isLowStock, spoolsByLocationPreference, partGramsConsumed, orderLocationId,
    deductForOrder, deductPackaging,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytOrderDeduction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
