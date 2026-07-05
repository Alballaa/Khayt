/**
 * Shift checklist, EOD report, recurring orders, gift cards, VAT export,
 * slicer profiles, and environmental logging.
 */
/* ============================================================
   BATCH-2 FEATURES (Features 1-15)
   ============================================================ */


/* ── Feature 2: Shift-Start Checklist ──────────────────────── */
function openShiftChecklistModal() {
  const checks = [
    { id: 'c1', label: t('checkFilamentLevels')    || 'Check filament levels on all printers' },
    { id: 'c2', label: t('verifyTemperatures')     || 'Verify printer temperatures are correct' },
    { id: 'c3', label: t('reviewOrderQueue')       || "Review today's order queue" },
    { id: 'c4', label: t('checkFailedPrints')      || 'Check for any failed prints from previous shift' },
    { id: 'c5', label: t('cleanPrintSurfaces')     || 'Clean print surfaces' },
    { id: 'c6', label: t('logShiftStartTime')      || 'Log shift start time' },
  ];
  const bodyHtml = `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">${escapeHtml(t('shiftChecklistHint') || 'Complete the checklist before starting your shift.')}</p>
    ${checks.map(c => `
      <label style="display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;border-bottom:1px solid var(--border-soft);">
        <input type="checkbox" id="shift_${c.id}" style="width:auto;margin:0;accent-color:var(--primary);">
        <span style="font-size:13px;">${escapeHtml(c.label)}</span>
      </label>`).join('')}`;
  openFormModal({
    title: '▶ ' + t('shiftChecklist'),
    bodyHtml,
    saveLabel: t('startShift') || 'Start Shift',
    sizeLg: false,
    onSave(modal) {
      const count = checks.filter(c => modal.querySelector(`#shift_${c.id}`)?.checked).length;
      if (!shiftLogs) shiftLogs = [];
      const activeOp = settings.activeOperatorId
        ? (operators.find(o => o.id === settings.activeOperatorId)?.name || null)
        : null;
      shiftLogs.push({
        id: uid('SHF'),
        startedAt: new Date().toISOString(),
        operator: activeOp,
        checksCompleted: count,
        totalChecks: checks.length,
      });
      saveAll();
      toast('Shift started!', 'success');
    },
  });
}

