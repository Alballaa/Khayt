/**
 * Settings tab: form load/save, integrations, ZATCA, LAN API, BNPL, backups.
 */
(function (global) {
// Bed Ready swaps decorative emoji for its bespoke drafting glyphs; Khayt keeps the emoji.
const _sBdr = (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset.app === 'bedready');
function _sIco(name, emoji, size) { return (_sBdr && window.BedReadyIcons) ? `<span class="br-ico">${window.BedReadyIcons.get(name, size || 15)}</span>` : emoji; }
function _sIcoL(name, emoji, size) { return (_sBdr && window.BedReadyIcons) ? `<span class="br-ico">${window.BedReadyIcons.get(name, size || 15)}</span>` : emoji + ' '; }
function renderLocationsSettings() {
  const el = $('#locationsSettingsSection');
  if (!el) return;
  ensureDefaultLocation();
  el.innerHTML = locations.map(loc => `
    <div class="machine-row">
      <span class="machine-name">${escapeHtml(loc.name)}</span>
      ${loc.address ? `<span style="font-size:12px;color:var(--text-muted);margin-inline-start:8px;">${escapeHtml(loc.address)}</span>` : ''}
      <button class="btn small" data-act="edit-loc" data-id="${loc.id}">${escapeHtml(t('common.edit'))}</button>
      ${locations.length > 1 ? `<button class="btn danger small" data-act="del-loc" data-id="${loc.id}">${escapeHtml(t('common.delete'))}</button>` : ''}
    </div>`).join('');
}

function renderEmailNotificationSettings() {
  const el = $('#emailNotificationsSection');
  if (!el) return;
  const cfg = settings.emailConfig || {};
  const triggers = [
    { key: 'printing',         label: 'Printing started' },
    { key: 'post',             label: 'In post-processing' },
    { key: 'completed',        label: 'Ready for pickup' },
    { key: 'quote',            label: 'Quote created' },
    { key: 'payment_received', label: 'Payment received' },
  ];
  el.innerHTML = `
    <div style="margin-bottom:12px;">
      <label style="margin-top:0;">${escapeHtml(t('set.email_provider'))}</label>
      <select id="emailProviderSel" style="font-size:12.5px;">
        <option value="none"${cfg.provider === 'none' || !cfg.provider ? ' selected' : ''}>${escapeHtml(t('set.smtp_none'))}</option>
        <option value="sendgrid"${cfg.provider === 'sendgrid' ? ' selected' : ''}>${escapeHtml(t('set.smtp_sendgrid'))}</option>
        <option value="mailgun"${cfg.provider === 'mailgun' ? ' selected' : ''}>${escapeHtml(t('set.smtp_mailgun'))}</option>
        <option value="custom"${cfg.provider === 'custom' ? ' selected' : ''}>${escapeHtml(t('set.smtp_custom'))}</option>
        <option value="mailto"${cfg.provider === 'mailto' ? ' selected' : ''}>${escapeHtml(t('set.smtp_mailto'))}</option>
      </select>
    </div>
    <div id="emailProviderFields" style="${cfg.provider && cfg.provider !== 'none' && cfg.provider !== 'mailto' ? '' : 'display:none;'}">
      <div id="emailApiFields" style="${cfg.provider === 'custom' ? 'display:none;' : ''}">
      <div class="inline-pair">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('set.email_api_key'))}</label>
          <input type="text" id="emailApiKey" value="${escapeHtml(cfg.apiKey || '')}" placeholder="sk-..." style="font-size:12.5px;">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('set.email_domain'))} (Mailgun)</label>
          <input type="text" id="emailDomain" value="${escapeHtml(cfg.domain || '')}" placeholder="mg.yourshop.com" style="font-size:12.5px;">
        </div>
      </div>
      </div>
      <div id="emailCustomSmtpFields" style="${cfg.provider === 'custom' ? '' : 'display:none;'}">
        <div class="inline-pair">
          <div>
            <label style="margin-top:0;">${escapeHtml(t('set.smtp_host'))}</label>
            <input type="text" id="emailSmtpHost" value="${escapeHtml(cfg.smtpHost || '')}" placeholder="smtp.yourshop.com" style="font-size:12.5px;">
          </div>
          <div>
            <label style="margin-top:0;">${escapeHtml(t('set.smtp_port'))}</label>
            <input type="number" id="emailSmtpPort" value="${cfg.smtpPort || 587}" min="1" max="65535" style="font-size:12.5px;">
          </div>
        </div>
        <div class="inline-pair">
          <div>
            <label style="margin-top:0;">${escapeHtml(t('set.smtp_user'))}</label>
            <input type="text" id="emailSmtpUser" value="${escapeHtml(cfg.smtpUser || '')}" placeholder="orders@yourshop.com" style="font-size:12.5px;">
          </div>
          <div>
            <label style="margin-top:0;">${escapeHtml(t('set.smtp_pass'))}</label>
            <input type="password" id="emailSmtpPass" value="${escapeHtml(cfg.smtpPassword || '')}" placeholder="••••••••" style="font-size:12.5px;">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;font-weight:400;">
          <input type="checkbox" id="emailSmtpSecure" style="width:auto;margin:0;" ${cfg.smtpSecure ? 'checked' : ''}>
          <span>${escapeHtml(t('set.smtp_secure'))}</span>
        </label>
      </div>
      <div class="inline-pair">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('set.email_from'))}</label>
          <input type="email" id="emailFrom" value="${escapeHtml(cfg.fromEmail || '')}" placeholder="orders@yourshop.com" style="font-size:12.5px;">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('set.email_from_name'))}</label>
          <input type="text" id="emailFromName" value="${escapeHtml(cfg.fromName || '')}" placeholder="${escapeHtml(settings.bizEn || 'Khayt')}" style="font-size:12.5px;">
        </div>
      </div>
    </div>
    <div style="margin-top:10px;">
      <label style="margin-top:0;font-size:12.5px;font-weight:600;">${escapeHtml(t('set.email_triggers'))}</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
        ${triggers.map(tr => `
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;">
            <input type="checkbox" class="email-trigger-cb" data-trigger="${escapeHtml(tr.key)}" style="width:auto;margin:0;" ${(cfg.triggers || []).includes(tr.key) ? 'checked' : ''}>
            <span>${escapeHtml(tr.label)}</span>
          </label>`).join('')}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
      <button id="btnSaveEmailCfg" class="btn small primary">${escapeHtml(t('common.save'))}</button>
      <button id="btnTestEmail" class="btn small">${escapeHtml(t('set.email_test'))}</button>
      <span id="emailTestResult" style="font-size:12px;color:var(--text-muted);"></span>
    </div>`;

  el.querySelector('#emailProviderSel')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const fields = el.querySelector('#emailProviderFields');
    const apiFields = el.querySelector('#emailApiFields');
    const customFields = el.querySelector('#emailCustomSmtpFields');
    if (fields) fields.style.display = (val !== 'none' && val !== 'mailto') ? '' : 'none';
    if (apiFields) apiFields.style.display = val === 'custom' ? 'none' : '';
    if (customFields) customFields.style.display = val === 'custom' ? '' : 'none';
  });

  el.querySelector('#btnSaveEmailCfg')?.addEventListener('click', () => {
    settings.emailConfig = {
      provider:   el.querySelector('#emailProviderSel').value,
      apiKey:     secretInputSave((settings.emailConfig || {}).apiKey, el.querySelector('#emailApiKey')?.value),
      domain:     el.querySelector('#emailDomain')?.value.trim() || '',
      smtpHost:   el.querySelector('#emailSmtpHost')?.value.trim() || '',
      smtpPort:   parseInt(el.querySelector('#emailSmtpPort')?.value, 10) || 587,
      smtpUser:   el.querySelector('#emailSmtpUser')?.value.trim() || '',
      smtpPassword: secretInputSave((settings.emailConfig || {}).smtpPassword, el.querySelector('#emailSmtpPass')?.value),
      smtpSecure: !!el.querySelector('#emailSmtpSecure')?.checked,
      fromEmail:  el.querySelector('#emailFrom')?.value.trim() || '',
      fromName:   el.querySelector('#emailFromName')?.value.trim() || '',
      triggers:   [...el.querySelectorAll('.email-trigger-cb:checked')].map(cb => cb.dataset.trigger),
    };
    saveAll();
    toast(t('common.save'), 'success');
  });

  el.querySelector('#btnTestEmail')?.addEventListener('click', async () => {
    const resEl = el.querySelector('#emailTestResult');
    if (resEl) resEl.textContent = '…';
    const to = settings.email || '';
    if (!to) { if (resEl) { resEl.textContent = 'No shop email set in Settings.'; } return; }
    const cfg2 = {
      provider:  el.querySelector('#emailProviderSel').value,
      apiKey:    secretInputSave((settings.emailConfig || {}).apiKey, el.querySelector('#emailApiKey')?.value),
      domain:    el.querySelector('#emailDomain')?.value.trim() || '',
      smtpHost:  el.querySelector('#emailSmtpHost')?.value.trim() || '',
      smtpPort:  parseInt(el.querySelector('#emailSmtpPort')?.value, 10) || 587,
      smtpUser:  el.querySelector('#emailSmtpUser')?.value.trim() || '',
      smtpPassword: secretInputSave((settings.emailConfig || {}).smtpPassword, el.querySelector('#emailSmtpPass')?.value),
      smtpSecure: !!el.querySelector('#emailSmtpSecure')?.checked,
      fromEmail: el.querySelector('#emailFrom')?.value.trim() || '',
      fromName:  el.querySelector('#emailFromName')?.value.trim() || '',
    };
    const result = await window.hubAPI?.sendEmail?.({
      to, subject: 'Khayt — Test email', body: '<p>Test email from Khayt. Email notifications are working.</p>', smtpConfig: cfg2
    });
    if (resEl) {
      if (result?.ok) { resEl.textContent = t('set.email_test_sent'); resEl.style.color = 'var(--success)'; }
      else if (result?.fallback) { resEl.textContent = 'mailto: fallback (no API configured)'; resEl.style.color = 'var(--text-muted)'; }
      else { resEl.textContent = 'Failed: ' + (result?.error || result?.status || ''); resEl.style.color = 'var(--danger)'; }
    }
  });
}

/** Storefronts & payments directory for the owner's market (+ a country switcher),
 *  with payment providers the owner can enable + give their own pay link. */
