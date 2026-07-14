'use strict';
/**
 * HueForge-style filament-painting engine — pure, DOM-free, Node-testable.
 * Bed Ready's own take on "colour by material", tuned for the Snapmaker U1.
 *
 * The idea (same as HueForge): print a flat relief whose surface HEIGHT varies per
 * pixel. An ordered stack of filaments is swapped at fixed global Z-heights, so at any
 * point the visible colour is the light-transmission composite of every layer beneath
 * the surface. Because the swaps are global (by layer, not by XY paint), the set of
 * achievable colours is a single 1-D gradient `colour(k)` parameterised by the number of
 * printed layers k — every pixel just picks the height whose colour is closest to its
 * target. That maps perfectly onto the U1's 4 always-loaded SnapSwap heads: ≤4 filaments
 * print fully automatically; more need mid-print reloads.
 *
 * Transmission model: each layer of filament f adds opacity a = 1 − exp(−layerH / TD),
 * where TD (Transmission Distance, mm) is how far light penetrates f before it is blocked
 * — low TD = opaque (darks), high TD = translucent (whites/naturals that let lower colours
 * bleed through). Layers are composited bottom→top in linear light.
 *
 * Colour maths (hex/rgb/Lab, CIEDE2000, nearest) come from lib/color-mix.js.
 */
