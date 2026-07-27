/**
 * Meridian screens — the schedule that replaces the card dashboard.
 *
 * WHY A SCHEDULE
 *
 * A print shop's binding constraint is time on machines: a job occupies one
 * printer for hours, and the owner's real questions are "what is running, when
 * does it free up, and what is going to be late". Every other Khayt dashboard
 * answers those with tiles and lists — counts of a thing, not the shape of the
 * day. This one puts an hour axis across the top and a lane per machine under
 * it, so occupancy, gaps and collisions are visible as geometry instead of
 * having to be inferred from a queue list.
 *
 * WHAT IS REAL AND WHAT IS INFERRED — stated plainly, because a schedule that
 * quietly invents times would be worse than no schedule:
 *
 *   - A PRINTING job's start is real when the order carries printingStartedAt;
 *     its width is printTime hours. Those come from the order.
 *   - A QUEUED job has no start time in the data model. Khayt does not schedule
 *     work — nothing assigns a slot. So queued jobs are laid out by PROJECTION:
 *     packed onto their assigned machine's lane after whatever is already
 *     running. The lane marks them projected, and the legend says so.
 *   - Jobs with no machine cannot be placed on any lane and go to the staging
 *     strip underneath, which is the honest place for them.
 *
 * The projection is deliberately simple (first-fit, in queue order). It is a
 * picture of what the queue implies, not a promise, and calling it a plan would
 * be the kind of number-that-lies this codebase has spent several releases
 * removing.
 */