function renderIntegrationsSettings() {
  const el = $('#integrationsSection');
  if (!el || typeof KhaytIntegrations === 'undefined') return;
  if (!settings.paymentProviders) settings.paymentProviders = {};
  const lang = (typeof i18n !== 'undefined' && i18n.current) || 'en';
  const viewLoc = el.dataset.market || lang;
  const m = KhaytIntegrations.forLocale(viewLoc);
  const country = (l) => (m.country[l] || m.country.en);
  const markets = Object.keys(KhaytIntegrations.MARKETS);
  const dirLabel = (d) => d === 'in' ? (t('integ.import') || 'Import orders') : (t('integ.publish') || 'Publish catalog');

  const cloud = settings.cloud || {};
  const cloudReady = !!(cloud.enabled && cloud.url && cloud.shopId);
  const cloudBase = String(cloud.url || '').replace(/\/+$/, '');
  const importUrl = (pid) => `${cloudBase}/v1/shops/${cloud.shopId}/import/${pid}`;
  const feedUrl = (pid) => `${cloudBase}/v1/shops/${cloud.shopId}/feed/${pid}`;
  const pill = (label) => `<span style="font-size:10px;color:var(--text-muted);border:1px solid var(--border-soft);border-radius:999px;padding:1px 7px;">${escapeHtml(label)}</span>`;
  const linkBtn = (url, label) => `<button class="btn small ghost integCopy" type="button" data-url="${escapeHtml(url)}">${escapeHtml(label)}</button>`;
  const storefrontRows = m.storefronts.map((sf) => {
    const actions = [];
    if (sf.dir.includes('in')) actions.push(cloudReady ? linkBtn(importUrl(sf.id), t('integ.copy_import') || 'Copy import link') : pill(t('integ.connect_cloud') || 'connect cloud'));
    if (sf.dir.includes('out')) actions.push(cloudReady ? linkBtn(feedUrl(sf.id), t('integ.copy_feed') || 'Copy feed link') : pill(t('integ.connect_cloud') || 'connect cloud'));
    if (!actions.length) actions.push(pill(t('integ.soon') || 'soon'));
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-soft);flex-wrap:wrap;">
      <span style="flex:1;font-size:13px;font-weight:600;">${escapeHtml(sf.name)}</span>
      <span style="font-size:10.5px;color:var(--text-muted);">${sf.dir.map(dirLabel).map(escapeHtml).join(' · ')}</span>
      ${actions.join('')}
    </div>`;
  }).join('');

  const payRows = m.payments.map((p) => {
    const cfg = settings.paymentProviders[p.id] || {};
    return `<div style="padding:7px 0;border-bottom:1px solid var(--border-soft);">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
        <input type="checkbox" class="payEnable" data-pid="${escapeHtml(p.id)}" style="width:auto;margin:0;" ${cfg.enabled ? 'checked' : ''}>
        <span style="font-weight:600;flex:1;">${escapeHtml(p.name)}</span>
      </label>
      <input class="payLink" data-pid="${escapeHtml(p.id)}" type="url" placeholder="${escapeHtml(t('integ.pay_link_ph') || 'your payment link (optional) — use {amount}')}"
        value="${escapeHtml(cfg.payLink || '')}" style="font-size:12px;margin-top:5px;${cfg.enabled ? '' : 'opacity:.5;'}">
    </div>`;
  }).join('');

  el.innerHTML = `
    <label style="margin-top:0;">${escapeHtml(t('integ.market') || 'Market')}</label>
    <select id="integMarket" style="font-size:12.5px;">
      ${markets.map((loc) => `<option value="${loc}"${loc === viewLoc ? ' selected' : ''}>${escapeHtml(KhaytIntegrations.forLocale(loc).country[lang] || KhaytIntegrations.forLocale(loc).country.en)}</option>`).join('')}
    </select>
    <div style="margin-top:14px;font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(t('integ.storefronts') || 'Storefronts')} — ${escapeHtml(country(lang))}</div>
    ${cloudReady
      ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;line-height:1.5;"><strong>${escapeHtml(t('integ.import') || 'Import orders')}:</strong> ${escapeHtml(t('integ.import_help') || 'paste the import link as an order webhook in your store — new orders arrive in Order requests.')}<br><strong>${escapeHtml(t('integ.publish') || 'Publish catalog')}:</strong> ${escapeHtml(t('integ.feed_help') || 'add the feed link as a product import URL in your store — it mirrors your published storefront catalog.')}</div>`
      : `<div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;line-height:1.5;">${escapeHtml(t('integ.cloud_hint') || 'Connect cloud sync (Settings → Cloud) to get import & feed links for these storefronts.')}</div>`}
    <div style="margin-top:4px;">${storefrontRows}</div>
    <div style="margin-top:16px;font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(t('integ.payments') || 'Payment systems')}</div>
    <div style="margin-top:4px;">${payRows}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:12px;">
      <button id="btnSavePayProviders" class="btn small primary">${escapeHtml(t('common.save'))}</button>
      <span id="integResult" style="font-size:12px;color:var(--text-muted);"></span>
    </div>`;

  el.querySelector('#integMarket')?.addEventListener('change', (e) => { el.dataset.market = e.target.value; renderIntegrationsSettings(); });
  el.querySelectorAll('.integCopy').forEach((btn) => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(btn.dataset.url || ''); } catch (_) { /* ignore */ }
    const isFeed = /\/feed\//.test(btn.dataset.url || '');
    const msg = isFeed
      ? (t('integ.feed_copied') || 'Feed link copied — add it as a product import URL in your store')
      : (t('integ.import_copied') || 'Import link copied — paste it as a webhook in your store');
    const r = el.querySelector('#integResult');
    if (r) { r.textContent = '✓ ' + msg; r.style.color = 'var(--success)'; }
  }));
  el.querySelectorAll('.payEnable').forEach((cb) => cb.addEventListener('change', () => {
    const link = el.querySelector(`.payLink[data-pid="${cb.dataset.pid}"]`); if (link) link.style.opacity = cb.checked ? '1' : '.5';
  }));
  el.querySelector('#btnSavePayProviders')?.addEventListener('click', () => {
    const pp = { ...(settings.paymentProviders || {}) };
    el.querySelectorAll('.payEnable').forEach((cb) => {
      const id = cb.dataset.pid;
      const link = (el.querySelector(`.payLink[data-pid="${id}"]`)?.value || '').trim();
      pp[id] = { enabled: cb.checked, payLink: /^https?:\/\//i.test(link) ? link : '' };
    });
    settings.paymentProviders = pp;
    saveAll();
    const r = el.querySelector('#integResult'); if (r) { r.textContent = '✓ ' + (t('common.save') || 'Saved'); r.style.color = 'var(--success)'; }
  });
}

/** Accounting sync (one-way webhook push) provider config. */
function renderAccountingSyncSettings() {
  const el = $('#accountingSyncSection');
  if (!el) return;
  const cfg = settings.accountingSync || {};
  const v = (x) => escapeHtml(x || '');
  const fmt = cfg.format || 'generic';
  const fmtOpt = (val, label) => `<option value="${val}"${fmt === val ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:0;">
      <input type="checkbox" id="acctEnabled" style="width:auto;margin:0;" ${cfg.enabled ? 'checked' : ''}>
      <span>${escapeHtml(t('acct.enable') || 'Enable accounting sync')}</span>
    </label>
    <div class="inline-pair" style="margin-top:10px;">
      <div>
        <label style="margin-top:0;">${escapeHtml(t('acct.format') || 'Format')}</label>
        <select id="acctFormat" style="font-size:12.5px;">
          ${fmtOpt('generic', t('acct.fmt_generic') || 'Generic')}${fmtOpt('quickbooks', 'QuickBooks')}${fmtOpt('xero', 'Xero')}${fmtOpt('zoho', 'Zoho Books')}
        </select>
      </div>
      <div>
        <label style="margin-top:0;">${escapeHtml(t('acct.secret') || 'Shared secret (optional)')}</label>
        <input type="password" id="acctSecret" value="${v(cfg.secret)}" placeholder="••••••••" style="font-size:12.5px;">
      </div>
    </div>
    <label style="margin-top:8px;">${escapeHtml(t('acct.url') || 'Webhook URL')}</label>
    <input type="url" id="acctUrl" value="${v(cfg.webhookUrl)}" placeholder="https://hooks…/khayt" style="font-size:12.5px;">
    <label style="display:flex;align-items:center;gap:8px;margin-top:10px;cursor:pointer;">
      <input type="checkbox" id="acctPushOnPaid" style="width:auto;margin:0;" ${cfg.pushOnPaid !== false ? 'checked' : ''}>
      <span>${escapeHtml(t('acct.push_on_paid') || 'Push automatically when an invoice is marked paid')}</span>
    </label>
    <div style="display:flex;align-items:center;gap:8px;margin-top:12px;">
      <button id="btnSaveAcct" class="btn small primary">${escapeHtml(t('common.save'))}</button>
      <button id="btnTestAcct" class="btn small">${escapeHtml(t('acct.test') || 'Send test')}</button>
      <span id="acctTestResult" style="font-size:12px;color:var(--text-muted);"></span>
    </div>`;

  const collect = () => ({
    enabled: el.querySelector('#acctEnabled').checked,
    format: el.querySelector('#acctFormat').value,
    webhookUrl: el.querySelector('#acctUrl').value.trim(),
    secret: secretInputSave((settings.accountingSync || {}).secret, el.querySelector('#acctSecret').value),
    pushOnPaid: el.querySelector('#acctPushOnPaid').checked,
  });
  el.querySelector('#btnSaveAcct')?.addEventListener('click', () => {
    settings.accountingSync = collect(); saveAll(); toast(t('common.save'), 'success');
  });
  el.querySelector('#btnTestAcct')?.addEventListener('click', async () => {
    const res = el.querySelector('#acctTestResult');
    settings.accountingSync = collect(); saveAll();
    if (!/^https?:\/\//i.test(settings.accountingSync.webhookUrl)) { res.textContent = t('acct.need_url') || 'Enter a webhook URL first.'; res.style.color = 'var(--danger)'; return; }
    res.textContent = '…';
    const payload = { type: 'test', format: settings.accountingSync.format, idempotencyKey: 'test:' + Date.now(), note: 'Khayt accounting sync test' };
    const r = await window.hubAPI?.accountingPush?.({ url: settings.accountingSync.webhookUrl, secret: settings.accountingSync.secret, payload });
    if (r?.ok) { res.textContent = '✓ ' + (t('acct.test_sent') || 'Sent'); res.style.color = 'var(--success)'; }
    else { res.textContent = '✗ ' + (r?.error || r?.status || 'failed'); res.style.color = 'var(--danger)'; }
  });
}

/** SMS / WhatsApp notification provider config (mirrors the email section). */
function renderSmsNotificationSettings() {
  const el = $('#smsNotificationsSection');
  if (!el) return;
  const cfg = settings.smsConfig || {};
  const prov = cfg.provider || 'none';
  const v = (x) => escapeHtml(x || '');
  const opt = (val, label) => `<option value="${val}"${prov === val ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  el.innerHTML = `
    <div class="inline-pair">
      <div>
        <label style="margin-top:0;">${escapeHtml(t('sms.provider') || 'Provider')}</label>
        <select id="smsProvider" style="font-size:12.5px;">
          ${opt('none', t('sms.none') || 'Off')}
          ${opt('twilio', 'Twilio (SMS + WhatsApp)')}
          ${opt('whatsapp_cloud', 'WhatsApp Cloud API')}
          ${opt('unifonic', 'Unifonic (SMS)')}
          ${opt('webhook', t('sms.webhook') || 'Custom webhook')}
        </select>
      </div>
      <div>
        <label style="margin-top:0;">${escapeHtml(t('sms.channel') || 'Channel')}</label>
        <select id="smsChannel" style="font-size:12.5px;">
          <option value="whatsapp"${(cfg.channel || 'whatsapp') === 'whatsapp' ? ' selected' : ''}>WhatsApp</option>
          <option value="sms"${cfg.channel === 'sms' ? ' selected' : ''}>SMS</option>
        </select>
      </div>
    </div>
    <div id="smsProviderFields" style="${prov !== 'none' ? '' : 'display:none;'}margin-top:8px;">
      <div data-prov="twilio" style="${prov === 'twilio' ? '' : 'display:none;'}">
        <div class="inline-pair">
          <div><label style="margin-top:0;">Account SID</label><input id="smsTwSid" value="${v(cfg.accountSid)}" placeholder="AC…" style="font-size:12.5px;"></div>
          <div><label style="margin-top:0;">Auth Token</label><input id="smsTwToken" type="password" value="${v(cfg.authToken)}" placeholder="••••••••" style="font-size:12.5px;"></div>
        </div>
        <label style="margin-top:8px;">${escapeHtml(t('sms.from') || 'From number')}</label>
        <input id="smsTwFrom" value="${v(cfg.from)}" placeholder="+1 555…" style="font-size:12.5px;">
      </div>
      <div data-prov="whatsapp_cloud" style="${prov === 'whatsapp_cloud' ? '' : 'display:none;'}">
        <div class="inline-pair">
          <div><label style="margin-top:0;">Phone Number ID</label><input id="smsWaId" value="${v(cfg.phoneNumberId)}" placeholder="1234567890" style="font-size:12.5px;"></div>
          <div><label style="margin-top:0;">Access Token</label><input id="smsWaToken" type="password" value="${v(cfg.token)}" placeholder="EAA…" style="font-size:12.5px;"></div>
        </div>
      </div>
      <div data-prov="unifonic" style="${prov === 'unifonic' ? '' : 'display:none;'}">
        <div class="inline-pair">
          <div><label style="margin-top:0;">AppSid</label><input id="smsUnSid" type="password" value="${v(cfg.appSid)}" placeholder="••••••••" style="font-size:12.5px;"></div>
          <div><label style="margin-top:0;">${escapeHtml(t('sms.sender') || 'Sender ID')}</label><input id="smsUnSender" value="${v(cfg.senderId)}" placeholder="Acme" style="font-size:12.5px;"></div>
        </div>
      </div>
      <div data-prov="webhook" style="${prov === 'webhook' ? '' : 'display:none;'}">
        <label style="margin-top:0;">${escapeHtml(t('sms.url') || 'Webhook URL')}</label>
        <input id="smsHookUrl" value="${v(cfg.url)}" placeholder="https://…" style="font-size:12.5px;">
        <label style="margin-top:8px;">${escapeHtml(t('sms.secret') || 'Shared secret (optional)')}</label>
        <input id="smsHookSecret" type="password" value="${v(cfg.secret)}" placeholder="••••••••" style="font-size:12.5px;">
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:12px;">
      <button id="btnSaveSmsCfg" class="btn small primary">${escapeHtml(t('common.save'))}</button>
      <button id="btnTestSms" class="btn small">${escapeHtml(t('sms.test') || 'Send test')}</button>
      <span id="smsTestResult" style="font-size:12px;color:var(--text-muted);"></span>
    </div>`;

  const refreshProvFields = () => {
    const p = el.querySelector('#smsProvider').value;
    el.querySelector('#smsProviderFields').style.display = p !== 'none' ? '' : 'none';
    el.querySelectorAll('#smsProviderFields [data-prov]').forEach((d) => { d.style.display = d.dataset.prov === p ? '' : 'none'; });
  };
  el.querySelector('#smsProvider')?.addEventListener('change', refreshProvFields);

  const collect = () => ({
    provider:     el.querySelector('#smsProvider').value,
    channel:      el.querySelector('#smsChannel').value,
    accountSid:   el.querySelector('#smsTwSid')?.value.trim() || '',
    authToken:    secretInputSave((settings.smsConfig || {}).authToken, el.querySelector('#smsTwToken')?.value),
    from:         el.querySelector('#smsTwFrom')?.value.trim() || '',
    phoneNumberId: el.querySelector('#smsWaId')?.value.trim() || '',
    token:        secretInputSave((settings.smsConfig || {}).token, el.querySelector('#smsWaToken')?.value),
    appSid:       secretInputSave((settings.smsConfig || {}).appSid, el.querySelector('#smsUnSid')?.value),
    senderId:     el.querySelector('#smsUnSender')?.value.trim() || '',
    url:          el.querySelector('#smsHookUrl')?.value.trim() || '',
    secret:       secretInputSave((settings.smsConfig || {}).secret, el.querySelector('#smsHookSecret')?.value),
  });

  el.querySelector('#btnSaveSmsCfg')?.addEventListener('click', () => {
    settings.smsConfig = collect();
    saveAll();
    toast(t('common.save'), 'success');
  });

  el.querySelector('#btnTestSms')?.addEventListener('click', async () => {
    const res = el.querySelector('#smsTestResult');
    const to = (settings.phone || '').trim();
    if (!to) { res.textContent = t('sms.need_phone') || 'Set your shop phone in Settings to test.'; res.style.color = 'var(--danger)'; return; }
    res.textContent = '…';
    settings.smsConfig = collect(); saveAll();
    const r = await window.hubAPI?.sendSms?.({ to, message: 'Khayt test message — notifications are working.', channel: settings.smsConfig.channel, smsConfig: settings.smsConfig });
    if (r?.ok) { res.textContent = '✓ ' + (t('sms.test_sent') || 'Sent'); res.style.color = 'var(--success)'; }
    else { res.textContent = '✗ ' + (r?.error || r?.status || 'failed'); res.style.color = 'var(--danger)'; }
  });
}

/* ============================================================
   Feature I: Email Digest Scheduler
   ============================================================ */

function buildDigestEmailHtml() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const freq = settings.emailDigest?.frequency || 'daily';
  const freqLabel = freq === 'weekly' ? 'Weekly' : (freq === 'monthly' ? 'Monthly' : 'Daily');

  // Compute period bounds
  let periodLabel, periodFrom, periodTo;
  if (freq === 'weekly') {
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    periodLabel = `Week ${weekNum}, ${now.getFullYear()}`;
    // Start of week (Monday)
    const dayOfWeek = now.getDay(); // 0=Sun
    const diffToMon = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek;
    periodFrom = new Date(now);
    periodFrom.setDate(now.getDate() + diffToMon);
    periodFrom.setHours(0, 0, 0, 0);
    periodTo = new Date(now);
  } else if (freq === 'monthly') {
    periodLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    periodFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    periodTo = new Date(now);
  } else {
    periodLabel = todayStr;
    periodFrom = new Date(now);
    periodFrom.setHours(0, 0, 0, 0);
    periodTo = new Date(now);
  }

  const fromIso = periodFrom.toISOString();
  const toIso = periodTo.toISOString();

  // Stats
  const completedThisPeriod = printLog.filter(o =>
    o.status === 'completed' &&
    o.completedAt && o.completedAt >= fromIso && o.completedAt <= toIso
  );
  const revenueThisPeriod = completedThisPeriod.reduce((s, o) => s + orderRevenueBase(o), 0);
  const outstanding = printLog
    .filter(o => o.status === 'completed' && payStatus(o) !== 'paid')
    .reduce((s, o) => s + orderOwedBase(o), 0);

  // Low-stock spools
  const reorderPt = settings.lowStockThreshold ?? 200;
  const lowStockSpools = inventory
    .filter(s => (+s.weight || 0) < (s.reorderPoint ?? reorderPt))
    .slice(0, 5);

  const waitingCount = waitingList.length;
  const shopName = escapeHtml(settings.bizEn || settings.bizAr || 'Khayt');
  const currency = escapeHtml(settings.currency || 'SAR');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${shopName} Digest</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    <div style="background:#6c47ff;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;">${shopName}</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px;">${freqLabel} Digest · ${escapeHtml(periodLabel)}</p>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
        <thead><tr style="border-bottom:2px solid #eee;">
          <th style="text-align:left;padding:8px 0;color:#888;">Metric</th>
          <th style="text-align:right;padding:8px 0;color:#888;">Value</th>
        </tr></thead>
        <tbody>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 0;">Completed orders this period</td>
            <td style="text-align:right;font-weight:600;">${completedThisPeriod.length}</td>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 0;">Revenue this period</td>
            <td style="text-align:right;font-weight:600;color:#22c55e;">${revenueThisPeriod.toFixed(2)} ${currency}</td>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 0;">Outstanding receivables</td>
            <td style="text-align:right;font-weight:600;color:${outstanding > 0 ? '#f59e0b' : '#888'};">${outstanding.toFixed(2)} ${currency}</td>
          </tr>
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 0;">Low-stock spools</td>
            <td style="text-align:right;font-weight:600;color:${lowStockSpools.length > 0 ? '#ef4444' : '#888'};">${lowStockSpools.length}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;">Waiting list items</td>
            <td style="text-align:right;font-weight:600;">${waitingCount}</td>
          </tr>
        </tbody>
      </table>
      ${lowStockSpools.length > 0 ? `
      <div style="background:#fff5f5;border-left:3px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:20px;">
        <div style="font-weight:600;font-size:13px;color:#ef4444;margin-bottom:8px;">Low Stock Alert</div>
        <ul style="margin:0;padding:0 0 0 16px;font-size:13px;color:#333;">
          ${lowStockSpools.map(s => `<li style="margin-bottom:4px;">${escapeHtml(s.material || s.brand || 'Spool')} — ${+s.weight || 0}g remaining (reorder at ${s.reorderPoint ?? reorderPt}g)</li>`).join('')}
        </ul>
      </div>` : ''}
    </div>
    <div style="padding:16px 32px;background:#f8f8fb;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;">
      Sent by Khayt · ${escapeHtml(todayStr)}
    </div>
  </div>
</body>
</html>`;
}

function renderAiSettings() {
  const el = $('#aiSettingsSection');
  if (!el) return;
  const ai = settings.ai || {};
  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:0;">
      <input type="checkbox" id="aiEnabled" style="width:auto;margin:0;" ${ai.enabled ? 'checked' : ''}>
      <span style="font-weight:600;font-size:13px;">${escapeHtml(t('calc.ai_quote') || 'AI quote')}</span>
    </label>
    <label style="margin-top:10px;">${escapeHtml(t('calc.ai_key') || 'Anthropic API key')}</label>
    <input type="password" id="aiKeySetting" value="${escapeHtml(secretInputValue(ai.apiKey))}" placeholder="sk-ant-...">
    <label style="margin-top:10px;">${escapeHtml(t('set.ai_model') || 'Model')}</label>
    <input type="text" id="aiModelSetting" value="${escapeHtml(ai.model || 'claude-opus-4-8')}" placeholder="claude-opus-4-8">
    <div style="display:flex;gap:8px;align-items:center;margin-top:10px;">
      <button id="btnSaveAiSettings" class="btn primary small">${escapeHtml(t('common.save') || 'Save')}</button>
      <button id="btnTestAiSettings" class="btn small">🔌 ${escapeHtml(t('calc.ai_test') || 'Test connection')}</button>
      <span id="aiSettingsTestResult" style="font-size:12px;"></span>
    </div>`;

  el.querySelector('#btnSaveAiSettings')?.addEventListener('click', () => {
    settings.ai = {
      enabled: el.querySelector('#aiEnabled').checked,
      model: el.querySelector('#aiModelSetting').value.trim() || 'claude-opus-4-8',
      apiKey: secretInputSave(ai.apiKey, el.querySelector('#aiKeySetting').value.trim()),
    };
    saveAll();
    toast(t('common.save') || 'Saved', 'success');
  });

  el.querySelector('#btnTestAiSettings')?.addEventListener('click', async () => {
    const res = el.querySelector('#aiSettingsTestResult');
    const typed = el.querySelector('#aiKeySetting').value.trim();
    const key = typed || settings.ai?.apiKey || ai.apiKey || '';
    if (!key) { res.textContent = '✗ ' + (t('calc.ai_need_key') || 'Enter an API key'); res.style.color = 'var(--danger)'; return; }
    res.textContent = t('calc.ai_testing') || 'Testing…'; res.style.color = 'var(--text-muted)';
    try {
      const r = await window.hubAPI.aiExtract({
        apiKey: key,
        model: el.querySelector('#aiModelSetting').value.trim() || 'claude-opus-4-8',
        system: (typeof KhaytAiQuote !== 'undefined') ? KhaytAiQuote.buildSystemContext(inventory) : '',
        request: 'Estimate: one small 20mm PLA calibration cube.',
        schema: (typeof KhaytAiQuote !== 'undefined') ? KhaytAiQuote.EXTRACTION_SCHEMA : {},
      });
      if (r && r.ok && r.draft) { res.textContent = '✓ ' + (t('calc.ai_test_ok') || 'Connection works'); res.style.color = 'var(--success)'; }
      else { res.textContent = '✗ ' + ((r && r.error) || 'failed'); res.style.color = 'var(--danger)'; }
    } catch (e) { res.textContent = '✗ ' + (e.message || e); res.style.color = 'var(--danger)'; }
  });
}

// Mirror the default slicer into the legacy settings.slicer so slice-and-print /
// kanban-print / quote-slice consumers keep working with no change.
function syncDefaultSlicer() {
  const d = KhaytSlicers.defaultSlicer(settings);
  settings.slicer = d ? { path: d.path, args: d.args || '' } : { path: '', args: '' };
}

// Scan the machine for installed slicers and add any that aren't already listed
// (matched by executable path). Returns the number newly added.
async function detectAndMergeSlicers() {
  if (!window.hubAPI?.detectSlicers) return 0;
  let r;
  try { r = await window.hubAPI.detectSlicers(); } catch (_) { return 0; }
  if (!r || !r.ok || !Array.isArray(r.slicers)) return 0;
  if (!Array.isArray(settings.slicers)) settings.slicers = [];
  const have = new Set(settings.slicers.map((s) => String(s.path || '').toLowerCase()));
  let added = 0;
  for (const found of r.slicers) {
    const key = String(found.path || '').toLowerCase();
    if (!key || have.has(key)) continue;
    have.add(key);
    const entry = { id: uid('SL'), name: found.name || KhaytSlicers.slicerDisplayName(found.path) || 'Slicer', path: found.path, args: '' };
    settings.slicers.push(entry);
    if (!settings.defaultSlicerId) settings.defaultSlicerId = entry.id;
    added++;
  }
  if (added > 0) { syncDefaultSlicer(); saveAll(); }
  return added;
}

function renderSlicerSettings() {
  const el = $('#slicerSettingsSection');
  if (!el) return;
  // One-time migration from the legacy single slicer to the slicers[] array.
  if (!Array.isArray(settings.slicers)) {
    settings.slicers = (settings.slicer && settings.slicer.path)
      ? [{ id: uid('SL'), name: KhaytSlicers.slicerDisplayName(settings.slicer.path) || 'Slicer', path: settings.slicer.path, args: settings.slicer.args || '' }]
      : [];
    if (settings.slicers.length && !settings.defaultSlicerId) settings.defaultSlicerId = settings.slicers[0].id;
    saveAll();
  }
  // First time here with nothing configured: offer every slicer on the machine
  // automatically (the user can still remove any they don't want).
  if (!settings.slicersAutoDetected && !settings.slicers.length) {
    settings.slicersAutoDetected = true;
    saveAll();
    detectAndMergeSlicers().then((n) => { if (n > 0) renderSlicerSettings(); });
  }

  const list = settings.slicers;
  if (list.length && !list.some((s) => s.id === settings.defaultSlicerId)) settings.defaultSlicerId = list[0].id;
  syncDefaultSlicer(); // keep the legacy settings.slicer mirror consistent with the default

  const PRESETS = {
    prusa: '--export-gcode --load /path/to/config.ini -o {output} {model}',
    orca: '--slice 0 --load-settings "machine.json;process.json" --load-filaments "filament.json" --outputdir {outdir} {model}',
  };

  const rows = list.map((s) => `
    <div class="slicer-row" data-id="${escapeHtml(s.id)}">
      <label class="slicer-default" title="${escapeHtml(t('slicer.set_default') || 'Use as default')}">
        <input type="radio" name="slicerDefault" value="${escapeHtml(s.id)}" ${s.id === settings.defaultSlicerId ? 'checked' : ''} data-act="slicer-default">
      </label>
      <div class="slicer-info">
        <div class="slicer-name">${escapeHtml(s.name || KhaytSlicers.slicerDisplayName(s.path))}${s.id === settings.defaultSlicerId ? ` <span class="slicer-badge">${escapeHtml(t('slicer.default') || 'default')}</span>` : ''}</div>
        <div class="slicer-path" title="${escapeHtml(s.path)}">${escapeHtml(s.path)}</div>
      </div>
      <button class="btn ghost small" type="button" data-act="slicer-test" data-id="${escapeHtml(s.id)}">${_sIcoL('play', '🔌')}${escapeHtml(t('slicer.test') || 'Test')}</button>
      <button class="btn ghost small danger" type="button" data-act="slicer-remove" data-id="${escapeHtml(s.id)}" title="${escapeHtml(t('common.delete') || 'Remove')}">${_sIco('trash', '🗑')}</button>
      <span class="slicer-test-result" data-result="${escapeHtml(s.id)}"></span>
    </div>`).join('');

  el.innerHTML = `
    <p class="slicer-intro" style="font-size:12.5px;color:var(--text-muted);margin:0 0 10px;">${escapeHtml(t('slicer.multi_intro') || 'Add the slicers you use. When you open a print file you can pick which one to launch; the default is used for slice-and-print elsewhere.')}</p>
    <div style="display:flex;gap:8px;align-items:center;margin:0 0 10px;flex-wrap:wrap;">
      <button id="btnDetectSlicers" class="btn small" type="button">${_sIcoL('search', '🔍')}${escapeHtml(t('slicer.detect') || 'Detect installed slicers')}</button>
      <span id="slicerDetectResult" style="font-size:12px;color:var(--text-muted);"></span>
    </div>
    <div class="slicer-list">${list.length ? rows : `<p class="slicer-empty" style="font-size:12.5px;color:var(--text-muted);">${escapeHtml(t('slicer.none') || 'No slicers configured yet.')}</p>`}</div>
    <details class="slicer-add" ${list.length ? '' : 'open'}>
      <summary style="cursor:pointer;font-size:12.5px;font-weight:600;margin-top:12px;">＋ ${escapeHtml(t('slicer.add') || 'Add a slicer')}</summary>
      <div style="margin-top:10px;">
        <label style="margin-top:0;">${escapeHtml(t('slicer.name_label') || 'Name (optional)')}</label>
        <input type="text" id="slicerName" placeholder="PrusaSlicer" style="font-size:12.5px;">
        <label style="margin-top:10px;">${escapeHtml(t('slicer.path_label') || 'Slicer program')}</label>
        <div style="display:flex;gap:8px;">
          <input type="text" id="slicerPath" placeholder="/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer" style="flex:1;font-size:12.5px;">
          <button id="btnSlicerBrowse" class="btn small" type="button">${escapeHtml(t('slicer.browse') || 'Browse…')}</button>
        </div>
        <label style="margin-top:10px;">${escapeHtml(t('slicer.args_label') || 'Slice command (advanced)')}</label>
        <textarea id="slicerArgs" rows="2" style="font-size:12px;font-family:var(--mono,monospace);" placeholder="--export-gcode -o {output} {model}"></textarea>
        <p style="font-size:11.5px;color:var(--text-muted);margin:4px 0 0;">${escapeHtml(t('slicer.args_help') || 'Used for slice-and-print. Leave blank to just open the file in the slicer.')}</p>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
          <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(t('slicer.preset') || 'Preset:')}</span>
          <button class="btn ghost small" type="button" data-slicer-preset="prusa">PrusaSlicer</button>
          <button class="btn ghost small" type="button" data-slicer-preset="orca">OrcaSlicer</button>
          <button id="btnAddSlicer" class="btn primary small" type="button">＋ ${escapeHtml(t('slicer.add') || 'Add slicer')}</button>
          <span id="slicerAddResult" style="font-size:12px;"></span>
        </div>
      </div>
    </details>`;

  el.querySelector('#btnDetectSlicers')?.addEventListener('click', async () => {
    const out = el.querySelector('#slicerDetectResult');
    if (out) { out.textContent = t('slicer.detecting') || 'Scanning for slicers…'; out.style.color = 'var(--text-muted)'; }
    const added = await detectAndMergeSlicers();
    if (out) {
      if (added > 0) { out.textContent = '✓ ' + (t('slicer.detected_n') || 'Added {n} slicer(s)').replace('{n}', added); out.style.color = 'var(--success)'; }
      else { out.textContent = (t('slicer.detected_none') || 'No new slicers found — add one manually below.'); out.style.color = 'var(--text-muted)'; }
    }
    if (added > 0) renderSlicerSettings();
  });

  el.querySelector('#btnSlicerBrowse')?.addEventListener('click', async () => {
    const p = await window.hubAPI?.pickFile?.({ filters: [{ name: 'Slicer program', extensions: ['*', 'exe', 'app', 'AppImage'] }] });
    if (p) {
      el.querySelector('#slicerPath').value = p;
      const nameEl = el.querySelector('#slicerName');
      if (nameEl && !nameEl.value.trim()) nameEl.value = KhaytSlicers.slicerDisplayName(p) || '';
    }
  });
  el.querySelectorAll('[data-slicer-preset]').forEach((b) =>
    b.addEventListener('click', () => { el.querySelector('#slicerArgs').value = PRESETS[b.dataset.slicerPreset] || ''; }));

  el.querySelector('#btnAddSlicer')?.addEventListener('click', () => {
    const path = el.querySelector('#slicerPath').value.trim();
    const res = el.querySelector('#slicerAddResult');
    if (!path) { if (res) { res.textContent = '✗ ' + (t('slicer.path_required') || 'Enter a slicer program path.'); res.style.color = 'var(--danger)'; } return; }
    const name = el.querySelector('#slicerName').value.trim() || KhaytSlicers.slicerDisplayName(path) || 'Slicer';
    const args = el.querySelector('#slicerArgs').value.trim();
    const entry = { id: uid('SL'), name, path, args };
    settings.slicers.push(entry);
    if (settings.slicers.length === 1) settings.defaultSlicerId = entry.id;
    syncDefaultSlicer();
    saveAll();
    renderSlicerSettings();
  });

  // Delegated list actions (default / remove / test).
  el.querySelector('.slicer-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id || (btn.matches('[data-act="slicer-default"]') ? btn.value : null);
    if (btn.dataset.act === 'slicer-default') {
      settings.defaultSlicerId = btn.value;
      syncDefaultSlicer(); saveAll(); renderSlicerSettings();
    } else if (btn.dataset.act === 'slicer-remove') {
      settings.slicers = settings.slicers.filter((s) => s.id !== id);
      if (settings.defaultSlicerId === id) settings.defaultSlicerId = settings.slicers[0] ? settings.slicers[0].id : null;
      syncDefaultSlicer(); saveAll(); renderSlicerSettings();
    } else if (btn.dataset.act === 'slicer-test') {
      const sl = KhaytSlicers.getSlicer(settings, id);
      const out = el.querySelector(`[data-result="${CSS.escape(id)}"]`);
      if (out) { out.textContent = t('slicer.testing') || 'Testing…'; out.style.color = 'var(--text-muted)'; }
      try {
        const r = await window.hubAPI.sliceTest({ slicerPath: sl ? sl.path : '' });
        if (out) {
          if (r && r.ok) { out.textContent = '✓ ' + (t('slicer.test_ok') || 'Slicer works'); out.style.color = 'var(--success)'; }
          else { out.textContent = '✗ ' + (t('slicer.test_fail') || 'Could not run the slicer'); out.style.color = 'var(--danger)'; }
        }
      } catch (err) { if (out) { out.textContent = '✗ ' + (err.message || err); out.style.color = 'var(--danger)'; } }
    }
  });
}

// Team management modal (owner): list members, invite by email+role, remove.
async function openTeamModal() {
  const c = settings.cloud || {};
  if (!c.shopId || !c.token) { toast(t('intake.connect_first'), 'error'); return; }
  let members = [];
  try {
    const r = await window.hubAPI.cloudMembersList({ url: c.url, shopId: c.shopId, token: c.token });
    if (!r.ok) throw new Error(r.error);
    members = r.members || [];
  } catch (e) { toast('✗ ' + e.message, 'error'); return; }
  const roleLabel = (r) => t('role.' + r) || r;
  const rolesOpts = ['manager', 'operator', 'viewer'].map((r) => `<option value="${r}">${escapeHtml(roleLabel(r))}</option>`).join('');
  const rows = members.map((m) => `<div class="card" data-mem="${escapeHtml(m.email)}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:6px;">
      <div><div style="font-size:13px;">${escapeHtml(m.email)}</div><div style="font-size:11px;color:var(--text-muted);">${escapeHtml(roleLabel(m.role))}${m.verified ? '' : ' · ' + escapeHtml(t('team.unverified') || 'unverified')}</div></div>
      ${m.role === 'owner' ? `<span style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('team.owner') || 'owner')}</span>` : `<button class="btn danger small" data-rm="${escapeHtml(m.email)}">${escapeHtml(t('common.remove') || 'Remove')}</button>`}
    </div>`).join('');
  openFormModal({
    title: `👥 ${t('team.title') || 'Team'}`,
    noSave: true,
    bodyHtml: `<div id="teamList">${rows}</div>
      <hr style="border:none;border-top:1px solid var(--border-soft);margin:12px 0;">
      <label>${escapeHtml(t('team.invite_label') || 'Invite a member')}</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input id="invEmail" type="email" placeholder="name@email.com" style="flex:1;min-width:160px;">
        <select id="invRole">${rolesOpts}</select>
        <button id="invBtn" class="btn primary small" type="button">${escapeHtml(t('team.send_invite') || 'Send invite')}</button>
      </div>
      <p style="font-size:11.5px;color:var(--text-muted);margin-top:8px;">${escapeHtml(t('team.invite_hint') || 'They get an emailed code, choose “Join a team” in Khayt, and unlock with the shop’s shared sync passphrase.')}</p>
      <span id="teamResult" style="font-size:12px;"></span>`,
    onMount(modal) {
      modal.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
        const email = b.dataset.rm;
        if (!(await confirmModal((t('team.remove_q') || 'Remove {email} from the team?').replace('{email}', email), { danger: true }))) return;
        const r = await window.hubAPI.cloudMemberRemove({ url: c.url, shopId: c.shopId, token: c.token, email });
        if (r.ok) { modal.querySelector(`[data-mem="${CSS.escape(email)}"]`)?.remove(); toast(t('team.removed') || 'Member removed', 'success'); }
        else toast('✗ ' + (r.error || 'failed'), 'error');
      }));
      modal.querySelector('#invBtn')?.addEventListener('click', async () => {
        const email = modal.querySelector('#invEmail').value.trim();
        const role = modal.querySelector('#invRole').value;
        const res = modal.querySelector('#teamResult');
        if (!email) return;
        res.textContent = t('team.sending') || 'Sending…'; res.style.color = 'var(--text-muted)';
        const r = await window.hubAPI.cloudMemberInvite({ url: c.url, shopId: c.shopId, token: c.token, email, role });
        if (r.ok) { res.textContent = '✓ ' + (t('team.invite_sent') || 'Invite sent'); res.style.color = 'var(--success)'; modal.querySelector('#invEmail').value = ''; }
        else { res.textContent = '✗ ' + (r.error || 'failed'); res.style.color = 'var(--danger)'; }
      });
    },
  });
}

