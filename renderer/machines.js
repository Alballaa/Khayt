/**
 * Machine profiles, maintenance log, service status, WhatsApp templates.
 */
(function (global) {
/* ============================================================
   Machine profiles (physical printers you assign jobs to)
   ============================================================ */
const MACHINE_COLORS = ['#5b9cf0','#2bb673','#f5a623','#ef4d5e','#a78bfa','#fb923c','#34d399','#f472b6'];

/* Feature 4: Grams printed on a machine since last nozzle install */
function machineGramsSinceNozzle(machine) {
  const sinceDate = machine.nozzle?.installedAt || '';
  return printLog
    .filter(o => o.machineId === machine.id && o.status === 'completed' && (o.date || '') >= sinceDate)
    .reduce((s, o) => s + (o.parts || []).reduce((ps, p) => ps + (+p.weight || 0), 0), 0);
}

function renderMachines() {
  const list = $('#machinesList');
  if (!list) return;
  if (machines.length === 0) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">${escapeHtml(t('mach.empty'))}</div>`;
    return;
  }
  list.innerHTML = machines.map(m => {
    const active = printLog.filter(o => o.machineId === m.id && !['completed','quote'].includes(o.status)).length;
    const svc = machineServiceStatus(m);
    const svcBadge = svc.due
      ? `<span class="machine-jobs-badge" style="background:var(--danger); color:#fff;">⚠ ${escapeHtml(t('mach.service_due'))}</span>`
      : svc.warning
        ? `<span class="machine-jobs-badge" style="background:var(--warning); color:#000;">⚠ ${escapeHtml(t('mach.service_warn'))}</span>`
        : '';
    const hrsLine = `<span class="machine-hrs-stat">🔧 ${svc.total.toFixed(1)}h ${escapeHtml(t('mach.hours_total'))}${m.serviceInterval > 0 ? ` · ${svc.hours.toFixed(1)}h since service` : ''}</span>`;
    const now2Str = new Date().toISOString();
    const hasDowntime = (m.downtimeBlocks || []).some(b => b.to && b.to > now2Str);
    const downtimeBadge = hasDowntime
      ? `<span class="machine-jobs-badge" style="background:var(--warning); color:#000;">🔧 ${escapeHtml(t('mach.downtime_badge'))}</span>`
      : '';
    // Feature 4: Nozzle info
    const nozzleGrams = machineGramsSinceNozzle(m);
    const nozzleThreshold = m.nozzle?.gramsThreshold || 2000;
    const nozzlePct = Math.min(100, nozzleThreshold > 0 ? (nozzleGrams / nozzleThreshold) * 100 : 0);
    const nozzleOver = nozzleGrams >= nozzleThreshold && nozzleThreshold > 0;
    const nozzleHtml = m.nozzle?.installedAt ? `
      <div style="margin-top:4px; font-size:11px; color:var(--text-muted);">
        🔩 ${escapeHtml(m.nozzle.material || 'brass')} nozzle${m.nozzleDiameter ? ` · ${m.nozzleDiameter}mm` : ''}${m.extruderType ? ` · ${escapeHtml(m.extruderType)}` : ''}
        · ${nozzleGrams.toFixed(0)}g/${nozzleThreshold}g
        ${nozzleOver ? `<span class="machine-jobs-badge" style="background:var(--danger);color:#fff;">🔩 ${escapeHtml(t('mach.nozzle_replace'))}</span>` : ''}
      </div>
      <div class="nozzle-progress" style="max-width:200px;margin-top:3px;">
        <div class="nozzle-progress-bar" style="width:${nozzlePct.toFixed(1)}%;background:${nozzleOver ? 'var(--danger)' : 'var(--primary)'};"></div>
      </div>` : '';
    // Feature 3: compat materials
    const compatHtml = (m.compatMaterials && m.compatMaterials.length > 0)
      ? `<span style="font-size:10.5px;color:var(--text-muted);margin-inline-start:6px;">[${escapeHtml(m.compatMaterials.join(', '))}]</span>`
      : '';
    return `
      <div class="machine-row" style="flex-wrap:wrap;">
        <span class="machine-dot" style="background:${safeCssColor(m.color)};"></span>
        <span class="machine-name">${escapeHtml(m.name)}</span>
        ${compatHtml}
        ${m.isOffline ? `<span class="machine-jobs-badge" style="background:var(--danger); color:#fff;">⚠ ${escapeHtml(t('mach.offline_badge'))}</span>` : ''}
        ${active > 0 ? `<span class="machine-jobs-badge">${active} ${escapeHtml(t('mach.active_jobs'))}</span>` : ''}
        ${svcBadge}
        ${downtimeBadge}
        ${hrsLine}
        <button class="btn small" data-act="maint-log" data-id="${m.id}" title="${escapeHtml(t('maint.btn'))}">🔧</button>
        <button class="btn small ghost" data-act="log-nozzle-change" data-id="${m.id}" title="${escapeHtml(t('mach.log_nozzle'))}" style="font-size:11px;">🔩</button>
        <button class="btn small" data-act="edit-mach" data-id="${m.id}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn danger small" data-act="del-mach" data-id="${m.id}">${escapeHtml(t('common.delete'))}</button>
        ${nozzleHtml}
      </div>`;
  }).join('');
  updateNotifBadge();
}

function renderMachineDropdown() {
  const optionsHtml = `<option value="">${escapeHtml(t('mach.unassigned'))}</option>` +
    machines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}${m.isOffline ? ' (' + escapeHtml(t('mach.offline_badge')) + ')' : ''}</option>`).join('');
  const sel = $('#machineAssign');
  if (sel) {
    const prev = sel.value;
    sel.innerHTML = optionsHtml;
    if (prev && machines.find(m => m.id === prev)) sel.value = prev;
  }
  // Also populate per-part machine select in calculator
  const partSel = $('#partMachineId');
  if (partSel) {
    const prev2 = partSel.value;
    partSel.innerHTML = optionsHtml;
    if (prev2 && machines.find(m => m.id === prev2)) partSel.value = prev2;
  }
}

function openMachineEditor(machineId = null) {
  const existing = machineId ? machines.find(m => m.id === machineId) : null;
  const draft = existing
    ? { ...existing }
    : { id: uid('MACH'), name: '', color: MACHINE_COLORS[machines.length % MACHINE_COLORS.length] };

  openFormModal({
    title: existing ? t('mach.edit') : t('mach.add'),
    sizeLg: false,
    bodyHtml: `
      <label>${escapeHtml(t('mach.name'))}</label>
      <input type="text" id="machName" value="${escapeHtml(draft.name)}" placeholder="${escapeHtml(t('mach.name_ph'))}">
      <label style="margin-top:12px;">${escapeHtml(t('mach.color'))}</label>
      <div id="machColorPicker" style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        ${MACHINE_COLORS.map(c => `
          <label style="cursor:pointer;">
            <input type="radio" name="machColor" value="${c}" ${draft.color === c ? 'checked' : ''} style="display:none;">
            <span class="mach-color-swatch" style="background:${c};outline:${draft.color === c ? '3px solid #fff' : '3px solid transparent'};"></span>
          </label>`).join('')}
      </div>
      <div class="inline-pair" style="margin-top:14px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('mach.target_hours'))}</label>
          <input type="number" id="machTargetHours" value="${draft.targetHoursPerDay || ''}" min="0" step="0.5" placeholder="8">
        </div>
        <div style="padding-top:20px; font-size:11.5px; color:var(--text-muted);">${escapeHtml(t('mach.target_hours_hint'))}</div>
      </div>
      <div class="inline-pair" style="margin-top:14px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('mach.service_interval'))}</label>
          <input type="number" id="machServiceInterval" value="${draft.serviceInterval || ''}" min="0" step="1" placeholder="500">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('mach.last_service'))}</label>
          <input type="number" id="machLastServiceHours" value="${draft.lastServiceHours || ''}" min="0" step="0.1" placeholder="0">
        </div>
      </div>
      <label style="margin-top:14px;">${escapeHtml(t('mach.location'))}</label>
      <select id="machLocationId" style="margin-top:6px;">
        <option value="">— ${escapeHtml(t('an.unassigned_location'))} —</option>
        ${locations.map(l => `<option value="${escapeHtml(l.id)}"${draft.locationId === l.id ? ' selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
      </select>

      <label style="margin-top:16px; display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" id="machOffline" style="width:auto; margin:0;" ${draft.isOffline ? 'checked' : ''}>
        <span data-i18n="mach.mark_offline">${escapeHtml(t('mach.mark_offline'))}</span>
      </label>

      <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);">
        <label style="font-size:12.5px; font-weight:600; margin-bottom:8px;">${escapeHtml(t('mach.compat_materials'))}</label>
        <div id="machCompatMaterialsSection" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;"></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;">
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.nozzle_diameter'))}</label>
            <input type="number" id="machNozzleDiameter" value="${draft.nozzleDiameter || ''}" step="0.1" min="0.1" placeholder="0.4" style="font-size:12.5px;">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.extruder_type'))}</label>
            <input type="text" id="machExtruderType" value="${escapeHtml(draft.extruderType || '')}" placeholder="Bowden / Direct Drive" style="font-size:12.5px;">
          </div>
        </div>
      </div>

      <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border-soft);">
        <label style="font-size:12.5px; font-weight:600; margin:0 0 8px;">${escapeHtml(t('mach.nozzle'))}</label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px;">
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.nozzle_material'))}</label>
            <select id="machNozzleMaterial" style="font-size:12.5px;">
              <option value="brass"${(draft.nozzle?.material||'brass') === 'brass' ? ' selected' : ''}>${escapeHtml(t('mach.nozzle_brass'))}</option>
              <option value="hardened"${draft.nozzle?.material === 'hardened' ? ' selected' : ''}>${escapeHtml(t('mach.nozzle_hardened'))}</option>
              <option value="ruby"${draft.nozzle?.material === 'ruby' ? ' selected' : ''}>${escapeHtml(t('mach.nozzle_ruby'))}</option>
              <option value="stainless"${draft.nozzle?.material === 'stainless' ? ' selected' : ''}>Stainless</option>
              <option value="other"${draft.nozzle?.material === 'other' ? ' selected' : ''}>Other</option>
            </select>
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.nozzle_installed'))}</label>
            <input type="date" id="machNozzleInstalledAt" value="${escapeHtml(draft.nozzle?.installedAt || '')}" style="font-size:12.5px;">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.nozzle_threshold'))}</label>
            <input type="number" id="machNozzleGramsThreshold" value="${draft.nozzle?.gramsThreshold || 2000}" min="0" step="100" style="font-size:12.5px;">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml('Lifetime grams at install')}</label>
            <input type="number" id="machNozzleGramsAtInstall" value="${draft.nozzle?.gramsAtInstall || 0}" min="0" step="1" style="font-size:12.5px;">
          </div>
        </div>
      </div>

      <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <label style="margin:0; flex:1; font-size:12.5px; font-weight:600;">${escapeHtml(t('mach.downtime'))}</label>
          <button class="btn ghost small" id="btnAddDowntime" type="button">${escapeHtml(t('mach.downtime_add'))}</button>
        </div>
        <div id="downtimeBlocksList"></div>
      </div>

      <details style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);" class="pro-only">
        <summary style="cursor:pointer; font-size:12.5px; font-weight:600; color:var(--text-dim); user-select:none; padding:2px 0;">${escapeHtml(t('mach.api_live'))}</summary>
        <div style="margin-top:10px;">
          <label style="margin-top:0;">${escapeHtml(t('mach.api_type'))}</label>
          <select id="machApiType" style="font-size:12.5px;">
            <option value="none">${escapeHtml(t('common.none'))}</option>
            <option value="octoprint">OctoPrint</option>
            <option value="moonraker">Moonraker / Klipper</option>
            <option value="bambu">Bambu Lab (local network)</option>
            <option value="prusalink">PrusaLink (Prusa MK4 / XL / Mini+)</option>
            <option value="duet">Duet / RepRapFirmware</option>
            <option value="repetier">Repetier-Server</option>
          </select>
          <div id="machApiFields" style="display:none; margin-top:8px;">
            <div class="inline-pair">
              <div>
                <label style="margin-top:0;">${escapeHtml(t('mach.api_host'))}</label>
                <input id="machApiHost" placeholder="192.168.1.50" style="font-size:12.5px;" value="${escapeHtml(draft.printerApi?.host || '')}">
              </div>
              <div>
                <label style="margin-top:0;">${escapeHtml(t('mach.api_port'))}</label>
                <input id="machApiPort" type="number" placeholder="default" style="font-size:12.5px;" value="${draft.printerApi?.port || ''}">
              </div>
            </div>
            <label style="margin-top:8px;">${escapeHtml(t('mach.api_key'))}</label>
            <input id="machApiKey" type="password" placeholder="API key / token" style="font-size:12.5px;" value="${escapeHtml(secretInputValue(draft.printerApi?.apiKey))}" autocomplete="off">
            <label style="margin-top:8px;">Access code (Bambu)</label>
            <input id="machApiAccessCode" type="password" placeholder="Bambu access code" style="font-size:12.5px;" value="${escapeHtml(secretInputValue(draft.printerApi?.accessCode))}" autocomplete="off">
            <label style="margin-top:8px;">Printer slug (Repetier)</label>
            <input id="machApiSlug" placeholder="default" style="font-size:12.5px;" value="${escapeHtml(draft.printerApi?.printerSlug || '')}">
            <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
              <button type="button" id="btnTestApi" class="btn small">${escapeHtml(t('mach.api_test'))}</button>
              <span id="apiTestResult" style="font-size:12px;"></span>
            </div>
          </div>
        </div>
      </details>`,
    onMount(modal) {
      if (!draft.downtimeBlocks) draft.downtimeBlocks = [];
      if (!draft.compatMaterials) draft.compatMaterials = [];
      if (!draft.nozzle) draft.nozzle = { material: 'brass', installedAt: '', gramsThreshold: 2000, gramsAtInstall: 0 };
      if (!draft.printerApi) draft.printerApi = { type: 'none', host: '', port: '', apiKey: '', accessCode: '', printerSlug: '' };
      modal.querySelector('#machName').addEventListener('input', e => { draft.name = e.target.value; });

      // Feature 2 (new batch): Printer API section wiring
      const apiTypeSel = modal.querySelector('#machApiType');
      const apiFields  = modal.querySelector('#machApiFields');
      if (apiTypeSel) {
        apiTypeSel.value = draft.printerApi.type || 'none';
        const toggleApiFields = () => {
          if (apiFields) apiFields.style.display = apiTypeSel.value !== 'none' ? 'block' : 'none';
        };
        toggleApiFields();
        apiTypeSel.addEventListener('change', () => {
          draft.printerApi.type = apiTypeSel.value;
          toggleApiFields();
        });
      }
      modal.querySelector('#machApiHost')?.addEventListener('input', e => { draft.printerApi.host = e.target.value; });
      modal.querySelector('#machApiPort')?.addEventListener('input', e => { draft.printerApi.port = e.target.value ? parseInt(e.target.value) : null; });
      modal.querySelector('#machApiKey')?.addEventListener('input', e => { draft.printerApi.apiKey = e.target.value; });
      modal.querySelector('#machApiAccessCode')?.addEventListener('input', e => { draft.printerApi.accessCode = e.target.value; });
      modal.querySelector('#machApiSlug')?.addEventListener('input', e => { draft.printerApi.printerSlug = e.target.value; });
      modal.querySelector('#btnTestApi')?.addEventListener('click', async () => {
        const resultEl = modal.querySelector('#apiTestResult');
        if (resultEl) resultEl.textContent = '…testing';
        try {
          if (window.hubAPI?.startPrinterPolling) {
            const testMachine = { id: draft.id, printerApi: { ...draft.printerApi } };
            await window.hubAPI.startPrinterPolling([testMachine]);
            const cache = await window.hubAPI.getPrinterStatus();
            if (resultEl) {
              const s = cache[draft.id];
              if (s?.error) {
                resultEl.textContent = t('mach.api_fail') + ': ' + s.error;
                resultEl.style.color = 'var(--danger)';
              } else if (s) {
                resultEl.textContent = t('mach.api_ok') + ' — ' + (s.state || '');
                resultEl.style.color = 'var(--success)';
              }
            }
          }
        } catch(e) {
          if (resultEl) { resultEl.textContent = t('mach.api_fail'); resultEl.style.color = 'var(--danger)'; }
        }
      });

      // Compat materials checkboxes (Feature 3)
      const compatEl = modal.querySelector('#machCompatMaterialsSection');
      if (compatEl) {
        const COMMON_MATS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA/Nylon', 'PC', 'PVA', 'HIPS', 'Resin'];
        const allMats = [...new Set([...COMMON_MATS, ...inventory.map(i => i.material).filter(Boolean)])];
        compatEl.innerHTML = allMats.map(mat => {
          const checked = draft.compatMaterials.includes(mat);
          return `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;background:var(--surface-2);padding:3px 8px;border-radius:4px;border:1px solid ${checked ? 'var(--primary)' : 'var(--border)'};">
            <input type="checkbox" class="compat-mat-cb" data-mat="${escapeHtml(mat)}" style="width:auto;margin:0;" ${checked ? 'checked' : ''}>
            ${escapeHtml(mat)}
          </label>`;
        }).join('');
        compatEl.querySelectorAll('.compat-mat-cb').forEach(cb => {
          cb.addEventListener('change', () => {
            const m = cb.dataset.mat;
            if (cb.checked) { if (!draft.compatMaterials.includes(m)) draft.compatMaterials.push(m); }
            else { draft.compatMaterials = draft.compatMaterials.filter(x => x !== m); }
            cb.closest('label').style.borderColor = cb.checked ? 'var(--primary)' : 'var(--border)';
          });
        });
      }
      // Nozzle field listeners (Feature 4)
      modal.querySelector('#machNozzleDiameter')?.addEventListener('input', e => { draft.nozzleDiameter = parseFloat(e.target.value) || null; });
      modal.querySelector('#machExtruderType')?.addEventListener('input', e => { draft.extruderType = e.target.value; });
      modal.querySelector('#machNozzleMaterial')?.addEventListener('change', e => { draft.nozzle.material = e.target.value; });
      modal.querySelector('#machNozzleInstalledAt')?.addEventListener('change', e => { draft.nozzle.installedAt = e.target.value; });
      modal.querySelector('#machNozzleGramsThreshold')?.addEventListener('input', e => { draft.nozzle.gramsThreshold = parseFloat(e.target.value) || 2000; });
      modal.querySelector('#machNozzleGramsAtInstall')?.addEventListener('input', e => { draft.nozzle.gramsAtInstall = parseFloat(e.target.value) || 0; });
      modal.querySelectorAll('input[name="machColor"]').forEach(radio => {
        radio.addEventListener('change', () => {
          draft.color = radio.value;
          modal.querySelectorAll('.mach-color-swatch').forEach((s, i) => {
            s.style.outline = `3px solid ${MACHINE_COLORS[i] === draft.color ? '#fff' : 'transparent'}`;
          });
        });
      });
      modal.querySelector('#machOffline').addEventListener('change', e => { draft.isOffline = e.target.checked; });
      modal.querySelector('#machTargetHours').addEventListener('input', e => { draft.targetHoursPerDay = Math.max(0, +e.target.value || 0) || null; });
      modal.querySelector('#machServiceInterval').addEventListener('input', e => { draft.serviceInterval = parseFloat(e.target.value) || 0; });
      modal.querySelector('#machLastServiceHours').addEventListener('input', e => { draft.lastServiceHours = parseFloat(e.target.value) || 0; });

      // Downtime blocks
      function renderDowntimeList() {
        const el = modal.querySelector('#downtimeBlocksList');
        if (!el) return;
        if (!draft.downtimeBlocks || draft.downtimeBlocks.length === 0) {
          el.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;padding:4px 0;">${escapeHtml(t('mach.empty') || 'No downtime blocks.')}</div>`;
          return;
        }
        el.innerHTML = draft.downtimeBlocks.map((b, i) => `
          <div style="display:grid; grid-template-columns:1fr 1fr auto auto; gap:6px; align-items:center; margin-bottom:6px; font-size:12px;">
            <input type="datetime-local" class="dt-from" data-dti="${i}" value="${escapeHtml(b.from || '')}" style="font-size:11.5px;">
            <input type="datetime-local" class="dt-to" data-dti="${i}" value="${escapeHtml(b.to || '')}" style="font-size:11.5px;">
            <input type="text" class="dt-reason" data-dti="${i}" value="${escapeHtml(b.reason || '')}" placeholder="${escapeHtml(t('mach.downtime_reason'))}" style="font-size:11.5px; min-width:80px;">
            <button class="btn danger small dt-rm" data-dti="${i}">×</button>
          </div>`).join('');
        el.querySelectorAll('.dt-from').forEach(inp => { inp.addEventListener('change', () => { draft.downtimeBlocks[+inp.dataset.dti].from = inp.value; }); });
        el.querySelectorAll('.dt-to').forEach(inp => { inp.addEventListener('change', () => { draft.downtimeBlocks[+inp.dataset.dti].to = inp.value; }); });
        el.querySelectorAll('.dt-reason').forEach(inp => { inp.addEventListener('input', () => { draft.downtimeBlocks[+inp.dataset.dti].reason = inp.value; }); });
        el.querySelectorAll('.dt-rm').forEach(btn => {
          btn.addEventListener('click', () => { draft.downtimeBlocks.splice(+btn.dataset.dti, 1); renderDowntimeList(); });
        });
      }
      renderDowntimeList();
      modal.querySelector('#btnAddDowntime').addEventListener('click', () => {
        if (!draft.downtimeBlocks) draft.downtimeBlocks = [];
        draft.downtimeBlocks.push({ id: uid('DT'), from: '', to: '', reason: '' });
        renderDowntimeList();
      });
    },
    async onSave() {
      if (!draft.name.trim()) { toast(t('mach.need_name'), 'error'); return false; }
      draft.downtimeBlocks = (draft.downtimeBlocks || []).filter(b => b.from && b.to);
      // Feature 2 (new batch): Persist printer API config from modal
      const apiTypeFinal = document.getElementById('machApiType');
      if (apiTypeFinal) {
        draft.printerApi = {
          type:         apiTypeFinal.value || 'none',
          host:         document.getElementById('machApiHost')?.value.trim() || '',
          port:         document.getElementById('machApiPort')?.value ? parseInt(document.getElementById('machApiPort').value) : null,
          apiKey:       secretInputSave(draft.printerApi?.apiKey, document.getElementById('machApiKey')?.value),
          accessCode:   document.getElementById('machApiAccessCode')?.value.trim() || '',
          printerSlug:  document.getElementById('machApiSlug')?.value.trim() || '',
        };
      }
      // Persist nozzle/compat fields from form (Feature 3 & 4)
      const nozzleDiamEl = document.getElementById('machNozzleDiameter');
      if (nozzleDiamEl) draft.nozzleDiameter = parseFloat(nozzleDiamEl.value) || null;
      const extruderTypeEl = document.getElementById('machExtruderType');
      if (extruderTypeEl) draft.extruderType = extruderTypeEl.value.trim() || null;
      const nozzleMatEl = document.getElementById('machNozzleMaterial');
      const nozzleInstEl = document.getElementById('machNozzleInstalledAt');
      const nozzleThreshEl = document.getElementById('machNozzleGramsThreshold');
      const nozzleAtInstEl = document.getElementById('machNozzleGramsAtInstall');
      if (nozzleMatEl) {
        draft.nozzle = {
          material: nozzleMatEl.value || 'brass',
          installedAt: nozzleInstEl?.value || '',
          gramsThreshold: parseFloat(nozzleThreshEl?.value) || 2000,
          gramsAtInstall: parseFloat(nozzleAtInstEl?.value) || 0,
        };
      }
      // Persist locationId
      const machLocEl = document.getElementById('machLocationId');
      if (machLocEl) draft.locationId = machLocEl.value || '';
      const idx = machines.findIndex(m => m.id === draft.id);
      if (idx >= 0) machines[idx] = draft;
      else machines.push(draft);
      saveAll();
      renderMachines();
      renderMachineDropdown();
      toast(t('mach.saved'), 'success');
      return true;
    }
  });
}