/* ── Feature 3: End-of-Day Report Modal ─────────────────────── */
function openEndOfDayReport() {
  const today = localDateStr();
  const completedToday = printLog.filter(o => o.status === 'completed' && (o.completedAt || o.date || '').startsWith(today));
  const revenueToday   = completedToday.reduce((s, o) => s + orderRevenueBase(o), 0);
  const inProgress     = printLog.filter(o => ['pending','printing','post','qc'].includes(o.status));
  const wasteToday     = wasteLog.filter(w => (w.date || '').startsWith(today));
  const wasteTotalG    = wasteToday.reduce((s, w) => s + (+w.weight || 0), 0);
  const timeToday      = timeEntries.filter(te => (te.date || te.startedAt || '').startsWith(today));
  const timeTotal      = timeToday.reduce((s, te) => s + (+te.durationMins || 0), 0);
  const overdueOrders  = printLog.filter(o => o.dueDate === today && o.status !== 'completed' && o.status !== 'quote');

  const overdueHtml = overdueOrders.length > 0 ? `
    <div style="background:rgba(245,166,35,0.1);border:1px solid rgba(245,166,35,0.35);border-radius:6px;padding:10px;margin-top:12px;">
      <strong style="font-size:12px;color:var(--warning);">Due Today — Not Completed</strong>
      ${overdueOrders.map(o => `<div style="font-size:12px;margin-top:4px;">• ${escapeHtml(o.project || o.id)}</div>`).join('')}
    </div>` : '';

  const bodyHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-muted);">Orders Completed</div>
        <div style="font-size:24px;font-weight:700;">${completedToday.length}</div>
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-muted);">Revenue Today</div>
        <div style="font-size:20px;font-weight:700;">${fmtPrice(revenueToday)}</div>
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-muted);">In Progress</div>
        <div style="font-size:24px;font-weight:700;">${inProgress.length}</div>
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-muted);">Filament Used Today</div>
        <div style="font-size:20px;font-weight:700;">${wasteTotalG.toFixed(0)}g</div>
      </div>
      <div class="card" style="padding:12px;grid-column:1/-1;">
        <div style="font-size:11px;color:var(--text-muted);">Time Logged Today</div>
        <div style="font-size:20px;font-weight:700;">${(timeTotal / 60).toFixed(1)}h (${timeTotal} min)</div>
      </div>
    </div>
    ${overdueHtml}`;

  const eodHtmlForExport = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>End of Day Report — ${today}</title>
    <style>body{font-family:sans-serif;max-width:600px;margin:auto;padding:24px;}h1{font-size:20px;}table{width:100%;border-collapse:collapse;}td,th{border:1px solid #ddd;padding:8px;}</style></head>
    <body><h1>End of Day Report — ${escapeHtml(today)}</h1>
    <table><tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Orders Completed</td><td>${completedToday.length}</td></tr>
    <tr><td>Revenue</td><td>${fmtPrice(revenueToday)}</td></tr>
    <tr><td>In Progress</td><td>${inProgress.length}</td></tr>
    <tr><td>Filament Used</td><td>${wasteTotalG.toFixed(0)}g</td></tr>
    <tr><td>Time Logged</td><td>${timeTotal} min</td></tr>
    </table>${overdueOrders.length > 0 ? '<h2>Due Today — Not Completed</h2><ul>' + overdueOrders.map(o => `<li>${escapeHtml(o.project || o.id)}</li>`).join('') + '</ul>' : ''}
    </body></html>`;

  openFormModal({
    title: 'End of Day Report — ' + today,
    bodyHtml,
    sizeLg: false,
    noSave: false,
    saveLabel: 'Export as PDF',
    onSave() {
      if (window.hubAPI?.exportPDF) {
        window.hubAPI.exportPDF({ html: eodHtmlForExport, filename: `eod-report-${today}.pdf` })
          .then(() => toast('Report exported!', 'success'))
          .catch(() => toast('PDF export not available', 'error'));
      } else {
        toast('PDF export not available in this build', 'info');
      }
      return false; // keep modal open after export
    },
  });
}

/* ── Feature 4: Recurring Order Auto-Generation ─────────────── */
function processRecurringOrders() {
  const today = localDateStr();
  let created = 0;
  const toUpdate = [];

  for (const order of printLog) {
    if (!order.isRecurring) continue;
    if (!order.nextDueDate || order.nextDueDate > today) continue;

    // Check no child created in last 24h
    const recentChild = printLog.find(o =>
      o.parentRecurringId === order.id &&
      o.date >= new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    );
    if (recentChild) continue;

    const newOrder = {
      ...order,
      id: uid('REC'),
      date: today,
      dueDate: order.nextDueDate,
      status: 'pending',
      isRecurring: false,
      parentRecurringId: order.id,
      queuePos: printLog.filter(o => o.status === 'pending').length + 1,
      createdAt: new Date().toISOString(),
      completedAt: null,
      printingStartedAt: null,
      timerStart: null,
      timerPausedAt: null,
      timerPausedMs: null,
      // Clear fields that must not carry over from the parent order
      survey: null,
      paymentStatus: null,
      invoiceId: null,
      giftCardCode: null,
      giftCardDiscount: null,
      changeLog: [],
      failurePhotoPath: null,
    };
    printLog.push(newOrder);
    created++;

    // Advance nextDueDate
    const d = new Date(order.nextDueDate + 'T00:00:00');
    if (order.recurringInterval === 'weekly')   d.setDate(d.getDate() + 7);
    else if (order.recurringInterval === 'biweekly') d.setDate(d.getDate() + 14);
    else /* monthly */                          d.setMonth(d.getMonth() + 1);
    order.nextDueDate = d.toISOString().slice(0, 10);
    toUpdate.push(order.id);
  }

  if (created > 0) {
    saveAll();
    setTimeout(() => toast(`Auto-created ${created} recurring order${created > 1 ? 's' : ''}`, 'success', 4000), 500);
  }
}