// Storefront modal (owner): publish the product catalog as a public shop page,
// copy the link, or unpublish. Customer orders arrive in "Order requests".
async function openStorefrontModal() {
  const c = settings.cloud || {};
  if (!c.shopId || !c.token) { toast(t('intake.connect_first'), 'error'); return; }
  const baseUrl = String(c.url || '').replace(/\/+$/, '');
  const link = `${baseUrl}/shop/${c.shopId}`;
  const reviewLink = `${baseUrl}/review/${c.shopId}`;
  const sf = settings.storefront || (settings.storefront = { prices: {}, depositPct: 0, payUrl: '', note: '' });
  if (!sf.prices) sf.prices = {};
  if (!sf.categories) sf.categories = {};
  if (!sf.soldOut) sf.soldOut = {};
  if (!sf.options) sf.options = {};
  // Parse "Color: Black, White; Size: S, M" → [{name, values}]; ≤5 groups, ≤12 vals.
  const parseOptionGroups = (raw) => String(raw || '').split(';').map((seg) => {
    const ci = seg.indexOf(':');
    if (ci < 0) return null;
    const name = seg.slice(0, ci).trim().slice(0, 40);
    const values = seg.slice(ci + 1).split(',').map((v) => v.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
    return (name && values.length) ? { name, values } : null;
  }).filter(Boolean).slice(0, 5);
  const cur = settings.currency || 'SAR';
  const pubProducts = (products || []).slice(0, 60).filter((p) => (p.nameEn || (typeof localName === 'function' ? localName(p) : '') || '').trim());
  const priceRows = pubProducts.map((p) => {
    const nm = (p.nameEn || (typeof localName === 'function' ? localName(p) : '') || '').trim();
    return `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
      <span style="flex:1;min-width:90px;font-size:12.5px;">${escapeHtml(nm)}</span>
      <input class="sfPrice" data-pid="${escapeHtml(p.id)}" aria-label="${escapeHtml(nm || p.id)} — ${escapeHtml(cur)}" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" value="${escapeHtml(sf.prices[p.id] != null ? String(sf.prices[p.id]) : '')}" style="width:72px;font-size:12.5px;text-align:right;" title="${escapeHtml(cur)}">
      <input class="sfCat" data-pid="${escapeHtml(p.id)}" aria-label="${escapeHtml(nm || p.id)} — ${escapeHtml(t('store.category_ph') || 'category')}" type="text" maxlength="60" placeholder="${escapeHtml(t('store.category_ph') || 'category')}" value="${escapeHtml(sf.categories[p.id] || '')}" list="sfCatList" style="width:96px;font-size:12px;">
      <label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:3px;cursor:pointer;" title="${escapeHtml(t('store.sold_out') || 'Sold out')}">
        <input class="sfSold" data-pid="${escapeHtml(p.id)}" aria-label="${escapeHtml(nm || p.id)} — ${escapeHtml(t('store.sold_out') || 'Sold out')}" type="checkbox" style="width:auto;margin:0;" ${sf.soldOut[p.id] ? 'checked' : ''}>${escapeHtml(t('store.sold_out') || 'Sold out')}
      </label>
      <input class="sfOpts" data-pid="${escapeHtml(p.id)}" type="text" maxlength="240" placeholder="${escapeHtml(t('store.options_ph') || 'Options — Color: Black, White; Size: S, M')}" value="${escapeHtml(sf.options[p.id] || '')}" title="${escapeHtml(t('store.options_hint') || 'Optional product choices. Format: Group: value, value; Group: value')}" style="flex-basis:100%;font-size:12px;">
    </div>`;
  }).join('') || `<p style="font-size:12px;color:var(--text-muted);">${escapeHtml(t('store.no_products') || 'Add products to your catalog first')}</p>`;
  const catList = [...new Set(Object.values(sf.categories || {}).filter(Boolean))];
  openFormModal({
    title: `🏬 ${t('store.title') || 'Storefront'}`,
    noSave: true,
    bodyHtml: `
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px;">${escapeHtml(t('store.intro') || 'Publish your product catalog as a public page customers can browse. Their selections arrive in Order requests as draft quotes.')}</p>
      <label>${escapeHtml(t('store.note_label') || 'Shop note (optional)')}</label>
      <input id="storeNote" type="text" maxlength="200" placeholder="${escapeHtml(t('store.note_ph') || 'e.g. Lead time ~3 days · Riyadh pickup')}" value="${escapeHtml(sf.note || '')}">
      <label style="margin-top:14px;">${escapeHtml(t('store.prices_label') || 'Prices (leave blank to hide)')}</label>
      <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border-soft);border-radius:8px;padding:8px;">${priceRows}</div>
      <datalist id="sfCatList">${catList.map((c) => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
      <div class="inline-pair" style="margin-top:12px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('store.lead_time') || 'Lead time (optional)')}</label>
          <input id="storeLead" type="text" maxlength="80" placeholder="${escapeHtml(t('store.lead_ph') || 'e.g. 3–5 days')}" value="${escapeHtml(sf.leadTime || '')}">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('store.min_order') || 'Minimum order')}</label>
          <input id="storeMinOrder" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" value="${escapeHtml(sf.minOrder ? String(sf.minOrder) : '')}">
        </div>
      </div>
      <div class="inline-pair" style="margin-top:12px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('store.deposit_pct') || 'Deposit %')}</label>
          <input id="storeDeposit" type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="0" value="${escapeHtml(sf.depositPct ? String(sf.depositPct) : '')}">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('store.pay_url') || 'Payment link')}</label>
          <input id="storePayUrl" type="url" placeholder="https://pay…/{amount}" value="${escapeHtml(sf.payUrl || '')}">
        </div>
      </div>
      <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">${escapeHtml(t('store.pay_url_hint') || 'Paste a payment link from any provider; use {amount} or {total} where the figure goes. The customer pays there before sending the order.')}</p>
      <div class="inline-pair" style="margin-top:12px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('store.tax_rate') || 'Tax / VAT %')}</label>
          <input id="storeTax" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="0" value="${escapeHtml(sf.taxRate ? String(sf.taxRate) : '')}">
        </div>
        <div></div>
      </div>
      <label style="margin-top:14px;">${escapeHtml(t('store.shipping_label') || 'Shipping methods')}</label>
      <div id="sfShipping"></div>
      <button id="sfAddShip" class="btn ghost small" type="button" style="margin-top:6px;">+ ${escapeHtml(t('store.add_shipping') || 'Add method')}</button>
      <label style="margin-top:14px;">${escapeHtml(t('store.promos_label') || 'Promo codes')}</label>
      <div id="sfPromos"></div>
      <button id="sfAddPromo" class="btn ghost small" type="button" style="margin-top:6px;">+ ${escapeHtml(t('store.add_promo') || 'Add code')}</button>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;">
        <input type="checkbox" id="storePhotos" checked style="width:auto;"> ${escapeHtml(t('store.include_photos') || 'Include product photos')}
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
        <button id="storePublish" class="btn primary small" type="button">${escapeHtml(t('store.publish') || 'Publish')} (${pubProducts.length})</button>
        <button id="storeCopy" class="btn ghost small" type="button">${escapeHtml(t('store.copy_link') || 'Copy link')}</button>
        <button id="storeUnpublish" class="btn danger small" type="button">${escapeHtml(t('store.unpublish') || 'Unpublish')}</button>
      </div>
      <div style="margin-top:10px;font-size:11.5px;color:var(--text-muted);word-break:break-all;">${escapeHtml(link)}</div>
      <span id="storeResult" style="font-size:12px;display:block;margin-top:8px;"></span>
      <hr style="border:none;border-top:1px solid var(--border-soft);margin:14px 0;">
      <label style="margin-top:0;">${escapeHtml(t('store.insights') || 'Storefront insights')}</label>
      <div id="storeInsights" style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">${escapeHtml(t('common.loading') || '…')}</div>
      <hr style="border:none;border-top:1px solid var(--border-soft);margin:14px 0;">
      <label style="margin-top:0;">${escapeHtml(t('store.reviews') || 'Customer reviews')} <span id="storeRating" style="color:var(--accent);font-weight:600;"></span></label>
      <p style="font-size:11.5px;color:var(--text-muted);margin:2px 0 6px;">${escapeHtml(t('store.reviews_hint') || 'Share this link after an order to collect a rating; the average shows on your storefront.')}</p>
      <button id="storeReviewCopy" class="btn ghost small" type="button">${escapeHtml(t('store.review_link') || 'Copy review link')}</button>
      <div style="margin-top:6px;font-size:11.5px;color:var(--text-muted);word-break:break-all;">${escapeHtml(reviewLink)}</div>`,
    onMount(modal) {
      const res = modal.querySelector('#storeResult');
      const setRes = (m, ok) => { res.textContent = m; res.style.color = ok ? 'var(--success)' : 'var(--danger)'; };
      // Promo-code editor (rows of code / type / value / expiry / max uses).
      const promosEl = modal.querySelector('#sfPromos');
      const promoRow = (p) => {
        p = p || { code: '', type: 'pct', value: '', expires: '', maxUses: '' };
        const row = document.createElement('div');
        row.className = 'sfPromoRow';
        row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;';
        row.innerHTML = `
          <input class="pCode" type="text" maxlength="32" placeholder="${escapeHtml(t('store.promo_code') || 'CODE')}" value="${escapeHtml(p.code || '')}" style="flex:1;min-width:90px;font-size:12px;text-transform:uppercase;">
          <select class="pType" style="font-size:12px;width:auto;"><option value="pct"${p.type !== 'fixed' ? ' selected' : ''}>%</option><option value="fixed"${p.type === 'fixed' ? ' selected' : ''}>${escapeHtml(cur)}</option></select>
          <input class="pValue" type="number" min="0" step="0.01" placeholder="0" value="${escapeHtml(p.value != null ? String(p.value) : '')}" style="width:62px;font-size:12px;">
          <input class="pExpires" type="date" value="${escapeHtml(p.expires || '')}" title="${escapeHtml(t('store.promo_expires') || 'Expires (optional)')}" style="width:130px;font-size:12px;">
          <input class="pMax" type="number" min="0" step="1" placeholder="∞" value="${escapeHtml(p.maxUses ? String(p.maxUses) : '')}" title="${escapeHtml(t('store.promo_max') || 'Max uses (blank = unlimited)')}" style="width:54px;font-size:12px;">
          <button type="button" class="btn danger small pDel" style="font-size:11px;" aria-label="${escapeHtml(t('common.delete'))}">✕</button>`;
        row.querySelector('.pDel').addEventListener('click', () => row.remove());
        return row;
      };
      (sf.promos || []).forEach((p) => promosEl.appendChild(promoRow(p)));
      modal.querySelector('#sfAddPromo').addEventListener('click', () => promosEl.appendChild(promoRow()));
      const collectPromos = () => Array.from(promosEl.querySelectorAll('.sfPromoRow')).map((r) => ({
        code: r.querySelector('.pCode').value.trim().toUpperCase(),
        type: r.querySelector('.pType').value,
        value: num(r.querySelector('.pValue').value, 0),
        expires: r.querySelector('.pExpires').value || '',
        maxUses: parseInt(r.querySelector('.pMax').value, 10) || 0,
      })).filter((p) => p.code && p.value > 0);
      // Shipping methods (label + price; ≤8). Blank-priced rows are free.
      const shipEl = modal.querySelector('#sfShipping');
      const shipRow = (m) => {
        m = m || { label: '', price: '' };
        const row = document.createElement('div');
        row.className = 'sfShipRow';
        row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
        row.innerHTML = `
          <input class="shLabel" type="text" maxlength="60" placeholder="${escapeHtml(t('store.ship_label_ph') || 'e.g. Courier, Pickup')}" value="${escapeHtml(m.label || '')}" style="flex:1;font-size:12.5px;">
          <input class="shPrice" type="number" min="0" step="0.01" placeholder="0" value="${escapeHtml(m.price != null && m.price !== '' ? String(m.price) : '')}" style="width:80px;font-size:12.5px;text-align:right;" title="${escapeHtml(cur)}">
          <button type="button" class="btn danger small shDel" style="font-size:11px;" aria-label="${escapeHtml(t('common.delete'))}">✕</button>`;
        row.querySelector('.shDel').addEventListener('click', () => row.remove());
        return row;
      };
      (sf.shipping || []).forEach((m) => shipEl.appendChild(shipRow(m)));
      modal.querySelector('#sfAddShip').addEventListener('click', () => shipEl.appendChild(shipRow()));
      const collectShipping = () => Array.from(shipEl.querySelectorAll('.sfShipRow')).map((r) => ({
        label: r.querySelector('.shLabel').value.trim(),
        price: Math.max(0, num(r.querySelector('.shPrice').value, 0)),
      })).filter((m) => m.label).slice(0, 8);
      // Persist the owner's storefront config (prices, deposit, pay link, note, promos).
      const captureConfig = () => {
        const prices = {}, categories = {}, soldOut = {}, options = {};
        modal.querySelectorAll('.sfPrice').forEach((inp) => { const v = inp.value.trim(); if (v) prices[inp.dataset.pid] = v; });
        modal.querySelectorAll('.sfCat').forEach((inp) => { const v = inp.value.trim(); if (v) categories[inp.dataset.pid] = v; });
        modal.querySelectorAll('.sfSold').forEach((inp) => { if (inp.checked) soldOut[inp.dataset.pid] = true; });
        modal.querySelectorAll('.sfOpts').forEach((inp) => { const v = inp.value.trim(); if (v) options[inp.dataset.pid] = v; });
        sf.prices = prices; sf.categories = categories; sf.soldOut = soldOut; sf.options = options;
        sf.depositPct = Math.max(0, Math.min(100, num(modal.querySelector('#storeDeposit').value, 0)));
        sf.minOrder = Math.max(0, num(modal.querySelector('#storeMinOrder').value, 0));
        sf.taxRate = Math.max(0, Math.min(100, num(modal.querySelector('#storeTax').value, 0)));
        sf.leadTime = modal.querySelector('#storeLead').value.trim();
        sf.payUrl = modal.querySelector('#storePayUrl').value.trim();
        sf.note = modal.querySelector('#storeNote').value.trim();
        sf.promos = collectPromos();
        sf.shipping = collectShipping();
        settings.storefront = sf;
        saveAll();
      };
      const buildCatalog = (withPhotos) => {
        captureConfig();
        return {
          shopName: (settings.bizEn || settings.bizAr || 'Khayt').trim(),
          currency: cur,
          lang: (typeof i18n !== 'undefined' && i18n.current) || 'en',
          note: sf.note,
          leadTime: sf.leadTime || '',
          minOrder: sf.minOrder || 0,
          depositPct: sf.depositPct || 0,
          taxRate: sf.taxRate || 0,
          shipping: sf.shipping || [],
          payUrl: /^https?:\/\//i.test(sf.payUrl) ? sf.payUrl : '',
          promos: sf.promos || [],
          items: pubProducts.map((p) => {
            const it = {
              id: p.id,
              name: (p.nameEn || (typeof localName === 'function' ? localName(p) : '') || '').trim(),
              nameAr: (p.nameAr || '').trim(),
              desc: (p.description || '').trim(),
            };
            if (sf.prices[p.id]) it.price = String(sf.prices[p.id]);
            if (sf.categories[p.id]) it.category = sf.categories[p.id];
            if (sf.soldOut[p.id]) it.soldOut = true;
            const og = parseOptionGroups(sf.options[p.id]);
            if (og.length) it.options = og;
            if (withPhotos && typeof p.thumbnail === 'string' && /^data:image\//.test(p.thumbnail) && p.thumbnail.length <= 200000) it.photo = p.thumbnail;
            return it;
          }).filter((it) => it.name),
        };
      };
      modal.querySelector('#storeCopy')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(link); setRes('✓ ' + (t('store.copied') || 'Link copied'), true); }
        catch { setRes(link, true); }
      });
      modal.querySelector('#storeReviewCopy')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(reviewLink); setRes('✓ ' + (t('store.copied') || 'Link copied'), true); }
        catch { setRes(reviewLink, true); }
      });
      // Show the live aggregate rating (best-effort).
      window.hubAPI.cloudReviewSummary({ url: c.url, shopId: c.shopId }).then((r) => {
        const s = r && r.ok && r.summary;
        if (s && s.count > 0) { const el = modal.querySelector('#storeRating'); if (el) el.textContent = `★ ${s.avg} (${s.count})`; }
      }).catch(() => {});
      // Storefront insights: views → carts → orders funnel + top products (best-effort).
      const insEl = modal.querySelector('#storeInsights');
      window.hubAPI.cloudStorefrontStats?.({ url: c.url, shopId: c.shopId, token: c.token }).then((r) => {
        if (!insEl) return;
        const s = r && r.ok && r.stats;
        if (!s || (!s.views && !s.carts && !s.orders)) { insEl.textContent = t('store.insights_empty') || 'No storefront activity yet.'; return; }
        const conv = s.views > 0 ? Math.round((s.orders / s.views) * 1000) / 10 : 0;
        const stat = (n, lbl) => `<span style="display:inline-block;margin-inline-end:14px;"><b style="color:var(--text);font-size:15px;">${n}</b> ${escapeHtml(lbl)}</span>`;
        const funnel = stat(s.views, t('store.ins_views') || 'views') + stat(s.carts, t('store.ins_carts') || 'carts')
          + stat(s.orders, t('store.ins_orders') || 'orders') + stat(conv + '%', t('store.ins_conv') || 'conversion');
        const top = (s.items || []).filter((it) => it.orders || it.carts).slice(0, 5)
          .map((it) => `<div style="display:flex;justify-content:space-between;padding:2px 0;"><span>${escapeHtml(it.name || it.id)}</span><span class="muted">${it.orders || 0} ${escapeHtml(t('store.ins_orders') || 'orders')} · ${it.carts || 0} ${escapeHtml(t('store.ins_carts') || 'carts')}</span></div>`).join('');
        insEl.innerHTML = `<div style="margin-bottom:6px;">${funnel}</div>` + (top ? `<div style="margin-top:6px;border-top:1px solid var(--border-soft);padding-top:6px;">${top}</div>` : '');
      }).catch(() => { if (insEl) insEl.textContent = t('store.insights_empty') || 'No storefront activity yet.'; });
      modal.querySelector('#storePublish')?.addEventListener('click', async () => {
        const cat = buildCatalog(modal.querySelector('#storePhotos').checked);
        if (!cat.items.length) { setRes('✗ ' + (t('store.no_products') || 'Add products to your catalog first'), false); return; }
        setRes(t('store.publishing') || 'Publishing…', true);
        try {
          const r = await window.hubAPI.cloudCatalogPublish({ url: c.url, shopId: c.shopId, token: c.token, catalog: cat });
          if (r.ok) setRes('✓ ' + (t('store.published') || 'Storefront is live') + ` — ${cat.items.length}`, true);
          else setRes('✗ ' + (r.error || 'failed'), false);
        } catch (e) { setRes('✗ ' + (e.message || e), false); }
      });
      modal.querySelector('#storeUnpublish')?.addEventListener('click', async () => {
        if (!(await confirmModal(t('store.unpublish_q') || 'Take the storefront offline? The link will stop working.', { danger: true }))) return;
        setRes(t('store.publishing') || 'Working…', true);
        try {
          const r = await window.hubAPI.cloudCatalogPublish({ url: c.url, shopId: c.shopId, token: c.token, catalog: null });
          if (r.ok) setRes('✓ ' + (t('store.unpublished') || 'Storefront is offline'), true);
          else setRes('✗ ' + (r.error || 'failed'), false);
        } catch (e) { setRes('✗ ' + (e.message || e), false); }
      });
    },
  });
}

function showRecoveryKeyModal(recoveryKey) {
  openFormModal({
    title: t('cloud.recovery_title') || 'Save your recovery key',
    saveLabel: t('cloud.recovery_saved') || 'I saved it',
    bodyHtml: `
      <p style="font-size:13px;">${escapeHtml(t('cloud.recovery_hint') || 'This recovers your cloud data if you forget your passphrase. Shown ONCE — store it safely; it cannot be recovered for you.')}</p>
      <input type="text" readonly value="${escapeHtml(recoveryKey)}" style="font-family:monospace;font-size:13px;" onclick="this.select()">`,
    onSave: () => {}, // acknowledgement only — just close on "I saved it"
  });
}

/** Modal to enter the emailed reset code + a new account password. */
function showResetPasswordModal(url, email) {
  openFormModal({
    title: t('cloud.reset_title') || 'Reset password',
    saveLabel: t('cloud.reset_do') || 'Reset password',
    bodyHtml: `
      <p style="font-size:13px;">${escapeHtml(t('cloud.reset_sent') || 'If that email has an account, we sent a reset code to')} <strong>${escapeHtml(email)}</strong>. ${escapeHtml(t('cloud.reset_enter') || 'Enter it below with your new account password.')}</p>
      <label>${escapeHtml(t('cloud.reset_code') || 'Reset code')}</label>
      <input type="text" id="rpCode" autocomplete="one-time-code" style="font-family:monospace;text-transform:uppercase;">
      <label style="margin-top:8px;">${escapeHtml(t('cloud.reset_newpw') || 'New account password')}</label>
      <input type="password" id="rpPass" placeholder="${escapeHtml(t('cloud.password_ph') || 'signs you in on any device (8+ chars)')}">
      <p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0;">${escapeHtml(t('cloud.reset_note') || 'This changes your account password only — your data stays encrypted; you’ll still unlock with your sync passphrase.')}</p>
      <p id="rpErr" style="color:var(--danger);font-size:12px;min-height:14px;margin:6px 0 0;"></p>`,
    onSave: async (modal) => {
      const code = modal.querySelector('#rpCode').value.trim().toUpperCase();
      const newPassword = modal.querySelector('#rpPass').value;
      const errEl = modal.querySelector('#rpErr');
      if (!code) { errEl.textContent = t('cloud.reset_need_code') || 'Enter the code from your email'; return false; }
      if (!newPassword || newPassword.length < 8) { errEl.textContent = t('cloud.need_password') || 'Account password must be 8+ chars'; return false; }
      const r = await window.hubAPI.cloudResetPassword({ url, email, code, newPassword });
      if (!r.ok) { errEl.textContent = '✗ ' + (r.error || 'reset failed'); return false; }
      toast(t('cloud.reset_done') || 'Password reset — log in with your new password', 'success');
    },
  });
}

/** Modal to enter the emailed verification code. On success marks the account verified. */
function showVerifyEmailModal(url, email) {
  openFormModal({
    title: t('cloud.verify_title') || 'Verify your email',
    saveLabel: t('cloud.verify_do') || 'Verify',
    bodyHtml: `
      <p style="font-size:13px;">${escapeHtml(t('cloud.verify_sent') || 'We emailed a verification code to')} <strong>${escapeHtml(email)}</strong>.</p>
      <label>${escapeHtml(t('cloud.verify_code') || 'Verification code')}</label>
      <input type="text" id="veCode" autocomplete="one-time-code" style="font-family:monospace;text-transform:uppercase;">
      <p id="veErr" style="color:var(--danger);font-size:12px;min-height:14px;margin:6px 0 0;"></p>`,
    onSave: async (modal) => {
      const code = modal.querySelector('#veCode').value.trim().toUpperCase();
      const errEl = modal.querySelector('#veErr');
      if (!code) { errEl.textContent = t('cloud.verify_need_code') || 'Enter the code from your email'; return false; }
      const r = await window.hubAPI.cloudVerifyEmail({ url, email, code });
      if (!r.ok) { errEl.textContent = '✗ ' + (r.error || 'verification failed'); return false; }
      if (settings.cloud) { settings.cloud.verified = true; saveAll(); }
      renderCloudSettings();
      toast(t('cloud.verify_done') || 'Email verified ✓', 'success');
    },
  });
}

// ---- Stage C: auto-sync wiring -------------------------------------------
// Append-only collections (ledgers/logs) are unioned, never overwritten, on merge.
const CLOUD_APPEND_ONLY = ['loyaltyLedger', 'wasteLog', 'machMaintLog', 'envLogs', 'shiftLogs', 'timeEntries', 'auditLog', '_auditLog'];

/** I/O the auto-sync controller needs, bound to the live app + cloud IPC. */
function cloudSyncDeps() {
  return {
    appendOnly: CLOUD_APPEND_ONLY,
    buildSnapshot: () => buildStoreSnapshot(),
    applySnapshot: (snap) => applyStoreFromSnapshot(snap),
    save: () => saveAll(),
    push: (snap) => window.hubAPI.cloudPush(snap),
    pull: () => window.hubAPI.cloudPull(),
  };
}

/** Turn on background auto-sync after a successful unlock. initialPull merges
 *  any server-side changes first (safe on the same device); skip it right after
 *  sign-up (server is empty) so we just push the new shop's data. */
async function enableCloudAutoSync({ initialPull = true } = {}) {
  if (!window.KhaytCloudSync) return;
  KhaytCloudSync.configure(cloudSyncDeps());
  try {
    if (initialPull) await KhaytCloudSync.pullMerge();
    KhaytCloudSync.syncNow();
  } catch (e) { console.error('enableCloudAutoSync:', e); }
}

/** Fetch + show the shop's billing plan in the cloud card (silent if billing off). */
async function showCloudPlan(c) {
  const elx = document.getElementById('cloudPlan');
  if (!elx || !window.hubAPI?.cloudBillingMe) return;
  try {
    const r = await window.hubAPI.cloudBillingMe({ url: c.url, shopId: c.shopId, token: c.token });
    if (!r || !r.ok || !r.billingEnabled) { elx.textContent = ''; return; }
    const mb = (r.limits && +r.limits.maxStoreBytes) ? Math.round(+r.limits.maxStoreBytes / (1024 * 1024)) : null;
    const parts = [(t('cloud.plan') || 'Plan') + ': ' + (r.label || r.plan)];
    if (!r.active) parts.push(t('cloud.plan_inactive') || 'inactive');
    if (mb) parts.push((t('cloud.plan_storage') || 'up to') + ' ' + mb + ' MB');
    elx.textContent = parts.join(' · ');
    elx.style.color = r.active ? 'var(--text-muted)' : 'var(--danger)';
  } catch (e) { /* billing is optional — stay silent */ }
}

function cloudSyncStatusLabel(s) {
  const map = {
    syncing: t('cloud.status_syncing') || 'Syncing…',
    synced: t('cloud.status_synced') || 'Synced ✓',
    conflict: t('cloud.status_conflict') || 'Resolving…',
    locked: t('cloud.status_locked') || 'Locked',
    offline: t('cloud.status_offline') || 'Offline — will retry',
    error: t('cloud.status_error') || 'Sync error',
    idle: t('cloud.status_idle') || 'Auto-sync on',
  };
  return map[s] || '';
}

// One persistent status listener that paints the #cloudSyncStatus badge whenever
// it exists (the element is recreated on each settings render).
let _cloudStatusWired = false;
function wireCloudSyncStatusOnce() {
  if (_cloudStatusWired || !window.KhaytCloudSync) return;
  _cloudStatusWired = true;
  KhaytCloudSync.onStatus((s) => {
    const badge = document.getElementById('cloudSyncStatus');
    if (!badge) return;
    badge.textContent = cloudSyncStatusLabel(s);
    badge.style.color = (s === 'error' || s === 'offline') ? 'var(--danger)'
      : (s === 'synced' ? 'var(--success)' : 'var(--text-muted)');
  });
}

/** Settings → Khayt Cloud: account sign-up / log-in / sync / restore (opt-in, E2E).
 *  Two independent secrets: the ACCOUNT PASSWORD authenticates (reaches the shop);
 *  the SYNC PASSPHRASE encrypts (decrypts data) and never leaves this device. */
