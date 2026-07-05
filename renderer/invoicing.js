/**
 * Invoicing: numbering, ZATCA QR/XML, render/print/export, quotes, credit notes.
 */
(function (global) {

/* Feature 7: Configurable invoice number sequence */
function nextInvoiceNumber() {
  const currentYear = new Date().getFullYear();
  if ((settings.invNumYear || currentYear) !== currentYear) {
    settings.invNumYear = currentYear;
    settings.invNumNext = 1;
  }
  const prefix = settings.invNumPrefix || 'INV';
  const seq4 = String(settings.invNumNext || 1).padStart(4, '0');
  const fmt = settings.invNumFormat || '{prefix}-{year}-{seq4}';
  const result = fmt
    .replace('{prefix}', prefix)
    .replace('{year}', currentYear)
    .replace('{seq4}', seq4);
  settings.invNumNext = (settings.invNumNext || 1) + 1;
  settings.invNumYear = currentYear;
  saveAll();
  return result;
}
/* Separate quote sequence so two quotes never collide on id (Bug A).
   Quotes intentionally do NOT advance the invoice counter, but they still
   need their own monotonic number or back-to-back quotes share an id. */
function nextQuoteSeq() {
  const currentYear = new Date().getFullYear();
  if ((settings.quoteNumYear || currentYear) !== currentYear) {
    settings.quoteNumYear = currentYear;
    settings.quoteNumNext = 1;
  }
  const seq4 = String(settings.quoteNumNext || 1).padStart(4, '0');
  settings.quoteNumNext = (settings.quoteNumNext || 1) + 1;
  settings.quoteNumYear = currentYear;
  saveAll();
  return seq4;
}

/* --- extracted 6543-6682 --- */
function generateClientStatement(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  const displayName = localName(c);
  const orders = printLog.filter(o => o.clientId === clientId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const bizPrimary = i18n.current === 'ar'
    ? (settings.bizAr || settings.bizEn || 'Khayt')
    : (settings.bizEn || settings.bizAr || 'Khayt');

  // All statement figures are in the shop's BASE currency so multi-currency
  // clients' rows and totals reconcile (orderRevenueBase/orderOwedBase convert).
  const curOf = (o) => (typeof orderCurrency === 'function') ? orderCurrency(o) : (settings.currency || 'SAR');
  // Cash actually received (base). Falls back to price ONLY for legacy fully-paid
  // orders with no recorded amount AND no gift settlement — otherwise a gift-card
  // -settled order would be counted as both "paid" (price) and "gift".
  const cashPaidBase = (o) => {
    const recorded = +o.paidAmount || 0;
    if (recorded > 0) return convertToBase(recorded, curOf(o));
    return (payStatus(o) === 'paid' && !(+o.giftCardDiscount > 0)) ? convertToBase(+o.price || 0, curOf(o)) : 0;
  };
  const totalCharges = orders.reduce((s, o) => s + orderRevenueBase(o), 0);
  const totalPaid    = orders.reduce((s, o) => s + cashPaidBase(o), 0);
  // Gift-card redemptions settle part of the balance just like a payment.
  const totalGift    = orders.reduce((s, o) => s + convertToBase(+o.giftCardDiscount || 0, curOf(o)), 0);
  const outstanding  = orders.reduce((s, o) => s + orderOwedBase(o), 0);

  const rowsHtml = orders.map(o => {
    const paid  = cashPaidBase(o);
    const bal   = orderOwedBase(o);
    return `<tr style="border-bottom:1px solid #eee;">
      <td style="padding:6px 8px; font-size:12px; white-space:nowrap;">${escapeHtml(o.date || '')}</td>
      <td style="padding:6px 8px; font-size:12px;">${escapeHtml(o.id)}</td>
      <td style="padding:6px 8px; font-size:12px;">${escapeHtml(o.project || '')}</td>
      <td style="padding:6px 8px; font-size:12px; text-align:end;">${fmtPrice(orderRevenueBase(o))}</td>
      <td style="padding:6px 8px; font-size:12px; text-align:end; color:#2a9d8f;">${fmtPrice(paid)}</td>
      <td style="padding:6px 8px; font-size:12px; text-align:end; color:${bal > 0 ? '#e63946' : '#2a9d8f'};">${fmtPrice(bal)}</td>
    </tr>`;
  }).join('');

  const area = $('#invoice-print-area');
  area.innerHTML = `
    <div class="inv-wrap">
    <div class="inv-top-bar" style="background:var(--primary);"></div>
    <div class="inv" style="--brand:#1a1a2e; --accent:#4a90e2; --highlight:#eef3fc;">
      <div class="inv-header">
        <div class="biz">
          <div class="mark">${safeBizLogo() ? `<img src="${safeBizLogo()}" style="max-height:60px; max-width:120px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name"><h1>${escapeHtml(bizPrimary)}</h1></div>
        </div>
        <div class="doc">
          <div class="title">${escapeHtml(t('cl.statement_title'))}</div>
          <div class="meta">
            <div class="meta-row"><span class="k">${escapeHtml(t('common.date'))}</span><span class="v">${escapeHtml(new Date().toISOString().split('T')[0])}</span></div>
          </div>
        </div>
      </div>
      <div class="bill-to">
        <div class="label"><span>${escapeHtml(t('inv.billed_to'))}</span></div>
        <div>
          <div class="name">${escapeHtml(displayName)}</div>
          ${c.phone ? `<div class="name-sub">${escapeHtml(c.phone)}</div>` : ''}
          ${c.email ? `<div class="name-sub">${escapeHtml(c.email)}</div>` : ''}
        </div>
      </div>
      <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:13px;">
        <thead>
          <tr style="border-bottom:2px solid #333; text-align:start;">
            <th style="padding:6px 8px;">${escapeHtml(t('common.date'))}</th>
            <th style="padding:6px 8px;">${escapeHtml(t('log.id') || 'Order ID')}</th>
            <th style="padding:6px 8px;">${escapeHtml(t('oe.project') || 'Description')}</th>
            <th style="padding:6px 8px; text-align:end;">${escapeHtml(t('log.price'))}</th>
            <th style="padding:6px 8px; text-align:end;">${escapeHtml(t('cl.stmt_paid'))}</th>
            <th style="padding:6px 8px; text-align:end;">${escapeHtml(t('cl.stmt_outstanding'))}</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="border-top:2px solid #333; font-weight:700;">
            <td colspan="3" style="padding:8px 8px;">${escapeHtml(t('common.total'))}</td>
            <td style="padding:8px 8px; text-align:end;">${fmtPrice(totalCharges)}</td>
            <td style="padding:8px 8px; text-align:end; color:#2a9d8f;">${fmtPrice(totalPaid)}</td>
            <td style="padding:8px 8px; text-align:end; color:${outstanding > 0 ? '#e63946' : '#2a9d8f'};">${fmtPrice(outstanding)}</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:20px; display:flex; gap:24px; flex-wrap:wrap;">
        <div style="background:#f8f9fa; padding:12px 16px; border-radius:6px; min-width:150px;">
          <div style="font-size:11px; color:#666;">${escapeHtml(t('cl.stmt_charges'))}</div>
          <div style="font-size:18px; font-weight:700;">${fmtPrice(totalCharges)}</div>
        </div>
        <div style="background:#f0fdf4; padding:12px 16px; border-radius:6px; min-width:150px;">
          <div style="font-size:11px; color:#666;">${escapeHtml(t('cl.stmt_paid'))}</div>
          <div style="font-size:18px; font-weight:700; color:#2a9d8f;">${fmtPrice(totalPaid)}</div>
        </div>
        <div style="background:${outstanding > 0 ? '#fff5f5' : '#f0fdf4'}; padding:12px 16px; border-radius:6px; min-width:150px;">
          <div style="font-size:11px; color:#666;">${escapeHtml(t('cl.stmt_outstanding'))}</div>
          <div style="font-size:18px; font-weight:700; color:${outstanding > 0 ? '#e63946' : '#2a9d8f'};">${fmtPrice(outstanding)}</div>
        </div>
      </div>
      <div class="footer" style="margin-top:24px;">
        <div class="legal">${escapeHtml(t('legal') || 'Generated by Khayt')}</div>
      </div>
    </div>
    </div>`;
  setTimeout(() => window.print(), 80);
}

/* ============================================================
   Export all invoices for a client — renders each sequentially
   into the print area then triggers the system print dialog once,
   which the user can save as a single multi-page PDF.
   ============================================================ */
async function exportClientInvoices(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  const orders = printLog
    .filter(o => o.clientId === clientId && o.status === 'completed')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (orders.length === 0) {
    toast(t('cl.no_invoices'), 'info');
    return;
  }
  toast(t('cl.exporting_invoices', { n: orders.length }), 'info', 2000);

  // If hubAPI.exportPDF exists, export each invoice as a separate file
  if (window.hubAPI?.exportPDF) {
    for (let i = 0; i < orders.length; i++) {
      await renderInvoiceForOrder(orders[i]);
      await new Promise(r => setTimeout(r, 60));
      try {
        await window.hubAPI.exportPDF({ filename: `${orders[i].id}.pdf`, askWhere: i === 0, openAfter: false });
      } catch (_) {}
    }
    toast(t('cl.invoices_exported', { n: orders.length }), 'success', 4000);
    return;
  }

  // Fallback: render all invoices concatenated into print area, print once
  const area = $('#invoice-print-area');
  area.innerHTML = '';
  const pages = [];
  for (const order of orders) {
    await renderInvoiceForOrder(order);
    pages.push(area.innerHTML);
    area.innerHTML = '';
  }
  area.innerHTML = pages.join('<div style="page-break-after:always;"></div>');
  setTimeout(() => window.print(), 100);
}

/* --- extracted 7267-7296 --- */
function approveQuote(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  order.status = 'pending';
  order.quoteAcceptedAt = new Date().toISOString().split('T')[0];
  if (!order.invoiceNum) {
    order.invoiceNum = nextInvoiceNumber();
    order.invoiceNumber = order.invoiceNum;
  }
  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({ status: 'pending', at: new Date().toISOString() });
  if (order.statusHistory.length > 200) order.statusHistory = order.statusHistory.slice(-200);
  saveAll();
  renderKanban(); renderLogs(); renderDashboard();
  toast(t('quote.approved'), 'success');
}

async function rejectQuote(orderId) {
  const ok = await confirmModal(t('quote.reject_q'), { danger: true });
  if (!ok) return;
  const idx = printLog.findIndex(o => o.id === orderId);
  if (idx < 0) return;
  const removed = printLog[idx];
  printLog.splice(idx, 1);
  saveAll();
  renderKanban(); renderLogs();
  toast(t('quote.rejected'), 'success', 5000, {
    undo: () => { printLog.splice(idx, 0, removed); saveAll(); renderKanban(); renderLogs(); }
  });
}

/* --- extracted 9895-10012 --- */
function renderInvoiceNumberingSection() {
  const el = $('#invNumSection');
  if (!el) return;
  el.innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:10px;">
      <div>
        <label style="margin-top:0;">${escapeHtml(t('set.inv_num_prefix'))}</label>
        <input type="text" id="invNumPrefix" value="${escapeHtml(settings.invNumPrefix || 'INV')}" placeholder="INV" maxlength="10">
      </div>
      <div>
        <label style="margin-top:0;">${escapeHtml(t('set.inv_num_next'))}</label>
        <input type="number" id="invNumNext" value="${settings.invNumNext || 1}" min="1" step="1">
      </div>
    </div>
    <div style="margin-top:10px;">
      <label style="margin-top:0;">Format</label>
      <select id="invNumFormat">
        <option value="{prefix}-{year}-{seq4}" ${(settings.invNumFormat || '') === '{prefix}-{year}-{seq4}' ? 'selected' : ''}>{prefix}-{year}-{seq4} (e.g. INV-2026-0001)</option>
        <option value="{prefix}-{seq4}" ${settings.invNumFormat === '{prefix}-{seq4}' ? 'selected' : ''}>{prefix}-{seq4} (e.g. INV-0001)</option>
      </select>
    </div>
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
      <button class="btn small primary" id="btnSaveInvNum">${escapeHtml(t('common.save'))}</button>
      <button class="btn small ghost" id="btnInvNumReset">${escapeHtml(t('set.inv_num_reset'))}</button>
      <button class="btn small ghost" id="btnInvNumDetectGaps">${escapeHtml(t('set.inv_num_detect_gaps'))}</button>
    </div>
    <div id="invNumGapsResult" style="margin-top:8px; font-size:12.5px;"></div>`;

  el.querySelector('#btnSaveInvNum').addEventListener('click', () => {
    settings.invNumPrefix = el.querySelector('#invNumPrefix').value.trim() || 'INV';
    settings.invNumNext   = Math.max(1, parseInt(el.querySelector('#invNumNext').value, 10) || 1);
    settings.invNumFormat = el.querySelector('#invNumFormat').value;
    saveAll();
    toast(t('set.saved'), 'success');
  });
  el.querySelector('#btnInvNumReset').addEventListener('click', () => {
    settings.invNumYear  = new Date().getFullYear();
    settings.invNumNext  = 1;
    saveAll();
    el.querySelector('#invNumNext').value = '1';
    toast(t('set.inv_num_reset'), 'success');
  });
  el.querySelector('#btnInvNumDetectGaps').addEventListener('click', () => {
    const nums = printLog
      .map(o => o.invoiceNum || o.id)
      .map(id => { const m = /(\d+)$/.exec(id); return m ? parseInt(m[1], 10) : null; })
      .filter(n => n !== null)
      .sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < nums.length; i++) {
      for (let g = nums[i - 1] + 1; g < nums[i]; g++) gaps.push(g);
    }
    const res = el.querySelector('#invNumGapsResult');
    if (res) {
      res.textContent = gaps.length === 0
        ? t('set.inv_num_no_gaps')
        : t('set.inv_num_gaps_found', { n: gaps.length }) + ': ' + gaps.slice(0, 20).join(', ');
      res.style.color = gaps.length === 0 ? 'var(--success)' : 'var(--warning)';
    }
  });
}

/* ============================================================
   Feature 8: Quote revision history
   ============================================================ */
function reviseQuote(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order || order.status !== 'quote') return;
  // Snapshot current state
  const snapshot = {
    version:     order.quoteVersion || 1,
    snapshotAt:  new Date().toISOString(),
    price:       order.price,
    parts:       (order.parts || []).map(p => ({ ...p })),
    notes:       order.notes || '',
    material:    order.material || '',
    printTime:   order.printTime || 0,
  };
  if (!order.quoteRevisions) order.quoteRevisions = [];
  order.quoteRevisions.push(snapshot);
  order.quoteVersion = (order.quoteVersion || 1) + 1;
  saveAll();
  // Open order editor so operator can revise
  openOrderEditor(orderId);
}

function openQuoteRevisionsModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const revisions = order.quoteRevisions || [];

  const revsHtml = revisions.length === 0
    ? `<p style="color:var(--text-muted); font-size:13px;">${escapeHtml(t('ord.quote_rev_empty'))}</p>`
    : `<div class="table-wrap"><table>
        <thead><tr>
          <th>${escapeHtml(t('ord.quote_version'))}</th>
          <th>${escapeHtml(t('ord.quote_rev_date'))}</th>
          <th>${escapeHtml(t('ord.quote_rev_price'))}</th>
          <th>Parts</th>
          <th>Notes</th>
        </tr></thead>
        <tbody>
          ${[...revisions].reverse().map(rev => `<tr>
            <td><strong>v${rev.version}</strong></td>
            <td style="font-size:11.5px;">${new Date(rev.snapshotAt).toLocaleDateString()}</td>
            <td>${fmtPrice(rev.price)}</td>
            <td style="font-size:11.5px;">${(rev.parts || []).length} parts</td>
            <td style="font-size:11.5px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(rev.notes || '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

  openFormModal({
    title: `📋 ${t('ord.quote_revisions')} — ${escapeHtml(order.project || order.id)} (${t('ord.quote_version', { n: order.quoteVersion || 1 })})`,
    noSave: true,
    bodyHtml: revsHtml,
  });
}

