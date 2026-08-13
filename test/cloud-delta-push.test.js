/**
 * Entity-level delta push — the protocol, proven against a reference server
 * before any of it is written in PHP.
 *
 * Blob-first sync costs `store size × saves`, so a shop pays for its whole
 * history on every card it drags and the bill grows quadratically with age
 * (docs/KHAYT-CLOUD-COST-PER-SHOP.md §4). Pushing only what changed removes the
 * size term entirely.
 *
 * The reference server here is a test FIXTURE, not shipped code. It models the
 * contract the real server would have to implement:
 *
 *   POST /v1/shops/{id}/deltas   { ciphertext, baseRev }
 *        200 { rev } · 409 { rev } on a stale head · 404 if unsupported
 *   GET  /v1/shops/{id}/store
 *        200 { ciphertext, rev, deltas: [{ rev, ciphertext }] }
 *
 * Writing the fixture first is the point: it is far cheaper to find out here
 * that the shape is wrong than after it exists in two server implementations
 * that a parity test pins together.
 *
 * The most important test in this file is the LAST one. It does not check that
 * the protocol works — it checks that the protocol is dangerous, and is why
 * DELTA_WRITES ships off.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const sc = require('../lib/sync-crypto.js');
const { createCloudBackend, DELTA_WRITES, COMPACT_RATIO, MAX_CHAIN_DELTAS } = require('../lib/cloud-backend.js');

const ENGINE = path.join(__dirname, '..', 'renderer', 'sync.js');
const FAST_KDF = { algo: 'scrypt', N: 1024, r: 8, p: 1, keyLen: 32 };

/** Each simulated device needs its own engine — `lastIndex` is module state. */
function loadEngine() {
  delete require.cache[require.resolve(ENGINE)];
  return require(ENGINE);
}

function freshDek(pass = 'p') {
  const { keyset } = sc.createKeyset(pass, { kdf: FAST_KDF });
  return sc.unlockWithPassphrase(pass, keyset);
}

/**
 * A delta-capable server: one base blob per shop plus an ordered chain of
 * opaque deltas. It never decrypts anything.
 */
function makeDeltaServer({ takesDeltas = true } = {}) {
  const base = new Map();     // shopId -> { rev, ciphertext }
  const chain = new Map();    // shopId -> [{ rev, ciphertext }]
  const bytes = { blob: 0, delta: 0 };
  return {
    bytes,
    async handle({ method, path: p, body }) {
      const d = String(p).match(/^\/v1\/shops\/([^/]+)\/deltas$/);
      if (d) {
        if (!takesDeltas) return { status: 404 };       // a Phase 1 server
        if (method !== 'POST') return { status: 405 };
        const shopId = d[1];
        const head = headRev(shopId);
        if ((body.baseRev | 0) !== head) return { status: 409, body: { rev: head } };
        const rev = head + 1;
        const arr = chain.get(shopId) || [];
        arr.push({ rev, ciphertext: body.ciphertext });
        chain.set(shopId, arr);
        bytes.delta += JSON.stringify(body).length;
        return { status: 200, body: { rev, deltaCount: arr.length } };
      }
      const m = String(p).match(/^\/v1\/shops\/([^/]+)\/store$/);
      if (!m) return { status: 404 };
      const shopId = m[1];
      if (method === 'GET') {
        const b = base.get(shopId);
        if (!b) return { status: 204 };
        return { status: 200, body: { ciphertext: b.ciphertext, rev: headRev(shopId), deltas: chain.get(shopId) || [] } };
      }
      if (method === 'PUT') {
        const head = headRev(shopId);
        if ((body.baseRev | 0) !== head) return { status: 409, body: { rev: head } };
        const rev = head + 1;
        base.set(shopId, { rev, ciphertext: body.ciphertext });
        chain.set(shopId, []);                           // a full push compacts
        bytes.blob += JSON.stringify(body).length;
        return { status: 200, body: { rev } };
      }
      return { status: 405 };
    },
    /** Head = base rev, advanced by every delta appended after it. */
    chainLength(shopId) { return (chain.get(shopId) || []).length; },
  };

  function headRev(shopId) {
    const arr = chain.get(shopId) || [];
    if (arr.length) return arr[arr.length - 1].rev;
    return base.has(shopId) ? base.get(shopId).rev : 0;
  }
}

/** A device: a backend bound to (server, shop, dek) with its own engine. */
function device(server, shopId, dek, { deltaWrites = true, engine = loadEngine() } = {}) {
  const backend = createCloudBackend({
    transport: (req) => server.handle(req),
    crypto: sc,
    shopId,
    getDek: () => dek,
    sync: engine,
    deltaWrites,
  });
  return { backend, engine };
}

