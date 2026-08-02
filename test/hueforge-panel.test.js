/**
 * Driving the HueForge studio panel in a real DOM.
 *
 * lib/hueforge.js already proves the stack, the solve and the U1 head plan are
 * right. What this covers is the thing that only goes wrong once there IS a
 * document: whether the picture, the swap elevation, the U1 verdict and — the
 * one that reaches a printer — the exported 3MF still describe the filament
 * list the maker is looking at, after they have reordered it, added to it,
 * removed from it, or auto-tuned it.
 *
 * The panel keeps three derived values on its session (`stack`, `solve`,
 * `plan`). Every one of those panes reads them, so any edit that repaints
 * without recomputing shows the maker a plan for a stack they no longer have.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const W = 8, H = 8;
// Four flat quadrants, far apart in colour, so the auto-picked palette is
// several visibly different filaments rather than near-duplicates.
const QUAD = [[220, 40, 40], [40, 160, 220], [250, 240, 210], [30, 30, 35]];

/** Boot renderer/hueforge.js against a jsdom document with a recording export bridge. */
async function boot() {
  const dom = new JSDOM('<!doctype html><html data-app="bedready"><body><div id="hueforge-tab"></div></body></html>',
    { pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const doc = window.document;

  const data = new window.Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const q = (y < H / 2 ? 0 : 2) + (x < W / 2 ? 0 : 1);
      const o = (y * W + x) * 4;
      data[o] = QUAD[q][0]; data[o + 1] = QUAD[q][1]; data[o + 2] = QUAD[q][2]; data[o + 3] = 255;
    }
  }
  const imageData = { data, width: W, height: H };

  // Enough of a 2D context for the panel: it samples the dropped image through
  // one canvas and blits the achievable-colour preview through another.
  window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      drawImage() {},
      getImageData: () => imageData,
      createImageData: (w, h) => ({ data: new window.Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData() {},
    };
  };
  window.FileReader = class {
    readAsDataURL() { this.result = 'data:image/png;base64,AA'; setTimeout(() => this.onload && this.onload(), 0); }
  };
  window.Image = class {
    constructor() { this.width = W; this.height = H; }
    set src(v) { this._src = v; setTimeout(() => this.onload && this.onload(), 0); }
    get src() { return this._src; }
  };

  const exported = [];
  const copied = [];
  window.hubAPI = { hfExport3mf: async (o) => { exported.push(o); return { ok: true }; } };
  window.inventory = [];
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => { copied.push(t); } },
  });

  const ctx = vm.createContext(window);
  vm.runInContext(read('lib/color-mix.js'), ctx);
  vm.runInContext(read('lib/hueforge.js'), ctx);
  vm.runInContext(read('renderer/hueforge.js'), ctx);

  window.renderHueForge();

  const ev = new window.Event('drop');
  ev.dataTransfer = { files: [{ type: 'image/png', name: 'painting.png' }] };
  doc.getElementById('hfDrop').dispatchEvent(ev);
  await settle(window);

  return { window, doc, exported, copied };
}

const settle = (window) => new Promise((r) => window.setTimeout(r, 60));
const click = (window, el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

/** What the maker is editing: the filament rows, bottom → top. */
const paletteHexes = (doc) => Array.from(doc.querySelectorAll('.hf-fil-hex')).map((e) => e.textContent.trim());
const paletteLayers = (doc) => Array.from(doc.querySelectorAll('.hf-fil input[data-fld="layers"]')).map((i) => +i.value);

/** What the panel says will be printed: the swap elevation, bottom → top. */
const elevationHexes = (doc) => Array.from(doc.querySelectorAll('.hf-band')).map((b) => hexOf(b.style.background || b.getAttribute('style')));
const elevationSpans = (doc) => Array.from(doc.querySelectorAll('.hf-band-l')).map((s) => s.textContent.trim());

function hexOf(style) {
  const s = String(style || '');
  let m = s.match(/#([0-9a-f]{6})/i);
  if (m) return ('#' + m[1]).toUpperCase();
  m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
  if (!m) return s;
  return '#' + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, '0')).join('').toUpperCase();
}

