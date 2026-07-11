'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const inst = require('../lib/orca-filament-install');

test('safeFileBase keeps clean names and strips anything path-unsafe', () => {
  assert.equal(inst.safeFileBase('SUNLU PLA Matte'), 'SUNLU PLA Matte'); // clean name untouched
  assert.equal(inst.safeFileBase(''), 'filament'); // empty → fallback
  // No path separator or reserved char survives, for any hostile input.
  for (const s of ['../../etc/passwd', 'a/b\\c:d*e?', '..\\..\\win', 'x/y']) {
    const out = inst.safeFileBase(s);
    assert.ok(out.length > 0, `${s} → non-empty`);
    assert.equal(/[\\/:*?"<>|]/.test(out), false, `${s} → "${out}" has no path/reserved chars`);
  }
});

test('resolveFilamentDir returns a user/<profile>/filament path and an appFound flag', () => {
  const r = inst.resolveFilamentDir();
  assert.equal(typeof r.dir, 'string');
  assert.equal(typeof r.appFound, 'boolean');
  assert.match(r.dir, /[\\/]user[\\/][^\\/]+[\\/]filament$/);
});

test('installProfile rejects a file reference outside the profiles set (no traversal)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orcafila-'));
  for (const bad of ['../../etc/passwd', 'profiles/../secret.json', '/etc/passwd', 'profiles/x.txt', 'notprofiles/x.json']) {
    await assert.rejects(() => inst.installProfile({ file: bad, name: 'x' }, dir), /invalid file reference/i, `should reject ${bad}`);
  }
});

test('installProfile fetches, validates and writes a preset as <name>.json', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orcafila-'));
  const preset = { type: 'filament', name: 'SUNLU PLA Matte', filament_type: ['PLA'], nozzle_temperature: ['220'], compatible_printers: ['Snapmaker U1 (0.4 nozzle)'] };
  const orig = global.fetch;
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => String(Buffer.byteLength(JSON.stringify(preset))) },
    arrayBuffer: async () => Buffer.from(JSON.stringify(preset)),
  });
  try {
    const r = await inst.installProfile({ file: 'profiles/sunlu-sunlu-pla-matte.json', name: 'SUNLU PLA Matte' }, dir);
    assert.ok(r.ok);
    assert.equal(r.path, path.join(dir, 'SUNLU PLA Matte.json'));
    const written = JSON.parse(fs.readFileSync(r.path, 'utf8'));
    assert.equal(written.type, 'filament');
    assert.equal(written.name, 'SUNLU PLA Matte');
  } finally { global.fetch = orig; }
});

test('installProfile rejects a malformed (non-filament) preset', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orcafila-'));
  const orig = global.fetch;
  global.fetch = async () => ({ ok: true, headers: { get: () => '20' }, arrayBuffer: async () => Buffer.from('{"type":"printer"}') });
  try {
    await assert.rejects(() => inst.installProfile({ file: 'profiles/x.json', name: 'x' }, dir), /malformed/i);
  } finally { global.fetch = orig; }
});
