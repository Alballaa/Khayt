/* ============================================================
   Production queue — grouped list view
   ============================================================

   The default board. Kanban stays one click away, but it answers a different
   question: it is built for moving work along, and makes you sweep seven
   columns to answer "what needs me right now". The list groups by the state of
   the work, pulls anything blocked to the top regardless of its status, and
   totals what is outstanding at the foot.

   Two deliberate constraints:

   - It renders INSIDE `.kanban`. Every queue action is delegated from that
     element (see wire-events.js), so rendering here inherits start/hold/advance
     and the rest with no new wiring and no second dispatcher to drift.
   - The kanban columns stay in the DOM, hidden by CSS rather than removed.
     Other code and the e2e suites address `#list-pending` and count
     `.kanban-col`; taking them out would break contracts this view has no
     business touching.

   Grouping and totals are decided by lib/queue-groups.js, which is pure and
   tested. This file only draws.
   ============================================================ */
(function (global) {

  /** Group heading copy. Falls back to English so a missing key never renders a key. */
  const GROUP_LABEL = {
    attention: ['queue.grp_attention', 'Needs attention'],
    running: ['queue.grp_running', 'Running'],
    finishing: ['queue.grp_finishing', 'Post &amp; QC'],
    queued: ['queue.grp_queued', 'Queued'],
    done: ['queue.grp_done', 'Finished today'],
  };

  /** The one transition each status most wants, mirroring the kanban card's primary button. */
  const PRIMARY_ACTION = {
    pending: { to: 'printing', key: 'queue.start', fallback: 'Start' },
    on_hold: { to: 'pending', key: 'ord.unhold_btn', fallback: 'Resume' },
    printing: { to: 'post', key: 'queue.to_post', fallback: 'Done' },
    post: { to: 'qc', key: 'ord.qc', fallback: 'QC' },
  };

  function tr(key, fallback) {
    const s = (typeof t === 'function') ? t(key) : null;
    return (s && s !== key) ? s : fallback;
  }

  function esc(s) {
    return (typeof escapeHtml === 'function') ? escapeHtml(String(s ?? '')) : String(s ?? '');
  }

  function isBiz() {
    if (typeof KhaytTiers !== 'undefined' && typeof settings !== 'undefined') {
      return KhaytTiers.showsBusiness(settings.mode);
    }
    return typeof settings === 'undefined' || settings.mode !== 'enthusiast';
  }

  function money(n) {
    const v = (typeof fmtMoney === 'function') ? fmtMoney(n) : String(Math.round(+n || 0));
    const c = (typeof currencySymbol === 'function') ? currencySymbol() : '';
    return c ? `${v} ${c}` : v;
  }

  function hours(n) {
    return `${(+n || 0).toFixed(1)}${tr('common.hours_short', 'h')}`;
  }

  function clockTime(ms) {
    const d = new Date(ms);
    const lang = (typeof i18n !== 'undefined' && i18n.current === 'ar') ? 'ar-SA-u-nu-latn' : 'en-GB';
    return d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  }

  /** Why this row is in the attention group, in words. */
  function reasonText(row) {
    if (!row.reason) return '';
    if (row.reason.kind === 'overdue') {
      return tr('oe.due_overdue', 'Overdue by {n}d').replace('{n}', row.reason.daysLate);
    }
    const m = (typeof machines !== 'undefined' ? machines : []).find((x) => x && x.id === row.reason.machineId);
    return tr('queue.blocked_machine', '{name} stopped').replace('{name}', m ? m.name : tr('mach.offline', 'offline'));
  }

  function rowHtml(row, opts) {
    const o = row.order;
    const machine = o.machineId
      ? (typeof machines !== 'undefined' ? machines : []).find((m) => m && m.id === o.machineId)
      : null;
    const sub = machine ? machine.name : tr('queue.unassigned', 'unassigned');

    const meta = [];
    if (+o.printTime > 0) meta.push(hours(o.printTime));
    if (opts.money && +o.price > 0) meta.push(money(o.price));
    if (row.reason) meta.push(reasonText(row));
    else if (o.dueDate) meta.push(tr('queue.due', 'due {d}').replace('{d}', o.dueDate));

    const act = PRIMARY_ACTION[o.status];
    // Same data-act/data-to contract the kanban card uses, so the existing
    // delegated handler on .kanban drives it.
    const action = act
      ? `<button type="button" class="btn small ghost ql-act" data-act="status" data-id="${esc(o.id)}" data-to="${esc(act.to)}">${esc(tr(act.key, act.fallback))}</button>`
      : '';

    const sev = row.reason ? (row.reason.kind === 'overdue' ? 'is-warn' : 'is-crit') : '';
    return `<div class="ql-row ${sev}" data-order-id="${esc(o.id)}">
      <span class="ql-stripe" aria-hidden="true"></span>
      <span class="ql-name">${esc(o.project || o.id)} <em>— ${esc(sub)}</em></span>
      <span class="ql-meta">${esc(meta.join(' · '))}</span>
      <span class="ql-state">${esc(tr('queue.' + o.status, o.status))}</span>
      <span class="ql-actions">${action}</span>
    </div>`;
  }

  function groupHtml(group, opts) {
    if (!group.items.length && group.key !== 'attention') return '';
    if (!group.items.length) return '';
    const [key, fallback] = GROUP_LABEL[group.key] || [null, group.key];
    const agg = group.aggregate;
    const bits = [String(agg.count)];
    if (agg.hours > 0) bits.push(hours(agg.hours));
    if (opts.money && agg.money > 0) bits.push(money(agg.money));
    return `<section class="ql-group ql-group-${esc(group.key)}${group.collapsed ? ' is-collapsed' : ''}">
      <h3 class="ql-group-head">
        <span>${esc(tr(key, fallback))}</span>
        <span class="ql-group-agg">${esc(bits.join(' · '))}</span>
      </h3>
      <div class="ql-rows">${group.items.map((r) => rowHtml(r, opts)).join('')}</div>
    </section>`;
  }

  function footerHtml(footer, opts) {
    const bits = [];
    bits.push(`<span>${esc(tr('queue.total', 'Queue total'))}</span>`);
    bits.push(`<span><b>${esc(hours(footer.hours))}</b></span>`);
    if (opts.money && footer.money > 0) bits.push(`<span><b>${esc(money(footer.money))}</b></span>`);
    // Null means something is idle right now, which is a better answer than a time.
    bits.push(footer.nextFreeAt
      ? `<span>${esc(tr('queue.next_free', 'Next machine free {t}').replace('{t}', clockTime(footer.nextFreeAt)))}</span>`
      : `<span>${esc(tr('queue.machine_free_now', 'A machine is free now'))}</span>`);
    return `<div class="ql-foot">${bits.join('')}</div>`;
  }

  /** True when the grouped list is the active board. Kanban is opt-in per shop. */
  function isListView() {
    return (typeof settings === 'undefined' ? 'list' : (settings.queueView || 'list')) !== 'kanban';
  }

  function renderQueueList() {
    const board = document.querySelector('.kanban');
    if (!board) return false;

    let host = document.getElementById('queueListView');
    if (!host) {
      host = document.createElement('div');
      host.id = 'queueListView';
      board.insertBefore(host, board.firstChild);
    }

    board.classList.toggle('queue-list-mode', isListView());
    if (!isListView()) { host.innerHTML = ''; return false; }

    const locMatch = (typeof orderMatchesActiveLocation === 'function') ? orderMatchesActiveLocation : () => true;
    const orders = (typeof printLog !== 'undefined' ? printLog : []).filter(locMatch);
    const machMatch = (typeof machineMatchesActiveLocation === 'function') ? machineMatchesActiveLocation : () => true;
    const mach = (typeof machines !== 'undefined' ? machines : []).filter(machMatch);
    const opts = { money: isBiz() };

    const res = (typeof KhaytQueueGroups !== 'undefined')
      ? KhaytQueueGroups.groupQueue({
        orders,
        machines: mach,
        statusCache: (typeof machineStatusCache !== 'undefined' ? machineStatusCache : {}),
        now: Date.now(),
        money: opts.money,
        revenueOf: (typeof orderRevenueBase === 'function') ? orderRevenueBase : undefined,
      })
      : null;
    if (!res) { host.innerHTML = ''; return false; }

    const body = res.groups.map((g) => groupHtml(g, opts)).join('');
    host.innerHTML = body
      ? body + footerHtml(res.footer, opts)
      : `<p class="ql-empty">${esc(tr('queue.empty', 'Nothing in the queue.'))}</p>`;
    return true;
  }

  /** Flip the board and remember it. */
  function setQueueView(view) {
    if (typeof settings === 'undefined') return;
    settings.queueView = (view === 'kanban') ? 'kanban' : 'list';
    if (typeof saveAll === 'function') saveAll();
    if (typeof renderKanban === 'function') renderKanban();
    syncQueueViewToggle();
  }

  function syncQueueViewToggle() {
    const btn = document.getElementById('btnQueueView');
    if (!btn) return;
    const list = isListView();
    btn.setAttribute('aria-pressed', String(!list));
    btn.textContent = list
      ? tr('queue.view_kanban', 'Board view')
      : tr('queue.view_list', 'List view');
    btn.title = list
      ? tr('queue.view_kanban_hint', 'Switch to the kanban board')
      : tr('queue.view_list_hint', 'Switch to the grouped list');
  }

  const api = { renderQueueList, setQueueView, isListView, syncQueueViewToggle };
  Object.assign(global, api);
  global.KhaytQueueList = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof globalThis !== 'undefined' ? globalThis : window);
