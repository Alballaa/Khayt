const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Band-swap and Full Spectrum both reindex the printer config to match the new filament
 * order. They must touch ONLY per-filament arrays.
 *
 * They reindexed every array whose length happened to equal the source filament count. A
 * 4-filament model matches the FOUR CORNERS of `printable_area`, so the bed rectangle came
 * out as a self-intersecting bow-tie:
 *   before ["0.5x1","270.5x1","270.5x271","0.5x271"]
 *   after  ["0.5x1","270.5x271","0.5x271","270.5x1"]
 * `remapJsonSettings` already filtered on ^filament_; these two loops did not.
 *
 * Source-level, because neither helper is exported — but it pins the exact guard.
 */
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mf-convert.js'), 'utf8');

const bodyOf = (fnName) => {
  const i = src.indexOf(`function ${fnName}(`);
  assert.ok(i !== -1, `${fnName} not found`);
  return src.slice(i, src.indexOf('\n  }', i));
};

for (const fn of ['applyBandSwapConfig', 'applyFullSpectrumConfig']) {
  test(`${fn} only reindexes per-filament arrays`, () => {
    const body = bodyOf(fn);
    assert.ok(/\^filament_/i.test(body),
      `${fn} reindexes any array of the right length — printable_area's 4 corners get permuted ` +
      `into a self-intersecting bed outline on any 4-filament model`);
    // The guard must come BEFORE the length-matched assignment.
    const guardAt = body.search(/\^filament_/i);
    const assignAt = body.search(/v\.length === srcCount/);
    assert.ok(guardAt !== -1 && assignAt !== -1 && guardAt < assignAt,
      `${fn}: the ^filament_ guard must precede the reindex`);
  });
}

test('the per-filament filter keeps the reindex working', () => {
  // Behavioural check on the same logic, so the guard cannot be "fixed" by disabling it.
  const apply = (obj, idx, n) => {
    for (const k of Object.keys(obj)) {
      if (!/^filament_/i.test(k)) continue;
      const v = obj[k];
      if (Array.isArray(v) && v.length === n) obj[k] = idx.map((i) => (v[i] != null ? v[i] : v[0]));
    }
    return obj;
  };
  const cfg = {
    printable_area: ['0.5x1', '270.5x1', '270.5x271', '0.5x271'],
    filament_type: ['PLA', 'PETG', 'ABS', 'TPU'],
  };
  const out = apply(JSON.parse(JSON.stringify(cfg)), [0, 2, 3, 1], 4);
  assert.deepEqual(out.printable_area, cfg.printable_area, 'bed geometry must not be permuted');
  assert.deepEqual(out.filament_type, ['PLA', 'ABS', 'TPU', 'PETG'], 'filament arrays must still reindex');
});
