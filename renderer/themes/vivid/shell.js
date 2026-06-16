/**
 * Vivid shell — bold, colorful chrome around the shared renderer.
 *
 * Built faithfully on the proven Workbench shell pattern, plus the signature
 * Vivid mechanic: a colored toolbar BAND + screen accents that RECOLOR per
 * active module (Dashboard indigo, Queue blue, Fleet/Inventory violet, Money
 * green, …). The hue is set live on <html> as --hue / --hue-2 on every tab
 * switch, so the band, gradient primary action, charts and accents all shift.
 *
 * What it does on mount:
 *  - Regroups the existing `.tab-btn` nav into Work / Catalog / Money groups
 *    (relabel + reparent the SAME buttons — navigation logic is untouched).
 *  - Paints a color tile behind each nav icon.
 *  - Builds the colored toolbar band (recolors per active tab).
 *  - Builds a bottom status bar fed from live order/printer counts.
 *
 * Everything is reversed on teardown: buttons return to their original
 * sections, injected chrome is removed, inline tile colors + the --hue
 * overrides are cleared.
 */
(function (global) {
  // Translate with graceful English fallback (follows language switches).
  const tr = (k, d) => { const s = (typeof t === 'function') ? t(k) : null; return (s && s !== k) ? s : d; };

  // Grouped layout: ordered groups of nav tabs. Tabs not listed here keep
  // their original position (e.g. dashboard stays at top, settings in footer).
  const GROUPS = [
    { key: 'work', labelKey: 'vivid.group.work', label: 'Work',
      tabs: ['calculator-tab', 'queue-tab', 'inventory-tab', 'waste-tab'] },
    { key: 'catalog', labelKey: 'vivid.group.catalog', label: 'Catalog',
      tabs: ['catalog-tab', 'clients-tab', 'gift-cards-tab', 'portfolio-tab'] },
    { key: 'money', labelKey: 'vivid.group.money', label: 'Money',
      tabs: ['logs-tab', 'analytics-tab', 'expenses-tab'] },
  ];

  // Per-tab tile color (CSS var name from tokens.css).
  const TILE = {
    'dashboard-tab': 'var(--vivid-dashboard)',
    'calculator-tab': 'var(--vivid-calculator)',
    'queue-tab': 'var(--vivid-queue)',
    'inventory-tab': 'var(--vivid-inventory)',
    'waste-tab': 'var(--vivid-waste)',
    'catalog-tab': 'var(--vivid-catalog)',
    'clients-tab': 'var(--vivid-clients)',
    'gift-cards-tab': 'var(--vivid-gift)',
    'portfolio-tab': 'var(--vivid-portfolio)',
    'logs-tab': 'var(--vivid-money)',
    'analytics-tab': 'var(--vivid-analytics)',
    'expenses-tab': 'var(--vivid-money)',
    'settings-tab': 'var(--vivid-settings)',
  };

  // Per-tab hue PAIR (concrete hex from tokens) — drives --hue / --hue-2 so the
  // toolbar band, charts and accents recolor with the active module.
  const HUE = {
    'dashboard-tab':  ['var(--vivid-dashboard)', 'var(--vivid-dashboard-2)'],
    'calculator-tab': ['var(--vivid-calculator)', 'var(--vivid-calculator-2)'],
    'queue-tab':      ['var(--vivid-queue)', 'var(--vivid-queue-2)'],
    'inventory-tab':  ['var(--vivid-inventory)', 'var(--vivid-inventory-2)'],
    'waste-tab':      ['var(--vivid-waste)', 'var(--vivid-waste-2)'],
    'catalog-tab':    ['var(--vivid-catalog)', 'var(--vivid-catalog-2)'],
    'clients-tab':    ['var(--vivid-clients)', 'var(--vivid-clients-2)'],
    'gift-cards-tab': ['var(--vivid-gift)', 'var(--vivid-gift-2)'],
    'portfolio-tab':  ['var(--vivid-portfolio)', 'var(--vivid-portfolio-2)'],
    'logs-tab':       ['var(--vivid-money)', 'var(--vivid-money-2)'],
    'analytics-tab':  ['var(--vivid-analytics)', 'var(--vivid-analytics-2)'],
    'expenses-tab':   ['var(--vivid-money)', 'var(--vivid-money-2)'],
    'settings-tab':   ['var(--vivid-settings)', 'var(--vivid-settings-2)'],
  };

  function isOn() { return document.body.classList.contains('khayt-vivid'); }

  /* ---------- Per-module hue ---------- */

  function applyHue(tabId) {
    const root = document.documentElement;
    const pair = HUE[tabId] || HUE['dashboard-tab'];
    root.style.setProperty('--hue', pair[0]);
    root.style.setProperty('--hue-2', pair[1]);
  }

  function clearHue() {
    const root = document.documentElement;
    root.style.removeProperty('--hue');
    root.style.removeProperty('--hue-2');
  }

  /* ---------- Sidebar regrouping ---------- */

  function applyTiles() {
    document.querySelectorAll('.khayt-nav .tab-btn[data-tab], .khayt-navfoot .tab-btn[data-tab]').forEach((btn) => {
      const tile = TILE[btn.dataset.tab];
      if (tile) btn.style.setProperty('--vv-tile', tile);
    });
  }

  function clearTiles() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      btn.style.removeProperty('--vv-tile');
    });
  }

  function buildGroups() {
    const nav = document.querySelector('.khayt-nav');
    if (!nav || nav.querySelector('[data-vv-group]')) return; // already built

    // Remember each button's original parent + position so teardown can restore.
    nav.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      if (btn.dataset.vvHome) return;
      const sec = btn.closest('.khayt-navsec');
      if (!sec) return;
      if (!sec.id) sec.id = `vv-orig-${Math.random().toString(36).slice(2, 8)}`;
      const sibs = [...sec.children];
      btn.dataset.vvHome = sec.id;
      btn.dataset.vvHomeIdx = String(sibs.indexOf(btn));
      // Preserve simple-mode gating: a tab hidden only via its `pro-only` parent
      // section must keep that gating after it's reparented into a new group
      // (e.g. analytics-tab, whose button itself has no `pro-only` class).
      if (!btn.classList.contains('pro-only') && sec.classList.contains('pro-only')) {
        btn.classList.add('pro-only');
        btn.dataset.vvProonly = '1';
      }
    });

    GROUPS.forEach((grp) => {
      const wrap = document.createElement('div');
      wrap.className = 'khayt-navsec nav-group';
      wrap.dataset.vvGroup = grp.key;
      const head = document.createElement('div');
      head.className = 'eyebrow khayt-navhead nav-group-label';
      head.dataset.vvGroupHead = '1';
      head.textContent = tr(grp.labelKey, grp.label);
      wrap.appendChild(head);
      grp.tabs.forEach((tabId) => {
        const btn = document.querySelector(`.khayt-nav .tab-btn[data-tab="${tabId}"]`);
        if (btn) wrap.appendChild(btn); // moves the SAME button (events intact)
      });
      nav.appendChild(wrap);
    });

    // Hide original sections that are now empty of nav buttons.
    nav.querySelectorAll('.khayt-navsec:not([data-vv-group])').forEach((sec) => {
      const hasBtn = !!sec.querySelector('.tab-btn[data-tab]');
      sec.classList.toggle('vv-nav-empty', !hasBtn);
    });
  }

  function relabelGroups() {
    document.querySelectorAll('[data-vv-group-head]').forEach((head) => {
      const grp = GROUPS.find((g) => g.key === head.closest('[data-vv-group]')?.dataset.vvGroup);
      if (grp) head.textContent = tr(grp.labelKey, grp.label);
    });
  }

  function restoreGroups() {
    // Move each button back to its recorded home section + index.
    const buttons = [...document.querySelectorAll('.tab-btn[data-vv-home]')];
    // Restore in ascending original index so insertion lands correctly.
    buttons.sort((a, b) => Number(a.dataset.vvHomeIdx) - Number(b.dataset.vvHomeIdx));
    buttons.forEach((btn) => {
      const sec = document.getElementById(btn.dataset.vvHome);
      if (sec) {
        const idx = Number(btn.dataset.vvHomeIdx);
        const ref = sec.children[idx] || null;
        sec.insertBefore(btn, ref);
      }
      // Undo the pro-only class we added during regrouping (the button returns
      // to its original pro-only section, which gates it again).
      if (btn.dataset.vvProonly) {
        btn.classList.remove('pro-only');
        delete btn.dataset.vvProonly;
      }
      delete btn.dataset.vvHome;
      delete btn.dataset.vvHomeIdx;
    });
    document.querySelectorAll('[data-vv-group]').forEach((el) => el.remove());
    document.querySelectorAll('.khayt-navsec.vv-nav-empty').forEach((sec) => sec.classList.remove('vv-nav-empty'));
  }

  /* ---------- Toolbar (per-screen segment in the shared top bar) ---------- */

  // [i18n key, English fallback] segment options per tab. Visual only — these
  // are decorative filters in the prototype; left non-wired for now.
  const SEGMENTS = {
    'queue-tab': [['vivid.seg.board', 'Board'], ['vivid.seg.by_machine', 'By machine'], ['vivid.seg.calendar', 'Calendar']],
    'logs-tab': [['vivid.seg.all', 'All'], ['vivid.seg.unpaid', 'Unpaid'], ['vivid.seg.paid', 'Paid']],
    'analytics-tab': [['vivid.seg.revenue', 'Revenue'], ['vivid.seg.production', 'Production'], ['vivid.seg.materials', 'Materials']],
    'inventory-tab': [['vivid.seg.filament', 'Filament'], ['vivid.seg.resin', 'Resin'], ['vivid.seg.reorder', 'Reorder']],
  };

  function ensureToolbar() {
    const top = document.querySelector('.khayt-top');
    if (!top) return null;
    let bar = top.querySelector('.vv-toolbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'vv-toolbar';
      const titleWrap = top.querySelector('.khayt-toptitle');
      if (titleWrap && titleWrap.nextSibling) top.insertBefore(bar, titleWrap.nextSibling);
      else if (titleWrap) titleWrap.after(bar);
      else top.appendChild(bar);
    }
    return bar;
  }

  function removeToolbar() {
    document.querySelector('.khayt-top .vv-toolbar')?.remove();
  }

  function syncToolbar(tabId) {
    const bar = ensureToolbar();
    if (!bar) return;
    const active = tabId || document.querySelector('.tab-content.active')?.id || 'dashboard-tab';
    const seg = SEGMENTS[active];
    if (!seg) { bar.innerHTML = ''; return; }
    bar.innerHTML = `<div class="vv-seg" role="group" aria-hidden="true">${
      seg.map((s, i) => `<button type="button" tabindex="-1" class="${i === 0 ? 'on' : ''}">${escapeHtml(tr(s[0], s[1]))}</button>`).join('')
    }</div>`;
    bar.querySelectorAll('.vv-seg button').forEach((b) => {
      b.addEventListener('click', () => {
        bar.querySelectorAll('.vv-seg button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
    });
  }

  /* ---------- Bottom status bar (live counts) ---------- */

  function ensureStatusBar() {
    const appRoot = document.querySelector('.khayt-app');
    if (!appRoot) return null;
    let bar = document.getElementById('vividStatusBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'vividStatusBar';
      bar.setAttribute('aria-hidden', 'true');
      appRoot.appendChild(bar); // sits below .khayt-body in the column
    }
    return bar;
  }

  function removeStatusBar() {
    document.getElementById('vividStatusBar')?.remove();
  }

  function syncStatusBar() {
    const bar = document.getElementById('vividStatusBar');
    if (!bar || !isOn()) return;

    const log = (typeof printLog !== 'undefined' && Array.isArray(printLog)) ? printLog : [];
    const openOrders = log.filter((o) => o.status !== 'completed' && o.status !== 'quote').length;
    const printing = log.filter((o) => o.status === 'printing').length;

    // Filament used today (kg) — inventory usageHistory, the SAME source as the
    // dashboard "Filament used" tile (so the two chrome surfaces never disagree).
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dayStr = (typeof localDateStr === 'function')
      ? localDateStr(today)
      : today.toISOString().slice(0, 10);
    const inv = (typeof inventory !== 'undefined' && Array.isArray(inventory)) ? inventory : [];
    const gramsToday = inv.reduce((s, item) => s
      + (item.usageHistory || [])
        .filter((h) => h.date === dayStr)
        .reduce((a, h) => a + (+h.weightUsed || 0), 0), 0);
    const kgToday = (gramsToday / 1000).toFixed(1);

    // Honest LAN indicator — only "online" when LAN/online serving is actually enabled.
    const lanOn = !!((typeof settings !== 'undefined' && settings)
      && (settings.onlineEnabled || (settings.lanApi && settings.lanApi.bindLan)));

    const now = new Date();
    const clock = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    bar.innerHTML = `
      <span class="vv-live" aria-hidden="true"></span>
      <span class="vv-sb-item"><b>${escapeHtml(String(printing))}</b> ${escapeHtml(tr('vivid.status.printing', 'printing'))}</span>
      <span class="sepr"></span>
      <span class="vv-sb-item"><b>${escapeHtml(String(openOrders))}</b> ${escapeHtml(tr('vivid.status.orders', 'orders'))}</span>
      <span class="sepr"></span>
      <span class="vv-sb-item"><b>${escapeHtml(kgToday)} kg</b> ${escapeHtml(tr('vivid.status.today', 'today'))}</span>
      <span class="vv-sb-grow"></span>
      <span class="vv-sb-item ${lanOn ? 'vv-ok' : ''}">${escapeHtml(lanOn ? tr('vivid.status.synced', 'LAN online') : tr('vivid.status.lan_off', 'LAN off'))}</span>
      <span class="sepr"></span>
      <span class="vv-sb-item kbd-hint">${escapeHtml(tr('vivid.status.updated', 'Updated'))} ${escapeHtml(clock)}</span>`;
  }

  /* ---------- Lifecycle ---------- */

  function syncVividPageHead(tabId) {
    if (!isOn()) return;
    const active = tabId || document.querySelector('.tab-content.active')?.id || 'dashboard-tab';
    applyHue(active);
    relabelGroups();
    applyTiles();
    syncToolbar(active);
    syncStatusBar();
  }

  function applyVividShell() {
    document.getElementById('appSidebar')?.classList.remove('collapsed');
    const active = document.querySelector('.tab-content.active')?.id || 'dashboard-tab';
    applyHue(active);
    buildGroups();
    applyTiles();
    ensureToolbar();
    ensureStatusBar();
    syncToolbar(active);
    syncStatusBar();
  }

  function teardownVividShell() {
    restoreGroups();
    clearTiles();
    clearHue();
    removeToolbar();
    removeStatusBar();
  }

  global.KhaytVividShell = {
    applyVividShell,
    teardownVividShell,
    syncVividPageHead,
    syncStatusBar,
    GROUPS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
