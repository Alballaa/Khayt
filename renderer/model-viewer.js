'use strict';
/*
 * Interactive 3D model viewer (Bed Ready) — orbit a print file's mesh right in the app,
 * no WebGL / three.js. It reuses the existing software rasterizer (lib/stl-thumbnail.js,
 * extended with yaw/pitch) and the mesh the main process already knows how to parse for
 * STL and 3MF (a flat Float32Array). Drag to rotate, toggle auto-spin.
 *
 * Loaded only by bedready.html, so the "3D" print-file action + converter preview are
 * Bed Ready-only. `mountMeshViewer` wires a bare <canvas> so it can live in its own modal
 * (openModelViewer) or inline in another panel (the converter's "what am I converting?").
 */
(function (global) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Rebuild the [[x,y,z]×3] triangle soup the rasterizer wants from the flat buffer.
  function trisFromVerts(verts, count) {
    const tris = new Array(count);
    for (let i = 0, k = 0; i < count; i++) {
      tris[i] = [
        [verts[k], verts[k + 1], verts[k + 2]],
        [verts[k + 3], verts[k + 4], verts[k + 5]],
        [verts[k + 6], verts[k + 7], verts[k + 8]],
      ];
      k += 9;
    }
    return tris;
  }

  function fmtMm(n) { return (Math.round(n * 10) / 10).toLocaleString(); }

  /**
   * Attach a drag-to-rotate / auto-spin software renderer to an existing <canvas>.
   * @returns {{ reset:fn, toggleSpin:fn, spinning:()=>boolean, destroy:fn }}
   */
  const hexToRgb = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
    return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : null;
  };

  // Named camera angles (yaw, pitch). "iso" matches the classic 3/4 thumbnail view.
  const VIEWS = {
    iso:   { yaw: Math.atan2(-1, 1), pitch: 0.6 },
    front: { yaw: -Math.PI / 2, pitch: 0.05 },
    side:  { yaw: 0, pitch: 0.05 },
    top:   { yaw: -Math.PI / 2, pitch: 1.4 },
  };

  function mountMeshViewer(canvas, { verts, count, colors }) {
    const tris = trisFromVerts(verts, count);
    // 2× supersampling: back the canvas at twice its display size for crisp, anti-aliased
    // edges — CSS keeps the on-screen size, the browser downsamples.
    const SS = 2;
    const base = canvas.width || 460;
    canvas.width = canvas.height = base * SS;
    const S = canvas.width;
    const factory = () => canvas;
    let yaw = VIEWS.iso.yaw, pitch = VIEWS.iso.pitch, zoom = 1, panX = 0, panY = 0;
    let spinning = false, raf = 0, mode = null, lastX = 0, lastY = 0, dead = false;

    const cssVar = (n, fb) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb);
    const bg = cssVar('--surface-2', '#0e1116');
    const col = hexToRgb(cssVar('--accent', '')) || [120, 144, 168];
    const ramp = Array.isArray(colors) ? colors.map(hexToRgb).filter(Boolean) : [];

    const draw = (fast) => {
      if (dead) return;
      KhaytStlThumb.renderStlThumbnail(tris, {
        size: S, yaw, pitch, zoom, panX, panY, canvasFactory: factory,
        background: bg, color: col, colorRamp: ramp.length ? ramp : null,
        maxTriangles: fast ? 22000 : 120000,
      });
    };

    function stopSpin() { spinning = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function tick() { yaw += 0.012; draw(true); raf = requestAnimationFrame(tick); }

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      mode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'rotate';
      lastX = e.clientX; lastY = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} stopSpin();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!mode) return;
      const w = canvas.getBoundingClientRect().width || base;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (mode === 'pan') { panX += dx / w; panY -= dy / w; }
      else { yaw -= dx * 0.01; pitch = clamp(pitch + dy * 0.01, -1.4, 1.4); }
      lastX = e.clientX; lastY = e.clientY;
      draw(true);
    });
    const endDrag = () => { if (mode) { mode = null; draw(false); } };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom = clamp(zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.3, 8);
      stopSpin(); draw(true);
      clearTimeout(canvas._wz); canvas._wz = setTimeout(() => draw(false), 140);
    }, { passive: false });

    // Stop the animation loop when the canvas leaves the DOM (modal torn down).
    const mo = new MutationObserver(() => { if (!document.body.contains(canvas)) { dead = true; stopSpin(); mo.disconnect(); } });
    mo.observe(document.getElementById('modalMount') || document.body, { childList: true, subtree: true });

    draw(false);
    return {
      reset() { stopSpin(); yaw = VIEWS.iso.yaw; pitch = VIEWS.iso.pitch; zoom = 1; panX = 0; panY = 0; draw(false); },
      setView(name) { const v = VIEWS[name] || VIEWS.iso; stopSpin(); yaw = v.yaw; pitch = v.pitch; draw(false); },
      zoomBy(f) { zoom = clamp(zoom * f, 0.3, 8); draw(false); },
      toggleSpin() { if (spinning) { stopSpin(); draw(false); } else { spinning = true; tick(); } return spinning; },
      spinning: () => spinning,
      destroy() { dead = true; stopSpin(); mo.disconnect(); },
    };
  }

  function openModelViewer({ verts, count, bbox, name, colors }) {
    if (!verts || !count) { toast('No mesh to show.', 'error'); return; }
    const S = 460;
    const dims = bbox ? `${fmtMm(bbox.x)} × ${fmtMm(bbox.y)} × ${fmtMm(bbox.z)} mm` : '';
    const viewBtn = (k, lbl) => `<button type="button" class="btn ghost small mv-view" data-view="${k}">${escapeHtml(lbl)}</button>`;
    const body = `
      <div class="mv-wrap">
        <div class="mv-stage">
          <canvas id="mvCanvas" width="${S}" height="${S}" class="mv-canvas" aria-label="3D preview"></canvas>
          <div class="mv-hint">${escapeHtml(t('plib.view3d_hint2') || 'Drag rotate · scroll zoom · shift-drag pan')}</div>
        </div>
        <div class="mv-views">
          ${viewBtn('iso', t('view3d.iso') || 'Iso')}${viewBtn('front', t('view3d.front') || 'Front')}${viewBtn('top', t('view3d.top') || 'Top')}${viewBtn('side', t('view3d.side') || 'Side')}
        </div>
        <div class="mv-bar">
          <span class="mv-meta">${escapeHtml(name || '')}${dims ? ` · <b>${escapeHtml(dims)}</b>` : ''} · ${count.toLocaleString()} △</span>
          <span class="mv-btns">
            <button type="button" class="btn ghost small" id="mvSpin">${escapeHtml(t('plib.view3d_spin') || 'Auto-spin')}</button>
            <button type="button" class="btn ghost small" id="mvReset">${escapeHtml(t('plib.view3d_reset') || 'Reset')}</button>
          </span>
        </div>
      </div>`;

    openFormModal({
      title: '🧊 ' + (t('plib.view3d') || 'View in 3D'),
      bodyHtml: body,
      noSave: true,
      onMount(modal) {
        const ctl = mountMeshViewer(modal.querySelector('#mvCanvas'), { verts, count, colors });
        const spinBtn = modal.querySelector('#mvSpin');
        spinBtn.addEventListener('click', () => spinBtn.classList.toggle('on', ctl.toggleSpin()));
        modal.querySelector('#mvReset').addEventListener('click', () => { ctl.reset(); spinBtn.classList.remove('on'); });
        modal.querySelectorAll('.mv-view').forEach((b) => b.addEventListener('click', () => { ctl.setView(b.dataset.view); spinBtn.classList.remove('on'); }));
      },
    });
  }

  const api = { openModelViewer, mountMeshViewer };
  Object.assign(global, api);
  global.KhaytModelViewer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