/* --- extracted 10062-10277 --- */
async function exportInvoicePDF(orderId, { askWhere = true, openAfter = true } = {}) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return null;
  const btn = document.querySelector(`[data-act="inv-pdf"][data-id="${orderId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    // Render invoice into print area, then call printToPDF via IPC
    await renderInvoiceForOrder(order);
    await new Promise(r => setTimeout(r, 60)); // let layout settle
    if (!window.hubAPI?.exportPDF) return null;
    const finalPath = await window.hubAPI.exportPDF({
      askWhere,
      defaultName: `${order.id}.pdf`
    });
    if (!finalPath) return null;
    toast(t('inv.saved'), 'success');
    if (openAfter && window.hubAPI.openPath) await window.hubAPI.openPath(finalPath);
    return finalPath;
  } catch (e) {
    console.error(e);
    toast('PDF error', 'error');
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('inv.export_pdf') || 'Export PDF'; }
  }
}

async function shareInvoiceWhatsApp(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  // Save PDF to default location (not the dialog) so we have a file path to attach
  await renderInvoiceForOrder(order);
  await new Promise(r => setTimeout(r, 60));
  let pdfPath = null;
  if (window.hubAPI?.exportPDF) {
    try { pdfPath = await window.hubAPI.exportPDF({ askWhere: false, defaultName: `${order.id}.pdf` }); }
    catch (e) { console.error(e); }
  }
  const displayName = client ? (localName(client))
                              : (order.project || '');
  const total = fmtMoney(order.price);
  const message = t('inv.message_template', { name: displayName, id: order.id, total });
  if (!client?.phone) toast(t('inv.no_phone'), 'info', 3200);
  if (window.hubAPI?.shareWhatsApp) {
    await window.hubAPI.shareWhatsApp({
      phone: client?.phone || '',
      message,
      pdfPath
    });
  }
}

async function sendStatusWhatsApp(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  if (!client?.phone) { toast(t('queue.wa_no_phone'), 'info', 3200); return; }
  const displayName = localName(client);
  const statusLabel = t('queue.' + order.status);
  const message = t('queue.wa_status_msg', { name: displayName, project: order.project, id: order.id, status: statusLabel });
  if (window.hubAPI?.shareWhatsApp) {
    await window.hubAPI.shareWhatsApp({ phone: client.phone, message, pdfPath: null });
  }
}

async function sendPaymentReminder(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  if (!client?.phone) { toast(t('pay.remind_no_phone'), 'info', 3200); return; }
  // Use the payment-reminder WA template if available, otherwise a default
  const tpl = waTemplates.find(w => w.id === 'tpl-payment') || waTemplates[0];
  const message = tpl
    ? fillWaTemplate(tpl.body, order, client)
    : t('pay.remind_default', { name: localName(client), id: order.id, price: fmtPrice(order.price), currency: currencySymbol() });
  if (window.hubAPI?.shareWhatsApp) {
    await window.hubAPI.shareWhatsApp({ phone: client.phone, message, pdfPath: null });
  } else {
    // Fallback: open WhatsApp web
    const encodedMsg = encodeURIComponent(message);
    const phone = (client.phone || '').replace(/\D/g, '');
    window.hubAPI?.openExternal?.(`https://wa.me/${phone}?text=${encodedMsg}`);
    if (!window.hubAPI?.openExternal) {
      toast(t('pay.remind_sent') || 'Open WhatsApp manually to send the reminder', 'info');
    }
  }
}

