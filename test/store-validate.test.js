const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  STORE_VERSION,
  validateStoreSnapshot,
  normalizeStoreSnapshot,
  isValidOrder,
} = require('../lib/store-validate');

test('isValidOrder requires id, date, status, project', () => {
  assert.equal(isValidOrder({ id: 'O-1', date: '2026-01-01', status: 'queued', project: 'X' }), true);
  assert.equal(isValidOrder({ id: '', date: '2026-01-01', status: 'queued', project: 'X' }), false);
  assert.ok(!isValidOrder(null));
});

test('validateStoreSnapshot rejects non-objects', () => {
  const r = validateStoreSnapshot([]);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /plain object/);
});

test('validateStoreSnapshot accepts minimal disk snapshot', () => {
  const r = validateStoreSnapshot({ printLog: [], settings: {} });
  assert.equal(r.ok, true);
});

test('validateStoreSnapshot flags wrong collection types', () => {
  const r = validateStoreSnapshot({ printLog: 'not-array' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('printLog')));
});

test('normalizeStoreSnapshot drops invalid orders and keeps valid ones', () => {
  const { normalized, warnings } = normalizeStoreSnapshot({
    printLog: [
      { id: 'O-1', date: '2026-01-01', status: 'queued', project: 'A' },
      { id: '', date: '2026-01-01', status: 'queued', project: 'B' },
    ],
  });
  assert.equal(normalized.printLog.length, 1);
  assert.equal(normalized.printLog[0].id, 'O-1');
  assert.ok(warnings.some(w => w.includes('printLog')));
});

test('normalizeStoreSnapshot strips prototype pollution keys from settings', () => {
  const polluted = JSON.parse('{"settings":{"lang":"en","__proto__":{"polluted":true}}}');
  const { normalized } = normalizeStoreSnapshot(polluted);
  assert.equal(normalized.settings.lang, 'en');
  assert.equal(Object.prototype.polluted, undefined);
});

test('normalizeStoreSnapshot passes through corrupt marker', () => {
  const corrupt = { __corrupt: true, error: 'bad' };
  const { normalized } = normalizeStoreSnapshot(corrupt);
  assert.equal(normalized.__corrupt, true);
});

test('export version newer than supported yields warning only', () => {
  const { ok, warnings } = validateStoreSnapshot({ version: STORE_VERSION + 1, settings: {} });
  assert.equal(ok, true);
  assert.ok(warnings.some(w => w.includes('newer')));
});

test('isValidClient requires non-empty id', () => {
  const { isValidClient } = require('../lib/store-validate');
  assert.equal(isValidClient({ id: 'C1' }), true);
  assert.equal(isValidClient({ id: '' }), false);
  assert.ok(!isValidClient(null));
});

test('normalizeStoreSnapshot drops invalid clients', () => {
  const { normalized, warnings } = normalizeStoreSnapshot({
    clients: [{ id: 'C1' }, { id: '' }],
  });
  assert.equal(normalized.clients.length, 1);
  assert.ok(warnings.some(w => w.includes('clients')));
});
