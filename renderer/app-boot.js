/**
 * Application boot: setup wizard and DOMContentLoaded initialization.
 */

// Forward uncaught renderer errors to the main process, where Sentry runs (the
// renderer is non-bundled with a strict CSP, so it can't load the SDK directly).
// No-op unless Sentry is active in main.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') (function () {
  const report = (message, stack, extra) => {
    try { window.hubAPI?.reportError?.(Object.assign({ message, stack }, extra)); } catch (e) { /* ignore */ }
  };
  window.addEventListener('error', (e) => {
    report((e.error && e.error.message) || e.message || 'error', e.error && e.error.stack, { url: e.filename, line: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report((r && r.message) || String(r) || 'unhandledrejection', r && r.stack);
  });
})();

function detectSystemLang() {
  const raw = (navigator.language || 'en').toLowerCase();
  const map = { en: 'en', ar: 'ar', de: 'de', es: 'es', fr: 'fr', zh: 'zh', ja: 'ja' };
  const base = raw.split('-')[0];
  return map[base] || 'en';
}

/* ============================================================
   Setup wizard (Business Mode first-run)
   ============================================================ */
function shouldShowSetupWizard() {
  if (settings.firstRunDone) return false;
  if (settings.firstRun === false) return false;
  return true;
}

/** One-time fix: shops with data but wizard flags never persisted (import / upgrade). */
function normalizeWizardFlagsAfterLoad() {
  if (settings.firstRunDone) {
    if (settings.firstRun) {
      settings.firstRun = false;
      saveAll();
    }
    return;
  }
  const hasShopData =
    printLog.length > 0 ||
    clients.length > 0 ||
    inventory.length > 0 ||
    machines.length > 0;
  if (hasShopData) {
    settings.firstRun = false;
    settings.firstRunDone = true;
    saveAll();
  }
}

