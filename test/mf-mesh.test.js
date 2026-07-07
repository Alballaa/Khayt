'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dominantState, encodeSolidPaint, hexToBits, bitsToHex, extractMeshFromBuffer } = require('../lib/mf-mesh');
const { meshTo3mf } = require('../lib/mf-write');

// The paint codec: a solid-painted facet's code must decode back to the same filament state.
test('encodeSolidPaint / dominantState round-trip for every filament state', () => {
  for (let s = 1; s <= 16; s++) {
    const code = encodeSolidPaint(s);
    assert.equal(dominantState(code), s, `state ${s} → ${code} → ${dominantState(code)}`);
  }
});

test('dominantState reads a subdivided code as its first leaf state', () => {
  // ss=1 (split), side=0, then two child triangles: first solid state 2, second solid state 3.
  const bits = [1, 0, 0, 0].concat([0, 0, 0, 1]).concat([0, 0, 1, 1]);
  const hex = bitsToHex(bits);
  assert.equal(dominantState(hex), 2, 'first leaf wins');
});

test('hexToBits reads nibbles reversed, LSB-first (matches slicer serialization)', () => {
  // "8" = 0b1000 → LSB-first bits [0,0,0,1]
  assert.deepEqual(hexToBits('8'), [0, 0, 0, 1]);
});

test('extractMeshFromBuffer returns flat positions + palette from a generic 3MF', () => {
  const buf = meshTo3mf([[[0, 0, 0], [10, 0, 0], [0, 20, 5]]]);
  const m = extractMeshFromBuffer(buf);
  assert.equal(m.positions.length, 9, 'one facet → 9 floats');
  assert.equal(m.faceState.length, 1);
  assert.deepEqual([m.positions[0], m.positions[1], m.positions[2]], [0, 0, 0]);
});
