/**
 * Marketing campaign segmentation + merge. Pure — verifies spend/recency/tag
 * filters, channel reachability (opt-out + missing contact), and template fill.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/campaigns.js');

const NOW = Date.parse('2026-06-22');
const DAY = 86400000;
const ymd = (msAgo) => new Date(NOW - msAgo).toISOString().slice(0, 10);

const ORDERS = [
  { clientId: 'a', status: 'completed', price: 300, date: ymd(10 * DAY) },
  { clientId: 'a', status: 'completed', price: 250, date: ymd(120 * DAY) },
  { clientId: 'b', status: 'completed', price: 50, date: ymd(200 * DAY) },
  { clientId: 'c', status: 'pending', price: 999, date: ymd(1 * DAY) }, // not completed → no spend
];
const CLIENTS = [
  { id: 'a', name: 'Acme', email: 'a@x.com', phone: '+966500000001', tags: ['vip'] },
  { id: 'b', name: 'Beta', email: 'b@x.com', phone: '+966500000002' },
  { id: 'c', name: 'Gamma', email: '', phone: '+966500000003' }, // no email
  { id: 'd', name: 'Delta', email: 'd@x.com', phone: '+966500000004', marketingOptOut: true },
];

test('clientStats rolls up completed spend, count, last order', () => {
  const s = C.clientStats('a', ORDERS);
  assert.equal(s.completedCount, 2);
  assert.equal(s.totalSpend, 550);
  assert.equal(s.lastOrderDate, ymd(10 * DAY));
});

test('minSpend segment includes only high-value customers', () => {
  const r = C.segmentRecipients(CLIENTS, ORDERS, { minSpend: 100 }, 'email', NOW);
  assert.deepEqual(r.map((x) => x.client.id).sort(), ['a']); // only Acme spent ≥100 (and has email)
});

test('noOrderDays win-back: last order older than N days (or never)', () => {
  const r = C.segmentRecipients(CLIENTS, ORDERS, { noOrderDays: 90 }, 'email', NOW);
  const ids = r.map((x) => x.client.id).sort();
  assert.ok(ids.includes('b')); // 200d ago
  assert.ok(!ids.includes('a')); // ordered 10d ago → excluded
});

test('tag filter', () => {
  const r = C.segmentRecipients(CLIENTS, ORDERS, { tag: 'VIP' }, 'email', NOW);
  assert.deepEqual(r.map((x) => x.client.id), ['a']);
});

test('channel reachability: missing contact + opt-out are excluded', () => {
  // email channel: Gamma has no email → excluded; Delta opted out → excluded
  const email = C.segmentRecipients(CLIENTS, ORDERS, {}, 'email', NOW).map((x) => x.client.id);
  assert.ok(!email.includes('c'));
  assert.ok(!email.includes('d'));
  // whatsapp channel: Gamma has a phone → included; Delta still opted out
  const wa = C.segmentRecipients(CLIENTS, ORDERS, {}, 'whatsapp', NOW).map((x) => x.client.id);
  assert.ok(wa.includes('c'));
  assert.ok(!wa.includes('d'));
});

test('tier filter uses the injected tierOf resolver', () => {
  const tierOf = (id) => (id === 'a' ? 'Gold' : 'Silver');
  const r = C.segmentRecipients(CLIENTS, ORDERS, { tier: 'Gold' }, 'email', NOW, { tierOf });
  assert.deepEqual(r.map((x) => x.client.id), ['a']);
});

test('fillTemplate merges name / orders / spend / last_order', () => {
  const rec = { client: { name: 'Acme' }, stats: { completedCount: 2, totalSpend: 550, lastOrderDate: '2026-06-12' } };
  const out = C.fillTemplate('Hi {{name}}, {{orders}} orders, {{spend}} spent since {{last_order}}', rec, (n) => n + ' SAR');
  assert.equal(out, 'Hi Acme, 2 orders, 550 SAR spent since 2026-06-12');
});
