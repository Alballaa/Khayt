'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { writeZip } = require('../lib/zip-write');
const { openZip } = require('../lib/zip-read');
const { analyze, convert } = require('../lib/mf-convert');

const MODEL = '<?xml version="1.0"?><model unit="millimeter"><resources><object id="1"/></resources></model>';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function makeBambu3mf() {
  const proj = JSON.stringify({
    printer_model: 'OrigPrinter',
    printer_settings_id: 'Orig',
    nozzle_diameter: ['0.4'],
    filament_colour: ['#FF0000', '#00FF00', '#0000FF'],
    filament_type: ['PLA', 'PLA', 'PETG'],
  });
  return writeZip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: '_rels/.rels', data: '<Relationships/>' },
    { name: '3D/3dmodel.model', data: MODEL },
    { name: 'Metadata/project_settings.config', data: proj },
    { name: 'Metadata/plate_1.png', data: PNG, store: true },
  ]);
}

test('analyze detects Bambu flavour, colours and geometry', () => {
  const a = analyze(makeBambu3mf());
  assert.equal(a.ok, true);
  assert.equal(a.flavour, 'bambu');
  assert.equal(a.colorCount, 3);
  assert.equal(a.filaments[0].color, '#FF0000');
  assert.equal(a.hasGeometry, true);
});

test('analyze rejects non-3MF input', () => {
  assert.equal(analyze(Buffer.from('not a zip')).ok, false);
});

test('retarget rewrites printer profile and preserves geometry byte-for-byte', () => {
  const src = makeBambu3mf();
  const r = convert(src, { targetId: 'bambu-x1c' });
  assert.equal(r.ok, true);
  assert.equal(r.report.mode, 'retarget');
  const zip = openZip(r.buffer);
  // Geometry + thumbnail unchanged.
  assert.equal(zip.file('3D/3dmodel.model').toString('utf8'), MODEL);
  assert.deepEqual(zip.file('Metadata/plate_1.png'), PNG);
  // Printer re-profiled.
  const proj = JSON.parse(zip.file('Metadata/project_settings.config').toString('utf8'));
  assert.equal(proj.printer_model, 'Bambu Lab X1 Carbon');
  assert.ok(r.report.fieldsChanged.includes('printer_model'));
});

test('retarget with a slot map reorders every filament_* array consistently', () => {
  const src = makeBambu3mf();
  const r = convert(src, { targetId: 'snapmaker-u1', slotMap: [2, 0, 1] });
  assert.equal(r.ok, true);
  assert.ok(r.report.colorsRemapped >= 1);
  const proj = JSON.parse(openZip(r.buffer).file('Metadata/project_settings.config').toString('utf8'));
  assert.deepEqual(proj.filament_colour, ['#00FF00', '#0000FF', '#FF0000']);
  assert.deepEqual(proj.filament_type, ['PLA', 'PETG', 'PLA']); // reordered in lockstep
});

test('too many colours for the target yields a warning, not a failure', () => {
  const proj = JSON.stringify({ filament_colour: ['#111111', '#222222', '#333333', '#444444', '#555555'] });
  const src = writeZip([
    { name: '3D/3dmodel.model', data: MODEL },
    { name: 'Metadata/project_settings.config', data: proj },
  ]);
  const r = convert(src, { targetId: 'snapmaker-u1' }); // maxColors 4
  assert.equal(r.ok, true);
  assert.ok(r.report.warnings.some((w) => /support/i.test(w)));
});

test('normalize strips vendor config but keeps geometry + thumbnail', () => {
  const r = convert(makeBambu3mf(), { targetId: 'generic-3mf' });
  assert.equal(r.ok, true);
  assert.equal(r.report.mode, 'normalize');
  const zip = openZip(r.buffer);
  assert.equal(zip.file('3D/3dmodel.model').toString('utf8'), MODEL);
  assert.equal(zip.file('Metadata/project_settings.config'), null); // stripped
  assert.deepEqual(zip.file('Metadata/plate_1.png'), PNG);           // kept
});

