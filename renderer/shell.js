/**
 * UI shell: toasts, modals, theme, tabs, global search, help.
 */
var _escHandlerStack = [];

(function (global) {
const FOCUSABLE_SEL = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function attachFocusTrap(root) {
  const previousFocus = document.activeElement;
  function onKeyDown(e) {
    if (e.key !== 'Tab' || !root) return;
    const focusables = [...root.querySelectorAll(FOCUSABLE_SEL)]
      .filter((el) => !el.closest('[aria-hidden="true"]') && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first || !root.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  root.addEventListener('keydown', onKeyDown);
  return () => {
    root.removeEventListener('keydown', onKeyDown);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      try { previousFocus.focus(); } catch (_) { /* ignore */ }
    }
  };
}

function rankSearch(items, query, getHaystack, limit) {
  const rank = global.KhaytSearch?.rankByQuery;
  if (rank) return rank(items, query, getHaystack, limit);
  const q = String(query || '').toLowerCase().trim();
  return items.filter((item) => getHaystack(item).toLowerCase().includes(q)).slice(0, limit);
}
/* ============================================================
   Toasts (now with optional undo button)
   ============================================================ */
function toast(msg, kind = 'info', ms = 2800, opts = {}) {
  const c = $('#toastContainer');
  // Cap at 6 visible toasts — remove oldest if over limit
  const existing = c.querySelectorAll('.toast');
  if (existing.length >= 6) existing[0].remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  if (opts.undo) {
    const btn = document.createElement('button');
    btn.className = 'undo-btn';
    btn.textContent = t('oe.undo');
    btn.addEventListener('click', () => {
      try { opts.undo(); } catch (e) { console.error(e); }
      el.remove();
    });
    el.appendChild(btn);
  }
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; }, ms - 250);
  setTimeout(() => el.remove(), ms);
}

/* ============================================================
   Modals (confirm + form host)
   ============================================================ */
/** Append a stacked modal overlay (does not replace an open form modal). */
function appendStackedModal(innerHtml, { zIndex = 10050 } = {}) {
  const mount = $('#modalMount');
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop confirm-modal-overlay';
  overlay.style.zIndex = String(zIndex);
  overlay.innerHTML = innerHtml;
  mount.appendChild(overlay);
  return overlay;
}

function confirmModal(message, { okText, cancelText, danger = false } = {}) {
  return new Promise(resolve => {
    const mount = $('#modalMount');
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop confirm-modal-overlay';
    overlay.style.zIndex = '10050';
    overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle">
          <h3 id="confirmModalTitle">${escapeHtml(t('common.confirm'))}</h3>
          <p>${escapeHtml(message)}</p>
          <div class="btn-row">
            <button class="btn ghost" data-act="cancel">${escapeHtml(cancelText || t('common.cancel'))}</button>
            <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${escapeHtml(okText || t('common.confirm'))}</button>
          </div>
        </div>`;
    mount.appendChild(overlay);
    const dialog = overlay.querySelector('.modal');
    const releaseFocus = attachFocusTrap(dialog || overlay);
    const cleanup = (val) => {
      document.removeEventListener('keydown', escHandler);
      const idx = _escHandlerStack.indexOf(escHandler);
      if (idx !== -1) _escHandlerStack.splice(idx, 1);
      releaseFocus();
      overlay.remove();
      resolve(val);
    };
    const escHandler = (e) => {
      if (e.key !== 'Escape') return;
      if (_escHandlerStack[_escHandlerStack.length - 1] !== escHandler) return;
      cleanup(false);
    };
    _escHandlerStack.push(escHandler);
    document.addEventListener('keydown', escHandler);
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => cleanup(true));
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}

/* a11y: programmatically tie visible <label>s to their control. Many field groups
   render `<div><label>…</label><input id></div>` with no for=, so screen readers
   don't announce the field's purpose. For each orphan label, if its field-group
   holds exactly one labelable control, link them (minting an id if needed).
   Conservative — skips groups with 0 or >1 controls, labels that already wrap or
   point to a control, and already-labelled controls. Idempotent: once a label
   gains for=, it drops out of the selector, so re-running after every render is
   cheap and safe. */
function wireFormLabels(root) {
  root = root || document;
  root.querySelectorAll('label:not([for])').forEach((label) => {
    if (label.querySelector('input, select, textarea')) return; // already wraps its control
    // The control is the label's next element sibling — covers both wrapped
    // groups (`<div><label/><input/></div>`) and flat rows (`<label/><input/>`).
    const ctrl = label.nextElementSibling;
    if (!ctrl || !/^(INPUT|SELECT|TEXTAREA)$/.test(ctrl.tagName) || ctrl.type === 'hidden') return;
    if (ctrl.getAttribute('aria-label') || ctrl.getAttribute('aria-labelledby')) return;
    if (!ctrl.id) ctrl.id = 'fa11y_' + (wireFormLabels._n = (wireFormLabels._n || 0) + 1);
    label.setAttribute('for', ctrl.id);
  });
  // Toolbar filter <select>s rarely have a visible <label>; their first option
  // ("All statuses", "All time", "All clients", …) names the filter dimension.
  // Use it as the accessible name so a screen reader announces the field's
  // purpose, not only its current value. Skips selects already labelled above.
  root.querySelectorAll('select:not([aria-label]):not([aria-labelledby])').forEach((sel) => {
    if (sel.id && root.querySelector(`label[for="${CSS.escape(sel.id)}"]`)) return;
    if (sel.closest('label')) return;
    const name = sel.options && sel.options[0] && sel.options[0].textContent.trim();
    if (name) sel.setAttribute('aria-label', name);
  });
}

function openFormModal({ title, bodyHtml, onMount, onSave, saveLabel, sizeLg = true, noSave = false }) {
  const mount = $('#modalMount');
  mount.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal modal-form ${sizeLg ? 'modal-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-header">
          <h3 id="modalTitle">${escapeHtml(title)}</h3>
          <button class="btn ghost small" data-act="cancel" aria-label="${escapeHtml(t('common.close') || 'Close')}">×</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">
          ${noSave
            ? `<button class="btn ghost" data-act="cancel">${escapeHtml(t('common.close') || 'Close')}</button>`
            : `<button class="btn ghost" data-act="cancel">${escapeHtml(t('common.cancel'))}</button>
               <button class="btn primary" data-act="save">${escapeHtml(saveLabel || t('common.save'))}</button>`
          }
        </div>
      </div>
    </div>`;
  const modal = mount.querySelector('.modal');
  const releaseFocus = attachFocusTrap(modal);
  const close = () => {
    document.removeEventListener('keydown', escHandler);
    const idx = _escHandlerStack.indexOf(escHandler);
    if (idx !== -1) _escHandlerStack.splice(idx, 1);
    releaseFocus();
    mount.innerHTML = '';
  };
  const escHandler = (e) => {
    if (e.key !== 'Escape') return;
    if (_escHandlerStack[_escHandlerStack.length - 1] !== escHandler) return;
    close();
  };
  _escHandlerStack.push(escHandler);
  document.addEventListener('keydown', escHandler);
  mount.querySelectorAll('[data-act="cancel"]').forEach(b => b.addEventListener('click', close));
  mount.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) close();
  });
  if (!noSave) {
    mount.querySelector('[data-act="save"]').addEventListener('click', async () => {
      try {
        const result = await onSave(modal);
        if (result !== false) close();
      } catch (err) {
        console.error('Modal save error:', err);
        toast(String(err.message || err), 'error');
      }
    });
  }
  if (onMount) onMount(modal);
  wireFormLabels(modal); // a11y: associate any orphan labels the modal rendered
  // Move focus into the first form field (skip header close button)
  const firstInput = modal.querySelector('.modal-body input, .modal-body select, .modal-body textarea, .modal-body button');
  if (firstInput) firstInput.focus();
}

