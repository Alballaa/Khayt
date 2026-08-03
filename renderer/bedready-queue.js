'use strict';
/**
 * Bed Ready's own queue transitions.
 *
 * The production queue renders status controls in both views — kanban.js and queue-list.js
 * both emit `data-act="status"`, and wire-events.js handles the click by calling
 * `updateStatus(id, to)`. That function lives in order-flows.js, which is business-only and
 * Bed Ready does not ship, so bedready-shim.js declared it a no-op to stop the boot-time
 * ReferenceError.
 *
 * Which left a queue that looks like it works. The buttons render, the click lands, the
 * handler runs, and `function () { return ''; }` returns. Nothing moves, nothing errors,
 * nothing says why. A maker app whose production queue cannot move a job from printing to
 * done is missing the thing the screen is for.
 *
 * So Bed Ready gets a real one. This is not order-flows.js with the business stripped out —
 * it is the transitions a workshop needs, using the shared helpers Bed Ready already ships:
 *
 *   inventory      deductFilamentForOrder / deductPackagingConsumables (inventory.js) —
 *                  finishing a print is what actually empties the spool
 *   WIP limits     wouldExceedWipLimit (app-helpers.js) — queue discipline, not commerce
 *   live timer     timerStart / printingStartedAt, which kanban.js already renders a badge
 *                  from and nothing in Bed Ready was setting
 *   activity log   logActivity (app-helpers.js)
 *
 * The same was true of every OTHER button on the card. kanban.js renders hold, QC pass,
 * QC fail, mark-delivered, timeline, print-label and capture-failure-photo without a
 * `biz` gate — correctly, since none of them is commercial — and all seven handlers
 * lived in order-flows.js too. So the second half of this module is those, each routed
 * through updateStatus() wherever a column changes so the WIP limits, the timer, the
 * stock deduction and the undo toast are inherited once rather than rebuilt seven times.
 *
 * Deliberately absent, because they are business or depend on it: loyalty tiers, invoicing,
 * ZATCA, portals, webhooks, Telegram, status-page export, the BOM assembly gate, the QC
 * inspector roster, the scrap-or-reprint RMA branch, and `resumeFromHold` — which lives in
 * order-flows.js and is not even shimmed, so calling it here would throw.
 *
 * Loaded AFTER bedready-shim.js and only by bedready.html, so it replaces the shim's no-op.
 * The shim assigns only when a name is undefined; this assigns unconditionally, on purpose.
 */
