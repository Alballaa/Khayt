'use strict';
/**
 * Scoped API tokens for the local HTTP API (`/v1`). Implements §1 auth of
 * docs/KHAYT-3.0-PUBLIC-API-SPEC.md.
 *
 * Security posture (mirrors the PIN/webhook-secret handling already in lan-server.js):
 *  - The plaintext token is shown to the owner exactly ONCE at mint time and never stored.
 *  - Only a SHA-256 hash is persisted, so a leaked store/backup cannot be replayed.
 *  - Verification is constant-time over the hash to avoid a timing oracle.
 *  - A token grants ONLY its scopes; a read token on a write is 403, never silently allowed.
 */
const crypto = require('crypto');

// Every capability a token can be granted. Deliberately coarse: one scope per
// collection per direction, so a connector asks for the minimum it needs.
const SCOPES = [
  'orders:read', 'orders:write',
  'clients:read', 'clients:write',
  'inventory:read', 'inventory:write',
  'machines:read',
];

const TOKEN_PREFIX = 'khayt_';

function isValidScope(s) { return SCOPES.includes(s); }

/** SHA-256 hex of a presented token. The only form we ever persist. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

/**
 * Mint a token. Returns { token, record } — `token` is the ONLY time the plaintext
 * exists; `record` is what gets persisted (no plaintext).
 */
function generateToken({ label, scopes, nowIso } = {}) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const token = TOKEN_PREFIX + raw;
  const clean = (Array.isArray(scopes) ? scopes : []).filter(isValidScope);
  return {
    token,
    record: {
      id: 'tok_' + crypto.randomBytes(8).toString('hex'),
      label: String(label || '').slice(0, 60),
      hash: hashToken(token),
      scopes: clean,
      createdAt: nowIso || new Date().toISOString(),
      lastUsedAt: null,
    },
  };
}

/** Extract a bearer token from an Authorization header, or null. */
function bearerFromHeader(authHeader) {
  const h = String(authHeader || '').trim();
  if (!/^bearer\s+/i.test(h)) return null;
  const tok = h.replace(/^bearer\s+/i, '').trim();
  return tok.startsWith(TOKEN_PREFIX) ? tok : null;
}

/**
 * Find the token record matching a presented plaintext token. Constant-time compare
 * against each stored hash; returns null for unknown/revoked tokens.
 */
function verifyToken(presented, tokens) {
  if (!presented || !String(presented).startsWith(TOKEN_PREFIX)) return null;
  const want = Buffer.from(hashToken(presented), 'utf8');
  for (const rec of (Array.isArray(tokens) ? tokens : [])) {
    if (!rec || typeof rec.hash !== 'string' || rec.hash.length !== want.length) continue;
    const got = Buffer.from(rec.hash, 'utf8');
    let equal = false;
    try { equal = crypto.timingSafeEqual(got, want); } catch (_) { equal = false; }
    if (equal) return rec;
  }
  return null;
}

/** Does this token record carry the required scope? */
function hasScope(record, scope) {
  return !!(record && Array.isArray(record.scopes) && record.scopes.includes(scope));
}

/**
 * The scope a request requires: collection derived from the path, direction from the
 * method. Returns null for routes that need no scope (public status).
 */
function requiredScope(pathname, method) {
  const p = String(pathname || '');
  const write = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(String(method || '').toUpperCase());
  const seg = (p.split('/').filter(Boolean)[1] || '').toLowerCase(); // /v1/<seg>/...
  const map = {
    orders: 'orders', queue: 'orders',
    clients: 'clients',
    inventory: 'inventory',
    machines: 'machines',
    'waiting-list': 'clients',
  };
  const coll = map[seg];
  if (!coll) return null;
  if (coll === 'machines') return 'machines:read'; // no machine writes over the API
  return `${coll}:${write ? 'write' : 'read'}`;
}

/** Owner-facing view — never exposes the hash. */
function redactTokens(tokens) {
  return (Array.isArray(tokens) ? tokens : []).map(t => ({
    id: t.id, label: t.label, scopes: Array.isArray(t.scopes) ? t.scopes.slice() : [],
    createdAt: t.createdAt || null, lastUsedAt: t.lastUsedAt || null,
  }));
}

module.exports = {
  SCOPES, TOKEN_PREFIX,
  isValidScope, hashToken, generateToken, bearerFromHeader,
  verifyToken, hasScope, requiredScope, redactTokens,
};
