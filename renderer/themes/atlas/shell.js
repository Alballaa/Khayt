/**
 * Atlas shell — chromeless spatial floor, shared topbar, minimal nav.
 */
(function (global) {
  const ATLAS_TABS = new Set(['dashboard-tab', 'queue-tab', 'settings-tab']);

  const NAV_LABELS = {
    'dashboard-tab': 'Floor',
    'queue-tab': 'Queue',
    'settings-tab': 'Settings',
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
        <div><b>Atlas</b><span id="atlasFloorLabel">Floor · live</span></div>
      </div>
      <div class="kpis" id="atlasKpis" aria-hidden="true">
        <div class="kpi"><b id="atlasKpiMachines">0</b><span>machines</span></div>
        <div class="kpi"><b id="atlasKpiUtil">0%</b><span>util</span></div>
        <div class="kpi"><b id="atlasKpiJobs">0</b><span>jobs today</span></div>
      </div>
      <nav class="atlas-nav" id="atlasNav" aria-label="Atlas navigation"></nav>
      <div class="clock m" id="atlasClock" aria-hidden="true">00:00:00</div>`;
    main.insertBefore(chrome, main.firstChild);

    const nav = chrome.querySelector('#atlasNav');
    ATLAS_TABS.forEach((tabId) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.atlasTab = tabId;
      btn.textContent = NAV_LABELS[tabId] || tabId;
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
      btn.classList.toggle('on', btn.dataset.atlasTab === active);
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
    const loc = (typeof locations !== 'undefined' && locations[0]) ? locations[0].name : 'Floor';
    const label = document.getElementById('atlasFloorLabel');
    if (label) label.textContent = `${loc} · live`;

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
