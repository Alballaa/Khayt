/**
 * Khayt Cloud client — full encrypted round-trip against a LIVE local HTTP server
 * (an in-test reference server mirroring khayt-cloud's contract). Verifies the
 * whole path: keyset → register → encrypt → push → pull → decrypt, over real
 * fetch, with the server only ever seeing opaque ciphertext.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const cc = require('../lib/cloud-client.js');

const FAST_KDF = { algo: 'scrypt', N: 1024, r: 8, p: 1, keyLen: 32 };
const STORE = { printLog: [{ id: 'o1', price: 100 }], clients: [{ id: 'c1', name: 'Acme' }] };

let server, base, lastStored;

function refServer() {
  const shops = new Map(); // shopId -> token
  const blobs = new Map(); // shopId -> { rev, ciphertext }
  const readBody = (req) => new Promise((res) => {
    let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch { res({}); } });
  });
  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body ? JSON.stringify(body) : ''); };
  const auth = (req, shopId) => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    return m && shops.get(shopId) === m[1];
  };
  return http.createServer(async (req, res) => {
    const path = req.url.replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && path === '/v1/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && path === '/v1/register') {
      const id = 'shop_' + Math.random().toString(36).slice(2);
      const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      shops.set(id, token);
      return send(res, 200, { shopId: id, token });
    }
    const m = /^\/v1\/shops\/([^/]+)\/store$/.exec(path);
    if (m) {
      const shopId = m[1];
      if (!auth(req, shopId)) return send(res, 401, { error: 'bad token' });
      if (req.method === 'GET') {
        const b = blobs.get(shopId);
        return b ? send(res, 200, { ciphertext: b.ciphertext, rev: b.rev }) : send(res, 204);
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        const cur = blobs.get(shopId); const curRev = cur ? cur.rev : 0;
        if ((body.baseRev | 0) !== curRev) return send(res, 409, { rev: curRev });
        const rev = curRev + 1;
        lastStored = body.ciphertext;
        blobs.set(shopId, { rev, ciphertext: body.ciphertext });
        return send(res, 200, { rev });
      }
    }
    return send(res, 404, { error: 'not found' });
  });
}

before(async () => {
  server = refServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server && server.close());

test('health + register reach the live server', async () => {
  assert.equal(await cc.health(base), true);
  const reg = await cc.register(base);
  assert.ok(reg.shopId && reg.token);
});

test('full E2E round-trip: encrypt → push → pull → decrypt equals the store', async () => {
  const { shopId, token } = await cc.register(base);
  const { keyset } = cc.createKeyset('sync-pass', { kdf: FAST_KDF });
  const dek = cc.unlockWithPassphrase('sync-pass', keyset);
  const backend = cc.backendFor(base, shopId, token, dek);

  const pushed = await backend.push(STORE);
  assert.equal(pushed.conflict, false);
  assert.equal(pushed.rev, 1);

  // server stored ONLY opaque ciphertext (no plaintext)
  assert.ok(lastStored && lastStored.ct, 'opaque AEAD blob stored');
  assert.ok(!JSON.stringify(lastStored).includes('Acme'), 'no plaintext on the server');

  const pulled = await backend.pull();
  assert.equal(pulled.rev, 1);
  assert.deepEqual(pulled.store, STORE);
});

test('wrong passphrase cannot decrypt a pulled blob', async () => {
  const { shopId, token } = await cc.register(base);
  const { keyset } = cc.createKeyset('right', { kdf: FAST_KDF });
  const dek = cc.unlockWithPassphrase('right', keyset);
  await cc.backendFor(base, shopId, token, dek).push(STORE);

  const { keyset: k2 } = cc.createKeyset('wrong', { kdf: FAST_KDF });
  const wrongDek = cc.unlockWithPassphrase('wrong', k2);
  await assert.rejects(() => cc.backendFor(base, shopId, token, wrongDek).pull());
});