/* ============================================================
   Theme
   ============================================================ */
// One-time listener: keeps the app in sync when the OS theme changes
// while the user has "System" selected — registered lazily on first use.
let _sysThemeMql = null;

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'dark' : 'light';
    if (!_sysThemeMql) {
      _sysThemeMql = window.matchMedia('(prefers-color-scheme: dark)');
      _sysThemeMql.addEventListener('change', e => {
        if (localStorage.getItem(K.THEME) === 'system') {
          document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
        }
      });
    }
  } else {
    root.dataset.theme = theme;
  }
  localStorage.setItem(K.THEME, theme);
}

/* ============================================================
   Business Mode
   ============================================================ */
function applyAnalyticsModeView() {
  const simple = settings.mode === 'simple';
  const simpleWrap = $('#analyticsSimpleWrap');
  const proWrap = $('#analyticsProWrap');
  if (simpleWrap) simpleWrap.style.display = simple ? 'block' : 'none';
  if (proWrap) proWrap.style.display = simple ? 'none' : 'block';
  if ($('#analytics-tab')?.classList.contains('active')) {
    if (simple) renderSimpleReports();
    else renderAnalytics();
  }
}

function applyMode() {
  document.body.classList.toggle('mode-simple', settings.mode === 'simple');
  document.body.classList.toggle('mode-professional', settings.mode === 'professional');
  const btnSimple = $('#btnModeSimple');
  const btnPro    = $('#btnModePro');
  if (btnSimple) btnSimple.classList.toggle('active', settings.mode === 'simple');
  if (btnPro)    btnPro.classList.toggle('active',    settings.mode === 'professional');
  renderModeTierCompare();
  applyAnalyticsModeView();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderOnlineSettings === 'function') renderOnlineSettings();
}