function renderCloudSettings() {
  const el = $('#cloudSettingsSection');
  if (!el) return;
  wireCloudSyncStatusOnce();
  const c = settings.cloud || {};
  const connected = !!(c.enabled && c.shopId);
  const syncStatus = (connected && window.KhaytCloudSync) ? cloudSyncStatusLabel(KhaytCloudSync.status()) : '';
  const showUnverified = connected && c.email && c.verified === false;
  el.innerHTML = `
    ${connected ? `<p style="font-size:12.5px;margin:0 0 8px;">${escapeHtml(t('cloud.signed_in_as') || 'Signed in as')}: <strong>${escapeHtml(c.email || c.shopId)}</strong> · <span style="color:var(--text-muted);">${escapeHtml(c.url || '')}</span> <span id="cloudSyncStatus" style="font-size:12px;margin-inline-start:6px;color:var(--text-muted);">${escapeHtml(syncStatus)}</span></p>` : ''}
    ${showUnverified ? `<div style="background:color-mix(in srgb, var(--warning,#d97706) 14%, transparent);border:1px solid var(--warning,#d97706);border-radius:6px;padding:8px 10px;margin:0 0 8px;font-size:12.5px;">⚠ ${escapeHtml(t('cloud.unverified') || 'Email not verified.')} <button id="btnCloudVerify" class="btn small" style="margin-inline-start:6px;">${escapeHtml(t('cloud.verify_email') || 'Verify email')}</button></div>` : ''}
    ${connected ? `<p id="cloudPlan" style="font-size:12.5px;margin:0 0 8px;color:var(--text-muted);"></p>` : ''}
    <label>${escapeHtml(t('cloud.url') || 'Server URL')}</label>
    <input type="text" id="cloudUrl" value="${escapeHtml(c.url || 'https://cloud.khaytapp.com')}" ${connected ? 'disabled' : ''} placeholder="https://cloud.khaytapp.com">
    ${!connected ? `
      <label style="margin-top:8px;">${escapeHtml(t('cloud.email') || 'Email')}</label>
      <input type="email" id="cloudEmail" placeholder="you@example.com" autocomplete="username">
      <label style="margin-top:8px;">${escapeHtml(t('cloud.password') || 'Account password')}</label>
      <input type="password" id="cloudAcctPass" placeholder="${escapeHtml(t('cloud.password_ph') || 'signs you in on any device (8+ chars)')}" autocomplete="current-password">
      <label style="margin-top:8px;">${escapeHtml(t('cloud.passphrase') || 'Sync passphrase')}</label>
      <input type="password" id="cloudPass" placeholder="${escapeHtml(t('cloud.passphrase_ph') || 'encrypts your data — never uploaded')}">
      <p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0;">${escapeHtml(t('cloud.passphrase_explain') || 'The sync passphrase encrypts your data and is never sent to the server. Same passphrase on every device.')}</p>
      <label style="margin-top:8px;">${escapeHtml(t('cloud.secret') || 'Invite secret (optional)')}</label>
      <input type="password" id="cloudSecret" placeholder="${escapeHtml(t('cloud.secret_ph') || 'only if your server requires one for sign-up')}">
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button id="btnCloudSignup" class="btn primary small">${escapeHtml(t('cloud.signup') || 'Create account')}</button>
        <button id="btnCloudLogin" class="btn small">${escapeHtml(t('cloud.login') || 'Log in (existing)')}</button>
        <button id="btnCloudJoin" class="btn small">${escapeHtml(t('team.join') || 'Join a team')}</button>
        <button id="btnCloudForgot" class="btn ghost small">${escapeHtml(t('cloud.forgot') || 'Forgot password?')}</button>
        <span id="cloudResult" style="font-size:12px;"></span>
      </div>`
    : `
      <label style="margin-top:8px;">${escapeHtml(t('cloud.passphrase') || 'Sync passphrase')}</label>
      <input type="password" id="cloudPass" placeholder="${escapeHtml(t('cloud.unlock_ph') || 'enter to unlock this session')}">
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button id="btnCloudUnlock" class="btn small">${escapeHtml(t('cloud.unlock') || 'Unlock')}</button>
        <button id="btnCloudSync" class="btn small">${escapeHtml(t('cloud.sync_now') || 'Sync now')}</button>
        <button id="btnCloudRestore" class="btn small">${escapeHtml(t('cloud.restore') || 'Restore from cloud')}</button>
        <button id="btnCloudSnapshots" class="btn small">🕑 ${escapeHtml(t('cloud.snapshots') || 'Snapshot history')}</button>
        <button id="btnCloudRequests" class="btn small">🛎 ${escapeHtml(t('intake.requests') || 'Order requests')}</button>
        <button id="btnCloudIntakeLink" class="btn ghost small">${escapeHtml(t('intake.copy_link') || 'Copy request link')}</button>
        ${(settings.cloud?.role || 'owner') === 'owner' ? `<button id="btnCloudTeam" class="btn small">👥 ${escapeHtml(t('team.title') || 'Team')}</button>` : ''}
        ${(settings.cloud?.role || 'owner') === 'owner' ? `<button id="btnCloudStorefront" class="btn small">🏬 ${escapeHtml(t('store.title') || 'Storefront')}</button>` : ''}
        <button id="btnCloudDisconnect" class="btn danger small">${escapeHtml(t('cloud.disconnect') || 'Sign out')}</button>
        <span id="cloudResult" style="font-size:12px;"></span>
      </div>`}`;

  const result = (msg, color) => { const r = el.querySelector('#cloudResult'); if (r) { r.textContent = msg; r.style.color = color || 'var(--text-muted)'; } };

  // Shared validation for the not-connected form. Returns {url,email,password,pass,secret} or null.
  const readConnectForm = async () => {
    const url = el.querySelector('#cloudUrl').value.trim();
    const email = el.querySelector('#cloudEmail').value.trim();
    const password = el.querySelector('#cloudAcctPass').value;
    const pass = el.querySelector('#cloudPass').value;
    const secret = el.querySelector('#cloudSecret').value.trim();
    if (!url) { result(t('cloud.need_url') || 'Enter the server URL', 'var(--danger)'); return null; }
    if (!email) { result(t('cloud.need_email') || 'Enter your email', 'var(--danger)'); return null; }
    if (!password || password.length < 8) { result(t('cloud.need_password') || 'Account password must be 8+ chars', 'var(--danger)'); return null; }
    if (!pass || pass.length < 6) { result(t('cloud.need_pass') || 'Choose a sync passphrase (6+ chars)', 'var(--danger)'); return null; }
    result(t('cloud.connecting') || 'Connecting…');
    if (!(await window.hubAPI.cloudHealth(url))) { result((t('cloud.unreachable') || 'Server not reachable') + ' ' + url, 'var(--danger)'); return null; }
    return { url, email, password, pass, secret };
  };

  // Create account: signup → make keyset locally → save → unlock → upload encrypted keyset.
  el.querySelector('#btnCloudSignup')?.addEventListener('click', async () => {
    const f = await readConnectForm(); if (!f) return;
    const su = await window.hubAPI.cloudSignup({ url: f.url, email: f.email, password: f.password, registerSecret: f.secret });
    if (!su.ok) { result('✗ ' + (su.error || 'sign-up failed'), 'var(--danger)'); return; }
    const ks = await window.hubAPI.cloudCreateKeyset(f.pass);
    if (!ks.ok) { result('✗ ' + (ks.error || 'keyset failed'), 'var(--danger)'); return; }
    settings.cloud = { enabled: true, url: f.url, email: f.email, accountId: su.accountId, shopId: su.shopId, token: su.token, keyset: ks.keyset, lastServerRev: 0, verified: false, role: 'owner' };
    saveAll();
    await window.hubAPI.cloudUnlock({ url: f.url, shopId: su.shopId, token: su.token, keyset: ks.keyset, passphrase: f.pass });
    const up = await window.hubAPI.cloudPutKeyset({ url: f.url, shopId: su.shopId, token: su.token, keyset: ks.keyset });
    if (!up.ok) { result('✗ ' + (up.error || 'could not save keyset'), 'var(--danger)'); return; }
    showRecoveryKeyModal(ks.recoveryKey);
    await enableCloudAutoSync({ initialPull: false }); // new shop: just push local
    renderCloudSettings();
    toast(t('cloud.account_created') || 'Account created — Khayt Cloud connected', 'success');
  });

  // Log in (existing account, e.g. a second device): login → get encrypted keyset → unlock with passphrase.
  el.querySelector('#btnCloudLogin')?.addEventListener('click', async () => {
    const f = await readConnectForm(); if (!f) return;
    const lr = await window.hubAPI.cloudLogin({ url: f.url, email: f.email, password: f.password });
    if (!lr.ok) { result('✗ ' + (lr.error || 'login failed'), 'var(--danger)'); return; }
    let keyset = lr.keyset;
    let recoveryKey = null;
    if (!keyset) {
      // Account exists but never finished keyset setup — create one now from this passphrase.
      const ks = await window.hubAPI.cloudCreateKeyset(f.pass);
      if (!ks.ok) { result('✗ ' + (ks.error || 'keyset failed'), 'var(--danger)'); return; }
      keyset = ks.keyset; recoveryKey = ks.recoveryKey;
    }
    settings.cloud = { enabled: true, url: f.url, email: f.email, shopId: lr.shopId, token: lr.token, keyset, lastServerRev: 0, verified: !!lr.verified, role: lr.role || 'owner' };
    saveAll();
    const un = await window.hubAPI.cloudUnlock({ url: f.url, shopId: lr.shopId, token: lr.token, keyset, passphrase: f.pass });
    if (!un.ok) { result('✗ ' + (t('cloud.wrong_pass') || 'Wrong sync passphrase for this account'), 'var(--danger)'); renderCloudSettings(); return; }
    if (recoveryKey) {
      await window.hubAPI.cloudPutKeyset({ url: f.url, shopId: lr.shopId, token: lr.token, keyset });
      showRecoveryKeyModal(recoveryKey);
    }
    // Configure auto-sync but DON'T auto-pull on a new device — let the user
    // click "Restore from cloud" (full replace) to populate, then it stays synced.
    if (window.KhaytCloudSync) KhaytCloudSync.configure(cloudSyncDeps());
    renderCloudSettings();
    toast(t('cloud.logged_in') || 'Logged in — use “Restore from cloud” to pull your data', 'success');
  });

  // Join a team: accept an emailed invite → member account in the shared shop.
  el.querySelector('#btnCloudJoin')?.addEventListener('click', async () => {
    const f = await readConnectForm(); if (!f) return;
    openFormModal({
      title: t('team.join') || 'Join a team',
      saveLabel: t('team.join') || 'Join',
      bodyHtml: `<p style="color:var(--text-muted);font-size:12.5px;margin:0 0 10px;">${escapeHtml(t('team.join_hint') || 'Enter the invite code from your shop owner. Use your own email + password (above) and the shop’s shared sync passphrase.')}</p>
        <label>${escapeHtml(t('team.code') || 'Invite code')}</label><input id="joinCode" autocomplete="off" style="text-transform:uppercase;">`,
      onSave: async (modal) => {
        const code = modal.querySelector('#joinCode').value.trim();
        if (!code) { toast(t('team.code') || 'Invite code', 'error'); return false; }
        const r = await window.hubAPI.cloudAcceptInvite({ url: f.url, email: f.email, password: f.password, code });
        if (!r.ok) { toast('✗ ' + (r.error || 'join failed'), 'error'); return false; }
        if (!r.keyset) { toast(t('team.no_keyset') || 'The owner hasn’t set up sync yet — ask them to enable Khayt Cloud first.', 'error'); return false; }
        settings.cloud = { enabled: true, url: f.url, email: f.email, shopId: r.shopId, token: r.token, keyset: r.keyset, lastServerRev: 0, verified: false, role: r.role || 'operator' };
        saveAll();
        const un = await window.hubAPI.cloudUnlock({ url: f.url, shopId: r.shopId, token: r.token, keyset: r.keyset, passphrase: f.pass });
        renderCloudSettings();
        if (!un.ok) { toast(t('cloud.wrong_pass') || 'Wrong shared sync passphrase', 'error'); return true; }
        if (window.KhaytCloudSync) KhaytCloudSync.configure(cloudSyncDeps());
        toast(t('team.joined') || 'Joined the team — use “Restore from cloud” to pull data', 'success');
        return true;
      },
    });
  });

  // Forgot password: email a reset code, then open the reset modal.
  el.querySelector('#btnCloudForgot')?.addEventListener('click', async () => {
    const url = el.querySelector('#cloudUrl').value.trim();
    const email = el.querySelector('#cloudEmail').value.trim();
    if (!url) { result(t('cloud.need_url') || 'Enter the server URL', 'var(--danger)'); return; }
    if (!email) { result(t('cloud.need_email') || 'Enter your email first', 'var(--danger)'); return; }
    result(t('cloud.connecting') || 'Connecting…');
    if (!(await window.hubAPI.cloudHealth(url))) { result((t('cloud.unreachable') || 'Server not reachable') + ' ' + url, 'var(--danger)'); return; }
    const r = await window.hubAPI.cloudRequestReset({ url, email });
    if (!r.ok) { result('✗ ' + (r.error || 'request failed'), 'var(--danger)'); return; }
    if (!r.emailConfigured) { result(t('cloud.reset_no_email') || 'This server has no email set up — contact the admin', 'var(--danger)'); return; }
    result('');
    showResetPasswordModal(url, email);
  });

  // Verify email: (re)send a code, then open the verify modal.
  el.querySelector('#btnCloudVerify')?.addEventListener('click', async () => {
    const rv = await window.hubAPI.cloudRequestVerify({ url: c.url, email: c.email });
    if (rv.ok && rv.alreadyVerified) { if (settings.cloud) { settings.cloud.verified = true; saveAll(); } renderCloudSettings(); toast(t('cloud.verify_done') || 'Email verified ✓', 'success'); return; }
    if (!rv.ok) { toast('✗ ' + (rv.error || 'could not send code'), 'error'); return; }
    if (!rv.emailConfigured) { toast(t('cloud.reset_no_email') || 'This server has no email set up — contact the admin', 'error'); return; }
    showVerifyEmailModal(c.url, c.email);
  });

  el.querySelector('#btnCloudUnlock')?.addEventListener('click', async () => {
    const pass = el.querySelector('#cloudPass').value;
    const r = await window.hubAPI.cloudUnlock({ url: c.url, shopId: c.shopId, token: c.token, keyset: c.keyset, passphrase: pass });
    if (r.ok) {
      result('✓ ' + (t('cloud.unlocked') || 'Unlocked'), 'var(--success)');
      await enableCloudAutoSync({ initialPull: true }); // same device returning: merge in changes from elsewhere
    } else {
      result('✗ ' + (t('cloud.wrong_pass') || 'Wrong passphrase'), 'var(--danger)');
    }
  });

  el.querySelector('#btnCloudSync')?.addEventListener('click', async () => {
    result(t('cloud.syncing') || 'Syncing…');
    // Prefer the auto-sync controller (handles conflicts via pull+merge+re-push).
    if (window.KhaytCloudSync && KhaytCloudSync.isOn()) {
      const r = await KhaytCloudSync.syncNow();
      if (r.ok) { settings.cloud.lastServerRev = r.rev; saveAll(); result('✓ ' + (t('cloud.synced') || 'Synced') + ' (rev ' + r.rev + ')', 'var(--success)'); }
      else if (r.error === 'locked') result('✗ ' + (t('cloud.locked') || 'Unlock first (enter passphrase)'), 'var(--danger)');
      else result('✗ ' + (r.error || 'sync failed'), 'var(--danger)');
      return;
    }
    // Fallback (not unlocked this session): a plain push.
    const r = await window.hubAPI.cloudPush(buildStoreSnapshot());
    if (r.ok && !r.conflict) { settings.cloud.lastServerRev = r.rev; saveAll(); result('✓ ' + (t('cloud.synced') || 'Synced') + ' (rev ' + r.rev + ')', 'var(--success)'); }
    else if (r.conflict) result('⚠ ' + (t('cloud.conflict') || 'Server has newer data — Restore from cloud first'), 'var(--warning, #d97706)');
    else if (r.error === 'locked') result('✗ ' + (t('cloud.locked') || 'Unlock first (enter passphrase)'), 'var(--danger)');
    else result('✗ ' + (r.error || 'sync failed'), 'var(--danger)');
  });

  // Restore from cloud: pull the encrypted store, decrypt, and replace local data
  // (keeping THIS device's cloud identity/token). Mirrors the import-backup flow.
  el.querySelector('#btnCloudRestore')?.addEventListener('click', async () => {
    const r = await window.hubAPI.cloudPull();
    if (!r.ok) {
      if (r.error === 'locked') result('✗ ' + (t('cloud.locked') || 'Unlock first (enter passphrase)'), 'var(--danger)');
      else result('✗ ' + (r.error || 'pull failed'), 'var(--danger)');
      return;
    }
    if (!r.store) { result(t('cloud.nothing_yet') || 'Nothing in the cloud yet — Sync now first', 'var(--warning, #d97706)'); return; }
    const ok = await confirmModal(t('cloud.restore_q') || 'Replace all local data with the cloud copy? This cannot be undone.', { danger: true });
    if (!ok) return;
    const keepCloud = Object.assign({}, settings.cloud);
    try {
      // Refuse a snapshot that failed validation — replaceStoreFromSnapshot leaves the
      // existing data untouched when it returns false, so do NOT save or report success.
      if (!replaceStoreFromSnapshot(r.store)) { toast(t('set.restore_error') || 'Restore failed — the file could not be read', 'error'); return; }
      settings.cloud = Object.assign({}, settings.cloud, keepCloud, { lastServerRev: r.rev }); // keep this device's token/login
      saveAll();
      initialRender();
      loadSettingsIntoForm();
      applyTheme(settings.theme);
      i18n.set(settings.lang);
      if (window.KhaytCloudSync) KhaytCloudSync.configure(cloudSyncDeps()); // local now == cloud; keep it synced going forward
      renderCloudSettings();
      toast((t('cloud.restored') || 'Restored from cloud') + ' (rev ' + r.rev + ')', 'success');
    } catch (e) {
      console.error('cloud restore:', e);
      toast(t('cloud.restore_error') || 'Could not restore from cloud', 'error');
    }
  });

  el.querySelector('#btnCloudSnapshots')?.addEventListener('click', () => { openCloudSnapshotsModal(); });

  el.querySelector('#btnCloudRequests')?.addEventListener('click', () => {
    if (typeof openOrderRequestsModal === 'function') openOrderRequestsModal();
  });
  el.querySelector('#btnCloudIntakeLink')?.addEventListener('click', () => {
    if (typeof copyIntakeLink === 'function') copyIntakeLink();
  });
  el.querySelector('#btnCloudTeam')?.addEventListener('click', openTeamModal);
  el.querySelector('#btnCloudStorefront')?.addEventListener('click', openStorefrontModal);

  el.querySelector('#btnCloudDisconnect')?.addEventListener('click', async () => {
    if (!(await confirmModal(t('cloud.disconnect_q') || 'Sign out of Khayt Cloud on this device? Local data stays; the cloud copy is kept.', { danger: true }))) return;
    if (window.KhaytCloudSync) KhaytCloudSync.stop(); // halt background auto-sync
    await window.hubAPI.cloudLock();
    settings.cloud = Object.assign({}, settings.cloud, { enabled: false });
    saveAll();
    renderCloudSettings();
    toast(t('cloud.disconnected') || 'Signed out', 'success');
  });

  if (connected) showCloudPlan(c); // async; fills #cloudPlan if the server has billing on
}

function renderDigestSettings() {
  const el = $('#emailDigestSection');
  if (!el) return;
  const d = settings.emailDigest || {};
  const hourOpts = Array.from({ length: 24 }, (_, i) =>
    `<option value="${i}" ${(d.hour ?? 8) === i ? 'selected' : ''}>${String(i).padStart(2,'0')}:00</option>`
  ).join('');
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayOpts = dayNames.map((n, i) =>
    `<option value="${i}" ${(d.weekday ?? 1) === i ? 'selected' : ''}>${escapeHtml(n)}</option>`
  ).join('');

  el.innerHTML = `
    <div style="margin-bottom:12px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:0;">
        <input type="checkbox" id="digestEnabled" style="width:auto;margin:0;" ${d.enabled ? 'checked' : ''}>
        <span style="font-weight:600;font-size:13px;">${escapeHtml(t('digest.enable') || 'Enable automated email digest')}</span>
      </label>
    </div>
    <div id="digestFields" style="${d.enabled ? '' : 'opacity:.5;pointer-events:none;'}">
      <div style="margin-bottom:10px;">
        <label style="margin-top:0;">${escapeHtml(t('digest.frequency') || 'Frequency')}</label>
        <div style="display:flex;gap:16px;margin-top:4px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal;">
            <input type="radio" name="digestFreq" value="daily" ${d.frequency !== 'weekly' ? 'checked' : ''} style="width:auto;margin:0;">
            Daily
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal;">
            <input type="radio" name="digestFreq" value="weekly" ${d.frequency === 'weekly' ? 'checked' : ''} style="width:auto;margin:0;">
            Weekly
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:normal;">
            <input type="radio" name="digestFreq" value="monthly" ${d.frequency === 'monthly' ? 'checked' : ''} style="width:auto;margin:0;">
            ${escapeHtml(t('digest.monthly') || 'Monthly')}
          </label>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('digest.send_hour') || 'Send at hour')}</label>
          <select id="digestHour" style="font-size:12.5px;">${hourOpts}</select>
        </div>
        <div id="digestWeekdayWrap" style="${d.frequency === 'weekly' ? '' : 'display:none;'}">
          <label style="margin-top:0;">${escapeHtml(t('digest.weekday') || 'Day of week')}</label>
          <select id="digestWeekday" style="font-size:12.5px;">${dayOpts}</select>
        </div>
        <div id="digestMonthdayWrap" style="${d.frequency === 'monthly' ? '' : 'display:none;'}">
          <label style="margin-top:0;">${escapeHtml(t('digest.monthday') || 'Day of month')}</label>
          <select id="digestMonthday" style="font-size:12.5px;">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${(d.monthday ?? 1) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <label style="margin-top:0;">${escapeHtml(t('digest.recipient') || 'Recipient email')}</label>
        <input type="email" id="digestRecipient" value="${escapeHtml(d.recipientEmail || '')}" placeholder="${escapeHtml(settings.email || 'defaults to shop email')}" style="font-size:12.5px;">
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
      <button id="btnSaveDigest" class="btn small primary">${escapeHtml(t('common.save'))}</button>
      <button id="btnTestDigest" class="btn small">${escapeHtml(t('digest.send_test') || 'Send Test Now')}</button>
      <span id="digestTestResult" style="font-size:12px;color:var(--text-muted);"></span>
    </div>`;

  el.querySelector('#digestEnabled')?.addEventListener('change', (e) => {
    const fields = el.querySelector('#digestFields');
    if (fields) fields.style.cssText = e.target.checked ? '' : 'opacity:.5;pointer-events:none;';
  });

  el.querySelectorAll('[name="digestFreq"]').forEach(r => {
    r.addEventListener('change', () => {
      const freq = el.querySelector('[name="digestFreq"]:checked')?.value;
      const wdWrap = el.querySelector('#digestWeekdayWrap');
      const mdWrap = el.querySelector('#digestMonthdayWrap');
      if (wdWrap) wdWrap.style.display = freq === 'weekly' ? '' : 'none';
      if (mdWrap) mdWrap.style.display = freq === 'monthly' ? '' : 'none';
    });
  });

  el.querySelector('#btnSaveDigest')?.addEventListener('click', () => {
    settings.emailDigest = {
      enabled:        el.querySelector('#digestEnabled').checked,
      frequency:      el.querySelector('[name="digestFreq"]:checked')?.value || 'daily',
      hour:           parseInt(el.querySelector('#digestHour').value, 10) || 8,
      weekday:        parseInt(el.querySelector('#digestWeekday').value, 10) || 1,
      monthday:       parseInt(el.querySelector('#digestMonthday')?.value, 10) || 1,
      recipientEmail: el.querySelector('#digestRecipient').value.trim(),
      lastSentDate:   settings.emailDigest?.lastSentDate || '',
    };
    saveAll();
    toast(t('common.save'), 'success');
  });

  el.querySelector('#btnTestDigest')?.addEventListener('click', async () => {
    const resEl = el.querySelector('#digestTestResult');
    if (resEl) resEl.textContent = '…';
    const cfg = settings.emailConfig;
    if (!cfg || cfg.provider === 'none') {
      if (resEl) resEl.textContent = 'No email provider configured.';
      return;
    }
    const to = (el.querySelector('#digestRecipient').value.trim()) || settings.email || '';
    if (!to) { if (resEl) resEl.textContent = 'No recipient email.'; return; }
    const body = buildDigestEmailHtml();
    const subject = `${settings.bizEn || 'Khayt'} — Test Digest`;
    const result = await window.hubAPI?.sendEmail?.({ to, subject, body, smtpConfig: cfg });
    if (resEl) {
      if (result?.ok) { resEl.textContent = 'Test sent!'; resEl.style.color = 'var(--success)'; }
      else if (result?.fallback) { resEl.textContent = 'mailto: fallback'; resEl.style.color = 'var(--text-muted)'; }
      else { resEl.textContent = 'Failed: ' + (result?.error || ''); resEl.style.color = 'var(--danger)'; }
    }
  });
}

function renderOperatorLockSettings() {
  const el = $('#operatorLockSection');
  if (!el) return;
  const activeOp = settings.activeOperatorId ? operators.find(o => o.id === settings.activeOperatorId) : null;
  el.innerHTML = `
    <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px;">
      ${activeOp
        ? `Active operator: <strong>${escapeHtml(activeOp.name)}</strong> (${escapeHtml(activeOp.role || 'no role')})`
        : 'No operator active — all features accessible.'}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="btnSwitchOperator" class="btn small primary">${escapeHtml(t('op.switch') || 'Switch operator')}</button>
      ${activeOp ? `<button id="btnLockNow" class="btn small">${escapeHtml(t('op.lock') || 'Lock now')}</button>` : ''}
    </div>
    ${operators.length === 0
      ? `<p style="font-size:11.5px;color:var(--text-muted);margin-top:8px;">Add operators in the Operators section above, then assign PINs.</p>`
      : `<div style="margin-top:12px;font-size:12.5px;font-weight:600;margin-bottom:6px;">Operator PINs</div>
         <div style="display:flex;flex-direction:column;gap:6px;">
           ${operators.map(op => `
             <div style="display:flex;align-items:center;gap:10px;">
               <span style="flex:1;font-size:13px;">${escapeHtml(op.name)}</span>
               <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(op.role || '')}</span>
               <input type="password" class="op-pin-input" data-op-id="${op.id}" aria-label="${escapeHtml(t('ops.pin_for') || 'PIN for')} ${escapeHtml(op.name || op.id)}"
                 value="${op.pinHash ? '****' : ''}"
                 placeholder="${op.pinHash ? '(set)' : 'Set PIN'}"
                 maxlength="8" style="width:80px;font-size:12px;">
               <button class="btn small op-save-pin" data-op-id="${op.id}">Save PIN</button>
             </div>`).join('')}
         </div>`}`;

  el.querySelector('#btnSwitchOperator')?.addEventListener('click', () => openPinPadModal());
  el.querySelector('#btnLockNow')?.addEventListener('click', () => {
    settings.activeOperatorId = null;
    saveAll();
    renderOperatorLockSettings();
    applyOperatorPermissions();
    toast(t('op.lock') || 'Locked', 'info', 1800);
  });

  el.querySelectorAll('.op-save-pin').forEach(btn => {
    btn.addEventListener('click', async () => {
      const opId = btn.dataset.opId;
      const pinInput = el.querySelector(`.op-pin-input[data-op-id="${opId}"]`);
      const pin = pinInput?.value?.trim() || '';
      const op = operators.find(o => o.id === opId);
      if (!op) return;
      if (pin && pin !== '****') {
        op.pinHash = await hashPin(pin); // SHA-256 hex, not btoa
        saveAll();
        toast(t('op.pin_set') || 'PIN saved', 'success', 1800);
        if (pinInput) pinInput.value = '****';
      } else if (!pin) {
        op.pinHash = '';
        saveAll();
        toast('PIN cleared', 'info', 1800);
      }
    });
  });
}

/** Show PIN pad modal to switch operator */

function renderLoyaltyTiersSettings() {
  const el = $('#loyaltyTiersSection');
  if (!el) return;
  const tiers = settings.loyaltyTiers || [];

  el.innerHTML = `
    <div id="loyaltyTiersList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">
      ${tiers.map((tier, idx) => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-2);">
          <input type="text" class="tier-name" data-idx="${idx}" value="${escapeHtml(tier.name || '')}" placeholder="e.g. Gold" style="flex:1.5;font-size:12.5px;">
          <input type="number" class="tier-min-orders" data-idx="${idx}" value="${tier.minOrders || ''}" placeholder="${escapeHtml(t('set.loyalty_min_orders') || 'Min orders')}" min="0" style="flex:1;font-size:12.5px;">
          <input type="number" class="tier-min-spend" data-idx="${idx}" value="${tier.minSpend || ''}" placeholder="${escapeHtml(t('set.loyalty_min_spend') || 'Min spend')}" min="0" style="flex:1;font-size:12.5px;">
          <input type="number" class="tier-discount" data-idx="${idx}" value="${tier.discountPct || ''}" placeholder="${escapeHtml(t('set.loyalty_benefit') || 'Discount %')}" min="0" max="100" style="flex:1;font-size:12.5px;">
          <button class="btn small danger tier-del" data-idx="${idx}" aria-label="${escapeHtml(t('common.delete'))}">×</button>
        </div>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">Name · Min completed orders · Min total spend (${currencySymbol()}) · Auto-discount %</div>
    <div style="display:flex;gap:8px;">
      <button id="btnAddLoyaltyTier" class="btn small primary">${escapeHtml(t('set.loyalty_add_tier') || '+ Add tier')}</button>
      <button id="btnSaveLoyaltyTiers" class="btn small">${escapeHtml(t('common.save'))}</button>
    </div>`;

  el.querySelector('#btnAddLoyaltyTier')?.addEventListener('click', () => {
    settings.loyaltyTiers = settings.loyaltyTiers || [];
    settings.loyaltyTiers.push({ name: '', minOrders: 5, minSpend: 0, discountPct: 0 });
    renderLoyaltyTiersSettings();
  });

  el.querySelector('#btnSaveLoyaltyTiers')?.addEventListener('click', () => {
    const rows = el.querySelectorAll('[data-idx]');
    const seen = new Set();
    rows.forEach(inp => {
      const idx = parseInt(inp.dataset.idx, 10);
      if (!seen.has(idx)) seen.add(idx);
    });
    const newTiers = [];
    seen.forEach(idx => {
      const name = el.querySelector(`.tier-name[data-idx="${idx}"]`)?.value.trim() || '';
      const minOrders = +(el.querySelector(`.tier-min-orders[data-idx="${idx}"]`)?.value || 0);
      const minSpend  = +(el.querySelector(`.tier-min-spend[data-idx="${idx}"]`)?.value || 0);
      const discountPct = +(el.querySelector(`.tier-discount[data-idx="${idx}"]`)?.value || 0);
      if (name) newTiers.push({ name, minOrders, minSpend, discountPct });
    });
    settings.loyaltyTiers = newTiers;
    saveAll();
    toast(t('common.save'), 'success');
    renderLoyaltyTiersSettings();
  });

  el.querySelectorAll('.tier-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      settings.loyaltyTiers = (settings.loyaltyTiers || []).filter((_, i) => i !== idx);
      saveAll();
      renderLoyaltyTiersSettings();
    });
  });
}

/* ============================================================
   Feature 6 (new 8-pack): Capacity check — estimate when a machine's
   queue will clear, accounting for working hours.
   ============================================================ */

function renderWebhookSettings() {
  const el = $('#webhookSettingsSection');
  if (!el) return;
  const wh = settings.webhooks || {};
  const events = [
    { key: 'order_created',    label: 'Order created' },
    { key: 'status_changed',   label: 'Status changed' },
    { key: 'payment_received', label: 'Payment received' },
    { key: 'quote_approved',   label: 'Quote approved' },
    { key: 'order_delivered',  label: 'Order delivered' },
  ];
  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:14px;">
      <input type="checkbox" id="whk_enabled" style="width:auto;margin:0;" ${wh.enabled ? 'checked' : ''}>
      <span data-i18n="whk.enabled">Enable outbound webhooks</span>
    </label>
    <div style="margin-bottom:12px;">
      <label data-i18n="whk.secret">Signing secret (HMAC-SHA256, optional)</label>
      <input type="text" id="whk_secret" value="${escapeHtml(wh.secret||'')}" placeholder="my-secret-key" style="font-family:var(--font-mono,monospace);">
    </div>
    <h4 style="margin:0 0 10px;font-size:13px;font-weight:600;" data-i18n="whk.event_urls">Webhook URLs per event</h4>
    ${events.map(ev => `
      <div style="margin-bottom:10px;">
        <label style="font-size:12px;color:var(--text-dim);">${escapeHtml(ev.label)}</label>
        <input type="url" id="whk_${ev.key}" value="${escapeHtml((wh.events||{})[ev.key]||'')}" placeholder="https://hooks.zapier.com/...">
      </div>`).join('')}
    <button class="btn primary" id="btnSaveWebhooks" data-i18n="common.save">Save</button>
    <button class="btn ghost small" id="btnTestWebhook" style="margin-inline-start:8px;" data-i18n="whk.test">Test (send ping)</button>`;

  el.querySelector('#btnSaveWebhooks').addEventListener('click', () => {
    settings.webhooks = {
      enabled: el.querySelector('#whk_enabled').checked,
      secret:  el.querySelector('#whk_secret').value.trim(),
      events:  Object.fromEntries(events.map(ev => [ev.key, el.querySelector(`#whk_${ev.key}`).value.trim()]))
    };
    saveAll();
    toast(t('webhook.saved'), 'success');
  });
  el.querySelector('#btnTestWebhook').addEventListener('click', async () => {
    const url = el.querySelector('#whk_status_changed')?.value || Object.values((settings.webhooks?.events||{})).find(Boolean);
    if (!url) { toast(t('webhook.enter_url'), 'warning'); return; }
    const res = await window.hubAPI?.fireWebhook?.(url, 'ping', { message: 'Khayt webhook test' }, settings.webhooks?.secret || '');
    if (res?.ok) toast('✅ Webhook delivered!', 'success');
    else toast(`⚠ Webhook failed: ${res?.error || res?.status || '?'}`, 'error');
  });
}

/* beta.19 — Signed event webhooks (developer). One HTTPS endpoint receives the
   normalized, HMAC-signed `order.*` envelope built by lib/webhooks.js. Distinct
   from the per-event Zapier hooks above. */
