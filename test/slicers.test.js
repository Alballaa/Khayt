'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { listSlicers, defaultSlicer, getSlicer, slicerDisplayName, isAllowedSlicerBinary } = require('../lib/slicers');

test('slicerDisplayName: friendly names from exe paths', () => {
  assert.equal(slicerDisplayName('/Applications/PrusaSlicer.app'), 'PrusaSlicer');
  assert.equal(slicerDisplayName('C:/Program Files/OrcaSlicer/orca-slicer.exe').toLowerCase().includes('orca'), true);
  assert.equal(slicerDisplayName('/opt/BambuStudio.AppImage'), 'Bambu Studio');
  assert.equal(slicerDisplayName('/usr/bin/some-custom-tool'), 'some-custom-tool');
  assert.equal(slicerDisplayName(''), '');
});

test('listSlicers: prefers settings.slicers, drops path-less entries', () => {
  const s = { slicers: [
    { id: 'a', name: 'Prusa', path: '/p/prusa' },
    { name: 'NoPath' },                      // dropped (no path)
    { path: '/p/orca.exe' },                 // id + name derived
  ] };
  const list = listSlicers(s);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'a');
  assert.equal(list[1].id, 'sl1');           // index-based id (post-filter position)
  assert.ok(list[1].name.length > 0);        // name derived from path
});

test('listSlicers: falls back to legacy single settings.slicer', () => {
  assert.deepEqual(listSlicers({ slicer: { path: '/p/PrusaSlicer.app', args: '-x' } }),
    [{ id: 'default', name: 'PrusaSlicer', path: '/p/PrusaSlicer.app', args: '-x' }]);
  assert.deepEqual(listSlicers({}), []);
  assert.deepEqual(listSlicers({ slicer: {} }), []);
});

test('defaultSlicer: honours defaultSlicerId, else first, else null', () => {
  const s = { slicers: [{ id: 'a', path: '/a' }, { id: 'b', path: '/b' }], defaultSlicerId: 'b' };
  assert.equal(defaultSlicer(s).id, 'b');
  assert.equal(defaultSlicer({ slicers: [{ id: 'a', path: '/a' }, { id: 'b', path: '/b' }] }).id, 'a');
  assert.equal(defaultSlicer({}), null);
});

test('getSlicer: by id or null', () => {
  const s = { slicers: [{ id: 'a', path: '/a' }, { id: 'b', path: '/b' }] };
  assert.equal(getSlicer(s, 'b').path, '/b');
  assert.equal(getSlicer(s, 'zzz'), null);
});

test('isAllowedSlicerBinary: accepts real slicers across platforms', () => {
  const ok = [
    '/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer',
    '/Applications/OrcaSlicer.app', 'C:/Program Files/OrcaSlicer/orca-slicer.exe',
    '/opt/BambuStudio.AppImage', '/usr/bin/UltiMaker-Cura', '/Applications/SuperSlicer.app',
    '/opt/Slic3r', '/Applications/QIDIStudio.app', '/opt/CrealityPrint',
    '/Applications/CHITUBOX.app', '/opt/ElegooSlicer', '/Applications/Snapmaker Orca.app/Contents/MacOS/Snapmaker_Orca',
    '/usr/local/bin/ideaMaker', '/opt/FlashPrint', '/opt/KISSlicer', '/opt/IceSL',
  ];
  for (const p of ok) assert.equal(isAllowedSlicerBinary(p), true, `should allow ${p}`);
});

test('isAllowedSlicerBinary: rejects living-off-the-land binaries (RCE guard)', () => {
  // A poisoned settings.slicers[] snapshot must not turn any of these into command
  // execution. None is a shell, so the old interpreter denylist let them through.
  const bad = [
    '/usr/bin/find', '/usr/bin/awk', '/usr/bin/gawk', '/usr/bin/xargs', '/usr/bin/gdb',
    '/usr/bin/make', '/usr/bin/tclsh', '/usr/bin/lua', '/bin/busybox', '/usr/bin/git',
    '/usr/bin/zip', '/usr/bin/tar', '/usr/bin/ssh', '/usr/bin/vim', '/usr/bin/expect',
    '/bin/bash', '/usr/bin/python3', '/usr/bin/node', '/usr/bin/perl', '/usr/bin/env',
    'C:/Windows/System32/cmd.exe', 'C:/Windows/System32/rundll32.exe',
    '', '/', '   ', '/usr/bin/', '/usr/local/bin/totally-legit',
  ];
  for (const p of bad) assert.equal(isAllowedSlicerBinary(p), false, `should reject ${p}`);
});
