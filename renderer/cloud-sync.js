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

  let deps = null;          // { push, pull, buildSnapshot, applySnapshot, save, appendOnly?, debounceMs? }
  let timer = null;
  let inFlight = false;
  let pendingAfter = false; // a change arrived mid-sync → run once more after
  let statusVal = 'off';    // off | idle | syncing | synced | conflict | locked | offline | error
  let lastError = null;
  let listeners = [];

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
    deps = null; inFlight = false; pendingAfter = false;
    setStatus('off');
  }

  function isOn() { return !!deps; }
  function status() { return statusVal; }
  function error() { return lastError; }

  /** Debounced trigger — call on every save. Coalesces bursts into one push. */
  function scheduleSync() {
    if (!deps) return;
    if (inFlight) { pendingAfter = true; return; }
    if (timer) clearTimeout(timer);
    const ms = (deps && typeof deps.debounceMs === 'number') ? deps.debounceMs : DEFAULT_DEBOUNCE_MS;
    timer = setTimeout(() => { timer = null; syncNow(); }, ms);
  }

  /**
   * Push now (resolving one conflict via pull+merge+re-push). Returns
   * {ok, rev} | {ok:false, error}. Safe to call directly (e.g. a manual button).
   */
  async function syncNow() {
    if (!deps) return { ok: false, error: 'off' };
    if (inFlight) { pendingAfter = true; return { ok: false, error: 'in-flight' }; }
    if (timer) { clearTimeout(timer); timer = null; }
    inFlight = true;
    setStatus('syncing');
    try {
      let r = await deps.push(deps.buildSnapshot());
      if (r && r.conflict) {
        const merged = await pullMerge();
        if (!merged.ok) { setStatus('error', { error: merged.error }); return merged; }
        r = await deps.push(deps.buildSnapshot()); // re-push the merged result
      }
      if (r && r.ok && !r.conflict) { setStatus('synced', { rev: r.rev }); return { ok: true, rev: r.rev }; }
      if (r && r.error === 'locked') { setStatus('locked'); return { ok: false, error: 'locked' }; }
      if (r && r.conflict) { setStatus('conflict'); return { ok: false, error: 'conflict' }; }
      setStatus('error', { error: (r && r.error) || 'push failed' });
      return { ok: false, error: (r && r.error) || 'push failed' };
    } catch (e) {
      setStatus('offline', { error: String(e && e.message || e) });
      return { ok: false, error: String(e && e.message || e) };
    } finally {
      inFlight = false;
      if (pendingAfter) { pendingAfter = false; scheduleSync(); }
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
    scheduleSync, syncNow, pullMerge,
    DEFAULT_DEBOUNCE_MS,
  };

  Object.assign(global, { KhaytCloudSync: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