/** A store the sync engine has stamped, the way a real save would leave it. */
function stamped(engine, over = {}) {
  const s = { printLog: [], clients: [], inventory: [], tombstones: [], ...over };
  engine.stampChanges(s);
  return s;
}

test('the whole store goes up first — there is nothing to delta against yet', async () => {
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);

  const store = stamped(a.engine, { clients: [{ id: 'c1', name: 'Acme' }] });
  const res = await a.backend.push(store);

  assert.equal(res.conflict, false);
  assert.equal(res.delta, undefined, 'the first push cannot be a delta');
  assert.equal(server.chainLength('shopA'), 0);
});

test('a change after that ships only the change, and it is much smaller', async () => {
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);

  // A store with some history behind it — the case blob-first punishes.
  const store = stamped(a.engine, {
    printLog: Array.from({ length: 400 }, (_, i) => ({ id: 'o' + i, price: 100 + i, notes: 'x'.repeat(60) })),
  });
  await a.backend.push(store);
  const blobBytes = server.bytes.blob;

  // One new order, as a save would produce it.
  store.printLog.push({ id: 'new', price: 999 });
  a.engine.stampChanges(store);
  const res = await a.backend.push(store);

  assert.equal(res.delta, true, 'the second push should be a delta');
  assert.equal(server.chainLength('shopA'), 1);
  assert.ok(
    server.bytes.delta * 10 < blobBytes,
    `a one-record delta (${server.bytes.delta} B) should be far under a whole-store push (${blobBytes} B)`,
  );
});

test('another device folds base + deltas back into the identical store', async () => {
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);
  const b = device(server, 'shopA', dek);

  const store = stamped(a.engine, { clients: [{ id: 'c1', name: 'Acme' }] });
  await a.backend.push(store);

  store.clients.push({ id: 'c2', name: 'Beta Ltd' });
  a.engine.stampChanges(store);
  await a.backend.push(store);

  store.clients.push({ id: 'c3', name: 'Gamma' });
  a.engine.stampChanges(store);
  await a.backend.push(store);

  assert.equal(server.chainLength('shopA'), 2, 'two deltas on top of one base');

  const pulled = await b.backend.pull();
  const names = pulled.store.clients.map((c) => c.name).sort();
  assert.deepEqual(names, ['Acme', 'Beta Ltd', 'Gamma'],
    'a device that never saw the deltas individually still ends up with all three');
});

test('the server holds ciphertext only — a delta leaks nothing but its size', async () => {
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);

  const store = stamped(a.engine, { clients: [{ id: 'c1', name: 'Acme' }] });
  await a.backend.push(store);
  store.clients.push({ id: 'c2', name: 'Beta Ltd' });
  a.engine.stampChanges(store);

  let seen = '';
  const spy = device(
    { handle: async (req) => { seen += JSON.stringify(req.body || {}); return server.handle(req); } },
    'shopA', dek, { engine: a.engine },
  );
  spy.backend._setServerRev(1);
  await spy.backend.push(store);

  assert.ok(!seen.includes('Beta Ltd'), 'no plaintext record content on the wire');
  assert.ok(!seen.includes('clients'), 'not even the collection name');
});

test('a stale head is refused, and the refused edit survives to the next push', async () => {
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);
  const b = device(server, 'shopA', dek);

  const store = stamped(a.engine, { clients: [{ id: 'c1', name: 'Acme' }] });
  await a.backend.push(store);
  await b.backend.pull();                       // b is now current

  store.clients.push({ id: 'c2', name: 'from A' });
  a.engine.stampChanges(store);
  await a.backend.push(store);                  // A moves the head

  const bStore = stamped(b.engine, { clients: [{ id: 'c3', name: 'from B' }] });
  const res = await b.backend.push(bStore);     // B is building on a stale head
  assert.equal(res.conflict, true, 'a delta built on a stale head must be refused');

  // The property that matters is not "a counter did not move" — it is that the
  // refused edit is still queued. Resolve the conflict the way the caller does,
  // and B's client must actually reach the server.
  const fresh = await b.backend.pull();
  b.engine.applyDeltas(fresh.store, { deltas: [{ collection: 'clients', record: bStore.clients[0] }], tombstones: [] }, {});
  const retry = await b.backend.push(fresh.store);
  assert.equal(retry.conflict, false);

  const check = device(server, 'shopA', dek);
  const names = (await check.backend.pull()).store.clients.map((c) => c.name).sort();
  assert.deepEqual(names, ['Acme', 'from A', 'from B'],
    'a refused delta must survive into the next payload, or the edit it carried is lost everywhere');
});

