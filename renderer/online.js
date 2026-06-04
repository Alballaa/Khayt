/**
 * Online customer features: intake form and LAN-backed links (same Wi‑Fi or tunnel).
 */
(function (global) {
  /** Apply LAN defaults when the shop enables online intake. */
  function applyOnlineLanPrefs(lanApi, onlineEnabled) {
    const lan = { ...(lanApi || {}) };
    if (!onlineEnabled) return lan;
    return { ...lan, enabled: true, bindLan: true };
  }

  function intakeUrlFromBase(baseUrl) {
    if (!baseUrl) return '';
    return String(baseUrl).replace(/\/$/, '') + '/intake';
  }

  function formatIntakePinHint() {
    const pin = settings.lanApi?.intakePin;
    if (!pin) return t('online.intake_pin_pending') || 'Starts when the server is running (auto-generated if blank).';
    if (typeof isSecretMasked === 'function' && isSecretMasked(pin)) {
      return t('online.intake_pin_saved') || 'Configured — set or view in Settings → Online & LAN.';
    }
    return `${t('online.intake_pin_label') || 'Customer PIN'}: ${pin}`;
  }

  async function refreshOnlineIntakeUrlDisplay(wrapEl) {
    if (!wrapEl) return;
    const urlEl = wrapEl.querySelector('[data-online-intake-url]');
    const pinEl = wrapEl.querySelector('[data-online-intake-pin]');
    if (!settings.onlineEnabled) {
      wrapEl.style.display = 'none';
      return;
    }
    wrapEl.style.display = '';
    if (pinEl) pinEl.textContent = formatIntakePinHint();
    if (!urlEl) return;
    const res = await window.hubAPI?.getLanUrl?.().catch(() => null);
    if (res?.ok && res.url) {
      const intakeUrl = intakeUrlFromBase(res.url);
      urlEl.innerHTML =
        `<a href="#" class="online-intake-link" data-url="${escapeHtml(intakeUrl)}" style="color:var(--primary);word-break:break-all;">${escapeHtml(intakeUrl)}</a>`;
      urlEl.querySelectorAll('.online-intake-link').forEach((a) => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          window.hubAPI?.openExternal?.(a.dataset.url);
        });
      });
    } else {
      urlEl.textContent = t('online.start_server_hint') || 'Start the server below (or enable Online and Save) to get your link.';
    }
  }

  async function copyOnlineIntakeUrl(btn) {
    const res = await window.hubAPI?.getLanUrl?.().catch(() => null);
    if (!res?.ok) {
      toast(t('online.need_server') || 'Start the LAN server in Settings first', 'warning');
      return;
    }
    const url = intakeUrlFromBase(res.url);
    try {
      await navigator.clipboard.writeText(url);
      toast(t('intakeFormUrl') ? `${t('copyIntakeUrl') || 'Copied'}` : 'URL copied', 'success');
      if (btn) btn.textContent = '✓';
      setTimeout(() => { if (btn) btn.textContent = t('copyIntakeUrl') || 'Copy URL'; }, 2000);
    } catch {
      toast(t('common.copy_failed') || 'Copy failed', 'error');
    }
  }

  function renderOnlineSettings() {
    const el = $('#onlineSection');
    if (!el) return;
    const on = !!settings.onlineEnabled;
    const lanOn = !!settings.lanApi?.enabled;

    el.innerHTML = `
      <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin-bottom:12px;">
        <input type="checkbox" id="online_enabled" style="width:auto;margin:3px 0 0;" ${on ? 'checked' : ''}>
        <span>
          <strong data-i18n="online.enable_title">Enable online quote requests</strong>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px;font-weight:400;" data-i18n="online.enable_desc">
            Customers on your Wi‑Fi open a link to submit requests; they appear in Job Intake. Data stays on your computer — no Khayt cloud.
          </div>
        </span>
      </label>
      <div id="onlineDetails" style="display:${on ? 'block' : 'none'};padding:12px 14px;background:var(--bg-elev);border-radius:var(--radius);margin-bottom:14px;">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;" data-i18n="online.intake_heading">Online intake link</div>
        <div data-online-intake-url style="font-size:13px;margin-bottom:8px;min-height:20px;">—</div>
        <div data-online-intake-pin style="font-size:11px;color:var(--text-muted);margin-bottom:10px;"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn small primary" id="btnCopyIntakeUrl" data-i18n="copyIntakeUrl">Copy URL</button>
          <button type="button" class="btn small ghost" id="btnOpenIntakePreview" data-i18n="online.preview">Preview form</button>
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin:12px 0 0;line-height:1.5;" data-i18n="online.remote_hint">
          For customers outside your shop Wi‑Fi, use <strong>Remote tunnel</strong> in the LAN section below (advanced; use a strong owner PIN).
        </p>
        <p style="font-size:11px;color:var(--text-muted);margin:8px 0 0;">${lanOn ? '🟢 ' + (t('online.server_on') || 'Server running') : '⚫ ' + (t('online.server_off') || 'Server stopped — Save or Start below')}</p>
      </div>`;

    i18n.applyToDom(el);

    el.querySelector('#online_enabled')?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      settings.onlineEnabled = enabled;
      settings.lanApi = applyOnlineLanPrefs(settings.lanApi, enabled);
      saveAll();
      renderOnlineSettings();
      if (enabled) {
        startLanServer?.().then(() => {
          refreshOnlineIntakeUrlDisplay(el.querySelector('#onlineDetails'));
          renderWaitingOnlinePanel?.();
        });
      } else {
        renderWaitingOnlinePanel?.();
      }
    });

    el.querySelector('#btnCopyIntakeUrl')?.addEventListener('click', (e) => {
      copyOnlineIntakeUrl(e.currentTarget);
    });

    el.querySelector('#btnOpenIntakePreview')?.addEventListener('click', async () => {
      const res = await window.hubAPI?.getLanUrl?.().catch(() => null);
      if (!res?.ok) {
        toast(t('online.need_server') || 'Start the server first', 'warning');
        return;
      }
      window.hubAPI?.openExternal?.(intakeUrlFromBase(res.url));
    });

    if (on) refreshOnlineIntakeUrlDisplay(el.querySelector('#onlineDetails'));
  }

  function renderWaitingOnlinePanel() {
    const el = $('#waitingOnlinePanel');
    if (!el) return;
    if (!settings.onlineEnabled) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.innerHTML = `
      <div class="card" style="padding:12px 14px;margin-bottom:10px;border:1px solid var(--border);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;font-size:13px;">🌐 ${escapeHtml(t('onlineIntakeForm') || 'Online Intake Form')}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;" data-i18n="online.waiting_hint">Share this link; new requests land here.</div>
          </div>
          <button type="button" class="btn small" id="btnWaitingCopyIntake" data-i18n="copyIntakeUrl">Copy URL</button>
        </div>
        <div data-online-intake-url style="font-size:12px;margin-top:8px;word-break:break-all;">—</div>
        <div data-online-intake-pin style="font-size:11px;color:var(--text-muted);margin-top:6px;"></div>
      </div>`;
    i18n.applyToDom(el);
    el.querySelector('#btnWaitingCopyIntake')?.addEventListener('click', (e) => copyOnlineIntakeUrl(e.currentTarget));
    refreshOnlineIntakeUrlDisplay(el);
  }

  const api = {
    applyOnlineLanPrefs,
    intakeUrlFromBase,
    renderOnlineSettings,
    renderWaitingOnlinePanel,
    refreshOnlineIntakeUrlDisplay,
  };
  Object.assign(global, api);
  global.KhaytOnline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