function initWizard() {
  if (!shouldShowSetupWizard()) return;
  const wiz = $('#setup-wizard');
  if (!wiz) return;
  wiz.style.display = 'flex';

  let selectedMode = 'simple';
  let selectedBizType = 'solo';
  let selectedDesign = settings.designTheme || 'studio';
  let pendingPin = null;
  let pendingRecoveryCode = null;
  let securitySkipped = true;

  const langSel = $('#wizLang');
  if (langSel) {
    langSel.value = settings.lang || detectSystemLang();
    i18n.set(langSel.value, { silent: true });
  }
  i18n.applyToDom(wiz);

  function goToStep(n) {
    wiz.querySelectorAll('.wizard-step').forEach(s => s.style.display = 'none');
    const step = $(`#wiz-step-${n}`);
    if (step) step.style.display = '';
    wiz.querySelectorAll('.wizard-dot').forEach(d => {
      d.classList.toggle('active', parseInt(d.dataset.step, 10) <= n);
    });
    if (n === 2) {
      global.KhaytThemePicker?.mountWizardPicker?.(
        $('#wizDesignThemePicker'),
        selectedDesign,
      );
    }
  }

  const wizEscHandler = (e) => {
    if (e.key !== 'Escape' || wiz.style.display === 'none') return;
    if (_escHandlerStack?.length) return;
    e.preventDefault();
    confirmModal(t('wiz.skip_confirm') || 'Skip setup and use defaults? You can finish this later in Settings.', {
      okText: t('wiz.skip_ok') || 'Skip for now',
      cancelText: t('common.cancel'),
    }).then((ok) => { if (ok) finishWizard(); });
  };
  document.addEventListener('keydown', wizEscHandler);

  wiz.addEventListener('click', e => {
    const backBtn = e.target.closest('[data-prev]');
    const nextBtn = e.target.closest('[data-next]');
    const finishBtn = e.target.closest('#wizFinish');

    if (backBtn) {
      goToStep(parseInt(backBtn.dataset.prev, 10));
      return;
    }

    if (nextBtn && nextBtn.id !== 'wizRecoveryContinue') {
      const step = parseInt(nextBtn.dataset.next, 10);
      // Business-type options auto-advance via data-next; capture the chosen mode
      // here because this branch runs before any .wizard-option handling.
      if (nextBtn.classList.contains('wizard-option') && nextBtn.dataset.mode) {
        wiz.querySelectorAll('.wizard-option').forEach(o => o.classList.remove('selected'));
        nextBtn.classList.add('selected');
        selectedMode = nextBtn.dataset.mode;
        selectedBizType = nextBtn.dataset.bizType || selectedMode;
      }
      if (step === 2) {
        const lang = $('#wizLang')?.value || 'en';
        settings.lang = lang;
        i18n.set(lang);
        i18n.applyToDom(wiz);
      }
      if (nextBtn.closest('#wiz-step-2')) {
        const picker = $('#wizDesignThemePicker');
        selectedDesign = global.KhaytThemePicker?.getWizardSelection?.(picker) || selectedDesign;
        settings.designTheme = selectedDesign;
        const theme = global.KhaytThemeRegistry?.getTheme(selectedDesign);
        if (theme?.defaultAppearance) {
          settings.theme = theme.defaultAppearance;
          if (typeof applyTheme === 'function') applyTheme(theme.defaultAppearance);
        }
        if (typeof applyDesignSettings === 'function') applyDesignSettings();
      }
      goToStep(step);
      return;
    }

    if (finishBtn) finishWizard();
  });

  $('#wizSecuritySkip')?.addEventListener('click', () => {
    pendingPin = null;
    pendingRecoveryCode = null;
    securitySkipped = true;
    goToStep(4);
  });

  $('#wizSecurityContinue')?.addEventListener('click', () => {
    const errEl = $('#wizPinError');
    const pin = ($('#wizPin')?.value || '').trim();
    const confirm = ($('#wizPinConfirm')?.value || '').trim();
    if (!isValidPin(pin)) {
      if (errEl) errEl.textContent = t('sec.pin_invalid_format');
      return;
    }
    if (isWeakPin(pin)) {
      if (errEl) errEl.textContent = t('sec.pin_weak');
      return;
    }
    if (pin !== confirm) {
      if (errEl) errEl.textContent = t('sec.pin_mismatch');
      return;
    }
    if (errEl) errEl.textContent = '';
    pendingPin = pin;
    pendingRecoveryCode = generateRecoveryCode();
    securitySkipped = false;
    $('#wizSecuritySetup').style.display = 'none';
    $('#wizSecurityRecovery').style.display = '';
    const codeEl = $('#wizRecoveryCode');
    if (codeEl) codeEl.textContent = formatRecoveryCode(pendingRecoveryCode);
    const savedCb = $('#wizRecoverySaved');
    const contBtn = $('#wizRecoveryContinue');
    if (savedCb) savedCb.checked = false;
    if (contBtn) contBtn.disabled = true;
    i18n.applyToDom($('#wizSecurityRecovery'));
  });

  $('#wizRecoverySaved')?.addEventListener('change', e => {
    const contBtn = $('#wizRecoveryContinue');
    if (contBtn) contBtn.disabled = !e.target.checked;
  });

  $('#wizRecoveryContinue')?.addEventListener('click', () => {
    if (!$('#wizRecoverySaved')?.checked) return;
    goToStep(4);
  });

  $('#wizRecoveryCopy')?.addEventListener('click', async () => {
    if (!pendingRecoveryCode) return;
    const res = await copyRecoveryCode(pendingRecoveryCode);
    toast(res.ok ? t('sec.copied') : t('sec.copy_failed'), res.ok ? 'success' : 'error');
  });

  $('#wizRecoveryDownload')?.addEventListener('click', async () => {
    if (!pendingRecoveryCode) return;
    const res = await downloadRecoveryCode(pendingRecoveryCode);
    toast(res.ok ? t('sec.downloaded') : t('sec.download_failed'), res.ok ? 'success' : 'error');
  });

  async function finishWizard() {
    const bizName = $('#wizBizName')?.value.trim();
    const currency = $('#wizCurrency')?.value;

    if (bizName) {
      settings.businessName = bizName;
      settings.bizEn = bizName;
    }
    settings.currency = currency;
    settings.mode = selectedMode;
    settings.businessType = selectedBizType;
    // First printer (optional) — gives the queue + calculator a machine to use.
    const machName = $('#wizMachine')?.value.trim();
    if (machName && Array.isArray(machines) && machines.length === 0) {
      const palette = (typeof MACHINE_COLORS !== 'undefined' && MACHINE_COLORS.length) ? MACHINE_COLORS : ['#5b9cf0'];
      machines.push({ id: uid('MACH'), name: machName, color: palette[0] });
    }
    settings.designTheme = selectedDesign || settings.designTheme || 'studio';
    const finishTheme = global.KhaytThemeRegistry?.getTheme(settings.designTheme);
    if (finishTheme?.defaultAppearance) settings.theme = finishTheme.defaultAppearance;
    else if (!settings.theme) settings.theme = 'light';
    if (selectedBizType === 'farm') {
      const w = { ...(settings.wipLimits || {}) };
      if (!w.printing) {
        settings.wipLimits = { pending: 30, printing: 6, post: 8, qc: 4, ...w };
      }
      if (locations.length === 1) {
        locations.push({ id: uid('LOC'), name: t('farm.second_site') || 'Site 2', address: '' });
      }
    }
    settings.enableZatca = $('#wizEnableZatca')?.checked !== false;
    const enableOnline = $('#wizEnableOnline')?.checked === true;
    settings.onlineEnabled = enableOnline;
    if (enableOnline && typeof applyOnlineLanPrefs === 'function') {
      settings.lanApi = applyOnlineLanPrefs(settings.lanApi, true);
    }

    if (!securitySkipped && pendingPin && pendingRecoveryCode) {
      await setupAdminSecurity({ pin: pendingPin, recoveryCodePlain: pendingRecoveryCode });
      const admin = getAdminOperator();
      if (admin && bizName) admin.name = bizName;
    } else {
      settings.securityEnabled = false;
      settings.recoveryCodeHash = '';
      settings.operatorLockEnabled = false;
      operators = [];
      settings.activeOperatorId = null;
    }

    settings.firstRun = false;
    settings.firstRunDone = true;
    await flushSave();

    document.removeEventListener('keydown', wizEscHandler);
    wiz.style.display = 'none';
    applyTheme(settings.theme);
    if (typeof applyDesignSettings === 'function') applyDesignSettings();
    applyMode();
    loadSettingsIntoForm();
    if (enableOnline && typeof startLanServer === 'function') {
      startLanServer().catch(() => {});
    }
    applyOperatorPermissions();
    initialRender();
    refreshCurrencyLabels();
    toast(t('wiz.welcome_done'), 'success', 4000);
  }

  goToStep(1);
}

