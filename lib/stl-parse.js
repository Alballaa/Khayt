'use strict';
/**
 * Pure STL geometry reader (binary + ASCII). No DOM, no Three.js — just maths,
 * so it runs in the renderer (ArrayBuffer from a FileReader) and under node --test.
 *
 * Returns physical facts only: triangle count, solid volume, bounding box, and
 * surface area. It NEVER estimates weight/time/price — see lib/stl-estimate.js.
 * Volume uses the signed-tetrahedron sum (Σ a·(b×c)/6), which is exact for a
 * closed mesh and robust enough for typical (near-closed) print models.
 */
(function (global) {
  function toDataView(buf) {
    if (buf instanceof DataView) return buf;
    if (buf instanceof ArrayBuffer) return new DataView(buf);
    if (ArrayBuffer.isView(buf)) return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    throw new Error('parseStl: expected ArrayBuffer/TypedArray/DataView');
  }

  // Binary STL: 80-byte header + uint32 count + 50 bytes/triangle. We confirm by
  // matching the declared count to the byte length (ASCII can falsely start
  // "solid", so the size check is the reliable discriminator).
  function looksBinary(dv) {
    if (dv.byteLength < 84) return false;
    const count = dv.getUint32(80, true);
    return dv.byteLength === 84 + count * 50;
  }

  function accFromTriangles(tris) {
    let vol6 = 0, area2 = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const [a, b, c] of tris) {
      // signed volume of tetra (origin,a,b,c) ×6
      vol6 += a[0] * (b[1] * c[2] - b[2] * c[1])
            - a[1] * (b[0] * c[2] - b[2] * c[0])
            + a[2] * (b[0] * c[1] - b[1] * c[0]);
      // triangle area ×2 = |(b-a)×(c-a)|
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      area2 += Math.sqrt(cx * cx + cy * cy + cz * cz);
      for (const p of [a, b, c]) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
        if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
      }
    }
    const n = tris.length;
    return {
      triangleCount: n,
      volumeMm3: Math.abs(vol6) / 6,
      areaMm2: area2 / 2,
      bbox: n ? {
        x: maxX - minX, y: maxY - minY, z: maxZ - minZ,
        min: [minX, minY, minZ], max: [maxX, maxY, maxZ],
      } : { x: 0, y: 0, z: 0, min: [0, 0, 0], max: [0, 0, 0] },
    };
  }

  // When keepTriangles is requested, thread the raw triangle list out to the caller
  // (for thumbnail rendering). Off by default so the common path keeps its small
  // memory profile and unchanged return shape.
  function withTris(result, tris, opts) {
    if (opts && opts.keepTriangles) result.triangles = tris;
    return result;
  }

  function parseBinary(dv, opts) {
    const count = dv.getUint32(80, true);
    const tris = new Array(count);
    let off = 84;
    for (let i = 0; i < count; i++) {
      off += 12; // skip the normal
      const v = (k) => [dv.getFloat32(off + k * 12, true), dv.getFloat32(off + k * 12 + 4, true), dv.getFloat32(off + k * 12 + 8, true)];
      tris[i] = [v(0), v(1), v(2)];
      off += 36 + 2; // 3 verts + 2-byte attribute
    }
    return withTris(Object.assign({ format: 'binary' }, accFromTriangles(tris)), tris, opts);
  }

  function parseAscii(text, opts) {
    const nums = [];
    const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) nums.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
    const tris = [];
    for (let i = 0; i + 2 < nums.length; i += 3) tris.push([nums[i], nums[i + 1], nums[i + 2]]);
    return withTris(Object.assign({ format: 'ascii' }, accFromTriangles(tris)), tris, opts);
  }

  /**
   * Parse an STL → { format, triangleCount, volumeMm3, areaMm2, bbox{x,y,z,min,max} }.
   * Pass { keepTriangles:true } to also get `triangles` (array of [a,b,c] vertex triples)
   * for rendering — omit it (default) to keep the lean shape.
   */
  function parseStl(buf, opts) {
    const dv = toDataView(buf);
    if (looksBinary(dv)) return parseBinary(dv, opts);
    // ASCII fallback — decode bytes to text.
    let text;
    if (typeof TextDecoder !== 'undefined') text = new TextDecoder('utf-8').decode(dv);
    else text = Buffer.from(dv.buffer, dv.byteOffset, dv.byteLength).toString('utf8');
    if (!/facet|vertex/i.test(text)) {
      // Not ASCII either — best-effort binary read so a slightly-off size still works.
      if (dv.byteLength >= 84) return parseBinary(dv, opts);
      throw new Error('parseStl: unrecognized STL');
    }
    return parseAscii(text, opts);
  }

  const api = { parseStl, looksBinary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytStl = Object.assign(global.KhaytStl || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
