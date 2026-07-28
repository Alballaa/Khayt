/**
 * Phase 3, step zero: does the delta engine we already have actually round-trip
 * a two-way merge?
 *
 * KHAYT-3.0-PHASE3-DESIGN.md says the first move is NOT code — it is proving the
 * desktop can already do this, by pointing two local stores at each other
 * through the existing engine with no server and no crypto. If it holds, the
 * recommended option (b) is small plumbing. If it does not, Phase 0 has a gap,
 * and that is much cheaper to learn now than after the server work.
 *
 * This is that proof. No server, no ciphertext, no network.
 *
 * The property being tested is CONVERGENCE, not correctness-of-winner: `rev` is
 * a per-record counter, not a causal clock, so when two branches edit the same
 * record one edit is always lost. What multi-shop actually requires is that both
 * branches lose the SAME one and end up byte-identical — otherwise two branches
 * quietly disagree forever, which is the failure nobody notices.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ENGINE = path.join(__dirname, '..', 'renderer', 'sync.js');

/**
 * A fresh engine instance with its OWN `lastIndex`.
 *
 * `lastIndex` is module-level state, so two devices sharing one instance would
 * share one memory of "what did I last see" — which is not two devices. Dropping
 * the require cache gives each simulated device a genuinely separate engine, the
 * way two physical machines have separate ones.
 */
function loadEngine() {
  delete require.cache[require.resolve(ENGINE)];
  return require(ENGINE);
}

const snap = (over = {}) => ({ printLog: [], clients: [], inventory: [], tombstones: [], ...over });

/** Canonical form for comparing two stores: order must not matter, reserved fields must. */
function canonical(s) {
  const out = {};
  for (const coll of ['printLog', 'clients', 'inventory']) {
    out[coll] = [...(s[coll] || [])]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((r) => JSON.stringify(r));
  }
  return JSON.stringify(out);
}

/** One full bidirectional exchange: A→B, then B→A. Returns both apply results. */
function exchange(devA, devB) {
  const fromA = devA.engine.extractDeltas(devA.store, { rev: 0, ts: '' });
  const fromB = devB.engine.extractDeltas(devB.store, { rev: 0, ts: '' });
  // Extract both BEFORE applying either, or the second extract sees the first's
  // writes and the two branches were never really concurrent.
  const intoB = devB.engine.applyDeltas(devB.store, fromA);
  const intoA = devA.engine.applyDeltas(devA.store, fromB);
  return { intoA, intoB };
}

function device(seed) {
  const engine = loadEngine();
  const store = snap(seed);
  engine.stampChanges(store);
  return { engine, store };
}

test('two branches creating different records converge to the same store', () => {
  const a = device({ clients: [{ id: 'c-a', name: 'Riyadh client' }] });
  const b = device({ clients: [{ id: 'c-b', name: 'Jeddah client' }] });

  exchange(a, b);

  assert.equal(canonical(a.store), canonical(b.store), 'branches must hold identical stores');
  assert.equal(a.store.clients.length, 2, 'and both records, not one');
});

test('concurrent edits to the SAME record converge — both branches lose the same edit', () => {
  // Both start from an identical base at rev 1, then edit independently. This is
  // the case option (b) hits the moment two branches share a client list.
  const base = { id: 'c1', name: 'Acme', phone: '' };
  const a = device({ clients: [{ ...base }] });
  const b = device({ clients: [{ ...base }] });

  a.store.clients[0].phone = '+966500000001';
  b.store.clients[0].phone = '+966500000002';
  a.engine.stampChanges(a.store);
  b.engine.stampChanges(b.store);
  assert.equal(a.store.clients[0].rev, b.store.clients[0].rev, 'same rev — a genuine tie');

  const { intoA, intoB } = exchange(a, b);

  assert.equal(canonical(a.store), canonical(b.store),
    'CONVERGENCE: a tie must resolve the same way on both branches, or they diverge forever');
  assert.ok(intoA.conflicts.length + intoB.conflicts.length > 0,
    'and the losing edit must be reported, not dropped in silence');
});

