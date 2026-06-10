/**
 * Workshop Ledger shell — DOM layout mount, settings tab, page header sync.
 */
(function (global) {
  let settingsTabMounted = false;
  let settingsTabParent = null;
  let settingsTabNextSibling = null;

  function ensureSettingsTab() {
    if (settingsTabMounted) return;
    const nav = document.querySelector('.khayt-nav.sidebar-nav');
    const settingsBtn = document.querySelector('.khayt-navfoot .tab-btn[data-tab="settings-tab"]');
    if (!nav || !settingsBtn) return;

    settingsTabParent = settingsBtn.parentElement;
    settingsTabNextSibling = settingsBtn.nextElementSibling;

    let spacer = nav.querySelector('.ledger-tab-spacer');
    if (!spacer) {
      spacer = document.createElement('span');
      spacer.className = 'ledger-tab-spacer';
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
    document.querySelector('.ledger-tab-spacer')?.remove();
    settingsTabParent = null;
    settingsTabNextSibling = null;
    settingsTabMounted = false;
  }

  function mountLayout() {
    const body = document.querySelector('.khayt-body');
    const sidebar = document.getElementById('appSidebar');
    const main = document.querySelector('.khayt-main');
    if (!body || !sidebar || !main || body.dataset.ledgerLayout === 'mounted') return;

    const top = main.querySelector(':scope > .khayt-top');
    const pagehead = document.getElementById('ledgerPageHead');
    if (!top || !pagehead) return;

    body.insertBefore(top, sidebar);
    body.insertBefore(pagehead, main);
    body.dataset.ledgerLayout = 'mounted';
    bindTabNav();
  }

  function unmountLayout() {
    const body = document.querySelector('.khayt-body');
    const main = document.querySelector('.khayt-main');
    if (!body || !main || body.dataset.ledgerLayout !== 'mounted') return;

    const top = body.querySelector(':scope > .khayt-top') || main.querySelector(':scope > .khayt-top');
    const pagehead = body.querySelector(':scope > .ledger-pagehead')
      || main.querySelector(':scope > .ledger-pagehead');
    const scroll = main.querySelector(':scope > .khayt-scroll');

    if (top) main.insertBefore(top, main.firstChild);
    if (pagehead) {
      if (scroll) main.insertBefore(pagehead, scroll);
      else main.appendChild(pagehead);
    }
    delete body.dataset.ledgerLayout;
  }

  function bindTabNav() {
    const nav = document.querySelector('.khayt-nav.sidebar-nav');
    if (!nav || nav.dataset.ledgerTabsBound === '1') return;
    nav.addEventListener('click', (e) => {
      if (!document.body.classList.contains('khayt-ledger')) return;
      const btn = e.target.closest('.tab-btn[data-tab]');
      if (!btn || !nav.contains(btn)) return;
      e.preventDefault();
      if (typeof switchTab === 'function') switchTab(btn.dataset.tab);
    });
    nav.dataset.ledgerTabsBound = '1';
  }

  function syncLedgerPageHead(tabId) {
    const head = document.getElementById('ledgerPageHead');
    if (!head || !document.body.classList.contains('khayt-ledger')) return;
    head.removeAttribute('aria-hidden');
    const titleEl = head.querySelector('.ledger-page-title');
    const subEl = head.querySelector('.ledger-pagesub');
    const stampEl = document.getElementById('ledgerLocationStamp');
    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    const titleKey = activeBtn?.querySelector('[data-i18n]')?.getAttribute('data-i18n');
    if (titleEl && titleKey && typeof t === 'function') titleEl.textContent = t(titleKey);
    if (subEl) {
      if (tabId === 'dashboard-tab') {
        const d = new Date();
        subEl.textContent = d.toLocaleDateString(
          typeof i18n !== 'undefined' && i18n.current === 'ar' ? 'ar-SA' : 'en-US',
          { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
        );
      } else {
        subEl.textContent = '';
      }
    }
    if (stampEl && typeof settings !== 'undefined') {
      const loc = settings.locations?.find((l) => l.id === settings.activeLocationId);
      stampEl.textContent = loc?.name || settings.shopName || '';
      stampEl.style.display = stampEl.textContent ? '' : 'none';
    }
  }

  function applyLedgerShell() {
    ensureSettingsTab();
    mountLayout();
    syncLedgerPageHead(document.querySelector('.tab-content.active')?.id || 'dashboard-tab');
  }

  function teardownLedgerShell() {
    unmountLayout();
    restoreSettingsTab();
  }

  global.KhaytLedgerShell = {
    applyLedgerShell,
    teardownLedgerShell,
    syncLedgerPageHead,
    ensureSettingsTab,
    restoreSettingsTab,
    mountLayout,
    unmountLayout,
    bindTabNav,
  };
})(typeof window !== 'undefined' ? window : globalThis);
