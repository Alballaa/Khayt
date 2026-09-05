/**
 * What a read-only device may send to the cloud, and what it must not.
 *
 * `lib/cloud-outbox.js` exists for the native Mac app, which pulls the cloud
 * store, shows the shop the difference, and offers to send the half that is
 * only here. It never merges and it never pushes a whole store, so its rule
 * has to be one-directional in a way the desktop's cursor-based
 * `changesSincePush` is not.
 *
 * The load-bearing test is not "does it produce the right list" — it is
 * `foldsIntoAgreement` at the bottom, which takes the payload this module
 * builds and runs it through the real `KhaytSync.applyDeltas`, the same fold
 * every other device performs on the chain. A payload that looks right and
 * folds wrong is the only kind of bug that matters here.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { changesToSend } = require('../lib/cloud-outbox.js');
const sync = require('../lib/sync.js');

const clone = (o) => JSON.parse(JSON.stringify(o));

test('a record the cloud has never seen is sent', () => {
  const out = changesToSend({ orders: [{ id: 'o1', rev: 1 }] }, { orders: [] });
  assert.deepEqual(out.deltas, [{ collection: 'orders', record: { id: 'o1', rev: 1 } }]);
});

test('a record edited here since the cloud saw it is sent', () => {
  const out = changesToSend({ orders: [{ id: 'o1', rev: 5 }] }, { orders: [{ id: 'o1', rev: 4 }] });
  assert.equal(out.deltas.length, 1);
});

test('a record the cloud holds at the same rev is not sent', () => {
  const out = changesToSend({ orders: [{ id: 'o1', rev: 4 }] }, { orders: [{ id: 'o1', rev: 4 }] });
  assert.deepEqual(out.deltas, []);
});

/**
 * The one that separates this from the desktop's rule. `changesSincePush` ships
 * anything that DISAGREES with its cursor; here, disagreeing in the cloud's
 * favour means this device is behind, and behind is not something you send.
 */
test('a record the cloud holds at a HIGHER rev is left alone, not pushed back', () => {
  const out = changesToSend({ orders: [{ id: 'o1', rev: 2, note: 'stale' }] },
                            { orders: [{ id: 'o1', rev: 9, note: 'newer' }] });
  assert.deepEqual(out.deltas, []);
});

test('a deletion made here is sent as a tombstone', () => {
  const out = changesToSend(
    { orders: [], tombstones: [{ collection: 'orders', id: 'o1', rev: 3, deletedAt: '2026-09-01' }] },
    { orders: [{ id: 'o1', rev: 3 }], tombstones: [] });
  assert.equal(out.tombstones.length, 1);
  assert.equal(out.tombstones[0].id, 'o1');
});

test('a deletion the cloud already knows about is not sent again', () => {
  const t = { collection: 'orders', id: 'o1', rev: 3, deletedAt: '2026-09-01' };
  const out = changesToSend({ orders: [], tombstones: [t] }, { orders: [], tombstones: [t] });
  assert.deepEqual(out.tombstones, []);
});

/**
 * Ids are unique within a collection, not across them. Keying a deletion by id
 * alone let one deleted record stand in for an unrelated one, and the one it
 * stood in for was never sent — the same defect that was in the comparison
 * screen.
 */
test('two deletions with the same id in different collections are both sent', () => {
  const out = changesToSend(
    { tombstones: [{ collection: 'orders', id: 'x', deletedAt: 'a' },
                   { collection: 'spools', id: 'x', deletedAt: 'a' }] },
    { tombstones: [{ collection: 'orders', id: 'x', deletedAt: 'a' }] });
  assert.equal(out.tombstones.length, 1);
  assert.equal(out.tombstones[0].collection, 'spools');
});

test('a record deleted here is not also sent as a record', () => {
  const out = changesToSend(
    { orders: [{ id: 'o1', rev: 3 }], tombstones: [{ collection: 'orders', id: 'o1', rev: 3, deletedAt: 'a' }] },
    { orders: [], tombstones: [] });
  assert.deepEqual(out.deltas, []);
  assert.equal(out.tombstones.length, 1);
});

test('a record another device deleted is not resurrected', () => {
  const out = changesToSend(
    { orders: [{ id: 'o1', rev: 3 }] },
    { orders: [], tombstones: [{ collection: 'orders', id: 'o1', rev: 3, deletedAt: 'a' }] });
  assert.deepEqual(out.deltas, []);
});

