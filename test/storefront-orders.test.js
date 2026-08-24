const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/storefront-orders.js');

/*
 * An order that arrives twice from a storefront is one order.
 *
 * Salla and Zid POST a signed webhook when an order is placed, and each delivery
 * became a fresh row with a fresh random id — the platform's own reference went
 * into free text. The only thing between a retry and a duplicate order was
 * `isReplayedWebhook`, whose own comment describes it accurately: "per-process
 * (cleared on restart) and capped in size", ten-minute TTL.
 *
 * Every one of those limits is an ordinary event. Providers retry, byte for
 * byte, which is the only reason a signature cache ever matches. Shops close the
 * app at night. Five hundred webhooks evict an entry. Ten minutes pass.
 *
 * Then the shop has the same job in its queue twice — printed twice, or invoiced
 * twice. The durable check is the platform's own id against the print log, which
 * is on disk.
 */

const sallaPayload = (ref) => ({
  data: { reference_id: ref, name: 'Order 12', total: 250, customer: { first_name: 'A', last_name: 'B' } },
});
const zidPayload = (ref, id) => ({ order: { reference_id: ref, id, name: 'Order 12', total: 250 } });

test('each platform’s own order id is found where that platform puts it', () => {
  assert.equal(S.sourceOrderIdFrom('salla', sallaPayload('SL-991')), 'SL-991');
  assert.equal(S.sourceOrderIdFrom('zid', zidPayload('ZD-4', 77)), 'ZD-4');
  // Zid may send only the numeric id, which is what the notes line already fell
  // back to — so the dedup key and the note stay the same string.
  assert.equal(S.sourceOrderIdFrom('zid', zidPayload(undefined, 77)), '77');
  assert.equal(S.sourceOrderIdFrom('salla', {}), '');
  assert.equal(S.sourceOrderIdFrom('shopify', sallaPayload('X')), '', 'an unknown platform must not guess');
  assert.equal(S.sourceOrderIdFrom('salla', null), '');
});

test('a second delivery of the same order is recognised', () => {
  const log = [{ id: 'salla_a', source: 'salla', sourceOrderId: 'SL-991' }];
  assert.equal(S.alreadyRecorded(log, 'salla', 'SL-991'), true);
  assert.equal(S.alreadyRecorded(log, 'salla', 'SL-992'), false, 'a genuinely different order was dropped');
});

test('the same reference on a different platform is a different order', () => {
  // Two storefronts numbering their own orders from 1 is not a collision to
  // resolve — they are unrelated orders that happen to share a string.
  const log = [{ id: 'salla_a', source: 'salla', sourceOrderId: '1001' }];
  assert.equal(S.alreadyRecorded(log, 'zid', '1001'), false);
  assert.equal(S.alreadyRecorded(log, 'salla', '1001'), true);
});

test('an order with NO id is never deduped against another', () => {
  // The dangerous direction. Two payloads that both failed to name themselves
  // are not thereby the same order, and folding them together would silently
  // drop a real second order — worse than the duplicate this prevents, because
  // nothing about it is visible.
  const log = [{ id: 'salla_a', source: 'salla', sourceOrderId: undefined, notes: 'Salla order #' }];
  assert.equal(S.alreadyRecorded(log, 'salla', ''), false);
  assert.equal(S.alreadyRecorded(log, 'salla', null), false);
  assert.equal(S.alreadyRecorded([], 'salla', 'SL-1'), false);
  assert.equal(S.alreadyRecorded(null, 'salla', 'SL-1'), false);
});

test('orders recorded before the field existed are still recognised', () => {
  // Without this the fix protects only orders arriving from now on, and a shop's
  // existing queue — where a duplicate is most annoying — keeps collecting them.
  // The string being parsed is one Khayt wrote itself, in the format noteFor()
  // defines, so the two cannot drift.
  const legacy = [
    { id: 'salla_a', source: 'salla', notes: 'Salla order #SL-991' },
    { id: 'zid_a', source: 'zid', notes: 'Zid order #ZD-4' },
  ];
  assert.equal(S.alreadyRecorded(legacy, 'salla', 'SL-991'), true);
  assert.equal(S.alreadyRecorded(legacy, 'zid', 'ZD-4'), true);
  assert.equal(S.alreadyRecorded(legacy, 'salla', 'SL-000'), false);

  assert.equal(S.recordedNoteRef({ notes: 'Salla order #SL-991' }), 'SL-991');
  assert.equal(S.recordedNoteRef({ notes: 'Zid order #ZD-4' }), 'ZD-4');
  // A note the shop typed is not an order reference.
  assert.equal(S.recordedNoteRef({ notes: 'customer wants it matte' }), '');
  assert.equal(S.recordedNoteRef({ notes: 'Salla order #' }), '', 'an empty ref is not a ref');
  assert.equal(S.recordedNoteRef({}), '');
  assert.equal(S.recordedNoteRef(null), '');
});

