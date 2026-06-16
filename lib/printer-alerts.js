/**
 * Pure printer fleet alerting logic (renderer + node:test).
 *
 * `computePrinterAlerts(prevState, currState, settings, now)` diffs the previous
 * and current printer-status caches and returns the alerts that should fire on
 * this poll, honouring per-machine cooldowns and the user's notification toggles.
 *
 * It is deliberately side-effect free: it never sends anything and never mutates
 * its inputs. The caller persists the returned `state` (cooldown/stall bookkeeping)
 * and is responsible for actually dispatching each alert through the existing
 * Telegram/email/webhook transports.
 *
 * Shapes
 *   statusCache: { [machineId]: {
 *     state, progress, filename, timeRemaining, tempNozzle, tempBed, error, lastUpdated
 *   } }   // exactly what main.js's printerStatusCache holds
 *
 *   alertState (opaque, owned by this module): {
 *     [machineId]: {
 *       failCount,          // consecutive failed polls (for offline threshold)
 *       lastProgress,       // progress value last seen while printing
 *       lastProgressAt,     // ms timestamp progress last advanced
 *       cooldowns: { error, offline, stall }  // ms timestamp each type last fired
 *     }
 *   }
 *
 * Returns: { alerts: [{ machineId, type, message, state, filename, progress }], state }
 */