function logNozzleChange(machineId) {
  const machine = machines.find(m => m.id === machineId);
  if (!machine) return;
  const totalGrams = machineGramsSinceNozzle(machine);
  openFormModal({
    title: `${machine.name} — ${t('mach.log_nozzle')}`,
    sizeLg: false,
    saveLabel: t('common.save'),
    bodyHtml: `
      <label>${escapeHtml(t('mach.nozzle_material'))}</label>
      <select id="nlNozzleMat" style="margin-bottom:10px;">
        <option value="brass">${escapeHtml(t('mach.nozzle_brass'))}</option>
        <option value="hardened">${escapeHtml(t('mach.nozzle_hardened'))}</option>
        <option value="ruby">${escapeHtml(t('mach.nozzle_ruby'))}</option>
        <option value="stainless">Stainless</option>
        <option value="other">Other</option>
      </select>
      <label>${escapeHtml(t('mach.nozzle_installed'))}</label>
      <input type="date" id="nlInstalledAt" value="${new Date().toISOString().split('T')[0]}">
      <label style="margin-top:10px;">${escapeHtml(t('mach.nozzle_threshold'))}</label>
      <input type="number" id="nlThreshold" value="${machine.nozzle?.gramsThreshold || 2000}" min="0" step="100">
      <p style="font-size:12px;color:var(--text-muted);margin-top:8px;">
        Lifetime grams at install: <strong>${totalGrams.toFixed(0)}g</strong>
      </p>`,
    async onSave(modal) {
      const mat       = modal.querySelector('#nlNozzleMat').value;
      const installed = modal.querySelector('#nlInstalledAt').value;
      const threshold = parseFloat(modal.querySelector('#nlThreshold').value) || 2000;
      const idx = machines.findIndex(m => m.id === machineId);
      if (idx < 0) return false;
      machines[idx].nozzle = {
        material: mat,
        installedAt: installed,
        gramsThreshold: threshold,
        gramsAtInstall: totalGrams,
      };
      saveAll();
      renderMachines();
      toast(t('mach.nozzle_done'), 'success');
      return true;
    }
  });
}

