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
  function mountMeshViewer(canvas, { verts, count }) {
    const tris = trisFromVerts(verts, count);
    const S = canvas.width || 460;
    const factory = () => canvas; // draw straight into the on-screen canvas (already S×S)
    const HOME = { yaw: Math.atan2(-1, 1), pitch: 0.6 }; // matches the fixed 3/4 thumbnail view
    let yaw = HOME.yaw, pitch = HOME.pitch;
    let spinning = false, raf = 0, dragging = false, lastX = 0, lastY = 0, dead = false;

    const cssVar = (n, fb) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb);
    const bg = cssVar('--surface-2', '#0e1116');
    const accent = cssVar('--accent', '');
    const col = /^#([0-9a-f]{6})$/i.test(accent)
      ? [parseInt(accent.slice(1, 3), 16), parseInt(accent.slice(3, 5), 16), parseInt(accent.slice(5, 7), 16)]
      : [120, 144, 168];

    const draw = (fast) => {
      if (dead) return;
      KhaytStlThumb.renderStlThumbnail(tris, {
        size: S, yaw, pitch, canvasFactory: factory,
        background: bg, color: col, maxTriangles: fast ? 22000 : 90000,
      });
    };

    function stopSpin() { spinning = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function tick() { yaw += 0.012; draw(true); raf = requestAnimationFrame(tick); }

    canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} stopSpin(); });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * 0.01;
      pitch = clamp(pitch + (e.clientY - lastY) * 0.01, -1.4, 1.4);
      lastX = e.clientX; lastY = e.clientY;
      draw(true);
    });
    const endDrag = () => { if (dragging) { dragging = false; draw(false); } };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // Stop the animation loop when the canvas leaves the DOM (modal torn down).
    const mo = new MutationObserver(() => { if (!document.body.contains(canvas)) { dead = true; stopSpin(); mo.disconnect(); } });
    mo.observe(document.getElementById('modalMount') || document.body, { childList: true, subtree: true });

    draw(false);
    return {
      reset() { stopSpin(); yaw = HOME.yaw; pitch = HOME.pitch; draw(false); },
      toggleSpin() { if (spinning) { stopSpin(); draw(false); } else { spinning = true; tick(); } return spinning; },
      spinning: () => spinning,
      destroy() { dead = true; stopSpin(); mo.disconnect(); },
    };
  }

  function openModelViewer({ verts, count, bbox, name }) {
    if (!verts || !count) { toast('No mesh to show.', 'error'); return; }
    const S = 460;
    const dims = bbox ? `${fmtMm(bbox.x)} × ${fmtMm(bbox.y)} × ${fmtMm(bbox.z)} mm` : '';
    const body = `
      <div class="mv-wrap">
        <div class="mv-stage">
          <canvas id="mvCanvas" width="${S}" height="${S}" class="mv-canvas" aria-label="3D preview"></canvas>
          <div class="mv-hint">${escapeHtml(t('plib.view3d_hint') || 'Drag to rotate')}</div>
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
        const ctl = mountMeshViewer(modal.querySelector('#mvCanvas'), { verts, count });
        const spinBtn = modal.querySelector('#mvSpin');
        spinBtn.addEventListener('click', () => spinBtn.classList.toggle('on', ctl.toggleSpin()));
        modal.querySelector('#mvReset').addEventListener('click', () => { ctl.reset(); spinBtn.classList.remove('on'); });
      },
    });
  }

  const api = { openModelViewer, mountMeshViewer };
  Object.assign(global, api);
  global.KhaytModelViewer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
