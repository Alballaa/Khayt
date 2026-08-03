'use strict';
/**
 * Bed Ready's own queue transitions.
 *
 * The production queue renders status controls in both views — kanban.js and queue-list.js
 * both emit `data-act="status"`, and wire-events.js handles the click by calling
 * `updateStatus(id, to)`. That function lives in order-flows.js, which is business-only and
 * Bed Ready does not ship, so bedready-shim.js declared it a no-op to stop the boot-time
 * ReferenceError.
 *
 * Which left a queue that looks like it works. The buttons render, the click lands, the
 * handler runs, and `function () { return ''; }` returns. Nothing moves, nothing errors,
 * nothing says why. A maker app whose production queue cannot move a job from printing to
 * done is missing the thing the screen is for.
 *
 * So Bed Ready gets a real one. This is not order-flows.js with the business stripped out —
 * it is the transitions a workshop needs, using the shared helpers Bed Ready already ships:
 *
 *   inventory      deductFilamentForOrder / deductPackagingConsumables (inventory.js) —
 *                  finishing a print is what actually empties the spool
 *   WIP limits     wouldExceedWipLimit (app-helpers.js) — queue discipline, not commerce
 *   live timer     timerStart / printingStartedAt, which kanban.js already renders a badge
 *                  from and nothing in Bed Ready was setting
 *   activity log   logActivity (app-helpers.js)
 *
 * Deliberately absent, because they are business or depend on it: loyalty tiers, invoicing,
 * ZATCA, portals, webhooks, Telegram, status-page export, the BOM assembly gate, and
 * `resumeFromHold` — which lives in order-flows.js and is not even shimmed, so calling it
 * here would throw.
 *
 * Loaded AFTER bedready-shim.js and only by bedready.html, so it replaces the shim's no-op.
 * The shim assigns only when a name is undefined; this assigns unconditionally, on purpose.
 */
(function (global) {
  const T = (k, fb) => {
    try { const s = (typeof t === 'function') ? t(k) : ''; return (s && s !== k) ? s : fb; } catch (_) { return fb; }
  };
  const say = (msg, kind, ms, opts) => { try { if (typeof toast === 'function') toast(msg, kind, ms, opts); } catch (_) {} };
  const orders = () => (typeof printLog !== 'undefined' && Array.isArray(printLog)) ? printLog : [];
  const conf = () => (typeof settings !== 'undefined' && settings) ? settings : {};

  /** Redraw whichever queue view is on screen. */
  function repaint() {
    if (typeof renderKanban === 'function') { try { renderKanban(); } catch (_) {} }
    if (typeof renderQueueList === 'function') { try { renderQueueList(); } catch (_) {} }
    if (typeof renderDashboard === 'function') { try { renderDashboard(); } catch (_) {} }
  }

  /**
   * Move a job to a new column.
   * @param {string} id         order id
   * @param {string} newStatus  pending | on_hold | printing | post | qc | completed
   */
  function updateStatus(id, newStatus) {
    const order = orders().find((o) => o && o.id === id);
    if (!order || !newStatus || order.status === newStatus) return;
    const prevStatus = order.status;
    const cfg = conf();

    // A shop that has paused production means it: no new prints start.
    if (cfg.productionPaused && newStatus === 'printing') {
      say(T('prod.paused_block', 'Production is paused — resume it before starting a print.'), 'warning');
      return;
    }

    // WIP limits are a workshop idea, not a commercial one: too many jobs open at once is
    // how a bench ends up covered in half-finished plates. Completing is always allowed —
    // the point of a limit is to stop work starting, never to strand what is already done.
    if (newStatus !== 'completed' && typeof wouldExceedWipLimit === 'function'
        && wouldExceedWipLimit(orders(), id, newStatus, cfg.wipLimits)) {
      const n = (cfg.wipLimits || {})[newStatus];
      if (cfg.wipEnforceHardLimit) {
        say(T('wip.limit_blocked', `WIP limit (${n}) reached for "${newStatus}" — finish something first.`), 'error', 4000);
        return;
      }
      say(T('wip.limit_reached', `WIP limit (${n}) reached for "${newStatus}"`), 'warning', 4000);
    }

    const undoIdx = orders().indexOf(order);
    let undoSnap = null;
    try { undoSnap = structuredClone(order); } catch (_) { undoSnap = null; }

    order.status = newStatus;
    if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
    order.statusHistory.push({ status: newStatus, at: new Date().toISOString() });
    if (order.statusHistory.length > 200) order.statusHistory = order.statusHistory.slice(-200);

    // The live timer kanban.js draws a badge from. Nothing in Bed Ready set these, so the
    // badge could never appear however long a job had been on the machine.
    if (newStatus === 'printing') {
      order.timerStart = new Date().toISOString();
      if (!order.printingStartedAt) order.printingStartedAt = order.timerStart;
    } else if (order.timerStart) {
      delete order.timerStart;
      delete order.timerPausedAt;
      delete order.timerPausedMs;
    }

    if (newStatus === 'completed') {
      if (!order.completedAt) order.completedAt = new Date().toISOString();
      // Finishing a print is the moment the spool is actually lighter. Both helpers are
      // no-ops for an order carrying no parts, so a bare queue entry costs nothing.
      if (typeof deductFilamentForOrder === 'function') { try { deductFilamentForOrder(order); } catch (_) {} }
      if (typeof deductPackagingConsumables === 'function') { try { deductPackagingConsumables(order); } catch (_) {} }
    } else if (prevStatus === 'completed') {
      // Re-opening: a job that is going round again has not completed, and leaving the
      // timestamp behind would report it as finished in anything reading completedAt.
      delete order.completedAt;
    }

    if (typeof logActivity === 'function') { try { logActivity('status', `${order.id} → ${newStatus}`, order.id); } catch (_) {} }
    if (typeof saveAll === 'function') saveAll();
    repaint();

    // The job is completed either way. Offering the printer's own figures happens AFTER,
    // never as a gate: a dismissed dialog must not leave the card in the previous column.
    // Silent when nothing was measured — see bedready-actuals.js.
    if (newStatus === 'completed' && typeof brOfferActuals === 'function') {
      try { brOfferActuals(order); } catch (_) { /* never block a completion on this */ }
    }

    say(T('toast.status_updated', 'Status updated'), 'success', 5000,
      (undoIdx >= 0 && undoSnap) ? {
        undo: () => {
          const list = orders();
          if (list[undoIdx] && list[undoIdx].id === undoSnap.id) list[undoIdx] = undoSnap;
          if (typeof saveAll === 'function') saveAll();
          repaint();
        },
      } : undefined);
  }

  // Unconditional: bedready-shim.js has already put a no-op here, and this replaces it.
  global.updateStatus = updateStatus;
  global.KhaytBedReadyQueue = { updateStatus };
})(typeof globalThis !== 'undefined' ? globalThis : window);
