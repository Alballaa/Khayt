'use strict';
// buildBandSwapPlan / insertSwapPauses tests (ported from the bedready.io reference swap-pauses.test.mts).
// Validates: ≤4 colours need no manual swap (toolchanger covers them), >4 colours produce swaps at the
// right height, repeated colours reuse their head, and the emitted custom_gcode file is well-formed.
// Run: node --test test/swap-pauses.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBandSwapPlan, insertSwapPauses, detectConflicts } = require('../lib/swap-pauses');

const PALETTE = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']; // states 1..6
const band = (state, z0, z1) => ({ state, z0, z1 });

test('2 colours → no manual swaps (both ride the toolheads)', () => {
  const { instructions, headOf } = buildBandSwapPlan([band(1, 0, 5), band(2, 5, 10)], PALETTE, 'M600', 0.2);
  assert.equal(instructions.length, 0);
  assert.equal(headOf.get(1), 0);
  assert.equal(headOf.get(2), 1);
});

test('4 colours → still no manual swaps (exactly fills 4 heads)', () => {
  const bands = [band(1, 0, 4), band(2, 4, 8), band(3, 8, 12), band(4, 12, 16)];
  const { instructions } = buildBandSwapPlan(bands, PALETTE, 'M600', 0.2);
  assert.equal(instructions.length, 0);
});

test('repeated colour (red, blue, red) → 0 swaps: each colour keeps its own head', () => {
  const bands = [band(1, 0, 5), band(2, 5, 10), band(1, 10, 15)];
  const { instructions } = buildBandSwapPlan(bands, PALETTE, 'M600', 0.2);
  assert.equal(instructions.length, 0);
});

test('5 distinct colours → 1 manual swap, at one layer below the 5th band', () => {
  const bands = [band(1, 0, 4), band(2, 4, 8), band(3, 8, 12), band(4, 12, 16), band(5, 16, 20)];
  const { instructions } = buildBandSwapPlan(bands, PALETTE, 'M600', 0.2);
  assert.equal(instructions.length, 1);
  const s = instructions[0];
  assert.equal(s.toSlot, 5); // load the 5th colour
  assert.equal(s.toColour, '#ff00ff'); // state 5 → PALETTE[4]
  assert.ok(Math.abs(s.z - (16 - 0.2)) < 1e-9); // pause one layer-height below the band it serves
  assert.equal(s.toolhead, 1); // reused head 0 (1-based)
});

test('6 distinct colours → 2 manual swaps', () => {
  const bands = [1, 2, 3, 4, 5, 6].map((s, i) => band(s, i * 4, i * 4 + 4));
  const { instructions } = buildBandSwapPlan(bands, PALETTE, 'M600', 0.2);
  assert.equal(instructions.length, 2);
});

test('customGcodeXml: one M600 pause layer per swap height, valid custom_gcode file', () => {
  const bands = [band(1, 0, 4), band(2, 4, 8), band(3, 8, 12), band(4, 12, 16), band(5, 16, 20)];
  const { customGcodeXml } = buildBandSwapPlan(bands, PALETTE, 'M600', 0.2);
  assert.match(customGcodeXml, /<custom_gcodes_per_layer>/);
  assert.match(customGcodeXml, /type="1"[^>]*gcode="M600"/);
  assert.equal((customGcodeXml.match(/<layer\b/g) || []).length, 1); // one swap → one pause layer
  assert.match(customGcodeXml, /top_z="15\.8"/); // 16 − 0.2
});

test('baseState seeds head 0 so unpainted faces stay correct', () => {
  const bands = [band(3, 0, 5), band(1, 5, 10)];
  const { headOf } = buildBandSwapPlan(bands, PALETTE, 'M600', 0.2, 1);
  assert.equal(headOf.get(1), 0); // base colour → head 0 (slot 1)
  assert.equal(headOf.get(3), 1);
});

test('detectConflicts flags heads that hold more than one source slot', () => {
  // slots 1..5 mapped round-robin onto 4 heads → head 0 holds slots 1 and 5.
  const remap = new Map([[1, 0], [2, 1], [3, 2], [4, 3], [5, 0]]);
  const conflicts = detectConflicts(remap);
  assert.equal(conflicts.size, 1);
  assert.deepEqual(conflicts.get(0), [1, 5]);
});

test('insertSwapPauses is a no-op when no head is shared', () => {
  const xml = '<custom_gcodes_per_layer><plate><layer top_z="1" type="2" extruder="1" color="#ff0000"/></plate></custom_gcodes_per_layer>';
  const remap = new Map([[1, 0], [2, 1]]);
  const { xml: out, instructions } = insertSwapPauses(xml, remap, PALETTE, 'M600', 0.2);
  assert.equal(out, xml);
  assert.equal(instructions.length, 0);
});

// ── Single-extruder / variable head count (heads:1 = M600 at every colour change) ──
test('single-extruder (nHeads=1) → a swap at every colour change', () => {
  // 3 colours stacked, base = state 1. On one head: start 1, swap→2, swap→3 = 2 swaps.
  const { instructions, customGcodeXml } = buildBandSwapPlan(
    [band(1, 0, 4), band(2, 4, 8), band(3, 8, 12)], PALETTE, 'M600', 0.2, 1, 1);
  assert.equal(instructions.length, 2);
  assert.equal((customGcodeXml.match(/type="1"/g) || []).length, 2, 'one pause layer per swap');
  assert.ok(customGcodeXml.includes('M600'));
});

test('nHeads=2 → the third colour reuses a head (1 swap)', () => {
  // base(1)→h0, 2→h1, 3→h0(reuse) ⇒ one swap on head 0.
  const { instructions } = buildBandSwapPlan(
    [band(1, 0, 4), band(2, 4, 8), band(3, 8, 12)], PALETTE, 'M600', 0.2, 1, 2);
  assert.equal(instructions.length, 1);
});

test('omitting nHeads preserves the U1 4-head default (3 colours → 0 swaps)', () => {
  const { instructions } = buildBandSwapPlan(
    [band(1, 0, 4), band(2, 4, 8), band(3, 8, 12)], PALETTE, 'M600', 0.2, 1);
  assert.equal(instructions.length, 0);
});

test('single-extruder with a returning colour (A,B,A) → 2 swaps', () => {
  const { instructions } = buildBandSwapPlan(
    [band(1, 0, 4), band(2, 4, 8), band(1, 8, 12)], PALETTE, 'M600', 0.2, 1, 1);
  assert.equal(instructions.length, 2); // 1→2, then 2→1
});