async function deleteMachine(machineId) {
  const inUse = printLog.some(o => o.machineId === machineId && o.status !== 'completed');
  const msg = inUse ? t('mach.delete_active_q') : t('mach.delete_q');
  const ok = await confirmModal(msg, { danger: true });
  if (!ok) return;
  machines = machines.filter(m => m.id !== machineId);
  saveAll();
  renderMachines();
  renderMachineDropdown();
}

/* ============================================================
   Printer Maintenance Log
   ============================================================ */
function openMaintLog(machineId) {
  const machine = machines.find(m => m.id === machineId);
  if (!machine) return;

  const getEntries = () => machMaintLog.filter(e => e.machineId === machineId)
    .sort((a, b) => b.date.localeCompare(a.date));

  function listHtml() {
    const list = getEntries();
    if (list.length === 0)
      return `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px 0;">${escapeHtml(t('maint.empty'))}</p>`;
    return `<div class="table-wrap"><table>
      <thead><tr>
        <th>${escapeHtml(t('maint.date'))}</th>
        <th>${escapeHtml(t('maint.note'))}</th>
        <th>${escapeHtml(t('maint.cost'))}</th>
        <th></th>
      </tr></thead>
      <tbody>${list.map(e => `
        <tr>
          <td style="white-space:nowrap;">${escapeHtml(e.date)}</td>
          <td>${escapeHtml(e.note || '')}</td>
          <td style="white-space:nowrap;">${e.cost > 0 ? fmtPrice(e.cost) : '—'}</td>
          <td><button class="btn danger small" data-act="del-maint" data-id="${e.id}">×</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }

  openFormModal({
    title: `${machine.name} — ${t('maint.title')}`,
    noSave: true,
    sizeLg: true,
    bodyHtml: `
      <div style="background:var(--surface-2);padding:14px;border-radius:var(--radius);margin-bottom:14px;">
        <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px;align-items:end;">
          <div>
            <label style="margin:0;">${escapeHtml(t('maint.date'))}</label>
            <input type="date" id="maintDate" value="${new Date().toISOString().split('T')[0]}" max="${new Date().toISOString().split('T')[0]}">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('maint.note'))}</label>
            <input type="text" id="maintNote" placeholder="${escapeHtml(t('maint.note_ph'))}">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('maint.cost'))} (${currencySymbol()})</label>
            <input type="number" id="maintCost" value="0" min="0" step="0.01">
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-size:12.5px;">
            <input type="checkbox" id="maintAddExpense" style="width:auto;margin:0;">
            <span>${escapeHtml(t('maint.expense_q'))}</span>
          </label>
          <button class="btn primary small" id="btnAddMaintEntry">${escapeHtml(t('maint.add'))}</button>
        </div>
      </div>
      <div id="maintEntriesList">${listHtml()}</div>`,
    onMount(modal) {
      const refresh = () => {
        const el = modal.querySelector('#maintEntriesList');
        if (el) el.innerHTML = listHtml();
      };
      modal.querySelector('#btnAddMaintEntry').addEventListener('click', () => {
        const date  = modal.querySelector('#maintDate').value || new Date().toISOString().split('T')[0];
        const note  = modal.querySelector('#maintNote').value.trim();
        const cost  = Math.max(0, +(modal.querySelector('#maintCost').value) || 0);
        const addExp = modal.querySelector('#maintAddExpense').checked;
        if (!note) { toast(t('maint.need_note'), 'error'); return; }
        machMaintLog.unshift({ id: uid('MAINT'), machineId, date, note, cost });
        if (addExp && cost > 0) {
          expenses.unshift({ id: uid('EXP'), date, category: 'maintenance', amount: cost,
            note: `${machine.name}: ${note}` });
        }
        saveAll();
        modal.querySelector('#maintNote').value  = '';
        modal.querySelector('#maintCost').value  = '0';
        modal.querySelector('#maintAddExpense').checked = false;
        refresh();
        toast(t('maint.saved'), 'success');
      });
      modal.querySelector('#maintEntriesList').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act="del-maint"]');
        if (!btn) return;
        const ok = await confirmModal(t('common.delete') + '?', { danger: true });
        if (!ok) return;
        machMaintLog = machMaintLog.filter(e => e.id !== btn.dataset.id);
        saveAll();
        refresh();
        toast(t('maint.deleted'), 'success');
      });
    }
  });
}

