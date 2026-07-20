const { test } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../lib/webhook-bus.js');

test('migrateLegacyWebhooks: one subscription per distinct URL, events collapsed', () => {
  const subs = B.migrateLegacyWebhooks({
    enabled: true, secret: 's3cret',
    events: {
      order_created: 'https://a.example/hook',
      status_changed: 'https://a.example/hook',
      payment_received: 'https://b.example/hook',
      quote_approved: '',
    },
  });
  assert.equal(subs.length, 2, 'two distinct URLs');
  const a = subs.find(s => s.url === 'https://a.example/hook');
  assert.deepEqual(a.events.sort(), ['order_created', 'status_changed']);
  assert.equal(a.secret, 's3cret', 'legacy secret carried over');
  assert.equal(a.enabled, true);
  const b = subs.find(s => s.url === 'https://b.example/hook');
  assert.deepEqual(b.events, ['payment_received']);
});

test('migrateLegacyWebhooks: already-migrated config is left alone', () => {
  const existing = [{ id: 'x', url: 'https://k.example', events: ['order_created'], enabled: true }];
  assert.equal(B.migrateLegacyWebhooks({ subscriptions: existing }), existing);
});

test('migrateLegacyWebhooks: empty/absent legacy config → no subscriptions', () => {
  assert.deepEqual(B.migrateLegacyWebhooks({}), []);
  assert.deepEqual(B.migrateLegacyWebhooks(null), []);
  assert.deepEqual(B.migrateLegacyWebhooks({ events: { order_created: '  ' } }), []);
});

test('matchSubscriptions: fan-out to every enabled listener, skipping disabled', () => {
  const subs = [
    { id: '1', url: 'https://a', events: ['order_created', 'order_shipped'], enabled: true },
    { id: '2', url: 'https://b', events: ['order_created'], enabled: true },
    { id: '3', url: 'https://c', events: ['order_created'], enabled: false },
    { id: '4', url: 'https://d', events: ['payment_received'], enabled: true },
    { id: '5', url: '', events: ['order_created'], enabled: true },
  ];
  assert.deepEqual(B.matchSubscriptions(subs, 'order_created').map(s => s.id), ['1', '2'],
    'one event fans out to N urls; disabled and url-less skipped');
  assert.deepEqual(B.matchSubscriptions(subs, 'order_shipped').map(s => s.id), ['1']);
  assert.deepEqual(B.matchSubscriptions(subs, 'nope'), []);
  assert.deepEqual(B.matchSubscriptions(null, 'order_created'), []);
});

test('buildDeliveryBody carries id/event/version/timestamp/payload', () => {
  const body = B.buildDeliveryBody('order_shipped', { orderId: 'O1' }, 'dlv_1', '2026-07-20T00:00:00Z');
  assert.deepEqual(body, {
    id: 'dlv_1', event: 'order_shipped', version: 1,
    timestamp: '2026-07-20T00:00:00Z', payload: { orderId: 'O1' },
  });
  assert.ok(B.buildDeliveryBody('x').id.startsWith('dlv_'), 'auto id when omitted');
});

test('backoffDelayMs follows the ladder and clamps', () => {
  assert.equal(B.backoffDelayMs(1), 0);
  assert.equal(B.backoffDelayMs(2), 30_000);
  assert.equal(B.backoffDelayMs(3), 120_000);
  assert.equal(B.backoffDelayMs(4), 600_000);
  assert.equal(B.backoffDelayMs(5), 3_600_000);
  assert.equal(B.backoffDelayMs(99), 3_600_000, 'clamped at the last rung');
  assert.equal(B.backoffDelayMs(0), 0);
});

test('shouldRetry: 2xx done, 410 never, others retry until the cap', () => {
  assert.equal(B.shouldRetry(200, 1), false, '2xx is success');
  assert.equal(B.shouldRetry(204, 1), false);
  assert.equal(B.shouldRetry(410, 1), false, '410 Gone is permanent');
  assert.equal(B.shouldRetry(500, 1), true);
  assert.equal(B.shouldRetry(429, 2), true);
  assert.equal(B.shouldRetry(undefined, 1), true, 'network error retries');
  assert.equal(B.shouldRetry(500, B.MAX_ATTEMPTS), false, 'stops at the attempt cap');
  assert.equal(B.isGone(410), true);
  assert.equal(B.isGone(500), false);
});

test('appendDelivery bounds the log to the cap, keeping the newest', () => {
  let log = [];
  for (let i = 0; i < 250; i++) log = B.appendDelivery(log, { id: i, subscriptionId: 's1' });
  assert.equal(log.length, B.DELIVERY_LOG_CAP, 'bounded');
  assert.equal(log[log.length - 1].id, 249, 'newest kept');
  assert.equal(log[0].id, 250 - B.DELIVERY_LOG_CAP, 'oldest dropped');
  assert.equal(B.appendDelivery(null, { id: 'a' }).length, 1, 'tolerates a missing log');
});

test('deliveriesFor filters by subscription, newest first', () => {
  const log = [
    { id: 1, subscriptionId: 's1' }, { id: 2, subscriptionId: 's2' }, { id: 3, subscriptionId: 's1' },
  ];
  assert.deepEqual(B.deliveriesFor(log, 's1').map(d => d.id), [3, 1]);
  assert.deepEqual(B.deliveriesFor(log, 'nope'), []);
});