test('a Phase 1 server needs no flag — the client falls back to the blob', async () => {
  const server = makeDeltaServer({ takesDeltas: false });
  const dek = freshDek();
  const a = device(server, 'shopA', dek);

  const store = stamped(a.engine, { clients: [{ id: 'c1', name: 'Acme' }] });
  await a.backend.push(store);
  store.clients.push({ id: 'c2', name: 'Beta Ltd' });
  a.engine.stampChanges(store);

  const res = await a.backend.push(store);
  assert.equal(res.conflict, false);
  assert.equal(res.delta, undefined, 'no delta route means a whole-store push');
  assert.equal(server.bytes.delta, 0, 'nothing was sent to the delta endpoint');

  // And it round-trips, which is the property that actually matters.
  const b = device(server, 'shopA', dek);
  const pulled = await b.backend.pull();
  assert.equal(pulled.store.clients.length, 2);
});

test('a pull with deltas but no engine refuses rather than returning a stale store', async () => {
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);

  const store = stamped(a.engine, { clients: [{ id: 'c1', name: 'Acme' }] });
  await a.backend.push(store);
  store.clients.push({ id: 'c2', name: 'Beta Ltd' });
  a.engine.stampChanges(store);
  await a.backend.push(store);

  // Same server, but a backend with no delta engine wired in.
  const blind = createCloudBackend({
    transport: (req) => server.handle(req),
    crypto: sc, shopId: 'shopA', getDek: () => dek,
  });
  await assert.rejects(() => blind.pull(), /no sync engine/,
    'silently dropping the deltas would hand the caller a store missing its newest edits');
});

test('DELTA_WRITES ships OFF — the reader lands a release before any writer', () => {
  // Not style policing. The next test shows what happens if a blob-only desktop
  // meets a delta store, and that desktop is whatever version the shop has not
  // updated yet. Flip this only once the server can refuse delta pushes for a
  // shop that still has one attached.
  assert.equal(DELTA_WRITES, false);

  const server = makeDeltaServer();
  const a = createCloudBackend({
    transport: (req) => server.handle(req),
    crypto: sc, shopId: 'shopA', getDek: () => freshDek(), sync: loadEngine(),
  });
  assert.equal(a.writesDeltas(), false, 'the default build does not write deltas');
});

test('THE HAZARD: a blob-only desktop silently destroys every delta', async () => {
  // This is the test that justifies the flag above, and it is written to FAIL
  // if the hazard ever stops being real — at which point the flag can go.
  //
  // The old client is not broken and not out of date in any way it can detect.
  // It pulls, gets a 200 with a base blob, ignores the `deltas` field it has
  // never heard of, merges into it, and pushes a well-formed full store with a
  // correct baseRev. Nothing rejects it. The newer edits are simply gone.
  //
  // Compare the compression rollout, which this otherwise resembles: a beta.16
  // client meeting a gzipped blob STOPS, loudly. This one keeps working.
  const server = makeDeltaServer();
  const dek = freshDek();
  const modern = device(server, 'shopA', dek);

  const store = stamped(modern.engine, { clients: [{ id: 'c1', name: 'Acme' }] });
  await modern.backend.push(store);

  store.clients.push({ id: 'c2', name: 'Only in the delta' });
  modern.engine.stampChanges(store);
  await modern.backend.push(store);
  assert.equal(server.chainLength('shopA'), 1);

  // A Phase 1 desktop: no sync engine, so no idea deltas exist.
  const old = createCloudBackend({
    transport: async (req) => {
      const res = await server.handle(req);
      // Model the old client faithfully: it only ever read these two fields.
      if (res.status === 200 && res.body && res.body.deltas) {
        return { status: 200, body: { ciphertext: res.body.ciphertext, rev: res.body.rev } };
      }
      return res;
    },
    crypto: sc, shopId: 'shopA', getDek: () => dek,
  });

  const seenByOld = await old.pull();
  assert.equal(seenByOld.store.clients.length, 1,
    'the old client cannot see the delta — this is the setup, not yet the damage');

  seenByOld.store.clients.push({ id: 'c9', name: 'Added by the old client' });
  const res = await old.push(seenByOld.store);
  assert.equal(res.conflict, false, 'and nothing rejects its push');

  // The damage, from a device that CAN read deltas.
  const check = device(server, 'shopA', dek);
  const after = await check.backend.pull();
  const names = after.store.clients.map((c) => c.name);
  assert.ok(!names.includes('Only in the delta'),
    'if this ever fails, the hazard is gone and DELTA_WRITES can be reconsidered');
  assert.deepEqual(names.sort(), ['Acme', 'Added by the old client'],
    'a committed edit was destroyed by a client doing nothing wrong');
});

// ── compaction ──────────────────────────────────────────────────────────────
//
// A chain has to be reset by a full push, or a cold device pays for the base
// plus every delta ever appended — and every one of them is a decrypt. The two
// bounds are derived in scripts/cloud-cost-model.mjs; these pin the behaviour.

