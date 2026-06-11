/**
 * UI shell: toasts, modals, theme, tabs, global search, help.
 */
var _escHandlerStack = [];

(function (global) {
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
    const cleanup = (val) => {
      document.removeEventListener('keydown', escHandler);
      const idx = _escHandlerStack.indexOf(escHandler);
      if (idx !== -1) _escHandlerStack.splice(idx, 1);
      overlay.remove();
      resolve(val);
    };
    const escHandler = (e) => { if (e.key === 'Escape') cleanup(false); };
    _escHandlerStack.push(escHandler);
    document.addEventListener('keydown', escHandler);
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => cleanup(true));
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}

function openFormModal({ title, bodyHtml, onMount, onSave, saveLabel, sizeLg = true, noSave = false }) {
  const mount = $('#modalMount');
  mount.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal modal-form ${sizeLg ? 'modal-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-header">
          <h3 id="modalTitle">${escapeHtml(title)}</h3>
          <button class="btn ghost small" data-act="cancel" aria-label="Close">×</button>
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
  const close = () => {
    document.removeEventListener('keydown', escHandler);
    const idx = _escHandlerStack.indexOf(escHandler);
    if (idx !== -1) _escHandlerStack.splice(idx, 1);
    mount.innerHTML = '';
  };
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
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
  // Move focus into modal for keyboard/screen-reader users
  const firstInput = modal.querySelector('input, select, textarea, button');
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
  applyAnalyticsModeView();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderOnlineSettings === 'function') renderOnlineSettings();
}


/* ============================================================
   Khayt Studio shell
   ============================================================ */
function initAppShell() {
  const sidebar = $('#appSidebar');
  const collapseBtn = $('#btnSidebarCollapse');
  if (localStorage.getItem('hub_sidebar_collapsed') === '1') {
    sidebar?.classList.add('collapsed');
  }
  collapseBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('collapsed');
    localStorage.setItem('hub_sidebar_collapsed', sidebar?.classList.contains('collapsed') ? '1' : '0');
    const chevron = collapseBtn.querySelector('[aria-hidden="true"]');
    if (chevron) chevron.textContent = sidebar?.classList.contains('collapsed') ? '›' : '‹';
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
  $$('.settings-nav-item').forEach(el => el.classList.remove('active'));
  $$('.settings-panel').forEach(el => el.classList.remove('active'));
  const navItem = $(`.settings-nav-item[data-settings-section="${section}"]`);
  navItem?.classList.add('active');
  navItem?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  $(`#settings-panel-${section}`)?.classList.add('active');
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
        $(`#settings-panel-${section}`)?.classList.add('active');
      }
    }
  }
}
/* ============================================================
   Global ⌘K / Ctrl+K search
   ============================================================ */
let globalSearchOpen = false;

function openGlobalSearch() {
  const overlay = $('#globalSearchOverlay');
  const input   = $('#globalSearchInput');
  if (!overlay) return;
  globalSearchOpen = true;
  overlay.style.display = 'flex';
  input.value = '';
  input.focus();
  renderGlobalResults('');
}

function closeGlobalSearch() {
  const overlay = $('#globalSearchOverlay');
  if (!overlay) return;
  globalSearchOpen = false;
  overlay.style.display = 'none';
}

