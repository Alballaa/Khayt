#!/usr/bin/env python3
"""Apply Studio phase 3 patches to renderer/app.js"""
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "renderer" / "app.js"
text = APP.read_text()

HELPERS = r'''
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
  if (!document.body.classList.contains('khayt-studio')) return '';

  const deltaChip = (pct) => {
    if (pct === null || pct === undefined) return '';
    const up = pct >= 0;
    return `<span class="kbadge ${up ? 'delta-up' : 'delta-down'}" style="background:${up ? 'var(--ok-soft)' : 'var(--danger-soft)'}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span>`;
  };

  const cards = [
    { label: t('dash.active_orders'), value: active.length, unit: '' },
    { label: t('dash.overdue'), value: overdue.length, unit: '', alert: overdue.length > 0 },
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

function studioKanbanProgress(log) {
  if (log.status !== 'printing' || !(+log.printTime > 0)) return null;
  const start = new Date(log.printingStartedAt || log.timerStart || Date.now()).getTime();
  return Math.min(99, Math.round((Date.now() - start) / (+log.printTime * 3600000) * 100));
}

function studioKanbanDuePill(log, status) {
  if (!log.dueDate || status === 'completed' || status === 'delivered') return '';
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const due = new Date(log.dueDate + 'T00:00:00');
  const diff = Math.round((due - today0) / 86400000);
  let label;
  let urgent = false;
  if (diff < 0) {
    label = t('dash.overdue') || 'Overdue';
    urgent = true;
  } else if (diff === 0) {
    label = t('oe.due_today') || 'Today';
    urgent = true;
  } else if (diff === 1) {
    label = t('kan.due_tomorrow') || 'Tomorrow';
  } else {
    label = due.toLocaleDateString(i18n.current === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' });
  }
  return `<span class="khayt-due" style="color:${urgent ? 'var(--danger)' : 'var(--text-dim)'};background:${urgent ? 'var(--danger-soft)' : 'var(--surface-2)'}">🕐 ${escapeHtml(label)}</span>`;
}

function renderStudioKanbanCard(b) {
  const {
    log, status, _pl, pausedClass, cardClientAccent, partColourHtml, partsLabel,
    machineBadge, operatorBadge, kanbanSplitBadge, kanbanSubBadge, qcBadge,
    postCheckHtml, resinCheckHtml, timerBadge, etaBadge, actions,
  } = b;

  const useStudio = document.body.classList.contains('khayt-studio');
  const prioColor = { urgent: 'var(--danger)', high: 'var(--warn)', normal: 'var(--text-muted)' }[_pl] || 'var(--text-muted)';
  const client = log.clientId ? clients.find(c => c.id === log.clientId) : null;
  const clientLine = client ? localName(client) : (log.client || '');
  const part0 = (log.parts || [])[0];
  let swatchHex = '#6b7280';
  let swatchLabel = part0?.colour || part0?.material || '';
  if (part0?.filamentId) {
    const inv = inventory.find(i => i.id === part0.filamentId);
    if (inv?.color) swatchHex = inv.color;
    if (!swatchLabel) swatchLabel = inv?.material || '';
  }
  const progress = studioKanbanProgress(log);
  const machine = log.machineId ? machines.find(m => m.id === log.machineId) : null;
  const machineName = machine ? machine.name : '';
  const duePill = studioKanbanDuePill(log, status);
  const unassignedPill = !log.machineId && status !== 'completed' && status !== 'delivered'
    ? `<span class="khayt-due" style="color:var(--warn);background:var(--warn-soft)">${escapeHtml(t('dash.unassigned') || 'Unassigned')}</span>`
    : '';
  const priBadge = _pl !== 'normal' ? priorityBadgeHtml(log) + ' ' : '';
  const splitSpan = log._isSplitParent
    ? ' <span class="pill" style="font-size:10px">split</span>' : '';

  const headBlock = useStudio
    ? `
      <div class="row between" style="align-items:center">
        <span class="mono" style="font-size:12px;font-weight:600;color:var(--text-dim)">${escapeHtml(log.id)}</span>
        <span class="row gap6" style="align-items:center">
          <span class="dot" style="background:${prioColor};width:7px;height:7px" title="${escapeHtml(_pl)}"></span>
          <span class="khayt-kcard-grip" aria-hidden="true">⋮⋮</span>
        </span>
      </div>
      <strong class="khayt-kcard-title">${priBadge}${escapeHtml(log.project || log.id)}${splitSpan}</strong>
      ${clientLine ? `<span class="khayt-kcard-client">${escapeHtml(clientLine)}</span>` : ''}
      <div class="row gap8 khayt-kcard-mat" style="margin-top:8px;align-items:center;flex-wrap:wrap">
        ${swatchLabel ? `<span class="khayt-swatch" style="background:${safeCssColor(swatchHex)}"></span><span class="khayt-cname">${escapeHtml(swatchLabel)}</span>` : ''}
        <span class="grow"></span>
        <span class="pill" style="padding:2px 7px;font-size:10.5px">${escapeHtml(partsLabel)}</span>
      </div>`
    : `
      <h4>${priBadge}${escapeHtml(log.project)}${machineBadge}${operatorBadge}${kanbanSplitBadge}${kanbanSubBadge}${qcBadge}${splitSpan}</h4>`;

  const progressBlock = useStudio && progress !== null
    ? `<div class="khayt-kcard-progress">
        <div class="row between" style="margin-bottom:4px">
          <span class="mono" style="font-size:10px;color:var(--text-muted)">${escapeHtml(machineName || '—')}</span>
          <span class="mono" style="font-size:10px;color:var(--ok)">${progress}%</span>
        </div>
        <div class="meter"><i style="width:${progress}%;background:var(--ok)"></i></div>
      </div>`
    : '';

  const metaBlock = useStudio
    ? `<hr class="thread" style="margin:11px 0 9px" />
      <div class="row between" style="align-items:center">
        <span style="font-size:11px;color:var(--text-muted)">${log.printTime || 0} ${escapeHtml(t('common.hours'))}</span>
        <span class="metric" style="font-size:12.5px">${fmtPrice(log.price)}</span>
      </div>
      <div class="row gap6 khayt-kcard-pills" style="margin-top:8px;flex-wrap:wrap">
        ${duePill}${unassignedPill}${paymentBadge(log)}${timerBadge}${etaBadge}
      </div>
      ${machineBadge || operatorBadge || kanbanSplitBadge || kanbanSubBadge || qcBadge
        ? `<div class="khayt-kcard-badges">${machineBadge}${operatorBadge}${kanbanSplitBadge}${kanbanSubBadge}${qcBadge}</div>` : ''}`
    : `
      <div class="meta">
        <span class="price">${fmtPrice(log.price)}</span><span>·</span>
        <span>${log.printTime} ${escapeHtml(t('common.hours'))}</span><span>·</span>
        <span>${escapeHtml(partsLabel)}</span>
      </div>
      <div class="order-meta-row">${paymentBadge(log)}${log.dueDate && status !== 'completed' ? ' ' + formatDueDateBadge(log.dueDate) : ''}${timerBadge}${etaBadge}</div>`;

  return `
    <div class="kanban-card khayt-kcard${_pl === 'urgent' ? ' kanban-priority-urgent' : _pl === 'high' ? ' kanban-priority-high' : ''}${pausedClass}" draggable="true" data-order-id="${log.id}" style="${cardClientAccent}">
      ${headBlock}
      ${!useStudio && partColourHtml ? `<div style="margin-top:2px;">${partColourHtml}</div>` : ''}
      ${useStudio && partColourHtml ? `<div style="margin-top:4px">${partColourHtml}</div>` : ''}
      ${progressBlock}
      ${metaBlock}
      ${(() => { const refs = (log.parts || []).map(p => p.fileRef).filter(Boolean); return refs.length > 0 ? `<div class="part-file-ref" style="margin-top:4px;font-size:11px">📎 ${escapeHtml(refs.join(', '))}</div>` : ''; })()}
      ${status === 'on_hold' && log.holdReason ? `<div style="font-size:11px;color:var(--warning);margin-top:6px">⏸ ${escapeHtml(log.holdReason)}</div>` : ''}
      ${(log.tags && log.tags.length > 0) ? `<div class="kanban-tags">${renderTagChips(log.tags)}</div>` : ''}
      ${postCheckHtml}
      ${resinCheckHtml}
      ${log.parts && log.parts.length > 0 ? `
      <div class="part-status-list">
        ${log.parts.map((p, i) => {
          const ps = p.partStatus || 'pending';
          return `<div class="part-status-row">
            <span class="part-status-dot ${escapeHtml(ps)}" data-act="toggle-part-status" data-order-id="${log.id}" data-part-index="${i}" title="${escapeHtml(t('kan.parts_status'))}"></span>
            <span class="part-status-name">${escapeHtml(p.name || 'Part ' + (i + 1))}</span>
            <span class="part-status-badge ${escapeHtml(ps)}">${escapeHtml(t('kan.part_' + ps) || ps)}</span>
          </div>`;
        }).join('')}
      </div>` : ''}
      ${(() => {
        if (!log.parts || log.parts.length <= 1) return '';
        const delivered = log.parts.filter(p => p.delivered).length;
        if (delivered === 0) return '';
        return `<div class="partial-delivery-badge">${escapeHtml(t('ord.parts_delivered', { done: delivered, total: log.parts.length }))}</div>`;
      })()}
      <div class="actions khayt-kcard-actions"><button class="btn small ghost" data-act="order-timeline" data-id="${log.id}" title="${escapeHtml(t('ord.timeline'))}">🕐</button>${actions}</div>
      ${(() => {
        if (status !== 'printing') return '';
        const mid = log.machineId;
        if (!mid) return '';
        const mach = machines.find(m => m.id === mid);
        if (!mach?.printerApi?.type || mach.printerApi.type === 'none') return '';
        return `<div class="printer-live-status" data-machine-id="${escapeHtml(mid)}"></div>`;
      })()}
    </div>`;
}

function studioKanbanDecorateColumns() {
  const stageColors = {
    pending: 'var(--info)', on_hold: 'var(--warn)', printing: 'var(--ok)',
    post: 'var(--accent)', qc: '#a78bfa', completed: 'var(--text-muted)', delivered: 'var(--ok)',
  };
  $$('.kanban-col[data-status]').forEach(col => {
    const status = col.dataset.status;
    col.classList.add('khayt-kcol');
    const list = col.querySelector('[id^="list-"]');
    if (list) list.classList.add('khayt-kcol-body');
    let bar = col.querySelector('.khayt-kbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'khayt-kbar';
      const head = col.querySelector('h3');
      if (head?.nextSibling) col.insertBefore(bar, head.nextSibling);
      else col.prepend(bar);
    }
    bar.style.background = stageColors[status] || 'var(--accent)';
    const countEl = col.querySelector('.count');
    if (countEl && !countEl.classList.contains('khayt-kcount')) {
      countEl.classList.add('khayt-kcount');
    }
  });
}

'''