/**
 * Gently follow up on an unapproved quote that is nearing/has passed expiry.
 * Reuses the existing WhatsApp transport (hubAPI.shareWhatsApp, with a wa.me
 * fallback) and records the follow-up on the quote (followUpSentAt/Count) via the
 * pure helper so the dashboard + auto-nudge de-duplicate correctly.
 * @param {string} orderId
 * @param {{ silent?: boolean }} [opts]  silent = no toast / for auto-nudge
 */
async function sendQuoteFollowUp(orderId, opts = {}) {
  const order = printLog.find(o => o.id === orderId);
  if (!order || order.status !== 'quote') return false;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const phone = (client?.phone || '').replace(/\D/g, '');
  if (!phone) {
    if (!opts.silent) toast(t('quote.followup_no_phone'), 'info', 3200);
    return false;
  }
  const name = client ? localName(client) : (order.project || order.id);
  const message = t('quote.followup_msg', {
    name,
    id: order.id,
    project: order.project || order.id,
    total: fmtPrice(order.price),
    expires: order.quoteExpiresAt || '',
  });
  if (window.hubAPI?.shareWhatsApp) {
    await window.hubAPI.shareWhatsApp({ phone: client.phone, message, pdfPath: null });
  } else if (window.hubAPI?.openExternal) {
    window.hubAPI.openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
  } else if (!opts.silent) {
    toast(t('quote.followup_sent'), 'info');
  }
  // Record the follow-up so we don't repeat it within the cooldown window.
  if (typeof KhaytQuoteFollowUp !== 'undefined') {
    Object.assign(order, KhaytQuoteFollowUp.markFollowUpPatch(order, Date.now()));
  } else {
    order.followUpSentAt = new Date().toISOString();
    order.followUpCount = (+order.followUpCount || 0) + 1;
  }
  saveAll();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (!opts.silent) toast(t('quote.followup_sent'), 'success', 3000);
  return true;
}

async function shareTrackingWhatsApp(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order?.trackingNumber) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const phone = client?.phone;
  if (!phone) { toast(t('pay.remind_no_phone'), 'info'); return; }
  const msg = t('ship.tracking_msg', {
    project: order.project || order.id,
    courier: order.courierName || '',
    tracking: order.trackingNumber,
  });
  if (window.hubAPI?.shareWhatsApp) await window.hubAPI.shareWhatsApp({ phone, message: msg, pdfPath: null });
}

/* ============================================================
   ZATCA Phase 2 — FATOORA submission
   ============================================================ */
function zatcaPhase2Ready() {
  const z2 = settings.zatcaPhase2;
  return !!(settings.enableZatca && z2?.enabled && (z2.pcsid || z2.csid));
}

function zatcaUtf8ToBase64(str) {
  const bytes = new TextEncoder().encode(String(str || ''));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function ensureZatcaUuid(order) {
  if (order.zatcaUuid) return order.zatcaUuid;
  order.zatcaUuid = `${order.id}-${Date.now().toString(36)}`;
  const idx = printLog.findIndex(o => o.id === order.id);
  if (idx !== -1) {
    printLog[idx] = { ...printLog[idx], zatcaUuid: order.zatcaUuid };
    saveAll();
  }
  return order.zatcaUuid;
}

function nextZatcaIcv(order) {
  const z2 = settings.zatcaPhase2 || {};
  if (order.zatcaSubmission?.icv) return order.zatcaSubmission.icv;
  return (z2.invoiceCounter || 0) + 1;
}

function appendZatcaSubmissionLog(entry) {
  const z2 = settings.zatcaPhase2 || (settings.zatcaPhase2 = {});
  if (!Array.isArray(z2.submissions)) z2.submissions = [];
  z2.submissions.unshift(entry);
  if (z2.submissions.length > 100) z2.submissions = z2.submissions.slice(0, 100);
}

function zatcaInvoiceAmounts(order) {
  const ts = order.timestamp
    || (order.date && !Number.isNaN(Date.parse(`${order.date}T12:00:00`))
      ? new Date(`${order.date}T12:00:00`).toISOString()
      : '');
  const price = +order.price || 0;
  const rate = settings.enableVat ? (+settings.vatRate || 15) : 0;
  const vatAmt = rate > 0 ? price * rate / (100 + rate) : 0;
  const exVat = price - vatAmt;
  return { ts, price, rate, vatAmt, exVat, total: fmtMoney(price), vatAmount: fmtMoney(vatAmt), subtotal: fmtMoney(exVat) };
}

async function prepareZatcaPhase2Payload(order) {
  const z2 = settings.zatcaPhase2 || {};
  const { ts, price, rate, vatAmt, exVat } = zatcaInvoiceAmounts(order);
  const icv = nextZatcaIcv(order);
  const uuid = ensureZatcaUuid(order);
  const issueDt = ts.split('T');
  const xml = buildZatcaInvoiceXml({
    invoiceNumber: order.invoiceNumber || order.id,
    uuid,
    issueDate: issueDt[0],
    issueTime: (issueDt[1] || '00:00:00').split('.')[0],
    sellerName: settings.bizEn || settings.bizAr || '',
    sellerStreet: settings.address || '',
    sellerCity: z2.city || 'Riyadh',
    vatNumber: settings.vat || '',
    buyerName: order.client || '',
    total: price,
    subtotal: exVat,
    vatAmount: vatAmt,
    vatRate: settings.enableVat ? rate : 0,
    itemName: order.project || order.id,
    invoiceCounter: icv,
    pih: z2.lastInvoiceHash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI4NjJhNGRhNjM3NWQ2OGM5',
  });
  const signResult = await window.hubAPI?.zatcaSignInvoice?.({ canonicalData: xml });
  if (!signResult?.ok) throw new Error(signResult?.error || 'Invoice signing failed');
  return {
    xml,
    xmlBase64: zatcaUtf8ToBase64(xml),
    invoiceHash: signResult.hashBase64,
    uuid,
    invoiceNumber: order.invoiceNumber || order.id,
    invoiceCounter: icv,
    invoiceType: 'simplified',
    environment: z2.environment || 'sandbox',
    pcsid: z2.pcsid,
    csid: z2.csid,
  };
}

function zatcaSubmitAccepted(httpOk, body) {
  if (!httpOk) return false;
  const status = body?.validationResults?.status || body?.reportingStatus || body?.clearanceStatus;
  if (status && String(status).toUpperCase() === 'REJECTED') return false;
  return true;
}

async function submitOrderToZatca(orderId, { manual = false, silent = false } = {}) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return { ok: false, error: 'Order not found' };
  if (order.voidedAt) return { ok: false, error: 'Invoice voided' };
  if (!zatcaPhase2Ready()) return { ok: false, error: 'ZATCA Phase 2 not configured' };
  if (order.status !== 'completed' && order.status !== 'delivered') {
    return { ok: false, error: 'Order must be completed before ZATCA submission' };
  }
  if (order.zatcaSubmission?.status === 'accepted' && !manual) {
    return { ok: true, skipped: true };
  }

  try {
    const payload = await prepareZatcaPhase2Payload(order);
    const result = await window.hubAPI?.zatcaSubmit?.({
      xmlBase64: payload.xmlBase64,
      invoiceHash: payload.invoiceHash,
      uuid: payload.uuid,
      invoiceNumber: payload.invoiceNumber,
      invoiceType: payload.invoiceType,
      environment: payload.environment,
      pcsid: payload.pcsid,
      csid: payload.csid,
    });
    if (!result) throw new Error('ZATCA submit unavailable');

    const accepted = zatcaSubmitAccepted(result.ok, result.body);
    const errMsg = result.error
      || result.body?.validationResults?.errorMessages?.[0]?.message
      || (typeof result.body === 'object' ? JSON.stringify(result.body) : String(result.status || 'Unknown error'));

    const logEntry = {
      orderId: order.id,
      invoiceNumber: payload.invoiceNumber,
      uuid: payload.uuid,
      icv: payload.invoiceCounter,
      at: new Date().toISOString(),
      httpStatus: result.status ?? null,
      manual: !!manual,
    };

    if (accepted) {
      settings.zatcaPhase2.invoiceCounter = payload.invoiceCounter;
      settings.zatcaPhase2.lastInvoiceHash = payload.invoiceHash;
      order.zatcaSubmission = { ...logEntry, status: 'accepted', message: 'OK' };
      appendZatcaSubmissionLog({ ...logEntry, status: 'accepted', message: 'OK' });
      saveAll();
      if (!silent) toast(t('zatca2.submit_ok') || 'Invoice submitted to ZATCA', 'success');
      if (settings.zatcaPhase2.emailAfterSubmit && typeof emailOrderToClient === 'function') {
        emailOrderToClient(order.id, false).catch(() => {});
      }
      return { ok: true };
    }

    order.zatcaSubmission = { ...logEntry, status: 'rejected', message: errMsg };
    appendZatcaSubmissionLog({ ...logEntry, status: 'rejected', message: errMsg });
    saveAll();
    if (!silent) toast(t('zatca2.submit_failed') || `ZATCA submission failed: ${errMsg}`, 'error', 6000);
    return { ok: false, error: errMsg };
  } catch (e) {
    const msg = String(e.message || e);
    order.zatcaSubmission = {
      orderId: order.id,
      status: 'error',
      message: msg,
      at: new Date().toISOString(),
      manual: !!manual,
    };
    appendZatcaSubmissionLog({ orderId: order.id, status: 'error', message: msg, at: order.zatcaSubmission.at, manual: !!manual });
    saveAll();
    if (!silent) toast(t('zatca2.submit_failed') || `ZATCA submission failed: ${msg}`, 'error', 6000);
    return { ok: false, error: msg };
  }
}