function renderGlobalResults(term) {
  const el = $('#globalSearchResults');
  if (!el) return;
  if (!term.trim()) {
    el.innerHTML = `<div class="gs-hint">${escapeHtml(t('search.hint'))}</div>`;
    return;
  }
  const q = term.toLowerCase();
  const sections = [];

  // Orders — search id, project, material, tags, notes, tracking, and linked client name
  const matchOrders = printLog.filter(o => {
    if ((o.id || '').toLowerCase().includes(q)) return true;
    if ((o.project || '').toLowerCase().includes(q)) return true;
    if ((o.material || '').toLowerCase().includes(q)) return true;
    if ((o.notes || '').toLowerCase().includes(q)) return true;
    if ((o.trackingNumber || '').toLowerCase().includes(q)) return true;
    if ((o.tags || []).some(tg => tg.toLowerCase().includes(q))) return true;
    if (o.clientId) {
      const c = clients.find(x => x.id === o.clientId);
      if (c && ((c.nameEn || '').toLowerCase().includes(q) || (c.nameAr || '').toLowerCase().includes(q))) return true;
    }
    return false;
  }).slice(0, 6);
  if (matchOrders.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.orders'))}</div>`);
    sections.push(matchOrders.map(o => `
      <div class="gs-result" data-gs-action="order" data-gs-id="${escapeHtml(o.id)}">
        <span class="gs-icon">📋</span>
        <span class="gs-title">${escapeHtml(o.project || o.id)}</span>
        <span class="gs-meta">${escapeHtml(o.id)} · ${fmtPrice(o.price)} · <span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span></span>
      </div>`).join(''));
  }

  // Clients
  const matchClients = clients.filter(c =>
    (c.nameEn || '').toLowerCase().includes(q) ||
    (c.nameAr || '').toLowerCase().includes(q) ||
    (c.phone  || '').toLowerCase().includes(q) ||
    (c.email  || '').toLowerCase().includes(q)
  ).slice(0, 4);
  if (matchClients.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.clients'))}</div>`);
    sections.push(matchClients.map(c => `
      <div class="gs-result" data-gs-action="client" data-gs-id="${escapeHtml(c.id)}">
        <span class="gs-icon">👤</span>
        <span class="gs-title">${escapeHtml(localName(c))}</span>
        <span class="gs-meta">${escapeHtml(c.phone || c.email || '')}</span>
      </div>`).join(''));
  }

  // Products
  const matchProducts = products.filter(p =>
    (p.nameEn || '').toLowerCase().includes(q) ||
    (p.nameAr || '').toLowerCase().includes(q)
  ).slice(0, 4);
  if (matchProducts.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.products'))}</div>`);
    sections.push(matchProducts.map(p => `
      <div class="gs-result" data-gs-action="product" data-gs-id="${escapeHtml(p.id)}">
        <span class="gs-icon">📦</span>
        <span class="gs-title">${escapeHtml(localName(p))}</span>
        <span class="gs-meta">${fmtPrice(p.basePrice || 0)}</span>
      </div>`).join(''));
  }

  // Inventory
  const matchInv = inventory.filter(i => (i.material || '').toLowerCase().includes(q)).slice(0, 4);
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
      if (action === 'product')   { switchTab('catalog-tab'); }
      if (action === 'inventory') {
        switchTab('inventory-tab');
        if (id) setTimeout(() => {
          const row = document.querySelector(`[data-inv-id="${CSS.escape(id)}"]`);
          if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('highlight-flash'); setTimeout(() => row.classList.remove('highlight-flash'), 1500); }
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
      <label style="margin-top:0;">${escapeHtml(t('feedback.type'))}</label>
      <select id="fbType">
        <option value="feedback">${escapeHtml(t('feedback.type_feedback'))}</option>
        <option value="suggestion">${escapeHtml(t('feedback.type_suggestion'))}</option>
        <option value="bug">${escapeHtml(t('feedback.type_bug'))}</option>
      </select>
      <label style="margin-top:14px;">${escapeHtml(t('feedback.message'))}</label>
      <textarea id="fbMessage" rows="5" style="resize:vertical;" placeholder="${escapeHtml(t('feedback.message_ph'))}"></textarea>
      <label style="margin-top:14px;">${escapeHtml(t('feedback.email'))} <span style="color:var(--text-muted);font-size:11.5px;">(${escapeHtml(t('common.optional'))})</span></label>
      <input type="email" id="fbEmail" placeholder="you@example.com">
      <p style="font-size:11.5px;color:var(--text-muted);margin:10px 0 0;">${escapeHtml(t('feedback.hint'))}</p>
      <div style="margin-top:12px;">
        <button id="btnFbGithub" class="btn ghost small" type="button">🐛 ${escapeHtml(t('feedback.github_btn'))}</button>
      </div>`,
    onMount(modal) {
      modal.querySelector('#btnFbGithub').addEventListener('click', () => {
        const url = 'https://github.com/Alballaa/Khayt/issues/new';
        if (window.hubAPI?.openExternal) window.hubAPI.openExternal(url);
        else window.open(url);
      });
    },
    onSave(modal) {
      const type    = modal.querySelector('#fbType').value;
      const message = (modal.querySelector('#fbMessage').value || '').trim();
      const email   = (modal.querySelector('#fbEmail').value  || '').trim();
      if (!message) { toast(t('feedback.err_empty'), 'error'); return false; }
      const subject = encodeURIComponent(`[Khayt] ${t('feedback.type_' + type)}`);
      const body = encodeURIComponent(
        `Type: ${t('feedback.type_' + type)}\n\n${message}${email ? `\n\nFrom: ${email}` : ''}`
      );
      const mailto = `mailto:khayt@athartuwaiq.com?subject=${subject}&body=${body}`;
      if (window.hubAPI?.openExternal) window.hubAPI.openExternal(mailto);
      else window.open(mailto);
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
    openHelpModal,
    openFeedbackModal,
  };

  Object.assign(global, api);
  global.KhaytShell = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
