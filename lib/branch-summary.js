'use strict';

/**
 * A one-line summary of another branch's store, for the organisation overview.
 *
 * Pure: a decrypted snapshot in, counts out. It lives here rather than in the
 * renderer so only the SUMMARY crosses IPC — a branch store can be megabytes, and
 * the overview needs a handful of numbers from it.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO
 *
 * No money. Revenue in this app is not "sum of price": voided invoices, refunds
 * and credit notes all subtract, and getting that subtly wrong across branches
 * would produce a chain total that disagrees with every branch's own reporting —
 * a number the owner cannot reconcile and has no reason to distrust. If a revenue
 * roll-up is wanted later it must reuse the same code the branch itself uses, not
 * a second implementation that happens to look right.
 *
 * No dates. "Due today" needs a calendar day, and the branch may be in another
 * timezone than the person reading — the two disagree for hours every day. The
 * codebase already carries scars from UTC-vs-local (see test/local-dates.test.js);
 * this reports raw ISO timestamps and lets the renderer format them with the
 * locale-aware helpers that already exist.
 *
 * What is left is what a chain owner actually asks at a glance: how much work is
 * moving, how much is stuck, and when this branch last did anything.
 */

/** Statuses that mean the order is still work, not history. */
const IN_FLIGHT = new Set(['pending', 'printing', 'post', 'qc']);

/** Count orders by what the shop would call their state, ignoring archived ones. */
function summarizeBranch(store) {
  const out = {
    orders: 0, inFlight: 0, printing: 0, onHold: 0, quotes: 0, done: 0,
    lastActivity: null, clients: 0, unreadable: false,
  };
  if (!store || typeof store !== 'object') { out.unreadable = true; return out; }

  const log = Array.isArray(store.printLog) ? store.printLog : [];
  for (const o of log) {
    if (!o || typeof o !== 'object') continue;
    // Archived orders are the shop's own "put this away" — every active-order
    // view in the app excludes them, so a cross-branch view that counted them
    // would report more work in flight than the branch's own screen does.
    if (o.archived) continue;
    out.orders++;
    const st = String(o.status || '');
    if (IN_FLIGHT.has(st)) out.inFlight++;
    if (st === 'printing') out.printing++;
    if (st === 'on_hold') out.onHold++;
    if (st === 'quote') out.quotes++;
    if (st === 'completed' || st === 'delivered') out.done++;

    // Raw ISO, highest wins. Formatting is the renderer's job — it has the
    // locale-aware helpers, and this module must not guess at a calendar day.
    const ts = typeof o.updatedAt === 'string' ? o.updatedAt : null;
    if (ts && (!out.lastActivity || ts > out.lastActivity)) out.lastActivity = ts;
  }

  out.clients = Array.isArray(store.clients) ? store.clients.length : 0;
  return out;
}

/**
 * Add up several branch summaries. Only the countable things — deliberately no
 * lastActivity roll-up, because "the chain last did something at X" is a fact
 * about one branch dressed up as a fact about all of them.
 */
function totalBranches(summaries) {
  const total = { branches: 0, reachable: 0, orders: 0, inFlight: 0, printing: 0, onHold: 0, quotes: 0, clients: 0 };
  for (const s of summaries || []) {
    total.branches++;
    if (!s || s.unreadable) continue;
    total.reachable++;
    for (const k of ['orders', 'inFlight', 'printing', 'onHold', 'quotes', 'clients']) {
      total[k] += Number(s[k]) || 0;
    }
  }
  return total;
}

module.exports = { summarizeBranch, totalBranches, IN_FLIGHT };
