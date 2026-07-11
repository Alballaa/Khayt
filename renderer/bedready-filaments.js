/* ============================================================
   BED READY — Orca filament installer (renderer).
   A self-contained modal that browses the OrcaSlicer filament library (served by
   bedready.io) and installs a profile straight into the user's Snapmaker Orca so it
   shows up for the Snapmaker U1. Uses the main-process bridge on window.hubAPI:
     orcaFilaTarget / orcaFilaManifest / orcaFilaInstall / orcaFilaReveal
   Bed Ready flavor only; no dependency on the app's nav/tab system.
   ============================================================ */
(function () {
  if (typeof document === 'undefined' || document.documentElement.dataset.app !== 'bedready') return;
  var api = (typeof window !== 'undefined' && window.hubAPI) || null;
  if (!api || typeof api.orcaFilaManifest !== 'function') return; // older preload — silently unavailable

  var root = null, body = null, lastFocus = null;
  var manifest = null, target = null, installed = {}; // installed: id → true (this session)
  var CAP = 60; // max rows rendered at once — filters/search narrow the 1200+ library

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function build() {
    root = document.createElement('div');
    root.className = 'brf-overlay';
    root.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:24px;';
    root.innerHTML =
      '<div class="brf-modal" role="dialog" aria-modal="true" aria-label="Add filament to Snapmaker Orca" style="width:100%;max-width:640px;max-height:86vh;display:flex;flex-direction:column;border-radius:18px;background:var(--surface,#ffffff);color:var(--text,#14201e);border:1px solid var(--border,rgba(17,40,37,0.10));box-shadow:0 20px 60px rgba(0,0,0,.5);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border,rgba(17,40,37,0.10));flex:0 0 auto;">' +
          '<b style="font-size:16px;">🎨 Add filament to Snapmaker Orca</b>' +
          '<button type="button" class="brf-close" aria-label="Close" style="border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer;line-height:1;">✕</button>' +
        '</div>' +
        '<div class="brf-body" style="padding:18px 20px;overflow:auto;"></div>' +
      '</div>';
    document.body.appendChild(root);
    body = root.querySelector('.brf-body');
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    root.querySelector('.brf-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') trapTab(e);
    });
  }

  function focusables() {
    if (!root) return [];
    return Array.prototype.slice
      .call(root.querySelectorAll('button, input, select, [href], [tabindex]:not([tabindex="-1"])'))
      .filter(function (el) { return el.offsetParent !== null && !el.disabled; });
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

  var GRAD = 'background:linear-gradient(100deg,#7c3aed,#06b6d4 55%,#84cc16);color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.45);border:0;';
  var PLAIN = 'background:var(--surface-2,#f2f6f5);color:var(--text,#14201e);border:1px solid var(--border,rgba(17,40,37,0.16));';

  function loadingView() {
    body.innerHTML = '<p style="color:var(--text-muted,#869390);">Loading the OrcaSlicer filament library…</p>';
  }
  function errorView(msg) {
    body.innerHTML = '<p style="margin:0 0 14px;">' + esc(msg) + '</p>' +
      '<button type="button" class="brf-retry" style="cursor:pointer;border-radius:12px;padding:10px 16px;font-weight:600;' + GRAD + '">Try again</button>';
    body.querySelector('.brf-retry').addEventListener('click', load);
  }

  // Header: where files land + reveal + the "quit first" nudge.
  function headerHtml() {
    var dir = (target && target.dir) || '';
    var warn = (target && target.appFound)
      ? '' : '<div style="margin-top:8px;font-size:12px;color:#d97706;">Snapmaker Orca wasn’t detected — the folder will be created; open Snapmaker Orca at least once if the filament doesn’t appear.</div>';
    return '<div style="background:var(--surface-2,#f2f6f5);border:1px solid var(--border,rgba(17,40,37,0.12));border-radius:12px;padding:10px 12px;margin-bottom:14px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<div style="min-width:0;font-size:12px;color:var(--text-muted,#869390);">Installs into your Snapmaker Orca filament folder</div>' +
        '<button type="button" class="brf-reveal" style="cursor:pointer;border-radius:9px;padding:6px 10px;font-size:12px;font-weight:600;' + PLAIN + '">Reveal folder</button>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-muted,#869390);word-break:break-all;margin-top:4px;">' + esc(dir) + '</div>' +
      '<div style="margin-top:8px;font-size:12px;color:var(--text,#14201e);">⚠️ Quit Snapmaker Orca before installing — it reads filament profiles at startup. Relaunch it after.</div>' +
      warn +
    '</div>';
  }

  function filtersHtml() {
    var opts = function (arr) { return ['<option value="">All</option>'].concat((arr || []).map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; })).join(''); };
    var sel = 'style="' + PLAIN + 'border-radius:10px;padding:8px 10px;font-size:13px;max-width:38%;"';
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' +
      '<input class="brf-q" type="text" placeholder="Search filament (e.g. SUNLU PLA)" aria-label="Search filament" style="' + PLAIN + 'border-radius:10px;padding:8px 12px;font-size:13px;flex:1 1 180px;">' +
      '<select class="brf-vendor" aria-label="Brand" ' + sel + '>' + opts(manifest.vendors) + '</select>' +
      '<select class="brf-type" aria-label="Material" ' + sel + '>' + opts(manifest.types) + '</select>' +
    '</div>';
  }

  function match(p, q, vendor, type) {
    if (vendor && p.vendor !== vendor) return false;
    if (type && p.type !== type) return false;
    if (q && (p.name + ' ' + p.vendor).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }

  function rowHtml(p) {
    var done = installed[p.id];
    var btn = done
      ? '<span class="brf-done" style="font-size:12px;color:#16a34a;font-weight:600;white-space:nowrap;">Installed ✓</span>'
      : '<button type="button" class="brf-install" data-id="' + esc(p.id) + '" style="cursor:pointer;border-radius:10px;padding:8px 14px;font-weight:600;font-size:13px;white-space:nowrap;' + GRAD + '">Install</button>';
    return '<div class="brf-row" data-id="' + esc(p.id) + '" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--border,rgba(17,40,37,0.10));border-radius:10px;">' +
      '<div style="min-width:0;flex:1 1 auto;">' +
        '<div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.name) + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted,#869390);">' + esc(p.vendor) + ' · ' + esc(p.type) + ' · 🌡️ ' + esc(p.nozzleTemp) + '°/' + esc(p.bedTemp) + '°</div>' +
      '</div>' + btn +
    '</div>';
  }

  function renderList() {
    var q = (body.querySelector('.brf-q').value || '').trim().toLowerCase();
    var vendor = body.querySelector('.brf-vendor').value;
    var type = body.querySelector('.brf-type').value;
    var all = manifest.profiles.filter(function (p) { return match(p, q, vendor, type); });
    var shown = all.slice(0, CAP);
    var count = all.length ? ('Showing ' + shown.length + ' of ' + all.length + (all.length > CAP ? ' — refine to see more' : '')) : 'No filaments match.';
    var listEl = body.querySelector('.brf-list');
    var countEl = body.querySelector('.brf-count');
    countEl.textContent = count;
    listEl.innerHTML = shown.map(rowHtml).join('');
  }

  function mainView() {
    body.innerHTML = headerHtml() + filtersHtml() +
      '<div class="brf-count" role="status" aria-live="polite" style="font-size:12px;color:var(--text-muted,#869390);margin-bottom:8px;"></div>' +
      '<div class="brf-list" style="display:grid;gap:7px;"></div>' +
      '<div class="brf-result" role="status" aria-live="polite" style="margin-top:12px;font-size:13px;min-height:18px;"></div>';
    body.querySelector('.brf-reveal').addEventListener('click', function () { try { api.orcaFilaReveal(); } catch (e) {} });
    body.querySelector('.brf-q').addEventListener('input', renderList);
    body.querySelector('.brf-vendor').addEventListener('change', renderList);
    body.querySelector('.brf-type').addEventListener('change', renderList);
    body.querySelector('.brf-list').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.brf-install') : null;
      if (b) install(b.getAttribute('data-id'), b);
    });
    renderList();
  }

  function result(html, color) {
    var el = body && body.querySelector('.brf-result');
    if (el) el.innerHTML = '<span style="color:' + (color || 'var(--text-muted,#869390)') + ';">' + html + '</span>';
  }

  async function install(id, b) {
    var p = manifest.profiles.find(function (x) { return x.id === id; });
    if (!p) return;
    if (b) { b.disabled = true; b.textContent = 'Installing…'; b.style.opacity = '0.7'; }
    result('Installing “' + esc(p.name) + '”…');
    try {
      var r = await api.orcaFilaInstall({ file: p.file, name: p.name });
      if (!r || !r.ok) throw new Error((r && r.error) || 'Install failed.');
      installed[id] = true;
      renderList(); // re-render so this row now shows "Installed ✓"
      result('Installed “' + esc(p.name) + '”. Relaunch Snapmaker Orca to see it under the Snapmaker U1.', '#16a34a');
    } catch (e) {
      if (b) { b.disabled = false; b.textContent = 'Install'; b.style.opacity = '1'; }
      result(esc(e && e.message ? e.message : 'Install failed.'), '#f87171');
    }
  }

  async function load() {
    loadingView();
    try {
      var t = await api.orcaFilaTarget();
      target = (t && t.ok) ? t : { dir: '', appFound: false };
      var r = await api.orcaFilaManifest();
      if (!r || !r.ok || !r.manifest) throw new Error((r && r.error) || 'Couldn’t load the filament library.');
      manifest = r.manifest;
      mainView();
    } catch (e) { errorView(e && e.message ? e.message : 'Couldn’t load the filament library. Check your connection and try again.'); }
  }

  function open() {
    if (!root) build();
    lastFocus = (typeof document !== 'undefined' && document.activeElement) || null;
    root.style.display = 'flex';
    load();
    var closeBtn = root.querySelector('.brf-close');
    if (closeBtn && closeBtn.focus) { try { closeBtn.focus(); } catch (e) { /* noop */ } }
  }

  window.BedReadyFilaments = { open: open };
})();
