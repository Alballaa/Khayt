/**
 * Clients tab, autocomplete, recurring orders, portal export.
 */
let clientSearchTerm = '';

(function (global) {
/* ============================================================
   Clients
   ============================================================ */
function getClientStats(clientId) {
  const orders = printLog.filter(o => o.clientId === clientId);
  const completed = orders.filter(o => o.status === 'completed');
  const sorted = [...orders].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return {
    count: orders.length,
    completedCount: completed.length,
    revenue: completed.reduce((s, o) => s + orderRevenueBase(o), 0),
    lastDate: sorted[0]?.date || null
  };
}

function renderClients() {
  const tbody = $('#clientsTable tbody');
  const term = (clientSearchTerm || '').toLowerCase().trim();
  let filtered = clients;
  if (term) {
    filtered = clients.filter(c =>
      (c.id || '').toLowerCase().includes(term) ||
      (c.nameEn || '').toLowerCase().includes(term) ||
      (c.nameAr || '').toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term)
    );
  }
  if (clients.length === 0) {
    const grid0 = $('#clientsCardsGrid');
    const wrap0 = $('#clientsTableWrap');
    if (grid0 && document.body.classList.contains('khayt-handoff')) {
      grid0.innerHTML = `<p class="dash-empty" style="padding:18px">${escapeHtml(t('cl.empty'))}</p>`;
      grid0.style.display = 'grid';
      grid0.removeAttribute('aria-hidden');
      if (wrap0) wrap0.classList.add('khayt-clients-legacy-hidden');
    }
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(t('cl.empty'))}</td></tr>`;
    return;
  }
  if (filtered.length === 0) {
    const gridE = $('#clientsCardsGrid');
    if (gridE && document.body.classList.contains('khayt-handoff')) {
      gridE.innerHTML = `<p class="dash-empty" style="padding:18px">${escapeHtml(t('cl.empty_search'))}</p>`;
      gridE.style.display = 'grid';
      if ($('#clientsTableWrap')) $('#clientsTableWrap').classList.add('khayt-clients-legacy-hidden');
    }
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(t('cl.empty_search'))}</td></tr>`;
    return;
  }
  // Precompute all per-client aggregates in a single O(n) pass to avoid O(n²) scans
  const clientStatsMap = new Map();
  const clientSurveyMap = new Map();  // clientId -> { sum, count }
  const clientBalanceMap = new Map(); // clientId -> outstanding balance
  for (const o of printLog) {
    if (!o.clientId) continue;
    // Stats (count, revenue, lastDate)
    let s = clientStatsMap.get(o.clientId);
    if (!s) { s = { count: 0, completedCount: 0, revenue: 0, lastDate: null }; clientStatsMap.set(o.clientId, s); }
    s.count++;
    if (o.status === 'completed') { s.completedCount++; s.revenue += orderRevenueBase(o); }
    if (!s.lastDate || o.date > s.lastDate) s.lastDate = o.date;
    // Survey ratings
    if (o.survey?.rating) {
      let sv = clientSurveyMap.get(o.clientId);
      if (!sv) { sv = { sum: 0, count: 0 }; clientSurveyMap.set(o.clientId, sv); }
      sv.sum += o.survey.rating; sv.count++;
    }
    // Outstanding balance (unpaid non-quote orders)
    if (o.status !== 'quote' && payStatus(o) !== 'paid') {
      const outstanding = orderOwedBase(o);
      if (outstanding > 0) clientBalanceMap.set(o.clientId, (clientBalanceMap.get(o.clientId) || 0) + outstanding);
    }
  }
  // Precompute loyalty tiers in one pass (getClientTier itself iterates printLog)
  const clientTierMap = new Map();
  if (settings.loyaltyEnabled) {
    const tiers = (settings.loyaltyTiers || []).filter(tier => tier.name);
    if (tiers.length > 0) {
      const tierSpend  = new Map(); // clientId -> { completedCount, totalSpend }
      for (const o of printLog) {
        if (!o.clientId || o.status !== 'completed') continue;
        let ts = tierSpend.get(o.clientId);
        if (!ts) { ts = { completedCount: 0, totalSpend: 0 }; tierSpend.set(o.clientId, ts); }
        ts.completedCount++; ts.totalSpend += orderRevenueBase(o);
      }
      for (const [cid, { completedCount, totalSpend }] of tierSpend) {
        const eligible = tiers.filter(tier =>
          (!tier.minOrders || completedCount >= +tier.minOrders) &&
          (!tier.minSpend  || totalSpend     >= +tier.minSpend)
        );
        if (eligible.length > 0) {
          clientTierMap.set(cid, eligible.sort((a, b) => {
            const d = (+b.minOrders || 0) - (+a.minOrders || 0);
            return d !== 0 ? d : (+b.minSpend || 0) - (+a.minSpend || 0);
          })[0]);
        }
      }
    }
  }

  const clientMaps = { clientStatsMap, clientBalanceMap, clientTierMap, clientSurveyMap };
  if (window.KhaytStudio?.renderClientsStudioCards?.(filtered, clientMaps)) return;

  tbody.innerHTML = filtered.map(c => {
    const stats = clientStatsMap.get(c.id) || { count: 0, completedCount: 0, revenue: 0, lastDate: null };
    const displayName = localName(c);
    const altName     = i18n.current === 'ar' ? c.nameEn : c.nameAr;
    const balance = clientBalanceMap.get(c.id) || 0;
    const isOverLimit = (c.creditLimit > 0) && (balance > c.creditLimit);
    // Feature 8 (new 8-pack): Loyalty tier badge
    const tier = clientTierMap.get(c.id) || null;
    const tierHtml = tier ? `<span class="loyalty-tier-badge tier-${escapeHtml(tier.name.toLowerCase().replace(/\s+/g,''))}">${escapeHtml(tier.name)}</span>` : '';
    // Survey rating from completed orders (pre-computed above)
    const sv = clientSurveyMap.get(c.id);
    const avgRating = sv ? sv.sum / sv.count : null;
    const clientOrdersWithSurveyCount = sv ? sv.count : 0;
    const ratingBadge = avgRating !== null
      ? `<span style="font-size:10px;color:#f59e0b;margin-inline-start:5px;white-space:nowrap;" title="${clientOrdersWithSurveyCount} ${escapeHtml(t('an.survey_responses') || 'survey response(s)')}">⭐ ${avgRating.toFixed(1)}</span>`
      : '';
    const sourceBadge = c.source && c.source !== 'other'
      ? `<span class="source-badge source-${escapeHtml(c.source)}">${escapeHtml(t('cl.source_' + c.source))}</span>`
      : '';
    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="avatar">${escapeHtml(initials(displayName))}</span>
            <div>
              <strong>${escapeHtml(displayName || '—')}</strong>${ratingBadge}${sourceBadge}
              ${c.recurring?.enabled ? `<span class="rec-badge">${escapeHtml(t('rec.badge.' + (c.recurring.interval || 'monthly')))}</span>` : ''}
              ${c.currency && c.currency !== (settings.currency || 'SAR') ? `<span class="currency-badge">${escapeHtml(c.currency)}</span>` : ''}
              ${(c.addresses && c.addresses.length > 0) ? `<span style="font-size:10px; color:var(--primary); margin-inline-start:4px;">📍 ${c.addresses.length}</span>` : ''}
              ${isOverLimit ? `<span class="machine-jobs-badge" style="background:var(--danger);color:#fff;font-size:10px;">⚠ ${escapeHtml(t('cl.over_limit'))}</span>` : ''}
              ${tierHtml}
              ${altName ? `<div style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(altName)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="font-variant-numeric: tabular-nums;">${escapeHtml(c.phone || '—')}</td>
        <td style="font-variant-numeric: tabular-nums;">${stats.count}</td>
        <td style="font-variant-numeric: tabular-nums; color: var(--success);">${fmtPrice(stats.revenue)}</td>
        <td style="font-variant-numeric: tabular-nums; color: var(--text-dim);">${escapeHtml(stats.lastDate || t('cl.never_ordered'))}</td>
        <td style="font-variant-numeric:tabular-nums;text-align:right;color:${balance > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${balance > 0 ? fmtPrice(balance) : '—'}</td>
        <td>
          <button class="btn small" data-act="cl-history" data-id="${c.id}">${escapeHtml(t('cl.history'))}</button>
          <button class="btn small success" data-act="cl-quote" data-id="${c.id}">${escapeHtml(t('cl.quote'))}</button>
          <button class="btn small" data-act="cl-intake-form" data-id="${c.id}" title="${escapeHtml(t('cl.intake_form'))}">📋</button>
          <button class="btn small" data-act="cl-note" data-id="${c.id}" title="${escapeHtml(t('cl.add_note'))}">💬</button>
          <button class="btn small" data-act="cl-edit" data-id="${c.id}">${escapeHtml(t('common.edit'))}</button>
          <button class="btn danger small" data-act="cl-del" data-id="${c.id}">${escapeHtml(t('common.delete'))}</button>
        </td>
      </tr>`;
  }).join('');
}

function quoteForClient(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  currentClientId = c.id;
  const display = localName(c);
  $('#clientInput').value = display;
  switchTab('calculator-tab');
}

/* Feature 6: Client job intake form (PDF/HTML export) */
async function generateIntakeForm(clientId) {
  const client = clientId ? clients.find(c => c.id === clientId) : null;
  const shopName  = settings.bizEn || settings.bizAr || 'Khayt';
  const shopPhone = settings.phone || '';
  const shopEmail = settings.email || '';
  const clientName = client ? localName(client) : '';
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const accentColor = safeCssColor(settings.invAccentColor, '#5E2E14');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${shopName} — ${t('cl.intake_title')}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #222; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${accentColor}; padding-bottom: 16px; margin-bottom: 24px; }
  .shop-name { font-size: 22px; font-weight: 700; color: ${accentColor}; }
  .shop-contact { font-size: 12px; color: #555; text-align: end; }
  h1 { font-size: 20px; color: ${accentColor}; margin-bottom: 20px; }
  .field { margin-bottom: 18px; }
  label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #333; }
  .field-line { border-bottom: 1px solid #999; height: 28px; }
  .checkbox-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .checkbox-row input { width: 16px; height: 16px; }
  .signature-area { display: flex; gap: 40px; margin-top: 32px; border-top: 1px solid #ccc; padding-top: 20px; }
  .sig-block { flex: 1; }
  .sig-block .sig-line { border-bottom: 1px solid #555; height: 40px; margin-bottom: 6px; }
  .sig-block label { font-size: 12px; color: #666; }
  .footer { margin-top: 32px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="shop-name">${escapeHtml(shopName)}</div>
      ${shopPhone ? `<div style="font-size:12px; color:#555;">${escapeHtml(shopPhone)}</div>` : ''}
    </div>
    <div class="shop-contact">
      ${shopEmail ? `<div>${escapeHtml(shopEmail)}</div>` : ''}
      <div>${dateStr}</div>
    </div>
  </div>

  <h1>${escapeHtml(t('cl.intake_title'))}</h1>

  <div class="field">
    <label>${escapeHtml(t('cl.name'))}</label>
    <div class="field-line">${escapeHtml(clientName)}</div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.phone'))} / ${escapeHtml(t('cl.email'))}</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.intake_project'))}</label>
    <div class="field-line"></div>
    <div class="field-line" style="margin-top:8px;"></div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.intake_qty'))}</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>Material preference</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>Color preference</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.intake_deadline'))}</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.intake_requirements'))}</label>
    <div class="field-line"></div>
    <div class="field-line" style="margin-top:8px;"></div>
  </div>
  <div class="field">
    <label>File delivery method</label>
    <div class="checkbox-row"><input type="checkbox"> Email</div>
    <div class="checkbox-row"><input type="checkbox"> WeTransfer</div>
    <div class="checkbox-row"><input type="checkbox"> USB</div>
  </div>
  <div class="checkbox-row" style="margin-top:12px;">
    <input type="checkbox">
    <label style="font-weight:400; font-size:13px;">I approve minor design adjustments if needed</label>
  </div>

  <div class="signature-area">
    <div class="sig-block">
      <div class="sig-line"></div>
      <label>Client Signature &amp; Date</label>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <label>Studio Representative</label>
    </div>
  </div>

  <div class="footer">${escapeHtml(shopName)} · ${escapeHtml(settings.addrEn || '')}</div>
</body>
</html>`;

  if (window.hubAPI?.saveHtml) {
    await window.hubAPI.saveHtml(html, 'intake-form.html');
    toast(t('cl.intake_saved'), 'success');
  }
}

function openClientHistory(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  const displayName = localName(c);
  const orders = printLog.filter(o => o.clientId === clientId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const { revenue: totalRev, count: completedCount } = getClientStats(clientId);
  const totalOrders = orders.length;
  const avgOrder = completedCount > 0 ? totalRev / completedCount : 0;

  const statusCls = { pending:'pending', printing:'printing', post:'post', completed:'completed' };

  const rowsHtml = orders.length === 0
    ? `<p style="color:var(--text-muted); font-size:13px; margin:12px 0 0;">${escapeHtml(t('cl.history_empty'))}</p>`
    : `<div class="table-wrap" style="margin-top:14px;">
        <table>
          <thead><tr>
            <th data-i18n="common.date">${escapeHtml(t('common.date'))}</th>
            <th>${escapeHtml(t('log.client'))}</th>
            <th>${escapeHtml(t('common.status'))}</th>
            <th>${escapeHtml(t('log.price'))}</th>
            <th>${escapeHtml(t('log.pay_status'))}</th>
          </tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td style="font-size:12px; color:var(--text-dim); white-space:nowrap;">${escapeHtml(o.date)}</td>
                <td><strong>${escapeHtml(o.project || o.id)}</strong><div style="font-size:11px; color:var(--text-muted);">${escapeHtml(o.id)}</div></td>
                <td><span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span></td>
                <td style="font-weight:600; color:var(--success); font-variant-numeric:tabular-nums; white-space:nowrap;">${fmtPrice(o.price)}</td>
                <td>${paymentBadge(o)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

  openFormModal({
    title:     `${displayName} — ${t('cl.history')}`,
    saveLabel: t('cl.quote'),
    sizeLg:    true,
    bodyHtml:  `
      <div class="cl-hist-stats">
        <div class="cl-hist-stat">
          <div class="v">${totalOrders}</div>
          <div class="l">${escapeHtml(t('cl.hist_orders'))}</div>
        </div>
        <div class="cl-hist-stat">
          <div class="v">${fmtMoney(totalRev)}</div>
          <div class="l">${escapeHtml(t('cl.hist_revenue'))} ${escapeHtml(currencySymbol())}</div>
        </div>
        <div class="cl-hist-stat">
          <div class="v">${isFinite(avgOrder) && avgOrder > 0 ? fmtMoney(avgOrder) : '—'}</div>
          <div class="l">${escapeHtml(t('cl.hist_avg'))} ${escapeHtml(currencySymbol())}</div>
        </div>
      </div>
      ${rowsHtml}
      <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border-soft); display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn small primary" id="btnPrintStatement">${escapeHtml(t('cl.print_statement'))}</button>
        <button class="btn small ghost" id="btnExportClientInvoices">${escapeHtml(t('cl.export_all_invoices'))}</button>
        <button class="btn small ghost" id="btnExportClientPortal">🌐 ${escapeHtml(t('cl.portal_export'))}</button>
      </div>`,
    onMount(modal) {
      modal.querySelector('#btnPrintStatement')?.addEventListener('click', () => {
        generateClientStatement(clientId);
      });
      modal.querySelector('#btnExportClientInvoices')?.addEventListener('click', () => {
        exportClientInvoices(clientId);
      });
      modal.querySelector('#btnExportClientPortal')?.addEventListener('click', () => {
        exportClientPortal(clientId);
      });
    },
    onSave() { quoteForClient(clientId); return true; }
  });
}


async function deleteClient(clientId) {
  const ok = await confirmModal(t('ce.delete_q'), { danger: true });
  if (!ok) return;
  const idx = clients.findIndex(c => c.id === clientId);
  const removed = idx >= 0 ? clients[idx] : null;
  clients = clients.filter(c => c.id !== clientId);
  // Null-out orders that reference the deleted client (tracked so undo can relink)
  const unlinked = [];
  for (const o of printLog) {
    if (o.clientId === clientId) { unlinked.push(o); o.clientId = null; }
  }
  saveAll();
  renderClients();
  toast(t('ce.deleted'), 'success', 5000, removed ? {
    undo: () => {
      clients.splice(Math.min(Math.max(idx, 0), clients.length), 0, removed);
      for (const o of unlinked) o.clientId = clientId;
      saveAll();
      renderClients();
    },
  } : {});
}

function openClientEditor(clientId = null) {
  const existing = clientId ? clients.find(c => c.id === clientId) : null;
  const draft = existing
    ? { ...existing }
    : { id: uid('CLI'), nameEn: '', nameAr: '', phone: '', email: '', cr: '', vat: '', notes: '', defaultDiscount: 0, createdAt: new Date().toISOString().split('T')[0] };
  if (!draft.priceList) draft.priceList = [];
  const rec = draft.recurring || { enabled: false, interval: 'monthly', nextDue: '' };

  const intervalOptions = ['weekly','biweekly','monthly','quarterly']
    .map(v => `<option value="${v}" ${rec.interval === v ? 'selected' : ''}>${escapeHtml(t('rec.interval.' + v))}</option>`)
    .join('');

  const bodyHtml = `
    <div class="inline-pair">
      <div>
        <label>${escapeHtml(t('ce.name_en'))}</label>
        <input type="text" data-f="nameEn" placeholder="${escapeHtml(t('ce.name_en_ph'))}" value="${escapeHtml(draft.nameEn || '')}">
      </div>
      <div>
        <label>${escapeHtml(t('ce.name_ar'))}</label>
        <input type="text" data-f="nameAr" dir="rtl" placeholder="${escapeHtml(t('ce.name_ar_ph'))}" value="${escapeHtml(draft.nameAr || '')}">
      </div>
    </div>
    <div class="inline-pair">
      <div>
        <label>${escapeHtml(t('ce.phone'))}</label>
        <input type="tel" data-f="phone" placeholder="+966 5x xxx xxxx" value="${escapeHtml(draft.phone || '')}">
      </div>
      <div>
        <label>${escapeHtml(t('ce.email'))}</label>
        <input type="email" data-f="email" value="${escapeHtml(draft.email || '')}">
      </div>
    </div>
    <div class="inline-pair">
      <div>
        <label>${escapeHtml(t('ce.cr'))}</label>
        <input type="text" data-f="cr" value="${escapeHtml(draft.cr || '')}">
      </div>
      <div>
        <label>${escapeHtml(t('ce.vat'))}</label>
        <input type="text" data-f="vat" maxlength="15" value="${escapeHtml(draft.vat || '')}">
      </div>
    </div>
    <label>${escapeHtml(t('ce.notes'))}</label>
    <input type="text" data-f="notes" placeholder="${escapeHtml(t('ce.notes_ph'))}" value="${escapeHtml(draft.notes || '')}">

    <label style="margin-top:10px;">${escapeHtml(t('cl.source'))}</label>
    <select data-f="source">
      ${['instagram','referral','walk_in','website','exhibition','other'].map(s =>
        `<option value="${s}" ${(draft.source || 'other') === s ? 'selected' : ''}>${escapeHtml(t('cl.source_' + s))}</option>`
      ).join('')}
    </select>

    <div style="margin-top:14px; display:flex; align-items:center; gap:12px;">
      <div style="flex:1;">
        <label style="margin-top:0;">${escapeHtml(t('ce.default_discount'))} (%)</label>
        <input type="number" data-f="defaultDiscount" min="0" max="100" step="1" value="${draft.defaultDiscount || 0}" placeholder="0">
      </div>
      <div style="flex:2; padding-top:20px; font-size:12px; color:var(--text-muted);">${escapeHtml(t('ce.default_discount_hint'))}</div>
    </div>

    <div style="margin-top:14px;">
      <label style="margin-top:0;">${escapeHtml(t('ce.currency'))}</label>
      <select id="ceCurrency">
        <option value="">${escapeHtml(t('common.default') !== 'common.default' ? t('common.default') : 'Default')} (${escapeHtml(settings.currency || 'SAR')})</option>
        ${Object.entries(CURRENCIES).map(([code, c]) => `<option value="${code}"${draft.currency === code ? ' selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
      </select>
      <p style="font-size:11.5px;color:var(--text-muted);margin:3px 0 0;">${escapeHtml(t('ce.currency_hint'))}</p>
    </div>

    <div style="margin-top:14px; display:flex; align-items:center; gap:12px;">
      <div style="flex:1;">
        <label style="margin-top:0;">${escapeHtml(t('ce.credit_limit'))} (${currencySymbol()})</label>
        <input type="number" id="ceCreditLimit" min="0" step="1" value="${draft.creditLimit || 0}" placeholder="0">
      </div>
      <div style="flex:2; padding-top:20px; font-size:12px; color:var(--text-muted);">${escapeHtml(t('ce.credit_limit_hint'))}</div>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="margin:0; flex:1; font-size:12.5px; font-weight:600;">${escapeHtml(t('ce.price_list'))}</label>
        <button class="btn ghost small" id="cePlAdd" type="button">${escapeHtml(t('ce.pl_add'))}</button>
      </div>
      <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 8px;">${escapeHtml(t('ce.price_list_hint'))}</p>
      <div id="cePriceListWrap"></div>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:0;">
        <input type="checkbox" id="recEnabled" style="width:auto;margin:0;" ${rec.enabled ? 'checked' : ''}>
        <span>${escapeHtml(t('rec.enable'))}</span>
      </label>
      <div id="recFields" style="${rec.enabled ? '' : 'display:none;'} margin-top:10px;">
        <div class="inline-pair">
          <div>
            <label>${escapeHtml(t('rec.interval'))}</label>
            <select id="recInterval">${intervalOptions}</select>
          </div>
          <div>
            <label>${escapeHtml(t('rec.next_due'))}</label>
            <input type="date" id="recNextDue" value="${escapeHtml(rec.nextDue || '')}">
          </div>
        </div>
        <p style="font-size:11.5px;color:var(--text-muted);margin:4px 0 0;">${escapeHtml(t('rec.hint'))}</p>
      </div>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="margin:0; flex:1; font-size:12.5px; font-weight:600;">📍 ${escapeHtml(t('ce.address_book'))}</label>
        <button class="btn ghost small" id="ceAddrAdd" type="button">${escapeHtml(t('ce.addr_add'))}</button>
      </div>
      <div id="ceAddressBookWrap"></div>
    </div>

    <div id="clientHistorySection" style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border-soft);">
    </div>

    <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border-soft);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <label style="margin:0; flex:1; font-size:12.5px; font-weight:600;">💬 ${escapeHtml(t('ce.comm_log'))}</label>
      </div>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <select id="ceCommType" style="min-width:90px; font-size:12px;">
          <option value="call">${escapeHtml(t('ce.comm_call'))}</option>
          <option value="email">${escapeHtml(t('ce.comm_email'))}</option>
          <option value="whatsapp">${escapeHtml(t('ce.comm_wa'))}</option>
          <option value="meeting">${escapeHtml(t('ce.comm_meeting'))}</option>
          <option value="note">${escapeHtml(t('ce.comm_note'))}</option>
        </select>
        <input type="text" id="ceCommNote" placeholder="${escapeHtml(t('ce.comm_note_ph'))}" style="flex:1; font-size:12px;">
        <button type="button" id="ceCommAdd" class="btn small primary">${escapeHtml(t('common.add'))}</button>
      </div>
      <div id="ceCommLogList" style="max-height:160px; overflow-y:auto;"></div>
    </div>
  `;

  openFormModal({
    title: existing ? t('ce.edit_title') : t('ce.new_title'),
    saveLabel: t('ce.save'),
    sizeLg: false,
    bodyHtml,
    onMount(modal) {
      modal.querySelectorAll('[data-f]').forEach(input => {
        input.addEventListener('input', () => { draft[input.dataset.f] = input.value; });
      });
      const recCb  = modal.querySelector('#recEnabled');
      const recDiv = modal.querySelector('#recFields');
      recCb.addEventListener('change', () => { recDiv.style.display = recCb.checked ? '' : 'none'; });
      modal.querySelector('#recInterval').addEventListener('change', e => { rec.interval = e.target.value; });
      modal.querySelector('#recNextDue').addEventListener('change', e => { rec.nextDue = e.target.value; });
      // Currency (Feature 1)
      const ceCurrEl = modal.querySelector('#ceCurrency');
      if (ceCurrEl) ceCurrEl.addEventListener('change', e => { draft.currency = e.target.value || null; });

      // Price list (Feature 4)
      const plWrap = modal.querySelector('#cePriceListWrap');
      function renderPriceList() {
        if (!plWrap) return;
        if (!draft.priceList || draft.priceList.length === 0) {
          plWrap.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;padding:4px 0;">${escapeHtml(t('ce.price_list_empty'))}</div>`;
          return;
        }
        plWrap.innerHTML = `<table class="price-list-table">
          <thead><tr>
            <th>${escapeHtml(t('ce.pl_product'))}</th>
            <th>${escapeHtml(t('ce.pl_price'))}</th>
            <th>${escapeHtml(t('ce.pl_note'))}</th>
            <th></th>
          </tr></thead>
          <tbody>
          ${draft.priceList.map((pl, i) => `<tr>
            <td><input type="text" class="pl-prod" data-pli="${i}" value="${escapeHtml(pl.product || '')}" placeholder="${escapeHtml(t('ce.pl_product'))}" style="width:100%;font-size:12px;"></td>
            <td><input type="number" class="pl-price" data-pli="${i}" value="${pl.price || ''}" min="0" step="0.01" style="width:90px;font-size:12px;"></td>
            <td><input type="text" class="pl-note" data-pli="${i}" value="${escapeHtml(pl.note || '')}" placeholder="${escapeHtml(t('ce.pl_note'))}" style="width:100%;font-size:12px;"></td>
            <td><button class="btn danger small pl-rm" data-pli="${i}" aria-label="${escapeHtml(t('common.delete'))}">×</button></td>
          </tr>`).join('')}
          </tbody></table>`;
        plWrap.querySelectorAll('.pl-prod').forEach(inp => { inp.addEventListener('input', () => { draft.priceList[+inp.dataset.pli].product = inp.value; }); });
        plWrap.querySelectorAll('.pl-price').forEach(inp => { inp.addEventListener('input', () => { draft.priceList[+inp.dataset.pli].price = Math.max(0, +inp.value || 0); }); });
        plWrap.querySelectorAll('.pl-note').forEach(inp => { inp.addEventListener('input', () => { draft.priceList[+inp.dataset.pli].note = inp.value; }); });
        plWrap.querySelectorAll('.pl-rm').forEach(btn => { btn.addEventListener('click', () => { draft.priceList.splice(+btn.dataset.pli, 1); renderPriceList(); }); });
      }
      renderPriceList();
      const cePlBtn = modal.querySelector('#cePlAdd');
      if (cePlBtn) cePlBtn.addEventListener('click', () => { draft.priceList.push({ product: '', price: 0, note: '' }); renderPriceList(); });

      // Address book (Feature 4)
      if (!draft.addresses) draft.addresses = [];
      const addrWrap = modal.querySelector('#ceAddressBookWrap');
      function renderAddressBook() {
        if (!addrWrap) return;
        if (!draft.addresses || draft.addresses.length === 0) {
          addrWrap.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;padding:4px 0;">${escapeHtml(t('ce.price_list_empty'))}</div>`;
          return;
        }
        addrWrap.innerHTML = `<table style="width:100%; border-collapse:collapse;">
          <thead><tr>
            <th style="font-size:11px; text-align:start; padding:2px 4px;">${escapeHtml(t('ce.addr_label'))}</th>
            <th style="font-size:11px; text-align:start; padding:2px 4px;">${escapeHtml(t('ce.addr_address'))}</th>
            <th></th>
          </tr></thead>
          <tbody>${draft.addresses.map((a, i) => `<tr>
            <td style="padding:2px 4px;"><input type="text" class="addr-label" data-ai="${i}" value="${escapeHtml(a.label || '')}" placeholder="${escapeHtml(t('ce.addr_label'))}" style="width:100%;font-size:12px;"></td>
            <td style="padding:2px 4px;"><input type="text" class="addr-addr" data-ai="${i}" value="${escapeHtml(a.address || '')}" placeholder="${escapeHtml(t('ce.addr_address'))}" style="width:100%;font-size:12px;"></td>
            <td><button class="btn danger small addr-rm" data-ai="${i}" aria-label="${escapeHtml(t('common.delete'))}">×</button></td>
          </tr>`).join('')}</tbody>
        </table>`;
        addrWrap.querySelectorAll('.addr-label').forEach(inp => { inp.addEventListener('input', () => { draft.addresses[+inp.dataset.ai].label = inp.value; }); });
        addrWrap.querySelectorAll('.addr-addr').forEach(inp => { inp.addEventListener('input', () => { draft.addresses[+inp.dataset.ai].address = inp.value; }); });
        addrWrap.querySelectorAll('.addr-rm').forEach(btn => { btn.addEventListener('click', () => { draft.addresses.splice(+btn.dataset.ai, 1); renderAddressBook(); }); });
      }
      renderAddressBook();
      const ceAddrAddBtn = modal.querySelector('#ceAddrAdd');
      if (ceAddrAddBtn) ceAddrAddBtn.addEventListener('click', () => { draft.addresses.push({ id: uid('ADDR'), label: '', address: '' }); renderAddressBook(); });

      // Communication log
      if (!draft.commLog) draft.commLog = [];
      const commListEl = modal.querySelector('#ceCommLogList');
      const COMM_ICONS = { call: '📞', email: '📧', whatsapp: '💬', meeting: '🤝', note: '📝' };
      function renderCommLog() {
        if (!commListEl) return;
        if (draft.commLog.length === 0) {
          commListEl.innerHTML = `<p style="color:var(--text-muted);font-size:12px;margin:4px 0;">${escapeHtml(t('ce.comm_empty'))}</p>`;
          return;
        }
        const sorted = [...draft.commLog].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
        commListEl.innerHTML = sorted.map((e, idx) => `
          <div style="display:flex;align-items:flex-start;gap:6px;padding:5px 0;border-bottom:1px solid var(--border-soft);font-size:12px;">
            <span>${COMM_ICONS[e.type] || '📝'}</span>
            <div style="flex:1;">
              <span style="font-weight:600;">${escapeHtml(t('ce.comm_' + (e.type || 'note')))}</span>
              <span style="color:var(--text-dim);font-size:11px;margin-inline-start:6px;">${escapeHtml((e.at || '').slice(0, 10))}</span>
              <div style="color:var(--text-muted);">${escapeHtml(e.note || '')}</div>
            </div>
            <button class="btn danger small comm-del" data-ci="${idx}" style="flex-shrink:0;">×</button>
          </div>`).join('');
        commListEl.querySelectorAll('.comm-del').forEach(btn => {
          btn.addEventListener('click', () => {
            // find by reverse index since we sorted
            const sorted2 = [...draft.commLog].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
            const toRemove = sorted2[+btn.dataset.ci];
            const idx2 = draft.commLog.indexOf(toRemove);
            if (idx2 >= 0) draft.commLog.splice(idx2, 1);
            renderCommLog();
          });
        });
      }
      renderCommLog();
      const commAddBtn = modal.querySelector('#ceCommAdd');
      if (commAddBtn) {
        commAddBtn.addEventListener('click', () => {
          const noteInput = modal.querySelector('#ceCommNote');
          const typeInput = modal.querySelector('#ceCommType');
          const noteVal = (noteInput?.value || '').trim();
          if (!noteVal) return;
          const newEntry = { id: uid('CMM'), type: typeInput?.value || 'note', note: noteVal, at: new Date().toISOString() };
          draft.commLog.push(newEntry);
          if (draft.commLog.length > 200) draft.commLog.length = 200;
          // Immediately persist to the real client record so it isn't lost if modal is closed via ×
          const liveClient = clients.find(c => c.id === draft.id);
          if (liveClient) {
            if (!liveClient.commLog) liveClient.commLog = [];
            liveClient.commLog.push(newEntry);
            if (liveClient.commLog.length > 200) liveClient.commLog.length = 200;
            saveAll();
          }
          if (noteInput) noteInput.value = '';
          renderCommLog();
        });
      }

      // Order history
      const histEl = modal.querySelector('#clientHistorySection');
      if (clientId && histEl) {
        const clientOrders = printLog
          .filter(o => o.clientId === clientId)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (clientOrders.length === 0) {
          histEl.innerHTML = `<p style="font-size:12.5px; color:var(--text-muted);">${escapeHtml(t('ce.no_history'))}</p>`;
        } else {
          histEl.innerHTML = `
            <h4 style="font-size:11.5px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.07em; margin:0 0 10px;">${escapeHtml(t('ce.history_title'))} (${clientOrders.length})</h4>
            <div class="client-history">
              ${clientOrders.slice(0, 30).map(o => `
                <div class="ch-row">
                  <span class="ch-date">${escapeHtml(o.date)}</span>
                  <span class="ch-name">${escapeHtml(o.project)}</span>
                  <span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span>
                  <span class="ch-price">${fmtPrice(o.price)}</span>
                </div>`).join('')}
            </div>
            ${clientOrders.length > 30 ? `<p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0;">+${clientOrders.length - 30} more — see Orders log</p>` : ''}`;
        }
      }
    },
    async onSave(modal) {
      if (!draft.nameEn.trim() && !draft.nameAr.trim()) {
        toast(t('ce.need_name'), 'error');
        return false;
      }
      draft.defaultDiscount = Math.min(100, Math.max(0, num(draft.defaultDiscount, 0)));
      draft.recurring = {
        enabled:  modal.querySelector('#recEnabled').checked,
        interval: modal.querySelector('#recInterval').value,
        nextDue:  modal.querySelector('#recNextDue').value || null,
      };
      draft.currency = modal.querySelector('#ceCurrency')?.value || null;
      draft.creditLimit = Math.max(0, num(modal.querySelector('#ceCreditLimit')?.value, 0)) || 0;
      draft.source = modal.querySelector('[data-f="source"]')?.value || 'other';
      draft.priceList = (draft.priceList || []).filter(pl => pl.product.trim() || pl.price > 0);
      draft.addresses = (draft.addresses || []).filter(a => a.label.trim() || a.address.trim());
      const idx = clients.findIndex(c => c.id === draft.id);
      if (idx >= 0) clients[idx] = draft;
      else clients.push(draft);
      saveAll();
      renderClients();
      toast(t('ce.saved'), 'success');
      return true;
    }
  });
}