(function (global) {
  // t() returns the KEY when a string is missing, and a key is truthy — so the usual
  // `t(k) || fallback` never falls back. It also returns the raw template when called
  // without the params a string interpolates, which is how "Order {id} marked as
  // delivered" reaches a toast with the braces still in it. Both count as missing here.
  const T = (k, fb) => {
    try {
      const s = (typeof t === 'function') ? t(k) : '';
      return (s && s !== k && !/\{\w+\}/.test(s)) ? s : fb;
    } catch (_) { return fb; }
  };
  const say = (msg, kind, ms, opts) => { try { if (typeof toast === 'function') toast(msg, kind, ms, opts); } catch (_) {} };
  const orders = () => (typeof printLog !== 'undefined' && Array.isArray(printLog)) ? printLog : [];
  const conf = () => (typeof settings !== 'undefined' && settings) ? settings : {};

  /** Redraw whichever queue view is on screen. */
  function repaint() {
    if (typeof renderKanban === 'function') { try { renderKanban(); } catch (_) {} }
    if (typeof renderQueueList === 'function') { try { renderQueueList(); } catch (_) {} }
    if (typeof renderDashboard === 'function') { try { renderDashboard(); } catch (_) {} }
  }

  /**
   * Move a job to a new column.
   * @param {string} id         order id
   * @param {string} newStatus  pending | on_hold | printing | post | qc | completed
   */
  function updateStatus(id, newStatus) {
    const order = orders().find((o) => o && o.id === id);
    if (!order || !newStatus || order.status === newStatus) return;
    const prevStatus = order.status;
    const cfg = conf();

    // A shop that has paused production means it: no new prints start.
    if (cfg.productionPaused && newStatus === 'printing') {
      say(T('prod.paused_block', 'Production is paused — resume it before starting a print.'), 'warning');
      return;
    }

    // WIP limits are a workshop idea, not a commercial one: too many jobs open at once is
    // how a bench ends up covered in half-finished plates. Completing is always allowed —
    // the point of a limit is to stop work starting, never to strand what is already done.
    if (newStatus !== 'completed' && typeof wouldExceedWipLimit === 'function'
        && wouldExceedWipLimit(orders(), id, newStatus, cfg.wipLimits)) {
      const n = (cfg.wipLimits || {})[newStatus];
      if (cfg.wipEnforceHardLimit) {
        say(T('wip.limit_blocked', `WIP limit (${n}) reached for "${newStatus}" — finish something first.`), 'error', 4000);
        return;
      }
      say(T('wip.limit_reached', `WIP limit (${n}) reached for "${newStatus}"`), 'warning', 4000);
    }

    const undoIdx = orders().indexOf(order);
    let undoSnap = null;
    try { undoSnap = structuredClone(order); } catch (_) { undoSnap = null; }

    order.status = newStatus;
    if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
    order.statusHistory.push({ status: newStatus, at: new Date().toISOString() });
    if (order.statusHistory.length > 200) order.statusHistory = order.statusHistory.slice(-200);

    // The live timer kanban.js draws a badge from. Nothing in Bed Ready set these, so the
    // badge could never appear however long a job had been on the machine.
    if (newStatus === 'printing') {
      order.timerStart = new Date().toISOString();
      if (!order.printingStartedAt) order.printingStartedAt = order.timerStart;
    } else if (order.timerStart) {
      delete order.timerStart;
      delete order.timerPausedAt;
      delete order.timerPausedMs;
    }

    if (newStatus === 'completed') {
      if (!order.completedAt) order.completedAt = new Date().toISOString();
      // Finishing a print is the moment the spool is actually lighter. Both helpers are
      // no-ops for an order carrying no parts, so a bare queue entry costs nothing.
      if (typeof deductFilamentForOrder === 'function') { try { deductFilamentForOrder(order); } catch (_) {} }
      if (typeof deductPackagingConsumables === 'function') { try { deductPackagingConsumables(order); } catch (_) {} }
    } else if (prevStatus === 'completed') {
      // Re-opening: a job that is going round again has not completed, and leaving the
      // timestamp behind would report it as finished in anything reading completedAt.
      delete order.completedAt;
    }

    if (typeof logActivity === 'function') { try { logActivity('status', `${order.id} → ${newStatus}`, order.id); } catch (_) {} }
    if (typeof saveAll === 'function') saveAll();
    repaint();

    // The job is completed either way. Offering the printer's own figures happens AFTER,
    // never as a gate: a dismissed dialog must not leave the card in the previous column.
    // Silent when nothing was measured — see bedready-actuals.js.
    if (newStatus === 'completed' && typeof brOfferActuals === 'function') {
      try { brOfferActuals(order); } catch (_) { /* never block a completion on this */ }
    }

    say(T('toast.status_updated', 'Status updated'), 'success', 5000,
      (undoIdx >= 0 && undoSnap) ? {
        undo: () => {
          const list = orders();
          if (list[undoIdx] && list[undoIdx].id === undoSnap.id) list[undoIdx] = undoSnap;
          if (typeof saveAll === 'function') saveAll();
          repaint();
        },
      } : undefined);
  }

  /* ============================================================
     The card's own buttons.

     kanban.js renders these on every card in enthusiast mode — they are not
     `biz`-gated, because holding a job, inspecting it and marking it handed over
     are workshop actions, not commercial ones. Their handlers all lived in
     order-flows.js, so in Bed Ready all seven rendered, clicked, and did nothing.

     Each one below routes through updateStatus() wherever a column changes, so
     the WIP limits, the production-paused block, the live timer, the inventory
     deduction, the activity log, the actuals prompt and the undo toast are
     inherited rather than reimplemented seven times.
     ============================================================ */

  const esc = (s) => (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s);
  const find = (id) => orders().find((o) => o && o.id === id);

  /** Pause a job, with the reason written on the card. */
  function holdOrder(id) {
    const order = find(id);
    if (!order || typeof openFormModal !== 'function') return;
    openFormModal({
      title: T('ord.hold_btn', 'Put on hold'),
      sizeLg: false,
      saveLabel: T('ord.hold_btn', 'Put on hold'),
      bodyHtml: `
        <label>${esc(T('ord.hold_reason', 'Why is it on hold?'))}</label>
        <input type="text" id="brHoldReason" style="width:100%;" placeholder="${esc(T('common.optional', 'Optional'))}">`,
      onMount(modal) { setTimeout(() => modal.querySelector('#brHoldReason')?.focus(), 40); },
      onSave(modal) {
        const reason = String(modal.querySelector('#brHoldReason')?.value || '').trim();
        order.holdReason = reason || null;
        order.heldAt = new Date().toISOString();
        // updateStatus saves and repaints; setting the fields first means one write.
        updateStatus(id, 'on_hold');
        return true;
      },
    });
  }

  /**
   * Passed inspection → done.
   *
   * The QC fields are stamped BEFORE the transition so that a completion, its
   * stock deduction and its inspection record all land in the same save. The
   * business version asks for an inspector from `operators[]`; Bed Ready is one
   * person at one bench, so it asks only what a maker would actually write down.
   */
  function qcPassOrder(id) {
    const order = find(id);
    if (!order || typeof openFormModal !== 'function') return;
    openFormModal({
      title: T('ord.qc_pass', 'QC pass'),
      sizeLg: false,
      saveLabel: T('ord.qc_pass', 'QC pass'),
      bodyHtml: `
        <label>${esc(T('ord.qc_notes', 'Notes'))}</label>
        <textarea id="brQcNotes" rows="3" style="resize:vertical;" placeholder="${esc(T('common.optional', 'Optional'))}"></textarea>`,
      onMount(modal) { setTimeout(() => modal.querySelector('#brQcNotes')?.focus(), 40); },
      onSave(modal) {
        const nowIso = new Date().toISOString();
        order.qcStatus = 'pass';
        order.qcAt = nowIso;
        order.qcPassedAt = nowIso;
        order.qcNotes = String(modal.querySelector('#brQcNotes')?.value || '').trim() || null;
        updateStatus(id, 'completed');
        return true;
      },
    });
  }

  /**
   * Failed inspection → back to the queue, with the filament booked as waste.
   *
   * A failed print has already eaten its spool, and Bed Ready has a waste log
   * exactly for that. The business version can also scrap the job or spin off a
   * linked reprint against an RMA; here the job simply goes round again, which is
   * what a maker does with a warped part.
   */
  function qcFailOrder(id) {
    const order = find(id);
    if (!order || typeof openFormModal !== 'function') return;
    // The canonical set waste.js already labels and filters by. Inventing a category
    // here would put a value in wasteLog that the waste screen cannot name.
    const FAILURE_TYPES = ['bed_adhesion', 'nozzle_jam', 'warping', 'stringing',
      'operator_error', 'design_issue', 'power_failure', 'material_quality', 'other'];
    const FALLBACK = {
      bed_adhesion: 'Bed adhesion', nozzle_jam: 'Nozzle jam', warping: 'Warping',
      stringing: 'Stringing', operator_error: 'Operator error', design_issue: 'Design issue',
      power_failure: 'Power failure', material_quality: 'Material quality', other: 'Other',
    };
    openFormModal({
      title: T('ord.qc_fail', 'QC fail'),
      sizeLg: false,
      saveLabel: T('ord.qc_fail', 'QC fail'),
      bodyHtml: `
        <label>${esc(T('waste.failure_type', 'What went wrong?'))}</label>
        <select id="brQcFailType" style="margin-bottom:10px;">
          ${FAILURE_TYPES.map((k) => `<option value="${k}"${k === 'other' ? ' selected' : ''}>${esc(T('waste.ft.' + k, FALLBACK[k]))}</option>`).join('')}
        </select>
        <label>${esc(T('waste.reason', 'Notes'))}</label>
        <input type="text" id="brQcFailReason" style="width:100%;" placeholder="${esc(T('common.optional', 'Optional'))}">
        <label style="margin-top:12px;">${esc(T('waste.weight', 'Filament wasted'))} (g)</label>
        <input type="number" id="brQcFailWeight" min="0" step="1" value="" placeholder="0">`,
      onMount(modal) { setTimeout(() => modal.querySelector('#brQcFailType')?.focus(), 40); },
      onSave(modal) {
        const nowIso = new Date().toISOString();
        const failureType = modal.querySelector('#brQcFailType')?.value || 'other';
        const reason = String(modal.querySelector('#brQcFailReason')?.value || '').trim();
        const weight = Math.max(0, (typeof num === 'function' ? num(modal.querySelector('#brQcFailWeight')?.value, 0) : 0));

        if (typeof wasteLog !== 'undefined' && Array.isArray(wasteLog)) {
          const inv = (typeof inventory !== 'undefined' && Array.isArray(inventory))
            ? inventory.find((i) => i && i.material === order.material) : null;
          wasteLog.unshift({
            id: (typeof uid === 'function') ? uid('WASTE') : 'WASTE-' + nowIso,
            date: nowIso.split('T')[0],
            material: order.material || '',
            machineId: order.machineId || null,
            weight,
            cost: (weight > 0 && inv && inv.weight > 0) ? (inv.cost / inv.weight) * weight : 0,
            reason: reason || T('ord.qc_fail', 'QC fail'),
            orderId: order.id,
            failureType,
          });
        }

        order.qcStatus = 'fail';
        order.qcAt = nowIso;
        order.qcFailedAt = nowIso;
        if (!Array.isArray(order.defects)) order.defects = [];
        order.defects.push({ type: failureType, note: reason || '', at: nowIso });

        updateStatus(id, 'pending');
        if (typeof renderWaste === 'function') { try { renderWaste(); } catch (_) {} }
        if (typeof renderInventory === 'function') { try { renderInventory(); } catch (_) {} }
        return true;
      },
    });
  }

  /**
   * Handed over. Deliberately does NOT move the status: kanban.js builds its
   * Delivered column from `status === 'completed' && deliveredAt` (kanban.js:430),
   * so setting the status here would empty the column the button feeds.
   */
  function markDelivered(id) {
    const order = find(id);
    if (!order || order.status !== 'completed') return;
    order.deliveredAt = new Date().toISOString();
    if (typeof logActivity === 'function') { try { logActivity('status', `${order.id} → delivered`, order.id); } catch (_) {} }
    if (typeof saveAll === 'function') saveAll();
    repaint();
    say(T('queue.delivered_toast', 'Marked as delivered'), 'success');
  }

  /** How long the job spent in each column. Read-only. */
  function openOrderTimeline(id) {
    const order = find(id);
    if (!order) return;
    const hist = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    if (!hist.length) { say(T('ord.timeline_empty', 'No history for this job yet.'), 'info'); return; }
    if (typeof openFormModal !== 'function') return;

    const COLOURS = {
      pending: '#6b7280', on_hold: '#ef4444', printing: '#22c55e',
      post: '#f59e0b', qc: '#3b82f6', completed: '#10b981', delivered: '#10b981',
    };
    const human = (ms) => {
      const h = ms / 3600000;
      if (h < 1) return `${Math.round(ms / 60000)}m`;
      if (h < 24) return `${h.toFixed(1)}h`;
      const d = Math.floor(h / 24); const r = Math.round(h % 24);
      return r > 0 ? `${d}d ${r}h` : `${d}d`;
    };

    const now = Date.now();
    const rows = hist.map((entry, i) => {
      const start = new Date(entry.at).getTime();
      const end = (i + 1 < hist.length) ? new Date(hist[i + 1].at).getTime() : now;
      const last = i === hist.length - 1;
      const colour = COLOURS[entry.status] || '#6b7280';
      return `
        <div class="timeline-step${last ? ' timeline-last' : ''}">
          <div class="timeline-node" style="background:${colour};box-shadow:0 0 0 3px ${colour}33;"></div>
          ${last ? '' : '<div class="timeline-line"></div>'}
          <div class="timeline-content">
            <span class="timeline-status" style="color:${colour};">${esc(T('queue.' + entry.status, entry.status))}</span>
            <span class="timeline-time">${esc(new Date(entry.at).toLocaleString())}</span>
            <span class="timeline-dur"${last ? ' style="color:var(--text-muted);font-style:italic;"' : ''}>${last ? esc(T('ord.timeline_current', '(current)')) : '⏱ ' + esc(human(end - start))}</span>
          </div>
        </div>`;
    }).join('');

    const total = new Date(hist[hist.length - 1].at).getTime() - new Date(hist[0].at).getTime();
    openFormModal({
      title: `${T('ord.timeline_title', 'Timeline')} — ${order.project || order.id}`,
      sizeLg: false,
      noSave: true,
      bodyHtml: `
        <div style="margin-bottom:12px;font-size:12.5px;color:var(--text-muted);">
          ${esc(order.id)} · ${esc(T('ord.timeline_total', 'Total'))}: <strong>${esc(human(total))}</strong>
        </div>
        <div class="timeline-wrap">${rows}</div>`,
    });
  }

  /**
   * The card's second label button.
   *
   * kanban.js renders two: `order-label` → printOrderLabels (labels.js, which Bed
   * Ready ships and which works) and `print-label` → generateOrderLabel, which
   * lived in the business exporter. Rather than build a second label pipeline for
   * the same card, this points the dead one at the one that works.
   */
  function generateOrderLabel(id) {
    if (typeof printOrderLabels !== 'function') {
      say(T('lbl.unavailable', 'Label printing is unavailable.'), 'error');
      return;
    }
    try { printOrderLabels(id); } catch (_) { say(T('lbl.failed', 'Could not build the label.'), 'error'); }
  }

  /**
   * Attach a photo of what went wrong to a held job.
   *
   * Nothing about this is commercial — it is the picture of the spaghetti. Uses
   * the same main-process helpers as the rest of the photo handling, and only
   * records a path once one has actually been written.
   */
  async function captureFailurePhoto(id) {
    const order = find(id);
    if (!order) return;
    const api = (typeof window !== 'undefined') ? window.hubAPI : null;

    let picked = null;
    if (api && api.pickFile) {
      picked = await api.pickFile({ filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })
        .catch(() => null);
    }
    if (!picked) {
      picked = await new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.onchange = () => { const f = input.files && input.files[0]; input.remove(); resolve(f || null); };
        input.oncancel = () => { input.remove(); resolve(null); };
        input.click();
      });
    }
    if (!picked) return; // cancelled — not a failure

    try {
      if (typeof picked === 'string' && api && api.copyFileToVault) {
        order.failurePhotoPath = await api.copyFileToVault(picked, order.id);
      } else if (picked instanceof File && api && api.saveOrderPhoto) {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(picked);
        });
        await api.saveOrderPhoto(order.id, 0, dataUrl);
        order.failurePhotoPath = `failure-${order.id}-${Date.now()}.jpg`;
      } else {
        say(T('ord.photo_unavailable', 'Photo storage is unavailable.'), 'error');
        return;
      }
    } catch (e) {
      // Never stamp a path for a photo that was not written — the card would then
      // point at a file that does not exist, for good.
      say(T('ord.photo_failed', 'Could not save the photo.'), 'error');
      return;
    }

    if (typeof saveAll === 'function') saveAll();
    repaint();
    say(T('ord.photo_saved', 'Failure photo saved'), 'success');
  }

  // Unconditional: bedready-shim.js has already put no-ops here, and these replace them.
  global.updateStatus = updateStatus;
  global.holdOrder = holdOrder;
  global.qcPassOrder = qcPassOrder;
  global.qcFailOrder = qcFailOrder;
  global.markDelivered = markDelivered;
  global.openOrderTimeline = openOrderTimeline;
  global.generateOrderLabel = generateOrderLabel;
  global.captureFailurePhoto = captureFailurePhoto;
  global.KhaytBedReadyQueue = {
    updateStatus, holdOrder, qcPassOrder, qcFailOrder,
    markDelivered, openOrderTimeline, generateOrderLabel, captureFailurePhoto,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
