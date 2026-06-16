/**
 * Fleet Monitor: a live grid of one card per connected printer.
 *
 * Source of truth is `machineStatusCache` — the exact same telemetry the kanban
 * live-status badges already consume (populated by main.js polling and pushed via
 * the `printer-status-update` IPC). This module adds NO polling of its own; it is
 * re-rendered by app-boot's telemetry listeners (initial poll + every update).
 */
(function (global) {
  'use strict';

  function fleetStateClass(s) {
    if (!s || s.error) return 'offline';
    const st = String(s.state || '').toLowerCase();
    if (st.includes('error') || st.includes('fault') || st.includes('attention')) return 'error';
    if (st.includes('print')) return 'printing';
    if (st.includes('pause')) return 'paused';
    return 'idle';
  }

  function fleetStateLabel(cls) {
    const map = {
      printing: 'fleet.state_printing',
      idle: 'fleet.state_idle',
      offline: 'fleet.state_offline',
      error: 'fleet.state_error',
      paused: 'fleet.state_paused',
    };
    return t(map[cls] || 'fleet.state_idle');
  }

  function fmtEta(seconds) {
    if (!seconds || seconds <= 0) return null;
    const mins = Math.round(seconds / 60);
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m`;
  }

  function fmtTemp(v) {
    return (v || v === 0) ? `${Math.round(v)}°` : '—';
  }

  // Conic-gradient progress ring (theme-agnostic: uses --primary / --border tokens).
  function progressRing(pct, stateClass) {
    const color = stateClass === 'error' || stateClass === 'offline'
      ? 'var(--danger)'
      : stateClass === 'printing' ? 'var(--primary)' : 'var(--text-muted)';
    return `<div class="fleet-ring" style="background:conic-gradient(${color} ${pct * 3.6}deg, var(--border) 0deg);" aria-hidden="true">
      <div class="fleet-ring-hole"><span class="fleet-ring-pct">${pct}%</span></div>
    </div>`;
  }

  function renderFleetCard(machine, s) {
    const cls = fleetStateClass(s);
    const offline = cls === 'offline';
    const pct = offline ? 0 : Math.min(100, Math.max(0, Math.round(+(s && s.progress) || 0)));
    const filename = (s && s.filename) || '';
    const eta = !offline ? fmtEta(s && s.timeRemaining) : null;
    const dot = machine.color || 'var(--text-muted)';
    const errMsg = s && s.error ? String(s.error) : '';

    return `<div class="fleet-card" data-machine-id="${escapeHtml(machine.id)}">
      <div class="fleet-card-head">
        <span class="fleet-dot" style="background:${escapeHtml(dot)};" aria-hidden="true"></span>
        <span class="fleet-name" title="${escapeHtml(machine.name || machine.id)}">${escapeHtml(machine.name || machine.id)}</span>
        <span class="live-state-badge ${escapeHtml(cls)}">${escapeHtml(fleetStateLabel(cls))}</span>
      </div>
      <div class="fleet-card-body">
        ${progressRing(pct, cls)}
        <div class="fleet-meta">
          ${errMsg
            ? `<div class="fleet-err">⚠ ${escapeHtml(errMsg)}</div>`
            : `<div class="fleet-row"><span class="fleet-label">${escapeHtml(t('fleet.file'))}</span><span class="fleet-val" title="${escapeHtml(filename)}">${filename ? escapeHtml(filename) : '—'}</span></div>
               <div class="fleet-row"><span class="fleet-label">${escapeHtml(t('fleet.eta'))}</span><span class="fleet-val">${eta ? escapeHtml(eta) : '—'}</span></div>
               <div class="fleet-row"><span class="fleet-label">${escapeHtml(t('fleet.temps'))}</span><span class="fleet-val live-temp">${fmtTemp(s && s.tempNozzle)} / ${fmtTemp(s && s.tempBed)}</span></div>`}
        </div>
      </div>
    </div>`;
  }

  function renderFleet() {
    const host = document.getElementById('fleetContent');
    if (!host) return;
    const list = (typeof machines !== 'undefined' && Array.isArray(machines)) ? machines : [];
    const connected = list.filter(m => m && m.printerApi && m.printerApi.type && m.printerApi.type !== 'none');
    const cache = (typeof machineStatusCache !== 'undefined' && machineStatusCache) || {};

    const head = `<div class="fleet-head">
      <h2 class="fleet-title">${escapeHtml(t('fleet.title'))}</h2>
      <p class="fleet-hint">${escapeHtml(t('fleet.hint'))}</p>
    </div>`;

    if (connected.length === 0) {
      host.innerHTML = head + `<div class="fleet-empty">${escapeHtml(t('fleet.empty'))}</div>`;
      return;
    }

    const cards = connected.map(m => renderFleetCard(m, cache[m.id])).join('');
    host.innerHTML = head + `<div class="fleet-grid">${cards}</div>`;
  }

  const api = { renderFleet, fleetStateClass };
  global.renderFleet = renderFleet;
  global.KhaytFleet = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
