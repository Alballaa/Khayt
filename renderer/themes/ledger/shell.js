/**
 * Workshop Ledger shell helpers — page header sync, settings tab in strip.
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
    const foot = document.querySelector('.khayt-navfoot');
    const settingsBtn = document.querySelector('.khayt-nav .tab-btn[data-tab="settings-tab"]');
    if (foot && settingsBtn && settingsTabParent) {
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

  function syncLedgerPageHead(tabId) {
    const head = document.getElementById('ledgerPageHead');
    if (!head || !document.body.classList.contains('khayt-ledger')) return;
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

  function apply(designId) {
    const theme = global.KhaytThemeRegistry?.getTheme(designId);
    const isLedger = theme?.shell === 'ledger';
    if (isLedger) {
      ensureSettingsTab();
      syncLedgerPageHead(document.querySelector('.tab-content.active')?.id || 'dashboard-tab');
    } else {
      restoreSettingsTab();
    }
  }

  global.KhaytLedgerShell = { apply, syncLedgerPageHead, ensureSettingsTab, restoreSettingsTab };
})(typeof window !== 'undefined' ? window : globalThis);
