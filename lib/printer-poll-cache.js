/**
 * How a printer's cached status survives a missed poll.
 *
 * The poller used to replace the whole cache entry with `{ error, lastUpdated }`
 * on any failure, which threw away the last known job and progress. A single
 * blip — a Wi-Fi hiccup, or a CORE One taking its usual 20-30s to answer after a
 * power cycle — flipped a card from "printing 61%" to a red "offline" and back.
 *
 * Vendors hit this too and fixed it the same way: Bambu shipped a distinct
 * "Connecting" status specifically so short reconnects stop reading as Offline,
 * and Prusa's most-reported Connect complaint is false "Attention" alerts. A
 * panel that cries wolf gets ignored, and then the real fault is missed — so the
 * cache keeps the last good reading and counts misses, letting the UI decide
 * when a machine is actually gone.
 */

/**
 * Is this machine mid-job? Matched on the state strings the pollers actually
 * return across OctoPrint, Moonraker, PrusaLink, Duet and Repetier.
 */
const PRINTING = /^(printing|busy|running|working)/i;
const isPrintingState = (s) => PRINTING.test(String(s || ''));

/**
 * Freeze what a finished job actually used.
 *
 * A printer's filament and duration counters are per-job and reset when the next
 * one starts, so "read them when the shop gets round to marking the order done"
 * is not a plan — by then the machine may be two jobs further on. The moment
 * they are true is the transition out of printing, so that is when they are kept.
 *
 * The finished reading is preferred over the last mid-print one because
 * Moonraker and OctoPrint both retain a completed job's stats until the next
 * print begins, and the last poll before the end can be several percent short.
 * The previous reading is the fallback for a printer that clears them instantly.
 */
function captureCompletion(prev, status, now) {
  const p = prev || {};
  const was = isPrintingState(p.state);
  const is = isPrintingState(status && status.state);
  if (!was || is) return p.lastCompleted || null;

  const usable = (a) => !!(a && (a.filamentGrams > 0 || a.durationS > 0));
  const finished = status && status.actuals;
  const during = p.actuals;
  const actuals = usable(finished) ? finished : (usable(during) ? during : null);
  if (!actuals) return p.lastCompleted || null;

  return {
    at: now,
    // The job these figures belong to, so the shop is not offered last week's
    // numbers for today's order.
    filename: (status && status.filename) || p.filename || '',
    actuals,
  };
}

/** A poll that answered. Fresh object — a previous `error` must not survive. */
function mergePollSuccess(prev, status, now) {
  const lastCompleted = captureCompletion(prev, status, now);
  return {
    ...(status || {}),
    ...(lastCompleted ? { lastCompleted } : {}),
    consecutiveFailures: 0,
    lastOkAt: now,
    lastUpdated: now,
  };
}

/** A poll that threw. Keep the telemetry, count the miss. */
function mergePollFailure(prev, message, now) {
  const p = prev || {};
  return {
    ...p,
    error: message,
    consecutiveFailures: (p.consecutiveFailures || 0) + 1,
    // Only stamp lastOkAt from lastUpdated on the FIRST failure — after that
    // lastUpdated is itself a failure timestamp and would falsely advance it.
    lastOkAt: p.error ? (p.lastOkAt || null) : (p.lastUpdated || null),
    lastUpdated: now,
  };
}

/**
 * Has this machine missed enough polls to be called offline rather than
 * reconnecting? Threshold is the caller's, since display and alerting use
 * different tolerances.
 */
function isOffline(entry, threshold) {
  if (!entry || !entry.error) return false;
  return (entry.consecutiveFailures || 0) >= threshold;
}

module.exports = { mergePollSuccess, mergePollFailure, isOffline, captureCompletion, isPrintingState };
