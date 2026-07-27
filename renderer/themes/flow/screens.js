/**
 * Flow screens — the board that replaces the dashboard.
 *
 * WHY A BOARD
 *
 * Khayt already has a kanban board, but it lives on a tab you visit. That makes
 * it a report: you go and look at it. Flow inverts that — the board IS the home
 * screen, and moving a card is how you run the shop. Opening the app puts you
 * in front of the work with your hands already on it, rather than in front of a
 * summary of the work.
 *
 * That is the whole difference from the other designs. Workbench and Command
 * answer "how is the shop doing". Foreman answers "what must I deal with".
 * Meridian answers "what does today look like". Flow answers "where is
 * everything, and what do I want to move next" — and lets you move it.
 *
 * EVERY RULE IS BORROWED. A second board with its own opinions would quietly
 * disagree with the first: the queue would call an order late while the board
 * called it fine. So:
 *
 *   - columns and their order   → the same six statuses the kanban tab uses
 *   - WIP limits                → settings.wipLimits, the same map, same test
 *   - what counts as late       → KhaytAttention.selectAttention()
 *   - paid / part-paid / unpaid → payStatus(), with orderOwedBase() for sums
 *   - which orders are in scope → orderMatchesActiveLocation(), so the board
 *                                 respects the location filter like every
 *                                 other screen
 *
 * Money is gated on KhaytTiers.showsBusiness. Foreman shipped leaking revenue
 * into enthusiast mode and the theme e2e caught it, not review — so the gate
 * goes in at the point the value is produced, not at the point it is styled.
 */
