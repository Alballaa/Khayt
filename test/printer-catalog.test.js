const { test } = require('node:test');
const assert = require('node:assert/strict');
const cat = require('../lib/printer-catalog.js');

test('list() returns entries with computed names, sorted, non-empty', () => {
  const all = cat.list();
  assert.ok(all.length >= 40, 'has a real catalog');
  assert.ok(all.every(p => p.id && p.name && p.bed), 'each entry has id/name/bed');
  // sorted by vendor then model
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i];
    assert.ok(a.vendor.localeCompare(b.vendor) < 0 || (a.vendor === b.vendor && a.model.localeCompare(b.model) <= 0), 'sorted');
  }
});

test('get() resolves by id and adds a display name', () => {
  const p = cat.get('bambu-x1c');
  assert.equal(p.name, 'Bambu Lab X1 Carbon');
  assert.equal(p.maxColors, 4);
  assert.equal(p.powerW, 120);
  assert.equal(cat.get('nope'), null);
});

test('search() is token-based across vendor/model/name', () => {
  assert.ok(cat.search('bambu x1').some(p => p.id === 'bambu-x1c'), 'multi-token matches');
  assert.ok(cat.search('ender 3').length >= 1);
  assert.ok(cat.search('prusa').every(p => p.vendor === 'Prusa'));
  assert.equal(cat.search('').length, cat.list().length, 'empty query → full list');
  assert.equal(cat.search('zzzznope').length, 0);
});

test('toMachineSpecs() maps to Khayt machine fields incl. power draw', () => {
  const s = cat.toMachineSpecs('prusa-mk4s');
  assert.equal(s.printerModel, 'prusa-mk4s');
  assert.equal(s.printerName, 'Prusa MK4S');
  assert.equal(s.nozzleDiameter, 0.4);
  assert.equal(s.maxColors, 5);
  assert.equal(s.extruderType, 'Direct Drive');
  assert.equal(s.powerDraw, 90);
  assert.deepEqual(s.bed, { x: 250, y: 210, z: 220 });
  // accepts an entry object too
  const s2 = cat.toMachineSpecs(cat.get('bambu-a1-mini'));
  assert.equal(s2.powerDraw, 55);
  assert.equal(cat.toMachineSpecs('nope').printerModel, undefined);
});

test('ids are unique', () => {
  const ids = cat.PRINTERS.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
});