test('a record with no id is skipped rather than sent without one', () => {
  const out = changesToSend({ orders: [{ rev: 1 }, null, 'nonsense'] }, { orders: [] });
  assert.deepEqual(out.deltas, []);
});

test('tombstones is not itself a collection to diff', () => {
  const out = changesToSend({ tombstones: [] }, { tombstones: [] });
  assert.deepEqual(out.deltas, []);
});

/**
 * Settings are one object, not revisioned records, so the delta shape has
 * nowhere to put them. Reporting that is the whole obligation — the screen has
 * to be able to say "open Khayt to send those" rather than drop them silently.
 */
test('a settings change is reported, not sent', () => {
  const out = changesToSend({ settings: { currency: 'SAR' } }, { settings: { currency: 'USD' } });
  assert.deepEqual(out.deltas, []);
  assert.equal(out.settingsDiffer, true);
});

test('settings that match in a different key order do not count as a change', () => {
  const out = changesToSend({ settings: { a: 1, b: 2 } }, { settings: { b: 2, a: 1 } });
  assert.equal(out.settingsDiffer, false);
});

/**
 * THE ONE THAT WAS WRONG ON A REAL SHOP'S SCREEN.
 *
 * The desktop writes `settings.cloud.lastServerRev` AFTER a successful push, so
 * the blob that went up carries the previous value and the local copy is one
 * ahead of it — permanently, for every shop that has ever synced. Compared
 * raw, "your settings differ" was true for ever, and the sheet said so under a
 * heading reporting that the two held the same records.
 */
test("the sync's own bookkeeping is not a settings change", () => {
  const out = changesToSend(
    { settings: { currency: 'SAR', cloud: { lastServerRev: 16, token: 'a' } } },
    { settings: { currency: 'SAR', cloud: { lastServerRev: 15, token: 'a' } } });
  assert.equal(out.settingsDiffer, false);
});

test('a setting the shop actually changed still counts', () => {
  const out = changesToSend(
    { settings: { currency: 'SAR', cloud: { lastServerRev: 16 } } },
    { settings: { currency: 'USD', cloud: { lastServerRev: 16 } } });
  assert.equal(out.settingsDiffer, true);
});

test('a settings change beside identical cloud bookkeeping is still seen', () => {
  const out = changesToSend(
    { settings: { vatRate: 15, cloud: { lastServerRev: 3 } } },
    { settings: { vatRate: 5, cloud: { lastServerRev: 99 } } });
  assert.equal(out.settingsDiffer, true, 'a real change was hidden by the exclusion');
});

/**
 * The real proof. Build the payload, fold it into the cloud's store with the
 * shipped merge engine, and require that the two sides now agree everywhere the
 * payload was allowed to touch — and that the record the cloud held at a higher
 * rev came through the fold unharmed.
 */
test('the payload folds the cloud into agreement without losing its newer record', () => {
  const local = {
    orders: [
      { id: 'new-here', rev: 1, title: 'made on the Mac' },
      { id: 'edited-here', rev: 7, title: 'edited on the Mac' },
      { id: 'newer-there', rev: 2, title: 'the stale copy' },
    ],
    spools: [{ id: 's1', rev: 4, grams: 900 }],
    tombstones: [{ collection: 'spools', id: 'gone', rev: 2, deletedAt: '2026-09-02' }],
  };
  const server = {
    orders: [
      { id: 'edited-here', rev: 6, title: 'the older copy' },
      { id: 'newer-there', rev: 9, title: 'edited elsewhere' },
    ],
    spools: [{ id: 's1', rev: 4, grams: 900 }, { id: 'gone', rev: 2 }],
    tombstones: [],
  };

  const payload = changesToSend(local, server);
  const folded = clone(server);
  const report = sync.applyDeltas(folded, clone(payload), { appendOnly: [] });

  const byId = (store, coll, id) => (store[coll] || []).find((r) => r.id === id);

  assert.equal(byId(folded, 'orders', 'new-here').title, 'made on the Mac');
  assert.equal(byId(folded, 'orders', 'edited-here').title, 'edited on the Mac');
  // Never sent, so never touched — this is the direction that destroys data.
  assert.equal(byId(folded, 'orders', 'newer-there').title, 'edited elsewhere');
  assert.equal(byId(folded, 'spools', 'gone'), undefined);
  assert.equal(report.applied, 2);
  assert.equal(report.removed, 1);

  // And a second run has nothing left to say: the cloud now holds what we hold.
  const again = changesToSend(local, folded);
  assert.deepEqual(again.deltas, []);
  assert.deepEqual(again.tombstones, []);
});
