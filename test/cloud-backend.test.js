/**
 * Phase 1 slice 2 — CloudBackend + blob-first sync protocol.
 * See docs/KHAYT-3.0-PHASE1-SPEC.md §5/§11.
 *
 * The reference server is an in-memory test FIXTURE (not shipped — the offline
 * app stays backend-free). It models the §4 store API: GET returns the blob +
 * rev (204 if none); PUT applies an optimistic rev compare-and-set, returning
 * 409 on a stale baseRev. Tenant isolation is structural: a backend for shop X
 * only ever addresses /v1/shops/X/store.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sc = require('../lib/sync-crypto.js');
const { createCloudBackend } = require('../lib/cloud-backend.js');

const FAST_KDF = { algo: 'scrypt', N: 1024, r: 8, p: 1, keyLen: 32 };
const STORE = { printLog: [{ id: 'o1', price: 100 }], clients: [{ id: 'c1', name: 'Acme' }] };

function makeRefServer() {
  const blobs = new Map(); // shopId -> { rev, ciphertext }
  return {
    async handle({ method, path, body }) {
      const m = String(path).match(/^\/v1\/shops\/([^/]+)\/store$/);
      if (!m) return { status: 404 };
      const shopId = m[1];
      if (method === 'GET') {
        const cur = blobs.get(shopId);
        return cur ? { status: 200, body: { ciphertext: cur.ciphertext, rev: cur.rev } } : { status: 204 };
      }
      if (method === 'PUT') {
        const curRev = blobs.has(shopId) ? blobs.get(shopId).rev : 0;
        if ((body.baseRev | 0) !== curRev) return { status: 409, body: { rev: curRev } };
        const rev = curRev + 1;
        blobs.set(shopId, { rev, ciphertext: body.ciphertext });
        return { status: 200, body: { rev } };
      }
      return { status: 405 };
    },
    raw(shopId) { return blobs.get(shopId); },
  };
}

// A device = a CloudBackend bound to (server, shopId, dek).
function device(server, shopId, dek) {
  return createCloudBackend({
    transport: (req) => server.handle(req),
    crypto: sc,
    shopId,
    getDek: () => dek,
  });
}

function freshDek(pass = 'p') {
  const { keyset } = sc.createKeyset(pass, { kdf: FAST_KDF });
  return sc.unlockWithPassphrase(pass, keyset);
}

test('round-trip: push on one device, pull + decrypt on another (same shop/DEK)', async () => {
  const server = makeRefServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);
  const b = device(server, 'shopA', dek);

  const res = await a.push(STORE);
  assert.equal(res.conflict, false);
  assert.equal(res.rev, 1);

  const pulled = await b.pull();
  assert.equal(pulled.rev, 1);
  assert.deepEqual(pulled.store, STORE);
});

test('server stores ciphertext only — no plaintext shop data at rest', async () => {
  const server = makeRefServer();
  const a = device(server, 'shopA', freshDek());
  await a.push(STORE);
  const stored = JSON.stringify(server.raw('shopA'));
  assert.ok(!stored.includes('printLog'), 'no plaintext collection name');
  assert.ok(!stored.includes('Acme'), 'no plaintext client name');
  assert.ok(server.raw('shopA').ciphertext.ct, 'only an opaque AEAD blob is stored');
});

test('stale push → 409 → pull → re-push succeeds (single-writer safety net)', async () => {
  const server = makeRefServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);
  const b = device(server, 'shopA', dek);

  await a.push(STORE);                       // server rev = 1
  const stale = await b.push({ ...STORE, clients: [] }); // b still thinks baseRev 0
  assert.equal(stale.conflict, true);
  assert.equal(stale.serverRev, 1);

  await b.pull();                            // b learns rev 1 (+ merges in real app)
  const retry = await b.push({ ...STORE, extra: true });
  assert.equal(retry.conflict, false);
  assert.equal(retry.rev, 2);
});

test('tenant isolation: a backend for shop B never sees shop A data', async () => {
  const server = makeRefServer();
  await device(server, 'shopA', freshDek()).push(STORE);

  // shop B has its own (different) DEK and only addresses /shops/shopB/store
  const b = device(server, 'shopB', freshDek('other'));
  const pulled = await b.pull();
  assert.equal(pulled.store, null, 'shop B sees no store (204), never shop A\'s blob');
  assert.equal(server.raw('shopB'), undefined);
});

test('wrong DEK cannot decrypt a pulled blob (E2E holds across the protocol)', async () => {
  const server = makeRefServer();
  await device(server, 'shopA', freshDek('right')).push(STORE);
  const wrong = device(server, 'shopA', freshDek('different')); // valid shop, wrong key
  await assert.rejects(() => wrong.pull(), /unable to authenticate|bad decrypt|tag/i);
});

test('SyncBackend interface: pushDeltas/pullDeltas/status integrate', async () => {
  const server = makeRefServer();
  const dek = freshDek();
  const a = device(server, 'shopA', dek);
  assert.equal(a.name, 'cloud');
  assert.equal(a.status(), 'idle');
  const r = await a.pushDeltas(STORE);
  assert.equal(r.conflict, false);
  const p = await a.pullDeltas();
  assert.deepEqual(p.store, STORE);
  assert.equal(a.status(), 'idle');
});