/* ============================================================
   Recurring orders — auto-create on boot when overdue
   ============================================================ */
function checkRecurringOrders() {
  const today = new Date().toISOString().split('T')[0];
  const INTERVAL_DAYS = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 };
  let created = 0;

  clients.forEach(client => {
    const rec = client.recurring;
    if (!rec?.enabled || !rec.nextDue || rec.nextDue > today) return;

    // Use most recent completed order for this client as a template
    const template = printLog.find(o => o.clientId === client.id && o.status === 'completed');
    if (!template) return;

    // Check if an order was already created for this cycle — prevents duplicates
    // when patchRecurringOrdersWithLeadDays also runs on boot
    // Must happen BEFORE consuming the invoice number to avoid wasting sequence numbers
    const alreadyCreated = printLog.some(o =>
      o.clientId === client.id && o.recurringCycle === rec.nextDue);
    if (alreadyCreated) return;

    const now = new Date();
    const invoiceNum = nextInvoiceNumber();
    const seq = String(settings.invNumNext - 1).padStart(4, '0');
    const id = `${settings.invPrefix || 'INV'}-${now.getFullYear()}-${seq}`;

    printLog.unshift({
      ...template,
      parts: template.parts ? template.parts.map(p => ({ ...p })) : [],
      id,
      invoiceNum,
      invoiceNumber: invoiceNum,
      date: today,
      timestamp: now.toISOString(),
      status: 'pending',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      paymentMethod: null,
      paidAt: null,
      printPhotos: [],
      notes: '',
      dueDate: null,
      priority: false,
      materialDeducted: false,
      actualPrintTime: null,
      actualWeight: null,
      quoteSentAt: null,
      quoteExpiresAt: null,
      quoteAcceptedAt: null,
      deliveredAt: null,
      attachedFiles: [],
      recurringCycle: rec.nextDue,
    });
    created++;

    const days = INTERVAL_DAYS[rec.interval] || 30;
    const next = new Date(rec.nextDue + 'T00:00:00');
    next.setDate(next.getDate() + days);
    rec.nextDue = next.toISOString().split('T')[0];
  });

  if (created > 0) {
    saveAll();
    renderKanban(); renderLogs(); renderDashboard();
    toast(t('rec.created', { n: created }), 'success', 4500);
  }
}

