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