(function (global) {
  'use strict';

  const DEFAULTS = {
    offlineThreshold: 3, // consecutive failed polls before "offline"
    stallMinutes: 15, // minutes without progress while printing before "stall"
    cooldownMinutes: 30, // per-machine, per-type minimum gap between alerts
  };

  const MINUTE = 60 * 1000;

  function isPrinting(state) {
    return /print/i.test(String(state || ''));
  }

  function isErrorState(s) {
    if (!s) return false;
    if (s.error) return true;
    return /error|fault|halt|attention/i.test(String(s.state || ''));
  }

  // A poll "failed" when main.js stored an { error } object (host unreachable etc.).
  function isFailedPoll(s) {
    return !!(s && s.error);
  }

  function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function cloneMachineState(m) {
    return {
      failCount: num(m && m.failCount, 0),
      lastProgress: m && typeof m.lastProgress === 'number' ? m.lastProgress : null,
      lastProgressAt: m && typeof m.lastProgressAt === 'number' ? m.lastProgressAt : null,
      cooldowns: {
        error: num(m && m.cooldowns && m.cooldowns.error, 0),
        offline: num(m && m.cooldowns && m.cooldowns.offline, 0),
        stall: num(m && m.cooldowns && m.cooldowns.stall, 0),
      },
    };
  }

  function resolveSettings(settings) {
    const tg = (settings && settings.telegram) || {};
    return {
      notifyError: tg.notifyPrinterError !== false ? !!tg.notifyPrinterError : false,
      notifyOffline: tg.notifyPrinterOffline !== false ? !!tg.notifyPrinterOffline : false,
      notifyStall: !!tg.notifyPrinterStall,
      offlineThreshold: clampInt(
        (settings && settings.printerAlerts && settings.printerAlerts.offlineThreshold),
        DEFAULTS.offlineThreshold,
        1,
        50,
      ),
      stallMinutes: clampInt(
        (settings && settings.printerAlerts && settings.printerAlerts.stallMinutes),
        DEFAULTS.stallMinutes,
        1,
        24 * 60,
      ),
      cooldownMinutes: clampInt(
        (settings && settings.printerAlerts && settings.printerAlerts.cooldownMinutes),
        DEFAULTS.cooldownMinutes,
        0,
        24 * 60,
      ),
    };
  }

  function clampInt(v, fallback, min, max) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function nameFor(machineId, machines) {
    if (Array.isArray(machines)) {
      const m = machines.find((x) => x && x.id === machineId);
      if (m && m.name) return m.name;
    }
    return machineId;
  }

  /**
   * @param {object} prevState  previous status cache (snapshot from the last poll)
   * @param {object} currState  current status cache (this poll)
   * @param {object} settings   renderer settings object (reads settings.telegram.*, settings.printerAlerts.*)
   * @param {number} now        ms timestamp (Date.now())
   * @param {object} [opts]     { alertState, machines }
   */
  function computePrinterAlerts(prevState, currState, settings, now, opts) {
    const ts = Number.isFinite(now) ? now : Date.now();
    const options = opts || {};
    const machines = options.machines;
    const cfg = resolveSettings(settings);
    const prev = prevState || {};
    const curr = currState || {};
    const inState = options.alertState || {};
    const outState = {};
    const alerts = [];

    for (const machineId of Object.keys(curr)) {
      const s = curr[machineId] || {};
      const p = prev[machineId] || {};
      const ms = cloneMachineState(inState[machineId]);
      const machineName = nameFor(machineId, machines);

      const cooldownMs = cfg.cooldownMinutes * MINUTE;
      const offCooldown = (type) => ts - ms.cooldowns[type] >= cooldownMs;

      // --- offline: N consecutive failed polls ---
      if (isFailedPoll(s)) {
        ms.failCount += 1;
      } else {
        ms.failCount = 0;
      }
      // crossing the threshold (== so it fires once at the edge; cooldown gates repeats)
      if (cfg.notifyOffline && ms.failCount >= cfg.offlineThreshold && offCooldown('offline')) {
        alerts.push({
          machineId,
          type: 'offline',
          message: `Printer offline: ${machineName} (${ms.failCount} failed checks)`,
          state: 'offline',
          filename: '',
          progress: 0,
        });
        ms.cooldowns.offline = ts;
      }

      // --- error: transition INTO an error state ---
      // Treat a failed poll as "offline", not "error", so we don't double-fire.
      const currErr = !isFailedPoll(s) && isErrorState(s);
      const prevErr = !isFailedPoll(p) && isErrorState(p);
      if (cfg.notifyError && currErr && !prevErr && offCooldown('error')) {
        const detail = s.error || s.state || 'error';
        alerts.push({
          machineId,
          type: 'error',
          message: `Printer error: ${machineName} — ${detail}`,
          state: String(s.state || 'error'),
          filename: s.filename || '',
          progress: num(s.progress, 0),
        });
        ms.cooldowns.error = ts;
      }

      // --- stall: progress not advancing while printing ---
      if (!isFailedPoll(s) && isPrinting(s.state)) {
        const progress = num(s.progress, 0);
        if (ms.lastProgressAt === null || ms.lastProgress === null || progress > ms.lastProgress) {
          // progress advanced (or first sighting) → reset the stall clock
          ms.lastProgress = progress;
          ms.lastProgressAt = ts;
        } else {
          const stalledFor = ts - ms.lastProgressAt;
          if (
            cfg.notifyStall &&
            stalledFor >= cfg.stallMinutes * MINUTE &&
            offCooldown('stall')
          ) {
            const mins = Math.round(stalledFor / MINUTE);
            alerts.push({
              machineId,
              type: 'stall',
              message: `Print stalled: ${machineName} stuck at ${Math.round(progress)}% for ${mins} min`,
              state: String(s.state || 'printing'),
              filename: s.filename || '',
              progress,
            });
            ms.cooldowns.stall = ts;
          }
        }
      } else {
        // not printing → no stall tracking
        ms.lastProgress = null;
        ms.lastProgressAt = null;
      }

      outState[machineId] = ms;
    }

    // carry forward state for machines that vanished this poll (defensive)
    for (const machineId of Object.keys(inState)) {
      if (!outState[machineId]) outState[machineId] = cloneMachineState(inState[machineId]);
    }

    return { alerts, state: outState };
  }

  const api = {
    computePrinterAlerts,
    isPrinting,
    isErrorState,
    isFailedPoll,
    DEFAULTS,
  };

  global.KhaytPrinterAlerts = api;
  global.computePrinterAlerts = computePrinterAlerts;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