function renderEventWebhookSettings() {
  const el = $('#eventWebhookSection');
  if (!el) return;
  const w = settings.eventWebhooks || {};
  const ev = w.events || {};
  const events = [
    { key: 'created', label: t('ewh.ev_created') || 'order.created' },
    { key: 'status',  label: t('ewh.ev_status')  || 'order.status (status changed)' },
    { key: 'paid',    label: t('ewh.ev_paid')    || 'order.paid (fully paid)' },
  ];
  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:14px;">
      <input type="checkbox" id="ewh_enabled" style="width:auto;margin:0;" ${w.enabled ? 'checked' : ''}>
      <span data-i18n="ewh.enabled">Enable signed event webhooks</span>
    </label>
    <div style="margin-bottom:12px;">
      <label data-i18n="ewh.url">Endpoint URL (https only)</label>
      <input type="url" id="ewh_url" value="${escapeHtml(w.url || '')}" placeholder="https://api.example.com/khayt/webhook">
    </div>
    <div style="margin-bottom:12px;">
      <label data-i18n="ewh.secret">Signing secret (HMAC-SHA256)</label>
      <input type="text" id="ewh_secret" value="${escapeHtml(w.secret || '')}" placeholder="whsec_…" style="font-family:var(--font-mono,monospace);">
    </div>
    <h4 style="margin:0 0 10px;font-size:13px;font-weight:600;" data-i18n="ewh.events">Events to send</h4>
    ${events.map(e => `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;font-size:12.5px;">
        <input type="checkbox" id="ewh_ev_${e.key}" style="width:auto;margin:0;" ${ev[e.key] === false ? '' : 'checked'}>
        <span>${escapeHtml(e.label)}</span>
      </label>`).join('')}
    <div style="margin-top:12px;">
      <button class="btn primary" id="btnSaveEwh" data-i18n="common.save">Save</button>
      <button class="btn ghost small" id="btnTestEwh" style="margin-inline-start:8px;" data-i18n="ewh.test">Test (send sample)</button>
    </div>`;

  el.querySelector('#btnSaveEwh').addEventListener('click', () => {
    settings.eventWebhooks = {
      enabled: el.querySelector('#ewh_enabled').checked,
      url:     el.querySelector('#ewh_url').value.trim(),
      secret:  el.querySelector('#ewh_secret').value.trim(),
      events:  Object.fromEntries(events.map(e => [e.key, el.querySelector(`#ewh_ev_${e.key}`).checked])),
    };
    saveAll();
    toast(t('webhook.saved') || 'Saved', 'success');
  });
  el.querySelector('#btnTestEwh').addEventListener('click', async () => {
    const url = el.querySelector('#ewh_url').value.trim();
    if (!/^https:\/\//i.test(url)) { toast(t('ewh.enter_url') || 'Enter an https:// URL first', 'warning'); return; }
    const secret = el.querySelector('#ewh_secret').value.trim();
    const sample = (typeof KhaytWebhooks !== 'undefined')
      ? KhaytWebhooks.buildWebhookEvent('created',
          { id: 'SAMPLE-1', project: 'Test order', status: 'pending', paymentStatus: 'unpaid', price: 100 },
          { at: new Date().toISOString(), shopName: settings.bizEn || settings.bizAr || 'Khayt', clientName: 'Test client', currency: (typeof currencySymbol === 'function') ? currencySymbol() : '' })
      : { id: 'SAMPLE-1', event: 'order.created' };
    const res = await window.hubAPI?.webhookPost?.({ url, secret, payload: sample });
    if (res?.ok) toast('✅ Webhook delivered!', 'success');
    else toast(`⚠ ${res?.error || 'HTTP ' + (res?.status || '?')}`, 'error');
  });
}

/* ============================================================
   Round 12 — Feature 2: Aged-Receivables Report
   ============================================================ */

function renderFixedCostSettings() {
  const el = $('#fixedCostsSection');
  if (!el) return;
  const fixedCosts = settings.fixedCosts || [];
  el.innerHTML = `
    <div id="fixedCostList" style="margin-bottom:12px;">
      ${fixedCosts.length === 0 ? '<p style="color:var(--text-muted);font-size:12.5px;margin:0;">No fixed costs added yet.</p>' :
        fixedCosts.map((c, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
            <span style="flex:1;">${escapeHtml(c.name)}</span>
            <strong>${fmtPrice(c.amount)}</strong>
            <button class="btn danger small" data-del-fc="${i}" aria-label="${escapeHtml(t('common.delete'))}">✕</button>
          </div>`).join('')
      }
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <input type="text"   id="fcName"   placeholder="e.g. Rent"   style="flex:2;min-width:120px;">
      <input type="number" id="fcAmount" placeholder="Amount/month" style="flex:1;min-width:100px;" min="0" step="0.01">
      <button class="btn primary" id="btnAddFixedCost">+ Add</button>
    </div>`;

  el.querySelectorAll('[data-del-fc]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal(t('common.delete') + '?', { danger: true });
      if (!ok) return;
      settings.fixedCosts.splice(parseInt(btn.dataset.delFc), 1);
      saveAll(); renderFixedCostSettings(); renderBreakEvenCard();
    });
  });
  el.querySelector('#btnAddFixedCost')?.addEventListener('click', () => {
    const name = el.querySelector('#fcName').value.trim();
    const amount = parseFloat(el.querySelector('#fcAmount').value) || 0;
    if (!name || amount <= 0) { toast(t('set.fixed_cost_name_amt'), 'warning'); return; }
    settings.fixedCosts = [...(settings.fixedCosts || []), { id: Date.now().toString(36), name, amount }];
    saveAll(); renderFixedCostSettings(); renderBreakEvenCard();
    el.querySelector('#fcName').value = '';
    el.querySelector('#fcAmount').value = '';
  });
}

/* Carrier tracking URLs — renderer/integrations.js (getCarrierTrackingUrl) */

function renderLanApiSettings() {
  const el = $('#lanApiSection');
  if (!el) return;
  migrateLanApiSettings();
  const lan = settings.lanApi || {};

  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:14px;">
      <input type="checkbox" id="lan_enabled" style="width:auto;margin:0;" ${lan.enabled ? 'checked' : ''}>
      <span data-i18n="lan.enabled">Enable LAN REST API</span>
    </label>
    <div class="inline-pair">
      <div>
        <label data-i18n="lan.port">Port</label>
        <input type="number" id="lan_port" value="${lan.port || 3219}" min="1024" max="65535">
      </div>
      <div>
        <label data-i18n="lan.pin">Owner LAN PIN (queue API, kiosk, tunnel)</label>
        <input type="password" id="lan_pin" value="${escapeHtml(secretInputValue(lan.pin))}" maxlength="12" placeholder="${escapeHtml(secretFieldPlaceholder(lan.pin) || 'e.g. 1234')}" autocomplete="off">
      </div>
    </div>
    <div class="inline-pair" style="margin-top:10px;">
      <div>
        <label data-i18n="lan.intake_pin">Intake form PIN (customers)</label>
        <input type="text" id="lan_intake_pin" value="${escapeHtml(secretInputValue(lan.intakePin))}" maxlength="12" placeholder="${escapeHtml(secretFieldPlaceholder(lan.intakePin) || 'Auto-generated on start')}" autocomplete="off" style="font-family:monospace;letter-spacing:.1em;">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;" data-i18n="lan.intake_pin_hint">Optional legacy PIN — customers open /intake directly; no PIN required on current versions</div>
        <div id="lanIntakePinLive" style="font-size:11px;color:var(--text-muted);margin-top:4px;display:none;"></div>
      </div>
    </div>
    <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin-top:10px;">
      <input type="checkbox" id="lan_bind_lan" style="width:auto;margin:3px 0 0;" ${lan.bindLan || settings.onlineEnabled ? 'checked' : ''}>
      <span>
        <span data-i18n="lan.bind_lan">Listen on all network interfaces (LAN)</span>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-weight:400;" data-i18n="lan.bind_lan_hint">Required for phones and other computers on your shop Wi‑Fi. Off = this Mac only.</div>
      </span>
    </label>
    <div style="font-size:11px;color:var(--text-muted);margin:4px 0 10px;padding:8px 10px;background:var(--bg-elev);border-radius:var(--radius);word-break:break-all;">
      Customer intake form: <code style="font-size:11px;">/intake</code> — scan the QR or open this path on your shop Wi‑Fi (no PIN required).
    </div>
    <div class="inline-pair" style="margin-top:10px;">
      <div style="flex:1;">
        <label data-i18n="lan.webhook_token">Printer Webhook Token</label>
        <div style="display:flex;gap:6px;">
          <input type="password" id="lan_wh_token" value="${escapeHtml(secretInputValue(lan.webhookToken))}" placeholder="${escapeHtml(secretFieldPlaceholder(lan.webhookToken) || 'e.g. secret123')}" style="flex:1;" autocomplete="off">
          <button class="btn ghost small" id="btnGenWebhookToken" title="Generate random token" aria-label="Generate random token"><span aria-hidden="true">🎲</span></button>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;" data-i18n="lan.webhook_token_hint">Used to authenticate printer webhook calls</div>
      </div>
    </div>
    <div class="inline-pair" style="margin-top:10px;">
      <div style="flex:1;">
        <label data-i18n="lan.salla_secret">Salla webhook secret</label>
        <input type="password" id="lan_salla_secret" value="${escapeHtml(secretInputValue(lan.sallaWebhookSecret))}" placeholder="${escapeHtml(secretFieldPlaceholder(lan.sallaWebhookSecret) || 'From Salla dashboard')}" autocomplete="off">
      </div>
      <div style="flex:1;">
        <label data-i18n="lan.zid_secret">Zid webhook secret</label>
        <input type="password" id="lan_zid_secret" value="${escapeHtml(secretInputValue(lan.zidWebhookSecret))}" placeholder="${escapeHtml(secretFieldPlaceholder(lan.zidWebhookSecret) || 'From Zid dashboard')}" autocomplete="off">
      </div>
    </div>
    <div id="lanStatusRow" style="margin:12px 0;padding:10px 12px;background:var(--bg-elev);border-radius:var(--radius);font-size:13px;">${lan.enabled ? '🟢 Server active' : '⚫ Server stopped'}</div>
    <div id="lanQrWrap" style="margin-bottom:12px;display:${lan.enabled ? 'block' : 'none'};"></div>
    <div id="lanWebhookSection" style="display:${lan.enabled && lan.webhookToken ? 'block' : 'none'};margin:10px 0;">
      <label data-i18n="lan.printer_webhook">Printer Webhook URL</label>
      <div style="font-size:11px;color:var(--text-muted);padding:8px 10px;background:var(--bg-elev);border-radius:var(--radius);word-break:break-all;cursor:pointer;" id="webhookUrlDisplay" title="Click to copy">—</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;" data-i18n="lan.webhook_url_hint">Configure this URL in OctoPrint/Moonraker webhook plugin for each machine.</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn primary" id="btnSaveLan" data-i18n="common.save">Save</button>
      <button class="btn ghost" id="btnStartLan" data-i18n="lan.start">Start server</button>
      <button class="btn ghost" id="btnStopLan"  data-i18n="lan.stop">Stop server</button>
    </div>
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:10px;">
        <input type="checkbox" id="lan_tunnel_enabled" style="width:auto;margin:0;" ${lan.tunnelEnabled ? 'checked' : ''}>
        <span data-i18n="lan.tunnel_enable">Enable remote tunnel (via localtunnel.me)</span>
      </label>
      <div id="tunnelStatusRow" style="font-size:13px;padding:8px 12px;background:var(--bg-elev);border-radius:var(--radius);margin-bottom:8px;">
        ⚫ Tunnel inactive
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn ghost small" id="btnStartTunnel" data-i18n="lan.tunnel_start">Start Tunnel</button>
        <button class="btn ghost small" id="btnStopTunnel" data-i18n="lan.tunnel_stop">Stop Tunnel</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px;" data-i18n="lan.tunnel_hint">Exposes your LAN server to the internet via a temporary URL. Requires LAN server to be running.</div>
      <div style="font-size:11px;color:var(--danger);margin-top:8px;padding:8px 10px;background:rgba(239,68,68,0.08);border-radius:var(--radius);" data-i18n="lan.tunnel_security_warning">Warning: the tunnel exposes your full LAN API surface to the internet. Set a strong owner PIN and disable when not needed.</div>
    </div>`;

  if (lan.enabled) {
    loadLanQr();
    refreshLanIntakePinLive?.();
  }

  el.querySelector('#btnSaveLan')?.addEventListener('click', () => {
    saveLanApiSettingsFromForm({ restartServer: true });
    toast('LAN API settings saved', 'success');
  });

  el.querySelector('#btnStartLan')?.addEventListener('click', startLanServer);
  el.querySelector('#btnStopLan')?.addEventListener('click', async () => {
    await window.hubAPI?.stopLanServer?.();
    el.querySelector('#lanStatusRow').textContent = '⚫ Server stopped';
    el.querySelector('#lanQrWrap').style.display = 'none';
  });

  el.querySelector('#btnGenWebhookToken')?.addEventListener('click', () => {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    const token = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
    el.querySelector('#lan_wh_token').value = token;
  });

  el.querySelector('#btnStartTunnel')?.addEventListener('click', () => {
    startTunnelFromSettings?.({ confirm: true });
  });

  el.querySelector('#btnStopTunnel')?.addEventListener('click', async () => {
    await window.hubAPI?.stopTunnel?.();
    const tRow = el.querySelector('#tunnelStatusRow');
    if (tRow) tRow.textContent = '⚫ Tunnel inactive';
  });

  el.querySelector('#webhookUrlDisplay')?.addEventListener('click', () => {
    const url = el.querySelector('#webhookUrlDisplay').textContent;
    if (url && url !== '—') navigator.clipboard.writeText(url).then(() => toast(t('common.copied'), 'success')).catch(() => {});
  });
}

function renderZatcaPhase2Settings() {
  const el = $('#zatcaPhase2Section');
  if (!el) return;
  // ZATCA Phase 2 (cryptographic e-invoicing) is a Professional-only feature —
  // don't render its onboarding UI in Simple mode (nav pane is .biz-only, but
  // this Pro block sits inside it). CSS .pro-only hides it too; this skips work.
  const pro = (typeof KhaytTiers !== 'undefined')
    ? KhaytTiers.isProMode(settings.mode)
    : ((settings.mode || 'professional') === 'professional');
  if (!pro) { el.innerHTML = ''; return; }
  const z2 = settings.zatcaPhase2 || {};
  const hasKey = !!(z2.cn); // crude check — replaced by IPC status
  const hasCsid  = !!z2.csid;
  const hasPcsid = !!z2.pcsid;

  const stepClass = (done) => done ? 'style="color:var(--success)"' : '';
  el.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:12px;">
      <input type="checkbox" id="z2_enabled" style="width:auto;margin:0;" ${z2.enabled ? 'checked' : ''}>
      <span data-i18n="zatca2.enable">Enable ZATCA Phase 2 (cryptographic invoices)</span>
    </label>
    <div id="z2Body" style="${z2.enabled ? '' : 'display:none;'}">
      <div class="inline-pair">
        <div>
          <label data-i18n="zatca2.environment">Environment</label>
          <select id="z2_env">
            <option value="sandbox" ${z2.environment !== 'production' ? 'selected' : ''}>Sandbox (testing)</option>
            <option value="production" ${z2.environment === 'production' ? 'selected' : ''}>Production</option>
          </select>
        </div>
        <div>
          <label data-i18n="zatca2.city">City (for CSR)</label>
          <input type="text" id="z2_city" value="${escapeHtml(z2.city || 'Riyadh')}" placeholder="Riyadh">
        </div>
      </div>
      <div class="inline-pair">
        <div>
          <label data-i18n="zatca2.org">Organization name (for CSR)</label>
          <input type="text" id="z2_org" value="${escapeHtml(z2.org || settings.bizEn || '')}" placeholder="My Shop LLC">
        </div>
        <div>
          <label data-i18n="zatca2.industry">Industry (for CSR)</label>
          <input type="text" id="z2_industry" value="${escapeHtml(z2.industry || '3D Printing')}" placeholder="3D Printing">
        </div>
      </div>

      <h4 style="margin:16px 0 10px;font-size:13px;color:var(--text-muted);" data-i18n="zatca2.steps_title">Onboarding Steps</h4>

      <!-- Step 1: Key pair -->
      <div style="margin-bottom:12px;padding:12px;background:var(--bg-elev);border-radius:var(--radius);">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px;">
          <span ${stepClass(hasKey)}>● </span><span data-i18n="zatca2.step1">Step 1 — Generate Device Key Pair</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;" data-i18n="zatca2.step1_hint">Creates an ECDSA secp256k1 key pair. Private key is encrypted at rest.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn ghost small" id="btnZ2GenKey" data-i18n="zatca2.gen_key">Generate Key Pair</button>
          <button class="btn ghost small" id="btnZ2ShowKey" data-i18n="zatca2.show_pubkey">Show Public Key</button>
        </div>
        <div id="z2KeyStatus" style="font-size:11px;margin-top:6px;color:var(--text-muted);"></div>
      </div>

      <!-- Step 2: CSR -->
      <div style="margin-bottom:12px;padding:12px;background:var(--bg-elev);border-radius:var(--radius);">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px;">
          <span data-i18n="zatca2.step2">Step 2 — Generate CSR &amp; Get CSID</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;" data-i18n="zatca2.step2_hint">Submit the CSR to ZATCA's Fatoorah portal to get a compliance CSID (OTP required).</div>
        <label data-i18n="zatca2.egs_cn">EGS Common Name (format: 1-{OIC}{CR}|{brand}|{serial})</label>
        <input type="text" id="z2_cn" value="${escapeHtml(z2.cn || '')}" placeholder="1-123456789-1|MyShop|SN001" style="margin-bottom:8px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <button class="btn ghost small" id="btnZ2GenCsr" data-i18n="zatca2.gen_csr">Generate CSR</button>
        </div>
        <div id="z2CsrOut" style="display:none;margin-bottom:8px;">
          <label data-i18n="zatca2.csr_label">CSR (copy and submit to ZATCA)</label>
          <textarea id="z2CsrText" rows="4" style="font-family:monospace;font-size:10px;width:100%;resize:vertical;" readonly></textarea>
          <button class="btn ghost small" id="btnZ2CopyCsr" style="margin-top:4px;" data-i18n="zatca2.copy_csr">Copy CSR</button>
        </div>
        <label data-i18n="zatca2.otp_label">OTP (from ZATCA Fatoorah portal)</label>
        <input type="text" id="z2_otp" placeholder="123456" maxlength="6" style="margin-bottom:8px;">
        <button class="btn ghost small" id="btnZ2GetCsid" data-i18n="zatca2.get_csid">Get CSID from ZATCA</button>
        <div id="z2CsidStatus" style="font-size:11px;margin-top:6px;"></div>
      </div>

      <!-- Step 3: Production CSID -->
      <div style="margin-bottom:12px;padding:12px;background:var(--bg-elev);border-radius:var(--radius);">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px;">
          <span ${stepClass(hasPcsid)}>● </span><span data-i18n="zatca2.step3">Step 3 — Upgrade to Production CSID</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;" data-i18n="zatca2.step3_hint">Run compliance checks, then upgrade. Leave blank if staying on sandbox.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn ghost small" id="btnZ2GetPcsid" data-i18n="zatca2.get_pcsid">Get Production CSID</button>
        </div>
        <div id="z2PcsidStatus" style="font-size:11px;margin-top:6px;color:var(--text-muted);">${hasPcsid ? '✅ Production CSID stored' : hasCsid ? '🔵 Compliance CSID ready' : '—'}</div>
      </div>

      <!-- Step 4: Submit invoices -->
      <div style="padding:12px;background:var(--bg-elev);border-radius:var(--radius);">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px;" data-i18n="zatca2.step4">Step 4 — Submit invoices to ZATCA</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;" data-i18n="zatca2.step4_hint">Completed invoices auto-submit when Phase 2 is enabled. Retry manually from the Orders log.</div>
        <label style="display:flex;align-items:center;gap:8px;margin:10px 0;font-weight:400;">
          <input type="checkbox" id="z2_autoSubmit" style="width:auto;margin:0;" ${z2.autoSubmit !== false ? 'checked' : ''}>
          <span data-i18n="zatca2.auto_submit">Auto-submit when invoice is generated</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin:0 0 10px;font-weight:400;">
          <input type="checkbox" id="z2_emailAfterSubmit" style="width:auto;margin:0;" ${z2.emailAfterSubmit ? 'checked' : ''}>
          <span data-i18n="zatca2.email_after_submit">Email invoice to client after successful submission</span>
        </label>
        <div id="z2SubmitStatus" style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
          ${(z2.invoiceCounter||0) > 0 ? `✅ ${z2.invoiceCounter} ${escapeHtml(t('zatca2.invoices_submitted') || 'invoice(s) submitted')}` : t('zatca2.no_submissions')}
        </div>
        <div id="z2SubmissionLog" style="max-height:180px;overflow:auto;font-size:11px;"></div>
      </div>

      <button class="btn primary" id="btnZ2Save" style="margin-top:14px;" data-i18n="common.save">Save Phase 2 Settings</button>
    </div>`;

  // Toggle body visibility
  el.querySelector('#z2_enabled')?.addEventListener('change', (e) => {
    const body = el.querySelector('#z2Body');
    if (body) body.style.display = e.target.checked ? '' : 'none';
  });

  // Save
  el.querySelector('#btnZ2Save')?.addEventListener('click', () => {
    settings.zatcaPhase2 = {
      ...settings.zatcaPhase2,
      enabled:     el.querySelector('#z2_enabled').checked,
      environment: el.querySelector('#z2_env').value,
      cn:          el.querySelector('#z2_cn').value.trim(),
      org:         el.querySelector('#z2_org').value.trim(),
      city:        el.querySelector('#z2_city').value.trim(),
      industry:    el.querySelector('#z2_industry').value.trim(),
      autoSubmit:  el.querySelector('#z2_autoSubmit')?.checked !== false,
      emailAfterSubmit: !!el.querySelector('#z2_emailAfterSubmit')?.checked,
    };
    saveAll();
    toast(t('zatca2.saved'), 'success');
  });

  // Generate key pair
  el.querySelector('#btnZ2GenKey')?.addEventListener('click', async () => {
    const res = await window.hubAPI?.zatcaGenKeypair?.();
    const ks = el.querySelector('#z2KeyStatus');
    if (res?.ok) {
      if (ks) ks.textContent = '✅ Key pair generated and encrypted on disk';
      toast(t('zatca2.key_generated'), 'success');
    } else {
      if (ks) ks.textContent = `❌ ${res?.error || 'Failed'}`;
    }
  });

  // Show public key
  el.querySelector('#btnZ2ShowKey')?.addEventListener('click', async () => {
    const res = await window.hubAPI?.zatcaGetPubkey?.();
    const ks = el.querySelector('#z2KeyStatus');
    if (res?.ok) {
      if (ks) ks.innerHTML = `<details><summary>Public Key (click to expand)</summary><pre style="font-size:9px;white-space:pre-wrap;word-break:break-all;">${escapeHtml(res.publicKey)}</pre></details>`;
    } else {
      if (ks) ks.textContent = 'No key pair found — generate one first';
    }
  });

  // Generate CSR
  el.querySelector('#btnZ2GenCsr')?.addEventListener('click', async () => {
    const cn = el.querySelector('#z2_cn').value.trim();
    const org = el.querySelector('#z2_org').value.trim() || settings.bizEn || '';
    const vat = settings.vat || '';
    if (!cn) { toast(t('zatca2.cn_required'), 'warning'); return; }
    const res = await window.hubAPI?.zatcaGenCsr?.({
      cn, org, vat,
      invoiceType: '1100',
      location: el.querySelector('#z2_city').value.trim() || 'Riyadh',
      industry: el.querySelector('#z2_industry').value.trim() || '3D Printing',
    });
    if (res?.ok) {
      const out = el.querySelector('#z2CsrOut');
      const txt = el.querySelector('#z2CsrText');
      if (out) out.style.display = 'block';
      if (txt) txt.value = res.csr;
    } else {
      toast(res?.error || t('zatca2.csr_failed'), 'error');
    }
  });

  // Copy CSR
  el.querySelector('#btnZ2CopyCsr')?.addEventListener('click', () => {
    const txt = el.querySelector('#z2CsrText');
    if (txt?.value) navigator.clipboard.writeText(txt.value).then(() => toast(t('common.copied'), 'success')).catch(() => {});
  });

  // Get CSID from ZATCA
  el.querySelector('#btnZ2GetCsid')?.addEventListener('click', async () => {
    const csrTxt = el.querySelector('#z2CsrText')?.value;
    const otp = el.querySelector('#z2_otp')?.value.trim();
    const env = el.querySelector('#z2_env').value;
    if (!csrTxt) { toast(t('zatca2.gen_csr_first'), 'warning'); return; }
    if (!otp) { toast(t('zatca2.otp_required'), 'warning'); return; }
    const csrB64 = csrTxt.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const st = el.querySelector('#z2CsidStatus');
    if (st) st.textContent = '⏳ Contacting ZATCA…';
    const res = await window.hubAPI?.zatcaCompliance?.({ csrBase64: csrB64, otp, environment: env });
    if (res?.ok) {
      settings.zatcaPhase2 = { ...settings.zatcaPhase2, csid: res.csid };
      saveAll();
      if (st) st.textContent = `✅ Compliance CSID stored (request ID: ${res.requestId || 'N/A'})`;
      toast(t('zatca2.csid_received'), 'success');
    } else {
      if (st) st.textContent = `❌ ${res?.error || JSON.stringify(res?.body || '')}`;
    }
  });

  // Get Production CSID
  el.querySelector('#btnZ2GetPcsid')?.addEventListener('click', async () => {
    const csid = settings.zatcaPhase2?.csid;
    const env = el.querySelector('#z2_env').value;
    if (!csid) { toast(t('zatca2.need_csid_first'), 'warning'); return; }
    const ps = el.querySelector('#z2PcsidStatus');
    if (ps) ps.textContent = '⏳ Upgrading…';
    const res = await window.hubAPI?.zatcaProductionCsid?.({ csid, environment: env });
    if (res?.ok) {
      settings.zatcaPhase2 = { ...settings.zatcaPhase2, pcsid: res.pcsid };
      saveAll();
      if (ps) ps.textContent = '✅ Production CSID stored';
      toast(t('zatca2.pcsid_received'), 'success');
    } else {
      if (ps) ps.textContent = `❌ ${res?.error || JSON.stringify(res?.body || '')}`;
    }
  });

  const logEl = el.querySelector('#z2SubmissionLog');
  const subs = (settings.zatcaPhase2?.submissions || []).slice(0, 20);
  if (logEl) {
    if (!subs.length) {
      logEl.innerHTML = `<p style="color:var(--text-muted);margin:0;">${escapeHtml(t('zatca2.log_empty') || 'No submission attempts yet.')}</p>`;
    } else {
      logEl.innerHTML = `<table style="width:100%;border-collapse:collapse;">
        <thead><tr style="text-align:left;color:var(--text-muted);">
          <th style="padding:4px 6px;">${escapeHtml(t('inv.date') || 'Date')}</th>
          <th style="padding:4px 6px;">${escapeHtml(t('inv.invoice_no') || 'Invoice')}</th>
          <th style="padding:4px 6px;">${escapeHtml(t('common.status') || 'Status')}</th>
        </tr></thead>
        <tbody>${subs.map(s => {
          const color = s.status === 'accepted' ? 'var(--success)' : s.status === 'rejected' ? 'var(--danger)' : 'var(--warning)';
          return `<tr style="border-top:1px solid var(--border);">
            <td style="padding:4px 6px;">${escapeHtml((s.at || '').slice(0, 10))}</td>
            <td style="padding:4px 6px;">${escapeHtml(s.invoiceNumber || s.orderId || '—')}</td>
            <td style="padding:4px 6px;color:${color};">${escapeHtml(s.status || '—')}</td>
          </tr>`;
        }).join('')}</tbody></table>`;
    }
  }
}

function renderExchangeRatesSettings() {
  const el = $('#exchangeRatesSection');
  if (!el) return;
  const base = settings.currency || 'SAR';
  const rates = settings.exchangeRates || {};
  const otherCurrencies = Object.entries(CURRENCIES).filter(([code]) => code !== base);

  const rows = otherCurrencies.map(([code, cur]) => {
    const rate = rates[code] || '';
    return `<tr>
      <td style="padding:6px 8px;font-size:12.5px;">
        <strong>${escapeHtml(code)}</strong>
        <span style="color:var(--text-muted);margin-inline-start:4px;font-size:11px;">${escapeHtml(cur.label)}</span>
      </td>
      <td style="padding:6px 8px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:11px;color:var(--text-muted);">1 ${escapeHtml(code)} =</span>
          <input type="number" class="xr-input" data-code="${escapeHtml(code)}" aria-label="1 ${escapeHtml(code)} = ? ${escapeHtml(base)}" value="${escapeHtml(String(rate))}" min="0" step="0.0001" placeholder="0.00" style="width:90px;padding:3px 6px;font-size:12px;">
          <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(base)}</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const updatedAt = settings.exchangeRatesUpdatedAt;
  const updatedHtml = updatedAt
    ? `<span style="font-size:11px;color:var(--text-muted);">${escapeHtml((t('xr.updated') || 'Updated') + ' ' + new Date(updatedAt).toLocaleString())}</span>`
    : '';
  el.innerHTML = `
    <div style="margin-bottom:6px;">
      <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px;">${escapeHtml(t('xr.hint') || 'Exchange rates are used to convert foreign-currency orders into your base currency for analytics reporting.')}</p>
      <div style="display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap;">
        <button type="button" id="xrFetchBtn" class="btn small">⟳ ${escapeHtml(t('xr.fetch') || 'Fetch live rates')}</button>
        ${updatedHtml}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);">
            <th style="padding:6px 8px;text-align:start;font-weight:600;color:var(--text-muted);font-size:11px;">${escapeHtml(t('xr.currency') || 'Currency')}</th>
            <th style="padding:6px 8px;text-align:start;font-weight:600;color:var(--text-muted);font-size:11px;">${escapeHtml(t('xr.rate') || 'Rate')} (${escapeHtml(t('xr.rate_hint') || 'base currency units per 1 foreign unit')})</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  el.querySelectorAll('.xr-input').forEach(input => {
    input.addEventListener('input', () => {
      const code = input.dataset.code;
      const val = parseFloat(input.value);
      if (!settings.exchangeRates) settings.exchangeRates = {};
      if (!isNaN(val) && val > 0) {
        settings.exchangeRates[code] = val;
      } else {
        delete settings.exchangeRates[code];
      }
      saveAll();
    });
  });

  const fetchBtn = el.querySelector('#xrFetchBtn');
  fetchBtn?.addEventListener('click', async () => {
    if (!window.hubAPI?.fetchExchangeRates) return;
    const base = settings.currency || 'SAR';
    const orig = fetchBtn.textContent;
    fetchBtn.disabled = true;
    fetchBtn.textContent = (t('xr.fetching') || 'Fetching…');
    try {
      const res = await window.hubAPI.fetchExchangeRates(base);
      if (res && res.ok && res.rates) {
        if (!settings.exchangeRates) settings.exchangeRates = {};
        let n = 0;
        for (const [code, rate] of Object.entries(res.rates)) {
          if (CURRENCIES[code] && +rate > 0) { settings.exchangeRates[code] = +(+rate).toFixed(4); n++; }
        }
        settings.exchangeRatesUpdatedAt = res.updatedAt || new Date().toISOString();
        saveAll();
        renderExchangeRatesSettings();
        toast((t('xr.fetched') || 'Updated {n} rates vs {base}').replace('{n}', n).replace('{base}', base), 'success');
      } else {
        fetchBtn.disabled = false; fetchBtn.textContent = orig;
        toast((t('xr.fetch_failed') || 'Could not fetch rates') + (res && res.error ? `: ${res.error}` : ''), 'error', 5000);
      }
    } catch (e) {
      fetchBtn.disabled = false; fetchBtn.textContent = orig;
      toast((t('xr.fetch_failed') || 'Could not fetch rates') + `: ${e.message || e}`, 'error', 5000);
    }
  });
}

function renderBnplSettings() {
  const el = $('#bnplSection');
  if (!el) return;
  const b = settings.bnpl || {};

  // Build config rows for API-integrated services
  const apiSvcs = [
    { id: 'tabby',  label: 'Tabby',  fields: [
        { key: 'apiKey',       label: t('bnpl.api_key'),       type: 'password', ph: 'sk_test_...' },
        { key: 'merchantCode', label: t('bnpl.merchant_code'), type: 'text',     ph: 'MERCHANT_CODE' },
        { key: 'currency',     label: t('bnpl.currency'),      type: 'text',     ph: 'SAR' },
    ]},
    { id: 'tamara', label: 'Tamara', fields: [
        { key: 'apiKey',            label: t('bnpl.api_key'),            type: 'password', ph: 'Bearer token...' },
        { key: 'notificationToken', label: t('bnpl.notification_token'), type: 'password', ph: 'Notification token' },
        { key: 'currency',          label: t('bnpl.currency'),           type: 'text',     ph: 'SAR' },
        { key: 'country',           label: t('bnpl.country'),            type: 'text',     ph: 'SA' },
    ]},
    { id: 'stripe', label: 'Stripe', fields: [
        { key: 'apiKey',      label: t('bnpl.api_key'),     type: 'password', ph: 'sk_live_...' },
        { key: 'currency',    label: t('bnpl.currency'),    type: 'text',     ph: 'sar' },
        { key: 'successUrl',  label: t('bnpl.success_url'), type: 'text',     ph: 'https://...' },
        { key: 'cancelUrl',   label: t('bnpl.cancel_url'),  type: 'text',     ph: 'https://...' },
    ]},
  ];

  const apiRows = apiSvcs.map(svc => {
    const cfg = b[svc.id] || {};
    const flds = svc.fields.map(f =>
      `<div style="flex:1;min-width:140px;">
        <label style="font-size:11px;">${escapeHtml(f.label)}</label>
        <input type="${f.type}" id="bnpl_${svc.id}_${f.key}" value="${escapeHtml(cfg[f.key]||'')}" placeholder="${escapeHtml(f.ph)}" autocomplete="off">
      </div>`
    ).join('');
    return `
    <div style="padding:12px;background:var(--bg-elev);border-radius:var(--radius);margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;font-weight:600;">
        <input type="checkbox" id="bnpl_${svc.id}_en" style="width:auto;margin:0;" ${cfg.enabled?'checked':''}>
        <span style="color:${BNPL_CATALOG.find(c=>c.id===svc.id)?.color||'inherit'}">${escapeHtml(svc.label)}</span>
        <span style="font-size:11px;font-weight:400;color:var(--text-muted);">${escapeHtml(BNPL_CATALOG.find(c=>c.id===svc.id)?.desc||'')}</span>
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${flds}</div>
    </div>`;
  }).join('');

  // Directory cards for info-only services
  const dirCards = BNPL_CATALOG.filter(s => !s.hasApi).map(s =>
    `<a href="#" class="bnpl-dir-card" data-url="${escapeHtml(s.dashUrl)}" style="display:flex;flex-direction:column;gap:4px;padding:10px 12px;background:var(--bg-elev);border-radius:var(--radius);border-inline-start:3px solid ${escapeHtml(s.color)};text-decoration:none;color:inherit;cursor:pointer;">
      <div style="font-weight:600;font-size:13px;">${escapeHtml(s.name)}</div>
      <div style="font-size:11px;color:var(--text-muted);">${s.regions.slice(0,5).join(' · ')}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escapeHtml(s.desc)}</div>
    </a>`
  ).join('');

  el.innerHTML = `
    <h4 style="margin-bottom:10px;font-size:13px;" data-i18n="bnpl.integrated">${t('bnpl.integrated')}</h4>
    ${apiRows}
    <button class="btn primary small" id="btnSaveBnpl" style="margin-bottom:18px;" data-i18n="common.save">${t('common.save')}</button>
    <h4 style="margin-bottom:8px;font-size:13px;" data-i18n="bnpl.directory">${t('bnpl.directory')}</h4>
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:10px;" data-i18n="bnpl.directory_hint">${t('bnpl.directory_hint')}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">${dirCards}</div>`;

  el.querySelector('#btnSaveBnpl')?.addEventListener('click', () => {
    const saved = {};
    for (const svc of apiSvcs) {
      saved[svc.id] = { enabled: el.querySelector(`#bnpl_${svc.id}_en`)?.checked || false };
      for (const f of svc.fields) {
        const curVal = (settings.bnpl || {})[svc.id]?.[f.key];
        saved[svc.id][f.key] = (f.type === 'password')
          ? secretInputSave(curVal, el.querySelector(`#bnpl_${svc.id}_${f.key}`)?.value)
          : (el.querySelector(`#bnpl_${svc.id}_${f.key}`)?.value?.trim() || '');
      }
    }
    settings.bnpl = { ...(settings.bnpl || {}), ...saved };
    saveAll();
    toast(t('bnpl.saved'), 'success');
  });

  el.querySelectorAll('.bnpl-dir-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const url = card.dataset.url;
      if (url) window.hubAPI?.openExternal?.(url);
    });
  });
}

