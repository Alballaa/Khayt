/**
 * Analytics tab: stats, charts, P&L sections, simple reports mode.
 */
(function (global) {
/* ============================================================
   Simple Reports — shown instead of full Analytics in Simple mode
   ============================================================ */
function renderSimpleReports() {
  const wrap = $('#analyticsSimpleWrap');
  if (!wrap) return;

  const thisMonthStr = localMonthStr();
  const monthOrders = printLog.filter(o => o.status === 'completed' && (o.date || '').startsWith(thisMonthStr));
  const monthRevenue = monthOrders.reduce((s, o) => s + orderRevenueBase(o), 0);
  const monthCount   = monthOrders.length;

  const outstanding = printLog
    .filter(o => payStatus(o) !== 'paid')
    .reduce((s, o) => s + orderOwedBase(o), 0);

  const tagRev = {};
  for (const o of monthOrders) {
    for (const tag of (o.tags || [])) {
      tagRev[tag] = (tagRev[tag] || 0) + orderRevenueBase(o);
    }
  }
  const topTags = Object.entries(tagRev).sort((a, b) => b[1] - a[1]).slice(0, 3);

  wrap.innerHTML = `
    <div class="card" id="simpleReportsCard" style="margin-top:0;">
    <h3 class="card-head"><span class="swatch"></span><span>${escapeHtml(t('an.simple_reports'))}</span></h3>
    <div class="grid-4" style="margin-bottom:16px;">
      <div class="stat revenue">
        <div class="stat-label">${escapeHtml(t('an.simple_revenue'))}</div>
        <div class="stat-value"><span>${fmtMoney(monthRevenue)}</span><span class="unit">${escapeHtml(currencySymbol())}</span></div>
      </div>
      <div class="stat orders">
        <div class="stat-label">${escapeHtml(t('an.simple_orders'))}</div>
        <div class="stat-value">${monthCount}</div>
      </div>
      <div class="stat receivables full">
        <div class="stat-label">${escapeHtml(t('an.simple_outstanding'))}</div>
        <div class="stat-value"><span>${fmtMoney(outstanding)}</span><span class="unit">${escapeHtml(currencySymbol())}</span></div>
      </div>
    </div>
    ${topTags.length > 0 ? `
    <h4 style="font-size:13px;font-weight:600;margin:0 0 10px;">${escapeHtml(t('an.simple_top_products') || 'Top products this month')}</h4>
    <ul class="leaderboard" style="margin-bottom:16px;">
      ${topTags.map(([ tag, rev ], i) => `
        <li>
          <span class="rank">${i + 1}.</span>
          <span class="name">${escapeHtml(tag)}</span>
          <span class="value">${fmtPrice(rev)}</span>
        </li>`).join('')}
    </ul>` : ''}
    <button class="btn small" id="btnSimpleReportsCsv">${escapeHtml(t('an.simple_csv') || 'Download CSV')}</button>
    </div>`;

  wrap.querySelector('#btnSimpleReportsCsv')?.addEventListener('click', () => {
    exportOrdersCsv();
  });
}

function useHandoffAnalytics() {
  return document.body.classList.contains('khayt-handoff') && settings.mode === 'professional';
}

function handoffSparkSvg(data, w, h) {
  if (!data?.length) return '';
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = Math.round((i / Math.max(data.length - 1, 1)) * w);
    const y = Math.round(h - (v / max) * h * 0.9);
    return `${x},${y}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" class="khayt-spark" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/></svg>`;
}

function computeHandoffMachineRows() {
  const orders = printLog.filter(o => inRange(o.date, analyticsRange, 'analytics') && o.status === 'completed');
  const machMap = {};
  for (const m of machines) {
    machMap[m.id] = { name: m.name, profit: 0, hours: 0, util: null };
  }
  const now = new Date();
  let rangeDays = 30;
  if (analyticsRange === 'month') rangeDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  else if (analyticsRange === 'last_month') rangeDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  else if (analyticsRange === 'quarter') rangeDays = 91;
  else if (analyticsRange === 'year') rangeDays = 365;

  for (const o of orders) {
    const key = o.machineId && machMap[o.machineId] ? o.machineId : null;
    if (!key) continue;
    const rev = orderRevenueBase(o);
    const cost = (o.parts || []).reduce((s, p) => s + computePartBaseCost(p), 0);
    machMap[key].profit += rev - cost;
    machMap[key].hours += +o.printTime || 0;
  }
  for (const m of machines) {
    if (!machMap[m.id]) continue;
    const target = +(m.targetHoursPerDay || 0);
    if (target > 0 && machMap[m.id].hours > 0) {
      machMap[m.id].util = Math.min(100, Math.round((machMap[m.id].hours / (target * rangeDays)) * 100));
    }
  }
  return Object.values(machMap).filter(r => r.hours > 0 || r.profit > 0).sort((a, b) => b.profit - a.profit);
}

function buildHandoffHeatmapCells() {
  const completed = printLog.filter(o =>
    o.status === 'completed' && o.completedAt && inRange(o.date, analyticsRange, 'analytics'),
  );
  const matrix = Array.from({ length: 7 }, () => Array(12).fill(0));
  completed.forEach(o => {
    try {
      const d = new Date(o.completedAt);
      const week = Math.min(11, Math.floor((Date.now() - d.getTime()) / (7 * 86400000)));
      const dow = d.getDay();
      if (week >= 0 && week < 12) matrix[dow][11 - week]++;
    } catch (_) { /* ignore */ }
  });
  const maxVal = Math.max(1, ...matrix.flat());
  const cells = [];
  for (let w = 0; w < 12; w++) {
    for (let d = 0; d < 7; d++) {
      const v = matrix[d][w] / maxVal;
      cells.push(`<span style="background:hsl(var(--accent-h) var(--accent-s) var(--accent-l) / ${(0.12 + v * 0.85).toFixed(2)})"></span>`);
    }
  }
  return { cells: cells.join(''), maxVal, hasData: completed.length >= 5 };
}

function renderHandoffAnalyticsOverview(ctx) {
  const wrap = $('#analyticsHandoffWrap');
  if (!wrap) return;
  if (!useHandoffAnalytics()) {
    wrap.innerHTML = '';
    return;
  }

  const { revenue, completed, receivables, convRate, revSpark } = ctx;
  const cur = currencySymbol();
  const netProfit = completed.reduce((s, o) => {
    const rev = orderRevenueBase(o);
    const cost = (o.parts || []).reduce((cs, p) => cs + computePartBaseCost(p), 0);
    return s + (rev - cost);
  }, 0);
  const avgOrder = completed.length ? revenue / completed.length : 0;
  const repeatClients = (() => {
    const counts = {};
    completed.forEach(o => { if (o.clientId) counts[o.clientId] = (counts[o.clientId] || 0) + 1; });
    const ids = Object.keys(counts);
    if (!ids.length) return null;
    return Math.round((ids.filter(id => counts[id] > 1).length / ids.length) * 100);
  })();

  const kpis = [
    { l: t('an.revenue') || 'Revenue', v: Math.round(revenue).toLocaleString(), u: cur, spark: revSpark },
    { l: t('an.net_profit') || 'Net profit', v: Math.round(netProfit).toLocaleString(), u: cur },
    { l: t('an.avg_order') || 'Avg. order value', v: Math.round(avgOrder).toLocaleString(), u: cur },
    { l: t('an.repeat_rate') || 'Repeat rate', v: repeatClients != null ? String(repeatClients) : '—', u: repeatClients != null ? '%' : '' },
  ];

  const machines = computeHandoffMachineRows();
  const maxP = Math.max(...machines.map(m => m.profit), 1);
  const heat = buildHandoffHeatmapCells();
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const clientAgg = {};
  completed.forEach(o => {
    if (!o.clientId) return;
    clientAgg[o.clientId] = clientAgg[o.clientId] || { count: 0, revenue: 0 };
    clientAgg[o.clientId].count++;
    clientAgg[o.clientId].revenue += orderRevenueBase(o);
  });
  const topClients = Object.entries(clientAgg)
    .map(([id, agg]) => {
      const c = clients.find(x => x.id === id);
      const tier = typeof getClientTier === 'function' ? getClientTier(id) : null;
      return { id, name: c ? localName(c) : id, color: c?.color || 'var(--accent)', tier: tier?.name || '—', ...agg };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  const maxLtv = Math.max(...topClients.map(c => c.revenue), 1);

  wrap.innerHTML = `
    <div class="khayt-grid khayt-an-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--gap)">
      ${kpis.map(k => `
        <div class="card khayt-an-kpi">
          <span class="eyebrow">${escapeHtml(k.l)}</span>
          <span class="row" style="align-items:baseline;gap:4px">
            <span class="metric" style="font-size:26px">${escapeHtml(k.v)}</span>
            ${k.u ? `<span class="mono" style="font-size:11px;color:var(--text-muted)">${escapeHtml(k.u)}</span>` : ''}
          </span>
          ${k.spark ? `<div style="margin-top:8px">${handoffSparkSvg(k.spark, 200, 32)}</div>` : ''}
        </div>`).join('')}
    </div>
    <div class="khayt-grid khayt-an-grid-2" style="grid-template-columns:1fr 1fr;gap:var(--gap)">
      <div class="card">
        <span class="sec-title">${escapeHtml(t('an.machine_pl') || 'Machine P&L')}</span>
        <div class="col gap12" style="margin-top:14px">
          ${machines.length ? machines.map(m => `
            <div class="col gap6">
              <div class="row between">
                <span style="font-size:12.5px">${escapeHtml(m.name)}</span>
                <span class="metric" style="font-size:12.5px">${escapeHtml(fmtMoney(m.profit))}</span>
              </div>
              <div class="row gap10" style="align-items:center">
                <div class="meter grow"><i style="width:${Math.max(4, (m.profit / maxP) * 100)}%"></i></div>
                <span class="mono" style="font-size:10.5px;color:var(--text-muted);width:78px;text-align:end">${m.hours.toFixed(1)}h${m.util != null ? ` · ${m.util}%` : ''}</span>
              </div>
            </div>`).join('') : `<p class="dash-empty">${escapeHtml(t('an.no_data'))}</p>`}
        </div>
      </div>
      <div class="card">
        <div class="row between">
          <span class="sec-title">${escapeHtml(t('an.production_heatmap') || 'Production heatmap')}</span>
          <span style="font-size:11.5px;color:var(--text-muted)">${escapeHtml(t('an.last_12_weeks') || 'last 12 weeks')}</span>
        </div>
        ${heat.hasData ? `
        <div class="row gap10" style="margin-top:16px;align-items:flex-start">
          <div class="col" style="gap:4px;padding-top:1px">
            ${dayLabels.map((d2, i) => `<span class="mono" style="font-size:9px;color:var(--text-faint);height:16px;line-height:16px">${d2}</span>`).join('')}
          </div>
          <div class="heatmap-mini grow">${heat.cells}</div>
        </div>` : `<p class="dash-empty" style="margin-top:14px">${escapeHtml(t('an.heatmap_no_data'))}</p>`}
      </div>
    </div>
    <div class="card flush">
      <div class="row between" style="padding:14px 18px">
        <span class="sec-title">${escapeHtml(t('an.top_clients_revenue') || 'Top clients · revenue')}</span>
      </div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr>
            <th>${escapeHtml(t('log.client'))}</th>
            <th>${escapeHtml(t('an.orders'))}</th>
            <th>${escapeHtml(t('cl.revenue'))}</th>
            <th>${escapeHtml(t('an.share'))}</th>
            <th>${escapeHtml(t('cl.tier'))}</th>
          </tr></thead>
          <tbody>
            ${topClients.length ? topClients.map(c => `
              <tr>
                <td><div class="row gap8" style="align-items:center"><span class="dot" style="background:${safeCssColor(c.color, 'var(--accent)')};width:8px;height:8px"></span><strong style="font-size:13">${escapeHtml(c.name)}</strong></div></td>
                <td><span class="metric" style="font-size:13px">${c.count}</span></td>
                <td><span class="metric" style="font-size:13px">${escapeHtml(fmtMoney(c.revenue))}</span></td>
                <td style="width:160px"><div class="meter"><i style="width:${(c.revenue / maxLtv * 100).toFixed(1)}%;background:${safeCssColor(c.color, 'var(--accent)')}"></i></div></td>
                <td><span class="pill" style="padding:2px 9px">${escapeHtml(c.tier)}</span></td>
              </tr>`).join('') : `<tr><td colspan="5">${escapeHtml(t('an.no_top_clients'))}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderAnalytics() {
  const orders = printLog.filter(o => inRange(o.date, analyticsRange, 'analytics'));
  const completed = orders.filter(o => o.status === 'completed');
  const revenue = completed.reduce((s, o) => s + convertToBase(+o.price, clientCurrency(o.clientId)), 0);
  const hours   = orders.reduce((s, o) => s + +o.printTime, 0);
  const inProgress = orders.filter(o => o.status !== 'completed' && o.status !== 'pending').length;
  // Receivables — outstanding amount across all unpaid/partial orders, regardless of status
  const receivables = printLog
    .filter(o => (payStatus(o)) !== 'paid')
    .reduce((s, o) => s + orderOwedBase(o), 0);

  const revSpark = (() => {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mRev = printLog.filter(o => o.status === 'completed' && (o.date || '').startsWith(key))
        .reduce((s, o) => s + orderRevenueBase(o), 0);
      months.push(mRev);
    }
    return months;
  })();

  $('#stat-revenue').textContent = fmtMoney(revenue);
  $('#stat-orders').textContent  = completed.length;
  $('#stat-hours').textContent   = hours.toFixed(1);
  $('#stat-pending').textContent = inProgress;
  const recEl = $('#stat-receivables');
  if (recEl) recEl.textContent = fmtMoney(receivables);

  // Quote conversion rate
  const quotesCreated   = printLog.filter(o => o.quoteSentAt   && inRange(o.quoteSentAt,   analyticsRange, 'analytics'));
  const quotesConverted = printLog.filter(o => o.quoteAcceptedAt && inRange(o.quoteAcceptedAt, analyticsRange, 'analytics'));
  const convRate = quotesCreated.length > 0 ? Math.round(quotesConverted.length / quotesCreated.length * 100) : null;
  const qcEl = $('#stat-quotes-created');
  if (qcEl) qcEl.textContent = quotesCreated.length;
  const crEl = $('#stat-conv-rate');
  if (crEl) crEl.textContent = convRate !== null ? `${convRate}%` : '—';

  renderHandoffAnalyticsOverview({ revenue, completed, receivables, convRate, revSpark });

  // Top products
  const productAgg = {};
  orders.forEach(o => {
    if (!o.productId) return;
    productAgg[o.productId] = productAgg[o.productId] || { count: 0, revenue: 0 };
    productAgg[o.productId].count++;
    if (o.status === 'completed') productAgg[o.productId].revenue += orderRevenueBase(o);
  });
  const topProducts = Object.entries(productAgg)
    .map(([id, agg]) => {
      const p = products.find(x => x.id === id);
      const name = p ? (localName(p)) : id;
      return { name, ...agg };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const tpList = $('#topProductsList');
  if (topProducts.length === 0) {
    tpList.innerHTML = `<li><span class="rank">—</span><span class="name" style="color: var(--text-muted);">${escapeHtml(t('an.no_top_products'))}</span></li>`;
  } else {
    tpList.innerHTML = topProducts.map((p, i) => `
      <li>
        <span class="rank">${i + 1}.</span>
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="value">${p.count}× · ${fmtPrice(p.revenue)}</span>
      </li>`).join('');
  }

  // Top clients
  const clientAgg = {};
  completed.forEach(o => {
    if (!o.clientId) return;
    clientAgg[o.clientId] = clientAgg[o.clientId] || { count: 0, revenue: 0 };
    clientAgg[o.clientId].count++;
    clientAgg[o.clientId].revenue += orderRevenueBase(o);
  });
  const topClients = Object.entries(clientAgg)
    .map(([id, agg]) => {
      const c = clients.find(x => x.id === id);
      const name = c ? (localName(c)) : id;
      return { name, ...agg };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const tcList = $('#topClientsList');
  if (topClients.length === 0) {
    tcList.innerHTML = `<li><span class="rank">—</span><span class="name" style="color: var(--text-muted);">${escapeHtml(t('an.no_top_clients'))}</span></li>`;
  } else {
    tcList.innerHTML = topClients.map((c, i) => `
      <li>
        <span class="rank">${i + 1}.</span>
        <span class="name">${escapeHtml(c.name)}</span>
        <span class="value">${fmtPrice(c.revenue)} · ${c.count}×</span>
      </li>`).join('');
  }

  // Recent activity
  const ul = $('#activityList');
  if (orders.length === 0) {
    ul.innerHTML = `<li>${escapeHtml(t('an.no_activity'))}</li>`;
  } else {
    ul.innerHTML = orders.slice(0, 8).map(log => `
      <li>
        <span class="date">${escapeHtml(log.date)}</span>
        <span><strong>${escapeHtml(log.project)}</strong> · <span class="badge ${escapeHtml(log.status)}">${escapeHtml(t('queue.' + log.status))}</span></span>
      </li>`).join('');
  }

  // Accuracy section
  const accuracyEl = $('#accuracySection');
  if (accuracyEl) {
    const withActuals = completed.filter(o => o.actualPrintTime != null);
    if (withActuals.length === 0) {
      accuracyEl.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.accuracy_none'))}</p>`;
    } else {
      const sign = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
      const col  = v => Math.abs(v) <= 10 ? 'var(--success)' : Math.abs(v) <= 25 ? 'var(--warning)' : 'var(--danger)';
      const avgTimeVar = withActuals.reduce((s, o) =>
        s + (o.printTime > 0 ? (o.actualPrintTime - o.printTime) / o.printTime * 100 : 0), 0) / withActuals.length;
      const withWeight = withActuals.filter(o => o.actualWeight != null);
      const estW = o => (o.parts || []).reduce((s, p) => s + (+p.printWeight || 0) * (p.qty || 1), 0);
      const avgWeightVar = withWeight.length > 0
        ? withWeight.reduce((s, o) => {
            const e = estW(o);
            return s + (e > 0 ? (o.actualWeight - e) / e * 100 : 0);
          }, 0) / withWeight.length
        : null;

      accuracyEl.innerHTML = `
        <div class="accuracy-stats">
          <div class="accuracy-stat">
            <div class="v" style="color:${col(avgTimeVar)}">${sign(avgTimeVar)}</div>
            <div class="l">${escapeHtml(t('an.time_accuracy'))}</div>
            <div class="hint">${escapeHtml(t('an.accuracy_based_on', { n: withActuals.length }))}</div>
          </div>
          ${avgWeightVar !== null ? `
          <div class="accuracy-stat">
            <div class="v" style="color:${col(avgWeightVar)}">${sign(avgWeightVar)}</div>
            <div class="l">${escapeHtml(t('an.weight_accuracy'))}</div>
            <div class="hint">${escapeHtml(t('an.accuracy_based_on', { n: withWeight.length }))}</div>
          </div>` : ''}
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table>
            <thead><tr>
              <th>${escapeHtml(t('log.client'))}</th>
              <th>${escapeHtml(t('an.est_time'))}</th>
              <th>${escapeHtml(t('an.act_time'))}</th>
              <th>${escapeHtml(t('an.variance'))}</th>
            </tr></thead>
            <tbody>
              ${withActuals.slice(0, 8).map(o => {
                const diff = o.printTime > 0 ? (o.actualPrintTime - o.printTime) / o.printTime * 100 : 0;
                return `<tr>
                  <td>${escapeHtml(o.project || o.id)}</td>
                  <td style="color:var(--text-dim);">${o.printTime} ${escapeHtml(t('common.hours'))}</td>
                  <td style="color:var(--text-dim);">${o.actualPrintTime} ${escapeHtml(t('common.hours'))}</td>
                  <td style="font-weight:600; color:${col(diff)};">${sign(diff)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }
  }

  // --- Feature 2: Estimation accuracy from printingStartedAt / completedAt timestamps ---
  (function renderTimestampAccuracy() {
    const el = $('#timestampAccuracySection');
    if (!el) return;
    const ordersWithBoth = printLog.filter(o =>
      o.status === 'completed' && o.printingStartedAt && o.completedAt && o.printTime > 0
    );
    if (ordersWithBoth.length < 2) { el.innerHTML = ''; return; }
    let totalActual = 0, totalEst = 0;
    for (const o of ordersWithBoth) {
      const actualH = (new Date(o.completedAt) - new Date(o.printingStartedAt)) / 3600000;
      totalActual += actualH;
      totalEst    += +o.printTime;
    }
    const avgActual = totalActual / ordersWithBoth.length;
    const avgEst    = totalEst    / ordersWithBoth.length;
    const diffPct   = avgEst > 0 ? Math.round((avgActual - avgEst) / avgEst * 100) : 0;
    const sign      = diffPct >= 0 ? `+${diffPct}` : `${diffPct}`;
    const col       = diffPct > 15 ? 'var(--danger)' : diffPct < -5 ? 'var(--warning)' : 'var(--success)';
    el.innerHTML = `
      <div class="accuracy-stat">
        <div class="v" style="color:${col};">${sign}%</div>
        <div class="l">${escapeHtml(t('an.est_accuracy'))}</div>
        <div class="hint">${escapeHtml(t('an.actual_vs_est', {
          actual: avgActual.toFixed(1),
          est:    avgEst.toFixed(1),
          diff:   sign,
        }))}</div>
      </div>`;
  })();

  renderRevenueChart();
  renderMaterialUsageChart();
  renderFilamentAnalytics();
  renderPrinterUtilizationChart();
  renderPnLSection();
  renderProductProfitability();
  renderSLASection();
  renderMachinePL();
  renderLocationPL();
  renderSupplierPriceHistory();
  renderThroughputHeatmap();
  renderClientRetention();
  renderCostTrends();
  renderOperatorAnalytics();
  // Round 12 additions
  renderAgedReceivables();
  renderSurveyAnalytics();
  renderNewVsReturning();
  renderQuoteFunnelChart();
  renderMonthlyTrendChart();
  renderMachineRevenueChart();
  renderProfitMarginChart();
  renderMachineAccuracy();
  renderClientSourceChart();
  // Round 13 additions
  renderWasteTrendChart();
  renderCycleTimeChart();
  renderCashFlowChart();
  renderExpenseCategoryChart();
  renderLeadTimeChart();
  renderNpsTrendChart();
  renderClientLtvTable();
  renderMachineDowntimeChart();
  renderMaintenanceCostChart();
  // Feature K: Time tracking analytics
  renderTimeAnalytics();
}

function renderClientSourceChart() {
  const el = $('#clientSourceChart');
  if (!el) return;
  const sources = ['instagram','referral','walk_in','website','exhibition','other'];
  const counts = {};
  for (const s of sources) counts[s] = 0;
  for (const c of clients) counts[c.source || 'other'] = (counts[c.source || 'other'] || 0) + 1;

  const maxCount = Math.max(...Object.values(counts), 1);

  const sourceColors = {
    instagram:  '#e1306c',
    referral:   '#22c55e',
    walk_in:    '#3b82f6',
    website:    '#f59e0b',
    exhibition: '#a855f7',
    other:      '#6b7280',
  };

  const rows = sources
    .filter(s => counts[s] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .map(s => {
      const pct = Math.round((counts[s] / maxCount) * 100);
      const revBySource = printLog
        .filter(o => o.status === 'completed' && o.clientId && clients.find(c => c.id === o.clientId && (c.source || 'other') === s))
        .reduce((sum, o) => sum + orderRevenueBase(o), 0);
      return `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="min-width:90px;font-size:12px;color:var(--text);text-align:end;">${escapeHtml(t('cl.source_' + s))}</div>
          <div style="flex:1;background:var(--border);border-radius:4px;height:14px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${sourceColors[s]};border-radius:4px;transition:width .4s;"></div>
          </div>
          <div style="min-width:60px;font-size:11px;color:var(--text-muted);">${counts[s]} · ${fmtPrice(revBySource)}</div>
        </div>`;
    }).join('');

  if (!rows) {
    el.innerHTML = `<p class="dash-empty">${escapeHtml(t('an.source_empty'))}</p>`;
    return;
  }
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.source_title'))}</h3>
      <div style="padding:8px 0;">${rows}</div>
    </div>`;
}

/* ── Quote Conversion Funnel ────────────────────────────── */
function renderQuoteFunnelChart() {
  const el = $('#quoteFunnelChart');
  if (!el) return;

  // Step 1: All orders that were at some point a quote
  const allQuoteOrders = printLog.filter(o =>
    o.status === 'quote' || o.quoteSentAt || o.quoteAcceptedAt
  );
  // Step 2: Quotes that were explicitly sent
  const sent = allQuoteOrders.filter(o => o.quoteSentAt);
  // Step 3: Quotes accepted by client
  const accepted = allQuoteOrders.filter(o => o.quoteAcceptedAt);
  // Step 4: Accepted quotes converted to active orders (status not 'quote', not voided)
  const converted = accepted.filter(o => o.status !== 'quote' && !o.voidedAt);
  // Step 5: Converted that are now completed
  const completedConv = converted.filter(o => o.status === 'completed');

  const steps = [
    { key: 'an.funnel_created',   count: allQuoteOrders.length, color: '#6366f1' },
    { key: 'an.funnel_sent',      count: sent.length,           color: '#3b82f6' },
    { key: 'an.funnel_accepted',  count: accepted.length,       color: '#22c55e' },
    { key: 'an.funnel_converted', count: converted.length,      color: '#f59e0b' },
    { key: 'an.funnel_completed', count: completedConv.length,  color: '#10b981' },
  ];

  if (allQuoteOrders.length === 0) {
    el.innerHTML = '';
    return;
  }

  const maxCount = Math.max(allQuoteOrders.length, 1);

  const rows = steps.map((step, i) => {
    const pct = maxCount > 0 ? Math.round((step.count / maxCount) * 100) : 0;
    const convFromPrev = i > 0 && steps[i - 1].count > 0
      ? Math.round((step.count / steps[i - 1].count) * 100)
      : null;
    const convColor = convFromPrev !== null
      ? (convFromPrev >= 80 ? 'var(--success)' : convFromPrev >= 50 ? 'var(--warning)' : 'var(--danger)')
      : '';
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="min-width:130px;font-size:12px;color:var(--text);text-align:end;">${escapeHtml(t(step.key))}</div>
        <div style="flex:1;background:var(--border);border-radius:4px;height:18px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${step.color};border-radius:4px;transition:width .4s;display:flex;align-items:center;justify-content:flex-end;padding-inline-end:6px;">
            ${step.count > 0 ? `<span style="font-size:10px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5);">${step.count}</span>` : ''}
          </div>
        </div>
        <div style="min-width:56px;font-size:12px;color:var(--text-muted);display:flex;flex-direction:column;align-items:flex-start;line-height:1.3;">
          <span>${step.count}</span>
          ${convFromPrev !== null ? `<span style="font-size:10px;color:${convColor};">${convFromPrev}%</span>` : ''}
        </div>
      </div>`;
  }).join('');

  const overallRate = allQuoteOrders.length > 0
    ? Math.round((completedConv.length / allQuoteOrders.length) * 100)
    : 0;

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:12px;">
        <span class="swatch"></span>${escapeHtml(t('an.funnel_title'))}
        <span style="margin-inline-start:10px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(99,102,241,0.15);color:#818cf8;">
          ${escapeHtml(t('an.funnel_overall'))}: ${overallRate}%
        </span>
      </h3>
      ${rows}
    </div>`;
}

/* ── Monthly Revenue vs Expense Trend ───────────────────── */
function renderMonthlyTrendChart() {
  const el = $('#monthlyTrendChart');
  if (!el) return;

  // Build last 6 months (YYYY-MM strings, oldest first)
  const today = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const revByMonth = {};
  const expByMonth = {};
  months.forEach(m => { revByMonth[m] = 0; expByMonth[m] = 0; });

  for (const o of printLog) {
    if (o.status !== 'completed') continue;
    const m = (o.date || '').slice(0, 7);
    if (revByMonth[m] !== undefined) revByMonth[m] += orderRevenueBase(o);
  }
  for (const e of expenses) {
    const m = (e.date || '').slice(0, 7);
    if (expByMonth[m] !== undefined) expByMonth[m] += +e.amount || 0;
  }

  const maxVal = Math.max(...months.map(m => Math.max(revByMonth[m], expByMonth[m])), 1);

  // SVG dimensions
  const svgW = 560, svgH = 160;
  const padL = 50, padR = 12, padT = 24, padB = 36;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;
  const groupW = chartW / months.length;
  const barW = Math.min(22, groupW * 0.35);
  const gap = 4;

  // Y-axis labels (3 lines: 0, 50%, 100%)
  const yLabels = [0, 0.5, 1].map(f => {
    const yVal = Math.round(maxVal * f);
    const y = padT + chartH - f * chartH;
    return `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="var(--text-muted)">${fmtMoney(yVal)}</text>
            <line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="var(--border)" stroke-dasharray="3,3" stroke-width="0.5"/>`;
  }).join('');

  const bars = months.map((m, i) => {
    const rev = revByMonth[m];
    const exp = expByMonth[m];
    const cx = padL + i * groupW + groupW / 2;
    const revH = rev > 0 ? Math.max(2, (rev / maxVal) * chartH) : 0;
    const expH = exp > 0 ? Math.max(2, (exp / maxVal) * chartH) : 0;
    const revY = padT + chartH - revH;
    const expY = padT + chartH - expH;
    const label = new Date(m + '-01').toLocaleDateString(undefined, { month: 'short' });
    const profit = rev - exp;
    const profitColor = profit >= 0 ? '#22c55e' : '#ef4444';

    return `
      <rect x="${cx - barW - gap / 2}" y="${revY}" width="${barW}" height="${revH}" fill="#22c55e" opacity="0.8" rx="2"/>
      <rect x="${cx + gap / 2}" y="${expY}" width="${barW}" height="${expH}" fill="#ef4444" opacity="0.7" rx="2"/>
      ${(rev > 0 || exp > 0) ? `<text x="${cx}" y="${Math.min(revY, expY) - 4}" text-anchor="middle" font-size="9" fill="${profitColor}" font-weight="600">${fmtMoney(profit)}</text>` : ''}
      <text x="${cx}" y="${padT + chartH + 16}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${label}</text>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.monthly_trend_title'))}</h3>
      <div style="display:flex;gap:16px;margin-bottom:8px;font-size:11px;">
        <span><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;margin-inline-end:4px;"></span>${escapeHtml(t('an.monthly_rev'))}</span>
        <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;margin-inline-end:4px;"></span>${escapeHtml(t('an.monthly_exp'))}</span>
        <span style="color:var(--text-muted);">${escapeHtml(t('an.monthly_profit_above'))}</span>
      </div>
      <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;max-width:${svgW}px;overflow:visible;">
        ${yLabels}
        ${bars}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="var(--border)" stroke-width="1"/>
        <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="var(--border)" stroke-width="1"/>
      </svg>
    </div>`;
}

/* ── Revenue by machine chart ───────────────────────────── */
function renderMachineRevenueChart() {
  const el = $('#machineRevenueChart');
  if (!el) return;

  const completed = printLog.filter(o => o.status === 'completed' && o.machineId);
  if (completed.length === 0) { el.innerHTML = ''; return; }

  const machMap = {};
  for (const m of machines) {
    machMap[m.id] = { name: m.name || m.model || m.id, color: m.color || '#6b7280', revenue: 0, count: 0 };
  }
  // Also capture orders with machineId that no longer maps to a known machine
  for (const o of completed) {
    if (!machMap[o.machineId]) {
      machMap[o.machineId] = { name: o.machine || o.machineId, color: '#6b7280', revenue: 0, count: 0 };
    }
    machMap[o.machineId].revenue += orderRevenueBase(o);
    machMap[o.machineId].count++;
  }

  const rows = Object.values(machMap)
    .filter(m => m.count > 0)
    .sort((a, b) => b.revenue - a.revenue);

  if (rows.length === 0) { el.innerHTML = ''; return; }

  const maxRev = rows[0].revenue;

  const bars = rows.map(m => {
    const pct = maxRev > 0 ? Math.round((m.revenue / maxRev) * 100) : 0;
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
        <div style="display:flex;align-items:center;gap:6px;min-width:130px;overflow:hidden;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${safeCssColor(m.color)};flex-shrink:0;"></span>
          <span style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.name)}</span>
        </div>
        <div style="flex:1;background:var(--border);border-radius:4px;height:14px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${safeCssColor(m.color)};border-radius:4px;transition:width .4s;opacity:0.85;"></div>
        </div>
        <div style="min-width:100px;font-size:12px;text-align:end;">
          <span style="color:var(--success);font-weight:600;">${fmtPrice(m.revenue)}</span>
          <span style="color:var(--text-muted);font-size:11px;margin-inline-start:4px;">${m.count} ${escapeHtml(t('an.jobs') || 'jobs')}</span>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.machine_rev_title'))}</h3>
      <div style="padding:4px 0;">${bars}</div>
    </div>`;
}

function renderProfitMarginChart() {
  const el = $('#profitMarginChart');
  if (!el) return;

  const today = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const marginByMonth = {};
  months.forEach(m => { marginByMonth[m] = { total: 0, count: 0 }; });
  for (const o of printLog) {
    if (o.status !== 'completed' || !o.costBasis || !+o.price) continue;
    const m = (o.date || '').slice(0, 7);
    if (!marginByMonth[m]) continue;
    const margin = (+o.price - +o.costBasis) / +o.price * 100;
    marginByMonth[m].total += margin;
    marginByMonth[m].count++;
  }

  const vals = months.map(m => {
    const b = marginByMonth[m];
    return b.count > 0 ? b.total / b.count : null;
  });

  const hasData = vals.some(v => v !== null);
  if (!hasData) { el.innerHTML = ''; return; }

  const maxVal = Math.max(...vals.filter(v => v !== null), 1);
  const H = 120, BAR_W = 40, GAP = 28;
  const total = months.length;
  const chartW = total * (BAR_W + GAP);

  const bars = months.map((m, i) => {
    const v = vals[i];
    if (v === null) return '';
    const bh = Math.max(4, Math.round((v / maxVal) * (H - 30)));
    const x = i * (BAR_W + GAP);
    const y = H - 22 - bh;
    const col = v >= 40 ? '#22c55e' : v >= 20 ? '#f59e0b' : '#ef4444';
    const label = m.slice(5);
    return `<rect x="${x}" y="${y}" width="${BAR_W}" height="${bh}" rx="3" fill="${col}" opacity="0.85"/>
      <text x="${x + BAR_W / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="${col}">${v.toFixed(0)}%</text>
      <text x="${x + BAR_W / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${escapeHtml(label)}</text>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:12px;">
        <span class="swatch"></span>${escapeHtml(t('an.profit_margin_title') || 'Avg Profit Margin by Month')}
      </h3>
      <div style="overflow-x:auto;">
        <svg width="${chartW}" height="${H}" style="display:block;min-width:200px;">
          ${bars}
        </svg>
      </div>
    </div>`;
}

// ── Analytics Round 13: 9 new charts ──────────────────────────────────────────

function renderWasteTrendChart() {
  const el = $('#wasteTrendChart');
  if (!el) return;

  const today = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
    });
  }

  const failureColors = { warping: '#f59e0b', adhesion: '#ef4444', stringing: '#f97316' };
  const topTypes = ['warping', 'adhesion', 'stringing'];

  // Build data: {month -> {failureType -> weight}}
  const data = {};
  months.forEach(m => { data[m.key] = {}; topTypes.forEach(t2 => { data[m.key][t2] = 0; }); data[m.key]['other'] = 0; });

  for (const w of (wasteLog || [])) {
    if (!w.date) continue;
    const mk = localMonthStr(new Date(w.date));
    if (!data[mk]) continue;
    const ft = topTypes.includes(w.failureType) ? w.failureType : 'other';
    data[mk][ft] = (data[mk][ft] || 0) + (+w.weight || 0);
  }

  const allTypes = [...topTypes, 'other'];
  const typeColors = { ...failureColors, other: '#6b7280' };
  const allVals = months.flatMap(m => allTypes.map(ft => data[m.key][ft]));
  const hasData = allVals.some(v => v > 0);

  if (!hasData) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.waste_trend') || 'Waste by Failure Type')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const maxVal = Math.max(...months.map(m => allTypes.reduce((s, ft) => s + data[m.key][ft], 0)), 1);
  const H = 140, BAR_W = 14, GAP = 30;
  const groupW = allTypes.length * BAR_W + 4;
  const chartW = months.length * (groupW + GAP);

  const bars = months.map((m, mi) => {
    const gx = mi * (groupW + GAP);
    const bars2 = allTypes.map((ft, fi) => {
      const v = data[m.key][ft];
      if (!v) return '';
      const bh = Math.max(3, Math.round((v / maxVal) * (H - 32)));
      const x = gx + fi * BAR_W;
      const y = H - 22 - bh;
      return `<rect x="${x}" y="${y}" width="${BAR_W - 2}" height="${bh}" rx="2" fill="${typeColors[ft]}" opacity="0.85"/>`;
    }).join('');
    return `${bars2}<text x="${gx + groupW / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${escapeHtml(m.label)}</text>`;
  }).join('');

  const legend = allTypes.map(ft => `<span style="display:inline-flex;align-items:center;gap:4px;margin-inline-end:10px;font-size:11px;color:var(--text-muted);"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${typeColors[ft]};"></span>${escapeHtml(ft)}</span>`).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:8px;"><span class="swatch"></span>${escapeHtml(t('an.waste_trend') || 'Waste by Failure Type')}</h3>
      <div style="margin-bottom:6px;">${legend}</div>
      <div style="overflow-x:auto;">
        <svg width="${chartW}" height="${H}" style="display:block;min-width:200px;">${bars}</svg>
      </div>
    </div>`;
}

function renderCycleTimeChart() {
  const el = $('#cycleTimeChart');
  if (!el) return;

  const today = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
    });
  }

  const byMonth = {};
  months.forEach(m => { byMonth[m.key] = { total: 0, count: 0 }; });

  for (const o of (printLog || [])) {
    if (o.status !== 'completed' || !o.date || !o.completedAt) continue;
    const mk = localMonthStr(new Date(o.completedAt));
    if (!byMonth[mk]) continue;
    const days = (new Date(o.completedAt) - new Date(o.date)) / 86400000;
    if (days < 0) continue;
    byMonth[mk].total += days;
    byMonth[mk].count++;
  }

  const vals = months.map(m => {
    const b = byMonth[m.key];
    return b.count > 0 ? b.total / b.count : null;
  });

  const hasData = vals.some(v => v !== null);
  if (!hasData) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.cycle_time') || 'Avg Cycle Time (days)')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const maxVal = Math.max(...vals.filter(v => v !== null), 1);
  const H = 130, BAR_W = 40, GAP = 28;
  const chartW = months.length * (BAR_W + GAP);

  const bars = months.map((m, i) => {
    const v = vals[i];
    if (v === null) return `<text x="${i * (BAR_W + GAP) + BAR_W / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${escapeHtml(m.label)}</text>`;
    const bh = Math.max(4, Math.round((v / maxVal) * (H - 36)));
    const x = i * (BAR_W + GAP);
    const y = H - 22 - bh;
    const label = v.toFixed(1);
    return `<rect x="${x}" y="${y}" width="${BAR_W}" height="${bh}" rx="3" fill="var(--primary)" opacity="0.8"/>
      <text x="${x + BAR_W / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="var(--primary)">${escapeHtml(label)}</text>
      <text x="${x + BAR_W / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${escapeHtml(m.label)}</text>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:12px;"><span class="swatch"></span>${escapeHtml(t('an.cycle_time') || 'Avg Cycle Time (days)')}</h3>
      <div style="overflow-x:auto;">
        <svg width="${chartW}" height="${H}" style="display:block;min-width:200px;">${bars}</svg>
      </div>
    </div>`;
}

function renderCashFlowChart() {
  const el = $('#cashFlowChart');
  if (!el) return;

  const today = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
    });
  }

  const revByMonth = {};
  const expByMonth = {};
  months.forEach(m => { revByMonth[m.key] = 0; expByMonth[m.key] = 0; });

  for (const o of (printLog || [])) {
    if (!o.paidAt) continue;
    const mk = localMonthStr(new Date(o.paidAt));
    if (revByMonth[mk] !== undefined) revByMonth[mk] += orderRevenueBase(o);
  }
  for (const e of (expenses || [])) {
    if (!e.date) continue;
    const mk = localMonthStr(new Date(e.date));
    if (expByMonth[mk] !== undefined) expByMonth[mk] += +e.amount || 0;
  }

  const hasData = months.some(m => revByMonth[m.key] > 0 || expByMonth[m.key] > 0);
  if (!hasData) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.cash_flow') || 'Cash Flow')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const maxVal = Math.max(...months.flatMap(m => [revByMonth[m.key], expByMonth[m.key]]), 1);
  const H = 140, BAR_W = 22, GAP = 28;
  const groupW = BAR_W * 2 + 4;
  const chartW = months.length * (groupW + GAP);

  const bars = months.map((m, i) => {
    const rv = revByMonth[m.key];
    const ev = expByMonth[m.key];
    const gx = i * (groupW + GAP);
    const rbh = Math.max(rv > 0 ? 3 : 0, Math.round((rv / maxVal) * (H - 32)));
    const ebh = Math.max(ev > 0 ? 3 : 0, Math.round((ev / maxVal) * (H - 32)));
    return `${rbh > 0 ? `<rect x="${gx}" y="${H - 22 - rbh}" width="${BAR_W}" height="${rbh}" rx="2" fill="var(--success)" opacity="0.85"/>` : ''}
      ${ebh > 0 ? `<rect x="${gx + BAR_W + 4}" y="${H - 22 - ebh}" width="${BAR_W}" height="${ebh}" rx="2" fill="var(--danger)" opacity="0.75"/>` : ''}
      <text x="${gx + groupW / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${escapeHtml(m.label)}</text>`;
  }).join('');

  const legend = `<span style="display:inline-flex;align-items:center;gap:4px;margin-inline-end:10px;font-size:11px;color:var(--text-muted);"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--success);"></span>${escapeHtml(t('an.collected') || 'Collected')}</span><span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted);"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--danger);"></span>${escapeHtml(t('an.expenses_paid') || 'Expenses')}</span>`;

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:8px;"><span class="swatch"></span>${escapeHtml(t('an.cash_flow') || 'Cash Flow')}</h3>
      <div style="margin-bottom:6px;">${legend}</div>
      <div style="overflow-x:auto;">
        <svg width="${chartW}" height="${H}" style="display:block;min-width:200px;">${bars}</svg>
      </div>
    </div>`;
}

function renderExpenseCategoryChart() {
  const el = $('#expenseCategoryChart');
  if (!el) return;

  const filtered = (expenses || []).filter(e => inRange(e.date, analyticsRange, 'analytics'));
  if (!filtered.length) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.exp_by_cat') || 'Expenses by Category')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const totals = {};
  for (const e of filtered) {
    const cat = e.category || 'other';
    totals[cat] = (totals[cat] || 0) + (+e.amount || 0);
  }

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const grand = sorted.reduce((s, [, v]) => s + v, 0) || 1;
  const maxV = sorted[0]?.[1] || 1;
  const BAR_MAX_W = 200;

  const rows = sorted.map(([cat, v]) => {
    const pct = Math.round(v / grand * 100);
    const bw = Math.round((v / maxV) * BAR_MAX_W);
    return `<tr>
      <td style="padding:6px 8px;font-size:12px;white-space:nowrap;">${escapeHtml(expCatLabel(cat))}</td>
      <td style="padding:6px 8px;">
        <div style="background:var(--primary);opacity:0.7;height:14px;border-radius:3px;width:${bw}px;min-width:4px;"></div>
      </td>
      <td style="padding:6px 8px;font-size:12px;text-align:end;white-space:nowrap;">${escapeHtml(fmtPrice(v))}</td>
      <td style="padding:6px 8px;font-size:11px;color:var(--text-muted);text-align:end;">${pct}%</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:12px;"><span class="swatch"></span>${escapeHtml(t('an.exp_by_cat') || 'Expenses by Category')}</h3>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;width:100%;"><tbody>${rows}</tbody></table>
      </div>
    </div>`;
}

function renderLeadTimeChart() {
  const el = $('#leadTimeTable');
  if (!el) return;

  const completed = (printLog || []).filter(o => o.status === 'completed' && o.date && o.completedAt);
  if (completed.length < 3) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.lead_time') || 'Lead Time by Product')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const byProduct = {};
  for (const o of completed) {
    const key = o.project || o.name || 'Unknown';
    const days = (new Date(o.completedAt) - new Date(o.date)) / 86400000;
    if (days < 0) continue;
    if (!byProduct[key]) byProduct[key] = { total: 0, count: 0, min: Infinity, max: -Infinity };
    byProduct[key].total += days;
    byProduct[key].count++;
    if (days < byProduct[key].min) byProduct[key].min = days;
    if (days > byProduct[key].max) byProduct[key].max = days;
  }

  const rows = Object.entries(byProduct)
    .map(([name, d]) => ({ name, avg: d.total / d.count, fastest: d.min, slowest: d.max, count: d.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  const daysLabel = escapeHtml(t('an.days') || 'days');
  const tableRows = rows.map(r => `<tr>
    <td style="padding:6px 8px;font-size:12px;">${escapeHtml(r.name)}</td>
    <td style="padding:6px 8px;font-size:12px;text-align:end;">${r.avg.toFixed(1)} ${daysLabel}</td>
    <td style="padding:6px 8px;font-size:12px;text-align:end;">${r.fastest.toFixed(1)}</td>
    <td style="padding:6px 8px;font-size:12px;text-align:end;">${r.slowest.toFixed(1)}</td>
    <td style="padding:6px 8px;font-size:12px;text-align:end;">${r.count}</td>
  </tr>`).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:12px;"><span class="swatch"></span>${escapeHtml(t('an.lead_time') || 'Lead Time by Product')}</h3>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;width:100%;font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="padding:6px 8px;text-align:start;">${escapeHtml(t('ord.project') || 'Product')}</th>
            <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('an.lead_time_avg') || 'Avg Days')}</th>
            <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('an.lead_time_fastest') || 'Fastest')}</th>
            <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('an.lead_time_slowest') || 'Slowest')}</th>
            <th style="padding:6px 8px;text-align:end;">#</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderNpsTrendChart() {
  const el = $('#npsTrendChart');
  if (!el) return;

  const today = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
    });
  }

  const ratedOrders = (printLog || []).filter(o => o.survey?.rating && o.completedAt);
  if (ratedOrders.length < 3) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.nps_trend') || 'Customer Rating Trend')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const byMonth = {};
  months.forEach(m => { byMonth[m.key] = { total: 0, count: 0 }; });
  for (const o of ratedOrders) {
    const mk = localMonthStr(new Date(o.completedAt));
    if (!byMonth[mk]) continue;
    byMonth[mk].total += +o.survey.rating;
    byMonth[mk].count++;
  }

  const totalResponses = ratedOrders.length;
  const globalAvg = ratedOrders.reduce((s, o) => s + +o.survey.rating, 0) / totalResponses;

  const vals = months.map(m => {
    const b = byMonth[m.key];
    return b.count > 0 ? b.total / b.count : null;
  });

  const H = 120, W_PER = 60;
  const chartW = months.length * W_PER;
  const MIN_R = 1, MAX_R = 5;

  const points = months.map((m, i) => {
    const v = vals[i];
    if (v === null) return null;
    const x = i * W_PER + W_PER / 2;
    const y = Math.round(H - 24 - ((v - MIN_R) / (MAX_R - MIN_R)) * (H - 40));
    return { x, y, v };
  }).filter(Boolean);

  const polyline = points.length >= 2
    ? `<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round"/>`
    : '';

  const dots = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--primary)"/>
    <text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="10" fill="var(--primary)">${p.v.toFixed(1)}</text>`).join('');

  const labels = months.map((m, i) => `<text x="${i * W_PER + W_PER / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${escapeHtml(m.label)}</text>`).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:12px;"><span class="swatch"></span>${escapeHtml(t('an.nps_trend') || 'Customer Rating Trend')}</h3>
      <div style="overflow-x:auto;">
        <svg width="${chartW}" height="${H}" style="display:block;min-width:200px;">${polyline}${dots}${labels}</svg>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:6px;">${escapeHtml(String(totalResponses))} ${escapeHtml(t('an.nps_responses') || 'responses · Avg')} ${globalAvg.toFixed(1)} / 5</p>
    </div>`;
}

function renderClientLtvTable() {
  const el = $('#clientLtvTable');
  if (!el) return;

  if (!(clients || []).length) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.client_ltv') || 'Client Lifetime Value')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const now = Date.now();
  const CHURN_MS = 90 * 86400000;

  const ltvData = (clients || []).map(c => {
    const cOrders = (printLog || []).filter(o => o.clientId === c.id);
    const ltv = cOrders.reduce((s, o) => s + orderRevenueBase(o), 0);
    const lastOrder = cOrders.reduce((latest, o) => {
      const d = o.completedAt || o.date;
      return d && (!latest || d > latest) ? d : latest;
    }, null);
    const churnRisk = !lastOrder || (now - new Date(lastOrder).getTime()) > CHURN_MS;
    return { name: c.name || c.company || '—', ltv, count: cOrders.length, avgVal: cOrders.length ? ltv / cOrders.length : 0, lastOrder, churnRisk };
  }).sort((a, b) => b.ltv - a.ltv).slice(0, 10);

  if (!ltvData.some(d => d.ltv > 0)) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.client_ltv') || 'Client Lifetime Value')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const tableRows = ltvData.map((d, i) => `<tr>
    <td style="padding:6px 8px;font-size:12px;">${i + 1}</td>
    <td style="padding:6px 8px;font-size:12px;">${escapeHtml(d.name)}${d.churnRisk ? ` <span title="${escapeHtml(t('an.churn_risk') || 'Churn risk')}">🟡</span>` : ''}</td>
    <td style="padding:6px 8px;font-size:12px;text-align:end;font-weight:600;">${escapeHtml(fmtPrice(d.ltv))}</td>
    <td style="padding:6px 8px;font-size:12px;text-align:end;">${d.count}</td>
    <td style="padding:6px 8px;font-size:12px;text-align:end;">${escapeHtml(fmtPrice(d.avgVal))}</td>
    <td style="padding:6px 8px;font-size:12px;text-align:end;color:var(--text-muted);">${d.lastOrder ? escapeHtml(localDateStr(new Date(d.lastOrder))) : '—'}</td>
  </tr>`).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:12px;"><span class="swatch"></span>${escapeHtml(t('an.client_ltv') || 'Client Lifetime Value')}</h3>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;width:100%;font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="padding:6px 8px;text-align:start;">#</th>
            <th style="padding:6px 8px;text-align:start;">${escapeHtml(t('cl.name') || 'Client')}</th>
            <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('an.ltv') || 'LTV')}</th>
            <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('an.op_jobs') || '# Orders')}</th>
            <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('an.avg_order') || 'Avg')}</th>
            <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('ord.date') || 'Last Order')}</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderMachineDowntimeChart() {
  const el = $('#machineDowntimeChart');
  if (!el) return;

  const today = new Date();
  const months = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`,
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
    });
  }

  const machineData = (machines || []).map(mach => {
    const blocks = mach.downtimeBlocks || [];
    const hoursByMonth = months.map(m => {
      let total = 0;
      for (const b of blocks) {
        if (!b.from || !b.to) continue;
        const bFrom = new Date(b.from);
        const bTo   = new Date(b.to);
        const start = bFrom < m.start ? m.start : bFrom;
        const end   = bTo   > m.end   ? m.end   : bTo;
        if (end > start) total += (end - start) / 3600000;
      }
      return total;
    });
    return { name: mach.name || mach.id, hoursByMonth, total: hoursByMonth.reduce((s, h) => s + h, 0) };
  }).filter(d => d.total > 0);

  if (!machineData.length) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.downtime') || 'Machine Downtime (hrs/month)')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const stackColors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];
  const maxMonthTotal = Math.max(...months.map((_, mi) => machineData.reduce((s, md) => s + md.hoursByMonth[mi], 0)), 1);
  const H = 140, BAR_W = 40, GAP = 24;
  const chartW = months.length * (BAR_W + GAP);

  const bars = months.map((m, mi) => {
    const x = mi * (BAR_W + GAP);
    let yOffset = H - 22;
    const segments = machineData.map((md, ki) => {
      const v = md.hoursByMonth[mi];
      if (!v) return '';
      const bh = Math.max(2, Math.round((v / maxMonthTotal) * (H - 36)));
      yOffset -= bh;
      return `<rect x="${x}" y="${yOffset}" width="${BAR_W}" height="${bh}" rx="0" fill="${stackColors[ki % stackColors.length]}" opacity="0.85"/>`;
    }).join('');
    return `${segments}<text x="${x + BAR_W / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${escapeHtml(m.label)}</text>`;
  }).join('');

  const legend = machineData.map((md, ki) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-inline-end:10px;font-size:11px;color:var(--text-muted);"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${stackColors[ki % stackColors.length]};"></span>${escapeHtml(md.name)}</span>`).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:8px;"><span class="swatch"></span>${escapeHtml(t('an.downtime') || 'Machine Downtime (hrs/month)')}</h3>
      <div style="margin-bottom:6px;">${legend}</div>
      <div style="overflow-x:auto;">
        <svg width="${chartW}" height="${H}" style="display:block;min-width:120px;">${bars}</svg>
      </div>
    </div>`;
}

function renderMaintenanceCostChart() {
  const el = $('#maintenanceCostChart');
  if (!el) return;

  const currentYear = new Date().getFullYear();

  const machData = (machines || []).map(mach => {
    const log = mach.machMaintLog || [];
    const total = log.reduce((s, entry) => {
      if (!entry.date) return s;
      if (new Date(entry.date).getFullYear() !== currentYear) return s;
      return s + (+entry.cost || 0);
    }, 0);
    return { name: mach.name || mach.id, total };
  }).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

  if (!machData.length) {
    el.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 class="card-head"><span class="swatch"></span>${escapeHtml(t('an.maint_cost') || 'Maintenance Cost by Machine')}</h3><p style="color:var(--text-muted);padding:12px 0;font-size:13px;">${escapeHtml(t('an.no_data') || 'No data yet')}</p></div>`;
    return;
  }

  const maxVal = machData[0].total || 1;
  const H = 130, BAR_W = 44, GAP = 20;
  const chartW = machData.length * (BAR_W + GAP);

  const bars = machData.map((d, i) => {
    const bh = Math.max(4, Math.round((d.total / maxVal) * (H - 48)));
    const x = i * (BAR_W + GAP);
    const y = H - 40 - bh;
    return `<rect x="${x}" y="${y}" width="${BAR_W}" height="${bh}" rx="3" fill="var(--warning)" opacity="0.85"/>
      <text x="${x + BAR_W / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="var(--warning)">${escapeHtml(fmtPrice(d.total))}</text>
      <text x="${x + BAR_W / 2}" y="${H - 22}" text-anchor="middle" font-size="9" fill="var(--text-muted)" style="overflow:hidden;">${escapeHtml(d.name.slice(0, 10))}</text>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 class="card-head" style="margin-bottom:12px;"><span class="swatch"></span>${escapeHtml(t('an.maint_cost') || 'Maintenance Cost by Machine')}</h3>
      <div style="overflow-x:auto;">
        <svg width="${chartW}" height="${H}" style="display:block;min-width:120px;">${bars}</svg>
      </div>
    </div>`;
}

function renderMachineAccuracy() {
  const el = $('#machineAccuracySection');
  if (!el) return;

  // Only use orders with both timestamps and a machineId
  const withData = printLog.filter(o =>
    o.status === 'completed' &&
    o.printingStartedAt && o.completedAt &&
    o.printTime > 0 && o.machineId
  );

  if (withData.length < 3) { el.innerHTML = ''; return; }

  // Group by machine
  const byMachine = {};
  for (const o of withData) {
    const mid = o.machineId;
    if (!byMachine[mid]) byMachine[mid] = { totalActual: 0, totalEst: 0, count: 0 };
    const actualH = (new Date(o.completedAt) - new Date(o.printingStartedAt)) / 3600000;
    byMachine[mid].totalActual += actualH;
    byMachine[mid].totalEst    += +o.printTime;
    byMachine[mid].count++;
  }

  const rows = Object.entries(byMachine)
    .map(([mid, d]) => {
      const machine = machines.find(m => m.id === mid);
      const name = machine ? machine.name : t('dash.unassigned');
      const color = machine?.color || '#888';
      const avgActual = d.totalActual / d.count;
      const avgEst    = d.totalEst    / d.count;
      const diffPct   = avgEst > 0 ? Math.round((avgActual - avgEst) / avgEst * 100) : 0;
      const sign      = diffPct > 0 ? `+${diffPct}` : `${diffPct}`;
      const col       = Math.abs(diffPct) <= 10 ? 'var(--success)' : Math.abs(diffPct) <= 25 ? 'var(--warning)' : 'var(--danger)';
      return { name, color, count: d.count, avgActual, avgEst, diffPct, sign, col };
    })
    .sort((a, b) => Math.abs(a.diffPct) - Math.abs(b.diffPct)); // most accurate first

  el.innerHTML = `
    <div style="margin-top:12px;">
      <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:8px;">${escapeHtml(t('an.machine_accuracy') || 'Per-Machine Time Accuracy')}</div>
      <div style="display:flex; flex-direction:column; gap:5px;">
        ${rows.map(r => `
          <div style="display:flex; align-items:center; gap:10px; font-size:12.5px;">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${safeCssColor(r.color)}; flex-shrink:0;"></span>
            <span style="flex:1; font-weight:500;">${escapeHtml(r.name)}</span>
            <span style="color:var(--text-muted); font-size:11px;">${r.count} jobs</span>
            <span style="color:var(--text-muted); font-size:11px;">${r.avgEst.toFixed(1)}h est</span>
            <span style="color:var(--text-muted); font-size:11px;">→</span>
            <span style="color:var(--text-muted); font-size:11px;">${r.avgActual.toFixed(1)}h actual</span>
            <span style="font-weight:700; min-width:42px; text-align:end; color:${r.col};">${r.sign}%</span>
          </div>`).join('')}
      </div>
    </div>`;
}

/* ============================================================
   Tab badge counts
   ============================================================ */

/* ============================================================
   New vs returning client revenue split
   ============================================================ */
function renderNewVsReturning() {
  const el = $('#newVsReturningSection');
  if (!el) return;
  const completed = printLog.filter(o => o.status === 'completed' && o.clientId && o.date);
  if (completed.length === 0) { el.innerHTML = ''; return; }

  // First-ever order per client determines their "new" date
  const firstOrderDate = {};
  for (const o of [...completed].sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
    if (!firstOrderDate[o.clientId]) firstOrderDate[o.clientId] = o.date;
  }

  const inRangeOrders = completed.filter(o => inRange(o.date, analyticsRange, 'analytics'));
  let newRev = 0, retRev = 0, newCount = 0, retCount = 0;
  for (const o of inRangeOrders) {
    const isNew = firstOrderDate[o.clientId] === o.date; // first order = new client
    if (isNew) { newRev += orderRevenueBase(o); newCount++; }
    else        { retRev += orderRevenueBase(o); retCount++; }
  }
  const total = newRev + retRev;
  const newPct  = total > 0 ? Math.round(newRev / total * 100) : 0;
  const retPct  = 100 - newPct;

  el.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="flex:1;min-width:120px;text-align:center;padding:10px;background:var(--surface-2);border-radius:var(--radius);">
        <div style="font-size:20px;font-weight:700;color:var(--primary);">${fmtMoney(newRev)}</div>
        <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(t('an.new_clients'))} (${newCount} ${escapeHtml(t('an.orders_count'))})</div>
      </div>
      <div style="flex:1;min-width:120px;text-align:center;padding:10px;background:var(--surface-2);border-radius:var(--radius);">
        <div style="font-size:20px;font-weight:700;color:var(--success);">${fmtMoney(retRev)}</div>
        <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(t('an.returning_clients'))} (${retCount} ${escapeHtml(t('an.orders_count'))})</div>
      </div>
    </div>
    ${total > 0 ? `
    <div style="height:12px;border-radius:6px;overflow:hidden;display:flex;">
      <div style="width:${newPct}%;background:var(--primary);transition:width .3s;" title="${escapeHtml(t('an.new_clients'))}: ${newPct}%"></div>
      <div style="flex:1;background:var(--success);transition:width .3s;" title="${escapeHtml(t('an.returning_clients'))}: ${retPct}%"></div>
    </div>
    <div style="display:flex;gap:16px;margin-top:5px;font-size:11.5px;color:var(--text-muted);">
      <span>● ${escapeHtml(t('an.new_clients'))}: ${newPct}%</span>
      <span>● ${escapeHtml(t('an.returning_clients'))}: ${retPct}%</span>
    </div>` : ''}`;
}

/* ============================================================
   Printer utilization chart — hours per machine
   ============================================================ */
function renderPrinterUtilizationChart() {
  const el = $('#printerUtilSection');
  if (!el || machines.length === 0) { if (el) el.innerHTML = ''; return; }

  const orders = printLog.filter(o => inRange(o.date, analyticsRange, 'analytics') && o.status === 'completed');
  const machMap = {};
  for (const m of machines) machMap[m.id] = { name: m.name, color: m.color, hours: 0, revenue: 0, cost: 0, count: 0 };
  for (const o of orders) {
    const key = o.machineId || '__none__';
    if (!machMap[key]) continue;
    machMap[key].hours += +o.printTime || 0;
    machMap[key].revenue += orderRevenueBase(o);
    machMap[key].count++;
    // Estimate material + machine cost from order parts
    const orderCost = (o.parts || []).reduce((s, p) => s + computePartBaseCost(p), 0);
    machMap[key].cost += orderCost;
  }
  // Determine date range for utilization calculation
  const now2 = new Date();
  let rangeDays = 30; // default for 'all'
  if (analyticsRange === 'month') rangeDays = new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate();
  else if (analyticsRange === 'last_month') rangeDays = new Date(now2.getFullYear(), now2.getMonth(), 0).getDate();
  else if (analyticsRange === 'quarter') rangeDays = 91;
  else if (analyticsRange === 'year') rangeDays = 365;

  // Attach targetHoursPerDay from machines array to machMap
  for (const m of machines) {
    if (machMap[m.id]) machMap[m.id].targetHoursPerDay = m.targetHoursPerDay || null;
  }

  const rows = Object.values(machMap).filter(m => m.hours > 0).sort((a, b) => b.revenue - a.revenue);
  if (rows.length === 0) { el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.no_utilization'))}</p>`; return; }

  const maxRev = Math.max(...rows.map(r => r.revenue), 1);
  el.innerHTML = rows.map(r => {
    const pct = (r.revenue / maxRev) * 100;
    const margin = r.cost > 0 && r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue * 100) : null;
    const marginStr = margin !== null ? `${margin.toFixed(1)}%` : '—';
    const marginCol = margin !== null ? (margin >= 30 ? 'var(--success)' : margin >= 10 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)';
    // Utilization %
    let utilStr = '';
    if (r.targetHoursPerDay) {
      const targetTotal = r.targetHoursPerDay * rangeDays;
      const utilPct = targetTotal > 0 ? Math.min(100, (r.hours / targetTotal) * 100) : null;
      if (utilPct !== null) {
        const utilCol = utilPct >= 80 ? 'var(--success)' : utilPct >= 50 ? 'var(--warning)' : 'var(--danger)';
        utilStr = ` · <span style="color:${utilCol};font-weight:600;">${escapeHtml(t('an.utilization_pct'))}: ${utilPct.toFixed(0)}%</span>`;
      }
    }
    return `<div style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px; flex-wrap:wrap; gap:4px;">
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${safeCssColor(r.color||'#5b9cf0')};margin-inline-end:5px;vertical-align:middle;"></span><strong>${escapeHtml(r.name)}</strong></span>
        <span style="color:var(--text-muted);">${r.hours.toFixed(1)}h · ${r.count} ${escapeHtml(t('an.orders'))} · ${fmtPrice(r.revenue)} · <span style="color:${marginCol};font-weight:600;">${escapeHtml(t('an.margin_col'))}: ${marginStr}</span>${utilStr}</span>
      </div>
      <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:10px;">
        <div style="background:${safeCssColor(r.color||'#5b9cf0')};width:${pct.toFixed(1)}%;height:100%;border-radius:4px;opacity:0.8;transition:width 0.4s;"></div>
      </div>
    </div>`;
  }).join('');

  // PNG export button
  const existingUtilBtn = el.parentElement?.querySelector('.chart-dl-btn');
  if (existingUtilBtn) existingUtilBtn.remove();
  const dlUtilBtn = document.createElement('button');
  dlUtilBtn.className = 'btn small ghost chart-dl-btn';
  dlUtilBtn.style.cssText = 'position:absolute;top:6px;right:6px;font-size:11px;padding:3px 8px;opacity:0.7;';
  dlUtilBtn.textContent = '⬇ PNG';
  dlUtilBtn.title = 'Download chart as PNG';
  if (el.parentElement) el.parentElement.style.position = 'relative';
  el.parentElement?.appendChild(dlUtilBtn);
  dlUtilBtn.addEventListener('click', () => {
    const svg = el.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const vb = svg.viewBox.baseVal;
    canvas.width  = vb.width  || 600;
    canvas.height = vb.height || 210;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = 'khayt-utilization-chart.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  });
}

/* ============================================================
   P&L (Profit & Loss) quarterly/annual view
   ============================================================ */
function renderPnLSection() {
  const el = $('#pnlSection');
  if (!el) return;

  // Group completed orders by YYYY-Q (quarter)
  const qMap = {};
  for (const o of printLog) {
    if (o.status !== 'completed') continue;
    const d = new Date((o.date || '') + 'T00:00:00');
    if (isNaN(d)) continue;
    const q = Math.ceil((d.getMonth() + 1) / 3);
    const key = `${d.getFullYear()}-Q${q}`;
    if (!qMap[key]) qMap[key] = { revenue: 0, shipping: 0, vatCollected: 0, orders: 0 };
    qMap[key].revenue += orderRevenueBase(o);
    qMap[key].shipping += convertToBase(+o.shippingCost || 0, clientCurrency(o.clientId));
    qMap[key].orders++;
    const rate = settings.enableVat ? (+settings.vatRate || 15) : 0;
    qMap[key].vatCollected += rate > 0 ? orderRevenueBase(o) * rate / (100 + rate) : 0;
  }
  const expQ = {};
  for (const e of expenses) {
    const d = new Date((e.date || '') + 'T00:00:00');
    if (isNaN(d)) continue;
    const q = Math.ceil((d.getMonth() + 1) / 3);
    const key = `${d.getFullYear()}-Q${q}`;
    expQ[key] = (expQ[key] || 0) + (+e.amount || 0);
  }

  // Aggregate fixedCosts per quarter (assume monthly recurring → multiply by 3)
  const fixedCostPerMonth = (settings.fixedCosts || []).reduce((s, fc) => s + (+fc.amount || 0), 0);
  const fixedCostPerQ = fixedCostPerMonth * 3;

  const allKeys = [...new Set([...Object.keys(qMap), ...Object.keys(expQ)])].sort().reverse();
  if (allKeys.length === 0) { el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.pnl_empty'))}</p>`; return; }

  const cur = currencySymbol();
  const hasFixed = fixedCostPerQ > 0;
  const nowQ = (() => { const d = new Date(); const q = Math.ceil((d.getMonth() + 1) / 3); return `${d.getFullYear()}-Q${q}`; })();
  el.innerHTML = `
    ${hasFixed ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Fixed overhead: ${fmtMoney(fixedCostPerQ)}/quarter included in net</div>` : ''}
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="color:var(--text-muted); text-align:right;">
            <th style="text-align:left; padding:4px 8px;">${escapeHtml(t('an.pnl_period'))}</th>
            <th style="padding:4px 8px;">${escapeHtml(t('an.pnl_orders'))}</th>
            <th style="padding:4px 8px;">${escapeHtml(t('an.revenue'))} (${cur})</th>
            <th style="padding:4px 8px;">${escapeHtml(t('an.pnl_expenses'))} (${cur})</th>
            <th style="padding:4px 8px;">${escapeHtml(t('an.pnl_vat'))} (${cur})</th>
            <th style="padding:4px 8px; font-weight:700;">${escapeHtml(t('an.pnl_net'))} (${cur})</th>
          </tr>
        </thead>
        <tbody>
          ${allKeys.map(k => {
            const r = qMap[k]?.revenue || 0;
            const exp = expQ[k] || 0;
            const vat = qMap[k]?.vatCollected || 0;
            const fixedForPeriod = k === nowQ ? fixedCostPerQ : 0;
            const net = r - exp - fixedForPeriod;
            const netCol = net >= 0 ? 'var(--success)' : 'var(--danger)';
            return `<tr style="border-top:1px solid rgba(255,255,255,0.06);">
              <td style="padding:6px 8px; font-weight:600;">${escapeHtml(k)}</td>
              <td style="padding:6px 8px; text-align:right;">${qMap[k]?.orders || 0}</td>
              <td style="padding:6px 8px; text-align:right; font-variant-numeric:tabular-nums;">${fmtMoney(r)}</td>
              <td style="padding:6px 8px; text-align:right; color:var(--danger); font-variant-numeric:tabular-nums;">−${fmtMoney(exp + fixedForPeriod)}</td>
              <td style="padding:6px 8px; text-align:right; color:var(--text-muted); font-variant-numeric:tabular-nums;">${fmtMoney(vat)}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:700; color:${netCol}; font-variant-numeric:tabular-nums;">${fmtMoney(net)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   Profitability by product — shows revenue / cost / margin
   per product type for completed orders in selected range
   ============================================================ */
function renderProductProfitability() {
  const el = $('#productProfitSection');
  if (!el) return;

  const completed = printLog.filter(o => o.status === 'completed' && inRange(o.date, analyticsRange, 'analytics'));
  if (completed.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.no_data'))}</p>`;
    return;
  }

  // Aggregate by productId (fall back to 'Untagged' bucket)
  const map = {};
  for (const o of completed) {
    const key = o.productId || '__none__';
    if (!map[key]) {
      const prod = products.find(p => p.id === key);
      map[key] = { name: prod ? localName(prod) : t('an.untagged'), revenue: 0, cost: 0, count: 0 };
    }
    map[key].revenue += orderRevenueBase(o);
    map[key].count++;
    // Estimate cost from parts if available
    const partCost = (o.parts || []).reduce((s, p) => s + computePartBaseCost(p), 0);
    // Add linked expenses to cost (Feature 4)
    const linkedExpCost = expenses.filter(e => e.orderId === o.id).reduce((s, e) => s + (+e.amount || 0), 0);
    map[key].cost += partCost + linkedExpCost;
  }

  const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue);
  const maxRev = Math.max(...rows.map(r => r.revenue), 1);

  el.innerHTML = `
    <div class="table-wrap">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1); text-align:left;">
            <th style="padding:6px 8px;" data-i18n="an.product_col">${escapeHtml(t('an.product_col'))}</th>
            <th style="padding:6px 8px; text-align:center;" data-i18n="an.orders">${escapeHtml(t('an.orders'))}</th>
            <th style="padding:6px 8px; text-align:right;" data-i18n="an.revenue">${escapeHtml(t('an.revenue'))}</th>
            <th style="padding:6px 8px; text-align:right;" data-i18n="an.cost_col">${escapeHtml(t('an.cost_col'))}</th>
            <th style="padding:6px 8px; text-align:right;" data-i18n="an.margin_col">${escapeHtml(t('an.margin_col'))}</th>
            <th style="padding:6px 8px; width:120px;" data-i18n="an.revenue_bar">${escapeHtml(t('an.revenue_bar'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const margin = r.cost > 0 ? ((r.revenue - r.cost) / r.revenue * 100) : null;
            const marginStr = margin !== null ? `${margin.toFixed(1)}%` : '—';
            const marginCol = margin !== null ? (margin >= 30 ? 'var(--success)' : margin >= 10 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)';
            const barPct = (r.revenue / maxRev * 100).toFixed(1);
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 8px; font-weight:500;">${escapeHtml(r.name)}</td>
              <td style="padding:7px 8px; text-align:center;">${r.count}</td>
              <td style="padding:7px 8px; text-align:right; font-variant-numeric:tabular-nums;">${fmtPrice(r.revenue)}</td>
              <td style="padding:7px 8px; text-align:right; color:var(--danger); font-variant-numeric:tabular-nums;">${r.cost > 0 ? fmtPrice(r.cost) : '—'}</td>
              <td style="padding:7px 8px; text-align:right; font-weight:600; color:${marginCol};">${marginStr}</td>
              <td style="padding:7px 8px;">
                <div style="background:rgba(255,255,255,0.08);border-radius:3px;height:8px;">
                  <div style="background:var(--primary);width:${barPct}%;height:100%;border-radius:3px;transition:width 0.4s;"></div>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   SLA — On-Time Delivery Rate
   ============================================================ */
function renderSLASection() {
  const el = $('#slaSection');
  if (!el) return;

  const completed = printLog.filter(o =>
    o.status === 'completed' &&
    o.dueDate &&
    inRange(o.date, analyticsRange, 'analytics')
  );

  if (completed.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.sla_no_data'))}</p>`;
    return;
  }

  const onTime = completed.filter(o => {
    const delivered = (o.completedAt || o.deliveredAt || o.date || '').slice(0, 10);
    return delivered <= o.dueDate;
  });
  const late = completed.filter(o => {
    const delivered = (o.completedAt || o.deliveredAt || o.date || '').slice(0, 10);
    return delivered > o.dueDate;
  });

  const rate = Math.round(onTime.length / completed.length * 100);
  const avgDelay = late.length > 0 ? Math.round(
    late.reduce((s, o) => {
      const delivered = (o.completedAt || o.deliveredAt || o.date || '').slice(0, 10);
      return s + Math.round((new Date(delivered + 'T00:00:00') - new Date(o.dueDate + 'T00:00:00')) / 86400000);
    }, 0) / late.length
  ) : 0;

  const rateColor = rate >= 90 ? 'var(--success)' : rate >= 70 ? 'var(--warning)' : 'var(--danger)';

  el.innerHTML = `
    <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:16px;">
      <div class="cl-hist-stat">
        <div class="v" style="color:${rateColor};">${rate}%</div>
        <div class="l">${escapeHtml(t('an.sla_rate'))}</div>
      </div>
      <div class="cl-hist-stat">
        <div class="v">${completed.length}</div>
        <div class="l">${escapeHtml(t('an.sla_with_due'))}</div>
      </div>
      <div class="cl-hist-stat">
        <div class="v">${onTime.length}</div>
        <div class="l" style="color:var(--success);">${escapeHtml(t('an.sla_on_time'))}</div>
      </div>
      <div class="cl-hist-stat">
        <div class="v">${late.length}</div>
        <div class="l" style="color:var(--danger);">${escapeHtml(t('an.sla_late'))}</div>
      </div>
      ${late.length > 0 ? `<div class="cl-hist-stat">
        <div class="v">${avgDelay}</div>
        <div class="l">${escapeHtml(t('an.sla_avg_delay'))}</div>
      </div>` : ''}
    </div>
    <div style="background:rgba(255,255,255,0.08);border-radius:6px;height:12px;overflow:hidden;">
      <div style="background:${rateColor};width:${rate}%;height:100%;border-radius:6px;transition:width 0.5s;"></div>
    </div>`;
}

/* ============================================================
   Feature 7: Per-machine P&L
   ============================================================ */
function renderMachinePL() {
  const el = $('#machinePLSection');
  if (!el) return;
  if (machines.length === 0) { el.innerHTML = ''; return; }

  const completed = printLog.filter(o => o.status === 'completed' && inRange(o.date, analyticsRange, 'analytics'));
  if (completed.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.no_data'))}</p>`;
    return;
  }

  // Determine year for maintenance cost filtering
  const analyticsYear = String(new Date().getFullYear());

  // Build per-machine aggregation
  const machMap = {};
  for (const m of machines) {
    // Sum maintenance costs for this machine within the analytics year
    const maintCost = machMaintLog
      .filter(e => e.machineId === m.id && (e.date || '').startsWith(analyticsYear))
      .reduce((s, e) => s + (+e.cost || 0), 0);
    machMap[m.id] = { name: m.name, color: m.color || '#888', jobs: 0, revenue: 0, materialCost: 0, linkedExp: 0, maintCost };
  }
  machMap['__none__'] = { name: t('dash.unassigned'), color: '#888', jobs: 0, revenue: 0, materialCost: 0, linkedExp: 0, maintCost: 0 };

  for (const o of completed) {
    const key = o.machineId && machMap[o.machineId] ? o.machineId : '__none__';
    machMap[key].jobs++;
    machMap[key].revenue += orderRevenueBase(o);
    machMap[key].materialCost += (o.parts || []).reduce((s, p) => s + computePartBaseCost(p), 0);
    // Linked expenses
    machMap[key].linkedExp += expenses
      .filter(e => e.orderId === o.id)
      .reduce((s, e) => s + (+e.amount || 0), 0);
  }

  const rows = Object.values(machMap).filter(r => r.jobs > 0);
  if (rows.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.no_data'))}</p>`;
    return;
  }

  const cur = currencySymbol();
  el.innerHTML = `
    <div class="table-wrap">
      <table class="machine-pl-table" style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="color:var(--text-muted);">
            <th style="text-align:left; padding:6px 8px;">Machine</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.pnl_orders'))}</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.revenue'))} (${cur})</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.mat_cost_col'))} (${cur})</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.linked_exp_col'))} (${cur})</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.maint_cost_col'))} (${cur})</th>
            <th style="text-align:right; padding:6px 8px; font-weight:700;">${escapeHtml(t('an.net_col'))} (${cur})</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.margin_col'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const net = r.revenue - r.materialCost - r.linkedExp - r.maintCost;
            const margin = r.revenue > 0 ? (net / r.revenue * 100) : 0;
            const marginCol = margin >= 30 ? 'var(--success)' : margin >= 10 ? 'var(--warning)' : 'var(--danger)';
            return `<tr style="border-top:1px solid rgba(255,255,255,0.06);">
              <td style="padding:6px 8px;">
                <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${safeCssColor(r.color)};margin-inline-end:6px;vertical-align:middle;"></span>
                <strong>${escapeHtml(r.name)}</strong>
              </td>
              <td style="text-align:right; padding:6px 8px;">${r.jobs}</td>
              <td style="text-align:right; padding:6px 8px; font-variant-numeric:tabular-nums;">${fmtMoney(r.revenue)}</td>
              <td style="text-align:right; padding:6px 8px; color:var(--danger); font-variant-numeric:tabular-nums;">−${fmtMoney(r.materialCost)}</td>
              <td style="text-align:right; padding:6px 8px; color:var(--danger); font-variant-numeric:tabular-nums;">−${fmtMoney(r.linkedExp)}</td>
              <td style="text-align:right; padding:6px 8px; color:var(--danger); font-variant-numeric:tabular-nums;">−${fmtMoney(r.maintCost)}</td>
              <td style="text-align:right; padding:6px 8px; font-weight:700; color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}; font-variant-numeric:tabular-nums;">${fmtMoney(net)}</td>
              <td style="text-align:right; padding:6px 8px; font-weight:600; color:${marginCol};">${margin.toFixed(1)}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   Per-Location P&L
   ============================================================ */
function renderLocationPL() {
  const container = document.getElementById('locationPlChart');
  if (!container) return;

  if (!locations.length) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">${t('an.no_locations')}</p>`;
    return;
  }

  // Map machineId → locationId and machineName → locationId
  const machLocById  = {};
  const machLocByName = {};
  machines.forEach(m => {
    if (m.locationId) { machLocById[m.id] = m.locationId; machLocByName[m.name] = m.locationId; }
  });

  const locTotals = {}; // locationId | '__none__' → { revenue, matCost, expenses, orders }
  const getD = id => { if (!locTotals[id]) locTotals[id] = { revenue: 0, matCost: 0, expenses: 0, orders: 0 }; return locTotals[id]; };

  // Orders
  printLog.filter(o => o.status === 'completed' && inRange(o.date || (o.timestamp || '').slice(0,10), analyticsRange, 'analytics')).forEach(o => {
    const lid = (o.machineId && machLocById[o.machineId]) || (o.machine && machLocByName[o.machine]) || '__none__';
    const d = getD(lid);
    d.revenue += convertToBase(+o.price || 0, clientCurrency(o.clientId));
    d.orders++;
    (o.parts || []).forEach(p => { d.matCost += computePartBaseCost ? (computePartBaseCost(p) || 0) : 0; });
  });

  // Expenses
  expenses.filter(e => inRange(e.date, analyticsRange, 'analytics')).forEach(e => {
    getD(e.locationId || '__none__').expenses += +e.amount || 0;
  });

  // Build rows
  const nameMap = { '__none__': t('an.unassigned_location') };
  locations.forEach(l => { nameMap[l.id] = l.name; });

  const rows = Object.entries(locTotals)
    .map(([lid, d]) => ({ lid, name: nameMap[lid] || lid, ...d, net: d.revenue - d.matCost - d.expenses }))
    .sort((a, b) => b.revenue - a.revenue);

  if (!rows.length) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">${t('an.no_data')}</p>`;
    return;
  }

  const cur = currencySymbol();
  const maxRev = Math.max(...rows.map(r => r.revenue), 1);

  // SVG grouped bar chart (revenue / net per location)
  const BAR_W = 28, GAP = 18, GRP = 2 * BAR_W + 6, H = 120, PAD = 36;
  const svgW = rows.length * (GRP + GAP) + PAD * 2;
  const scale = v => H - Math.max(0, Math.min(H, (v / maxRev) * H));

  const bars = rows.map((r, i) => {
    const x = PAD + i * (GRP + GAP);
    const revH = Math.max(1, (r.revenue / maxRev) * H);
    const netH = Math.max(1, (Math.max(0, r.net) / maxRev) * H);
    const netColor = r.net >= 0 ? '#22c55e' : '#ef4444';
    return `
      <rect x="${x}" y="${H - revH}" width="${BAR_W}" height="${revH}" fill="#6366f1" opacity="0.85" rx="2">
        <title>${escapeHtml(r.name)}: ${t('an.location_revenue')} ${cur}${fmtMoney(r.revenue)}</title>
      </rect>
      <rect x="${x + BAR_W + 6}" y="${H - netH}" width="${BAR_W}" height="${netH}" fill="${netColor}" opacity="0.85" rx="2">
        <title>${escapeHtml(r.name)}: ${t('an.location_profit')} ${cur}${fmtMoney(r.net)}</title>
      </rect>
      <text x="${x + BAR_W + 3}" y="${H + 14}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${escapeHtml(r.name.slice(0,8))}</text>`;
  }).join('');

  const legend = `<g transform="translate(${PAD},${H + 30})">
    <rect width="10" height="10" fill="#6366f1" rx="1"/><text x="14" y="9" font-size="9" fill="var(--text-muted)">${t('an.location_revenue')}</text>
    <rect x="80" width="10" height="10" fill="#22c55e" rx="1"/><text x="94" y="9" font-size="9" fill="var(--text-muted)">${t('an.location_profit')}</text>
  </g>`;

  const chart = `<svg viewBox="0 0 ${svgW} ${H + 50}" style="width:100%;max-width:${svgW}px;overflow:visible;">${bars}${legend}</svg>`;

  // Summary table
  const tableRows = rows.map(r => {
    const margin = r.revenue > 0 ? (r.net / r.revenue * 100).toFixed(1) + '%' : '—';
    const netCol = r.net >= 0 ? `<span style="color:var(--success)">${cur}${fmtMoney(r.net)}</span>` : `<span style="color:var(--danger)">${cur}${fmtMoney(r.net)}</span>`;
    return `<tr>
      <td><strong>${escapeHtml(r.name)}</strong></td>
      <td style="text-align:right;">${r.orders}</td>
      <td style="text-align:right;">${cur}${fmtMoney(r.revenue)}</td>
      <td style="text-align:right;">${cur}${fmtMoney(r.matCost + r.expenses)}</td>
      <td style="text-align:right;">${netCol}</td>
      <td style="text-align:right;">${margin}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div style="overflow-x:auto;margin-bottom:12px;">${chart}</div>
    <div style="overflow-x:auto;">
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead><tr style="color:var(--text-muted);font-size:11px;">
          <th style="text-align:left;padding:4px 8px;">${t('an.location')}</th>
          <th style="text-align:right;padding:4px 8px;">${t('an.orders')}</th>
          <th style="text-align:right;padding:4px 8px;">${t('an.location_revenue')}</th>
          <th style="text-align:right;padding:4px 8px;">${t('an.location_expenses')}</th>
          <th style="text-align:right;padding:4px 8px;">${t('an.location_profit')}</th>
          <th style="text-align:right;padding:4px 8px;">${t('an.margin')}</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

/* ============================================================
   Supplier Price History
   ============================================================ */
function renderSupplierPriceHistory() {
  const container = document.getElementById('supplierPriceHistoryChart');
  if (!container) return;

  // Aggregate all purchases by materialType
  const byMat = {}; // materialType → [{ date, unitPrice, supplier, total }]
  suppliers.forEach(sup => {
    (sup.purchases || []).forEach(p => {
      const mt = (p.materialType || '').trim() || t('sup.untagged');
      if (!byMat[mt]) byMat[mt] = [];
      byMat[mt].push({ date: p.date || '', unitPrice: computeUnitPrice(p), supplier: sup.name, total: +p.amount || 0, unit: p.unit || 'spool' });
    });
  });

  const allMats = Object.keys(byMat).sort();
  if (!allMats.length) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">${t('sup.no_price_data')}</p>`;
    return;
  }

  const cur = currencySymbol();

  // Price trend sparklines
  const sparks = allMats.map(mat => {
    const entries = byMat[mat].filter(e => e.date).sort((a,b) => a.date.localeCompare(b.date));
    if (!entries.length) return '';
    const prices = entries.map(e => e.unitPrice);
    const minP = Math.min(...prices), maxP = Math.max(...prices), rangeP = maxP - minP || 1;
    const W = 120, H = 36;
    const pts = entries.map((e, i) => {
      const x = entries.length > 1 ? (i / (entries.length - 1)) * W : W / 2;
      const y = H - ((e.unitPrice - minP) / rangeP) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const last = entries[entries.length - 1];
    const prev = entries[entries.length - 2];
    const pctChange = prev ? ((last.unitPrice - prev.unitPrice) / prev.unitPrice * 100) : 0;
    const badge = Math.abs(pctChange) >= 5
      ? `<span style="font-size:10px;padding:1px 5px;border-radius:10px;background:${pctChange > 0 ? '#fee2e2' : '#dcfce7'};color:${pctChange > 0 ? '#ef4444' : '#16a34a'};">${pctChange > 0 ? '▲' : '▼'}${Math.abs(pctChange).toFixed(1)}%</span>`
      : '';
    return `<div style="padding:10px 12px;background:var(--bg-elev);border-radius:var(--radius);min-width:180px;">
      <div style="font-weight:600;font-size:12px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;">
        <span>${escapeHtml(mat)}</span>${badge}
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:36px;overflow:visible;">
        <polyline points="${pts}" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
        ${entries.map((e,i) => { const x = entries.length > 1 ? (i / (entries.length - 1)) * W : W/2; const y = H - ((e.unitPrice - minP) / rangeP) * H; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#6366f1"><title>${escapeHtml(e.supplier)}: ${cur}${e.unitPrice.toFixed(2)}/${escapeHtml(e.unit||'unit')} (${e.date})</title></circle>`; }).join('')}
      </svg>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
        ${t('sup.latest')}: <strong>${cur}${last.unitPrice.toFixed(2)}/${last.unit||'unit'}</strong> · ${escapeHtml(last.supplier)}
      </div>
    </div>`;
  }).join('');

  // Best-price comparison table (one row per material)
  const tableRows = allMats.map(mat => {
    const entries = byMat[mat].sort((a,b) => a.unitPrice - b.unitPrice);
    const best = entries[0];
    const worst = entries[entries.length - 1];
    const count = entries.length;
    return `<tr>
      <td>${escapeHtml(mat)}</td>
      <td style="color:var(--success);text-align:right;">${cur}${best.unitPrice.toFixed(2)} <span style="font-size:10px;color:var(--text-muted);">${escapeHtml(best.supplier)}</span></td>
      <td style="color:var(--danger);text-align:right;">${cur}${worst.unitPrice.toFixed(2)} <span style="font-size:10px;color:var(--text-muted);">${escapeHtml(worst.supplier)}</span></td>
      <td style="text-align:right;">${count}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <h4 style="font-size:13px;margin-bottom:10px;">${t('sup.price_trend')}</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:16px;">${sparks}</div>
    <h4 style="font-size:13px;margin-bottom:8px;">${t('sup.best_price')}</h4>
    <div style="overflow-x:auto;">
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead><tr style="color:var(--text-muted);font-size:11px;">
          <th style="text-align:left;padding:4px 8px;">${t('sup.material_type')}</th>
          <th style="text-align:right;padding:4px 8px;">${t('sup.best_price')}</th>
          <th style="text-align:right;padding:4px 8px;">${t('sup.highest_price')}</th>
          <th style="text-align:right;padding:4px 8px;">${t('sup.purchase_count')}</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

/* ============================================================
   Revenue chart — SVG bar chart, last 12 months
   ============================================================ */
function renderRevenueChart() {
  const wrap = $('#revenueChartWrap');
  if (!wrap) return;

  const now = new Date();
  const months = [];

  // Build month buckets based on analyticsRange
  if (analyticsRange === 'month') {
    // Daily view for current month
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      months.push({ key, label: String(d), revenue: 0, orders: 0, isDay: true });
    }
  } else if (analyticsRange === 'last_month') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const daysInMonth = new Date(lm.getFullYear(), lm.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      months.push({ key, label: String(d), revenue: 0, orders: 0, isDay: true });
    }
  } else if (analyticsRange === 'quarter') {
    // Show 3 months for current quarter
    const qStart = Math.floor(now.getMonth() / 3) * 3;
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), qStart + i, 1);
      months.push({
        key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString(i18n.current === 'ar' ? 'ar-SA' : 'en-US', { month: 'short' }),
        revenue: 0, orders: 0
      });
    }
  } else {
    // Default (all / year / custom): last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString(i18n.current === 'ar' ? 'ar-SA' : 'en-US', { month: 'short' }),
        revenue: 0, orders: 0
      });
    }
  }

  const isDay = months[0]?.isDay;
  for (const o of printLog) {
    if (o.status !== 'completed' || o.voidedAt) continue;
    if (!inRange(o.date, analyticsRange, 'analytics')) continue;
    const key = isDay ? (o.date || '').slice(0, 10) : (o.date || '').slice(0, 7);
    const m = months.find(x => x.key === key);
    if (m) { m.revenue += orderRevenueBase(o); m.orders++; }
  }

  const maxRev = Math.max(...months.map(m => m.revenue), 1);
  const W = 600, H = 210;
  const padL = 48, padR = 12, padT = 18, padB = 34;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW   = chartW / months.length;
  const gap    = Math.max(2, barW * 0.18);
  const TICKS  = 4;

  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Grid lines + y-labels
  for (let i = 0; i <= TICKS; i++) {
    const y   = padT + chartH - (i / TICKS) * chartH;
    const val = (maxRev / TICKS) * i;
    const lbl = val >= 1000 ? (val / 1000).toFixed(val >= 10000 ? 0 : 1) + 'k' : val.toFixed(0);
    s += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#ffffff10" stroke-width="1"/>`;
    s += `<text x="${(padL - 6).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#6b7793">${escapeHtml(lbl)}</text>`;
  }

  // Bars
  months.forEach((m, i) => {
    const x   = padL + i * barW + gap / 2;
    const bw  = barW - gap;
    const bh  = m.revenue > 0 ? Math.max(3, (m.revenue / maxRev) * chartH) : 3;
    const y   = padT + chartH - bh;
    const cx  = (x + bw / 2).toFixed(1);
    const op  = m.revenue > 0 ? '0.85' : '0.12';

    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="#5b9cf0" rx="3" opacity="${op}"/>`;

    // Value above bar
    if (m.revenue > 0) {
      const vl = m.revenue >= 1000 ? (m.revenue / 1000).toFixed(1) + 'k' : m.revenue.toFixed(0);
      s += `<text x="${cx}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#9aa6c0">${escapeHtml(vl)}</text>`;
    }
    // Order count dot + label
    if (m.orders > 0) {
      s += `<text x="${cx}" y="${(padT + chartH + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="#5b9cf0" font-weight="600">${m.orders}</text>`;
    }
    // Month label
    s += `<text x="${cx}" y="${(padT + chartH + 26).toFixed(1)}" text-anchor="middle" font-size="10" fill="#6b7793">${escapeHtml(m.label)}</text>`;
  });

  s += `</svg>`;
  wrap.innerHTML = s;

  // PNG export button
  const existingBtn = wrap.parentElement?.querySelector('.chart-dl-btn');
  if (existingBtn) existingBtn.remove();
  const dlBtn = document.createElement('button');
  dlBtn.className = 'btn small ghost chart-dl-btn';
  dlBtn.style.cssText = 'position:absolute;top:6px;right:6px;font-size:11px;padding:3px 8px;opacity:0.7;';
  dlBtn.textContent = '⬇ PNG';
  dlBtn.title = 'Download chart as PNG';
  if (wrap.parentElement) wrap.parentElement.style.position = 'relative';
  wrap.parentElement?.appendChild(dlBtn);
  dlBtn.addEventListener('click', () => {
    const svg = wrap.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const vb = svg.viewBox.baseVal;
    canvas.width  = vb.width  || 600;
    canvas.height = vb.height || 210;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = 'khayt-revenue-chart.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  });
}

function renderClientRetention() {
  const el = $('#clientRetentionSection');
  if (!el) return;
  const completed = printLog.filter(o => o.status === 'completed' && o.clientId && o.date);
  // Group by client, sorted by date
  const clientOrders = {};
  for (const o of completed) {
    if (!clientOrders[o.clientId]) clientOrders[o.clientId] = [];
    clientOrders[o.clientId].push(o.date);
  }
  // Only clients with at least one order
  const allClients = Object.entries(clientOrders).map(([id, dates]) => {
    const sorted = [...dates].sort();
    return { id, firstDate: sorted[0], secondDate: sorted[1] || null, total: sorted.length };
  });
  const withAtLeastOne = allClients.length;
  if (withAtLeastOne < 2) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.retention_no_data'))}</p>`;
    return;
  }
  const withTwo = allClients.filter(c => c.secondDate !== null);
  const daysBetween = (a, b) => Math.round(Math.abs(new Date(b) - new Date(a)) / 86400000);
  const ret30 = withTwo.filter(c => daysBetween(c.firstDate, c.secondDate) <= 30).length;
  const ret60 = withTwo.filter(c => daysBetween(c.firstDate, c.secondDate) <= 60).length;
  const ret90 = withTwo.filter(c => daysBetween(c.firstDate, c.secondDate) <= 90).length;
  const pct = (n) => withAtLeastOne > 0 ? (n / withAtLeastOne * 100).toFixed(1) : '0.0';
  const avgDays = withTwo.length > 0
    ? (withTwo.reduce((s, c) => s + daysBetween(c.firstDate, c.secondDate), 0) / withTwo.length).toFixed(1)
    : '—';

  // Top returning clients
  const topReturning = [...allClients]
    .filter(c => c.total >= 2)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  el.innerHTML = `
    <div class="accuracy-stats" style="margin-bottom:16px;">
      <div class="retention-stat accuracy-stat">
        <div class="v" style="color:var(--primary);">${pct(ret30)}%</div>
        <div class="l">${escapeHtml(t('an.retention_30'))}</div>
      </div>
      <div class="retention-stat accuracy-stat">
        <div class="v" style="color:var(--primary);">${pct(ret60)}%</div>
        <div class="l">${escapeHtml(t('an.retention_60'))}</div>
      </div>
      <div class="retention-stat accuracy-stat">
        <div class="v" style="color:var(--primary);">${pct(ret90)}%</div>
        <div class="l">${escapeHtml(t('an.retention_90'))}</div>
      </div>
      <div class="retention-stat accuracy-stat">
        <div class="v">${escapeHtml(String(avgDays))}</div>
        <div class="l">${escapeHtml(t('an.retention_avg_days'))}</div>
      </div>
    </div>
    ${topReturning.length > 0 ? `
    <div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:8px;">${escapeHtml('Top returning clients')}</div>
    <ul class="leaderboard">
      ${topReturning.map((c, i) => {
        const cl = clients.find(x => x.id === c.id);
        const name = cl ? localName(cl) : c.id;
        return `<li><span class="rank">${i+1}.</span><span class="name">${escapeHtml(name)}</span><span class="value">${c.total}× orders</span></li>`;
      }).join('')}
    </ul>` : ''}`;
}

