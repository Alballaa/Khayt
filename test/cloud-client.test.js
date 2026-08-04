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
  const tokens = new Map();   // shopId -> Set(token)  (supports multi-device)
  const blobs = new Map();    // shopId -> { rev, ciphertext }
  const accounts = new Map(); // email -> { shopId, password }
  const keysets = new Map();  // shopId -> keyset
  const rand = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const addToken = (shopId, token) => { (tokens.get(shopId) || tokens.set(shopId, new Set()).get(shopId)).add(token); };
  const readBody = (req) => new Promise((res) => {
    let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch { res({}); } });
  });
  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body ? JSON.stringify(body) : ''); };
  const auth = (req, shopId) => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    return m && tokens.get(shopId)?.has(m[1]);
  };
  return http.createServer(async (req, res) => {
    const path = req.url.replace(/\/+$/, '') || '/';
    if (req.method === 'GET' && path === '/v1/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && path === '/v1/register') {
      const id = 'shop_' + rand(); const token = rand();
      addToken(id, token);
      return send(res, 200, { shopId: id, token });
    }
    if (req.method === 'POST' && path === '/v1/signup') {
      const body = await readBody(req);
      const email = String(body.email || '').toLowerCase();
      if (accounts.has(email)) return send(res, 409, { error: 'Email already registered' });
      const shopId = 'shop_' + rand(); const token = rand();
      addToken(shopId, token);
      accounts.set(email, { shopId, password: body.password });
      return send(res, 200, { accountId: 'acct_' + rand(), shopId, token });
    }
    if (req.method === 'POST' && path === '/v1/login') {
      const body = await readBody(req);
      const a = accounts.get(String(body.email || '').toLowerCase());
      if (!a || a.password !== body.password) return send(res, 401, { error: 'Wrong email or password' });
      const token = rand(); addToken(a.shopId, token);
      return send(res, 200, { shopId: a.shopId, token, keyset: keysets.get(a.shopId) || null });
    }
    const ks = /^\/v1\/shops\/([^/]+)\/keyset$/.exec(path);
    if (ks) {
      const shopId = ks[1];
      if (!auth(req, shopId)) return send(res, 401, { error: 'bad token' });
      if (req.method === 'GET') {
        return keysets.has(shopId) ? send(res, 200, { keyset: keysets.get(shopId) }) : send(res, 204);
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        keysets.set(shopId, body.keyset);
        return send(res, 200, { ok: true });
      }
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

/* ---- Why the server could not be reached -------------------------------
 * "Server not reachable" covered a network that swallows the request, an
 * address that answers but is not a Khayt server, and a string that is not a
 * URL. Those need three different fixes, and a user told only the first one
 * cannot act. A real support thread — login sat on "Connecting…" and then said
 * nothing useful — is what these are for.
 * ---------------------------------------------------------------------- */

test('a healthy server reports ok, and health() stays a boolean', async () => {
  assert.deepEqual(await cc.healthDetail(base), { ok: true, reason: 'ok' });
  assert.equal(await cc.health(base), true, 'the boolean contract is unchanged');
});

test('a server that answers but is not Khayt is named as such, not "unreachable"', async () => {
  const http = require('node:http');
  const wrong = http.createServer((_q, res) => { res.writeHead(500); res.end('nope'); });
  await new Promise((r) => wrong.listen(0, r));
  try {
    const d = await cc.healthDetail(`http://localhost:${wrong.address().port}`);
    assert.equal(d.ok, false);
    assert.equal(d.reason, 'http', 'it answered — that is not the same as unreachable');
    assert.equal(d.status, 500, 'and the status is carried so the user can act on it');
    assert.equal(await cc.health(`http://localhost:${wrong.address().port}`), false);
  } finally { wrong.close(); }
});

test('a network that swallows the request reports a timeout, with its budget', async () => {
  // Accepts the connection and never answers — the shape a firewall or proxy
  // produces, and the one that used to hang the UI for thirty seconds.
  const http = require('node:http');
  const blackhole = http.createServer(() => { /* deliberately no response */ });
  await new Promise((r) => blackhole.listen(0, r));
  try {
    const started = Date.now();
    const d = await cc.healthDetail(`http://localhost:${blackhole.address().port}`, { timeoutMs: 300 });
    const elapsed = Date.now() - started;
    assert.equal(d.ok, false);
    assert.equal(d.reason, 'timeout', 'a silent server is a timeout, not "unreachable"');
    assert.equal(d.timeoutMs, 300, 'and reports the budget it waited, so the UI can say how long');
    // Reporting the budget is not the same as honouring it. Without this the
    // option could be ignored entirely and the test would still pass — thirty
    // seconds later, which is the bug this whole change is about.
    assert.ok(elapsed < 3000, `waited ${elapsed}ms for a 300ms budget — the timeout is not being applied`);
  } finally { blackhole.close(); }
});

test('the default health budget is far below the general one', async () => {
  // The bug was a 30s general timeout applied to a one-line GET.
  assert.ok(cc.HEALTH_TIMEOUT_MS <= 10000,
    `a health probe waiting ${cc.HEALTH_TIMEOUT_MS}ms reads as a frozen app`);
});

test('a string that is not a URL is a bad address, not a dead server', async () => {
  for (const bad of ['not a url', '', 'ftp://example.com']) {
    const d = await cc.healthDetail(bad);
    assert.equal(d.ok, false, JSON.stringify(bad));
    assert.equal(d.reason, 'bad-url', JSON.stringify(bad));
    assert.ok(d.detail, 'and carries something worth showing the user');
  }
});

test('http:// to a public host is refused before any password is sent', async () => {
  // The existing guard, now reachable through healthDetail's bad-url branch.
  const d = await cc.healthDetail('http://cloud.example.com');
  assert.equal(d.reason, 'bad-url');
  assert.match(d.detail, /https/i);
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

test('accounts: signup → device 2 logs in, fetches keyset, and decrypts the same store', async () => {
  const email = `dev${Date.now()}@khaytapp.com`;
  const password = 'account-pass-1234';
  const passphrase = 'sync-secret';

  // Device 1: sign up, create + upload the encrypted keyset, push the store.
  const su = await cc.signup(base, { email, password });
  assert.ok(su.shopId && su.token, 'signup returns shop + token');
  const { keyset } = cc.createKeyset(passphrase, { kdf: FAST_KDF });
  await cc.putKeyset(base, su.shopId, su.token, keyset);
  const dek1 = cc.unlockWithPassphrase(passphrase, keyset);
  await cc.backendFor(base, su.shopId, su.token, dek1).push(STORE);

  // Wrong account password → no login.
  assert.equal(await cc.login(base, { email, password: 'nope' }), null);

  // Device 2: log in → same shop, fresh token, encrypted keyset returned.
  const lr = await cc.login(base, { email, password });
  assert.equal(lr.shopId, su.shopId, 'same shop across devices');
  assert.notEqual(lr.token, su.token, 'fresh device token');
  assert.ok(lr.keyset, 'keyset delivered to device 2');

  // Device 2 unlocks with the passphrase and decrypts device 1's store.
  const dek2 = cc.unlockWithPassphrase(passphrase, lr.keyset);
  const pulled = await cc.backendFor(base, lr.shopId, lr.token, dek2).pull();
  assert.deepEqual(pulled.store, STORE, 'device 2 sees the same decrypted data');
});

/* ── URL path-segment injection guard ──────────────────────────────────────
   Every id/token/shopId is interpolated into a REST path. A value carrying a
   "/" or ".." — from a synced record or a crafted call — must not create extra
   path segments and reach a different endpoint. seg()/encodeURIComponent pins
   each into its own segment. */

test('injected separators are percent-encoded on the wire, not real slashes', async () => {
  const rawSeen = [];
  const echo = http.createServer((req, res) => {
    rawSeen.push(req.url);   // raw, still-encoded request target
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true,"items":[],"messages":[]}');
  });
  await new Promise((r) => echo.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${echo.address().port}`;
  const EVIL = 'a/b/../../c';   // three separators + traversal

  try {
    await cc.deleteIntake(url, 'SHOP', 'tok', EVIL).catch(() => {});
    const p = rawSeen.find((x) => x.includes('/intake/'));
    assert.ok(p, 'intake request reached the server');
    const tail = p.split('/intake/')[1];              // whatever landed in the id segment
    assert.ok(!tail.includes('/'), `id must be one segment, got: ${tail}`);
    assert.ok(tail.includes('%2F') || tail.includes('%2f'), 'slashes were percent-encoded');
  } finally {
    await new Promise((r) => echo.close(r));
  }
});

