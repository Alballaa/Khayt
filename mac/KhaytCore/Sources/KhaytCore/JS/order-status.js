'use strict';

/**
 * What happens to a job when its stage changes.
 *
 * A status change in Khayt is not a field write. Moving an order to
 * `completed` stamps `completedAt`, settles the hold it may have been sitting
 * in, deducts the filament and the packaging it consumed, fixes the cost basis
 * the job will be judged on ever after, and can move a customer into a new
 * loyalty tier. Moving it *back out* of completed has to undo enough of that
 * for the reprint to behave like a fresh job. These rules lived in
 * `renderer/order-flows.js`, tangled with `printLog`, `settings`, `toast()`
 * and four `render*()` calls, which put them out of reach of anything that is
 * not the Electron renderer.
 *
 * The Mac app's board can show where the work is piling up but cannot let you
 * move a card, because the only place that knows what moving a card means is a
 * renderer it does not run. The alternative — a Swift reimplementation of the
 * most consequential write in the app — is how two apps come to disagree about
 * whether a job is finished.
 *
 * So the rules moved here and take their context as an argument.
 *
 * ── WHAT IS HERE AND WHAT IS NOT ───────────────────────────────────────────
 * `gate()` answers "may this move happen at all", and is the only part a
 * read-only caller needs: it is what greys out a drop target.
 *
 * `apply()` performs the change **on the order it is handed**, in place, and
 * returns the things it cannot do itself:
 *
 *   - `notices` — sentences the person should see (message codes, not text;
 *     the caller looks them up in its own catalogue).
 *   - `effects` — an ORDERED list of everything that must happen outside this
 *     order: saving, rendering, the money deductions, the notifications, the
 *     webhooks. A host performs the ones it has and ignores the rest. The Mac
 *     app has no Telegram; it should still be able to move a job.
 *
 * Mutating in place rather than returning a copy is deliberate. `printLog`
 * holds the same object an open modal is holding, and a lift that quietly
 * swapped the identity of an order would break the callers it was meant to
 * leave alone.
 *
 * PURE: no globals of its own, and **no clock** — `ctx.now` is the current
 * time in milliseconds, so a test can put a job on hold for nine days without
 * waiting. `KhaytAssembly` is consulted through a `typeof` guard the way
 * `order-flows.js` consulted it, because it is a sibling `lib/` module present
 * in both apps and a build without it must behave as it did before.
 *
 * ── ONE ORDERING CHANGE, AND WHY IT IS INERT ───────────────────────────────
 * The original computed `costBasis` *between* deducting filament and deducting
 * packaging. Here both deductions are effects the caller runs after `apply()`
 * returns, so `costBasis` is now fixed before either. This is safe only
 * because `deductFilamentForOrder` neither reads nor writes `costBasis` or any
 * part's `baseCost` — it reads grams and spool ids and sets
 * `order.materialDeducted`. Checked, not assumed. If that ever stops being
 * true, this comment is the thing that was wrong.
 */