(function (global) {
  const HOURS_BEFORE = 2;   // context to the left of now
  const HOURS_SPAN = 14;    // hours drawn on the axis

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function tr(key, fallback) {
    try {
      const v = (typeof t === 'function') ? t(key) : null;
      return (v && v !== key) ? v : fallback;
    } catch (_) { return fallback; }
  }

  const num = (v) => (Number.isFinite(+v) ? +v : 0);

  function scopedOrders() {
    const log = (typeof printLog !== 'undefined' && Array.isArray(printLog)) ? printLog : [];
    return (typeof orderMatchesActiveLocation === 'function')
      ? log.filter(orderMatchesActiveLocation) : log;
  }

  function scopedMachines() {
    const m = (typeof machines !== 'undefined' && Array.isArray(machines)) ? machines : [];
    return (typeof machineMatchesActiveLocation === 'function')
      ? m.filter(machineMatchesActiveLocation) : m;
  }

  /** Axis origin: HOURS_BEFORE before now, rounded down to the hour. */
  function axisStart(now) {
    const d = new Date(now.getTime());
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() - HOURS_BEFORE);
    return d;
  }

  const hoursBetween = (a, b) => (b.getTime() - a.getTime()) / 3600000;

  function stateOf(order, now) {
    if (order.status === 'completed') return 'done';
    if (order.status === 'printing') return 'run';
    const due = order.dueDate ? new Date(order.dueDate + 'T23:59:59') : null;
    if (due && due < now) return 'late';
    if (order.status === 'on_hold' || order.blocked) return 'hold';
    return 'queue';
  }

  const STATE_LABEL = {
    run:   ['dash.mrd_running', 'Printing'],
    queue: ['dash.mrd_queued', 'Queued'],
    late:  ['dash.mrd_late', 'Overdue'],
    done:  ['dash.mrd_done', 'Done'],
    hold:  ['dash.mrd_hold', 'On hold'],
  };

  /**
   * Place orders onto machine lanes.
   * Running jobs anchor to printingStartedAt; queued jobs are PROJECTED after
   * them, first-fit in queue order. Returns lanes + whatever could not be placed.
   */
  function buildLanes(orders, mach, now) {
    const start = axisStart(now);
    const lanes = mach.map((m) => ({ machine: m, blocks: [], cursor: null }));
    const byId = new Map(lanes.map((l) => [l.machine.id, l]));
    const staged = [];

    const active = orders.filter((o) => o.status !== 'completed' && o.status !== 'quote' && !o.archived);

    // Anchor the running work first — it is the only thing with a real start.
    for (const o of active.filter((x) => x.status === 'printing')) {
      const lane = byId.get(o.machineId);
      const dur = Math.max(0.25, num(o.printTime));
      if (!lane) { staged.push({ order: o, state: 'run', projected: false }); continue; }
      const began = o.printingStartedAt ? new Date(o.printingStartedAt) : now;
      const from = Math.max(0, hoursBetween(start, began));
      lane.blocks.push({ order: o, state: 'run', from, span: dur, projected: false });
      lane.cursor = Math.max(lane.cursor ?? 0, from + dur);
    }

    // Then project the queue onto whichever lane its machine names.
    for (const o of active.filter((x) => x.status !== 'printing')) {
      const lane = byId.get(o.machineId);
      const dur = Math.max(0.25, num(o.printTime));
      if (!lane) { staged.push({ order: o, state: stateOf(o, now), projected: true }); continue; }
      const from = Math.max(lane.cursor ?? hoursBetween(start, now), hoursBetween(start, now));
      lane.blocks.push({ order: o, state: stateOf(o, now), from, span: dur, projected: true });
      lane.cursor = from + dur;
    }

    return { lanes, staged, start };
  }

  function blockHtml(b) {
    const [k, f] = STATE_LABEL[b.state] || STATE_LABEL.queue;
    const label = escHtml(b.order.project || b.order.id || '');
    const title = `${label} · ${escHtml(tr(k, f))}${b.projected ? ` · ${escHtml(tr('dash.mrd_projected', 'projected'))}` : ''}`;
    return `<button type="button" class="mrd-block mrd-${b.state}${b.projected ? ' mrd-proj' : ''}"
      style="--from:${b.from.toFixed(3)};--span:${b.span.toFixed(3)}"
      data-order-id="${escHtml(b.order.id || '')}" title="${title}">
      <span class="mrd-block-label">${label}</span>
      <span class="mrd-block-meta">${b.span.toFixed(1)}h</span>
    </button>`;
  }

  function axisHtml(start, now) {
    let cells = '';
    for (let i = 0; i < HOURS_SPAN; i++) {
      const d = new Date(start.getTime() + i * 3600000);
      const strong = d.getHours() % 6 === 0;
      cells += `<div class="mrd-hour${strong ? ' strong' : ''}">
        <span>${String(d.getHours()).padStart(2, '0')}</span></div>`;
    }
    const nowAt = hoursBetween(start, now);
    return `<div class="mrd-axis">
      <div class="mrd-axis-gutter">${escHtml(tr('dash.mrd_machines', 'Printers'))}</div>
      <div class="mrd-axis-track">
        ${cells}
        <div class="mrd-nowline" id="mrdNowLine" style="--at:${nowAt.toFixed(3)}">
          <span class="mrd-nowflag">${escHtml(tr('dash.mrd_now', 'now'))}</span>
        </div>
      </div>
    </div>`;
  }

  function laneHtml(lane, start, now) {
    const m = lane.machine;
    const blocks = lane.blocks
      .filter((b) => b.from < HOURS_SPAN && (b.from + b.span) > 0)
      .map(blockHtml).join('');
    const running = lane.blocks.some((b) => b.state === 'run');
    return `<div class="mrd-lane">
      <div class="mrd-lane-gutter">
        <span class="mrd-dot${running ? ' on' : ''}" aria-hidden="true"></span>
        <span class="mrd-lane-name">${escHtml(m.name || m.id || '')}</span>
      </div>
      <div class="mrd-lane-track">${blocks || `<span class="mrd-lane-empty">${escHtml(tr('dash.mrd_free', 'free'))}</span>`}</div>
    </div>`;
  }

  function legendHtml() {
    const item = (cls, k, f) => `<span class="mrd-key"><i class="mrd-sw mrd-${cls}"></i>${escHtml(tr(k, f))}</span>`;
    return `<div class="mrd-legend">
      ${item('run', 'dash.mrd_running', 'Printing')}
      ${item('queue', 'dash.mrd_queued', 'Queued')}
      ${item('late', 'dash.mrd_late', 'Overdue')}
      ${item('hold', 'dash.mrd_hold', 'On hold')}
      <span class="mrd-key mrd-note">${escHtml(tr('dash.mrd_proj_note', 'Hatched blocks are projected from the queue — Khayt does not assign start times.'))}</span>
    </div>`;
  }

  function renderDashboard(host) {
    if (!document.body.classList.contains('khayt-meridian')) return false;
    if (!host) return false;

    const now = new Date();
    const orders = scopedOrders();
    const mach = scopedMachines();
    const { lanes, staged, start } = buildLanes(orders, mach, now);

    const attn = (typeof KhaytDashboard !== 'undefined' && KhaytDashboard.buildAttentionBar)
      ? KhaytDashboard.buildAttentionBar(
        (typeof KhaytAttention !== 'undefined' && KhaytAttention.compute)
          ? KhaytAttention.compute({ orders, machines: mach }) : null,
        mach.length,
      ) : '';

    const lanesHtml = lanes.length
      ? lanes.map((l) => laneHtml(l, start, now)).join('')
      : `<div class="mrd-empty">${escHtml(tr('dash.no_machines', 'No printers yet'))}</div>`;

    const stagedHtml = staged.length
      ? staged.slice(0, 12).map((s) => `
        <button type="button" class="mrd-chip mrd-${s.state}" data-order-id="${escHtml(s.order.id || '')}">
          <span>${escHtml(s.order.project || s.order.id || '')}</span>
          <span class="mrd-chip-h">${Math.max(0.25, num(s.order.printTime)).toFixed(1)}h</span>
        </button>`).join('')
      : `<span class="mrd-empty-inline">${escHtml(tr('dash.mrd_nothing_staged', 'Nothing waiting on a printer'))}</span>`;

    host.innerHTML = `<div class="mrd-dash">
      ${attn}
      <section class="mrd-sched" aria-label="${escHtml(tr('dash.mrd_schedule', 'Schedule'))}">
        ${axisHtml(start, now)}
        <div class="mrd-lanes">${lanesHtml}</div>
      </section>
      ${legendHtml()}
      <section class="mrd-staging" aria-label="${escHtml(tr('dash.mrd_staging', 'Unassigned work'))}">
        <h3>${escHtml(tr('dash.mrd_staging', 'Unassigned work'))}
          <span class="mrd-staging-sub">${escHtml(tr('dash.mrd_staging_sub', 'no printer chosen yet'))}</span>
        </h3>
        <div class="mrd-chips">${stagedHtml}</div>
      </section>
    </div>`;

    // Clicking a block or chip opens the order the same way every other screen
    // does, rather than this shell growing its own detail view.
    host.querySelectorAll('[data-order-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-order-id');
        if (!id) return;
        if (typeof openOrderDetail === 'function') openOrderDetail(id);
        else if (typeof switchTab === 'function') switchTab('queue-tab');
      });
    });

    return true;
  }

  /** Move the now-line without re-rendering the whole schedule (30s tick). */
  function tickNowLine() {
    const line = document.getElementById('mrdNowLine');
    if (!line) return;
    const now = new Date();
    line.style.setProperty('--at', hoursBetween(axisStart(now), now).toFixed(3));
  }

  global.KhaytMeridian = { renderDashboard, tickNowLine, buildLanes };
})(typeof window !== 'undefined' ? window : globalThis);
