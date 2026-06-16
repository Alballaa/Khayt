/**
 * Atlas shell — chromeless spatial floor, shared topbar, minimal nav.
 */
(function (global) {
  const ATLAS_TABS = new Set(['dashboard-tab', 'queue-tab', 'settings-tab']);

  // Translate with graceful English fallback (works even if a key is missing).
  const tr = (k, d, vars) => { const s = (typeof t === 'function') ? t(k, vars) : null; return (s && s !== k) ? s : d; };

  // [i18n key, English fallback]
  const NAV_LABELS = {
    'dashboard-tab': ['atlas.nav.floor', 'Floor'],
    'queue-tab': ['atlas.nav.queue', 'Queue'],
    'settings-tab': ['atlas.nav.settings', 'Settings'],
  };

  let clockTimer = null;

  function ensureChrome() {
    const main = document.querySelector('.khayt-main');
    if (!main || document.getElementById('atlasChrome')) return;
    const chrome = document.createElement('header');
    chrome.id = 'atlasChrome';
    chrome.className = 'atlas-chrome';
    chrome.setAttribute('aria-label', 'Atlas');
    chrome.innerHTML = `
      <div class="brand">
        <div class="glyph" aria-hidden="true">خ</div>
        <div><b>Atlas</b><span id="atlasFloorLabel">${escapeHtml(tr('atlas.floor', 'Floor'))} · ${escapeHtml(tr('atlas.live', 'live'))}</span></div>
      </div>
      <div class="kpis" id="atlasKpis" role="group" aria-label="Workshop status">
        <div class="kpi"><b id="atlasKpiMachines">0</b><span>${escapeHtml(tr('atlas.kpi.machines', 'machines'))}</span></div>
        <div class="kpi"><b id="atlasKpiUtil">0%</b><span>${escapeHtml(tr('atlas.kpi.util', 'util'))}</span></div>
        <div class="kpi"><b id="atlasKpiJobs">0</b><span>${escapeHtml(tr('atlas.kpi.jobs_today', 'jobs today'))}</span></div>
      </div>
      <nav class="atlas-nav" id="atlasNav" aria-label="Atlas navigation"></nav>
      <div class="clock m" id="atlasClock" aria-hidden="true">00:00:00</div>`;
    main.insertBefore(chrome, main.firstChild);

    const nav = chrome.querySelector('#atlasNav');
    ATLAS_TABS.forEach((tabId) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.atlasTab = tabId;
      const nl = NAV_LABELS[tabId];
      btn.textContent = nl ? tr(nl[0], nl[1]) : tabId;
      btn.addEventListener('click', () => {
        if (typeof switchTab === 'function') switchTab(tabId);
      });
      nav.appendChild(btn);
    });
  }

  function removeChrome() {
    document.getElementById('atlasChrome')?.remove();
    if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  }

  function syncNavActive() {
    const active = document.querySelector('.tab-content.active')?.id || 'dashboard-tab';
    document.querySelectorAll('#atlasNav [data-atlas-tab]').forEach((btn) => {
      const on = btn.dataset.atlasTab === active;
      const nl = NAV_LABELS[btn.dataset.atlasTab];
      if (nl) btn.textContent = tr(nl[0], nl[1]);
      btn.classList.toggle('on', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  }

  function syncClock() {
    const el = document.getElementById('atlasClock');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  function syncAtlasChrome(stats = {}) {
    if (!document.body.classList.contains('khayt-atlas')) return;
    const loc = (typeof locations !== 'undefined' && locations[0]) ? locations[0].name : tr('atlas.floor', 'Floor');
    const label = document.getElementById('atlasFloorLabel');
    if (label) label.textContent = `${loc} · ${tr('atlas.live', 'live')}`;

    if (stats.machines != null) {
      const m = document.getElementById('atlasKpiMachines');
      if (m) m.textContent = String(stats.machines);
    }
    if (stats.util != null) {
      const u = document.getElementById('atlasKpiUtil');
      if (u) u.textContent = `${stats.util}%`;
    }
    if (stats.jobsToday != null) {
      const j = document.getElementById('atlasKpiJobs');
      if (j) j.textContent = String(stats.jobsToday);
    }
    syncNavActive();
    syncClock();
  }

  function syncAtlasPageHead(tabId) {
    if (!document.body.classList.contains('khayt-atlas')) return;
    syncNavActive();
    syncAtlasChrome();
  }

  function applyAtlasShell() {
    ensureChrome();
    syncNavActive();
    syncClock();
    if (!clockTimer) clockTimer = setInterval(syncClock, 1000);
    if (document.querySelector('.tab-content.active')?.id === 'dashboard-tab') {
      global.KhaytAtlasFloor?.render?.();
    }
  }

  function teardownAtlasShell() {
    removeChrome();
  }

  global.KhaytAtlasShell = {
    applyAtlasShell,
    teardownAtlasShell,
    syncAtlasPageHead,
    syncAtlasChrome,
    ATLAS_TABS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
