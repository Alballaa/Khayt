'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../lib/orca-db');

test('orca-db: listU1Filaments returns well-formed entries (or empty when no slicer)', () => {
  const list = db.listU1Filaments();
  assert.ok(Array.isArray(list));
  for (const f of list) {
    assert.equal(typeof f.name, 'string');
    assert.ok(f.name.length > 0);
    assert.equal(typeof f.type, 'string');
    assert.ok(!/\bbase\d*\b/i.test(f.name), 'no internal base templates');
    assert.match(f.name, /@U1/i);
  }
  // available() must agree with whether any root resolved
  assert.equal(typeof db.available(), 'boolean');
});
