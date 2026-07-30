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

/**
 * Encode one URL path segment. Every id/token/shopId below is interpolated into
 * a REST path; without this an opaque value carrying "/", "..", "?" or "#" —
 * from a synced/imported record or a crafted renderer call — could alter which
 * endpoint the request hits. encodeURIComponent is a no-op for the alphanumeric
 * ids these normally are, and neutralises the rest. (email and the billing query
 * param were already encoded; this makes the whole surface consistent.)
 */
function seg(v) { return encodeURIComponent(String(v == null ? '' : v)); }

/**
 * Validate a cloud server URL before anything is sent to it.
 *
 * The base URL is a user setting (self-hosting is supported) that arrives from
 * the renderer unchecked and is concatenated straight into fetch — and the very
 * first thing sent to it is an email and password. The printer path in this
 * codebase is carefully guarded; this one was not guarded at all.
 *
 * Plain http is allowed ONLY for loopback and RFC1918, where a shop running its
 * own server on the bench is a real case. Over the public internet it would put
 * shop credentials on the wire in clear text, so https is required there.
 *
 * Returns the normalised origin+path, or throws with a reason worth showing.
 */
function validateCloudBaseUrl(raw) {
  let u;
  try { u = new URL(String(raw || '')); }
  catch { throw new Error('Not a valid server address'); }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('Server address must start with https://');
  }
  // Credentials in the URL would be sent to, and logged by, the far end.
  if (u.username || u.password) throw new Error('Server address must not contain a username or password');

  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback = h === 'localhost' || h === '::1' || /^127\./.test(h);
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  const [a, b] = v4 ? [Number(v4[1]), Number(v4[2])] : [];
  const isPrivate = !!v4 && (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
  // Link-local covers the cloud metadata endpoint — never a Khayt server.
  if (v4 && a === 169 && b === 254) throw new Error('That address is not a Khayt server');

  if (u.protocol === 'http:' && !isLoopback && !isPrivate) {
    throw new Error('Use https:// — a plain http address would send your password unencrypted');
  }
  return (u.origin + u.pathname).replace(/\/+$/, '');
}

/** Build a fetch-based transport for {baseUrl, token} matching cloud-backend's contract. */
function httpTransport(baseUrl, token) {
  const base = validateCloudBaseUrl(baseUrl);
  return async ({ method, path, body }) => {
    const res = await fetch(base + path, {
      method,
      // Never let a login POST be bounced to another host — the same rule the
      // printer poller already applies.
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (res.status >= 300 && res.status < 400) throw new Error('Server redirected the request — refusing to follow');
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
  return { shopId: r.body.shopId, token: r.body.token, keyset: r.body.keyset || null, role: r.body.role || 'owner' };
}

/** POST /v1/accept-invite → { shopId, token, role, keyset|null }. Joins a team via invite code. */
async function acceptInvite(baseUrl, { email, password, code } = {}) {
  const r = await httpTransport(baseUrl, null)({ method: 'POST', path: '/v1/accept-invite', body: { email, password, code } });
  if (r.status !== 200 || !r.body || !r.body.shopId) {
    throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  }
  return { accountId: r.body.accountId, shopId: r.body.shopId, token: r.body.token, role: r.body.role || 'operator', keyset: r.body.keyset || null };
}

/** Invite a team member by email + role. */
async function inviteMember(baseUrl, shopId, token, email, role) {
  const r = await httpTransport(baseUrl, token)({ method: 'POST', path: `/v1/shops/${seg(shopId)}/members/invite`, body: { email, role } });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return { ok: true, emailConfigured: !!(r.body && r.body.emailConfigured) };
}

/** List shop members (email, role, verified). */
async function listMembers(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/members` });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return (r.body && r.body.members) || [];
}

/** Remove a member by email (owner can't be removed). */
async function removeMember(baseUrl, shopId, token, email) {
  const r = await httpTransport(baseUrl, token)({ method: 'DELETE', path: `/v1/shops/${seg(shopId)}/members/${encodeURIComponent(email)}` });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return { ok: true };
}

/** Publish (or replace) the public storefront catalog. payload=null unpublishes. */
async function putCatalog(baseUrl, shopId, token, payload) {
  const r = await httpTransport(baseUrl, token)({ method: 'PUT', path: `/v1/shops/${seg(shopId)}/catalog`, body: { catalog: payload } });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return { ok: true, published: !!(r.body && r.body.published) };
}

/** GET the public storefront catalog → { catalog, updatedAt } | null (404). */
async function getCatalog(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/catalog` });
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return { catalog: (r.body && r.body.catalog) || null, updatedAt: r.body && r.body.updatedAt };
}

/** GET the public review summary → { count, avg, recent } | null. */
async function getReviewSummary(baseUrl, shopId) {
  const r = await httpTransport(baseUrl, null)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/reviews` });
  if (r.status !== 200) return null;
  return r.body || null;
}

/** POST /v1/request-reset → { ok, emailConfigured }. Always resolves (no leak). */
async function requestReset(baseUrl, { email } = {}) {
  const r = await httpTransport(baseUrl, null)({ method: 'POST', path: '/v1/request-reset', body: { email } });
  if (r.status !== 200) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(detail);
  }
  return { ok: true, emailConfigured: !!(r.body && r.body.emailConfigured) };
}

/** POST /v1/reset-password → { ok } | throws with the server message (e.g. bad code). */
async function resetPassword(baseUrl, { email, code, newPassword } = {}) {
  const r = await httpTransport(baseUrl, null)({ method: 'POST', path: '/v1/reset-password', body: { email, code, newPassword } });
  if (r.status !== 200) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(detail);
  }
  return { ok: true };
}

/** POST /v1/request-verify → { ok, alreadyVerified, emailConfigured }. */
async function requestVerify(baseUrl, { email } = {}) {
  const r = await httpTransport(baseUrl, null)({ method: 'POST', path: '/v1/request-verify', body: { email } });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return { ok: true, alreadyVerified: !!(r.body && r.body.alreadyVerified), emailConfigured: !!(r.body && r.body.emailConfigured) };
}

/** POST /v1/verify-email → { ok, verified } | throws (bad/expired code). */
async function verifyEmail(baseUrl, { email, code } = {}) {
  const r = await httpTransport(baseUrl, null)({ method: 'POST', path: '/v1/verify-email', body: { email, code } });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return { ok: true, verified: true };
}

/** PUT the (encrypted) keyset for a shop. */
async function putKeyset(baseUrl, shopId, token, keyset) {
  const r = await httpTransport(baseUrl, token)({
    method: 'PUT', path: `/v1/shops/${seg(shopId)}/keyset`, body: { keyset },
  });
  if (r.status !== 200) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`save keyset failed: ${detail}`);
  }
  return { ok: true };
}

/** GET the (encrypted) keyset for a shop → keyset | null (204). */
async function getKeyset(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/keyset` });
  if (r.status === 204) return null;
  if (r.status !== 200 || !r.body) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`get keyset failed: ${detail}`);
  }
  return r.body.keyset || null;
}

