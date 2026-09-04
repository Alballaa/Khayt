'use strict';

/**
 * Changing a job's own details, and remembering that it changed.
 *
 * The order editor writes thirty fields; five of them are RECORDED — the due
 * date, the discount, the shipping, and the two that carry the priority. Those
 * five are the ones a customer can be told a different answer about later, so
 * `editHistory` exists to say who moved the goalposts and when.
 *
 * The rule lived inside the editor's save handler, which meant anything else
 * that changed a due date changed it silently. The Mac app is about to be one
 * of those things.
 *
 * PURE: no globals, and no clock — `ctx.now` is the current time in
 * milliseconds. `ctx.id` supplies the entry's identifier, because a random
 * source is what a pure module does not have.
 *
 * ── THE PRIORITY IS TWO FIELDS AND THEY MOVE TOGETHER ──────────────────────
 * `priorityLevel` is the answer ('normal' | 'high' | 'urgent') and `priority`
 * is the older boolean that the kanban card, the Mac app's card and every
 * older record still carry. Setting one without the other leaves a job that is
 * urgent on one screen and ordinary on another, which is exactly what
 * `getPriorityLevel` was written to paper over. They are set as a pair here.
 */
(function (global) {

  /** A job remembers its last hundred edits and no more. */
  const EDIT_HISTORY_CAP = 100;

  /** The fields whose changes are written down. */
  const TRACKED_FIELDS = ['dueDate', 'discountPct', 'shippingCost', 'priority', 'priorityLevel'];

  /** In the order a shop escalates. */
  const PRIORITY_LEVELS = ['normal', 'high', 'urgent'];

  const ctxOf = (ctx) => (ctx && typeof ctx === 'object' ? ctx : {});

  /**
   * The priority as BOTH fields.
   *
   * An unknown level is 'normal': a job whose urgency nobody can read is not
   * urgent, and guessing upward would put it at the top of every queue.
   */
  function priorityFrom(level) {
    const wanted = PRIORITY_LEVELS.indexOf(level) === -1 ? 'normal' : level;
    return { priorityLevel: wanted, priority: wanted !== 'normal' };
  }

  /** The level a job is at, however old the record is. */
  function priorityOf(order) {
    if (!order) return 'normal';
    if (PRIORITY_LEVELS.indexOf(order.priorityLevel) > 0) return order.priorityLevel;
    if (order.priorityLevel === 'normal') return 'normal';
    return order.priority ? 'high' : 'normal';
  }

  /**
   * What changed, among the fields that are written down.
   *
   * Compared as STRINGS, the way the editor always has: a due date arrives from
   * a date input and a discount from a number input, and `5` and `'5'` are the
   * same answer typed twice. Null and undefined and '' are all "not set".
   */
  function changesBetween(order, next) {
    const changes = {};
    for (const key of TRACKED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
      const from = order[key];
      const to = next[key];
      if (String(from == null ? '' : from) !== String(to == null ? '' : to)) {
        changes[key] = { from, to };
      }
    }
    return changes;
  }

  /**
   * Write an edit into the job's history.
   *
   * Nothing is recorded for an empty change set — an editor opened and closed
   * again is not an edit, and a history full of those hides the real ones.
   */
  function recordEdit(order, changes, ctx) {
    if (!changes || Object.keys(changes).length === 0) return false;
    const c = ctxOf(ctx);
    order.editHistory = order.editHistory || [];
    order.editHistory.push({
      id: c.id || null,
      at: new Date(typeof c.now === 'number' ? c.now : Date.now()).toISOString(),
      fields: changes,
    });
    if (order.editHistory.length > EDIT_HISTORY_CAP) {
      order.editHistory = order.editHistory.slice(-EDIT_HISTORY_CAP);
    }
    return true;
  }

  /**
   * Apply a set of tracked changes to a job, in place, and record them.
   *
   * `next` names only the fields being changed. `dueDate` set to '' or null
   * clears it — a job with no due date is a real answer, and the field has to
   * be able to say it.
   *
   * Returns `{ changes, effects }`; `effects` is empty when nothing changed, so
   * a caller that saves on a non-empty list cannot write a revision for an
   * editor somebody opened and closed.
   */
  function applyEdit(order, next, ctx) {
    const wanted = Object.assign({}, next || {});
    // The priority is a pair. A caller naming only the level gets both.
    if (Object.prototype.hasOwnProperty.call(wanted, 'priorityLevel')) {
      Object.assign(wanted, priorityFrom(wanted.priorityLevel));
    }
    const changes = changesBetween(order, wanted);
    if (Object.keys(changes).length === 0) return { changes: {}, effects: [] };

    for (const key of TRACKED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(wanted, key)) continue;
      const value = wanted[key];
      if (key === 'dueDate' && (value === '' || value == null)) order.dueDate = null;
      else order[key] = value;
    }
    recordEdit(order, changes, ctx);

    return {
      changes,
      effects: [
        { type: 'save' },
        { type: 'render', dashboard: true },
        { type: 'toast_saved' },
      ],
    };
  }

  const api = {
    EDIT_HISTORY_CAP, TRACKED_FIELDS, PRIORITY_LEVELS,
    priorityFrom, priorityOf, changesBetween, recordEdit, applyEdit,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytOrderEdit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