/* ============================================================
   Machine hour meter + service status (Feature 1)
   ============================================================ */
function machineHoursMeter(machineId) {
  return printLog
    .filter(o => o.machineId === machineId && o.status === 'completed')
    .reduce((s, o) => s + (+o.printTime || 0), 0);
}

function machineServiceStatus(machine) {
  const totalHours = machineHoursMeter(machine.id);
  const hoursSinceService = totalHours - (machine.lastServiceHours || 0);
  if (machine.serviceInterval > 0) {
    if (hoursSinceService >= machine.serviceInterval) {
      return { due: true, hours: hoursSinceService, interval: machine.serviceInterval, total: totalHours };
    }
    if (hoursSinceService >= machine.serviceInterval * 0.9) {
      return { warning: true, hours: hoursSinceService, interval: machine.serviceInterval, total: totalHours };
    }
  }
  return { ok: true, hours: hoursSinceService, interval: machine.serviceInterval || 0, total: totalHours };
}

function logMachineService(machineId) {
  const machine = machines.find(m => m.id === machineId);
  if (!machine) return;
  openFormModal({
    title: `${t('mach.log_service')} — ${escapeHtml(machine.name)}`,
    sizeLg: false,
    saveLabel: t('mach.log_service'),
    bodyHtml: `
      <label>${escapeHtml(t('mach.service_note'))}</label>
      <input type="text" id="svcNoteInput" placeholder="${escapeHtml(t('maint.note_ph'))}">
      <p style="font-size:12px; color:var(--text-muted); margin:8px 0 0;">
        ${escapeHtml(t('mach.hours_total'))}: <strong>${machineHoursMeter(machineId).toFixed(1)}h</strong>
      </p>`,
    onMount(modal) { setTimeout(() => modal.querySelector('#svcNoteInput')?.focus(), 40); },
    async onSave(modal) {
      const note = modal.querySelector('#svcNoteInput').value.trim();
      const totalHrs = machineHoursMeter(machineId);
      machine.lastServiceHours = totalHrs;
      const today = new Date().toISOString().split('T')[0];
      machMaintLog.unshift({ id: uid('MAINT'), machineId, date: today, note: note || t('mach.log_service'), cost: 0 });
      saveAll();
      renderMachines();
      renderDashboard();
      toast(t('mach.service_done'), 'success');
      return true;
    }
  });
}

