/**
 * lib/hueforge-3mf.js — the file that actually goes to the printer.
 *
 * Every assertion here is measured against a REAL Snapmaker-Orca export
 * (`KING-Abdulaziz-ART-200mm-U1.3mf`) that the U1 printed, not against a shape
 * imagined here. That distinction found the bug this file now guards: Khayt
 * closed its final colour range at the model's exact height, while a working
 * export runs the last range to max_z="1000".
 *
 * Getting that wrong produces no error anywhere. The top layers simply fall
 * outside every range, take the object's default extruder — which
 * model_settings.config sets to 1, the base colour — and print in the wrong
 * filament. On a relief the top layers are the picture.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const HF = require('../lib/hueforge.js');
const M3 = require('../lib/hueforge-3mf.js');
const { openZip } = require('../lib/zip-read.js');

const LAYER_H = 0.08;

function build(bands, { W = 16, H = 16 } = {}) {
  const heights = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) heights.push(4 + Math.round((i / (W - 1)) * 36));
  const mesh = HF.heightfieldToMesh({ width: W, height: H, heights }, { layerH: LAYER_H, widthMm: 80 });
  const buf = M3.buildU1_3mf({ triangles: mesh.triangles, bands, layerH: LAYER_H, name: 'probe', sizeMm: mesh.sizeMm });
  assert.ok(buf && buf.length > 0, 'no 3mf produced');
  // openZip returns a handle ({entries, file, ...}), not a bare array.
  const zip = openZip(buf);
  const byName = {};
  for (const e of zip.entries) byName[e.name] = e;
  return { buf, byName, text: (n) => Buffer.from(zip.file(n)).toString('utf8') };
}

const FOUR = [
  { z0: 0, z1: 0.8, head: 0, hex: '#111111' },
  { z0: 0.8, z1: 1.6, head: 1, hex: '#1b3a6b' },
  { z0: 1.6, z1: 2.4, head: 2, hex: '#c9a227' },
  { z0: 2.4, z1: 3.2, head: 3, hex: '#f2f2f2' },
];

test('the top colour range is open-ended, so no layer falls outside every band', () => {
  // The whole point. A real Orca export ends at 1000; closing at the model's
  // own height leaves the last layers to the default extruder — silently.
  const { text } = build(FOUR);
  const xml = text('Metadata/layer_config_ranges.xml');
  const ranges = [...xml.matchAll(/min_z="([\d.]+)" max_z="([\d.]+)"/g)].map((m) => [m[1], m[2]]);
  assert.equal(ranges.length, 4);
  assert.equal(ranges[3][1], '1000', `top range closed at ${ranges[3][1]} — the top layers will print in the base colour`);
  // Every lower boundary still meets the next band exactly; only the top opens.
  for (let i = 0; i < 3; i++) {
    assert.equal(ranges[i][1], ranges[i + 1][0], `gap between band ${i} and ${i + 1}`);
  }
});

test('heads are written as 1-based extruders, matching a working file', () => {
  // Bands are 0-based everywhere in lib/hueforge.js (`index`, `slot`). The U1
  // has four heads, so 0..3 must become 1..4 — a real export uses exactly that.
  const { text } = build(FOUR);
  const ext = [...text('Metadata/layer_config_ranges.xml').matchAll(/opt_key="extruder">(\d+)</g)].map((m) => m[1]);
  assert.deepEqual(ext, ['1', '2', '3', '4']);
  assert.ok(!ext.includes('5'), 'the U1 has four heads; extruder 5 does not exist');
});

test('the archive carries every part a Snapmaker-Orca project needs', () => {
  // Names taken from the real export, not from the spec — a 3MF missing one of
  // these opens as a bare mesh with the colour plan silently gone.
  const { byName } = build(FOUR);
  for (const n of [
    '[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', '3D/_rels/3dmodel.model.rels',
    'Metadata/project_settings.config', 'Metadata/model_settings.config', 'Metadata/layer_config_ranges.xml',
  ]) assert.ok(byName[n], `missing ${n}`);
});

test('fewer than four colours still produces a coherent plan', () => {
  const two = [{ z0: 0, z1: 1.2, head: 0 }, { z0: 1.2, z1: 3.2, head: 1 }];
  const { text } = build(two);
  const xml = text('Metadata/layer_config_ranges.xml');
  const ranges = [...xml.matchAll(/min_z="([\d.]+)" max_z="([\d.]+)"/g)].map((m) => [m[1], m[2]]);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0][0], '0', 'the first band must start at the bed');
  assert.equal(ranges[1][1], '1000', 'the last band is open whatever the count');
  assert.deepEqual([...xml.matchAll(/opt_key="extruder">(\d+)</g)].map((m) => m[1]), ['1', '2']);
});

test('the emitted XML is well formed', () => {
  // A stray character here means Orca opens the model with no colour plan and
  // no complaint, which is indistinguishable from the plan being wrong.
  const { text } = build(FOUR);
  for (const n of ['Metadata/layer_config_ranges.xml', 'Metadata/model_settings.config', '3D/3dmodel.model']) {
    const x = text(n);
    assert.match(x, /^<\?xml /, `${n} lacks a declaration`);
    const opens = (x.match(/<[a-zA-Z]/g) || []).length;
    const closes = (x.match(/<\//g) || []).length + (x.match(/\/>/g) || []).length;
    assert.equal(opens, closes, `${n}: ${opens} opening tags vs ${closes} closings`);
  }
});

/**
 * Base layer height.
 *
 * The reference export runs its opaque base at 0.24 mm and every colour band at
 * 0.12. The base only stops the bed showing through, so its layer height is
 * invisible in the finished piece; the bands above it are where the blending
 * happens. Khayt wrote the per-range key from the start and always gave every
 * range the same number — for the piece that reference was printing, 57 layers
 * instead of 28.
 */
