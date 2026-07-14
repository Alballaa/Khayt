'use strict';
/*
 * HueForge · U1 — Bed Ready's filament-painting studio (Cyanotype Draft).
 *
 * Drop an image → the app auto-picks a filament palette from what you own, builds the
 * layered "filament painting" (a relief whose per-pixel height, swapped through the
 * stack, reproduces the picture via light transmission), and shows exactly how it will
 * print on a Snapmaker U1. You can retune every filament (colour / TD / band thickness),
 * reorder the stack, and see the U1 verdict (≤4 colours = fully automatic on the 4
 * SnapSwap heads; more = mid-print reloads).
 *
 * This module is the UI. All colour + relief maths is in lib/hueforge.js (KhaytHueForge)
 * over lib/color-mix.js (KhaytColor). Reads the live `inventory` global for palette
 * suggestions. Bed Ready only (bedready.html ships this tab).
 *
 * v1 = design + live preview + print plan. The zero-slicer U1 3MF export lands next.
 */
(function (global) {
  const KC = () => global.KhaytColor;
  const HF = () => global.KhaytHueForge;
  const U1_ID = 'snapmaker-u1';
  const WORK_MAX = 180; // longest side (px) of the working image the solver runs on

  let S = null; // session state
  let _rafPending = false;

  function defaults() {
    return { img: null, imgUrl: '', imgName: '', filaments: [], layerH: 0.08, baseLayers: 4, maxColors: 4, stack: null, solve: null, plan: null };
  }

  function u1Profile() { const P = global.KhaytPrinterProfiles; return P ? P.getProfile(U1_ID) : null; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  function css(hex, fb) { return (typeof safeCssColor === 'function') ? safeCssColor(hex, fb || '#888') : (hex || fb || '#888'); }
  function ico(name, size) { return (global.BedReadyIcons) ? global.BedReadyIcons.get(name, size || 15) : ''; }

  function ownedColored() {
    const inv = Array.isArray(global.inventory) ? global.inventory : [];
    const kc = KC();
    return kc ? inv.filter((i) => i && i.color && kc.hexToRgb(i.color) && (i.weight == null || i.weight > 0)) : [];
  }

  // ---- image intake -------------------------------------------------------

  function loadImageFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, WORK_MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        S.img = ctx.getImageData(0, 0, w, h);
        S.imgUrl = reader.result;
        S.imgName = file.name || 'image';
        autoPalette();
        render();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function autoPalette() {
    const hf = HF();
    if (!hf || !S.img) return;
    S.filaments = hf.suggestFilaments(S.img, ownedColored(), S.maxColors);
    recompute();
  }

  // ---- compute ------------------------------------------------------------

  function recompute() {
    const hf = HF();
    if (!hf || !S.filaments.length) { S.stack = S.solve = S.plan = null; return; }
    S.stack = hf.buildStack(S.filaments, { layerH: S.layerH, baseLayers: S.baseLayers });
    S.plan = hf.u1Plan(S.stack, hf.U1_HEADS);
    S.solve = S.img ? hf.solveHeightfield(S.img, S.stack) : null;
  }

  function scheduleRepaint() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => { _rafPending = false; recompute(); paint(); });
  }

  // ---- render -------------------------------------------------------------

  function render() {
    const host = document.getElementById('hueforge-tab');
    if (!host) return;
    if (!S) S = defaults();
    host.innerHTML = shellHtml();
    wire(host);
    paint();
  }

  function shellHtml() {
    return [
      '<div class="hf">',
      '<div class="hf-head">',
      '<div><h2 class="hf-title">HueForge <span class="hf-title-sep">·</span> U1</h2>',
      '<p class="hf-sub">Turn a picture into a filament painting, built for the Snapmaker U1’s four SnapSwap heads.</p></div>',
      S.img ? '<button type="button" class="btn ghost sm" id="hfReset">Start over</button>' : '',
      '</div>',
      S.img ? bodyHtml() : dropHtml(),
      '<input type="file" id="hfFile" accept="image/*" hidden />',
      '</div>',
    ].join('');
  }

  function dropHtml() {
    return [
      '<div class="hf-drop" id="hfDrop" tabindex="0" role="button" aria-label="Add an image">',
      '<div class="hf-drop-mark" aria-hidden="true">' + ico('camera', 30) + '</div>',
      '<div class="hf-drop-t">Drop an image, or click to browse</div>',
      '<div class="hf-drop-h">JPG or PNG. Bed Ready picks the filaments and builds the relief — everything stays on your machine.</div>',
      '</div>',
    ].join('');
  }

  function bodyHtml() {
    return [
      '<div class="hf-body">',
      '<section class="hf-col hf-left">',
      sourceHtml(),
      paletteHtml(),
      settingsHtml(),
      '</section>',
      '<section class="hf-col hf-right">',
      previewHtml(),
      elevationHtml(),
      verdictHtml(),
      exportHtml(),
      '</section>',
      '</div>',
    ].join('');
  }

  function sourceHtml() {
    return [
      '<div class="hf-card">',
      '<div class="hf-card-h">SOURCE</div>',
      '<div class="hf-src">',
      '<img class="hf-src-img" src="' + esc(S.imgUrl) + '" alt="source" />',
      '<div class="hf-src-meta"><div class="hf-src-name">' + esc(S.imgName) + '</div>',
      '<div class="hf-src-dim">' + (S.img ? S.img.width + '×' + S.img.height + ' px sampled' : '') + '</div>',
      '<button type="button" class="btn ghost xs" id="hfChange">Change image</button></div>',
      '</div></div>',
    ].join('');
  }

  function paletteHtml() {
    const owned = ownedColored().length;
    const rows = S.filaments.map((f, i) => filRow(f, i, S.filaments.length)).join('');
    return [
      '<div class="hf-card">',
      '<div class="hf-card-h">FILAMENT STACK <span class="hf-card-hx">bottom → top</span></div>',
      '<div class="hf-auto">',
      '<button type="button" class="btn sm" id="hfAuto">' + wrapIco('colour') + 'Auto-pick from image</button>',
      '<button type="button" class="btn ghost sm" id="hfTune" title="Optimise band thicknesses to best match the image">' + wrapIco('target') + 'Auto-tune</button>',
      '<label class="hf-inline">colours <select class="input xs" id="hfMaxColors">'
        + [3, 4, 5, 6].map((n) => '<option value="' + n + '"' + (n === S.maxColors ? ' selected' : '') + '>' + n + '</option>').join('')
        + '</select></label>',
      '</div>',
      owned ? '' : '<div class="hf-note">No colour filaments in your inventory yet — suggestions use the image’s own colours. Add spools in Inventory to match to what you own.</div>',
      '<div class="hf-stack" id="hfStack">' + (rows || '<div class="hf-empty">No filaments — auto-pick or add one.</div>') + '</div>',
      '<button type="button" class="btn ghost xs" id="hfAdd">' + wrapIco('plus') + 'Add filament</button>',
      '</div>',
    ].join('');
  }

  function filRow(f, i, total) {
    const near = (f.name && f.deltaE != null)
      ? '<span class="hf-fil-near" title="closest filament you own">≈ ' + esc(f.name) + ' ΔE ' + f.deltaE.toFixed(1) + '</span>'
      : '';
    return [
      '<div class="hf-fil" data-idx="' + i + '">',
      '<div class="hf-fil-ord">',
      '<button type="button" class="hf-ord-btn" data-act="up" ' + (i === total - 1 ? 'disabled' : '') + ' aria-label="move up">⌃</button>',
      '<span class="hf-fil-slot">' + (i + 1) + '</span>',
      '<button type="button" class="hf-ord-btn" data-act="down" ' + (i === 0 ? 'disabled' : '') + ' aria-label="move down">⌄</button>',
      '</div>',
      '<label class="hf-sw" style="background:' + css(f.hex) + '"><input type="color" data-fld="hex" value="' + esc(normHex(f.hex)) + '" aria-label="colour" /></label>',
      '<div class="hf-fil-body">',
      '<div class="hf-fil-hex">' + esc(String(f.hex).toUpperCase()) + '</div>',
      near,
      '</div>',
      '<label class="hf-num" title="Transmission distance (mm) — lower = opaque, higher = translucent">TD<input type="number" data-fld="td" min="0.3" max="20" step="0.1" value="' + esc(f.td) + '" /></label>',
      '<label class="hf-num" title="Band thickness in layers">ly<input type="number" data-fld="layers" min="1" max="80" step="1" value="' + esc(f.layers) + '" /></label>',
      '<button type="button" class="hf-fil-x" data-act="del" aria-label="remove">' + ico('cross', 14) + '</button>',
      '</div>',
    ].join('');
  }

  function settingsHtml() {
    return [
      '<div class="hf-card">',
      '<div class="hf-card-h">PRINT SETTINGS</div>',
      '<div class="hf-set">',
      '<label class="hf-num wide" title="Layer height (mm)">layer height (mm)<input type="number" id="hfLayerH" min="0.04" max="0.28" step="0.01" value="' + esc(S.layerH) + '" /></label>',
      '<label class="hf-num wide" title="Solid base layers before the first colour">base layers<input type="number" id="hfBase" min="1" max="20" step="1" value="' + esc(S.baseLayers) + '" /></label>',
      '</div></div>',
    ].join('');
  }

  function previewHtml() {
    return [
      '<div class="hf-card">',
      '<div class="hf-card-h">HOW IT WILL PRINT <span class="hf-card-hx" id="hfMatch">achievable colour</span></div>',
      '<div class="hf-preview"><canvas id="hfCanvas" class="hf-canvas"></canvas>',
      '<div class="hf-preview-empty" id="hfPreviewEmpty" hidden>Add filaments to preview.</div></div>',
      '</div>',
    ].join('');
  }

  function elevationHtml() {
    return '<div class="hf-card"><div class="hf-card-h">SWAP ELEVATION</div><div class="hf-elev" id="hfElev"></div></div>';
  }

  function verdictHtml() {
    return '<div class="hf-card hf-verdict-card"><div id="hfVerdict"></div></div>';
  }

  function exportHtml() {
    return [
      '<div class="hf-card">',
      '<div class="hf-card-h">EXPORT</div>',
      '<div class="hf-export">',
      '<button type="button" class="btn primary sm" id="hf3mf" disabled title="Zero-slicer U1 3MF — shipping in the next update">' + wrapIco('cube') + 'Export U1 3MF</button>',
      '<button type="button" class="btn ghost sm" id="hfCopy">' + wrapIco('clipboard') + 'Copy print plan</button>',
      '</div>',
      '<div class="hf-note">The colour plan below is confirmed first; the 3MF that loads &amp; prints on the U1 with zero slicer setup is the next step.</div>',
      '</div>',
    ].join('');
  }

  function wrapIco(name) { const s = ico(name, 15); return s ? '<span class="br-ico">' + s + '</span>' : ''; }

  // ---- paint dynamic bits -------------------------------------------------

  function paint() {
    paintCanvas();
    paintElevation();
    paintVerdict();
  }

  function paintCanvas() {
    const cv = document.getElementById('hfCanvas');
    const empty = document.getElementById('hfPreviewEmpty');
    const match = document.getElementById('hfMatch');
    if (!cv) return;
    if (!S.solve || !S.img) { cv.hidden = true; if (empty) empty.hidden = false; if (match) match.textContent = ''; return; }
    cv.hidden = false; if (empty) empty.hidden = true;
    cv.width = S.solve.width; cv.height = S.solve.height;
    const ctx = cv.getContext('2d');
    const id = ctx.createImageData(S.solve.width, S.solve.height);
    id.data.set(S.solve.preview);
    ctx.putImageData(id, 0, 0);
    if (match) {
      const de = S.solve.meanDeltaE || 0;
      const q = de < 2 ? 'exact' : de < 4 ? 'close' : de < 8 ? 'ok' : 'far';
      match.textContent = 'match ΔE ' + de.toFixed(1) + ' avg';
      match.className = 'hf-card-hx hf-match ' + q;
    }
  }

  function paintElevation() {
    const host = document.getElementById('hfElev');
    if (!host) return;
    if (!S.stack || !S.stack.bands.length) { host.innerHTML = '<div class="hf-empty">—</div>'; return; }
    const bands = S.stack.bands, total = S.stack.totalLayers, plan = S.plan;
    // column-reverse: bottom band drawn at the bottom
    host.innerHTML = bands.map((b, i) => {
      const pct = Math.max(6, (b.layers / total) * 100);
      const slot = plan ? (plan.slots[i] ? plan.slots[i].slot + 1 : i + 1) : i + 1;
      const reload = plan && plan.reloads.some((r) => r.band === b);
      const dark = KC() && KC().hexToRgb(b.hex) ? HF().luminance(b.hex) < 0.55 : false;
      return '<div class="hf-band" style="flex:' + pct.toFixed(2) + ' 1 0;background:' + css(b.hex) + ';color:' + (dark ? '#fff' : '#111') + '">'
        + '<span class="hf-band-slot" title="U1 head">T' + (slot - 1) + (reload ? ' ↻' : '') + '</span>'
        + '<span class="hf-band-l">L' + b.startLayer + '–' + b.endLayer + '</span>'
        + '<span class="hf-band-td">TD ' + b.td + '</span>'
        + '</div>';
    }).join('');
  }

  function paintVerdict() {
    const host = document.getElementById('hfVerdict');
    if (!host) return;
    if (!S.plan) { host.innerHTML = ''; return; }
    const p = S.plan, prof = u1Profile();
    const heightMm = S.stack ? (S.stack.totalLayers * S.stack.layerH).toFixed(2) : '0';
    const bed = prof && prof.bed ? prof.bed.x + '×' + prof.bed.y + ' mm bed' : '270×270 mm bed';
    const ok = p.automatic;
    const badge = ok
      ? '<span class="hf-vd-badge ok">' + wrapIco('check') + 'FULLY AUTOMATIC</span>'
      : '<span class="hf-vd-badge warn">' + wrapIco('alert') + p.reloads.length + ' RELOAD' + (p.reloads.length === 1 ? '' : 'S') + ' NEEDED</span>';
    const line2 = ok
      ? 'All ' + p.colorCount + ' colours ride the four SnapSwap heads — swaps happen mid-print with ~4 g purge total. Nothing to set up in the slicer.'
      : p.colorCount + ' colours over ' + p.heads + ' heads: after a head finishes, swap its spool for the next colour when the U1 pauses at the marked layer (↻ in the elevation).';
    const reloadList = (!ok && p.reloads.length)
      ? '<ul class="hf-vd-reloads">' + p.reloads.map((r) =>
        '<li><span class="hf-sw sm" style="background:' + css(r.band.hex) + '"></span>swap head T' + r.slot + ' at layer ' + r.atLayer + '</li>').join('') + '</ul>'
      : '';
    host.innerHTML = [
      '<div class="hf-vd-top">' + badge + '<span class="hf-vd-count">' + p.colorCount + ' colours · ' + p.heads + ' heads</span></div>',
      '<div class="hf-vd-line">' + line2 + '</div>',
      reloadList,
      '<div class="hf-vd-facts"><span>' + bed + '</span><span>' + (S.stack ? S.stack.totalLayers : 0) + ' layers</span><span>' + heightMm + ' mm tall</span></div>',
    ].join('');
  }

  // ---- wiring -------------------------------------------------------------

  function wire(host) {
    const file = host.querySelector('#hfFile');
    const drop = host.querySelector('#hfDrop');
    if (drop) {
      drop.addEventListener('click', () => file && file.click());
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file && file.click(); } });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0]); });
    }
    if (file) file.addEventListener('change', (e) => { if (e.target.files[0]) loadImageFile(e.target.files[0]); e.target.value = ''; });

    const on = (sel, ev, fn) => { const el = host.querySelector(sel); if (el) el.addEventListener(ev, fn); };
    on('#hfReset', 'click', () => { S = defaults(); render(); });
    on('#hfChange', 'click', () => file && file.click());
    on('#hfAuto', 'click', () => { autoPalette(); render(); });
    on('#hfTune', 'click', runTune);
    on('#hfAdd', 'click', () => { addFilament(); render(); });
    on('#hfMaxColors', 'change', (e) => { S.maxColors = +e.target.value || 4; });
    on('#hfLayerH', 'input', (e) => { S.layerH = clampNum(e.target.value, 0.04, 0.28, 0.08); scheduleRepaint(); });
    on('#hfBase', 'input', (e) => { S.baseLayers = Math.round(clampNum(e.target.value, 1, 20, 4)); scheduleRepaint(); });
    on('#hfCopy', 'click', copyPlan);

    const stack = host.querySelector('#hfStack');
    if (stack) {
      stack.addEventListener('input', onStackInput);
      stack.addEventListener('click', onStackClick);
    }
  }

  function onStackInput(e) {
    const row = e.target.closest('.hf-fil'); if (!row) return;
    const i = +row.dataset.idx, fld = e.target.dataset.fld, f = S.filaments[i];
    if (!f || !fld) return;
    if (fld === 'hex') {
      f.hex = e.target.value; f.name = null; f.deltaE = null;
      const sw = row.querySelector('.hf-sw'); if (sw) sw.style.background = css(f.hex);
      const hx = row.querySelector('.hf-fil-hex'); if (hx) hx.textContent = String(f.hex).toUpperCase();
      const near = row.querySelector('.hf-fil-near'); if (near) near.remove();
    } else if (fld === 'td') {
      f.td = clampNum(e.target.value, 0.3, 20, 2);
    } else if (fld === 'layers') {
      f.layers = Math.round(clampNum(e.target.value, 1, 80, 12));
    }
    scheduleRepaint();
  }

  function onStackClick(e) {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const row = e.target.closest('.hf-fil'); if (!row) return;
    const i = +row.dataset.idx, act = btn.dataset.act;
    if (act === 'del') S.filaments.splice(i, 1);
    else if (act === 'up' && i < S.filaments.length - 1) swap(i, i + 1);   // "up" in the stack = higher index (drawn above)
    else if (act === 'down' && i > 0) swap(i, i - 1);
    render();
  }

  function swap(a, b) { const t = S.filaments[a]; S.filaments[a] = S.filaments[b]; S.filaments[b] = t; }

  function runTune() {
    const hf = HF();
    if (!hf || !S.img || !S.filaments.length) return;
    const btn = document.getElementById('hfTune');
    if (btn) { btn.disabled = true; btn.textContent = 'Tuning…'; }
    // let the disabled state paint before the (synchronous) optimise runs
    requestAnimationFrame(() => {
      const res = hf.autoTune(S.img, S.filaments, { layerH: S.layerH, baseLayers: S.baseLayers });
      S.filaments = S.filaments.map((f, i) => Object.assign({}, f, { layers: res.filaments[i] ? res.filaments[i].layers : f.layers }));
      S.baseLayers = res.baseLayers;
      render();
      // report the value actually shown (full-res solve), not the coarse tuning score
      const de = S.solve ? S.solve.meanDeltaE : res.meanDeltaE;
      toast('Tuned — match ΔE ' + de.toFixed(1));
    });
  }

  function addFilament() {
    const hf = HF();
    const hex = '#8899AA';
    S.filaments.push({ hex, td: hf ? hf.defaultTd(hex) : 3, layers: 12, name: null, deltaE: null });
  }

  function copyPlan() {
    if (!S.stack || !S.plan) return;
    const lines = [];
    lines.push('HueForge → Snapmaker U1  ·  ' + (S.imgName || 'painting'));
    lines.push('Layer height ' + S.layerH + ' mm · ' + S.stack.totalLayers + ' layers · ' + (S.stack.totalLayers * S.layerH).toFixed(2) + ' mm tall');
    lines.push('');
    S.stack.bands.forEach((b, i) => {
      const slot = S.plan.slots[i] ? S.plan.slots[i].slot : i % S.plan.heads;
      const reload = S.plan.reloads.some((r) => r.band === b);
      lines.push('Head T' + slot + '  ' + String(b.hex).toUpperCase() + '  TD ' + b.td + '  layers ' + b.startLayer + '–' + b.endLayer + (reload ? '  (reload at layer ' + b.startLayer + ')' : ''));
    });
    lines.push('');
    lines.push(S.plan.automatic ? 'Fully automatic on the U1 (4 SnapSwap heads).' : (S.plan.reloads.length + ' mid-print reload(s) needed.'));
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Print plan copied')).catch(() => toast('Copy failed'));
    } else { toast('Clipboard unavailable'); }
  }

  // ---- utils --------------------------------------------------------------

  function normHex(hex) {
    const kc = KC(); const rgb = kc && kc.hexToRgb(hex);
    return rgb ? kc.rgbToHex(rgb.r, rgb.g, rgb.b) : '#888888';
  }
  function clampNum(v, lo, hi, dflt) { let n = parseFloat(v); if (!isFinite(n)) n = dflt; return n < lo ? lo : n > hi ? hi : n; }
  function toast(msg) { if (typeof showToast === 'function') showToast(msg); else if (typeof global.toast === 'function') global.toast(msg); }

  function renderHueForge() { render(); }
  Object.assign(global, { renderHueForge });
})(typeof window !== 'undefined' ? window : this);