/* ============================================================
   WhatsApp Quick-Reply Templates
   ============================================================ */
function renderWaTemplates() {
  const el = $('#waTemplatesList');
  if (!el) return;
  if (waTemplates.length === 0) {
    el.innerHTML = `<p class="empty-state" style="padding:8px 0; font-size:13px;">${escapeHtml(t('wa.no_templates_hint'))}</p>`;
    return;
  }
  el.innerHTML = waTemplates.map(tpl => `
    <div class="wa-tpl-row">
      <div class="wa-tpl-info">
        <span class="wa-tpl-name">${escapeHtml(tpl.name)}</span>
        <span class="wa-tpl-preview">${escapeHtml(tpl.body.slice(0, 70))}${tpl.body.length > 70 ? '…' : ''}</span>
      </div>
      <div class="wa-tpl-actions">
        <button class="btn small" data-act="edit-wa-tpl" data-id="${tpl.id}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn danger small" data-act="del-wa-tpl" data-id="${tpl.id}">${escapeHtml(t('common.delete'))}</button>
      </div>
    </div>`).join('');
}

function openWaTemplateEditor(tplId = null) {
  const existing = tplId ? waTemplates.find(x => x.id === tplId) : null;
  const draft = existing ? { ...existing } : { id: uid('WATPL'), name: '', body: '' };
  const bodyHtml = `
    <label>${escapeHtml(t('wa.tpl_name'))}</label>
    <input type="text" id="waTplName" value="${escapeHtml(draft.name)}" placeholder="${escapeHtml(t('wa.tpl_name_ph'))}">
    <label style="margin-top:10px;">${escapeHtml(t('wa.tpl_body'))}</label>
    <textarea id="waTplBody" rows="5" style="resize:vertical;">${escapeHtml(draft.body)}</textarea>
    <p style="font-size:11.5px; color:var(--text-muted); margin:6px 0 0;" data-i18n="wa.tpl_hint"></p>
    <p style="font-size:11px; color:var(--text-muted); margin:2px 0 0; font-family:monospace;">{{client}} · {{id}} · {{price}} · {{due}} · {{status}}</p>
  `;
  openFormModal({
    title: existing ? t('wa.edit_tpl') : t('wa.new_tpl'),
    saveLabel: t('common.save'),
    bodyHtml,
    async onSave(modal) {
      draft.name = modal.querySelector('#waTplName').value.trim();
      draft.body = modal.querySelector('#waTplBody').value.trim();
      if (!draft.name) { toast(t('wa.tpl_need_name'), 'error'); return false; }
      if (!draft.body) { toast(t('wa.tpl_need_body'), 'error'); return false; }
      const idx = waTemplates.findIndex(x => x.id === draft.id);
      if (idx >= 0) waTemplates[idx] = draft; else waTemplates.push(draft);
      saveAll();
      renderWaTemplates();
      toast(t('wa.tpl_saved'), 'success');
      return true;
    }
  });
}

