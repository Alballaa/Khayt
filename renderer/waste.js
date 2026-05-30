/**
 * Waste log (failed prints and wasted filament).
 */
let wasteSearchTerm = '';
let wasteMaterialFilter = '';
let wasteFailureFilter = '';
let wasteDateFilter = 'all';

(function (global) {
/* ============================================================
   Waste Log (failed prints & wasted filament)
   ============================================================ */
const WASTE_FAILURE_TYPES = ['bed_adhesion','nozzle_jam','warping','stringing','operator_error','design_issue','power_failure','material_quality','other'];

function renderWasteLog() {
  const tbody = document.querySelector('#wasteTable tbody');
  if (!tbody) return;

  const wasteFiltered = wasteLog.filter(w => {
    if (wasteMaterialFilter && w.material !== wasteMaterialFilter) return false;
    if (wasteFailureFilter && w.failureType !== wasteFailureFilter) return false;
    if (wasteSearchTerm) {
      const hay = [w.material || '', w.reason || '', w.failureType || ''].join(' ').toLowerCase();
      if (!hay.includes(wasteSearchTerm.toLowerCase())) return false;
    }
    if (wasteDateFilter !== 'all') {
      if (!inRange(w.date, wasteDateFilter, 'waste')) return false;
    }
    return true;
  });
  const sorted = [...wasteFiltered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const totalWasteCost = wasteLog.reduce((s, w) => s + (+w.cost || 0), 0);
  const totalWasteGrams = wasteLog.reduce((s, w) => s + (+w.weight || 0), 0);

  // Failure type breakdown
  const ftCounts = {};
  wasteLog.forEach(w => { const ft = w.failureType || 'other'; ftCounts[ft] = (ftCounts[ft] || 0) + 1; });

  const statEl = $('#wasteStats');
  // QW9: Populate waste filter dropdowns
  const wasteMaterialSel = $('#wasteMaterialFilter');
  if (wasteMaterialSel) {
    const mats = [...new Set(wasteLog.map(w => w.material).filter(Boolean))].sort();
    wasteMaterialSel.innerHTML = `<option value="">${escapeHtml(t('common.all') || 'All materials')}</option>` +
      mats.map(m => `<option value="${escapeHtml(m)}"${m === wasteMaterialFilter ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('');
  }
  const wasteFailureSel = $('#wasteFailureFilter');
  if (wasteFailureSel) {
    wasteFailureSel.innerHTML = `<option value="">${escapeHtml(t('common.all') || 'All failure types')}</option>` +
      WASTE_FAILURE_TYPES.map(ft => `<option value="${escapeHtml(ft)}"${ft === wasteFailureFilter ? ' selected' : ''}>${escapeHtml(t('waste.ft.' + ft))}</option>`).join('');
  }
  if (statEl) {
    const completedRevenue = printLog.filter(o => o.status === 'completed').reduce((s, o) => s + orderRevenueBase(o), 0);
    const wastePct = completedRevenue > 0 ? (totalWasteCost / completedRevenue * 100) : null;
    const maxFt = Object.values(ftCounts).reduce((a, b) => Math.max(a, b), 1);
    const ftBars = WASTE_FAILURE_TYPES.filter(ft => ftCounts[ft] > 0).sort((a, b) => (ftCounts[b] || 0) - (ftCounts[a] || 0)).map(ft => {
      const pct = ((ftCounts[ft] || 0) / maxFt * 100).toFixed(1);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px;">
        <span style="width:130px;color:var(--text-muted);text-align:end;">${escapeHtml(t('waste.ft.' + ft))}</span>
        <div style="flex:1;background:rgba(255,255,255,0.08);border-radius:3px;height:8px;"><div style="background:var(--danger);width:${pct}%;height:100%;border-radius:3px;opacity:0.75;"></div></div>
        <span style="width:24px;text-align:start;">${ftCounts[ft]}</span>
      </div>`;
    }).join('');
    const wastePctHtml = wastePct !== null
      ? `<span>${escapeHtml(t('waste.pct_revenue'))}: <strong style="color:${wastePct > 5 ? 'var(--danger)' : wastePct > 2 ? 'var(--warning)' : 'var(--success)'};">${wastePct.toFixed(1)}%</strong></span>`
      : '';
    statEl.innerHTML = `
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:${ftBars ? '12px' : '0'};">
        <span>${escapeHtml(t('waste.total_entries'))}: <strong>${wasteLog.length}</strong></span>
        <span>${escapeHtml(t('waste.total_weight'))}: <strong>${totalWasteGrams.toFixed(0)}g</strong></span>
        <span>${escapeHtml(t('waste.total_cost'))}: <strong>${fmtPrice(totalWasteCost)}</strong></span>
        ${wastePctHtml}
      </div>
      ${ftBars ? `<div style="margin-top:8px;"><div style="font-size:11.5px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">${escapeHtml(t('waste.failure_breakdown'))}</div>${ftBars}</div>` : ''}
    `;
  }

  // Top orders by waste cost
  const topWasteOrdersEl = $('#wasteTopOrdersSection');
  if (topWasteOrdersEl) {
    const orderWaste = {};
    for (const w of wasteLog) {
      if (!w.orderId) continue;
      if (!orderWaste[w.orderId]) orderWaste[w.orderId] = 0;
      orderWaste[w.orderId] += (+w.cost || 0);
    }
    const topOrders = Object.entries(orderWaste)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (topOrders.length === 0) {
      topWasteOrdersEl.innerHTML = '';
    } else {
      const order_rows = topOrders.map(([oid, cost]) => {
        const ord = printLog.find(o => o.id === oid);
        return `<tr>
          <td style="font-size:12px; color:var(--text-dim);">${escapeHtml(oid)}</td>
          <td>${escapeHtml(ord ? (ord.project || '') : '—')}</td>
          <td style="color:var(--danger); font-variant-numeric:tabular-nums; text-align:right;">${fmtPrice(cost)}</td>
        </tr>`;
      }).join('');
      topWasteOrdersEl.innerHTML = `
        <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-soft);">
          <label style="margin-top:0; font-size:12px; font-weight:600; color:var(--text-muted);">${escapeHtml(t('waste.top_orders'))}</label>
          <div class="table-wrap" style="margin-top:6px;"><table style="width:100%;">
            <thead><tr>
              <th>${escapeHtml(t('log.filter_status'))}</th>
              <th>${escapeHtml(t('log.client'))}</th>
              <th style="text-align:right;">${escapeHtml(t('waste.est_cost'))}</th>
            </tr></thead>
            <tbody>${order_rows}</tbody>
          </table></div>
        </div>`;
    }
  }

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">${escapeHtml(t('waste.empty'))} <button class="btn small primary" id="btnLogWasteEmpty" style="margin-inline-start:12px;">${escapeHtml(t('waste.add') || 'Log Failed Print')}</button></td></tr>`;
    // Wire up the CTA
    document.querySelector('#btnLogWasteEmpty')?.addEventListener('click', () => document.querySelector('#btnLogWaste')?.click());
    return;
  }

  tbody.innerHTML = sorted.map(w => {
    const ftLabel = w.failureType ? `<span class="waste-ft-badge">${escapeHtml(t('waste.ft.' + w.failureType))}</span>` : '';
    return `
    <tr>
      <td>${escapeHtml(w.date || '')}</td>
      <td>${escapeHtml(w.material || '—')}</td>
      <td style="text-align:center;">${escapeHtml(String(w.weight || 0))}g</td>
      <td>${ftLabel}</td>
      <td>${escapeHtml(w.reason || '—')}</td>
      <td style="text-align:right; font-variant-numeric:tabular-nums;">${fmtPrice(+w.cost || 0)}</td>
      <td style="text-align:center;">
        <button class="btn danger small" data-act="del-waste" data-id="${escapeHtml(w.id)}">${escapeHtml(t('common.delete'))}</button>
      </td>
    </tr>`;
  }).join('');
}

function openWasteForm() {
  const today = new Date().toISOString().split('T')[0];
  const invOptions = inventory.map(f =>
    `<option value="${escapeHtml(f.material)}">${escapeHtml(f.material)}</option>`
  ).join('');
  const failureOptions = WASTE_FAILURE_TYPES.map(ft =>
    `<option value="${ft}">${escapeHtml(t('waste.ft.' + ft))}</option>`
  ).join('');
  const recentOrderOptions = printLog.slice(0, 60).map(o =>
    `<option value="${escapeHtml(o.id)}">${escapeHtml(o.id)} — ${escapeHtml(o.project || '')}</option>`
  ).join('');

  openFormModal({
    title: t('waste.add'),
    saveLabel: t('waste.log_btn'),
    bodyHtml: `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('waste.date'))}</label>
          <input type="date" id="wf_date" value="${today}" max="${today}">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('waste.material'))}</label>
          <select id="wf_material">${invOptions || '<option value="">—</option>'}</select>
        </div>
      </div>
      <label style="margin-top:12px;">${escapeHtml(t('waste.failure_type'))}</label>
      <select id="wf_failure_type">${failureOptions}</select>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('waste.weight'))} (g)</label>
          <input type="number" id="wf_weight" value="0" min="0" step="1">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('waste.est_cost'))} (${currencySymbol()})</label>
          <input type="number" id="wf_cost" value="0" min="0" step="0.01">
        </div>
      </div>
      <label style="margin-top:12px;">${escapeHtml(t('waste.reason'))}</label>
      <input type="text" id="wf_reason" placeholder="${escapeHtml(t('waste.reason_ph'))}">
      <label style="margin-top:12px;">${escapeHtml(t('waste.order_ref'))}</label>
      <input type="text" id="wf_order_ref" list="wasteOrderList" placeholder="${escapeHtml(t('waste.order_ref'))}">
      <datalist id="wasteOrderList">${recentOrderOptions}</datalist>
      <label style="margin-top:12px;">${escapeHtml(t('waste.notes'))}</label>
      <textarea id="wf_notes" rows="2" style="resize:vertical;"></textarea>
      <label style="margin-top:12px;">${escapeHtml(t('waste.printer') || 'Printer / Machine')}</label>
      <select id="wf_machine">
        <option value="">${escapeHtml(t('mach.unassigned') || '— Unassigned —')}</option>
        ${machines.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join('')}
      </select>
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:14px;">
        <input type="checkbox" id="wf_deduct" checked style="width:auto; margin:0;">
        <span>${escapeHtml(t('waste.deduct_inv'))}</span>
      </label>
    `,
    onMount(modal) {
      // Auto-calculate cost when material or weight changes
      const autoCalcCost = () => {
        const mat = modal.querySelector('#wf_material')?.value;
        const wt  = Math.max(0, +modal.querySelector('#wf_weight')?.value || 0);
        if (!mat || wt <= 0) return;
        const invItem = inventory.find(i => i.material === mat);
        if (invItem && invItem.cost > 0 && invItem.weight > 0) {
          const costPerGram = invItem.cost / invItem.weight;
          const costEl = modal.querySelector('#wf_cost');
          if (costEl) costEl.value = (wt * costPerGram).toFixed(2);
        }
      };
      modal.querySelector('#wf_material')?.addEventListener('change', autoCalcCost);
      modal.querySelector('#wf_weight')?.addEventListener('input', autoCalcCost);
    },
    onSave() {
      const material    = $('#wf_material').value.trim();
      const failureType = $('#wf_failure_type').value;
      const weight      = Math.max(0, +$('#wf_weight').value || 0);
      const cost        = Math.max(0, +$('#wf_cost').value || 0);
      const reason      = $('#wf_reason').value.trim();
      const notes       = $('#wf_notes').value.trim();
      const deduct      = $('#wf_deduct').checked;
      const date        = $('#wf_date').value || today;
      const orderRef    = ($('#wf_order_ref').value || '').trim() || null;
      const machineId   = ($('#wf_machine')?.value || '').trim() || null;

      if (!material) { toast(t('waste.err_material'), 'error'); return false; }

      const entry = {
        id: 'w-' + Date.now().toString(36),
        date,
        material,
        failureType,
        weight,
        cost,
        reason,
        notes,
        orderId: orderRef,
        machineId,
      };
      wasteLog.unshift(entry);

      // Auto-deduct from matching inventory spool
      if (deduct && weight > 0) {
        const spool = inventory.find(f => f.material === material);
        if (spool) {
          spool.weight = Math.max(0, (+spool.weight || 0) - weight);
        }
      }

      saveAll();
      renderWasteLog();
      if (document.querySelector('#inventory-tab.active')) renderInventory();
      toast(t('waste.saved'), 'success');
    }
  });
}

function openLogWasteFromCard(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  // Pre-fill material from first part with material data
  const firstPart = (order.parts || []).find(p => p.material);
  const defaultMaterial = firstPart?.material || order.material || '';
  const invOptions = inventory.map(f =>
    `<option value="${escapeHtml(f.material)}"${f.material === defaultMaterial ? ' selected' : ''}>${escapeHtml(f.material)}</option>`
  ).join('');
  const failureOptions = WASTE_FAILURE_TYPES.map(ft =>
    `<option value="${ft}">${escapeHtml(t('waste.ft.' + ft))}</option>`
  ).join('');

  openFormModal({
    title: t('waste.log_from_card'),
    saveLabel: t('waste.log_btn'),
    sizeLg: false,
    bodyHtml: `
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px;">${escapeHtml(order.id)} — ${escapeHtml(order.project || '')}</p>
      <label>${escapeHtml(t('waste.material'))}</label>
      <select id="wfc_material">${invOptions || `<option value="">${escapeHtml(defaultMaterial)}</option>`}</select>
      <label style="margin-top:12px;">${escapeHtml(t('waste.weight_g'))}</label>
      <input type="number" id="wfc_weight" value="0" min="0" step="1">
      <label style="margin-top:12px;">${escapeHtml(t('waste.failure_type'))}</label>
      <select id="wfc_failure_type">${failureOptions}</select>
      <label style="margin-top:12px;">${escapeHtml(t('waste.notes'))}</label>
      <textarea id="wfc_notes" rows="2" style="resize:vertical;"></textarea>
    `,
    onSave() {
      const material    = $('#wfc_material').value.trim();
      const weight      = Math.max(0, +$('#wfc_weight').value || 0);
      const failureType = $('#wfc_failure_type').value;
      const notes       = $('#wfc_notes').value.trim();
      if (!material) { toast(t('waste.err_material'), 'error'); return false; }
      // Compute cost per gram from inventory
      const invItem = inventory.find(i => i.material === material);
      const costPerGram = (invItem && invItem.cost > 0 && invItem.weight > 0)
        ? invItem.cost / invItem.weight : 0;
      const entry = {
        id: uid('W'),
        date: localDateStr(),
        orderId: order.id,
        material,
        weight,
        failureType,
        notes,
        cost: +(weight * costPerGram).toFixed(2),
      };
      wasteLog.unshift(entry);
      saveAll();
      renderWasteLog();
      toast(t('waste.saved'), 'success');
      return true;
    }
  });
}

async function deleteWasteEntry(id) {
  const ok = await confirmModal(t('common.delete') + '?', { danger: true });
  if (!ok) return;
  const idx = wasteLog.findIndex(w => w.id === id);
  if (idx < 0) return;
  const entry = wasteLog[idx];
  wasteLog.splice(idx, 1);
  // Restore filament weight if the waste entry tracked a spool
  if (entry.spoolId && entry.weight > 0) {
    const spool = inventory.find(i => i.id === entry.spoolId);
    if (spool) spool.weight = (spool.weight || 0) + entry.weight;
  }
  saveAll();
  renderWasteLog();
  renderInventory();
  toast(t('waste.deleted'), 'success');
}
  const api = {
    renderWasteLog,
    openWasteForm,
    openLogWasteFromCard,
    deleteWasteEntry,
  };
  Object.assign(global, api);
  global.KhaytWaste = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
