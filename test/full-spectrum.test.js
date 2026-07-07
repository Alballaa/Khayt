'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('../lib/full-spectrum');
const mm = require('../lib/mf-mesh');

test('mixRgb: subtractive pigment blend (blue + yellow → greenish, not grey)', () => {
  const { mixRgb } = require('../lib/filament-mixer');
  const g = mixRgb([0, 0, 255], [255, 255, 0], 0.5);
  assert.ok(g[1] > g[0] && g[1] > g[2], 'green channel dominates a blue/yellow mix');
});

test('deltaE: identical colours = 0, black↔white large', () => {
  const lab = (h) => fs.rgbToLab(fs.hexToRgb(h));
  assert.ok(fs.deltaE(lab('#3366CC'), lab('#3366CC')) < 1e-9);
  assert.ok(fs.deltaE(lab('#000000'), lab('#FFFFFF')) > 90);
});

test('bestMix: a pure base reproduces itself with ~0 ΔE', () => {
  const m = fs.bestMix('#E02020', ['#FFFFFF', '#000000', '#E02020', '#F0C000']);
  assert.strictEqual(m.a, m.b, 'pure single base chosen');
  assert.ok(m.deltaE < 1, 'near-zero error for an exact base');
});

test('bestPhysicalSet: <=4 colours returns all; >4 drops to exactly 4', () => {
  assert.deepStrictEqual(
    fs.bestPhysicalSet(['#FFFFFF', '#000000', '#FF0000'], [3, 2, 1]).sort(),
    [0, 1, 2],
  );
  const keep = fs.bestPhysicalSet(['#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF'], [5, 4, 3, 2, 1]);
  assert.strictEqual(keep.length, 4);
});

test('planFullSpectrum: 5 colours → 4 physical + ≥1 mixDef, stateMap remaps extras off the base slots', () => {
  const colors = ['#FFFFFF', '#111111', '#E02020', '#F0C000', '#20A040'];
  const plan = fs.planFullSpectrum(colors, [5000, 3000, 800, 400, 120]);
  assert.strictEqual(plan.physical.length, 4);
  assert.strictEqual(plan.physicalHex.length, 4);
  assert.ok(plan.mixDefs.length >= 1, 'the 5th colour becomes a mix');
  // Every source state maps to a valid 1-based slot; physical ones map into 1..4.
  for (let s = 1; s <= 5; s++) assert.ok(plan.stateMap(s) >= 1);
  assert.strictEqual(plan.stateMap(0), 0, 'base state stays base');
});

test('serializeMixedDefs: matches the Orca token format', () => {
  const s = fs.serializeMixedDefs([{ componentA: 1, componentB: 2, mixBPercent: 35, stableId: 1 }]);
  assert.strictEqual(s, '1,2,1,1,35,0,g,w,m2,z0,xa0,xb0,d0,o0,u1,cm0');
});

test('remapPaintCode: a solid state remaps through stateMap and decodes to the new slot', () => {
  const map = (s) => (s === 3 ? 5 : s); // send filament 3 to virtual slot 5
  const code = mm.encodeSolidPaint(3);
  const out = fs.remapPaintCode(code, map);
  assert.strictEqual(mm.dominantState(out), 5);
});