/** Render the Simple-vs-Professional tier comparison from the canonical registry
 *  (lib/feature-tiers.js), highlighting the active tier. Makes the boundary clear. */
function renderModeTierCompare() {
  const el = $('#modeTierCompare');
  if (!el || typeof KhaytTiers === 'undefined') return;
  const lang = (typeof i18n !== 'undefined' && i18n.current) || 'en';
  const cmp = KhaytTiers.tierComparison(lang);
  const pro = !KhaytTiers.isProMode(settings.mode) ? false : true;
  const check = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M20 6 9 17l-5-5"/></svg>';
  const col = (title, rows, active, accent) => `
    <div style="flex:1;min-width:180px;border:1px solid ${active ? accent : 'var(--border-soft)'};border-radius:10px;padding:12px 14px;${active ? 'box-shadow:0 0 0 1px ' + accent + ';' : 'opacity:.85;'}">
      <div style="font-weight:700;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">${escapeHtml(title)}${active ? `<span style="font-size:10px;color:${accent};border:1px solid ${accent};border-radius:999px;padding:1px 7px;">${escapeHtml(t('set.mode_current') || 'current')}</span>` : ''}</div>
      ${rows.map((r) => `<div style="font-size:12px;color:var(--text-muted);padding:2px 0;display:flex;gap:6px;align-items:flex-start;"><span style="color:${accent};flex-shrink:0;">${check}</span>${escapeHtml(r.label)}</div>`).join('')}
    </div>`;
  el.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${col(t('set.mode_simple') || 'Simple', cmp.simple, !pro, 'var(--info,#5b9cf0)')}
      ${col((t('set.mode_pro') || 'Professional') + ' — ' + (t('set.mode_pro_adds') || 'everything in Simple, plus'), cmp.pro, pro, 'var(--primary,#6366f1)')}
    </div>`;
}


/* ============================================================
   Khayt Studio shell
   ============================================================ */
function initAppShell() {
  const sidebar = $('#appSidebar');
  const collapseBtn = $('#btnSidebarCollapse');
  if (localStorage.getItem('hub_sidebar_collapsed') === '1') {
    sidebar?.classList.add('collapsed');
    collapseBtn?.setAttribute('aria-expanded', 'false');
  }
  collapseBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('collapsed');
    const collapsed = sidebar?.classList.contains('collapsed');
    localStorage.setItem('hub_sidebar_collapsed', collapsed ? '1' : '0');
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const chevron = collapseBtn.querySelector('[aria-hidden="true"]');
    if (chevron) chevron.textContent = collapsed ? '›' : '‹';
  });

  const mirror = $('#topbarSearchMirror');
  const searchBtn = $('#btnGlobalSearch');
  const openSearch = () => searchBtn?.click();
  mirror?.addEventListener('click', openSearch);
  mirror?.addEventListener('focus', openSearch);

  if (typeof applyDesignSettings === 'function') applyDesignSettings();
  else if (typeof populateDesignSelects === 'function') populateDesignSelects();

  if (document.body.classList.contains('khayt-ledger')) {
    global.KhaytLedgerShell?.bindTabNav?.();
  }

  syncTopbarTitle($('.tab-content.active')?.id || 'dashboard-tab');

  window.KhaytStudio?.init?.();

  const nav = $('.khayt-nav[role="tablist"]');
  nav?.addEventListener('keydown', (e) => {
    const tabs = [...nav.querySelectorAll('.tab-btn[role="tab"]')]
      .filter((btn) => btn.offsetParent !== null && !btn.disabled);
    if (!tabs.length) return;
    const idx = tabs.findIndex((btn) => btn.getAttribute('aria-selected') === 'true');
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next = (idx + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      next = (idx - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = tabs.length - 1;
    } else {
      return;
    }
    tabs[next].focus();
    switchTab(tabs[next].dataset.tab);
  });

  $('.kanban')?.classList.add('khayt-kanban');
  $$('.kanban-col').forEach(col => {
    col.classList.add('khayt-kcol');
    col.querySelector('[id^="list-"]')?.classList.add('khayt-kcol-body');
    const head = col.querySelector('h3');
    if (head && !head.parentElement.classList.contains('khayt-kcol-head')) {
      const wrap = document.createElement('div');
      wrap.className = 'khayt-kcol-head';
      head.parentNode.insertBefore(wrap, head);
      wrap.appendChild(head);
      const meta = col.querySelector('.kanban-col-meta');
      if (meta) wrap.appendChild(meta);
    }
  });
}

function syncTopbarTitle(tabId) {
  const activeBtn = $(`.tab-btn[data-tab="${tabId}"]`);
  const titleKey = activeBtn?.querySelector('[data-i18n]')?.getAttribute('data-i18n');
  const topTitle = $('#topbarPageTitle');
  if (topTitle && titleKey) topTitle.textContent = t(titleKey);
  const sub = $('#topbarPageSubtitle');
  if (!sub) return;
  if (tabId === 'dashboard-tab') {
    const d = new Date();
    sub.textContent = d.toLocaleDateString(i18n.current === 'ar' ? 'ar-SA' : 'en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  } else if (document.body.classList.contains('khayt-handoff') && typeof KhaytLedgerShell?.ledgerTabSubtitle === 'function') {
    sub.textContent = KhaytLedgerShell.ledgerTabSubtitle(tabId);
  } else {
    sub.textContent = '';
  }
}


/* ============================================================
   Tabs
   ============================================================ */
function openSettingsSection(section) {
  switchTab('settings-tab');
  $$('.settings-nav-item').forEach(el => {
    el.classList.remove('active');
    el.removeAttribute('aria-current');
  });
  $$('.settings-panel').forEach(el => el.classList.remove('active'));
  const navItem = $(`.settings-nav-item[data-settings-section="${section}"]`);
  navItem?.classList.add('active');
  navItem?.setAttribute('aria-current', 'page');
  navItem?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  const panel = $(`#settings-panel-${section}`);
  if (panel) {
    panel.classList.add('active');
    panel.scrollTop = 0;
  }
  if (section === 'online' && typeof renderOnlineSettings === 'function') renderOnlineSettings();
}

