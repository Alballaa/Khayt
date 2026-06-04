/**
 * App security — PIN/recovery helpers and destructive-action gates (renderer).
 */
(function (global) {
  const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '0123']);
  const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  async function hashSecret(value) {
    if (typeof hashPin === 'function') return hashPin(value);
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function randomBlock(size = 4) {
    let out = '';
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < size; i++) {
      out += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
    }
    return out;
  }

  function timingSafeEqualHex(a, b) {
    const sa = String(a || '');
    const sb = String(b || '');
    if (sa.length !== sb.length) return false;
    let diff = 0;
    for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
    return diff === 0;
  }

  function generateRecoveryCode() {
    return `KHAYT-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
  }

  function normalizeRecoveryCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^KHAYT/, '');
  }

  function formatRecoveryCode(code) {
    const raw = normalizeRecoveryCode(code);
    if (raw.length !== 12) return String(code || '').trim().toUpperCase();
    return `KHAYT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  }

  function isValidRecoveryCode(code) {
    return normalizeRecoveryCode(code).length === 12;
  }

  async function verifyRecoveryCode(code, hash) {
    if (!hash || !isValidRecoveryCode(code)) return false;
    const entered = await hashSecret(normalizeRecoveryCode(code));
    return timingSafeEqualHex(entered, hash);
  }

  function isValidPin(pin) {
    return /^\d{4,8}$/.test(String(pin || ''));
  }

  function isWeakPin(pin) {
    const p = String(pin || '');
    if (!isValidPin(p)) return true;
    if (WEAK_PINS.has(p)) return true;
    if (/^(\d)\1+$/.test(p)) return true;
    return false;
  }

  function securityIsEnabled() {
    return !!(settings?.securityEnabled && settings?.recoveryCodeHash);
  }

  function getAdminOperator() {
    const admins = (operators || []).filter(o => (o.role || '').toLowerCase().includes('admin'));
    if (admins.length) return admins[0];
    return (operators || []).find(o => o.pinHash) || null;
  }

  function buildRecoveryCodeFile(code) {
    const formatted = formatRecoveryCode(code);
    const date = new Date().toISOString().slice(0, 10);
    const biz = settings?.businessName || settings?.bizEn || 'Khayt';
    return [
      'Khayt Recovery Code',
      `Business: ${biz}`,
      `Created: ${date}`,
      '',
      `Recovery code: ${formatted}`,
      '',
      t('sec.recovery_file_warn'),
    ].join('\n');
  }

  async function copyRecoveryCode(code) {
    const text = formatRecoveryCode(code);
    if (window.hubAPI?.clipboardWrite) {
      await window.hubAPI.clipboardWrite(text);
      return { ok: true };
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    }
    return { ok: false, error: 'clipboard_unavailable' };
  }

  async function downloadRecoveryCode(code) {
    const content = buildRecoveryCodeFile(code);
    const defaultName = `khayt-recovery-${new Date().toISOString().slice(0, 10)}.txt`;
    if (window.hubAPI?.saveTextFile) {
      return window.hubAPI.saveTextFile({ content, defaultName });
    }
    return { ok: false, error: 'save_unavailable' };
  }

  async function verifyAdminPin(pin) {
    const admin = getAdminOperator();
    if (!admin?.pinHash) return false;
    const entered = await hashSecret(String(pin || ''));
    if (admin.pinHash.length !== 64 && isLegacyPin?.(admin.pinHash)) return false;
    return timingSafeEqualHex(entered, admin.pinHash);
  }

  function promptTypeConfirmModal(message, confirmPhrase, { title, danger = true, extraHtml = '' } = {}) {
    return new Promise(resolve => {
      const phrase = String(confirmPhrase || '');
      const overlay = (typeof appendStackedModal === 'function' ? appendStackedModal : null)?.(`
          <div class="modal" role="dialog" aria-modal="true">
            <h3>${escapeHtml(title || t('common.confirm'))}</h3>
            <p>${typeof message === 'string' && message.includes('<') ? message : escapeHtml(message)}</p>
            ${extraHtml}
            <label style="display:block;margin-top:12px;font-size:13px;">${escapeHtml(t('sec.type_to_confirm', { phrase }))}</label>
            <input type="text" id="typeConfirmInput" class="form-control" autocomplete="off" spellcheck="false" style="margin-top:6px;">
            <div class="btn-row" style="margin-top:14px;">
              <button class="btn ghost" data-act="cancel">${escapeHtml(t('common.cancel'))}</button>
              <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok" disabled>${escapeHtml(t('common.confirm'))}</button>
            </div>
          </div>`);
      if (!overlay) return resolve(false);
      const input = overlay.querySelector('#typeConfirmInput');
      const okBtn = overlay.querySelector('[data-act="ok"]');
      const sync = () => { okBtn.disabled = input.value.trim() !== phrase; };
      input.addEventListener('input', sync);
      setTimeout(() => input.focus(), 40);
      const cleanup = (val) => { overlay.remove(); resolve(val); };
      okBtn.addEventListener('click', () => { if (!okBtn.disabled) cleanup(true); });
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    });
  }

  function pinOrRecoveryModal({ title, message } = {}) {
    return new Promise(resolve => {
      let mode = 'pin';
      const overlay = (typeof appendStackedModal === 'function' ? appendStackedModal : null)?.('');
      if (!overlay) return resolve(false);
      const render = () => {
        overlay.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true" style="max-width:380px;">
              <h3>${escapeHtml(title || t('sec.verify_title'))}</h3>
              <p style="font-size:13px;color:var(--text-muted);">${escapeHtml(message || t('sec.verify_body'))}</p>
              <div class="seg" style="margin-bottom:12px;">
                <button type="button" class="${mode === 'pin' ? 'on' : ''}" data-mode="pin">${escapeHtml(t('sec.use_pin'))}</button>
                <button type="button" class="${mode === 'recovery' ? 'on' : ''}" data-mode="recovery">${escapeHtml(t('sec.use_recovery'))}</button>
              </div>
              <input type="${mode === 'pin' ? 'password' : 'text'}" id="secVerifyInput" class="form-control"
                placeholder="${escapeHtml(mode === 'pin' ? t('sec.pin_ph') : t('sec.recovery_ph'))}"
                autocomplete="off" inputmode="${mode === 'pin' ? 'numeric' : 'text'}">
              <div id="secVerifyError" style="color:var(--danger);font-size:12px;min-height:18px;margin-top:6px;"></div>
              <div class="btn-row" style="margin-top:10px;">
                <button class="btn ghost" data-act="cancel">${escapeHtml(t('common.cancel'))}</button>
                <button class="btn primary" data-act="ok">${escapeHtml(t('common.confirm'))}</button>
              </div>
            </div>`;
        overlay.querySelectorAll('[data-mode]').forEach(btn => {
          btn.addEventListener('click', () => { mode = btn.dataset.mode; render(); });
        });
        const input = overlay.querySelector('#secVerifyInput');
        setTimeout(() => input?.focus(), 30);
        overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => { overlay.remove(); resolve(false); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
        overlay.querySelector('[data-act="ok"]').addEventListener('click', async () => {
          const val = input.value.trim();
          const err = overlay.querySelector('#secVerifyError');
          let ok = false;
          if (mode === 'pin') ok = await verifyAdminPin(val);
          else ok = await verifyRecoveryCode(val, settings.recoveryCodeHash);
          if (ok) { overlay.remove(); resolve(true); return; }
          if (err) err.textContent = mode === 'pin' ? t('sec.pin_invalid') : t('sec.recovery_invalid');
        });
      };
      render();
    });
  }

  async function verifyDestructiveGate({ phrase, title, message, requireSecurity = true } = {}) {
    const typed = await promptTypeConfirmModal(
      message || t('sec.destructive_warn'),
      phrase,
      { title: title || t('common.confirm'), danger: true },
    );
    if (!typed) return false;
    if (requireSecurity && securityIsEnabled()) {
      return pinOrRecoveryModal({ title: t('sec.verify_title'), message: t('sec.verify_body') });
    }
    return true;
  }

  async function setupAdminSecurity({ pin, recoveryCodePlain }) {
    const pinHash = await hashSecret(pin);
    const recoveryHash = await hashSecret(normalizeRecoveryCode(recoveryCodePlain));
    const adminId = uid('OP');
    operators = [{
      id: adminId,
      name: t('sec.default_admin_name'),
      role: t('op.role_admin'),
      active: true,
      hourlyRate: 0,
      pinHash,
    }];
    settings.activeOperatorId = adminId;
    settings.operatorLockEnabled = true;
    settings.securityEnabled = true;
    settings.recoveryCodeHash = recoveryHash;
    settings.recoveryCodeCreatedAt = new Date().toISOString().slice(0, 10);
  }

  const api = {
    hashSecret,
    generateRecoveryCode,
    normalizeRecoveryCode,
    formatRecoveryCode,
    isValidRecoveryCode,
    verifyRecoveryCode,
    isValidPin,
    isWeakPin,
    securityIsEnabled,
    getAdminOperator,
    buildRecoveryCodeFile,
    copyRecoveryCode,
    downloadRecoveryCode,
    verifyAdminPin,
    promptTypeConfirmModal,
    pinOrRecoveryModal,
    verifyDestructiveGate,
    setupAdminSecurity,
  };

  Object.assign(global, api);
  global.KhaytAppSecurity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
