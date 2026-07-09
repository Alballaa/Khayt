/**
 * In-app update UI: changelog review before download/install.
 */
(function (global) {
  let updateOverlay = null;
  let activeUpdateInfo = null;
  let promptedVersion = null;
  let openingModal = false; // synchronous latch: an open is in-flight across its await

  // Product name for update copy — Bed Ready runs the same renderer via its own
  // flavor marker on <html>, so never hard-code "Khayt" in user-facing strings.
  const PRODUCT = (typeof document !== 'undefined' && document.documentElement.dataset.app === 'bedready')
    ? 'Bed Ready' : 'Khayt';

  function tr(key, fallback, vars) {
    if (typeof t === 'function') {
      const v = t(key, vars);
      if (v && v !== key) return v;
    }
    if (vars && fallback) {
      let s = fallback;
      for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, String(vars[k]));
      return s;
    }
    return fallback;
  }

  function closeUpdateModal() {
    if (updateOverlay) {
      updateOverlay.remove();
      updateOverlay = null;
    }
  }

  async function formatNotes(info) {
    try {
      const formatted = await window.hubAPI?.formatReleaseNotes?.(info.releaseNotes || '', {
        version: info.version,
        releaseDate: info.releaseDate,
      });
      if (formatted?.html) return formatted.html;
    } catch (e) {
      console.warn('[update-ui] formatReleaseNotes failed', e);
    }
    return `<p class="update-notes-paragraph">${escapeHtml(tr('upd.no_notes', 'Release notes were not included with this update.'))}</p>`;
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => {
        console.warn(`[update] ${label} timed out after ${ms}ms — continuing`);
        resolve(null);
      }, ms)),
    ]);
  }

  async function prepareAndInstall(version) {
    if (typeof flushSave === 'function') {
      await withTimeout(flushSave(), 20_000, 'flushSave');
    }
    await withTimeout(
      window.hubAPI?.writeUpdateBackup?.('__COPY_STORE__', version),
      12_000,
      'writeUpdateBackup',
    );
    localStorage.setItem('khayt_pending_update_to', String(version));
    setTimeout(() => {
      if (localStorage.getItem('khayt_pending_update_to') === String(version)) {
        localStorage.removeItem('khayt_pending_update_to');
        toast(tr('upd.install_failed', 'Update installation failed — please restart the app manually.'), 'error', 8000);
      }
    }, 30_000);
    await window.hubAPI?.installUpdate?.(null);
  }

  function setModalBody(html) {
    const body = updateOverlay?.querySelector('#updateModalBody');
    if (body) body.innerHTML = html;
  }

  function setModalFooter(html) {
    const footer = updateOverlay?.querySelector('#updateModalFooter');
    if (footer) footer.innerHTML = html;
  }

  function wireFooterActions() {
    updateOverlay?.querySelector('[data-upd="later"]')?.addEventListener('click', closeUpdateModal);
    updateOverlay?.querySelector('[data-upd="download"]')?.addEventListener('click', () => {
      startUpdateDownload();
    });
    updateOverlay?.querySelector('[data-upd="install"]')?.addEventListener('click', async () => {
      const btn = updateOverlay?.querySelector('[data-upd="install"]');
      if (btn) btn.disabled = true;
      try {
        setModalFooter(
          `<button class="btn primary" disabled>${escapeHtml(tr('upd.installing', 'Installing…'))}</button>`,
        );
        await prepareAndInstall(activeUpdateInfo.version);
      } catch (err) {
        console.error('[update] install prep failed:', err);
        toast(tr('upd.install_retry', 'Could not prepare update — trying install anyway.'), 'warning', 6000);
        try { await window.hubAPI?.installUpdate?.(null); } catch (_) {}
      }
    });
    updateOverlay?.querySelector('[data-upd="close"]')?.addEventListener('click', closeUpdateModal);
  }

  function renderReviewState(notesHtml) {
    const version = escapeHtml(activeUpdateInfo.version);
    const current = escapeHtml(activeUpdateInfo.currentVersion || '');
    setModalBody(`
      <p class="update-notes-intro">${escapeHtml(tr('upd.intro', 'Review what is new before installing.'))}</p>
      ${current ? `<p class="update-notes-meta">${escapeHtml(tr('upd.from_version', 'Current version'))}: <strong>${current}</strong> → <strong>${version}</strong></p>` : ''}
      <div class="update-notes-panel">${notesHtml}</div>
    `);
    setModalFooter(`
      <button class="btn ghost" data-upd="later">${escapeHtml(tr('upd.later', 'Later'))}</button>
      <button class="btn primary" data-upd="download">${escapeHtml(tr('upd.download', 'Download update'))}</button>
    `);
    wireFooterActions();
  }

  function renderDownloadingState(percent) {
    setModalBody(`
      <p class="update-notes-intro">${escapeHtml(tr('upd.downloading', 'Downloading update…'))}</p>
      <div class="update-progress-wrap" aria-live="polite">
        <div class="update-progress-bar"><div class="update-progress-fill" style="width:${percent}%"></div></div>
        <div class="update-progress-label">${percent}%</div>
      </div>
    `);
    setModalFooter(`
      <button class="btn ghost" data-upd="later">${escapeHtml(tr('upd.continue_bg', 'Continue in background'))}</button>
    `);
    wireFooterActions();
  }

  function renderReadyState() {
    const version = activeUpdateInfo.version;
    setModalBody(`
      <p class="update-notes-intro">${escapeHtml(tr('upd.ready', 'Update downloaded and ready to install.'))}</p>
      <p class="update-notes-meta">${escapeHtml(tr('upd.ready_version', PRODUCT + ' {version} will install after restart.', { version }))}</p>
      <p class="update-notes-hint">${escapeHtml(tr('upd.backup_hint', 'A pre-update backup is saved automatically before restart.'))}</p>
    `);
    setModalFooter(`
      <button class="btn ghost" data-upd="later">${escapeHtml(tr('upd.later', 'Later'))}</button>
      <button class="btn primary" data-upd="install">${escapeHtml(tr('upd.restart_install', 'Restart & install'))}</button>
    `);
    wireFooterActions();
  }

  function renderErrorState(message) {
    setModalBody(`
      <p class="update-notes-intro">${escapeHtml(tr('upd.error_title', 'Update failed'))}</p>
      <p class="update-notes-error">${escapeHtml(message || tr('upd.error_generic', 'Unknown update error'))}</p>
    `);
    setModalFooter(`
      <button class="btn ghost" data-upd="close">${escapeHtml(tr('common.close', 'Close'))}</button>
      <button class="btn primary" data-upd="download">${escapeHtml(tr('upd.retry_download', 'Retry download'))}</button>
    `);
    wireFooterActions();
  }

  function startUpdateDownload() {
    if (!activeUpdateInfo) return;
    renderDownloadingState(0);
    window.hubAPI?.startUpdateDownload?.();
  }

  async function showUpdateChangesModal(info, { currentVersion, initialState = 'review' } = {}) {
    if (!info?.version || !window.hubAPI) return;
    // Already showing (or mid-open, across the async formatNotes gap) for this version →
    // ignore the duplicate. A manual check fires BOTH the update-available event and the
    // IPC result for the same version; without this latch they race into two stacked modals.
    if (promptedVersion === info.version && (updateOverlay || openingModal)) return;
    openingModal = true;

    promptedVersion = info.version;
    activeUpdateInfo = {
      version: info.version,
      releaseDate: info.releaseDate || null,
      releaseNotes: info.releaseNotes || '',
      currentVersion: currentVersion || info.currentVersion || '',
    };

    closeUpdateModal();

    const notesHtml = await formatNotes(activeUpdateInfo);
    const version = escapeHtml(activeUpdateInfo.version);

    updateOverlay = appendStackedModal(`
      <div class="modal modal-form modal-lg update-modal" role="dialog" aria-modal="true" aria-labelledby="updateModalTitle">
        <div class="modal-header">
          <h3 id="updateModalTitle">${escapeHtml(tr('upd.title', 'Update available'))} — ${escapeHtml(PRODUCT)} ${version}</h3>
          <button class="btn ghost small" data-upd="later" aria-label="${escapeHtml(tr('common.close', 'Close'))}">×</button>
        </div>
        <div class="modal-body" id="updateModalBody"></div>
        <div class="modal-footer" id="updateModalFooter"></div>
      </div>
    `, { zIndex: 10060 });
    openingModal = false;

    updateOverlay.querySelector('.modal-header [data-upd="later"]')?.addEventListener('click', closeUpdateModal);
    updateOverlay.addEventListener('click', (e) => {
      if (e.target === updateOverlay) closeUpdateModal();
    });

    if (initialState === 'ready') renderReadyState();
    else renderReviewState(notesHtml);
  }

  function wireUpdateUI({ getCurrentVersion } = {}) {
    window.hubAPI?.onUpdateAvailable?.((info) => {
      const currentVersion = typeof getCurrentVersion === 'function' ? getCurrentVersion() : '';
      showUpdateChangesModal(info, { currentVersion });
    });

    window.hubAPI?.onUpdateDownloadProgress?.((progress) => {
      if (!updateOverlay || !activeUpdateInfo) return;
      renderDownloadingState(Math.round(progress.percent || 0));
    });

    window.hubAPI?.onUpdateDownloaded?.((info) => {
      if (info?.version) {
        activeUpdateInfo = { ...(activeUpdateInfo || {}), version: info.version };
      }
      if (!updateOverlay) {
        showUpdateChangesModal(activeUpdateInfo || info, { initialState: 'ready' });
        return;
      }
      renderReadyState();
    });

    window.hubAPI?.onUpdateError?.((err) => {
      if (!updateOverlay) return;
      renderErrorState(err?.message || '');
    });
  }

  async function handleManualUpdateCheckResult(res, { currentVersion, statusEl } = {}) {
    if (res?.status === 'available') {
      if (statusEl) statusEl.textContent = '';
      await showUpdateChangesModal(res, { currentVersion });
      return;
    }
    if (res?.status === 'dev') {
      if (statusEl) {
        const ver = res.currentVersion || currentVersion || '';
        if (PRODUCT !== 'Khayt') {
          // Bed Ready: no Khayt-repo workflow — show the flavor's own dev message.
          statusEl.textContent = res.message || `Source build${ver ? ` (${ver})` : ''}.`;
        } else {
          statusEl.innerHTML =
            `Source build${ver ? ` (${escapeHtml(ver)})` : ''}. ` +
            'New features ship on <strong>main</strong> first — in your repo folder run ' +
            '<code>git pull origin main</code> then <code>npm start</code>. ' +
            'Installed DMG/auto-update only moves when a new GitHub Release is published ' +
            '(see <a href="https://github.com/khaytapp/Khayt/blob/main/docs/RELEASE-HOLD.md" target="_blank" rel="noopener">release hold</a>).';
        }
      }
      return;
    }
    if (res?.status === 'error') {
      if (statusEl) statusEl.textContent = `⚠ Update check failed: ${res.message || 'unknown error'}`;
      return;
    }
    if (res?.status === 'not-available') {
      const ver = res.currentVersion || currentVersion || '';
      if (statusEl) statusEl.textContent = ver ? `✓ You're up to date (${ver})` : '✓ You\'re up to date';
      return;
    }
    if (statusEl) statusEl.textContent = '⚠ Update check returned no result';
  }

  const api = {
    wireUpdateUI,
    showUpdateChangesModal,
    handleManualUpdateCheckResult,
  };

  Object.assign(global, api);
  global.KhaytUpdateUI = api;
})(window);