(function (global) {
  /* The kanban tab's columns, in its order. Duplicating the list would let the
     two boards drift apart on the next status change. */
  const COLUMNS = [
    { status: 'pending',   key: 'queue.pending',   fallback: 'Pending',         lane: 'var(--flow-lane-1)' },
    { status: 'printing',  key: 'queue.printing',  fallback: 'Printing',        lane: 'var(--flow-lane-2)' },
    { status: 'post',      key: 'queue.post',      fallback: 'Post-Processing', lane: 'var(--flow-lane-3)' },
    { status: 'qc',        key: 'queue.qc',        fallback: 'QC',              lane: 'var(--flow-lane-4)' },
    { status: 'completed', key: 'queue.completed', fallback: 'Completed',       lane: 'var(--flow-lane-5)' },
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function tr(key, fallback, vars) {
    if (typeof t === 'function') {
      const v = t(key, vars);
      if (v && v !== key) return v;
    }
    if (vars && fallback) {
      let s = fallback;
      for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, String(vars[k]));
      return s;
    }
    return fallback;
  }

  function showsMoney() {
    return (typeof KhaytTiers !== 'undefined' && KhaytTiers.showsBusiness)
      ? KhaytTiers.showsBusiness(typeof settings !== 'undefined' ? settings.mode : undefined)
      : false;
  }

  /** Orders in scope, honouring the location filter the rest of the app uses. */
  function boardOrders() {
    const all = (typeof printLog !== 'undefined' && Array.isArray(printLog)) ? printLog : [];
    return (typeof orderMatchesActiveLocation === 'function')
      ? all.filter(orderMatchesActiveLocation)
      : all;
  }

  /** Ids the shared attention engine considers overdue — borrowed, not re-derived. */
  function lateOrderIds() {
    const ids = new Set();
    try {
      const attn = global.KhaytAttention?.selectAttention?.({
        machines: typeof machines !== 'undefined' ? machines : [],
        orders: boardOrders(),
        settings: typeof settings !== 'undefined' ? settings : {},
      }) || [];
      for (const a of attn) if (a.orderId) ids.add(a.orderId);
    } catch (_) { /* attention is advisory; a board still renders without it */ }
    return ids;
  }

  function wipLimitFor(status) {
    const map = (typeof settings !== 'undefined' && settings.wipLimits) || {};
    return +map[status] || 0;
  }

  function cardHtml(o, late, money) {
    const chips = [];
    if (late.has(o.id)) {
      chips.push(`<span class="flow-chip late">${esc(tr('flow.late', 'late'))}</span>`);
    }
    if (money && typeof payStatus === 'function') {
      const ps = payStatus(o);
      if (ps === 'paid') chips.push(`<span class="flow-chip ok">${esc(tr('flow.paid', 'paid'))}</span>`);
      else if (ps === 'partial') chips.push(`<span class="flow-chip unpaid">${esc(tr('flow.part_paid', 'part-paid'))}</span>`);
      else chips.push(`<span class="flow-chip unpaid">${esc(tr('flow.unpaid', 'unpaid'))}</span>`);
    }
    const machine = o.machine || o.machineId || '';
    const meta = [];
    if (o.client) meta.push(esc(String(o.client)));
    if (machine) meta.push(esc(String(machine)));
    if (money && typeof fmtPrice === 'function' && +o.price) meta.push(esc(fmtPrice(+o.price)));

    return `<article class="flow-card" draggable="true" tabindex="0"
        data-order-id="${esc(o.id)}" data-status="${esc(o.status || '')}"
        aria-label="${esc(o.project || o.id)}">
      <div class="flow-card-title">${esc(o.project || o.id)}</div>
      ${meta.length ? `<div class="flow-card-meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>` : ''}
      ${chips.length ? `<div class="flow-card-meta">${chips.join('')}</div>` : ''}
    </article>`;
  }

  function columnHtml(col, orders, late, money) {
    const mine = orders.filter((o) => o.status === col.status);
    const limit = wipLimitFor(col.status);
    const over = limit > 0 && mine.length > limit;
    const cards = mine.length
      ? mine.map((o) => cardHtml(o, late, money)).join('')
      : `<div class="flow-empty">${esc(tr('flow.empty_col', 'Nothing here'))}</div>`;

    return `<section class="flow-col${over ? ' over-wip' : ''}" data-status="${esc(col.status)}" style="--lane:${col.lane};">
      <header class="flow-col-head">
        <span class="flow-col-title">${esc(tr(col.key, col.fallback))}</span>
        ${over ? `<span class="flow-col-wip">${esc(tr('flow.over_wip', 'over {n}', { n: limit }))}</span>` : ''}
        <span class="flow-col-count">${mine.length}</span>
      </header>
      <div class="flow-col-list" data-drop="${esc(col.status)}">${cards}</div>
    </section>`;
  }

  function stripHtml(orders, late, money) {
    const active = orders.filter((o) => ['pending', 'printing', 'post', 'qc'].includes(o.status)).length;
    const bits = [
      `<span>${esc(tr('flow.in_flight', 'In flight'))}: <b>${active}</b></span>`,
    ];
    if (late.size) {
      bits.push(`<span class="alert">${esc(tr('flow.n_late', '{n} late', { n: late.size }))}</span>`);
    }
    if (money && typeof payStatus === 'function' && typeof orderOwedBase === 'function') {
      let owed = 0;
      for (const o of orders) if (payStatus(o) !== 'paid') owed += orderOwedBase(o) || 0;
      if (owed > 0 && typeof fmtPrice === 'function') {
        bits.push(`<span>${esc(tr('flow.owed', 'Owed'))}: <b>${esc(fmtPrice(owed))}</b></span>`);
      }
    }
    bits.push(`<span>${esc(tr('flow.drag_hint', 'Drag a card to move it'))}</span>`);
    return `<div class="flow-strip">${bits.join('')}</div>`;
  }

  /**
   * Returns true when it has taken over the dashboard element. dashboard.js
   * falls through to the generic dashboard on false, so a failure here degrades
   * to the shared home rather than to a blank screen.
   */
  function renderDashboard(el) {
    if (!el || !document.body.classList.contains('khayt-flow')) return false;
    const orders = boardOrders();
    const late = lateOrderIds();
    const money = showsMoney();

    el.innerHTML = `
      ${stripHtml(orders, late, money)}
      <div class="flow-board" role="list">
        ${COLUMNS.map((c) => columnHtml(c, orders, late, money)).join('')}
      </div>`;

    global.KhaytFlowShell?.wireBoard?.(el);
    return true;
  }

  global.KhaytFlow = { renderDashboard, COLUMNS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
