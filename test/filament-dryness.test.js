'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../lib/filament-dryness');

const DAY = 86400000;
const now = 1_700_000_000_000; // fixed epoch for determinism

test('materialKey normalises common variants', () => {
  assert.equal(D.materialKey('PLA Matte'), 'PLA');
  assert.equal(D.materialKey('pla+'), 'PLA');
  assert.equal(D.materialKey('PETG'), 'PETG');
  assert.equal(D.materialKey('Nylon'), 'PA');
  assert.equal(D.materialKey('PA6-CF'), 'PA');
  assert.equal(D.materialKey('PA-CF'), 'PA');
  assert.equal(D.materialKey('mystery goo'), null);
});

test('materialSpec falls back to DEFAULT for unknown material', () => {
  assert.deepEqual(D.materialSpec('unobtanium'), D.DEFAULT);
  assert.equal(D.materialSpec('PETG').dryTempC, 65);
});

test('PETG detected before PLA (substring order does not misclassify)', () => {
  // "PETG" contains no "PLA", but guard against a naive scan that hits something else first.
  assert.equal(D.materialKey('Prusament PETG'), 'PETG');
});

test('isSealed treats drybox and sealed as dry storage', () => {
  assert.equal(D.isSealed('drybox'), true);
  assert.equal(D.isSealed('sealed'), true);
  assert.equal(D.isSealed('open'), false);
  assert.equal(D.isSealed(undefined), false);
});

test('dryStatus: never dried → unknown', () => {
  const s = D.dryStatus({ material: 'PLA', storage: 'open' }, now);
  assert.equal(s.state, 'unknown');
  assert.equal(s.daysSince, null);
});

test('dryStatus: fresh PLA in open air is good', () => {
  const s = D.dryStatus({ material: 'PLA', storage: 'open', driedAt: now - 2 * DAY }, now);
  assert.equal(s.state, 'good');
  assert.equal(s.intervalDays, 14);
  assert.ok(s.daysSince >= 1.9 && s.daysSince <= 2.1);
});

test('dryStatus: PLA open at 12 days is due (>=75% of 14)', () => {
  const s = D.dryStatus({ material: 'PLA', storage: 'open', driedAt: now - 12 * DAY }, now);
  assert.equal(s.state, 'due');
});

test('dryStatus: PLA open past 14 days is overdue', () => {
  const s = D.dryStatus({ material: 'PLA', storage: 'open', driedAt: now - 20 * DAY }, now);
  assert.equal(s.state, 'overdue');
  assert.ok(s.pct > 1);
});

test('dryStatus: same spool in a drybox uses the long interval', () => {
  const rec = { material: 'PLA', storage: 'drybox', driedAt: now - 20 * DAY };
  const s = D.dryStatus(rec, now);
  assert.equal(s.intervalDays, 90);
  assert.equal(s.state, 'good');
});

test('dryStatus: Nylon in open air degrades within a day', () => {
  const s = D.dryStatus({ material: 'Nylon', storage: 'open', driedAt: now - 2 * DAY }, now);
  assert.equal(s.intervalDays, 1);
  assert.equal(s.state, 'overdue');
});

test('dryStatus: future driedAt clamps daysSince to 0 (good)', () => {
  const s = D.dryStatus({ material: 'PLA', storage: 'open', driedAt: now + 5 * DAY }, now);
  assert.equal(s.daysSince, 0);
  assert.equal(s.state, 'good');
});
