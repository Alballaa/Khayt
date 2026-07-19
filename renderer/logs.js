/**
 * Orders log tab: filtering, table render, batch actions, CSV export.
 */
(function (global) {
// Net revenue base for margin display/sort: strip shipping and VAT so margin is
// not overstated. Kept in the order's own currency to stay consistent with the
// parts cost (baseCost). VAT is extracted with the same rate/(100+rate) formula
// used in invoicing/expenses/analytics.
function orderNetRevenue(o) {
  const gross = (+o.price || 0) - (+o.shippingCost || 0);
  if (gross <= 0) return 0;
  const rate = settings.enableVat ? (+settings.vatRate || 15) : 0;
  return rate > 0 ? gross * 100 / (100 + rate) : gross;
}

function getFilteredLogs() {
  const filtered = printLog.filter(log => {
    if (!showArchivedOrders && log.archived) return false;
    if (logStatusFilter && log.status !== logStatusFilter) return false;
    if (logPayFilter    && payStatus(log) !== logPayFilter) return false;
    if (!inRange(log.date, logRangeFilter, 'log')) return false;
    if (logTagFilter && !(log.tags || []).includes(logTagFilter)) return false;
    if (logClientFilter && log.clientId !== logClientFilter) return false;
    if (logOperatorFilter && log.operatorId !== logOperatorFilter) return false;
    if (typeof orderMatchesActiveLocation === 'function' && !orderMatchesActiveLocation(log)) return false;
    if (logSearchTerm) {
      const cl = log.clientId ? clientById(log.clientId) : null;
      const hay = [log.project, log.client, cl?.nameEn, cl?.nameAr, log.id, log.material, ...(log.tags || [])].join(' ').toLowerCase();
      if (!hay.includes(logSearchTerm.toLowerCase())) return false;
    }
    return true;
  });
  const dir = logSortDir === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => {
    if (logSortCol === 'date')     return dir * (a.date || '').localeCompare(b.date || '');
    if (logSortCol === 'project')  return dir * (a.project || '').localeCompare(b.project || '');
    if (logSortCol === 'price')    return dir * ((+a.price || 0) - (+b.price || 0));
    if (logSortCol === 'material') return dir * (a.material || '').localeCompare(b.material || '');
    if (logSortCol === 'status')   return dir * (a.status || '').localeCompare(b.status || '');
    if (logSortCol === 'margin') {
      const costA = (a.parts || []).reduce((s, p) => s + (+p.baseCost || 0), 0);
      const costB = (b.parts || []).reduce((s, p) => s + (+p.baseCost || 0), 0);
      const revA = orderNetRevenue(a);
      const revB = orderNetRevenue(b);
      const mA = costA > 0 && revA > 0 ? (revA - costA) / revA : -Infinity;
      const mB = costB > 0 && revB > 0 ? (revB - costB) / revB : -Infinity;
      return dir * (mA - mB);
    }
    return 0;
  });
}

function clearLogFilters() {
  logSearchTerm   = '';
  logStatusFilter = '';
  logPayFilter    = '';
  logTagFilter    = '';
  logOperatorFilter = '';
  logClientFilter = '';
  logRangeFilter  = 'all';
  const sr = $('#logSearch');         if (sr)  sr.value  = '';
  const sf = $('#logStatusFilter');   if (sf)  sf.value  = '';
  const pf = $('#logPayFilter');      if (pf)  pf.value  = '';
  const tf = $('#logTagFilter');      if (tf)  tf.value  = '';
  const of = $('#logOperatorFilter'); if (of)  of.value  = '';
  const cf = $('#logClientFilter');   if (cf)  cf.value  = '';
  const rf = $('#logRangeFilter');    if (rf)  rf.value  = 'all';
  renderLogs();
}

function renderLogs() {
  const tbody = $('#logTable tbody');
  // Repopulate tag filter dropdown with all existing tags
  const tagSel = $('#logTagFilter');
  if (tagSel) {
    const allTags = getAllTags();
    const curTag = tagSel.value;
    tagSel.innerHTML = `<option value="">${escapeHtml(t('tag.all'))}</option>` +
      allTags.map(tg => `<option value="${escapeHtml(tg)}"${tg === curTag ? ' selected' : ''}>${escapeHtml(tg)}</option>`).join('');
  }
  // Client filter dropdown — only show clients that have orders
  const clientSel = $('#logClientFilter');
  if (clientSel) {
    const clientsWithOrders = clients.filter(c => printLog.some(o => o.clientId === c.id));
    clientSel.innerHTML = `<option value="">${escapeHtml(t('log.all_clients') || 'All clients')}</option>` +
      clientsWithOrders.map(c => `<option value="${escapeHtml(c.id)}"${c.id === logClientFilter ? ' selected' : ''}>${escapeHtml(localName(c))}</option>`).join('');
  }
  // QW6: Operator filter dropdown
  const operatorSel = $('#logOperatorFilter');
  if (operatorSel) {
    operatorSel.innerHTML = `<option value="">${escapeHtml(t('log.all_operators') || 'All operators')}</option>` +
      operators.map(op => `<option value="${escapeHtml(op.id)}"${op.id === logOperatorFilter ? ' selected' : ''}>${escapeHtml(op.name)}</option>`).join('');
  }
  // QW1: Update sort indicators on headers
  $$('#logTable thead th[data-sort]').forEach(th => {
    const col = th.dataset.sort;
    const arrow = logSortCol === col ? (logSortDir === 'asc' ? ' ▲' : ' ▼') : '';
    th.querySelectorAll('.sort-arrow').forEach(el => el.remove());
    if (arrow) {
      const span = document.createElement('span');
      span.className = 'sort-arrow';
      span.textContent = arrow;
      span.style.cssText = 'font-size:10px;color:var(--primary);';
      th.appendChild(span);
    }
  });
  const filtered = getFilteredLogs();

  // Reset display limit when any filter or sort criterion changes
  const filterHash = [logSearchTerm, logStatusFilter, logPayFilter, logTagFilter,
    logClientFilter, logOperatorFilter, logRangeFilter, logSortCol, logSortDir].join('\x00');
  if (filterHash !== _lastLogFilterHash) {
    logDisplayLimit = 100;
    _lastLogFilterHash = filterHash;
  }

  if (printLog.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${escapeHtml(t('log.empty'))} <button class="btn small primary" data-act="new-order" style="margin-inline-start:12px;">${escapeHtml(t('common.new_order') || 'New Order')}</button></td></tr>`;
    return;
  }
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${escapeHtml(t('log.empty_search'))} <button type="button" class="btn small ghost" style="margin-inline-start:10px;" data-act="clear-log-filters">${escapeHtml(t('log.clear_filters') || 'Clear filters')}</button></td></tr>`;
    return;
  }
  const page = filtered.slice(0, logDisplayLimit);
  tbody.innerHTML = page.map(log => {
    const ps = payStatus(log);
    const isPaid = ps === 'paid';
    const photoCount = (log.printPhotos || []).length;
    const fileCount  = (log.attachedFiles || []).length;
    const isOverdue = log.dueDate && log.status !== 'completed' && new Date(log.dueDate + 'T00:00:00') < new Date(new Date().setHours(0,0,0,0));
    const isSel = selectedOrders.has(log.id);
    const logOperator = log.operatorId ? operators.find(o => o.id === log.operatorId) : null;
    const logSplitBadge = log.splitInto && log.splitInto.length > 0 ? `<span class="split-badge">🔀 ${escapeHtml(t('ord.split_badge', { n: log.splitInto.length }))}</span>` : '';
    const logSubBadge = log.parentOrderId ? `<span class="sub-order-badge">↳ ${escapeHtml(t('ord.sub_order'))} #${escapeHtml(log.parentOrderId)}</span>` : '';
    // Profit margin estimation
    const partsCost = (log.parts || []).reduce((s, p) => s + (+p.baseCost || 0), 0);
    const netRevenue = orderNetRevenue(log);
    const hasMarginData = partsCost > 0 && netRevenue > 0;
    const marginPct = hasMarginData ? ((netRevenue - partsCost) / netRevenue * 100) : null;
    const marginHtml = marginPct !== null
      ? `<span style="font-size:11px;font-weight:600;padding:2px 6px;border-radius:10px;background:${marginPct >= 40 ? 'rgba(34,197,94,0.15)' : marginPct >= 20 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'};color:${marginPct >= 40 ? 'var(--success)' : marginPct >= 20 ? 'var(--warning)' : 'var(--danger)'};">${marginPct.toFixed(0)}%</span>`
      : `<span style="color:var(--text-muted);font-size:11px;">—</span>`;
    return `
    <tr${isOverdue ? ' class="row-overdue"' : ''}${isSel ? ' style="background:rgba(91,156,240,0.07);"' : ''}>
      <td style="width:32px;padding:8px 6px;"><input type="checkbox" class="log-sel" data-id="${log.id}" style="width:auto;" ${isSel ? 'checked' : ''}></td>
      <td style="font-family: var(--font-num); font-size: 12px; color: var(--text-dim); white-space:nowrap;">${escapeHtml(log.date)}</td>
      <td>
        ${getPriorityLevel(log) !== 'normal' ? priorityBadgeHtml(log) + ' ' : ''}<strong>${escapeHtml(log.project)}</strong>${log.dueDate && log.status !== 'completed' ? ' ' + formatDueDateBadge(log.dueDate) : ''}${logSplitBadge}${logSubBadge}
        ${logOperator ? `<span class="operator-badge">👤 ${escapeHtml(logOperator.name)}</span>` : ''}
        ${(log.tags && log.tags.length > 0) ? `<div style="margin-top:3px;">${renderTagChips(log.tags, true)}</div>` : ''}
        <div style="font-family: var(--font-num); font-size: 11.5px; color: var(--text-muted);">${escapeHtml(log.id)}${photoCount ? ` · ${photoCount}📷` : ''}${fileCount ? ` · ${fileCount}📎` : ''}${log.notes ? ' · 📝' : ''}</div>
      </td>
      <td>
        <span class="badge ${escapeHtml(log.status)}">${escapeHtml(t('queue.' + log.status))}</span>${log.deliveredAt ? ` <span style="font-size:10px; color:var(--success);">✓ ${escapeHtml(t('queue.delivered'))}</span>` : ''}
        ${log.status === 'completed' && log.completedAt ? `<div style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">✓ ${escapeHtml(t('ord.completed_at'))}: ${escapeHtml(new Date(log.completedAt).toLocaleDateString())}</div>` : ''}
        ${log.qcPassedAt ? `<div style="margin-top:2px;"><span class="qc-badge">✅ ${escapeHtml(t('ord.qc_passed'))}</span>${log.qcNotes ? `<span style="font-size:11px;color:var(--text-muted);margin-inline-start:5px;">${escapeHtml(log.qcNotes)}</span>` : ''}</div>` : ''}
        ${(log.milestoneInvoices && log.milestoneInvoices.length > 0) ? `<div style="margin-top:2px;font-size:10.5px;color:var(--primary);">📄 ${log.milestoneInvoices.length} ${escapeHtml(t('ord.milestone_invoices'))}</div>` : ''}
        ${(() => {
          // Feature 2: Actual duration badge
          if (log.printingStartedAt && log.completedAt) {
            const ms = new Date(log.completedAt) - new Date(log.printingStartedAt);
            if (ms > 0) {
              const totalMins = Math.round(ms / 60000);
              const h = Math.floor(totalMins / 60), m = totalMins % 60;
              return `<div style="font-size:10.5px; color:var(--primary); margin-top:1px;">⏱ ${escapeHtml(t('ord.actual_duration', { h, m }))}</div>`;
            }
          }
          return '';
        })()}
        ${(() => {
          // Feature 4: Instalment due badge
          if (!log.instalments) return '';
          const sevenDaysFromNow = todayPlusDays(7);
          const hasDue = log.instalments.some(ins => !ins.paidAt && ins.dueDate && ins.dueDate <= sevenDaysFromNow);
          return hasDue ? `<span style="font-size:10px; background:var(--primary); color:#fff; padding:1px 5px; border-radius:3px; margin-top:2px; display:inline-block;">💳 ${escapeHtml(t('ord.inst_badge'))}</span>` : '';
        })()}
      </td>
      <td>${paymentBadge(log)}</td>
      <td style="font-size: 12.5px; color: var(--text-dim);">${escapeHtml(log.material)}</td>
      <td style="color: var(--success); font-weight: 600; font-variant-numeric: tabular-nums; white-space:nowrap;">${fmtPrice(log.price)}</td>
      <td style="text-align:center;">${marginHtml}</td>
      <td class="log-actions-td">
        <div class="row-actions-wrap">
          <!-- ── Primary actions (always visible) ── -->
          <button class="btn small primary" data-act="edit-log" data-id="${log.id}" title="${escapeHtml(t('common.edit'))}">${escapeHtml(t('common.edit'))}</button>
          <button class="btn small ${isPaid ? 'success' : 'primary'}" data-act="${isPaid ? 'unpay' : 'pay'}" data-id="${log.id}" title="${escapeHtml(isPaid ? t('pay.mark_unpaid') : t('pay.mark_paid'))}">${isPaid ? '✓' : '💳'}</button>
          <button class="btn small" data-act="invoice" data-id="${log.id}" title="${escapeHtml(t('inv.print'))}">${escapeHtml(t('inv.print'))}</button>
          <button class="btn small ghost" data-act="inv-pdf" data-id="${log.id}" title="${escapeHtml(t('inv.save_pdf'))}">PDF</button>
          <!-- ⋯ dropdown trigger -->
          <button class="btn small ghost row-more-btn" data-id="${log.id}" title="${escapeHtml(t('common.more') || 'More actions')}" aria-haspopup="true" aria-expanded="false">⋯</button>
          <!-- ── Dropdown menu ── -->
          <div class="row-actions-menu" data-for="${log.id}">
            <!-- Documents -->
            <div class="menu-label">${escapeHtml(t('menu.documents') || 'Documents')}</div>
            <button class="menu-item" data-act="inv-wa"  data-id="${log.id}">📱 ${escapeHtml(t('inv.share_whatsapp'))}</button>
            <button class="menu-item" data-act="dn-log"  data-id="${log.id}">📋 ${escapeHtml(t('dn.print'))}</button>
            <button class="menu-item pro-only" data-act="cn-log" data-id="${log.id}">↩️ ${escapeHtml(t('cn.title'))}</button>
            <button class="menu-item" data-act="wo-log"  data-id="${log.id}">🔧 ${escapeHtml(t('wo.title'))}</button>
            ${(log.status === 'pending' || log.status === 'printing') && log.clientId && (+log.price || 0) > 0 ? `<button class="menu-item pro-only" data-act="gen-proforma" data-id="${log.id}">📄 ${escapeHtml(t('ord.gen_proforma'))}</button>` : ''}
            <button class="menu-item pro-only" data-act="milestone-invoices" data-id="${log.id}">📋 ${escapeHtml(t('ord.milestone_invoices'))}</button>
            ${!log.voidedAt ? `<button class="menu-item pro-only" data-act="void-invoice" data-id="${log.id}">🚫 ${escapeHtml(t('inv.void_btn'))}</button>` : `<span class="menu-item" style="color:var(--danger);cursor:default;">🚫 ${escapeHtml(t('inv.already_voided'))}</span>`}
            ${(() => { const cl = log.clientId ? clientById(log.clientId) : null; return cl?.email ? `<button class="menu-item" data-act="${log.status === 'quote' ? 'email-quote' : 'email-invoice'}" data-id="${log.id}">✉️ ${escapeHtml(t(log.status === 'quote' ? 'ord.email_quote' : 'ord.email_invoice'))}</button>` : ''; })()}
            ${(() => {
              if (typeof zatcaPhase2Ready !== 'function' || !zatcaPhase2Ready()) return '';
              if (log.status !== 'completed' && log.status !== 'delivered') return '';
              if (log.voidedAt) return '';
              const lbl = log.zatcaSubmission?.status === 'accepted' ? (t('zatca2.resubmit') || 'Retry ZATCA') : (t('zatca2.submit') || 'Submit to ZATCA');
              return `<button class="menu-item pro-only" data-act="zatca-submit" data-id="${log.id}">🇸🇦 ${escapeHtml(lbl)}</button>`;
            })()}
            <div class="menu-sep"></div>
            <!-- Tracking & sharing -->
            <div class="menu-label">${escapeHtml(t('menu.tracking') || 'Tracking')}</div>
            <button class="menu-item" data-act="export-status-page"  data-id="${log.id}">📄 ${escapeHtml(t('ord.status_page'))}</button>
            <button class="menu-item" data-act="portal-qr"           data-id="${log.id}">📱 ${escapeHtml(t('ord.portal_qr_title') || 'Portal QR')}</button>
            <button class="menu-item" data-act="copy-tracking-url"   data-id="${log.id}">🔗 ${escapeHtml(t('ord.copy_tracking_url') || 'Copy tracking URL')}</button>
            <button class="menu-item" data-act="portal-messages"     data-id="${log.id}">💬 ${escapeHtml(t('pm.menu') || 'Portal messages')}</button>
            <button class="menu-item" data-act="ai-reply"            data-id="${log.id}">✨ ${escapeHtml(t('ai.reply_menu') || 'Draft message (AI)')}</button>
            ${log.clientId ? `<button class="menu-item" data-act="open-status-page" data-id="${log.id}">🔗 ${escapeHtml(t('ord.status_page_open'))}</button>` : ''}
            ${log.trackingNumber ? `<button class="menu-item" data-act="share-tracking" data-id="${log.id}">📦 ${escapeHtml(t('ship.tracking_share'))}</button>` : ''}
            <div class="menu-sep"></div>
            <!-- Operations -->
            <div class="menu-label">${escapeHtml(t('menu.operations') || 'Operations')}</div>
            <button class="menu-item" data-act="dup-log"       data-id="${log.id}">⊕ ${escapeHtml(t('oe.duplicate'))}</button>
            <button class="menu-item" data-act="log-time"      data-id="${log.id}">⏱ ${escapeHtml(t('time.log_title') || 'Log time')}</button>
            <button class="menu-item" data-act="order-timeline" data-id="${log.id}">🕐 ${escapeHtml(t('ord.timeline'))}</button>
            ${(log.parts || []).length > 1 && log.status !== 'split' ? `<button class="menu-item pro-only" data-act="split-order" data-id="${log.id}">⚡ ${escapeHtml(t('ord.split'))}</button>` : ''}
            ${log.status !== 'completed' && (log.parts || []).length > 1 ? `<button class="menu-item" data-act="partial-delivery" data-id="${log.id}">📦 ${escapeHtml(t('ord.partial_delivery'))}</button>` : ''}
            ${log.status !== 'completed' && (log.parts || []).some(p => p.spoolId) ? `<button class="menu-item" data-act="log-spool-switch" data-id="${log.id}">🔄 ${escapeHtml(t('ord.spool_switch'))}</button>` : ''}
            <button class="menu-item" data-act="change-order"  data-id="${log.id}">🔀 ${escapeHtml(t('ord.change_order') || 'Change Order')}</button>
            ${!isPaid ? `<button class="menu-item" data-act="pay-remind" data-id="${log.id}">💰 ${escapeHtml(t('pay.remind_btn'))}</button>` : ''}
            <div class="menu-sep"></div>
            <!-- Print & labels -->
            <div class="menu-label">${escapeHtml(t('menu.print_label') || 'Print & labels')}</div>
            <button class="menu-item" data-act="reprint-log"   data-id="${log.id}">🖨 ${escapeHtml(t('oe.reprint'))}</button>
            ${(log.status === 'completed' || log.status === 'delivered') ? `<button class="menu-item" data-act="ship-order" data-id="${log.id}">📦 ${escapeHtml(log.shippingStatus ? (t('ship.st.' + log.shippingStatus) || t('ship.manage_title') || 'Shipment') : (t('ship.ship') || 'Ship'))}</button>` : ''}
            ${log.status === 'delivered' ? `<button class="menu-item" data-act="rma-log" data-id="${log.id}">🛡 ${escapeHtml(t('qc.rma_title') || 'Open RMA')}${log.rma ? ' ✓' : ''}</button>` : ''}
            <button class="menu-item" data-act="print-label"   data-id="${log.id}">🏷 ${escapeHtml(t('ord.label_btn') || 'Print Label')}</button>
            <button class="menu-item" data-act="packing-slip"  data-id="${log.id}">🗒 ${escapeHtml(t('ps.title') || 'Packing Slip')}</button>
            ${expenses.some(e => e.orderId === log.id) ? `<button class="menu-item" data-act="linked-expenses" data-id="${log.id}">💰 ${escapeHtml(t('exp.linked_expenses'))}</button>` : ''}
            <!-- Quotes (shown only for quote status) -->
            ${log.status === 'quote' ? `<div class="menu-sep"></div><div class="menu-label">${escapeHtml(t('menu.quote') || 'Quote')}</div>` : ''}
            ${log.status === 'quote' ? `<button class="menu-item" data-act="quote-approval-link" data-id="${log.id}">🔗 ${escapeHtml(t('ord.quote_approval_link'))}</button>` : ''}
            ${log.status === 'quote' && log.clientId ? `<button class="menu-item" data-act="export-quote-approval" data-id="${log.id}">📋 ${escapeHtml(t('ord.quote_approval_page'))}</button>` : ''}
            ${log.status === 'quote' ? `<button class="menu-item" data-act="revise-quote" data-id="${log.id}">📝 ${escapeHtml(t('ord.revise_quote'))}</button>` : ''}
            ${log.status === 'quote' && (log.quoteRevisions || []).length > 0 ? `<button class="menu-item" data-act="quote-revisions" data-id="${log.id}">🕐 ${escapeHtml(t('ord.quote_revisions'))} v${log.quoteVersion || 1}</button>` : ''}
            <!-- Engagement -->
            ${log.status === 'completed' ? `<div class="menu-sep"></div><div class="menu-label">${escapeHtml(t('menu.engagement') || 'Engagement')}</div>` : ''}
            ${log.status === 'completed' ? `<button class="menu-item" data-act="gen-survey" data-id="${log.id}">📊 ${escapeHtml(t('ord.gen_survey') || 'Generate survey')}</button>` : ''}
            ${log.status === 'completed' && !log.survey?.rating ? `<button class="menu-item" data-act="record-survey" data-id="${log.id}">⭐ ${escapeHtml(t('ord.record_survey') || 'Record rating')}</button>` : ''}
            ${log.survey?.rating ? `<span class="menu-item" style="cursor:default;">⭐ ${escapeHtml(t('ord.survey_rating') || 'Rating')}: ${log.survey.rating}/5</span>` : ''}
            <!-- History & admin -->
            <div class="menu-sep"></div>
            <div class="menu-label">${escapeHtml(t('menu.admin') || 'Admin')}</div>
            ${(log.editHistory && log.editHistory.length > 0) ? `<button class="menu-item" data-act="view-edit-history" data-id="${log.id}">📝 ${escapeHtml(t('ord.edit_history'))}</button>` : ''}
            <button class="menu-item" data-act="${log.archived ? 'unarchive-log' : 'archive-log'}" data-id="${log.id}">📦 ${escapeHtml(log.archived ? (t('ord.unarchive') || 'Unarchive') : (t('ord.archive') || 'Archive'))}</button>
            <button class="menu-item danger" data-act="del-log" data-id="${log.id}">🗑 ${escapeHtml(t('common.delete'))}</button>
          </div><!-- /.row-actions-menu -->
        </div><!-- /.row-actions-wrap -->
      </td>
    </tr>`;
  }).join('');
  if (filtered.length > logDisplayLimit) {
    tbody.innerHTML += `<tr><td colspan="9" style="text-align:center;padding:12px;">
      <button class="btn small ghost" data-act="load-more-logs">
        ${escapeHtml(t('log.load_more') || 'Load more')} (${filtered.length - logDisplayLimit} ${escapeHtml(t('log.remaining') || 'remaining')})
      </button>
    </td></tr>`;
  }
  updateNotifBadge();
}

/* ============================================================
   Batch order actions (logs tab)
   ============================================================ */
function renderBatchBar() {
  const bar = $('#batchBar');
  if (!bar) return;
  const count = selectedOrders.size;
  if (count === 0) {
    bar.style.display = 'none';
    const selAll = $('#logSelectAll');
    if (selAll) selAll.checked = false;
  } else {
    bar.style.display = 'flex';
    const countEl = $('#batchCount');
    if (countEl) countEl.textContent = t('batch.selected', { n: count });
    const machSel = $('#batchMachineSelect');
    if (machSel) {
      const prev = machSel.value;
      machSel.innerHTML = `<option value="">${escapeHtml(t('batch.assign_machine_ph') || '— Assign machine —')}</option>` +
        machines.map(m => `<option value="${m.id}"${m.id === prev ? ' selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
    }
  }
}

async function batchExportPDFs() {
  const ids = [...selectedOrders];
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i++) {
    toast(t('batch.exporting', { n: i + 1, total: ids.length }), 'info', 1600);
    await exportInvoicePDF(ids[i], { askWhere: false, openAfter: false });
    await new Promise(r => setTimeout(r, 120));
  }
  toast(t('batch.done', { n: ids.length }), 'success');
}

function batchWaSend() {
  const ids = [...selectedOrders];
  if (ids.length === 0) return;
  if (waTemplates.length === 0) { toast(t('wa.no_templates'), 'info'); return; }
  const tplOptions = waTemplates.map((tpl, i) =>
    `<option value="${i}">${escapeHtml(tpl.name)}</option>`).join('');
  const ordersHtml = ids.map(id => {
    const o = printLog.find(x => x.id === id);
    if (!o) return '';
    const client = o.clientId ? clientById(o.clientId) : null;
    const name = client ? (localName(client)) : (o.project || '');
    return `<div style="font-size:12px;color:var(--text-dim);padding:2px 0;">${escapeHtml(o.id)} — ${escapeHtml(name)} — ${fmtPrice(o.price)}</div>`;
  }).join('');
  openFormModal({
    title: `${t('batch.wa_all')} (${ids.length})`,
    saveLabel: t('wa.open_btn'),
    bodyHtml: `
      <label>${escapeHtml(t('wa.template'))}</label>
      <select id="batchWaTplSelect">${tplOptions}</select>
      <div style="margin-top:10px; padding:8px 10px; background:var(--surface-2); border-radius:var(--radius-sm); max-height:110px; overflow-y:auto;">${ordersHtml}</div>
      <p style="font-size:11.5px;color:var(--text-muted);margin:8px 0 0;">${escapeHtml(t('batch.wa_hint'))}</p>`,
    async onSave(modal) {
      const tpl = waTemplates[+modal.querySelector('#batchWaTplSelect').value];
      if (!tpl) return true;
      for (const id of ids) {
        const order = printLog.find(o => o.id === id);
        if (!order) continue;
        const client = order.clientId ? clientById(order.clientId) : null;
        const msg = fillWaTemplate(tpl.body, order, client);
        if (window.hubAPI?.shareWhatsApp) {
          await window.hubAPI.shareWhatsApp({ phone: client?.phone || '', message: msg, pdfPath: null });
          await new Promise(r => setTimeout(r, 250));
        }
      }
      return true;
    }
  });
}

async function batchMoveStatus() {
  const status = $('#batchStatusSelect')?.value;
  if (!status) { toast(t('batch.move_to_hint'), 'info'); return; }
  const ids = [...selectedOrders];
  if (ids.length === 0) return;
  const ok = await confirmModal(
    `Move ${ids.length} order(s) to "${status}"?`,
    { danger: status === 'completed' || status === 'on_hold' }
  );
  if (!ok) return;
  const now = new Date().toISOString();
  for (const id of ids) {
    const o = printLog.find(x => x.id === id);
    if (!o) continue;
    o.status = status;
    if (!o.statusHistory) o.statusHistory = [];
    o.statusHistory.push({ status, at: now });
    if (o.statusHistory.length > 200) o.statusHistory = o.statusHistory.slice(-200);
    if (status === 'completed') {
      if (!o.completedAt) o.completedAt = now;
      deductFilamentForOrder(o, { skipRender: true });
      deductPackagingConsumables(o);
      if (o.clientId) autoExportStatusPage(o);
      autoSendEmailNotification(o, 'completed');
      fireWebhook('status_changed', { orderId: o.id, project: o.project, newStatus: 'completed', client: o.client });
      fireWebhook('order_delivered', { orderId: o.id, project: o.project, client: o.client });
      fireOrderWebhook('status', o);
    }
  }
  renderInventory();
  saveAll();
  selectedOrders.clear();
  renderBatchBar();
  renderKanban();
  renderLogs();
  renderDashboard();
  toast(t('batch.moved', { n: ids.length }), 'success');
}

async function batchAssignMachine() {
  const machineId = $('#batchMachineSelect')?.value;
  if (!machineId) { toast(t('batch.assign_machine_ph') || 'Select a machine first', 'info'); return; }
  const machine = machines.find(m => m.id === machineId);
  const ids = [...selectedOrders];
  if (ids.length === 0) return;
  const ok = await confirmModal(
    `${t('batch.assign_confirm') || 'Assign'} ${ids.length} ${t('batch.orders') || 'order(s)'} → ${machine?.name || machineId}?`,
    { danger: false }
  );
  if (!ok) return;
  for (const id of ids) {
    const o = printLog.find(x => x.id === id);
    if (!o) continue;
    o.machineId = machineId;
    o.machine   = machine?.name || machineId;
  }
  saveAll();
  renderKanban(); renderLogs(); renderDashboard();
  toast(`🖨 ${ids.length} ${t('batch.orders') || 'order(s)'} ${t('batch.assigned_to') || 'assigned to'} ${machine?.name || machineId}`, 'success');
}

async function batchArchiveOrders() {
  const ids = [...selectedOrders];
  if (ids.length === 0) return;
  const ok = await confirmModal(`Archive ${ids.length} order(s)?`, { danger: false });
  if (!ok) return;
  for (const id of ids) {
    const o = printLog.find(x => x.id === id);
    if (o) o.archived = true;
  }
  selectedOrders.clear();
  saveAll();
  renderBatchBar();
  renderLogs();
  toast(`📦 ${ids.length} order(s) archived`, 'success');
}

function exportOrdersCsv() {
  const rows = getFilteredLogs();

  const headers = ['ID', 'Date', 'Client', 'Material', 'Print Time (hrs)', `Price (${currencySymbol()})`, 'Status', 'Payment', 'Paid Amount', 'Due Date', 'Machine', 'Tags', 'Notes'];
  const lines = [
    headers.map(csvEsc).join(','),
    ...rows.map(o => [
      o.id,
      o.date,
      o.project || '',
      o.material || '',
      o.printTime,
      o.price,
      o.status,
      payStatus(o),
      o.paidAmount || 0,
      o.dueDate || '',
      machines.find(m => m.id === o.machineId)?.name || '',
      (o.tags || []).join(', '),
      (o.notes || '').replace(/\n/g, ' ')
    ].map(csvEsc).join(','))
  ];

  downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    `orders-${new Date().toISOString().slice(0, 10)}.csv`);
}
  const api = {
    getFilteredLogs,
    clearLogFilters,
    renderLogs,
    renderBatchBar,
    batchExportPDFs,
    batchWaSend,
    batchMoveStatus,
    batchAssignMachine,
    batchArchiveOrders,
    exportOrdersCsv,
  };

  Object.assign(global, api);
  global.KhaytLogs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
