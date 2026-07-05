/**
 * Cockpit shell — 74px icon rail, filtered nav, stats bar, Spectrum skin sync.
 */
(function (global) {
  // Full tab set stays reachable; RAIL_LABELS below only re-skins the primary ones.
  const COCKPIT_TABS = new Set([
    'dashboard-tab', 'queue-tab', 'calculator-tab',
    'printfiles-tab', 'colorstudio-tab', 'converter-tab',
    'inventory-tab', 'waste-tab', 'catalog-tab', 'clients-tab',
    'gift-cards-tab', 'portfolio-tab', 'logs-tab', 'analytics-tab',
    'expenses-tab', 'settings-tab',
  ]);

  // Translate with graceful English fallback (works even if a key is missing).
  const tr = (k, d) => { const s = (typeof t === 'function') ? t(k) : null; return (s && s !== k) ? s : d; };

  // [i18n key, English fallback] — resolved at render time so labels follow language changes.
  const RAIL_LABELS = {
    'dashboard-tab': ['cockpit.nav.dashboard', 'Cockpit'],
    'queue-tab': ['cockpit.nav.queue', 'Queue'],
    'inventory-tab': ['cockpit.nav.inventory', 'Inventory'],
    'calculator-tab': ['cockpit.nav.calculator', 'Calculator'],
    'analytics-tab': ['cockpit.nav.analytics', 'Analytics'],
    'clients-tab': ['cockpit.nav.clients', 'Clients'],
    'settings-tab': ['cockpit.nav.settings', 'Settings'],
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
    });
    relabelNav();
  }

  // Refresh rail labels from the current language (called on page-head sync so
  // labels follow a language switch, matching the Atlas shell).
  function relabelNav() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      const label = btn.querySelector('.nav-label');
      const rl = RAIL_LABELS[btn.dataset.tab];
      if (label && rl) label.textContent = tr(rl[0], rl[1]);
    });
  }

  function restoreNav() {
    document.querySelectorAll('.khayt-navsec.cockpit-nav-hidden').forEach((sec) => {
      sec.classList.remove('cockpit-nav-hidden');
    });
    document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      btn.style.display = '';
    });
    // relabelNav() overwrote shared nav-label text in place — restore the real
    // i18n labels so other themes don't inherit Cockpit's names after a switch.
    document.querySelectorAll('.tab-btn[data-tab] .nav-label[data-i18n]').forEach((label) => {
      const key = label.getAttribute('data-i18n');
      const s = (typeof t === 'function') ? t(key) : null;
      if (s && s !== key) label.textContent = s;
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

    // Enthusiast (hobbyist) mode has no revenue — swap the MTD money cell for a
    // personal stat (prints this month) so the 4-cell bar stays balanced.
    const biz = (typeof KhaytTiers !== 'undefined') ? KhaytTiers.showsBusiness(settings.mode) : (typeof settings === 'undefined' || settings.mode !== 'enthusiast');
    const printsMonth = (typeof printLog !== 'undefined' ? printLog : [])
      .filter((o) => o.status === 'completed' && monthStr && (o.date || '').startsWith(monthStr)).length;
    const firstCell = biz
      ? { v: typeof fmtMoney === 'function' ? fmtMoney(monthlyRev) : String(monthlyRev), l: tr('cockpit.stat.mtd', 'MTD') }
      : { v: String(printsMonth), l: tr('dash.pstat_prints_month', 'Prints this month') };
    const stats = [
      firstCell,
      { v: String(active), l: tr('cockpit.stat.active', 'active') },
      { v: `${util}%`, l: tr('cockpit.stat.util', 'util') },
      { v: String(printing), l: tr('cockpit.stat.printing', 'printing') },
    ];

    bar.innerHTML = stats.map((s) => `
      <div class="ck-stat">
        <span class="v">${escapeHtml(s.v)}</span>
        <span class="l">${escapeHtml(s.l)}</span>
      </div>`).join('');
  }

  function syncCockpitPageHead(tabId) {
    if (!document.body.classList.contains('khayt-cockpit')) return;
    relabelNav();
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