/* ----- Client autocomplete on the calculator ----- */
function renderClientSuggestions() {
  const input = $('#clientInput');
  const list  = $('#clientSuggestions');
  const term  = input.value.toLowerCase().trim();
  let matches = clients;
  if (term) {
    matches = clients.filter(c =>
      (c.nameEn || '').toLowerCase().includes(term) ||
      (c.nameAr || '').toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term)
    );
  }
  matches = matches.slice(0, 6);

  const items = matches.map(c => {
    const dn = localName(c);
    const stats = getClientStats(c.id);
    return `<div class="suggest-item" data-cid="${c.id}">
      <span class="avatar">${escapeHtml(initials(dn))}</span>
      <span>${escapeHtml(dn)}</span>
      ${stats.count > 0 ? `<span class="meta">${stats.count} · ${fmtPrice(stats.revenue)}</span>` : ''}
    </div>`;
  }).join('');

  const newRow = (term && !clients.some(c => (c.nameEn || c.nameAr || '').toLowerCase() === term))
    ? `<div class="suggest-item new" data-act="cl-new" data-name="${escapeHtml(input.value)}">+ ${escapeHtml(t('calc.quote.client_save_new'))}: “${escapeHtml(input.value)}”</div>`
    : '';

  if (!items && !newRow) { list.style.display = 'none'; return; }
  list.innerHTML = items + newRow;
  list.style.display = 'block';
}