// Shipping & fulfillment — per-carrier opt-in credentials (encrypted) + webhook secret
// and its displayed inbound URL. Manual shipping needs none of this; this only enables
// the API/webhook path for SMSA / Aramex / SPL. See docs/KHAYT-3.0-SHIPPING-SPEC.md.
function renderShippingSettings() {
  const el = $('#shippingSection');
  if (!el) return;
  const sh = settings.shipping || {};
  const carriers = [
    { id: 'smsa',   label: 'SMSA Express' },
    { id: 'aramex', label: 'Aramex' },
    { id: 'spl',    label: 'Saudi Post (SPL)' },
  ];
  const fields = [
    { key: 'apiKey',        label: t('ship.api_key') || 'API key',         type: 'password', ph: 'API key / token' },
    { key: 'accountNumber', label: t('ship.account') || 'Account number',  type: 'text',     ph: 'Account / customer #' },
    { key: 'webhookSecret', label: t('ship.webhook_secret') || 'Webhook secret', type: 'password', ph: 'Shared HMAC secret' },
  ];
  // Reuse the LAN base URL already resolved into the printer-webhook display (if the
  // server is running); otherwise show the relative path. Never throws on an undefined var.
  const baseUrl = (() => {
    const disp = document.getElementById('webhookUrlDisplay');
    const txt = disp && disp.textContent && disp.textContent !== '—' ? disp.textContent : '';
    const m = txt.match(/^(https?:\/\/[^/]+)/);
    return m ? m[1] : '';
  })();
  const rows = carriers.map(c => {
    const cfg = sh[c.id] || {};
    const flds = fields.map(f => `
      <div style="flex:1;min-width:150px;">
        <label style="font-size:11px;">${escapeHtml(f.label)}</label>
        <input type="${f.type}" id="ship_${c.id}_${f.key}" value="${escapeHtml(f.type === 'password' ? secretInputValue(cfg[f.key]) : (cfg[f.key] || ''))}" placeholder="${escapeHtml(f.type === 'password' ? (secretFieldPlaceholder(cfg[f.key]) || f.ph) : f.ph)}" autocomplete="off">
      </div>`).join('');
    const hookUrl = `${baseUrl}/api/webhook/${c.id}`;
    return `
    <div style="padding:12px;background:var(--bg-elev);border-radius:var(--radius);margin-bottom:10px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;font-weight:600;">
        <input type="checkbox" id="ship_${c.id}_en" style="width:auto;margin:0;" ${cfg.enabled ? 'checked' : ''}>
        <span>${escapeHtml(c.label)}</span>
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${flds}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">${escapeHtml(t('ship.webhook_url') || 'Inbound status webhook')}: <code style="user-select:all;">${escapeHtml(hookUrl)}</code></div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <p style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">${escapeHtml(t('ship.settings_hint') || 'Optional — shipping works fully by hand. Add a carrier key to auto-create labels, and a webhook secret to receive live status updates.')}</p>
    ${rows}
    <button class="btn primary small" id="btnSaveShipping" data-i18n="common.save">${escapeHtml(t('common.save'))}</button>`;

  el.querySelector('#btnSaveShipping')?.addEventListener('click', () => {
    const saved = { ...(settings.shipping || {}) };
    for (const c of carriers) {
      const cur = (settings.shipping || {})[c.id] || {};
      saved[c.id] = { enabled: el.querySelector(`#ship_${c.id}_en`)?.checked || false };
      for (const f of fields) {
        const raw = el.querySelector(`#ship_${c.id}_${f.key}`)?.value;
        saved[c.id][f.key] = (f.type === 'password') ? secretInputSave(cur[f.key], raw) : (raw?.trim() || '');
      }
    }
    settings.shipping = saved;
    saveAll();
    toast(t('ship.saved') || 'Shipping settings saved', 'success');
  });
}

// Privacy / PDPL — retention window for customer-submitted intake data plus a manual
// sweep that anonymizes (not deletes) stale rows, keeping the operational record while
// dropping the PII. See docs/KHAYT-3.0-PRIVACY-COMPLIANCE-SPEC.md.
// Scoped API tokens (PUBLIC-API-SPEC §1). The plaintext token is shown exactly once,
// at mint time — only its hash is ever stored, so it cannot be recovered afterwards.
const API_TOKEN_SCOPES = ['orders:read', 'orders:write', 'clients:read', 'clients:write', 'inventory:read', 'inventory:write', 'machines:read'];

// Telemetry consent (TELEMETRY-SPEC §3). Off by default, crash and usage consented
// SEPARATELY, revocable without restart — opting out purges the local queue and clears
// the install id so nothing identifying survives.
function renderTelemetrySettings() {
  const el = $('#telemetrySection');
  if (!el) return;
  const tm = settings.telemetry || {};
  el.innerHTML = `
    <p style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">${escapeHtml(t('tel.hint') || 'Khayt sends nothing by default. You can optionally share crash reports and anonymous usage counts to help fix bugs. Never your orders, customers, prices or files.')}</p>
    <label style="display:flex;align-items:flex-start;gap:8px;font-weight:400;cursor:pointer;margin-bottom:8px;">
      <input type="checkbox" id="tel_crash" style="width:auto;margin-top:3px;" ${tm.crashOptIn ? 'checked' : ''}>
      <span><b>${escapeHtml(t('tel.crash') || 'Share crash reports')}</b><br>
      <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(t('tel.crash_hint') || 'A scrubbed error message and stack trace when something breaks.')}</span></span>
    </label>
    <label style="display:flex;align-items:flex-start;gap:8px;font-weight:400;cursor:pointer;">
      <input type="checkbox" id="tel_usage" style="width:auto;margin-top:3px;" ${tm.usageOptIn ? 'checked' : ''}>
      <span><b>${escapeHtml(t('tel.usage') || 'Share anonymous usage counts')}</b><br>
      <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(t('tel.usage_hint') || 'Which features are used, as counts only — never what is in them.')}</span></span>
    </label>
    <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap;">
      <button class="btn small" id="btnViewTelemetry">${escapeHtml(t('tel.view') || 'View what’s collected')}</button>
      ${tm.consentAt ? `<span style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('tel.consented') || 'Consented')}: ${escapeHtml(String(tm.consentAt).split('T')[0])}</span>` : ''}
    </div>`;

  const persist = async () => {
    const crash = !!el.querySelector('#tel_crash')?.checked;
    const usage = !!el.querySelector('#tel_usage')?.checked;
    const prev = settings.telemetry || {};
    const anyOn = crash || usage;
    let installId = prev.installId || '';
    if (anyOn && !installId) {
      // Rotating, non-identifying install id — created only on opt-in.
      const b = new Uint8Array(8); crypto.getRandomValues(b);
      installId = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    }
    settings.telemetry = {
      crashOptIn: crash, usageOptIn: usage,
      installId: anyOn ? installId : '',
      consentAt: anyOn ? (prev.consentAt || new Date().toISOString()) : '',
    };
    saveAll();
    // Opting fully out purges anything queued locally, immediately.
    if (!anyOn) { try { await window.hubAPI?.telemetryPurge?.(); } catch (_) {} }
    renderTelemetrySettings();
    toast(t('tel.saved') || 'Telemetry preferences saved', 'success');
  };
  el.querySelector('#tel_crash')?.addEventListener('change', persist);
  el.querySelector('#tel_usage')?.addEventListener('change', persist);

  el.querySelector('#btnViewTelemetry')?.addEventListener('click', async () => {
    const Scrub = (typeof KhaytTelemetryScrub !== 'undefined') ? KhaytTelemetryScrub : null;
    const tmNow = settings.telemetry || {};
    const sample = { crash: null, usage: null };
    if (Scrub) {
      if (tmNow.crashOptIn) sample.crash = Scrub.buildCrashReport({
        type: 'uncaughtException', name: 'TypeError', message: 'example failure',
        stack: 'TypeError: example\n    at someFunction (renderer/app.js:1:1)',
        process: 'renderer', appVersion: (window.KHAYT_VERSION || ''), osFamily: 'macOS', osMajor: '14',
        locale: (typeof i18n !== 'undefined' ? i18n.current : 'en'), channel: settings.betaUpdates ? 'beta' : 'stable',
        installId: tmNow.installId,
      });
      if (tmNow.usageOptIn) sample.usage = Scrub.buildUsageEvent({
        feature: 'quote_created', count: 1, mode: settings.mode, businessType: settings.businessType,
        vatEnabled: !!settings.enableVat, zatcaEnabled: !!settings.zatcaEnabled,
        onlineEnabled: !!settings.onlineEnabled, lanEnabled: !!(settings.lanApi || {}).enabled,
        sessions: 1, appVersion: (window.KHAYT_VERSION || ''),
        locale: (typeof i18n !== 'undefined' ? i18n.current : 'en'), channel: settings.betaUpdates ? 'beta' : 'stable',
        installId: tmNow.installId,
      });
    }
    const body = (!sample.crash && !sample.usage)
      ? `<p style="font-size:13px;">${escapeHtml(t('tel.nothing') || 'Nothing is collected — both options are off.')}</p>`
      : `<p style="font-size:12.5px;color:var(--text-dim);margin-bottom:8px;">${escapeHtml(t('tel.view_hint') || 'This is exactly what would be sent — nothing else.')}</p>
         <pre style="max-height:52vh;overflow:auto;background:var(--bg-elev);padding:12px;border-radius:var(--radius);font-size:11.5px;white-space:pre-wrap;">${escapeHtml(JSON.stringify(sample, null, 2))}</pre>`;
    openFormModal({ title: t('tel.view') || 'What’s collected', sizeLg: false, noSave: true, bodyHtml: body });
  });
}

function renderApiTokensSettings() {
  const el = $('#apiTokensSection');
  if (!el) return;
  const toks = ((settings.lanApi || {}).apiTokens) || [];

  const list = toks.length ? toks.map(tk => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-elev);border-radius:var(--radius);margin-bottom:6px;flex-wrap:wrap;">
      <b style="font-size:13px;">${escapeHtml(tk.label || tk.id)}</b>
      <span style="font-size:11px;color:var(--text-muted);">${escapeHtml((tk.scopes || []).join(', ') || '—')}</span>
      <span class="grow" style="flex:1;"></span>
      <span style="font-size:11px;color:var(--text-muted);">${escapeHtml((tk.createdAt || '').split('T')[0] || '')}</span>
      <button class="btn danger small" data-act="revoke-api-token" data-id="${escapeHtml(tk.id)}" style="margin:0;">${escapeHtml(t('api.revoke') || 'Revoke')}</button>
    </div>`).join('') : `<div class="empty-state" style="padding:12px;font-size:12px;">${escapeHtml(t('api.none') || 'No API tokens yet.')}</div>`;

  el.innerHTML = `
    <p style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">${escapeHtml(t('api.hint') || 'Give an automation tool (Zapier, Make, a script) access to this shop over the local API. A token only gets the scopes you tick, and is shown once.')}</p>
    ${list}
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-soft);">
      <label>${escapeHtml(t('api.label') || 'Label')}</label>
      <input type="text" id="apiTokLabel" placeholder="${escapeHtml(t('api.label_ph') || 'e.g. Zapier')}" style="max-width:260px;">
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;">
        ${API_TOKEN_SCOPES.map(sc => `<label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:12px;cursor:pointer;">
          <input type="checkbox" class="apiScope" value="${sc}" style="width:auto;margin:0;"> ${escapeHtml(sc)}</label>`).join('')}
      </div>
      <button class="btn primary small" id="btnMintApiToken" style="margin-top:12px;">${escapeHtml(t('api.mint') || 'Create token')}</button>
    </div>`;

  el.querySelector('#btnMintApiToken')?.addEventListener('click', async () => {
    const label = el.querySelector('#apiTokLabel')?.value.trim() || '';
    const scopes = Array.from(el.querySelectorAll('.apiScope:checked')).map(c => c.value);
    if (!scopes.length) { toast(t('api.need_scope') || 'Tick at least one scope', 'warning'); return; }
    const r = await window.hubAPI?.mintApiToken?.({ label, scopes });
    if (!r || !r.ok) { toast((r && r.error) || 'Could not create token', 'error'); return; }
    settings.lanApi = { ...(settings.lanApi || {}), apiTokens: [...(((settings.lanApi || {}).apiTokens) || []), r.record] };
    saveAll();
    renderApiTokensSettings();
  renderTelemetrySettings();
    // Shown once — the plaintext is never stored and cannot be retrieved again.
    openFormModal({
      title: t('api.created') || 'API token created',
      sizeLg: false,
      noSave: true,
      bodyHtml: `
        <p style="font-size:12.5px;color:var(--text-dim);margin-bottom:10px;">${escapeHtml(t('api.copy_now') || 'Copy this now — it is shown only once and cannot be recovered.')}</p>
        <input type="text" readonly value="${escapeHtml(r.token)}" style="width:100%;font-family:monospace;font-size:12px;" onclick="this.select()">`,
    });
  });

  el.querySelectorAll('[data-act="revoke-api-token"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal(t('api.revoke_q') || 'Revoke this token? Any automation using it stops working immediately.', { danger: true });
      if (!ok) return;
      settings.lanApi = { ...(settings.lanApi || {}), apiTokens: (((settings.lanApi || {}).apiTokens) || []).filter(x => x.id !== btn.dataset.id) };
      saveAll();
      renderApiTokensSettings();
      toast(t('api.revoked') || 'Token revoked', 'success');
    });
  });
}

function renderPrivacySettings() {
  const el = $('#privacySection');
  if (!el) return;
  const months = Math.max(0, num((settings.privacy || {}).retentionMonths, 0));
  const P = (typeof KhaytPrivacy !== 'undefined') ? KhaytPrivacy : null;
  const stale = P ? P.selectStaleIntakeRows(
    [...(waitingList || []), ...(waitingListHistory || [])].map(r => ({ ...r, at: r.at || r.submittedAt || r.date })),
    months, Date.now()).length : 0;

  el.innerHTML = `
    <p style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">${escapeHtml(t('priv.settings_hint') || 'Customer data stays on this machine. Optionally anonymize old intake submissions after a set period — their contact details are removed, the request record is kept.')}</p>
    <div style="max-width:240px;">
      <label>${escapeHtml(t('priv.retention_months') || 'Anonymize intake data after (months)')}</label>
      <input type="number" id="set_privacyRetention" min="0" step="1" value="${months}" placeholder="0 = keep indefinitely">
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap;">
      <button class="btn small primary" id="btnSavePrivacy">${escapeHtml(t('common.save'))}</button>
      <button class="btn small" id="btnRunRetention" ${stale ? '' : 'disabled'}>${escapeHtml(t('priv.run_sweep') || 'Anonymize stale intake now')}</button>
      <span style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(
        months > 0 ? (t('priv.stale_count', { n: stale }) || `${stale} submission(s) older than ${months} month(s)`) : (t('priv.retention_off') || 'Retention off'))}</span>
    </div>`;

  el.querySelector('#btnSavePrivacy')?.addEventListener('click', () => {
    settings.privacy = { ...(settings.privacy || {}), retentionMonths: Math.max(0, num($('#set_privacyRetention')?.value, 0)) };
    saveAll();
    renderPrivacySettings();
  renderApiTokensSettings();
    toast(t('priv.saved') || 'Privacy settings saved', 'success');
  });

  el.querySelector('#btnRunRetention')?.addEventListener('click', async () => {
    if (!P) return;
    const ok = await confirmModal(t('priv.sweep_q') || 'Anonymize the contact details on stale intake submissions? This cannot be undone.', { danger: true });
    if (!ok) return;
    const cutoffOf = (r) => ({ ...r, at: r.at || r.submittedAt || r.date });
    const staleIds = new Set(P.selectStaleIntakeRows([...(waitingList || []), ...(waitingListHistory || [])].map(cutoffOf), months, Date.now()).map(r => r.id));
    let n = 0;
    waitingList = (waitingList || []).map(r => { if (staleIds.has(r.id)) { n++; return P.anonymizeIntakeRow(r); } return r; });
    waitingListHistory = (waitingListHistory || []).map(r => { if (staleIds.has(r.id)) { n++; return P.anonymizeIntakeRow(r); } return r; });
    saveAll();
    if (typeof renderWaitingList === 'function') renderWaitingList();
    renderPrivacySettings();
    toast(t('priv.swept', { n }) || `Anonymized ${n} submission(s)`, 'success');
  });
}

function renderSavedFilterPresets() {
  const el = $('#savedFiltersBar');
  if (!el) return;
  const saved = settings.savedFilters || [];
  if (saved.length === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  el.innerHTML = `
    <span style="font-size:11.5px;color:var(--text-muted);white-space:nowrap;">Saved:</span>
    ${saved.map((f, i) => `
      <button class="btn ghost small" data-load-filter="${i}" title="${escapeHtml(f.name)}" style="font-size:12px;">${escapeHtml(f.name)}</button>
      <button class="btn ghost small" data-del-filter="${i}" style="font-size:10px;padding:2px 5px;color:var(--text-muted);" aria-label="${escapeHtml(t('common.delete'))}">✕</button>
    `).join('')}`;

  el.querySelectorAll('[data-load-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = saved[parseInt(btn.dataset.loadFilter)];
      if (!f) return;
      logStatusFilter = f.status || '';
      logPayFilter    = f.pay    || '';
      logTagFilter    = f.tag    || '';
      logRangeFilter  = f.range  || 'all';
      logSearchTerm   = f.search || '';
      logOperatorFilter = f.operator || '';
      // Sync UI dropdowns
      const s = $('#logStatusFilter'); if (s) s.value = logStatusFilter;
      const p = $('#logPayFilter');    if (p) p.value = logPayFilter;
      const tg = $('#logTagFilter');   if (tg) tg.value = logTagFilter;
      const r = $('#logRangeFilter');  if (r) r.value = logRangeFilter;
      const sr = $('#logSearch');      if (sr) sr.value = logSearchTerm;
      renderLogs();
      toast(`Filter "${f.name}" loaded`, 'success', 1800);
    });
  });
  el.querySelectorAll('[data-del-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.savedFilters.splice(parseInt(btn.dataset.delFilter), 1);
      saveAll(); renderSavedFilterPresets();
    });
  });
}

function saveCurrentFilterPreset() {
  openFormModal({
    title: '💾 Save Filter Preset',
    saveLabel: 'Save',
    bodyHtml: `<label>Preset name</label><input type="text" id="filterPresetName" placeholder="e.g. Unpaid this month">`,
    onSave: () => {
      const name = $('#filterPresetName')?.value?.trim();
      if (!name) {
        toast(t('log.preset_name_required') || 'Enter a preset name', 'warning');
        return false;
      }
      const preset = {
        id: Date.now().toString(36),
        name,
        status: logStatusFilter,
        pay:    logPayFilter,
        tag:    logTagFilter,
        range:  logRangeFilter,
        search: logSearchTerm,
        operator: logOperatorFilter,
      };
      settings.savedFilters = [...(settings.savedFilters || []), preset];
      saveAll();
      renderSavedFilterPresets();
      toast(`Preset "${name}" saved ✓`, 'success');
    }
  });
}

function updateLogoPreview() {
  const preview = $('#logoPreview');
  const removeBtn = $('#btnRemoveLogo');
  if (!preview) return;
  if (safeBizLogo()) {
    preview.src = safeBizLogo();
    preview.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    preview.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

async function syncUpdaterOptionsFromSettings() {
  const allowBeta = !!settings.betaUpdates;
  if (!window.hubAPI?.setUpdateOptions) return;
  try {
    await window.hubAPI.setUpdateOptions({ allowBeta });
  } catch (_) {}
}

function loadSettingsIntoForm() {
  $('#set_bizEn').value     = settings.bizEn     || '';
  $('#set_bizAr').value     = settings.bizAr     || '';
  $('#set_vat').value       = settings.vat       || '';
  $('#set_cr').value        = settings.cr        || '';
  $('#set_phone').value     = settings.phone     || '';
  $('#set_email').value     = settings.email     || '';
  $('#set_addrEn').value    = settings.addrEn    || '';
  $('#set_addrAr').value    = settings.addrAr    || '';
  $('#set_lang').value      = settings.lang      || 'en';
  $('#set_theme').value     = settings.theme     || 'dark';
  if (typeof populateDesignSelects === 'function') populateDesignSelects();
  if (typeof syncDesignSettingsUi === 'function') syncDesignSettingsUi();
  $('#set_invPrefix').value = settings.invPrefix || 'INV';
  $('#set_footerEn').value  = settings.footerEn  || '';
  $('#set_footerAr').value  = settings.footerAr  || '';
  $('#set_autoDeduct').checked = settings.autoDeduct !== false;
  $('#set_lowStock').value  = settings.lowStockThreshold ?? 200;
  // 1.3 additions
  $('#set_bankName').value      = settings.bankName      || '';
  $('#set_accountHolder').value = settings.accountHolder || '';
  $('#set_iban').value          = settings.iban          || '';
  $('#set_useHijri').checked    = settings.useHijri !== false;
  $('#set_useArabicNumerals').checked = !!settings.useArabicNumerals;
  $('#set_autoBackup').checked  = settings.autoBackup !== false;
  if ($('#set_coachTips')) $('#set_coachTips').checked = settings.coachTips !== false;
  $('#set_enableVat').checked   = !!settings.enableVat;
  $('#set_vatRate').value       = settings.vatRate ?? 15;
  $('#set_quotePrefix').value   = settings.quotePrefix || 'QUO';
  $('#set_useIcloud').checked   = !!settings.useIcloud;
  $('#set_taglineEn').value     = settings.taglineEn   || '';
  $('#set_taglineAr').value     = settings.taglineAr   || '';
  $('#set_invAccent').value     = safeCssColor(settings.invAccentColor, '#5E2E14');
  if ($('#set_invTemplate')) $('#set_invTemplate').value = settings.invTemplate || 'classic';
  $('#set_invTermsEn').value    = settings.invTermsEn  || '';
  $('#set_invTermsAr').value    = settings.invTermsAr  || '';
  $('#set_monthlyGoal').value     = settings.monthlyGoal ?? 0;
  $('#set_supplierPhone').value   = settings.supplierPhone || '';
  // New Feature 7: Working hours
  const wh = settings.workingHours || { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0, sat: 0, sun: 0 };
  ['mon','tue','wed','thu','fri','sat','sun'].forEach(d => {
    const el = $(`#wh_${d}`);
    if (el) el.value = wh[d] ?? 0;
  });
  renderHolidayList();
  updateLogoPreview();
  // Accepted payments checkboxes
  $$('#acceptedPaymentsList input[data-pm]').forEach(cb => {
    cb.checked = (settings.acceptedPayments || []).includes(cb.dataset.pm);
  });
  // 2.0 worldwide / regional
  const curSel = $('#set_currency');
  if (curSel && !curSel.options.length) {
    curSel.innerHTML = Object.entries(CURRENCIES)
      .map(([code, c]) => `<option value="${code}">${escapeHtml(c.label)}</option>`)
      .join('');
  }
  if (curSel) {
    curSel.value = settings.currency || 'SAR';
    if (!curSel.dataset.currencyPreviewBound) {
      curSel.dataset.currencyPreviewBound = '1';
      curSel.addEventListener('change', () => {
        const sym = (CURRENCIES[curSel.value] || CURRENCIES.SAR).symbol;
        document.querySelectorAll('[data-i18n="common.currency"]').forEach((el) => {
          el.textContent = sym;
        });
      });
    }
  }
  const langSelHdr = $('#langSelect');
  if (langSelHdr) langSelHdr.value = settings.lang || 'en';
  const zatcaEl = $('#set_enableZatca');
  if (zatcaEl) zatcaEl.checked = settings.enableZatca !== false;
  // Min-margin warning threshold
  const minMargEl = $('#set_minMarginPct');
  if (minMargEl) minMargEl.value = settings.minMarginPct ?? 0;
  // Easy-wins: Calculator settings
  const qvEl = $('#set_quoteValidityDays');
  if (qvEl) qvEl.value = settings.quoteValidityDays ?? 7;
  const qfEnEl = $('#set_quoteFollowUpEnabled');
  if (qfEnEl) qfEnEl.checked = !!(settings.quoteFollowUp && settings.quoteFollowUp.enabled);
  const qfWinEl = $('#set_quoteFollowUpWindow');
  if (qfWinEl) qfWinEl.value = (settings.quoteFollowUp && settings.quoteFollowUp.windowDays != null) ? settings.quoteFollowUp.windowDays : 2;
  const prEnEl = $('#set_payReminderEnabled');
  if (prEnEl) prEnEl.checked = !!(settings.paymentReminder && settings.paymentReminder.enabled);
  const prGrEl = $('#set_payReminderGrace');
  if (prGrEl) prGrEl.value = (settings.paymentReminder && settings.paymentReminder.graceDays != null) ? settings.paymentReminder.graceDays : 3;
  const moEl = $('#set_minOrderAmount');
  if (moEl) moEl.value = settings.minOrderAmount ?? 0;
  const rfEl = $('#set_rushFeeEnabled');
  if (rfEl) rfEl.checked = !!settings.rushFeeEnabled;
  const rpEl = $('#set_rushFeePct');
  if (rpEl) rpEl.value = settings.rushFeePct ?? 25;
  // Packaging cost + payment instructions
  const pcEl = $('#set_defaultPackagingCost');
  if (pcEl) pcEl.value = settings.defaultPackagingCost ?? 0;
  const piEl = $('#set_paymentInstructions');
  if (piEl) piEl.value = settings.paymentInstructions ?? '';
  // WIP limits
  const wipCols = ['pending', 'printing', 'post', 'qc'];
  wipCols.forEach(col => {
    const el = $(`#set_wip_${col}`);
    if (el) el.value = (settings.wipLimits || {})[col] || '';
  });
  const wipHardEl = $('#set_wipEnforceHardLimit');
  if (wipHardEl) wipHardEl.checked = !!settings.wipEnforceHardLimit;
  // QC / reprint / RMA
  const _qc = settings.qc || {};
  if ($('#set_qcEnabled')) $('#set_qcEnabled').checked = !!_qc.enabled;
  if ($('#set_qcRequireInspector')) $('#set_qcRequireInspector').checked = !!_qc.requireInspector;
  if ($('#set_qcRequirePhotoOnFail')) $('#set_qcRequirePhotoOnFail').checked = !!_qc.requirePhotoOnFail;
  if ($('#set_qcWarrantyDays')) $('#set_qcWarrantyDays').value = (_qc.warrantyDays != null ? _qc.warrantyDays : 30);
  // Post-process presets list
  renderPostProcessPresetsList();
  // Expense budgets
  EXP_CATEGORIES.forEach(c => {
    const el = $(`#set_budget_${c}`);
    if (el) el.value = (settings.expBudgets || {})[c] || 0;
  });
  // Post-processing checklist
  renderPostChecklistSettings();
  // Custom order fields
  renderCustomFieldsSettings();
  refreshCurrencyLabels();
  updateLastBackupDisplay();
  // Invoice numbering section (Feature 7)
  renderInvoiceNumberingSection();
  // Feature 8 / Task 0: Storage usage display
  renderStorageUsage();
  renderSecuritySettings();
  // Feature 7 (new 8-pack): Operator lock checkbox
  const opLockEl = $('#set_operatorLock');
  if (opLockEl) opLockEl.checked = !!settings.operatorLockEnabled;
  // Feature 8 (new 8-pack): Loyalty enabled checkbox
  const loyaltyEl = $('#set_loyaltyEnabled');
  if (loyaltyEl) loyaltyEl.checked = !!settings.loyaltyEnabled;
  // Feature 5 (new 8-pack): Email notifications
  renderEmailNotificationSettings();
  renderSmsNotificationSettings();
  renderAccountingSyncSettings();
  renderIntegrationsSettings();
  // Batch-2 Feature 10: Telegram settings
  renderTelegramSettings();
  // Feature I: Email digest scheduler
  renderDigestSettings();
  renderAiSettings();
  renderSlicerSettings();
  renderCloudSettings();
  // Feature 7 (new 8-pack): Operator lock section
  renderOperatorLockSettings();
  // Feature 8 (new 8-pack): Loyalty tiers
  renderLoyaltyTiersSettings();
  // Round 12: Webhooks
  renderWebhookSettings();
  renderEventWebhookSettings();
  // Round 12: Fixed costs / break-even
  renderFixedCostSettings();
  // Online (customer intake)
  renderOnlineSettings?.();
  // Round 12: LAN API
  renderLanApiSettings();
  // ZATCA Phase 2
  renderZatcaPhase2Settings();
  renderBnplSettings();
  renderShippingSettings();
  renderPrivacySettings();
  // Feature H: Exchange rates
  renderExchangeRatesSettings();
  // Round 12: Saved filter presets
  renderSavedFilterPresets();
  // Business Mode toggle buttons
  applyMode();
  // New feature sections inside settings tab
  renderSlicerProfiles();
  renderEnvLogs();
  const betaUpdEl = $('#set_betaUpdates');
  if (betaUpdEl) {
    betaUpdEl.checked = !!settings.betaUpdates;
    if (!betaUpdEl.dataset.updaterBound) {
      betaUpdEl.dataset.updaterBound = '1';
      betaUpdEl.addEventListener('change', () => {
        settings.betaUpdates = betaUpdEl.checked;
        syncUpdaterOptionsFromSettings();
      });
    }
  }
  syncUpdaterOptionsFromSettings();
}