marker = 'function renderKanban() {'
if 'function renderStudioKanbanCard' not in text:
    text = text.replace(marker, HELPERS + marker)

# Dashboard KPI row after sparkHtml computed - insert call in innerHTML
old_stats = '''    <div class="dash-stats">
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
      </div>'''

new_stats = '''    ${renderDashKpiRow({ active: active.length, overdue: overdue.length, todayRev, receivables, revDeltaPct, sparkData })}
    <div class="dash-stats dash-stats-secondary">
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
      </div>'''

if old_stats in text:
    text = text.replace(old_stats, new_stats)

# Replace kanban card return with renderStudioKanbanCard call
old_return_start = "      return `\n        <div class=\"kanban-card khayt-kcard"
old_return_end = "        </div>`;\n    }).join('');"

idx_start = text.find(old_return_start)
idx_end = text.find(old_return_end, idx_start)
if idx_start != -1 and idx_end != -1:
    replacement = """      return renderStudioKanbanCard({
        log, status, _pl, pausedClass, cardClientAccent, partColourHtml, partsLabel,
        machineBadge, operatorBadge, kanbanSplitBadge, kanbanSubBadge, qcBadge,
        postCheckHtml, resinCheckHtml, timerBadge, etaBadge, actions,
      });
    }).join('');"""
    text = text[:idx_start] + replacement + text[idx_end + len(old_return_end):]

# Add studioKanbanDecorateColumns at end of renderKanban before calendar
if 'studioKanbanDecorateColumns()' not in text:
    text = text.replace(
        '  // Feature 1 (new): Drag-and-drop reorder within kanban columns\n  setupKanbanDrag();',
        '  studioKanbanDecorateColumns();\n  Object.entries(cols).forEach(([status, items]) => {\n    const sorted = printLog.filter(o => o.status === status);\n  });\n  // Feature 1 (new): Drag-and-drop reorder within kanban columns\n  setupKanbanDrag();',
    )
    # That insertion is wrong - I need to add footers in the existing forEach instead

APP.write_text(text)
print('patched app.js')
