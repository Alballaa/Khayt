'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildReport, reportToCsv, DEFAULT_FIELDS } = require('../lib/report-builder.js');

const RECORDS = [
  { id: 'A', date: '2026-06-05', client: 'Acme', status: 'completed', price: 100, paymentStatus: 'paid', tags: ['rush', 'vip'] },
  { id: 'B', date: '2026-06-20', client: 'Beta', status: 'pending', price: 50, paymentStatus: 'unpaid', tags: [] },
  { id: 'C', date: '2026-07-01', client: 'Acme', status: 'completed', price: 80, paymentStatus: 'paid', tags: [] },
];

test('selects chosen fields in order + applies date range', () => {
  const r = buildReport(RECORDS, { fields: ['id', 'client', 'price'], from: '2026-06-01', to: '2026-06-30' });
  assert.deepEqual(r.headers, ['Order #', 'Client', 'Price']);
  assert.equal(r.count, 2); // A + B (C is in July)
  assert.deepEqual(r.rows[0], ['A', 'Acme', 100]);
});

test('status filter narrows rows; arrays are joined', () => {
  const r = buildReport(RECORDS, { fields: ['id', 'tags'], statusIn: ['completed'] });
  assert.equal(r.count, 2); // A + C
  assert.equal(r.rows[0][1], 'rush, vip');
});

test('unknown fields dropped; empty fields → defaults', () => {
  assert.deepEqual(buildReport(RECORDS, { fields: ['id', 'bogus'] }).keys, ['id']);
  assert.deepEqual(buildReport(RECORDS, {}).keys, DEFAULT_FIELDS);
});

test('reportToCsv is spreadsheet-safe', () => {
  const r = buildReport([{ id: '=cmd', date: '2026-06-01', client: 'a,b', status: 'completed', price: 5 }], { fields: ['id', 'client', 'price'] });
  const csv = reportToCsv(r).replace(/^﻿/, '');
  assert.match(csv, /"'=cmd"/);      // formula neutralized
  assert.match(csv, /"a,b"/);        // comma quoted
  assert.match(csv, /"5"/);
});