/* ── Quote follow-up auto-nudge (opt-in, default OFF) ────────────
   Mirrors the recurring-order auto-create pattern: on app start (and on a
   timer) it finds quotes due for a follow-up via the pure selector and either
   sends them (if a phone + transport is available) or logs them, recording
   followUpSentAt/followUpCount so they are not repeated within the cooldown. */
function processQuoteFollowUps() {
  if (typeof KhaytQuoteFollowUp === 'undefined') return;
  const cfg = KhaytQuoteFollowUp.followUpConfig(settings);
  if (!cfg.enabled) return; // toggle OFF by default

  const due = KhaytQuoteFollowUp.selectQuotesDueForFollowUp(printLog, settings, Date.now());
  if (due.length === 0) return;

  let sent = 0;
  for (const q of due) {
    const client = q.clientId ? clients.find(c => c.id === q.clientId) : null;
    const phone = (client?.phone || '').replace(/\D/g, '');
    if (phone && typeof sendQuoteFollowUp === 'function') {
      // Reuse the existing transport; mark + persist happens inside.
      sendQuoteFollowUp(q.id, { silent: true });
    } else {
      // No phone/transport — still record the nudge so we surface it once.
      Object.assign(q, KhaytQuoteFollowUp.markFollowUpPatch(q, Date.now()));
    }
    sent++;
  }
  saveAll();
  if (typeof renderDashboard === 'function') renderDashboard();
  setTimeout(() => toast(t('quote.followup_auto', { n: sent }) || `Followed up on ${sent} quote(s)`, 'info', 4000), 600);
}

/** Fire an outbound event webhook for an order event (opt-in). Fire-and-forget;
 *  HMAC-signed in the main process. No-op unless settings.eventWebhooks is on
 *  with this event enabled + a URL set. */
