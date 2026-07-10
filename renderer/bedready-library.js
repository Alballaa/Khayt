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
  function close() {
    if (root) root.style.display = 'none';
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* trigger gone */ } }
    lastFocus = null;
  }

  function btn(label, kind) {
    // text-shadow keeps the white label legible over the low-contrast cyan/lime end of the gradient.
    var grad = 'background:linear-gradient(100deg,#7c3aed,#06b6d4 55%,#84cc16);color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.45);';
    var plain = 'background:var(--surface-2,#f2f6f5);color:var(--text,#14201e);border:1px solid var(--border,rgba(17,40,37,0.16));';
    return '<button type="button" class="brl-btn" data-act="' + kind + '" style="cursor:pointer;border:0;border-radius:12px;padding:11px 18px;font-weight:600;font-size:14px;' + (kind === 'primary' || kind === 'connect' || kind === 'sync' || kind === 'download' ? grad : plain) + '">' + esc(label) + '</button>';
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
        var cover = it.cover ? '<img src="' + esc(it.cover) + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex:0 0 auto;">'
          : '<div style="width:44px;height:44px;border-radius:8px;background:var(--surface-3,#e8efed);flex:0 0 auto;"></div>';
        var meta = it.downloadUrl ? '' : '<span style="font-size:11px;color:var(--text-muted,#869390);"> · link only</span>';
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border,rgba(17,40,37,0.10));border-radius:10px;">' +
          cover + '<div style="min-width:0;"><div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(it.title || it.slug) + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted,#869390);">' + esc((it.fileType || '3mf')).toUpperCase() + meta + '</div></div></div>';
      }).join('') + '</div>';
    }
    var downloadable = items.filter(function (i) { return i.downloadUrl; }).length;
    setBody(
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<span style="color:var(--text-muted,#869390);font-size:13px;">' + (items.length ? (items.length + ' saved design' + (items.length === 1 ? '' : 's')) : 'Connected — sync to pull your saves.') + '</span>' +
        btn('Sync', 'sync') +
      '</div>' + list +
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
        (downloadable ? btn('Download all (' + downloadable + ')', 'download') : '') +
        btn('Disconnect', 'unlink') +
      '</div>' +
      '<div class="brl-result" role="status" aria-live="polite" style="margin-top:12px;font-size:13px;"></div>');
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
      result(items.length ? ('Found ' + items.length + ' saved design' + (items.length === 1 ? '' : 's') + '.') : 'No saved designs yet — save some on bedready.io.', '#4ade80');
    } catch (e) { result(esc(e && e.message ? e.message : 'Sync failed.'), '#f87171'); }
  }

  async function downloadAll() {
    result('Downloading…');
    try {
      var r = await api.bedreadyDownloadAll(items);
      if (!r || !r.ok) { result(esc((r && r.error) || 'Download failed.'), '#f87171'); return; }
      var msg = 'Saved ' + r.saved.length + ' file' + (r.saved.length === 1 ? '' : 's') + ' to your Downloads/BedReady-Library folder.';
      if (r.failed && r.failed.length) msg += ' ' + r.failed.length + ' failed.';
      if (r.skipped && r.skipped.length) msg += ' ' + r.skipped.length + ' skipped.';
      result(esc(msg), r.failed && r.failed.length ? '#fbbf24' : '#4ade80');
    } catch (e) { result(esc(e && e.message ? e.message : 'Download failed.'), '#f87171'); }
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
    refresh();
    // Move focus into the dialog for keyboard/AT users (the close button is always present).
    var closeBtn = root.querySelector('.brl-close');
    if (closeBtn && closeBtn.focus) { try { closeBtn.focus(); } catch (e) { /* noop */ } }
  }

  window.BedReadyLibrary = { open: open };
})();