function switchTab(tabId) {
  $$('.tab-content').forEach(el => {
    const on = el.id === tabId;
    el.classList.toggle('active', on);
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  });
  $$('.tab-btn').forEach(btn => {
    const on = btn.dataset.tab === tabId;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    btn.setAttribute('tabindex', on ? '0' : '-1');
  });

  $$('.tab-btn.khayt-navitem').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.tab === tabId);
    btn.setAttribute('aria-current', btn.dataset.tab === tabId ? 'page' : 'false');
  });

  syncTopbarTitle(tabId);
  if (typeof KhaytLedgerShell?.syncLedgerPageHead === 'function') {
    KhaytLedgerShell.syncLedgerPageHead(tabId);
  }
  if (typeof KhaytConsoleShell?.syncConsolePageHead === 'function') {
    KhaytConsoleShell.syncConsolePageHead(tabId);
  }
  if (typeof KhaytCockpitShell?.syncCockpitPageHead === 'function') {
    KhaytCockpitShell.syncCockpitPageHead(tabId);
  }
  if (typeof KhaytAtlasShell?.syncAtlasPageHead === 'function') {
    KhaytAtlasShell.syncAtlasPageHead(tabId);
  }
  if (typeof KhaytWorkbenchShell?.syncWorkbenchPageHead === 'function') {
    KhaytWorkbenchShell.syncWorkbenchPageHead(tabId);
  }
  if (typeof KhaytCommandShell?.syncCommandPageHead === 'function') {
    KhaytCommandShell.syncCommandPageHead(tabId);
  }
  if (typeof KhaytVividShell?.syncVividPageHead === 'function') {
    KhaytVividShell.syncVividPageHead(tabId);
  }

  if (tabId === 'dashboard-tab')  renderDashboard();
  if (tabId === 'expenses-tab')   { renderExpenses(); populateExpOrderDatalist(); }
  if (tabId === 'catalog-tab')    renderCatalog();
  if (tabId === 'clients-tab')    renderClients();
  if (tabId === 'calculator-tab')  window.KhaytStudio?.initStudioCalculatorLayout?.();
  if (tabId === 'queue-tab')      { renderMachineQueues(); renderKanban(); }
  if (tabId === 'analytics-tab')  applyAnalyticsModeView();
  if (tabId === 'gift-cards-tab') renderGiftCards();
  if (tabId === 'logs-tab')       renderLogs();
  if (tabId === 'portfolio-tab')  renderPortfolio();
  if (tabId === 'waste-tab')      renderWasteLog();
  if (tabId === 'inventory-tab')  { renderInventory(); renderPurchaseOrders(); renderConsumables(); renderSuppliers(); }
  if (tabId === 'settings-tab') {
    // Activate the first sidebar nav item if none is active
    const activePanel = $('.settings-panel.active');
    if (!activePanel) {
      const firstNav = $('.settings-nav-item[data-settings-section]');
      if (firstNav) {
        const section = firstNav.dataset.settingsSection;
        firstNav.classList.add('active');
        firstNav.setAttribute('aria-current', 'page');
        $(`#settings-panel-${section}`)?.classList.add('active');
      }
    }
  }
  wireFormLabels(); // a11y: link any labels the just-rendered tab surfaced
}
/* ============================================================
   Global ⌘K / Ctrl+K search
   ============================================================ */
