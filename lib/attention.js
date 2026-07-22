'use strict';
(function () {

/**
 * "What needs me now" — pure selector behind the dashboard attention bar.
 *
 * The dashboard's problem was never taste, it was ranking: a printer that had
 * gone offline and a "Feedback & Bug Reports" button competed on even terms.
 * This module decides the one thing the operator has to be told before anything
 * else, so the top of the screen can carry a count and a reason instead of a
 * wall of KPIs.
 *
 * Two rules govern what gets in, and both exist to keep the bar trustworthy:
 *
 *   1. A missed poll is not a fault. `machineState` returns 'reconnecting'
 *      until a printer has genuinely stopped answering (see printer-poll-cache),
 *      and 'reconnecting' is deliberately NOT an attention item. Prusa's
 *      most-reported Connect complaint is false "Attention needed" alerts — a
 *      panel that cries wolf gets muted, and then the real fault is missed.
 *
 *   2. Only conditions the operator must ACT on. Bambu's Farm Manager collapses
 *      paused, offline and abnormally-stopped into one "Attention Needed"
 *      bucket, grouped by what the operator must do rather than by what
 *      technically went wrong. Same grouping here.
 *
 * Side-effect free and clock-injected so it can be unit-tested in isolation and
 * reused by the dashboard, the themes, and any future notification surface.
 */

/**
 * How many consecutive missed polls before a printer is called offline rather
 * than reconnecting. A CORE One takes 20-30s to answer after a power cycle and
 * the poll interval is 30s, so anything below 3 fires on healthy hardware.
 * Display and alerting are free to pass their own tolerance.
 */
const OFFLINE_AFTER_MISSED_POLLS = 3;

const DAY_MS = 86400000;

/** Local midnight for a Date/timestamp — Khayt stores due dates as 'YYYY-MM-DD' day strings. */
function startOfDay(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Parse a 'YYYY-MM-DD' day string at local midnight. Returns null if unparseable. */
function parseDay(s) {
  if (!s || typeof s !== 'string') return null;
  const ms = new Date(s + 'T00:00:00').getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolve what a machine is actually doing, from the manual offline flag plus
 * whatever the poller last saw.
 *
 * This is the single definition of machine state. It was previously re-derived
 * in six places (the default dashboard and each of the five themes), which is
 * how the display and the alerting layer came to disagree about "offline".
 *
 * @param {object} machine      machine record; `isOffline` is the manual flag
 * @param {object} [entry]      machineStatusCache[machine.id], if any
 * @param {object} [opts]
 * @param {number} [opts.offlineAfter=3]  consecutive misses before 'offline'
 * @returns {'offline'|'error'|'reconnecting'|'printing'|'idle'}
 */
function machineState(machine, entry, opts) {
  const offlineAfter = (opts && +opts.offlineAfter > 0)
    ? +opts.offlineAfter
    : OFFLINE_AFTER_MISSED_POLLS;

  // The operator ticked "offline" by hand. Nothing the poller says overrides that.
  if (machine && machine.isOffline) return 'offline';
  if (!entry) return 'idle';

  if (entry.error) {
    return (entry.consecutiveFailures || 0) >= offlineAfter ? 'offline' : 'reconnecting';
  }

  const st = String(entry.state || '').toLowerCase();
  if (st.includes('error')) return 'error';
  if (st.includes('print')) return 'printing';
  // Progress without a recognisable state string still means work in flight.
  if (Math.round(+entry.progress || 0) > 0) return 'printing';
  return 'idle';
}

/** Is this order still live work? Completed, quoted and voided orders can't be overdue. */
function isOpenOrder(o) {
  return !!o
    && o.status !== 'completed'
    && o.status !== 'quote'
    && !o.voidedAt;
}

/**
 * Everything demanding the operator's attention, most severe first.
 *
 * @param {object} input
 * @param {object[]} [input.machines]     machine records (already location-scoped)
 * @param {object[]} [input.orders]       order records (already location-scoped)
 * @param {object}   [input.statusCache]  machineStatusCache, keyed by machine id
 * @param {number}   [input.now]          injected clock; defaults to Date.now()
 * @param {number}   [input.offlineAfter] consecutive misses before 'offline'
 * @returns {{count:number, items:Array<object>}}
 *   items carry { severity:'crit'|'warn', kind, id, name, state?, dueDate?, daysLate? }
 */
function selectAttention(input) {
  const inp = input || {};
  const machines = Array.isArray(inp.machines) ? inp.machines : [];
  const orders = Array.isArray(inp.orders) ? inp.orders : [];
  const cache = inp.statusCache || {};
  const now = Number.isFinite(inp.now) ? inp.now : Date.now();
  const today = startOfDay(now);

  const items = [];

  // ── Machines that have stopped working ──────────────────────────────
  // 'reconnecting' is excluded by design: see rule 1 in the module header.
  for (const m of machines) {
    if (!m) continue;
    const state = machineState(m, cache[m.id], { offlineAfter: inp.offlineAfter });
    if (state !== 'offline' && state !== 'error') continue;
    items.push({
      severity: 'crit',
      kind: 'machine',
      id: m.id,
      name: m.name || '',
      state,
    });
  }

  // ── Work that has missed its promised date ──────────────────────────
  const overdue = [];
  for (const o of orders) {
    if (!isOpenOrder(o)) continue;
    const due = parseDay(o.dueDate);
    if (due === null || due >= today) continue;
    overdue.push({
      severity: 'warn',
      kind: 'order',
      id: o.id,
      name: o.project || '',
      dueDate: o.dueDate,
      daysLate: Math.round((today - due) / DAY_MS),
    });
  }
  // Latest-promised-first: the order that has been waiting longest leads.
  overdue.sort((a, b) => (b.daysLate - a.daysLate) || String(a.id).localeCompare(String(b.id)));
  items.push(...overdue);

  return { count: items.length, items };
}

const api = {
  OFFLINE_AFTER_MISSED_POLLS,
  machineState,
  selectAttention,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytAttention = api;

})();