function hideClientSuggestions() {
  setTimeout(() => { $('#clientSuggestions').style.display = 'none'; }, 150);
}

function getClientTier(clientId) {
  if (!settings.loyaltyEnabled) return null;
  const tiers = (settings.loyaltyTiers || []).filter(tier => tier.name);
  if (tiers.length === 0) return null;

  let completedCount = 0;
  let totalSpend = 0;
  for (const o of printLog) {
    if (o.clientId !== clientId || o.status !== 'completed') continue;
    completedCount++;
    totalSpend += orderRevenueBase(o);
  }

  // Find the highest tier the client qualifies for
  const eligible = tiers.filter(tier =>
    (!tier.minOrders || completedCount >= +tier.minOrders) &&
    (!tier.minSpend  || totalSpend     >= +tier.minSpend)
  );
  if (eligible.length === 0) return null;
  // Return the tier with the highest benefit (largest minOrders/minSpend combo)
  return eligible.sort((a, b) => {
    const orderDiff = (+b.minOrders || 0) - (+a.minOrders || 0);
    if (orderDiff !== 0) return orderDiff;
    return (+b.minSpend || 0) - (+a.minSpend || 0);
  })[0];
}

function patchRecurringOrdersWithLeadDays() {
  // Wrap the existing checkRecurringOrders to also respect leadDays
  // This runs at startup after loadAll() to check for orders due within leadDays
  const today = new Date().toISOString().split('T')[0];
  const INTERVAL_DAYS = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 };
  let created = 0;

  clients.forEach(client => {
    const rec = client.recurring;
    if (!rec?.enabled || !rec.nextDue) return;
    const leadDays = rec.leadDays || 0;
    const triggerDate = new Date(rec.nextDue + 'T00:00:00');
    triggerDate.setDate(triggerDate.getDate() - leadDays);
    const triggerStr = triggerDate.toISOString().split('T')[0];
    if (triggerStr > today) return;

    // Check if an order was already created for this cycle (any status — prevents duplicate on re-completion)
    const alreadyCreated = printLog.some(o =>
      o.clientId === client.id && o.recurringCycle === rec.nextDue);
    if (alreadyCreated) return;

    // Find template: use specific templateOrderId or last completed order
    const template = rec.templateOrderId
      ? printLog.find(o => o.id === rec.templateOrderId)
      : printLog.find(o => o.clientId === client.id && o.status === 'completed');
    if (!template) return;

    const now = new Date();
    const invoiceNum = nextInvoiceNumber();
    const seq = String(settings.invNumNext - 1).padStart(4, '0');
    const id = `${settings.invPrefix || 'INV'}-${now.getFullYear()}-${seq}`;
    printLog.unshift({
      ...template,
      parts: template.parts ? template.parts.map(p => ({ ...p })) : [],
      id,
      invoiceNum,
      invoiceNumber: invoiceNum,
      date: today,
      timestamp: now.toISOString(),
      status: rec.cloneStatus || 'pending',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      paymentMethod: null,
      paidAt: null,
      printPhotos: [],
      notes: '',
      dueDate: rec.nextDue,
      priority: false,
      materialDeducted: false,
      actualPrintTime: null,
      actualWeight: null,
      quoteSentAt: null,
      quoteExpiresAt: null,
      quoteAcceptedAt: null,
      deliveredAt: null,
      attachedFiles: [],
      comments: [],
      recurringCycle: rec.nextDue,
    });
    created++;

    const days = INTERVAL_DAYS[rec.interval] || 30;
    const next = new Date(rec.nextDue + 'T00:00:00');
    next.setDate(next.getDate() + days);
    rec.nextDue = next.toISOString().split('T')[0];
  });

  if (created > 0) {
    saveAll(); renderKanban(); renderLogs(); renderDashboard();
    toast(t('rec.created', { n: created }), 'success', 4500);
  }
}