let globalSearchOpen = false;
let gsFocusedIndex = -1;

function openGlobalSearch() {
  const overlay = $('#globalSearchOverlay');
  const input   = $('#globalSearchInput');
  if (!overlay) return;
  globalSearchOpen = true;
  gsFocusedIndex = -1;
  overlay.style.display = 'flex';
  input.value = '';
  input.focus();
  renderGlobalResults('');
}

function closeGlobalSearch() {
  const overlay = $('#globalSearchOverlay');
  if (!overlay) return;
  globalSearchOpen = false;
  gsFocusedIndex = -1;
  overlay.style.display = 'none';
}

function updateGsFocus(results) {
  results.forEach((row, i) => row.classList.toggle('focused', i === gsFocusedIndex));
  if (gsFocusedIndex >= 0 && results[gsFocusedIndex]) {
    results[gsFocusedIndex].scrollIntoView({ block: 'nearest' });
  }
}

function handleGlobalSearchKeydown(e) {
  if (!globalSearchOpen) return false;
  const results = [...($('#globalSearchResults')?.querySelectorAll('.gs-result') || [])];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    gsFocusedIndex = results.length ? (gsFocusedIndex + 1) % results.length : -1;
    updateGsFocus(results);
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    gsFocusedIndex = results.length
      ? (gsFocusedIndex <= 0 ? results.length - 1 : gsFocusedIndex - 1)
      : -1;
    updateGsFocus(results);
    return true;
  }
  if (e.key === 'Enter' && gsFocusedIndex >= 0 && results[gsFocusedIndex]) {
    e.preventDefault();
    results[gsFocusedIndex].click();
    return true;
  }
  return false;
}

