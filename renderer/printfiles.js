'use strict';
/*
 * Print-File Library (3.1) — a standalone, order-independent catalogue of the maker's
 * STL / 3MF / gcode files, with a real preview thumbnail (embedded slicer thumbnail
 * for gcode/3MF, software-rendered for STL), an optional user photo, parsed metadata,
 * multicolour info, a "tested settings" note + slicer profile (the BedReady "design
 * library" idea), and one-click "open in slicer".
 *
 * Records live in the `printFiles` store collection; the model file + generated images
 * live under userData/print-files-vault/<id>/ (main-process handlers). Everything is
 * local — no network. Degrades gracefully in the web/LAN build (no window.hubAPI).
 */
(function (global) {
  const api = () => (typeof window !== 'undefined' && window.hubAPI) || null;
  const EXT_ICON = { stl: '🧊', obj: '🧊', '3mf': '🎨', gcode: '📄', gco: '📄' };

  function fmtTime(mins) {
    if (mins == null || !isFinite(mins) || mins <= 0) return '';
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  function fmtSize(bytes) {
    if (!bytes) return '';
    return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }
  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  // Downscale a data URL through a canvas so previews stay small in the synced store.
  function resizeDataUrl(dataUrl, maxDim, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio), h = Math.round(img.height * ratio);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        try { c.getContext('2d').drawImage(img, 0, 0, w, h); resolve(c.toDataURL('image/jpeg', quality || 0.82)); }
        catch (_) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function filtered(query) {
    const list = Array.isArray(printFiles) ? printFiles : [];
    const q = (query || '').trim().toLowerCase();
    const rows = q
      ? list.filter((r) => (r.name + ' ' + (r.originalName || '') + ' ' + (r.tags || []).join(' ') + ' ' + (r.material || '')).toLowerCase().includes(q))
      : list.slice();
    return rows.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function thumbHtml(rec) {
    const src = rec.thumb || rec.userPhoto || null;
    if (src) return `<img class="pf-thumb" src="${safeImageSrc(src)}" alt="" loading="lazy">`;
    const ico = EXT_ICON[rec.sourceFile?.ext] || '📦';
    return `<div class="pf-thumb pf-thumb-icon">${ico}</div>`;
  }

  function colorDotsHtml(rec) {
    if (!Array.isArray(rec.colors) || !rec.colors.length) return '';
    const dots = rec.colors.slice(0, 8).map((c) =>
      `<span class="pf-dot" title="${escapeHtml(c.label || c.hex)}${c.grams ? ' · ' + c.grams + ' g' : ''}" style="background:${escapeHtml(c.hex)}"></span>`).join('');
    const swap = rec.swapCount > 0 ? `<span class="pf-chip">↔ ${rec.swapCount} ${escapeHtml(t('plib.swaps') || 'swaps')}</span>` : '';
    return `<div class="pf-colors">${dots}${swap}</div>`;
  }

  function metaChips(rec) {
    const p = rec.parsed || {};
    const chips = [];
    const ext = rec.sourceFile?.ext; if (ext) chips.push(ext.toUpperCase());
    const tm = fmtTime(p.printTimeMins); if (tm) chips.push('⏱ ' + tm);
    if (p.filamentGrams) chips.push('⛁ ' + Math.round(p.filamentGrams) + ' g');
    if (p.slicer) chips.push(escapeHtml(p.slicer));
    if (p.bbox && p.bbox.x) chips.push(`${Math.round(p.bbox.x)}×${Math.round(p.bbox.y)}×${Math.round(p.bbox.z)} mm`);
    const sz = fmtSize(rec.sourceFile?.size); if (sz) chips.push(sz);
    return chips.map((c) => `<span class="pf-chip">${escapeHtml(String(c))}</span>`).join('');
  }

  function cardHtml(rec) {
    const prof = rec.slicerProfileId && (slicerProfiles || []).find((s) => s.id === rec.slicerProfileId);
    return `
      <div class="pf-card" data-id="${escapeHtml(rec.id)}">
        <button class="pf-fav ${rec.favorite ? 'on' : ''}" data-act="pf-fav" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('plib.favorite') || 'Favorite')}">${rec.favorite ? '★' : '☆'}</button>
        ${thumbHtml(rec)}
        <div class="pf-body">
          <div class="pf-name" title="${escapeHtml(rec.originalName || rec.name)}">${escapeHtml(rec.name || rec.originalName || 'Untitled')}</div>
          <div class="pf-chips">${metaChips(rec)}</div>
          ${colorDotsHtml(rec)}
          ${prof ? `<div class="pf-prof">🛠 ${escapeHtml(prof.name)}</div>` : ''}
          ${rec.testedNotes ? `<div class="pf-notes">${escapeHtml(rec.testedNotes)}</div>` : ''}
        </div>
        <div class="pf-actions">
          <button class="btn small primary" data-act="pf-slice" data-id="${escapeHtml(rec.id)}">🖨 ${escapeHtml(t('plib.open_slicer') || 'Open in slicer')}</button>
          <button class="btn small ghost" data-act="pf-edit" data-id="${escapeHtml(rec.id)}">${escapeHtml(t('common.edit') || 'Edit')}</button>
          <button class="btn small ghost danger" data-act="pf-del" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('common.delete') || 'Delete')}">🗑</button>
        </div>
      </div>`;
  }

  let _query = '';
  function renderPrintFiles() {
    const el = document.getElementById('printfiles-tab');
    if (!el) return;
    const hasHub = !!(api() && api().printLibPick);
    const rows = filtered(_query);
    const total = (printFiles || []).length;
    el.innerHTML = `
      <div class="pf-wrap">
        <div class="pf-head">
          <div>
            <h2 class="pf-title">${escapeHtml(t('tab.printfiles') || 'Print Files')}</h2>
            <p class="pf-sub">${escapeHtml(t('plib.subtitle') || 'Your STL, 3MF and G-code library — previews, tested settings, open in your slicer.')}</p>
          </div>
          <div class="pf-head-actions">
            <input type="search" id="pfSearch" class="pf-search" placeholder="${escapeHtml(t('common.search') || 'Search')}" value="${escapeHtml(_query)}" aria-label="${escapeHtml(t('common.search') || 'Search')}">
            <button class="btn primary" data-act="pf-add" ${hasHub ? '' : 'disabled'}>＋ ${escapeHtml(t('plib.add') || 'Add file')}</button>
          </div>
        </div>
        ${!hasHub ? `<div class="pf-empty">${escapeHtml(t('plib.desktop_only') || 'The print-file library is available in the desktop app.')}</div>`
          : rows.length ? `<div class="pf-grid">${rows.map(cardHtml).join('')}</div>`
          : `<div class="pf-empty">${escapeHtml(total ? (t('plib.no_match') || 'No files match your search.') : (t('plib.empty') || 'No print files yet. Add your first STL, 3MF or G-code file.'))}</div>`}
      </div>`;

    el.onclick = onClick;
    const search = document.getElementById('pfSearch');
    if (search) search.oninput = (e) => { _query = e.target.value; renderPrintFiles(); const s = document.getElementById('pfSearch'); if (s) { s.focus(); s.selectionStart = s.selectionEnd = s.value.length; } };
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
      case 'pf-add':   addPrintFile(); break;
      case 'pf-slice': openInSlicer(id); break;
      case 'pf-edit':  editPrintFile(id); break;
      case 'pf-del':   deletePrintFile(id); break;
      case 'pf-fav':   toggleFav(id); break;
    }
  }

  async function addPrintFile() {
    const hub = api(); if (!hub || !hub.printLibPick) return;
    const id = uid('PF');
    let picked;
    try { picked = await hub.printLibPick(id); } catch (err) { toast(String(err.message || err), 'error'); return; }
    if (!picked) return;
    const ext = (picked.ext || '').toLowerCase();
    const rec = {
      id,
      name: (picked.originalName || 'Untitled').replace(/\.[^.]+$/, ''),
      originalName: picked.originalName,
      createdAt: Date.now(), updatedAt: Date.now(),
      sourceFile: { filename: picked.filename, originalName: picked.originalName, size: picked.size, ext, kind: /^(stl|3mf|obj)$/.test(ext) ? 'model' : 'gcode' },
      parsed: {}, colors: [], swapCount: 0,
      thumb: null, thumbSource: null, userPhoto: null,
      slicerProfileId: null, testedNotes: '', tags: [], material: '', favorite: false,
    };
    if (!Array.isArray(printFiles)) printFiles = [];
    printFiles.unshift(rec);
    saveAll();
    renderPrintFiles();
    toast(t('plib.added') || 'File added', 'success');
    enrichPrintFile(rec, picked.fullPath);
  }

  async function enrichPrintFile(rec, fullPath) {
    const hub = api(); if (!hub) return;
    const ext = rec.sourceFile.ext;
    try {
      if (ext === 'gcode' || ext === 'gco' || ext === '3mf') {
        if (hub.parsePrintFile) {
          const p = await hub.parsePrintFile(fullPath);
          if (p) rec.parsed = Object.assign({}, rec.parsed, { printTimeMins: p.printTimeMins, filamentGrams: p.filamentGrams, filamentType: p.filamentType, slicer: p.slicer });
        }
        if (hub.extractThumbnail) {
          const th = await hub.extractThumbnail(fullPath);
          if (th) {
            if (Array.isArray(th.colors) && th.colors.length) rec.colors = th.colors;
            if (th.swapCount) rec.swapCount = th.swapCount;
            if (th.pngBase64) { rec.thumb = await resizeDataUrl('data:image/png;base64,' + th.pngBase64, 280, 0.82); rec.thumbSource = 'embedded'; }
          }
        }
      }
      if (!rec.thumb && ext === 'stl' && hub.printLibReadBytes && KhaytStl && KhaytStlThumb) {
        const b64 = await hub.printLibReadBytes(fullPath);
        if (b64) {
          try {
            const g = KhaytStl.parseStl(base64ToArrayBuffer(b64), { keepTriangles: true });
            rec.parsed = Object.assign({}, rec.parsed, { triangleCount: g.triangleCount, volumeMm3: g.volumeMm3, bbox: g.bbox });
            if (g.triangles && g.triangles.length) {
              const r = KhaytStlThumb.renderStlThumbnail(g.triangles, { size: 300 });
              if (r.ok && r.dataUrl) { rec.thumb = r.dataUrl; rec.thumbSource = 'render'; }
            }
          } catch (_) { /* obj / bad stl → icon fallback */ }
        }
      }
    } catch (_) { /* keep whatever we got */ }
    rec.updatedAt = Date.now();
    saveAll();
    renderPrintFiles();
  }

  async function resolveModelPath(rec) {
    const hub = api(); if (!hub || !hub.printLibList) return null;
    const files = await hub.printLibList(rec.id);
    if (!Array.isArray(files) || !files.length) return null;
    return (files.find((f) => f.filename === rec.sourceFile.filename) || files[0]).fullPath;
  }

  async function openInSlicer(id) {
    const rec = (printFiles || []).find((r) => r.id === id); if (!rec) return;
    const hub = api(); if (!hub || !hub.printLibOpenSlicer) return;
    const full = await resolveModelPath(rec);
    if (!full) { toast(t('plib.file_missing') || 'File is missing.', 'error'); return; }
    const r = await hub.printLibOpenSlicer(full, (settings.slicer && settings.slicer.path) || '');
    if (!r || !r.ok) toast((r && r.error) || (t('plib.open_failed') || 'Could not open the file.'), 'error');
    else if (r.opened === 'slicer') toast(t('plib.opened_slicer') || 'Opened in your slicer.', 'success');
    else toast(t('plib.opened_os') || 'Opened. Set a slicer path in Settings → Printers to open there.', 'info', 4200);
  }

  function toggleFav(id) {
    const rec = (printFiles || []).find((r) => r.id === id); if (!rec) return;
    rec.favorite = !rec.favorite; rec.updatedAt = Date.now();
    saveAll(); renderPrintFiles();
  }

  function deletePrintFile(id) {
    const rec = (printFiles || []).find((r) => r.id === id); if (!rec) return;
    openFormModal({
      title: t('plib.delete_title') || 'Delete print file',
      sizeLg: false, saveLabel: t('common.delete') || 'Delete',
      bodyHtml: `<p>${escapeHtml((t('plib.delete_confirm') || 'Remove "{name}" and its files? This cannot be undone.').replace('{name}', rec.name || rec.originalName || ''))}</p>`,
      async onSave() {
        const hub = api();
        if (hub && hub.printLibList && hub.printLibDelete) {
          try { const files = await hub.printLibList(id); for (const f of (files || [])) await hub.printLibDelete(f.fullPath); } catch (_) {}
        }
        printFiles = (printFiles || []).filter((r) => r.id !== id);
        saveAll(); renderPrintFiles();
        toast(t('plib.deleted') || 'File deleted', 'success');
      },
    });
  }

  function editPrintFile(id) {
    const rec = (printFiles || []).find((r) => r.id === id); if (!rec) return;
    const profOptions = (slicerProfiles || []).map((s) =>
      `<option value="${escapeHtml(s.id)}"${rec.slicerProfileId === s.id ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    const matOptions = [...new Set((inventory || []).map((i) => i.material).filter(Boolean))].map((m) =>
      `<option value="${escapeHtml(m)}"${rec.material === m ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('');
    openFormModal({
      title: t('plib.edit_title') || 'Edit print file',
      saveLabel: t('common.save') || 'Save',
      bodyHtml: `
        <label>${escapeHtml(t('plib.name') || 'Name')}</label>
        <input type="text" id="pfName" value="${escapeHtml(rec.name || '')}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
          <div>
            <label>${escapeHtml(t('plib.material') || 'Material')}</label>
            <input type="text" id="pfMaterial" list="pfMatList" value="${escapeHtml(rec.material || '')}">
            <datalist id="pfMatList">${matOptions}</datalist>
          </div>
          <div>
            <label>${escapeHtml(t('plib.slicer_profile') || 'Slicer profile')}</label>
            <select id="pfProfile"><option value="">— ${escapeHtml(t('common.none') || 'None')} —</option>${profOptions}</select>
          </div>
        </div>
        <label style="margin-top:10px;">${escapeHtml(t('plib.tags') || 'Tags (comma separated)')}</label>
        <input type="text" id="pfTags" value="${escapeHtml((rec.tags || []).join(', '))}">
        <label style="margin-top:10px;">${escapeHtml(t('plib.tested_notes') || 'Tested settings / notes')}</label>
        <textarea id="pfNotes" rows="3">${escapeHtml(rec.testedNotes || '')}</textarea>
        <label style="margin-top:10px;">${escapeHtml(t('plib.photo') || 'Photo (optional)')}</label>
        <div style="display:flex;align-items:center;gap:10px;">
          <img id="pfPhotoPrev" src="${rec.userPhoto ? safeImageSrc(rec.userPhoto) : ''}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;${rec.userPhoto ? '' : 'display:none;'}background:var(--bg-elev);">
          <input type="file" id="pfPhoto" accept="image/*">
          ${rec.userPhoto ? `<button type="button" class="btn small ghost" id="pfPhotoClear">${escapeHtml(t('common.remove') || 'Remove')}</button>` : ''}
        </div>`,
      onMount(modal) {
        let stagedPhoto = rec.userPhoto || null;
        let cleared = false;
        const prev = modal.querySelector('#pfPhotoPrev');
        modal.querySelector('#pfPhoto').addEventListener('change', async (ev) => {
          const file = ev.target.files && ev.target.files[0]; if (!file) return;
          try { stagedPhoto = await resizeImage(file, 480, 0.82); cleared = false; if (prev) { prev.src = stagedPhoto; prev.style.display = ''; } }
          catch (_) { toast(t('plib.photo_failed') || 'Could not load image', 'error'); }
        });
        const clr = modal.querySelector('#pfPhotoClear');
        if (clr) clr.addEventListener('click', () => { stagedPhoto = null; cleared = true; if (prev) prev.style.display = 'none'; });
        modal._getPhoto = () => ({ stagedPhoto, cleared });
      },
      onSave(modal) {
        const name = modal.querySelector('#pfName').value.trim();
        if (!name) { toast(t('plib.name_required') || 'Enter a name', 'error'); return false; }
        rec.name = name;
        rec.material = modal.querySelector('#pfMaterial').value.trim();
        rec.slicerProfileId = modal.querySelector('#pfProfile').value || null;
        rec.tags = modal.querySelector('#pfTags').value.split(',').map((s) => s.trim()).filter(Boolean);
        rec.testedNotes = modal.querySelector('#pfNotes').value.trim();
        const ph = modal._getPhoto ? modal._getPhoto() : null;
        if (ph) { if (ph.cleared) rec.userPhoto = null; else if (ph.stagedPhoto) rec.userPhoto = ph.stagedPhoto; }
        rec.updatedAt = Date.now();
        saveAll(); renderPrintFiles();
        toast(t('plib.saved') || 'Saved', 'success');
      },
    });
  }

  const pub = { renderPrintFiles, addPrintFile, openInSlicer, editPrintFile, deletePrintFile };
  Object.assign(global, pub);
  global.KhaytPrintFiles = pub;
  if (typeof module !== 'undefined' && module.exports) module.exports = pub;
})(typeof globalThis !== 'undefined' ? globalThis : this);
