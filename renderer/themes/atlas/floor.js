/**
 * Atlas spatial floor — machine stations, zones, inspector (real app data).
 */
(function (global) {
  const ZONES = [
    { id: 'farm', label: 'Print Farm', left: 30, top: 48, width: 376, height: 290, labelTop: 28, labelLeft: 44 },
    { id: 'finish', label: 'Finishing', left: 540, top: 48, width: 230, height: 290, labelTop: 28, labelLeft: 554 },
    { id: 'qc', label: 'QC · Ship', left: 824, top: 48, width: 230, height: 290, labelTop: 28, labelLeft: 838 },
  ];

  const CARD_W = 168;
  const CARD_H = 104;
  const CARD_GAP_X = 20;
  const CARD_GAP_Y = 20;
  const CARD_PAD_X = 20;
  const CARD_PAD_Y = 30;

  let selectedMachineId = null;

  function machineStatus(machine) {
    if (machine.isOffline) return 'error';
    const nowIso = new Date().toISOString();
    const inDowntime = (machine.downtimeBlocks || []).some((b) => b.to && b.to > nowIso);
    if (inDowntime) return 'idle';
    const active = (typeof printLog !== 'undefined' ? printLog : []).find(
      (o) => o.machineId === machine.id && !['completed', 'quote', 'on_hold'].includes(o.status),
    );
    if (!active) return 'idle';
    if (active.status === 'printing') return 'print';
    if (['post', 'qc'].includes(active.status)) return 'post';
    return 'idle';
  }

  function machineProgress(machine) {
    const order = (typeof printLog !== 'undefined' ? printLog : []).find(
      (o) => o.status === 'printing' && o.machineId === machine.id,
    );
    if (!order?.printingStartedAt || !(+order.printTime > 0)) return 0;
    const elapsed = (Date.now() - new Date(order.printingStartedAt).getTime()) / 3600000;
    return Math.min(100, Math.round((elapsed / +order.printTime) * 100));
  }

  function activeOrder(machine) {
    return (typeof printLog !== 'undefined' ? printLog : []).find(
      (o) => o.machineId === machine.id && !['completed', 'quote', 'on_hold'].includes(o.status),
    );
  }

  function machineZone(machine) {
    const type = (machine.type || 'FDM').toLowerCase();
    if (type.includes('resin')) return 'finish';
    const order = activeOrder(machine);
    if (order && ['post', 'qc'].includes(order.status)) return 'finish';
    return 'farm';
  }

  function layoutInZone(machines, zoneId) {
    const zone = ZONES.find((z) => z.id === zoneId);
    if (!zone) return [];
    const cols = Math.max(1, Math.floor((zone.width - CARD_PAD_X * 2 + CARD_GAP_X) / (CARD_W + CARD_GAP_X)));
    return machines.map((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        machine: m,
        x: zone.left + CARD_PAD_X + col * (CARD_W + CARD_GAP_X),
        y: zone.top + CARD_PAD_Y + row * (CARD_H + CARD_GAP_Y),
      };
    });
  }

  function statusLabel(st, prog) {
    const map = {
      print: 'Printing',
      post: 'Post',
      error: 'Offline',
      idle: 'Idle',
    };
    const base = map[st] || 'Idle';
    return prog > 0 && st === 'print' ? `${base} · ${prog}%` : base;
  }

  function inspectorAccent(st) {
    if (st === 'error') return 'var(--error)';
    if (st === 'post') return 'var(--post)';
    if (st === 'print') return 'var(--accent)';
    return 'var(--dim)';
  }

  function bindFloorEvents(root) {
    root.querySelectorAll('[data-atlas-machine]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.atlasMachine;
        selectedMachineId = selectedMachineId === id ? null : id;
        renderAtlasFloor();
      });
    });
    root.querySelector('[data-atlas-open-queue]')?.addEventListener('click', () => {
      if (typeof switchTab === 'function') switchTab('queue-tab');
    });
    root.querySelector('[data-atlas-open-settings]')?.addEventListener('click', () => {
      if (typeof switchTab === 'function') switchTab('settings-tab');
    });
  }

  function renderInspector(machine) {
    if (!machine) {
      return `<div class="inspector"><p class="muted" style="margin-top:24px">${escapeHtml(typeof t === 'function' ? t('mach.empty') : 'Select a machine')}</p></div>`;
    }
    const st = machineStatus(machine);
    const prog = machineProgress(machine);
    const order = activeOrder(machine);
    const loc = (typeof locations !== 'undefined' ? locations : []).find((l) => l.id === machine.locationId);
    const mat = order?.material || order?.filamentType || '—';
    const C = 2 * Math.PI * 56;
    const accent = inspectorAccent(st);
    const state = statusLabel(st, prog);
    const eta = order?.dueDate || (prog > 0 ? `${100 - prog}% left` : 'ready');
    const temp = machine.isOffline
      ? (typeof t === 'function' ? t('mach.offline') : 'Offline')
      : (st === 'print' ? `${machine.nozzleTemp || '—'}°` : '—');

    return `
      <div class="inspector">
        <div>
          <div class="eyebrow">${escapeHtml((machine.type || 'FDM').toUpperCase())}${loc ? ` · ${escapeHtml(loc.name)}` : ''}</div>
          <h2>${escapeHtml(machine.name)}</h2>
        </div>
        <div class="ring">
          <svg width="132" height="132" aria-hidden="true">
            <circle cx="66" cy="66" r="56" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="9" />
            <circle cx="66" cy="66" r="56" fill="none" stroke="${accent}" stroke-width="9"
              stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - prog / 100)}" />
          </svg>
          <div class="pctn">
            <b>${prog}%</b>
            <span>${escapeHtml(state)}</span>
          </div>
        </div>
        <div>
          <div class="readrow"><span class="k">${escapeHtml(typeof t === 'function' ? t('dash.now_printing') : 'Current job')}</span><span class="v">${escapeHtml(order?.project || order?.id || '—')}</span></div>
          <div class="readrow"><span class="k">${escapeHtml(typeof t === 'function' ? t('build.material') : 'Material')}</span><span class="v">${escapeHtml(mat)}</span></div>
          <div class="readrow"><span class="k">${escapeHtml(typeof t === 'function' ? t('mach.status') : 'Status')}</span><span class="v"${st === 'error' ? ' style="color:var(--error)"' : ''}>${escapeHtml(temp)}</span></div>
          <div class="readrow"><span class="k">ETA</span><span class="v">${escapeHtml(String(eta))}</span></div>
        </div>
        <div class="iact">
          <button type="button" class="pri" data-atlas-open-queue>${escapeHtml(typeof t === 'function' ? t('common.view') : 'Open job')}</button>
          <button type="button" data-atlas-open-settings>${escapeHtml(typeof t === 'function' ? t('nav.settings') : 'Settings')}</button>
        </div>
      </div>`;
  }

  function renderAtlasFloor() {
    const el = document.getElementById('dashboardContent');
    if (!el || !document.body.classList.contains('khayt-atlas')) return;

    const fleet = typeof machines !== 'undefined' ? machines : [];
    const farm = fleet.filter((m) => machineZone(m) === 'farm');
    const finish = fleet.filter((m) => machineZone(m) === 'finish');
    const placed = [
      ...layoutInZone(farm, 'farm'),
      ...layoutInZone(finish, 'finish'),
    ];

    const printingN = fleet.filter((m) => machineStatus(m) === 'print').length;
    const util = fleet.length ? Math.round((printingN / fleet.length) * 100) : 0;
    const todayStr = typeof localDateStr === 'function' ? localDateStr(new Date()) : '';
    const jobsToday = (typeof printLog !== 'undefined' ? printLog : [])
      .filter((o) => o.date === todayStr && o.status !== 'quote').length;

    global.KhaytAtlasShell?.syncAtlasChrome?.({ machines: fleet.length, util, jobsToday });

    const zoneHtml = ZONES.map((z) => `
      <div class="zonebox" style="left:${z.left}px;top:${z.top}px;width:${z.width}px;height:${z.height}px"></div>
      <div class="zone" style="left:${z.labelLeft}px;top:${z.labelTop}px">${escapeHtml(z.label)}</div>`).join('');

    const cardsHtml = placed.map(({ machine: m, x, y }) => {
      const st = machineStatus(m);
      const prog = machineProgress(m);
      const cls = ['mc', `s-${st}`];
      if (selectedMachineId === m.id) cls.push('sel');
      const loc = (typeof locations !== 'undefined' ? locations : []).find((l) => l.id === m.locationId);
      const sub = `${(m.type || 'FDM').toUpperCase()}${loc ? ` · ${loc.name}` : ''}`;
      return `
        <div class="${cls.join(' ')}" data-atlas-machine="${escapeHtml(m.id)}"
          style="left:${x}px;top:${y}px">
          <div class="pin"></div>
          <div class="nm">${escapeHtml(m.name)}</div>
          <div class="sub">${escapeHtml(sub)}</div>
          <div class="state">${escapeHtml(statusLabel(st, prog))}</div>
          ${prog > 0 ? `<div class="ringbar"><i style="width:${prog}%"></i></div>` : ''}
        </div>`;
    }).join('');

    const sel = selectedMachineId
      ? fleet.find((m) => m.id === selectedMachineId)
      : (fleet[0] || null);
    if (selectedMachineId && !sel) selectedMachineId = fleet[0]?.id || null;

    el.innerHTML = `
      <div class="atlas-floor-root">
        <div class="floor">
          ${zoneHtml}
          <svg class="flow" viewBox="0 0 1100 470" preserveAspectRatio="none" aria-hidden="true">
            <path d="M406 130 C 470 130, 480 175, 540 175" fill="none"
              stroke="hsl(var(--accent-h) var(--accent-s) var(--accent-l) / 0.28)" stroke-width="2" stroke-dasharray="3 6" />
          </svg>
          ${cardsHtml || `<p class="muted" style="position:absolute;left:44px;top:120px">${escapeHtml(typeof t === 'function' ? t('mach.empty') : 'No machines')}</p>`}
        </div>
        ${renderInspector(sel || fleet[0])}
      </div>`;
    bindFloorEvents(el);
  }

  global.KhaytAtlasFloor = {
    render: renderAtlasFloor,
    machineStatus,
  };
})(typeof window !== 'undefined' ? window : globalThis);
