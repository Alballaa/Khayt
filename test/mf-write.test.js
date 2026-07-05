'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { meshTo3mf, buildModelXml, trianglesToStl } = require('../lib/mf-write');
const { analyze, readMembers, extractTriangles } = require('../lib/mf-convert');
const { parseStl } = require('../lib/stl-parse');

// A single 10×20×5 triangle (footprint used for the bounds check).
const TRIS = [
  [[0, 0, 0], [10, 0, 0], [0, 20, 5]],
];

test('meshTo3mf produces a 3MF the analyzer can read', () => {
  const buf = meshTo3mf(TRIS);
  assert.ok(Buffer.isBuffer(buf));
  const a = analyze(buf);
  assert.equal(a.ok, true);
  assert.equal(a.hasGeometry, true);
  assert.equal(a.flavour, 'generic');
});

test('meshTo3mf preserves the mesh footprint (bounds)', () => {
  const a = analyze(meshTo3mf(TRIS));
  assert.deepEqual(a.bounds, { x: 10, y: 20, z: 5 });
});

test('meshTo3mf returns null for empty input', () => {
  assert.equal(meshTo3mf([]), null);
  assert.equal(meshTo3mf(null), null);
});

test('round-trip: an ASCII STL becomes a readable 3MF with the same footprint', () => {
  const stl = `solid s
facet normal 0 0 0
 outer loop
  vertex 0 0 0
  vertex 30 0 0
  vertex 0 15 8
 endloop
endfacet
endsolid s`;
  const parsed = parseStl(Buffer.from(stl, 'utf8'), { keepTriangles: true });
  assert.equal(parsed.triangleCount, 1);
  const a = analyze(meshTo3mf(parsed.triangles));
  assert.equal(a.ok, true);
  assert.deepEqual(a.bounds, { x: 30, y: 15, z: 8 });
});

test('extractTriangles recovers the mesh from a 3MF we wrote', () => {
  const tris = extractTriangles(readMembers(meshTo3mf(TRIS)));
  assert.equal(tris.length, 1);
  assert.deepEqual(tris[0], [[0, 0, 0], [10, 0, 0], [0, 20, 5]]);
});

test('trianglesToStl writes a binary STL that parses back to the same mesh', () => {
  const stl = trianglesToStl(TRIS);
  assert.ok(Buffer.isBuffer(stl));
  const parsed = parseStl(stl, { keepTriangles: true });
  assert.equal(parsed.format, 'binary');
  assert.equal(parsed.triangleCount, 1);
  assert.deepEqual(parsed.bbox, { x: 10, y: 20, z: 5, min: [0, 0, 0], max: [10, 20, 5] });
});

test('round-trip STL → 3MF → STL preserves the mesh', () => {
  const orig = trianglesToStl([
    [[0, 0, 0], [30, 0, 0], [0, 15, 8]],
    [[0, 0, 0], [0, 15, 8], [-5, 2, 1]],
  ]);
  const p1 = parseStl(orig, { keepTriangles: true });
  const back = extractTriangles(readMembers(meshTo3mf(p1.triangles)));
  const p2 = parseStl(trianglesToStl(back), { keepTriangles: true });
  assert.equal(p2.triangleCount, 2);
  assert.deepEqual(p2.bbox.max, p1.bbox.max);
  assert.deepEqual(p2.bbox.min, p1.bbox.min);
});

test('trianglesToStl returns null for empty input', () => {
  assert.equal(trianglesToStl([]), null);
});

test('buildModelXml indexes vertices per triangle', () => {
  const xml = buildModelXml([[[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 0, 0], [1, 0, 0], [0, 0, 1]]]);
  assert.match(xml, /<triangle v1="0" v2="1" v3="2"\/>/);
  assert.match(xml, /<triangle v1="3" v2="4" v3="5"\/>/);
});