/* ── Organisations (multi-shop) ───────────────────────────────────────────────
 *
 * See docs/KHAYT-3.0-ORG-DATA-KEY.md. Every call authenticates AS A SHOP, using
 * that shop's own token, and reaches the org from there — so no token for another
 * shop ever leaves this device. What travels is the org key already wrapped by
 * the org passphrase and an org recovery key; the server cannot open it.
 */

/** The org this shop belongs to → { orgId, keyset } | null (204). */
async function getOrg(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/org` });
  if (r.status === 204) return null;
  if (r.status !== 200 || !r.body) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`get organisation failed: ${detail}`);
  }
  return { orgId: r.body.orgId, keyset: r.body.keyset || null };
}

/** Create the org, or re-wrap its key after an org passphrase change. */
async function putOrg(baseUrl, shopId, token, orgId, keyset) {
  const r = await httpTransport(baseUrl, token)({
    method: 'PUT', path: `/v1/shops/${seg(shopId)}/org`, body: { orgId, keyset },
  });
  if (r.status !== 200) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`save organisation failed: ${detail}`);
  }
  return { ok: true, orgId: r.body && r.body.orgId };
}

/** Leave the org. Membership only — this shop's own keyset and store are untouched. */
async function leaveOrgRemote(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'DELETE', path: `/v1/shops/${seg(shopId)}/org` });
  if (r.status !== 200) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`leave organisation failed: ${detail}`);
  }
  return { ok: true };
}

/** Mint a join code for another branch → { code, expiresInSeconds }. */
async function createOrgInvite(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'POST', path: `/v1/shops/${seg(shopId)}/org/invite`, body: {} });
  if (r.status !== 200 || !r.body) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`create join code failed: ${detail}`);
  }
  return { code: r.body.code, expiresInSeconds: r.body.expiresInSeconds };
}

/** Redeem a join code → { orgId, keyset }. This shop authenticates as itself. */
async function joinOrgRemote(baseUrl, shopId, token, code) {
  const r = await httpTransport(baseUrl, token)({
    method: 'POST', path: `/v1/shops/${seg(shopId)}/org/join`, body: { code },
  });
  if (r.status !== 200 || !r.body) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`join organisation failed: ${detail}`);
  }
  return { orgId: r.body.orgId, keyset: r.body.keyset || null };
}

/** Every member branch's wrapped keyset → [{ shopId, keyset }]. Owner only.
 *  Opaque without the org passphrase, which never reaches the server. */
async function getOrgKeysets(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/org/keysets` });
  if (r.status !== 200 || !r.body) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`read branch keys failed: ${detail}`);
  }
  return Array.isArray(r.body.keysets) ? r.body.keysets : [];
}

/**
 * One branch's encrypted store → { rev, ciphertext } | null (204).
 *
 * Reached as THIS shop, not as the branch: a token is bound to one shop, so the
 * ordinary /v1/shops/{branch}/store returns 401 for a sibling. The server checks
 * the branch is in the same org and hands back ciphertext this device then opens
 * with the org key.
 */
