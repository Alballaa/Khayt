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
  const EXT_ICON_NAME = { stl: 'cube', obj: 'cube', '3mf': 'colour', gcode: 'doc', gco: 'doc' };
  // Bed Ready swaps emoji markers for its bespoke drafting glyphs; Khayt keeps the emoji.
  const _BDR = (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset.app === 'bedready');
  const _bi = (name, glyph, size) => (_BDR && window.BedReadyIcons)
    ? `<span class="pf-ico" aria-hidden="true">${window.BedReadyIcons.get(name, size || 15)}</span>`
    : (glyph ? glyph + ' ' : '');

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
    let rows = q
      ? list.filter((r) => (r.name + ' ' + (r.originalName || '') + ' ' + (r.tags || []).join(' ') + ' ' + (r.material || '')).toLowerCase().includes(q))
      : list.slice();
    if (_tagFilter) rows = rows.filter((r) => (r.tags || []).some((tg) => tg.toLowerCase() === _tagFilter.toLowerCase()));
    if (_folderFilter === UNFILED) rows = rows.filter((r) => !r.folder);
    else if (_folderFilter) rows = rows.filter((r) => (r.folder || '').toLowerCase() === _folderFilter.toLowerCase());
    return rows.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  // Distinct folders (single-assignment collections), alphabetical, with counts. Files with no folder
  // fall under an "Unfiled" bucket shown only when some files ARE filed.
  function allFolders() {
    const counts = new Map();
    let unfiled = 0;
    for (const r of (printFiles || [])) {
      const f = (r.folder || '').trim();
      if (f) counts.set(f, (counts.get(f) || 0) + 1);
      else unfiled++;
    }
    return { folders: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])), unfiled };
  }

  function folderOptions() {
    const names = [...new Set((printFiles || []).map((r) => (r.folder || '').trim()).filter(Boolean))].sort();
    return names.map((f) => `<option value="${escapeHtml(f)}"></option>`).join('');
  }

  function folderBarHtml() {
    const { folders, unfiled } = allFolders();
    if (!folders.length) return ''; // nothing filed yet → no bar
    const total = (printFiles || []).length;
    const chip = (val, label, n, on) =>
      `<button type="button" class="pf-folderchip ${on ? 'on' : ''}" data-act="pf-folder" data-folder="${escapeHtml(val)}">${escapeHtml(label)}${n != null ? ` <span class="pf-tagchip-n">${n}</span>` : ''}</button>`;
    let html = chip('', t('plib.all_files') || 'All files', total, !_folderFilter);
    html += folders.map(([f, n]) => chip(f, f, n, _folderFilter && _folderFilter.toLowerCase() === f.toLowerCase())).join('');
    if (unfiled) html += chip(UNFILED, t('plib.unfiled') || 'Unfiled', unfiled, _folderFilter === UNFILED);
    return `<div class="pf-folderbar" role="group" aria-label="${escapeHtml(t('plib.filter_folders') || 'Filter by folder')}">${html}</div>`;
  }

  // Distinct tags across all files, most-used first, for the filter bar.
  function allTags() {
    const counts = new Map();
    for (const r of (printFiles || [])) for (const tg of (r.tags || [])) {
      const key = String(tg).trim();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function tagBarHtml() {
    const tags = allTags();
    if (!tags.length) return '';
    const chips = tags.map(([tg, n]) =>
      `<button type="button" class="pf-tagchip ${_tagFilter && _tagFilter.toLowerCase() === tg.toLowerCase() ? 'on' : ''}" data-act="pf-tag" data-tag="${escapeHtml(tg)}">${escapeHtml(tg)} <span class="pf-tagchip-n">${n}</span></button>`).join('');
    const clear = _tagFilter ? `<button type="button" class="pf-tagchip pf-tagclear" data-act="pf-tag-clear">✕ ${escapeHtml(t('plib.tag_clear') || 'Clear')}</button>` : '';
    return `<div class="pf-tagbar" role="group" aria-label="${escapeHtml(t('plib.filter_tags') || 'Filter by tag')}">${chips}${clear}</div>`;
  }

  /* Is there a cloud to sync to? Same test Settings uses. A sync button with
   * nowhere to send anything is worse than no button — it looks broken. */
  /**
   * Push the library to the cloud now.
   *
   * Sync already runs on a schedule; this is for the moment a shop has just
   * added files and wants them somewhere safe before closing the laptop —
   * asked for as "why do I need to sync by going to settings?". It says what
   * happened either way, because a silent button is indistinguishable from a
   * broken one.
   */
  async function syncLibraryNow() {
    const cs = _cloudSync();
    if (!cs) return;
    try {
      await cs.syncNow();
      toast(t('plib.synced') || 'Library synced to Khayt Cloud.', 'success');
    } catch (e) {
      console.error('library sync failed', e);
      toast((t('plib.sync_failed') || 'Could not sync') + (e && e.message ? ` — ${e.message}` : ''), 'error', 6000);
    }
  }

  /* An accessor, never a bare global. Bed Ready shares this screen and does not
   * ship cloud sync, so reading the name directly is a ReferenceError waiting
   * for whoever opens the library there — the same rule the rest of this file
   * already follows for its optional modules. */
  function _cloudSync() {
    return (typeof globalThis !== 'undefined' && globalThis.KhaytCloudSync) || null;
  }
  function _cloudOn() {
    const c = (typeof settings !== 'undefined' && settings && settings.cloud) || {};
    return !!(c.enabled && c.url && c.shopId && _cloudSync());
  }

  function thumbHtml(rec) {
    const src = rec.thumb || rec.userPhoto || null;
    if (src) return `<img class="pf-thumb" src="${safeImageSrc(src)}" alt="" loading="lazy">`;
    const ext = rec.sourceFile?.ext;
    const ico = (_BDR && window.BedReadyIcons)
      ? window.BedReadyIcons.get(EXT_ICON_NAME[ext] || 'cube', 44)
      : (EXT_ICON[ext] || '📦');
    /* Say WHY there is no picture.
     *
     * Khayt never renders a model to make one: it lifts the preview the slicer
     * already embedded (a PNG block in gcode, Metadata/*.png in a 3MF), and
     * renders STL separately. So a card with no preview means one of two quite
     * different things, and a bare box says neither — reported as "why in
     * printfile every file has a box as an image, isn't it supposed to load the
     * 3D file?"
     *
     * `sourceFile: null` is a record with no file on this computer at all —
     * every one built by importing a printer's job history, which carries names,
     * times and weights and no geometry. There is nothing to preview and never
     * was. The other case is a real file whose slicer embedded no thumbnail. */
    const why = rec.sourceFile
      ? (t('plib.no_preview') || 'This file has no preview embedded by the slicer.')
      : (t('plib.no_file') || 'No file on this computer — this record came from the printer\'s own history, so there is nothing to preview.');
    return `<div class="pf-thumb pf-thumb-icon" title="${escapeHtml(why)}">${ico}</div>`;
  }

  function colorDotsHtml(rec) {
    if (!Array.isArray(rec.colors) || !rec.colors.length) return '';
    const cols = rec.colors.slice(0, 8);
    // Bed Ready shows colours as CAD layer-index chips (real filament colour + index-coded hairline
    // + a mono L-number) instead of a rainbow of dots — the Cyanotype Draft "layer index" device.
    const dots = _BDR
      ? cols.map((c, i) => `<span class="pf-lchip" title="${escapeHtml(c.label || c.hex)}${c.grams ? ' · ' + c.grams + ' g' : ''}"><span class="pf-lchip-sw" style="background:${escapeHtml(c.hex)};border-color:var(--l${(i % 6) + 1})"></span><span class="pf-lchip-n">L${i + 1}</span></span>`).join('')
      : cols.map((c) => `<span class="pf-dot" title="${escapeHtml(c.label || c.hex)}${c.grams ? ' · ' + c.grams + ' g' : ''}" style="background:${escapeHtml(c.hex)}"></span>`).join('');
    const swap = rec.swapCount > 0 ? `<span class="pf-chip">↔ ${rec.swapCount} ${escapeHtml(t('plib.swaps') || 'swaps')}</span>` : '';
    return `<div class="pf-colors">${dots}${swap}</div>`;
  }

  function metaChips(rec) {
    const p = rec.parsed || {};
    const chips = [];
    const ext = rec.sourceFile?.ext; if (ext) chips.push(ext.toUpperCase());
    const tm = fmtTime(p.printTimeMins); if (tm) chips.push((_BDR ? '' : '⏱ ') + tm);
    if (p.filamentGrams) chips.push((_BDR ? '' : '⛁ ') + Math.round(p.filamentGrams) + ' g');
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
          ${prof ? `<div class="pf-prof">${_bi('nozzle', '🛠')}${escapeHtml(prof.name)}</div>` : ''}
          ${rec.testedNotes ? `<div class="pf-notes">${escapeHtml(rec.testedNotes)}</div>` : ''}
          ${(rec.folder || (Array.isArray(rec.tags) && rec.tags.length)) ? `<div class="pf-tags">${rec.folder ? `<button type="button" class="pf-folder ${_folderFilter && _folderFilter.toLowerCase() === String(rec.folder).toLowerCase() ? 'on' : ''}" data-act="pf-folder" data-folder="${escapeHtml(rec.folder)}" title="${escapeHtml(t('plib.folder') || 'Folder')}">${_bi('folder', '🗂')}${escapeHtml(rec.folder)}</button>` : ''}${(rec.tags || []).map((tg) => `<button type="button" class="pf-tag ${_tagFilter && _tagFilter.toLowerCase() === String(tg).toLowerCase() ? 'on' : ''}" data-act="pf-tag" data-tag="${escapeHtml(tg)}">${escapeHtml(tg)}</button>`).join('')}</div>` : ''}
          ${duplicateLine(rec)}
          ${recommendedLine(rec)}
          ${(rec.timesPrinted || rec.timesFailed) ? `<div class="pf-history" title="${escapeHtml(t('plib.history_title') || 'Print history')}">${_bi('printer', '🖨')}${(rec.timesPrinted || 0)}× ${escapeHtml(t('plib.printed') || 'printed')}${rec.timesFailed ? ` · ${rec.timesFailed} ${escapeHtml(t('plib.failed') || 'failed')}` : ''}${rec.lastPrinted ? ` · ${escapeHtml(t('plib.last') || 'last')} ${escapeHtml(fmtPfDate(rec.lastPrinted))}` : ''}</div>` : ''}
          ${Array.isArray(rec.converted) && rec.converted.length ? `<div class="pf-converted">${rec.converted.map((c) => `
            <div class="pf-conv-row">
              <span class="pf-conv-name" title="${escapeHtml(c.filename)}">${_bi('convert', '🔄')}${escapeHtml(c.targetName || c.targetId || (t('conv.convert_short') || 'Converted'))}</span>
              <button class="btn small ghost" data-act="pf-conv-open" data-id="${escapeHtml(rec.id)}" data-fn="${escapeHtml(c.filename)}" title="${escapeHtml(t('plib.open_slicer') || 'Open in slicer')}">${_bi('printer', '🖨')}</button>
              <button class="btn small ghost danger" data-act="pf-conv-del" data-id="${escapeHtml(rec.id)}" data-fn="${escapeHtml(c.filename)}" aria-label="${escapeHtml(t('common.delete') || 'Delete')}" title="${escapeHtml(t('common.delete') || 'Delete')}">${_bi('trash', '🗑')}</button>
            </div>`).join('')}</div>` : ''}
        </div>
        <div class="pf-actions">
          <button class="btn small primary" data-act="pf-slice" data-id="${escapeHtml(rec.id)}">${_bi('printer', '🖨')}${escapeHtml(t('plib.open_slicer') || 'Open in slicer')}</button>
          <button class="btn small ghost" data-act="pf-setups" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('setup.title') || 'Settings that worked')}">${_bi('nozzle', '🛠')}${escapeHtml(t('setup.short') || 'Setups')}</button>
          ${!rec.geometryKey ? `<button class="btn small ghost" data-act="pf-identify" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('plib.identify_hint') || 'Let Khayt recognise this model when you print it again')}">${_bi('search', '🔎')}${escapeHtml(t('plib.identify') || 'Identify')}</button>` : ''}
          ${typeof openModelViewer === 'function' && /^(stl|3mf)$/i.test(rec.sourceFile?.ext || '') ? `<button class="btn small ghost" data-act="pf-view3d" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('plib.view3d') || 'View in 3D')}">${_bi('cube', '🧊')}${escapeHtml(t('plib.view3d_short') || '3D')}</button>` : ''}
          <button class="btn small ghost" data-act="pf-log-print" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('plib.log_print') || 'Log a successful print')}">✓ ${escapeHtml(t('plib.log_print_short') || 'Printed')}</button>
          <button class="btn small ghost" data-act="pf-log-fail" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('plib.log_fail') || 'Log a failed print')}" aria-label="${escapeHtml(t('plib.log_fail') || 'Log a failed print')}">✗</button>
          ${Array.isArray(rec.colors) && rec.colors.filter((c) => c && c.hex).length > 1 ? `<button class="btn small ghost" data-act="pf-plan" data-id="${escapeHtml(rec.id)}">${_bi('colour', '🎨')}${escapeHtml(t('plan.title') || 'Plan colours')}</button>` : ''}
          ${rec.sourceFile?.ext === '3mf' ? `<button class="btn small ghost" data-act="pf-convert" data-id="${escapeHtml(rec.id)}">${_bi('convert', '🔄')}${escapeHtml(t('conv.convert_short') || 'Convert')}</button>` : ''}
          <button class="btn small ghost" data-act="pf-edit" data-id="${escapeHtml(rec.id)}">${escapeHtml(t('common.edit') || 'Edit')}</button>
          <button class="btn small ghost danger" data-act="pf-del" data-id="${escapeHtml(rec.id)}" title="${escapeHtml(t('common.delete') || 'Delete')}">${_bi('trash', '🗑')}</button>
        </div>
      </div>`;
  }

  let _query = '';
  let _tagFilter = ''; // active tag filter (empty = all)
  const UNFILED = '\u0000unfiled'; // sentinel: files with no folder
  let _folderFilter = ''; // '' = all, UNFILED = no folder, else folder name
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
            ${(r.timesPrinted || r.timesFailed) ? `<span>${_bi('printer', '🖨')}${(r.timesPrinted || 0)}×${r.timesFailed ? ` · ${r.timesFailed} ${escapeHtml(t('plib.failed') || 'failed')}` : ''}</span>` : ''}
          </div>
          ${r.testedNotes ? `<div class="pf-shot-notes">${escapeHtml(r.testedNotes)}</div>` : ''}
        </figcaption>
      </figure>`).join('')}</div>`;
  }

  // Inner HTML of the results area only (grid / gallery / empty state). Kept separate from the
  // header + search box so a keystroke re-renders just the list, leaving the <input> — and its
  // caret — untouched.
  // Drop a folder/tag filter that no longer matches any file (e.g. its last file was re-foldered or
  // deleted) so the grid can't get stuck on an empty, unclearable filter.
  function normalizeFilters() {
    const list = printFiles || [];
    if (_folderFilter === UNFILED) { if (!list.some((r) => !r.folder)) _folderFilter = ''; }
    else if (_folderFilter && !list.some((r) => (r.folder || '').toLowerCase() === _folderFilter.toLowerCase())) _folderFilter = '';
    if (_tagFilter && !list.some((r) => (r.tags || []).some((tg) => tg.toLowerCase() === _tagFilter.toLowerCase()))) _tagFilter = '';
  }

  function listInnerHtml() {
    normalizeFilters();
    const hasHub = !!(api() && api().printLibPick);
    const isGallery = _view === 'gallery';
    const rows = filtered(_query);
    const total = (printFiles || []).length;
    if (!hasHub) return `<div class="pf-empty">${escapeHtml(t('plib.desktop_only') || 'The print-file library is available in the desktop app.')}</div>`;
    if (isGallery) return galleryHtml();
    const grid = rows.length
      ? `<div class="pf-grid">${rows.map(cardHtml).join('')}</div>`
      : `<div class="pf-empty">${escapeHtml(total ? ((_tagFilter || _folderFilter) ? (t('plib.no_filter_match') || 'No files match this filter.') : (t('plib.no_match') || 'No files match your search.')) : (t('plib.empty') || 'No print files yet. Add your first STL, 3MF or G-code file.'))}</div>`;
    return folderBarHtml() + tagBarHtml() + grid;
  }

  function renderList() {
    const list = document.getElementById('pfList');
    if (list) list.innerHTML = listInnerHtml();
  }

  function renderPrintFiles() {
    const el = document.getElementById('printfiles-tab');
    if (!el) return;
    wirePfDrop();
    const hasHub = !!(api() && api().printLibPick);
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
            ${typeof openCalibration === 'function' ? `<button class="btn ghost" data-act="pf-calibrate">${_bi('target', '🎯')}${escapeHtml(t('plib.calibrate') || 'Calibrate')}</button>` : ''}
            ${_cloudOn() ? `<button class="btn ghost" data-act="pf-sync" title="${escapeHtml(t('plib.sync_hint') || 'Push this library to Khayt Cloud now, instead of waiting for the next automatic sync.')}">${_bi('cloud', '☁')}${escapeHtml(t('plib.sync') || 'Sync')}</button>` : ''}
            <button class="btn primary" data-act="pf-add" ${hasHub ? '' : 'disabled'} title="${escapeHtml(t('plib.add_multi_hint') || 'Add one or more files — select several at once')}">＋ ${escapeHtml(t('plib.add') || 'Add file')}</button>
          </div>
        </div>
        <div id="pfList">${listInnerHtml()}</div>
      </div>`;

    el.onclick = onClick;
    const search = document.getElementById('pfSearch');
    if (search) search.oninput = (e) => { _query = e.target.value; renderList(); };
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
      case 'pf-add':   addPrintFile(); break;
      case 'pf-sync':  syncLibraryNow(); break;
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
      case 'pf-setups': openSetups(id); break;
      case 'pf-identify': identifyPrintFile(id); break;
      case 'pf-log-print': logPrint(id, true); break;
      case 'pf-log-fail':  logPrint(id, false); break;
      case 'pf-view-library': if (_view !== 'library') { _view = 'library'; renderPrintFiles(); } break;
      case 'pf-view-gallery': if (_view !== 'gallery') { _view = 'gallery'; renderPrintFiles(); } break;
      case 'pf-tag': { const tg = btn.dataset.tag || ''; _tagFilter = (_tagFilter.toLowerCase() === tg.toLowerCase()) ? '' : tg; renderList(); break; }
      case 'pf-tag-clear': _tagFilter = ''; renderList(); break;
      case 'pf-folder': { const fv = btn.dataset.folder || ''; _folderFilter = (_folderFilter === fv) ? '' : fv; renderList(); break; }
    }
  }

  // Short, locale-aware date for the print-history line.
  function fmtPfDate(iso) {
    try { return new Date(iso).toLocaleDateString(localeTag(), { month: 'short', day: 'numeric' }); }
    catch (e) { return String(iso || '').slice(0, 10); }
  }

  /* ---- Do we already have this? (R6) ------------------------------------
   * A repeat customer sends the same bracket they sent in March. Without this
   * it becomes a second library entry with none of the first one's history —
   * and the shop re-slices a part it already has a known-good setup and a
   * measured cost for.
   *
   * Identical bytes is a certainty. Identical geometry is a hint, and is worded
   * as one: presenting the second as the first would eventually merge two
   * different customers' parts.
   * ---------------------------------------------------------------------- */
  const MI = () => (typeof globalThis !== 'undefined' && globalThis.KhaytModelIdentity) || null;

  function matchesFor(rec) {
    const mi = MI();
    if (!mi || !rec) return { exact: [], similar: [] };
    return mi.findMatches(printFiles || [], rec);
  }

  function warnIfAlreadyHave(rec) {
    const { exact } = matchesFor(rec);
    if (!exact.length) return;
    const twin = exact[0];
    openFormModal({
      title: t('dup.title') || 'You already have this file',
      saveLabel: t('dup.open') || 'Open the one I have',
      sizeLg: false,
      bodyHtml: `
        <p style="margin:0 0 10px;">${escapeHtml(
          (t('dup.body') || 'This is byte-for-byte the same file as “{name}”, added {when}.')
            .replace('{name}', twin.name || twin.originalName || '')
            .replace('{when}', twin.createdAt ? fmtPfDate(new Date(twin.createdAt).toISOString()) : ''))}</p>
        <p style="margin:0 0 12px;font-size:13px;color:var(--text-muted);">${escapeHtml(
          t('dup.why') || 'The one you already have carries its print history and the settings that worked for it. The new copy carries none of that.')}</p>
        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
          <input type="checkbox" id="dupRemove" checked style="width:auto;margin:3px 0 0;">
          <span style="font-weight:400;">${escapeHtml(t('dup.remove') || 'Remove the copy I just added')}</span>
        </label>`,
      onSave(modal) {
        // Removing is the default but never automatic — a shop may genuinely
        // want two entries for the same bytes (two customers, two jobs).
        if (modal.querySelector('#dupRemove')?.checked) {
          const at = (printFiles || []).findIndex((x) => x.id === rec.id);
          if (at !== -1) printFiles.splice(at, 1);
          saveAll();
        }
        renderPrintFiles();
        return true;
      },
    });
  }

  /** A line on the card when this file has a twin, or something close to one. */
  function duplicateLine(rec) {
    const { exact, similar } = matchesFor(rec);
    if (exact.length) {
      return `<div class="pf-dup" style="font-size:11px;color:var(--warn,#b45309);">${escapeHtml(
        (t('dup.badge') || 'Same file as “{name}”').replace('{name}', exact[0].name || exact[0].originalName || ''))}</div>`;
    }
    if (similar.length) {
      // Deliberately hedged. This is a hint, not a fact.
      return `<div class="pf-dup" style="font-size:11px;color:var(--text-muted);">${escapeHtml(
        (t('dup.similar') || 'Looks like “{name}”').replace('{name}', similar[0].name || similar[0].originalName || ''))}</div>`;
    }
    return '';
  }

  /* ---- Settings that worked (R4) ---------------------------------------
   * A file's print tally said it had worked, never with WHAT. A setup is one
   * combination of machine, material and the two numbers that decide most
   * outcomes, plus its own record. The rules — what counts as trustworthy, and
   * which one to reach for — live in lib/print-setups.js so they can be tested.
   * -------------------------------------------------------------------- */
  const PS = () => (typeof globalThis !== 'undefined' && globalThis.KhaytPrintSetups) || null;

  function setupsOf(rec) {
    return Array.isArray(rec && rec.setups) ? rec.setups : [];
  }

  function machineNameFor(setup) {
    const m = (typeof machines !== 'undefined' ? machines : []).find((x) => x && x.id === (setup && setup.machineId));
    return (m && m.name) || (setup && setup.machineName) || '';
  }

  const STATUS_LABEL = {
    'known-good': () => t('setup.known_good') || 'Known good',
    'needs-test': () => t('setup.needs_test') || 'Needs testing',
    failed:       () => t('setup.failed') || 'Failed',
  };
  const STATUS_COLOR = {
    'known-good': 'var(--ok,#159d68)',
    'needs-test': 'var(--warn,#b45309)',
    failed:       'var(--danger,#e0492f)',
  };

  function statusBadge(setup) {
    const ps = PS(); if (!ps) return '';
    const st = ps.statusOf(setup);
    const label = (STATUS_LABEL[st] || (() => st))();
    return `<span style="font-size:11px;font-weight:600;color:${STATUS_COLOR[st] || 'inherit'};">${escapeHtml(label)}</span>`;
  }

  /** The one-line "use this" hint on a file's card. */
  function recommendedLine(rec) {
    const ps = PS(); if (!ps) return '';
    const setups = setupsOf(rec);
    if (!setups.length) return '';
    const best = ps.recommendSetup(setups);
    if (!best) {
      // Every recorded setup has failed. Saying nothing here would leave a shop
      // to rediscover that by wasting another spool.
      return `<div class="pf-setup" style="font-size:11px;color:var(--danger,#e0492f);">${escapeHtml(
        t('setup.none_good') || 'No setup has worked yet')}</div>`;
    }
    const desc = ps.describeSetup(best, machineNameFor(best)) || (best.name || '');
    const okN = best.ok || 0;
    const tail = okN
      ? ` · ${okN}× ${escapeHtml(t('plib.printed') || 'printed')}${best.failed ? ` · ${best.failed} ${escapeHtml(t('plib.failed') || 'failed')}` : ''}`
      : ` · ${escapeHtml(t('setup.untried') || 'not tried yet')}`;
    return `<div class="pf-setup" style="font-size:11px;color:var(--text-muted);">${statusBadge(best)} ${escapeHtml(desc)}${tail}</div>`;
  }

  function setupRowHtml(rec, setup) {
    const ps = PS();
    const desc = ps.describeSetup(setup, machineNameFor(setup)) || (setup.name || '—');
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(setup.name || desc || '—')}</div>
        <div style="font-size:11px;color:var(--text-muted);">${statusBadge(setup)} · ${escapeHtml(desc)} · ${setup.ok || 0}✓ ${setup.failed || 0}✗</div>
        ${setup.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escapeHtml(setup.notes)}</div>` : ''}
      </div>
      <button class="btn small ghost" data-sact="ok" data-sid="${escapeHtml(setup.id)}" title="${escapeHtml(t('setup.log_ok') || 'Log a good print')}">✓</button>
      <button class="btn small ghost" data-sact="fail" data-sid="${escapeHtml(setup.id)}" title="${escapeHtml(t('setup.log_fail') || 'Log a failure')}">✗</button>
      <button class="btn small ghost" data-sact="edit" data-sid="${escapeHtml(setup.id)}" title="${escapeHtml(t('common.edit') || 'Edit')}">✎</button>
      <button class="btn small ghost danger" data-sact="del" data-sid="${escapeHtml(setup.id)}" title="${escapeHtml(t('common.delete') || 'Delete')}">🗑</button>
    </div>`;
  }

  function openSetups(id) {
    const rec = (printFiles || []).find((r) => r.id === id); if (!rec) return;
    const ps = PS(); if (!ps) return;
    if (!Array.isArray(rec.setups)) rec.setups = [];

    const body = () => {
      const list = rec.setups.length
        ? rec.setups.map((su) => setupRowHtml(rec, su)).join('')
        : `<p style="color:var(--text-muted);font-size:13px;margin:12px 0;">${escapeHtml(
            t('setup.empty') || 'No setups recorded yet. Add the settings you printed this with, then log how it went.')}</p>`;
      return `<div id="pfSetupList">${list}</div>
        <button class="btn small" data-sact="add" style="margin-top:6px;">${escapeHtml(t('setup.add') || '＋ Add a setup')}</button>`;
    };

    openFormModal({
      title: t('setup.title') || 'Settings that worked',
      sizeLg: true,
      noSave: true,
      bodyHtml: body(),
      onMount(modal) {
        const redraw = () => {
          const host = modal.querySelector('#pfSetupList');
          if (host) host.innerHTML = rec.setups.length
            ? rec.setups.map((su) => setupRowHtml(rec, su)).join('')
            : `<p style="color:var(--text-muted);font-size:13px;margin:12px 0;">${escapeHtml(
                t('setup.empty') || 'No setups recorded yet. Add the settings you printed this with, then log how it went.')}</p>`;
          saveAll();
          renderPrintFiles();
        };
        modal.addEventListener('click', (e) => {
          const b = e.target.closest('[data-sact]'); if (!b) return;
          const sid = b.dataset.sid;
          const at = rec.setups.findIndex((x) => x.id === sid);
          if (b.dataset.sact === 'add') { editSetup(rec, null, redraw); return; }
          if (at === -1) return;
          if (b.dataset.sact === 'ok')   { rec.setups[at] = ps.recordOutcome(rec.setups[at], true,  new Date().toISOString()); redraw(); return; }
          if (b.dataset.sact === 'fail') { rec.setups[at] = ps.recordOutcome(rec.setups[at], false, new Date().toISOString()); redraw(); return; }
          if (b.dataset.sact === 'edit') { editSetup(rec, rec.setups[at], redraw); return; }
          if (b.dataset.sact === 'del')  { rec.setups.splice(at, 1); redraw(); }
        });
      },
    });
  }

  function editSetup(rec, existing, done) {
    const ps = PS(); if (!ps) return;
    const su = existing || {};
    const machineOpts = (typeof machines !== 'undefined' ? machines : []).map((m) =>
      `<option value="${escapeHtml(m.id)}"${su.machineId === m.id ? ' selected' : ''}>${escapeHtml(m.name || m.id)}</option>`).join('');
    const statusOpts = ['', 'known-good', 'needs-test', 'failed'].map((v) =>
      `<option value="${v}"${(su.status || '') === v ? ' selected' : ''}>${escapeHtml(
        v ? (STATUS_LABEL[v] || (() => v))() : (t('setup.status_auto') || 'From the record'))}</option>`).join('');

    openFormModal({
      title: existing ? (t('setup.edit') || 'Edit setup') : (t('setup.add_title') || 'Add a setup'),
      saveLabel: t('common.save') || 'Save',
      bodyHtml: `
        <label>${escapeHtml(t('setup.name') || 'Name')}</label>
        <input type="text" id="suName" value="${escapeHtml(su.name || '')}" placeholder="${escapeHtml(t('setup.name_ph') || 'e.g. Draft on the MK4')}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
          <div>
            <label>${escapeHtml(t('setup.machine') || 'Printer')}</label>
            <select id="suMachine"><option value="">— ${escapeHtml(t('common.none') || 'None')} —</option>${machineOpts}</select>
          </div>
          <div>
            <label>${escapeHtml(t('plib.material') || 'Material')}</label>
            <input type="text" id="suMaterial" value="${escapeHtml(su.material || '')}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;">
          <div>
            <label>${escapeHtml(t('setup.colour') || 'Colour')}</label>
            <input type="text" id="suColour" value="${escapeHtml(su.colour || '')}">
          </div>
          <div>
            <label>${escapeHtml(t('setup.layer') || 'Layer height (mm)')}</label>
            <input type="number" id="suLayer" step="0.01" min="0" value="${su.layerHeightMm || ''}">
          </div>
          <div>
            <label>${escapeHtml(t('setup.nozzle') || 'Nozzle (mm)')}</label>
            <input type="number" id="suNozzle" step="0.1" min="0" value="${su.nozzleMm || ''}">
          </div>
        </div>
        <label style="margin-top:10px;">${escapeHtml(t('setup.status') || 'Verdict')}</label>
        <select id="suStatus">${statusOpts}</select>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${escapeHtml(
          t('setup.status_hint') || 'Leave on "From the record" and Khayt works it out from how the prints went.')}</div>
        <label style="margin-top:10px;">${escapeHtml(t('setup.notes') || 'Notes')}</label>
        <textarea id="suNotes" rows="2">${escapeHtml(su.notes || '')}</textarea>`,
      onSave(modal) {
        const numOf = (sel) => {
          const v = parseFloat(modal.querySelector(sel)?.value);
          return Number.isFinite(v) && v > 0 ? v : 0;
        };
        const next = Object.assign({}, su, {
          id: su.id || (typeof uid === 'function' ? uid('SETUP') : `SETUP-${Date.now().toString(36)}`),
          createdAt: su.createdAt || new Date().toISOString(),
          name: modal.querySelector('#suName')?.value.trim() || '',
          machineId: modal.querySelector('#suMachine')?.value || '',
          material: modal.querySelector('#suMaterial')?.value.trim() || '',
          colour: modal.querySelector('#suColour')?.value.trim() || '',
          layerHeightMm: numOf('#suLayer'),
          nozzleMm: numOf('#suNozzle'),
          status: modal.querySelector('#suStatus')?.value || null,
          notes: modal.querySelector('#suNotes')?.value.trim() || '',
          ok: su.ok || 0,
          failed: su.failed || 0,
        });
        if (!Array.isArray(rec.setups)) rec.setups = [];
        const at = rec.setups.findIndex((x) => x.id === next.id);
        if (at === -1) rec.setups.push(next); else rec.setups[at] = next;
        saveAll();
        if (typeof done === 'function') done();
        // Reopen the list the shop came from, rather than dropping them back to
        // the grid having lost their place. Deferred because we are INSIDE
        // onSave: openFormModal empties the shared #modalMount as it closes, so
        // a modal opened synchronously here is destroyed a moment later. This
        // codebase has shipped that bug before.
        setTimeout(() => openSetups(rec.id), 0);
        return true;
      },
    });
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

  // Build + persist a record from a copied-in file (shape from printLibPick / printLibCopyPath).
  function ingestPicked(id, picked) {
    const ext = (picked.ext || '').toLowerCase();
    const rec = {
      id,
      name: (picked.originalName || 'Untitled').replace(/\.[^.]+$/, ''),
      originalName: picked.originalName,
      createdAt: Date.now(), updatedAt: Date.now(),
      sourceFile: { filename: picked.filename, originalName: picked.originalName, size: picked.size, ext, kind: /^(stl|3mf|obj)$/.test(ext) ? 'model' : 'gcode' },
      parsed: {}, colors: [], swapCount: 0,
      thumb: null, thumbSource: null, userPhoto: null,
      slicerProfileId: null, testedNotes: '', tags: [], folder: '', material: '', favorite: false,
      // Identity, so a file the shop already has is recognised rather than
      // becoming a second entry with none of the first one's history.
      contentHash: picked.contentHash || null, geometryKey: null,
    };
    if (!Array.isArray(printFiles)) printFiles = [];
    printFiles.unshift(rec);
    saveAll();
    renderPrintFiles();
    // The hash is known now; the geometry key only after parsing.
    warnIfAlreadyHave(rec);
    enrichPrintFile(rec, picked.fullPath);
    return rec;
  }

  /**
   * Work out what an existing entry is, after the fact.
   *
   * Identity was only ever computed while CREATING a record, so an entry that
   * arrived without one could never gain one: dropping the model into the
   * calculator does not touch the library, and editing an entry does not look at
   * its file. Entries reconstructed from print history, and every 3MF imported
   * before the line above existed, were therefore permanently unrecognisable —
   * and an unrecognisable entry is one the calculator can never link a part to,
   * which is what keeps per-file calibration out of reach.
   *
   * Two cases, one action:
   *   the entry already has a file  -> re-read it; nothing to ask the shop
   *   the entry has no file at all  -> ask for one, copy it into the entry's own
   *                                    vault, then read it
   */
  async function identifyPrintFile(id) {
    const hub = api(); if (!hub) return;
    const rec = (printFiles || []).find((r) => r && r.id === id);
    if (!rec) return;

    let fullPath = await resolveModelPath(rec);
    if (!fullPath) {
      if (!hub.printLibPick) return;
      let picked;
      try { picked = await hub.printLibPick(id); } catch (err) { toast(String(err.message || err), 'error'); return; }
      if (!picked) return;                       // cancelled
      const ext = (picked.ext || '').toLowerCase();
      rec.sourceFile = {
        filename: picked.filename, originalName: picked.originalName,
        size: picked.size, ext, kind: /^(stl|3mf|obj)$/.test(ext) ? 'model' : 'gcode',
      };
      if (!rec.originalName) rec.originalName = picked.originalName;
      rec.contentHash = picked.contentHash || null;
      fullPath = picked.fullPath;
    }
    // Cleared rather than kept: whatever is on the record describes some earlier
    // file, and a stale key is worse than none — it would match the wrong model.
    rec.geometryKey = null;
    rec.updatedAt = Date.now();
    saveAll();
    renderPrintFiles();
    await enrichPrintFile(rec, fullPath);
    toast(rec.geometryKey
      ? (t('plib.identified') || 'Khayt can recognise this model now')
      : (t('plib.identify_failed') || 'Read the file, but could not measure a shape from it'),
      rec.geometryKey ? 'success' : 'warning');
  }

  async function addPrintFile() {
    const hub = api(); if (!hub) return;
    // Prefer the multi-select picker (bulk import); each file is copied into its own record's vault via
    // the same path-ingest as drag-and-drop. Fall back to the single picker on an older main process.
    if (hub.printLibPickMulti) {
      let res;
      try { res = await hub.printLibPickMulti(); } catch (err) { toast(String(err.message || err), 'error'); return; }
      if (!res || !res.ok || !Array.isArray(res.paths) || !res.paths.length) return;
      await addDroppedFiles(res.paths);
      return;
    }
    if (!hub.printLibPick) return;
    const id = uid('PF');
    let picked;
    try { picked = await hub.printLibPick(id); } catch (err) { toast(String(err.message || err), 'error'); return; }
    if (!picked) return;
    ingestPicked(id, picked);
    toast(t('plib.added') || 'File added', 'success');
  }

  // Import files dropped onto the library (each copied into its own record's vault). Skips anything the
  // main-process handler rejects (non-print extensions).
  async function addDroppedFiles(paths) {
    const hub = api(); if (!hub || !hub.printLibCopyPath) return;
    let added = 0, bad = 0, skipped = 0, truncated = false;
    for (const p of paths) {
      // A .zip is a pack of models, not a model. It is unpacked to a temp
      // folder and each file then goes through the ORDINARY intake below, so a
      // six-part pack becomes six records exactly as if they had been unzipped
      // and dropped — and there is still only one path that ingests a file.
      if (/\.zip$/i.test(String(p)) && hub.printLibUnpackZip) {
        let z;
        try { z = await hub.printLibUnpackZip(p); } catch (_) { z = null; }
        if (!z || !z.ok) {
          bad++;
          if (z && z.empty) toast(z.error || (t('plib.zip_empty') || 'No print files in that archive.'), 'error');
          continue;
        }
        for (const f of z.files) {
          const zid = uid('PF');
          let zr;
          try { zr = await hub.printLibCopyPath(zid, f.path); } catch (_) { zr = null; }
          if (!zr || !zr.ok) { skipped++; continue; }
          ingestPicked(zid, zr);
          added++;
        }
        skipped += (z.skipped || []).length + (z.failed || []).length;
        truncated = truncated || !!z.truncated;
        // The temp folder is ours; leaving it behind grows without bound.
        if (hub.printLibUnpackCleanup) { try { await hub.printLibUnpackCleanup(z.dir); } catch (_) { /* best effort */ } }
        continue;
      }
      const id = uid('PF');
      let r;
      try { r = await hub.printLibCopyPath(id, p); } catch (_) { bad++; continue; }
      if (!r || !r.ok) { bad++; continue; }
      ingestPicked(id, r);
      added++;
    }
    if (added) toast(added === 1 ? (t('plib.added') || 'File added') : `${added} ${t('plib.files_added') || 'files added'}`, 'success');
    else if (bad) toast(t('plib.drop_bad') || 'Drop STL, 3MF, OBJ or G-code files.', 'error');
    // Said out loud rather than folded into the success count: an archive that
    // was partly ignored must not read as "all of it came in".
    if (truncated) toast(t('plib.zip_truncated') || 'The archive was too large — not every file was imported.', 'error');
    else if (added && skipped) toast(`${skipped} ${t('plib.zip_skipped') || 'other files in the archive were skipped'}`, 'info');
  }

  // Bind drag-and-drop once to the (persistent) tab element; renderPrintFiles only swaps its innerHTML.
  let _dropWired = false;
  function wirePfDrop() {
    if (_dropWired) return;
    const host = document.getElementById('printfiles-tab');
    if (!host) return;
    _dropWired = true;
    const hi = (on) => { const w = host.querySelector('.pf-wrap'); if (w) { w.style.outline = on ? '2px dashed var(--accent,#199e8f)' : ''; w.style.outlineOffset = on ? '6px' : ''; } };
    const over = (e) => { if (!(api() && api().printLibCopyPath)) return; e.preventDefault(); e.stopPropagation(); hi(true); };
    host.addEventListener('dragover', over);
    host.addEventListener('dragenter', over);
    host.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); hi(false); });
    host.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation(); hi(false);
      const files = (e.dataTransfer && e.dataTransfer.files) ? Array.prototype.slice.call(e.dataTransfer.files) : [];
      const paths = files.map((f) => f.path).filter(Boolean);
      if (paths.length) addDroppedFiles(paths);
    });
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
    // displayName wins verbatim (e.g. a cloud-library design keeps its own title); otherwise fall back
    // to the converted-file naming ("Model → Target" / "Model (Converted)").
    const name = meta.displayName
      ? String(meta.displayName)
      : (meta.targetName ? `${baseName} → ${meta.targetName}` : `${baseName} (${t('conv.convert_short') || 'Converted'})`);
    const rec = {
      id, name, originalName: meta.filename,
      createdAt: Date.now(), updatedAt: Date.now(),
      sourceFile: { filename: meta.filename, originalName: meta.filename, size: meta.size || 0, ext, kind: 'model' },
      parsed: {}, colors: [], swapCount: 0,
      thumb: null, thumbSource: null, userPhoto: null,
      slicerProfileId: null, testedNotes: '', tags: [], folder: '', material: '', favorite: false, converted: [],
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
    // A record can legitimately have NO file: the library also holds entries
    // made from a printer's own history, where there is nothing on disk to
    // parse. Reading `.ext` off null threw a TypeError from OUTSIDE the try
    // below, so enrichment died before the thumbnail and geometry work that
    // does not need a file either.
    if (!rec || !rec.sourceFile) return;
    const ext = rec.sourceFile.ext;
    try {
      if (ext === 'gcode' || ext === 'gco' || ext === '3mf') {
        if (hub.parsePrintFile) {
          const p = await hub.parsePrintFile(fullPath);
          if (p) rec.parsed = Object.assign({}, rec.parsed, { printTimeMins: p.printTimeMins, filamentGrams: p.filamentGrams, filamentType: p.filamentType, slicer: p.slicer });
          // A g-code file has no mesh, so it used to get no geometryKey at all —
          // and its contentHash changes on every re-slice, so the same model came
          // back a stranger and per-file calibration never reached MIN_JOBS. The
          // printed envelope survives re-slicing; see lib/gcode-geometry.js.
          const mi = MI();
          if (mi && p) {
            try {
              if (p.silhouette && mi.gcodeGeometryKey) {
                rec.geometryKey = mi.gcodeGeometryKey(p.silhouette);
              } else if (p.geometry) {
                // A 3MF carries a mesh, and the parse above already measured it —
                // the volume and triangle count were being shown to the shop and
                // then thrown away. Same key an STL gets, from the same numbers,
                // so a model imported as a 3MF and the same model imported as an
                // STL recognise each other.
                rec.geometryKey = mi.geometryKey(p.geometry);
              }
            } catch (_) { /* non-fatal */ }
          }
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
      // Identity is not a thumbnail concern, and must not be gated like one.
      //
      // This block used to require `!rec.thumb && … && KhaytStlThumb`, so a file
      // that already had a picture, or an app that shipped without the thumbnail
      // RENDERER, silently got no geometryKey — and geometry matching is the only
      // thing that still recognises a model after it has been re-sliced, since
      // both other keys change: contentHash hashes the bytes, and a slicer that
      // writes its time estimate into the filename (SnapmakerOrca:
      // `MBS_PLA_5h36m.gcode`) changes fileRef too.
      //
      // Neither guard was failing yet — both callers pass a record with
      // thumb:null and both HTML entry points load stl-thumbnail.js — so this is
      // the same latent shape as the bug the comment below records, caught before
      // it cost anything rather than after.
      //
      // What identity actually needs is the PARSER. What the picture needs is the
      // renderer, and a slot to put it in.
      if (ext === 'stl' && hub.printLibReadBytes && KhaytStl) {
        const b64 = await hub.printLibReadBytes(fullPath);
        if (b64) {
          try {
            const g = KhaytStl.parseStl(base64ToArrayBuffer(b64), { keepTriangles: true });
            rec.parsed = Object.assign({}, rec.parsed, { triangleCount: g.triangleCount, volumeMm3: g.volumeMm3, bbox: g.bbox });
            // A weaker signal than the hash: the same mesh in a different
            // container. Never presented as certainty — see lib/model-identity.
            //
            // Through MI(), not the bare global. This file already guards every other use
            // that way, and this one did not: in an app that does not load model-identity
            // the bare name threw a ReferenceError straight into the catch below, so
            // geometryKey was never set and geometry matching silently did nothing. The
            // catch is for a malformed mesh, not for a missing module.
            const mi = MI();
            if (mi) { try { rec.geometryKey = mi.geometryKey(rec.parsed); } catch (_) { /* non-fatal */ } }
            if (!rec.thumb && KhaytStlThumb && g.triangles && g.triangles.length) {
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
    openModelViewer({ verts: m.verts, count: m.count, bbox: m.bbox, colors: m.colors, triColors: m.triColors, triObj: m.triObj, triCode: m.triCode, palette: m.palette, plates: m.plates, volumeMm3: m.volumeMm3, name: rec.name || rec.sourceFile?.filename || '' });
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
        // Track whether the files actually went. The record was removed and "File deleted"
        // toasted unconditionally, so a locked or permission-denied file vanished from the
        // library while remaining on disk.
        let allGone = true;
        if (hub && hub.printLibList && hub.printLibDelete) {
          try {
            const files = await hub.printLibList(id);
            for (const f of (files || [])) {
              if ((await hub.printLibDelete(f.fullPath)) === false) allGone = false;
            }
          } catch (e) { console.error('printLibDelete:', e); allGone = false; }
        }
        printFiles = (printFiles || []).filter((r) => r.id !== id);
        saveAll(); renderPrintFiles();
        if (allGone) toast(t('plib.deleted') || 'File deleted', 'success');
        else toast('⚠ ' + (t('plib.delete_partial') || 'Removed from the library, but some files could not be deleted from disk'), 'error', 7000);
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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
          <div>
            <label>${escapeHtml(t('plib.folder') || 'Folder')}</label>
            <input type="text" id="pfFolder" list="pfFolderList" value="${escapeHtml(rec.folder || '')}" placeholder="${escapeHtml(t('plib.folder_ph') || 'e.g. Client work')}">
            <datalist id="pfFolderList">${folderOptions(rec.folder)}</datalist>
          </div>
          <div>
            <label>${escapeHtml(t('plib.tags') || 'Tags (comma separated)')}</label>
            <input type="text" id="pfTags" value="${escapeHtml((rec.tags || []).join(', '))}">
          </div>
        </div>
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
        rec.folder = (modal.querySelector('#pfFolder').value || '').trim();
        rec.testedNotes = modal.querySelector('#pfNotes').value.trim();
        const ph = modal._getPhoto ? modal._getPhoto() : null;
        if (ph) { if (ph.cleared) rec.userPhoto = null; else if (ph.stagedPhoto) rec.userPhoto = ph.stagedPhoto; }
        rec.updatedAt = Date.now();
        saveAll(); renderPrintFiles();
        toast(t('plib.saved') || 'Saved', 'success');
      },
    });
  }

  // warnIfAlreadyHave is public because it is a real library operation — "is
  // this one we already have?" — that any future ingest path needs, not just
  // the picker. It is also the one branch here that DELETES a record, so it
  // is worth being able to drive end to end.
  const pub = { renderPrintFiles, addPrintFile, openInSlicer, editPrintFile, deletePrintFile, attachConverted, importConvertedAsNew, warnIfAlreadyHave, identifyPrintFile };
  Object.assign(global, pub);
  global.KhaytPrintFiles = pub;
  if (typeof module !== 'undefined' && module.exports) module.exports = pub;
})(typeof globalThis !== 'undefined' ? globalThis : this);