const heightsOf = (xml) => [...xml.matchAll(/layer_height">([\d.]+)</g)].map((m) => m[1]);

test('the base band prints coarser than the colour bands', () => {
  const { text } = build(FOUR);
  const hs = heightsOf(text('Metadata/layer_config_ranges.xml'));
  assert.equal(hs.length, 4);
  assert.equal(Number(hs[0]), Number(hs[1]) * 2, 'base should be twice the colour layer height');
  assert.deepEqual(hs.slice(1), [hs[1], hs[1], hs[1]], 'only the base is coarse — blending needs fine layers');
});

test('at the reference layer height the output matches the real file exactly', () => {
  // 0.24 base / 0.12 colour is what KING-Abdulaziz-ART-200mm-U1.3mf contains.
  // Reproducing it is the strongest check available without Snapmaker Orca.
  const heights = [];
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) heights.push(4 + Math.round((i / 15) * 36));
  const mesh = HF.heightfieldToMesh({ width: 16, height: 16, heights }, { layerH: 0.12, widthMm: 80 });
  const buf = M3.buildU1_3mf({ triangles: mesh.triangles, bands: FOUR, layerH: 0.12, name: 'p', sizeMm: mesh.sizeMm });
  const zip = openZip(buf);
  assert.deepEqual(heightsOf(Buffer.from(zip.file('Metadata/layer_config_ranges.xml')).toString('utf8')),
    ['0.24', '0.12', '0.12', '0.12']);
});

test('doubling never produces a layer no nozzle can lay down', () => {
  // A shop already printing coarse would otherwise get a base at 0.4mm — the
  // full width of a standard nozzle, which will not extrude cleanly.
  const heights = [];
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) heights.push(4 + Math.round((i / 15) * 36));
  for (const layerH of [0.06, 0.2, 0.28, 0.5]) {
    const mesh = HF.heightfieldToMesh({ width: 16, height: 16, heights }, { layerH, widthMm: 80 });
    const buf = M3.buildU1_3mf({ triangles: mesh.triangles, bands: FOUR, layerH, name: 'p', sizeMm: mesh.sizeMm });
    const hs = heightsOf(Buffer.from(openZip(buf).file('Metadata/layer_config_ranges.xml')).toString('utf8'));
    const base = Number(hs[0]), colour = Number(hs[1]);
    // Two invariants, and the second is the one that caught a flaw in the fix:
    // capping alone inverted the relationship for a shop already printing
    // coarser than the cap, leaving the base FINER than the bands.
    assert.ok(base <= Math.max(0.3, layerH),
      `base ${base} at layerH ${layerH} was coarsened past what a 0.4 nozzle can print`);
    assert.ok(base >= colour, `base ${base} is finer than the colour bands ${colour}`);
  }
});