async function getBranchStore(baseUrl, shopId, token, branchId) {
  const r = await httpTransport(baseUrl, token)({
    method: 'GET', path: `/v1/shops/${seg(shopId)}/org/branches/${seg(branchId)}/store`,
  });
  if (r.status === 204) return null;
  if (r.status !== 200 || !r.body) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`read branch failed: ${detail}`);
  }
  return { rev: r.body.rev, ciphertext: r.body.ciphertext };
}

/** The branches in this shop's org, by shop id. Names live in each branch's own
 *  encrypted store, which the server cannot read. */
async function listOrgMembers(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/org/members` });
  if (r.status !== 200 || !r.body) {
    const detail = r.body && r.body.error ? r.body.error : `HTTP ${r.status}`;
    throw new Error(`list branches failed: ${detail}`);
  }
  return Array.isArray(r.body.members) ? r.body.members : [];
}

/** Publish an owner-curated (plaintext) portal item under a public token.
 *  customerEmail (optional) links the item to a customer's portal account. */
async function publishPortal(baseUrl, shopId, token, pubToken, kind, payload, customerEmail) {
  const body = { kind, payload };
  if (customerEmail) body.customerEmail = customerEmail;
  const r = await httpTransport(baseUrl, token)({
    method: 'PUT', path: `/v1/shops/${seg(shopId)}/published/${seg(pubToken)}`, body,
  });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return { ok: true };
}

/** Remove a published portal item. */
async function unpublishPortal(baseUrl, shopId, token, pubToken) {
  const r = await httpTransport(baseUrl, token)({ method: 'DELETE', path: `/v1/shops/${seg(shopId)}/published/${seg(pubToken)}` });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return { ok: true };
}

/** List this shop's published items (+ any customer actions). */
async function listPublished(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/published` });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return (r.body && r.body.items) || [];
}

/** List inbound customer order requests for this shop. */
async function listIntake(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/intake` });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return (r.body && r.body.items) || [];
}

/** Delete an inbound request (after importing it). */
async function deleteIntake(baseUrl, shopId, token, id) {
  const r = await httpTransport(baseUrl, token)({ method: 'DELETE', path: `/v1/shops/${seg(shopId)}/intake/${seg(id)}` });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return { ok: true };
}

/** GET a portal message thread (token = the order's tracking token). Public. */
async function portalMessages(baseUrl, token) {
  const r = await httpTransport(baseUrl)({ method: 'GET', path: `/v1/p/${seg(token)}/messages` });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return (r.body && r.body.messages) || [];
}

/** Owner reply to a portal thread (authenticated). */
async function portalReply(baseUrl, shopId, token, authToken, text) {
  const r = await httpTransport(baseUrl, authToken)({ method: 'POST', path: `/v1/shops/${seg(shopId)}/published/${seg(token)}/message`, body: { text } });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return r.body || {};
}

/** GET storefront analytics (views/carts/orders + top items) for this shop. */
async function storefrontStats(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/shops/${seg(shopId)}/sfstats` });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return r.body || { views: 0, carts: 0, orders: 0, items: [] };
}

/** GET /v1/billing/me → the shop's plan + limits (or { billingEnabled:false }). */
async function billingMe(baseUrl, shopId, token) {
  const r = await httpTransport(baseUrl, token)({ method: 'GET', path: `/v1/billing/me?shopId=${encodeURIComponent(shopId)}` });
  if (r.status !== 200) throw new Error((r.body && r.body.error) || `HTTP ${r.status}`);
  return r.body || {};
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
  validateCloudBaseUrl,
  httpTransport,
  health,
  register,
  signup,
  login,
  acceptInvite,
  inviteMember,
  listMembers,
  removeMember,
  putCatalog,
  getCatalog,
  getReviewSummary,
  requestReset,
  resetPassword,
  requestVerify,
  verifyEmail,
  publishPortal,
  unpublishPortal,
  listPublished,
  listIntake,
  deleteIntake,
  storefrontStats,
  portalMessages,
  portalReply,
  billingMe,
  putKeyset,
  getKeyset,
  backendFor,
  // re-exported crypto helpers (keyset creation + unlock) for the IPC layer
  createKeyset: sc.createKeyset,
  unlockWithPassphrase: sc.unlockWithPassphrase,
  unlockWithRecovery: sc.unlockWithRecovery,
  changePassphrase: sc.changePassphrase,
  decryptStore: sc.decryptStore,
  // organisations — HTTP
  getOrg,
  putOrg,
  leaveOrgRemote,
  createOrgInvite,
  joinOrgRemote,
  listOrgMembers,
  getOrgKeysets,
  getBranchStore,
  // organisations — crypto (docs/KHAYT-3.0-ORG-DATA-KEY.md)
  createOrgKeyset: sc.createOrgKeyset,
  unlockOrgWithPassphrase: sc.unlockOrgWithPassphrase,
  unlockOrgWithRecovery: sc.unlockOrgWithRecovery,
  changeOrgPassphrase: sc.changeOrgPassphrase,
  joinOrg: sc.joinOrg,
  leaveOrg: sc.leaveOrg,
  unlockWithOrg: sc.unlockWithOrg,
};
