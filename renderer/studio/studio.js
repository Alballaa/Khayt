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
    ensureCalcStudioPanel();
  }

  const BD_COLORS = {
    material: 'var(--accent)',
    machine: 'var(--info, #38bdf8)',
    labor: 'var(--violet, #a78bfa)',
    buffer: 'var(--warn)',
  };

  function ensureCalcStudioPanel() {
    if (!isStudio()) return;
    const summary = document.querySelector('#calculator-tab .card.summary');
    if (!summary || summary.querySelector('#calcStudioBreakdown')) return;
    const liveLine = summary.querySelector('.live-line');
    const bdLegacy = $('#costBreakdown');
    if (bdLegacy) bdLegacy.classList.add('khayt-bd-legacy-hidden');

    const panel = document.createElement('div');
    panel.id = 'calcStudioBreakdown';
    panel.className = 'khayt-calc-breakdown';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="khayt-calc-breakdown-head">
        <span class="sec-title" data-i18n="calc.breakdown_title">Live cost breakdown</span>
        <span class="khayt-calc-breakdown-live" data-i18n="calc.breakdown_live">live</span>
      </div>
      <div class="khayt-calc-breakdown-body">
        <div class="khayt-donut-wrap">
          <div id="calcDonutHost"></div>
          <div class="khayt-donut-center">
            <div class="col" style="align-items:center;gap:2px">
              <span class="mono" style="font-size:9.5px;color:var(--text-muted)">COST</span>
              <span class="metric" id="calcDonutTotal">0</span>
              <span class="mono" id="calcDonutCur" style="font-size:9px;color:var(--text-muted)"></span>
            </div>
          </div>
        </div>
        <div class="khayt-calc-legend" id="calcBreakdownLegend"></div>
      </div>
      <div class="khayt-calc-margin-strip" id="calcMarginStrip"></div>`;

    if (liveLine && liveLine.nextSibling) {
      summary.insertBefore(panel, liveLine.nextSibling);
    } else {
      summary.prepend(panel);
    }
    if (typeof i18n !== 'undefined' && i18n.apply) i18n.apply(panel);
  }

  function updateCalcBreakdown(bd, opts) {
    if (!isStudio()) return;
    ensureCalcStudioPanel();
    const panel = $('#calcStudioBreakdown');
    const host = $('#calcDonutHost');
    const legend = $('#calcBreakdownLegend');
    const strip = $('#calcMarginStrip');
    if (!panel || !host || !legend) return;

    const items = [
      { key: 'material', label: t('calc.bd.material'), val: bd.material, color: BD_COLORS.material },
      { key: 'machine', label: t('calc.bd.machine'), val: bd.machine, color: BD_COLORS.machine },
      { key: 'labor', label: t('calc.bd.labor'), val: bd.labor, color: BD_COLORS.labor },
      { key: 'buffer', label: t('calc.bd.buffer'), val: bd.buffer, color: BD_COLORS.buffer },
    ].filter(x => x.val >= 0.01);

    const total = items.reduce((s, x) => s + x.val, 0);
    const cur = opts?.currency || settings.currency || 'SAR';

    if (items.length === 0 || total < 0.01) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';

    const segments = items.map(x => ({ pct: x.val, color: x.color }));
    host.innerHTML = window.KhaytCharts?.donutSvg?.(segments, 128, 17) || '';

    const totalEl = $('#calcDonutTotal');
    const curEl = $('#calcDonutCur');
    if (totalEl) totalEl.textContent = Math.round(total).toLocaleString();
    if (curEl) curEl.textContent = cur;

    legend.innerHTML = items.map(x => `
      <div class="khayt-calc-legend-row">
        <span class="row gap8" style="white-space:nowrap">
          <span class="dot" style="background:${x.color}"></span>
          ${escapeHtml(x.label)}
        </span>
        <span class="metric">${escapeHtml(fmtMoney(x.val))}</span>
      </div>`).join('');

    if (strip && opts) {
      const margin = opts.margin ?? 0;
      const priced = total * (1 + margin / 100);
      strip.innerHTML = `
        <span>${escapeHtml(t('calc.breakdown_unit_cost') || 'Unit cost')}: <strong>${escapeHtml(fmtMoney(total))}</strong></span>
        <span>${escapeHtml(t('calc.quote.margin') || 'Margin')}: <strong>${Math.round(margin)}%</strong></span>
        <span>${escapeHtml(t('calc.breakdown_at_margin') || 'At margin')}: <strong>${escapeHtml(fmtMoney(priced))}</strong></span>
        ${opts.finalPrice != null ? `<span>${escapeHtml(t('calc.quote.total') || 'Project total')}: <strong>${escapeHtml(fmtMoney(opts.finalPrice))}</strong></span>` : ''}`;
    }
  }

  function patchInventoryTableHead() {
    if (!isStudio()) return;
    const table = $('#inventoryTable');
    if (!table) return;
    table.classList.add('tbl');
    const thead = table.querySelector('thead tr');
    if (!thead || thead.dataset.studioHead === '1') return;
    thead.dataset.studioHead = '1';
    thead.innerHTML = `
      <th data-i18n="inv.material">Material</th>
      <th data-i18n="inv.material_type">Type</th>
      <th data-i18n="inv.col_stock">Stock level</th>
      <th data-i18n="inv.col_spools">Spools</th>
      <th data-i18n="inv.col_unit_price">Unit price</th>
      <th data-i18n="common.actions">Actions</th>`;
    if (typeof i18n !== 'undefined' && i18n.apply) i18n.apply(thead);
  }

  function invDryingBadgeHtml(item) {
    const mat = (item.material || '').toLowerCase();
    const isHygroscopic = ['nylon', 'pa', 'tpu', 'tpe', 'pva', 'petg'].some(h => mat.includes(h));
    if (!isHygroscopic) return '';
    const dryLog = item.dryingLog || [];
    if (dryLog.length === 0) {
      return `<span class="drying-warn-badge" title="${escapeHtml(t('inv.dry_log'))}">⚠ ${escapeHtml(t('inv.dry_warn'))}</span>`;
    }
    const lastDry = [...dryLog].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const daysSince = lastDry.date ? Math.floor((Date.now() - new Date(lastDry.date + 'T00:00:00').getTime()) / 86400000) : 999;
    if (daysSince > 7) {
      return `<span class="drying-warn-badge">⚠ ${escapeHtml(t('inv.dry_warn'))}</span>`;
    }
    return `<span class="drying-ok-badge">✅ ${escapeHtml(t('inv.dry_ok', { n: daysSince }))}</span>`;
  }

  function invActionsHtml(item, low) {
    return `
      ${invDryingBadgeHtml(item)}
      ${low ? `<button type="button" class="btn sm" data-act="reorder-inv" data-id="${item.id}" style="color:var(--warn);border-color:var(--warn)">${escapeHtml(t('inv.reorder'))}</button>` : ''}
      <button type="button" class="btn sm ghost" data-act="inv-test-print" data-id="${item.id}" title="${escapeHtml(t('inv.test_prints'))}">🧪</button>
      <button type="button" class="btn sm ghost" data-act="inv-dry-log" data-id="${item.id}" title="${escapeHtml(t('inv.dry_log'))}">🌡</button>
      <button type="button" class="btn sm ghost" data-act="inv-spool-history" data-id="${item.id}" title="${escapeHtml(t('inv.spool_history'))}">📋</button>
      <button type="button" class="btn sm ghost" data-act="adj-inv" data-id="${item.id}">${escapeHtml(t('inv.adjust'))}</button>
      ${(item.priceHistory && item.priceHistory.length > 0) ? `<button type="button" class="btn sm ghost" data-act="inv-price-history" data-id="${item.id}" title="${escapeHtml(t('inv.price_history'))}">📈</button>` : ''}
      <button type="button" class="btn sm" data-act="edit-inv" data-id="${item.id}">${escapeHtml(t('common.edit'))}</button>
      <button type="button" class="btn sm danger" data-act="del-inv" data-id="${item.id}">${escapeHtml(t('common.delete'))}</button>`;
  }

  function renderInventoryRow(item, ctx) {
    if (!isStudio()) return null;
    const { forecastMap = {}, todayMs = Date.now() } = ctx || {};
    const low = item.weight <= (item.reorderPoint ?? settings.lowStockThreshold);
    const queued = Math.round(getQueuedWeight(item.id));
    const warn = queued > 0 && queued > item.weight;
    const isResin = item.materialType === 'resin';
    const typeLabel = isResin ? (t('inv.type_resin') || 'Resin') : (t('inv.type_fdm') || 'FDM');
    const sw = Math.max(1, +item.spoolWeight || 1000);
    const unitPrice = (item.cost / sw) * 1000;
    const unitSuffix = isResin ? '/L' : '/kg';

    const refDate = item.openedAt || item.purchasedAt;
    let ageBadge = '';
    if (refDate) {
      const ageMonths = Math.floor((todayMs - new Date(refDate + 'T00:00:00').getTime()) / (30.44 * 86400000));
      if (ageMonths >= 12) ageBadge = `<span style="font-size:10px;color:var(--danger)">⚠ ${ageMonths}mo</span>`;
      else if (ageMonths >= 6) ageBadge = `<span style="font-size:10px;color:var(--warning)">📅 ${ageMonths}mo</span>`;
    }
    const fc = forecastMap[item.material];
    const runoutBadge = fc
      ? `<span style="font-size:10px;color:${fc.urgent ? 'var(--danger)' : 'var(--warning)'}">📉 ${fc.daysRemaining}d</span>`
      : '';
    const dryingActive = (() => {
      const log = item.dryingLog || [];
      if (!log.length) return false;
      const last = [...log].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      if (!last?.date) return false;
      return (Date.now() - new Date(last.date + 'T12:00:00').getTime()) / 3600000 < 48;
    })();

    return `
      <tr data-inv-id="${escapeHtml(item.id)}"${low ? ' class="khayt-inv-low"' : ''}>
        <td>
          <div class="khayt-inv-mat-cell">
            <span class="khayt-swatch" style="background:${safeCssColor(item.color, '#888')}"></span>
            <div class="col grow">
              <strong>${escapeHtml(item.material)}</strong>
              <div class="khayt-inv-meta">
                ${item.colourVariant ? `<span>${escapeHtml(item.colourVariant)}</span>` : ''}
                ${low ? `<span style="color:var(--warn)">· low</span>` : ''}
                ${ageBadge}${runoutBadge}
                ${dryingActive ? `<span class="khayt-due" style="color:var(--violet);background:color-mix(in srgb,var(--violet) 18%,transparent)">${escapeHtml(t('inv.drying_now') || 'drying')}</span>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td><span class="khayt-inv-type-pill">${escapeHtml(typeLabel)}</span></td>
        <td>${invStockMeterHtml(item)}${queued > 0 ? `<div class="mono" style="font-size:10px;color:${warn ? 'var(--danger)' : 'var(--text-muted)'};margin-top:4px">${escapeHtml(t('inv.col_queued') || 'Queued')}: ${queued}${isResin ? ' mL' : 'g'}</div>` : ''}</td>
        <td><span class="metric" style="font-size:13px">1</span></td>
        <td><span class="khayt-inv-unit-price">${escapeHtml(fmtMoney(unitPrice))}<span class="mono" style="font-size:10px;color:var(--text-muted)">${escapeHtml(unitSuffix)}</span></span></td>
        <td><div class="khayt-inv-actions">${invActionsHtml(item, low)}</div></td>
      </tr>`;
  }

  function wrapQueueFold(el, foldKey, titleKey, countFn) {
    if (!el || el.dataset.khaytFold === '1') return;
    const collapsed = prefGet('fold_' + foldKey, foldKey === 'waiting' ? '1' : '0') === '1';
    const fold = document.createElement('div');
    fold.className = 'khayt-fold' + (collapsed ? ' is-collapsed' : '');
    fold.dataset.foldKey = foldKey;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'khayt-fold-head';
    head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

    const title = document.createElement('span');
    title.className = 'khayt-fold-title';
    title.setAttribute('data-i18n', titleKey);
    title.textContent = t(titleKey);

    const countEl = document.createElement('span');
    countEl.className = 'khayt-fold-count';
    countEl.style.display = 'none';

    const chev = document.createElement('span');
    chev.className = 'khayt-fold-chevron';
    chev.setAttribute('aria-hidden', 'true');
    chev.textContent = '▼';

    head.append(title, countEl, chev);

    const body = document.createElement('div');
    body.className = 'khayt-fold-body';

    const parent = el.parentNode;
    parent.insertBefore(fold, el);
    body.appendChild(el);
    fold.append(head, body);
    el.dataset.khaytFold = '1';
    if (el.classList.contains('quotes-section')) el.classList.add('khayt-fold-inner');

    const syncCount = () => {
      const n = countFn ? countFn() : 0;
      countEl.textContent = String(n);
      countEl.style.display = n > 0 ? '' : 'none';
      if (foldKey === 'quotes' && n === 0) fold.style.display = 'none';
      else fold.style.display = '';
    };
    syncCount();
    fold._syncCount = syncCount;

    head.addEventListener('click', () => {
      const nowCollapsed = !fold.classList.toggle('is-collapsed');
      prefSet('fold_' + foldKey, nowCollapsed ? '1' : '0');
      head.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
    });

    return fold;
  }

  function initQueueStudioFolds() {
    if (!isStudio()) return;
    const quotes = $('#quotesSection');
    if (quotes) {
      wrapQueueFold(quotes, 'quotes', 'queue.quotes_awaiting', () => printLog.filter(o => o.status === 'quote').length);
    }
    const waitingWrap = $('#waitingListToggle')?.parentElement;
    if (waitingWrap) {
      wrapQueueFold(waitingWrap, 'waiting', 'waiting.title', () => (typeof waitingList !== 'undefined' ? waitingList.length : 0));
    }
  }

  function syncQueueFolds() {
    if (!isStudio()) return;
    document.querySelectorAll('.khayt-fold[data-fold-key="quotes"]').forEach(f => f._syncCount?.());
    document.querySelectorAll('.khayt-fold[data-fold-key="waiting"]').forEach(f => f._syncCount?.());
  }

  function initPhase5() {
    if (!isStudio()) return;
    patchInventoryTableHead();
    ensureCalcStudioPanel();
    initQueueStudioFolds();
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
    initPhase5();
    if (typeof i18n !== 'undefined' && i18n.apply) i18n.apply(document.body);
  }

  window.KhaytStudio = {
    isStudio,
    init,
    initPhase5,
    syncQueueMachinePicker,
    syncQueueFolds,
    orderMatchesStudioQueueFilter,
    renderInventoryStudioStats,
    patchInventoryTableHead,
    renderInventoryRow,
    invStockMeterHtml,
    renderClientsStudioCards,
    initStudioCalculatorLayout,
    ensureCalcStudioPanel,
    updateCalcBreakdown,
    attentionIconSvg,
    clientAccentColor,
  };
})();
