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
          ${(rec.timesPrinted || rec.timesFailed) ? `<div class="pf-history" title="${escapeHtml(t('plib.history_title') || 'Print history')}">🖨 ${(rec.timesPrinted || 0)}× ${escapeHtml(t('plib.printed') || 'printed')}${rec.timesFailed ? ` · ${rec.timesFailed} ${escapeHtml(t('plib.failed') || 'failed')}` : ''}${rec.lastPrinted ? ` · ${escapeHtml(t('plib.last') || 'last')} ${escapeHtml(fmtPfDate(rec.lastPrinted))}` : ''}</div>` : ''}
          ${Array.isArray(rec.converted) && rec.converted.length ? `<div class="pf-converted">${rec.converted.map((c) => `
            <div class="pf-conv-row">
              <span class="pf-conv-name" title="${escapeHtml(c.filename)}">🔄 ${escapeHtml(c.targetName || c.targetId || (t('conv.convert_short') || 'Converted'))}</span>
              <button class="btn small ghost" data-act="pf-conv-open" data-id="${escapeHtml(rec.id)}" data-fn="${escapeHtml(c.filename)}" title="${escapeHtml(t('plib.open_slicer') || 'Open in slicer')}">🖨</button>
              <button class="btn small ghost danger" data-act="pf-conv-del" data-id="${escapeHtml(rec.id)}" data-fn="${escapeHtml(c.filename)}" aria-label="${escapeHtml(t('common.delete') || 'Delete')}">🗑</button>
            </div>`).join('')}</div>` : ''}
        </div>
        <div class="pf-actions">
          <button class="btn small primary" data-act="pf-slice" data-id="${escapeHtml(rec.id)}">🖨 ${escapeHtml(t('plib.open_slicer') || 'Open in slicer')}</button>
          ${typeof openModelViewer === 'function' && /^(stl|3mf)$/i.test(rec.sourceFile?.ext || '') ? `<button class="btn small ghost" data-act="pf-view3d" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('plib.view3d') || 'View in 3D')}">🧊 ${escapeHtml(t('plib.view3d_short') || '3D')}</button>` : ''}
          <button class="btn small ghost" data-act="pf-log-print" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('plib.log_print') || 'Log a successful print')}">✓ ${escapeHtml(t('plib.log_print_short') || 'Printed')}</button>
          <button class="btn small ghost" data-act="pf-log-fail" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('plib.log_fail') || 'Log a failed print')}" aria-label="${escapeHtml(t('plib.log_fail') || 'Log a failed print')}">✗</button>
          ${Array.isArray(rec.colors) && rec.colors.filter((c) => c && c.hex).length > 1 ? `<button class="btn small ghost" data-act="pf-plan" data-id="${escapeHtml(rec.id)}">🎨 ${escapeHtml(t('plan.title') || 'Plan colours')}</button>` : ''}
          ${rec.sourceFile?.ext === '3mf' ? `<button class="btn small ghost" data-act="pf-convert" data-id="${escapeHtml(rec.id)}">🔄 ${escapeHtml(t('conv.convert_short') || 'Convert')}</button>` : ''}
          <button class="btn small ghost" data-act="pf-edit" data-id="${escapeHtml(rec.id)}">${escapeHtml(t('common.edit') || 'Edit')}</button>
          <button class="btn small ghost danger" data-act="pf-del" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('common.delete') || 'Delete')}">🗑</button>
        </div>
      </div>`;
  }

  let _query = '';
  let _view = 'library'; // 'library' | 'gallery'

  // Finished-prints gallery: a photo-forward showcase of every print file you've
  // added a photo to, with its material, tested settings and print tally. A local
  // personal portfolio — nothing to sell, just what you've made and how.
  function galleryHtml() {
    const shots = (printFiles || []).filter((r) => r.userPhoto);
    if (!shots.length) {
      return `<div class="pf-empty">${escapeHtml(t('plib.gallery_empty') || 'No print photos yet — add a photo to a print file to start your gallery.')}</div>`;
    }
    return `<div class="pf-gallery">${shots.map((r) => `
      <figure class="pf-shot" data-act="pf-edit" data-id="${escapeHtml(r.id)}" title="${escapeHtml(t('common.edit') || 'Edit')}">
        <img src="${safeImageSrc(r.userPhoto)}" alt="${escapeHtml(r.name || '')}" loading="lazy">
        <figcaption>
          <div class="pf-shot-name">${escapeHtml(r.name || r.originalName || 'Untitled')}</div>
          <div class="pf-shot-meta">
            ${r.material ? `<span>${escapeHtml(r.material)}</span>` : ''}
            ${(r.timesPrinted || r.timesFailed) ? `<span>🖨 ${(r.timesPrinted || 0)}×${r.timesFailed ? ` · ${r.timesFailed} ${escapeHtml(t('plib.failed') || 'failed')}` : ''}</span>` : ''}
          </div>
          ${r.testedNotes ? `<div class="pf-shot-notes">${escapeHtml(r.testedNotes)}</div>` : ''}
        </figcaption>
      </figure>`).join('')}</div>`;
  }

  function renderPrintFiles() {
    const el = document.getElementById('printfiles-tab');
    if (!el) return;
    const hasHub = !!(api() && api().printLibPick);
    const rows = filtered(_query);
    const total = (printFiles || []).length;
    const isGallery = _view === 'gallery';
    el.innerHTML = `
      <div class="pf-wrap">
        <div class="pf-head">
          <div>
            <h2 class="pf-title">${escapeHtml(t('tab.printfiles') || 'Print Files')}</h2>
            <p class="pf-sub">${escapeHtml(t('plib.subtitle') || 'Your STL, 3MF and G-code library — previews, tested settings, open in your slicer.')}</p>
          </div>
          <div class="pf-head-actions">
            <div class="pf-view-toggle" role="group" aria-label="${escapeHtml(t('plib.view') || 'View')}">
              <button class="pf-view-btn ${isGallery ? '' : 'on'}" data-act="pf-view-library" aria-pressed="${!isGallery}">${escapeHtml(t('plib.view_library') || 'Library')}</button>
              <button class="pf-view-btn ${isGallery ? 'on' : ''}" data-act="pf-view-gallery" aria-pressed="${isGallery}">${escapeHtml(t('plib.view_gallery') || 'Gallery')}</button>
            </div>
            ${isGallery ? '' : `<input type="search" id="pfSearch" class="pf-search" placeholder="${escapeHtml(t('common.search') || 'Search')}" value="${escapeHtml(_query)}" aria-label="${escapeHtml(t('common.search') || 'Search')}">`}
            ${typeof openCalibration === 'function' ? `<button class="btn ghost" data-act="pf-calibrate">🎯 ${escapeHtml(t('plib.calibrate') || 'Calibrate')}</button>` : ''}
            <button class="btn primary" data-act="pf-add" ${hasHub ? '' : 'disabled'}>＋ ${escapeHtml(t('plib.add') || 'Add file')}</button>
          </div>
        </div>
        ${!hasHub ? `<div class="pf-empty">${escapeHtml(t('plib.desktop_only') || 'The print-file library is available in the desktop app.')}</div>`
          : isGallery ? galleryHtml()
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
      case 'pf-calibrate': if (typeof openCalibration === 'function') openCalibration(); break;
      case 'pf-slice': openInSlicer(id); break;
      case 'pf-view3d': view3d(id); break;
      case 'pf-edit':  editPrintFile(id); break;
      case 'pf-del':   deletePrintFile(id); break;
      case 'pf-fav':   toggleFav(id); break;
      case 'pf-plan':  { const r = (printFiles || []).find((x) => x.id === id); if (r && typeof openColorPlanner === 'function') openColorPlanner(r); break; }
      case 'pf-convert': convertPrintFile(id); break;
      case 'pf-conv-open': openConvertedInSlicer(id, btn.dataset.fn); break;
      case 'pf-conv-del':  deleteConverted(id, btn.dataset.fn); break;
      case 'pf-log-print': logPrint(id, true); break;
      case 'pf-log-fail':  logPrint(id, false); break;
      case 'pf-view-library': if (_view !== 'library') { _view = 'library'; renderPrintFiles(); } break;
      case 'pf-view-gallery': if (_view !== 'gallery') { _view = 'gallery'; renderPrintFiles(); } break;
    }
  }

  // Short, locale-aware date for the print-history line.
  function fmtPfDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch (e) { return String(iso || '').slice(0, 10); }
  }

  // Print journal: a self-contained tally of successful/failed prints per file
  // (no queue linkage needed). Increments the counter, stamps the date, saves.
  function logPrint(id, ok) {
    const rec = (printFiles || []).find((x) => x.id === id);
    if (!rec) return;
    if (ok) {
      rec.timesPrinted = (rec.timesPrinted || 0) + 1;
      rec.lastPrinted = new Date().toISOString();
      toast(t('plib.logged_print') || 'Logged a print ✓', 'success');
    } else {
      rec.timesFailed = (rec.timesFailed || 0) + 1;
      toast(t('plib.logged_fail') || 'Logged a failed print', 'info');
    }
    saveAll();
    renderPrintFiles();
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

  // ---- 3MF converter integration -------------------------------------------
  // A converted 3MF is written straight into the record's own vault folder (main
  // process), so it lives WITH the print file instead of a random export folder.

  /** Attach a just-converted file (already in this record's vault) to the record. */
  function attachConverted(recordId, meta) {
    const rec = (printFiles || []).find((r) => r.id === recordId); if (!rec) return;
    if (!Array.isArray(rec.converted)) rec.converted = [];
    rec.converted.unshift({
      filename: meta.filename, ext: (meta.ext || '3mf').toLowerCase(), size: meta.size || 0,
      targetId: meta.targetId || '', targetName: meta.targetName || '', createdAt: Date.now(),
    });
    rec.updatedAt = Date.now();
    saveAll();
    renderPrintFiles();
  }

  /** Create a NEW print-file record from a standalone conversion (bytes already in vaultId's folder). */
  async function importConvertedAsNew(meta) {
    const id = meta.vaultId;
    const ext = (meta.ext || '3mf').toLowerCase();
    const baseName = String(meta.sourceName || 'model').replace(/\.[^.]+$/, '');
    const name = meta.targetName ? `${baseName} → ${meta.targetName}` : `${baseName} (${t('conv.convert_short') || 'Converted'})`;
    const rec = {
      id, name, originalName: meta.filename,
      createdAt: Date.now(), updatedAt: Date.now(),
      sourceFile: { filename: meta.filename, originalName: meta.filename, size: meta.size || 0, ext, kind: 'model' },
      parsed: {}, colors: [], swapCount: 0,
      thumb: null, thumbSource: null, userPhoto: null,
      slicerProfileId: null, testedNotes: '', tags: [], material: '', favorite: false, converted: [],
    };
    if (!Array.isArray(printFiles)) printFiles = [];
    printFiles.unshift(rec);
    saveAll();
    renderPrintFiles();
    try {
      const hub = api();
      const files = hub && hub.printLibList ? await hub.printLibList(id) : [];
      const f = (files || []).find((x) => x.filename === meta.filename);
      if (f) enrichPrintFile(rec, f.fullPath);
    } catch (_) { /* thumbnail is best-effort */ }
    if (!meta.noSwitch && typeof switchTab === 'function') switchTab('printfiles-tab');
    return rec;
  }

  async function openConvertedInSlicer(id, filename) {
    const hub = api(); if (!hub || !hub.printLibList) return;
    const files = await hub.printLibList(id);
    const f = (files || []).find((x) => x.filename === filename);
    if (!f) { toast(t('plib.file_missing') || 'File is missing.', 'error'); return; }
    await openInSlicer(id, f.fullPath);
  }

  function deleteConverted(id, filename) {
    const rec = (printFiles || []).find((r) => r.id === id); if (!rec) return;
    const hub = api();
    (async () => {
      try {
        const files = hub && hub.printLibList ? await hub.printLibList(id) : [];
        const f = (files || []).find((x) => x.filename === filename);
        if (f && hub.printLibDelete) await hub.printLibDelete(f.fullPath);
      } catch (_) {}
      rec.converted = (rec.converted || []).filter((c) => c.filename !== filename);
      rec.updatedAt = Date.now();
      saveAll();
      renderPrintFiles();
    })();
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

  async function view3d(id) {
    const rec = (printFiles || []).find((r) => r.id === id); if (!rec) return;
    const hub = api();
    if (!hub || !hub.printLibMesh || typeof openModelViewer !== 'function') return;
    const full = await resolveModelPath(rec);
    if (!full) { toast(t('plib.view3d_nofile') || 'Model file not found.', 'error'); return; }
    let m;
    try { m = await hub.printLibMesh(full); } catch (_) { m = null; }
    if (!m || !m.ok || !m.verts) { toast(t('plib.view3d_nomesh') || 'No 3D geometry in that file.', 'error'); return; }
    openModelViewer({ verts: m.verts, count: m.count, bbox: m.bbox, name: rec.name || rec.sourceFile?.filename || '' });
  }

  async function openInSlicer(id, overrideFull) {
    const rec = (printFiles || []).find((r) => r.id === id); if (!rec) return;
    const hub = api(); if (!hub || !hub.printLibOpenSlicer) return;
    const full = overrideFull || await resolveModelPath(rec);
    if (!full) { toast(t('plib.file_missing') || 'File is missing.', 'error'); return; }
    const slicers = (global.KhaytSlicers ? KhaytSlicers.listSlicers(settings) : []);
    // More than one slicer configured → let the maker pick which to launch.
    if (slicers.length > 1) {
      const preferId = rec.slicerId;
      openFormModal({
        title: t('slicer.pick_title') || 'Choose slicer',
        sizeLg: false, noSave: true,
        bodyHtml: `<p class="pf-pick-hint">${escapeHtml(t('slicer.pick_hint') || 'Open this file with which slicer?')}</p>
          <div class="pf-slicer-list">${slicers.map((s) => `<button type="button" class="btn pf-slicer-pick${s.id === preferId ? ' primary' : ''}" data-slicer-id="${escapeHtml(s.id)}">🖨 ${escapeHtml(s.name)}</button>`).join('')}</div>`,
        onMount(modal) {
          modal.querySelectorAll('[data-slicer-id]').forEach((b) => b.addEventListener('click', async () => {
            const s = slicers.find((x) => x.id === b.dataset.slicerId);
            modal.querySelector('[data-act="cancel"]')?.click();
            await doOpen(rec, full, s);
          }));
        },
      });
      return;
    }
    await doOpen(rec, full, (global.KhaytSlicers ? KhaytSlicers.defaultSlicer(settings) : null));
  }

  async function doOpen(rec, full, slicer) {
    const hub = api(); if (!hub || !hub.printLibOpenSlicer) return;
    const slicerPath = slicer ? slicer.path : ((settings.slicer && settings.slicer.path) || '');
    // Remember the maker's choice on the file so next time it's pre-highlighted.
    if (slicer && slicer.id && rec.slicerId !== slicer.id) { rec.slicerId = slicer.id; rec.updatedAt = Date.now(); saveAll(); }
    const r = await hub.printLibOpenSlicer(full, slicerPath);
    if (!r || !r.ok) toast((r && r.error) || (t('plib.open_failed') || 'Could not open the file.'), 'error');
    else if (r.opened === 'slicer') toast((t('plib.opened_slicer') || 'Opened in your slicer.') + (slicer ? ` (${slicer.name})` : ''), 'success');
    else toast(t('plib.opened_os') || 'Opened. Set a slicer path in Settings → Printers to open there.', 'info', 4200);
  }

  async function convertPrintFile(id) {
    const rec = (printFiles || []).find((r) => r.id === id); if (!rec) return;
    if (typeof openConverter !== 'function') { toast(t('conv.desktop_only') || 'The converter is available in the desktop app.', 'error'); return; }
    const full = await resolveModelPath(rec);
    if (!full) { toast(t('plib.file_missing') || 'File is missing.', 'error'); return; }
    openConverter({ path: full, name: rec.originalName || rec.name || 'model.3mf', recordId: rec.id });
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

  const pub = { renderPrintFiles, addPrintFile, openInSlicer, editPrintFile, deletePrintFile, attachConverted, importConvertedAsNew };
  Object.assign(global, pub);
  global.KhaytPrintFiles = pub;
  if (typeof module !== 'undefined' && module.exports) module.exports = pub;
})(typeof globalThis !== 'undefined' ? globalThis : this);
