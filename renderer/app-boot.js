/**
 * Application boot: setup wizard and DOMContentLoaded initialization.
 */

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

  wiz.addEventListener('click', e => {
    const nextBtn = e.target.closest('[data-next]');
    const optionBtn = e.target.closest('.wizard-option');
    const finishBtn = e.target.closest('#wizFinish');

    if (nextBtn && nextBtn.id !== 'wizRecoveryContinue') {
      const step = parseInt(nextBtn.dataset.next, 10);
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

    if (optionBtn) {
      wiz.querySelectorAll('.wizard-option').forEach(o => o.classList.remove('selected'));
      optionBtn.classList.add('selected');
      selectedMode = optionBtn.dataset.mode;
      setTimeout(() => goToStep(parseInt(optionBtn.dataset.next, 10)), 300);
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
    settings.designTheme = selectedDesign || settings.designTheme || 'studio';
    const finishTheme = global.KhaytThemeRegistry?.getTheme(settings.designTheme);
    if (finishTheme?.defaultAppearance) settings.theme = finishTheme.defaultAppearance;
    else if (!settings.theme) settings.theme = 'light';
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
    }).catch(() => {});
  }
  if (window.hubAPI?.onPrinterStatusUpdate) {
    window.hubAPI.onPrinterStatusUpdate(data => {
      machineStatusCache = data || {};
      updateKanbanLiveStatus();
    });
  }

  let currentVersion = '2.0.16';
  if (window.hubAPI?.appVersion) {
    try { currentVersion = await window.hubAPI.appVersion(); }
    catch (_) {}
  }
  if ($('#appVersion')) $('#appVersion').textContent = currentVersion || '2.0.16 (dev)';

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
          `✅ Updated to Khayt ${escapeHtml(currentVersion)} — your data is intact. ` +
          `A pre-update backup was saved to <em>Settings → Backup</em>.`,
          'success', 7000
        );
      }, 2500); // slight delay so the UI is fully painted first
    }
  })();

  // ── Auto-updater UI ─────────────────────────────────────────────────────────
  // electron-updater fires IPC events from main; we show a non-intrusive banner.
  (function wireUpdaterUI() {
    const BANNER_CSS = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'background:var(--primary);color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;' +
      'font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.35);display:flex;align-items:center;gap:10px;white-space:nowrap;';

    function makeBanner(html) {
      const el = document.createElement('div');
      el.id = 'updateBanner';
      el.style.cssText = BANNER_CSS;
      el.innerHTML = html;
      document.getElementById('updateBanner')?.remove();
      document.body.appendChild(el);
      return el;
    }

    // 1. Update available — ask user to download
    window.hubAPI?.onUpdateAvailable?.((info) => {
      const banner = makeBanner(
        `🎉 Khayt <strong>${escapeHtml(info.version)}</strong> is available! ` +
        `<button id="updBtnDownload" style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:3px 12px;border-radius:12px;cursor:pointer;font-size:12px;">Download</button> ` +
        `<span id="updBtnClose" style="opacity:.7;font-size:18px;cursor:pointer;line-height:1;">×</span>`
      );
      banner.querySelector('#updBtnDownload')?.addEventListener('click', () => {
        banner.innerHTML = `⬇️ Downloading update… <span id="updProgress" style="opacity:.8;font-size:12px;">0%</span>`;
        window.hubAPI?.startUpdateDownload?.();
      });
      banner.querySelector('#updBtnClose')?.addEventListener('click', () => banner.remove());
    });

    // 2. Download progress — update the % counter
    window.hubAPI?.onUpdateDownloadProgress?.((progress) => {
      const el = document.getElementById('updProgress');
      if (el) el.textContent = `${progress.percent}%`;
    });

    // 2b. Update error — surface it instead of leaving the banner stuck at 0%
    window.hubAPI?.onUpdateError?.((err) => {
      const banner = document.getElementById('updateBanner');
      if (!banner) return;
      const msg = escapeHtml(err?.message || 'Update failed');
      banner.innerHTML =
        `⚠ Update failed: <span style="opacity:.85;font-size:12px;">${msg}</span> ` +
        `<span id="updBtnCloseErr" style="opacity:.7;font-size:18px;cursor:pointer;line-height:1;margin-inline-start:6px;">×</span>`;
      banner.querySelector('#updBtnCloseErr')?.addEventListener('click', () => banner.remove());
    });

    // 3. Download complete — show restart button
    window.hubAPI?.onUpdateDownloaded?.((info) => {
      const banner = makeBanner(
        `✅ Khayt <strong>${escapeHtml(info.version)}</strong> ready — ` +
        `<button id="updBtnRestart" style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:3px 12px;border-radius:12px;cursor:pointer;font-size:12px;">Restart &amp; install</button> ` +
        `<span id="updBtnClose2" style="opacity:.7;font-size:18px;cursor:pointer;line-height:1;">×</span>`
      );
      banner.querySelector('#updBtnRestart')?.addEventListener('click', async () => {
        const btn = banner.querySelector('#updBtnRestart');
        const setBtn = (label) => { if (btn) btn.textContent = label; };
        if (btn) btn.disabled = true;

        const withTimeout = (promise, ms, label) =>
          Promise.race([
            promise,
            new Promise((resolve) => setTimeout(() => {
              console.warn(`[update] ${label} timed out after ${ms}ms — continuing`);
              resolve(null);
            }, ms)),
          ]);

        try {
          // 1. One flush to disk (large stores can take several seconds to encrypt).
          setBtn('Saving data…');
          if (typeof flushSave === 'function') {
            await withTimeout(flushSave(), 20_000, 'flushSave');
          }

          // 2. Pre-update backup — copy store file on disk (no huge JSON over IPC).
          setBtn('Backing up…');
          await withTimeout(
            window.hubAPI?.writeUpdateBackup?.('__COPY_STORE__', info.version),
            12_000,
            'writeUpdateBackup',
          );

          // 3. Record pending version for post-relaunch toast.
          localStorage.setItem('khayt_pending_update_to', String(info.version));

          setTimeout(() => {
            if (localStorage.getItem('khayt_pending_update_to') === String(info.version)) {
              localStorage.removeItem('khayt_pending_update_to');
              toast('⚠ Update installation failed — please restart the app manually.', 'error', 8000);
              if (btn) { btn.disabled = false; btn.textContent = 'Restart & install'; }
            }
          }, 30_000);

          // 4. Quit and install (store already flushed — do not re-send snapshot).
          setBtn('Installing…');
          await window.hubAPI?.installUpdate?.(null);
        } catch (err) {
          console.error('[update] install prep failed:', err);
          toast('⚠ Could not prepare update — trying install anyway.', 'warning', 6000);
          setBtn('Installing…');
          try { await window.hubAPI?.installUpdate?.(null); } catch (_) {}
        }
      });
      banner.querySelector('#updBtnClose2')?.addEventListener('click', () => banner.remove());
    });
  })();

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
        if (res?.status === 'dev') {
          if (msg) {
            const ver = res.currentVersion || currentVersion || '';
            msg.innerHTML =
              `Source build${ver ? ` (${escapeHtml(ver)})` : ''}. ` +
              'New features ship on <strong>main</strong> first — in your repo folder run ' +
              '<code>git pull origin main</code> then <code>npm start</code>. ' +
              'Installed DMG/auto-update only moves when a new GitHub Release is published ' +
              '(see <a href="https://github.com/Alballaa/Khayt/blob/main/docs/RELEASE-HOLD.md" target="_blank" rel="noopener">release hold</a>).';
          }
        } else if (res?.status === 'error') {
          if (msg) msg.textContent = `⚠ Update check failed: ${res.message || 'unknown error'}`;
        } else if (res?.status === 'available') {
          if (msg) msg.textContent = `Khayt ${res.version} is available — use the banner to download.`;
        } else if (res?.status === 'not-available') {
          const ver = res.currentVersion || currentVersion || '';
          if (msg) msg.textContent = ver ? `✓ You're up to date (${ver})` : '✓ You\'re up to date';
        } else if (msg) {
          msg.textContent = '⚠ Update check returned no result';
        }
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
    if (e.key === 'Escape' && globalSearchOpen) {
      closeGlobalSearch();
      return;
    }
    // Single-key navigation shortcuts — only when no input/modal is focused
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
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
