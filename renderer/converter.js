'use strict';
/*
 * 3MF Converter UI (3.1 / 3.2) — retarget a 3MF to a different printer (re-profile +
 * optional colour→slot remap) or normalize it to a clean generic 3MF. Entry points:
 *   • a "Convert" action on a print-file library card (renderer/printfiles.js),
 *   • a standalone "Converter" tab (single file, batch, and a custom-printer manager).
 *
 * 3.2 additions: a rich pre-convert summary (source printer / bed / nozzle / material /
 * print time / model footprint) with a live "what changes" diff and a bed-fit check;
 * user-defined printers (settings.customPrinters[]) offered everywhere; and batch
 * conversion of many files to one target in a single run.
 *
 * The heavy lifting is in the main process (hub:mf-analyze / hub:mf-convert over
 * lib/mf-convert.js); this module is the picker + options + result. Geometry is never
 * touched by the engine, so a conversion is safe by construction.
 */
(function (global) {
  const hub = () => (typeof window !== 'undefined' && window.hubAPI) || null;
  const profiles = () => global.KhaytPrinterProfiles;
  // Bed Ready keeps headings plain (no leading emoji) to match its monoline chrome.
  const _titleIco = (typeof document !== 'undefined' && document.documentElement.dataset.app === 'bedready') ? '' : '🔄 ';

  function customPrinters() {
    return (typeof settings !== 'undefined' && Array.isArray(settings.customPrinters)) ? settings.customPrinters : [];
  }
  // All selectable targets: user printers first, then the built-in registry, then Generic.
  function getProfileById(id) {
    const c = customPrinters().find((p) => p.id === id);
    if (c) return c;
    const P = profiles();
    return P ? P.getProfile(id) : null;
  }
  function firstTargetId() {
    const c = customPrinters();
    if (c.length) return c[0].id;
    const P = profiles();
    return P ? (P.listProfiles()[0] || {}).id : '';
  }
  function isCustomId(id) { return customPrinters().some((p) => p.id === id); }

  function swatch(hex, size) {
    const s = size || 16;
    return `<span class="cs-swatch" style="background:${safeCssColor(hex, '#888')};width:${s}px;height:${s}px;"></span>`;
  }
  function fmtBed(b) { return b ? `${b.x}×${b.y} mm` : null; }
  function fmtVol(b) { return b ? `${b.x}×${b.y}×${b.z} mm` : null; }
  function fmtTime(min) { if (!min) return null; const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${m}m` : `${m}m`; }

  // A retarget only makes sense within one slicer config family. When we know the source
  // flavour, offer only compatible printers (+ Generic) so an incoherent cross-ecosystem
  // conversion can't be picked; for an unknown source, only Generic is meaningful.
  function compatibleWith(sourceFlavour, p) {
    const P = profiles();
    if (!p || !P || !P.configFamily) return true;
    if (P.configFamily(p.flavour) === 'generic') return true; // Generic normalize is always valid
    if (!sourceFlavour || sourceFlavour === 'generic') return true;
    return P.configFamily(p.flavour) === P.configFamily(sourceFlavour);
  }

  /* ---------------- Conversion presets ---------------- */
  function convPresets() { return (typeof settings !== 'undefined' && Array.isArray(settings.convPresets)) ? settings.convPresets : []; }
  function savePreset(name, tId, slotMap) {
    if (typeof settings === 'undefined') return;
    if (!Array.isArray(settings.convPresets)) settings.convPresets = [];
    settings.convPresets.push({
      id: typeof uid === 'function' ? uid('cvp') : ('cvp' + Date.now().toString(36)),
      name: String(name).slice(0, 40), targetId: tId, slotMap: Array.isArray(slotMap) ? slotMap : null,
    });
    if (typeof saveAll === 'function') saveAll();
  }
  function removePreset(id) {
    if (typeof settings === 'undefined' || !Array.isArray(settings.convPresets)) return;
    settings.convPresets = settings.convPresets.filter((p) => p.id !== id);
    if (typeof saveAll === 'function') saveAll();
    renderConverter();
  }
  function presetOptions(sourceFlavour) {
    return convPresets().filter((p) => compatibleWith(sourceFlavour, getProfileById(p.targetId)))
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  }
  function firstCompatibleId(sourceFlavour) {
    const P = profiles();
    const all = [...customPrinters(), ...(P ? P.listProfiles() : [])];
    const hit = all.find((p) => compatibleWith(sourceFlavour, p));
    return hit ? hit.id : (P ? P.GENERIC.id : '');
  }

  function targetOptions(selectedId, sourceFlavour) {
    const P = profiles();
    if (!P) return '';
    const opt = (p) => `<option value="${escapeHtml(p.id)}"${p.id === selectedId ? ' selected' : ''}>${escapeHtml(p.name)}${p.system ? ' · ' + escapeHtml(p.system) : ''}</option>`;
    let html = '';
    const custom = customPrinters().filter((p) => compatibleWith(sourceFlavour, p));
    if (custom.length) html += `<optgroup label="${escapeHtml(t('conv.my_printers') || 'My printers')}">${custom.map(opt).join('')}</optgroup>`;
    const byVendor = {};
    for (const p of P.listProfiles()) { if (compatibleWith(sourceFlavour, p)) (byVendor[p.vendor] = byVendor[p.vendor] || []).push(p); }
    html += Object.keys(byVendor).map((vendor) =>
      `<optgroup label="${escapeHtml(vendor)}">${byVendor[vendor].map(opt).join('')}</optgroup>`).join('');
    const g = P.GENERIC;
    html += `<optgroup label="${escapeHtml(t('conv.other') || 'Other')}"><option value="${escapeHtml(g.id)}"${g.id === selectedId ? ' selected' : ''}>${escapeHtml(t('conv.normalize_opt') || 'Generic 3MF (strip vendor lock)')}</option></optgroup>`;
    return html;
  }

  // Nearest filament you actually have in stock for a target colour (helps you know which
  // spool to load into each slot). Uses the shared colour-maths + inventory colour matcher.
  function nearestStock(hex) {
    const stock = (typeof inventory !== 'undefined' ? inventory : []).filter((i) => i && i.color && (i.weight || 0) > 0);
    if (!stock.length || typeof KhaytColor === 'undefined' || !KhaytColor.nearest) return null;
    return KhaytColor.nearest(hex, stock)[0] || null;
  }
  function stockHintHtml(hex) {
    const n = nearestStock(hex);
    if (!n) return '';
    const label = ((n.material || '') + (n.colourVariant ? ' · ' + n.colourVariant : '')).trim() || (t('conv.near_generic') || 'in stock');
    return `<span class="conv-near" title="${escapeHtml(t('conv.near_stock') || 'Nearest filament you have in stock')}">≈ ${escapeHtml(label)} <span class="conv-de">ΔE ${Math.round(n.deltaE)}</span></span>`;
  }

  // Remap table: one row per source colour → a target-slot number select (identity default).
  function remapTableHtml(filaments, maxColors) {
    if (!filaments || !filaments.length) return `<p class="conv-note">${escapeHtml(t('conv.no_colours') || 'No colours detected — geometry and settings are retargeted as-is.')}</p>`;
    const slots = Math.max(maxColors || filaments.length, filaments.length);
    const rows = filaments.map((f, i) => `
      <div class="conv-remap-row">
        ${swatch(f.color, 20)} <span class="conv-hex">${escapeHtml(String(f.color).toUpperCase())}</span>
        ${f.grams != null ? `<span class="conv-grams">${escapeHtml(String(f.grams))} g</span>` : ''}
        <span class="conv-arrow">→</span>
        <select class="conv-slot" data-i="${i}">
          ${Array.from({ length: slots }, (_, s) => `<option value="${s}"${s === i ? ' selected' : ''}>${t('conv.slot') || 'Slot'} ${s + 1}</option>`).join('')}
        </select>
        ${stockHintHtml(f.color)}
      </div>`).join('');
    return `<div class="conv-remap"><div class="conv-remap-head">${escapeHtml(t('conv.remap_hint') || 'Map each source colour to a slot on the target printer:')}</div>${rows}</div>`;
  }

  // Rich source summary from an analyze() result.
  function metaCardHtml(src, a) {
    const m = a.meta || {};
    const chip = (label, val) => val ? `<div class="conv-stat"><span class="cs-k">${escapeHtml(label)}</span><span class="cs-v">${escapeHtml(String(val))}</span></div>` : '';
    const stats = [
      chip(t('conv.src_printer') || 'Printer', m.printerModel),
      chip(t('conv.src_size') || 'Model size', fmtVol(a.bounds)),
      chip(t('conv.src_material') || 'Material', m.totalGrams ? m.totalGrams + ' g' : null),
      chip(t('conv.src_time') || 'Print time', fmtTime(m.printMinutes)),
      chip(t('conv.src_nozzle') || 'Nozzle', m.nozzle ? m.nozzle + ' mm' : null),
      chip(t('conv.src_layer') || 'Layer', m.layerHeight ? m.layerHeight + ' mm' : null),
    ].join('');
    const cols = (a.filaments || []).length
      ? `<div class="conv-src-cols">${a.filaments.map((f) => swatch(f.color, 18)).join('')}<span class="conv-src-coln">${a.filaments.length} ${escapeHtml(t('conv.colours') || 'colours')}</span></div>`
      : '';
    return `
      <div class="conv-src">
        <div class="conv-src-name">📦 ${escapeHtml(src.name || 'model.3mf')}</div>
        <div class="conv-src-meta">${escapeHtml((t('conv.detected') || 'Detected') + ': ' + a.flavour)}</div>
        ${stats ? `<div class="conv-stats">${stats}</div>` : ''}
        ${cols}
      </div>`;
  }

  // Live "what changes" diff for the currently-selected target.
  function changesHtml(a, targetId) {
    const P = profiles();
    const target = getProfileById(targetId) || (P && P.GENERIC);
    if (!target) return '';
    const isGeneric = P && targetId === P.GENERIC.id;
    if (isGeneric) return `<div class="conv-changes"><div class="conv-changes-h">${escapeHtml(t('conv.changes') || 'What changes')}</div><p class="conv-note">${escapeHtml(t('conv.normalize_note') || 'Vendor-locked slicer settings are stripped; geometry and colours are kept. Opens cleanly in any slicer.')}</p></div>`;
    const m = a.meta || {};
    const row = (k, from, to, badge) => `<div class="conv-chg-row"><span class="conv-chg-k">${escapeHtml(k)}</span><span class="conv-chg-from">${escapeHtml(from || '—')}</span><span class="conv-arrow">→</span><span class="conv-chg-to">${escapeHtml(to || '—')}</span>${badge || ''}</div>`;
    // Bed-fit badge from the model footprint vs the target bed.
    let bedBadge = '';
    if (a.bounds && target.bed) {
      const b = target.bed, bb = a.bounds;
      const noFit = bb.x > b.x + 1 || bb.y > b.y + 1 || (b.z && bb.z > b.z + 1);
      bedBadge = noFit
        ? `<span class="conv-fit no">⚠ ${escapeHtml(t('conv.fit_no') || 'May not fit')}</span>`
        : `<span class="conv-fit ok">✓ ${escapeHtml(t('conv.fit_ok') || 'Fits')}</span>`;
    }
    const used = (a.filaments || []).length;
    let colBadge = '';
    if (target.maxColors && used > target.maxColors) colBadge = `<span class="conv-fit no">⚠ ${escapeHtml((t('conv.over_slots') || '{n} over').replace('{n}', used - target.maxColors))}</span>`;
    const rows = [
      row(t('conv.chg_printer') || 'Printer', m.printerModel, target.name),
      row(t('conv.chg_bed') || 'Bed', fmtBed(m.bed), fmtBed(target.bed), bedBadge),
      row(t('conv.chg_nozzle') || 'Nozzle', m.nozzle ? m.nozzle + ' mm' : null, target.nozzle ? target.nozzle + ' mm' : null),
      row(t('conv.chg_colours') || 'Colours', used ? String(used) : null, (t('conv.chg_slots') || '{n} slots').replace('{n}', target.maxColors || '—'), colBadge),
    ].join('');
    return `<div class="conv-changes"><div class="conv-changes-h">${escapeHtml(t('conv.changes') || 'What changes')}</div>${rows}</div>`;
  }

  async function openConverter(src) {
    const h = hub();
    if (!h || !h.mfAnalyze) { toast(t('conv.desktop_only') || 'The converter is available in the desktop app.', 'error'); return; }
    toast(t('conv.analyzing') || 'Analyzing 3MF…', 'info', 1400);
    let a;
    try { a = await h.mfAnalyze(src.path); } catch (e) { toast(String((e && e.message) || e), 'error'); return; }
    if (!a || !a.ok) { toast((a && a.error) || (t('conv.analyze_failed') || 'Could not read that 3MF.'), 'error'); return; }

    const P = profiles();
    const filaments = a.filaments || [];
    let targetId = firstCompatibleId(a.flavour);

    function currentMax(id) { const p = getProfileById(id); return p ? p.maxColors : filaments.length; }

    const crossNote = (a.flavour && a.flavour !== 'generic')
      ? `<p class="conv-tip">${escapeHtml((t('conv.family_note') || 'Showing printers compatible with this {f} file. To target another ecosystem, convert to Generic 3MF and set up the printer in your slicer.').replace('{f}', a.flavour))}</p>`
      : '';

    const body = `
      ${metaCardHtml(src, a)}
      <label class="conv-label">${escapeHtml(t('conv.target') || 'Target printer')}</label>
      <select id="convTarget" class="conv-target">${targetOptions(targetId, a.flavour)}</select>
      ${crossNote}
      <div class="conv-presets">
        <select id="convPresetApply" class="conv-target"><option value="">${escapeHtml(t('conv.preset_apply') || 'Apply a preset…')}</option>${presetOptions(a.flavour)}</select>
        <input id="convPresetName" class="conv-preset-name" type="text" maxlength="40" placeholder="${escapeHtml(t('conv.preset_name') || 'Preset name')}">
        <button type="button" class="btn small ghost" id="convPresetSave">★ ${escapeHtml(t('conv.preset_save') || 'Save')}</button>
      </div>
      <div id="convChanges">${changesHtml(a, targetId)}</div>
      <div id="convRemapWrap">${remapTableHtml(filaments, currentMax(targetId))}</div>
      <div class="conv-dest">
        <div class="conv-dest-q">${escapeHtml(t('conv.dest_q') || 'Where should the converted file go?')}</div>
        <label class="conv-dest-opt"><input type="radio" name="convDest" value="library" checked> ${escapeHtml(src.recordId ? (t('conv.dest_this') || 'Keep it with this print file') : (t('conv.dest_new') || 'Add it to my Print-File library'))}</label>
        <label class="conv-dest-opt"><input type="radio" name="convDest" value="folder"> ${escapeHtml(t('conv.dest_folder') || 'Save to a folder…')}</label>
      </div>`;

    openFormModal({
      title: `${_titleIco}${t('conv.title') || 'Convert 3MF'}`,
      bodyHtml: body,
      saveLabel: t('conv.convert') || 'Convert & save…',
      onMount(modal) {
        const sel = modal.querySelector('#convTarget');
        const wrap = modal.querySelector('#convRemapWrap');
        const chg = modal.querySelector('#convChanges');
        const renderForTarget = () => {
          const isGeneric = P && targetId === P.GENERIC.id;
          if (chg) chg.innerHTML = changesHtml(a, targetId);
          wrap.innerHTML = isGeneric
            ? `<p class="conv-note">${escapeHtml(t('conv.normalize_note') || 'Vendor-locked slicer settings are stripped; geometry and colours are kept. Opens cleanly in any slicer.')}</p>`
            : remapTableHtml(filaments, currentMax(targetId));
          return isGeneric;
        };
        if (sel) sel.onchange = () => { targetId = sel.value; renderForTarget(); };

        // Apply a saved preset: set the target and, when the slot map fits this file's colours, the mapping.
        const applySel = modal.querySelector('#convPresetApply');
        if (applySel) applySel.onchange = () => {
          const preset = convPresets().find((p) => p.id === applySel.value);
          applySel.value = '';
          if (!preset) return;
          targetId = preset.targetId;
          if (sel) sel.value = targetId;
          const isGeneric = renderForTarget();
          if (!isGeneric && Array.isArray(preset.slotMap) && preset.slotMap.length === filaments.length) {
            Array.from(wrap.querySelectorAll('.conv-slot')).forEach((s, i) => { if (preset.slotMap[i] != null) s.value = String(preset.slotMap[i]); });
          }
        };

        // Save the current target + slot mapping as a reusable preset.
        const saveBtn = modal.querySelector('#convPresetSave');
        if (saveBtn) saveBtn.onclick = () => {
          const nameEl = modal.querySelector('#convPresetName');
          const name = ((nameEl && nameEl.value) || '').trim();
          if (!name) { toast(t('conv.preset_name_req') || 'Name the preset first.', 'warning'); if (nameEl) nameEl.focus(); return; }
          let slotMap = null;
          if (!(P && targetId === P.GENERIC.id)) {
            const sm = Array.from(modal.querySelectorAll('.conv-slot')).map((s) => parseInt(s.value, 10) || 0);
            if (sm.length && !sm.every((v, i) => v === i)) slotMap = sm;
          }
          savePreset(name, targetId, slotMap);
          if (nameEl) nameEl.value = '';
          if (applySel) applySel.innerHTML = `<option value="">${escapeHtml(t('conv.preset_apply') || 'Apply a preset…')}</option>` + presetOptions(a.flavour);
          toast(t('conv.preset_saved') || 'Preset saved.', 'success');
        };
      },
      async onSave(modal) {
        const isGeneric = P && targetId === P.GENERIC.id;
        let slotMap = null;
        if (!isGeneric && filaments.length) {
          slotMap = Array.from(modal.querySelectorAll('.conv-slot')).map((s) => parseInt(s.value, 10) || 0);
          if (slotMap.every((v, i) => v === i)) slotMap = null; // identity → no remap
          if (slotMap && new Set(slotMap).size !== slotMap.length) {
            toast(t('conv.dup_slots') || 'Two colours are mapped to the same slot — one will be dropped. Give each colour its own slot.', 'warning', 5600);
          }
        }
        const dest = (modal.querySelector('input[name="convDest"]:checked') || {}).value || 'library';
        const mode = isGeneric ? 'normalize' : 'retarget';
        const targetProfile = isCustomId(targetId) ? getProfileById(targetId) : null;
        const targetName = (getProfileById(targetId) && getProfileById(targetId).name)
          || (isGeneric ? (t('conv.normalize_opt') || 'Generic 3MF') : targetId);
        const intoVaultId = dest === 'folder'
          ? null
          : (src.recordId || (typeof uid === 'function' ? uid('PF') : ('PF' + Date.now().toString(36))));

        const btn = modal.querySelector('[data-act="save"]');
        if (btn) { btn.disabled = true; btn.textContent = t('conv.converting') || 'Converting…'; }
        let r;
        try {
          r = await hub().mfConvert({ path: src.path, targetId, mode, slotMap, intoVaultId, targetProfile });
        } catch (e) { toast(String((e && e.message) || e), 'error'); if (btn) { btn.disabled = false; } return false; }
        if (r && r.canceled) { if (btn) { btn.disabled = false; btn.textContent = t('conv.convert') || 'Convert & save…'; } return false; }
        if (!r || !r.ok) { toast((r && r.error) || (t('conv.failed') || 'Conversion failed.'), 'error'); if (btn) { btn.disabled = false; } return false; }
        const rep = r.report || {};
        for (const w of (rep.warnings || [])) toast('⚠ ' + w, 'warning', 5200);

        if (dest === 'folder') {
          toast((t('conv.done') || 'Converted to {name}').replace('{name}', rep.targetName || targetName), 'success', 3200);
        } else if (src.recordId) {
          if (typeof attachConverted === 'function') attachConverted(src.recordId, { filename: r.filename, ext: r.ext, size: r.size, targetId, targetName });
          toast(t('conv.added_this') || 'Saved with your print file.', 'success', 3200);
        } else {
          if (typeof importConvertedAsNew === 'function') {
            await importConvertedAsNew({ vaultId: intoVaultId, filename: r.filename, ext: r.ext, size: r.size, targetId, targetName, sourceName: src.name });
          }
          toast(t('conv.added_new') || 'Added to your Print-File library.', 'success', 3200);
        }
        return true;
      },
    });
  }

  /* ---------------- Batch conversion ---------------- */
  let batchFiles = [];

  async function runBatch() {
    const el = document.getElementById('convBatchPanel');
    if (!el || !batchFiles.length) return;
    const targetId = (el.querySelector('#convBatchTarget') || {}).value || firstTargetId();
    const P = profiles();
    const isGeneric = P && targetId === P.GENERIC.id;
    const targetProfile = isCustomId(targetId) ? getProfileById(targetId) : null;
    const targetName = (getProfileById(targetId) && getProfileById(targetId).name) || targetId;
    const dest = (el.querySelector('input[name="convBatchDest"]:checked') || {}).value || 'library';

    let outdir = null;
    if (dest === 'folder') {
      const d = await hub().mfPickOutdir();
      if (!d || !d.ok) return;
      outdir = d.dir;
    }
    const runBtn = el.querySelector('#convBatchRun');
    if (runBtn) runBtn.disabled = true;

    let ok = 0;
    for (let i = 0; i < batchFiles.length; i++) {
      const f = batchFiles[i];
      const stat = el.querySelector(`.conv-batch-stat[data-i="${i}"]`);
      if (stat) { stat.textContent = '…'; stat.className = 'conv-batch-stat working'; stat.dataset.i = i; }
      const tag = String(targetId || 'out').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) || 'out';
      const base = String(f.name || 'model').replace(/\.3mf$/i, '');
      const intoVaultId = dest === 'library' ? (typeof uid === 'function' ? uid('PF') : ('PF' + i + Date.now().toString(36))) : null;
      const outPath = dest === 'folder' ? `${outdir}/${base}-${tag}.3mf` : null;
      let r;
      try {
        r = await hub().mfConvert({ path: f.path, targetId, mode: isGeneric ? 'normalize' : 'retarget', intoVaultId, outPath, targetProfile });
      } catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
      if (r && r.ok) {
        ok++;
        const nWarn = ((r.report || {}).warnings || []).length;
        if (stat) { stat.textContent = nWarn ? `✓ ⚠${nWarn}` : '✓'; stat.className = 'conv-batch-stat ok'; stat.dataset.i = i; }
        if (dest === 'library' && typeof importConvertedAsNew === 'function') {
          await importConvertedAsNew({ vaultId: intoVaultId, filename: r.filename, ext: r.ext, size: r.size, targetId, targetName, sourceName: f.name, noSwitch: true });
        }
      } else if (stat) {
        stat.textContent = `✕ ${(t('conv.batch_fail') || 'failed')}`; stat.className = 'conv-batch-stat fail'; stat.dataset.i = i;
        stat.title = (r && r.error) || '';
      }
    }
    if (runBtn) runBtn.disabled = false;
    toast((t('conv.batch_done') || 'Converted {ok} of {total} files.').replace('{ok}', ok).replace('{total}', batchFiles.length), ok ? 'success' : 'error', 3600);
  }

  function batchPanelHtml() {
    if (!batchFiles.length) return '';
    const rows = batchFiles.map((f, i) => `
      <div class="conv-batch-row"><span class="conv-batch-name" title="${escapeHtml(f.path)}">📄 ${escapeHtml(f.name)}</span><span class="conv-batch-stat" data-i="${i}"></span></div>`).join('');
    return `
      <div class="conv-batch">
        <label class="conv-label">${escapeHtml(t('conv.batch_target') || 'Convert all to')}</label>
        <select id="convBatchTarget" class="conv-target">${targetOptions(firstTargetId())}</select>
        <div class="conv-dest">
          <label class="conv-dest-opt"><input type="radio" name="convBatchDest" value="library" checked> ${escapeHtml(t('conv.batch_dest_lib') || 'Add all to my Print-File library')}</label>
          <label class="conv-dest-opt"><input type="radio" name="convBatchDest" value="folder"> ${escapeHtml(t('conv.batch_dest_folder') || 'Save all to a folder…')}</label>
        </div>
        <div class="conv-batch-list">${rows}</div>
        <button class="btn primary" id="convBatchRun">🔄 ${escapeHtml((t('conv.batch_run') || 'Convert {n} files').replace('{n}', batchFiles.length))}</button>
      </div>`;
  }

  /* ---------------- Custom printers ---------------- */
  function saveCustomPrinter(form) {
    const P = profiles();
    if (!P || !P.customProfile) return;
    const val = (sel) => (form.querySelector(sel) || {}).value;
    const spec = {
      id: typeof uid === 'function' ? uid('cp') : ('cp' + Date.now().toString(36)),
      name: val('#cpName'), vendor: val('#cpVendor'), flavour: val('#cpFlavour'),
      maxColors: val('#cpSlots'), nozzle: val('#cpNozzle'),
      bed: { x: val('#cpBedX'), y: val('#cpBedY'), z: val('#cpBedZ') },
      printerModel: val('#cpModel') || val('#cpName'),
    };
    const prof = P.customProfile(spec);
    if (!prof) { toast(t('conv.cp_name_req') || 'Give the printer a name.', 'warning'); return; }
    if (typeof settings === 'undefined') return;
    if (!Array.isArray(settings.customPrinters)) settings.customPrinters = [];
    settings.customPrinters.push(prof);
    if (typeof saveAll === 'function') saveAll();
    toast(t('conv.cp_added') || 'Printer saved.', 'success');
    renderConverter();
  }
  function removeCustomPrinter(id) {
    if (typeof settings === 'undefined' || !Array.isArray(settings.customPrinters)) return;
    settings.customPrinters = settings.customPrinters.filter((p) => p.id !== id);
    if (typeof saveAll === 'function') saveAll();
    renderConverter();
  }

  function customManagerHtml() {
    const P = profiles();
    const flavours = (P && P.FLAVOURS) || ['bambu', 'orca', 'prusa', 'generic'];
    const list = customPrinters();
    const listHtml = list.length
      ? list.map((p) => `<div class="conv-cp-item"><span class="conv-cp-nm">${escapeHtml(p.name)}</span><span class="conv-cp-sub">${escapeHtml((fmtBed(p.bed) || '') + ' · ' + p.maxColors + '★ · ' + p.flavour)}</span><button class="btn small ghost" data-act="cp-remove" data-id="${escapeHtml(p.id)}">✕ ${escapeHtml(t('conv.cp_remove') || 'Remove')}</button></div>`).join('')
      : `<p class="conv-note">${escapeHtml(t('conv.cp_empty') || "No custom printers yet. Add one to convert for a printer that isn't in the list.")}</p>`;
    return `
      <div class="conv-cp">
        <h3 class="conv-cp-h">🖨 ${escapeHtml(t('conv.my_printers') || 'My printers')}</h3>
        <div class="conv-cp-list">${listHtml}</div>
        <details class="conv-cp-add">
          <summary>＋ ${escapeHtml(t('conv.add_printer') || 'Add a printer')}</summary>
          <div class="conv-cp-form" id="convCpForm">
            <div class="conv-cp-grid">
              <label>${escapeHtml(t('conv.cp_name') || 'Name')}<input id="cpName" type="text" maxlength="48" placeholder="My printer"></label>
              <label>${escapeHtml(t('conv.cp_vendor') || 'Brand')}<input id="cpVendor" type="text" maxlength="32"></label>
              <label>${escapeHtml(t('conv.cp_flavour') || 'Slicer format')}<select id="cpFlavour">${flavours.map((f) => `<option value="${f}">${f}</option>`).join('')}</select></label>
              <label>${escapeHtml(t('conv.cp_slots') || 'Colour slots')}<input id="cpSlots" type="number" min="1" max="16" value="1"></label>
              <label>${escapeHtml(t('conv.cp_nozzle') || 'Nozzle (mm)')}<input id="cpNozzle" type="number" min="0.1" max="2" step="0.1" value="0.4"></label>
              <label>${escapeHtml(t('conv.cp_model') || 'Printer model id')}<input id="cpModel" type="text" maxlength="64"></label>
              <label>${escapeHtml(t('conv.cp_bedx') || 'Bed X')}<input id="cpBedX" type="number" min="1" max="2000" value="256"></label>
              <label>${escapeHtml(t('conv.cp_bedy') || 'Bed Y')}<input id="cpBedY" type="number" min="1" max="2000" value="256"></label>
              <label>${escapeHtml(t('conv.cp_bedz') || 'Bed Z')}<input id="cpBedZ" type="number" min="1" max="2000" value="256"></label>
            </div>
            <button class="btn primary small" id="convCpSave">${escapeHtml(t('conv.cp_save') || 'Save printer')}</button>
          </div>
        </details>
      </div>`;
  }

  function presetManagerHtml() {
    const list = convPresets();
    if (!list.length) return '';
    const rows = list.map((p) => {
      const prof = getProfileById(p.targetId);
      const tgt = prof ? prof.name : (p.targetId || '');
      return `<div class="conv-cp-item"><span class="conv-cp-nm">${escapeHtml(p.name)}</span><span class="conv-cp-sub">→ ${escapeHtml(tgt)}${Array.isArray(p.slotMap) ? ' · ' + p.slotMap.length + '★' : ''}</span><button class="btn small ghost" data-act="preset-remove" data-id="${escapeHtml(p.id)}">✕ ${escapeHtml(t('conv.preset_remove') || 'Remove')}</button></div>`;
    }).join('');
    return `<div class="conv-cp"><h3 class="conv-cp-h">★ ${escapeHtml(t('conv.presets_title') || 'Conversion presets')}</h3><div class="conv-cp-list">${rows}</div></div>`;
  }

  // Standalone Converter tab.
  function renderConverter() {
    const el = document.getElementById('converter-tab');
    if (!el) return;
    const hasHub = !!(hub() && hub().mfPick);
    if (!hasHub) {
      el.innerHTML = `<div class="conv-wrap"><div class="conv-head"><h2 class="conv-title">${_titleIco}${escapeHtml(t('conv.title') || 'Convert 3MF')}</h2></div><div class="pf-empty">${escapeHtml(t('conv.desktop_only') || 'The converter is available in the desktop app.')}</div></div>`;
      return;
    }
    el.innerHTML = `
      <div class="conv-wrap">
        <div class="conv-head">
          <h2 class="conv-title">${_titleIco}${escapeHtml(t('conv.title') || 'Convert 3MF')}</h2>
          <p class="conv-sub">${escapeHtml(t('conv.subtitle') || 'Retarget a multicolour 3MF to a different printer, or normalize it to a clean standard 3MF. Geometry is never altered.')}</p>
        </div>
        <div class="conv-actions">
          <button class="btn primary" id="convPick">＋ ${escapeHtml(t('conv.pick') || 'Choose a 3MF file…')}</button>
          <button class="btn ghost" id="convBatchPick">🗂 ${escapeHtml(t('conv.batch_pick') || 'Batch convert…')}</button>
          ${hub() && hub().stlPick ? `<button class="btn ghost" id="convStlBtn">📐 ${escapeHtml(t('conv.stl_pick') || 'STL → 3MF…')}</button>` : ''}
          ${hub() && hub().mfToStl ? `<button class="btn ghost" id="convToStlBtn">📤 ${escapeHtml(t('conv.tostl_pick') || '3MF → STL…')}</button>` : ''}
        </div>
        <p class="conv-tip">${escapeHtml(t('conv.tip') || 'Tip: you can also hit Convert on any 3MF in your Print-File library.')}</p>
        <div id="convBatchPanel">${batchPanelHtml()}</div>
        ${presetManagerHtml()}
        ${customManagerHtml()}
      </div>`;

    const pick = document.getElementById('convPick');
    if (pick) pick.onclick = async () => {
      const r = await hub().mfPick();
      if (!r || !r.ok) return;
      openConverter({ path: r.path, name: r.name });
    };
    const bpick = document.getElementById('convBatchPick');
    if (bpick) bpick.onclick = async () => {
      const r = await hub().mfPickMulti();
      if (!r || !r.ok || !r.files || !r.files.length) return;
      batchFiles = r.files;
      const panel = document.getElementById('convBatchPanel');
      if (panel) {
        panel.innerHTML = batchPanelHtml();
        const run = document.getElementById('convBatchRun');
        if (run) run.onclick = runBatch;
      }
    };
    const run = document.getElementById('convBatchRun');
    if (run) run.onclick = runBatch;

    const stlBtn = document.getElementById('convStlBtn');
    if (stlBtn) stlBtn.onclick = async () => {
      const r = await hub().stlPick();
      if (!r || !r.ok) return;
      toast(t('conv.stl_working') || 'Converting STL…', 'info', 1600);
      const vaultId = typeof uid === 'function' ? uid('PF') : ('PF' + Date.now().toString(36));
      let c;
      try { c = await hub().stlTo3mf({ path: r.path, intoVaultId: vaultId }); }
      catch (e) { toast(String((e && e.message) || e), 'error'); return; }
      if (!c || !c.ok) { toast((c && c.error) || (t('conv.stl_failed') || 'Could not convert that STL.'), 'error'); return; }
      if (typeof importConvertedAsNew === 'function') {
        await importConvertedAsNew({ vaultId, filename: c.filename, ext: c.ext, size: c.size, targetName: '3MF', sourceName: r.name });
      }
      toast(t('conv.stl_done') || 'STL converted to 3MF and added to your library.', 'success', 3600);
    };

    const toStlBtn = document.getElementById('convToStlBtn');
    if (toStlBtn) toStlBtn.onclick = async () => {
      const r = await hub().mfPick();
      if (!r || !r.ok) return;
      toast(t('conv.tostl_working') || 'Extracting mesh…', 'info', 1600);
      let c;
      try { c = await hub().mfToStl({ path: r.path }); }
      catch (e) { toast(String((e && e.message) || e), 'error'); return; }
      if (c && c.canceled) return;
      if (!c || !c.ok) { toast((c && c.error) || (t('conv.tostl_none') || 'No mesh found in that 3MF.'), 'error'); return; }
      toast(t('conv.tostl_done') || 'Saved STL.', 'success', 3200);
    };

    const cpSave = document.getElementById('convCpSave');
    if (cpSave) cpSave.onclick = () => saveCustomPrinter(document.getElementById('convCpForm'));
    el.querySelectorAll('[data-act="cp-remove"]').forEach((b) => { b.onclick = () => removeCustomPrinter(b.dataset.id); });
    el.querySelectorAll('[data-act="preset-remove"]').forEach((b) => { b.onclick = () => removePreset(b.dataset.id); });
  }

  const pub = { renderConverter, openConverter };
  Object.assign(global, pub);
  global.KhaytConverter = pub;
  if (typeof module !== 'undefined' && module.exports) module.exports = pub;
})(typeof globalThis !== 'undefined' ? globalThis : this);
