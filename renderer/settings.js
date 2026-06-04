/**
 * Settings tab: form load/save, integrations, ZATCA, LAN API, BNPL, backups.
 */
(function (global) {
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

/* ============================================================
   Feature I: Email Digest Scheduler
   ============================================================ */

function buildDigestEmailHtml() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const isWeekly = settings.emailDigest?.frequency === 'weekly';

  // Compute period bounds
  let periodLabel, periodFrom, periodTo;
  if (isWeekly) {
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
      <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px;">${isWeekly ? 'Weekly' : 'Daily'} Digest · ${escapeHtml(periodLabel)}</p>
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
      const wdWrap = el.querySelector('#digestWeekdayWrap');
      if (wdWrap) wdWrap.style.display = r.value === 'weekly' && r.checked ? '' : 'none';
    });
  });

  el.querySelector('#btnSaveDigest')?.addEventListener('click', () => {
    settings.emailDigest = {
      enabled:        el.querySelector('#digestEnabled').checked,
      frequency:      el.querySelector('[name="digestFreq"]:checked')?.value || 'daily',
      hour:           parseInt(el.querySelector('#digestHour').value, 10) || 8,
      weekday:        parseInt(el.querySelector('#digestWeekday').value, 10) || 1,
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

let _digestInFlight = false;


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
               <input type="password" class="op-pin-input" data-op-id="${op.id}"
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
            <button class="btn danger small" data-del-fc="${i}">✕</button>
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
        <input type="password" id="lan_intake_pin" value="${escapeHtml(secretInputValue(lan.intakePin))}" maxlength="12" placeholder="${escapeHtml(secretFieldPlaceholder(lan.intakePin) || 'Auto-generated on start')}" autocomplete="off">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;" data-i18n="lan.intake_pin_hint">Separate from owner PIN — shown to customers at /intake</div>
      </div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:10px;">
      <input type="checkbox" id="lan_bind_lan" style="width:auto;margin:0;" ${lan.bindLan ? 'checked' : ''}>
      <span>Listen on all network interfaces (LAN). Default is localhost only.</span>
    </label>
    <div style="font-size:11px;color:var(--text-muted);margin:4px 0 10px;padding:8px 10px;background:var(--bg-elev);border-radius:var(--radius);word-break:break-all;">
      Customer intake form: <code style="font-size:11px;">/intake</code> — requires the intake PIN above (auto-generated when the server starts if blank).
    </div>
    <div class="inline-pair" style="margin-top:10px;">
      <div style="flex:1;">
        <label data-i18n="lan.webhook_token">Printer Webhook Token</label>
        <div style="display:flex;gap:6px;">
          <input type="password" id="lan_wh_token" value="${escapeHtml(secretInputValue(lan.webhookToken))}" placeholder="${escapeHtml(secretFieldPlaceholder(lan.webhookToken) || 'e.g. secret123')}" style="flex:1;" autocomplete="off">
          <button class="btn ghost small" id="btnGenWebhookToken" title="Generate random token">🎲</button>
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

  if (lan.enabled) loadLanQr();

  el.querySelector('#btnSaveLan')?.addEventListener('click', () => {
    const prev = settings.lanApi || {};
    settings.lanApi = {
      ...prev,
      enabled: el.querySelector('#lan_enabled').checked,
      port: parseInt(el.querySelector('#lan_port').value) || 3219,
      pin:  secretInputSave(prev.pin, el.querySelector('#lan_pin').value),
      intakePin: secretInputSave(prev.intakePin, el.querySelector('#lan_intake_pin')?.value),
      webhookToken: secretInputSave(prev.webhookToken, el.querySelector('#lan_wh_token').value),
      sallaWebhookSecret: secretInputSave(prev.sallaWebhookSecret, el.querySelector('#lan_salla_secret')?.value),
      zidWebhookSecret: secretInputSave(prev.zidWebhookSecret, el.querySelector('#lan_zid_secret')?.value),
      tunnelEnabled: el.querySelector('#lan_tunnel_enabled').checked,
      bindLan: !!el.querySelector('#lan_bind_lan')?.checked,
    };
    saveAll();
    if (settings.lanApi.enabled) {
      startLanServer();
    } else {
      window.hubAPI?.stopLanServer?.();
      el.querySelector('#lanStatusRow').textContent = '⚫ Server stopped';
      el.querySelector('#lanQrWrap').style.display = 'none';
    }
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

  el.querySelector('#btnStartTunnel')?.addEventListener('click', async () => {
    if (!settings.lanApi?.enabled) {
      toast(t('lan.tunnel_need_server') || 'Start the LAN server first', 'warning');
      return;
    }
    if (!settings.lanApi?.pin || isSecretMasked(settings.lanApi.pin)) {
      toast(t('lan.tunnel_need_pin') || 'Set an owner LAN PIN before starting the tunnel', 'warning');
      return;
    }
    const port = settings.lanApi?.port || 3219;
    const confirmMsg = t('lan.tunnel_confirm_msg') || t('lan.tunnel_security_warning');
    if (!window.confirm(confirmMsg)) return;
    const tRow = el.querySelector('#tunnelStatusRow');
    if (tRow) tRow.textContent = '⏳ Connecting…';
    const res = await window.hubAPI?.startTunnel?.(port, { acknowledgedRisk: true });
    if (res?.ok) {
      tRow.innerHTML = `🟢 Active at <a href="#" class="lan-url-link" data-url="${escapeHtml(res.url)}" style="color:var(--primary)">${escapeHtml(res.url)}</a>`;
      tRow.querySelectorAll('.lan-url-link').forEach(a => { a.addEventListener('click', e => { e.preventDefault(); window.hubAPI?.openExternal?.(a.dataset.url); }); });
      toast(t('lan.tunnel_active'), 'success');
      updateWebhookUrlDisplay(res.url);
    } else {
      if (tRow) tRow.textContent = `❌ ${res?.error || 'Failed to connect'}`;
      toast(res?.error || t('lan.tunnel_failed'), 'error');
    }
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
          <input type="number" class="xr-input" data-code="${escapeHtml(code)}" value="${escapeHtml(String(rate))}" min="0" step="0.0001" placeholder="0.00" style="width:90px;padding:3px 6px;font-size:12px;">
          <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(base)}</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="margin-bottom:6px;">
      <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px;">${escapeHtml(t('xr.hint') || 'Exchange rates are used to convert foreign-currency orders into your base currency for analytics reporting.')}</p>
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
    `<a href="#" class="bnpl-dir-card" data-url="${escapeHtml(s.dashUrl)}" style="display:flex;flex-direction:column;gap:4px;padding:10px 12px;background:var(--bg-elev);border-radius:var(--radius);border-left:3px solid ${escapeHtml(s.color)};text-decoration:none;color:inherit;cursor:pointer;">
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
  $('#set_enableVat').checked   = !!settings.enableVat;
  $('#set_vatRate').value       = settings.vatRate ?? 15;
  $('#set_quotePrefix').value   = settings.quotePrefix || 'QUO';
  $('#set_useIcloud').checked   = !!settings.useIcloud;
  $('#set_taglineEn').value     = settings.taglineEn   || '';
  $('#set_taglineAr').value     = settings.taglineAr   || '';
  $('#set_invAccent').value     = safeCssColor(settings.invAccentColor, '#5E2E14');
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
  // Batch-2 Feature 10: Telegram settings
  renderTelegramSettings();
  // Feature I: Email digest scheduler
  renderDigestSettings();
  // Feature 7 (new 8-pack): Operator lock section
  renderOperatorLockSettings();
  // Feature 8 (new 8-pack): Loyalty tiers
  renderLoyaltyTiersSettings();
  // Round 12: Webhooks
  renderWebhookSettings();
  // Round 12: Fixed costs / break-even
  renderFixedCostSettings();
  // Online (customer intake)
  renderOnlineSettings?.();
  // Round 12: LAN API
  renderLanApiSettings();
  // ZATCA Phase 2
  renderZatcaPhase2Settings();
  renderBnplSettings();
  // Feature H: Exchange rates
  renderExchangeRatesSettings();
  // Round 12: Saved filter presets
  renderSavedFilterPresets();
  // Business Mode toggle buttons
  applyMode();
  // New feature sections inside settings tab
  renderSlicerProfiles();
  renderEnvLogs();
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
    theme:     $('#set_theme').value,
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
    enableVat:     $('#set_enableVat').checked,
    vatRate:       Math.max(0, num($('#set_vatRate').value, 15)),
    bizLogo:       settings.bizLogo || '',
    taglineEn:     $('#set_taglineEn').value.trim(),
    taglineAr:     $('#set_taglineAr').value.trim(),
    invAccentColor:$('#set_invAccent').value || '#5E2E14',
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
    // Feature 7 (new 8-pack): Operator lock
    operatorLockEnabled: !!$('#set_operatorLock')?.checked,
    activeOperatorId: settings.activeOperatorId || null,
    // Feature 8 (new 8-pack): Loyalty tiers
    loyaltyEnabled: !!$('#set_loyaltyEnabled')?.checked,
    loyaltyTiers:   settings.loyaltyTiers || [],
    // Batch-2 Feature 10: Telegram — preserved from renderTelegramSettings
    telegram: settings.telegram || { botToken: '', chatId: '', notifyOnComplete: false, notifyOnHold: false, notifyOnLowStock: false },
    // Round 12 — preserve managed-in-place settings
    webhooks:     settings.webhooks     || { enabled: false, secret: '', events: {} },
    fixedCosts:   settings.fixedCosts   || [],
    savedFilters: settings.savedFilters || [],
    // Payment instructions (textarea, not auto-included by DOM reconstruction)
    paymentInstructions: $('#set_paymentInstructions')?.value ?? settings.paymentInstructions ?? '',
    betaAcknowledged: true, // legacy field — always true, beta phase is over
    // Easy-wins batch: Calculator
    quoteValidityDays: Math.max(1, num($('#set_quoteValidityDays')?.value, 7)),
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
    // Preserve fields managed outside this form — never silently drop them
    zatcaPhase2:        settings.zatcaPhase2        || {},
    emailDigest:        settings.emailDigest        || {},
    bnpl:               settings.bnpl               || {},
    exchangeRates:      settings.exchangeRates       || {},
    staleHours:         settings.staleHours          || {},
    productionPaused:   settings.productionPaused    || false,
    pauseReason:        settings.pauseReason         || '',
    pausedAt:           settings.pausedAt            ?? null,
    filamentColours:    settings.filamentColours     || {},
    jobTemplates:       settings.jobTemplates        || [],
    resinProfiles:      settings.resinProfiles       || [],
    dismissedNotifs:    settings.dismissedNotifs     || {},
    kanbanCollapsed:    settings.kanbanCollapsed     || [],
    donationUrl:        settings.donationUrl         || '', // legacy — UI removed; preserve on save
    printerApi:         settings.printerApi          || {},
    locations:          settings.locations           || [],
    lanApi: (() => { migrateLanApiSettings(); return settings.lanApi || { enabled: false, port: 3219, pin: '' }; })(),
  };
  saveAll();
  i18n.set(settings.lang);
  applyTheme(settings.theme);
  applyMode();
  renderInventory();
  refreshCurrencyLabels();
  if (typeof renderBuild === 'function') renderBuild();
  toast(t('set.saved'), 'success');
}

/* ============================================================
   Backup restore UI (Feature 6)
   ============================================================ */
async function openRestoreBackupModal() {
  if (!window.hubAPI?.listBackups) { toast(t('set.restore_error'), 'error'); return; }
  let backups = [];
  try { backups = await window.hubAPI.listBackups(); } catch (_) {}
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
        replaceStoreFromSnapshot(data);
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
      <button type="button" data-act="rm-holiday" data-date="${escapeHtml(d)}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:13px; padding:0; line-height:1;">×</button>
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

function exportData() {
  if (!confirm(t('set.export_secrets_warning') || 'Export will redact API keys and secrets. Continue?')) return;
  downloadBlob(
    new Blob([JSON.stringify(buildExportPayload({ redactSecrets: true }), null, 2)], { type: 'application/json' }),
    `khayt-${new Date().toISOString().split('T')[0]}.json`
  );
  toast(t('set.exported'), 'success');
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
      replaceStoreFromSnapshot(data);
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
    settings.telegram = { botToken, chatId, notifyOnComplete, notifyOnHold, notifyOnLowStock };
    saveAll();
    toast('Telegram settings saved', 'success');
  });
}
  const api = {
    renderLocationsSettings,
    renderEmailNotificationSettings,
    renderDigestSettings,
    renderOperatorLockSettings,
    renderLoyaltyTiersSettings,
    renderWebhookSettings,
    renderFixedCostSettings,
    renderLanApiSettings,
    renderZatcaPhase2Settings,
    renderExchangeRatesSettings,
    renderBnplSettings,
    renderSavedFilterPresets,
    saveCurrentFilterPreset,
    updateLogoPreview,
    loadSettingsIntoForm,
    renderStorageUsage,
    saveSettingsFromForm,
    openRestoreBackupModal,
    renderHolidayList,
    renderPostChecklistSettings,
    addPostCheckItem,
    deletePostCheckItem,
    renderCustomFieldsSettings,
    addCustomField,
    deleteCustomField,
    exportData,
    importData,
    resetAllData,
    fullWipeData,
    renderSecuritySettings,
    renderTelegramSettings,
  };

  Object.assign(global, api);
  global.KhaytSettings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