(function (global) {

  /** A job remembers its last two hundred moves and no more. */
  const HISTORY_CAP = 200;

  /** How many random bytes a survey token is made of. */
  const SURVEY_TOKEN_BYTES = 12;

  const MS_PER_DAY = 86400000;

  const assemblyApi = () =>
    (typeof globalThis !== 'undefined' ? globalThis.KhaytAssembly : undefined);

  /** `YYYY-MM-DD` in the machine's own timezone — a due date is a local day. */
  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * True when moving `orderId` into `newStatus` would meet or exceed the
   * configured WIP limit for that column.
   *
   * Finished columns are never limited: a limit exists to stop work being
   * started, not to stop it being finished.
   */
  function wouldExceedWipLimit(orders, orderId, newStatus, wipLimits) {
    if (!newStatus || newStatus === 'completed' || newStatus === 'delivered' || newStatus === 'quote') return false;
    const limit = (wipLimits || {})[newStatus] || 0;
    if (limit <= 0) return false;
    const colCount = (orders || []).filter(o => o.id !== orderId && o.status === newStatus).length;
    return colCount >= limit;
  }

  /**
   * May this order move to `newStatus`?
   *
   * `ctx`: `{ orders, settings }`. Returns `{ ok, block, warn, needsActuals }`.
   * `block` and `warn` are `{ code, params }` — message codes, because this
   * module does not know which language the shop reads. Every reason carries a
   * `params` object even when it is empty, so a typed caller decodes one shape
   * rather than two.
   *
   * A soft WIP warning survives a later block on purpose: the original showed
   * both toasts, and being told "this column is full AND the assembly is not
   * finished" is more useful than being told one of the two.
   */
  function gate(order, newStatus, ctx) {
    const c = ctx || {};
    const settings = c.settings || {};
    const orders = Array.isArray(c.orders) ? c.orders : [];
    const wipLimits = settings.wipLimits || {};

    // Production paused stops work being STARTED, and nothing else. A paused
    // shop still finishes and still ships what it already printed.
    if (settings.productionPaused && newStatus === 'printing') {
      return { ok: false, block: { code: 'production_paused', params: {} }, warn: null, needsActuals: false };
    }

    let warn = null;
    if (newStatus !== 'completed' && wouldExceedWipLimit(orders, order && order.id, newStatus, wipLimits)) {
      const params = { col: newStatus, n: wipLimits[newStatus] };
      if (settings.wipEnforceHardLimit) {
        return { ok: false, block: { code: 'wip_blocked', params }, warn: null, needsActuals: false };
      }
      warn = { code: 'wip_reached', params };
    }

    // BOM assemblies: every printed part must pass QC and the owner must tick
    // "Assembled" before the order can complete. Orders with no components[]
    // are unaffected.
    const A = assemblyApi();
    if (newStatus === 'completed' && A && A.isAssembly(order)) {
      const g = A.canCompleteAssembly(order);
      if (!g.ok) {
        const names = (g.remaining || []).map(r => (r && r.name) || '?');
        const block = g.reason === 'not_assembled'
          ? { code: 'assembly_not_assembled', params: {} }
          : { code: 'assembly_parts', params: { parts: names.join(', '), count: names.length } };
        return { ok: false, block, warn, needsActuals: false };
      }
    }

    // Completing a job is the moment the shop learns what it really cost, so
    // it is also the moment worth asking for the actual time and grams.
    return { ok: true, block: null, warn, needsActuals: newStatus === 'completed' };
  }

  function pushHistory(order, status, atIso) {
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({ status, at: atIso });
    if (order.statusHistory.length > HISTORY_CAP) {
      order.statusHistory = order.statusHistory.slice(-HISTORY_CAP);
    }
  }

  /**
   * Clear on-hold state when an order leaves `on_hold`, and — unless it is
   * being finished — push the due date out by the days it spent waiting.
   *
   * A job held for nine days is not late by nine days; the shop was not
   * working on it. A job *completed* out of hold needs no new due date at all,
   * which is why the extension is skipped there but the cleanup is not: a
   * direct hold → completed used to leave `heldAt` behind for ever.
   */
  function resumeFromHold(order, prevStatus, newStatus, nowMs, notices) {
    if (prevStatus === 'on_hold' && newStatus !== 'on_hold') {
      if (newStatus !== 'completed' && newStatus !== 'delivered' && order.dueDate && order.heldAt) {
        const holdDays = Math.ceil((nowMs - new Date(order.heldAt).getTime()) / MS_PER_DAY);
        if (holdDays > 0) {
          const d = new Date(order.dueDate + 'T00:00:00');
          d.setDate(d.getDate() + holdDays);
          order.dueDate = localDateStr(d);
          notices.push({ code: 'due_extended', params: { days: holdDays, date: order.dueDate } });
        }
      }
      delete order.holdReason;
      delete order.heldAt;
    } else if (newStatus === 'pending' && order.holdReason !== undefined) {
      delete order.holdReason;
      delete order.heldAt;
    }
  }

  /**
   * Move `order` to `newStatus`, in place.
   *
   * `ctx`: `{ now, inventory }`. Call `gate()` first — `apply()` assumes the
   * move has already been allowed, and a caller that skips the gate has
   * decided to skip it.
   *
   * Returns `{ prevStatus, notices, effects }`. Run the effects in the order
   * they are given; that order is the original's, and some of it matters (the
   * loyalty tier must be read before the save, the webhooks after it).
   */
  function apply(order, newStatus, ctx) {
    const c = ctx || {};
    const nowMs = typeof c.now === 'number' ? c.now : Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const inventory = Array.isArray(c.inventory) ? c.inventory : [];
    const prevStatus = order.status;
    const notices = [];
    const effects = [];

    if (newStatus === 'completed') {
      resumeFromHold(order, prevStatus, 'completed', nowMs, notices);
      pushHistory(order, 'completed', nowIso);
      order.status = 'completed';
      if (!order.completedAt) order.completedAt = nowIso;
      // What the job cost is fixed the moment it is finished. Recomputing it
      // later from today's filament prices would rewrite last year's margins.
      if (!order.costBasis) {
        order.costBasis = (order.parts || []).reduce((s, p) => s + (+p.baseCost || 0), 0);
      }

      effects.push({ type: 'deduct_filament' });
      effects.push({ type: 'deduct_packaging' });
      effects.push({ type: 'save' });
      // Finishing a job can move its customer up a tier. No customer, no tier —
      // and the caller must have read the OLD tier before calling apply(),
      // because by now the job is already finished.
      if (order.clientId) effects.push({ type: 'tier_check' });
      effects.push({ type: 'render', dashboard: true });
      effects.push({ type: 'toast_updated' });
      if (order.clientId) effects.push({ type: 'export_status_page' });
      effects.push({ type: 'telegram', status: 'completed' });
      // Fired once per completion and once only — the webhooks are not
      // idempotent, and a shop's ERP counting a job twice is a real invoice.
      effects.push({ type: 'webhook', event: 'status_changed', newStatus: 'completed' });
      effects.push({ type: 'order_webhook', event: 'status' });
      effects.push({ type: 'webhook', event: 'order_delivered' });
      if (!order.surveyToken) effects.push({ type: 'ensure_survey_token' });
      effects.push({ type: 'republish_portal' });
      return { prevStatus, notices, effects };
    }

    order.status = newStatus;
    pushHistory(order, newStatus, nowIso);
    effects.push({ type: 'activity_log', text: `${order.id} → ${newStatus}` });

    // Re-opening a finished order: clear the completion state so the print
    // timer and the material deduction behave like a fresh job. A stale
    // printingStartedAt skews every elapsed and ETA figure afterwards, and
    // without clearing materialDeducted the reprint consumes nothing.
    if ((prevStatus === 'completed' || prevStatus === 'delivered') &&
        newStatus !== 'completed' && newStatus !== 'delivered') {
      delete order.completedAt;
      delete order.materialDeducted;
      delete order.printingStartedAt;
    }

    // A resin job entering post-processing needs somewhere to record the wash
    // and the cure. Decided from the spool, not from the order, because
    // nothing asks the shop to declare a job "resin".
    if (newStatus === 'post') {
      const invItem = inventory.find(i =>
        i.id === order.filamentId || (order.parts || []).some(p => p.filamentId === i.id));
      if (invItem && invItem.materialType === 'resin') {
        order.isResin = true;
        if (!order.resinPost) {
          order.resinPost = {
            washDurationMins: null, washIpaVolumeMl: null,
            cureDurationMins: null, curePowerW: null,
            inspectionNotes: '', completedAt: null,
          };
        }
      }
    }

    // The live timer runs while the job is printing and not a moment longer.
    // printingStartedAt is the FIRST start and survives a pause; timerStart is
    // the current run.
    if (newStatus === 'printing') {
      order.timerStart = nowIso;
      if (!order.printingStartedAt) order.printingStartedAt = nowIso;
    } else if (order.timerStart) {
      delete order.timerStart;
      delete order.timerPausedAt;
      delete order.timerPausedMs;
    }

    resumeFromHold(order, prevStatus, newStatus, nowMs, notices);

    effects.push({ type: 'save' });
    effects.push({ type: 'render', dashboard: false });
    effects.push({ type: 'toast_updated_undoable' });
    if (order.clientId) effects.push({ type: 'export_status_page' });
    effects.push({ type: 'email', status: newStatus });
    effects.push({ type: 'telegram', status: newStatus });
    effects.push({ type: 'webhook', event: 'status_changed', newStatus });
    effects.push({ type: 'order_webhook', event: 'status' });
    effects.push({ type: 'republish_portal' });
    return { prevStatus, notices, effects };
  }

  /**
   * Format a survey token from `SURVEY_TOKEN_BYTES` random bytes.
   *
   * The bytes come from the caller because a random source is exactly what a
   * pure module does not have — Node, the renderer and JavaScriptCore each
   * reach for a different one. The *format* is here so both apps mint the same
   * kind of token.
   */
  function makeSurveyToken(bytes) {
    return 'srv-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  const api = {
    HISTORY_CAP, SURVEY_TOKEN_BYTES,
    wouldExceedWipLimit, gate, apply, resumeFromHold, makeSurveyToken,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytOrderStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
