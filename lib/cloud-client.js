'use strict';

/**
 * Khayt Cloud client (main-process). Composes the tested lib/sync-crypto (E2E
 * encryption) + lib/cloud-backend (blob-first sync protocol) over a real HTTPS
 * transport, so main.js can expose register / push / pull / health to the
 * renderer via IPC. Node-only (uses Node crypto + fetch) — never loaded in the
 * renderer.
 *
 * The store is encrypted/decrypted HERE with a Data Encryption Key the caller
 * holds (derived from the sync passphrase via sync-crypto). The server only ever
 * sees opaque ciphertext.
 */
const sc = require('./sync-crypto');
const { createCloudBackend } = require('./cloud-backend');

/** Build a fetch-based transport for {baseUrl, token} matching cloud-backend's contract. */
function httpTransport(baseUrl, token) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return async ({ method, path, body }) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    let data = null;
    try { data = await res.json(); } catch { /* 204 / non-JSON */ }
    return { status: res.status, body: data };
  };
}

/** GET /v1/health → boolean. */
async function health(baseUrl) {
  try {
    const r = await httpTransport(baseUrl, null)({ method: 'GET', path: '/v1/health' });
    return r.status === 200 && !!(r.body && r.body.ok);
  } catch { return false; }
}

/** POST /v1/register → { shopId, token }. Throws with a useful message on failure. */
async function register(baseUrl, registerSecret) {
  const r = await httpTransport(baseUrl, null)({
    method: 'POST', path: '/v1/register', body: registerSecret ? { registerSecret } : {},
  });
  if (r.status !== 200 || !r.body || !r.body.shopId) {
    const detail = r.body && r.body.error ? `: ${r.body.error}` : '';
    throw new Error(`register failed (HTTP ${r.status})${detail}`);
  }
  return { shopId: r.body.shopId, token: r.body.token };
}

/** POST /v1/signup → { accountId, shopId, token }. Creates an account + its shop. */
async function signup(baseUrl, { email, password, registerSecret } = {}) {
  const body = { email, password };
  if (registerSecret) body.registerSecret = registerSecret;
  const r = await httpTransport(baseUrl, null)({ method: 'POST', path: '/v1/signup', body });
  if (r.status !== 200 || !r.body || !r.body.shopId) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(detail);
  }
  return { accountId: r.body.accountId, shopId: r.body.shopId, token: r.body.token };
}

/** POST /v1/login → { shopId, token, keyset|null }. Returns null on 401 (bad creds). */
async function login(baseUrl, { email, password } = {}) {
  const r = await httpTransport(baseUrl, null)({ method: 'POST', path: '/v1/login', body: { email, password } });
  if (r.status === 401) return null;
  if (r.status !== 200 || !r.body || !r.body.shopId) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(detail);
  }
  return { shopId: r.body.shopId, token: r.body.token, keyset: r.body.keyset || null };
}

/** PUT the (encrypted) keyset for a shop. */
async function putKeyset(baseUrl, shopId, token, keyset) {
  const r = await httpTransport(baseUrl, token)({
    method: 'PUT', path: `/v1/shops/${shopId}/keyset`, body: { keyset },
  });
  if (r.status !== 200) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`save keyset failed: ${detail}`);
  }
  return { ok: true };
}

/** GET the (encrypted) keyset for a shop → keyset | null (204). */
async function getKeyset(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${shopId}/keyset` });
  if (r.status === 204) return null;
  if (r.status !== 200 || !r.body) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`get keyset failed: ${detail}`);
  }
  return r.body.keyset || null;
}

/** A cloud-backend bound to {baseUrl, shopId, token, dek}. */
function backendFor(baseUrl, shopId, token, dek) {
  return createCloudBackend({
    transport: httpTransport(baseUrl, token),
    crypto: sc,
    shopId,
    getDek: () => dek,
  });
}

module.exports = {
  httpTransport,
  health,
  register,
  signup,
  login,
  putKeyset,
  getKeyset,
  backendFor,
  // re-exported crypto helpers (keyset creation + unlock) for the IPC layer
  createKeyset: sc.createKeyset,
  unlockWithPassphrase: sc.unlockWithPassphrase,
  unlockWithRecovery: sc.unlockWithRecovery,
  changePassphrase: sc.changePassphrase,
};