function renderCostTrends() {
  const el = $('#costTrendsSection');
  if (!el) return;
  // Build last 12 months
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleString('en', { month: 'short' }) + ' ' + d.getFullYear().toString().slice(2),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }

  // Revenue per print-hour for completed orders
  const revPerHour = months.map(m => {
    const orders = printLog.filter(o =>
      o.status === 'completed' && (o.date || '').startsWith(m.key)
    );
    const totalRev = orders.reduce((s, o) => s + orderRevenueBase(o), 0);
    const totalHrs = orders.reduce((s, o) => s + (+o.printTime || 0), 0);
    return totalHrs > 0 ? totalRev / totalHrs : 0;
  });

  // Average material cost per gram from inventory (simple average)
  const avgCostPerGram = months.map(() => {
    const items = inventory.filter(i => i.cost > 0 && i.weight > 0);
    if (items.length === 0) return 0;
    return items.reduce((s, i) => s + (i.cost / i.weight), 0) / items.length;
  });

  const maxRev = Math.max(...revPerHour, 1);
  const maxCost = Math.max(...avgCostPerGram, 0.001);

  const cur = currencySymbol();
  const revBars = revPerHour.map((v, i) => {
    const pct = Math.round((v / maxRev) * 100);
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;">
      <div style="font-size:9.5px;color:var(--text-muted);font-variant-numeric:tabular-nums;">${v > 0 ? fmtMoney(v) : '—'}</div>
      <div style="background:rgba(255,255,255,0.08);width:100%;height:80px;display:flex;align-items:flex-end;border-radius:3px 3px 0 0;">
        <div style="background:var(--primary);width:100%;height:${pct}%;border-radius:3px 3px 0 0;transition:height 0.4s;opacity:0.8;"></div>
      </div>
      <div style="font-size:9px;color:var(--text-muted);writing-mode:vertical-rl;transform:rotate(180deg);max-height:40px;overflow:hidden;">${escapeHtml(months[i].label)}</div>
    </div>`;
  }).join('');

  const costBars = avgCostPerGram.map((v, i) => {
    const pct = maxCost > 0 ? Math.round((v / maxCost) * 100) : 0;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;">
      <div style="font-size:9.5px;color:var(--text-muted);font-variant-numeric:tabular-nums;">${v > 0 ? fmtMoney(v) : '—'}</div>
      <div style="background:rgba(255,255,255,0.08);width:100%;height:80px;display:flex;align-items:flex-end;border-radius:3px 3px 0 0;">
        <div style="background:var(--warning);width:100%;height:${pct}%;border-radius:3px 3px 0 0;transition:height 0.4s;opacity:0.8;"></div>
      </div>
      <div style="font-size:9px;color:var(--text-muted);writing-mode:vertical-rl;transform:rotate(180deg);max-height:40px;overflow:hidden;">${escapeHtml(months[i].label)}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <h3 class="card-head"><span class="swatch"></span><span>${escapeHtml(t('an.cost_trends'))}</span></h3>
    <div style="margin-bottom:16px;">
      <div style="font-size:12.5px;font-weight:600;color:var(--text-dim);margin-bottom:8px;">
        ${escapeHtml(t('an.rev_per_hour'))} (${cur}/hr)
      </div>
      <div style="display:flex;gap:4px;align-items:flex-end;">${revBars}</div>
    </div>
    <div>
      <div style="font-size:12.5px;font-weight:600;color:var(--text-dim);margin-bottom:8px;">
        ${escapeHtml(t('an.cost_per_gram'))} (${cur}/g)
      </div>
      <div style="display:flex;gap:4px;align-items:flex-end;">${costBars}</div>
    </div>`;
}

/* ============================================================
   New 8-pack Feature 1: Per-operator analytics
   ============================================================ */

function renderOperatorAnalytics() {
  const el = $('#operatorAnalyticsSection');
  if (!el) return;
  if (operators.length === 0) { el.innerHTML = ''; return; }

  const completed = printLog.filter(o => o.status === 'completed' && o.operatorId);
  if (completed.length === 0) {
    el.innerHTML = `<h3 class="card-head"><span class="swatch"></span><span>${escapeHtml(t('an.operator_title'))}</span></h3><p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.accuracy_none'))}</p>`;
    return;
  }

  const rows = operators.map(op => {
    const jobs = completed.filter(o => o.operatorId === op.id);
    const wasteEntries = wasteLog.filter(w => {
      // Match waste entries to orders assigned to this operator
      return jobs.some(j => j.id === w.orderId);
    });
    // Avg print time accuracy: (estimated - actual) / estimated
    const accuracyScores = jobs
      .filter(o => o.actualPrintTime != null && o.printTime > 0)
      .map(o => (1 - Math.abs(+o.actualPrintTime - +o.printTime) / +o.printTime) * 100);
    const avgAccuracy = accuracyScores.length > 0
      ? (accuracyScores.reduce((s, v) => s + v, 0) / accuracyScores.length).toFixed(1) + '%'
      : '—';
    return { op, jobs: jobs.length, wasteEntries: wasteEntries.length, avgAccuracy };
  }).filter(r => r.jobs > 0);

  if (rows.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <h3 class="card-head"><span class="swatch"></span><span>${escapeHtml(t('an.operator_title'))}</span></h3>
    <div class="table-wrap">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="border-bottom:1px solid var(--border-soft);color:var(--text-muted);">
          <th style="padding:6px 8px;text-align:start;">${escapeHtml(t('op.name'))}</th>
          <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('an.op_jobs'))}</th>
          <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('an.op_waste'))}</th>
          <th style="padding:6px 8px;text-align:end;">${escapeHtml(t('an.op_accuracy'))}</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:7px 8px;font-weight:500;">${escapeHtml(r.op.name)}${r.op.role ? `<span style="font-size:11px;color:var(--text-muted);margin-inline-start:5px;">${escapeHtml(r.op.role)}</span>` : ''}</td>
            <td style="padding:7px 8px;text-align:end;">${r.jobs}</td>
            <td style="padding:7px 8px;text-align:end;color:${r.wasteEntries > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${r.wasteEntries}</td>
            <td style="padding:7px 8px;text-align:end;color:var(--primary);">${escapeHtml(String(r.avgAccuracy))}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderTimeAnalytics() {
  const el = $('#timeAnalyticsSection');
  if (!el) return;
  if (timeEntries.length === 0) {
    el.innerHTML = `<h3 class="card-head"><span class="swatch"></span><span>${escapeHtml(t('time.analytics_title') || 'Time Tracking')}</span></h3><p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('time.no_entries') || 'No time entries yet — log time using ⏱ on orders.')}</p>`;
    return;
  }

  const totalHours = timeEntries.reduce((s, e) => s + (+e.hours || 0), 0);
  const totalCost  = timeEntries.reduce((s, e) => s + (+e.cost  || 0), 0);
  const orderIds   = [...new Set(timeEntries.map(e => e.orderId).filter(Boolean))];
  const avgHrsPerOrder = orderIds.length > 0 ? (totalHours / orderIds.length) : 0;

  // Per-operator stats
  const opStats = {};
  for (const entry of timeEntries) {
    const oid = entry.operatorId;
    if (!opStats[oid]) opStats[oid] = { name: entry.operatorName, hours: 0, cost: 0, orderIds: new Set() };
    opStats[oid].hours += +entry.hours || 0;
    opStats[oid].cost  += +entry.cost  || 0;
    if (entry.orderId) opStats[oid].orderIds.add(entry.orderId);
  }
  const opRows = Object.entries(opStats).map(([, s]) => {
    const ordersWorked = [...s.orderIds];
    const revenue = ordersWorked.reduce((sum, oid) => {
      const o = printLog.find(x => x.id === oid);
      return sum + (+o?.price || 0);
    }, 0);
    const avgRevPerHr = s.hours > 0 ? revenue / s.hours : 0;
    const avgHrs      = s.orderIds.size > 0 ? s.hours / s.orderIds.size : 0;
    return { ...s, orders: s.orderIds.size, avgHrs: avgHrs.toFixed(2), avgRevPerHr: avgRevPerHr.toFixed(2) };
  });

  // Top 3 orders by hours
  const orderHours = {};
  for (const e of timeEntries) {
    if (!e.orderId) continue;
    if (!orderHours[e.orderId]) orderHours[e.orderId] = { hours: 0, ops: new Set() };
    orderHours[e.orderId].hours += +e.hours || 0;
    orderHours[e.orderId].ops.add(e.operatorName);
  }
  const top3 = Object.entries(orderHours)
    .sort((a, b) => b[1].hours - a[1].hours)
    .slice(0, 3)
    .map(([oid, v]) => {
      const o = printLog.find(x => x.id === oid);
      return { name: o?.project || oid, hours: v.hours.toFixed(2), ops: [...v.ops].join(', ') };
    });

  el.innerHTML = `
    <h3 class="card-head"><span class="swatch"></span><span>${escapeHtml(t('time.analytics_title') || 'Time Tracking Analytics')}</span></h3>
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px;">
      <div style="flex:1;min-width:100px;text-align:center;">
        <div style="font-size:20px;font-weight:700;">${totalHours.toFixed(2)}h</div>
        <div style="font-size:11px;color:var(--text-muted);">Total hours</div>
      </div>
      <div style="flex:1;min-width:100px;text-align:center;">
        <div style="font-size:20px;font-weight:700;color:#22c55e;">${fmtPrice(totalCost)}</div>
        <div style="font-size:11px;color:var(--text-muted);">Total labor cost</div>
      </div>
      <div style="flex:1;min-width:100px;text-align:center;">
        <div style="font-size:20px;font-weight:700;">${avgHrsPerOrder.toFixed(2)}h</div>
        <div style="font-size:11px;color:var(--text-muted);">Avg hrs/order</div>
      </div>
    </div>
    ${opRows.length > 0 ? `
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Per-Operator Breakdown</div>
    <div class="table-wrap">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="border-bottom:1px solid var(--border-soft);color:var(--text-muted);">
          <th style="padding:6px 8px;text-align:start;">Operator</th>
          <th style="padding:6px 8px;text-align:end;">Hours</th>
          <th style="padding:6px 8px;text-align:end;">Cost</th>
          <th style="padding:6px 8px;text-align:end;">Orders</th>
          <th style="padding:6px 8px;text-align:end;">Avg h/order</th>
          <th style="padding:6px 8px;text-align:end;">Revenue/hr</th>
        </tr></thead>
        <tbody>
          ${opRows.map(r => `<tr style="border-bottom:1px solid rgba(255,255,255,.05);">
            <td style="padding:7px 8px;font-weight:500;">${escapeHtml(r.name)}</td>
            <td style="padding:7px 8px;text-align:end;">${r.hours.toFixed(2)}h</td>
            <td style="padding:7px 8px;text-align:end;">${fmtPrice(r.cost)}</td>
            <td style="padding:7px 8px;text-align:end;">${r.orders}</td>
            <td style="padding:7px 8px;text-align:end;">${r.avgHrs}h</td>
            <td style="padding:7px 8px;text-align:end;color:var(--primary);">${fmtPrice(+r.avgRevPerHr)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}
    ${top3.length > 0 ? `
    <div style="font-weight:600;font-size:13px;margin-top:16px;margin-bottom:8px;">Top Orders by Hours</div>
    <div class="table-wrap">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="border-bottom:1px solid var(--border-soft);color:var(--text-muted);">
          <th style="padding:6px 8px;text-align:start;">Project</th>
          <th style="padding:6px 8px;text-align:end;">Total Hours</th>
          <th style="padding:6px 8px;text-align:start;">Operators</th>
        </tr></thead>
        <tbody>
          ${top3.map(r => `<tr style="border-bottom:1px solid rgba(255,255,255,.05);">
            <td style="padding:7px 8px;">${escapeHtml(r.name)}</td>
            <td style="padding:7px 8px;text-align:end;font-weight:600;">${r.hours}h</td>
            <td style="padding:7px 8px;font-size:11.5px;color:var(--text-muted);">${escapeHtml(r.ops)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}`;
}

async function exportAnalyticsReport() {
  // 1. Make sure analytics is freshly rendered
  renderAnalytics();

  // 2. Collect chart/table SVGs from DOM (already rendered)
  const chartIds = [
    'revenueChartWrap',
    'topProductsList',
    'topClientsList',
    'activityList',
    'accuracySection',
    'timestampAccuracySection',
    'quoteFunnelChart',
    'monthlyTrendChart',
    'machineRevenueChart',
    'profitMarginChart',
    'wasteTrendChart',
    'cycleTimeChart',
    'cashFlowChart',
    'expenseCategoryChart',
    'leadTimeTable',
    'npsTrendChart',
    'clientLtvTable',
    'machineDowntimeChart',
    'maintenanceCostChart',
    'materialUsageChart',
    'filamentPerfSection',
    'printerUtilSection',
    'pnlSection',
    'productProfitSection',
    'slaSection',
    'machinePLSection',
    'throughputHeatmapSection',
    'clientRetentionSection',
    'costTrendsSection',
    'operatorAnalyticsSection',
    'agedReceivablesSection',
    'surveyAnalyticsSection',
    'newVsReturningSection',
  ];

  const sections = chartIds.map(id => {
    const el = document.getElementById(id);
    let inner = el?.innerHTML?.trim();
    if (!inner) return '';
    // Strip <script> blocks to prevent XSS when content is written via document.write()
    inner = inner.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<script[^>]*/gi, '');
    return `<div class="report-section">${inner}</div>`;
  }).filter(Boolean).join('\n');

  // 3. KPI summary
  const pl = printLog || [];
  const completedOrders = pl.filter(o => o.status === 'completed');
  const totalRev = pl.filter(o => o.status === 'completed' || o.status === 'delivered')
    .reduce((s, o) => s + orderRevenueBase(o), 0);
  const totalOrders = pl.length;
  const avgMargin = (() => {
    const withMargin = completedOrders.filter(o => o.costBasis > 0 && +o.price > 0);
    if (!withMargin.length) return null;
    return withMargin.reduce((s, o) => s + ((+o.price - o.costBasis) / +o.price * 100), 0) / withMargin.length;
  })();
  const matCount = {};
  pl.forEach(o => { if (o.material) matCount[o.material] = (matCount[o.material] || 0) + 1; });
  const topMat = Object.entries(matCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  const s = settings || {};
  const shopName = escapeHtml(s.bizName || s.bizEn || s.shopName || 'Khayt');
  const accentColor = safeCssColor(s.invoiceAccentColor || s.invAccentColor, '#5b9cf0');
  const rangeLabel = escapeHtml(t('an.range.' + analyticsRange) || analyticsRange);
  const reportDate = new Date().toLocaleDateString();

  const safeLogo = typeof safeBizLogo === 'function' ? safeBizLogo() : '';

  // 4. Build HTML
  const html = `<!DOCTYPE html>
<html dir="${document.documentElement.dir || 'ltr'}" lang="${document.documentElement.lang || 'en'}">
<head>
<meta charset="UTF-8">
<title>${shopName} — ${escapeHtml(t('an.report_title') || 'Analytics Report')}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,'Segoe UI',sans-serif; font-size:11pt; color:#111; background:#fff; padding:15mm 20mm; }
  .report-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10mm; border-bottom:2.5px solid ${accentColor}; padding-bottom:6mm; }
  .shop-name { font-size:20pt; font-weight:800; color:${accentColor}; }
  .report-meta { text-align:right; font-size:9.5pt; color:#666; line-height:1.7; }
  .report-title { font-size:14pt; font-weight:700; color:#111; margin-bottom:1mm; }
  .kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:10mm; }
  .kpi-card { background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:10px 14px; }
  .kpi-label { font-size:8.5pt; color:#888; text-transform:uppercase; letter-spacing:.4pt; }
  .kpi-value { font-size:16pt; font-weight:700; color:${accentColor}; margin-top:2px; }
  .report-section { margin-bottom:8mm; page-break-inside:avoid; }
  h4 { font-size:11pt; font-weight:700; color:#444; margin:6mm 0 3mm; }
  table { width:100%; border-collapse:collapse; font-size:9.5pt; }
  th { background:${accentColor}; color:#fff; padding:5px 8px; text-align:left; font-size:8.5pt; }
  td { padding:5px 8px; border-bottom:0.3mm solid #e5e7eb; }
  tr:nth-child(even) td { background:#f9fafb; }
  svg text { font-family:-apple-system,'Segoe UI',sans-serif !important; }
  ul { list-style:none; padding:0; }
  li { padding:4px 0; border-bottom:0.3mm solid #f0f0f0; font-size:10pt; }
  @media print {
    body { padding:10mm 15mm; }
    .report-section { page-break-inside:avoid; }
  }
  .logo-img { max-height:50px; max-width:120px; object-fit:contain; }
</style>
</head>
<body>
  <div class="report-header">
    <div>
      ${safeLogo ? `<img src="${safeLogo}" class="logo-img" alt="logo" style="margin-bottom:4px;display:block;">` : ''}
      <div class="shop-name">${shopName}</div>
    </div>
    <div class="report-meta">
      <div class="report-title">${escapeHtml(t('an.report_title') || 'Analytics Report')}</div>
      <div>${escapeHtml(t('an.period') || 'Period')}: <strong>${rangeLabel}</strong></div>
      <div>${escapeHtml(t('an.generated') || 'Generated')}: ${reportDate}</div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-label">${escapeHtml(t('an.total_revenue') || 'Total Revenue')}</div>
      <div class="kpi-value">${escapeHtml(fmtPrice(totalRev))}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">${escapeHtml(t('an.total_orders') || 'Total Orders')}</div>
      <div class="kpi-value">${totalOrders}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">${escapeHtml(t('an.avg_margin') || 'Avg Margin')}</div>
      <div class="kpi-value">${avgMargin !== null ? avgMargin.toFixed(1) + '%' : '—'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">${escapeHtml(t('an.top_material') || 'Top Material')}</div>
      <div class="kpi-value" style="font-size:13pt;">${escapeHtml(topMat)}</div>
    </div>
  </div>

  ${sections}

  <div style="margin-top:12mm;padding-top:4mm;border-top:0.5px solid #ddd;font-size:8pt;color:#aaa;text-align:center;">
    ${shopName} · ${escapeHtml(t('an.report_footer') || 'Generated by Khayt')} · ${reportDate}
  </div>
</body>
</html>`;

  // 5. Open and print
  const win = window.open('', '_blank', 'width=1000,height=760,toolbar=0,menubar=0,scrollbars=1');
  if (win) {
    win.document.open();
    win.document.write(sanitizePrintHtml(html));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  } else if (window.hubAPI?.saveHtml) {
    const fname = `analytics-report-${localDateStr()}.html`;
    const saved = await window.hubAPI.saveHtml(html, fname);
    if (saved?.path) { window.hubAPI?.openPath?.(saved.path); return; }
    if (typeof saved === 'string') { window.hubAPI?.openPath?.(saved); return; }
  }
}

function renderThroughputHeatmap() {
  const el = $('#throughputHeatmapSection');
  if (!el) return;

  const completed = printLog.filter(o =>
    o.status === 'completed' && o.completedAt && inRange(o.date, analyticsRange, 'analytics')
  );

  if (completed.length < 10) {
    el.innerHTML = `<p style="color:var(--text-muted); font-size:13px;">${escapeHtml(t('an.heatmap_no_data'))}</p>`;
    return;
  }

  // Build 7×24 matrix
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
  completed.forEach(o => {
    try {
      const d = new Date(o.completedAt);
      const dow = d.getDay();   // 0=Sun..6=Sat
      const hod = d.getHours(); // 0..23
      matrix[dow][hod]++;
    } catch (_) {}
  });

  const maxVal = Math.max(1, ...matrix.flat());
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const SHOWN_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];

  const headerRow = `<tr>
    <th style="padding:2px 6px;">${escapeHtml(t('an.heatmap_day'))}</th>
    ${Array.from({ length: 24 }, (_, h) => `<th class="heatmap-cell" style="background:none; border:none; width:28px; height:28px;">${SHOWN_HOURS.includes(h) ? h : ''}</th>`).join('')}
  </tr>`;

  const bodyRows = matrix.map((row, dow) => {
    const cells = row.map((count, h) => {
      const intensity = count / maxVal;
      return `<td class="heatmap-cell" style="--hm-intensity:${intensity.toFixed(2)};" title="${DAY_NAMES[dow]} ${h}:00 — ${count} order(s)">${count > 0 ? count : ''}</td>`;
    }).join('');
    return `<tr><th style="font-size:11px; padding:2px 6px; text-align:start;">${escapeHtml(DAY_NAMES[dow])}</th>${cells}</tr>`;
  }).join('');

  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="heatmap-table">
        <thead>${headerRow}</thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div class="heatmap-legend">
      <span>0</span>
      <div class="heatmap-legend-bar"></div>
      <span>${maxVal}</span>
    </div>`;
}

function computeCapacityForecast() {
  const activeStatuses = ['pending','printing','post','on_hold'];
  const rows = [];
  let totalBooked = 0, totalAvail = 0;
  for (const m of machines) {
    const avail = +(m.targetHoursPerDay || 0);
    if (avail <= 0) continue;
    const availableHours = avail * 7;
    const bookedHours = printLog
      .filter(o => o.machineId === m.id && activeStatuses.includes(o.status))
      .reduce((s, o) => s + (+o.printTime || 0), 0);
    const pct = Math.min(100, Math.round(bookedHours / availableHours * 100));
    rows.push({ machineName: m.name, color: m.color, bookedHours, availableHours, pct });
    totalBooked += bookedHours;
    totalAvail  += availableHours;
  }
  return { rows, totalBooked, totalAvail, totalPct: totalAvail > 0 ? Math.min(100, Math.round(totalBooked / totalAvail * 100)) : 0 };
}

function renderCapacityGauge() {
  const el = $('#capacityGaugeSection');
  if (!el) return;
  const { rows, totalPct } = computeCapacityForecast();
  if (rows.length === 0) {
    el.innerHTML = `<div class="dash-section" style="margin-bottom:14px;">
      <h3 class="dash-section-head">${escapeHtml(t('dash.capacity_title'))}</h3>
      <p style="color:var(--text-muted); font-size:12.5px;">${escapeHtml(t('dash.capacity_no_targets'))}</p>
    </div>`;
    return;
  }
  const gaugeRows = rows.map(r => {
    const col = r.pct >= 90 ? 'var(--danger)' : r.pct >= 70 ? 'var(--warning)' : 'var(--success)';
    return `<div style="margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
        <span style="display:flex; align-items:center; gap:6px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${safeCssColor(r.color)};display:inline-block;"></span>
          ${escapeHtml(r.machineName)}
        </span>
        <span style="color:var(--text-muted);">${r.bookedHours.toFixed(1)}h / ${r.availableHours.toFixed(1)}h (${r.pct}%)</span>
      </div>
      <div style="background:var(--surface-2); border-radius:3px; height:6px; overflow:hidden;">
        <div style="width:${r.pct}%; height:100%; background:${col}; transition:width 0.3s;"></div>
      </div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="dash-section" style="margin-bottom:14px;">
    <h3 class="dash-section-head">${escapeHtml(t('dash.capacity_title'))} <span style="font-size:11px;font-weight:400;color:var(--text-muted);">${escapeHtml(t('dash.capacity_booked', { pct: totalPct }))}</span></h3>
    ${gaugeRows}
  </div>`;
}

function renderAgedReceivables() {
  const el = $('#agedReceivablesSection');
  if (!el) return;
  const today = new Date(); today.setHours(0,0,0,0);

  const unpaid = printLog.filter(o => {
    if (o.voidedAt) return false;
    const ps = payStatus(o);
    return ps === 'unpaid' || ps === 'partial';
  });

  if (unpaid.length === 0) {
    el.innerHTML = `<p style="color:var(--success);margin:0;">✅ No outstanding receivables.</p>`;
    return;
  }

  const buckets = { '0–30': [], '31–60': [], '61–90': [], '90+': [] };
  function addToBucket(entry) {
    if      (entry.days <= 30) buckets['0–30'].push(entry);
    else if (entry.days <= 60) buckets['31–60'].push(entry);
    else if (entry.days <= 90) buckets['61–90'].push(entry);
    else                       buckets['90+'].push(entry);
  }
  unpaid.forEach(o => {
    const arClient = o.clientId ? clients.find(c => c.id === o.clientId) : null;
    const arClientName = arClient ? localName(arClient) : (o.client || '');

    if (o.instalments && o.instalments.length > 0) {
      // Age each unpaid instalment separately by its own dueDate
      o.instalments.forEach(ins => {
        if (ins.paid) return;
        const owed = Math.max(0, +ins.amount || 0);
        if (owed <= 0) return;
        const refDate = ins.dueDate || o.date;
        const instDate = new Date(refDate + 'T00:00:00');
        const days = Math.max(0, Math.floor((today - instDate) / 86400000));
        addToBucket({ id: o.id, project: o.project, client: arClientName, owed, days, payStatus: payStatus(o) });
      });
    } else {
      const orderDate = new Date((o.date || o.timestamp || today.toISOString()).split('T')[0] + 'T00:00:00');
      const days = Math.max(0, Math.floor((today - orderDate) / 86400000));
      const owed = orderOwedBase(o);
      if (owed > 0) addToBucket({ id: o.id, project: o.project, client: arClientName, owed, days, payStatus: payStatus(o) });
    }
  });

  const totalOwed = unpaid.reduce((s, o) => {
    if (o.instalments && o.instalments.length > 0) {
      return s + o.instalments.filter(ins => !ins.paid).reduce((si, ins) => si + Math.max(0, +ins.amount || 0), 0);
    }
    return s + orderOwedBase(o);
  }, 0);

  const bucketColors = { '0–30': 'var(--success)', '31–60': 'var(--warning)', '61–90': '#f97316', '90+': 'var(--danger)' };

  let html = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
      ${Object.entries(buckets).map(([label, items]) => {
        const total = items.reduce((s, i) => s + i.owed, 0);
        return `<div style="flex:1;min-width:120px;padding:12px 16px;background:var(--bg-elev);border-radius:var(--radius);border-left:3px solid ${bucketColors[label]};">
          <div style="font-size:12px;color:var(--text-muted);">${label} days</div>
          <div style="font-size:16px;font-weight:700;margin-top:4px;">${fmtPrice(total)}</div>
          <div style="font-size:11px;color:var(--text-dim);">${items.length} order${items.length !== 1 ? 's' : ''}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <strong style="font-size:14px;">Total outstanding: <span style="color:var(--danger);">${fmtPrice(totalOwed)}</span></strong>
      <button class="btn small ghost" id="btnExportAgedCsv">⬇ Export CSV</button>
    </div>`;

  Object.entries(buckets).forEach(([label, items]) => {
    if (items.length === 0) return;
    html += `<div style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:600;color:${bucketColors[label]};margin-bottom:6px;padding:4px 8px;background:rgba(0,0,0,0.1);border-radius:4px;">${label} DAYS — ${items.length} order(s)</div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="color:var(--text-dim);">
          <th style="text-align:left;padding:4px 6px;">Order ID</th>
          <th style="text-align:left;padding:4px 6px;">Project</th>
          <th style="text-align:left;padding:4px 6px;">Client</th>
          <th style="text-align:right;padding:4px 6px;">Owed</th>
          <th style="text-align:right;padding:4px 6px;">Days</th>
        </tr></thead>
        <tbody>${items.map(i => `<tr style="border-top:1px solid var(--border);">
          <td style="padding:5px 6px;color:var(--text-muted);font-family:var(--font-num);">${escapeHtml(i.id)}</td>
          <td style="padding:5px 6px;">${escapeHtml(i.project||'—')}</td>
          <td style="padding:5px 6px;">${escapeHtml(i.client||'—')}</td>
          <td style="padding:5px 6px;text-align:right;color:var(--danger);font-weight:600;">${fmtPrice(i.owed)}</td>
          <td style="padding:5px 6px;text-align:right;color:${bucketColors[label]};">${i.days}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  });
  el.innerHTML = html;

  el.querySelector('#btnExportAgedCsv')?.addEventListener('click', () => {
    const rows = [['Order ID','Project','Client','Owed','Days Outstanding','Bucket']];
    Object.entries(buckets).forEach(([label, items]) => {
      items.forEach(i => rows.push([i.id, i.project||'', i.client||'', i.owed.toFixed(2), i.days, label]));
    });
    downloadBlob(new Blob([rows.map(r => r.map(csvEsc).join(',')).join('\n')], { type: 'text/csv' }), 'aged-receivables.csv');
  });
}

function renderSurveyAnalytics() {
  const el = $('#surveyAnalyticsSection');
  if (!el) return;
  const surveyed = printLog.filter(o => o.survey?.rating);
  if (surveyed.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);">No survey responses yet.</p>';
    return;
  }
  const avg = surveyed.reduce((s, o) => s + o.survey.rating, 0) / surveyed.length;
  const dist = [1,2,3,4,5].map(r => ({ r, n: surveyed.filter(o => o.survey.rating === r).length }));
  // NPS on 5-star scale: 5 = promoter, 4 = passive, 1-3 = detractors
  // (True NPS requires 0-10 scale; adapt proportionally: 5→promoter, 4→passive, ≤3→detractor)
  const promoters  = surveyed.filter(o => o.survey.rating === 5).length;
  const detractors = surveyed.filter(o => o.survey.rating <= 3).length;
  const nps = Math.round((promoters - detractors) / surveyed.length * 100);

  el.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
      <div style="text-align:center;padding:12px 20px;background:var(--bg-elev);border-radius:var(--radius);">
        <div style="font-size:28px;font-weight:700;color:var(--primary);">${avg.toFixed(1)}</div>
        <div style="font-size:11px;color:var(--text-muted);">Avg Rating</div>
      </div>
      <div style="text-align:center;padding:12px 20px;background:var(--bg-elev);border-radius:var(--radius);">
        <div style="font-size:28px;font-weight:700;color:${nps >= 50 ? 'var(--success)' : nps >= 0 ? 'var(--warning)' : 'var(--danger)'};">${nps >= 0 ? '+' : ''}${nps}</div>
        <div style="font-size:11px;color:var(--text-muted);">NPS Score</div>
      </div>
      <div style="text-align:center;padding:12px 20px;background:var(--bg-elev);border-radius:var(--radius);">
        <div style="font-size:28px;font-weight:700;">${surveyed.length}</div>
        <div style="font-size:11px;color:var(--text-muted);">Responses</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      ${dist.reverse().map(({r, n}) => {
        const pct = surveyed.length > 0 ? Math.round(n / surveyed.length * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;">
          <span style="width:18px;text-align:right;">${r}⭐</span>
          <div style="flex:1;background:var(--bg);border-radius:4px;height:14px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:var(--primary);border-radius:4px;transition:width .4s;"></div>
          </div>
          <span style="width:36px;color:var(--text-muted);">${pct}%</span>
          <span style="color:var(--text-dim);">(${n})</span>
        </div>`;
      }).join('')}
    </div>`;
}

/* ============================================================
   Round 12 — Feature 4: Break-Even & Overhead Allocation
   ============================================================ */
function computeBreakEven() {
  const fixedCosts = settings.fixedCosts || [];
  const totalFixed = fixedCosts.reduce((s, c) => s + (+c.amount || 0), 0);
  if (totalFixed === 0) return null;

  // Avg contribution margin per order (last 90 days)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
  const recent = printLog.filter(o => o.status === 'completed' && o.date && new Date(o.date + 'T00:00:00') >= cutoff);
  const avgRevPerOrder = recent.length > 0 ? recent.reduce((s, o) => s + orderRevenueBase(o), 0) / recent.length : 0;
  const avgMaterialCost = recent.length > 0 ? recent.reduce((s, o) => {
    const mc = (o.parts || []).reduce((ps, p) => {
      if (!p.filamentId) return ps;
      const sp = inventory.find(i => i.id === p.filamentId);
      return ps + ((+p.printWeight || 0) / 1000 * ((sp ? (+sp.cost / +sp.weight) * 1000 : 0)));
    }, 0);
    return s + mc;
  }, 0) / recent.length : 0;
  const avgMarginPct = avgRevPerOrder > 0 ? Math.max(0, (avgRevPerOrder - avgMaterialCost) / avgRevPerOrder) : 0;

  const breakEvenRevenue = avgMarginPct > 0 ? totalFixed / avgMarginPct : null;
  return { totalFixed, breakEvenRevenue, avgMarginPct, avgRevPerOrder };
}

function renderBreakEvenCard() {
  const el = $('#breakEvenSection');
  if (!el) return;
  const fixedCosts = settings.fixedCosts || [];
  const be = computeBreakEven();

  const today = new Date();
  const thisMonthStr = localMonthStr(today);
  const monthRev = printLog
    .filter(o => o.status === 'completed' && (o.date || '').startsWith(thisMonthStr))
    .reduce((s, o) => s + orderRevenueBase(o), 0);

  if (fixedCosts.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No fixed costs configured. <a href="#" id="goToBreakEvenSettings" style="color:var(--primary);">Add fixed costs in Settings →</a></p>`;
    el.querySelector('#goToBreakEvenSettings')?.addEventListener('click', e => {
      e.preventDefault();
      document.querySelector('[data-tab="settings-tab"]')?.click();
    });
    return;
  }

  const progress = be?.breakEvenRevenue ? Math.min(100, (monthRev / be.breakEvenRevenue) * 100) : 0;
  const surplus  = be?.breakEvenRevenue ? monthRev - be.breakEvenRevenue : null;

  el.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
      <div style="flex:1;min-width:140px;padding:12px 16px;background:var(--bg-elev);border-radius:var(--radius);">
        <div style="font-size:11px;color:var(--text-muted);">Monthly Fixed Costs</div>
        <div style="font-size:18px;font-weight:700;color:var(--danger);">${fmtPrice(be?.totalFixed || 0)}</div>
      </div>
      ${be?.breakEvenRevenue ? `
      <div style="flex:1;min-width:140px;padding:12px 16px;background:var(--bg-elev);border-radius:var(--radius);">
        <div style="font-size:11px;color:var(--text-muted);">Break-Even Revenue</div>
        <div style="font-size:18px;font-weight:700;color:var(--warning);">${fmtPrice(be.breakEvenRevenue)}</div>
      </div>
      <div style="flex:1;min-width:140px;padding:12px 16px;background:var(--bg-elev);border-radius:var(--radius);border-left:3px solid ${surplus >= 0 ? 'var(--success)' : 'var(--danger)'};">
        <div style="font-size:11px;color:var(--text-muted);">${surplus >= 0 ? 'Above Break-Even' : 'Below Break-Even'}</div>
        <div style="font-size:18px;font-weight:700;color:${surplus >= 0 ? 'var(--success)' : 'var(--danger)'};">${surplus >= 0 ? '+' : ''}${fmtPrice(surplus || 0)}</div>
      </div>` : ''}
    </div>
    ${be?.breakEvenRevenue ? `
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px;">
        <span>This month: ${fmtPrice(monthRev)}</span>
        <span>Target: ${fmtPrice(be.breakEvenRevenue)}</span>
      </div>
      <div style="background:var(--bg);border-radius:6px;height:10px;overflow:hidden;">
        <div style="height:100%;width:${progress}%;background:${progress >= 100 ? 'var(--success)' : 'var(--primary)'};border-radius:6px;transition:width .5s;"></div>
      </div>
    </div>` : '<p style="color:var(--text-muted);font-size:12.5px;margin-bottom:12px;">Not enough order history to compute break-even. Add more completed orders.</p>'}
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
      <thead><tr style="color:var(--text-dim);">
        <th style="text-align:left;padding:4px 6px;">Fixed Cost</th>
        <th style="text-align:right;padding:4px 6px;">Monthly Amount</th>
        <th style="padding:4px 6px;"></th>
      </tr></thead>
      <tbody>
        ${fixedCosts.map((c, i) => `<tr style="border-top:1px solid var(--border);">
          <td style="padding:6px;">${escapeHtml(c.name)}</td>
          <td style="padding:6px;text-align:right;color:var(--danger);">${fmtPrice(c.amount)}</td>
          <td style="padding:6px;"><button class="btn danger small" data-del-cost="${i}">✕</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  el.querySelectorAll('[data-del-cost]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmModal(t('common.delete') + '?', { danger: true });
      if (!ok) return;
      settings.fixedCosts.splice(parseInt(btn.dataset.delCost), 1);
      saveAll();
      renderBreakEvenCard();
    });
  });
}
  const api = {
    renderSimpleReports,
    renderAnalytics,
    exportAnalyticsReport,
    renderClientRetention,
    renderCostTrends,
    renderOperatorAnalytics,
    renderTimeAnalytics,
    renderThroughputHeatmap,
    computeCapacityForecast,
    renderCapacityGauge,
    renderAgedReceivables,
    renderSurveyAnalytics,
    computeBreakEven,
    renderBreakEvenCard,
    renderClientSourceChart,
    renderQuoteFunnelChart,
    renderMonthlyTrendChart,
    renderMachineRevenueChart,
    renderProfitMarginChart,
    renderWasteTrendChart,
    renderCycleTimeChart,
    renderCashFlowChart,
    renderExpenseCategoryChart,
    renderLeadTimeChart,
    renderNpsTrendChart,
    renderClientLtvTable,
    renderMachineDowntimeChart,
    renderMaintenanceCostChart,
    renderMachineAccuracy,
    renderNewVsReturning,
    renderPrinterUtilizationChart,
    renderPnLSection,
    renderProductProfitability,
    renderSLASection,
    renderMachinePL,
    renderLocationPL,
    renderSupplierPriceHistory,
    renderRevenueChart,
  };

  Object.assign(global, api);
  global.KhaytAnalytics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
