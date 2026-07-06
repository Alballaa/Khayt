'use strict';
/**
 * Software STL thumbnail renderer — turns a triangle mesh into a small shaded
 * preview image, with NO 3D dependency (no WebGL / three.js). Orthographic 3/4
 * view, painter's algorithm for depth, flat Lambert shading. Runs on a plain 2D
 * canvas, so it works in the renderer and — via an injected canvas factory — under
 * node --test.
 *
 * Input triangles come from lib/stl-parse.js parseStl(buf,{keepTriangles:true}).
 * Big meshes are decimated (uniform stride) purely for the thumbnail so a
 * multi-million-triangle STL can't jank the UI.
 */
(function (global) {
  const DEFAULTS = {
    size: 512,           // square canvas, px
    padding: 0.08,       // fraction of size kept as margin
    background: '#0e1116',
    color: [120, 144, 168], // base RGB before shading
    ambient: 0.28,
    maxTriangles: 200000,
    quality: 0.82,
  };

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; }

  /**
   * @param {Array<[[x,y,z],[x,y,z],[x,y,z]]>} triangles
   * @param {object} [opts] incl. canvasFactory(size)=>canvasLike ({getContext, toDataURL, width, height})
   * @returns {{ ok:boolean, dataUrl?:string, canvas?:any, triangleCount?:number }}
   */
  function renderStlThumbnail(triangles, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    if (!Array.isArray(triangles) || !triangles.length) return { ok: false };

    const factory = o.canvasFactory
      || (typeof document !== 'undefined' ? (s) => { const c = document.createElement('canvas'); c.width = c.height = s; return c; } : null);
    if (!factory) return { ok: false };

    // Decimate for the thumbnail if the mesh is huge.
    let tris = triangles;
    if (triangles.length > o.maxTriangles) {
      const stride = Math.ceil(triangles.length / o.maxTriangles);
      tris = [];
      for (let i = 0; i < triangles.length; i += stride) tris.push(triangles[i]);
    }

    // Camera: look from front-right-top (Z is up for print STLs). When yaw/pitch are
    // given (interactive viewer, lib/model-viewer via renderer), orbit the camera on a
    // sphere instead; omitting both keeps the exact fixed 3/4 thumbnail view.
    let camDir;
    if (o.yaw != null || o.pitch != null) {
      const yaw = o.yaw || 0;
      const pitch = Math.max(-1.45, Math.min(1.45, o.pitch || 0)); // clamp away from the poles
      const cp = Math.cos(pitch);
      camDir = norm([Math.cos(yaw) * cp, Math.sin(yaw) * cp, Math.sin(pitch)]);
    } else {
      camDir = norm([1, -1, 0.75]);            // object → camera (also the light)
    }
    const fwd = [-camDir[0], -camDir[1], -camDir[2]]; // into the scene
    let right = cross(fwd, [0, 0, 1]);
    if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0];
    right = norm(right);
    const up = norm(cross(right, fwd));

    // Optional colour ramp (multicolour "full spectrum" preview): a list of [r,g,b] the
    // model actually declares. We shade each triangle by its height through the ramp — a
    // faithful read for the common colour-by-layer / gradient print, and a clear "this is
    // multicolour, these are the colours" signal otherwise.
    const ramp = Array.isArray(o.colorRamp) && o.colorRamp.length ? o.colorRamp : null;
    const rampAt = (u) => {
      if (ramp.length === 1) return ramp[0];
      const x = Math.max(0, Math.min(1, u)) * (ramp.length - 1);
      const i = Math.floor(x), f = x - i, a = ramp[i], b = ramp[Math.min(ramp.length - 1, i + 1)];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    };

    // Project every vertex; track screen-space bounds (and world-Z range for the ramp).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let zMin = Infinity, zMax = -Infinity;
    const faces = new Array(tris.length);
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      const p = [t[0], t[1], t[2]].map((v) => [dot(v, right), dot(v, up), dot(v, fwd)]);
      let n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
      if (dot(n, camDir) < 0) n = [-n[0], -n[1], -n[2]]; // face the camera
      const shade = o.ambient + (1 - o.ambient) * Math.max(0, dot(n, camDir));
      const depth = (p[0][2] + p[1][2] + p[2][2]) / 3;
      const wz = (t[0][2] + t[1][2] + t[2][2]) / 3; // world height, for the colour ramp
      if (wz < zMin) zMin = wz; if (wz > zMax) zMax = wz;
      faces[i] = { p, shade, depth, wz };
      for (const q of p) {
        if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0];
        if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1];
      }
    }
    const zSpan = (zMax - zMin) || 1;

    const S = o.size;
    const pad = S * o.padding;
    const spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
    // Fit-to-frame, then apply interactive zoom + pan (screen px, as a fraction of size).
    const zoom = o.zoom > 0 ? o.zoom : 1;
    const scale = Math.min((S - 2 * pad) / spanX, (S - 2 * pad) / spanY) * zoom;
    const offX = (S - spanX * scale) / 2 + (o.panX || 0) * S;
    const offY = (S - spanY * scale) / 2 - (o.panY || 0) * S;
    const sx = (x) => offX + (x - minX) * scale;
    const sy = (y) => S - (offY + (y - minY) * scale); // flip Y for canvas

    // Painter's algorithm: far faces first.
    faces.sort((a, b) => a.depth - b.depth);

    const canvas = factory(S);
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return { ok: false };
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, S, S);
    const [r, g, b] = o.color;
    for (const f of faces) {
      const c = f.shade;
      const base = ramp ? rampAt((f.wz - zMin) / zSpan) : [r, g, b];
      ctx.fillStyle = `rgb(${Math.round(base[0] * c)},${Math.round(base[1] * c)},${Math.round(base[2] * c)})`;
      ctx.beginPath();
      ctx.moveTo(sx(f.p[0][0]), sy(f.p[0][1]));
      ctx.lineTo(sx(f.p[1][0]), sy(f.p[1][1]));
      ctx.lineTo(sx(f.p[2][0]), sy(f.p[2][1]));
      ctx.closePath();
      ctx.fill();
    }

    const dataUrl = typeof canvas.toDataURL === 'function' ? canvas.toDataURL('image/jpeg', o.quality) : null;
    return { ok: true, dataUrl, canvas, triangleCount: tris.length };
  }

  const api = { renderStlThumbnail };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytStlThumb = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
