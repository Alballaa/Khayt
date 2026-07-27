/**
 * Foreman screens — the docket that replaces the dashboard.
 *
 * WHY A DOCKET
 *
 * Every other Khayt home answers "how is the shop doing" — tiles of counts, or
 * (in Meridian) the shape of the day. None of them answers the question an
 * owner actually opens the app with: "what do I have to deal with, and am I
 * done yet?" A dashboard cannot answer that, because a dashboard has no end.
 *
 * So this home is a LIST YOU EMPTY. Every row is one decision with one action,
 * ranked worst-first, and the goal state is zero rows. That is a different
 * model from a dashboard, not a different skin on one: you work it top-down
 * and it tells you when you can stop.
 *
 * EVERY RULE HERE IS BORROWED, NOT INVENTED. A triage list that used its own
 * thresholds would quietly disagree with the rest of the app — the queue would
 * call an order fine while the docket called it late. So:
 *
 *   - stopped machines + overdue orders  → KhaytAttention.selectAttention()
 *   - unpaid                             → payStatus(o) !== 'paid', the same
 *                                          test the dashboard's unpaid section
 *                                          uses, with orderOwedBase for the sum
 *   - low material                       → isLowStock(), the shared helper the
 *                                          reorder engine already uses
 *   - idle printers                      → KhaytAttention.machineState() === 'idle'
 *
 * The only thing this module decides for itself is the ORDER, and that is
 * stated as a table rather than buried in a comparator.
 */