function maybeAutoSubmitZatca(order) {
  const z2 = settings.zatcaPhase2 || {};
  if (!zatcaPhase2Ready() || z2.autoSubmit === false) return;
  if (order.voidedAt || order.status === 'quote') return;
  if (order.status !== 'completed' && order.status !== 'delivered') return;
  if (order.zatcaSubmission?.status === 'accepted') return;
  submitOrderToZatca(order.id, { silent: true })
    .then((r) => {
      if (r?.ok && !r.skipped) toast(t('zatca2.auto_submitted', { id: order.id }) || `Invoice ${order.id} submitted to ZATCA`, 'success', 4000);
      else if (r?.ok === false && !r.skipped) toast(t('zatca2.auto_submit_failed', { id: order.id }) || `ZATCA auto-submit failed for ${order.id}`, 'warning', 5000);
    })
    .catch((e) => console.error('ZATCA auto-submit:', e));
}

function zatcaSubmissionStatusLabel(order) {
  const s = order?.zatcaSubmission?.status;
  if (s === 'accepted') return t('zatca2.status_accepted') || 'Submitted to ZATCA';
  if (s === 'rejected') return t('zatca2.status_rejected') || 'ZATCA rejected';
  if (s === 'error') return t('zatca2.status_error') || 'ZATCA error';
  return t('zatca2.status_pending') || 'Not submitted';
}

// Render the invoice with QR (used by Print, PDF, and WhatsApp paths)
async function renderInvoiceForOrder(order) {
  const ts = order.timestamp
    || (order.date && !Number.isNaN(Date.parse(`${order.date}T12:00:00`))
      ? new Date(`${order.date}T12:00:00`).toISOString()
      : '');
  const price    = +order.price || 0;
  const shipping = +order.shippingCost || 0;
  const rate     = settings.enableVat ? (+settings.vatRate || 15) : 0;
  // Prices are VAT-inclusive. Extract VAT portion from the total.
  const vatAmt    = rate > 0 ? price * rate / (100 + rate) : 0;
  const exVat     = price - vatAmt;
  const total     = fmtMoney(price);
  const vatAmount = fmtMoney(vatAmt);
  const subtotal  = fmtMoney(exVat);
  // Reconciling summary (VAT-inclusive, matching the line-items table which is
  // also VAT-inclusive): Subtotal(items) + Rush + Shipping == Total, with VAT
  // shown as "included". order.price already bundles shipping+rush+extras
  // (build.js: finalPrice = goods + rush + shipping + extras), so the old
  // Subtotal=exVat double-counted the separate Rush/Shipping rows.
  const _shipIncl  = +order.shippingCost || 0;
  const _rushIncl  = +order.rushFeeAmount || 0;
  const _discAmt   = Math.max(0, (+order.priceBeforeDiscount || 0) * (+order.discountPct || 0) / 100);
  const itemsSubtotalIncl = price - _shipIncl - _rushIncl;          // parts + extras, post-discount
  const subtotalShown = fmtMoney(order.discountPct > 0 ? itemsSubtotalIncl + _discAmt : itemsSubtotalIncl);
  let qrSvg = '';
  if (settings.enableZatca && window.hubAPI?.generateQR) {
    try {
      const z2 = settings.zatcaPhase2;
      let tlvB64;
      if (z2?.enabled && (z2.csid || z2.pcsid)) {
        // Phase 2: generate UBL XML, sign it, build TLV with tags 1–8
        const issueDt  = (ts || new Date().toISOString()).split('T');
        const xml = buildZatcaInvoiceXml({
          invoiceNumber: order.invoiceNumber || order.id,
          uuid:          order.zatcaUuid || order.id,
          issueDate:     issueDt[0],
          issueTime:     (issueDt[1] || '00:00:00').split('.')[0],
          sellerName:    settings.bizEn || settings.bizAr || '',
          sellerStreet:  settings.address || '',
          sellerCity:    z2.city || 'Riyadh',
          vatNumber:     settings.vat || '',
          buyerName:     order.client || '',
          total:         +price,
          subtotal:      +price - (settings.enableVat ? +price * (+settings.vatRate || 15) / (100 + (+settings.vatRate || 15)) : 0),
          vatAmount:     settings.enableVat ? +price * (+settings.vatRate || 15) / (100 + (+settings.vatRate || 15)) : 0,
          vatRate:       settings.enableVat ? (+settings.vatRate || 15) : 0,
          itemName:      order.project || order.id,
          invoiceCounter: (z2.invoiceCounter || 0) + 1,
          pih:           z2.lastInvoiceHash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI4NjJhNGRhNjM3NWQ2OGM5',
        });
        tlvB64 = await buildZatcaPhase2TLV({
          sellerName: settings.bizEn || settings.bizAr || '',
          vatNumber:  settings.vat || '',
          timestamp:  ts,
          total, vatAmount,
          canonicalData: xml,
        });
        // Store the UUID on the order for future reference
        if (!order.zatcaUuid) {
          order.zatcaUuid = order.id + '-' + Date.now().toString(36);
          const idx = printLog.findIndex(o => o.id === order.id);
          if (idx !== -1) { printLog[idx] = { ...printLog[idx], zatcaUuid: order.zatcaUuid }; saveAll(); }
        }
      } else {
        // Phase 1 fallback
        tlvB64 = buildZatcaTLV({ sellerName: settings.bizEn || settings.bizAr || '', vatNumber: settings.vat || '', timestamp: ts, total, vatAmount });
      }
      qrSvg = await window.hubAPI.generateQR(tlvB64, { width: 140, margin: 1 });
    } catch (e) { console.error('ZATCA QR error:', e); }
  }

  // Payment QR — EMVCo-inspired format for GCC banking apps (SARIE/Mada compatible)
  let payQrSvg = '';
  if (settings.iban && window.hubAPI?.generateQR) {
    const iban = settings.iban.replace(/\s+/g, '');
    const beneName = settings.bizEn || settings.bizAr || '';
    const payAmt = price.toFixed(2);
    const payRef = order.invoiceNumber || order.id;
    // Structured format: BeneficiaryName\nIBAN\nAmount\nRef
    const payText = `${beneName}\n${iban}\n${payAmt}\n${payRef}`;
    try { payQrSvg = await window.hubAPI.generateQR(payText, { width: 120, margin: 1 }); }
    catch (e) { console.warn('Payment QR failed', e); }
  }

  renderInvoice(order, { qrSvg, payQrSvg, total, vatAmount, subtotal, subtotalShown, vatRate: rate, shipping });
  maybeAutoSubmitZatca(order);
}

/* ============================================================
   New Feature 3: Proforma Invoice
   ============================================================ */
async function generateProformaInvoice(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;

  // Render the regular invoice first
  await renderInvoiceForOrder(order);

  // Inject proforma watermark and change the title
  const area = $('#invoice-print-area');
  if (area) {
    // Change title text nodes that say "Invoice" / "فاتورة"
    area.querySelectorAll('.inv-title, .inv-heading, h1, h2').forEach(el => {
      if (/invoice|فاتورة/i.test(el.textContent)) {
        el.textContent = t('inv.proforma_title');
      }
    });
    // Inject watermark overlay if not already present
    if (!area.querySelector('.proforma-watermark')) {
      const wm = document.createElement('div');
      wm.className = 'proforma-watermark';
      wm.textContent = t('inv.proforma_title');
      area.style.position = 'relative';
      area.appendChild(wm);
    }
  }

  // Open print dialog
  window.print();

  // Remove watermark after print so area is clean for next real invoice
  setTimeout(() => {
    const wm = area?.querySelector('.proforma-watermark');
    if (wm) wm.remove();
  }, 1000);
}

/* --- extracted 18039-18214 --- */
function buildZatcaTLV({ sellerName, vatNumber, timestamp, total, vatAmount }) {
  const enc = new TextEncoder();
  function tlv(tag, value) {
    const bytes = enc.encode(value);
    const len = bytes.length;
    // BER-TLV: use two-byte length for values > 127 bytes (0x81 + length byte)
    let header;
    if (len <= 127) {
      header = new Uint8Array([tag, len]);
    } else if (len <= 255) {
      header = new Uint8Array([tag, 0x81, len]);
    } else {
      header = new Uint8Array([tag, 0x82, (len >> 8) & 0xff, len & 0xff]);
    }
    const out = new Uint8Array(header.length + len);
    out.set(header, 0); out.set(bytes, header.length);
    return out;
  }
  const fields = [
    tlv(1, String(sellerName || '')),
    tlv(2, String(vatNumber  || '')),
    tlv(3, String(timestamp  || '')),
    tlv(4, String(total      || '')),
    tlv(5, String(vatAmount  || '')),
  ];
  const totalLen = fields.reduce((s, b) => s + b.length, 0);
  const combined = new Uint8Array(totalLen);
  let off = 0; for (const b of fields) { combined.set(b, off); off += b.length; }
  let bin = ''; for (let i = 0; i < combined.length; i++) bin += String.fromCharCode(combined[i]);
  return btoa(bin);
}

/* ============================================================
   ZATCA Phase 2 — UBL 2.1 Simplified Invoice XML
   ============================================================ */