test('convert refuses a 3MF with no geometry', () => {
  const src = writeZip([{ name: 'Metadata/project_settings.config', data: '{}' }]);
  assert.equal(convert(src, { targetId: 'bambu-x1c' }).ok, false);
});

// A mesh-bearing 3MF (footprint 300×150×20 mm) for bounds + fit checks.
const MESH = '<?xml version="1.0"?><model unit="millimeter"><resources>'
  + '<object id="1" type="model"><mesh><vertices>'
  + '<vertex x="0" y="0" z="0"/><vertex x="300" y="0" z="0"/>'
  + '<vertex x="0" y="150" z="0"/><vertex x="0" y="0" z="20"/>'
  + '</vertices><triangles/></mesh></object></resources>'
  + '<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build></model>';

function makeMeshBambu() {
  const proj = JSON.stringify({
    printer_model: 'OrigPrinter', nozzle_diameter: ['0.4'], layer_height: 0.2,
    printable_area: ['0x0', '256x0', '256x256', '0x256'],
    filament_colour: ['#FF0000', '#00FF00'],
  });
  const slice = '<config><plate><filament id="1" color="#FF0000" used_g="12.5"/>'
    + '<filament id="2" color="#00FF00" used_g="7.5"/>'
    + '<metadata key="prediction" value="3600"/></plate></config>';
  return writeZip([
    { name: '3D/3dmodel.model', data: MESH },
    { name: 'Metadata/project_settings.config', data: proj },
    { name: 'Metadata/slice_info.config', data: slice },
  ]);
}

test('analyze surfaces source metadata: printer, bed, nozzle, grams', () => {
  const a = analyze(makeMeshBambu());
  assert.equal(a.meta.printerModel, 'OrigPrinter');
  assert.equal(a.meta.nozzle, 0.4);
  assert.deepEqual(a.meta.bed, { x: 256, y: 256 });
  assert.equal(a.meta.totalGrams, 20);
  assert.equal(a.filaments[0].grams, 12.5);
});

test('computeBounds returns the transformed model footprint', () => {
  const a = analyze(makeMeshBambu());
  assert.deepEqual(a.bounds, { x: 300, y: 150, z: 20 });
});

test('retarget warns when the model is larger than the target bed', () => {
  const r = convert(makeMeshBambu(), { targetId: 'snapmaker-u1' }); // 220×220 bed
  assert.equal(r.ok, true);
  assert.ok(r.report.warnings.some((w) => /larger than|may not fit/i.test(w)));
  assert.deepEqual(r.report.bounds, { x: 300, y: 150, z: 20 });
});

test('a big-enough target bed produces no fit warning', () => {
  const r = convert(makeMeshBambu(), { targetId: 'sovol-sv08' }); // 350×350
  assert.equal(r.ok, true);
  assert.ok(!r.report.warnings.some((w) => /fit/i.test(w)));
});

test('cross-family retarget (Bambu → Prusa) warns and does NOT rewrite the printer model', () => {
  const src = makeBambu3mf();
  const r = convert(src, { targetId: 'prusa-mk4-mmu3' }); // prusa family ≠ bambu
  assert.equal(r.ok, true);
  assert.equal(r.report.crossFamily, true);
  assert.ok(r.report.warnings.some((w) => /different slicer format|Generic/i.test(w)));
  // The Bambu JSON must NOT get a Prusa model name written into it.
  const proj = JSON.parse(openZip(r.buffer).file('Metadata/project_settings.config').toString('utf8'));
  assert.equal(proj.printer_model, 'OrigPrinter');
  assert.ok(!r.report.fieldsChanged.includes('printer_model'));
});

test('same-family Bambu retarget writes printable_height', () => {
  const r = convert(makeMeshBambu(), { targetId: 'bambu-x1c' }); // 256×256×256
  assert.equal(r.ok, true);
  assert.equal(r.report.crossFamily, undefined);
  const proj = JSON.parse(openZip(r.buffer).file('Metadata/project_settings.config').toString('utf8'));
  assert.equal(proj.printable_height, '256');
  assert.ok(r.report.fieldsChanged.includes('printable_height'));
});

