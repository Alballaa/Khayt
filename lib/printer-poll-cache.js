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

/** A poll that answered. Fresh object — a previous `error` must not survive. */
function mergePollSuccess(prev, status, now) {
  return {
    ...(status || {}),
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

module.exports = { mergePollSuccess, mergePollFailure, isOffline };