function renderGlobalResults(term) {
  const el = $('#globalSearchResults');
  if (!el) return;
  gsFocusedIndex = -1;
  if (!term.trim()) {
    el.innerHTML = `<div class="gs-hint">${escapeHtml(t('search.hint'))}</div>`;
    return;
  }
  const sections = [];

  const orderHaystack = (o) => {
    const client = o.clientId ? clients.find((x) => x.id === o.clientId) : null;
    return [
      o.id, o.project, o.material, o.notes, o.trackingNumber,
      ...(o.tags || []),
      client?.nameEn, client?.nameAr,
    ].filter(Boolean).join(' ');
  };

  const matchOrders = rankSearch(printLog, term, orderHaystack, 6);
  if (matchOrders.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.orders'))}</div>`);
    sections.push(matchOrders.map(o => `
      <div class="gs-result" data-gs-action="order" data-gs-id="${escapeHtml(o.id)}">
        <span class="gs-icon">📋</span>
        <span class="gs-title">${escapeHtml(o.project || o.id)}</span>
        <span class="gs-meta">${escapeHtml(o.id)} · ${fmtPrice(o.price)} · <span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span></span>
      </div>`).join(''));
  }

  const matchClients = rankSearch(
    clients,
    term,
    (c) => [c.id, c.nameEn, c.nameAr, c.phone, c.email].filter(Boolean).join(' '),
    4,
  );
  if (matchClients.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.clients'))}</div>`);
    sections.push(matchClients.map(c => `
      <div class="gs-result" data-gs-action="client" data-gs-id="${escapeHtml(c.id)}">
        <span class="gs-icon">👤</span>
        <span class="gs-title">${escapeHtml(localName(c))}</span>
        <span class="gs-meta">${escapeHtml(c.phone || c.email || '')}</span>
      </div>`).join(''));
  }

  const matchProducts = rankSearch(
    products,
    term,
    (p) => [p.nameEn, p.nameAr, p.description].filter(Boolean).join(' '),
    4,
  );
  if (matchProducts.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.products'))}</div>`);
    sections.push(matchProducts.map(p => `
      <div class="gs-result" data-gs-action="product" data-gs-id="${escapeHtml(p.id)}">
        <span class="gs-icon">📦</span>
        <span class="gs-title">${escapeHtml(localName(p))}</span>
        <span class="gs-meta">${fmtPrice(p.basePrice || 0)}</span>
      </div>`).join(''));
  }

  const matchInv = rankSearch(
    inventory,
    term,
    (i) => [i.material, i.brand, i.colour, i.id].filter(Boolean).join(' '),
    4,
  );

  const matchMachines = rankSearch(
    machines,
    term,
    (m) => [m.name, m.model, m.location, ...(m.compatMaterials || [])].filter(Boolean).join(' '),
    3,
  );
  if (matchMachines.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.machines'))}</div>`);
    sections.push(matchMachines.map((m) => `
      <div class="gs-result" data-gs-action="machine" data-gs-id="${escapeHtml(m.id)}">
        <span class="gs-icon">🖨️</span>
        <span class="gs-title">${escapeHtml(m.name)}</span>
        <span class="gs-meta">${escapeHtml(m.model || t('mach.unassigned'))}</span>
      </div>`).join(''));
  }

  const matchSuppliers = rankSearch(
    suppliers,
    term,
    (s) => [s.name, s.phone, s.email, s.website].filter(Boolean).join(' '),
    3,
  );
  if (matchSuppliers.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.suppliers'))}</div>`);
    sections.push(matchSuppliers.map((s) => `
      <div class="gs-result" data-gs-action="supplier" data-gs-id="${escapeHtml(s.id)}">
        <span class="gs-icon">🏭</span>
        <span class="gs-title">${escapeHtml(s.name)}</span>
        <span class="gs-meta">${escapeHtml(s.phone || s.email || '')}</span>
      </div>`).join(''));
  }

  const matchExpenses = rankSearch(
    expenses,
    term,
    (e) => [e.note, e.category, e.vendor, e.orderId].filter(Boolean).join(' '),
    3,
  );
  if (matchExpenses.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.expenses'))}</div>`);
    sections.push(matchExpenses.map((e) => `
      <div class="gs-result" data-gs-action="expense" data-gs-id="${escapeHtml(e.id)}">
        <span class="gs-icon">◧</span>
        <span class="gs-title">${escapeHtml(e.note || (typeof expCatLabel === 'function' ? expCatLabel(e.category) : e.category) || 'Expense')}</span>
        <span class="gs-meta">${escapeHtml(e.date || '')} · ${fmtPrice(e.amount)}</span>
      </div>`).join(''));
  }
  if (matchInv.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.inventory'))}</div>`);
    sections.push(matchInv.map(i => `
      <div class="gs-result" data-gs-action="inventory" data-gs-id="${escapeHtml(i.id)}">
        <span class="gs-icon">🧵</span>
        <span class="gs-title">${escapeHtml(i.material)}</span>
        <span class="gs-meta">${Math.round(i.weight)}g · ${fmtPrice(i.cost)}</span>
      </div>`).join(''));
  }

  el.innerHTML = sections.length ? sections.join('') : `<div class="gs-hint">${escapeHtml(t('search.no_results'))}</div>`;

  el.querySelectorAll('.gs-result').forEach(row => {
    row.addEventListener('click', () => {
      const action = row.dataset.gsAction;
      const id     = row.dataset.gsId;
      closeGlobalSearch();
      if (action === 'order')     { switchTab('logs-tab');       setTimeout(() => { logSearchTerm = id; renderLogs(); }, 50); }
      if (action === 'client')    { switchTab('clients-tab');    setTimeout(() => { clientSearchTerm = id; renderClients(); }, 50); }
      if (action === 'product') {
        switchTab('catalog-tab');
        catalogSearchTerm = '';
        const catInput = $('#catalogSearch');
        if (catInput) catInput.value = '';
        setTimeout(() => {
          renderCatalog();
          const card = document.querySelector(`.product-card[data-id="${CSS.escape(id)}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('highlight-flash');
            setTimeout(() => card.classList.remove('highlight-flash'), 1500);
          }
        }, 80);
      }
      if (action === 'inventory') {
        switchTab('inventory-tab');
        if (id) setTimeout(() => {
          const row = document.querySelector(`[data-inv-id="${CSS.escape(id)}"]`);
          if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('highlight-flash'); setTimeout(() => row.classList.remove('highlight-flash'), 1500); }
        }, 80);
      }
      if (action === 'machine') {
        openSettingsSection('printers');
        setTimeout(() => {
          renderMachines();
          const row = document.querySelector(`[data-machine-id="${CSS.escape(id)}"]`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('highlight-flash');
            setTimeout(() => row.classList.remove('highlight-flash'), 1500);
          }
        }, 80);
      }
      if (action === 'supplier') {
        switchTab('inventory-tab');
        setTimeout(() => {
          renderSuppliers();
          const row = document.querySelector(`[data-supplier-id="${CSS.escape(id)}"]`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('highlight-flash');
            setTimeout(() => row.classList.remove('highlight-flash'), 1500);
          }
        }, 80);
      }
      if (action === 'expense') {
        switchTab('expenses-tab');
        setTimeout(() => {
          renderExpenses();
          const row = document.querySelector(`[data-expense-id="${CSS.escape(id)}"]`);
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('highlight-flash');
            setTimeout(() => row.classList.remove('highlight-flash'), 1500);
          }
        }, 80);
      }
    });
  });
}

/* ============================================================
   In-app help system (Feature 9)
   ============================================================ */
function openHelpModal() {
  const tabs = ['start', 'calc', 'queue', 'invoice', 'backup'];
  const tabNavHtml = tabs.map((tab, i) => `<button class="help-tab-btn${i === 0 ? ' active' : ''}" data-htab="${tab}">${escapeHtml(t('help.tab.' + tab))}</button>`).join('');
  const tabContentHtml = tabs.map((tab, i) => `
    <div class="help-tab-content${i === 0 ? ' active' : ''}" id="htab-${tab}">
      <div class="help-section">
        <h4>${escapeHtml(t('help.' + tab + '.h1'))}</h4>
        <p>${escapeHtml(t('help.' + tab + '.p1'))}</p>
        ${t('help.' + tab + '.h2') !== 'help.' + tab + '.h2' ? `<h4>${escapeHtml(t('help.' + tab + '.h2'))}</h4>` : ''}
        ${['li1','li2','li3'].some(k => t('help.' + tab + '.' + k) !== 'help.' + tab + '.' + k)
          ? `<ul>${['li1','li2','li3'].filter(k => t('help.' + tab + '.' + k) !== 'help.' + tab + '.' + k).map(k => `<li>${escapeHtml(t('help.' + tab + '.' + k))}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`).join('');

  openFormModal({
    title: t('help.title'),
    noSave: true,
    sizeLg: true,
    bodyHtml: `
      <div class="help-tab-nav">${tabNavHtml}</div>
      <div id="helpTabContents">${tabContentHtml}</div>`,
    onMount(modal) {
      modal.querySelector('.help-tab-nav').addEventListener('click', (e) => {
        const btn = e.target.closest('.help-tab-btn');
        if (!btn) return;
        modal.querySelectorAll('.help-tab-btn').forEach(b => b.classList.remove('active'));
        modal.querySelectorAll('.help-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tc = modal.querySelector('#htab-' + btn.dataset.htab);
        if (tc) tc.classList.add('active');
      });
    }
  });
}

/* ============================================================
   Feedback / Bug report modal
   ============================================================ */
function openFeedbackModal() {
  openFormModal({
    title: t('feedback.title'),
    saveLabel: t('feedback.send'),
    noSave: false,
    bodyHtml: `
      <label for="fbType" style="margin-top:0;">${escapeHtml(t('feedback.type'))}</label>
      <select id="fbType">
        <option value="feedback">${escapeHtml(t('feedback.type_feedback'))}</option>
        <option value="suggestion">${escapeHtml(t('feedback.type_suggestion'))}</option>
        <option value="bug">${escapeHtml(t('feedback.type_bug'))}</option>
      </select>
      <label for="fbMessage" style="margin-top:14px;">${escapeHtml(t('feedback.message'))}</label>
      <textarea id="fbMessage" rows="5" style="resize:vertical;" placeholder="${escapeHtml(t('feedback.message_ph'))}"></textarea>
      <label for="fbEmail" style="margin-top:14px;">${escapeHtml(t('feedback.email'))} <span style="color:var(--text-muted);font-size:11.5px;">(${escapeHtml(t('common.optional'))})</span></label>
      <input type="email" id="fbEmail" placeholder="you@example.com">
      <p style="font-size:11.5px;color:var(--text-muted);margin:10px 0 0;">${escapeHtml(t('feedback.hint'))}</p>
      <div style="margin-top:12px;">
        <button id="btnFbGithub" class="btn ghost small" type="button">🐛 ${escapeHtml(t('feedback.github_btn'))}</button>
      </div>`,
    onMount(modal) {
      modal.querySelector('#btnFbGithub').addEventListener('click', () => {
        const url = 'https://github.com/khaytapp/Khayt/issues/new';
        if (window.hubAPI?.openExternal) window.hubAPI.openExternal(url);
        else window.open(url);
      });
    },
    async onSave(modal) {
      const type    = modal.querySelector('#fbType').value;
      const message = (modal.querySelector('#fbMessage').value || '').trim();
      const email   = (modal.querySelector('#fbEmail').value  || '').trim();
      if (!message) { toast(t('feedback.err_empty'), 'error'); return false; }
      const subject = encodeURIComponent(`[Khayt] ${t('feedback.type_' + type)}`);
      const body = encodeURIComponent(
        `Type: ${t('feedback.type_' + type)}\n\n${message}${email ? `\n\nFrom: ${email}` : ''}`
      );
      const mailto = `mailto:support@khaytapp.com?subject=${subject}&body=${body}`;
      try {
        if (window.hubAPI?.openExternal) {
          const res = await window.hubAPI.openExternal(mailto);
          if (!res?.ok) {
            toast(t('feedback.err_no_mail') || 'Could not open your email app.', 'error');
            return false;
          }
        } else {
          window.open(mailto);
        }
      } catch (err) {
        toast(t('feedback.err_no_mail') || 'Could not open your email app.', 'error');
        return false;
      }
      toast(t('feedback.sent'), 'success');
      return true;
    }
  });
}

  global._escHandlerStack = _escHandlerStack;
  window._toast = toast;
  window._t = t;

  const api = {
    toast,
    appendStackedModal,
    confirmModal,
    openFormModal,
    applyTheme,
    applyAnalyticsModeView,
    applyMode,
    initAppShell,
    syncTopbarTitle,
    switchTab,
    openSettingsSection,
    openGlobalSearch,
    closeGlobalSearch,
    renderGlobalResults,
    handleGlobalSearchKeydown,
    openHelpModal,
    openFeedbackModal,
  };

  Object.assign(global, api);
  global.KhaytShell = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
