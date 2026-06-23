'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCsvBundle } = require('../lib/csv-bundle.js');

test('builds one CSV per non-empty known collection, skips empty/unknown', () => {
  const files = buildCsvBundle({
    printLog: [{ id: 'O1', date: '2026-06-23', project: 'Sara', price: 120, status: 'done' }],
    clients: [{ id: 'C1', name: 'Sara', phone: '+966500' }],
    inventory: [],            // empty → skipped
    foobar: [{ id: 'x' }],    // unknown → skipped
  });
  const names = files.map((f) => f.name).sort();
  assert.deepEqual(names, ['clients.csv', 'orders.csv']);
});

test('orders.csv has a header + one row per order; arrays joined', () => {
  const [orders] = buildCsvBundle({
    printLog: [{ id: 'O1', date: '2026-06-23', project: 'Sara', price: 120, status: 'done', tags: ['rush', 'vip'] }],
  });
  const lines = orders.content.replace(/^﻿/, '').split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^"ID","Date","Client"/);
  assert.match(lines[1], /"rush, vip"/); // tags array joined
  assert.match(lines[1], /"Sara"/);
});

test('cells are quoted, quote-escaped, and formula-neutralized', () => {
  const [clients] = buildCsvBundle({
    clients: [{ id: 'C1', name: '=cmd()', notes: 'he said "hi"\nbye' }],
  });
  const body = clients.content;
  assert.match(body, /"'=cmd\(\)"/);        // leading = neutralized with '
  assert.match(body, /"he said ""hi"" bye"/); // quotes doubled, newline → space
});

test('empty snapshot → no files', () => {
  assert.deepEqual(buildCsvBundle({}), []);
  assert.deepEqual(buildCsvBundle(), []);
});