test('same-family Prusa retarget rewrites bed_shape and max_print_height', () => {
  const cfg = 'printer_model = MK3S\nnozzle_diameter = 0.4\nbed_shape = 0x0,250x0,250x210,0x210\nmax_print_height = 210\nfilament_colour = #AA0000\n';
  const src = writeZip([{ name: '3D/3dmodel.model', data: MODEL }, { name: 'Metadata/Slic3r_PE.config', data: cfg }]);
  const r = convert(src, { targetId: 'prusa-xl-5t' }); // 360×360×360
  assert.equal(r.ok, true);
  const text = openZip(r.buffer).file('Metadata/Slic3r_PE.config').toString('utf8');
  assert.match(text, /bed_shape = 0x0,360x0,360x360,0x360/);
  assert.match(text, /max_print_height = 360/);
});

test('computeBounds honours a non-mm model unit (inch → mm)', () => {
  const inchModel = MESH.replace('unit="millimeter"', 'unit="inch"');
  const src = writeZip([{ name: '3D/3dmodel.model', data: inchModel }, { name: 'Metadata/project_settings.config', data: '{}' }]);
  const a = analyze(src);
  // 300×150×20 inches → ×25.4 mm
  assert.equal(a.bounds.x, Math.round(300 * 25.4 * 10) / 10);
  assert.equal(a.bounds.y, Math.round(150 * 25.4 * 10) / 10);
});

test('computeBounds resolves a <component>-composed assembly (no false Fits)', () => {
  // Object 1 is a 10×10×10 mesh; object 2 is an assembly placing it at x+500. Footprint spans 510mm.
  const model = '<?xml version="1.0"?><model unit="millimeter"><resources>'
    + '<object id="1" type="model"><mesh><vertices>'
    + '<vertex x="0" y="0" z="0"/><vertex x="10" y="10" z="10"/>'
    + '</vertices><triangles/></mesh></object>'
    + '<object id="2" type="model"><components>'
    + '<component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>'
    + '<component objectid="1" transform="1 0 0 0 1 0 0 0 1 500 0 0"/>'
    + '</components></object></resources>'
    + '<build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build></model>';
  const a = analyze(writeZip([{ name: '3D/3dmodel.model', data: model }, { name: 'Metadata/project_settings.config', data: '{}' }]));
  assert.equal(a.bounds.x, 510); // 0..510, not the 10 a vertex-only scan would report
  assert.equal(a.bounds.y, 10);
});

test('a custom target profile re-profiles without registry state', () => {
  const r = convert(makeMeshBambu(), {
    targetId: 'ignored',
    targetProfile: { id: 'custom-mybot', name: 'MyBot', flavour: 'bambu', maxColors: 4, bed: { x: 400, y: 400, z: 400 }, nozzle: 0.6, printerModel: 'MyBot' },
  });
  assert.equal(r.ok, true);
  assert.equal(r.report.mode, 'retarget');
  const proj = JSON.parse(openZip(r.buffer).file('Metadata/project_settings.config').toString('utf8'));
  assert.equal(proj.printer_model, 'MyBot');
  assert.ok(!r.report.warnings.some((w) => /fit/i.test(w))); // 400×400 fits 300×150
});

test('Prusa flavour: filament_colour list + printer_model rewrite', () => {
  const cfg = 'printer_model = MK3S\nnozzle_diameter = 0.4\nfilament_colour = #AA0000;#00BB00;#0000CC\n';
  const src = writeZip([
    { name: '3D/3dmodel.model', data: MODEL },
    { name: 'Metadata/Slic3r_PE.config', data: cfg },
  ]);
  const a = analyze(src);
  assert.equal(a.flavour, 'prusa');
  assert.equal(a.colorCount, 3);
  const r = convert(src, { targetId: 'prusa-mk4-mmu3', slotMap: [2, 1, 0] });
  const text = openZip(r.buffer).file('Metadata/Slic3r_PE.config').toString('utf8');
  assert.match(text, /printer_model = MK4IS/);
  assert.match(text, /filament_colour = #0000CC;#00BB00;#AA0000/);
});