async function deleteWaTemplate(tplId) {
  const ok = await confirmModal(t('common.delete') + '?', { danger: true });
  if (!ok) return;
  waTemplates = waTemplates.filter(x => x.id !== tplId);
  saveAll();
  renderWaTemplates();
}

function openWaSendModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  if (waTemplates.length === 0) { toast(t('wa.no_templates'), 'info'); return; }
  const tplOptions = waTemplates.map((tpl, i) =>
    `<option value="${i}">${escapeHtml(tpl.name)}</option>`).join('');
  const bodyHtml = `
    <div style="margin-bottom:10px;">
      <label>${escapeHtml(t('wa.phone'))}</label>
      <input type="tel" id="waSendPhone" value="${escapeHtml(client?.phone || '')}" placeholder="+966 5x xxx xxxx">
    </div>
    <label>${escapeHtml(t('wa.template'))}</label>
    <select id="waTplSelect">${tplOptions}</select>
    <label style="margin-top:12px;">${escapeHtml(t('wa.preview'))}</label>
    <textarea id="waMsgPreview" rows="5" style="resize:vertical; font-size:12.5px;" readonly></textarea>
  `;
  openFormModal({
    title: t('wa.send_title'),
    saveLabel: t('wa.open_btn'),
    bodyHtml,
    onMount(modal) {
      const sel     = modal.querySelector('#waTplSelect');
      const preview = modal.querySelector('#waMsgPreview');
      const update  = () => {
        const tpl = waTemplates[+sel.value];
        if (tpl) preview.value = fillWaTemplate(tpl.body, order, client);
      };
      sel.addEventListener('change', update);
      update();
    },
    async onSave(modal) {
      const phone = modal.querySelector('#waSendPhone').value.trim();
      const msg   = modal.querySelector('#waMsgPreview').value;
      if (window.hubAPI?.shareWhatsApp) {
        await window.hubAPI.shareWhatsApp({ phone, message: msg, pdfPath: null });
      }
      return true;
    }
  });
}