test('a chain past the byte ratio is compacted by a full push', async () => {
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);

  // A real-sized base, so the chain has room to grow before the ratio binds.
  const store = bigStore(a.engine);
  await a.backend.push(store);
  const baseAfterFirst = a.backend.chainState().baseWireBytes;
  assert.ok(baseAfterFirst > 0, 'the base size is recorded');

  // Push deltas until the backend says it is due, then once more.
  let guard = 0;
  while (!a.backend.chainState().dueForCompaction && guard++ < 200) {
    store.clients.push({ id: 'c' + guard, name: 'client ' + guard });
    a.engine.stampChanges(store);
    await a.backend.push(store);
  }
  const due = a.backend.chainState();
  assert.ok(due.dueForCompaction, 'the chain should become due for compaction');
  assert.ok(due.chainWireBytes > COMPACT_RATIO * due.baseWireBytes
    || due.chainCount >= MAX_CHAIN_DELTAS, 'due for the documented reason');

  store.clients.push({ id: 'last', name: 'triggers the compaction' });
  a.engine.stampChanges(store);
  const res = await a.backend.push(store);

  assert.equal(res.delta, undefined, 'the compacting push is a full one, not a delta');
  assert.equal(server.chainLength('shopA'), 0, 'the server chain is reset');
  assert.equal(a.backend.chainState().chainCount, 0);
  assert.equal(a.backend.chainState().chainWireBytes, 0);
});

test('compaction loses nothing — the store still round-trips afterwards', async () => {
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);

  const store = bigStore(a.engine);
  await a.backend.push(store);
  for (let i = 0; i < 60; i++) {
    store.clients.push({ id: 'c' + i, name: 'client ' + i });
    a.engine.stampChanges(store);
    await a.backend.push(store);
  }

  const b = device(server, 'shopA', dek);
  const pulled = await b.backend.pull();
  assert.equal(pulled.store.clients.length, 61,
    'every record survives however the chain was compacted along the way');
});

/** A store big enough that a delta is genuinely cheaper than a fresh base. */
const bigStore = (engine) => stamped(engine, {
  printLog: Array.from({ length: 400 }, (_, i) => ({ id: 'o' + i, price: 100 + i, notes: 'x'.repeat(60) })),
  clients: [{ id: 'c1', name: 'A' }],
});

test('a pull adopts the server chain, not just what this device appended', async () => {
  // Two devices push onto one chain. A backend that counted only its own deltas
  // would think the chain was half as long as it is and compact too late.
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);
  const b = device(server, 'shopA', dek);

  const store = bigStore(a.engine);
  await a.backend.push(store);
  for (const name of ['two', 'three', 'four']) {
    store.clients.push({ id: name, name });
    a.engine.stampChanges(store);
    await a.backend.push(store);
  }
  assert.equal(server.chainLength('shopA'), 3);

  await b.backend.pull();
  assert.equal(b.backend.chainState().chainCount, 3,
    'B sees the whole chain, including deltas it never sent');
  assert.ok(b.backend.chainState().baseWireBytes > 0, 'and the base it was built on');
});

test('a SMALL store compacts almost immediately, so deltas never make it worse', async () => {
  // Both a delta and a whole small store are dominated by the same ~1.1 KB
  // crypto/base64 envelope, so for a tiny shop a delta buys nothing — and the
  // ratio rule notices without being told, because one delta already exceeds
  // COMPACT_RATIO × a tiny base.
  //
  // This is the property that makes the policy safe to enable everywhere rather
  // than only for large shops: the saving scales with store size, and where
  // there is no saving the backend falls back to the blob on its own.
  const server = makeDeltaServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);

  const store = stamped(a.engine, { clients: [{ id: 'c1', name: 'A' }] });
  await a.backend.push(store);
  for (let i = 0; i < 6; i++) {
    store.clients.push({ id: 'c' + i, name: 'client ' + i });
    a.engine.stampChanges(store);
    await a.backend.push(store);
  }

  assert.ok(server.chainLength('shopA') <= 2,
    `a tiny store should keep compacting, not build a chain (got ${server.chainLength('shopA')})`);

  const b = device(server, 'shopA', dek);
  assert.equal((await b.backend.pull()).store.clients.length, 7,
    'and it still round-trips exactly');
});

test('an unknown base size still bounds the chain by count', () => {
  // The ratio cannot be evaluated without a base, and "no opinion" would let a
  // chain run away on exactly the path where that state was lost.
  assert.equal(MAX_CHAIN_DELTAS, 1000);
  assert.equal(COMPACT_RATIO, 2);
});