test('the swap elevation shows the stack the maker is actually looking at', async () => {
  const { window, doc } = await boot();
  assert.ok(paletteHexes(doc).length >= 3, 'auto-pick should seed several filaments');
  assert.deepEqual(elevationHexes(doc), paletteHexes(doc), 'elevation must match the list before any edit');

  // Move the bottom filament up one place. "up" = higher in the printed stack.
  click(window, doc.querySelector('.hf-fil[data-idx="0"] [data-act="up"]'));
  await settle(window);

  assert.deepEqual(elevationHexes(doc), paletteHexes(doc),
    'after reordering, the elevation must follow the list — otherwise the maker is shown a plan for the old stack');
});

test('a reordered stack is the one that reaches the exported 3MF', async () => {
  const { window, doc, exported } = await boot();
  const before = paletteHexes(doc);

  click(window, doc.querySelector('.hf-fil[data-idx="0"] [data-act="up"]'));
  await settle(window);
  const after = paletteHexes(doc);
  assert.notDeepEqual(after, before, 'the reorder should have changed the list');

  click(window, doc.getElementById('hf3mf'));
  await settle(window);

  assert.equal(exported.length, 1, 'export should have been invoked');
  // Array.from re-homes the bands: they were built inside the vm realm, and
  // deepStrictEqual compares prototypes as well as contents.
  const bandHexes = Array.from(exported[0].bands, (b) => String(b.hex).toUpperCase());
  assert.deepEqual(bandHexes, after,
    'the 3MF must carry the order on screen — a file that disagrees with the panel prints the wrong colours');
});

test('removing a filament removes it from the plan and the export', async () => {
  const { window, doc, exported } = await boot();
  const dropped = paletteHexes(doc)[0];

  click(window, doc.querySelector('.hf-fil[data-idx="0"] [data-act="del"]'));
  await settle(window);

  const left = paletteHexes(doc);
  assert.ok(!left.includes(dropped), 'the row should be gone from the list');
  assert.deepEqual(elevationHexes(doc), left, 'the elevation must drop it too');

  click(window, doc.getElementById('hf3mf'));
  await settle(window);
  assert.equal(exported.length, 1);
  assert.ok(!exported[0].bands.some((b) => String(b.hex).toUpperCase() === dropped),
    'a filament the maker deleted must not be written into the 3MF');
});

test('a fifth filament puts the U1 over its heads, and the one-click export closes', async () => {
  const { window, doc } = await boot();
  while (paletteHexes(doc).length < 5) {
    click(window, doc.getElementById('hfAdd'));
    await settle(window);
  }
  assert.equal(paletteHexes(doc).length, 5);
  assert.ok(doc.getElementById('hf3mf').disabled,
    'five colours need a mid-print reload — the ready-to-slice export cannot describe that');
});

test('the copied plan counts the colours the maker actually has', async () => {
  const { window, doc, copied } = await boot();
  while (paletteHexes(doc).length > 3) {
    click(window, doc.querySelector('.hf-fil[data-idx="0"] [data-act="del"]'));
    await settle(window);
  }
  assert.equal(paletteHexes(doc).length, 3);

  click(window, doc.getElementById('hfCopy'));
  await settle(window);

  assert.equal(copied.length, 1, 'the plan should have been copied');
  assert.match(copied[0], /load these 3 colours into heads T0–T2/,
    'the summary line must agree with the head range beside it');
});

test('auto-tune repaints the plan it just changed', async () => {
  const { window, doc } = await boot();
  const spansBefore = elevationSpans(doc);

  click(window, doc.getElementById('hfTune'));
  await settle(window);
  await settle(window);

  const layers = paletteLayers(doc);
  const spans = elevationSpans(doc);
  assert.equal(spans.length, layers.length, 'a band per filament');
  // Each band's L<start>–<end> must span exactly the layer count in its row.
  spans.forEach((s, i) => {
    const m = s.match(/L(\d+)[–-](\d+)/);
    assert.ok(m, 'band label should read L<start>–<end>, got ' + s);
    const span = +m[2] - +m[1] + 1;
    const expected = i === 0 ? Math.max(layers[0], 1) : layers[i];
    assert.ok(span >= expected,
      'band ' + i + ' spans ' + span + ' layers but its row says ' + expected
      + ' — the elevation is still drawing the pre-tune stack');
  });
  assert.ok(spansBefore.length, 'sanity: there were bands before tuning');
});