function exportClientsCsv() {
  // Build stats map (same as renderClients uses)
  const clientStatsMap = new Map();
  for (const o of printLog) {
    if (!o.clientId) continue;
    let s = clientStatsMap.get(o.clientId);
    if (!s) { s = { count: 0, revenue: 0, lastDate: null }; clientStatsMap.set(o.clientId, s); }
    s.count++;
    if (o.status === 'completed') s.revenue += orderRevenueBase(o);
    if (!s.lastDate || o.date > s.lastDate) s.lastDate = o.date;
  }

  const headers = [
    'ID', 'Name (EN)', 'Name (AR)', 'Phone', 'Email',
    'Source', 'Total Orders', `Revenue (${currencySymbol()})`,
    `Outstanding (${currencySymbol()})`, 'Last Order'
  ];

  const lines = [
    headers.map(csvEsc).join(','),
    ...clients.map(c => {
      const stats = clientStatsMap.get(c.id) || { count: 0, revenue: 0, lastDate: null };
      const outstanding = clientOutstandingBalance(c.id);
      return [
        c.id,
        c.nameEn || '',
        c.nameAr || '',
        c.phone  || '',
        c.email  || '',
        c.source || '',
        stats.count,
        stats.revenue.toFixed(2),
        outstanding.toFixed(2),
        stats.lastDate || ''
      ].map(csvEsc).join(',');
    })
  ];

  downloadBlob(
    new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    `clients-${new Date().toISOString().slice(0, 10)}.csv`
  );
}