/* Feature 8 / Task 0: File-store size display in Settings */
async function renderStorageUsage() {
  const el = $('#storageUsageDisplay');
  if (!el) return;
  let sizeBytes = 0;
  try {
    sizeBytes = await window.hubAPI?.storeSize?.() || 0;
  } catch(e) {}
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
  el.innerHTML = `
    <div style="margin-bottom:6px;">
      <span style="font-weight:600;">Storage file:</span> khayt-store.json
    </div>
    <div style="margin-bottom:6px;">
      <span style="font-weight:600;">Size:</span>
      <span style="color:var(--success);">${sizeMB} MB</span>
    </div>
    <div style="color:var(--success); font-size:12px;">No size limit — file-based storage ✓</div>
    <button id="btnRevealStoreFile" class="btn small" style="margin-top:10px;">Reveal data file</button>`;
  el.querySelector('#btnRevealStoreFile')?.addEventListener('click', () => {
    window.hubAPI?.revealStoreFile?.();
  });
}

function saveLanApiSettingsFromForm({ restartServer = false } = {}) {
  const section = document.getElementById('lanApiSection');
  if (!section) return;
  const prev = settings.lanApi || {};
  settings.lanApi = {
    ...prev,
    enabled: section.querySelector('#lan_enabled')?.checked ?? prev.enabled,
    port: parseInt(section.querySelector('#lan_port')?.value, 10) || 3219,
    pin: secretInputSave(prev.pin, section.querySelector('#lan_pin')?.value),
    intakePin: secretInputSave(prev.intakePin, section.querySelector('#lan_intake_pin')?.value),
    webhookToken: secretInputSave(prev.webhookToken, section.querySelector('#lan_wh_token')?.value),
    sallaWebhookSecret: secretInputSave(prev.sallaWebhookSecret, section.querySelector('#lan_salla_secret')?.value),
    zidWebhookSecret: secretInputSave(prev.zidWebhookSecret, section.querySelector('#lan_zid_secret')?.value),
    tunnelEnabled: !!section.querySelector('#lan_tunnel_enabled')?.checked,
    bindLan: !!section.querySelector('#lan_bind_lan')?.checked,
  };
  if (!restartServer) return;
  saveAll();
  if (settings.lanApi.enabled) {
    startLanServer?.();
  } else {
    window.hubAPI?.stopLanServer?.();
    section.querySelector('#lanStatusRow').textContent = '⚫ Server stopped';
    section.querySelector('#lanQrWrap').style.display = 'none';
  }
}

function saveSettingsFromPanel() {
  const onlineCb = document.getElementById('online_enabled');
  if (onlineCb) settings.onlineEnabled = onlineCb.checked;
  saveLanApiSettingsFromForm({ restartServer: false });
  saveSettingsFromForm();
}

function saveSettingsFromForm() {
  const accepted = $$('#acceptedPaymentsList input[data-pm]')
    .filter(cb => cb.checked).map(cb => cb.dataset.pm);
  settings = {
    bizEn:     $('#set_bizEn').value.trim(),
    bizAr:     $('#set_bizAr').value.trim(),
    vat:       $('#set_vat').value.trim(),
    cr:        $('#set_cr').value.trim(),
    phone:     $('#set_phone').value.trim(),
    email:     $('#set_email').value.trim(),
    addrEn:    $('#set_addrEn').value.trim(),
    addrAr:    $('#set_addrAr').value.trim(),
    lang:      $('#set_lang').value,
    theme:       $('#set_theme').value,
    designTheme: $('#set_designTheme')?.value || settings.designTheme || 'studio',
    accent:      $('#set_accent')?.value || settings.accent || 'cyan',
    cockpitSkin: $('#set_cockpitSkin')?.value || settings.cockpitSkin || 'poster',
    invPrefix: $('#set_invPrefix').value.trim() || 'INV',
    footerEn:  $('#set_footerEn').value.trim(),
    footerAr:  $('#set_footerAr').value.trim(),
    autoDeduct: $('#set_autoDeduct').checked,
    lowStockThreshold: Math.max(0, num($('#set_lowStock').value, 200)),
    // 1.3 additions
    bankName:      $('#set_bankName').value.trim(),
    accountHolder: $('#set_accountHolder').value.trim(),
    iban:          $('#set_iban').value.trim().replace(/\s+/g, ''),
    acceptedPayments: accepted,
    useHijri:      $('#set_useHijri').checked,
    useArabicNumerals: $('#set_useArabicNumerals').checked,
    autoBackup:    $('#set_autoBackup').checked,
    coachTips:     $('#set_coachTips') ? $('#set_coachTips').checked : (settings.coachTips !== false),
    enableVat:     $('#set_enableVat').checked,
    vatRate:       Math.max(0, num($('#set_vatRate').value, 15)),
    bizLogo:       settings.bizLogo || '',
    taglineEn:     $('#set_taglineEn').value.trim(),
    taglineAr:     $('#set_taglineAr').value.trim(),
    invAccentColor:$('#set_invAccent').value || '#5E2E14',
    invTemplate:   $('#set_invTemplate')?.value || 'classic',
    invTermsEn:    $('#set_invTermsEn').value.trim(),
    invTermsAr:    $('#set_invTermsAr').value.trim(),
    quotePrefix:   $('#set_quotePrefix').value.trim() || 'QUO',
    useIcloud:     $('#set_useIcloud').checked,
    monthlyGoal:   Math.max(0, num($('#set_monthlyGoal').value, 0)),
    supplierPhone: $('#set_supplierPhone').value.trim(),
    // 2.0 worldwide / regional
    currency:      $('#set_currency')?.value    || 'SAR',
    enableZatca:   !!$('#set_enableZatca')?.checked,
    firstRunDone:  true,
    // Operational settings
    minMarginPct:  Math.max(0, Math.min(100, num($('#set_minMarginPct')?.value, 0))),
    expBudgets:    Object.fromEntries(EXP_CATEGORIES.map(c => [c, Math.max(0, num($(`#set_budget_${c}`)?.value, 0))])),
    postChecklist: settings.postChecklist || [],
    // Invoice numbering (managed by renderInvoiceNumberingSection — preserve as-is)
    invNumPrefix:  settings.invNumPrefix  || 'INV',
    invNumYear:    settings.invNumYear    || new Date().getFullYear(),
    invNumNext:    settings.invNumNext    || 1,
    invNumFormat:  settings.invNumFormat  || '{prefix}-{year}-{seq4}',
    // New Feature 7: Working hours
    workingHours: Object.fromEntries(
      ['mon','tue','wed','thu','fri','sat','sun'].map(d => [d, Math.max(0, Math.min(24, num($(`#wh_${d}`)?.value, 0)))])
    ),
    holidays: settings.holidays || [],
    // Business Mode — preserve current mode/firstRun (changed via mode toggle buttons)
    mode:      settings.mode      || 'professional',
    firstRun:  false,
    customFields: settings.customFields || [],
    // Feature 5 (new 8-pack): Email config — managed by renderEmailNotificationSettings, preserve as-is
    emailConfig: settings.emailConfig || { provider: 'none', apiKey: '', fromEmail: '', fromName: '', domain: '', triggers: [] },
    // SMS/WhatsApp config — managed by renderSmsNotificationSettings, preserve as-is
    smsConfig: settings.smsConfig || { provider: 'none', channel: 'whatsapp' },
    // Accounting sync — managed by renderAccountingSyncSettings, preserve as-is
    accountingSync: settings.accountingSync || { enabled: false, format: 'generic', webhookUrl: '', secret: '', pushOnPaid: true },
    // Payment providers — managed by renderIntegrationsSettings, preserve as-is
    paymentProviders: settings.paymentProviders || {},
    // Feature 7 (new 8-pack): Operator lock
    operatorLockEnabled: !!$('#set_operatorLock')?.checked,
    activeOperatorId: settings.activeOperatorId || null,
    // Feature 8 (new 8-pack): Loyalty tiers
    loyaltyEnabled: !!$('#set_loyaltyEnabled')?.checked,
    loyaltyTiers:   settings.loyaltyTiers || [],
    // Batch-2 Feature 10: Telegram — preserved from renderTelegramSettings
    telegram: settings.telegram || { botToken: '', chatId: '', notifyOnComplete: false, notifyOnHold: false, notifyOnLowStock: false, notifyPrinterError: true, notifyPrinterOffline: true, notifyPrinterStall: false },
    // Round 12 — preserve managed-in-place settings
    webhooks:     settings.webhooks     || { enabled: false, secret: '', events: {} },
    fixedCosts:   settings.fixedCosts   || [],
    savedFilters: settings.savedFilters || [],
    // Payment instructions (textarea, not auto-included by DOM reconstruction)
    paymentInstructions: $('#set_paymentInstructions')?.value ?? settings.paymentInstructions ?? '',
    betaAcknowledged: true, // legacy field — always true, beta phase is over
    betaUpdates:       !!$('#set_betaUpdates')?.checked,
    // Easy-wins batch: Calculator
    quoteValidityDays: Math.max(1, num($('#set_quoteValidityDays')?.value, 7)),
    // Quote follow-up automation — preserve advanced fields, update toggle + window from form
    quoteFollowUp: {
      ...(settings.quoteFollowUp || { graceDays: 1, cooldownDays: 2, maxCount: 2 }),
      enabled:    !!$('#set_quoteFollowUpEnabled')?.checked,
      windowDays: Math.max(0, Math.min(60, num($('#set_quoteFollowUpWindow')?.value, 2))),
    },
    paymentReminder: {
      ...(settings.paymentReminder || { cooldownDays: 3, maxCount: 3 }),
      enabled:   !!$('#set_payReminderEnabled')?.checked,
      graceDays: Math.max(0, Math.min(90, num($('#set_payReminderGrace')?.value, 3))),
    },
    minOrderAmount:    Math.max(0, num($('#set_minOrderAmount')?.value, 0)),
    rushFeeEnabled:    !!$('#set_rushFeeEnabled')?.checked,
    rushFeePct:        Math.max(0, Math.min(500, num($('#set_rushFeePct')?.value, 25))),
    defaultPackagingCost: Math.max(0, num($('#set_defaultPackagingCost')?.value, 0)),
    // WIP limits
    wipLimits: (() => {
      const wip = { ...(settings.wipLimits || {}) };
      ['pending', 'printing', 'post', 'qc'].forEach(col => {
        const v = num($(`#set_wip_${col}`)?.value, 0);
        if (v > 0) wip[col] = v;
        else delete wip[col];
      });
      return wip;
    })(),
    wipEnforceHardLimit: !!$('#set_wipEnforceHardLimit')?.checked,
    // QC / reprint / RMA
    qc: {
      enabled:            !!$('#set_qcEnabled')?.checked,
      requireInspector:   !!$('#set_qcRequireInspector')?.checked,
      requirePhotoOnFail: !!$('#set_qcRequirePhotoOnFail')?.checked,
      warrantyDays:       Math.max(0, num($('#set_qcWarrantyDays')?.value, 30)),
    },
    // Preserve fields managed outside this form — never silently drop them
    zatcaPhase2:        settings.zatcaPhase2        || {},
    emailDigest:        settings.emailDigest        || {},
    bnpl:               settings.bnpl               || {},
    exchangeRates:      settings.exchangeRates       || {},
    exchangeRatesUpdatedAt: settings.exchangeRatesUpdatedAt ?? null,
    staleHours:         settings.staleHours          || {},
    productionPaused:   settings.productionPaused    || false,
    pauseReason:        settings.pauseReason         || '',
    pausedAt:           settings.pausedAt            ?? null,
    filamentColours:    settings.filamentColours     || {},
    jobTemplates:       settings.jobTemplates        || [],
    postProcessPresets: settings.postProcessPresets  || [],
    resinProfiles:      settings.resinProfiles       || [],
    dismissedNotifs:    settings.dismissedNotifs     || {},
    kanbanCollapsed:    settings.kanbanCollapsed     || [],
    donationUrl:        settings.donationUrl         || '', // legacy — UI removed; preserve on save
    printerApi:         settings.printerApi          || {},
    locations:          settings.locations           || [],
    lanApi: (() => { migrateLanApiSettings(); return settings.lanApi || { enabled: false, port: 3219, pin: '' }; })(),
    // Preserve fields not edited by this form — never silently drop them
    onlineEnabled:        !!settings.onlineEnabled,
    securityEnabled:      !!settings.securityEnabled,
    recoveryCodeHash:     settings.recoveryCodeHash || '',
    recoveryCodeCreatedAt: settings.recoveryCodeCreatedAt || '',
    quoteNumYear:         settings.quoteNumYear ?? new Date().getFullYear(),
    quoteNumNext:         settings.quoteNumNext ?? 1,
  };
  saveAll();
  syncUpdaterOptionsFromSettings();
  i18n.set(settings.lang);
  applyTheme(settings.theme);
  if (typeof applyDesignSettings === 'function') applyDesignSettings();
  applyMode();
  renderInventory();
  refreshCurrencyLabels();
  if (typeof renderBuild === 'function') renderBuild();
  if (typeof applyCoachTips === 'function') applyCoachTips(document);
  toast(t('set.saved'), 'success');
}

/* ============================================================
   Backup restore UI (Feature 6)
   ============================================================ */
async function openRestoreBackupModal() {
  if (!window.hubAPI?.listBackups) { toast(t('set.restore_error'), 'error'); return; }
  // Distinguish "the listing failed" from "there genuinely are none". This modal is
  // opened precisely when someone is trying to recover, and telling them no backups
  // exist when the read merely failed can convince them their data is unrecoverable.
  let backups = [];
  let listFailed = false;
  try {
    backups = await window.hubAPI.listBackups();
    if (!Array.isArray(backups)) { backups = []; listFailed = true; }
  } catch (e) {
    console.error('listBackups failed:', e);
    listFailed = true;
  }
  if (listFailed) {
    toast('⚠ ' + (t('set.backups_unreadable') ||
      'Could not read the backups folder — your backups may still be there. Try opening the folder directly.'), 'error', 9000);
    return;
  }
  if (backups.length === 0) {
    toast(t('set.restore_error') + ': no backups found', 'error');
    return;
  }
  const listHtml = backups.map((b, i) => `
    <label style="display:flex; align-items:center; gap:10px; padding:6px 8px; border-radius:6px; cursor:pointer; border:1px solid var(--border); margin-bottom:6px; ${i === 0 ? 'background:rgba(91,156,240,0.07);' : ''}">
      <input type="radio" name="backupChoice" value="${escapeHtml(b.filename)}" ${i === 0 ? 'checked' : ''} style="width:auto; margin:0;">
      <span style="flex:1; font-size:13px; font-weight:${i === 0 ? '600' : '400'};">${escapeHtml(b.name)}</span>
      <span style="font-size:11px; color:var(--text-muted);">${new Date(b.mtime).toLocaleDateString()}</span>
    </label>`).join('');
  openFormModal({
    title: t('set.restore_title'),
    saveLabel: t('common.confirm'),
    sizeLg: false,
    bodyHtml: `
      <p style="font-size:13px; color:var(--text-muted); margin:0 0 14px;">${escapeHtml(t('set.restore_hint'))}</p>
      <div id="backupList">${listHtml}</div>`,
    async onSave(modal) {
      const chosen = modal.querySelector('input[name="backupChoice"]:checked');
      if (!chosen) return false;
      const ok = await confirmModal(t('set.restore_confirm'), { danger: true });
      if (!ok) return false;
      try {
        const json = await window.hubAPI.restoreBackup(chosen.value);
        if (!json) { toast(t('set.restore_error'), 'error'); return false; }
        const data = safeJsonParse(json);
      // Refuse a snapshot that failed validation — replaceStoreFromSnapshot leaves the
      // existing data untouched when it returns false, so do NOT save or report success.
        if (!replaceStoreFromSnapshot(data)) { toast(t('set.restore_error') || 'Restore failed — the backup could not be read', 'error'); return false; }
        saveAll();
        initialRender();
        loadSettingsIntoForm();
        applyTheme(settings.theme);
        i18n.set(settings.lang);
        refreshCurrencyLabels();
        toast(t('set.restore_success'), 'success');
        return true;
      } catch (e) {
        console.error('restore backup failed', e);
        toast(t('set.restore_error'), 'error');
        return false;
      }
    }
  });
}

/** Named restore points: create labeled snapshots + one-click restore/delete.
 *  Disaster recovery beyond the dated auto-backups (separate, non-pruned set). */