test('the note and the dedup key are built from one function', () => {
  // They were two copies of the same string in two handlers. If they drift, a
  // legacy order stops being recognisable by the very reference it displays.
  assert.equal(S.noteFor('salla', 'SL-991'), 'Salla order #SL-991');
  assert.equal(S.noteFor('zid', 'ZD-4'), 'Zid order #ZD-4');
  for (const [source, ref] of [['salla', 'SL-991'], ['zid', 'ZD-4']]) {
    assert.equal(S.recordedNoteRef({ notes: S.noteFor(source, ref) }), ref,
      'a note this module writes must be one it can read back');
  }
});

test('the whole round trip: deliver, retry, restart, retry again', () => {
  // The sequence that produced the bug. The signature cache is assumed gone
  // throughout — that is the point.
  const payload = sallaPayload('SL-991');
  const ref = S.sourceOrderIdFrom('salla', payload);
  const log = [];

  assert.equal(S.alreadyRecorded(log, 'salla', ref), false, 'first delivery must be recorded');
  log.unshift({ id: 'salla_1', source: 'salla', sourceOrderId: ref, notes: S.noteFor('salla', ref) });

  // Provider retries because our 200 was slow to arrive.
  assert.equal(S.alreadyRecorded(log, 'salla', ref), true);
  // App restarts; the log is read back off disk, the cache is not.
  const afterRestart = JSON.parse(JSON.stringify(log));
  assert.equal(S.alreadyRecorded(afterRestart, 'salla', ref), true);
  // A genuinely new order still gets through.
  assert.equal(S.alreadyRecorded(afterRestart, 'salla', 'SL-992'), false);
});

/* ── how it is wired ────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const lan = fs.readFileSync(path.join(__dirname, '..', 'lib', 'lan-server.js'), 'utf8');

test('both storefront handlers check before they create, and record the id', () => {
  // The failure this guards is a THIRD platform handler written by copying one
  // of these two — which is how both of them came to build an order inline with
  // a random id in the first place.
  for (const source of ['salla', 'zid']) {
    const at = lan.indexOf(`sourceOrderIdFrom('${source}'`);
    assert.ok(at > 0, `the ${source} handler does not read the platform's order id`);
    const body = lan.slice(at, at + 1400);
    const check = body.indexOf(`alreadyRecorded(storeData.printLog, '${source}'`);
    const create = body.indexOf('storeData.printLog.unshift(newOrder)');
    assert.ok(check > 0, `the ${source} handler does not check for a duplicate`);
    assert.ok(create > 0, `the ${source} handler no longer creates an order here`);
    assert.ok(check < create, `the ${source} handler creates the order before checking for it`);
    assert.match(body, /sourceOrderId: \w+Ref \|\| undefined/,
      `the ${source} handler does not record the id, so the NEXT delivery cannot be recognised`);
    assert.match(body, /notes:\s+storefrontOrders\.noteFor\(/,
      `the ${source} handler writes its own note string instead of the shared one`);
  }
});

test('a duplicate answers 200, so the provider stops retrying', () => {
  // Not 409. A retry is the provider asking "did you get this?", and the honest
  // answer is yes — the order is recorded. A non-2xx tells it to try again, and
  // on some platforms eventually to mark the delivery failed and alert the shop
  // about a webhook that is working perfectly.
  for (const source of ['salla', 'zid']) {
    const at = lan.indexOf(`alreadyRecorded(storeData.printLog, '${source}'`);
    const body = lan.slice(at, at + 400);
    assert.match(body, /writeHead\(200/, `a duplicate ${source} delivery is answered with a non-2xx`);
    assert.match(body, /duplicate: true/, `the ${source} response does not say it was a duplicate`);
  }
});
