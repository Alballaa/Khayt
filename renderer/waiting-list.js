/**
 * Job intake waiting list: funnel, CRUD, promote to calculator, reminders.
 */
(function (global) {
/* ── Waiting List (Job Intake) ──────────────────────────── */
function renderWaitingList() {
  renderWaitingOnlinePanel?.();
  renderWaitingFunnel();
  const el = $('#waitingListSection');
  if (!el) return;
  if (waitingList.length === 0) {
    el.innerHTML = `<p class="dash-empty">${escapeHtml(t('waiting.empty'))}</p>`;
    return;
  }
  // Enthusiast (hobbyist) mode has no clients/sales pipeline — hide client names
  // and estimated sale value on intake items (the project/notes stay).
  const biz = (typeof KhaytTiers !== 'undefined') ? KhaytTiers.showsBusiness(settings.mode) : settings.mode !== 'enthusiast';
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
  const visible = waitingList.filter(w => w.status !== 'declined');
  const sorted = [...visible].sort((a, b) =>
    (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
  );
  const priorityColors = { urgent: 'var(--danger)', high: '#f59e0b', normal: 'var(--text-muted)', low: 'var(--text-muted)' };
  const priorityLabels = { urgent: '🔴', high: '🟠', normal: '🔵', low: '⚪' };
  const today = new Date().toISOString().split('T')[0];

  el.innerHTML = sorted.map(item => {
    const client = (biz && item.clientId) ? clients.find(c => c.id === item.clientId) : null;
    const clientName = client ? (client.nameEn || client.nameAr || '') : '';
    const dot = priorityLabels[item.priority] || '🔵';
    const isDueReminder = item.reminderDate && item.reminderDate <= today && item.status !== 'declined';
    return `<div class="waiting-item" data-id="${item.id}" style="${isDueReminder ? 'border-inline-start: 3px solid var(--primary);' : ''}">
      <div class="waiting-item-left">
        <span style="font-size:14px;">${dot}</span>
        <div>
          <div class="waiting-item-project">${escapeHtml(item.project || t('waiting.untitled'))}${item.status === 'reminded' ? ` <span style="font-size:10px;background:var(--primary);color:#fff;padding:1px 5px;border-radius:3px;">${escapeHtml(t('waiting.status_reminded') || 'reminded')}</span>` : ''}</div>
          ${clientName ? `<div class="waiting-item-client">👤 ${escapeHtml(clientName)}</div>` : ''}
          ${item.notes ? `<div class="waiting-item-notes">${escapeHtml(item.notes)}</div>` : ''}
          ${(biz && (item.estValue || item.estimatedValue)) ? `<div style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('waiting.est_prefix') || 'Est.')} ${fmtPrice(+(item.estValue || item.estimatedValue))}</div>` : ''}
          ${isDueReminder ? `<div style="font-size:11px;color:var(--primary);">⏰ Reminder due: ${escapeHtml(item.reminderDate)}</div>` : ''}
        </div>
      </div>
      <div class="waiting-item-actions">
        <button class="btn small ghost" data-act="waiting-remind" data-id="${item.id}">💬 ${escapeHtml(t('waiting.remind') || 'Remind')}</button>
        <button class="btn small ghost" data-act="waiting-decline" data-id="${item.id}">✕ ${escapeHtml(t('waiting.decline') || 'Decline')}</button>
        <button class="btn small" data-act="waiting-promote" data-id="${item.id}" title="${escapeHtml(settings.mode !== 'professional' ? (t('waiting.promote_calc') || t('waiting.promote')) : t('waiting.promote'))}">→ ${escapeHtml(settings.mode !== 'professional' ? (t('waiting.promote_calc') || 'Quote in calculator') : t('waiting.promote'))}</button>
        <button class="btn small ghost" data-act="waiting-edit" data-id="${item.id}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn small ghost danger" data-act="waiting-del" data-id="${item.id}">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function openWaitingItemEditor(itemId = null) {
  const existing = itemId ? waitingList.find(w => w.id === itemId) : null;
  const draft = existing
    ? { ...existing }
    : { id: uid('WAIT'), project: '', clientId: '', notes: '', priority: 'normal', addedAt: new Date().toISOString(),
        reminderDate: '', status: 'active', estimatedValue: 0 };

  const clientOpts = clients
    .map(c => `<option value="${c.id}" ${draft.clientId === c.id ? 'selected' : ''}>${escapeHtml(c.nameEn || c.nameAr || c.id)}</option>`)
    .join('');

  const priorityOpts = ['urgent','high','normal','low']
    .map(p => `<option value="${p}" ${draft.priority === p ? 'selected' : ''}>${escapeHtml(t('waiting.priority_' + p))}</option>`)
    .join('');

  openFormModal({
    title: existing ? t('waiting.edit') : t('waiting.add'),
    bodyHtml:
     `<label>${escapeHtml(t('waiting.project'))}</label>
      <input type="text" data-f="project" placeholder="${escapeHtml(t('waiting.project_ph'))}" value="${escapeHtml(draft.project || '')}">
      <label style="margin-top:10px;">${escapeHtml(t('waiting.client'))}</label>
      <select data-f="clientId"><option value="">${escapeHtml(t('waiting.no_client'))}</option>${clientOpts}</select>
      <label style="margin-top:10px;">${escapeHtml(t('waiting.priority_label'))}</label>
      <select data-f="priority">${priorityOpts}</select>
      <label style="margin-top:10px;">${escapeHtml(t('waiting.notes'))}</label>
      <textarea data-f="notes" rows="3" placeholder="${escapeHtml(t('waiting.notes_ph'))}" style="resize:vertical;">${escapeHtml(draft.notes || '')}</textarea>
      <label style="margin-top:10px;">${escapeHtml(t('waiting.est_value') || 'Estimated value')}</label>
      <input type="number" data-f="estimatedValue" min="0" step="0.01" value="${+draft.estimatedValue || 0}" placeholder="0">
      <label style="margin-top:10px;">${escapeHtml(t('waiting.reminder_date') || 'Reminder date')}</label>
      <input type="date" data-f="reminderDate" value="${escapeHtml(draft.reminderDate || '')}">
      <label style="margin-top:10px;">${escapeHtml(t('waiting.status') || 'Status')}</label>
      <select data-f="status">
        <option value="active" ${(draft.status || 'active') === 'active' ? 'selected' : ''}>Active</option>
        <option value="reminded" ${draft.status === 'reminded' ? 'selected' : ''}>Reminded</option>
        <option value="declined" ${draft.status === 'declined' ? 'selected' : ''}>Declined</option>
      </select>`,
    onSave() {
      draft.project        = document.querySelector('[data-f="project"]')?.value.trim() || '';
      draft.clientId       = document.querySelector('[data-f="clientId"]')?.value || '';
      draft.priority       = document.querySelector('[data-f="priority"]')?.value || 'normal';
      draft.notes          = document.querySelector('[data-f="notes"]')?.value.trim() || '';
      draft.estimatedValue = parseFloat(document.querySelector('[data-f="estimatedValue"]')?.value) || 0;
      draft.reminderDate   = document.querySelector('[data-f="reminderDate"]')?.value || '';
      draft.status         = document.querySelector('[data-f="status"]')?.value || 'active';
      if (!draft.project) { alert(t('waiting.project_required')); return false; }
      if (!existing) {
        waitingList.unshift(draft);
      } else {
        const idx = waitingList.findIndex(w => w.id === itemId);
        if (idx !== -1) waitingList[idx] = draft;
      }
      saveAll();
      renderWaitingList();
      updateWaitingBadge();
    }
  });
}

/** Match waiting-list client or create a lightweight client record. */
function resolveClientFromWaitingItem(item) {
  if (!item) return null;
  if (item.clientId && clients.find((c) => c.id === item.clientId)) return item.clientId;
  const name = String(item.clientName || '').trim();
  if (!name) return null;
  const lower = name.toLowerCase();
  let existing = clients.find((c) => {
    const en = (c.nameEn || '').trim().toLowerCase();
    const ar = (c.nameAr || '').trim().toLowerCase();
    return en === lower || ar === lower;
  });
  if (!existing && item.phone) {
    const phone = String(item.phone).trim();
    existing = clients.find((c) => String(c.phone || '').trim() === phone);
  }
  if (existing) return existing.id;
  const created = {
    id: uid('CLI'),
    nameEn: name,
    nameAr: '',
    phone: item.phone || '',
    email: item.email || '',
  };
  clients.push(created);
  saveAll();
  return created.id;
}

function prefillCalculatorFromWaitingItem(item) {
  if (!item) return;
  const clientId = resolveClientFromWaitingItem(item);
  if (clientId) {
    currentClientId = clientId;
    const c = clients.find((x) => x.id === clientId);
    if ($('#clientInput') && c) $('#clientInput').value = localName(c);
  } else if ($('#clientInput')) {
    $('#clientInput').value = item.clientName || '';
    currentClientId = null;
  }
  if ($('#partName')) $('#partName').value = String(item.project || '').slice(0, 120);
  if ($('#partNote')) {
    const lines = [];
    if (item.notes && item.notes !== item.project) lines.push(String(item.notes));
    if (item.phone) lines.push(`Phone: ${item.phone}`);
    if (item.email) lines.push(`Email: ${item.email}`);
    if (item.material) lines.push(`Material: ${item.material}`);
    if (item.budget) lines.push(`Budget: ${item.budget}`);
    if (item.referenceLink) lines.push(`Link: ${item.referenceLink}`);
    $('#partNote').value = lines.join('\n').slice(0, 800);
  }
  if (typeof renderBuild === 'function') renderBuild();
  if (typeof updateGrandTotal === 'function') updateGrandTotal();
}

function promoteWaitingItem(itemId) {
  const item = waitingList.find(w => w.id === itemId);
  if (!item) return;
  waitingListHistory.push({ ...item, status: 'converted', convertedAt: new Date().toISOString() });
  waitingList = waitingList.filter(w => w.id !== itemId);
  saveAll();
  renderWaitingList();
  updateWaitingBadge();
  switchTab('calculator-tab');
  setTimeout(() => {
    prefillCalculatorFromWaitingItem(item);
    toast(t('waiting.promote_done') || 'Calculator opened — finish your quote and save the order.', 'info', 4500);
  }, 100);
}

function updateWaitingBadge() {
  const badge = $('#waitingBadge');
  if (!badge) return;
  const activeCount = waitingList.filter(w => w.status === 'active' || w.status === 'reminded').length;
  badge.textContent = activeCount;
  badge.style.display = activeCount > 0 ? 'inline-flex' : 'none';
  // Pulse badge if any item has a reminder date today or overdue
  const today = new Date().toISOString().split('T')[0];
  const hasDueReminder = waitingList.some(w => w.reminderDate && w.reminderDate <= today && w.status !== 'declined');
  badge.style.animation = hasDueReminder ? 'pulse 1s infinite' : '';
}

function renderWaitingFunnel() {
  const el = $('#waitingFunnelSection');
  if (!el) return;
  const allItems = [...waitingList, ...waitingListHistory];
  const totalAdded = allItems.length;
  // Hide the funnel entirely when there's no intake data — avoids an all-zeros widget
  if (totalAdded === 0) { el.innerHTML = ''; return; }
  const active = waitingList.filter(w => w.status === 'active' || w.status === 'reminded').length;
  const converted = waitingListHistory.filter(w => w.status === 'converted').length;
  const declined = allItems.filter(w => w.status === 'declined').length;
  const convRate = totalAdded > 0 ? ((converted / totalAdded) * 100).toFixed(1) : '0.0';
  // Pipeline value is a sales figure — business modes only.
  const biz = (typeof KhaytTiers !== 'undefined') ? KhaytTiers.showsBusiness(settings.mode) : settings.mode !== 'enthusiast';
  const pipeline = waitingList
    .filter(w => w.status === 'active' || w.status === 'reminded')
    .reduce((s, w) => s + (+(w.estValue || w.estimatedValue) || 0), 0);

  // Bar segments
  const convPct  = totalAdded > 0 ? (converted / totalAdded * 100) : 0;
  const declPct  = totalAdded > 0 ? (declined  / totalAdded * 100) : 0;
  const actPct   = totalAdded > 0 ? (active    / totalAdded * 100) : 0;

  el.innerHTML = `
    <h3 class="card-head" style="margin-bottom:12px;"><span class="swatch"></span><span>${escapeHtml(t('waiting.funnel_title') || 'Waiting List Funnel')}</span></h3>
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:14px;">
      <div style="flex:1;min-width:100px;text-align:center;">
        <div style="font-size:22px;font-weight:700;">${totalAdded}</div>
        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('waiting.funnel_total') || 'Total Added')}</div>
      </div>
      <div style="flex:1;min-width:100px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:var(--primary);">${active}</div>
        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('waiting.funnel_active') || 'Active')}</div>
      </div>
      <div style="flex:1;min-width:100px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#22c55e;">${converted}</div>
        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('waiting.funnel_converted') || 'Converted')} (${convRate}%)</div>
      </div>
      <div style="flex:1;min-width:100px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:var(--danger);">${declined}</div>
        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('waiting.funnel_declined') || 'Declined')}</div>
      </div>
      ${biz ? `<div style="flex:1;min-width:120px;text-align:center;">
        <div style="font-size:16px;font-weight:700;color:#f59e0b;">${fmtPrice(pipeline)}</div>
        <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('waiting.funnel_pipeline') || 'Pipeline Value')}</div>
      </div>` : ''}
    </div>
    ${totalAdded > 0 ? `
    <div style="height:10px;border-radius:5px;overflow:hidden;display:flex;margin-top:4px;">
      <div style="width:${convPct.toFixed(1)}%;background:#22c55e;" title="Converted: ${converted}"></div>
      <div style="width:${declPct.toFixed(1)}%;background:var(--danger);" title="Declined: ${declined}"></div>
      <div style="width:${actPct.toFixed(1)}%;background:var(--primary);" title="Active: ${active}"></div>
    </div>` : ''}`;
}

function openReminderModal(itemId) {
  const item = waitingList.find(w => w.id === itemId);
  if (!item) return;
  const client = item.clientId ? clients.find(c => c.id === item.clientId) : null;
  const clientName = client ? (client.nameEn || client.nameAr || '') : 'there';
  const defaultMsg = `Hi ${clientName}, just a reminder about your project '${item.project || 'your order'}' — we have a slot available. Let us know if you'd like to proceed!`;
  const hasEmail = !!settings.emailConfig && settings.emailConfig.provider !== 'none';

  openFormModal({
    title: t('waiting.remind_title') || 'Send Reminder',
    sizeLg: true,
    bodyHtml: `
      <p style="font-size:13px;color:var(--text-muted);margin-top:0;">Send a reminder to <strong>${escapeHtml(clientName)}</strong> about project <strong>${escapeHtml(item.project || '')}</strong></p>
      <label>${escapeHtml(t('waiting.remind_msg') || 'Message')}</label>
      <textarea id="reminderMsg" rows="4" style="resize:vertical;">${escapeHtml(defaultMsg)}</textarea>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;">
        <div style="flex:1;min-width:180px;">
          <label style="margin-top:0;">${escapeHtml(t('waiting.remind_phone') || 'WhatsApp phone')}</label>
          <input type="tel" id="reminderPhone" value="${escapeHtml(client?.phone || '')}" placeholder="+966501234567">
        </div>
        ${hasEmail ? `
        <div style="flex:1;min-width:180px;">
          <label style="margin-top:0;">${escapeHtml(t('waiting.remind_email') || 'Email')}</label>
          <input type="email" id="reminderEmail" value="${escapeHtml(client?.email || '')}" placeholder="client@example.com">
        </div>` : ''}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button id="btnSendWhatsApp" class="btn small primary">💬 Send WhatsApp</button>
        ${hasEmail ? `<button id="btnSendReminderEmail" class="btn small">✉ Send Email</button>` : ''}
      </div>`,
    saveLabel: t('common.close') || 'Close',
    onSave() { return true; }
  });

  // Wire up buttons after modal renders
  setTimeout(() => {
    document.querySelector('#btnSendWhatsApp')?.addEventListener('click', () => {
      const phone = document.querySelector('#reminderPhone')?.value.trim() || '';
      const msg   = document.querySelector('#reminderMsg')?.value.trim() || defaultMsg;
      if (!phone) { toast('Phone number required for WhatsApp', 'error'); return; }
      window.hubAPI?.shareWhatsApp?.({ phone, message: msg });
      item.status = 'reminded';
      item.reminderSentAt = new Date().toISOString();
      saveAll();
      renderWaitingList();
      updateWaitingBadge();
      toast(t('waiting.reminded_ok') || 'Reminder sent via WhatsApp', 'success');
    });

    document.querySelector('#btnSendReminderEmail')?.addEventListener('click', async () => {
      const email = document.querySelector('#reminderEmail')?.value.trim() || '';
      const msg   = document.querySelector('#reminderMsg')?.value.trim() || defaultMsg;
      if (!email) { toast('Email address required', 'error'); return; }
      const cfg = settings.emailConfig;
      const body = `<p>${escapeHtml(msg).replace(/\n/g, '<br>')}</p>`;
      const subject = `Reminder: ${(item.project || 'Your project').replace(/[\r\n]/g, ' ')} at ${(settings.bizEn || 'Khayt').replace(/[\r\n]/g, ' ')}`;
      const result = await window.hubAPI?.sendEmail?.({ to: email, subject, body, smtpConfig: cfg });
      if (result?.ok) {
        item.status = 'reminded';
        item.reminderSentAt = new Date().toISOString();
        saveAll();
        renderWaitingList();
        updateWaitingBadge();
        toast(t('waiting.reminded_ok') || 'Reminder sent via email', 'success');
      } else {
        toast('Email send failed: ' + (result?.error || ''), 'error');
      }
    });
  }, 80);
}

  const api = {
    renderWaitingList,
    openWaitingItemEditor,
    resolveClientFromWaitingItem,
    prefillCalculatorFromWaitingItem,
    promoteWaitingItem,
    updateWaitingBadge,
    renderWaitingFunnel,
    openReminderModal,
  };

  Object.assign(global, api);
  global.KhaytWaitingList = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
