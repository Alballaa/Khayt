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
    ATLAS_TABS.forEach((tabId) => { nav.appendChild(makeNavBtn(tabId)); });

    // Overflow menu — every other mode-visible tab stays reachable (Atlas hides
    // the main sidebar, so without this those tabs would have no entry point).
    const moreWrap = document.createElement('div');
    moreWrap.className = 'atlas-more';
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'atlas-more-btn';
    moreBtn.setAttribute('aria-haspopup', 'menu');
    moreBtn.setAttribute('aria-expanded', 'false');
    moreBtn.textContent = `${tr('atlas.nav.more', 'More')} ▾`;
    const menu = document.createElement('div');
    menu.className = 'atlas-more-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      if (willOpen) buildMoreMenu(menu);
      menu.hidden = !willOpen;
      moreBtn.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('click', () => {
      if (!menu.hidden) { menu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); }
    });
    moreWrap.appendChild(moreBtn);
    moreWrap.appendChild(menu);
    nav.appendChild(moreWrap);
  }

  function makeNavBtn(tabId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.atlasTab = tabId;
    const nl = NAV_LABELS[tabId];
    btn.textContent = nl ? tr(nl[0], nl[1]) : tabId;
    btn.addEventListener('click', () => { if (typeof switchTab === 'function') switchTab(tabId); });
    return btn;
  }

  // Is a sidebar nav button hidden by the current mode's gating classes?
  function tabHiddenByMode(btn) {
    const mode = (typeof settings !== 'undefined' && settings.mode) || 'professional';
    const isPro = (typeof KhaytTiers !== 'undefined') ? KhaytTiers.isProMode(mode) : mode === 'professional';
    const biz = (typeof KhaytTiers !== 'undefined') ? KhaytTiers.showsBusiness(mode) : mode !== 'enthusiast';
    if (btn.classList.contains('pro-only') && !isPro) return true;
    if (btn.classList.contains('biz-only') && !biz) return true;
    return false;
  }

  // Build the overflow menu from the real sidebar buttons, so labels + mode gating stay in sync.
  function buildMoreMenu(menu) {
    menu.innerHTML = '';
    document.querySelectorAll('#appSidebar .tab-btn[data-tab], .khayt-sidebar .tab-btn[data-tab]').forEach((src) => {
      const tabId = src.dataset.tab;
      if (!tabId || ATLAS_TABS.has(tabId)) return;
      if (tabHiddenByMode(src)) return;
      const label = src.querySelector('.nav-label')?.textContent?.trim() || tabId;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'atlas-more-item';
      item.setAttribute('role', 'menuitem');
      item.textContent = label;
      item.addEventListener('click', () => {
        if (typeof switchTab === 'function') switchTab(tabId);
        menu.hidden = true;
      });
      menu.appendChild(item);
    });
    if (!menu.children.length) {
      const empty = document.createElement('div');
      empty.className = 'atlas-more-item';
      empty.style.opacity = '0.5';
      empty.textContent = '—';
      menu.appendChild(empty);
    }
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
