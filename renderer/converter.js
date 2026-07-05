'use strict';
/*
 * 3MF Converter UI (3.1) — retarget a multicolour 3MF to a different printer (re-profile +
 * optional colour→slot remap) or normalize it to a clean generic 3MF. Two entry points:
 *   • a "Convert" action on a print-file library card (renderer/printfiles.js), and
 *   • a standalone "Converter" tab (pick any 3MF).
 *
 * All the heavy lifting is in the main process (hub:mf-analyze / hub:mf-convert over
 * lib/mf-convert.js); this module is just the picker + options modal + result. Geometry is
 * never touched by the engine, so a conversion is safe by construction.
 */
(function (global) {
  const hub = () => (typeof window !== 'undefined' && window.hubAPI) || null;
  const profiles = () => global.KhaytPrinterProfiles;

  function swatch(hex, size) {
    const s = size || 16;
    return `<span class="cs-swatch" style="background:${safeCssColor(hex, '#888')};width:${s}px;height:${s}px;"></span>`;
  }

  function targetOptions(selectedId) {
    const P = profiles();
    if (!P) return '';
    const byVendor = {};
    for (const p of P.listProfiles()) { (byVendor[p.vendor] = byVendor[p.vendor] || []).push(p); }
    const groups = Object.keys(byVendor).map((vendor) =>
      `<optgroup label="${escapeHtml(vendor)}">${byVendor[vendor].map((p) =>
        `<option value="${escapeHtml(p.id)}"${p.id === selectedId ? ' selected' : ''}>${escapeHtml(p.name)} · ${escapeHtml(p.system)}</option>`).join('')}</optgroup>`).join('');
    const g = P.GENERIC;
    return groups + `<optgroup label="${escapeHtml(t('conv.other') || 'Other')}"><option value="${escapeHtml(g.id)}"${g.id === selectedId ? ' selected' : ''}>${escapeHtml(t('conv.normalize_opt') || 'Generic 3MF (strip vendor lock)')}</option></optgroup>`;
  }

  // Remap table: one row per source colour → a target-slot number select (identity default).
  function remapTableHtml(filaments, maxColors) {
    if (!filaments || !filaments.length) return `<p class="conv-note">${escapeHtml(t('conv.no_colours') || 'No colours detected — geometry and settings are retargeted as-is.')}</p>`;
    const slots = Math.max(maxColors || filaments.length, filaments.length);
    const rows = filaments.map((f, i) => `
      <div class="conv-remap-row">
        ${swatch(f.color, 20)} <span class="conv-hex">${escapeHtml(String(f.color).toUpperCase())}</span>
        <span class="conv-arrow">→</span>
        <select class="conv-slot" data-i="${i}">
          ${Array.from({ length: slots }, (_, s) => `<option value="${s}"${s === i ? ' selected' : ''}>${t('conv.slot') || 'Slot'} ${s + 1}</option>`).join('')}
        </select>
      </div>`).join('');
    return `<div class="conv-remap"><div class="conv-remap-head">${escapeHtml(t('conv.remap_hint') || 'Map each source colour to a slot on the target printer:')}</div>${rows}</div>`;
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
    let targetId = P ? (P.listProfiles()[0] || {}).id : '';

    const body = `
      <div class="conv-src">
        <div class="conv-src-name">📦 ${escapeHtml(src.name || 'model.3mf')}</div>
        <div class="conv-src-meta">${escapeHtml((t('conv.detected') || 'Detected') + ': ' + a.flavour)} · ${filaments.length} ${escapeHtml(t('conv.colours') || 'colours')}</div>
      </div>
      <label class="conv-label">${escapeHtml(t('conv.target') || 'Target printer')}</label>
      <select id="convTarget" class="conv-target">${targetOptions(targetId)}</select>
      <div id="convRemapWrap">${remapTableHtml(filaments, currentMax(targetId))}</div>
      <div class="conv-dest">
        <div class="conv-dest-q">${escapeHtml(t('conv.dest_q') || 'Where should the converted file go?')}</div>
        <label class="conv-dest-opt"><input type="radio" name="convDest" value="library" checked> ${escapeHtml(src.recordId ? (t('conv.dest_this') || 'Keep it with this print file') : (t('conv.dest_new') || 'Add it to my Print-File library'))}</label>
        <label class="conv-dest-opt"><input type="radio" name="convDest" value="folder"> ${escapeHtml(t('conv.dest_folder') || 'Save to a folder…')}</label>
      </div>`;

    function currentMax(id) {
      const p = P && P.getProfile(id);
      return p ? p.maxColors : filaments.length;
    }

    openFormModal({
      title: `🔄 ${t('conv.title') || 'Convert 3MF'}`,
      bodyHtml: body,
      saveLabel: t('conv.convert') || 'Convert & save…',
      onMount(modal) {
        const sel = modal.querySelector('#convTarget');
        const wrap = modal.querySelector('#convRemapWrap');
        if (sel) sel.onchange = () => {
          targetId = sel.value;
          const isGeneric = P && targetId === P.GENERIC.id;
          wrap.innerHTML = isGeneric
            ? `<p class="conv-note">${escapeHtml(t('conv.normalize_note') || 'Vendor-locked slicer settings are stripped; geometry and colours are kept. Opens cleanly in any slicer.')}</p>`
            : remapTableHtml(filaments, currentMax(targetId));
        };
      },
      async onSave(modal) {
        const isGeneric = P && targetId === P.GENERIC.id;
        let slotMap = null;
        if (!isGeneric && filaments.length) {
          slotMap = Array.from(modal.querySelectorAll('.conv-slot')).map((s) => parseInt(s.value, 10) || 0);
          if (slotMap.every((v, i) => v === i)) slotMap = null; // identity → no remap
          // Two source colours mapped to one slot isn't a permutation — the engine
          // would keep the last write and silently drop the other colour. Warn.
          if (slotMap && new Set(slotMap).size !== slotMap.length) {
            toast(t('conv.dup_slots') || 'Two colours are mapped to the same slot — one will be dropped. Give each colour its own slot.', 'warning', 5600);
          }
        }
        const dest = (modal.querySelector('input[name="convDest"]:checked') || {}).value || 'library';
        const mode = isGeneric ? 'normalize' : 'retarget';
        const targetName = (P && P.getProfile(targetId) && P.getProfile(targetId).name)
          || (isGeneric ? (t('conv.normalize_opt') || 'Generic 3MF') : targetId);
        // In-app destinations write straight into a print-file vault (no random folder).
        const intoVaultId = dest === 'folder'
          ? null
          : (src.recordId || (typeof uid === 'function' ? uid('PF') : ('PF' + Date.now().toString(36))));

        const btn = modal.querySelector('[data-act="save"]');
        if (btn) { btn.disabled = true; btn.textContent = t('conv.converting') || 'Converting…'; }
        let r;
        try {
          r = await hub().mfConvert({ path: src.path, targetId, mode, slotMap, intoVaultId });
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

  // Standalone Converter tab.
  function renderConverter() {
    const el = document.getElementById('converter-tab');
    if (!el) return;
    const hasHub = !!(hub() && hub().mfPick);
    el.innerHTML = `
      <div class="conv-wrap">
        <div class="conv-head">
          <h2 class="conv-title">🔄 ${escapeHtml(t('conv.title') || 'Convert 3MF')}</h2>
          <p class="conv-sub">${escapeHtml(t('conv.subtitle') || 'Retarget a multicolour 3MF to a different printer, or normalize it to a clean standard 3MF. Geometry is never altered.')}</p>
        </div>
        ${hasHub
          ? `<button class="btn primary" id="convPick">＋ ${escapeHtml(t('conv.pick') || 'Choose a 3MF file…')}</button>
             <p class="conv-tip">${escapeHtml(t('conv.tip') || 'Tip: you can also hit Convert on any 3MF in your Print-File library.')}</p>`
          : `<div class="pf-empty">${escapeHtml(t('conv.desktop_only') || 'The converter is available in the desktop app.')}</div>`}
      </div>`;
    const pick = document.getElementById('convPick');
    if (pick) pick.onclick = async () => {
      const r = await hub().mfPick();
      if (!r || !r.ok) return;
      openConverter({ path: r.path, name: r.name });
    };
  }

  const pub = { renderConverter, openConverter };
  Object.assign(global, pub);
  global.KhaytConverter = pub;
  if (typeof module !== 'undefined' && module.exports) module.exports = pub;
})(typeof globalThis !== 'undefined' ? globalThis : this);