async function openRestorePointsModal() {
  if (!window.hubAPI?.listRestorePoints) { toast(t('rp.unavailable') || 'Restore points unavailable', 'error'); return; }
  const fmtWhen = (ms) => { try { return new Date(ms).toLocaleString(i18n.current === 'ar' ? 'ar-SA' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };
  const render = async (modal) => {
    let list = [];
    try { list = await window.hubAPI.listRestorePoints() || []; } catch (e) { /* ignore */ }
    const rows = list.length ? list.map((rp) => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-soft);">
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${escapeHtml(rp.label)}</div><div style="font-size:11px;color:var(--text-muted);">${escapeHtml(fmtWhen(rp.mtime))}</div></div>
        <button class="btn small primary rpRestore" data-f="${escapeHtml(rp.filename)}">${escapeHtml(t('rp.restore') || 'Restore')}</button>
        <button class="btn small ghost rpDelete" data-f="${escapeHtml(rp.filename)}" style="color:var(--danger);" aria-label="${escapeHtml(t('common.delete'))}">✕</button>
      </div>`).join('') : `<div style="text-align:center;color:var(--text-muted);padding:18px 0;">${escapeHtml(t('rp.empty') || 'No restore points yet.')}</div>`;
    modal.querySelector('#rpBody').innerHTML = `
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 10px;">${escapeHtml(t('rp.hint') || 'Save a labeled snapshot of all your data you can roll back to anytime — e.g. before a big import or month-end.')}</p>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input id="rpLabel" type="text" maxlength="60" placeholder="${escapeHtml(t('rp.label_ph') || 'Label (e.g. Before June import)')}" style="flex:1;">
        <button id="rpCreate" class="btn small primary">+ ${escapeHtml(t('rp.create') || 'Create')}</button>
      </div>
      ${rows}`;
    modal.querySelector('#rpCreate')?.addEventListener('click', async () => {
      const label = modal.querySelector('#rpLabel').value.trim();
      const r = await window.hubAPI.createRestorePoint({ json: JSON.stringify(buildExportPayload({ redactSecrets: false })), label });
      if (r?.ok) { toast(t('rp.created') || 'Restore point saved', 'success'); render(modal); }
      else toast((r && r.error) || 'Failed', 'error');
    });
    modal.querySelectorAll('.rpRestore').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmModal(t('rp.restore_q') || 'Replace all current data with this restore point? This cannot be undone.', { danger: true }))) return;
      const json = await window.hubAPI.readRestorePoint(b.dataset.f);
      if (!json) { toast(t('set.restore_error') || 'Restore failed', 'error'); return; }
      try {
      // Refuse a snapshot that failed validation — replaceStoreFromSnapshot leaves the
      // existing data untouched when it returns false, so do NOT save or report success.
        if (!replaceStoreFromSnapshot(safeJsonParse(json))) { toast(t('set.restore_error') || 'Restore failed', 'error'); return; }
        saveAll(); initialRender(); loadSettingsIntoForm(); applyTheme(settings.theme); i18n.set(settings.lang); refreshCurrencyLabels();
        toast(t('set.restore_success') || 'Restored', 'success');
        modal.querySelector('.modal-close')?.click();
      } catch (e) { console.error('restore point failed', e); toast(t('set.restore_error') || 'Restore failed', 'error'); }
    }));
    modal.querySelectorAll('.rpDelete').forEach((b) => b.addEventListener('click', async () => {
      await window.hubAPI.deleteRestorePoint(b.dataset.f); render(modal);
    }));
  };
  openFormModal({
    title: '🛟 ' + (t('rp.title') || 'Restore points'),
    noSave: true,
    bodyHtml: `<div id="rpBody"></div>`,
    onMount(modal) { render(modal); },
  });
}

/** beta.19 #7 — Cloud snapshot history. Lists the server-side versioned snapshots
 *  (kept automatically on each sync) and restores any one across devices. The
 *  ciphertext is decrypted in the main process with the session DEK; restoring
 *  replaces local data, then pushes it up as a new head revision. */
async function applyCloudSnapshotRestore(store) {
  const keepCloud = Object.assign({}, settings.cloud); // preserve this device's token/login/rev
      // Refuse a snapshot that failed validation — replaceStoreFromSnapshot leaves the
      // existing data untouched when it returns false, so do NOT save or report success.
  if (!replaceStoreFromSnapshot(store)) { toast(t('set.restore_error') || 'Restore failed', 'error'); return; }
  settings.cloud = Object.assign({}, settings.cloud, keepCloud);
  saveAll();
  initialRender();
  loadSettingsIntoForm();
  applyTheme(settings.theme);
  i18n.set(settings.lang);
  if (typeof refreshCurrencyLabels === 'function') refreshCurrencyLabels();
  // Local now holds the restored version; push it as a new revision so every
  // device converges on it (the backend keeps its head rev, so no false conflict).
  if (window.KhaytCloudSync) { KhaytCloudSync.configure(cloudSyncDeps()); KhaytCloudSync.syncNow(); }
  renderCloudSettings();
}

async function openCloudSnapshotsModal() {
  if (!window.hubAPI?.cloudSnapshotsList) { toast(t('cloud.snapshots_unavailable') || 'Snapshot history unavailable', 'error'); return; }
  const fmtWhen = (ms) => { try { return new Date(ms).toLocaleString(i18n.current === 'ar' ? 'ar-SA' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };
  const fmtBytes = (n) => (n >= 1024 * 1024 ? (n / (1024 * 1024)).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const render = async (modal) => {
    const body = modal.querySelector('#csBody');
    body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:18px 0;">${escapeHtml(t('common.loading') || 'Loading…')}</div>`;
    const r = await window.hubAPI.cloudSnapshotsList();
    if (!r?.ok) {
      const msg = r?.error === 'locked' ? (t('cloud.locked') || 'Unlock first (enter passphrase)') : (r?.error || 'Failed to load');
      body.innerHTML = `<div style="text-align:center;color:var(--danger);padding:18px 0;">${escapeHtml(msg)}</div>`;
      return;
    }
    const list = r.snapshots || [];
    const rows = list.length ? list.map((s) => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border-soft);">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${escapeHtml(t('cloud.snap_rev') || 'Version')} ${Number(s.rev)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(fmtWhen(s.createdAt))} · ${escapeHtml(fmtBytes(Number(s.bytes) || 0))}</div>
        </div>
        <button class="btn small primary csRestore" data-id="${escapeHtml(String(s.id))}" data-rev="${Number(s.rev)}">${escapeHtml(t('cloud.restore_this') || 'Restore')}</button>
      </div>`).join('') : `<div style="text-align:center;color:var(--text-muted);padding:18px 0;">${escapeHtml(t('cloud.snapshots_empty') || 'No cloud snapshots yet — Sync now first.')}</div>`;
    body.innerHTML = `
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 10px;">${escapeHtml(t('cloud.snapshots_hint') || 'Your shop is versioned in the cloud on every sync. Restore any version here — it replaces local data on this device and syncs to the others.')}</p>
      ${rows}`;
    body.querySelectorAll('.csRestore').forEach((b) => b.addEventListener('click', async () => {
      const rev = b.dataset.rev;
      if (!(await confirmModal((t('cloud.snap_restore_q') || 'Replace all data on this device with version {rev} from the cloud, and sync it everywhere? This cannot be undone.').replace('{rev}', rev), { danger: true }))) return;
      b.disabled = true;
      const g = await window.hubAPI.cloudSnapshotGet({ id: b.dataset.id });
      if (!g?.ok || !g.store) {
        toast((g && g.error) || (t('cloud.restore_error') || 'Could not restore from cloud'), 'error');
        b.disabled = false; return;
      }
      try {
        await applyCloudSnapshotRestore(g.store);
        toast((t('cloud.restored') || 'Restored from cloud') + ' (' + (t('cloud.snap_rev') || 'Version').toLowerCase() + ' ' + rev + ')', 'success');
        modal.querySelector('.modal-close')?.click();
      } catch (e) { console.error('cloud snapshot restore:', e); toast(t('cloud.restore_error') || 'Could not restore from cloud', 'error'); b.disabled = false; }
    }));
  };
  openFormModal({
    title: '🕑 ' + (t('cloud.snapshots') || 'Cloud snapshot history'),
    noSave: true,
    bodyHtml: `<div id="csBody"></div>`,
    onMount(modal) { render(modal); },
  });
}

/* ============================================================
   Post-processing checklist (settings management)
   ============================================================ */
/* New Feature 7: Holiday/closure dates list */
function renderHolidayList() {
  const el = $('#holidayList');
  if (!el) return;
  const holidays = settings.holidays || [];
  if (holidays.length === 0) {
    el.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">${escapeHtml(t('set.holidays'))}: none</span>`;
    return;
  }
  el.innerHTML = [...holidays].sort().map(d => `
    <span class="holiday-chip" style="display:inline-flex; align-items:center; gap:4px; background:var(--surface-2); border:1px solid var(--border-soft); border-radius:16px; padding:2px 10px; font-size:12px;">
      ${escapeHtml(d)}
      <button type="button" data-act="rm-holiday" data-date="${escapeHtml(d)}" aria-label="${escapeHtml(t('common.delete'))}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:13px; padding:0; line-height:1;">×</button>
    </span>`).join('');
}

function renderPostChecklistSettings() {
  const el = $('#postChecklistItems');
  if (!el) return;
  const list = settings.postChecklist || [];
  if (list.length === 0) {
    el.innerHTML = `<div style="color:var(--text-muted); font-size:12.5px; padding:6px 0;" data-i18n="post.empty">${escapeHtml(t('post.empty'))}</div>`;
    return;
  }
  el.innerHTML = list.map((ch, i) => `
    <div class="post-check-setting-row">
      <span style="flex:1; font-size:13px;">${escapeHtml(ch.label)}</span>
      <button class="btn danger small" data-act="del-post-check" data-idx="${i}" aria-label="${escapeHtml(t('common.delete'))}">×</button>
    </div>`).join('');
}

function addPostCheckItem() {
  const inp = $('#postCheckInput');
  if (!inp) return;
  const label = inp.value.trim();
  if (!label) return;
  if (!settings.postChecklist) settings.postChecklist = [];
  settings.postChecklist.push({ id: uid('PCH'), label });
  inp.value = '';
  saveAll();
  renderPostChecklistSettings();
}

function deletePostCheckItem(idx) {
  if (!settings.postChecklist) return;
  settings.postChecklist.splice(idx, 1);
  saveAll();
  renderPostChecklistSettings();
  renderKanban(); // refresh cards
}

/* ============================================================
   Custom order metadata fields — settings management
   ============================================================ */
function renderCustomFieldsSettings() {
  const el = $('#customFieldsList');
  if (!el) return;
  const fields = settings.customFields || [];
  if (fields.length === 0) {
    el.innerHTML = `<div style="color:var(--text-muted); font-size:12.5px; padding:6px 0;">${escapeHtml(t('set.custom_fields_empty'))}</div>`;
    return;
  }
  el.innerHTML = fields.map((f, i) => `
    <div class="post-check-setting-row">
      <span style="flex:1; font-size:13px;">${escapeHtml(f.label)}</span>
      <span style="font-size:11px; color:var(--text-muted); margin-inline-end:8px;">${escapeHtml(f.type || 'text')}</span>
      <button class="btn danger small" data-act="del-custom-field" data-idx="${i}" aria-label="${escapeHtml(t('common.delete'))}">×</button>
    </div>`).join('');
}

function addCustomField() {
  const inp = $('#customFieldInput');
  if (!inp) return;
  const label = inp.value.trim();
  if (!label) return;
  if (!settings.customFields) settings.customFields = [];
  settings.customFields.push({ id: uid('CF'), label, type: 'text' });
  inp.value = '';
  saveAll();
  renderCustomFieldsSettings();
  toast(t('set.custom_field_added'), 'success');
}

function deleteCustomField(idx) {
  if (!settings.customFields) return;
  settings.customFields.splice(idx, 1);
  saveAll();
  renderCustomFieldsSettings();
}

/** Load explorable demo data (clients, products, spools, machines, orders).
 *  Each record is flagged sample:true and uses a stable DEMO-* id, so loading
 *  is idempotent and it can be removed cleanly later. */
async function loadSampleData() {
  if (typeof KhaytSampleData === 'undefined') { toast('Sample data unavailable', 'error'); return; }
  const ok = await confirmModal(t('set.sample_load_q') || 'Add demo clients, products, spools and orders to explore? You can remove them anytime.');
  if (!ok) return;
  const data = KhaytSampleData.buildSampleData({ today: new Date().toISOString().slice(0, 10) });
  const targets = { machines, clients, products, inventory, printLog };
  let added = 0;
  for (const key of KhaytSampleData.SAMPLE_COLLECTIONS) {
    const arr = targets[key]; if (!Array.isArray(arr)) continue;
    for (const rec of data[key]) {
      if (!arr.some((x) => x && x.id === rec.id)) { arr.push(rec); added++; }
    }
  }
  saveAll();
  initialRender();
  loadSettingsIntoForm();
  toast((t('set.sample_loaded', { n: added }) || `Added ${added} demo records`), 'success');
}

/** Remove every record previously added as sample/demo data. */
async function clearSampleData() {
  const ok = await confirmModal(t('set.sample_clear_q') || 'Remove all demo data? Your real records are kept.', { danger: true });
  if (!ok) return;
  const strip = (arr) => (Array.isArray(arr) ? arr.filter((x) => !(x && x.sample)) : arr);
  machines = strip(machines); clients = strip(clients); products = strip(products);
  inventory = strip(inventory); printLog = strip(printLog);
  saveAll();
  initialRender();
  loadSettingsIntoForm();
  toast(t('set.sample_cleared') || 'Demo data removed', 'success');
}

function exportData() {
  if (!confirm(t('set.export_secrets_warning') || 'Export will redact API keys and secrets. Continue?')) return;
  downloadBlob(
    new Blob([JSON.stringify(buildExportPayload({ redactSecrets: true }), null, 2)], { type: 'application/json' }),
    `khayt-${new Date().toISOString().split('T')[0]}.json`
  );
  toast(t('set.exported'), 'success');
}


/**
 * Prune archived orders: export them to a JSON file, then remove them from the
 * live store. Export-first is mandatory (the download is the user's only copy
 * afterwards) and the removal is gated behind a danger confirm. Deletions
 * propagate to cloud automatically — the next save tombstones the missing ids.
 */
async function pruneArchivedOrders() {
  // Logic is intentionally inline (not via a browser global) — the pure helpers
  // in lib/order-archive.js exist for Node unit coverage; the renderer keeps the
  // filter here so no extra <script> tag is needed. See test/order-archive.test.js.
  const archived = (printLog || []).filter((o) => o && typeof o === 'object' && o.archived);
  if (archived.length === 0) {
    toast(t('prune.none') || 'No archived orders to prune.', 'info');
    return;
  }
  let version = null;
  try { version = window.hubAPI?.appVersion ? await window.hubAPI.appVersion() : null; } catch { /* ignore */ }
  const stamp = new Date().toISOString();
  const payload = { type: 'khayt-archived-orders', version, exportedAt: stamp, count: archived.length, orders: archived };
  // Export first — always, before anything is removed.
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `khayt-archived-orders-${stamp.split('T')[0]}.json`,
  );
  const ok = await confirmModal(
    (t('prune.confirm') || 'Remove {n} archived order(s) from the app? They were just exported to a file — keep it safe. This cannot be undone.')
      .replace('{n}', archived.length),
    { danger: true },
  );
  if (!ok) return;
  const removed = new Set(archived.map((o) => o.id));
  printLog = printLog.filter((o) => !removed.has(o.id));
  saveAll();
  if (typeof renderLogs === 'function') renderLogs();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderStorageUsage === 'function') renderStorageUsage();
  toast((t('prune.done') || 'Removed {n} archived order(s).').replace('{n}', archived.length), 'success');
}


async function importData(file) {
  const ok = await confirmModal(
    t('set.import_confirm') || 'Replace all local data with this backup? This cannot be undone.',
    { danger: true },
  );
  if (!ok) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = safeJsonParse(ev.target.result);
      // Refuse a snapshot that failed validation — replaceStoreFromSnapshot leaves the
      // existing data untouched when it returns false, so do NOT save or report success.
      if (!replaceStoreFromSnapshot(data)) { toast(t('set.import_error') || t('set.restore_error') || 'Import failed — that file is not a Khayt backup', 'error'); return; }
      saveAll();
      initialRender();
      loadSettingsIntoForm();
      applyTheme(settings.theme);
      i18n.set(settings.lang);
      toast(t('set.imported'), 'success');
    } catch (e) {
      console.error(e);
      toast(t('set.import_error'), 'error');
    }
  };
  reader.readAsText(file);
}

async function clearAppDataForReset() {
  printLog = []; templates = []; products = []; clients = []; printers = [];
  expenses = []; machines = []; waTemplates = defaultWaTemplates(); wasteLog = [];
  machMaintLog = []; consumables = []; suppliers = []; purchaseOrders = []; testPrints = [];
  locations = []; operators = []; waitingList = []; waitingListHistory = [];
  timeEntries = []; shiftLogs = []; giftCards = []; slicerProfiles = []; envLogs = [];
  inventory = [];
  settings = defaultSettings();
  settings.firstRun = true;
  settings.firstRunDone = false;
  saveAll();
}

async function resetAllData() {
  const ok = await verifyDestructiveGate({
    phrase: 'RESET',
    title: t('set.reset'),
    message: t('set.reset_q'),
    requireSecurity: securityIsEnabled(),
  });
  if (!ok) return;
  await clearAppDataForReset();
  applyTheme(settings.theme || 'light');
  i18n.set(settings.lang || 'en');
  initialRender();
  loadSettingsIntoForm();
  renderSecuritySettings();
  initWizard();
  toast(t('log.cleared'), 'success');
}

async function fullWipeData() {
  const phrase = (settings.businessName || settings.bizEn || 'WIPE').trim() || 'WIPE';
  const ok = await verifyDestructiveGate({
    phrase,
    title: t('set.full_wipe'),
    message: t('set.full_wipe_q'),
    requireSecurity: securityIsEnabled(),
  });
  if (!ok) return;
  if (!window.hubAPI?.requestFullWipe) {
    toast(t('set.full_wipe_unavailable'), 'error');
    return;
  }
  const wipeRes = await window.hubAPI.requestFullWipe();
  if (wipeRes?.canceled) return;
}

function renderSecuritySettings() {
  const el = $('#securitySettingsSection');
  if (!el) return;
  const enabled = securityIsEnabled();
  el.innerHTML = `
    <div style="padding:14px 16px;background:var(--bg-soft);border:1px solid var(--border-soft);border-radius:var(--radius);">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;" data-i18n="sec.settings_title">App security</div>
      <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px;">
        ${enabled
          ? escapeHtml(t('sec.settings_enabled'))
          : escapeHtml(t('sec.settings_disabled'))}
      </p>
      ${enabled ? `
        <div class="btn-row" style="gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn small" id="btnChangeAdminPin">${escapeHtml(t('sec.change_pin'))}</button>
          <button type="button" class="btn small" id="btnRegenRecovery">${escapeHtml(t('sec.regen_recovery'))}</button>
          <button type="button" class="btn small ghost" id="btnDisableSecurity">${escapeHtml(t('sec.disable'))}</button>
        </div>` : `
        <button type="button" class="btn small primary" id="btnEnableSecurity">${escapeHtml(t('sec.enable'))}</button>`}
    </div>`;
  i18n.applyToDom(el);

  el.querySelector('#btnEnableSecurity')?.addEventListener('click', () => openEnableSecurityModal());
  el.querySelector('#btnChangeAdminPin')?.addEventListener('click', () => openChangePinModal());
  el.querySelector('#btnRegenRecovery')?.addEventListener('click', () => openRegenRecoveryModal());
  el.querySelector('#btnDisableSecurity')?.addEventListener('click', () => disableSecurity());
}

function openEnableSecurityModal() {
  openFormModal({
    title: t('sec.enable'),
    sizeLg: false,
    bodyHtml: `
      <label>${escapeHtml(t('sec.pin_label'))}</label>
      <input type="password" id="enableSecPin" inputmode="numeric" maxlength="8" class="form-control">
      <label style="margin-top:10px;">${escapeHtml(t('sec.pin_confirm'))}</label>
      <input type="password" id="enableSecPin2" inputmode="numeric" maxlength="8" class="form-control">
      <p id="enableSecErr" style="color:var(--danger);font-size:12px;min-height:18px;margin-top:8px;"></p>`,
    async onSave(modal) {
      const pin = modal.querySelector('#enableSecPin').value.trim();
      const pin2 = modal.querySelector('#enableSecPin2').value.trim();
      const err = modal.querySelector('#enableSecErr');
      if (!isValidPin(pin)) { if (err) err.textContent = t('sec.pin_invalid_format'); return false; }
      if (isWeakPin(pin)) { if (err) err.textContent = t('sec.pin_weak'); return false; }
      if (pin !== pin2) { if (err) err.textContent = t('sec.pin_mismatch'); return false; }
      const code = generateRecoveryCode();
      await setupAdminSecurity({ pin, recoveryCodePlain: code });
      saveAll();
      renderSecuritySettings();
      renderOperatorsList();
      renderOperatorLockSettings();
      applyOperatorPermissions();
      toast(t('sec.enabled_toast'), 'success');
      showRecoveryCodeModal(code, t('sec.recovery_title'));
      return true;
    },
  });
}

function showRecoveryCodeModal(code, title) {
  const overlay = appendStackedModal(`
      <div class="modal modal-form" role="dialog" aria-modal="true" style="max-width:480px;">
        <div class="modal-header">
          <h3>${escapeHtml(title || t('sec.recovery_title'))}</h3>
          <button class="btn ghost small" data-act="close" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 8px;">${escapeHtml(t('sec.recovery_subtitle'))}</p>
        <div style="font-family:ui-monospace,monospace;font-size:17px;text-align:center;padding:12px;background:var(--bg-soft);border-radius:8px;margin:12px 0;" id="recoveryCodeDisplay">${escapeHtml(formatRecoveryCode(code))}</div>
        <div class="btn-row" style="justify-content:center;gap:8px;">
          <button class="btn" id="modalRecoveryCopy">${escapeHtml(t('sec.copy'))}</button>
          <button class="btn" id="modalRecoveryDownload">${escapeHtml(t('sec.download'))}</button>
        </div>
        </div>
        <div class="modal-footer">
          <button class="btn primary" data-act="close">${escapeHtml(t('common.close'))}</button>
        </div>
      </div>`);
  if (!overlay) return;
  overlay.querySelector('#modalRecoveryCopy')?.addEventListener('click', async () => {
    const res = await copyRecoveryCode(code);
    toast(res.ok ? t('sec.copied') : t('sec.copy_failed'), res.ok ? 'success' : 'error');
  });
  overlay.querySelector('#modalRecoveryDownload')?.addEventListener('click', async () => {
    const res = await downloadRecoveryCode(code);
    toast(res.ok ? t('sec.downloaded') : t('sec.download_failed'), res.ok ? 'success' : 'error');
  });
  const closeRecovery = () => overlay.remove();
  overlay.querySelectorAll('[data-act="close"]').forEach(b => b.addEventListener('click', closeRecovery));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeRecovery(); });
}

async function openChangePinModal() {
  const verified = await pinOrRecoveryModal({ title: t('sec.change_pin'), message: t('sec.verify_body') });
  if (!verified) return;
  openFormModal({
    title: t('sec.change_pin'),
    sizeLg: false,
    bodyHtml: `
      <label>${escapeHtml(t('sec.pin_label'))}</label>
      <input type="password" id="newSecPin" inputmode="numeric" maxlength="8" class="form-control">
      <label style="margin-top:10px;">${escapeHtml(t('sec.pin_confirm'))}</label>
      <input type="password" id="newSecPin2" inputmode="numeric" maxlength="8" class="form-control">`,
    async onSave(modal) {
      const pin = modal.querySelector('#newSecPin').value.trim();
      const pin2 = modal.querySelector('#newSecPin2').value.trim();
      if (!isValidPin(pin) || isWeakPin(pin) || pin !== pin2) {
        toast(t('sec.pin_invalid_format'), 'error');
        return false;
      }
      const admin = getAdminOperator();
      if (!admin) return false;
      admin.pinHash = await hashSecret(pin);
      saveAll();
      toast(t('sec.pin_changed'), 'success');
      return true;
    },
  });
}

async function openRegenRecoveryModal() {
  const verified = await pinOrRecoveryModal({ title: t('sec.regen_recovery'), message: t('sec.verify_body') });
  if (!verified) return;
  const code = generateRecoveryCode();
  settings.recoveryCodeHash = await hashSecret(normalizeRecoveryCode(code));
  settings.recoveryCodeCreatedAt = new Date().toISOString().slice(0, 10);
  saveAll();
  showRecoveryCodeModal(code, t('sec.regen_recovery'));
}

async function disableSecurity() {
  const verified = await pinOrRecoveryModal({ title: t('sec.disable'), message: t('sec.disable_q') });
  if (!verified) return;
  settings.securityEnabled = false;
  settings.recoveryCodeHash = '';
  settings.operatorLockEnabled = false;
  settings.activeOperatorId = null;
  operators = [];
  saveAll();
  renderSecuritySettings();
  renderOperatorsList();
  renderOperatorLockSettings();
  applyOperatorPermissions();
  toast(t('sec.disabled_toast'), 'success');
}

function renderTelegramSettings() {
  const el = document.getElementById('telegramSettingsSection');
  if (!el) return;
  const tg = settings.telegram || {};
  el.innerHTML = `
    <h4 style="margin-bottom:10px;">Telegram Notifications</h4>
    <label>Bot Token</label>
    <input type="password" id="tgBotToken" value="${escapeHtml(tg.botToken || '')}" placeholder="123456:ABC-...">
    <label style="margin-top:8px;">Chat ID</label>
    <input type="text" id="tgChatId" value="${escapeHtml(tg.chatId || '')}" placeholder="-100123456789">
    <div style="margin-top:10px;display:flex;gap:8px;align-items:center;">
      <button class="btn small" id="btnTgTest">Test</button>
      <span style="font-size:12px;color:var(--text-muted);">Sends a test message to verify the bot works</span>
    </div>
    <div style="margin-top:12px;">
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="tgNotifyComplete" style="width:auto;" ${tg.notifyOnComplete ? 'checked' : ''}> Notify on order completed
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <input type="checkbox" id="tgNotifyHold" style="width:auto;" ${tg.notifyOnHold ? 'checked' : ''}> Notify on order on_hold
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <input type="checkbox" id="tgNotifyLowStock" style="width:auto;" ${tg.notifyOnLowStock ? 'checked' : ''}> Notify on low stock
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <input type="checkbox" id="tgNotifyPrinterError" style="width:auto;" ${(tg.notifyPrinterError ?? true) ? 'checked' : ''}> ${escapeHtml(t('fleet.notify_error'))}
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <input type="checkbox" id="tgNotifyPrinterOffline" style="width:auto;" ${(tg.notifyPrinterOffline ?? true) ? 'checked' : ''}> ${escapeHtml(t('fleet.notify_offline'))}
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <input type="checkbox" id="tgNotifyPrinterStall" style="width:auto;" ${tg.notifyPrinterStall ? 'checked' : ''}> ${escapeHtml(t('fleet.notify_stall'))}
      </label>
    </div>
    <button class="btn primary small" id="btnSaveTgSettings" style="margin-top:12px;">Save Telegram Settings</button>`;

  el.querySelector('#btnTgTest')?.addEventListener('click', () => {
    const botToken = el.querySelector('#tgBotToken').value.trim();
    const chatId   = el.querySelector('#tgChatId').value.trim();
    if (!botToken || !chatId) { toast('Enter bot token and chat ID first', 'error'); return; }
    if (window.hubAPI?.sendTelegram) {
      window.hubAPI.sendTelegram({ botToken, chatId, message: '✅ Khayt test notification' })
        .then(() => toast('Telegram test sent!', 'success'))
        .catch(e => toast('Telegram error: ' + e.message, 'error'));
    } else {
      toast('Telegram API not available in this build', 'info');
    }
  });

  el.querySelector('#btnSaveTgSettings')?.addEventListener('click', () => {
    const botToken         = secretInputSave((settings.telegram || {}).botToken, el.querySelector('#tgBotToken').value);
    const chatId           = el.querySelector('#tgChatId').value.trim();
    const notifyOnComplete = el.querySelector('#tgNotifyComplete').checked;
    const notifyOnHold     = el.querySelector('#tgNotifyHold').checked;
    const notifyOnLowStock = el.querySelector('#tgNotifyLowStock').checked;
    const notifyPrinterError   = el.querySelector('#tgNotifyPrinterError').checked;
    const notifyPrinterOffline = el.querySelector('#tgNotifyPrinterOffline').checked;
    const notifyPrinterStall   = el.querySelector('#tgNotifyPrinterStall').checked;
    settings.telegram = {
      botToken, chatId, notifyOnComplete, notifyOnHold, notifyOnLowStock,
      notifyPrinterError, notifyPrinterOffline, notifyPrinterStall,
    };
    saveAll();
    toast('Telegram settings saved', 'success');
  });
}
  const api = {
    renderLocationsSettings,
    renderEmailNotificationSettings,
    renderSmsNotificationSettings,
    renderAccountingSyncSettings,
    renderIntegrationsSettings,
    renderDigestSettings,
    renderAiSettings,
    renderSlicerSettings,
    renderCloudSettings,
    renderOperatorLockSettings,
    renderLoyaltyTiersSettings,
    renderWebhookSettings,
    renderEventWebhookSettings,
    renderFixedCostSettings,
    renderLanApiSettings,
    renderZatcaPhase2Settings,
    renderExchangeRatesSettings,
    renderBnplSettings,
    renderSavedFilterPresets,
    saveCurrentFilterPreset,
    updateLogoPreview,
    loadSettingsIntoForm,
    syncUpdaterOptionsFromSettings,
    renderStorageUsage,
    saveSettingsFromForm,
    saveSettingsFromPanel,
    saveLanApiSettingsFromForm,
    openRestoreBackupModal,
    openRestorePointsModal,
    openCloudSnapshotsModal,
    renderHolidayList,
    renderPostChecklistSettings,
    addPostCheckItem,
    deletePostCheckItem,
    renderCustomFieldsSettings,
    addCustomField,
    deleteCustomField,
    exportData,
    pruneArchivedOrders,
    importData,
    loadSampleData,
    clearSampleData,
    resetAllData,
    fullWipeData,
    renderSecuritySettings,
    renderTelegramSettings,
  };

  Object.assign(global, api);
  global.KhaytSettings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