/* ============================================================
   Boot
   ============================================================ */
if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  pruneExpiredNotifs();

  restoreActiveLocationFromSession?.();
  normalizeWizardFlagsAfterLoad();
  if (!settings.firstRunDone && (printLog.length > 0 || clients.length > 0)) {
    settings.mode = settings.mode || 'professional';
  }

  applyTheme(settings.theme || 'light');
  if (typeof KhaytCustomThemes?.loadCustomThemes === 'function') {
    await KhaytCustomThemes.loadCustomThemes();
  }
  if (typeof applyDesignSettings === 'function') applyDesignSettings();
  applyMode();
  i18n.init();
  if (settings.lang) i18n.set(settings.lang, { silent: true });
  const langSel = $('#langSelect');
  if (langSel) langSel.value = i18n.current;

  wireEvents();
  loadSettingsIntoForm();
  refreshCurrencyLabels();
  initialRender();
  updateNotifBadge();
  applyProductionPause();
  // Feature 7 (new 8-pack): Apply operator permissions at startup
  applyOperatorPermissions();
  // Show/hide the nav operator switch button
  const navOpBtn = $('#btnNavSwitchOp');
  if (navOpBtn) navOpBtn.style.display = settings.operatorLockEnabled ? 'inline-flex' : 'none';

  initAppShell();

  // Feature 2 (new batch): Start live printer polling for connected machines
  const apiMachines = machines.filter(m => m.printerApi?.type && m.printerApi.type !== 'none');
  if (apiMachines.length > 0 && window.hubAPI?.startPrinterPolling) {
    window.hubAPI.startPrinterPolling(apiMachines).then(cache => {
      machineStatusCache = cache || {};
      updateKanbanLiveStatus();
      if (typeof updateDashLivePrinters === 'function') updateDashLivePrinters();
      // Seed the alert baseline from the first poll; don't alert on initial state.
      if (typeof dispatchPrinterAlerts === 'function') dispatchPrinterAlerts(machineStatusCache);
    }).catch(() => {});
  }
  if (window.hubAPI?.onPrinterStatusUpdate) {
    window.hubAPI.onPrinterStatusUpdate(data => {
      machineStatusCache = data || {};
      updateKanbanLiveStatus();
      if (typeof updateDashLivePrinters === 'function') updateDashLivePrinters();
      if (typeof dispatchPrinterAlerts === 'function') dispatchPrinterAlerts(machineStatusCache);
    });
  }

  let currentVersion = '2.0.16';
  if (window.hubAPI?.appVersion) {
    try { currentVersion = await window.hubAPI.appVersion(); }
    catch (_) {}
  }
  if ($('#appVersion')) $('#appVersion').textContent = currentVersion || '2.0.16 (dev)';
  const betaBadge = $('#appVersionBeta');
  if (betaBadge) betaBadge.hidden = !/-beta/i.test(String(currentVersion || ''));

  // ── Post-update "data survived" toast ────────────────────────────────────────
  // If the previous session stored a pending-update version and we're now running
  // that version (or any newer one), show a brief confirmation.
  (function checkPostUpdateNotice() {
    const pendingVer = localStorage.getItem('khayt_pending_update_to');
    if (!pendingVer) return;
    // Strip only the pre-release suffix ('2.1.0-beta.1' → '2.1.0') before comparing.
    // Don't use a regex that removes hyphens mid-string — that collapses '2.0.4-beta.1'
    // to '2.0.41' and confuses the comparator.
    const norm = v => (v || '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    const gte = (a, b) => {
      const [aa, ba] = [norm(a), norm(b)];
      const len = Math.max(aa.length, ba.length);
      for (let i = 0; i < len; i++) {
        if ((aa[i] || 0) > (ba[i] || 0)) return true;
        if ((aa[i] || 0) < (ba[i] || 0)) return false;
      }
      return true; // equal
    };
    // Extra guard: if currentVersion still carries a pre-release tag (e.g. '-beta.1')
    // the stable release hasn't landed yet — suppress the toast.
    const isStable = !String(currentVersion).includes('-');
    if (isStable && gte(currentVersion, pendingVer)) {
      localStorage.removeItem('khayt_pending_update_to');
      setTimeout(() => {
        toast(
          `✅ Updated to Khayt ${currentVersion} — your data is intact. ` +
          'A pre-update backup was saved to Settings → Backup.',
          'success', 7000
        );
      }, 2500); // slight delay so the UI is fully painted first
    }
  })();

  // ── Auto-updater UI (changelog review before download/install) ─────
  // Push the saved beta-channel preference to main before the startup check,
  // so opted-in testers are offered beta builds on the launch auto-check.
  if (typeof settings !== 'undefined') {
    window.hubAPI?.setUpdateOptions?.({ allowBeta: !!settings.betaUpdates });
  }
  wireUpdateUI({ getCurrentVersion: () => currentVersion });

  // ── Manual "Check for updates" button in Settings ────────────────────────
  (function wireCheckForUpdatesBtn() {
    const btn = document.getElementById('btnCheckForUpdates');
    const msg = document.getElementById('updateStatusMsg');
    if (!btn || !window.hubAPI?.checkForUpdates) return;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Checking…';
      if (msg) msg.textContent = '';
      try {
        const res = await window.hubAPI.checkForUpdates();
        await handleManualUpdateCheckResult(res, { currentVersion, statusEl: msg });
      } catch (e) {
        if (msg) msg.textContent = '⚠ Check failed';
      } finally {
        btn.disabled = false;
        btn.textContent = t('set.check_updates') || 'Check for updates';
      }
    });
  })();

  // Email digest scheduler — checks every 5 minutes
  setInterval(checkAndSendDigest, 5 * 60 * 1000);
  setTimeout(checkAndSendDigest, 10_000); // also run ~10s after boot in case we're already in the send window

  // Daily auto-backup (silent) + populate last-backup label
  maybeAutoBackup();
  updateLastBackupDisplay();

  // Opt-in: auto-draft purchase orders for items at their reorder point.
  if (typeof maybeAutoDraftPurchaseOrders === 'function') { try { maybeAutoDraftPurchaseOrders(); } catch (e) { console.warn('auto-draft PO:', e); } }

  // When connectivity returns, immediately flush any changes stranded offline
  // (resets the sync backoff). No-op when cloud sync is off.
  window.addEventListener('online', () => {
    try { if (window.KhaytCloudSync?.isOn()) KhaytCloudSync.flush(); } catch (e) { /* non-fatal */ }
  });

  // iOS companion: react to spools/orders changed via LAN API from phone
  if (window.hubAPI?.onLanSpoolAdded) {
    window.hubAPI.onLanSpoolAdded(spool => {
      // Phone added a spool — patch in-memory state and persist so next saveAll() doesn't clobber it
      if (spool && spool.id && !inventory.find(s => s.id === spool.id)) {
        inventory.push(spool);
        saveAll(); // keep in-memory and on-disk in sync before any UI save can overwrite
        renderInventory();
        toast('📱 ' + t('inv.spool_added_phone', { name: ((spool.brand || '') + ' ' + (spool.material || '')).trim() || spool.id }), 'success', 4000);
      }
    });
  }
  if (window.hubAPI?.onLanOrderUpdated) {
    window.hubAPI.onLanOrderUpdated((payload) => {
      const { id, status } = payload;
      const idx = printLog.findIndex(o => o.id === id);
      if (idx !== -1) {
        printLog[idx].status = status;
        if (payload.clientApprovedAt) printLog[idx].clientApprovedAt = payload.clientApprovedAt;
        if (payload.quoteAcceptedAt) printLog[idx].quoteAcceptedAt = payload.quoteAcceptedAt;
        if (payload.quoteApproved) {
          const order = printLog[idx];
          if (!order.invoiceNum) {
            order.invoiceNum = nextInvoiceNumber();
            order.invoiceNumber = order.invoiceNum;
          }
          fireWebhook('quote_approved', { orderId: id, project: order.project, client: order.client });
        }
        if (!printLog[idx].statusHistory) printLog[idx].statusHistory = [];
        printLog[idx].statusHistory.push({ status, at: new Date().toISOString() });
        if (printLog[idx].statusHistory.length > 200) printLog[idx].statusHistory = printLog[idx].statusHistory.slice(-200);
        saveAll();
        renderLogs();
        renderKanban();
        renderDashboard();
        if (payload.quoteApproved) {
          toast('✅ ' + t('ord.client_quote_approved', { id }), 'success', 4000);
        } else {
          toast('📱 ' + t('ord.status_updated_phone', { id, status }), 'info', 3000);
        }
      } else if (id && payload.project && isValidOrder(payload)) {
        // New order from Salla/Zid (or other source): add to printLog
        printLog.unshift({ ...payload });
        saveAll();
        renderLogs();
        renderKanban();
        const src = payload.source === 'zid' ? t('zidOrderReceived') : t('sallaOrderReceived');
        toast('🛒 ' + (src || 'New order received'), 'success', 4000);
      }
    });
  }
  if (window.hubAPI?.onLanSurveySubmitted) {
    window.hubAPI.onLanSurveySubmitted(async ({ orderId, rating }) => {
      try {
        const store = await window.hubAPI.loadStore();
        if (store && !store.__corrupt) applyStoreFromSnapshot(store);
      } catch (e) {
        console.error('reload store after survey:', e);
      }
      const o = printLog.find(x => x.id === orderId);
      if (o) {
        toast(`⭐ Survey received for "${o.project || orderId}": ${rating}/5`, 'success', 5000);
      }
    });
  }
  if (window.hubAPI?.onLanStartFailed) {
    window.hubAPI.onLanStartFailed(() => {
      settings.lanApi = { ...settings.lanApi, enabled: false };
      reconcileLanServerStatus?.();
      toast(t('lan.start_failed') || 'LAN server failed to start — port may be in use', 'warning', 6000);
    });
  }
  window.hubAPI?.onLanKanbanAdvanced?.(({ id, from, to, project }) => {
    const idx = printLog.findIndex(o => o.id === id);
    if (idx !== -1) {
      const order = printLog[idx];
      printLog[idx] = { ...order, status: to };
      if (!printLog[idx].statusHistory) printLog[idx].statusHistory = [];
      printLog[idx].statusHistory.push({ status: to, at: new Date().toISOString() });
      saveAll();
      renderKanban();
      renderLogs();
    }
    toast(`🖨️ ${escapeHtml(project || id)}: ${from} → ${to}`, 'success');
  });
  window.hubAPI?.onTunnelStatusChanged?.(({ active, url, error }) => {
    const tRow = document.getElementById('tunnelStatusRow');
    if (!active) {
      if (tRow) tRow.textContent = error ? `❌ ${error}` : '⚫ Tunnel inactive';
    } else if (url && tRow) {
      tRow.innerHTML = `🟢 Active at <a href="#" class="lan-url-link" data-url="${escapeHtml(url)}" style="color:var(--primary)">${escapeHtml(url)}</a>`;
      tRow.querySelectorAll('.lan-url-link').forEach(a => { a.addEventListener('click', e => { e.preventDefault(); window.hubAPI?.openExternal?.(a.dataset.url); }); });
      updateWebhookUrlDisplay(url);
    }
  });

  // LAN intake form submission → add to waiting list and refresh
  window.hubAPI?.onLanIntakeSubmitted?.((entry) => {
    if (!entry?.id) return;
    if (waitingList.some(w => w.id === entry.id)) {
      renderWaitingList();
      updateWaitingBadge();
      toast(t('intakeFormSubmitted'), 'success');
      return;
    }
    const draft = {
      id: entry.id,
      project: entry.project || (entry.description ? entry.description.slice(0, 80) : null) || t('waiting.untitled'),
      clientName: entry.clientName || entry.name || '',
      notes: entry.notes || entry.description || '',
      email: entry.email,
      phone: entry.phone,
      material: entry.material,
      budget: entry.budget,
      referenceLink: entry.referenceLink,
      priority: entry.priority || 'normal',
      status: entry.status || 'active',
      source: entry.source || 'intake_form',
      estValue: entry.estValue || 0,
      reminderDate: entry.reminderDate || entry.deadline || entry.dueDate || null,
      createdAt: entry.submittedAt || entry.createdAt || new Date().toISOString(),
    };
    Object.keys(draft).forEach(k => draft[k] === undefined && delete draft[k]);
    waitingList.unshift(draft);
    saveAll();
    renderWaitingList();
    updateWaitingBadge();
    toast(t('intakeFormSubmitted'), 'success');
  });

  window.hubAPI?.encryptionAvailable?.().then((enc) => {
    if (enc && enc.ok === true && enc.available === false) {
      toast(t('security.no_keychain') || 'OS secure storage is unavailable — secrets may be stored unencrypted on disk.', 'warning', 10000);
    }
  }).catch(() => {});

  // Round 12: Start LAN API server if enabled
  if (settings.lanApi?.enabled) {
    startLanServer().then(async () => {
      await reconcileLanServerStatus?.();
      if (settings.lanApi?.tunnelEnabled) {
        await startTunnelFromSettings?.({ confirm: false });
      }
    }).catch(e => {
      console.error('LAN server failed to start:', e);
      settings.lanApi = { ...settings.lanApi, enabled: false };
      toast(t('lan.start_failed') || 'LAN server failed to start — port may be in use', 'warning', 6000);
    });
  }

  // Business Mode setup wizard (new first-run experience)
  initWizard();

  // Global search keyboard shortcut ⌘K / Ctrl+K, plus tab-nav shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      globalSearchOpen ? closeGlobalSearch() : openGlobalSearch();
      return;
    }
    if (globalSearchOpen && typeof handleGlobalSearchKeydown === 'function' && handleGlobalSearchKeydown(e)) {
      return;
    }
    if (e.key === 'Escape' && globalSearchOpen) {
      closeGlobalSearch();
      return;
    }
    // Single-key navigation shortcuts — only when no input/modal is focused
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.shiftKey && e.key !== '?') return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.querySelector('.modal-backdrop')) return; // modal open
    switch (e.key) {
      case 'n': case 'N': switchTab('calculator-tab'); break;
      case 'o': case 'O': switchTab('logs-tab'); break;
      case 'q': case 'Q': switchTab('queue-tab'); break;
      case 'i': case 'I': switchTab('inventory-tab'); break;
      case 'a': case 'A': switchTab('analytics-tab'); break;
      case 'c': case 'C': switchTab('clients-tab'); break;
      case '?': openHelpModal(); break;
    }
  });

  const gsOverlay = $('#globalSearchOverlay');
  if (gsOverlay) {
    gsOverlay.addEventListener('click', (e) => {
      if (e.target === gsOverlay) closeGlobalSearch();
    });
    const gsInput = $('#globalSearchInput');
    if (gsInput) gsInput.addEventListener('input', (e) => renderGlobalResults(e.target.value));
  }
});

document.addEventListener('languagechange', () => {
  initialRender();
  refreshCurrencyLabels();
});
}

(function (global) {
  global.initWizard = initWizard;
  global.KhaytAppBoot = { initWizard };
  if (typeof module !== 'undefined' && module.exports) module.exports = { initWizard };
})(typeof globalThis !== 'undefined' ? globalThis : window);
