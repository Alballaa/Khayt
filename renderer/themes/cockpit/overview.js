/**
 * Cockpit ops overview — fleet list, day timeline, attention feed.
 */
(function (global) {
  const DAY_START = 8;
  const DAY_END = 20;

  // Translate with graceful English fallback (works even if a key is missing).
  const tr = (k, d) => { const s = (typeof t === 'function') ? t(k) : null; return (s && s !== k) ? s : d; };

  const STATUS_META = {
    printing: { c: 'var(--c-print)', ink: '#fff', lk: 'cockpit.st.printing', label: 'Printing' },
    idle: { c: 'var(--ink-4)', ink: '#fff', lk: 'cockpit.st.idle', label: 'Idle' },
    error: { c: 'var(--c-error)', ink: '#fff', lk: 'cockpit.st.error', label: 'Error' },
    maint: { c: 'var(--c-maint)', ink: '#fff', lk: 'cockpit.st.maint', label: 'Maint' },
    offline: { c: 'var(--c-error)', ink: '#fff', lk: 'cockpit.st.offline', label: 'Offline' },
  };

  let selectedMachineId = null;

  function pct(hour) {
    return ((hour - DAY_START) / (DAY_END - DAY_START)) * 100;
  }

  function hourLabel(h) {
    return `${String(h).padStart(2, '0')}:00`;
  }

  function nowDecimal() {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }

  function machineStatus(machine) {
    if (machine.isOffline) return 'offline';
    const nowIso = new Date().toISOString();
    const inDowntime = (machine.downtimeBlocks || []).some((b) => b.to && b.to > nowIso);
    if (inDowntime) return 'maint';
    const printing = (typeof printLog !== 'undefined' ? printLog : []).find(
      (o) => o.status === 'printing' && o.machineId === machine.id,
    );
    if (printing) return 'printing';
    return 'idle';
  }

  function machineProgress(order) {
    if (!order?.printingStartedAt || !(+order.printTime > 0)) return 0;
    const elapsed = (Date.now() - new Date(order.printingStartedAt).getTime()) / 3600000;
    return Math.min(100, Math.round((elapsed / +order.printTime) * 100));
  }

  function machineBlocks(machine) {
    const blocks = [];
    const orders = (typeof printLog !== 'undefined' ? printLog : [])
      .filter((o) => o.machineId === machine.id && !['completed', 'quote', 'on_hold'].includes(o.status));

    orders.forEach((o, i) => {
      const start = DAY_START + 1 + i * 2.5;
      const span = Math.max(1.2, (+o.printTime || 1.5));
      const end = Math.min(DAY_END - 0.5, start + span);
      let state = 'queued';
      if (o.status === 'printing') state = 'print';
      else if (o.status === 'post') state = 'post';
      else if (o.status === 'qc') state = 'post';
      blocks.push({
        s: start,
        e: end,
        state,
        t: o.project || o.id,
        sub: o.status === 'printing' ? `${machineProgress(o)}%` : o.status.toUpperCase(),
      });
    });
    return blocks;
  }

  function bindOverviewEvents(root) {
    root.querySelectorAll('[data-ck-machine]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.ckMachine;
        selectedMachineId = selectedMachineId === id ? null : id;
        renderCockpitOverview();
      });
    });
    root.querySelectorAll('[data-ck-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tab = btn.dataset.ckAction;
        if (tab && typeof switchTab === 'function') switchTab(tab);
      });
    });
  }

  function renderFleetPanel() {
    const fleet = typeof machines !== 'undefined' ? machines : [];
    const printingN = fleet.filter((m) => machineStatus(m) === 'printing').length;
    const cards = fleet.map((m) => {
      const st = STATUS_META[machineStatus(m)] || STATUS_META.idle;
      const active = (typeof printLog !== 'undefined' ? printLog : []).find(
        (o) => o.status === 'printing' && o.machineId === m.id,
      );
      const progress = active ? machineProgress(active) : 0;
      const cls = ['ck-printer'];
      if (selectedMachineId === m.id) cls.push('sel');
      else if (selectedMachineId) cls.push('dim');
      return `
        <div class="${cls.join(' ')}" data-ck-machine="${escapeHtml(m.id)}"
          style="--st:${st.c};--st-ink:${st.ink}">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="nm" style="flex:1;min-width:0">${escapeHtml(m.name)}</span>
            <span class="tech">${escapeHtml((m.type || 'FDM').toUpperCase())}</span>
            <span class="ck-stbadge">${escapeHtml(tr(st.lk, st.label))}</span>
          </div>
          <div class="job" style="margin-top:5px">${escapeHtml(active?.project || active?.id || tr('cockpit.no_job', 'No active job'))}</div>
          <div class="meta" style="margin:2px 0 8px">${active ? `${progress}%` : escapeHtml(m.isOffline ? tr('cockpit.offline', 'Offline') : tr('cockpit.ready', 'Ready'))}</div>
          <div style="display:flex;align-items:center;gap:9px">
            <div class="ck-bar" style="flex:1"><i style="width:${progress}%"></i></div>
            <span class="mono" style="font-size:11px;font-weight:600;width:32px;text-align:end">${progress}%</span>
          </div>
        </div>`;
    }).join('');

    return `
      <section class="ck-panel">
        <div class="ck-phead">
          <h2>${escapeHtml(tr('cockpit.fleet', 'Fleet'))}</h2>
          <span class="n">${fleet.length} ${escapeHtml(tr('cockpit.machines', 'machines'))}</span>
          <span class="grow"></span>
          <span class="ck-live"></span>
          <span class="n">${printingN} ${escapeHtml(tr('cockpit.printing_label', 'printing'))}</span>
        </div>
        <div class="ck-pscroll">${cards || `<p class="muted" style="padding:8px">${escapeHtml(typeof t === 'function' ? t('mach.empty') : 'No machines')}</p>`}</div>
      </section>`;
  }

  function renderTimelinePanel() {
    const fleet = typeof machines !== 'undefined' ? machines : [];
    const hours = [];
    for (let h = DAY_START; h < DAY_END; h++) hours.push(h);
    const now = nowDecimal();
    const nowPct = pct(Math.min(Math.max(now, DAY_START), DAY_END));

    const rows = fleet.map((m) => {
      const blocks = machineBlocks(m);
      const cls = ['ck-row'];
      if (selectedMachineId === m.id) cls.push('sel');
      else if (selectedMachineId) cls.push('dim');
      const blockHtml = blocks.map((b) => `
        <div class="ck-block f-${b.state}"
          style="inset-inline-start:${pct(b.s)}%;width:${pct(b.e) - pct(b.s)}%"
          title="${escapeHtml(m.name + ' — ' + b.t)}">
          <span class="t">${escapeHtml(b.t)}</span>
          <span class="s">${escapeHtml(b.sub)}</span>
        </div>`).join('');
      return `<div class="${cls.join(' ')}" data-ck-machine="${escapeHtml(m.id)}" style="height:64px">${blockHtml}</div>`;
    }).join('');

    return `
      <section class="ck-panel">
        <div class="ck-phead">
          <h2>${escapeHtml(tr('cockpit.schedule', "Today's schedule"))}</h2>
          <span class="n">${hourLabel(DAY_START)} — ${hourLabel(DAY_END)}</span>
        </div>
        <div class="ck-legend">
          <span class="li"><span class="sw" style="background:var(--c-print)"></span>${escapeHtml(tr('cockpit.leg.printing', 'Printing'))}</span>
          <span class="li"><span class="sw" style="background:var(--c-post)"></span>${escapeHtml(tr('cockpit.leg.post', 'Post'))}</span>
          <span class="li"><span class="sw" style="background:var(--c-maint)"></span>${escapeHtml(tr('cockpit.leg.maint', 'Maint'))}</span>
          <span class="li"><span class="sw" style="border:1.5px dashed var(--line-soft);background:transparent"></span>${escapeHtml(tr('cockpit.leg.queued', 'Queued'))}</span>
        </div>
        <div class="ck-tl">
          <div class="ck-tlgrid">
            <div class="ck-hours">${hours.map((h) => `<span class="h">${hourLabel(h)}</span>`).join('')}</div>
            <div class="ck-rows">
              <div class="ck-vlines">${hours.map((h) => '<i></i>').join('')}</div>
              ${rows}
              <div class="ck-now" style="inset-inline-start:${nowPct}%">
                <span class="chip">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  }

  function renderFeedPanel() {
    const alerts = typeof buildNotifications === 'function' ? buildNotifications().slice(0, 6) : [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = (typeof printLog !== 'undefined' ? printLog : [])
      .filter((o) => o.dueDate && o.status !== 'completed' && o.status !== 'quote')
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 6);

    // buildNotifications() returns title/body already HTML-escaped, so they are
    // interpolated as trusted markup here (double-escaping would render entities
    // literally). icon is not escaped at the source, so escape it defensively.
    const attnHtml = alerts.map((a, i) => `
      <div class="ck-attn${i === 0 ? ' hot' : ''}">
        <div class="ic" style="background:var(--c-error)">${escapeHtml(String(a.icon || '!'))}</div>
        <div style="min-width:0;display:flex;flex-direction:column">
          <span class="tt">${a.title || ''} ${a.body || ''}</span>
          <button type="button" class="act" data-ck-action="queue-tab">${escapeHtml(typeof t === 'function' ? t('common.view') : 'View')}</button>
        </div>
      </div>`).join('');

    // Mode separation: enthusiast (hobbyist) has no clients/revenue — hide the
    // client name + per-order price, and swap "booked" for print hours.
    const biz = (typeof KhaytTiers !== 'undefined') ? KhaytTiers.showsBusiness(settings.mode) : (typeof settings === 'undefined' || settings.mode !== 'enthusiast');
    const dueHtml = due.map((o) => {
      const hot = o.dueDate && new Date(o.dueDate + 'T00:00:00') <= today;
      const client = biz ? (typeof clients !== 'undefined' ? clients : []).find((c) => c.id === o.clientId) : null;
      return `
        <div class="ck-due">
          <span class="id">${escapeHtml(o.id)}</span>
          <span class="who" style="flex:1;min-width:0">${escapeHtml(biz ? (client?.name || o.project || '') : (o.project || o.id))}</span>
          ${biz ? `<span class="val">${typeof fmtMoney === 'function' ? fmtMoney(typeof orderRevenueBase === 'function' ? orderRevenueBase(o) : 0) : ''}</span>` : ''}
          <span class="tag" style="background:${hot ? 'var(--c-error)' : 'var(--surface-3)'};color:${hot ? '#fff' : 'var(--ink-2)'}">${escapeHtml(o.dueDate || '')}</span>
        </div>`;
    }).join('');

    const todayStr = typeof localDateStr === 'function' ? localDateStr(today) : '';
    const completedToday = (typeof printLog !== 'undefined' ? printLog : []).filter((o) => o.status === 'completed' && o.date === todayStr);
    const doneToday = completedToday.length;
    const revToday = completedToday.reduce((s, o) => s + (typeof orderRevenueBase === 'function' ? orderRevenueBase(o) : 0), 0);
    const hoursToday = completedToday.reduce((s, o) => s + (+o.printTime || 0), 0);

    return `
      <section class="ck-panel">
        <div class="ck-phead">
          <h2>${escapeHtml(tr('cockpit.attention', 'Attention'))}</h2>
          <span class="n">${alerts.length}</span>
        </div>
        <div class="ck-pscroll">
          ${attnHtml || `<p class="muted">${escapeHtml(typeof t === 'function' ? t('notif.empty') : 'All clear')}</p>`}
          <div class="ck-sechead">${escapeHtml(tr('cockpit.due_next', 'Due next'))}</div>
          <div style="padding:0 2px">${dueHtml || `<p class="muted" style="font-size:12px">—</p>`}</div>
          <div class="ck-sechead">${escapeHtml(tr('cockpit.today_so_far', 'Today so far'))}</div>
          <div class="ck-sum">
            <div class="ck-sumcell"><span class="v">${doneToday}</span><span class="l">${escapeHtml(tr('cockpit.jobs_done', 'jobs done'))}</span></div>
            ${biz
              ? `<div class="ck-sumcell"><span class="v">${typeof fmtMoney === 'function' ? fmtMoney(revToday) : revToday}</span><span class="l">${escapeHtml(tr('cockpit.booked', 'booked'))}</span></div>`
              : `<div class="ck-sumcell"><span class="v">${hoursToday.toFixed(1)}h</span><span class="l">${escapeHtml(tr('dash.pstat_print_hours', 'Print hours today'))}</span></div>`}
          </div>
        </div>
      </section>`;
  }

  function renderCockpitOverview() {
    const el = document.getElementById('dashboardContent');
    if (!el || !document.body.classList.contains('khayt-cockpit')) return;
    el.innerHTML = `
      <div class="ck-dash">
        ${renderFleetPanel()}
        ${renderTimelinePanel()}
        ${renderFeedPanel()}
      </div>`;
    bindOverviewEvents(el);
    global.KhaytCockpitShell?.syncCockpitStats?.();
  }

  global.KhaytCockpitOverview = {
    render: renderCockpitOverview,
    machineStatus,
  };
})(typeof window !== 'undefined' ? window : globalThis);
