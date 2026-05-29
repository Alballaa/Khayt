/* Khayt Studio — UI layer (filters, layout, CRM grid, inventory stats) */
(function () {
  const PREF = 'khayt_studio_';

  function isStudio() {
    return document.body.classList.contains('khayt-studio');
  }

  function prefGet(key, fallback) {
    try {
      const v = localStorage.getItem(PREF + key);
      return v != null && v !== '' ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function prefSet(key, value) {
    try {
      localStorage.setItem(PREF + key, value == null ? '' : String(value));
    } catch { /* ignore */ }
  }

  let studioQueueFilter = prefGet('queue_filter', 'all');
  let studioQueueMachineId = prefGet('queue_machine', '');
  let studioClientFilter = prefGet('client_filter', 'all');

  function clientAccentColor(clientId, color) {
    if (color) return safeCssColor(color, 'var(--accent)');
    let h = 0;
    const id = String(clientId || '');
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return `hsl(${hue} 52% 58%)`;
  }

  function machineIsResin(m) {
    if (!m) return false;
    const t = String(m.type || m.materialType || '').toLowerCase();
    return t.includes('resin') || t === 'sla' || t === 'msla';
  }

  function orderUsesResin(log) {
    if (log.isResin) return true;
    if (String(log.material || '').toLowerCase().includes('resin')) return true;
    for (const p of (log.parts || [])) {
      if (p.filamentId) {
        const inv = inventory.find(i => i.id === p.filamentId);
        if (inv?.materialType === 'resin') return true;
      }
      if (String(p.material || '').toLowerCase().includes('resin')) return true;
    }
    if (log.machineId) {
      const m = machines.find(x => x.id === log.machineId);
      if (machineIsResin(m)) return true;
    }
    return false;
  }

  function orderMatchesStudioQueueFilter(log) {
    const f = studioQueueFilter || 'all';
    if (f === 'all') return true;
    if (f === 'fdm') return !orderUsesResin(log);
    if (f === 'resin') return orderUsesResin(log);
    if (f === 'machine') {
      if (studioQueueMachineId) return log.machineId === studioQueueMachineId;
      return !!log.machineId;
    }
    return true;
  }

  function syncQueueMachinePicker() {
    const wrap = $('#studioQueueMachineWrap');
    const sel = $('#studioQueueMachine');
    if (!wrap || !sel) return;
    const show = studioQueueFilter === 'machine';
    wrap.style.display = show ? '' : 'none';
    wrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) return;
    const prev = studioQueueMachineId;
    sel.innerHTML =
      `<option value="">${escapeHtml(t('queue.filter_machine_all') || 'All assigned printers')}</option>` +
      machines.map(m =>
        `<option value="${escapeHtml(m.id)}"${m.id === prev ? ' selected' : ''}>${escapeHtml(m.name)}</option>`
      ).join('');
  }

  function wireStudioQueueFilters() {
    const seg = $('#studioQueueSeg');
    if (!seg || seg.dataset.wired === '1') return;
    seg.dataset.wired = '1';
    seg.querySelectorAll('[data-queue-filter]').forEach(btn => {
      const f = btn.dataset.queueFilter || 'all';
      btn.classList.toggle('on', f === studioQueueFilter);
      btn.addEventListener('click', () => {
        studioQueueFilter = btn.dataset.queueFilter || 'all';
        prefSet('queue_filter', studioQueueFilter);
        seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
        syncQueueMachinePicker();
        renderKanban();
      });
    });
    $('#studioQueueMachine')?.addEventListener('change', (e) => {
      studioQueueMachineId = e.target.value || '';
      prefSet('queue_machine', studioQueueMachineId);
      renderKanban();
    });
    syncQueueMachinePicker();
  }

  function wireStudioClientFilters() {
    const seg = $('#studioClientSeg');
    if (!seg || seg.dataset.wired === '1') return;
    seg.dataset.wired = '1';
    seg.querySelectorAll('[data-client-filter]').forEach(btn => {
      const f = btn.dataset.clientFilter || 'all';
      btn.classList.toggle('on', f === studioClientFilter);
      btn.addEventListener('click', () => {
        studioClientFilter = btn.dataset.clientFilter || 'all';
        prefSet('client_filter', studioClientFilter);
        seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
        renderClients();
      });
    });
  }

  function wireCalcTechSeg() {
    const seg = $('#calcTechSeg');
    if (!seg || seg.dataset.wired === '1') return;
    seg.dataset.wired = '1';
    const syncFromFilament = () => {
      const fid = $('#filamentSelect')?.value;
      const inv = fid ? inventory.find(i => i.id === fid) : null;
      const isResin = inv?.materialType === 'resin';
      seg.querySelectorAll('button').forEach(b => {
        b.classList.toggle('on', (b.dataset.calcTech === 'resin') === !!isResin);
      });
    };
    seg.querySelectorAll('[data-calc-tech]').forEach(btn => {
      btn.addEventListener('click', () => {
        const isResin = btn.dataset.calcTech === 'resin';
        seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
        const sel = $('#filamentSelect');
        if (!sel) return;
        const match = [...sel.options].find(o => {
          const id = o.value;
          const inv = inventory.find(i => i.id === id);
          return inv && (inv.materialType === 'resin') === isResin;
        });
        if (match) {
          sel.value = match.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (typeof handleFilamentChange === 'function') {
          handleFilamentChange();
        }
      });
    });
    $('#filamentSelect')?.addEventListener('change', syncFromFilament);
    syncFromFilament();
  }

  function initStudioCalculatorLayout() {
    const tab = $('#calculator-tab');
    if (!tab || !isStudio()) return;
    if (tab.querySelector('.khayt-calc-layout')) return;
    const grid = tab.querySelector('.grid');
    if (!grid) return;
    const cards = [...grid.querySelectorAll(':scope > .card')];
    const material = cards.find(c => c.classList.contains('material'));
    const machine = cards.find(c => c.classList.contains('machine'));
    const labor = cards.find(c => c.classList.contains('labor'));
    const summary = cards.find(c => c.classList.contains('summary'));
    if (!summary) return;

    const layout = document.createElement('div');
    layout.className = 'grid khayt-calc-layout';
    const formCol = document.createElement('div');
    formCol.className = 'khayt-calc-form';
    const asideCol = document.createElement('div');
    asideCol.className = 'khayt-calc-aside';
    [material, machine, labor].filter(Boolean).forEach(c => formCol.appendChild(c));
    summary.classList.add('khayt-calc-summary');
    asideCol.appendChild(summary);
    layout.appendChild(formCol);
    layout.appendChild(asideCol);
    grid.replaceWith(layout);
    wireCalcTechSeg();
  }

  function renderInventoryStudioStats() {
    const el = $('#invStudioStats');
    if (!el || !isStudio()) return;
    if (!inventory.length) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
      return;
    }
    const low = inventory.filter(i => i.weight <= (i.reorderPoint ?? settings.lowStockThreshold));
    const totalValue = inventory.reduce((s, item) => {
      const sw = Math.max(1, +item.spoolWeight || 1000);
      const pricePerG = item.cost > 0 ? item.cost / sw : 0;
      return s + pricePerG * Math.max(0, +item.weight || 0);
    }, 0);
    const dryingNow = inventory.filter(i => {
      const log = i.dryingLog || [];
      if (!log.length) return false;
      const last = [...log].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      if (!last?.date) return false;
      const hours = (Date.now() - new Date(last.date + 'T12:00:00').getTime()) / 3600000;
      return hours < 48;
    }).length;
    const stats = [
      { l: t('inv.total_spools') || 'Total spools', v: inventory.length, u: '', c: 'var(--info)' },
      { l: t('inv.total_value') || 'Stock value', v: Math.round(totalValue).toLocaleString(), u: settings.currency || 'SAR', c: 'var(--accent)' },
      { l: t('inv.low_stock_count') || 'Below reorder', v: low.length, u: t('inv.items') || 'items', c: 'var(--warn)' },
      { l: t('inv.drying_now') || 'Drying now', v: dryingNow, u: '', c: 'var(--violet, #a78bfa)' },
    ];
    el.innerHTML = stats.map(s => `
      <div class="khayt-inv-stat">
        <div class="col" style="gap:4px">
          <span class="eyebrow">${escapeHtml(s.l)}</span>
          <span class="row" style="align-items:baseline;gap:4px">
            <span class="metric">${escapeHtml(String(s.v))}</span>
            ${s.u ? `<span class="mono" style="font-size:11px;color:var(--text-muted)">${escapeHtml(s.u)}</span>` : ''}
          </span>
        </div>
        <span class="dot" style="background:${s.c};width:10px;height:10px"></span>
      </div>`).join('');
    el.style.display = 'grid';
    el.removeAttribute('aria-hidden');
  }

  function invStockMeterHtml(item) {
    const reorder = item.reorderPoint ?? settings.lowStockThreshold ?? 200;
    const cap = Math.max(reorder * 2, item.weight || 1, 1);
    const pct = Math.min(100, Math.round((item.weight / cap) * 100));
    const low = item.weight <= reorder;
    return `
      <div class="inv-stock-meter">
        <div class="row between" style="margin-bottom:4px">
          <span class="metric" style="font-size:12px;color:${low ? 'var(--warn)' : 'var(--text-dim)'}">${Math.round(item.weight)} ${item.materialType === 'resin' ? 'mL' : 'g'}</span>
          <span class="mono" style="font-size:10px;color:var(--text-faint)">${escapeHtml(t('inv.reorder_at') || 'reorder')} ${Math.round(reorder)}</span>
        </div>
        <div class="meter"><i style="width:${pct}%;background:${low ? 'var(--warn)' : 'var(--ok)'}"></i></div>
      </div>`;
  }

  function renderClientsStudioCards(filtered, maps) {
    const grid = $('#clientsCardsGrid');
    const tableWrap = $('#clientsTableWrap');
    if (!grid || !isStudio()) return false;

    const { clientStatsMap, clientBalanceMap, clientTierMap, clientSurveyMap } = maps;
    const tierColor = { Gold: 'var(--warn)', Silver: '#aeb6c4', Bronze: '#c08457' };

    let list = filtered;
    if (studioClientFilter === 'vat') {
      list = list.filter(c => !!(c.vat || '').trim());
    } else if (studioClientFilter === 'b2c') {
      list = list.filter(c => !(c.vat || '').trim() && !(c.cr || '').trim());
    } else if (studioClientFilter === 'balance') {
      list = list.filter(c => (clientBalanceMap.get(c.id) || 0) > 0);
    }

    grid.removeAttribute('aria-hidden');
    if (tableWrap) tableWrap.classList.toggle('khayt-clients-legacy-hidden', list.length > 0);

    if (!list.length) {
      grid.style.display = 'grid';
      grid.innerHTML = `<p class="dash-empty" style="padding:18px;grid-column:1/-1">${escapeHtml(t('cl.empty_search') || 'No clients match.')}</p>`;
      return true;
    }

    grid.style.display = 'grid';
    grid.innerHTML = list.map(c => {
      const stats = clientStatsMap.get(c.id) || { count: 0, completedCount: 0, revenue: 0 };
      const displayName = localName(c);
      const balance = clientBalanceMap.get(c.id) || 0;
      const tier = clientTierMap.get(c.id);
      const color = clientAccentColor(c.id, c.color);
      const initials = (displayName || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
      const credit = Math.max(0, +c.creditLimit || 0);
      const creditPct = credit > 0 ? Math.min(100, (balance / credit) * 100) : 0;
      const tag = c.source && c.source !== 'other' ? (t('cl.source_' + c.source) || c.source) : (c.phone || '');
      const sv = clientSurveyMap?.get(c.id);
      const avgRating = sv ? sv.sum / sv.count : null;
      const ratingHtml = avgRating != null
        ? `<span style="font-size:10px;color:#f59e0b">★ ${avgRating.toFixed(1)}</span>` : '';
      const ordersLabel = t('cl.orders') || 'Orders';
      const lifetimeLabel = t('cl.revenue') || 'Lifetime';
      const balanceLabel = t('cl.outstanding') || 'Balance';
      return `
      <div class="card khayt-client-card" data-client-id="${escapeHtml(c.id)}">
        <div class="row between">
          <div class="row gap10 grow" style="align-items:center;min-width:0">
            <span class="khayt-cavatar" style="background:color-mix(in srgb, ${color} 22%, var(--surface-2));color:${color}">${escapeHtml(initials)}</span>
            <div class="col grow" style="line-height:1.25;min-width:0">
              <strong style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(displayName || '—')}</strong>
              <span class="row gap6" style="font-size:11px;color:var(--text-muted);flex-wrap:wrap">${escapeHtml(tag)}${ratingHtml}${tier ? `<span style="color:${tierColor[tier.name] || 'var(--text-muted)'}">${escapeHtml(tier.name)}</span>` : ''}</span>
            </div>
          </div>
        </div>
        <hr class="thread" style="margin:13px 0" />
        <div class="row between">
          ${[[ordersLabel, stats.count, ''], [lifetimeLabel, Math.round(stats.revenue).toLocaleString(), settings.currency || 'SAR'], [balanceLabel, balance > 0 ? Math.round(balance).toLocaleString() : '0', balance > 0 ? (settings.currency || 'SAR') : '']].map(([l, v, u]) => `
            <div class="col" style="gap:3px">
              <span class="mono" style="font-size:9.5px;color:var(--text-muted);letter-spacing:0.06em">${escapeHtml(String(l).toUpperCase())}</span>
              <span class="row" style="align-items:baseline;gap:3px">
                <span class="metric" style="font-size:15px;color:${l === balanceLabel && balance > 0 ? 'var(--warn)' : 'var(--text)'}">${escapeHtml(String(v))}</span>
                ${u ? `<span class="mono" style="font-size:9px;color:var(--text-faint)">${escapeHtml(u)}</span>` : ''}
              </span>
            </div>`).join('')}
        </div>
        ${credit > 0 ? `
        <div style="margin-top:13px">
          <div class="row between" style="margin-bottom:5px">
            <span style="font-size:10.5px;color:var(--text-muted)">${escapeHtml(t('cl.credit_used') || 'Credit used')}</span>
            <span class="mono" style="font-size:10.5px;color:var(--text-dim)">${Math.round(balance)} / ${Math.round(credit)}</span>
          </div>
          <div class="meter"><i style="width:${creditPct}%;background:${creditPct > 70 ? 'var(--danger)' : 'var(--accent)'}"></i></div>
        </div>` : ''}
        <div class="row gap6 khayt-client-card-actions" style="margin-top:12px;flex-wrap:wrap">
          <button type="button" class="btn sm subtle" data-act="cl-quote" data-id="${c.id}">${escapeHtml(t('cl.quote'))}</button>
          <button type="button" class="btn sm subtle" data-act="cl-history" data-id="${c.id}">${escapeHtml(t('cl.history'))}</button>
          <button type="button" class="btn sm subtle" data-act="cl-intake-form" data-id="${c.id}">${escapeHtml(t('cl.intake_form'))}</button>
          <button type="button" class="btn sm subtle" data-act="cl-note" data-id="${c.id}">${escapeHtml(t('cl.add_note'))}</button>
          <button type="button" class="btn sm subtle" data-act="cl-edit" data-id="${c.id}">${escapeHtml(t('common.edit'))}</button>
          <button type="button" class="btn sm danger" data-act="cl-del" data-id="${c.id}">${escapeHtml(t('common.delete'))}</button>
        </div>
      </div>`;
    }).join('');
    return true;
  }

  function attentionIconSvg(kind) {
    const map = { warn: 'alert', danger: 'alert', ok: 'check', info: 'doc', stock: 'spool', queue: 'queue', calendar: 'clock' };
    const name = map[kind] || 'alert';
    return window.KhaytIcon?.svg?.(name, 16) || '';
  }

  function patchInitAppShellKanbanCols() {
    if (!isStudio()) return;
    $$('.kanban-col').forEach(col => {
      col.classList.add('khayt-kcol');
      const list = col.querySelector('[id^="list-"]');
      if (list) list.classList.add('khayt-kcol-body');
    });
  }

  function init() {
    if (!isStudio()) return;
    window.KhaytIcon?.hydrateNav?.();
    window.KhaytIcon?.hydrateTopbar?.();
    wireStudioQueueFilters();
    wireStudioClientFilters();
    initStudioCalculatorLayout();
    patchInitAppShellKanbanCols();
    if (typeof i18n !== 'undefined' && i18n.apply) i18n.apply(document.body);
  }

  window.KhaytStudio = {
    isStudio,
    init,
    syncQueueMachinePicker,
    orderMatchesStudioQueueFilter,
    renderInventoryStudioStats,
    invStockMeterHtml,
    renderClientsStudioCards,
    initStudioCalculatorLayout,
    attentionIconSvg,
    clientAccentColor,
  };
})();
