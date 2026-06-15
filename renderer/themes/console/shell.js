/**
 * Control Room shell — code rail nav, command path, page header, statusbar.
 */
(function (global) {
  const CONSOLE_NAV = {
    'dashboard-tab': { code: 'DSH', n: '01', group: null },
    'queue-tab': { code: 'QUE', n: '02', group: 'PRD', live: true },
    'calculator-tab': { code: 'CLC', n: '03', group: 'PRD' },
    'inventory-tab': { code: 'INV', n: '04', group: 'PRD' },
    'catalog-tab': { code: 'CAT', n: '05', group: 'PRD' },
    'waste-tab': { code: 'WST', n: '06', group: 'PRD' },
    'logs-tab': { code: 'ORD', n: '07', group: 'SLS' },
    'clients-tab': { code: 'CLI', n: '08', group: 'SLS' },
    'gift-cards-tab': { code: 'GFT', n: '09', group: 'SLS' },
    'portfolio-tab': { code: 'PRT', n: '10', group: 'SLS' },
    'analytics-tab': { code: 'ANL', n: '11', group: 'BIZ' },
    'expenses-tab': { code: 'EXP', n: '12', group: 'BIZ' },
    'settings-tab': { code: 'SET', n: '13', group: null },
  };

  let settingsTabMounted = false;
  let settingsTabParent = null;
  let settingsTabNextSibling = null;
  let statusClockTimer = null;

  function ensureSettingsTab() {
    if (settingsTabMounted) return;
    const nav = document.querySelector('.khayt-nav.sidebar-nav');
    const settingsBtn = document.querySelector('.khayt-navfoot .tab-btn[data-tab="settings-tab"]');
    if (!nav || !settingsBtn) return;

    settingsTabParent = settingsBtn.parentElement;
    settingsTabNextSibling = settingsBtn.nextElementSibling;

    let spacer = nav.querySelector('.console-tab-spacer');
    if (!spacer) {
      spacer = document.createElement('span');
      spacer.className = 'console-tab-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      nav.appendChild(spacer);
    }
    nav.appendChild(settingsBtn);
    settingsTabMounted = true;
  }

  function restoreSettingsTab() {
    if (!settingsTabMounted) return;
    const settingsBtn = document.querySelector('.khayt-nav .tab-btn[data-tab="settings-tab"]');
    if (settingsBtn && settingsTabParent) {
      if (settingsTabNextSibling) {
        settingsTabParent.insertBefore(settingsBtn, settingsTabNextSibling);
      } else {
        settingsTabParent.appendChild(settingsBtn);
      }
    }
    document.querySelector('.console-tab-spacer')?.remove();
    settingsTabParent = null;
    settingsTabNextSibling = null;
    settingsTabMounted = false;
  }

  function decorateNav() {
    Object.entries(CONSOLE_NAV).forEach(([tabId, meta]) => {
      const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
      if (!btn || btn.dataset.consoleDecorated === '1') return;
      if (meta.live) {
        const dot = document.createElement('span');
        dot.className = 'console-livedot';
        dot.setAttribute('aria-hidden', 'true');
        btn.appendChild(dot);
      }
      const deco = document.createElement('span');
      deco.className = 'console-rail-deco';
      deco.setAttribute('aria-hidden', 'true');
      deco.innerHTML = `<span class="console-num">${meta.n}</span><span class="console-code">${meta.code}</span>`;
      btn.appendChild(deco);
      btn.dataset.consoleDecorated = '1';
    });
  }

  function undecorateNav() {
    document.querySelectorAll('.tab-btn[data-console-decorated="1"]').forEach((btn) => {
      btn.querySelector('.console-rail-deco')?.remove();
      btn.querySelector('.console-livedot')?.remove();
      delete btn.dataset.consoleDecorated;
    });
  }

  function mountLayout() {
    const body = document.querySelector('.khayt-body');
    const sidebar = document.getElementById('appSidebar');
    const main = document.querySelector('.khayt-main');
    if (!body || !sidebar || !main || body.dataset.consoleLayout === 'mounted') return;

    const top = main.querySelector(':scope > .khayt-top');
    const pagehead = document.getElementById('consolePageHead');
    if (!top || !pagehead) return;

    body.insertBefore(top, sidebar);
    const scroll = main.querySelector(':scope > .khayt-scroll');
    if (scroll) main.insertBefore(pagehead, scroll);
    else main.appendChild(pagehead);
    body.dataset.consoleLayout = 'mounted';
    bindTabNav();
  }

  function unmountLayout() {
    const body = document.querySelector('.khayt-body');
    const main = document.querySelector('.khayt-main');
    if (!body || !main || body.dataset.consoleLayout !== 'mounted') return;

    const top = body.querySelector(':scope > .khayt-top') || main.querySelector(':scope > .khayt-top');
    const pagehead = document.getElementById('consolePageHead')
      || body.querySelector(':scope > .console-pagehead')
      || main.querySelector(':scope > .console-pagehead');
    const scroll = main.querySelector(':scope > .khayt-scroll');

    if (top) main.insertBefore(top, main.firstChild);
    if (pagehead) {
      if (scroll) main.insertBefore(pagehead, scroll);
      else main.appendChild(pagehead);
    }
    delete body.dataset.consoleLayout;
  }

  let navClickHandler = null;
  function bindTabNav() {
    const nav = document.querySelector('.khayt-nav.sidebar-nav');
    if (!nav || nav.dataset.consoleTabsBound === '1') return;
    navClickHandler = (e) => {
      if (!document.body.classList.contains('khayt-console')) return;
      const btn = e.target.closest('.tab-btn[data-tab]');
      if (!btn || !nav.contains(btn)) return;
      e.preventDefault();
      if (typeof switchTab === 'function') switchTab(btn.dataset.tab);
    };
    nav.addEventListener('click', navClickHandler);
    nav.dataset.consoleTabsBound = '1';
  }
  function unbindTabNav() {
    const nav = document.querySelector('.khayt-nav.sidebar-nav');
    if (nav && navClickHandler) nav.removeEventListener('click', navClickHandler);
    if (nav) delete nav.dataset.consoleTabsBound;
    navClickHandler = null;
  }

  function consoleTabSubtitle(tabId) {
    if (typeof t !== 'function') return '';
    if (tabId === 'dashboard-tab') {
      const d = new Date();
      return d.toLocaleDateString(
        typeof i18n !== 'undefined' && i18n.current === 'ar' ? 'ar-SA' : 'en-US',
        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
      ).toUpperCase();
    }
    const n = (v) => (typeof v !== 'undefined' && Array.isArray(v) ? v.length : 0);
    const portfolioCount = () => {
      if (typeof printLog === 'undefined') return 0;
      let c = 0;
      for (const o of printLog) c += (o.photos || []).length;
      return c;
    };
    const subs = {
      'catalog-tab': () => t('tab.sub.catalog', { n: n(typeof products !== 'undefined' ? products : []) }),
      'logs-tab': () => t('tab.sub.logs', { n: n(typeof printLog !== 'undefined' ? printLog : []) }),
      'waste-tab': () => t('tab.sub.waste', { n: n(typeof wasteLog !== 'undefined' ? wasteLog : []) }),
      'expenses-tab': () => t('tab.sub.expenses', { n: n(typeof expenses !== 'undefined' ? expenses : []) }),
      'gift-cards-tab': () => t('tab.sub.gift_cards', { n: n(typeof giftCards !== 'undefined' ? giftCards : []) }),
      'portfolio-tab': () => t('tab.sub.portfolio', { n: portfolioCount() }),
      'settings-tab': () => t('tab.sub.settings'),
    };
    return subs[tabId]?.() || '';
  }

  function syncCommandPath(tabId) {
    const meta = CONSOLE_NAV[tabId];
    const groupEl = document.getElementById('consolePathGroup');
    const sepEl = document.getElementById('consolePathSep');
    const codeEl = document.getElementById('consolePathCode');
    if (!meta || !codeEl) return;
    if (groupEl) groupEl.textContent = meta.group || '';
    if (sepEl) sepEl.style.display = meta.group ? '' : 'none';
    codeEl.textContent = meta.code;
  }

  // Translate with graceful English fallback (works even if a key is missing).
  const trc = (k, d) => { const s = (typeof t === 'function') ? t(k) : null; return (s && s !== k) ? s : d; };

  function syncStatusBar() {
    const printersEl = document.getElementById('consoleStatusPrinters');
    const queueEl = document.getElementById('consoleStatusQueue');
    const locEl = document.getElementById('consoleStatusLocation');
    if (printersEl && typeof machines !== 'undefined') {
      const n = Array.isArray(machines) ? machines.length : 0;
      printersEl.textContent = `${n} ${n === 1 ? trc('console.status.printer', 'PRINTER') : trc('console.status.printers', 'PRINTERS')}`;
    }
    if (queueEl && typeof printLog !== 'undefined') {
      const active = Array.isArray(printLog)
        ? printLog.filter((o) => o.status && !['done', 'cancelled', 'shipped'].includes(o.status)).length
        : 0;
      queueEl.textContent = `${active} ${trc('console.status.active', 'ACTIVE')}`;
    }
    if (locEl && typeof settings !== 'undefined') {
      const loc = settings.locations?.find((l) => l.id === settings.activeLocationId);
      const name = loc?.name || settings.shopName || '';
      locEl.textContent = name ? `${trc('console.status.loc', 'LOC')} · ${name.toUpperCase()}` : '';
      locEl.style.display = name ? '' : 'none';
    }
  }

  function tickStatusClock() {
    const clockEl = document.getElementById('consoleStatusClock');
    if (!clockEl) return;
    const d = new Date();
    clockEl.textContent = d.toLocaleTimeString(
      typeof i18n !== 'undefined' && i18n.current === 'ar' ? 'ar-SA' : 'en-US',
      { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
    );
  }

  function startStatusClock() {
    stopStatusClock();
    tickStatusClock();
    statusClockTimer = setInterval(tickStatusClock, 1000);
  }

  function stopStatusClock() {
    if (statusClockTimer) {
      clearInterval(statusClockTimer);
      statusClockTimer = null;
    }
  }

  function syncConsolePageHead(tabId) {
    const head = document.getElementById('consolePageHead');
    if (!head || !document.body.classList.contains('khayt-console')) return;
    head.removeAttribute('aria-hidden');
    const titleEl = head.querySelector('.console-page-title');
    const subEl = head.querySelector('.console-pagesub');
    const stampEl = document.getElementById('consoleLocationStamp');
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    const titleKey = activeBtn?.querySelector('[data-i18n]')?.getAttribute('data-i18n');
    if (titleEl && titleKey && typeof t === 'function') titleEl.textContent = t(titleKey);
    if (subEl) subEl.textContent = consoleTabSubtitle(tabId);
    if (stampEl && typeof settings !== 'undefined') {
      const loc = settings.locations?.find((l) => l.id === settings.activeLocationId);
      stampEl.textContent = loc?.name || settings.shopName || '';
      stampEl.style.display = stampEl.textContent ? '' : 'none';
    }
    syncCommandPath(tabId);
    syncStatusBar();
  }

  function applyConsoleShell() {
    document.getElementById('appSidebar')?.classList.remove('collapsed');
    ensureSettingsTab();
    decorateNav();
    mountLayout();
    startStatusClock();
    syncConsolePageHead(document.querySelector('.tab-content.active')?.id || 'dashboard-tab');
  }

  function teardownConsoleShell() {
    stopStatusClock();
    unbindTabNav();
    unmountLayout();
    restoreSettingsTab();
    undecorateNav();
  }

  global.KhaytConsoleShell = {
    applyConsoleShell,
    teardownConsoleShell,
    syncConsolePageHead,
    consoleTabSubtitle,
    CONSOLE_NAV,
    ensureSettingsTab,
    restoreSettingsTab,
    mountLayout,
    unmountLayout,
    bindTabNav,
    unbindTabNav,
  };
})(typeof window !== 'undefined' ? window : globalThis);