function exportClientPortal(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  const displayName = localName(c);
  const orders = printLog.filter(o => o.clientId === clientId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const activeOrders = orders.filter(o => !['completed','quote'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'completed');
  const outstanding = orders
    .filter(o => payStatus(o) !== 'paid')
    .reduce((s, o) => s + orderOwedBase(o), 0);

  const statusColors = {
    pending: '#f59e0b', printing: '#3b82f6', post: '#8b5cf6',
    qc: '#a78bfa', completed: '#22c55e', on_hold: '#f97316', quote: '#94a3b8'
  };
  const statusSteps = ['pending','printing','post','qc','completed'];

  const stepperHtml = (order) => {
    const si = statusSteps.indexOf(order.status);
    return `<div style="display:flex;gap:4px;align-items:center;margin-top:6px;font-size:10px;">
      ${statusSteps.map((st, i) => {
        const done = i < si;
        const cur  = i === si;
        const col  = cur ? (statusColors[st] || '#94a3b8') : (done ? '#22c55e' : '#374151');
        return `<span style="background:${col};color:#fff;padding:2px 7px;border-radius:4px;opacity:${cur?1:done?0.7:0.35};">${escapeHtml(st)}</span>${i < statusSteps.length-1 ? `<span style="color:#555;font-size:9px;">›</span>` : ''}`;
      }).join('')}
    </div>`;
  };

  const bizName = (settings.bizEn || settings.bizAr || 'Khayt');
  const portalIsAr = i18n.current === 'ar';
  const portalLang = portalIsAr ? 'ar' : 'en';
  const PL = {
    activeOrders:      portalIsAr ? 'طلبات نشطة'   : 'Active orders',
    completed:         portalIsAr ? 'مكتملة'        : 'Completed',
    outstandingBal:    portalIsAr ? 'الرصيد المستحق': 'Outstanding balance',
    date:              portalIsAr ? 'التاريخ'       : 'Date',
    project:           portalIsAr ? 'المشروع'       : 'Project',
    status:            portalIsAr ? 'الحالة'        : 'Status',
    amount:            portalIsAr ? 'المبلغ'        : 'Amount',
    payment:           portalIsAr ? 'الدفع'         : 'Payment',
    paid:              portalIsAr ? '✓ مدفوع'      : '✓ Paid',
    outstanding:       portalIsAr ? 'مستحق'         : 'Outstanding',
    paymentInfo:       portalIsAr ? 'معلومات الدفع' : 'Payment Information',
    orderPortal:       portalIsAr ? 'بوابة الطلبات' : 'Order portal for',
    generatedBy:       portalIsAr ? 'أُنشئ بواسطة Khayt' : 'Generated by Khayt',
  };
  const rowsHtml = orders.map(o => {
    const isPaid = payStatus(o) === 'paid';
    return `<tr style="border-bottom:1px solid #2a2a2a;">
      <td style="padding:8px;font-size:12px;white-space:nowrap;color:#888;">${escapeHtml(o.date || '')}</td>
      <td style="padding:8px;font-size:12px;"><strong style="color:#e2e8f0;">${escapeHtml(o.project || o.id)}</strong><div style="font-size:10px;color:#666;">${escapeHtml(o.id)}</div>
        ${!['completed','quote'].includes(o.status) ? stepperHtml(o) : ''}
      </td>
      <td style="padding:8px;"><span style="background:${statusColors[o.status]||'#555'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">${escapeHtml(o.status)}</span></td>
      <td style="padding:8px;text-align:right;font-weight:600;color:#4ade80;">${fmtPrice(o.price)}</td>
      <td style="padding:8px;text-align:center;font-size:11px;color:${isPaid?'#4ade80':'#f87171'};">${isPaid ? PL.paid : PL.outstanding}</td>
    </tr>`;
  }).join('');

  const paymentBlock = settings.paymentInstructions
    ? `<div style="margin-top:24px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #2a2a3e;">
        <h3 style="margin:0 0 8px;color:#94a3b8;font-size:13px;">${escapeHtml(PL.paymentInfo)}</h3>
        <p style="margin:0;color:#cbd5e1;font-size:13px;white-space:pre-line;">${escapeHtml(settings.paymentInstructions)}</p>
      </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="${portalLang}" dir="${portalIsAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(displayName)} — Client Portal — ${escapeHtml(bizName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0f0f0f; color:#e2e8f0; margin:0; padding:20px; }
    .header { background:linear-gradient(135deg,#1e1e3f,#2d2d5a); padding:24px 28px; border-radius:12px; margin-bottom:20px; }
    h1 { margin:0 0 4px; font-size:1.4rem; color:#a78bfa; }
    .subtitle { color:#94a3b8; font-size:13px; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:20px; }
    .stat-card { background:#1a1a2e; border:1px solid #2a2a3e; border-radius:8px; padding:14px 16px; }
    .stat-val { font-size:1.5rem; font-weight:700; color:#a78bfa; }
    .stat-lbl { font-size:11px; color:#64748b; margin-top:2px; }
    table { width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden; }
    th { padding:10px 8px; text-align:left; font-size:11px; color:#64748b; border-bottom:1px solid #2a2a2a; }
    @media(max-width:600px){ td,th { padding:6px 4px; font-size:11px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(bizName)}</h1>
    <div class="subtitle">${escapeHtml(PL.orderPortal)} ${escapeHtml(displayName)}</div>
  </div>
  <div class="stats">
    <div class="stat-card"><div class="stat-val">${activeOrders.length}</div><div class="stat-lbl">${escapeHtml(PL.activeOrders)}</div></div>
    <div class="stat-card"><div class="stat-val">${completedOrders.length}</div><div class="stat-lbl">${escapeHtml(PL.completed)}</div></div>
    <div class="stat-card"><div class="stat-val">${fmtPrice(outstanding)}</div><div class="stat-lbl">${escapeHtml(PL.outstandingBal)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>${escapeHtml(PL.date)}</th><th>${escapeHtml(PL.project)}</th><th>${escapeHtml(PL.status)}</th><th style="text-align:right;">${escapeHtml(PL.amount)}</th><th style="text-align:center;">${escapeHtml(PL.payment)}</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${paymentBlock}
  <p style="text-align:center;color:#374151;font-size:11px;margin-top:24px;">${escapeHtml(PL.generatedBy)} · ${new Date().toISOString().split('T')[0]}</p>
</body>
</html>`;

  if (window.hubAPI?.saveHtml) {
    window.hubAPI.saveHtml(html, `client-portal-${c.id}.html`).then(() => {
      toast(t('cl.portal_saved'), 'success');
    }).catch(() => {
      toast(t('cl.portal_save_failed'), 'error');
    });
  } else {
    const blob = new Blob([html], { type: 'text/html' });
    downloadBlob(blob, `client-portal-${c.id}.html`);
    toast(t('cl.portal_saved'), 'info');
  }
}
  const api = {
    getClientStats,
    renderClients,
    quoteForClient,
    generateIntakeForm,
    openClientHistory,
    openClientEditor,
    deleteClient,
    checkRecurringOrders,
    renderClientSuggestions,
    hideClientSuggestions,
    getClientTier,
    patchRecurringOrdersWithLeadDays,
    exportClientsCsv,
    exportClientPortal,
  };
  if (typeof global.importClientsCsv === 'function') api.importClientsCsv = global.importClientsCsv;
  Object.assign(global, api);
  global.KhaytClients = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
