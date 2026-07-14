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
    return { img: null, imgUrl: '', imgName: '', filaments: [], layerH: 0.12, baseLayers: 4, maxColors: 4, widthMm: 120, stack: null, solve: null, plan: null };
  }
  const LAYER_PRESETS = [[0.08, 'finest'], [0.12, 'recommended'], [0.16, ''], [0.20, 'fast']];

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
    // opaque foundation so the bed never bleeds through the bottom colour (~TD×1.3, per Kromacut)
    if (S.filaments[0]) S.baseLayers = clampNum(Math.round(S.filaments[0].td * 1.3 / S.layerH), 2, 20, 4);
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
    const opts = LAYER_PRESETS.slice();
    if (!opts.some((p) => Math.abs(p[0] - S.layerH) < 1e-6)) opts.push([S.layerH, 'custom']);
    const lopt = opts.map((p) => '<option value="' + p[0] + '"' + (Math.abs(p[0] - S.layerH) < 1e-6 ? ' selected' : '') + '>'
      + p[0].toFixed(2) + ' mm' + (p[1] ? ' · ' + p[1] : '') + '</option>').join('');
    return [
      '<div class="hf-card">',
      '<div class="hf-card-h">PRINT SETTINGS</div>',
      '<div class="hf-set">',
      '<label class="hf-num wide" title="Printed width on the bed (mm)">width (mm)<input type="number" id="hfWidth" min="40" max="270" step="1" value="' + esc(S.widthMm) + '" /></label>',
      '<label class="hf-num wide" title="Layer height">layer height<select class="input" id="hfLayerH">' + lopt + '</select></label>',
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
    const auto = S.plan && S.plan.automatic;
    const can3mf = auto && S.solve;
    return [
      '<div class="hf-card">',
      '<div class="hf-card-h">EXPORT</div>',
      '<div class="hf-export">',
      '<button type="button" class="btn primary sm" id="hf3mf"' + (can3mf ? '' : ' disabled title="Needs ≤4 colours (fits the U1 heads)"') + '>' + wrapIco('cube') + 'Export U1 3MF</button>',
      '<button type="button" class="btn ghost sm" id="hfStl">' + wrapIco('doc') + 'Relief STL</button>',
      '<button type="button" class="btn ghost sm" id="hfCopy">' + wrapIco('clipboard') + 'Copy plan</button>',
      '</div>',
      '<div class="hf-note">' + (can3mf
        ? 'The U1 3MF opens in Snapmaker Orca ready to slice — the four filaments are pre-mapped to the heads and the colour swaps are baked in by height. Just load the shown colours and print.'
        : 'Reduce to ≤4 colours for the one-click U1 3MF. The relief STL always works — slice it and load the plan’s filaments yourself.') + '</div>',
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
    const depthMm = S.img ? (S.widthMm * S.img.height / S.img.width) : 0;
    const size = S.img ? (Math.round(S.widthMm) + '×' + Math.round(depthMm) + '×' + heightMm + ' mm') : '';
    const bedX = prof && prof.bed ? prof.bed.x : 270;
    const overBed = S.img && (S.widthMm > bedX || depthMm > (prof && prof.bed ? prof.bed.y : 270));
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
      '<div class="hf-vd-facts"><span>' + size + '</span><span>' + (S.stack ? S.stack.totalLayers : 0) + ' layers</span>'
        + (overBed ? '<span class="hf-over">exceeds ' + bedX + ' mm bed — reduce width</span>' : '') + '</div>',
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
    on('#hfLayerH', 'change', (e) => { S.layerH = clampNum(e.target.value, 0.04, 0.28, 0.12); scheduleRepaint(); });
    on('#hfWidth', 'input', (e) => { S.widthMm = clampNum(e.target.value, 40, 270, 120); scheduleRepaint(); });
    on('#hfBase', 'input', (e) => { S.baseLayers = Math.round(clampNum(e.target.value, 1, 20, 4)); scheduleRepaint(); });
    on('#hfCopy', 'click', copyPlan);
    on('#hfStl', 'click', exportStl);
    on('#hf3mf', 'click', export3mf);

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
    const lh = S.stack.layerH, mm = (k) => (k * lh).toFixed(2);
    const depthMm = S.img ? Math.round(S.widthMm * S.img.height / S.img.width) : 0;
    const lines = [];
    lines.push('HueForge → Snapmaker U1  ·  ' + (S.imgName || 'painting'));
    lines.push('Size ' + Math.round(S.widthMm) + '×' + depthMm + '×' + mm(S.stack.totalLayers) + ' mm · '
      + 'layer ' + lh + ' mm · ' + S.stack.totalLayers + ' layers · 100% infill');
    lines.push('');
    S.stack.bands.forEach((b, i) => {
      const slot = S.plan.slots[i] ? S.plan.slots[i].slot : i % S.plan.heads;
      const reload = S.plan.reloads.some((r) => r.band === b);
      lines.push('Head T' + slot + '  ' + String(b.hex).toUpperCase() + '  TD ' + b.td
        + '  ·  layers ' + b.startLayer + '–' + b.endLayer + ' (' + mm(b.startLayer - 1) + '–' + mm(b.endLayer) + ' mm)'
        + (reload ? '  ← RELOAD this head at ' + mm(b.startLayer - 1) + ' mm' : ''));
    });
    lines.push('');
    lines.push(S.plan.automatic
      ? 'Fully automatic on the U1 — load these 4 colours into heads T0–T' + (S.plan.colorCount - 1) + '; swaps happen mid-print, no manual steps.'
      : (S.plan.reloads.length + ' mid-print reload(s) needed — swap the marked head when the U1 pauses at the listed height.'));
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('Print plan copied')).catch(() => toast('Copy failed'));
    } else { toast('Clipboard unavailable'); }
  }

  function export3mf() {
    if (!S.solve || !S.stack || !S.plan || !S.plan.automatic) { toast('Reduce to ≤4 colours first'); return; }
    const api = (typeof window !== 'undefined' && window.hubAPI);
    if (!api || !api.hfExport3mf) { toast('Export unavailable'); return; }
    const lh = S.stack.layerH;
    const bands = S.stack.bands.map((b, i) => ({
      z0: +((b.startLayer - 1) * lh).toFixed(4),
      z1: +(b.endLayer * lh).toFixed(4),
      head: S.plan.slots[i] ? S.plan.slots[i].slot : (i % S.plan.heads),
      hex: b.hex,
    }));
    const btn = document.getElementById('hf3mf');
    if (btn) { btn.disabled = true; btn.textContent = 'Building…'; }
    api.hfExport3mf({
      heights: Array.from(S.solve.heights),
      width: S.solve.width, height: S.solve.height,
      layerH: lh, widthMm: S.widthMm, bands,
      name: (S.imgName || 'hueforge').replace(/\.[^.]+$/, ''),
    }).then((r) => {
      render();
      if (r && r.ok) toast('U1 3MF saved · open in Snapmaker Orca');
      else if (r && r.canceled) { /* silent */ }
      else toast('Export failed' + (r && r.error ? ': ' + r.error : ''));
    }).catch((e) => { render(); toast('Export failed'); });
  }

  function exportStl() {
    const hf = HF();
    if (!hf || !S.solve || !S.stack) { toast('Nothing to export yet'); return; }
    const mesh = hf.heightfieldToMesh(S.solve, { layerH: S.stack.layerH, widthMm: S.widthMm });
    if (!mesh.triangleCount) { toast('Empty model'); return; }
    const bytes = hf.meshToStlBinary(mesh.triangles);
    const blob = new Blob([bytes], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (S.imgName || 'painting').replace(/\.[^.]+$/, '') + '-U1.stl';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('STL exported · ' + Math.round(mesh.sizeMm.x) + '×' + Math.round(mesh.sizeMm.y) + '×' + mesh.sizeMm.z.toFixed(1) + ' mm');
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
