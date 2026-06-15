/**
 * Cockpit shell — 74px icon rail, filtered nav, stats bar, Spectrum skin sync.
 */
(function (global) {
  const COCKPIT_TABS = new Set([
    'dashboard-tab', 'queue-tab', 'inventory-tab', 'calculator-tab',
    'analytics-tab', 'clients-tab', 'settings-tab',
  ]);

  const RAIL_LABELS = {
    'dashboard-tab': 'Cockpit',
    'queue-tab': 'Queue',
    'inventory-tab': 'Inventory',
    'calculator-tab': 'Calculator',
    'analytics-tab': 'Analytics',
    'clients-tab': 'Clients',
    'settings-tab': 'Settings',
  };

  const COCKPIT_SKINS = ['poster', 'lumen', 'draft', 'clay'];

  function filterNav() {
    document.querySelectorAll('.khayt-navsec').forEach((sec) => {
      const visible = [...sec.querySelectorAll('.tab-btn[data-tab]')].some((btn) => COCKPIT_TABS.has(btn.dataset.tab));
      sec.classList.toggle('cockpit-nav-hidden', !visible);
    });
    document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      const show = COCKPIT_TABS.has(btn.dataset.tab);
      btn.style.display = show ? '' : 'none';
      const label = btn.querySelector('.nav-label');
      if (label && RAIL_LABELS[btn.dataset.tab]) label.textContent = RAIL_LABELS[btn.dataset.tab];
    });
  }

  function restoreNav() {
    document.querySelectorAll('.khayt-navsec.cockpit-nav-hidden').forEach((sec) => {
      sec.classList.remove('cockpit-nav-hidden');
    });
    document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      btn.style.display = '';
    });
  }

  function ensureTopChrome() {
    const top = document.querySelector('.khayt-top');
    if (!top || top.querySelector('.cockpit-mark')) return;
    const mark = document.createElement('div');
    mark.className = 'cockpit-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = '<b>خ</b>';
    top.insertBefore(mark, top.firstChild);

    let stats = document.getElementById('cockpitStatsBar');
    if (!stats) {
      stats = document.createElement('div');
      stats.id = 'cockpitStatsBar';
      stats.className = 'cockpit-stats';
      stats.setAttribute('aria-hidden', 'true');
      const titleWrap = top.querySelector('.khayt-toptitle');
      if (titleWrap?.nextSibling) top.insertBefore(stats, titleWrap.nextSibling);
      else top.appendChild(stats);
    }
  }

  function removeTopChrome() {
    document.querySelector('.cockpit-mark')?.remove();
    document.getElementById('cockpitStatsBar')?.remove();
  }

  function syncCockpitSkin() {
    const skin = (typeof settings !== 'undefined' && settings.cockpitSkin) || 'poster';
    const valid = COCKPIT_SKINS.includes(skin) ? skin : 'poster';
    if (skin !== valid && settings) settings.cockpitSkin = valid;
    if (valid === 'poster') document.documentElement.removeAttribute('data-skin');
    else document.documentElement.dataset.skin = valid;
  }

  function syncCockpitStats() {
    const bar = document.getElementById('cockpitStatsBar');
    if (!bar || !document.body.classList.contains('khayt-cockpit')) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStr = typeof localMonthStr === 'function' ? localMonthStr(today) : '';
    const monthlyRev = (typeof printLog !== 'undefined' ? printLog : [])
      .filter((o) => o.status === 'completed' && monthStr && (o.date || '').startsWith(monthStr))
      .reduce((s, o) => s + (typeof orderRevenueBase === 'function' ? orderRevenueBase(o) : 0), 0);

    const active = (typeof printLog !== 'undefined' ? printLog : [])
      .filter((o) => o.status !== 'completed' && o.status !== 'quote').length;

    const printing = (typeof printLog !== 'undefined' ? printLog : [])
      .filter((o) => o.status === 'printing').length;

    const util = (typeof machines !== 'undefined' && machines.length)
      ? Math.round((printing / machines.length) * 100)
      : 0;

    const stats = [
      { v: typeof fmtMoney === 'function' ? fmtMoney(monthlyRev) : String(monthlyRev), l: 'MTD' },
      { v: String(active), l: 'active' },
      { v: `${util}%`, l: 'util' },
      { v: String(printing), l: 'printing' },
    ];

    bar.innerHTML = stats.map((s) => `
      <div class="ck-stat">
        <span class="v">${escapeHtml(s.v)}</span>
        <span class="l">${escapeHtml(s.l)}</span>
      </div>`).join('');
  }

  function syncCockpitPageHead(tabId) {
    if (!document.body.classList.contains('khayt-cockpit')) return;
    syncCockpitStats();
  }

  function applyCockpitShell() {
    document.getElementById('appSidebar')?.classList.remove('collapsed');
    ensureTopChrome();
    filterNav();
    syncCockpitSkin();
    global.KhaytIcon?.hydrateCockpitNav?.();
    syncCockpitStats();
    if (document.querySelector('.tab-content.active')?.id === 'dashboard-tab') {
      global.KhaytCockpitOverview?.render?.();
    }
  }

  function teardownCockpitShell() {
    restoreNav();
    removeTopChrome();
    document.documentElement.removeAttribute('data-skin');
  }

  global.KhaytCockpitShell = {
    applyCockpitShell,
    teardownCockpitShell,
    syncCockpitPageHead,
    syncCockpitSkin,
    syncCockpitStats,
    COCKPIT_TABS,
    COCKPIT_SKINS,
    filterNav,
    restoreNav,
  };
})(typeof window !== 'undefined' ? window : globalThis);