test('a delete on one branch beats a concurrent edit on the other — and says so', () => {
  const a = device({ clients: [{ id: 'c1', name: 'Acme' }] });
  const b = device({ clients: [{ id: 'c1', name: 'Acme' }] });

  a.store.clients = [];                       // deleted on A
  b.store.clients[0].name = 'Acme Industrial'; // edited on B
  a.engine.stampChanges(a.store);
  b.engine.stampChanges(b.store);

  exchange(a, b);

  assert.equal(a.store.clients.length, 0, 'delete wins on A');
  assert.equal(b.store.clients.length, 0, 'and propagates to B, or the branches diverge');
  assert.equal(canonical(a.store), canonical(b.store));
});

test('syncing twice changes nothing — the merge reaches a fixed point', () => {
  // If a second exchange keeps producing work, devices ping-pong forever.
  const a = device({ clients: [{ id: 'c-a', name: 'A' }], printLog: [{ id: 'o-a', status: 'pending' }] });
  const b = device({ clients: [{ id: 'c-b', name: 'B' }] });

  exchange(a, b);
  const afterFirst = canonical(a.store);

  exchange(a, b);
  assert.equal(canonical(a.store), afterFirst, 'a second exchange must be a no-op');
  assert.equal(canonical(a.store), canonical(b.store));
});

test('MULTI-SHOP HAZARD: one device holding two shops cross-deletes between them', () => {
  // This is the Phase 3 shape, not a contrived one. Option (b) in the design doc
  // is "a device that belongs to several shops pulls all of them and merges
  // locally" — one process, several stores.
  //
  // `stampChanges` decides a record was DELETED when it is in `lastIndex` but
  // absent from the snapshot in front of it. `lastIndex` is one map for the whole
  // engine instance. So stamping shop B right after shop A makes every one of
  // shop A's records look deleted, and writes tombstones for them into B.
  const engine = loadEngine();

  const shopA = snap({ clients: [{ id: 'c-riyadh', name: 'Riyadh client' }] });
  const shopB = snap({ clients: [{ id: 'c-jeddah', name: 'Jeddah client' }] });

  engine.stampChanges(shopA);
  const summary = engine.stampChanges(shopB); // same device, second shop

  const bogus = shopB.tombstones.filter((t) => t.id === 'c-riyadh');
  assert.equal(bogus.length, 1,
    'documents the hazard: shop A\'s record is tombstoned into shop B\'s store');
  assert.deepEqual(summary.deleted, [{ collection: 'clients', id: 'c-riyadh' }],
    'and stampChanges reports it as a deletion that never happened');

  // Why it matters: that tombstone is now a real delete-instruction. Tombstones
  // win unconditionally by design, so once it syncs it removes a live record
  // from the shop it came from.
  const shopACopy = snap({ clients: [{ id: 'c-riyadh', name: 'Riyadh client', rev: 1 }] });
  engine.applyDeltas(shopACopy, { deltas: [], tombstones: bogus });
  assert.equal(shopACopy.clients.length, 0,
    'the phantom tombstone deletes a record that was never deleted');
});

test('the hazard is an isolation problem, not a logic one: per-shop engines are clean', () => {
  // The same two shops, each with its own engine instance, produce no phantom
  // deletes. So Phase 3 does not need the merge logic changed — it needs
  // per-shop index isolation, which is a much smaller thing to build.
  const engineA = loadEngine();
  const engineB = loadEngine();

  const shopA = snap({ clients: [{ id: 'c-riyadh', name: 'Riyadh client' }] });
  const shopB = snap({ clients: [{ id: 'c-jeddah', name: 'Jeddah client' }] });

  engineA.stampChanges(shopA);
  const summary = engineB.stampChanges(shopB);

  assert.deepEqual(shopB.tombstones, [], 'no phantom tombstones');
  assert.deepEqual(summary.deleted, [], 'and nothing reported as deleted');
});
