'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseStl, looksBinary } = require('../lib/stl-parse');
const { estimateFromStl } = require('../lib/stl-estimate');

// Build a binary STL of an axis-aligned cube [0,s]^3 (12 triangles).
function cubeBinary(s) {
  const v = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], // bottom z=0
    [0, 0, s], [s, 0, s], [s, s, s], [0, s, s], // top z=s
  ];
  // outward-facing triangles (winding doesn't matter — volume is abs'd)
  const f = [
    [0, 1, 2], [0, 2, 3], // bottom
    [4, 6, 5], [4, 7, 6], // top
    [0, 4, 5], [0, 5, 1], // y=0
    [1, 5, 6], [1, 6, 2], // x=s
    [2, 6, 7], [2, 7, 3], // y=s
    [3, 7, 4], [3, 4, 0], // x=0
  ];
  const buf = new ArrayBuffer(84 + f.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, f.length, true);
  let off = 84;
  for (const tri of f) {
    off += 12; // normal left as 0
    for (const idx of tri) {
      dv.setFloat32(off, v[idx][0], true);
      dv.setFloat32(off + 4, v[idx][1], true);
      dv.setFloat32(off + 8, v[idx][2], true);
      off += 12;
    }
    off += 2; // attribute byte count
  }
  return buf;
}

function cubeAscii(s) {
  // two triangles per face — reuse the binary winding via a tiny emitter
  const v = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  const f = [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]];
  let s2 = 'solid cube\n';
  for (const tri of f) {
    s2 += 'facet normal 0 0 0\nouter loop\n';
    for (const i of tri) s2 += `vertex ${v[i][0]} ${v[i][1]} ${v[i][2]}\n`;
    s2 += 'endloop\nendfacet\n';
  }
  s2 += 'endsolid cube\n';
  return new TextEncoder().encode(s2);
}

test('parseStl: binary cube → exact volume, bbox, triangle count', () => {
  const g = parseStl(cubeBinary(10));
  assert.equal(g.format, 'binary');
  assert.equal(g.triangleCount, 12);
  assert.ok(Math.abs(g.volumeMm3 - 1000) < 1e-3, `volume ${g.volumeMm3}`); // 10^3
  assert.ok(Math.abs(g.bbox.x - 10) < 1e-4 && Math.abs(g.bbox.y - 10) < 1e-4 && Math.abs(g.bbox.z - 10) < 1e-4);
  assert.ok(Math.abs(g.areaMm2 - 600) < 1e-2); // 6 faces × 10×10
});

test('parseStl: ASCII cube matches binary volume', () => {
  const g = parseStl(cubeAscii(20));
  assert.equal(g.format, 'ascii');
  assert.equal(g.triangleCount, 12);
  assert.ok(Math.abs(g.volumeMm3 - 8000) < 1e-2, `volume ${g.volumeMm3}`); // 20^3
});

test('looksBinary: discriminates by declared-count vs byte length', () => {
  assert.equal(looksBinary(new DataView(cubeBinary(5))), true);
  assert.equal(looksBinary(new DataView(cubeAscii(5).buffer)), false);
});

test('estimateFromStl: solid 1cm³ at 100% infill, no shell/waste → density grams', () => {
  const r = estimateFromStl({ volumeMm3: 1000, bbox: { x: 10, y: 10, z: 10 } },
    { densityGPerCm3: 1.24, infillPct: 1, shellFactor: 0, wastePct: 0 });
  assert.equal(r.solidWeightG, 1.2); // round1(1.24)
  assert.equal(r.estWeightG, 1.2);
  assert.ok(r.estPrintTimeH > 0);
  assert.deepEqual(r.dimsMm, { x: 10, y: 10, z: 10 });
});

test('estimateFromStl: lower infill → lighter than solid; time tracks weight', () => {
  const geom = { volumeMm3: 50000, bbox: { x: 50, y: 40, z: 25 } };
  const solid = estimateFromStl(geom, { infillPct: 1, shellFactor: 0, wastePct: 0 });
  const sparse = estimateFromStl(geom, { infillPct: 0.2, shellFactor: 0.35, wastePct: 0 });
  assert.ok(sparse.estWeightG < solid.estWeightG);
  assert.ok(sparse.estPrintTimeH < solid.estPrintTimeH);
  assert.ok(sparse.estWeightG > 0);
});

test('estimateFromStl: handles empty/zero geometry without NaN', () => {
  const r = estimateFromStl({ volumeMm3: 0, bbox: { x: 0, y: 0, z: 0 } }, {});
  assert.equal(r.estWeightG, 0);
  assert.equal(r.estPrintTimeH, 0);
});
