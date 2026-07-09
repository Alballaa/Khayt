'use strict';
/*
 * Calibration Assistant (Bed Ready) — a guided tool for dialing in a new filament.
 * Picks a test (temperature tower, flow, retraction, first layer, XYZ cube), shows
 * a material-aware parameter sweep + step-by-step instructions, and GENERATES a real,
 * printable test model (procedural ASCII STL) saved via the native save dialog.
 *
 * Loaded only by bedready.html, so the "Calibrate" entry point is Bed Ready-only.
 * Strings are English (technical maker jargon) to match the flavor's home surface;
 * no i18n keys are added, so the locale-parity gate is unaffected.
 */
(function (global) {
  const hub = () => (typeof window !== 'undefined' && window.hubAPI) || null;
  const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s));

  // Per-material recommended temperature range [start, end, step] (°C) and a typical
  // first-layer / print speed hint. Approximate starting points — adjust to your setup.
  const MATERIALS = {
    'PLA':  { temp: [190, 220, 5], bed: 60,  speed: 60 },
    'PLA+': { temp: [195, 225, 5], bed: 60,  speed: 60 },
    'PETG': { temp: [220, 250, 5], bed: 80,  speed: 45 },
    'ABS':  { temp: [230, 260, 5], bed: 100, speed: 45 },
    'ASA':  { temp: [235, 265, 5], bed: 100, speed: 45 },
    'TPU':  { temp: [210, 235, 5], bed: 40,  speed: 25 },
    'Nylon':{ temp: [240, 270, 5], bed: 80,  speed: 40 },
  };
  const matKeys = Object.keys(MATERIALS);

  const TESTS = {
    temp: {
      name: 'Temperature tower',
      blurb: 'Find the temperature with the best layer bonding, surface and bridging.',
      model: 'tower',
      steps: (m) => {
        const [a, b, s] = MATERIALS[m].temp;
        const n = Math.floor((b - a) / s) + 1;
        return [
          `Slice the tower and add a temperature change every band (${Math.round(80 / n)} mm ÷ ${n} bands).`,
          `Sweep ${a} °C → ${b} °C in ${s} °C steps (top = coolest or hottest, your call).`,
          'Print, then pick the band with the cleanest surface and strongest overhang.',
          'Record the winning temperature below.',
        ];
      },
      sweep: (m) => { const [a, b, s] = MATERIALS[m].temp; return `${a}–${b} °C · ${s} °C steps`; },
    },
    flow: {
      name: 'Flow / extrusion multiplier',
      blurb: 'Correct over/under-extrusion so walls are exactly the right thickness.',
      model: 'cube',
      steps: () => [
        'Print the hollow calibration cube in vase / single-wall mode.',
        'Measure the wall thickness with calipers (aim = your nozzle line width, e.g. 0.42 mm).',
        'New flow = current flow × (target ÷ measured). Re-slice and verify.',
      ],
      sweep: () => 'measure wall → adjust flow %',
    },
    retraction: {
      name: 'Retraction',
      blurb: 'Kill stringing between separated features.',
      model: 'towers2',
      steps: () => [
        'Print the two-pillar test; watch for strings across the gap.',
        'Sweep retraction distance 0.5–2 mm (direct) or 3–7 mm (Bowden) in 0.5 mm steps.',
        'Pick the shortest distance with no strings; too much causes clogs.',
      ],
      sweep: () => 'direct 0.5–2 mm · Bowden 3–7 mm · 0.5 mm steps',
    },
    firstlayer: {
      name: 'First layer',
      blurb: 'Dial in Z-offset and squish for a perfect, well-adhered base.',
      model: 'patch',
      steps: () => [
        'Print the flat patch; live-tune Z-offset while the first layer lays down.',
        'Lines should touch with no gaps and no ridging.',
        'Save the Z-offset once the surface is smooth and even.',
      ],
      sweep: () => 'live-tune Z-offset (~±0.05 mm)',
    },
    xyz: {
      name: 'XYZ dimensional cube',
      blurb: 'Check X/Y/Z accuracy and steps-per-mm.',
      model: 'cube',
      steps: () => [
        'Print the 20 mm cube at your tuned temperature.',
        'Measure each axis with calipers; each should read 20.00 mm.',
        'If an axis is off, adjust that axis’ steps/mm by (20 ÷ measured).',
      ],
      sweep: () => 'target 20.00 mm per axis',
    },
  };

  // ---- procedural ASCII STL ----------------------------------------------------
  function boxTris(x0, y0, z0, x1, y1, z1) {
    const v = (x, y, z) => [x, y, z];
    const q = (n, a, b, c, d) => [{ n, v: [a, b, c] }, { n, v: [a, c, d] }];
    let t = [];
    t = t.concat(q([0, 0, -1], v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0)));   // bottom
    t = t.concat(q([0, 0, 1],  v(x0, y0, z1), v(x0, y1, z1), v(x1, y1, z1), v(x1, y0, z1)));   // top
    t = t.concat(q([0, -1, 0], v(x0, y0, z0), v(x0, y0, z1), v(x1, y0, z1), v(x1, y0, z0)));   // front
    t = t.concat(q([0, 1, 0],  v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)));   // back
    t = t.concat(q([-1, 0, 0], v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1), v(x0, y0, z1)));   // left
    t = t.concat(q([1, 0, 0],  v(x1, y0, z0), v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0)));   // right
    return t;
  }
  function stlFromTris(tris, name) {
    const f = (x) => (Math.round(x * 1000) / 1000).toString();
    let s = `solid ${name}\n`;
    for (const tr of tris) {
      s += `facet normal ${f(tr.n[0])} ${f(tr.n[1])} ${f(tr.n[2])}\nouter loop\n`;
      for (const p of tr.v) s += `vertex ${f(p[0])} ${f(p[1])} ${f(p[2])}\n`;
      s += `endloop\nendfacet\n`;
    }
    return s + `endsolid ${name}\n`;
  }
  function buildModel(kind, material) {
    if (kind === 'cube') return stlFromTris(boxTris(0, 0, 0, 20, 20, 20), 'xyz_cube');
    if (kind === 'patch') return stlFromTris(boxTris(0, 0, 0, 60, 60, 0.3), 'first_layer_patch');
    if (kind === 'towers2') {
      let t = boxTris(0, 0, 0, 8, 8, 40).concat(boxTris(18, 0, 0, 26, 8, 40));   // two pillars
      t = t.concat(boxTris(0, 3, 38, 26, 5, 40));                                 // top bridge
      return stlFromTris(t, 'retraction_test');
    }
    // temperature tower — a stepped staircase so each band steps back (overhang test)
    const [a, b, s] = (MATERIALS[material] || MATERIALS.PLA).temp;
    const bands = Math.max(2, Math.floor((b - a) / s) + 1);
    const bandH = 8;
    let t = [];
    for (let i = 0; i < bands; i++) {
      const depth = 20 - i * (12 / bands);   // front steps back each band
      t = t.concat(boxTris(0, 0, i * bandH, 40, depth, (i + 1) * bandH));
      // a small overhang tab off the front of each band
      t = t.concat(boxTris(5, depth, i * bandH + bandH - 2, 35, depth + 6, i * bandH + bandH));
    }
    return stlFromTris(t, 'temp_tower');
  }

  // ---- log (kept alongside the per-spool test-print library, but standalone) ----
  function calLog() {
    if (typeof settings === 'undefined') return [];
    if (!Array.isArray(settings.calibrationLog)) settings.calibrationLog = [];
    return settings.calibrationLog;
  }

  function openCalibration() {
    let test = 'temp';
    let material = matKeys[0];
    let result = '';

    const body = `
      <div class="cal-wrap">
        <div class="cal-row">
          <label>Test</label>
          <select id="calTest">${Object.keys(TESTS).map((k) => `<option value="${k}">${esc(TESTS[k].name)}</option>`).join('')}</select>
          <label>Material</label>
          <select id="calMat">${matKeys.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select>
        </div>
        <div id="calDetail"></div>
        <div class="cal-actions">
          <button type="button" class="btn primary" id="calDownload">⬇ Download test model (.stl)</button>
          <button type="button" class="btn ghost" id="calCopy">📋 Copy plan</button>
        </div>
        <div class="cal-log-head">Result log</div>
        <div class="cal-record">
          <input type="text" id="calResult" placeholder="Best value (e.g. 205 °C, 1.5 mm, 0.98 flow)…">
          <button type="button" class="btn ghost" id="calSave">Save result</button>
        </div>
        <div id="calLog"></div>
      </div>`;

    const detailHtml = () => {
      const T = TESTS[test];
      const steps = T.steps(material).map((s) => `<li>${esc(s)}</li>`).join('');
      return `
        <div class="cal-blurb">${esc(T.blurb)}</div>
        <div class="cal-sweep"><span class="cal-tag">${esc(TESTS[test].name)}</span> ${esc(T.sweep(material))}</div>
        <ol class="cal-steps">${steps}</ol>`;
    };
    const planText = () => {
      const T = TESTS[test];
      return `${T.name} — ${material}\nSweep: ${T.sweep(material)}\n` + T.steps(material).map((s, i) => `${i + 1}. ${s}`).join('\n');
    };
    const logHtml = () => {
      const rows = calLog().slice(0, 8);
      if (!rows.length) return '<div class="cal-log-empty">No results logged yet.</div>';
      return rows.map((r) => `<div class="cal-log-row"><span class="cal-log-test">${esc(r.test)}</span><span class="cal-log-mat">${esc(r.material)}</span><span class="cal-log-val">${esc(r.result)}</span><span class="cal-log-date">${esc((r.date || '').slice(0, 10))}</span></div>`).join('');
    };

    openFormModal({
      title: '🎯 Calibration Assistant',
      bodyHtml: body,
      noSave: true,
      onMount(modal) {
        const detail = modal.querySelector('#calDetail');
        const logEl = modal.querySelector('#calLog');
        const paint = () => { detail.innerHTML = detailHtml(); };
        const paintLog = () => { logEl.innerHTML = logHtml(); };
        modal.querySelector('#calTest').addEventListener('change', (e) => { test = e.target.value; paint(); });
        modal.querySelector('#calMat').addEventListener('change', (e) => { material = e.target.value; paint(); });
        modal.querySelector('#calDownload').addEventListener('click', async () => {
          const stl = buildModel(TESTS[test].model, material);
          const name = `${test}-${material.replace(/[^a-z0-9]+/gi, '')}.stl`.toLowerCase();
          if (hub() && hub().saveTextFile) {
            const r = await hub().saveTextFile({ content: stl, defaultName: name, filters: [{ name: 'STL model', extensions: ['stl'] }] });
            if (r && r.ok !== false) toast('Model saved ✓', 'success');
          } else if (typeof downloadBlob === 'function') {
            downloadBlob(stl, name, 'model/stl');
          }
        });
        modal.querySelector('#calCopy').addEventListener('click', () => {
          navigator.clipboard?.writeText(planText()).then(() => toast(t('common.copied') || 'Copied!', 'success')).catch(() => {});
        });
        modal.querySelector('#calSave').addEventListener('click', () => {
          result = modal.querySelector('#calResult').value.trim();
          if (!result) return;
          calLog().unshift({ id: 'CAL' + Date.now(), test: TESTS[test].name, material, result, date: new Date().toISOString() });
          if (typeof saveAll === 'function') saveAll();
          modal.querySelector('#calResult').value = '';
          paintLog();
          toast('Result saved ✓', 'success');
        });
        paint();
        paintLog();
      },
    });
  }

  const api = { openCalibration, _buildModel: buildModel, TESTS };
  Object.assign(global, api);
  global.KhaytCalibration = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