(function (global) {
  /* Worst first. Money owed outranks an idle machine; a stopped machine
     outranks everything, because it is the only one actively costing hours. */
  const RANK = { crit: 0, due: 1, cash: 2, stock: 3, idle: 4 };

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

  function money(n) {
    try {
      if (typeof fmtPrice === 'function') return fmtPrice(n);
    } catch (_) { /* fall through */ }
    return String(Math.round(+n || 0));
  }

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

  /**
   * Build the docket. Returns rows of
   * { key, sev, title, detail, action:{label,tab}, orderId?, machineId? }
   */
  function buildDocket() {
    const orders = scopedOrders();
    const mach = scopedMachines();
    const inv = (typeof inventory !== 'undefined' && Array.isArray(inventory)) ? inventory : [];
    const rows = [];

    // 1 + 2 — stopped machines and overdue work, straight from the shared selector.
    let attn = { items: [] };
    try {
      if (global.KhaytAttention?.selectAttention) {
        attn = global.KhaytAttention.selectAttention({
          machines: mach,
          orders,
          statusCache: (typeof machineStatusCache !== 'undefined' ? machineStatusCache : {}),
          now: Date.now(),
        }) || { items: [] };
      }
    } catch (_) { attn = { items: [] }; }

    for (const it of attn.items || []) {
      if (it.kind === 'machine') {
        rows.push({
          key: `m:${it.id}`, sev: 'crit', machineId: it.id,
          title: it.name || it.id,
          detail: it.state === 'error'
            ? tr('fm.machine_error', 'Reporting an error — nothing will print until it is cleared')
            : tr('fm.machine_offline', 'Not answering — it has stopped, this is not a missed poll'),
          action: { label: tr('fm.go_printers', 'Printers'), tab: 'machines-tab' },
        });
      } else if (it.kind === 'order') {
        rows.push({
          key: `o:${it.id}`, sev: 'due', orderId: it.id,
          title: it.name || it.id,
          detail: tr('fm.days_late', '{n} days past the promised date').replace('{n}', it.daysLate),
          action: { label: tr('fm.go_queue', 'Queue'), tab: 'queue-tab' },
        });
      }
    }

    // 3 — money owed. Same test the dashboard's unpaid section uses.
    //
    // Gated on the tier: enthusiast mode is a hobbyist who does not invoice, and
    // every other themed dashboard suppresses revenue there. A docket row saying
    // "240.00 SAR outstanding" would put money back on a screen the rest of the
    // app has deliberately cleared of it — which is what the theme e2e caught.
    const showsMoney = (typeof KhaytTiers !== 'undefined' && KhaytTiers.showsBusiness)
      ? KhaytTiers.showsBusiness(typeof settings !== 'undefined' ? settings.mode : undefined)
      : (typeof settings === 'undefined' || settings.mode !== 'enthusiast');
    if (showsMoney && typeof payStatus === 'function') {
      for (const o of orders) {
        if (o.status !== 'completed' || o.voidedAt) continue;
        if (payStatus(o) === 'paid') continue;
        const owed = (typeof orderOwedBase === 'function') ? orderOwedBase(o) : 0;
        if (!(owed > 0)) continue;
        rows.push({
          key: `p:${o.id}`, sev: 'cash', orderId: o.id,
          title: o.project || o.id,
          detail: tr('fm.owes', '{amt} outstanding').replace('{amt}', money(owed)),
          action: { label: tr('fm.go_orders', 'Orders'), tab: 'logs-tab' },
        });
      }
    }

    // 4 — material about to run out, via the shared helper (never a local rule).
    if (typeof isLowStock === 'function') {
      for (const item of inv) {
        let low = false;
        try { low = !!isLowStock(item); } catch (_) { low = false; }
        if (!low) continue;
        rows.push({
          key: `i:${item.id || item.name}`, sev: 'stock',
          title: item.name || item.id || '',
          detail: tr('fm.low_left', '{g} g left').replace('{g}', Math.round(+item.weight || 0)),
          action: { label: tr('fm.go_inventory', 'Inventory'), tab: 'inventory-tab' },
        });
      }
    }

    // 5 — capacity going unused, but only when there is work it could take.
    const waiting = orders.filter((o) => o && o.status !== 'completed' && o.status !== 'quote'
      && o.status !== 'printing' && !o.archived).length;
    if (waiting > 0 && global.KhaytAttention?.machineState) {
      for (const m of mach) {
        let st = 'idle';
        try {
          st = global.KhaytAttention.machineState(
            m, (typeof machineStatusCache !== 'undefined' ? machineStatusCache : {})[m.id], {},
          );
        } catch (_) { st = 'idle'; }
        if (st !== 'idle') continue;
        rows.push({
          key: `d:${m.id}`, sev: 'idle', machineId: m.id,
          title: m.name || m.id,
          detail: tr('fm.idle_with_work', 'Free, and {n} jobs are waiting').replace('{n}', waiting),
          action: { label: tr('fm.go_queue', 'Queue'), tab: 'queue-tab' },
        });
      }
    }

    rows.sort((a, b) => (RANK[a.sev] - RANK[b.sev]) || String(a.title).localeCompare(String(b.title)));
    return rows;
  }

  const SEV_LABEL = {
    crit:  ['fm.sev_crit', 'Stopped'],
    due:   ['fm.sev_due', 'Late'],
    cash:  ['fm.sev_cash', 'Unpaid'],
    stock: ['fm.sev_stock', 'Low stock'],
    idle:  ['fm.sev_idle', 'Idle'],
  };

  let focusKey = null;

  function rowHtml(r, i) {
    const [k, f] = SEV_LABEL[r.sev] || SEV_LABEL.idle;
    return `<button type="button" class="fm-row fm-${r.sev}${r.key === focusKey ? ' focused' : ''}"
      data-fm-key="${escHtml(r.key)}" data-fm-i="${i}" tabindex="-1">
      <span class="fm-sev">${escHtml(tr(k, f))}</span>
      <span class="fm-row-main">
        <span class="fm-row-title">${escHtml(r.title)}</span>
        <span class="fm-row-detail">${escHtml(r.detail)}</span>
      </span>
    </button>`;
  }

  function detailHtml(r) {
    if (!r) {
      return `<div class="fm-detail-empty">${escHtml(tr('fm.pick_one', 'Select something on the left.'))}</div>`;
    }
    const [k, f] = SEV_LABEL[r.sev] || SEV_LABEL.idle;
    return `<div class="fm-detail-card">
      <span class="fm-sev fm-${r.sev}">${escHtml(tr(k, f))}</span>
      <h2>${escHtml(r.title)}</h2>
      <p>${escHtml(r.detail)}</p>
      <div class="fm-actions">
        <button type="button" class="btn primary" data-fm-act="${escHtml(r.action.tab)}"
          ${r.orderId ? `data-fm-order="${escHtml(r.orderId)}"` : ''}>${escHtml(r.action.label)} →</button>
      </div>
    </div>`;
  }

  function renderDashboard(host) {
    if (!document.body.classList.contains('khayt-foreman')) return false;
    if (!host) return false;

    const rows = buildDocket();
    if (!rows.some((r) => r.key === focusKey)) focusKey = rows[0]?.key || null;
    const focused = rows.find((r) => r.key === focusKey) || null;

    const list = rows.length
      ? rows.map(rowHtml).join('')
      : `<div class="fm-clear">
           <strong>${escHtml(tr('fm.clear_title', 'Nothing needs you'))}</strong>
           <span>${escHtml(tr('fm.clear_sub', 'No stopped printers, nothing late, nothing unpaid.'))}</span>
         </div>`;

    host.innerHTML = `<div class="fm-shell">
      <section class="fm-docket" aria-label="${escHtml(tr('fm.docket', 'Docket'))}">
        <header class="fm-docket-head">
          <h2>${escHtml(tr('fm.docket', 'Docket'))}</h2>
          <span class="fm-count${rows.length ? '' : ' zero'}">${rows.length}</span>
        </header>
        <div class="fm-rows" id="fmRows">${list}</div>
        ${rows.length ? `<footer class="fm-hint">${escHtml(tr('fm.keys', 'J / K to move · Enter to open'))}</footer>` : ''}
      </section>
      <section class="fm-detail" aria-label="${escHtml(tr('fm.detail', 'Selected'))}">${detailHtml(focused)}</section>
    </div>`;

    host.querySelectorAll('[data-fm-key]').forEach((el) => {
      el.addEventListener('click', () => {
        focusKey = el.getAttribute('data-fm-key');
        renderDashboard(host);
      });
    });
    host.querySelectorAll('[data-fm-act]').forEach((el) => {
      el.addEventListener('click', () => {
        const orderId = el.getAttribute('data-fm-order');
        if (orderId && typeof openOrderDetail === 'function') { openOrderDetail(orderId); return; }
        const tab = el.getAttribute('data-fm-act');
        if (typeof switchTab === 'function') switchTab(tab);
      });
    });

    global.KhaytForemanShell?.syncDocketCount?.(rows.length);
    return true;
  }

  /** Keyboard triage: move the focus, open the focused row. */
  function moveFocus(delta) {
    const rows = buildDocket();
    if (!rows.length) return;
    let i = rows.findIndex((r) => r.key === focusKey);
    if (i < 0) i = 0; else i = Math.max(0, Math.min(rows.length - 1, i + delta));
    focusKey = rows[i].key;
    const host = document.getElementById('dashboardContent');
    if (host) renderDashboard(host);
    document.querySelector('.fm-row.focused')?.scrollIntoView({ block: 'nearest' });
  }

  function openFocused() {
    const r = buildDocket().find((x) => x.key === focusKey);
    if (!r) return;
    if (r.orderId && typeof openOrderDetail === 'function') { openOrderDetail(r.orderId); return; }
    if (typeof switchTab === 'function') switchTab(r.action.tab);
  }

  global.KhaytForeman = { renderDashboard, buildDocket, moveFocus, openFocused };
})(typeof window !== 'undefined' ? window : globalThis);
