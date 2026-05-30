#!/usr/bin/env python3
"""Apply Studio phase 4 patches to renderer/index.html and renderer/app.js."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "renderer" / "index.html"
APP = ROOT / "renderer" / "app.js"


def patch_index(html: str) -> str:
    if "studio/phase4.css" not in html:
        html = html.replace(
            '  <link rel="stylesheet" href="studio/compat.css" />\n</head>',
            '  <link rel="stylesheet" href="studio/compat.css" />\n'
            '  <link rel="stylesheet" href="studio/phase4.css" />\n</head>',
        )
    if "studio/icons.js" not in html:
        html = html.replace(
            '<script src="i18n.js"></script>\n<script src="app.js"></script>',
            '<script src="i18n.js"></script>\n<script src="studio/icons.js"></script>\n<script src="app.js"></script>',
        )
    if 'id="studioQueueSeg"' not in html:
        seg = '''      <div class="khayt-queue-seg-row">
        <div class="seg khayt-queue-seg" id="studioQueueSeg" role="group" aria-label="Queue filters">
          <button type="button" class="on" data-queue-filter="all">All</button>
          <button type="button" data-queue-filter="fdm">FDM</button>
          <button type="button" data-queue-filter="resin">Resin</button>
          <button type="button" data-queue-filter="machine">By machine</button>
        </div>
      </div>

'''
        html = html.replace(
            '      <div class="khayt-queue-toolbar row between wrap gap12"',
            seg + '      <div class="khayt-queue-toolbar row between wrap gap12"',
            1,
        )
    if 'id="invStudioStats"' not in html:
        html = html.replace(
            '    <section id="inventory-tab" class="tab-content">',
            '    <section id="inventory-tab" class="tab-content khayt-inventory">\n'
            '      <div id="invStudioStats" class="khayt-inv-stats" style="display:none" aria-hidden="true"></div>',
            1,
        )
        html = html.replace(
            '    <section id="inventory-tab" class="tab-content khayt-inventory">\n'
            '      <div id="invStudioStats"',
            '    <section id="inventory-tab" class="tab-content khayt-inventory">\n'
            '      <div id="invStudioStats"',
        )
    if 'id="clientsCardsGrid"' not in html:
        old_clients = '''    <section id="clients-tab" class="tab-content">
      <div class="toolbar">
        <h3 class="card-head" style="margin: 0; flex: 1;"><span class="swatch"></span><span data-i18n="cl.title">Clients</span></h3>
        <input type="search" id="clientSearch" class="toolbar-search" data-i18n-placeholder="cl.search_ph">
        <button class="btn" id="btnBlankIntakeForm" title="Blank intake form">📋 <span data-i18n="cl.intake_form">Intake form</span></button>
        <button class="btn ghost small" id="btnExportClientsCsv" title="Export clients to CSV">📥 <span data-i18n="common.export_csv">CSV</span></button>
        <button id="btnImportClientsCsv" class="btn small ghost" data-i18n="csv.import_clients_btn">Import CSV</button>
        <button class="btn primary" id="btnAddClient" data-i18n="cl.add">+ Add Client</button>
      </div>
      <div class="card" style="margin-top: 12px;">'''
        new_clients = '''    <section id="clients-tab" class="tab-content khayt-clients">
      <div class="khayt-clients-toolbar">
        <div class="seg" id="studioClientSeg" role="group" aria-label="Client filters">
          <button type="button" class="on" data-client-filter="all">All</button>
          <button type="button" data-client-filter="vat">VAT</button>
          <button type="button" data-client-filter="b2c">B2C</button>
          <button type="button" data-client-filter="balance">Has balance</button>
        </div>
        <div class="row gap8 wrap khayt-clients-actions">
          <input type="search" id="clientSearch" class="toolbar-search" data-i18n-placeholder="cl.search_ph">
          <button class="btn sm subtle" id="btnBlankIntakeForm" title="Blank intake form"><span data-i18n="cl.intake_form">Intake form</span></button>
          <button class="btn sm subtle" id="btnExportClientsCsv" title="Export clients to CSV"><span data-i18n="common.export_csv">CSV</span></button>
          <button id="btnImportClientsCsv" class="btn sm subtle" data-i18n="csv.import_clients_btn">Import CSV</button>
          <button class="btn sm primary" id="btnAddClient" data-i18n="cl.add">+ Add Client</button>
        </div>
      </div>
      <div id="clientsCardsGrid" class="khayt-clients-grid" style="display:none" aria-hidden="true"></div>
      <div class="card" id="clientsTableWrap" style="margin-top: 12px;">'''
        if old_clients in html:
            html = html.replace(old_clients, new_clients, 1)
    return html


PHASE4_BLOCK = '''
/* ============================================================
   Khayt Studio — phase 4 (icons, filters, calc layout, CRM grid)
   ============================================================ */
let studioQueueFilter = 'all';
let studioClientFilter = 'all';

function orderUsesResin(log) {
  if (log.isResin) return true;
  for (const p of (log.parts || [])) {
    if (p.filamentId) {
      const inv = inventory.find(i => i.id === p.filamentId);
      if (inv?.materialType === 'resin') return true;
    }
  }
  if (log.machineId) {
    const m = machines.find(x => x.id === log.machineId);
    if (m?.type === 'resin') return true;
  }
  return false;
}

function orderMatchesStudioQueueFilter(log) {
  const f = studioQueueFilter || 'all';
  if (f === 'all') return true;
  if (f === 'fdm') return !orderUsesResin(log);
  if (f === 'resin') return orderUsesResin(log);
  if (f === 'machine') return !!log.machineId;
  return true;
}

function wireStudioQueueFilters() {
  const seg = $('#studioQueueSeg');
  if (!seg || seg.dataset.wired === '1') return;
  seg.dataset.wired = '1';
  seg.querySelectorAll('[data-queue-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      studioQueueFilter = btn.dataset.queueFilter || 'all';
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
      renderKanban();
    });
  });
}

function wireStudioClientFilters() {
  const seg = $('#studioClientSeg');
  if (!seg || seg.dataset.wired === '1') return;
  seg.dataset.wired = '1';
  seg.querySelectorAll('[data-client-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      studioClientFilter = btn.dataset.clientFilter || 'all';
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
      renderClients();
    });
  });
}

function initStudioCalculatorLayout() {
  const tab = $('#calculator-tab');
  if (!tab || !document.body.classList.contains('khayt-studio')) return;
  const grid = tab.querySelector('.grid');
  if (!grid || grid.classList.contains('khayt-calc-layout')) return;
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
}

function renderInventoryStudioStats() {
  const el = $('#invStudioStats');
  if (!el || !document.body.classList.contains('khayt-studio')) return;
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

function renderClientsStudioCards(filtered, maps) {
  const grid = $('#clientsCardsGrid');
  const tableWrap = $('#clientsTableWrap');
  if (!grid || !document.body.classList.contains('khayt-studio')) return false;
  const { clientStatsMap, clientBalanceMap, clientTierMap } = maps;
  const tierColor = { Gold: 'var(--warn)', Silver: '#aeb6c4', Bronze: '#c08457' };

  let list = filtered;
  if (studioClientFilter === 'vat') {
    list = list.filter(c => !!(c.vat || '').trim());
  } else if (studioClientFilter === 'b2c') {
    list = list.filter(c => !(c.vat || '').trim() && !(c.cr || '').trim());
  } else if (studioClientFilter === 'balance') {
    list = list.filter(c => (clientBalanceMap.get(c.id) || 0) > 0);
  }

  grid.style.display = list.length ? 'grid' : 'none';
  grid.removeAttribute('aria-hidden');
  if (tableWrap) tableWrap.classList.toggle('khayt-clients-legacy-hidden', list.length > 0);

  if (!list.length) {
    grid.innerHTML = `<p class="dash-empty" style="padding:18px;grid-column:1/-1">${escapeHtml(t('cl.empty_search') || 'No clients match.')}</p>`;
    return true;
  }

  grid.innerHTML = list.map(c => {
    const stats = clientStatsMap.get(c.id) || { count: 0, revenue: 0 };
    const displayName = localName(c);
    const balance = clientBalanceMap.get(c.id) || 0;
    const tier = clientTierMap.get(c.id);
    const color = safeCssColor(c.color, 'var(--accent)');
    const initials = (displayName || '?').split(/\\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const credit = Math.max(0, +c.creditLimit || 0);
    const creditPct = credit > 0 ? Math.min(100, (balance / credit) * 100) : 0;
    const tag = c.source && c.source !== 'other' ? (t('cl.source_' + c.source) || c.source) : (c.phone || '');
    return `
      <div class="card khayt-client-card">
        <div class="row between">
          <div class="row gap10 grow" style="align-items:center;min-width:0">
            <span class="khayt-cavatar" style="background:color-mix(in srgb, ${color} 22%, var(--surface-2));color:${color}">${escapeHtml(initials)}</span>
            <div class="col grow" style="line-height:1.25;min-width:0">
              <strong style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(displayName || '—')}</strong>
              <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(tag)}${tier ? ` · <span style="color:${tierColor[tier.name] || 'var(--text-muted)'}">${escapeHtml(tier.name)}</span>` : ''}</span>
            </div>
          </div>
          <button type="button" class="btn ghost sm icon" data-act="cl-edit" data-id="${c.id}" title="${escapeHtml(t('common.edit'))}">⋯</button>
        </div>
        <hr class="thread" style="margin:13px 0" />
        <div class="row between">
          ${[['Orders', stats.count, ''], ['Lifetime', Math.round(stats.revenue).toLocaleString(), settings.currency || 'SAR'], ['Balance', balance > 0 ? Math.round(balance).toLocaleString() : '0', balance > 0 ? (settings.currency || 'SAR') : '']].map(([l, v, u]) => `
            <div class="col" style="gap:3px">
              <span class="mono" style="font-size:9.5px;color:var(--text-muted);letter-spacing:0.06em">${escapeHtml(String(l).toUpperCase())}</span>
              <span class="row" style="align-items:baseline;gap:3px">
                <span class="metric" style="font-size:15px;color:${l === 'Balance' && balance > 0 ? 'var(--warn)' : 'var(--text)'}">${escapeHtml(String(v))}</span>
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
        <div class="row gap6" style="margin-top:12px;flex-wrap:wrap">
          <button class="btn sm subtle" data-act="cl-quote" data-id="${c.id}">${escapeHtml(t('cl.quote'))}</button>
          <button class="btn sm subtle" data-act="cl-history" data-id="${c.id}">${escapeHtml(t('cl.history'))}</button>
        </div>
      </div>`;
  }).join('');
  return true;
}

function initStudioPhase4() {
  if (!document.body.classList.contains('khayt-studio')) return;
  window.KhaytIcon?.hydrateNav?.();
  wireStudioQueueFilters();
  wireStudioClientFilters();
  initStudioCalculatorLayout();
}
'''


def patch_app(js: str) -> str:
    if 'studioQueueFilter' not in js:
        marker = '/* ============================================================\n   Tabs\n   ============================================================ */'
        if marker in js:
            js = js.replace(marker, PHASE4_BLOCK + '\n' + marker, 1)
        else:
            raise SystemExit('Could not find Tabs marker in app.js')

    if 'initStudioPhase4();' not in js:
        js = js.replace(
            '  syncTopbarTitle($(\'.tab-content.active\')?.id || \'dashboard-tab\');\n\n  $(\'.kanban\')',
            '  syncTopbarTitle($(\'.tab-content.active\')?.id || \'dashboard-tab\');\n\n  initStudioPhase4();\n\n  $(\'.kanban\')',
            1,
        )

    if 'orderMatchesStudioQueueFilter' in js and 'orderMatchesStudioQueueFilter(log)' not in js:
        js = js.replace(
            "      if (!hay.includes(kanTerm)) return false;\n    }\n    return true;",
            "      if (!hay.includes(kanTerm)) return false;\n    }\n    if (!orderMatchesStudioQueueFilter(o)) return false;\n    return true;",
            1,
        )

    if 'renderInventoryStudioStats();' not in js:
        js = js.replace(
            'function renderInventory() {\n  renderReorderAlerts();',
            'function renderInventory() {\n  renderInventoryStudioStats();\n  renderReorderAlerts();',
            1,
        )

    if 'renderClientsStudioCards(filtered' not in js:
        insert = '''
  const clientMaps = { clientStatsMap, clientBalanceMap, clientTierMap, clientSurveyMap };
  if (renderClientsStudioCards(filtered, clientMaps)) return;

'''
        js = js.replace(
            '  tbody.innerHTML = filtered.map(c => {',
            insert + '  tbody.innerHTML = filtered.map(c => {',
            1,
        )

    if "initStudioCalculatorLayout();" not in js or "if (tabId === 'calculator-tab')" not in js:
        old = "  if (tabId === 'clients-tab')    renderClients();\n  if (tabId === 'queue-tab')"
        new = "  if (tabId === 'clients-tab')    renderClients();\n  if (tabId === 'calculator-tab')  initStudioCalculatorLayout();\n  if (tabId === 'queue-tab')"
        if old in js and new not in js:
            js = js.replace(old, new, 1)

    return js


def main():
    index_html = INDEX.read_text(encoding='utf-8')
    if 'khayt-studio' not in index_html:
        raise SystemExit('index.html is not Studio shell — checkout phase 3+ first')
    INDEX.write_text(patch_index(index_html), encoding='utf-8')
    app_js = APP.read_text(encoding='utf-8')
    if 'function initAppShell' not in app_js:
        raise SystemExit('app.js missing initAppShell — checkout phase 3+ first')
    APP.write_text(patch_app(app_js), encoding='utf-8')
    print('Phase 4 patches applied.')


if __name__ == '__main__':
    main()
