/**
 * Stage C — auto-sync controller. Orchestrates the Phase-0 delta engine
 * (KhaytSync) over the cloud blob push/pull so changes sync in the background
 * without the user clicking "Sync now".
 *
 * Design:
 *   - Debounced push after saves (coalesces bursts of edits into one upload).
 *   - On a push conflict (server has newer data), pull → merge locally with
 *     KhaytSync.applyDeltas (LWW by rev; append-only collections never
 *     overwritten; tombstones remove) → re-push once.
 *   - Single-flight: never two pushes at once; a save during a push queues one
 *     follow-up.
 *
 * Cloud-independent and side-effect-free until configure() is called with the
 * real push/pull/snapshot deps, so the app runs identically with cloud off.
 * All I/O is injected, which keeps the merge logic unit-testable without IPC.
 */
(function (global) {
  'use strict';

  const DEFAULT_DEBOUNCE_MS = 2500;
  const DEFAULT_RETRY_BASE_MS = 5000;       // first auto-retry after a failed sync
  const DEFAULT_RETRY_MAX_MS = 5 * 60 * 1000; // backoff ceiling (5 min)

  let deps = null;          // { push, pull, buildSnapshot, applySnapshot, save, appendOnly?, debounceMs?, retryBaseMs?, retryMaxMs? }
  let timer = null;
  let retryTimer = null;    // pending auto-retry after an offline/error failure
  let retryAttempt = 0;     // backoff exponent; reset on success / new edit / flush
  let inFlight = false;
  let pendingAfter = false; // a change arrived mid-sync → run once more after
  let statusVal = 'off';    // off | idle | syncing | synced | conflict | locked | offline | error
  let lastError = null;
  let listeners = [];

  function clearRetry() { if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } }

  /** Schedule an automatic retry after a transient failure, backing off
   *  exponentially (base · 2^attempt, capped). A new edit or flush() supersedes. */
  function scheduleRetry() {
    if (!deps || inFlight) return;
    clearRetry();
    const base = (deps && typeof deps.retryBaseMs === 'number') ? deps.retryBaseMs : DEFAULT_RETRY_BASE_MS;
    const max = (deps && typeof deps.retryMaxMs === 'number') ? deps.retryMaxMs : DEFAULT_RETRY_MAX_MS;
    const delay = Math.min(base * Math.pow(2, retryAttempt), max);
    retryAttempt++;
    retryTimer = setTimeout(() => { retryTimer = null; syncNow(); }, delay);
  }

  function setStatus(s, detail) {
    statusVal = s;
    if (detail && detail.error) lastError = detail.error;
    for (const fn of listeners) { try { fn(s, detail || {}); } catch (e) { /* listener must not break sync */ } }
  }

  /** Subscribe to status changes; returns an unsubscribe fn. */
  function onStatus(fn) {
    listeners.push(fn);
    try { fn(statusVal, {}); } catch (e) { /* ignore */ }
    return () => { listeners = listeners.filter((f) => f !== fn); };
  }

  /** Turn auto-sync on with the live I/O deps (called after unlock). */
  function configure(d) {
    deps = d || null;
    if (deps) { setStatus('idle'); } else { setStatus('off'); }
  }

  /** Turn auto-sync off (called on lock / sign-out). */
  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
    clearRetry();
    deps = null; inFlight = false; pendingAfter = false; retryAttempt = 0;
    setStatus('off');
  }

  function isOn() { return !!deps; }
  function status() { return statusVal; }
  function error() { return lastError; }

  /** Debounced trigger — call on every save. Coalesces bursts into one push. */
  function scheduleSync() {
    if (!deps) return;
    if (inFlight) { pendingAfter = true; return; }
    // A fresh edit supersedes any pending backoff retry and resets the backoff.
    clearRetry(); retryAttempt = 0;
    if (timer) clearTimeout(timer);
    const ms = (deps && typeof deps.debounceMs === 'number') ? deps.debounceMs : DEFAULT_DEBOUNCE_MS;
    timer = setTimeout(() => { timer = null; syncNow(); }, ms);
  }

  /** Force an immediate sync, resetting backoff. Call when connectivity returns
   *  (e.g. the window 'online' event) to flush changes stranded while offline. */
  function flush() {
    if (!deps) return Promise.resolve({ ok: false, error: 'off' });
    clearRetry(); retryAttempt = 0;
    return syncNow();
  }

  /**
   * Push now (resolving one conflict via pull+merge+re-push). Returns
   * {ok, rev} | {ok:false, error}. Safe to call directly (e.g. a manual button).
   */
  async function syncNow() {
    if (!deps) return { ok: false, error: 'off' };
    if (inFlight) { pendingAfter = true; return { ok: false, error: 'in-flight' }; }
    if (timer) { clearTimeout(timer); timer = null; }
    clearRetry();
    inFlight = true;
    setStatus('syncing');
    try {
      let r = await deps.push(deps.buildSnapshot());
      if (r && r.conflict) {
        const merged = await pullMerge();
        if (!merged.ok) { setStatus('error', { error: merged.error }); return merged; }
        r = await deps.push(deps.buildSnapshot()); // re-push the merged result
      }
      if (r && r.ok && !r.conflict) { retryAttempt = 0; setStatus('synced', { rev: r.rev }); return { ok: true, rev: r.rev }; }
      if (r && r.error === 'locked') { setStatus('locked'); return { ok: false, error: 'locked' }; }
      if (r && r.conflict) { setStatus('conflict'); return { ok: false, error: 'conflict' }; }
      setStatus('error', { error: (r && r.error) || 'push failed' });
      return { ok: false, error: (r && r.error) || 'push failed' };
    } catch (e) {
      // Thrown = transport/offline failure: keep the local change and auto-retry
      // with backoff (also flushed immediately if the 'online' event fires).
      setStatus('offline', { error: String(e && e.message || e) });
      return { ok: false, error: String(e && e.message || e) };
    } finally {
      inFlight = false;
      if (pendingAfter) { pendingAfter = false; scheduleSync(); }
      // A fresh edit (pendingAfter) already re-scheduled a push; otherwise, if
      // this attempt left us offline/errored, queue an automatic backoff retry.
      else if (statusVal === 'offline' || statusVal === 'error') scheduleRetry();
    }
  }

  /**
   * Pull the server store and merge it into local state via the Phase-0 engine.
   * Used on unlock/launch and inside conflict resolution. Mutates local state +
   * persists. Returns {ok, rev, empty?} | {ok:false, error}.
   */
  async function pullMerge() {
    if (!deps) return { ok: false, error: 'off' };
    const r = await deps.pull();
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'pull failed' };
    if (!r.store) return { ok: true, rev: r.rev || 0, empty: true }; // nothing on the server yet
    const local = deps.buildSnapshot();
    const payload = global.KhaytSync.extractDeltas(r.store, { rev: 0, ts: '' });
    const merged = global.KhaytSync.applyDeltas(local, payload, { appendOnly: deps.appendOnly || [] });
    deps.applySnapshot(local);
    // Reseed the change-index to the merged baseline so the subsequent save
    // doesn't re-stamp the just-merged records as fresh changes (avoids churn).
    try { if (global.KhaytSync.seedIndex) global.KhaytSync.seedIndex(deps.buildSnapshot()); } catch (e) { /* non-fatal */ }
    deps.save();
    return { ok: true, rev: r.rev, merged };
  }

  const api = {
    configure, stop, isOn, status, error, onStatus,
    scheduleSync, syncNow, pullMerge, flush,
    DEFAULT_DEBOUNCE_MS, DEFAULT_RETRY_BASE_MS, DEFAULT_RETRY_MAX_MS,
  };

  Object.assign(global, { KhaytCloudSync: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
