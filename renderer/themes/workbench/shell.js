/**
 * Workbench shell — native productivity chrome around the shared renderer.
 *
 * What it does on mount:
 *  - Regroups the existing `.tab-btn` nav into Work / Catalog / Money groups
 *    (relabel + reparent the SAME buttons — navigation logic is untouched).
 *  - Paints a color tile behind each nav icon.
 *  - Builds a per-screen toolbar segment in the shared top bar.
 *  - Builds a bottom status bar fed from live order/printer counts.
 *
 * Everything is reversed on teardown: buttons return to their original
 * sections, injected chrome is removed, and inline tile colors are cleared.
 */
(function (global) {
  // Translate with graceful English fallback (follows language switches).
  const tr = (k, d) => { const s = (typeof t === 'function') ? t(k) : null; return (s && s !== k) ? s : d; };

  // Grouped layout: ordered groups of nav tabs. Tabs not listed here keep
  // their original position (e.g. dashboard stays at top, settings in footer).
  const GROUPS = [
    { key: 'work', labelKey: 'workbench.group.work', label: 'Work',
      tabs: ['calculator-tab', 'queue-tab', 'printfiles-tab', 'colorstudio-tab', 'converter-tab', 'inventory-tab', 'waste-tab'] },
    { key: 'catalog', labelKey: 'workbench.group.catalog', label: 'Catalog',
      tabs: ['catalog-tab', 'clients-tab', 'gift-cards-tab', 'portfolio-tab'] },
    { key: 'money', labelKey: 'workbench.group.money', label: 'Money',
      tabs: ['logs-tab', 'analytics-tab', 'expenses-tab'] },
  ];

  // Per-tab tile color (CSS var name from tokens.css).
  const TILE = {
    'dashboard-tab': 'var(--accent)',
    'calculator-tab': 'var(--wb-purple)',
    'queue-tab': 'var(--wb-blue)',
    'inventory-tab': 'var(--wb-amber)',
    'waste-tab': 'var(--wb-teal)',
    'catalog-tab': 'var(--wb-blue)',
    'clients-tab': 'var(--wb-pink)',
    'gift-cards-tab': 'var(--wb-green)',
    'portfolio-tab': 'var(--wb-purple)',
    'logs-tab': 'var(--wb-green)',
    'analytics-tab': 'var(--accent)',
    'expenses-tab': 'var(--wb-amber)',
    'settings-tab': 'var(--ink-3)',
  };

  function isOn() { return document.body.classList.contains('khayt-workbench'); }

  /* ---------- Sidebar regrouping ---------- */

  function applyTiles() {
    document.querySelectorAll('.khayt-nav .tab-btn[data-tab], .khayt-navfoot .tab-btn[data-tab]').forEach((btn) => {
      const tile = TILE[btn.dataset.tab];
      if (tile) btn.style.setProperty('--wb-tile', tile);
    });
  }

  function clearTiles() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      btn.style.removeProperty('--wb-tile');
    });
  }

  function buildGroups() {
    const nav = document.querySelector('.khayt-nav');
    if (!nav || nav.querySelector('[data-wb-group]')) return; // already built

    // Remember each button's original parent + position so teardown can restore.
    nav.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      if (btn.dataset.wbHome) return;
      const sec = btn.closest('.khayt-navsec');
      if (!sec) return;
      if (!sec.id) sec.id = `wb-orig-${Math.random().toString(36).slice(2, 8)}`;
      const sibs = [...sec.children];
      btn.dataset.wbHome = sec.id;
      btn.dataset.wbHomeIdx = String(sibs.indexOf(btn));
      // Preserve simple-mode gating: a tab hidden only via its `pro-only` parent
      // section must keep that gating after it's reparented into a new group
      // (e.g. analytics-tab, whose button itself has no `pro-only` class).
      if (!btn.classList.contains('pro-only') && sec.classList.contains('pro-only')) {
        btn.classList.add('pro-only');
        btn.dataset.wbProonly = '1';
      }
    });

    GROUPS.forEach((grp) => {
      const wrap = document.createElement('div');
      wrap.className = 'khayt-navsec nav-group';
      wrap.dataset.wbGroup = grp.key;
      const head = document.createElement('div');
      head.className = 'eyebrow khayt-navhead nav-group-label';
      head.dataset.wbGroupHead = '1';
      head.textContent = tr(grp.labelKey, grp.label);
      wrap.appendChild(head);
      grp.tabs.forEach((tabId) => {
        const btn = document.querySelector(`.khayt-nav .tab-btn[data-tab="${tabId}"]`);
        if (btn) wrap.appendChild(btn); // moves the SAME button (events intact)
      });
      nav.appendChild(wrap);
    });

    // Hide original sections that are now empty of nav buttons.
    nav.querySelectorAll('.khayt-navsec:not([data-wb-group])').forEach((sec) => {
      const hasBtn = !!sec.querySelector('.tab-btn[data-tab]');
      sec.classList.toggle('wb-nav-empty', !hasBtn);
    });
  }

  function relabelGroups() {
    document.querySelectorAll('[data-wb-group-head]').forEach((head) => {
      const grp = GROUPS.find((g) => g.key === head.closest('[data-wb-group]')?.dataset.wbGroup);
      if (grp) head.textContent = tr(grp.labelKey, grp.label);
    });
  }

  function restoreGroups() {
    // Move each button back to its recorded home section + index.
    const buttons = [...document.querySelectorAll('.tab-btn[data-wb-home]')];
    // Restore in ascending original index so insertion lands correctly.
    buttons.sort((a, b) => Number(a.dataset.wbHomeIdx) - Number(b.dataset.wbHomeIdx));
    buttons.forEach((btn) => {
      const sec = document.getElementById(btn.dataset.wbHome);
      if (sec) {
        const idx = Number(btn.dataset.wbHomeIdx);
        const ref = sec.children[idx] || null;
        sec.insertBefore(btn, ref);
      }
      // Undo the pro-only class we added during regrouping (the button returns
      // to its original pro-only section, which gates it again).
      if (btn.dataset.wbProonly) {
        btn.classList.remove('pro-only');
        delete btn.dataset.wbProonly;
      }
      delete btn.dataset.wbHome;
      delete btn.dataset.wbHomeIdx;
    });
    document.querySelectorAll('[data-wb-group]').forEach((el) => el.remove());
    document.querySelectorAll('.khayt-navsec.wb-nav-empty').forEach((sec) => sec.classList.remove('wb-nav-empty'));
  }

  /* ---------- Toolbar (per-screen segment in the shared top bar) ---------- */

  // The per-screen segment pills (Kanban/List, All/Unpaid/Paid, …) were purely
  // decorative — rendered aria-hidden/tabindex=-1 and only toggled a class, so
  // they did nothing but mislead users. Removed for accessibility; re-add here
  // wired to real view-switches if/when those land.

  function removeToolbar() {
    document.querySelector('.khayt-top .wb-toolbar')?.remove();
  }

  function syncToolbar() {
    removeToolbar();
  }

  /* ---------- Bottom status bar (live counts) ---------- */

  function ensureStatusBar() {
    const appRoot = document.querySelector('.khayt-app');
    if (!appRoot) return null;
    let bar = document.getElementById('workbenchStatusBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'workbenchStatusBar';
      bar.setAttribute('aria-hidden', 'true');
      appRoot.appendChild(bar); // sits below .khayt-body in the column
    }
    return bar;
  }

  function removeStatusBar() {
    document.getElementById('workbenchStatusBar')?.remove();
  }

  function syncStatusBar() {
    const bar = document.getElementById('workbenchStatusBar');
    if (!bar || !isOn()) return;

    const log = (typeof printLog !== 'undefined' && Array.isArray(printLog)) ? printLog : [];
    const openOrders = log.filter((o) => o.status !== 'completed' && o.status !== 'quote').length;
    const printing = log.filter((o) => o.status === 'printing').length;

    // Filament used today (kg) — sum of grams on today's orders, if present.
    let gramsToday = 0;
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dayStr = (typeof localDateStr === 'function')
        ? localDateStr(today)
        : today.toISOString().slice(0, 10);
      gramsToday = log
        .filter((o) => dayStr && (o.date || '').startsWith(dayStr))
        .reduce((s, o) => s + (Number(o.grams) || Number(o.weight) || 0), 0);
    } catch (_) { gramsToday = 0; }
    const kgToday = (gramsToday / 1000).toFixed(1);

    const now = new Date();
    const clock = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    bar.innerHTML = `
      <span class="wb-dot" style="background:var(--wb-green)"></span>
      <span><b>${escapeHtml(String(openOrders))}</b> ${escapeHtml(tr('workbench.status.orders', 'orders'))}</span>
      <span class="sepr">·</span>
      <span><b style="color:var(--wb-blue)">${escapeHtml(String(printing))}</b> ${escapeHtml(tr('workbench.status.printing', 'printing'))}</span>
      <span class="sepr">·</span>
      <span><b>${escapeHtml(kgToday)} kg</b> ${escapeHtml(tr('workbench.status.today', 'today'))}</span>
      <span class="sepr">·</span>
      <span class="wb-ok">${escapeHtml(tr('workbench.status.synced', 'synced'))} ✓</span>
      <span class="wb-sb-right">
        <span>${escapeHtml(tr('workbench.status.updated', 'Updated'))} ${escapeHtml(clock)}</span>
      </span>`;
  }

  /* ---------- Lifecycle ---------- */

  function syncWorkbenchPageHead(tabId) {
    if (!isOn()) return;
    relabelGroups();
    applyTiles();
    syncToolbar(tabId);
    syncStatusBar();
  }

  function applyWorkbenchShell() {
    document.getElementById('appSidebar')?.classList.remove('collapsed');
    buildGroups();
    applyTiles();
    removeToolbar();
    ensureStatusBar();
    syncStatusBar();
  }

  function teardownWorkbenchShell() {
    restoreGroups();
    clearTiles();
    removeToolbar();
    removeStatusBar();
  }

  global.KhaytWorkbenchShell = {
    applyWorkbenchShell,
    teardownWorkbenchShell,
    syncWorkbenchPageHead,
    syncStatusBar,
    GROUPS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
