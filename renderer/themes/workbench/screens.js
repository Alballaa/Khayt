/**
 * Workbench theme — custom screen renderers wired to REAL app data.
 *
 * Mirrors the studio-cards hook pattern (window.KhaytStudio.renderClientsStudioCards):
 * the shared `render*` functions delegate here when the Workbench theme is active,
 * and this module emits the `design/proto-a-workbench.html` markup populated from
 * the same globals the legacy dashboard reads (printLog, machines,
 * machineStatusCache, inventory, settings, quote-followup selector, etc.).
 *
 * Visual contract: markup/classes mirror the prototype's Dashboard screen. The
 * matching CSS lives in `renderer/themes/workbench/screens.css`. All colors come
 * from the `--wb-*` / `--ink-*` / `--line` / `--accent` tokens in tokens.css so
 * light-default + dark + accent swaps all work without changes here.
 */
(function (global) {
  function isOn() {
    return typeof document !== 'undefined'
      && document.body.classList.contains('khayt-workbench');
  }

  // Translate with graceful English fallback (follows language switches).
  function tr(key, fallback) {
    const s = (typeof t === 'function') ? t(key) : null;
    return (s && s !== key) ? s : fallback;
  }

  // Inline SVG glyphs lifted from the prototype (stroked, 24-grid).
  const ICON = {
    money: '<path d="M3 6h18v12H3z"/><path d="M3 10h18M7 14h4"/>',
    printer: '<rect x="6" y="3" width="12" height="6" rx="1"/><path d="M6 14H4a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2"/><rect x="6" y="13" width="12" height="8" rx="1"/>',
    inv: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    queue: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/>',
    warn: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h2M8 14h2M8 18h2M14 10h2v8h-2z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  function svg(path, w = 14) {
    return `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor"`
      + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  // Map a token name (e.g. var(--wb-blue)) to its companion soft-bg token for tinting.
  const CHIP = {
    blue: { fg: 'var(--wb-blue)', bg: 'var(--wb-blue-bg)' },
    green: { fg: 'var(--wb-green)', bg: 'var(--wb-green-bg)' },
    red: { fg: 'var(--wb-red)', bg: 'var(--wb-red-bg)' },
    amber: { fg: 'var(--wb-amber)', bg: 'var(--wb-amber-bg)' },
    purple: { fg: 'var(--wb-purple)', bg: 'var(--wb-purple-bg)' },
    teal: { fg: 'var(--wb-teal)', bg: 'var(--wb-teal-bg)' },
    gray: { fg: 'var(--ink-2)', bg: 'rgba(120,130,150,.14)' },
  };

  function chip(cls, label) {
    const c = CHIP[cls] || CHIP.gray;
    return `<span class="wb-chip" style="color:${c.fg};background:${c.bg}">`
      + `<span class="wb-cd" style="background:${c.fg}"></span>${escapeHtml(label)}</span>`;
  }

  // Top-level `let clients` lives in the shared global lexical scope, not on
  // window — reach it via the bare identifier (guarded for safety).
  function findClient(id) {
    if (!id || typeof clients === 'undefined' || !Array.isArray(clients)) return null;
    return clients.find((c) => c.id === id) || null;
  }

  function fmtMoneyVal(n) {
    return (typeof fmtMoney === 'function') ? fmtMoney(n) : String(Math.round(+n || 0));
  }
  function ccy() {
    return (typeof currencySymbol === 'function') ? currencySymbol() : 'SAR';
  }

  // Bucket a queue status into one of the prototype's chip colors.
  function statusChipClass(status) {
    switch (status) {
      case 'printing': return 'blue';
      case 'completed': return 'green';
      case 'qc': return 'green';
      case 'post': return 'purple';
      case 'on_hold': return 'gray';
      case 'pending': return 'amber';
      case 'quote': return 'teal';
      default: return 'gray';
    }
  }

  /* ---------- KPI stat tile ---------- */
  function statTile(label, value, delta, deltaCls, iconPath, tokenColor) {
    const deltaHtml = delta
      ? `<div class="wb-stat-d ${deltaCls}">${escapeHtml(delta)}</div>`
      : '<div class="wb-stat-d mut"></div>';
    return `<div class="wb-stat">
      <div class="wb-stat-badge" style="background:color-mix(in srgb, ${tokenColor} 12%, transparent);color:${tokenColor}">${svg(iconPath, 16)}</div>
      <div class="wb-stat-k">${escapeHtml(label)}</div>
      <div class="wb-stat-v">${escapeHtml(value)}</div>
      ${deltaHtml}
    </div>`;
  }

  /* ---------- "Today's work" list row ---------- */
  function jobRow(order) {
    const title = order.project || tr('inv.walk_in', 'Walk-in');
    const cls = statusChipClass(order.status);
    const label = tr('queue.' + order.status, order.status);
    // Subtitle: client + due hint, reusing the shared due-date language.
    // Enthusiast (hobbyist) mode has no clients — show project/id only.
    const showBiz = (typeof KhaytTiers !== 'undefined') ? KhaytTiers.showsBusiness(typeof settings !== 'undefined' ? settings.mode : undefined) : (typeof settings === 'undefined' || settings.mode !== 'enthusiast');
    const client = showBiz ? findClient(order.clientId) : null;
    const parts = [];
    if (client) parts.push(localName(client));
    if (order.dueDate) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = new Date(order.dueDate + 'T00:00:00');
      const diff = Math.round((due - today) / 86400000);
      if (diff < 0) parts.push(tr('oe.due_overdue', `${Math.abs(diff)}d overdue`));
      else if (diff === 0) parts.push(tr('dash.due_today_sub', 'due today'));
      else if (diff === 1) parts.push(tr('dash.due_tomorrow_sub', 'due tomorrow'));
      else parts.push(tr('oe.due_in', `due in ${diff}d`));
    }
    if (!parts.length) parts.push(order.id);
    const sub = parts.join(' · ');
    const pct = jobProgress(order);
    const pctHtml = pct != null
      ? `<span class="wb-tail-pct">${pct}%</span>` : '';
    return `<li>
      <span class="wb-attn-ico" style="background:color-mix(in srgb, ${CHIP[cls].fg} 12%, transparent);color:${CHIP[cls].fg}">${svg(ICON.printer)}</span>
      <div class="wb-li-text"><div class="wb-ttl">${escapeHtml(title)}</div><div class="wb-sub">${escapeHtml(sub)}</div></div>
      <span class="wb-tail">${pctHtml}${chip(cls, label)}</span>
    </li>`;
  }

  // Time-based progress estimate for a printing order (same math as the legacy floor).
  function jobProgress(order) {
    if (order.status !== 'printing' || !(+order.printTime > 0)) return null;
    const start = new Date(order.printingStartedAt || order.timerStart || Date.now()).getTime();
    return Math.min(99, Math.max(0, Math.round((Date.now() - start) / (order.printTime * 3600000) * 100)));
  }

  /* ---------- Fleet · live mini row ---------- */
  function fleetRow(machine, order) {
    // Prefer live telemetry from machineStatusCache (same source the kanban uses),
    // falling back to the time-based estimate, then idle.
    let pct = 0;
    let state = 'idle';
    const cache = (typeof machineStatusCache !== 'undefined') ? machineStatusCache[machine.id] : null;
    if (machine.isOffline) {
      state = 'error';
    } else if (cache && !cache.error) {
      pct = Math.min(100, Math.max(0, Math.round(+cache.progress || 0)));
      const st = (cache.state || '').toLowerCase();
      if (st.includes('print')) state = 'printing';
      else if (st.includes('error')) state = 'error';
      else if (pct > 0) state = 'printing';
    } else if (cache && cache.error) {
      state = 'error';
    } else if (order) {
      const est = jobProgress(order);
      pct = est != null ? est : 0;
      state = 'printing';
    }
    const jobName = order ? (order.project || order.id) : tr('dash.idle_dash', '— idle —');
    let cls = 'blue';
    if (state === 'error') cls = 'red';
    else if (state === 'idle') cls = 'gray';
    const c = CHIP[cls];
    const fill = cls === 'gray'
      ? 'background:var(--line)'
      : cls === 'red'
        ? 'background:linear-gradient(90deg,var(--wb-red),#f47a72)'
        : '';
    const tail = state === 'idle'
      ? tr('mach.status_idle', 'idle')
      : state === 'error'
        ? tr('mach.offline', 'offline')
        : `${pct}%`;
    return `<div class="wb-fm-row">
      <span class="wb-fm-nm">${escapeHtml(machine.name)}</span>
      <span class="wb-fm-job">${escapeHtml(jobName)}</span>
      <div class="wb-bar"><i style="width:${Math.max(pct, state === 'idle' ? 0 : 3)}%;${fill}"></i></div>
      <span class="wb-fm-pct" style="color:${state === 'idle' ? 'var(--ink-3)' : c.fg}">${escapeHtml(tail)}</span>
    </div>`;
  }

  /* ---------- "Needs attention" row ---------- */
  function attnRow(item) {
    return `<li>
      <span class="wb-attn-ico" style="background:${item.bg};color:${item.fg}">${svg(item.icon)}</span>
      <div class="wb-li-text"><div class="wb-ttl">${escapeHtml(item.title)}</div><div class="wb-sub">${escapeHtml(item.sub)}</div></div>
      <span class="wb-tail">${chip(item.chip, item.chipLabel)}</span>
    </li>`;
  }

  /* ---------- Quick action tile ---------- */
  function qa(tab, label, tokenColor, iconPath) {
    return `<button type="button" class="wb-qa" data-act="goto-tab" data-tab="${escapeHtml(tab)}">
      <span class="wb-qa-glyph" style="background:${tokenColor}">${svg(iconPath)}</span>${escapeHtml(label)}</button>`;
  }

  /* =========================================================
     Dashboard
     ========================================================= */
  function renderDashboard(host) {
    if (!host || !isOn()) return false;

    const log = (typeof printLog !== 'undefined' && Array.isArray(printLog)) ? printLog : [];
    const mach = (typeof machines !== 'undefined' && Array.isArray(machines)) ? machines : [];
    const inv = (typeof inventory !== 'undefined' && Array.isArray(inventory)) ? inventory : [];
    const cfg = (typeof settings !== 'undefined') ? settings : {};
    // Mode separation: enthusiast = no commerce (revenue/receivables/quotes/clients);
    // the revenue delta is Pro depth. Personal stats fill vacated slots.
    const biz = (typeof KhaytTiers !== 'undefined') ? KhaytTiers.showsBusiness(cfg.mode) : cfg.mode !== 'enthusiast';
    const pro = (typeof KhaytTiers !== 'undefined') ? KhaytTiers.isProMode(cfg.mode) : (cfg.mode || 'professional') === 'professional';

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = (typeof localDateStr === 'function') ? localDateStr(today) : today.toISOString().slice(0, 10);

    /* ---- KPI figures (real) ---- */
    const todayDone = log.filter((o) => o.status === 'completed' && o.date === todayStr);
    const todayRev = todayDone.reduce((s, o) => s + orderRevenueBase(o), 0);
    const printHoursToday = todayDone.reduce((s, o) => s + (+o.printTime || 0), 0);
    // Yesterday revenue for the delta chip.
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    const yestStr = (typeof localDateStr === 'function') ? localDateStr(yest) : yest.toISOString().slice(0, 10);
    const yestRev = log
      .filter((o) => o.status === 'completed' && o.date === yestStr)
      .reduce((s, o) => s + orderRevenueBase(o), 0);
    const revDeltaPct = yestRev > 0 ? Math.round((todayRev - yestRev) / yestRev * 100) : null;
    const revDelta = revDeltaPct != null
      ? `${revDeltaPct >= 0 ? '▲' : '▼'} ${Math.abs(revDeltaPct)}% ${tr('dash.vs_yest', 'vs yest')}`
      : '';
    const revDeltaCls = revDeltaPct == null ? 'mut' : revDeltaPct >= 0 ? 'up' : 'dn';

    const nowPrinting = log.filter((o) => o.status === 'printing');
    // "finishing < 1h" — printing orders whose time-based estimate exceeds 90%.
    const finishingSoon = nowPrinting.filter((o) => {
      const p = jobProgress(o);
      return p != null && p >= 90;
    }).length;
    const activeSub = finishingSoon > 0
      ? tr('dash.wb_finishing', `${finishingSoon} finishing < 1h`).replace('{n}', finishingSoon)
      : '';

    // Filament used today (g) — usageHistory aggregation, same as legacy dashboard.
    const gToday = inv.reduce((s, item) => s
      + (item.usageHistory || [])
        .filter((h) => h.date === todayStr)
        .reduce((a, h) => a + (+h.weightUsed || 0), 0), 0);
    const kgToday = (gToday / 1000);
    const filamentVal = kgToday >= 1 ? `${kgToday.toFixed(1)} kg` : `${Math.round(gToday)} g`;
    // Remaining stock across low/active spools (informational sub).
    const totalRemainingG = inv.reduce((s, item) => s + (+item.weight || 0), 0);
    const filamentSub = totalRemainingG > 0
      ? tr('dash.wb_remaining', `${(totalRemainingG / 1000).toFixed(1)} kg in stock`).replace('{n}', (totalRemainingG / 1000).toFixed(1))
      : '';

    const openOrders = log.filter((o) => o.status !== 'completed' && o.status !== 'quote');
    const dueToday = openOrders.filter((o) => o.dueDate === todayStr).length;
    const dueSub = dueToday > 0
      ? tr('dash.wb_due_today', `${dueToday} due today`).replace('{n}', dueToday)
      : '';

    // Outstanding receivables — base owed across all non-fully-paid, non-void orders (business only).
    const outstanding = biz ? log
      .filter((o) => payStatus(o) !== 'paid' && payStatus(o) !== 'voided')
      .reduce((s, o) => s + orderOwedBase(o), 0) : 0;
    const outstandingCount = biz ? log.filter((o) => payStatus(o) !== 'paid' && payStatus(o) !== 'voided' && orderOwedBase(o) > 0).length : 0;
    const outstandingSub = outstandingCount > 0
      ? tr('dash.wb_invoices', `${outstandingCount} invoices`).replace('{n}', outstandingCount)
      : '';

    const revenueTile = biz
      ? statTile(tr('dash.wb_revenue_today', 'Revenue today'), `${fmtMoneyVal(todayRev)} ${ccy()}`, pro ? revDelta : '', pro ? revDeltaCls : 'mut', ICON.money, 'var(--wb-green)')
      : statTile(tr('dash.pstat_print_hours', 'Print hours today'), `${printHoursToday.toFixed(1)}h`, '', 'mut', ICON.printer, 'var(--wb-green)');
    const stats = [
      revenueTile,
      statTile(tr('dash.wb_active_prints', 'Active prints'), String(nowPrinting.length), activeSub, 'mut', ICON.printer, 'var(--wb-blue)'),
      statTile(tr('dash.wb_filament_today', 'Filament today'), filamentVal, filamentSub, 'mut', ICON.inv, 'var(--wb-amber)'),
      statTile(biz ? tr('dash.wb_open_orders', 'Open orders') : tr('dash.pstat_open_jobs', 'Open jobs'), String(openOrders.length), dueSub, dueToday > 0 ? 'dn' : 'mut', ICON.queue, 'var(--wb-purple)'),
    ].join('');

    /* ---- Today's work (real active orders) ---- */
    const ACTIVE_ORDER = ['printing', 'pending', 'post', 'qc', 'on_hold'];
    const todaysWork = openOrders
      .filter((o) => ACTIVE_ORDER.includes(o.status))
      .sort((a, b) => {
        // printing first, then by due date.
        const ap = a.status === 'printing' ? 0 : 1;
        const bp = b.status === 'printing' ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.dueDate || '~').localeCompare(b.dueDate || '~');
      })
      .slice(0, 8);
    const workHrs = todaysWork.reduce((s, o) => s + (+o.printTime || 0), 0);
    const workMeta = todaysWork.length
      ? `${todaysWork.length} ${tr('dash.wb_jobs', 'jobs')} · ${workHrs.toFixed(1)}h ${tr('dash.wb_est', 'est.')}`
      : '';
    const workBody = todaysWork.length
      ? todaysWork.map(jobRow).join('')
      : `<li class="wb-empty">${escapeHtml(tr('dash.all_clear', 'All clear'))}</li>`;

    /* ---- Fleet · live (real machines + telemetry) ---- */
    const fleetRows = mach.slice(0, 6).map((m) => {
      const job = nowPrinting.find((o) => o.machineId === m.id
        || (o.parts || []).some((p) => p.machineId === m.id));
      return fleetRow(m, job);
    }).join('');
    const liveCount = nowPrinting.length;

    /* ---- Needs attention (real signals) ---- */
    const attention = [];
    // Printer errors / offline.
    mach.forEach((m) => {
      const cache = (typeof machineStatusCache !== 'undefined') ? machineStatusCache[m.id] : null;
      const hasErr = m.isOffline || (cache && cache.error);
      if (hasErr) {
        attention.push({
          icon: ICON.warn, fg: 'var(--wb-red)', bg: 'var(--wb-red-bg)',
          title: tr('dash.wb_printer_issue', `${m.name} — needs attention`).replace('{name}', m.name),
          sub: cache && cache.error ? String(cache.error) : tr('mach.offline', 'Offline'),
          chip: 'red', chipLabel: tr('dash.wb_error', 'Error'),
        });
      }
    });
    // Low stock (via isLowStock).
    if (typeof isLowStock === 'function') {
      inv.filter(isLowStock).slice(0, 3).forEach((item) => {
        const unit = item.materialType === 'resin' ? 'mL' : 'g';
        attention.push({
          icon: ICON.inv, fg: 'var(--wb-amber)', bg: 'var(--wb-amber-bg)',
          title: `${item.material || tr('inv.material', 'Material')}`,
          sub: `${Math.round(+item.weight || 0)} ${unit} · ${tr('dash.wb_reorder_point', 'reorder point')}`,
          chip: 'amber', chipLabel: tr('dash.wb_low', 'Low'),
        });
      });
    }
    // Expiring / follow-up quotes via the shared selector (business modes only).
    const followUps = (biz && typeof KhaytQuoteFollowUp !== 'undefined' && typeof cfg === 'object')
      ? KhaytQuoteFollowUp.selectQuotesDueForFollowUp(log, cfg, Date.now())
      : [];
    followUps.slice(0, 3).forEach((q) => {
      const client = findClient(q.clientId);
      const bits = [`${fmtMoneyVal(q.price)} ${ccy()}`];
      if (client) bits.push(localName(client));
      attention.push({
        icon: ICON.money, fg: 'var(--wb-blue)', bg: 'var(--wb-blue-bg)',
        title: q.project || tr('dash.wb_quote', 'Quote') + ' ' + q.id,
        sub: bits.join(' · '),
        chip: 'blue', chipLabel: tr('dash.wb_due', 'Due'),
      });
    });
    // Overdue receivables (completed but unpaid past due) as a fallback signal (business only).
    if (biz && attention.length < 5) {
      log.filter((o) => o.status === 'completed' && payStatus(o) !== 'paid' && payStatus(o) !== 'voided' && orderOwedBase(o) > 0)
        .slice(0, 5 - attention.length).forEach((o) => {
          const client = findClient(o.clientId);
          const bits = [`${fmtMoneyVal(orderOwedBase(o))} ${ccy()}`];
          if (client) bits.push(localName(client));
          const payLbl = payStatus(o) === 'partial'
            ? tr('dash.wb_partial', 'balance due')
            : tr('dash.wb_unpaid', 'unpaid');
          attention.push({
            icon: ICON.money, fg: 'var(--wb-blue)', bg: 'var(--wb-blue-bg)',
            title: `${tr('dash.wb_invoice', 'Invoice')} ${o.id} ${payLbl}`,
            sub: bits.join(' · '),
            chip: 'blue', chipLabel: tr('dash.wb_due', 'Due'),
          });
        });
    }
    const attnTrimmed = attention.slice(0, 6);
    const attnBody = attnTrimmed.length
      ? attnTrimmed.map(attnRow).join('')
      : `<li class="wb-empty">${escapeHtml(tr('dash.all_clear', 'All clear'))}</li>`;

    /* ---- Compose ---- */
    host.innerHTML = `<div class="wb-dash">
      <div class="wb-stats">${stats}</div>

      <div class="wb-grid2">
        <div class="wb-col">
          <div class="wb-panel">
            <div class="wb-panel-h"><h3>${escapeHtml(tr('dash.wb_todays_work', "Today's work"))}</h3><span class="wb-meta">${escapeHtml(workMeta)}</span></div>
            <ul class="wb-glist">${workBody}</ul>
          </div>

          <div class="wb-section-title">${escapeHtml(tr('dash.wb_fleet_glance', 'Fleet · live'))}</div>
          <div class="wb-panel">
            <div class="wb-panel-h"><h3>${escapeHtml(tr('dash.wb_fleet', 'Fleet'))}</h3>${liveCount ? `<span class="wb-meta wb-live">${liveCount} ${escapeHtml(tr('dash.live', 'live'))}</span>` : ''}</div>
            <div class="wb-fleet-mini">${fleetRows || `<div class="wb-empty">${escapeHtml(tr('dash.no_machines', 'No printers yet'))}</div>`}</div>
          </div>
        </div>

        <div class="wb-col">
          <div class="wb-panel">
            <div class="wb-panel-h"><h3>${escapeHtml(tr('dash.needs_attention', 'Needs attention'))}</h3><span class="wb-meta">${attnTrimmed.length || ''}</span></div>
            <ul class="wb-glist">${attnBody}</ul>
          </div>

          <div class="wb-section-title">${escapeHtml(tr('dash.wb_quick_actions', 'Quick actions'))}</div>
          <div class="wb-panel wb-qa-grid">
            ${qa('calculator-tab', tr('dash.wb_estimate', 'Estimate'), 'var(--wb-purple)', ICON.calc)}
            ${qa('queue-tab', tr('dash.wb_add_job', 'Add job'), 'var(--wb-blue)', ICON.plus)}
            ${biz
              ? qa('logs-tab', tr('dash.wb_new_invoice', 'New invoice'), 'var(--wb-green)', ICON.money)
              : qa('waste-tab', tr('waste.log_from_card', 'Log waste'), 'var(--wb-green)', ICON.inv)}
            ${qa('inventory-tab', tr('dash.wb_add_stock', 'Add stock'), 'var(--wb-amber)', ICON.inv)}
          </div>
        </div>
      </div>
    </div>`;

    // Wire navigation buttons (same contract as the legacy dashboard).
    host.querySelectorAll('[data-act="goto-tab"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof switchTab === 'function') switchTab(btn.dataset.tab);
      });
    });

    if (typeof i18n !== 'undefined' && i18n.apply) i18n.apply(host);
    return true;
  }

  global.KhaytWorkbench = {
    isOn,
    renderDashboard,
  };
})(typeof window !== 'undefined' ? window : globalThis);
