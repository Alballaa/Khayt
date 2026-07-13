/* ============================================================
   BED READY — cloud library panel (renderer).
   A self-contained modal that connects the app to the user's BedReady
   account and pulls their saved designs from bedready.io, using the
   main-process bridge on window.hubAPI (see preload.js):
     bedreadyLinked / bedreadyOpenSignIn / onBedreadyLinked /
     bedreadyLibrary / bedreadyDownloadAll / bedreadyUnlink
   Bed Ready flavor only; no dependency on the app's nav/tab system, so it
   can't affect Khayt or the existing renderer.
   ============================================================ */
(function () {
  if (typeof document === 'undefined' || document.documentElement.dataset.app !== 'bedready') return;
  var api = (typeof window !== 'undefined' && window.hubAPI) || null;
  if (!api || typeof api.bedreadyLinked !== 'function') return; // older preload — silently unavailable

  var root = null, body = null, items = [], linkedListenerBound = false, lastFocus = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function build() {
    root = document.createElement('div');
    root.className = 'brl-overlay';
    root.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:24px;';
    root.innerHTML =
      '<div class="brl-modal" role="dialog" aria-modal="true" aria-label="BedReady library" style="width:100%;max-width:560px;max-height:82vh;overflow:auto;border-radius:18px;background:var(--surface,#ffffff);color:var(--text,#14201e);border:1px solid var(--border,rgba(17,40,37,0.10));box-shadow:0 20px 60px rgba(0,0,0,.5);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border,rgba(17,40,37,0.10));">' +
          '<b style="font-size:16px;">☁️ My BedReady library</b>' +
          '<button type="button" class="brl-close" aria-label="Close" style="border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer;line-height:1;">✕</button>' +
        '</div>' +
        '<div class="brl-body" style="padding:20px;"></div>' +
      '</div>';
    document.body.appendChild(root);
    body = root.querySelector('.brl-body');
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    root.querySelector('.brl-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') trapTab(e); // keep focus inside the modal
    });
  }

  // Visible, focusable controls currently inside the modal.
  function focusables() {
    if (!root) return [];
    return Array.prototype.slice
      .call(root.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'))
      .filter(function (el) { return el.offsetParent !== null; });
  }
  function trapTab(e) {
    var f = focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  var isOpen = function () { return root && root.style.display !== 'none'; };
  // Make the app behind the modal inert so an AT virtual cursor can't wander the page underneath.
  function bgInert(on) {
    if (!document.body) return;
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (el === root) return;
      try { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } catch (e) { /* noop */ }
    });
  }
  function close() {
    if (root) root.style.display = 'none';
    bgInert(false);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* trigger gone */ } }
    lastFocus = null;
  }

  // 1×1 transparent GIF — a cover <img> shows this until the main process returns the real data: URI,
  // so there's no broken-image flash (remote img-src is blocked by the CSP; covers are proxied instead).
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function btn(label, kind) {
    // Solid brand teal (matches .btn.primary); the old purple→cyan→lime gradient was off-identity and
    // failed contrast at the lime end. --accent resolves in both light/dark themes.
    var cta = 'background:var(--accent,#199e8f);color:#fff;';
    var plain = 'background:var(--surface-2,#f2f6f5);color:var(--text,#14201e);border:1px solid var(--border,rgba(17,40,37,0.16));';
    var primary = (kind === 'primary' || kind === 'connect' || kind === 'sync' || kind === 'import');
    return '<button type="button" class="brl-btn" data-act="' + kind + '" style="cursor:pointer;border:0;border-radius:12px;padding:11px 18px;font-weight:600;font-size:14px;' + (primary ? cta : plain) + '">' + esc(label) + '</button>';
  }

  function loadCovers() {
    if (!body || typeof api.bedreadyCover !== 'function') return;
    Array.prototype.forEach.call(body.querySelectorAll('img.brl-cover[data-cover]'), function (img) {
      var url = img.getAttribute('data-cover');
      img.removeAttribute('data-cover'); // fetch each cover once
      if (!url) return;
      api.bedreadyCover(url).then(function (r) { if (r && r.ok && r.dataUrl) img.src = r.dataUrl; }).catch(function () {});
    });
  }

  function setBody(html) { if (body) body.innerHTML = html; bindActions(); }

  function bindActions() {
    if (!body) return;
    body.querySelectorAll('.brl-btn').forEach(function (b) {
      b.addEventListener('click', function () { onAct(b.getAttribute('data-act')); });
    });
  }

  async function onAct(act) {
    if (act === 'connect') { try { api.bedreadyOpenSignIn(); } catch (e) {} renderConnecting(); return; }
    if (act === 'recheck') { await refresh(); return; }
    if (act === 'sync') { await sync(); return; }
    if (act === 'import') { await importAll(); return; }
    if (act === 'download') { await downloadAll(); return; }
    if (act === 'unlink') { try { await api.bedreadyUnlink(); } catch (e) {} items = []; await refresh(); return; }
    if (act === 'close') { close(); return; }
  }

  function renderConnecting() {
    setBody(
      '<p style="margin:0 0 6px;">A browser window is opening at <b>bedready.io/app-link</b>.</p>' +
      '<p style="margin:0 0 16px;color:var(--text-muted,#869390);font-size:13px;">Sign in there and click <b>Connect</b> — this panel updates automatically once it links.</p>' +
      btn('Recheck', 'recheck'));
  }

  function renderNotLinked() {
    setBody(
      '<p style="margin:0 0 6px;">Connect your BedReady account to pull your <b>saved designs</b> onto this computer.</p>' +
      '<p style="margin:0 0 18px;color:var(--text-muted,#869390);font-size:13px;">Opens bedready.io in your browser to sign in. Nothing is uploaded — this only downloads your own saves.</p>' +
      btn('Connect BedReady account', 'connect'));
  }

  function renderLinked() {
    var list = '';
    if (items.length) {
      list = '<div style="margin:14px 0;display:grid;gap:8px;">' + items.map(function (it) {
        var cover = it.cover
          ? '<img class="brl-cover" data-cover="' + esc(it.cover) + '" src="' + BLANK + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex:0 0 auto;background:var(--surface-3,#e8efed);">'
          : '<div style="width:44px;height:44px;border-radius:8px;background:var(--surface-3,#e8efed);flex:0 0 auto;"></div>';
        var meta = it.downloadUrl ? '' : '<span style="font-size:11px;color:var(--text-muted,#869390);"> · link only</span>';
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border,rgba(17,40,37,0.10));border-radius:10px;">' +
          cover + '<div style="min-width:0;"><div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(it.title || it.slug) + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted,#869390);">' + esc((it.fileType || '3mf')).toUpperCase() + meta + '</div></div></div>';
      }).join('') + '</div>';
    }
    var downloadable = items.filter(function (i) { return i.downloadUrl; }).length;
    var canImport = downloadable && typeof api.bedreadyImportToLib === 'function' && typeof window.importConvertedAsNew === 'function';
    setBody(
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<span style="color:var(--text-muted,#869390);font-size:13px;">' + (items.length ? (items.length + ' saved design' + (items.length === 1 ? '' : 's')) : 'Connected — sync to pull your saves.') + '</span>' +
        btn('Sync', 'sync') +
      '</div>' + list +
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
        (canImport ? btn('＋ Add all to Print Files (' + downloadable + ')', 'import') : '') +
        (downloadable ? btn('Download to folder', 'download') : '') +
        btn('Disconnect', 'unlink') +
      '</div>' +
      '<div class="brl-result" role="status" aria-live="polite" style="margin-top:12px;font-size:13px;"></div>');
    loadCovers();
  }

  function result(html, color) {
    var el = body && body.querySelector('.brl-result');
    if (el) el.innerHTML = '<span style="color:' + (color || 'var(--text-muted,#869390)') + ';">' + html + '</span>';
  }

  async function sync() {
    result('Syncing…');
    try {
      var r = await api.bedreadyLibrary();
      if (!r || !r.ok) { result(esc((r && r.error) || 'Sync failed.'), '#f87171'); return; }
      items = r.items || [];
      renderLinked();
      result(items.length ? ('Found ' + items.length + ' saved design' + (items.length === 1 ? '' : 's') + '.') : 'No saved designs yet — save some on bedready.io.', 'var(--ok,#159d68)');
    } catch (e) { result(esc(e && e.message ? e.message : 'Sync failed.'), 'var(--danger,#e0492f)'); }
  }

  // Import saved designs straight into the Print-File Library (via a per-design vault download +
  // importConvertedAsNew), so a synced design lands IN the app with a thumbnail instead of orphaned
  // in a Downloads folder. Falls back to "Download to folder" if the bridge isn't available.
  async function importAll() {
    var list = items.filter(function (i) { return i.downloadUrl; });
    if (!list.length) { result('Nothing to import.', 'var(--text-muted,#869390)'); return; }
    if (typeof api.bedreadyImportToLib !== 'function' || typeof window.importConvertedAsNew !== 'function') {
      result('This build can’t import into Print Files — use “Download to folder”.', 'var(--danger,#e0492f)'); return;
    }
    result('Adding ' + list.length + ' design' + (list.length === 1 ? '' : 's') + ' to your Print Files…');
    var added = 0, failed = 0;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      try {
        var vaultId = (typeof uid === 'function') ? uid('PF') : ('PF' + Date.now().toString(36) + i);
        var r = await api.bedreadyImportToLib(it, vaultId);
        if (!r || !r.ok) { failed++; continue; }
        await window.importConvertedAsNew({
          vaultId: vaultId, filename: r.filename, ext: r.ext, size: r.size,
          displayName: it.title || it.slug, sourceName: r.filename, noSwitch: true,
        });
        added++;
      } catch (e) { failed++; }
    }
    var msg = 'Added ' + added + ' design' + (added === 1 ? '' : 's') + ' to your Print Files.';
    if (failed) msg += ' ' + failed + ' couldn’t be added.';
    result(esc(msg), added ? 'var(--ok,#159d68)' : 'var(--danger,#e0492f)');
    if (added && typeof switchTab === 'function') { close(); switchTab('printfiles-tab'); }
  }

  async function downloadAll() {
    result('Downloading…');
    try {
      var r = await api.bedreadyDownloadAll(items);
      if (!r || !r.ok) { result(esc((r && r.error) || 'Download failed.'), '#f87171'); return; }
      var msg = 'Saved ' + r.saved.length + ' file' + (r.saved.length === 1 ? '' : 's') + ' to your Downloads/BedReady-Library folder.';
      if (r.failed && r.failed.length) msg += ' ' + r.failed.length + ' failed.';
      if (r.skipped && r.skipped.length) msg += ' ' + r.skipped.length + ' skipped.';
      result(esc(msg), r.failed && r.failed.length ? '#fbbf24' : 'var(--ok,#159d68)');
    } catch (e) { result(esc(e && e.message ? e.message : 'Download failed.'), 'var(--danger,#e0492f)'); }
  }

  async function refresh() {
    setBody('<p style="color:var(--text-muted,#869390);">Checking…</p>');
    try {
      var r = await api.bedreadyLinked();
      if (r && r.ok && r.linked) renderLinked(); else renderNotLinked();
    } catch (e) { renderNotLinked(); }
  }

  function open() {
    if (!root) build();
    if (!linkedListenerBound && typeof api.onBedreadyLinked === 'function') {
      api.onBedreadyLinked(function () { if (isOpen()) refresh(); });
      linkedListenerBound = true;
    }
    lastFocus = (typeof document !== 'undefined' && document.activeElement) || null;
    root.style.display = 'flex';
    bgInert(true);
    refresh();
    // Move focus into the dialog for keyboard/AT users (the close button is always present).
    var closeBtn = root.querySelector('.brl-close');
    if (closeBtn && closeBtn.focus) { try { closeBtn.focus(); } catch (e) { /* noop */ } }
  }

  window.BedReadyLibrary = { open: open };
})();