function fireOrderWebhook(type, order) {
  try {
    if (!order || typeof KhaytWebhooks === 'undefined' || !window.hubAPI?.webhookPost) return;
    const w = settings.eventWebhooks;
    if (!w || !w.enabled || !/^https:\/\//i.test(w.url || '')) return;
    if (w.events && w.events[type] === false) return;
    const client = order.clientId ? clients.find((c) => c.id === order.clientId) : null;
    const payload = KhaytWebhooks.buildWebhookEvent(type, order, {
      at: new Date().toISOString(),
      shopName: settings.bizEn || settings.bizAr || 'Khayt',
      clientName: client ? (typeof localName === 'function' ? localName(client) : client.name) : '',
      currency: (typeof currencySymbol === 'function') ? currencySymbol() : '',
    });
    Promise.resolve(window.hubAPI.webhookPost({ url: w.url, secret: w.secret, payload })).catch(() => {});
  } catch (e) { /* webhooks must never break the action */ }
}

/** Flag overdue unpaid invoices for a payment reminder (opt-in). Marks them
 *  (dedup/cooldown/cap via the pure lib) and surfaces a single prompt; the owner
 *  sends with the existing one-tap 💰 reminder. Does not auto-message customers. */
function processPaymentReminders() {
  if (typeof KhaytPaymentReminder === 'undefined') return;
  const cfg = KhaytPaymentReminder.reminderConfig(settings);
  if (!cfg.enabled) return;
  const owedOf = (o) => (typeof orderOwedBase === 'function' ? orderOwedBase(o) : (+o.price || 0) - (+o.paidAmount || 0));
  const due = KhaytPaymentReminder.selectInvoicesDueForReminder(printLog, settings, owedOf, Date.now());
  if (due.length === 0) return;
  for (const o of due) Object.assign(o, KhaytPaymentReminder.markReminderPatch(o, Date.now()));
  saveAll();
  if (typeof renderDashboard === 'function') renderDashboard();
  setTimeout(() => toast(t('pay.reminder_auto', { n: due.length }) || `${due.length} invoice(s) overdue — send a payment reminder`, 'info', 5000), 800);
}

/** Periodic overdue-invoice check (~6h). Idempotent. */
function startPaymentReminderTimer() {
  if (typeof window === 'undefined') return;
  if (window.__khaytPayReminderTimer) return;
  window.__khaytPayReminderTimer = setInterval(() => {
    try { processPaymentReminders(); } catch (e) { console.error('[payment-reminder]', e); }
  }, 6 * 60 * 60 * 1000);
}

/** Start the periodic auto-nudge timer (re-checks every ~6h). Idempotent. */
function startQuoteFollowUpTimer() {
  if (typeof window === 'undefined') return;
  if (window.__khaytQuoteFollowUpTimer) return;
  window.__khaytQuoteFollowUpTimer = setInterval(() => {
    try { processQuoteFollowUps(); } catch (e) { console.error('[quote-followup]', e); }
  }, 6 * 60 * 60 * 1000);
}

/* ── Feature 5: Gift Cards / Store Credit ───────────────────── */
function renderGiftCards() {
  const container = document.getElementById('giftCardsContainer');
  if (!container) return;
  if (giftCards.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:24px;">${escapeHtml(t('giftCardEmpty') || 'No gift cards issued yet.')}</div>`;
    return;
  }
  const today = localDateStr();
  const rows = giftCards.map(gc => {
    const cl = gc.issuedTo ? clients.find(c => c.id === gc.issuedTo) : null;
    const expired = gc.expiresAt && gc.expiresAt < today;
    const status = expired ? t('gcExpired') || 'Expired' : (+gc.balance <= 0 ? t('gcUsed') || 'Used' : t('gcActive') || 'Active');
    const statusColor = expired ? 'var(--danger)' : (+gc.balance <= 0 ? 'var(--text-muted)' : 'var(--success)');
    return `<tr>
      <td style="font-family:monospace;">${escapeHtml(gc.code)}</td>
      <td>${fmtPrice(gc.balance)} / ${fmtPrice(gc.initialBalance)}</td>
      <td>${cl ? escapeHtml(localName(cl)) : (gc.issuedToName ? escapeHtml(gc.issuedToName) : '—')}</td>
      <td>${gc.expiresAt ? escapeHtml(gc.expiresAt) : '—'}</td>
      <td style="color:${statusColor};font-weight:600;">${escapeHtml(status)}</td>
    </tr>`;
  }).join('');
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>${escapeHtml(t('giftCardCode'))}</th><th>${escapeHtml(t('giftCardBalance'))}</th><th>${escapeHtml(t('giftCardIssuedTo'))}</th><th>${escapeHtml(t('giftCardExpiry'))}</th><th>${escapeHtml(t('common.status'))}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openCreateGiftCardModal() {
  const shortUid = () => uid('GC').replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const code = shortUid();
  const clientOptions = clients.map(c => `<option value="${c.id}">${escapeHtml(localName(c))}</option>`).join('');
  openFormModal({
    title: t('issueGiftCard'),
    sizeLg: false,
    saveLabel: t('common.save'),
    bodyHtml: `
      <label>${escapeHtml(t('giftCardCode'))}</label>
      <input type="text" id="gcCode" value="${escapeHtml(code)}" style="font-family:monospace;">
      <label style="margin-top:10px;">${escapeHtml(t('giftCardIssuedTo'))}</label>
      <select id="gcClient"><option value="">— ${escapeHtml(t('common.none') || 'None')} —</option>${clientOptions}</select>
      <label style="margin-top:10px;">${escapeHtml(t('giftCardInitialBalance'))} (${currencySymbol()})</label>
      <input type="number" id="gcBalance" min="0" step="0.01" value="50">
      <label style="margin-top:10px;">${escapeHtml(t('giftCardExpiry'))}</label>
      <input type="date" id="gcExpiry">`,
    onSave(modal) {
      const codeVal = modal.querySelector('#gcCode').value.trim().toUpperCase();
      const balance = Math.max(0, Math.min(100000, num(modal.querySelector('#gcBalance').value, 0)));
      if (!codeVal) { toast(t('giftCardCodeRequired') || 'Enter a code', 'error'); return false; }
      if (!/^[A-Z0-9]{3,20}$/.test(codeVal)) { toast(t('giftCardCodeInvalid') || 'Code must be 3–20 alphanumeric characters', 'error'); return false; }
      if (balance <= 0) { toast(t('giftCardBalanceRequired') || 'Initial balance must be greater than 0', 'error'); return false; }
      if (giftCards.find(g => g.code === codeVal)) { toast(t('giftCardCodeDuplicate') || 'Code already exists', 'error'); return false; }
      const clientId = modal.querySelector('#gcClient').value;
      const cl = clientId ? clients.find(c => c.id === clientId) : null;
      giftCards.push({
        id: uid('GC'),
        code: codeVal,
        initialBalance: balance,
        balance,
        issuedTo: clientId || null,
        issuedToName: cl ? localName(cl) : '',
        issuedAt: new Date().toISOString(),
        expiresAt: modal.querySelector('#gcExpiry').value || null,
        redeemedOrders: [],
      });
      saveAll();
      renderGiftCards();
      toast(t('giftCardIssued') || 'Gift card issued!', 'success');
    },
  });
}

function applyGiftCard(orderId, code) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return false;
  const gc = giftCards.find(g => g.code === code.trim().toUpperCase());
  if (!gc) { toast(t('giftCardInvalid') || 'Invalid or depleted gift card', 'error'); return false; }
  if (+gc.balance <= 0) { toast(t('giftCardInvalid') || 'Invalid or depleted gift card', 'error'); return false; }
  const today = localDateStr();
  if (gc.expiresAt && gc.expiresAt < today) { toast(t('giftCardExpired') || 'Gift card is expired', 'error'); return false; }
  const outstanding = Math.max(0, (+order.price || 0) - (+order.paidAmount || 0) - (+order.giftCardDiscount || 0));
  const deduct = Math.min(+gc.balance, outstanding);
  if (deduct <= 0) { toast(t('pay.order_fully_covered') || 'Order is already fully covered', 'info'); return false; }
  // Guard legacy/imported cards that predate the redeemedOrders field (avoids a
  // TypeError that would abort after the balance was already mutated in memory).
  if (!Array.isArray(gc.redeemedOrders)) gc.redeemedOrders = [];
  gc.balance = Math.max(0, +gc.balance - deduct);
  gc.redeemedOrders.push({ orderId, amount: deduct, at: new Date().toISOString() });
  order.giftCardCode = code;
  // Accumulate so applying a second card to the same order keeps the prior credit
  // (outstanding above is already computed net of any existing giftCardDiscount).
  order.giftCardDiscount = (+order.giftCardDiscount || 0) + deduct;
  saveAll();
  toast(t('giftCardAppliedAmount', { amt: fmtPrice(deduct) }) || `Gift card applied! ${fmtPrice(deduct)} deducted.`, 'success');
  return true;
}

/* ── Feature 6: Multi-Material AMS/MMU Cost ─────────────────── */
// Note: Multi-material support already exists via currentExtraMaterials / extraMaterials array
// and computePartBaseCost already handles part.extraMaterials.
// This feature exposes a UI "Add Material" button that appends to currentExtraMaterials.
// The existing renderExtraMaterials() function in app.js handles display.
// We add a convenience wrapper here for clarity.
function addAMSMaterialRow() {
  currentExtraMaterials.push({ material: '', weight: 0 });
  if (typeof renderExtraMaterials === 'function') renderExtraMaterials();
}

/* ── Feature 7: GAZT VAT Return Export ─────────────────────── */
function exportGaztVatReturn(period) {
  period = period || 'year';
  const now = new Date();
  let fromDate, toDate;
  if (period === 'year') {
    fromDate = `${now.getFullYear()}-01-01`;
    toDate   = `${now.getFullYear()}-12-31`;
  } else if (period === 'q1') { fromDate = `${now.getFullYear()}-01-01`; toDate = `${now.getFullYear()}-03-31`; }
  else if (period === 'q2') { fromDate = `${now.getFullYear()}-04-01`; toDate = `${now.getFullYear()}-06-30`; }
  else if (period === 'q3') { fromDate = `${now.getFullYear()}-07-01`; toDate = `${now.getFullYear()}-09-30`; }
  else if (period === 'q4') { fromDate = `${now.getFullYear()}-10-01`; toDate = `${now.getFullYear()}-12-31`; }
  else { fromDate = `${now.getFullYear()}-01-01`; toDate = `${now.getFullYear()}-12-31`; }

  const periodOrders = printLog.filter(o =>
    o.status === 'completed' && o.date >= fromDate && o.date <= toDate
  );
  const box1 = periodOrders.reduce((s, o) => s + orderRevenueBase(o), 0);
  const box2 = periodOrders.filter(o => +o.vatRate === 0).reduce((s, o) => s + orderRevenueBase(o), 0);
  const box3 = periodOrders.reduce((s, o) => s + (convertToBase(+o.vatAmount || 0, orderCurrency(o))), 0);
  const periodExp = (expenses || []).filter(e => e.date >= fromDate && e.date <= toDate);
  const box6 = periodExp.reduce((s, e) => s + (+e.amount || 0), 0);
  const box7 = periodExp.filter(e => e.vatAmount > 0).reduce((s, e) => s + (+e.vatAmount || 0), 0);
  const netVat = box3 - box7;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>GAZT VAT Return — ${escapeHtml(period)} ${now.getFullYear()}</title>
    <style>body{font-family:sans-serif;max-width:700px;margin:auto;padding:24px;}
      h1{font-size:18px;} table{width:100%;border-collapse:collapse;margin-top:16px;}
      th{background:#f3f4f6;text-align:left;padding:8px;border:1px solid #ddd;font-size:13px;}
      td{padding:8px;border:1px solid #ddd;font-size:13px;}
      .net{font-weight:700;background:#fef3c7;}</style></head>
    <body>
      <h1>GAZT VAT Return — ${escapeHtml(settings.bizEn || '')} (${escapeHtml(period.toUpperCase())} ${now.getFullYear()})</h1>
      <p style="font-size:12px;color:#666;">Period: ${escapeHtml(fromDate)} to ${escapeHtml(toDate)}</p>
      <table>
        <thead><tr><th>Box</th><th>Description</th><th>Amount (${escapeHtml(currencySymbol())})</th></tr></thead>
        <tbody>
          <tr><td>Box 1</td><td>Total Sales (Standard-rated)</td><td>${fmtMoney(box1)}</td></tr>
          <tr><td>Box 2</td><td>Zero-rated Sales</td><td>${fmtMoney(box2)}</td></tr>
          <tr><td>Box 3</td><td>VAT Collected on Sales</td><td>${fmtMoney(box3)}</td></tr>
          <tr><td>Box 6</td><td>Total Purchases</td><td>${fmtMoney(box6)}</td></tr>
          <tr><td>Box 7</td><td>Input VAT (Recoverable)</td><td>${fmtMoney(box7)}</td></tr>
          <tr class="net"><td colspan="2">Net VAT Payable (Box 3 − Box 7)</td><td>${fmtMoney(netVat)}</td></tr>
        </tbody>
      </table>
    </body></html>`;

  if (window.hubAPI?.exportPDF) {
    window.hubAPI.exportPDF({ html, filename: `vat-return-${period}-${now.getFullYear()}.pdf` })
      .then(() => toast('VAT return exported!', 'success'))
      .catch(() => _fallbackVatDownload(html, period, now.getFullYear()));
  } else {
    _fallbackVatDownload(html, period, now.getFullYear());
  }
}

function _fallbackVatDownload(html, period, year) {
  const blob = new Blob([html], { type: 'text/html' });
  downloadBlob(blob, `vat-return-${period}-${year}.html`);
  toast('VAT return downloaded as HTML', 'info');
}

/* ── Feature 8: Slicer Profile Library ─────────────────────── */
function renderSlicerProfiles() {
  const container = document.getElementById('slicerProfilesContainer');
  if (!container) return;

  const machFilter = (document.getElementById('slicerMachineFilter') || {}).value || '';
  const matFilter  = (document.getElementById('slicerMaterialFilter') || {}).value || '';

  let profiles = slicerProfiles || [];
  if (machFilter) profiles = profiles.filter(p => p.machineId === machFilter);
  if (matFilter)  profiles = profiles.filter(p => p.material === matFilter);

  if (profiles.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px;">No slicer profiles yet.</div>`;
    return;
  }

  const rows = profiles.map(p => {
    const mach = p.machineId ? machines.find(m => m.id === p.machineId) : null;
    return `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${mach ? escapeHtml(mach.name) : '—'}</td>
      <td>${escapeHtml(p.material || '—')}</td>
      <td>${p.layerHeight ? p.layerHeight + ' mm' : '—'}</td>
      <td>${p.infill ? p.infill + '%' : '—'}</td>
      <td>${p.supports ? 'Yes' : 'No'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.notes || '')}</td>
      <td>
        <button type="button" class="btn small ghost" data-act="edit-slicer-profile" data-id="${escapeHtml(p.id)}">Edit</button>
        <button type="button" class="btn danger small" data-act="delete-slicer-profile" data-id="${escapeHtml(p.id)}" aria-label="${escapeHtml(t('common.delete'))}">×</button>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Machine</th><th>Material</th><th>Layer</th><th>Infill</th><th>Supports</th><th>Notes</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openSlicerProfileModal(profileId) {
  const existing = profileId ? (slicerProfiles || []).find(p => p.id === profileId) : null;
  const machOptions = machines.map(m => `<option value="${m.id}"${existing && existing.machineId === m.id ? ' selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
  const matOptions = [...new Set(inventory.map(i => i.material).filter(Boolean))].map(m =>
    `<option value="${escapeHtml(m)}"${existing && existing.material === m ? ' selected' : ''}>${escapeHtml(m)}</option>`
  ).join('');

  openFormModal({
    title: existing ? 'Edit Slicer Profile' : 'New Slicer Profile',
    sizeLg: false,
    saveLabel: existing ? 'Save' : 'Create',
    bodyHtml: `
      <label>Profile Name</label>
      <input type="text" id="spName" value="${escapeHtml(existing?.name || '')}">
      <label style="margin-top:10px;">Machine</label>
      <select id="spMachine"><option value="">— Any —</option>${machOptions}</select>
      <label style="margin-top:10px;">Material</label>
      <select id="spMaterial"><option value="">— Any —</option>${matOptions}</select>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
        <div><label>Layer Height (mm)</label><input type="number" id="spLayer" step="0.01" min="0.01" value="${existing?.layerHeight || 0.2}"></div>
        <div><label>Infill %</label><input type="number" id="spInfill" min="0" max="100" value="${existing?.infill || 20}"></div>
      </div>
      <label style="margin-top:10px;display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="spSupports" style="width:auto;" ${existing?.supports ? 'checked' : ''}> Supports
      </label>
      <label style="margin-top:10px;">Notes</label>
      <textarea id="spNotes" rows="2">${escapeHtml(existing?.notes || '')}</textarea>`,
    onSave(modal) {
      const name = modal.querySelector('#spName').value.trim();
      if (!name) { toast('Enter a profile name', 'error'); return false; }
      const profile = {
        id: existing ? existing.id : uid('SP'),
        name,
        machineId: modal.querySelector('#spMachine').value || null,
        material:  modal.querySelector('#spMaterial').value || '',
        layerHeight: num(modal.querySelector('#spLayer').value, 0.2),
        infill:    num(modal.querySelector('#spInfill').value, 20),
        supports:  modal.querySelector('#spSupports').checked,
        notes:     modal.querySelector('#spNotes').value.trim(),
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
      };
      if (!slicerProfiles) slicerProfiles = [];
      if (existing) {
        const idx = slicerProfiles.findIndex(p => p.id === profileId);
        if (idx !== -1) slicerProfiles[idx] = profile;
      } else {
        slicerProfiles.push(profile);
      }
      saveAll();
      renderSlicerProfiles();
      toast(existing ? 'Profile updated' : 'Profile created', 'success');
    },
  });
}

function deleteSlicerProfile(profileId) {
  slicerProfiles = (slicerProfiles || []).filter(p => p.id !== profileId);
  saveAll();
  renderSlicerProfiles();
  toast('Profile deleted', 'success');
}

/* ── Feature 9: Environmental Condition Logging ─────────────── */
function renderEnvLogs() {
  const container = document.getElementById('envLogsContainer');
  if (!container) return;

  const recent = (envLogs || []).slice().sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).slice(0, 50);

  if (recent.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px;">No environmental logs yet.</div>`;
    return;
  }

  const rows = recent.map(log => {
    const mach = log.machineId ? machines.find(m => m.id === log.machineId) : null;
    return `<tr>
      <td style="font-size:11px;">${escapeHtml(new Date(log.timestamp).toLocaleString())}</td>
      <td>${log.temperature != null ? log.temperature + ' °C' : '—'}</td>
      <td>${log.humidity    != null ? log.humidity    + '%'  : '—'}</td>
      <td>${mach ? escapeHtml(mach.name) : '—'}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(log.notes || '')}</td>
    </tr>`;
  }).join('');

  // Simple SVG sparkline for temperature — last 20 entries in chronological order
  const sparkData = (envLogs || [])
    .filter(l => l.temperature != null)
    .slice().sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
    .slice(-20);

  let sparkHtml = '';
  if (sparkData.length >= 2) {
    const temps = sparkData.map(l => +l.temperature);
    const minT = Math.min(...temps), maxT = Math.max(...temps);
    const range = maxT - minT || 1;
    const W = 240, H = 48;
    const pts = temps.map((t, i) => {
      const x = (i / (temps.length - 1)) * W;
      const y = H - ((t - minT) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    sparkHtml = `<div style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Temperature trend (last ${temps.length} readings)</div>
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="overflow:visible;">
        <polyline fill="none" stroke="var(--primary)" stroke-width="2" points="${escapeHtml(pts)}"/>
      </svg>
    </div>`;
  }

  container.innerHTML = `
    ${sparkHtml}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Machine</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openLogEnvModal() {
  const machOptions = machines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  openFormModal({
    title: 'Log Environmental Conditions',
    sizeLg: false,
    saveLabel: 'Log',
    bodyHtml: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><label>Temperature (°C)</label><input type="number" id="envTemp" step="0.1" placeholder="e.g. 22"></div>
        <div><label>Humidity (%)</label><input type="number" id="envHumidity" min="0" max="100" step="1" placeholder="e.g. 45"></div>
      </div>
      <label style="margin-top:10px;">Machine (optional)</label>
      <select id="envMachine"><option value="">— All / None —</option>${machOptions}</select>
      <label style="margin-top:10px;">Notes (optional)</label>
      <textarea id="envNotes" rows="2"></textarea>`,
    onSave(modal) {
      const temp     = modal.querySelector('#envTemp').value;
      const humidity = modal.querySelector('#envHumidity').value;
      if (temp === '' && humidity === '') { toast('Enter at least temperature or humidity', 'error'); return false; }
      if (temp !== '') {
        const t = num(temp, null);
        if (t === null || t < -50 || t > 100) { toast('Temperature must be between -50°C and 100°C', 'error'); return false; }
      }
      if (humidity !== '') {
        const h = num(humidity, null);
        if (h === null || h < 0 || h > 100) { toast('Humidity must be between 0% and 100%', 'error'); return false; }
      }
      if (!envLogs) envLogs = [];
      envLogs.push({
        id: uid('ENV'),
        timestamp:   new Date().toISOString(),
        temperature: temp !== '' ? num(temp, null) : null,
        humidity:    humidity !== '' ? num(humidity, null) : null,
        machineId:   modal.querySelector('#envMachine').value || null,
        notes:       modal.querySelector('#envNotes').value.trim(),
      });
      saveAll();
      renderEnvLogs();
      toast('Environment logged', 'success');
    },
  });
}
(function (global) {
  const api = {
    openShiftChecklistModal,
    openEndOfDayReport,
    processRecurringOrders,
    processQuoteFollowUps,
    startQuoteFollowUpTimer,
    processPaymentReminders,
    startPaymentReminderTimer,
    renderGiftCards,
    openCreateGiftCardModal,
    applyGiftCard,
    addAMSMaterialRow,
    exportGaztVatReturn,
    renderSlicerProfiles,
    openSlicerProfileModal,
    deleteSlicerProfile,
    renderEnvLogs,
    openLogEnvModal,
  };
  Object.assign(global, api);
  global.KhaytOperationsExtras = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