function estimateMachineQueueClearDate(machineId, excludeOrderId) {
  const wh = settings.workingHours || { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0, sat: 0, sun: 0 };
  const holidays = settings.holidays || [];
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  // Sum queued print hours for this machine (active/pending orders)
  let queueHours = 0;
  for (const o of printLog) {
    if (o.id === excludeOrderId) continue;
    if (o.status === 'completed' || o.status === 'quote') continue;
    if (o.machineId !== machineId) continue;
    const hrs = +(o.printTime || 0);
    queueHours += hrs;
  }
  if (queueHours <= 0) return new Date();

  // Walk forward through working hours until queue is consumed
  const cursor = new Date();
  cursor.setSeconds(0, 0);
  let remaining = queueHours;
  let safety = 0;
  while (remaining > 0 && safety < 730) { // max 2 years
    safety++;
    const dateStr = cursor.toISOString().split('T')[0];
    if (!holidays.includes(dateStr)) {
      const dayKey = dayKeys[cursor.getDay()];
      const hoursAvail = +(wh[dayKey] || 0);
      if (hoursAvail > 0) {
        remaining -= hoursAvail;
      }
    }
    if (remaining > 0) cursor.setDate(cursor.getDate() + 1);
  }
  return cursor;
}

  const api = {
    machineGramsSinceNozzle,
    renderMachines,
    renderMachineDropdown,
    openMachineEditor,
    logNozzleChange,
    deleteMachine,
    openMaintLog,
    machineHoursMeter,
    machineServiceStatus,
    logMachineService,
    renderWaTemplates,
    openWaTemplateEditor,
    deleteWaTemplate,
    openWaSendModal,
    estimateMachineQueueClearDate,
  };

  Object.assign(global, api);
  global.KhaytMachines = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