function buildZatcaInvoiceXml({ invoiceNumber, uuid, issueDate, issueTime, sellerName, sellerStreet, sellerCity, vatNumber, buyerName, total, subtotal, vatAmount, vatRate, itemName, invoiceCounter, pih }) {
  const x = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const amt = (n) => (Math.round((+n || 0) * 100) / 100).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${x(invoiceNumber)}</cbc:ID>
  <cbc:UUID>${x(uuid)}</cbc:UUID>
  <cbc:IssueDate>${x(issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${x(issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${x(invoiceCounter)}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${x(pih)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${x(sellerName)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${x(sellerStreet || sellerCity)}</cbc:StreetName>
        <cbc:CityName>${x(sellerCity)}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${x(vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${x(sellerName)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${x(buyerName)}</cbc:Name></cac:PartyName>
      <cac:PartyLegalEntity><cbc:RegistrationName>${x(buyerName)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${amt(vatAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${amt(subtotal)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${amt(vatAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${amt(vatRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${amt(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${amt(subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${amt(total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${amt(total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${amt(subtotal)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${amt(vatAmount)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="SAR">${amt(total)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${x(itemName)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${amt(vatRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${amt(subtotal)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

/* ============================================================
   ZATCA Phase 2 — Signed TLV QR (tags 1–8)
   ============================================================ */
async function buildZatcaPhase2TLV({ sellerName, vatNumber, timestamp, total, vatAmount, canonicalData }) {
  const enc = new TextEncoder();
  function tlvBytes(tag, value) {
    const len = value.length;
    // BER-TLV length: 1-byte (≤127), 0x81 + 1-byte (≤255), 0x82 + 2-byte (>255).
    let header;
    if (len <= 127) {
      header = new Uint8Array([tag, len]);
    } else if (len <= 255) {
      header = new Uint8Array([tag, 0x81, len]);
    } else {
      header = new Uint8Array([tag, 0x82, (len >> 8) & 0xff, len & 0xff]);
    }
    const out = new Uint8Array(header.length + len);
    out.set(header, 0); out.set(value, header.length);
    return out;
  }

  const fields = [
    tlvBytes(1, enc.encode(String(sellerName || ''))),
    tlvBytes(2, enc.encode(String(vatNumber  || ''))),
    tlvBytes(3, enc.encode(String(timestamp  || ''))),
    tlvBytes(4, enc.encode(String(total      || ''))),
    tlvBytes(5, enc.encode(String(vatAmount  || ''))),
  ];

  // Sign via main process; it hashes + signs canonicalData and returns base64 values
  const signResult = await window.hubAPI?.zatcaSignInvoice?.({ canonicalData: canonicalData || '' });
  if (signResult?.ok) {
    // Tag 6: SHA-256 hash bytes (raw, not hex)
    const hashBytes = Uint8Array.from(atob(signResult.hashBase64), c => c.charCodeAt(0));
    fields.push(tlvBytes(6, hashBytes));
    // Tag 7: ECDSA signature bytes (DER)
    const sigBytes = Uint8Array.from(atob(signResult.signatureBase64), c => c.charCodeAt(0));
    fields.push(tlvBytes(7, sigBytes));
    // Tag 8: Public key (SPKI DER bytes, skip PEM header/footer)
    if (signResult.publicKey) {
      const pemBody = signResult.publicKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
      const pubBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
      fields.push(tlvBytes(8, pubBytes));
    }
  }

  const totalLen = fields.reduce((s, f) => s + f.length, 0);
  const combined = new Uint8Array(totalLen);
  let off = 0; for (const f of fields) { combined.set(f, off); off += f.length; }
  let bin = ''; for (let i = 0; i < combined.length; i++) bin += String.fromCharCode(combined[i]);
  return btoa(bin);
}

// "Print invoice" path — renders into the print area then opens the system print dialog
async function generateInvoice(id) {
  const order = printLog.find(o => o.id === id);
  if (!order) return;
  await renderInvoiceForOrder(order);
  setTimeout(() => window.print(), 80);
}

/* --- extracted 18219-18408 --- */
async function voidInvoice(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  if (order.voidedAt) {
    toast(t('inv.already_voided'), 'warning');
    return;
  }
  const ok = await confirmModal(t('inv.void_confirm', { id: order.id }), { danger: true, okText: t('inv.void_btn') });
  if (!ok) return;
  // Calculate total weight for the waste checkbox label
  const voidTotalWeight = (order.parts || []).reduce((s, p) => s + (+p.weightG || +p.printWeight || 0), 0);
  const voidMaterial = order.material || (order.parts || []).find(p => p.material)?.material || '';
  const hasWeightData = voidTotalWeight > 0 && voidMaterial;
  openFormModal({
    title: t('inv.void_btn') + ' — ' + order.id,
    saveLabel: t('inv.void_btn'),
    sizeLg: false,
    bodyHtml: `
      <label>${escapeHtml(t('inv.void_reason'))}</label>
      <input type="text" id="voidReasonInput" placeholder="${escapeHtml(t('inv.void_reason_ph'))}" style="width:100%;">
      ${hasWeightData ? `
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:14px;font-size:13px;">
        <input type="checkbox" id="voidLogWasteCheck" checked style="width:auto;margin:0;">
        <span>${escapeHtml(t('waste.voided_order'))} (${voidTotalWeight.toFixed(0)}g ${escapeHtml(voidMaterial)})</span>
      </label>` : ''}
    `,
    onMount(modal) { setTimeout(() => modal.querySelector('#voidReasonInput')?.focus(), 40); },
    onSave(modal) {
      order.voidedAt = new Date().toISOString();
      order.voidedReason = modal.querySelector('#voidReasonInput').value.trim() || 'Voided';
      order.status = order.status === 'completed' ? 'completed' : order.status; // keep status
      order.paymentStatus = 'voided';
      if (!order.statusHistory) order.statusHistory = [];
      order.statusHistory.push({ status: 'voided', at: order.voidedAt });
      if (order.statusHistory.length > 200) order.statusHistory = order.statusHistory.slice(-200);
      // Feature 5 (UX): Auto-log material waste if the order has parts with weight data
      const logWasteChk = modal.querySelector('#voidLogWasteCheck');
      if (logWasteChk && logWasteChk.checked) {
        const totalWeight = (order.parts || []).reduce((s, p) => s + (+p.weightG || +p.printWeight || 0), 0);
        const material = order.material || (order.parts || []).find(p => p.material)?.material || '';
        if (totalWeight > 0 && material) {
          wasteLog.unshift({
            id: uid('W'),
            date: localDateStr(),
            orderId: order.id,
            machineId: order.machineId || null,
            material,
            weight: totalWeight,
            failureType: 'operator_error',
            notes: t('waste.voided_order'),
            cost: 0,
          });
        }
      }
      saveAll();
      renderLogs(); renderKanban();
      toast(t('inv.voided_toast', { id: order.id }), 'success');
      return true;
    }
  });
}

function openCreditNoteModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  let creditAmt = +order.price || 0;
  let reason = '';

  const bodyHtml = `
    <p style="font-size:12.5px; color:var(--text-muted); margin:0 0 14px;">
      ${escapeHtml(t('cn.ref_order'))}: <strong>${escapeHtml(order.id)}</strong> · ${fmtPrice(order.price)} ${currencySymbol()}
    </p>
    <label>${escapeHtml(t('cn.credit_amount'))} (${currencySymbol()})</label>
    <input type="number" id="cnAmtInput" value="${creditAmt.toFixed(2)}" min="0.01" step="0.01" max="${order.price}">
    <label style="margin-top:14px;">${escapeHtml(t('cn.reason'))}</label>
    <textarea id="cnReasonInput" rows="3" style="resize:vertical;" placeholder="${escapeHtml(t('cn.reason_ph'))}">${escapeHtml(reason)}</textarea>`;

  openFormModal({
    title: t('cn.title'),
    saveLabel: t('cn.generate'),
    sizeLg: false,
    bodyHtml,
    onSave() {
      const amt = Math.min(Math.max(0.01, num(document.getElementById('cnAmtInput').value, creditAmt)), +order.price);
      const rsn = document.getElementById('cnReasonInput').value.trim();
      generateCreditNote(order, amt, rsn);
      return true;
    }
  });
}

function generateCreditNote(order, creditAmount, reason) {
  // A credit note reduces the amount DUE (a refund / cancelled charge). It is
  // recorded only in creditNotes[]; paidAmount is left untouched so the credit
  // is applied exactly once — orderOwedBase and payStatus both subtract it from
  // the effective price. (Mutating paidAmount here double-counted the credit.)
  if (!order.creditNotes) order.creditNotes = [];
  order.creditNotes.push({ id: 'CN-' + Date.now().toString(36), amount: creditAmount, reason, issuedAt: new Date().toISOString() });
  const totalCredited = order.creditNotes.reduce((s, cn) => s + (+cn.amount || 0), 0);
  // If credit equals full price, treat as voided for reporting
  if (totalCredited >= (+order.price || 0)) {
    order.creditedAt = new Date().toISOString();
  }
  saveAll();
  const area = $('#invoice-print-area');
  const isAr = i18n.current === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';
  const bizPrimary = isAr ? (settings.bizAr || settings.bizEn) : (settings.bizEn || settings.bizAr);
  const cnId = 'CN-' + order.id;
  const today = new Date().toISOString().split('T')[0];
  const linkedClient = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const clientName = (order.project || '').trim() || t('inv.walk_in');
  const clientSub  = linkedClient ? [linkedClient.phone, linkedClient.email].filter(Boolean).join(' · ') : '';
  // Feature 3: Build reversal reference line
  const invoiceNumber = order.invoiceNumber || order.id;
  const originalDate  = order.date || '';

  area.innerHTML = `
    <div class="inv-wrap">
    <div class="inv-top-bar" style="background:#b91c1c;"></div>
    <div class="inv" dir="${dir}" lang="${i18n.current}" style="--brand:#7f1d1d; --accent:#dc2626; --highlight:#fee2e2;">
      <div class="inv-header">
        <div class="biz">
          <div class="mark">${safeBizLogo() ? `<img src="${safeBizLogo()}" style="max-height:60px; max-width:120px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name">
            <h1>${escapeHtml(bizPrimary || 'Khayt')}</h1>
          </div>
        </div>
        <div class="doc">
          <div class="title" style="color:#dc2626;">${escapeHtml(isAr ? 'إشعار دائن' : 'Credit Note')}</div>
          <div class="title-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Credit Note' : 'إشعار دائن')}</div>
          <div class="meta">
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'رقم' : 'No.')}</span><span class="v">${escapeHtml(cnId)}</span></div>
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'التاريخ' : 'Date')}</span><span class="v">${escapeHtml(formatPrintDate(today))}</span></div>
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'يشير إلى' : 'Ref.')}</span><span class="v">${escapeHtml(order.id)}</span></div>
          </div>
        </div>
      </div>

      <div class="cn-ref-line">
        ${escapeHtml(t('cn.reversal_of'))}: <strong>#${escapeHtml(invoiceNumber)}</strong>
        ${originalDate ? ` &mdash; ${escapeHtml(t('cn.original_date'))}: ${escapeHtml(formatPrintDate(originalDate))}` : ''}
      </div>

      <div class="bill-to">
        <div class="label"><span>${escapeHtml(isAr ? 'صادر إلى' : 'Issued to')}</span></div>
        <div>
          <div class="name">${escapeHtml(clientName)}</div>
          ${clientSub ? `<div class="name-sub">${escapeHtml(clientSub)}</div>` : ''}
        </div>
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th>${escapeHtml(isAr ? 'الوصف' : 'Description')}</th>
            <th style="text-align:center; width:60px;">${escapeHtml(isAr ? 'الكمية' : 'Qty')}</th>
            <th class="th-amount" style="width:150px;">${escapeHtml(isAr ? 'الإجمالي' : 'Amount')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="desc-en">${escapeHtml(isAr ? 'إشعار دائن' : 'Credit Note')} — ${escapeHtml(order.project || order.id)}</div>
              ${reason ? `<div class="meta">${escapeHtml(reason)}</div>` : ''}
            </td>
            <td class="center">1</td>
            <td class="amount" style="color:#dc2626;">−${fmtMoney(creditAmount)} <span style="color:#666; font-weight:500;">${currencySymbol()}</span></td>
          </tr>
        </tbody>
      </table>

      <div class="totals">
        <div class="summary">
          <div class="row grand">
            <span class="label-en" style="color:#dc2626;">${escapeHtml(isAr ? 'إجمالي الإشعار' : 'Credit total')}</span>
            <span class="v" style="color:#dc2626;">−${fmtMoney(creditAmount)}<span class="unit">${currencySymbol()}</span></span>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="legal">${escapeHtml(isAr ? 'تم التوليد بواسطة Khayt' : 'Generated by Khayt')}</div>
      </div>
    </div>
    </div>`;

  setTimeout(() => window.print(), 80);
}

/* --- extracted 18410-18484 --- */
function generateDeliveryNote(id) {
  const order = printLog.find(o => o.id === id);
  if (!order) return;
  const area = $('#invoice-print-area');
  const isAr = i18n.current === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';
  const bizPrimary = isAr ? (settings.bizAr || settings.bizEn) : (settings.bizEn || settings.bizAr);
  const linkedClient = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const clientName = (order.project || '').trim() || t('inv.walk_in');
  const clientSub  = linkedClient ? [linkedClient.phone, linkedClient.email].filter(Boolean).join(' · ') : '';
  const lines = (order.parts && order.parts.length > 0) ? order.parts
    : [{ name: t('inv.services_default'), qty: 1 }];

  area.innerHTML = `
    <div class="inv-wrap">
    <div class="inv-top-bar" style="background:var(--primary);"></div>
    <div class="inv" dir="${dir}" lang="${i18n.current}" style="--brand:#1a1a2e; --accent:#4a90e2; --highlight:#eef3fc;">
      <div class="inv-header">
        <div class="biz">
          <div class="mark">${safeBizLogo() ? `<img src="${safeBizLogo()}" style="max-height:60px; max-width:120px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name">
            <h1>${escapeHtml(bizPrimary || 'Khayt')}</h1>
          </div>
        </div>
        <div class="doc">
          <div class="title">${escapeHtml(isAr ? 'إشعار تسليم' : 'Delivery Note')}</div>
          <div class="title-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Delivery Note' : 'إشعار تسليم')}</div>
          <div class="meta">
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'رقم' : 'Ref.')}</span><span class="v">${escapeHtml(order.id)}</span></div>
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'التاريخ' : 'Date')}</span><span class="v">${escapeHtml(formatPrintDate(order.date))}</span></div>
          </div>
        </div>
      </div>
      <div class="bill-to">
        <div class="label"><span>${escapeHtml(isAr ? 'تسليم إلى' : 'Deliver to')}</span></div>
        <div>
          <div class="name">${escapeHtml(clientName)}</div>
          ${clientSub ? `<div class="name-sub">${escapeHtml(clientSub)}</div>` : ''}
        </div>
      </div>
      ${(order.trackingNumber || order.courierName || order.deliveryAddress) ? `
      <div class="delivery-tracking">
        ${order.courierName ? `<div><strong>${escapeHtml(isAr ? 'شركة الشحن' : 'Courier')}:</strong> ${escapeHtml(order.courierName)}</div>` : ''}
        ${order.trackingNumber ? `<div><strong>${escapeHtml(isAr ? 'رقم التتبع' : 'Tracking')}:</strong> ${escapeHtml(order.trackingNumber)}</div>` : ''}
        ${order.deliveryAddress ? `<div><strong>${escapeHtml(isAr ? 'العنوان' : 'Address')}:</strong> ${escapeHtml(order.deliveryAddress)}</div>` : ''}
      </div>` : ''}
      <table class="lines">
        <thead>
          <tr>
            <th>${escapeHtml(isAr ? 'الصنف' : 'Item')}</th>
            <th style="text-align:center; width:60px;">${escapeHtml(isAr ? 'الكمية' : 'Qty')}</th>
            <th style="width:120px;">${escapeHtml(isAr ? 'ملاحظات' : 'Notes')}</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map(p => `
            <tr>
              <td>${escapeHtml(p.name)}</td>
              <td class="center">${p.qty || 1}</td>
              <td></td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:32px; display:flex; justify-content:space-between; gap:32px;">
        <div style="flex:1; border-top:1px solid #ccc; padding-top:8px; font-size:12px; color:#888;">${escapeHtml(isAr ? 'توقيع المستلم' : 'Received by')}</div>
        <div style="flex:1; border-top:1px solid #ccc; padding-top:8px; font-size:12px; color:#888;">${escapeHtml(isAr ? 'توقيع المسلِّم' : 'Delivered by')}</div>
      </div>
      <div class="footer" style="margin-top:24px;">
        <div class="legal">${escapeHtml(isAr ? 'تم التوليد بواسطة Khayt' : 'Generated by Khayt')}</div>
      </div>
    </div>
    </div>`;

  setTimeout(() => window.print(), 80);
}

/* --- extracted 18489-18502 --- */
async function generateMilestoneInvoice(orderId, milestone) {
  const order = printLog.find(o => o.id === orderId);
  if (!order || !milestone) return;
  // Build a temporary order-like object with the milestone amount
  const tempOrder = Object.assign({}, order, {
    price: milestone.amount,
    // The milestone bills a % of the full total; shipping/rush/extras/discount are
    // already represented in that %, so don't re-show or re-bill them in full on
    // top of the (smaller) milestone amount.
    shippingCost: 0,
    rushFeeAmount: 0,
    extraLines: [],
    discountPct: 0,
    priceBeforeDiscount: 0,
    _milestoneLabel: milestone.label,
    _milestoneTotal: order.price,
    _milestonePct: milestone.percentage,
  });
  milestone.issuedAt = new Date().toISOString().split('T')[0];
  saveAll();
  await renderInvoiceForOrder(tempOrder);
}

/* --- extracted 18874-19253 --- */
function renderInvoice(order, { qrSvg, payQrSvg = '', total, vatAmount, subtotal, subtotalShown, vatRate, shipping = 0 }) {
  const area = $('#invoice-print-area');
  const issuedDate = formatPrintDate(order.date);
  const issuedTime = order.timestamp ? new Date(order.timestamp).toTimeString().slice(0, 5) : '';
  // Feature 1: use the order's currency (per-order override, else client, else base)
  const invCurrencyCode = (typeof orderCurrency === 'function') ? orderCurrency(order) : clientCurrency(order.clientId);
  const invCurObj = CURRENCIES[invCurrencyCode] || CURRENCIES[settings.currency] || CURRENCIES.SAR;
  const invCurrSym = invCurObj.symbol;

  // Direction follows the current app language. The invoice is always bilingual,
  // but the primary label (larger, bolder) matches the user's working language.
  const isAr = i18n.current === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  // Numeral formatting helper — only converts when in Arabic mode with the toggle on
  const num = (v) => (isAr && settings.useArabicNumerals) ? toArabicNumerals(v) : String(v);
  const isPaid = (payStatus(order) === 'paid');

  // Label pairs — (primary, secondary). Primary = working language.
  const isQuoteDoc = order.status === 'quote';
  const L = {
    invoice:    isAr ? (isQuoteDoc ? ['عرض سعر','Quotation'] : ['فاتورة','Invoice'])
                     : (isQuoteDoc ? ['Quotation','عرض سعر'] : ['Invoice','فاتورة']),
    no:         isAr ? ['رقم',                 'No.']             : ['No.',               'رقم'],
    date:       isAr ? ['التاريخ',             'Date']            : ['Date',              'التاريخ'],
    time:       isAr ? ['الوقت',               'Time']            : ['Time',              'الوقت'],
    billTo:     isAr ? ['الفاتورة إلى',        'Bill to']         : ['Bill to',           'الفاتورة إلى'],
    description:isAr ? ['الوصف',               'Description']     : ['Description',       'الوصف'],
    qty:        isAr ? ['الكمية',              'Qty']             : ['Qty',               'الكمية'],
    amount:     isAr ? ['الإجمالي',            'Amount']          : ['Amount',            'الإجمالي'],
    subtotal:   isAr ? ['الإجمالي الفرعي',    'Subtotal']        : ['Subtotal',          'الإجمالي الفرعي'],
    vat:        isAr ? [`ضريبة القيمة (${vatRate || 15}٪)`, `VAT (${vatRate || 15}%)`] : [`VAT (${vatRate || 15}%)`, `ضريبة القيمة (${vatRate || 15}%)`],
    totalDue:   isAr ? ['الإجمالي المستحق',   'Total due']       : ['Total due',         'الإجمالي المستحق'],
    qrLabel:    isAr ? ['رمز هيئة الزكاة — امسح للتحقق', 'ZATCA QR — scan to verify']
                     : ['ZATCA QR — scan to verify',     'رمز هيئة الزكاة — امسح للتحقق'],
    legal:      settings.enableZatca
                  ? (isAr ? 'فاتورة متوافقة مع المرحلة الأولى من هيئة الزكاة والضريبة والجمارك'
                           : 'ZATCA Phase 1 compliant invoice with TLV-encoded QR code.')
                  : (isAr ? `صادرة بواسطة Khayt · ${t('inv.generated_by') || 'Professional Invoice'}`
                           : `Generated by Khayt · ${t('inv.generated_by') || 'Professional Invoice'}`),
  };

  // Pretty label: primary on top, smaller secondary underneath
  const pair = (k) => {
    const [p, s] = L[k];
    return `${escapeHtml(p)} <span class="sub${isAr ? ' ltr' : ' rtl'}">${escapeHtml(s)}</span>`;
  };

  // Bill-to: real client name, OR generic walk-in label
  const linkedClient = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const hasName = (order.project || '').trim().length > 0;
  const billToName = hasName ? order.project : t('inv.walk_in');
  const billToSub  = hasName
    ? (linkedClient ? renderClientSub(linkedClient) : '')
    : `<div class="name-sub">${isAr ? 'بدون عميل محدد' : 'No specific client'}</div>`;

  // Lines
  const orderExtraLines = order.extraLines || [];
  const orderExtraTotal = orderExtraLines.reduce((s, l) => s + (+l.amount || 0), 0);
  const lines = (order.parts && order.parts.length > 0)
    ? order.parts
    : [{ name: t('inv.services_default'), material: order.material, printTime: order.printTime, baseCost: order.price }];
  const totalBase = lines.reduce((s, p) => s + (+p.baseCost || 0), 0);
  // Pool for parts = total price minus shipping minus extra lines (fixed fees)
  const partsPool = +order.price - (+order.shippingCost || 0) - orderExtraTotal - (+order.rushFeeAmount || 0);
  const linesHtml = lines.map(p => {
    const share = totalBase > 0 ? (p.baseCost / totalBase) * partsPool : partsPool / lines.length;
    const meta = [
      p.material,
      p.printTime ? `${p.printTime} hrs` : '',
      p.printWeight ? `${Math.round(p.printWeight)} g` : '',
      p.layerHeight ? `${p.layerHeight}mm` : '',
      p.infill ? `${p.infill}% infill` : '',
      p.profile || ''
    ].filter(Boolean).join(' · ');
    return `
      <tr>
        <td>
          <div class="desc-en">${escapeHtml(p.name)}</div>
          ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
        </td>
        <td class="center">${num(String(p.qty || 1))}</td>
        <td class="amount">${fmtMoney(share)} <span style="color:var(--ink-mute); font-weight:500;">${invCurrSym}</span></td>
      </tr>`;
  }).join('');
  // Extra charge lines
  const extraLinesHtml = orderExtraLines.map(l => `
      <tr>
        <td><div class="desc-en">${escapeHtml(l.label || t('calc.extra_label_ph'))}</div></td>
        <td class="center">1</td>
        <td class="amount">${fmtMoney(+l.amount || 0)} <span style="color:var(--ink-mute); font-weight:500;">${invCurrSym}</span></td>
      </tr>`).join('');

  // Compact contact line in the header
  const contactBits = [
    settings.phone, settings.email,
    settings.cr ? `CR ${settings.cr}` : '',
    settings.vat ? `VAT ${settings.vat}` : ''
  ].filter(Boolean).join(' · ');

  // Choose business name & address based on language
  const bizPrimary    = isAr ? (settings.bizAr || settings.bizEn) : (settings.bizEn || settings.bizAr);
  const bizSecondary  = isAr ? (settings.bizEn || '') : (settings.bizAr || '');
  const addrPrimary   = isAr ? (settings.addrAr || settings.addrEn) : (settings.addrEn || settings.addrAr);
  const addrSecondary = isAr ? (settings.addrEn || '') : (settings.addrAr || '');

  const taglinePrimary   = isAr ? (settings.taglineAr || settings.taglineEn || '') : (settings.taglineEn || settings.taglineAr || '');
  const taglineSecondary = isAr ? (settings.taglineEn || '') : (settings.taglineAr || '');

  // Brand color: amber for quotes, user-chosen (or default) for invoices
  const invBrand     = isQuoteDoc ? '#92400e' : (safeCssColor(settings.invAccentColor, '#5E2E14'));
  const invAccent    = isQuoteDoc ? '#d97706' : (safeCssColor(settings.invAccentColor, '#B8723D'));
  const invHighlight = isQuoteDoc ? '#fef3c7' : '#fcefdc';

  // Terms / conditions section
  const termsPrimary   = isAr ? (settings.invTermsAr || settings.invTermsEn || '') : (settings.invTermsEn || settings.invTermsAr || '');
  const termsSecondary = isAr ? (settings.invTermsEn || '') : (settings.invTermsAr || '');
  const termsSectionHtml = termsPrimary.trim() ? `
    <div class="inv-terms">
      <div class="label-strip">
        <span>${escapeHtml(isAr ? 'الشروط والأحكام' : 'Terms & Conditions')}</span>
        <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Terms & Conditions' : 'الشروط والأحكام')}</span>
      </div>
      <p class="inv-terms-body">${escapeHtml(termsPrimary)}</p>
      ${termsSecondary ? `<p class="inv-terms-body sec">${escapeHtml(termsSecondary)}</p>` : ''}
    </div>` : '';

  // Hijri date display (always bilingual when toggle is on)
  const hijri = settings.useHijri ? hijriDate(order.date, 'short') : '';

  // Bank / payment info section — only render if at least one bank field is set
  const hasBank = (settings.bankName || settings.iban || settings.accountHolder);
  const bankSectionHtml = hasBank ? `
    <div class="bank-section">
      <div class="label-strip">
        <span>${escapeHtml(isAr ? 'بيانات الدفع' : 'Payment information')}</span>
        <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Payment information' : 'بيانات الدفع')}</span>
      </div>
      <div class="bank-grid">
        ${settings.bankName ? `<span class="k">${escapeHtml(t('inv.bank'))}</span><span class="v">${escapeHtml(settings.bankName)}</span>` : ''}
        ${settings.accountHolder ? `<span class="k">${escapeHtml(t('inv.account'))}</span><span class="v">${escapeHtml(settings.accountHolder)}</span>` : ''}
        ${settings.iban ? `<span class="k">${escapeHtml(t('inv.iban'))}</span><span class="v" style="letter-spacing:0.05em;">${escapeHtml(settings.iban.replace(/(.{4})/g, '$1 ').trim())}</span>` : ''}
      </div>
      ${(settings.acceptedPayments && settings.acceptedPayments.length > 0) ? `
        <div class="accepted-strip">
          <span class="label">${escapeHtml(t('inv.accepted'))}</span>
          <span class="methods">
            ${settings.acceptedPayments.map(m => `<span class="pm-pill ${m}">${escapeHtml(t('pay.method.' + m))}</span>`).join('')}
          </span>
        </div>` : ''}
      ${payQrSvg ? `
        <div class="pay-qr-row">
          <div class="pay-qr-code">${payQrSvg}</div>
          <div class="pay-qr-label">
            <span>${escapeHtml(isAr ? 'امسح للدفع' : 'Scan to pay')}</span>
            <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Scan to pay' : 'امسح للدفع')}</span>
          </div>
        </div>` : ''}
    </div>` : '';

  // "Paid" stamp overlay
  const paidStampHtml = isPaid ? `<div class="paid-stamp">${escapeHtml(isAr ? 'مدفوع' : 'PAID')}</div>` : '';

  const invTmpl = ['classic', 'modern', 'minimal'].includes(settings.invTemplate) ? settings.invTemplate : 'classic';
  area.innerHTML = `
    <div class="inv-wrap inv-tmpl-${invTmpl}">
    <div class="inv-top-bar" style="background:${invBrand};"></div>
    <div class="inv" dir="${dir}" lang="${i18n.current}" style="--brand:${invBrand}; --accent:${invAccent}; --highlight:${invHighlight};">
      ${paidStampHtml}

      <div class="inv-header">
        <div class="biz">
          <div class="mark">${safeBizLogo() ? `<img src="${safeBizLogo()}" style="max-height:80px; max-width:150px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name">
            <h1>${escapeHtml(bizPrimary || 'Khayt')}</h1>
            ${taglinePrimary ? `<div class="biz-tagline">${escapeHtml(taglinePrimary)}</div>` : ''}
            ${taglineSecondary ? `<div class="biz-tagline sec ${isAr ? 'ltr' : 'ar'}">${escapeHtml(taglineSecondary)}</div>` : ''}
            ${bizSecondary ? `<div class="biz-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(bizSecondary)}</div>` : ''}
            <div class="biz-meta">
              ${addrPrimary ? `<p>${escapeHtml(addrPrimary)}</p>` : ''}
              ${addrSecondary ? `<p class="${isAr ? 'ltr' : 'ar-line ar'}">${escapeHtml(addrSecondary)}</p>` : ''}
              ${contactBits ? `<p>${escapeHtml(contactBits)}</p>` : ''}
            </div>
          </div>
        </div>

        <div class="doc">
          <div class="title">${escapeHtml(L.invoice[0])}</div>
          <div class="title-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.invoice[1])}</div>
          <div class="meta">
            <div class="meta-row">
              <span class="k">${escapeHtml(L.no[0])}</span>
              <span class="v">${escapeHtml(num(order.id))}</span>
            </div>
            <div class="meta-row">
              <span class="k">${escapeHtml(L.date[0])}</span>
              <span class="v">${escapeHtml(num(issuedDate))}</span>
            </div>
            ${hijri ? `
            <div class="meta-row">
              <span class="k">${escapeHtml(t('inv.hijri'))}</span>
              <span class="v">${escapeHtml(num(hijri))}</span>
            </div>` : ''}
            ${issuedTime ? `
            <div class="meta-row">
              <span class="k">${escapeHtml(L.time[0])}</span>
              <span class="v">${escapeHtml(num(issuedTime))}</span>
            </div>` : ''}
            ${order.clientRef ? `
            <div class="meta-row">
              <span class="k">${escapeHtml(isAr ? 'مرجع العميل' : 'Client Ref.')}</span>
              <span class="v">${escapeHtml(order.clientRef)}</span>
            </div>` : ''}
          </div>
        </div>
      </div>

      <div class="bill-to">
        <div class="label">
          <span>${escapeHtml(L.billTo[0])}</span>
          <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.billTo[1])}</span>
        </div>
        <div>
          <div class="name">${escapeHtml(billToName)}${(() => {
            if (!order.clientId || !settings.loyaltyEnabled) return '';
            const tierObj = getClientTier(order.clientId);
            if (!tierObj) return '';
            return ` <span style="display:inline-block;background:#D88A3D;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;vertical-align:middle;margin-inline-start:4px;">${escapeHtml(tierObj.name)}</span>`;
          })()}</div>
          ${billToSub}
        </div>
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th>${pair('description')}</th>
            <th style="text-align:center; width: 60px;">${pair('qty')}</th>
            <th class="th-amount" style="width: 150px;">${pair('amount')}</th>
          </tr>
        </thead>
        <tbody>${linesHtml}${extraLinesHtml}</tbody>
      </table>

      <div class="totals">
        ${settings.enableZatca ? `
        <div class="qr-box">
          <div class="qr-svg">${qrSvg || '<div style="font-size:11px;color:#888;padding:24px;">QR unavailable</div>'}</div>
          <div class="qr-label">
            <span>${escapeHtml(L.qrLabel[0])}</span>
            <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.qrLabel[1])}</span>
          </div>
        </div>` : ''}
        <div class="summary">
          <div class="row">
            <span class="label-en">${escapeHtml(L.subtotal[0])}</span>
            <span class="v">${subtotalShown} ${invCurrSym}</span>
          </div>
          ${order.discountPct > 0 ? `
          <div class="row" style="color:#22c55e;">
            <span class="label-en">${escapeHtml(isAr ? `خصم (${order.discountPct}%)` : `Discount (${order.discountPct}%)`)}</span>
            <span class="v">−${fmtMoney(Math.max(0, (+order.priceBeforeDiscount || 0) * (+order.discountPct || 0) / 100))} ${invCurrSym}</span>
          </div>` : ''}
          ${(+order.rushFeeAmount || 0) > 0 ? `
          <div class="row">
            <span class="label-en">${escapeHtml(isAr ? 'رسوم مستعجلة' : 'Rush fee')}</span>
            <span class="v">${fmtMoney(+order.rushFeeAmount)} ${invCurrSym}</span>
          </div>` : ''}
          ${(+order.shippingCost || 0) > 0 ? `
          <div class="row">
            <span class="label-en">${escapeHtml(isAr ? 'رسوم الشحن' : 'Shipping')}</span>
            <span class="v">${fmtMoney(+order.shippingCost)} ${invCurrSym}</span>
          </div>` : ''}
          ${vatRate > 0 ? `
          <div class="row">
            <span class="label-en">${escapeHtml(L.vat[0])} ${isAr ? '(شامل)' : '(incl.)'}</span>
            <span class="v">${vatAmount} ${invCurrSym}</span>
          </div>` : ''}
          <div class="row grand">
            <span>
              <span class="label-en">${escapeHtml(L.totalDue[0])}</span>
              <span class="label-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.totalDue[1])}</span>
            </span>
            <span class="v">${total}<span class="unit">${invCurrSym}</span></span>
          </div>
          ${(() => {
            const orderCur = invCurrencyCode;
            const baseCur = settings.currency || 'SAR';
            const xrate = (settings.exchangeRates || {})[orderCur];
            if (orderCur && orderCur !== baseCur && xrate && xrate > 0) {
              const convertedAmt = fmtMoney((+order.price || 0) * xrate);
              const baseSym = (CURRENCIES[baseCur] || CURRENCIES.SAR).symbol;
              return `<div class="row" style="opacity:0.65;font-size:11px;border-top:1px dashed rgba(0,0,0,0.1);padding-top:4px;margin-top:4px;">
                <span class="label-en">${escapeHtml(isAr ? `المبلغ بـ ${baseCur}` : `Amount in ${baseCur}`)}</span>
                <span class="v">${convertedAmt}<span class="unit">${escapeHtml(baseSym)}</span></span>
              </div>`;
            }
            return '';
          })()}
        </div>
      </div>

      ${bankSectionHtml}

      ${(order.instalments && order.instalments.length > 0) ? `
      <div class="inv-notes-section" style="margin-top:12px;">
        <div class="label-strip">
          <span>${escapeHtml(isAr ? 'جدول الأقساط' : 'Payment Schedule')}</span>
          <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Payment Schedule' : 'جدول الأقساط')}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px;">
          <thead><tr style="color:var(--ink-mute);text-align:left;">
            <th style="padding:3px 6px;">${escapeHtml(isAr ? '#' : '#')}</th>
            <th style="padding:3px 6px;">${escapeHtml(isAr ? 'الاستحقاق' : 'Due date')}</th>
            <th style="padding:3px 6px;text-align:right;">${escapeHtml(isAr ? 'المبلغ' : 'Amount')}</th>
            <th style="padding:3px 6px;text-align:center;">${escapeHtml(isAr ? 'الحالة' : 'Status')}</th>
          </tr></thead>
          <tbody>
            ${order.instalments.map((ins, i) => `
            <tr style="border-top:1px solid rgba(0,0,0,.06);">
              <td style="padding:3px 6px;">${i + 1}</td>
              <td style="padding:3px 6px;">${escapeHtml(ins.dueDate ? formatPrintDate(ins.dueDate) : '—')}</td>
              <td style="padding:3px 6px;text-align:right;">${fmtMoney(+ins.amount || 0)} ${invCurrSym}</td>
              <td style="padding:3px 6px;text-align:center;color:${ins.paid ? 'var(--ink-success,#15803d)' : 'var(--ink-mute)'}">${ins.paid ? (isAr ? '✓ مدفوع' : '✓ Paid') : (isAr ? 'معلق' : 'Pending')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      ${(order.invoiceNotes || '').trim() ? `
      <div class="inv-notes-section">
        <div class="label-strip">
          <span>${escapeHtml(isAr ? 'ملاحظات' : 'Notes')}</span>
          <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Notes' : 'ملاحظات')}</span>
        </div>
        <p class="inv-notes-body">${escapeHtml(order.invoiceNotes)}</p>
      </div>` : ''}

      ${termsSectionHtml}

      <div class="footer">
        <div class="thanks">${escapeHtml(isAr ? (settings.footerAr || t('inv.thank_you')) : (settings.footerEn || t('inv.thank_you')))}</div>
        ${(isAr ? settings.footerEn : settings.footerAr) ? `<div class="thanks-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? settings.footerEn : settings.footerAr)}</div>` : ''}
        <div class="legal">${escapeHtml(L.legal)}</div>
      </div>

    </div>
    </div>`;

  // Apply Arabic numerals to body content after render (line items / amounts)
  if (isAr && settings.useArabicNumerals) {
    area.querySelectorAll('.amount, .v, .qty, td.center, td.amount, .biz-meta, .meta').forEach(el => {
      el.textContent = toArabicNumerals(el.textContent);
    });
  }
}

// Sub-line of contact info beneath the bill-to name (when client is linked)
function renderClientSub(c) {
  const bits = [c.phone, c.email].filter(Boolean).join(' · ');
  if (!bits) return '';
  return `<div class="name-sub">${escapeHtml(bits)}</div>`;
}

// Pretty date for invoice headers — e.g. "21 May 2026"
function formatPrintDate(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return isoDate; }
}

// The Layered Tuwaiq mark, inlined for the invoice header (Strata palette)
const BRAND_MARK_SVG = `
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="152" y="720" width="720" height="64" rx="12" fill="#5E2E14"/>
  <rect x="180" y="648" width="664" height="64" rx="12" fill="#A8542A"/>
  <rect x="252" y="576" width="520" height="64" rx="12" fill="#D88A3D"/>
  <rect x="342" y="504" width="340" height="64" rx="12" fill="#EFB46E"/>
  <rect x="422" y="432" width="180" height="64" rx="12" fill="#F5D6A3"/>
</svg>`;

  const api = {
    nextInvoiceNumber,
    nextQuoteSeq,
    generateClientStatement,
    exportClientInvoices,
    approveQuote,
    rejectQuote,
    renderInvoiceNumberingSection,
    reviseQuote,
    openQuoteRevisionsModal,
    exportInvoicePDF,
    shareInvoiceWhatsApp,
    sendStatusWhatsApp,
    sendPaymentReminder,
    sendQuoteFollowUp,
    shareTrackingWhatsApp,
    renderInvoiceForOrder,
    generateProformaInvoice,
    buildZatcaTLV,
    buildZatcaInvoiceXml,
    buildZatcaPhase2TLV,
    submitOrderToZatca,
    zatcaPhase2Ready,
    zatcaSubmissionStatusLabel,
    generateInvoice,
    voidInvoice,
    openCreditNoteModal,
    generateCreditNote,
    generateDeliveryNote,
    generateMilestoneInvoice,
    renderInvoice,
    renderClientSub,
    formatPrintDate,
  };

  global.BRAND_MARK_SVG = BRAND_MARK_SVG;
  Object.assign(global, api);
  global.KhaytInvoicing = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
