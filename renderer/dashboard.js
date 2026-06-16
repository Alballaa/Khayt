/**
 * Dashboard tab: KPI row, studio panels, filament analytics, material usage chart.
 */
(function (global) {
/* ============================================================
   Khayt Studio — dashboard & queue presentation
   ============================================================ */

/** Multi-site summary for print farms (Professional mode, 2+ locations). */
function buildFarmLocationOverview() {
  if (settings.mode === 'simple' || locations.length < 2) return '';
  if (typeof orderLocationId !== 'function') return '';

  const todayStr = localDateStr(new Date());
  const rows = locations.map((loc) => {
    const locMachines = machines.filter(m => m.locationId === loc.id);
    const locOrders = printLog.filter(o => orderLocationId(o) === loc.id);
    const printing = locOrders.filter(o => o.status === 'printing').length;
    const pending = locOrders.filter(o => o.status === 'pending').length;
    const activeHrs = locOrders
      .filter(o => o.status !== 'completed' && o.status !== 'quote')
      .reduce((s, o) => s + (+o.printTime || 0), 0);
    const todayRev = locOrders
      .filter(o => o.status === 'completed' && o.date === todayStr)
      .reduce((s, o) => s + orderRevenueBase(o), 0);
    return { loc, printers: locMachines.length, printing, pending, activeHrs, todayRev };
  });

  const unassigned = printLog.filter(o => !orderLocationId(o) && o.status !== 'completed' && o.status !== 'quote');
  const unassignedHrs = unassigned.reduce((s, o) => s + (+o.printTime || 0), 0);

  const cards = rows.map((r) => `
    <button type="button" class="farm-loc-card card" data-act="filter-location" data-id="${escapeHtml(r.loc.id)}"
      style="text-align:start;padding:12px 14px;cursor:pointer;border:1px solid var(--border);${activeLocation === r.loc.id ? 'border-color:var(--primary);box-shadow:0 0 0 1px var(--primary);' : ''}">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;">${escapeHtml(r.loc.name)}</div>
      <div style="font-size:11px;color:var(--text-muted);line-height:1.5;">
        ${r.printers} ${escapeHtml(t('farm.loc_printers') || 'printers')}
        · ${r.printing} ${escapeHtml(t('farm.loc_printing') || 'printing')}
        · ${r.pending} ${escapeHtml(t('farm.loc_pending') || 'pending')}
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
        ${r.activeHrs.toFixed(1)}h ${escapeHtml(t('farm.loc_queue') || 'in queue')}
        · ${escapeHtml(t('farm.loc_today') || 'today')} ${fmtMoney(r.todayRev)}
      </div>
    </button>`).join('');

  const unassignedHtml = unassigned.length
    ? `<p style="font-size:11px;color:var(--text-muted);margin:8px 0 0;">
        ${escapeHtml(t('farm.unassigned_jobs', { n: unassigned.length, h: unassignedHrs.toFixed(1) }) || `${unassigned.length} jobs (${unassignedHrs.toFixed(1)}h) not tied to a site printer yet`)}
      </p>`
    : '';

  return `
    <div class="dash-section farm-loc-overview pro-only" style="margin-bottom:14px;">
      <div class="row between wrap gap8" style="margin-bottom:10px;">
        <h3 class="dash-section-head" style="margin:0;">${escapeHtml(t('farm.loc_overview') || 'Sites overview')}</h3>
        ${activeLocation ? `<button type="button" class="btn small ghost" data-act="clear-location-filter">${escapeHtml(t('loc.show_all'))}</button>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">${cards}</div>
      ${unassignedHtml}
    </div>`;
}

function buildSoloDashboardQuickRow(ctx) {
  const {
    expiringQuotes, nowPrinting, todayRev, receivables, todayStr,
  } = ctx;
  const intakeCount = waitingList.filter((w) => w.status === 'active' || w.status === 'reminded').length;
  const quotesCount = printLog.filter((o) => o.status === 'quote').length;
  const printingLabel = nowPrinting.length
    ? `${nowPrinting.length} · ${escapeHtml(nowPrinting[0].project || nowPrinting[0].id)}`
    : escapeHtml(t('dash.solo_idle') || 'Nothing printing');

  return `
    <div class="solo-dash-quick card" style="padding:14px 16px;margin-bottom:14px;border:1px solid var(--border);">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:10px;" data-i18n="dash.solo_title">Your shop today</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">
        <button type="button" class="btn" data-act="goto-tab" data-tab="calculator-tab" style="justify-content:flex-start;text-align:start;">
          <span style="font-size:18px;">◎</span>
          <span class="col" style="gap:2px;align-items:flex-start;">
            <strong style="font-size:13px;" data-i18n="dash.solo_new_quote">New quote</strong>
            <span style="font-size:11px;color:var(--text-muted);font-weight:400;" data-i18n="dash.solo_new_quote_sub">Calculator</span>
          </span>
        </button>
        <button type="button" class="btn ghost" data-act="goto-tab" data-tab="queue-tab" style="justify-content:flex-start;text-align:start;">
          <span style="font-size:18px;">📥</span>
          <span class="col" style="gap:2px;align-items:flex-start;">
            <strong style="font-size:13px;">${escapeHtml(t('waiting.title') || 'Job Intake')}</strong>
            <span style="font-size:11px;color:var(--text-muted);font-weight:400;">${intakeCount} ${escapeHtml(t('dash.solo_active') || 'active')}</span>
          </span>
        </button>
        <button type="button" class="btn ghost" data-act="goto-tab" data-tab="queue-tab" style="justify-content:flex-start;text-align:start;">
          <span style="font-size:18px;">📋</span>
          <span class="col" style="gap:2px;align-items:flex-start;">
            <strong style="font-size:13px;">${escapeHtml(t('dash.solo_quotes') || 'Open quotes')}</strong>
            <span style="font-size:11px;color:var(--text-muted);font-weight:400;">${quotesCount}</span>
          </span>
        </button>
        <div class="btn ghost" style="cursor:default;justify-content:flex-start;text-align:start;opacity:1;">
          <span style="font-size:18px;">▤</span>
          <span class="col" style="gap:2px;align-items:flex-start;">
            <strong style="font-size:13px;">${escapeHtml(t('dash.now_printing') || 'Printing')}</strong>
            <span style="font-size:11px;color:var(--text-muted);font-weight:400;">${printingLabel}</span>
          </span>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-soft);font-size:12px;">
        <span><strong>${fmtMoney(todayRev)}</strong> <span style="color:var(--text-muted);" data-i18n="dash.today_rev">today</span></span>
        ${receivables > 0 ? `<span style="color:var(--warn);"><strong>${fmtMoney(receivables)}</strong> <span data-i18n="dash.receivables">due</span></span>` : ''}
        ${settings.onlineEnabled ? `<button type="button" class="btn small" id="btnDashCopyIntake">${escapeHtml(t('dash.solo_copy_intake') || 'Copy customer link')}</button>` : ''}
        ${expiringQuotes.length ? `<button type="button" class="btn small ghost" data-act="goto-tab" data-tab="queue-tab">${escapeHtml(t('dash.expiring_quotes'))} (${expiringQuotes.length})</button>` : ''}
      </div>
    </div>`;
}

function buildStudioDashboardPanels(ctx) {
  const {
    machines, printLog, nowPrinting, overdue, staleOrders, expiringQuotes,
    dueSoon, today, inventory, settings,
  } = ctx;
  if (!document.body.classList.contains('khayt-handoff')) return '';

  if (settings.mode === 'simple') {
    const intakeCount = waitingList.filter((w) => w.status === 'active' || w.status === 'reminded').length;
    const attention = [];
    if (intakeCount > 0) {
      attention.push({
        iconKind: 'info', color: 'var(--primary)',
        title: t('waiting.title') || 'Job Intake',
        sub: `${intakeCount} ${t('dash.solo_active') || 'waiting'}`,
        tab: 'queue-tab', label: t('common.view') || 'View',
      });
    }
    if (expiringQuotes.length) {
      attention.push({
        iconKind: 'warn', color: 'var(--warning)',
        title: t('dash.expiring_quotes') || 'Expiring quotes',
        sub: String(expiringQuotes.length),
        tab: 'queue-tab', label: t('common.view') || 'View',
      });
    }
    if (nowPrinting.length) {
      attention.push({
        iconKind: 'queue', color: 'var(--ok)',
        title: t('dash.now_printing') || 'Printing now',
        sub: nowPrinting[0].project || nowPrinting[0].id,
        tab: 'queue-tab', label: t('tab.queue') || 'Queue',
      });
    }
    if (overdue.length) {
      attention.push({
        iconKind: 'danger', color: 'var(--danger)',
        title: t('dash.overdue_section') || 'Overdue',
        sub: String(overdue.length),
        tab: 'queue-tab', label: t('common.view') || 'View',
      });
    }
    const attnHtml = attention.length === 0
      ? `<p class="dash-empty" style="padding:18px;">${escapeHtml(t('dash.all_clear') || 'All clear')}</p>`
      : attention.map((a) => `
      <div class="khayt-attn">
        <div class="khayt-attn-ic" style="color:${a.color};background:color-mix(in srgb, ${a.color} 14%, transparent)">${window.KhaytStudio?.attentionIconSvg?.(a.iconKind) || '•'}</div>
        <div class="col grow" style="gap:2px;min-width:0">
          <span style="font-size:13px;font-weight:600">${escapeHtml(a.title)}</span>
          <span style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(a.sub)}</span>
        </div>
        <button type="button" class="btn sm subtle" data-act="goto-tab" data-tab="${a.tab}">${escapeHtml(a.label)}</button>
      </div>`).join('');
    return `
      <div class="khayt-dash-grid" style="margin-bottom:16px;">
        <div class="card khayt-panel">
          <h3 class="card-head"><span class="swatch"></span><span data-i18n="dash.solo_needs_you">Needs attention</span></h3>
          <div class="col gap8">${attnHtml}</div>
        </div>
      </div>`;
  }

  const printingOrders = printLog.filter(o => o.status === 'printing');
  const lowSpools = inventory.filter(i => i.weight <= (i.reorderPoint ?? settings.lowStockThreshold));
  const attention = [];

  if (staleOrders.length) {
    attention.push({
      icon: '⚠', iconKind: 'warn', color: 'var(--warn)',
      title: t('dash.stale_title') || 'Orders stalled',
      sub: String(staleOrders.length) + ' ' + (t('dash.orders') || 'orders'),
      tab: 'queue-tab', label: t('tab.queue') || 'Queue',
    });
  }
  if (overdue.length) {
    attention.push({
      icon: '⏱', iconKind: 'danger', color: 'var(--danger)',
      title: t('dash.overdue_section') || 'Overdue',
      sub: overdue.slice(0, 3).map(o => o.project || o.id).join(' · '),
      tab: 'queue-tab', label: t('common.view') || 'View',
    });
  }
  if (lowSpools.length) {
    attention.push({
      icon: '⬡', iconKind: 'stock', color: 'var(--warn)',
      title: t('dash.low_stock_alert') || 'Low stock',
      sub: lowSpools.slice(0, 2).map(i => `${i.material} (${Math.round(i.weight)}g)`).join(' · '),
      tab: 'inventory-tab', label: t('tab.inventory') || 'Inventory',
    });
  }
  if (expiringQuotes.length) {
    attention.push({
      icon: '📋', iconKind: 'info', color: 'var(--info)',
      title: t('dash.expiring_quotes') || 'Expiring quotes',
      sub: String(expiringQuotes.length) + ' ' + (t('dash.quotes') || 'quotes'),
      tab: 'queue-tab', label: t('tab.queue') || 'Queue',
    });
  }
  if (dueSoon.length) {
    attention.push({
      icon: '📅', iconKind: 'calendar', color: 'var(--info)',
      title: t('dash.due_soon_section') || 'Due soon',
      sub: String(dueSoon.length) + ' ' + (t('dash.orders') || 'orders'),
      tab: 'queue-tab', label: t('common.view') || 'View',
    });
  }
  if (nowPrinting.length && !attention.some(a => a.icon === '▤')) {
    attention.push({
      icon: '▤', iconKind: 'queue', color: 'var(--ok)',
      title: t('dash.now_printing') || 'Printing now',
      sub: String(nowPrinting.length) + ' ' + (t('dash.active_jobs') || 'active jobs'),
      tab: 'queue-tab', label: t('tab.queue') || 'Queue',
    });
  }

  const attnHtml = attention.length === 0
    ? `<p class="dash-empty" style="padding:18px;">${escapeHtml(t('dash.all_clear') || 'All clear — nothing needs attention right now.')}</p>`
    : attention.slice(0, 6).map(a => `
      <div class="khayt-attn">
        <div class="khayt-attn-ic" style="color:${a.color};background:color-mix(in srgb, ${a.color} 14%, transparent)">${window.KhaytStudio?.attentionIconSvg?.(a.iconKind) || a.icon}</div>
        <div class="col grow" style="gap:2px;min-width:0">
          <span style="font-size:13px;font-weight:600">${escapeHtml(a.title)}</span>
          <span style="font-size:11.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.sub)}</span>
        </div>
        <button type="button" class="btn sm subtle" data-act="goto-tab" data-tab="${a.tab}">${escapeHtml(a.label)}</button>
      </div>`).join('');

  let floorHtml = '';
  if (machines.length > 0) {
    const tiles = machines.map(m => {
      const job = printingOrders.find(o =>
        o.machineId === m.id || (o.parts || []).some(p => p.machineId === m.id)
      );
      const svc = machineServiceStatus(m);
      let status = 'idle';
      let color = 'var(--text-muted)';
      if (m.isOffline) { status = 'error'; color = 'var(--danger)'; }
      else if (job) { status = 'printing'; color = 'var(--ok)'; }
      else if (svc.due || svc.warning) { status = 'maint'; color = 'var(--warn)'; }
      const label = { printing: t('mach.status_printing') || 'Printing', idle: t('mach.status_idle') || 'Idle',
        error: t('mach.offline') || 'Offline', maint: t('dash.maint_title') || 'Maintenance' }[status];
      let progress = 0;
      if (job && job.printTime > 0) {
        const start = new Date(job.printingStartedAt || job.timerStart || Date.now()).getTime();
        progress = Math.min(99, Math.round((Date.now() - start) / (job.printTime * 3600000) * 100));
      }
      const jobName = job ? (job.project || job.id) : (t('dash.no_active_job') || 'No active job');
      const sub = job
        ? `${(+job.printTime || 0).toFixed(1)}h · ${progress}%`
        : (m.tech || m.notes || '').slice(0, 40);
      return `
        <div class="card khayt-ptile" style="padding:calc(var(--u)*3.5)">
          <div class="row between">
            <div class="row gap8 grow" style="min-width:0">
              <span class="dot" style="background:${safeCssColor(m.color)};width:8px;height:8px"></span>
              <strong style="font-size:13;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.name)}</strong>
            </div>
            <span class="pill" style="border-color:transparent;background:var(--surface-2);padding:3px 8px">
              <span class="dot" style="background:${color}"></span> ${escapeHtml(label)}
            </span>
          </div>
          <div class="row between" style="margin-top:12px;align-items:center">
            <div class="col" style="gap:3px;min-width:0">
              <span style="font-size:12;color:${job ? 'var(--text-dim)' : 'var(--text-faint)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${escapeHtml(jobName)}</span>
              <span class="mono" style="font-size:11px;color:var(--text-muted)">${escapeHtml(sub)}</span>
            </div>
            ${status === 'printing' ? `<span class="metric" style="font-size:13px;color:var(--ok)">${progress}%</span>` : ''}
          </div>
        </div>`;
    }).join('');
    const liveCount = printingOrders.length;
    floorHtml = `
      <div class="card flush khayt-floor">
        <div class="row between" style="padding:16px 18px 12px">
          <div class="row gap8">
            <span class="sec-title">${escapeHtml(t('dash.studio_floor') || 'Production floor')}</span>
            ${liveCount ? `<span class="pill" style="background:var(--ok-soft);border-color:transparent;color:var(--ok)"><span class="khayt-live"></span> ${liveCount} ${escapeHtml(t('dash.live') || 'live')}</span>` : ''}
          </div>
          <button type="button" class="btn ghost sm" data-act="goto-tab" data-tab="queue-tab">${escapeHtml(t('dash.open_queue') || 'Open queue')} ›</button>
        </div>
        <hr class="thread" style="margin:0 18px" />
        <div style="padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">${tiles}</div>
      </div>`;
  }

  if (!floorHtml && !attention.length) return '';

  return `
    <div class="khayt-grid khayt-dash-panels" style="grid-template-columns:${floorHtml ? '1.55fr 1fr' : '1fr'};margin-bottom:var(--gap)">
      ${floorHtml || ''}
      <div class="card flush">
        <div class="row between" style="padding:16px 18px 12px">
          <span class="sec-title">${escapeHtml(t('dash.needs_attention') || 'Needs attention')}</span>
          ${attention.length ? `<span class="pill">${attention.length}</span>` : ''}
        </div>
        <hr class="thread" style="margin:0 18px" />
        <div class="col">${attnHtml}</div>
      </div>
    </div>`;
}

function renderDashboard() {
  const el = $('#dashboardContent');
  if (!el) return;
  if (document.body.classList.contains('khayt-cockpit') && typeof KhaytCockpitOverview?.render === 'function') {
    KhaytCockpitOverview.render();
    return;
  }
  if (document.body.classList.contains('khayt-atlas') && typeof KhaytAtlasFloor?.render === 'function') {
    KhaytAtlasFloor.render();
    return;
  }
  if (document.body.classList.contains('khayt-workbench')
    && typeof KhaytWorkbench?.renderDashboard === 'function'
    && KhaytWorkbench.renderDashboard(el)) {
    updateTabBadges?.();
    renderLocationScopeBanner?.();
    return;
  }

  const dashOrders = typeof orderMatchesActiveLocation === 'function'
    ? printLog.filter(orderMatchesActiveLocation)
    : printLog;
  const dashMachines = typeof machineMatchesActiveLocation === 'function'
    ? machines.filter(machineMatchesActiveLocation)
    : machines;

  renderLocationScopeBanner?.();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = localDateStr(today);

  // Monthly goal
  const thisMonthStr = localMonthStr(today);
  const monthlyRev   = printLog
    .filter(o => o.status === 'completed' && (o.date || '').startsWith(thisMonthStr))
    .reduce((s, o) => s + orderRevenueBase(o), 0);

  // QW8: Previous month revenue for delta chip
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthStr = localMonthStr(prevMonthDate);
  const prevMonthRev = printLog
    .filter(o => o.status === 'completed' && (o.date || '').startsWith(prevMonthStr))
    .reduce((s, o) => s + orderRevenueBase(o), 0);
  const revDeltaPct = prevMonthRev > 0 ? ((monthlyRev - prevMonthRev) / prevMonthRev * 100) : null;
  const revDeltaHtml = revDeltaPct !== null
    ? `<span class="delta-chip ${revDeltaPct >= 0 ? 'delta-up' : 'delta-down'}" style="font-size:10px;padding:1px 6px;border-radius:10px;margin-inline-start:6px;font-weight:600;background:${revDeltaPct >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'};color:${revDeltaPct >= 0 ? 'var(--success)' : 'var(--danger)'};">${revDeltaPct >= 0 ? '▲' : '▼'} ${Math.abs(revDeltaPct).toFixed(0)}%</span>`
    : '';

  // Revenue forecast: project month-end based on daily rate so far
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const forecastRev = dayOfMonth > 0 && dayOfMonth < daysInMonth
    ? Math.round((monthlyRev / dayOfMonth) * daysInMonth)
    : monthlyRev;
  const forecastHtml = dayOfMonth < daysInMonth && monthlyRev > 0
    ? `<span style="font-size:10px;padding:1px 7px;border-radius:10px;margin-inline-start:6px;font-weight:600;background:rgba(99,102,241,0.15);color:#818cf8;" title="${escapeHtml(t('dash.forecast_tip'))}">📈 ${escapeHtml(t('dash.forecast'))} ${fmtPrice(forecastRev)}</span>`
    : '';

  // 30-day daily revenue sparkline data
  const sparkDays = 30;
  const sparkData = [];
  for (let d = sparkDays - 1; d >= 0; d--) {
    const dd = new Date(today); dd.setDate(dd.getDate() - d);
    const ds = localDateStr(dd);
    const dayRev = printLog
      .filter(o => o.status === 'completed' && o.date === ds)
      .reduce((s, o) => s + orderRevenueBase(o), 0);
    sparkData.push(dayRev);
  }
  const sparkMax = Math.max(...sparkData, 1);
  const sparkW = 200, sparkH = 40;
  const sparkPts = sparkData.map((v, i) => {
    const x = Math.round((i / (sparkDays - 1)) * sparkW);
    const y = Math.round(sparkH - (v / sparkMax) * sparkH * 0.9);
    return `${x},${y}`;
  }).join(' ');
  const sparkHtml = `
    <div style="display:inline-flex;align-items:center;gap:8px;margin-top:8px;">
      <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('dash.sparkline_30d'))}</span>
      <svg width="${sparkW}" height="${sparkH}" style="display:block;overflow:visible;">
        <polyline points="${sparkPts}" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>
        <circle cx="${sparkData.map((v,i)=>Math.round((i/(sparkDays-1))*sparkW)).slice(-1)[0]}" cy="${Math.round(sparkH-(sparkData[sparkData.length-1]/sparkMax)*sparkH*0.9)}" r="3" fill="var(--primary)"/>
      </svg>
    </div>`;

  // Stats
  const active   = printLog.filter(o => o.status !== 'completed' && o.status !== 'quote');
  const todayDone = printLog.filter(o => o.status === 'completed' && o.date === todayStr);
  const todayRev  = todayDone.reduce((s, o) => s + orderRevenueBase(o), 0);
  const todayNew = printLog.filter(o => o.date === todayStr && o.status !== 'completed');
  const todayMatG = inventory.reduce((s, item) =>
    s + (item.usageHistory || [])
      .filter(h => h.date === todayStr)
      .reduce((a, h) => a + (+h.weightUsed || 0), 0), 0);
  const nowPrinting = printLog.filter(o => o.status === 'printing');
  const receivables = printLog
    .filter(o => (payStatus(o)) !== 'paid')
    .reduce((s, o) => s + orderOwedBase(o), 0);

  // Pipeline value — sum of all non-completed, non-quote order prices
  const pipelineValue = printLog
    .filter(o => o.status !== 'completed' && o.status !== 'quote')
    .reduce((s, o) => s + orderRevenueBase(o), 0);

  // Queue clearance forecast (exclude on_hold orders — they are frozen)
  const pendingHours = printLog
    .filter(o => o.status !== 'completed' && o.status !== 'quote' && o.status !== 'on_hold')
    .reduce((s, o) => s + (+o.printTime || 0), 0);
  // New Feature 7: use working-hours-aware daily rate
  const whDailyRate = avgDailyWorkingHours();
  const clearDays = (whDailyRate > 0 && pendingHours > 0)
    ? Math.ceil(pendingHours / whDailyRate)
    : null;

  // Quotes expiring soon (≤ 2 days) or already expired
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const expiringQuotes = printLog
    .filter(o => o.status === 'quote' && o.quoteExpiresAt)
    .filter(o => Math.round((new Date(o.quoteExpiresAt + 'T00:00:00') - today0) / 86400000) <= 2)
    .sort((a, b) => (a.quoteExpiresAt || '').localeCompare(b.quoteExpiresAt || ''));

  // Quotes due for a gentle follow-up nudge (pure selector — see lib/quote-followup.js).
  // Restricted to the active location and scoped by the configurable follow-up window/dedupe.
  const followUpQuotes = (typeof KhaytQuoteFollowUp !== 'undefined'
    ? KhaytQuoteFollowUp.selectQuotesDueForFollowUp(dashOrders, settings, Date.now())
    : []);

  // Orders awaiting delivery (completed but not yet delivered)
  const awaitingDelivery = printLog.filter(o => o.status === 'completed' && !o.deliveredAt);

  // Due-date buckets (non-completed only)
  const withDue = printLog.filter(o => o.dueDate && o.status !== 'completed');
  const overdue  = withDue.filter(o => new Date(o.dueDate + 'T00:00:00') < today).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const dueSoon  = withDue.filter(o => {
    const d = new Date(o.dueDate + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    return diff >= 0 && diff <= 3;
  }).sort((a,b) => a.dueDate.localeCompare(b.dueDate));

  // Unpaid orders
  const unpaid = printLog.filter(o => (payStatus(o)) !== 'paid' && o.status === 'completed')
    .slice(0, 5);

  // Receivables aging (all non-fully-paid orders)
  const unpaidOrders = printLog.filter(o => payStatus(o) !== 'paid' && !o.voidedAt);
  const agingBuckets = { c0_30: { count: 0, amount: 0 }, c31_60: { count: 0, amount: 0 }, c61_90: { count: 0, amount: 0 }, c91plus: { count: 0, amount: 0 } };
  for (const o of unpaidOrders) {
    const owed = orderOwedBase(o);
    if (owed <= 0) continue;
    const age = Math.round((today - new Date(o.date + 'T00:00:00')) / 86400000);
    if (age <= 30)      { agingBuckets.c0_30.count++;   agingBuckets.c0_30.amount   += owed; }
    else if (age <= 60) { agingBuckets.c31_60.count++;  agingBuckets.c31_60.amount  += owed; }
    else if (age <= 90) { agingBuckets.c61_90.count++;  agingBuckets.c61_90.amount  += owed; }
    else                { agingBuckets.c91plus.count++;  agingBuckets.c91plus.amount += owed; }
  }

  const orderCard = (o, badge) => {
    const isUnpaid = payStatus(o) !== 'paid';
    const client = o.clientId ? clients.find(c => c.id === o.clientId) : null;
    const hasPhone = !!(client?.phone || '').trim();
    const reminderBtn = (isUnpaid && hasPhone)
      ? `<button class="btn small ghost" data-act="pay-remind" data-id="${o.id}" title="${escapeHtml(t('pay.remind_btn'))}">💰</button>`
      : '';
    return `
    <div class="dash-order-row">
      <div class="dash-order-info">
        <strong>${escapeHtml(o.project || t('inv.walk_in'))}</strong>
        <span class="dash-order-id">${escapeHtml(o.id)}</span>
      </div>
      <div class="dash-order-meta">
        ${badge}
        <span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span>
        <span class="dash-price">${fmtPrice(o.price)}</span>
        ${reminderBtn}
        <button class="btn small" data-act="edit-log" data-id="${o.id}">${escapeHtml(t('common.edit'))}</button>
      </div>
    </div>`;
  };

  const noItems = (key) => `<p class="dash-empty">${escapeHtml(t(key))}</p>`;

  const dashIsAr = i18n.current === 'ar';
  const dashBizPrimary   = dashIsAr ? (settings.bizAr || settings.bizEn) : (settings.bizEn || settings.bizAr);
  const dashBizSecondary = dashIsAr ? (settings.bizEn || '') : (settings.bizAr || '');
  const dashTagline      = dashIsAr ? (settings.taglineAr || settings.taglineEn) : (settings.taglineEn || settings.taglineAr);

  // Stale order alerts
  const staleOrders = getStaleOrders().filter(o =>
    typeof orderMatchesActiveLocation !== 'function' || orderMatchesActiveLocation(o));
  const staleHtml = staleOrders.length === 0 ? '' : `
    <div class="card" style="margin-bottom:16px; border-left:3px solid var(--warning);">
      <h3 class="card-head" style="margin-bottom:10px;"><span class="swatch" style="background:var(--warning);"></span>
        ⚠ ${escapeHtml(t('dash.stale_title') || 'Orders Stalled')}
        <span class="count" style="background:var(--warning);color:#000;margin-inline-start:8px;">${staleOrders.length}</span>
      </h3>
      ${staleOrders.slice(0, 5).map(o => {
        const threshold = (settings.staleHours || {})[o.status] || 24;
        const lastAt = (o.statusHistory?.length ? o.statusHistory[o.statusHistory.length-1].at : o.printingStartedAt || o.date + 'T00:00:00Z');
        const hoursAgo = Math.round((Date.now() - new Date(lastAt).getTime()) / 3600000);
        return `<div class="dash-order-row">
          <div class="dash-order-info">
            <strong>${escapeHtml(o.project || t('inv.walk_in'))}</strong>
            <span class="dash-order-id">${escapeHtml(o.id)}</span>
          </div>
          <div class="dash-order-meta">
            <span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span>
            <span style="font-size:11px; color:var(--warning);">🕐 ${hoursAgo}h (>${threshold}h)</span>
          </div>
        </div>`;
      }).join('')}
      ${staleOrders.length > 5 ? `<div style="font-size:11.5px;color:var(--text-muted);padding:6px 0;">+${staleOrders.length - 5} more</div>` : ''}
    </div>`;

  const studioPanels = buildStudioDashboardPanels({
    machines: dashMachines, printLog: dashOrders, nowPrinting, overdue, staleOrders, expiringQuotes,
    dueSoon, today, inventory, settings,
  });

  const soloQuickRow = settings.mode === 'simple'
    ? buildSoloDashboardQuickRow({
      expiringQuotes, nowPrinting, todayRev, receivables, todayStr,
    })
    : '';

  el.innerHTML = `<div class="khayt-dash col gap16 fade">
    <div class="dash-hero khayt-dash-hero">
      <div class="dash-hero-brand">
        <div class="dash-hero-logo">${safeBizLogo() ? `<img src="${safeBizLogo()}" alt="logo">` : BRAND_MARK_SVG}</div>
        <div class="dash-hero-info">
          <div class="dash-hero-name">${escapeHtml(dashBizPrimary || 'Khayt')}</div>
          ${dashBizSecondary ? `<div class="dash-hero-name-sec">${escapeHtml(dashBizSecondary)}</div>` : ''}
          ${dashTagline ? `<div class="dash-hero-tagline">${escapeHtml(dashTagline)}</div>` : ''}
        </div>
      </div>
      <div class="dash-hero-right">
        <span class="dash-greeting">${escapeHtml(t('dash.greeting'))}</span>
        <span class="dash-date">${today.toLocaleDateString(dashIsAr ? 'ar-SA' : 'en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</span>
      </div>
    </div>

    <div id="locationScopeBannerDash" class="location-scope-banner" style="display:none;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px;padding:8px 12px;background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius);"></div>
    ${buildFarmLocationOverview()}
    ${soloQuickRow}
    ${settings.mode === 'simple' ? '' : renderDashKpiRow({ active: active.length, overdue: overdue.length, todayRev, receivables, revDeltaPct, sparkData })}
    <div class="dash-stats dash-stats-secondary pro-only">
      <div class="dash-stat">
        <div class="dash-stat-val">${active.length}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.active_orders'))}</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-val">${overdue.length}</div>
        <div class="dash-stat-lbl dash-stat-overdue">${escapeHtml(t('dash.overdue'))}</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-val">${fmtMoney(todayRev)}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.today_rev'))}</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-val">${fmtMoney(receivables)}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.receivables'))}</div>
      </div>
      ${pipelineValue > 0 ? `
      <div class="dash-stat">
        <div class="dash-stat-val">${fmtMoney(pipelineValue)}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.pipeline_value'))} <small>${escapeHtml(currencySymbol())}</small></div>
      </div>` : ''}
      ${awaitingDelivery.length > 0 ? `
      <div class="dash-stat">
        <div class="dash-stat-val">${awaitingDelivery.length}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.awaiting_delivery'))}</div>
      </div>` : ''}
      ${clearDays !== null ? `
      <div class="dash-stat">
        <div class="dash-stat-val">${clearDays}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.clear_days'))}</div>
      </div>` : ''}
    </div>

    ${(todayDone.length > 0 || todayNew.length > 0 || nowPrinting.length > 0) ? `
    <div class="dash-section" style="margin-bottom:14px;padding:12px 16px;background:var(--bg-card);border-radius:var(--radius);border:1px solid var(--border-soft);">
      <h3 class="dash-section-head" style="margin-bottom:10px;">📅 ${escapeHtml(t('dash.today_title'))}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:16px;">
        <div style="display:flex;flex-direction:column;align-items:center;min-width:72px;">
          <span style="font-size:22px;font-weight:700;color:${todayDone.length > 0 ? 'var(--success)' : 'var(--text-muted)'};">${todayDone.length}</span>
          <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('dash.today_done'))}</span>
        </div>
        ${todayDone.length > 0 ? `<div style="display:flex;flex-direction:column;align-items:center;min-width:90px;">
          <span style="font-size:22px;font-weight:700;color:var(--primary);">${fmtMoney(todayRev)}</span>
          <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('dash.today_rev'))}</span>
        </div>` : ''}
        ${todayNew.length > 0 ? `<div style="display:flex;flex-direction:column;align-items:center;min-width:72px;">
          <span style="font-size:22px;font-weight:700;color:var(--text);">${todayNew.length}</span>
          <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('dash.today_new'))}</span>
        </div>` : ''}
        ${nowPrinting.length > 0 ? `<div style="display:flex;flex-direction:column;align-items:center;min-width:72px;">
          <span style="font-size:22px;font-weight:700;color:var(--warning);">${nowPrinting.length}</span>
          <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('dash.now_printing'))}</span>
        </div>` : ''}
        ${todayMatG > 0 ? `<div style="display:flex;flex-direction:column;align-items:center;min-width:90px;">
          <span style="font-size:22px;font-weight:700;color:var(--text);">${Math.round(todayMatG)}g</span>
          <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(t('dash.today_mat'))}</span>
        </div>` : ''}
      </div>
      ${todayDone.length > 0 ? `<div style="margin-top:10px;border-top:1px solid var(--border-soft);padding-top:8px;">${
        todayDone.slice(0, 5).map(o => `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12.5px;">
          <span style="color:var(--text);">${escapeHtml(o.project || t('inv.walk_in'))}</span>
          <span style="color:var(--success);font-weight:600;">${fmtPrice(o.price)}</span>
        </div>`).join('')
      }${todayDone.length > 5 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">+${todayDone.length - 5} more</div>` : ''}</div>` : ''}
    </div>` : ''}

    ${settings.monthlyGoal > 0 ? (() => {
      const pct = Math.min(100, (monthlyRev / settings.monthlyGoal) * 100);
      const monthName = today.toLocaleDateString(dashIsAr ? 'ar-SA' : 'en-US', { month: 'long' });
      const col = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--primary)' : 'var(--warning)';
      return `
        <div class="dash-goal">
          <div class="dash-goal-top">
            <span class="dash-goal-label">${escapeHtml(monthName)} ${escapeHtml(t('dash.goal'))}</span>
            <span class="dash-goal-nums">${fmtMoney(monthlyRev)}${revDeltaHtml}${forecastHtml} / ${fmtPrice(settings.monthlyGoal)} · ${Math.round(pct)}%</span>
          </div>
          <div class="dash-goal-bar"><div class="dash-goal-fill" style="width:${pct}%; background:${col};"></div></div>
          ${sparkHtml}
        </div>`;
    })() : ''}

    ${settings.mode !== 'simple' && machines.length > 0 ? (() => {
      const activeOrds = printLog.filter(o => o.status !== 'completed' && o.status !== 'quote');
      const WORK_HRS_PER_DAY = Math.max(1, avgDailyWorkingHours()); // use configured working hours
      // Feature 1: Per-machine clearance forecast
      const machRows = machines.map(m => {
        const mJobs  = activeOrds.filter(o => o.machineId === m.id);
        const mHrs   = mJobs.reduce((s, o) => s + +o.printTime, 0);
        const estDays = mHrs > 0 ? Math.ceil(mHrs / WORK_HRS_PER_DAY) : 0;
        const clearHtml = estDays > 0
          ? ` · <span style="color:var(--text-muted);">${escapeHtml(t('dash.est_clear', { n: estDays }))}</span>`
          : '';
        return `<div class="dash-mach-row">
          <span class="dash-mach-dot" style="background:${safeCssColor(m.color)};"></span>
          <span class="dash-mach-name">${escapeHtml(m.name)}</span>
          <span class="dash-mach-stat">${mJobs.length} ${escapeHtml(t('dash.mach_jobs'))} · ${mHrs.toFixed(1)} ${escapeHtml(t('common.hours'))}${clearHtml}</span>
        </div>`;
      });
      const unassigned = activeOrds.filter(o => !o.machineId);
      if (unassigned.length > 0) {
        const uHrs = unassigned.reduce((s, o) => s + +o.printTime, 0);
        const uDays = uHrs > 0 ? Math.ceil(uHrs / WORK_HRS_PER_DAY) : 0;
        const uClearHtml = uDays > 0
          ? ` · <span style="color:var(--text-muted);">${escapeHtml(t('dash.est_clear', { n: uDays }))}</span>`
          : '';
        machRows.push(`<div class="dash-mach-row">
          <span class="dash-mach-dot" style="background:var(--text-muted);"></span>
          <span class="dash-mach-name">${escapeHtml(t('dash.unassigned'))}</span>
          <span class="dash-mach-stat">${unassigned.length} ${escapeHtml(t('dash.mach_jobs'))} · ${uHrs.toFixed(1)} ${escapeHtml(t('common.hours'))}${uClearHtml}</span>
        </div>`);
      }
      return `<div class="dash-section" style="margin-bottom:14px;">
        <h3 class="dash-section-head">${escapeHtml(t('dash.machine_load'))}</h3>
        ${machRows.join('')}
      </div>`;
    })() : ''}

    ${(() => {
      const lowSpools = inventory.filter(i => i.weight <= (i.reorderPoint ?? settings.lowStockThreshold));
      if (lowSpools.length === 0) return '';
      return `<div class="dash-low-stock">
        <span class="dash-low-stock-icon">⚠</span>
        <span class="dash-low-stock-label">${escapeHtml(t('dash.low_stock_alert'))}</span>
        <span class="dash-low-stock-items">${lowSpools.map(i =>
          `<span class="dash-low-spool"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escapeHtml(i.color||'#888')};margin-inline-end:4px;vertical-align:middle;"></span>${escapeHtml(i.material)} (${Math.round(i.weight)}g)</span>`
        ).join('')}</span>
      </div>`;
    })()}

    ${(() => {
      const lowPkg = consumables.filter(c => c.isPackaging && (c.stock || 0) <= (c.minStock || 0));
      if (lowPkg.length === 0) return '';
      return `<div class="dash-low-stock">
        <span class="dash-low-stock-icon">📦</span>
        <span class="dash-low-stock-label">${escapeHtml(t('cons.packaging_badge'))} — ${escapeHtml(t('dash.low_stock_alert'))}</span>
        <span class="dash-low-stock-items">${lowPkg.map(c =>
          `<span class="dash-low-spool">📦 ${escapeHtml(c.name)}: ${c.stock || 0} ${escapeHtml(c.unit || '')}</span>`
        ).join('')}</span>
      </div>`;
    })()}

    ${(() => {
      const maintMachines = machines.filter(m => {
        const s = machineServiceStatus(m);
        return s.due || s.warning;
      });
      // Feature 4: Nozzle replace alerts
      const nozzleAlerts = machines.filter(m => m.nozzle?.installedAt && m.nozzle?.gramsThreshold > 0 && machineGramsSinceNozzle(m) >= m.nozzle.gramsThreshold);
      const totalAlerts = maintMachines.length + nozzleAlerts.length;
      if (totalAlerts === 0) return '';
      return `<div class="dash-section dash-maint-section pro-only">
        <h3 class="dash-section-head" style="color:var(--danger);">🔧 ${escapeHtml(t('dash.maint_title'))} (${totalAlerts})</h3>
        ${maintMachines.map(m => {
          const s = machineServiceStatus(m);
          const badge = s.due
            ? `<span class="due-badge overdue">${escapeHtml(t('mach.service_due'))}</span>`
            : `<span class="due-badge due-soon">${escapeHtml(t('mach.service_warn'))}</span>`;
          return `<div class="dash-order-row">
            <div class="dash-order-info">
              <span class="machine-dot" style="background:${safeCssColor(m.color)};display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:6px;vertical-align:middle;"></span>
              <strong>${escapeHtml(m.name)}</strong>
              <span class="dash-order-id">${s.hours.toFixed(1)}h since service / ${s.interval}h interval</span>
            </div>
            <div class="dash-order-meta">
              ${badge}
              <button class="btn small primary" data-act="log-service" data-id="${m.id}">${escapeHtml(t('mach.log_service'))}</button>
            </div>
          </div>`;
        }).join('')}
        ${nozzleAlerts.map(m => {
          const grams = machineGramsSinceNozzle(m);
          return `<div class="dash-order-row">
            <div class="dash-order-info">
              <span class="machine-dot" style="background:${safeCssColor(m.color)};display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:6px;vertical-align:middle;"></span>
              <strong>${escapeHtml(m.name)}</strong>
              <span class="dash-order-id">🔩 ${grams.toFixed(0)}g / ${m.nozzle.gramsThreshold}g</span>
            </div>
            <div class="dash-order-meta">
              <span class="due-badge overdue">${escapeHtml(t('mach.nozzle_replace'))}</span>
              <button class="btn small ghost" data-act="log-nozzle-change" data-id="${m.id}">${escapeHtml(t('mach.log_nozzle'))}</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    })()}

    ${(() => {
      const sevenDays = new Date(today); sevenDays.setDate(sevenDays.getDate() + 7);
      const dueClients = clients.filter(c => {
        const rec = c.recurring;
        if (!rec?.enabled || !rec.nextDue) return false;
        const nd = new Date(rec.nextDue + 'T00:00:00');
        return nd <= sevenDays;
      }).sort((a, b) => a.recurring.nextDue.localeCompare(b.recurring.nextDue));
      if (dueClients.length === 0) return '';
      return `<div class="dash-section pro-only" style="border-left:3px solid var(--primary); padding-inline-start:12px;">
        <h3 class="dash-section-head" style="color:var(--primary);">${escapeHtml(t('dash.recurring_due'))} (${dueClients.length})</h3>
        ${dueClients.map(c => {
          const nd = new Date(c.recurring.nextDue + 'T00:00:00');
          const daysLeft = Math.round((nd - today) / 86400000);
          const badge = daysLeft < 0
            ? `<span class="due-badge overdue">${escapeHtml(t('dash.recurring_overdue'))}</span>`
            : daysLeft === 0
              ? `<span class="due-badge due-today">${escapeHtml(t('dash.recurring_today'))}</span>`
              : `<span class="due-badge due-soon">${escapeHtml(t('dash.recurring_in', { n: daysLeft }))}</span>`;
          const dn = localName(c);
          return `<div class="dash-order-row">
            <div class="dash-order-info">
              <strong>${escapeHtml(dn)}</strong>
              <span class="dash-order-id">${escapeHtml(t('rec.interval.' + (c.recurring.interval || 'monthly')))}</span>
            </div>
            <div class="dash-order-meta">
              ${badge}
              <button class="btn small primary" data-act="cl-quote" data-id="${c.id}">${escapeHtml(t('dash.recurring_start'))}</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    })()}

    ${overdue.length > 0 ? `
    <div class="dash-section">
      <h3 class="dash-section-head overdue-head">${escapeHtml(t('dash.overdue_section'))} (${overdue.length})</h3>
      ${overdue.map(o => orderCard(o, formatDueDateBadge(o.dueDate))).join('')}
    </div>` : ''}

    <div class="dash-section">
      <h3 class="dash-section-head">${escapeHtml(t('dash.due_soon_section'))}</h3>
      ${dueSoon.length > 0 ? dueSoon.map(o => orderCard(o, formatDueDateBadge(o.dueDate))).join('') : noItems('dash.no_due_soon')}
    </div>

    ${staleHtml}

    <div class="dash-section">
      <h3 class="dash-section-head">${escapeHtml(t('dash.unpaid_section'))}</h3>
      ${unpaid.length > 0 ? unpaid.map(o => orderCard(o, paymentBadge(o))).join('') : noItems('dash.no_unpaid')}
    </div>

    ${unpaidOrders.length > 0 ? (() => {
      const agingCell = (label, bucket, urgency) => {
        if (bucket.count === 0) return '';
        const col = urgency === 'high' ? 'var(--danger)' : urgency === 'med' ? 'var(--warning)' : 'var(--text-dim)';
        return `<div class="aging-bucket">
          <div class="aging-label">${escapeHtml(label)}</div>
          <div class="aging-count" style="color:${col};">${bucket.count}</div>
          <div class="aging-amount">${fmtPrice(bucket.amount)}</div>
        </div>`;
      };
      return `<div class="dash-section">
        <h3 class="dash-section-head">${escapeHtml(t('dash.aging_title'))}</h3>
        <div class="aging-grid">
          ${agingCell(t('dash.aging_0_30'), agingBuckets.c0_30, 'ok')}
          ${agingCell(t('dash.aging_31_60'), agingBuckets.c31_60, 'low')}
          ${agingCell(t('dash.aging_61_90'), agingBuckets.c61_90, 'med')}
          ${agingCell(t('dash.aging_91plus'), agingBuckets.c91plus, 'high')}
        </div>
      </div>`;
    })() : ''}

    ${followUpQuotes.length > 0 ? `
    <div class="dash-section" style="border-left:3px solid var(--warning); padding-inline-start:12px;">
      <h3 class="dash-section-head" style="color:var(--warning);">⏳ ${escapeHtml(t('dash.expiring_quotes'))} (${followUpQuotes.length})</h3>
      ${followUpQuotes.map(q => {
        const daysLeft = Math.round((new Date(q.quoteExpiresAt + 'T00:00:00') - today0) / 86400000);
        const badge = daysLeft < 0
          ? `<span class="due-badge overdue">${escapeHtml(t('quote.expired'))}</span>`
          : `<span class="due-badge due-soon">${escapeHtml(t('quote.expires_in', { n: daysLeft }))}</span>`;
        const client = q.clientId ? clients.find(c => c.id === q.clientId) : null;
        const hasPhone = !!(client?.phone || '').trim();
        const sentCount = +q.followUpCount || 0;
        const sentChip = sentCount > 0
          ? `<span style="font-size:10.5px;color:var(--text-muted);" title="${escapeHtml(t('quote.followup_count', { n: sentCount }))}">✓${sentCount}</span>`
          : '';
        const followBtn = hasPhone
          ? `<button class="btn small ghost" data-act="quote-followup" data-id="${q.id}" title="${escapeHtml(t('quote.followup_btn'))}">💬 ${escapeHtml(t('quote.followup_btn'))}</button>`
          : `<span style="font-size:10.5px;color:var(--text-muted);">${escapeHtml(t('quote.followup_no_phone'))}</span>`;
        return `<div class="dash-order-row">
          <div class="dash-order-info">
            <strong>${escapeHtml(q.project || t('inv.walk_in'))}</strong>
            <span class="dash-order-id">${escapeHtml(q.id)}${client ? ' · ' + escapeHtml(localName(client)) : ''}</span>
          </div>
          <div class="dash-order-meta">
            ${badge}
            ${sentChip}
            <span class="dash-price">${fmtPrice(q.price)}</span>
            ${followBtn}
            <button class="btn small" data-act="edit-log" data-id="${q.id}">${escapeHtml(t('common.edit'))}</button>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    ${(() => {
      const sevenDaysFromNow = todayPlusDays(7);
      const paymentsDue = [];
      for (const o of printLog) {
        if (!o.instalments) continue;
        const client = o.clientId ? clients.find(c => c.id === o.clientId) : null;
        o.instalments.forEach((inst, i) => {
          if (!inst.paidAt && inst.dueDate && inst.dueDate <= sevenDaysFromNow) {
            paymentsDue.push({ order: o, inst, instIndex: i, client });
          }
        });
      }
      if (paymentsDue.length === 0) return '';
      return `<div class="dash-section pro-only" style="border-left:3px solid var(--primary); padding-inline-start:12px; margin-bottom:14px;">
        <h3 class="dash-section-head" style="color:var(--primary);">💳 ${escapeHtml(t('dash.payments_due'))} (${paymentsDue.length})</h3>
        ${paymentsDue.map(({ order: o, inst, instIndex, client }) => {
          const clientName = client ? localName(client) : (o.project || o.id);
          const daysUntil = Math.round((new Date(inst.dueDate + 'T00:00:00') - new Date(new Date().setHours(0,0,0,0))) / 86400000);
          const badge = daysUntil < 0
            ? `<span class="due-badge overdue">${Math.abs(daysUntil)}d overdue</span>`
            : daysUntil === 0
              ? `<span class="due-badge due-today">${escapeHtml(t('oe.due_today'))}</span>`
              : `<span class="due-badge due-soon">${escapeHtml(t('oe.due_soon', { n: daysUntil }))}</span>`;
          return `<div class="dash-order-row">
            <div class="dash-order-info">
              <strong>${escapeHtml(clientName)}</strong>
              <span class="dash-order-id">${escapeHtml(o.id)} · ${escapeHtml(inst.note || '')} · ${fmtPrice(inst.amount || 0)}</span>
            </div>
            <div class="dash-order-meta">
              ${badge}
              ${client?.phone ? `<button class="btn small ghost" data-act="remind-instalment" data-order-id="${o.id}" data-inst-index="${instIndex}" title="${escapeHtml(t('dash.inst_remind'))}">💬</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
    })()}

    <div id="capacityGaugeSection"></div>

    <div id="breakEvenSection" class="pro-only" style="margin-bottom:14px;"></div>

    ${(() => {
      const forecastItems = computeMaterialForecast();
      if (forecastItems.length === 0) return '';
      return `<div class="dash-card forecast-card" style="margin-bottom:14px;">
        <h3 class="dash-section-head" style="color:var(--warning);">⚠ ${escapeHtml(t('dash.mat_forecast'))}</h3>
        ${forecastItems.map(f => `
          <div class="forecast-row ${f.urgent ? 'urgent' : 'warn'}" style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:5px;margin-bottom:4px;background:${f.urgent ? 'rgba(220,38,38,0.08)' : 'rgba(245,166,35,0.08)'};">
            <span class="forecast-mat" style="font-weight:500;">${escapeHtml(f.material)}</span>
            <span class="forecast-days" style="font-size:12px;color:${f.urgent ? 'var(--danger)' : 'var(--warning)'};">
              ${f.available < 0 ? escapeHtml(t('dash.mat_queue_exceeds')) : escapeHtml(t('dash.mat_days_left', { n: f.daysRemaining }))}
            </span>
            <span class="forecast-stock" style="font-size:11px;color:var(--text-muted);">${f.available}g</span>
          </div>`).join('')}
      </div>`;
    })()}

    ${studioPanels}
    <div class="dash-quick pro-only">
      <button class="btn primary" data-act="goto-tab" data-tab="calculator-tab" data-i18n="tab.calculator">Calculator</button>
      <button class="btn" data-act="goto-tab" data-tab="queue-tab" data-i18n="tab.queue">Production Queue</button>
      <button class="btn" data-act="goto-tab" data-tab="logs-tab" data-i18n="tab.logs">Orders Log</button>
    </div>
  </div>`;

  // Wire the edit-log and goto-tab buttons inside the dashboard
  el.querySelectorAll('[data-act="edit-log"]').forEach(btn =>
    btn.addEventListener('click', () => openOrderEditor(btn.dataset.id))
  );
  el.querySelectorAll('[data-act="goto-tab"]').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );
  el.querySelector('#btnDashCopyIntake')?.addEventListener('click', () => {
    if (typeof copyOnlineIntakeUrl === 'function') copyOnlineIntakeUrl(el.querySelector('#btnDashCopyIntake'));
  });
  // Feature 5: Render capacity gauge into its placeholder
  renderCapacityGauge();
  // Round 12: break-even card
  renderBreakEvenCard();
  updateTabBadges();
  renderLocationScopeBanner?.();
}


function studioSparkSvg(data, w, h, color) {
  if (!data || !data.length) return '';
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = Math.round((i / Math.max(data.length - 1, 1)) * w);
    const y = Math.round(h - (v / max) * h * 0.9);
    return `${x},${y}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" class="khayt-spark" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/></svg>`;
}

function renderDashKpiRow(ctx) {
  const { active, overdue, todayRev, receivables, revDeltaPct, sparkData } = ctx;
  if (!document.body.classList.contains('khayt-handoff')) return '';

  const deltaChip = (pct) => {
    if (pct === null || pct === undefined) return '';
    const up = pct >= 0;
    return `<span class="kbadge ${up ? 'delta-up' : 'delta-down'}" style="background:${up ? 'var(--ok-soft)' : 'var(--danger-soft)'}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span>`;
  };

  const cards = [
    { label: t('dash.active_orders'), value: active, unit: '' },
    { label: t('dash.overdue'), value: overdue, unit: '', alert: overdue > 0 },
    { label: t('dash.today_rev'), value: fmtMoney(todayRev), unit: currencySymbol(), spark: sparkData },
    { label: t('dash.receivables'), value: fmtMoney(receivables), unit: currencySymbol(), delta: revDeltaPct },
  ];

  return `<div class="khayt-grid khayt-dash-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:var(--gap)">
    ${cards.map(k => `
    <div class="card khayt-kpi${k.alert ? ' khayt-kpi-alert' : ''}">
      <div class="row between" style="align-items:flex-start">
        <span class="eyebrow">${escapeHtml(k.label)}</span>
        ${k.delta !== undefined ? deltaChip(k.delta) : ''}
      </div>
      <div class="row" style="align-items:baseline;gap:5px;margin-top:10px">
        <span class="metric" style="font-size:28px;color:var(--text)">${escapeHtml(String(k.value))}</span>
        ${k.unit ? `<span class="mono" style="font-size:13px;color:var(--text-muted)">${escapeHtml(k.unit)}</span>` : ''}
      </div>
      ${k.spark ? `<div style="margin-top:10px">${studioSparkSvg(k.spark, 220, 36, 'var(--accent)')}</div>` : ''}
    </div>`).join('')}
  </div>`;
}



/* ============================================================
   Filament performance analytics
   ============================================================ */
function renderFilamentAnalytics() {
  const el = $('#filamentPerfSection');
  if (!el) return;

  const agg = {};
  printLog
    .filter(o => o.status === 'completed')
    .forEach(o => {
      const parts = o.parts || [];
      if (parts.length === 0) return;
      const totalBase = parts.reduce((s, p) => s + (+p.baseCost || 0), 0);
      parts.forEach(p => {
        const key = p.filamentId || p.material || 'unknown';
        const filItem = inventory.find(i => i.id === p.filamentId);
        const label = p.material || filItem?.material || key;
        if (!agg[key]) agg[key] = { label, color: filItem?.color || '#888', orderIds: new Set(), revenue: 0, matCost: 0, timePerGrams: [] };

        agg[key].orderIds.add(o.id);

        const revShare = totalBase > 0 ? (+p.baseCost / totalBase) * +o.price : +o.price / parts.length;
        agg[key].revenue += revShare;

        const spoolC = +p.spoolCost || 0;
        const spoolW = Math.max(1, +p.spoolWeight || 1000);
        const pw = +p.printWeight || 0;
        agg[key].matCost += (spoolC / spoolW) * pw;

        if (o.actualPrintTime != null && o.actualWeight != null && o.actualWeight > 0 && o.printTime > 0) {
          const timeShare = (p.printTime / o.printTime) * o.actualPrintTime;
          const weightShare = pw > 0 ? pw : o.actualWeight / parts.length;
          if (weightShare > 0) agg[key].timePerGrams.push(timeShare / weightShare);
        }
      });
    });

  const rows = Object.values(agg).sort((a, b) => b.revenue - a.revenue);
  if (rows.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.filament_no_data'))}</p>`;
    return;
  }

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${escapeHtml(t('inv.material'))}</th>
          <th>${escapeHtml(t('an.filament_orders'))}</th>
          <th>${escapeHtml(t('an.revenue'))}</th>
          <th>${escapeHtml(t('an.filament_margin'))}</th>
          <th>${escapeHtml(t('an.filament_time_pg'))}</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const margin = r.revenue > 0 ? ((r.revenue - r.matCost) / r.revenue * 100) : 0;
            const avgTPG = r.timePerGrams.length > 0
              ? r.timePerGrams.reduce((s, v) => s + v, 0) / r.timePerGrams.length
              : null;
            const mCol = margin >= 60 ? 'var(--success)' : margin >= 30 ? 'var(--primary)' : 'var(--warning)';
            return `<tr>
              <td style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escapeHtml(r.color)};flex-shrink:0;border:1px solid rgba(255,255,255,0.15);"></span>
                <strong>${escapeHtml(r.label)}</strong>
              </td>
              <td style="font-variant-numeric:tabular-nums;">${r.orderIds.size}</td>
              <td style="font-variant-numeric:tabular-nums;color:var(--success);">${fmtPrice(r.revenue)}</td>
              <td style="font-weight:600;color:${mCol};">${margin.toFixed(0)}%</td>
              <td style="color:var(--text-dim);">${avgTPG != null ? (avgTPG * 100).toFixed(2) + ' ' + escapeHtml(t('common.hours')) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   Monthly material consumption trend chart
   ============================================================ */
function renderMaterialUsageChart() {
  const el = $('#materialUsageChart');
  if (!el) return;

  // Build last 6 months as keys
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString(i18n.current === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', year: '2-digit' }),
    });
  }

  // Aggregate usage per material per month
  const materialData = {};   // { materialName: { monthKey: grams } }
  for (const item of inventory) {
    if (!item.usageHistory || item.usageHistory.length === 0) continue;
    const mat = item.material || 'Unknown';
    if (!materialData[mat]) materialData[mat] = {};
    for (const h of item.usageHistory) {
      const mk = (h.date || '').slice(0, 7);
      if (!months.find(m => m.key === mk)) continue;
      materialData[mat][mk] = (materialData[mat][mk] || 0) + (+h.weightUsed || 0);
    }
  }

  const materials = Object.keys(materialData).filter(mat =>
    Object.values(materialData[mat]).some(v => v > 0)
  ).slice(0, 6); // max 6 materials for readability

  if (materials.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">${escapeHtml(t('an.mat_usage_empty') || 'No usage data yet. Spool weights update as orders complete.')}</p>`;
    return;
  }

  // Assign colors from inventory items
  const matColors = {};
  for (const mat of materials) {
    const invItem = inventory.find(i => i.material === mat);
    matColors[mat] = invItem?.color || '#5b9cf0';
  }

  // SVG stacked bar chart
  const W = 560, H = 180;
  const padL = 48, padR = 12, padT = 16, padB = 34;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW   = chartW / months.length;
  const gap    = Math.max(3, barW * 0.2);

  // Max total grams in any month
  const monthTotals = months.map(m =>
    materials.reduce((s, mat) => s + (materialData[mat][m.key] || 0), 0)
  );
  const maxG = Math.max(...monthTotals, 1);
  const TICKS = 4;

  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Grid + y-labels
  for (let i = 0; i <= TICKS; i++) {
    const y = padT + chartH - (i / TICKS) * chartH;
    const val = (maxG / TICKS) * i;
    const lbl = val >= 1000 ? (val / 1000).toFixed(1) + 'kg' : val.toFixed(0) + 'g';
    s += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#ffffff10" stroke-width="1"/>`;
    s += `<text x="${(padL - 5).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="#6b7793">${escapeHtml(lbl)}</text>`;
  }

  // Stacked bars
  months.forEach((m, i) => {
    const x = padL + i * barW + gap / 2;
    const bw = barW - gap;
    let yOff = padT + chartH;
    for (const mat of materials) {
      const grams = materialData[mat][m.key] || 0;
      if (grams <= 0) continue;
      const bh = Math.max(2, (grams / maxG) * chartH);
      yOff -= bh;
      s += `<rect x="${x.toFixed(1)}" y="${yOff.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${escapeHtml(matColors[mat])}" rx="2" opacity="0.82"/>`;
    }
    // Month label
    const cx = (x + bw / 2).toFixed(1);
    s += `<text x="${cx}" y="${(padT + chartH + 18).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#6b7793">${escapeHtml(m.label)}</text>`;
  });

  s += `</svg>`;

  // Legend
  const legendHtml = materials.map(mat =>
    `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text-dim);">
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${escapeHtml(matColors[mat])};"></span>
      ${escapeHtml(mat)}
    </span>`
  ).join('');

  el.innerHTML = `
    <div style="overflow-x:auto;">${s}</div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:6px;padding:0 4px;">${legendHtml}</div>`;
}

  const api = {
    buildStudioDashboardPanels,
    renderDashboard,
    studioSparkSvg,
    renderDashKpiRow,
    renderFilamentAnalytics,
    renderMaterialUsageChart,
  };

  Object.assign(global, api);
  global.KhaytDashboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
