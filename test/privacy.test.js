const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/privacy.js');

const COLLECTIONS = () => ({
  clients: [{
    id: 'C1', nameEn: 'Sara Noor', nameAr: 'سارة نور', phone: '+966500000000', email: 'sara@example.com',
    addresses: [{ label: 'Home', address: 'Riyadh' }], cr: '123', vat: '456', createdAt: '2026-01-01',
    commLog: [{ type: 'call', note: 'discussed order', at: '2026-02-01' }],
  }, { id: 'C2', nameEn: 'Other', email: 'other@example.com' }],
  printLog: [
    { id: 'O1', clientId: 'C1', date: '2026-03-01', project: 'Vase', status: 'completed', price: 100, client: 'Sara Noor', notes: 'n' },
    { id: 'O2', clientId: 'C2', date: '2026-03-02', project: 'Cup', status: 'pending', price: 50 },
  ],
  waitingList: [{ id: 'W1', name: 'Sara Noor', email: 'sara@example.com', at: '2026-02-10' }],
  waitingListHistory: [{ id: 'H1', name: 'someone', email: 'other@example.com', at: '2025-01-01' }],
});

test('consentRecord: null without agreement, stamped + versioned with it', () => {
  assert.equal(P.consentRecord(false, 'Shop', 'en'), null);
  const r = P.consentRecord(true, 'My Shop', 'en', '2026-07-19T00:00:00Z');
  assert.equal(r.agreed, true);
  assert.equal(r.at, '2026-07-19T00:00:00Z');
  assert.equal(r.version, P.CONSENT_VERSION);
  assert.match(r.text, /My Shop/);
});

test('consentNoticeText is bilingual and interpolates the shop', () => {
  assert.match(P.consentNoticeText('Khayt', 'en'), /Khayt may store my contact details/);
  assert.match(P.consentNoticeText('Khayt', 'ar'), /Khayt/);
  assert.notEqual(P.consentNoticeText('X', 'ar'), P.consentNoticeText('X', 'en'));
});

test('buildClientDataExport bundles only this subject: record, orders, comms, intake', () => {
  const e = P.buildClientDataExport('C1', COLLECTIONS(), '2026-07-19T00:00:00Z');
  assert.equal(e.subject.nameEn, 'Sara Noor');
  assert.equal(e.orders.length, 1);
  assert.equal(e.orders[0].id, 'O1', "other client's order excluded");
  assert.equal(e.communications.length, 1);
  assert.equal(e.intakeSubmissions.length, 1, 'intake matched by email');
  assert.equal(e.intakeHistory.length, 0, "other subject's history excluded");
  assert.equal(e.counts.orders, 1);
});

test('buildClientDataExport never leaks shop settings/secrets', () => {
  const e = P.buildClientDataExport('C1', COLLECTIONS());
  const json = JSON.stringify(e);
  assert.equal(json.includes('apiKey'), false);
  assert.equal(json.includes('settings'), false);
  assert.deepEqual(Object.keys(e).sort(), ['communications', 'counts', 'exportedAt', 'intakeHistory', 'intakeSubmissions', 'orders', 'subject'].sort());
});

test('buildClientDataExport on an unknown client is empty, not a throw', () => {
  const e = P.buildClientDataExport('nope', COLLECTIONS());
  assert.equal(e.subject, null);
  assert.equal(e.orders.length, 0);
  assert.equal(e.communications.length, 0);
});

test('planClientErasure unlink: keeps orders, no purge', () => {
  const p = P.planClientErasure('C1', COLLECTIONS(), 'unlink');
  assert.equal(p.mode, 'unlink');
  assert.deepEqual(p.orderIds, ['O1'], 'order retained (financial basis), link dropped');
  assert.equal(p.blankOrderNames, false);
  assert.equal(p.purgeCommLog, false);
  assert.deepEqual(p.purgeIntakeIds, []);
  assert.equal(p.counts.communications, 0);
});

test('planClientErasure full: blanks names, purges intake + commLog', () => {
  const p = P.planClientErasure('C1', COLLECTIONS(), 'full');
  assert.equal(p.mode, 'full');
  assert.deepEqual(p.orderIds, ['O1']);
  assert.equal(p.blankOrderNames, true);
  assert.equal(p.purgeCommLog, true);
  assert.deepEqual(p.purgeIntakeIds, ['W1']);
  assert.equal(p.counts.communications, 1);
  assert.equal(p.counts.intake, 1);
});

test('selectStaleIntakeRows honours the retention window', () => {
  const now = Date.parse('2026-07-19T00:00:00Z');
  const rows = [
    { id: 'a', at: '2026-07-01T00:00:00Z' }, // ~18 days
    { id: 'b', at: '2025-01-01T00:00:00Z' }, // >1 year
    { id: 'c' },                              // undated → never stale
  ];
  assert.deepEqual(P.selectStaleIntakeRows(rows, 6, now).map(r => r.id), ['b']);
  assert.deepEqual(P.selectStaleIntakeRows(rows, 0, now), [], 'disabled retention → nothing');
  assert.deepEqual(P.selectStaleIntakeRows(rows, null, now), []);
  assert.deepEqual(P.selectStaleIntakeRows(null, 6, now), []);
});

test('anonymizeIntakeRow strips PII but keeps the row', () => {
  const r = P.anonymizeIntakeRow({ id: 'W1', name: 'Sara', email: 's@x.com', phone: '+9665', description: 'a vase' });
  assert.equal(r.name, '[erased]');
  assert.equal(r.email, undefined);
  assert.equal(r.phone, undefined);
  assert.equal(r.description, 'a vase', 'non-PII operational detail retained');
  assert.ok(r.anonymizedAt);
});