(function (global) {
  const KC = (typeof module !== 'undefined' && module.exports)
    ? require('./color-mix')
    : (global.KhaytColor || {});

  const DEFAULT_LAYER_H = 0.08;    // mm — HueForge de-facto standard for PLA
  const DEFAULT_BASE_LAYERS = 4;   // opaque floor so the bed never bleeds through
  const DEFAULT_BAND_LAYERS = 12;  // layers per filament band when not specified
  const U1_HEADS = 4;              // Snapmaker U1 SnapSwap toolheads

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const srgbToLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const linearToSrgb = (c) => { const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return clamp(v * 255, 0, 255); };

  /** Perceived luminance 0..1 of a hex colour. */
  function luminance(hex) {
    const rgb = KC.hexToRgb(hex);
    if (!rgb) return 0.5;
    return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  }

  /**
   * A sensible starting TD (mm) for a colour we have no measured value for: opaque darks
   * low (~1.2), translucent lights high (~11). Only a seed — the maker can override, and
   * real TD should ultimately come from a stepped-swatch calibration.
   */
  function defaultTd(hex) {
    const lum = luminance(hex);
    return Math.round((0.8 + lum * lum * 5) * 10) / 10;
  }

  /**
   * Per-layer opacity of filament with transmission distance `td` at layer height `h`.
   * TD is treated as the thickness at which the filament reads ~90% opaque (light is
   * blocked to 10%): a band of thickness T reaches 1 − 0.1^(T/TD). Low TD = opaque, high
   * TD = translucent (lets lower colours bleed through — where the blending happens).
   */
  function layerAlpha(h, td) {
    const t = Math.max(0.05, +td || 4);
    return 1 - Math.pow(0.1, Math.max(0, h) / t);
  }

  /** A sensible band thickness (layers) for a filament: translucent (high TD) needs more
   *  layers to read; opaque needs few. Clamped to a printable range. */
  function suggestLayers(td, layerH) {
    const h = +layerH > 0 ? +layerH : DEFAULT_LAYER_H;
    return clamp(Math.round((+td || 2) / h * 0.25), 8, 40);
  }

  /**
   * Order a filament set for printing: opaque (low TD) at the bottom, translucent (high
   * TD) on top so upper layers let the colours beneath show through — the HueForge rule.
   * Returns a new array; does not mutate.
   */
  function orderByOpacity(filaments) {
    return (filaments || []).slice().sort((a, b) => (a.td || defaultTd(a.hex)) - (b.td || defaultTd(b.hex)));
  }

  /**
   * Build the print stack + achievable-colour gradient from an ordered filament list.
   * @param {Array<{hex,td?,layers?}>} filaments  bottom→top
   * @param {{layerH?:number, baseLayers?:number}} [opts]
   * @returns {{layerH, baseLayers, totalLayers, bands:[], palette:[], filaments:[]}}
   *   bands   = [{index,hex,td,layers,startLayer,endLayer}]  (1-based layer ranges)
   *   palette = [{k,height,hex,lab}] for k in [baseLayers..totalLayers]  (the colour path)
   */
  function buildStack(filaments, opts) {
    opts = opts || {};
    const layerH = +opts.layerH > 0 ? +opts.layerH : DEFAULT_LAYER_H;
    const baseLayers = Math.max(1, Math.round(opts.baseLayers != null ? opts.baseLayers : DEFAULT_BASE_LAYERS));
    const fils = (filaments || []).map((f) => ({
      hex: f.hex,
      td: +f.td > 0 ? +f.td : defaultTd(f.hex),
      layers: Math.max(1, Math.round(+f.layers > 0 ? +f.layers : DEFAULT_BAND_LAYERS)),
    })).filter((f) => KC.hexToRgb(f.hex));

    const bands = [];
    let layer = 0;
    fils.forEach((f, i) => {
      const start = layer + 1;
      layer += (i === 0 ? Math.max(f.layers, baseLayers) : f.layers);
      bands.push({ index: i, hex: f.hex, td: f.td, layers: layer - start + 1, startLayer: start, endLayer: layer });
    });
    const totalLayers = layer;

    // filament active at global layer k (1-based)
    const filAt = (k) => {
      for (let i = 0; i < bands.length; i++) if (k >= bands[i].startLayer && k <= bands[i].endLayer) return fils[i];
      return fils[fils.length - 1];
    };

    // Composite the reflective colour after k printed layers (bottom→top, linear light).
    const palette = [];
    if (fils.length) {
      const first = KC.hexToRgb(fils[0].hex);
      let R = srgbToLinear(first.r), G = srgbToLinear(first.g), B = srgbToLinear(first.b);
      for (let k = 1; k <= totalLayers; k++) {
        if (k > 1) {
          const f = filAt(k);
          const rgb = KC.hexToRgb(f.hex);
          const a = layerAlpha(layerH, f.td);
          R = R * (1 - a) + srgbToLinear(rgb.r) * a;
          G = G * (1 - a) + srgbToLinear(rgb.g) * a;
          B = B * (1 - a) + srgbToLinear(rgb.b) * a;
        }
        if (k >= baseLayers) {
          const hex = KC.rgbToHex(linearToSrgb(R), linearToSrgb(G), linearToSrgb(B));
          palette.push({ k, height: +(k * layerH).toFixed(3), hex, lab: KC.rgbToLab(KC.hexToRgb(hex)) });
        }
      }
    }

    return { layerH, baseLayers, totalLayers, bands, palette, filaments: fils };
  }

  /**
   * Solve a heightfield: for each pixel, choose the palette height whose colour is the
   * closest CIEDE2000 match to the target pixel. Returns per-pixel layer counts + an RGBA
   * preview of the achievable result.
   * @param {{data:Uint8ClampedArray, width:number, height:number}} img
   * @param {ReturnType<buildStack>} stack
   * @returns {{heights:Uint16Array, preview:Uint8ClampedArray, width, height, minK, maxK}}
   */
  function solveHeightfield(img, stack) {
    const { data, width, height } = img;
    const pal = stack.palette;
    const n = width * height;
    const heights = new Uint16Array(n);
    const preview = new Uint8ClampedArray(n * 4);
    if (!pal.length) return { heights, preview, width, height, minK: 0, maxK: 0 };

    // pre-split palette rgb for the preview blit
    const palRgb = pal.map((p) => KC.hexToRgb(p.hex));
    let minK = Infinity, maxK = -Infinity, lossSum = 0, lossN = 0;

    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const a = data[o + 3];
      // transparent pixels → floor (base) so they print as the base colour
      const lab = KC.rgbToLab({ r: data[o], g: data[o + 1], b: data[o + 2] });
      let best = 0, bestD = Infinity;
      for (let j = 0; j < pal.length; j++) {
        const d = KC.ciede2000(lab, pal[j].lab);
        if (d < bestD) { bestD = d; best = j; }
      }
      if (a < 8) best = 0; else { lossSum += bestD; lossN++; }
      const k = pal[best].k;
      heights[i] = k;
      if (k < minK) minK = k;
      if (k > maxK) maxK = k;
      const rgb = palRgb[best];
      preview[o] = rgb.r; preview[o + 1] = rgb.g; preview[o + 2] = rgb.b; preview[o + 3] = 255;
    }
    return {
      heights, preview, width, height,
      minK: isFinite(minK) ? minK : 0, maxK: isFinite(maxK) ? maxK : 0,
      meanDeltaE: lossN ? lossSum / lossN : 0,
    };
  }

  /** Mean CIEDE2000 between an image and the colours a stack can achieve — the "match
   *  quality" of a plan (lower = closer). Runs on a downsample for speed. */
  function scorePlan(img, filaments, opts) {
    const small = downsample(img, 64);
    const stack = buildStack(filaments, opts);
    return solveHeightfield(small, stack).meanDeltaE;
  }

  /** Pick every `stride`-th pixel down to a target longest side — cheap loss evaluation. */
  function downsample(img, maxSide) {
    const { data, width, height } = img;
    const stride = Math.max(1, Math.ceil(Math.max(width, height) / maxSide));
    if (stride === 1) return img;
    const w = Math.ceil(width / stride), h = Math.ceil(height / stride);
    const out = new Uint8ClampedArray(w * h * 4);
    let oi = 0;
    for (let y = 0; y < height; y += stride) {
      for (let x = 0; x < width; x += stride) {
        const o = (y * width + x) * 4;
        out[oi] = data[o]; out[oi + 1] = data[o + 1]; out[oi + 2] = data[o + 2]; out[oi + 3] = data[o + 3];
        oi += 4;
      }
    }
    return { data: out, width: w, height: h };
  }

  /**
   * Auto-tune band thicknesses (and base) to minimise the image match ΔE — a clean,
   * greedy coordinate-descent reimplementation of the "optimise" idea (inspired by
   * AutoForge, hvoss-techfak/AutoForge, CC-BY-NC-SA; concept only, no code/data borrowed).
   * Filament colours + order are kept; only how many layers each gets is tuned.
   * @returns {{filaments:Array, baseLayers:number, meanDeltaE:number}}
   */
  function autoTune(img, filaments, opts) {
    opts = opts || {};
    const layerH = +opts.layerH > 0 ? +opts.layerH : DEFAULT_LAYER_H;
    const small = downsample(img, 72);
    let fils = filaments.map((f) => Object.assign({}, f, { layers: Math.max(4, Math.round(f.layers || suggestLayers(f.td, layerH))) }));
    let base = Math.max(1, Math.round(opts.baseLayers != null ? opts.baseLayers : DEFAULT_BASE_LAYERS));
    const CANDS = [4, 6, 8, 10, 12, 16, 20, 26, 32, 40];

    const score = (fl, b) => solveHeightfield(small, buildStack(fl, { layerH, baseLayers: b })).meanDeltaE;
    let bestScore = score(fils, base);

    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let i = 0; i < fils.length; i++) {
        let localBest = fils[i].layers, localScore = bestScore;
        for (const c of CANDS) {
          if (c === fils[i].layers) continue;
          const trial = fils.map((f, j) => (j === i ? Object.assign({}, f, { layers: c }) : f));
          const s = score(trial, base);
          if (s < localScore - 1e-4) { localScore = s; localBest = c; }
        }
        if (localBest !== fils[i].layers) { fils[i] = Object.assign({}, fils[i], { layers: localBest }); bestScore = localScore; improved = true; }
      }
      // tune base a little
      for (const b of [2, 3, 4, 5, 6, 8]) {
        const s = score(fils, b);
        if (s < bestScore - 1e-4) { bestScore = s; base = b; }
      }
      if (!improved) break;
    }
    return { filaments: fils, baseLayers: base, meanDeltaE: bestScore };
  }

  /**
   * Suggest a starting filament palette from an image: k-means the dominant colours, then
   * (if the maker owns colour filaments) snap each to the nearest one they actually have.
   * Ordered opaque→translucent. Every entry is editable afterwards.
   * @param {{data:Uint8ClampedArray,width:number,height:number}} img
   * @param {Array} owned   inventory items with a `.color` hex (may be empty)
   * @param {number} maxColors
   */
  function suggestFilaments(img, owned, maxColors) {
    const K = Math.max(2, Math.min(8, Math.round(maxColors || U1_HEADS)));
    const centroids = kmeans(img, K);
    const ownedList = (owned || []).filter((it) => it && KC.hexToRgb(it.color));

    const out = centroids.map((hex) => {
      let resolvedHex = hex, name = null, deltaE = null;
      if (ownedList.length) {
        const near = KC.nearest(hex, ownedList, { limit: 1 })[0];
        if (near) {
          resolvedHex = near.color;
          name = [near.material, near.colourVariant].filter(Boolean).join(' — ') || near.brand || null;
          deltaE = near.deltaE;
        }
      }
      const td = defaultTd(resolvedHex);
      return { hex: resolvedHex, td, layers: suggestLayers(td, DEFAULT_LAYER_H), sourceHex: hex, name, deltaE };
    });

    // de-dupe filaments that snapped to the same owned spool
    const seen = new Set();
    const deduped = out.filter((f) => { const key = f.hex.toUpperCase(); if (seen.has(key)) return false; seen.add(key); return true; });
    return orderByOpacity(deduped);
  }

  /** Tiny k-means over a downsampled pixel set → K centroid hexes (sorted by luminance). */
  function kmeans(img, K) {
    const { data, width, height } = img;
    const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 4096))); // ~≤4k samples
    const pts = [];
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const o = (y * width + x) * 4;
        if (data[o + 3] < 8) continue;
        pts.push([data[o], data[o + 1], data[o + 2]]);
      }
    }
    if (!pts.length) return ['#202020', '#808080', '#E0E0E0'].slice(0, K);
    // seed: spread across luminance
    pts.sort((a, b) => (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) - (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]));
    let cent = [];
    for (let i = 0; i < K; i++) cent.push(pts[Math.floor((i + 0.5) / K * (pts.length - 1))].slice());

    for (let iter = 0; iter < 8; iter++) {
      const sums = cent.map(() => [0, 0, 0, 0]);
      for (let p = 0; p < pts.length; p++) {
        const pt = pts[p];
        let bi = 0, bd = Infinity;
        for (let c = 0; c < cent.length; c++) {
          const dx = pt[0] - cent[c][0], dy = pt[1] - cent[c][1], dz = pt[2] - cent[c][2];
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bd) { bd = d; bi = c; }
        }
        sums[bi][0] += pt[0]; sums[bi][1] += pt[1]; sums[bi][2] += pt[2]; sums[bi][3]++;
      }
      for (let c = 0; c < cent.length; c++) {
        if (sums[c][3]) { cent[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]]; }
      }
    }
    return cent
      .sort((a, b) => (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) - (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]))
      .map((c) => KC.rgbToHex(c[0], c[1], c[2]));
  }

  /**
   * Map the stack's filaments onto the U1's toolheads. ≤maxHeads → each colour is an
   * always-loaded head, fully automatic. More → the overflow colours reuse a finished
   * head via a mid-print reload pause at that colour's first layer.
   * @param {ReturnType<buildStack>} stack
   * @param {number} [maxHeads=4]
   */
  function u1Plan(stack, maxHeads) {
    const heads = Math.max(1, Math.round(maxHeads || U1_HEADS));
    const bands = stack.bands || [];
    const slots = [];   // [{slot, band}]  slot is 0-based head index
    const reloads = []; // [{atLayer, band, slot}]
    bands.forEach((b, i) => {
      const slot = i % heads;
      slots.push({ slot, band: b });
      if (i >= heads) reloads.push({ atLayer: b.startLayer, band: b, slot });
    });
    return {
      heads,
      colorCount: bands.length,
      automatic: bands.length <= heads,
      slots,
      reloads,
    };
  }

  const api = {
    DEFAULT_LAYER_H, DEFAULT_BASE_LAYERS, DEFAULT_BAND_LAYERS, U1_HEADS,
    luminance, defaultTd, layerAlpha, suggestLayers, orderByOpacity,
    buildStack, solveHeightfield, suggestFilaments, u1Plan,
    scorePlan, autoTune, downsample,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytHueForge = Object.assign(global.KhaytHueForge || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
