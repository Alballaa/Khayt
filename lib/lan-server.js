'use strict';

const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  renderLanQuoteApprovalPage,
  applyQuoteApprovalToStore,
  isQuoteExpired,
  ensureQuoteApprovalToken,
  verifyOrderAccessToken,
  verifyQuoteApprovalToken,
} = require('./lan-quote-page');
const { prepareStatusHtmlForServe } = require('./status-html');

function lanEscapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function safeTokenEqual(a, b) {
  if (!a || !b) return false;
  try {
    const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

// ── Webhook replay guard ─────────────────────────────────────────────────────
// Salla/Zid sign each delivery (HMAC) but do not reliably send a timestamp or
// event-id header we can window on, so we keep a small bounded in-memory LRU of
// recently-seen signatures and drop exact duplicates. This stops naive replay
// of a captured valid delivery without breaking a legitimate single delivery.
// The cache is per-process (cleared on restart) and capped in size.
const SEEN_WEBHOOK_SIG_MAX = 500;
const SEEN_WEBHOOK_TTL_MS = 10 * 60_000;
const _seenWebhookSigs = new Map(); // signature -> expiry epoch ms

function isReplayedWebhook(signature, now = Date.now()) {
  const sig = String(signature || '');
  if (!sig) return false; // unsigned requests are rejected upstream by HMAC check
  // Evict expired entries (constant TTL ⇒ insertion order == expiry order).
  for (const [k, exp] of _seenWebhookSigs) {
    if (exp <= now) _seenWebhookSigs.delete(k);
  }
  if (_seenWebhookSigs.has(sig)) return true;
  _seenWebhookSigs.set(sig, now + SEEN_WEBHOOK_TTL_MS);
  while (_seenWebhookSigs.size > SEEN_WEBHOOK_SIG_MAX) {
    _seenWebhookSigs.delete(_seenWebhookSigs.keys().next().value);
  }
  return false;
}

// ── Global brute-force backstop (tunnel mode) ────────────────────────────────
// The per-IP lockout keys off X-Forwarded-For, which a remote attacker behind
// the tunnel can spoof to dodge the per-IP counter. This module-level throttle
// is a coarse second line of defence: once too many auth attempts fail globally
// within the window, ALL auth attempts are blocked for a cooldown. It only
// engages while the tunnel is active (LAN-only deployments keep the per-IP
// behaviour untouched).
const GLOBAL_THROTTLE_LIMIT = 50;            // failed attempts before the gate trips
const GLOBAL_THROTTLE_WINDOW_MS = 60_000;    // rolling window for counting failures
const GLOBAL_THROTTLE_COOLDOWN_MS = 60_000;  // how long all attempts stay blocked
const _globalAuthThrottle = { count: 0, windowStart: 0, blockedUntil: 0 };

/**
 * Pure helper for the global failed-attempt backstop. Mutates and reads `state`
 * (a `{ count, windowStart, blockedUntil }` object) so it is trivially testable.
 *
 * @param {object} state    persistent throttle state
 * @param {number} now      current epoch ms
 * @param {boolean} failed  whether this attempt was a failed auth
 * @param {object} [opts]   { limit, windowMs, cooldownMs }
 * @returns {boolean} true when the request should be blocked (gate is tripped)
 */
function globalAuthThrottle(state, now, failed, opts = {}) {
  const limit = opts.limit ?? GLOBAL_THROTTLE_LIMIT;
  const windowMs = opts.windowMs ?? GLOBAL_THROTTLE_WINDOW_MS;
  const cooldownMs = opts.cooldownMs ?? GLOBAL_THROTTLE_COOLDOWN_MS;
  // Still inside an active cooldown → block regardless of this attempt.
  if (now < state.blockedUntil) return true;
  if (!failed) return false;
  // Reset the rolling window if it has elapsed.
  if (now - state.windowStart > windowMs) {
    state.windowStart = now;
    state.count = 0;
  }
  state.count += 1;
  if (state.count >= limit) {
    state.blockedUntil = now + cooldownMs;
    state.count = 0;
    state.windowStart = now;
    return true;
  }
  return false;
}

/**
 * Returns a human-readable warning when tunnel mode is on and the PIN is too
 * weak to expose to the public internet, or null when it is acceptable. Does
 * not block — callers surface this as advice only.
 */
function weakTunnelPinWarning(pin, tunnelActive) {
  if (!tunnelActive) return null;
  const p = String(pin || '');
  if (p.length < 6 || (/^\d+$/.test(p) && p.length < 8)) {
    return 'LAN PIN is weak for remote tunnel exposure — use at least 8 characters mixing letters and digits.';
  }
  return null;
}

/**
 * Resolve the effective client IP for rate-limiting / lockouts.
 * Behind the localtunnel every request arrives from a loopback socket, which
 * would collapse all remote users into a single bucket — so when the tunnel is
 * active we trust the tunnel hop's X-Forwarded-For first entry instead.
 */
function tunnelClientIp(directIp, xffHeader, tunnelActive) {
  const direct = String(directIp || '');
  if (tunnelActive && /^(::1|::ffff:127\.|127\.)/.test(direct)) {
    const xff = String(xffHeader || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return direct;
}

/** JSON-encode a value for safe embedding inside an inline <script> block. */
function scriptSafeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function uniqueLanId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
}

const LAN_SPOOL_FIELDS = new Set([
  'material', 'brand', 'color', 'colour', 'cost', 'weight', 'weightTotal', 'weightRemaining',
  'vendor', 'notes', 'materialType', 'lot', 'filament', 'purchasedAt', 'reorderPoint', 'colourVariant',
]);

/** @param {Record<string, unknown>} raw */
function pickLanSpoolFields(raw) {
  const spool = {};
  for (const key of LAN_SPOOL_FIELDS) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') spool[key] = v.trim().slice(0, 500);
    else if (typeof v === 'number' && Number.isFinite(v)) spool[key] = v;
  }
  return spool;
}

/** @param {unknown} v */
function sanitizeLanHttpUrl(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, 500);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

function setLanHtmlSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'",
  );
}

/** Prefer Wi‑Fi/LAN IPv4 (192.168.x) over VPN 10.x when showing URLs to users. */
function pickLanIPv4(ifaces) {
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces || {})) {
    for (const a of addrs || []) {
      const fam = a.family;
      if (fam !== 'IPv4' && fam !== 4) continue;
      if (a.internal) continue;
      const ip = a.address;
      const p = ip.split('.').map(Number);
      if (p.length !== 4 || p.some(n => Number.isNaN(n))) continue;
      let score = 0;
      if (/^en\d/i.test(name)) score += 20;
      if (/^(wlan|wifi|eth|enp|wlp)/i.test(name)) score += 15;
      if (p[0] === 192 && p[1] === 168) score += 40;
      else if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) score += 30;
      else if (p[0] === 10) score += 12;
      else score += 5;
      candidates.push({ ip, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.ip || '127.0.0.1';
}

function parseRequestCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return [part.trim(), ''];
    return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
  }).filter(([k]) => k));
}

function normalizePrinterEvent(body) {
  if (typeof body.topic === 'string') {
    const t = body.topic.toLowerCase();
    if (t.includes('done') || t.includes('finished') || t.includes('complete')) return 'print_done';
    if (t.includes('started') || t.includes('start')) return 'print_started';
    if (t.includes('cancel') || t.includes('fail') || t.includes('error')) return 'print_cancelled';
  }
  if (typeof body.event === 'string') {
    const e = body.event.toLowerCase();
    if (e.includes('done') || e.includes('complete') || e.includes('finish')) return 'print_done';
    if (e.includes('start')) return 'print_started';
    if (e.includes('cancel') || e.includes('fail') || e.includes('error')) return 'print_cancelled';
    return body.event;
  }
  if (typeof body.state === 'string') {
    const s = body.state.toLowerCase();
    if (s === 'complete' || s === 'completed' || s === 'standby') return 'print_done';
    if (s === 'printing') return 'print_started';
    if (s === 'cancelled' || s === 'error') return 'print_cancelled';
  }
  return null;
}

function registerLanServer(deps) {
  const {
    fs,
    ipcMain,
    BrowserWindow,
    safeJsonParse,
    syncLanServerStoreFromDisk,
    resolveStoreSecret,
    isStoreSecretMasked,
    migrateLanApiSecrets,
    ensureLanIntakeToken,
    ensureLanIntakePin,
    ensureLanCalendarToken,
    writeStoreToDisk,
    persistLanStoreUpdate,
    getLanServerStore,
    setLanServerStore,
    getMainWindow,
    statusPagesDir,
    appRoot,
    getPrinterStatusCache,
  } = deps;
  const printerCache = typeof getPrinterStatusCache === 'function' ? getPrinterStatusCache : () => ({});
  const STORE = getLanServerStore;

// ── LAN Tunnel (localtunnel) ─────────────────────────────────────────────────
let _tunnelInstance = null;

ipcMain.handle('hub:start-tunnel', async (_e, arg) => {
  const opts = (arg && typeof arg === 'object') ? arg : { port: arg };
  const { port, acknowledgedRisk } = opts;
  if (!acknowledgedRisk) {
    return { ok: false, error: 'Tunnel risk acknowledgement required' };
  }
  syncLanServerStoreFromDisk();
  const lanPin = resolveStoreSecret(STORE()?.settings?.lanApi?.pin, d => d?.settings?.lanApi?.pin);
  if (!lanPin) return { ok: false, error: 'Configure a LAN PIN before enabling remote tunnel' };
  if (_tunnelInstance) {
    try { _tunnelInstance.close(); } catch {}
    _tunnelInstance = null;
  }
  syncLanServerStoreFromDisk();
  const ownerPin = STORE()?.settings?.lanApi?.pin || '';
  if (!ownerPin || isStoreSecretMasked(ownerPin)) {
    return { ok: false, error: 'Set an owner LAN PIN before enabling the remote tunnel' };
  }
  if (!lanServer) {
    return { ok: false, error: 'Start the LAN server before enabling the tunnel' };
  }
  // REFUSE to start the tunnel when the PIN is too weak for public internet
  // exposure. (LAN-only mode never reaches here and keeps its existing
  // behaviour — weak PINs are tolerated on a trusted local network.)
  const pinWarning = weakTunnelPinWarning(lanPin, true);
  if (pinWarning) return { ok: false, error: pinWarning };
  const portNum = parseInt(port, 10) || (lanServer?.address?.()?.port) || 3219;
  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({ port: portNum });
    _tunnelInstance = tunnel;
    tunnel.on('error', (err) => {
      _tunnelInstance = null;
      if (getMainWindow() && !getMainWindow().isDestroyed())
        getMainWindow().webContents.send('tunnel-status-changed', { active: false, error: String(err) });
    });
    tunnel.on('close', () => {
      _tunnelInstance = null;
      if (getMainWindow() && !getMainWindow().isDestroyed())
        getMainWindow().webContents.send('tunnel-status-changed', { active: false });
    });
    return { ok: true, url: tunnel.url };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('hub:stop-tunnel', async () => {
  if (_tunnelInstance) {
    try { _tunnelInstance.close(); } catch {}
    _tunnelInstance = null;
  }
  return { ok: true };
});

ipcMain.handle('hub:get-tunnel-url', async () => {
  if (!_tunnelInstance) return { ok: false };
  return { ok: true, url: _tunnelInstance.url };
});

// ── Feature R12-7: Embedded LAN REST API ────────────────────────────────────
let lanServer = null;

ipcMain.handle('hub:start-lan-server', async (_e, { port = 3219, pin = '', bindLan = 'loopback' } = {}) => {
  const portNum = parseInt(port, 10);
  if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
    return { ok: false, error: 'Invalid port number (must be 1024–65535)' };
  }
  port = portNum;
  syncLanServerStoreFromDisk();
  if (!STORE() || !Object.keys(STORE()).length) setLanServerStore({});
  migrateLanApiSecrets(STORE());
  const storedPin = STORE()?.settings?.lanApi?.pin || '';
  if (!pin || isStoreSecretMasked(pin)) pin = storedPin;
  pin = String(pin || '').slice(0, 256); // cap PIN length to prevent DoS via giant string comparisons
  let intakeTokenGenerated = false;
  let intakePinGenerated = false;
  let calendarTokenGenerated = false;
  let intakePinValue = '';
  let intakeTokenValue = '';
  let calendarTokenValue = '';
  try {
    const tokResult = ensureLanIntakeToken(STORE());
    if (tokResult.generated) intakeTokenGenerated = true;
    intakeTokenValue = tokResult.token;
    const pinResult = ensureLanIntakePin(STORE());
    if (pinResult.generated) intakePinGenerated = true;
    intakePinValue = pinResult.pin; // plaintext — returned to renderer for display
    const calResult = ensureLanCalendarToken(STORE());
    if (calResult.generated) calendarTokenGenerated = true;
    calendarTokenValue = calResult.token;
    if (intakeTokenGenerated || intakePinGenerated || calendarTokenGenerated) await writeStoreToDisk(STORE());
  } catch (e) {
    console.error('ensureLanIntakeToken/ensureLanIntakePin failed:', e);
  }
  const bindHost = (bindLan === 'lan' || bindLan === 'all') ? '0.0.0.0' : '127.0.0.1';
  if (lanServer) {
    if (_tunnelInstance) {
      try { _tunnelInstance.close(); } catch {}
      _tunnelInstance = null;
    }
    lanServer.close();
    lanServer = null;
  }
  // Brute-force tracking: { ip -> { count, resetAt } }
  const failedAttempts = new Map();
  const intakePinAttempts = new Map();
  const intakeSubmitAttempts = new Map();
  const intakeSessionGrantAttempts = new Map();
  const surveyAttempts = new Map();
  const SURVEY_SUBMIT_LIMIT = 30;
  const INTAKE_SUBMIT_LIMIT = 20;
  const INTAKE_SESSION_GRANT_LIMIT = 40;
  const INTAKE_SUBMIT_WINDOW_MS = 60 * 60 * 1000;
  const intakeSessions = new Map();
  const INTAKE_COOKIE = 'khayt_intake';
  const INTAKE_SESSION_MS = 4 * 60 * 60 * 1000;
  const LOCKOUT_MS = 60_000;     // 1-minute lockout after 10 failures
  const MAX_BODY   = 1_048_576; // 1 MB body limit
  const parseLanJsonBody = (body, fallback = {}) => {
    const raw = String(body || '').trim();
    if (!raw) return fallback;
    return safeJsonParse(raw);
  };
  const quoteExpiredHtml = () => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote Expired</title></head><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Quote expired</h2><p>This quote is no longer valid. Please contact the shop for an updated quote.</p></body></html>`;
  return new Promise(resolve => {
    try {
      lanServer = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const ip = tunnelClientIp(req.socket.remoteAddress, req.headers['x-forwarded-for'], !!_tunnelInstance);
        const isWriteRequest = req.method !== 'GET' && req.method !== 'HEAD';
        const rawPathname = url.pathname.replace(/\/$/, '');
        // `/v1` is the documented, versioned public surface (KHAYT-3.0-PUBLIC-API-SPEC §1).
        // It maps onto exactly the same handlers as the long-standing `/api` routes, which
        // remain a permanent alias for the iOS companion and the PWA/kiosk callers.
        const isV1 = rawPathname === '/v1' || rawPathname.startsWith('/v1/');
        const pathname = isV1 ? ('/api' + rawPathname.slice(3)) : rawPathname;

        // Routes that are always public regardless of PIN configuration.
        // NOTE: /order/:id/approve POST is public (quote → pending only).
        // Legacy POST /order/:id with {action:"approve"} is also public for compatibility.
        const isIntakePublicGet = pathname === '/intake' && req.method === 'GET';
        const isIntakeSessionPost = pathname === '/api/intake/session' && req.method === 'POST';
        const isIntakeSubmitPost = pathname === '/api/intake' && req.method === 'POST';
        const isQuoteApprovePost = req.method === 'POST' && /^\/order\/[^/]+\/approve$/.test(pathname);
        const isLegacyQuoteApprovePost = req.method === 'POST' && /^\/order\/[^/]+$/.test(pathname);
        const isQuotePageGet = req.method === 'GET' && /^\/order\/[^/]+\/quote$/.test(pathname);
        const isAlwaysPublic = pathname === '/api/status' ||
          (pathname.startsWith('/order/') && req.method === 'GET') ||
          isQuoteApprovePost || isLegacyQuoteApprovePost || isQuotePageGet ||
          pathname === '/manifest.json' || pathname === '/sw.js' ||
          pathname === '/icon-192.png' || pathname === '/icon-512.png' ||
          pathname.startsWith('/api/webhook/printer/') ||
          pathname === '/api/webhook/salla' ||
          pathname === '/api/webhook/zid' ||
          pathname === '/api/webhook/smsa' ||
          pathname === '/api/webhook/aramex' ||
          pathname === '/api/webhook/spl';
        const isSurveyEndpoint = pathname === '/api/survey' && req.method === 'POST';

        // ── Scoped API tokens (automation) ────────────────────────────────
        // Additive to the PIN: humans and the iOS app keep using x-khayt-pin; automation
        // sends `Authorization: Bearer khayt_…`. A token grants ONLY its scopes — a
        // read-scoped token on a write is 403, never silently allowed. Tokens are stored
        // hashed, so verification is a constant-time hash compare.
        let apiTokenRec = null;
        // A token only stands in for the owner PIN on routes that are part of the scope
        // model AND whose scope it holds. On an unscoped route (a page, the kiosk shell)
        // it must NOT widen access — the PIN still applies. Without this, a token scoped
        // to e.g. machines:read could fetch any PIN-gated page.
        let apiTokenScoped = false;
        // Reuse the existing per-IP brute-force bucket for bad bearer tokens (10/min → 429),
        // keyed separately so it can't be confused with PIN failures.
        const apiTokKey = ip + ':apitok';
        const isApiTokenLocked = () => {
          const d = failedAttempts.get(apiTokKey) || { count: 0, resetAt: 0 };
          return Date.now() < d.resetAt && d.count >= 10;
        };
        const recordApiTokenFailure = () => {
          const now = Date.now();
          const d = failedAttempts.get(apiTokKey) || { count: 0, resetAt: 0 };
          const count = (now >= d.resetAt ? 0 : d.count) + 1;
          failedAttempts.set(apiTokKey, { count, resetAt: count >= 10 ? now + LOCKOUT_MS : d.resetAt });
        };
        if (!isAlwaysPublic) {
          let ApiTokens = null;
          try { ApiTokens = require('./api-tokens.js'); } catch (_) { ApiTokens = null; }
          const bearer = ApiTokens ? ApiTokens.bearerFromHeader(req.headers['authorization']) : null;
          if (bearer) {
            if (isApiTokenLocked()) {
              res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
              return;
            }
            const tokens = (STORE().settings && STORE().settings.lanApi && STORE().settings.lanApi.apiTokens) || [];
            apiTokenRec = ApiTokens.verifyToken(bearer, tokens);
            if (!apiTokenRec) {
              recordApiTokenFailure();
              res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'invalid_token' }));
              return;
            }
            const need = ApiTokens.requiredScope(isV1 ? rawPathname : pathname.replace('/api', '/v1'), req.method);
            apiTokenScoped = !!(need && ApiTokens.hasScope(apiTokenRec, need));
            if (need && !ApiTokens.hasScope(apiTokenRec, need)) {
              res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'insufficient_scope', required: need }));
              return;
            }
            // NOTE: lastUsedAt is intentionally not stamped here — persisting it would mean
            // a store write on every API request. Left for a future batched/throttled update.
          }
        }

        const requirePin = isWriteRequest && !isSurveyEndpoint && !isAlwaysPublic && !isIntakeSessionPost && !isIntakeSubmitPost;
        if (!apiTokenScoped && !isAlwaysPublic && !isIntakePublicGet && !isIntakeSessionPost && !isIntakeSubmitPost && (requirePin || (pin && !isSurveyEndpoint))) {
          const provided = (url.searchParams.get('pin') || req.headers['x-khayt-pin'] || '').trim();
          if (!pin) {
            // No PIN configured — block all write requests (survey is exempt via isSurveyEndpoint)
            if (isWriteRequest) {
              res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Write requests require a PIN to be configured in settings' }));
              return;
            }
          } else {
            // Brute-force lockout check
            const now = Date.now();
            const tunnelActive = !!_tunnelInstance;
            // Global backstop (tunnel mode only): if the gate is already tripped,
            // block every auth attempt regardless of (spoofable) per-IP bucket.
            if (tunnelActive && globalAuthThrottle(_globalAuthThrottle, now, false)) {
              res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
              return;
            }
            const ipData = failedAttempts.get(ip) || { count: 0, resetAt: 0 };
            if (now < ipData.resetAt && ipData.count >= 10) {
              res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
              return;
            }
            if (!safeTokenEqual(provided, pin)) {
              const newCount = (now >= ipData.resetAt ? 0 : ipData.count) + 1;
              failedAttempts.set(ip, { count: newCount, resetAt: newCount >= 10 ? now + LOCKOUT_MS : ipData.resetAt });
              // Feed the global backstop too; trips the cooldown after enough failures.
              if (tunnelActive && globalAuthThrottle(_globalAuthThrottle, now, true)) {
                res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
                return;
              }
              res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Unauthorized' }));
              return;
            }
            failedAttempts.delete(ip); // reset on success
          }
        }
        const store = STORE();
        // H4: restrict CORS — sensitive API routes get no wildcard, and the
        // reflected origin is limited to loopback / LAN hosts (the only legit
        // browser callers, e.g. the intake portal). A non-LAN http:// origin is
        // no longer echoed back. Non-browser clients (Electron IPC, iOS native,
        // curl) send no Origin and don't need CORS.
        const reqOrigin = req.headers['origin'] || null;
        const corsOriginAllowed = (origin) => {
          let host;
          try { host = new URL(origin).hostname; } catch { return false; }
          if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return true;
          return /^10\./.test(host) || /^192\.168\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host);
        };
        const isPublicRoute = isAlwaysPublic;
        if (isPublicRoute) {
          res.setHeader('Access-Control-Allow-Origin', '*');
        } else if (reqOrigin && corsOriginAllowed(reqOrigin)) {
          res.setHeader('Access-Control-Allow-Origin', reqOrigin);
        }
        if (!isIntakePublicGet) res.setHeader('Content-Type', 'application/json');

        // H3: helper to enforce PIN for sensitive GET routes
        const getIntakePin = () => STORE()?.settings?.lanApi?.intakePin || '';
        const getIntakeToken = () => STORE()?.settings?.lanApi?.intakeToken || '';
        const checkIntakeSubmitRate = () => {
          const now = Date.now();
          const rec = intakeSubmitAttempts.get(ip) || { count: 0, resetAt: now + INTAKE_SUBMIT_WINDOW_MS };
          if (now >= rec.resetAt) { rec.count = 0; rec.resetAt = now + INTAKE_SUBMIT_WINDOW_MS; }
          if (rec.count >= INTAKE_SUBMIT_LIMIT) return false;
          rec.count += 1;
          intakeSubmitAttempts.set(ip, rec);
          return true;
        };
        const checkSurveyRate = () => {
          const now = Date.now();
          const rec = surveyAttempts.get(ip) || { count: 0, resetAt: now + INTAKE_SUBMIT_WINDOW_MS };
          if (now >= rec.resetAt) { rec.count = 0; rec.resetAt = now + INTAKE_SUBMIT_WINDOW_MS; }
          if (rec.count >= SURVEY_SUBMIT_LIMIT) return false;
          rec.count += 1;
          surveyAttempts.set(ip, rec);
          return true;
        };
        const checkIntakeSessionGrantRate = () => {
          const now = Date.now();
          const rec = intakeSessionGrantAttempts.get(ip) || { count: 0, resetAt: now + INTAKE_SUBMIT_WINDOW_MS };
          if (now >= rec.resetAt) { rec.count = 0; rec.resetAt = now + INTAKE_SUBMIT_WINDOW_MS; }
          if (rec.count >= INTAKE_SESSION_GRANT_LIMIT) return false;
          rec.count += 1;
          intakeSessionGrantAttempts.set(ip, rec);
          return true;
        };
        const getCalendarToken = () => STORE()?.settings?.lanApi?.calendarToken || '';
        const validateIntakeSession = (token, clientIp) => {
          const sess = intakeSessions.get(token);
          if (!sess) return false;
          if (Date.now() - sess.created > INTAKE_SESSION_MS) {
            intakeSessions.delete(token);
            return false;
          }
          if (clientIp && sess.ip && sess.ip !== clientIp) return false;
          return true;
        };
        const hasIntakeSession = (request, clientIp) => {
          const cookies = parseRequestCookies(request);
          const token = cookies[INTAKE_COOKIE];
          return token && validateIntakeSession(token, clientIp);
        };
        const checkIntakePost = (request) => {
          if (hasIntakeSession(request, ip)) return true;
          const intakeTok = getIntakeToken();
          const providedIntake = (request.headers['x-khayt-intake-token'] || '').trim();
          if (intakeTok && providedIntake && safeTokenEqual(providedIntake, intakeTok)) return true;
          return false;
        };
        const isWebhookAuthLocked = (channel) => {
          const key = `${ip}:wh:${channel}`;
          const ipData = failedAttempts.get(key) || { count: 0, resetAt: 0 };
          return Date.now() < ipData.resetAt && ipData.count >= 10;
        };
        const recordWebhookAuthFailure = (channel) => {
          const key = `${ip}:wh:${channel}`;
          const now = Date.now();
          const ipData = failedAttempts.get(key) || { count: 0, resetAt: 0 };
          const newCount = (now >= ipData.resetAt ? 0 : ipData.count) + 1;
          failedAttempts.set(key, {
            count: newCount,
            resetAt: newCount >= 10 ? now + LOCKOUT_MS : ipData.resetAt,
          });
        };
        const intakeSharedStyles = '*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;min-height:100vh;padding:24px 16px}.container{max-width:520px;margin:0 auto}.header{text-align:center;margin-bottom:28px}.header h1{font-size:1.5rem;font-weight:700;color:#f1f5f9;margin-bottom:4px}.header p{color:#94a3b8;font-size:.9rem}.card{background:#1e293b;border-radius:16px;padding:24px;margin-bottom:16px}.form-group{margin-bottom:16px}label{display:block;font-size:.8rem;font-weight:600;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}input,textarea,select{width:100%;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:10px 12px;font-size:.9rem;outline:none;transition:border-color .2s}input:focus,textarea:focus,select:focus{border-color:#6366f1}textarea{resize:vertical;min-height:100px}select option{background:#1e293b}.req{color:#f87171}button[type=submit]{width:100%;background:#6366f1;color:#fff;border:none;border-radius:10px;padding:13px;font-size:1rem;font-weight:600;cursor:pointer;transition:background .2s}button[type=submit]:hover{background:#4f46e5}button[type=submit]:disabled{background:#334155;cursor:not-allowed}.thankyou{display:none;text-align:center;padding:40px 24px}.thankyou h2{font-size:1.3rem;color:#6366f1;margin-bottom:12px}.thankyou p{color:#94a3b8;line-height:1.6}.error-msg{color:#f87171;font-size:.8rem;margin-top:6px;display:none}';
        const renderIntakeFormPage = (shopName) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Intake — ${shopName}</title><style>${intakeSharedStyles}</style></head><body><div class="container"><div class="header"><h1>${shopName}</h1><p>Submit a new order request</p></div><div class="card"><form id="intakeForm"><div class="form-group"><label>Name <span class="req">*</span></label><input type="text" name="name" required maxlength="200" placeholder="Your full name"></div><div class="form-group"><label>Email</label><input type="email" name="email" maxlength="500" placeholder="your@email.com"></div><div class="form-group"><label>Phone</label><input type="tel" name="phone" maxlength="500" placeholder="+966 5x xxx xxxx"></div><div class="form-group"><label>Project Description <span class="req">*</span></label><textarea name="description" required maxlength="2000" placeholder="Describe your 3D printing project in detail..."></textarea></div><div class="form-group"><label>Reference / Link</label><input type="url" name="referenceLink" maxlength="500" placeholder="https://..."></div><div class="form-group"><label>Preferred Material</label><input type="text" name="material" maxlength="500" placeholder="e.g. PLA, PETG, Resin"></div><div class="form-group"><label>Budget Range</label><select name="budget"><option value="">— Select —</option><option value="&lt;100">Less than 100 SAR</option><option value="100-500">100 – 500 SAR</option><option value="500-1000">500 – 1,000 SAR</option><option value="1000+">1,000+ SAR</option></select></div><div class="form-group"><label>Preferred Due Date</label><input type="date" name="dueDate" maxlength="500"></div><div class="form-group" style="margin-top:4px;"><label style="display:flex;align-items:flex-start;gap:8px;font-weight:400;cursor:pointer;"><input type="checkbox" name="consent" id="intakeConsent" required style="width:auto;margin:3px 0 0;"><span style="font-size:.85rem;line-height:1.5;">I agree that ${shopName} may store my contact details to process this request. Your details are kept by ${shopName} and are not sold or shared. You may ask them to access or delete your data at any time.</span></label></div><div class="error-msg" id="errMsg">An error occurred. Please try again.</div><button type="submit">Submit Request</button></form><div class="thankyou" id="thankYou"><h2>Thank you!</h2><p>Your request has been received. We'll get back to you as soon as possible.</p></div></div></div><script>document.getElementById('intakeForm').addEventListener('submit',async function(e){e.preventDefault();const btn=this.querySelector('button[type=submit]');const err=document.getElementById('errMsg');err.style.display='none';btn.disabled=true;btn.textContent='Submitting…';const data={};new FormData(this).forEach((v,k)=>{if(v)data[k]=v;});data.consent=document.getElementById('intakeConsent').checked;try{const r=await fetch('/api/intake',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok){this.style.display='none';document.getElementById('thankYou').style.display='block';}else{const j=await r.json().catch(()=>({}));err.textContent=j.error||'Submission failed.';err.style.display='block';btn.disabled=false;btn.textContent='Submit Request';}}catch(ex){err.textContent='Network error. Please try again.';err.style.display='block';btn.disabled=false;btn.textContent='Submit Request';}});<\/script></body></html>`;
        const checkPinForGet = () => {
          // A token satisfies this per-route gate ONLY when the route is part of the scope
          // model and the token holds that scope (checked above). An unscoped route still
          // requires the owner PIN, so a token cannot be used to widen access.
          if (apiTokenScoped) return true;
          if (!pin) {
            // Owner/queue data requires a configured PIN — respond explicitly so the
            // socket isn't left hanging when the server runs without an owner PIN.
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Configure a LAN PIN in Khayt settings to access this data' }));
            return false;
          }
          const provided = (url.searchParams.get('pin') || req.headers['x-khayt-pin'] || '').trim();
          const now = Date.now();
          const ipData = failedAttempts.get(ip) || { count: 0, resetAt: 0 };
          if (now < ipData.resetAt && ipData.count >= 10) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
            return false;
          }
          if (!safeTokenEqual(provided, pin)) {
            const newCount = (now >= ipData.resetAt ? 0 : ipData.count) + 1;
            failedAttempts.set(ip, { count: newCount, resetAt: newCount >= 10 ? now + LOCKOUT_MS : ipData.resetAt });
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return false;
          }
          failedAttempts.delete(ip);
          return true;
        };

        if (pathname === '/api/status') {
          // Phones / old QRs often hit this with Accept: */* — send humans to the intake form.
          // API clients: GET /api/status?format=json
          const wantJson = url.searchParams.get('format') === 'json';
          if (req.method === 'GET' && !wantJson) {
            res.writeHead(302, { Location: '/intake', 'Cache-Control': 'no-cache' });
            res.end();
            return;
          }
          const queue = (store.printLog || []).filter(o => o.status !== 'completed');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          const waitingActive = (store.waitingList || []).filter(w => w.status !== 'declined').length;
          res.end(JSON.stringify({
            queued: queue.length,
            pending:    queue.filter(o => o.status === 'pending').length,
            printing:   queue.filter(o => o.status === 'printing').length,
            post:       queue.filter(o => o.status === 'post').length,
            qc:         queue.filter(o => o.status === 'qc').length,
            completed_today: (store.printLog || []).filter(o => o.completedAt &&
              o.completedAt.startsWith(new Date().toISOString().split('T')[0])).length,
            waiting: waitingActive
          }));
        } else if (pathname === '/api/orders' && req.method === 'GET') {
          if (!checkPinForGet()) return;
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
          const status = url.searchParams.get('status');
          let orders = store.printLog || [];
          if (status) orders = orders.filter(o => o.status === status);
          orders = orders.slice(0, limit);
          res.writeHead(200);
          res.end(JSON.stringify(orders.map(o => ({
            id: o.id, project: o.project, client: o.client, status: o.status,
            material: o.material, price: o.price, dueDate: o.dueDate, date: o.date,
            paymentStatus: o.paymentStatus,
            quoteExpiresAt: o.quoteExpiresAt,
            quoteAcceptedAt: o.quoteAcceptedAt
          }))));
        } else if (pathname === '/api/orders' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = parseLanJsonBody(body);
              const project = String(parsed.project || '').trim().slice(0, 200);
              if (!project) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'project is required' }));
                return;
              }
              const asQuote = parsed.status === 'quote';
              const validStatuses = asQuote ? ['quote'] : ['pending'];
              const status = asQuote ? 'quote' : 'pending';
              const now = new Date();
              const settings = STORE().settings || {};
              const prefix = asQuote ? (settings.quotePrefix || 'QUO') : (settings.orderPrefix || 'ORD');
              const id = `${prefix}-${now.getFullYear()}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
              let clientName = String(parsed.client || '').trim().slice(0, 200) || null;
              let clientId = parsed.clientId || null;
              if (clientId) {
                const cl = (STORE().clients || []).find(c => c.id === clientId);
                if (cl) clientName = cl.nameEn || cl.nameAr || clientName;
              }
              const machineId = parsed.machineId || null;
              let machineName = null;
              if (machineId) {
                const m = (STORE().machines || []).find(x => x.id === machineId);
                if (!m) {
                  res.writeHead(404);
                  res.end(JSON.stringify({ error: 'Machine not found' }));
                  return;
                }
                machineName = m.name;
              }
              const price = parsed.price != null ? Math.max(0, +parsed.price) : 0;
              const order = {
                id,
                date: now.toISOString().split('T')[0],
                timestamp: now.toISOString(),
                project,
                client: clientName,
                clientId,
                material: String(parsed.material || '').trim().slice(0, 120) || null,
                price: +price.toFixed(2),
                status,
                statusHistory: [{ status, at: now.toISOString() }],
                queuePos: (STORE().printLog || []).filter(o => o.status === 'pending').length + 1,
                machineId,
                machine: machineName,
                notes: String(parsed.notes || '').trim().slice(0, 500) || '',
                dueDate: parsed.dueDate || null,
                paymentStatus: 'unpaid',
                parts: [],
              };
              if (asQuote) {
                const validityDays = settings.quoteValidityDays || 7;
                order.quoteSentAt = order.date;
                order.quoteExpiresAt = new Date(now.getTime() + validityDays * 86400000).toISOString().split('T')[0];
                order.quoteVersion = 1;
              }
              const storeData = { ...STORE() };
              storeData.printLog = [order, ...(STORE().printLog || [])];
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-created', order);
              }
              res.writeHead(201);
              res.end(JSON.stringify({ ok: true, order: {
                id: order.id, project: order.project, client: order.client,
                status: order.status, price: order.price, material: order.material,
                dueDate: order.dueDate, quoteExpiresAt: order.quoteExpiresAt
              }}));
            } catch (e) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
        } else if (pathname === '/api/queue') {
          // Owner data (client + project names): require PIN when one is configured.
          if (!checkPinForGet()) return;
          const queue = (store.printLog || []).filter(o =>
            ['pending','printing','post','qc'].includes(o.status));
          res.writeHead(200);
          res.end(JSON.stringify(queue.map(o => ({
            id: o.id, project: o.project, client: o.client, status: o.status,
            machine: o.machine, machineId: o.machineId || null,
            dueDate: o.dueDate, priority: o.priority
          }))));
        } else if (pathname === '/api/machines/live' && req.method === 'GET') {
          if (!checkPinForGet()) return;
          const cache = printerCache() || {};
          const live = (store.machines || []).map(m => {
            const s = cache[m.id] || {};
            return {
              id: m.id,
              name: m.name,
              hasPrinterApi: !!(m.printerApi?.type && m.printerApi.type !== 'none'),
              state: s.state || null,
              progress: s.progress != null ? Math.round(+s.progress) : null,
              filename: s.filename || null,
              timeRemaining: s.timeRemaining != null ? Math.round(+s.timeRemaining) : null,
              tempNozzle: s.tempNozzle != null ? Math.round(+s.tempNozzle) : null,
              tempBed: s.tempBed != null ? Math.round(+s.tempBed) : null,
              error: s.error || null,
              lastUpdated: s.lastUpdated || null,
              apiType: s.type || m.printerApi?.type || null
            };
          });
          res.writeHead(200);
          res.end(JSON.stringify(live));

        } else if (pathname === '/api/machines') {
          // Owner data (machine names): require PIN when one is configured.
          if (!checkPinForGet()) return;
          res.writeHead(200);
          res.end(JSON.stringify((store.machines || []).map(m => ({
            id: m.id, name: m.name, type: m.type, status: m.status,
            hasPrinterApi: !!(m.printerApi?.type && m.printerApi.type !== 'none')
          }))));

        // ── iOS companion: inventory ────────────────────────────
        } else if (pathname === '/api/inventory' && req.method === 'GET') {
          if (!checkPinForGet()) return;
          res.writeHead(200);
          res.end(JSON.stringify(store.inventory || []));

        } else if (pathname === '/api/waiting-list' && req.method === 'GET') {
          if (!checkPinForGet()) return;
          const items = (store.waitingList || []).filter(w => w.status !== 'declined');
          res.writeHead(200);
          res.end(JSON.stringify(items.map(w => ({
            id: w.id,
            project: w.project,
            clientName: w.clientName,
            notes: w.notes,
            email: w.email,
            phone: w.phone,
            material: w.material,
            priority: w.priority || 'normal',
            status: w.status || 'active',
            estValue: w.estValue ?? w.estimatedValue ?? 0,
            reminderDate: w.reminderDate,
            source: w.source,
            submittedAt: w.submittedAt || w.addedAt || w.createdAt
          }))));

        } else if (pathname === '/api/clients' && req.method === 'GET') {
          if (!checkPinForGet()) return;
          res.writeHead(200);
          res.end(JSON.stringify((store.clients || []).map(c => ({
            id: c.id,
            nameEn: c.nameEn,
            nameAr: c.nameAr,
            phone: c.phone,
            email: c.email
          }))));

        } else if (pathname === '/api/inventory' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const rawSpool = parseLanJsonBody(body);
              if (!rawSpool || typeof rawSpool !== 'object' || Array.isArray(rawSpool)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid inventory payload' }));
                return;
              }
              const spool = pickLanSpoolFields(rawSpool);
              spool.id = uniqueLanId('spool');
              spool.addedAt = new Date().toISOString();
              spool.remaining = spool.weightRemaining ?? spool.weightTotal ?? 1000;
              // Write back to store on disk
              const storeData = { ...STORE() };
              storeData.inventory = [...(STORE().inventory || []), spool];
              await persistLanStoreUpdate(storeData);
              // Notify renderer to reload
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-spool-added', spool);
              }
              res.writeHead(201);
              res.end(JSON.stringify({ ok: true, spool }));
            } catch (e) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        } else if (pathname.startsWith('/api/inventory/') && (req.method === 'PATCH' || req.method === 'DELETE')) {
          const spoolId = decodeURIComponent(pathname.split('/api/inventory/')[1].split('/')[0]);
          if (!spoolId || spoolId.includes('..')) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid spool ID' }));
            return;
          }
          if (req.method === 'DELETE') {
            (async () => {
              try {
                const storeData = { ...STORE() };
                const list = [...(STORE().inventory || [])];
                const idx = list.findIndex(s => s.id === spoolId);
                if (idx === -1) {
                  res.writeHead(404);
                  res.end(JSON.stringify({ error: 'Spool not found' }));
                  return;
                }
                const removed = list[idx];
                storeData.inventory = list.filter(s => s.id !== spoolId);
                await persistLanStoreUpdate(storeData);
                if (getMainWindow() && !getMainWindow().isDestroyed()) {
                  getMainWindow().webContents.send('lan-spool-deleted', { id: spoolId });
                }
                res.writeHead(200);
                res.end(JSON.stringify({ ok: true, id: spoolId, spool: removed }));
              } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: String(e) }));
              }
            })();
            return;
          }
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = parseLanJsonBody(body);
              const remaining = parsed.remaining ?? parsed.weightRemaining;
              if (remaining === undefined || remaining === null || Number.isNaN(Number(remaining))) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'remaining is required' }));
                return;
              }
              const grams = Math.max(0, Math.min(50000, Math.round(Number(remaining))));
              const storeData = { ...STORE() };
              storeData.inventory = [...(STORE().inventory || [])];
              const idx = storeData.inventory.findIndex(s => s.id === spoolId);
              if (idx === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Spool not found' }));
                return;
              }
              storeData.inventory[idx] = {
                ...storeData.inventory[idx],
                remaining: grams,
                weightRemaining: grams
              };
              const spool = storeData.inventory[idx];
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-spool-updated', spool);
              }
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true, spool }));
            } catch (e) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        } else if (pathname.startsWith('/api/waiting-list/') && req.method === 'PATCH') {
          const itemId = decodeURIComponent(pathname.split('/api/waiting-list/')[1].split('/')[0]);
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { status } = parseLanJsonBody(body);
              const valid = ['active', 'reminded', 'declined'];
              if (!valid.includes(status)) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid status' }));
                return;
              }
              const storeData = { ...STORE() };
              storeData.waitingList = [...(STORE().waitingList || [])];
              const idx = storeData.waitingList.findIndex(w => w.id === itemId);
              if (idx === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Waiting list item not found' }));
                return;
              }
              if (status === 'declined') {
                const item = storeData.waitingList[idx];
                storeData.waitingListHistory = [...(STORE().waitingListHistory || []), {
                  ...item, status: 'declined', declinedAt: new Date().toISOString()
                }];
                storeData.waitingList = storeData.waitingList.filter(w => w.id !== itemId);
              } else {
                storeData.waitingList[idx] = { ...storeData.waitingList[idx], status };
              }
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-waiting-updated', { id: itemId, status });
              }
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        } else if (pathname.match(/^\/api\/orders\/[^/]+\/quote-url$/) && req.method === 'GET') {
          if (!checkPinForGet()) return;
          const orderId = decodeURIComponent(pathname.split('/api/orders/')[1].replace('/quote-url', ''));
          const order = (store.printLog || []).find(o => o.id === orderId);
          if (!order) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Order not found' }));
            return;
          }
          const host = req.headers.host || 'localhost';
          const base = `http://${host}`;
          const quoteUrl = `${base}/order/${encodeURIComponent(orderId)}/quote`;
          const statusUrl = `${base}/order/${encodeURIComponent(orderId)}/status`;
          const canApprove = order.status === 'quote' || (order.status === 'on_hold' && order.hasQuote);
          res.writeHead(200);
          res.end(JSON.stringify({
            quoteUrl,
            statusUrl,
            canApprove: canApprove && !isQuoteExpired(order),
            expired: isQuoteExpired(order),
            quoteExpiresAt: order.quoteExpiresAt || null,
            alreadyApproved: order.status !== 'quote' && !!(order.quoteAcceptedAt || order.clientApprovedAt)
          }));

        } else if (pathname.match(/^\/api\/orders\/[^/]+\/approve$/) && req.method === 'POST') {
          const orderId = decodeURIComponent(pathname.split('/api/orders/')[1].replace('/approve', ''));
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              if (body.trim()) parseLanJsonBody(body);
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const result = applyQuoteApprovalToStore(storeData, orderId);
              if (!result) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Order not found' }));
                return;
              }
              if (result.error === 'cannot_approve') {
                res.writeHead(409);
                res.end(JSON.stringify({ error: 'Quote cannot be approved in its current state' }));
                return;
              }
              await persistLanStoreUpdate(storeData);
              const approved = result.order;
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', {
                  id: orderId,
                  status: approved.status,
                  clientApprovedAt: approved.clientApprovedAt,
                  quoteAcceptedAt: approved.quoteAcceptedAt,
                  quoteApproved: true,
                });
              }
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true, order: {
                id: approved.id, status: approved.status,
                quoteAcceptedAt: approved.quoteAcceptedAt
              }}));
            } catch (e) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── iOS companion: update order status / machine ─────────
        } else if (pathname.startsWith('/api/orders/') && req.method === 'PATCH') {
          const orderId = decodeURIComponent(pathname.split('/api/orders/')[1].split('/')[0]);
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { status, machineId } = parseLanJsonBody(body);
              if (!status && machineId === undefined) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'status or machineId required' }));
                return;
              }
              const valid = ['pending','printing','post','qc','completed','on_hold'];
              if (status && !valid.includes(status)) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid status' }));
                return;
              }
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const idx = storeData.printLog.findIndex(o => o.id === orderId);
              if (idx === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Order not found' }));
                return;
              }
              const updated = { ...storeData.printLog[idx] };
              if (status) updated.status = status;
              if (machineId !== undefined) {
                if (!machineId) {
                  updated.machineId = null;
                  updated.machine = null;
                } else {
                  const machine = (STORE().machines || []).find(m => m.id === machineId);
                  if (!machine) {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Machine not found' }));
                    return;
                  }
                  updated.machineId = machineId;
                  updated.machine = machine.name;
                }
              }
              storeData.printLog[idx] = updated;
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', {
                  id: orderId,
                  status: updated.status,
                  machineId: updated.machineId,
                  machine: updated.machine
                });
              }
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true, order: {
                id: updated.id, status: updated.status,
                machineId: updated.machineId, machine: updated.machine
              }}));
            } catch (e) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── Customer survey submission (public — protected by one-time token) ──
        } else if (pathname === '/api/survey' && req.method === 'POST') {
          // Per-IP throttle: this is the one store-mutating public route without a
          // PIN gate, so cap it (like intake) to prevent token-guessing / write spam.
          if (!checkSurveyRate()) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Too many attempts — try again later' }));
            return;
          }
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = parseLanJsonBody(body, {});
              if (typeof parsed.comment === 'string' && parsed.comment.length > 2000) {
                parsed.comment = parsed.comment.slice(0, 2000);
              }
              const { token, orderId, rating, comment } = parsed;
              if (!token || typeof rating !== 'number' || rating < 1 || rating > 5) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Invalid payload — token and rating (1-5) are required' }));
                return;
              }
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const idx = storeData.printLog.findIndex(o => o.surveyToken && safeTokenEqual(o.surveyToken, token));
              if (idx === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Invalid or expired survey token' }));
                return;
              }
              storeData.printLog[idx] = {
                ...storeData.printLog[idx],
                survey: {
                  rating,
                  comment: (comment || '').trim(),
                  submittedAt: new Date().toISOString()
                },
                surveyToken: undefined,
              };
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-survey-submitted', {
                  orderId: storeData.printLog[idx].id,
                  rating
                });
              }
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        } else if (pathname.match(/^\/order\/[^/]+\/quote$/) && req.method === 'GET') {
          const rawId = pathname.replace(/^\/order\//, '').replace(/\/quote$/, '');
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          const tokenParam = (url.searchParams.get('token') || '').trim();
          const order = (store.printLog || []).find(o => o.id === safeId);
          const shopName = store.settings?.shopName || store.settings?.bizEn || 'Khayt';
          const invalidLinkHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invalid link</title></head><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Invalid link</h2><p style="color:#94a3b8;margin-top:8px;">Open the quote from the link your shop sent you.</p></body></html>`;
          setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          if (!order) {
            res.writeHead(404);
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found</title></head><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Quote not found</h2></body></html>`);
          } else if (!order.quoteApprovalToken || !verifyQuoteApprovalToken(order, tokenParam)) {
            res.writeHead(403);
            res.end(invalidLinkHtml);
          } else {
            const alreadyApproved = order.status !== 'quote' && !(order.status === 'on_hold' && order.hasQuote);
            res.writeHead(200);
            res.end(renderLanQuoteApprovalPage({
              order,
              shopName,
              approvePath: `/order/${safeId}/approve`,
              approvalToken: order.quoteApprovalToken,
              alreadyApproved,
              expired: !alreadyApproved && isQuoteExpired(order),
              currencyLabel: store.settings?.currency || 'SAR',
            }));
          }

        } else if (pathname.match(/^\/order\/[^/]+\/approve$/) && req.method === 'POST') {
          const rawId = pathname.replace(/^\/order\//, '').replace(/\/approve$/, '');
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = body.trim() ? parseLanJsonBody(body) : {};
              if (parsed.action && parsed.action !== 'approve') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid action' }));
                return;
              }
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const idx = storeData.printLog.findIndex(o => o.id === safeId);
              if (idx === -1) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Order not found</h2></body></html>`);
                return;
              }
              const approvalTok = (url.searchParams.get('token') || parsed.approvalToken || '').trim();
              if (!verifyQuoteApprovalToken(storeData.printLog[idx], approvalTok)) {
                res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Invalid link</h2><p>Open the quote page from the link your shop sent you, then approve from there.</p></body></html>`);
                return;
              }
              const result = applyQuoteApprovalToStore(storeData, safeId);
              if (!result) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Order not found</h2></body></html>`);
                return;
              }
              if (result.error === 'expired') {
                res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(quoteExpiredHtml());
                return;
              }
              if (result.error === 'cannot_approve') {
                res.writeHead(409, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Cannot approve</h2><p>This quote is no longer awaiting approval.</p></body></html>`);
                return;
              }
              await persistLanStoreUpdate(storeData);
              const approved = result.order;
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', {
                  id: safeId,
                  status: 'pending',
                  clientApprovedAt: approved.clientApprovedAt,
                  quoteAcceptedAt: approved.quoteAcceptedAt,
                  quoteApproved: true,
                });
              }
              const projectName = lanEscapeHtml(approved.project || approved.id);
              setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.writeHead(200);
              res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote Approved</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#6366f1}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Quote Approved!</h2><p>Your approval for <strong>${projectName}</strong> has been received. We'll start working on your order shortly.</p></div></body></html>`);
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        } else if (pathname.startsWith('/status/')) {
          const rawId = path.basename(decodeURIComponent(pathname.slice('/status/'.length)).replace(/\.html$/, ''));
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          const order = (store.printLog || []).find(o => o.id === safeId);
          const accessTok = (url.searchParams.get('token') || '').trim();
          if (!order || !order.trackingToken || !verifyOrderAccessToken(order, accessTok, 'trackingToken')) {
            setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(403);
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invalid link</title></head><body style="font-family:sans-serif;text-align:center;padding:60px;color:#666;"><h2>Invalid tracking link</h2><p>Use the tracking link your shop sent you.</p></body></html>`);
            return;
          }
          const statusDir = statusPagesDir();
          const filePath = path.join(statusDir, `order-status-${safeId}.html`);
          fs.promises.readFile(filePath, 'utf8').then(html => {
            setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.writeHead(200);
            res.end(prepareStatusHtmlForServe(html));
          }).catch(() => {
            setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(404);
            res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#666;"><h2>Order not found</h2><p>The tracking page for this order is not available yet.</p></body></html>`);
          });
        } else if (pathname.startsWith('/order/') && req.method === 'GET') {
          const rawId = pathname.replace(/^\/order\//, '').replace(/\/status\/?$/, '').replace(/\/quote\/?$/, '');
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          const order = (store.printLog || []).find(o => o.id === safeId);
          setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          if (!order) {
            res.writeHead(404);
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Not Found</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Order Not Found</h2><p>We couldn't find an order with that ID. Please check the link and try again.</p></div></body></html>`);
          } else if (order.status === 'quote') {
            res.writeHead(302, { Location: `/order/${safeId}/quote` });
            res.end();
          } else {
            const accessTok = (url.searchParams.get('token') || '').trim();
            if (!order.trackingToken || !verifyOrderAccessToken(order, accessTok, 'trackingToken')) {
              res.writeHead(403);
              res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invalid link</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Invalid tracking link</h2><p>Use the tracking link your shop sent you, or ask them for an updated link.</p></div></body></html>`);
              return;
            }
            const shopName = lanEscapeHtml(store.settings?.shopName || 'Khayt');
            const projectName = lanEscapeHtml(order.project || order.id);
            const clientName = order.client ? lanEscapeHtml(order.client) : null;
            const material = order.material ? lanEscapeHtml(order.material) : null;
            const dueDate = order.dueDate ? lanEscapeHtml(order.dueDate) : null;
            const status = (order.status || 'pending').toLowerCase();

            const statusLabels = {
              pending: 'Waiting to Start',
              printing: 'Printing',
              post: 'Post-Processing',
              qc: 'Quality Check',
              completed: 'Ready for Pickup / Completed',
              on_hold: 'On Hold',
              cancelled: 'Cancelled'
            };
            const statusDescriptions = {
              pending: 'Your order is in the queue and will start soon.',
              printing: 'Your order is currently being printed.',
              post: 'Your print is finished — post-processing is underway.',
              qc: 'Your order is going through a quality check.',
              completed: 'Your order is complete and ready for pickup!',
              on_hold: 'Your order is temporarily on hold. We\'ll update you soon.',
              cancelled: 'This order has been cancelled. Please contact us if you have questions.'
            };
            const steps = ['Pending', 'Printing', 'Post-Processing', 'Quality Check', 'Ready / Completed'];
            const stepMap = { pending: 0, printing: 1, post: 2, qc: 3, completed: 4 };
            const currentStep = stepMap[status] !== undefined ? stepMap[status] : (status === 'on_hold' || status === 'cancelled' ? -1 : 0);
            const isWarning = status === 'on_hold' || status === 'cancelled';
            const accentColor = isWarning ? (status === 'cancelled' ? '#ef4444' : '#f59e0b') : '#6366f1';
            const statusLabel = lanEscapeHtml(statusLabels[status] || status);
            const statusDesc = lanEscapeHtml(statusDescriptions[status] || 'We are working on your order.');

            const stepsHtml = steps.map((label, i) => {
              const active = !isWarning && i <= currentStep;
              const isCurrent = !isWarning && i === currentStep;
              return `<div class="step${active ? ' active' : ''}${isCurrent ? ' current' : ''}"><div class="dot"></div><div class="step-label">${lanEscapeHtml(label)}</div></div>`;
            }).join('');

            const detailsHtml = [
              clientName ? `<div class="detail"><span class="detail-label">Customer</span><span class="detail-val">${clientName}</span></div>` : '',
              material ? `<div class="detail"><span class="detail-label">Material</span><span class="detail-val">${material}</span></div>` : '',
              dueDate ? `<div class="detail"><span class="detail-label">Est. Due Date</span><span class="detail-val">${dueDate}</span></div>` : ''
            ].filter(Boolean).join('');

            // Shipping block — customer-safe projection only (status, carrier, tracking #,
            // carrier deep link). Never projects shipmentMeta / cost / internal notes.
            let shippingHtml = '';
            if (order.shippingStatus || order.trackingNumber) {
              let carriersLib = null;
              try { carriersLib = require('../renderer/carriers.js'); } catch (_) { carriersLib = null; }
              const proj = carriersLib ? carriersLib.projectShipping(order) : null;
              const shipLabels = { label_created: 'Label created', in_transit: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered', exception: 'Delivery issue' };
              const carrierName = proj && proj.carrierLabel ? (proj.carrierLabel.en || '') : (order.carrier || '');
              const stLabel = proj && proj.shippingStatus ? (shipLabels[proj.shippingStatus] || proj.shippingStatus) : '';
              const rows = [];
              if (carrierName) rows.push(`<div class="detail"><span class="detail-label">Carrier</span><span class="detail-val">${lanEscapeHtml(carrierName)}</span></div>`);
              if (proj && proj.trackingNumber) {
                const tnCell = proj.trackingUrl
                  ? `<a href="${lanEscapeHtml(proj.trackingUrl)}" target="_blank" rel="noopener noreferrer" style="color:#a5b4fc;text-decoration:none;">${lanEscapeHtml(proj.trackingNumber)}</a>`
                  : lanEscapeHtml(proj.trackingNumber);
                rows.push(`<div class="detail"><span class="detail-label">Tracking #</span><span class="detail-val">${tnCell}</span></div>`);
              }
              if (stLabel) rows.push(`<div class="detail"><span class="detail-label">Shipping</span><span class="detail-val">${lanEscapeHtml(stLabel)}</span></div>`);
              if (rows.length) shippingHtml = `<div class="card"><div class="card-title">Shipping</div>${rows.join('')}</div>`;
            }

            let surveyHtml = '';
            if ((order.status === 'completed' || order.status === 'delivered') && order.surveyToken && !order.survey) {
              const tokJs = scriptSafeJson(order.surveyToken);
              const oidJs = scriptSafeJson(order.id);
              surveyHtml = `<div class="card" id="surveyCard"><div class="card-title">Rate Your Experience</div><p style="color:#94a3b8;font-size:.85rem;margin-bottom:12px;">How was your order?</p><div id="stars" style="display:flex;justify-content:center;gap:6px;font-size:28px;margin-bottom:12px">${[1, 2, 3, 4, 5].map(n => `<span data-v="${n}" style="cursor:pointer">☆</span>`).join('')}</div><textarea id="surveyComment" placeholder="Optional comment" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;padding:10px;font-size:.85rem;min-height:72px;margin-bottom:10px;box-sizing:border-box;"></textarea><button id="surveyBtn" style="width:100%;padding:10px;border:none;border-radius:8px;background:#6366f1;color:#fff;font-weight:600;cursor:pointer;">Submit Feedback</button><p id="surveyThanks" style="display:none;color:#4ade80;margin-top:10px;text-align:center;">Thank you!</p></div><script>(function(){let r=0;document.querySelectorAll('#stars span').forEach(s=>s.addEventListener('click',()=>{r=+s.dataset.v;document.querySelectorAll('#stars span').forEach((st,i)=>st.textContent=i<r?'\\u2605':'\\u2606');}));document.getElementById('surveyBtn').addEventListener('click',async()=>{if(!r){alert('Please select a rating');return;}const btn=document.getElementById('surveyBtn');btn.disabled=true;try{const res=await fetch('/api/survey',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${tokJs},orderId:${oidJs},rating:r,comment:document.getElementById('surveyComment').value.trim()})});if(res.ok){btn.style.display='none';document.getElementById('surveyThanks').style.display='block';}else{btn.disabled=false;alert('Could not submit — try again');}}catch(e){btn.disabled=false;}});})();</script>`;
            } else if (order.survey) {
              surveyHtml = `<div class="card"><p style="color:#4ade80;text-align:center;font-size:.9rem;">⭐ Thank you for your feedback!</p></div>`;
            }

            setLanHtmlSecurityHeaders(res);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(200);
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Status — ${projectName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;padding:24px 16px}.container{max-width:480px;margin:0 auto}.header{text-align:center;margin-bottom:28px}.header h1{font-size:1.5rem;font-weight:700;color:#f1f5f9;margin-bottom:4px}.header .subtitle{color:#94a3b8;font-size:.9rem}.card{background:#1e293b;border-radius:16px;padding:24px;margin-bottom:16px}.card-title{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:16px}.status-badge{display:inline-block;padding:6px 14px;border-radius:20px;font-size:.85rem;font-weight:600;background:${accentColor}22;color:${accentColor};margin-bottom:12px}.status-desc{color:#94a3b8;font-size:.9rem;line-height:1.5}.progress{display:flex;align-items:flex-start;gap:0;margin-top:8px}.step{flex:1;display:flex;flex-direction:column;align-items:center;position:relative}.step:not(:last-child)::after{content:'';position:absolute;top:10px;left:50%;width:100%;height:2px;background:#334155;z-index:0}.step.active:not(:last-child)::after{background:#6366f1}.dot{width:20px;height:20px;border-radius:50%;background:#334155;border:2px solid #334155;position:relative;z-index:1;transition:all .2s}.step.active .dot{background:#6366f1;border-color:#6366f1}.step.current .dot{box-shadow:0 0 0 4px #6366f133}.step-label{font-size:.65rem;color:#64748b;margin-top:6px;text-align:center;line-height:1.3}.step.active .step-label{color:#a5b4fc}.detail{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #0f172a}.detail:last-child{border-bottom:none}.detail-label{font-size:.8rem;color:#64748b}.detail-val{font-size:.85rem;color:#e2e8f0;font-weight:500;text-align:right;max-width:60%}.footer{text-align:center;margin-top:24px;color:#475569;font-size:.8rem;line-height:1.6}</style></head><body><div class="container"><div class="header"><h1>${projectName}</h1><div class="subtitle">Order Status</div></div><div class="card"><div class="card-title">Current Status</div><div class="status-badge">${statusLabel}</div><p class="status-desc">${statusDesc}</p>${!isWarning ? `<div class="progress" style="margin-top:20px">${stepsHtml}</div>` : ''}</div>${detailsHtml ? `<div class="card"><div class="card-title">Order Details</div>${detailsHtml}</div>` : ''}${shippingHtml}${surveyHtml}<div class="footer"><p>Thank you for choosing ${shopName}</p><p style="margin-top:4px;font-size:.75rem;color:#334155">Auto-refreshes every 30s</p></div></div><script>setTimeout(()=>location.reload(),30000);</script></body></html>`);
          }

        } else if (pathname === '/manifest.json' && req.method === 'GET') {
          const shopName = store.settings?.shopName || 'Khayt';
          res.setHeader('Content-Type', 'application/manifest+json');
          res.writeHead(200);
          res.end(JSON.stringify({
            name: shopName + ' Queue',
            short_name: shopName,
            start_url: '/',
            display: 'standalone',
            background_color: '#0f172a',
            theme_color: '#6366f1',
            icons: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
          }));

        } else if ((pathname === '/icon-192.png' || pathname === '/icon-512.png') && req.method === 'GET') {
          const iconPath = path.join(appRoot, 'assets', 'icon_preview.png');
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          if (fs.existsSync(iconPath)) {
            const iconBuf = fs.readFileSync(iconPath);
            res.writeHead(200);
            res.end(iconBuf);
          } else {
            res.writeHead(200);
            res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
          }

        } else if (pathname === '/sw.js' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Service-Worker-Allowed', '/');
          res.writeHead(200);
          res.end(`const CACHE='khayt-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/']))));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));`);

        } else if ((pathname === '/' || pathname === '') && req.method === 'GET') {
          if (store.settings?.onlineEnabled) {
            res.writeHead(302, { Location: '/intake', 'Cache-Control': 'no-cache' });
            res.end();
            return;
          }
          if (!checkPinForGet()) return;
          const shopName = lanEscapeHtml(store.settings?.shopName || 'Khayt');
          const queue = (store.printLog || []).filter(o => ['pending','printing','post','qc','on_hold'].includes(o.status));
          const pending  = queue.filter(o => o.status === 'pending').length;
          const printing = queue.filter(o => o.status === 'printing').length;
          const post     = queue.filter(o => o.status === 'post').length;
          const qc       = queue.filter(o => o.status === 'qc').length;
          const onHold   = queue.filter(o => o.status === 'on_hold').length;
          const badgeMap = { pending:'#374151|#d1d5db', printing:'#1d4ed8|#bfdbfe', post:'#065f46|#a7f3d0', qc:'#7c3aed|#ddd6fe', on_hold:'#92400e|#fde68a' };
          const orderCards = queue.slice(0, 30).map(o => {
            const [bg, fg] = (badgeMap[o.status] || '#374151|#d1d5db').split('|');
            return `<div class="oc"><div><div class="on">${lanEscapeHtml(o.project || o.id)}</div><div class="cl">${lanEscapeHtml(o.client || '')}</div></div><span class="bd" style="background:${bg};color:${fg}">${lanEscapeHtml(o.status)}</span></div>`;
          }).join('') || '<div class="empty">No active orders</div>';
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-touch-icon" href="/icon-192.png">
<meta name="theme-color" content="#6366f1">
<link rel="manifest" href="/manifest.json">
<title>${shopName} Queue</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,system-ui,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:16px;max-width:480px;margin:0 auto}
h1{font-size:20px;color:#6366f1;margin-bottom:2px}
.sub{font-size:12px;color:#64748b;margin-bottom:18px;display:flex;align-items:center;gap:6px}
.dot{width:7px;height:7px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite;display:inline-block}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:18px}
.sc{background:#1e293b;border-radius:10px;padding:12px 14px}
.sn{font-size:26px;font-weight:700}
.sl{font-size:11px;color:#64748b;margin-top:2px}
.oc{background:#1e293b;border-radius:10px;padding:11px 14px;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.on{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.cl{font-size:11px;color:#94a3b8;margin-top:2px}
.bd{padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}
.empty{text-align:center;padding:32px 20px;color:#475569;font-size:13px}
.rf{text-align:center;font-size:11px;color:#475569;margin-top:14px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
</style></head><body>
<div class="hdr"><div><h1>${shopName}</h1><div class="sub"><span class="dot"></span>Live Queue</div></div></div>
<div class="stats">
<div class="sc"><div class="sn">${pending}</div><div class="sl">Pending</div></div>
<div class="sc"><div class="sn">${printing}</div><div class="sl">Printing</div></div>
<div class="sc"><div class="sn">${post}</div><div class="sl">Post-Processing</div></div>
<div class="sc"><div class="sn">${qc + onHold}</div><div class="sl">QC / On Hold</div></div>
</div>
${orderCards}
<div class="rf">Auto-refreshes every 30s &middot; Updated ${now}</div>
<script>
if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}
setTimeout(()=>location.reload(),30000);
</script>
</body></html>`;
          setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.writeHead(200);
          res.end(html);

        } else if (pathname.startsWith('/api/webhook/printer/') && req.method === 'POST') {
          const machineId = decodeURIComponent(pathname.slice('/api/webhook/printer/'.length).split('/')[0]);
          // Header only — a `?token=` query param would leak the secret into
          // access logs, proxy logs and browser history. Senders must use the
          // X-Khayt-Webhook-Token header.
          const providedToken = req.headers['x-khayt-webhook-token'] || '';
          const expectedToken = store.settings?.lanApi?.webhookToken || '';
          // Rate-limit on a dedicated channel so a misconfigured printer spamming
          // bad tokens can't lock out the owner's PIN/queue access (and vice versa).
          if (isWebhookAuthLocked('printer')) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
            return;
          }
          if (!expectedToken || !safeTokenEqual(providedToken, expectedToken)) {
            recordWebhookAuthFailure('printer');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized — set webhook token in Khayt LAN settings' }));
            return;
          }
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = parseLanJsonBody(body, {});
              const event = normalizePrinterEvent(parsed);
              // Find the order currently printing on this machine
              const storeData = { ...STORE() };
              const orders = storeData.printLog || [];
              // Find by machineId (order.machine === machine.name where machine.id === machineId)
              const machine = (storeData.machines || []).find(m => m.id === machineId);
              const machineName = machine?.name || machineId;
              let advancedOrder = null;
              if (event === 'print_done' || event === 'print_started' || event === 'print_cancelled') {
                const targetStatus = event === 'print_done' ? 'printing'
                                   : event === 'print_started' ? 'pending'
                                   : 'printing';
                const newStatus   = event === 'print_done' ? 'post'
                                  : event === 'print_started' ? 'printing'
                                  : 'on_hold';
                const idx = orders.findIndex(o => o.status === targetStatus &&
                  (o.machine === machineName || o.machineId === machineId));
                if (idx !== -1) {
                  const prev = orders[idx];
                  storeData.printLog = [...orders];
                  storeData.printLog[idx] = {
                    ...prev,
                    status: newStatus,
                    ...(newStatus === 'printing' ? { printStartedAt: new Date().toISOString() } : {}),
                    ...(newStatus === 'post'     ? { printDoneAt:    new Date().toISOString() } : {}),
                  };
                  await persistLanStoreUpdate(storeData);
                  advancedOrder = { id: prev.id, from: targetStatus, to: newStatus, project: prev.project };
                  if (getMainWindow() && !getMainWindow().isDestroyed()) {
                    getMainWindow().webContents.send('lan-kanban-advanced', advancedOrder);
                  }
                }
              }
              res.setHeader('Content-Type', 'application/json');
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true, event, advanced: advancedOrder }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── iCal feed ───────────────────────────────────────────
        } else if (pathname === '/calendar.ics' && req.method === 'GET') {
          const calToken = getCalendarToken();
          const tokenParam = (url.searchParams.get('token') || '').trim();
          const pinParam = (url.searchParams.get('pin') || req.headers['x-khayt-pin'] || '').trim();
          const authorized = (calToken && tokenParam && safeTokenEqual(tokenParam, calToken))
            || (pin && pinParam && safeTokenEqual(pinParam, pin));
          if (!authorized) {
            res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Unauthorized — use the calendar subscription link from Khayt Settings → Online.');
            return;
          }
          const calOrders = (store.printLog || []).filter(o =>
            o.dueDate && o.status !== 'completed' && o.status !== 'cancelled'
          );
          const formatIcalDate = (dateStr) => {
            // Parse YYYY-MM-DD → YYYYMMDD
            const d = new Date(dateStr + 'T00:00:00Z');
            if (isNaN(d.getTime())) return null;
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dy = String(d.getUTCDate()).padStart(2, '0');
            return `${y}${m}${dy}`;
          };
          const calStatusMap = {
            printing: 'CONFIRMED', post: 'CONFIRMED', qc: 'CONFIRMED',
            pending: 'TENTATIVE', on_hold: 'CANCELLED'
          };
          const vevents = calOrders.map(o => {
            const dtstart = formatIcalDate(o.dueDate);
            if (!dtstart) return '';
            // DTEND = dueDate + 1 day
            const dEnd = new Date(o.dueDate + 'T00:00:00Z');
            dEnd.setUTCDate(dEnd.getUTCDate() + 1);
            const ye = dEnd.getUTCFullYear();
            const me = String(dEnd.getUTCMonth() + 1).padStart(2, '0');
            const de = String(dEnd.getUTCDate()).padStart(2, '0');
            const dtend = `${ye}${me}${de}`;
            const icalEscape = s => String(s || '').replace(/[\r\n]+/g, ' ').replace(/[\\;,]/g, '\\$&');
            const summary = `${icalEscape(o.project || o.id)} (${icalEscape(o.client || 'No client')})`;
            const icalStatus = calStatusMap[o.status] || 'TENTATIVE';
            return [
              'BEGIN:VEVENT',
              `UID:khayt-${o.id}@khaytapp.com`,
              `DTSTART;VALUE=DATE:${dtstart}`,
              `DTEND;VALUE=DATE:${dtend}`,
              `SUMMARY:${summary}`,
              `STATUS:${icalStatus}`,
              'END:VEVENT'
            ].join('\r\n');
          }).filter(Boolean).join('\r\n');
          const shopName = (store.settings?.shopName || 'Khayt').replace(/[\r\n]+/g, ' ').replace(/[\\;,]/g, '\\$&');
          const icalBody = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Khayt//Khayt//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:${shopName} Orders`,
            vevents,
            'END:VCALENDAR'
          ].join('\r\n');
          res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="khayt-orders.ics"');
          res.setHeader('Cache-Control', 'no-cache');
          res.writeHead(200);
          res.end(icalBody);

        // ── Online intake form ──────────────────────────────────
        } else if (pathname === '/intake' && req.method === 'GET') {
          const shopName = lanEscapeHtml(store.settings?.shopName || 'Khayt');
          res.setHeader('Cache-Control', 'no-cache');
          const grantIntakeSession = () => {
            const sessionToken = crypto.randomBytes(32).toString('hex');
            intakeSessions.set(sessionToken, { created: Date.now(), ip });
            return sessionToken;
          };
          const sendIntakeForm = (sessionToken) => {
            const headers = { 'Content-Type': 'text/html; charset=utf-8' };
            if (sessionToken) {
              headers['Set-Cookie'] = `${INTAKE_COOKIE}=${sessionToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(INTAKE_SESSION_MS / 1000)}`;
            }
            res.writeHead(200, headers);
            res.end(renderIntakeFormPage(shopName));
          };
          if (hasIntakeSession(req, ip)) {
            sendIntakeForm();
          } else if (!checkIntakeSessionGrantRate()) {
            res.writeHead(429, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Too many requests</title><style>${intakeSharedStyles}</style></head><body><div class="container"><div class="card"><h2 style="margin-bottom:12px;color:#f1f5f9">Too many requests</h2><p style="color:#94a3b8;line-height:1.6">Please wait a while before trying again.</p></div></div></body></html>`);
          } else {
            sendIntakeForm(grantIntakeSession());
          }

        // ── Intake session (PIN gate) ───────────────────────────
        } else if (pathname === '/api/intake/session' && req.method === 'POST') {
          const intakePin = getIntakePin();
          if (!intakePin) {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Intake PIN not configured' }));
            return;
          }
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', () => {
            try {
              const parsed = parseLanJsonBody(body, {});
              const providedPin = typeof parsed.pin === 'string' ? parsed.pin.trim() : '';
              const now = Date.now();
              const ipData = intakePinAttempts.get(ip) || { count: 0, resetAt: 0 };
              if (now < ipData.resetAt && ipData.count >= 10) {
                res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
                return;
              }
              if (!safeTokenEqual(providedPin, intakePin)) {
                const newCount = (now >= ipData.resetAt ? 0 : ipData.count) + 1;
                intakePinAttempts.set(ip, { count: newCount, resetAt: newCount >= 10 ? now + LOCKOUT_MS : ipData.resetAt });
                res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
              }
              intakePinAttempts.delete(ip);
              const sessionToken = crypto.randomBytes(32).toString('hex');
              intakeSessions.set(sessionToken, { created: Date.now(), ip });
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Set-Cookie': `${INTAKE_COOKIE}=${sessionToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(INTAKE_SESSION_MS / 1000)}`,
              });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Invalid request' }));
            }
          });

        // ── Intake form submission ──────────────────────────────
        } else if (pathname === '/api/intake' && req.method === 'POST') {
          if (!checkIntakePost(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              if (!checkIntakeSubmitRate()) {
                res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Too many submissions — try again later' }));
                return;
              }
              const parsed = parseLanJsonBody(body, {});
              // Validate required fields
              const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 200) : '';
              const description = typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 2000) : '';
              if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'name is required' }));
                return;
              }
              if (!description) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'description is required' }));
                return;
              }
              // Optional fields — sanitize
              const sanitize = (v) => typeof v === 'string' ? v.trim().slice(0, 500) : undefined;
              const email = sanitize(parsed.email);
              const phone = sanitize(parsed.phone);
              const material = sanitize(parsed.material);
              const budget = sanitize(parsed.budget);
              const dueDate = sanitize(parsed.dueDate);
              const referenceLink = sanitizeLanHttpUrl(parsed.referenceLink);
              // PDPL: the intake form is the one place a customer submits their OWN data,
              // so explicit consent is required and recorded immutably with the exact
              // notice wording they saw. See docs/KHAYT-3.0-PRIVACY-COMPLIANCE-SPEC.md.
              let consent = null;
              try {
                const privacyLib = require('./privacy.js');
                const shopName = STORE().settings?.shopName || 'this shop';
                consent = privacyLib.consentRecord(parsed.consent === true || parsed.consent === 'true', shopName, 'en');
              } catch (_) { consent = null; }
              if (!consent) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Please agree to the privacy notice to submit your request.' }));
                return;
              }
              // Store in renderer-compatible waiting-list format
              const entry = {
                id: uniqueLanId('intake'),
                project: description.slice(0, 80),  // first 80 chars as project name
                clientName: name,
                notes: description,
                email, phone, material, budget, referenceLink,
                reminderDate: dueDate || null,
                priority: 'normal',
                status: 'active',
                estValue: 0,
                source: 'intake_form',
                submittedAt: new Date().toISOString(),
                consent,
              };
              // Remove undefined keys
              Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);
              const storeData = { ...STORE() };
              storeData.waitingList = [...(STORE().waitingList || []), entry];
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-intake-submitted', entry);
              }
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Invalid request — please check your submission and try again' }));
            }
          });

        // ── Quote approval ──────────────────────────────────────
        } else if (pathname.startsWith('/order/') && req.method === 'POST') {
          const rawId = pathname.replace(/^\/order\//, '').replace(/\/?$/, '').split('/')[0];
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = parseLanJsonBody(body, {});
              if (parsed.action && parsed.action !== 'approve') {
                setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(400);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bad Request</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Invalid Action</h2><p>Unknown action. Only "approve" is supported.</p></div></body></html>`);
                return;
              }
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const idx = storeData.printLog.findIndex(o => o.id === safeId);
              if (idx === -1) {
                setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(404);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Not Found</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Order Not Found</h2><p>We could not find an order with that ID.</p></div></body></html>`);
                return;
              }
              const approvalTok = (url.searchParams.get('token') || parsed.approvalToken || '').trim();
              if (!verifyQuoteApprovalToken(storeData.printLog[idx], approvalTok)) {
                setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(403);
                res.end(`<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Invalid link</h2><p>Open the quote page from the link your shop sent you, then approve from there.</p></body></html>`);
                return;
              }
              const result = applyQuoteApprovalToStore(storeData, safeId);
              if (!result) {
                setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(404);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Not Found</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Order Not Found</h2><p>We could not find an order with that ID.</p></div></body></html>`);
                return;
              }
              if (result.error === 'expired') {
                setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(410);
                res.end(quoteExpiredHtml());
                return;
              }
              if (result.error === 'cannot_approve') {
                setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(409);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cannot Approve</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Cannot Approve</h2><p>This order is not in a state that can be approved.</p></div></body></html>`);
                return;
              }
              await persistLanStoreUpdate(storeData);
              const approved = result.order;
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', {
                  id: safeId,
                  status: 'pending',
                  clientApprovedAt: approved.clientApprovedAt,
                  quoteAcceptedAt: approved.quoteAcceptedAt,
                  quoteApproved: true,
                });
              }
              const projectName = lanEscapeHtml(approved.project || approved.id);
              setLanHtmlSecurityHeaders(res);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.writeHead(200);
              res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote Approved</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#6366f1}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Quote Approved!</h2><p>Your approval for <strong>${projectName}</strong> has been received. We'll start working on your order shortly.</p></div></body></html>`);
            } catch (e) {
              res.setHeader('Content-Type', 'application/json');
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── Salla inbound order webhook ─────────────────────────
        } else if (pathname === '/api/webhook/salla' && req.method === 'POST') {
          let bodyBuf = Buffer.alloc(0);
          req.on('data', chunk => {
            if (bodyBuf.length + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            bodyBuf = Buffer.concat([bodyBuf, chunk]);
          });
          req.on('end', async () => {
            try {
              if (isWebhookAuthLocked('salla')) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
                return;
              }
              const sallaSecret = STORE().settings?.lanApi?.sallaWebhookSecret;
              // Always require a configured secret — reject without one to prevent
              // unauthenticated order injection from any LAN host.
              if (!sallaSecret) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Salla webhook secret not configured in LAN settings' }));
                return;
              }
              const sigHeader = req.headers['x-salla-signature'] || '';
              const expected = 'sha256=' + crypto.createHmac('sha256', sallaSecret).update(bodyBuf).digest('hex');
              if (!safeTokenEqual(sigHeader, expected)) {
                recordWebhookAuthFailure('salla');
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid signature' }));
                return;
              }
              // Replay guard: drop exact duplicates of an already-seen signed body.
              if (isReplayedWebhook(sigHeader)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Duplicate delivery ignored' }));
                return;
              }
              const parsed = safeJsonParse(bodyBuf.toString('utf8'));
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const clientFirst = (parsed.data?.customer?.first_name || '').trim().slice(0, 100);
              const clientLast  = (parsed.data?.customer?.last_name  || '').trim().slice(0, 100);
              const sallaPrice  = Number(parsed.data?.total);
              const newOrder = {
                id:      uniqueLanId('salla'),
                project: `Salla: ${(parsed.data?.name || 'Order').slice(0, 100)}`,
                client:  [clientFirst, clientLast].filter(Boolean).join(' ').slice(0, 200),
                status:  'pending',
                date:    new Date().toISOString().split('T')[0],
                price:   isFinite(sallaPrice) ? sallaPrice : 0,
                notes:   `Salla order #${String(parsed.data?.reference_id || '').slice(0, 100)}`,
                source:  'salla'
              };
              storeData.printLog.unshift(newOrder);
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', newOrder);
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── Zid inbound order webhook ───────────────────────────
        } else if (pathname === '/api/webhook/zid' && req.method === 'POST') {
          let bodyBuf = Buffer.alloc(0);
          req.on('data', chunk => {
            if (bodyBuf.length + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            bodyBuf = Buffer.concat([bodyBuf, chunk]);
          });
          req.on('end', async () => {
            try {
              if (isWebhookAuthLocked('zid')) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
                return;
              }
              const zidSecret = STORE().settings?.lanApi?.zidWebhookSecret;
              // Always require a configured secret — reject without one to prevent
              // unauthenticated order injection from any LAN host.
              if (!zidSecret) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Zid webhook secret not configured in LAN settings' }));
                return;
              }
              const sigHeader = req.headers['x-zid-signature'] || '';
              const expected = 'sha256=' + crypto.createHmac('sha256', zidSecret).update(bodyBuf).digest('hex');
              if (!safeTokenEqual(sigHeader, expected)) {
                recordWebhookAuthFailure('zid');
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid signature' }));
                return;
              }
              // Replay guard: drop exact duplicates of an already-seen signed body.
              if (isReplayedWebhook(sigHeader)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Duplicate delivery ignored' }));
                return;
              }
              const parsed = safeJsonParse(bodyBuf.toString('utf8'));
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const zidPrice = Number(parsed.order?.total);
              const newOrder = {
                id:      uniqueLanId('zid'),
                project: `Zid: ${(parsed.order?.name || 'Order').slice(0, 100)}`,
                client:  (parsed.order?.customer_name || '').trim().slice(0, 200),
                status:  'pending',
                date:    new Date().toISOString().split('T')[0],
                price:   isFinite(zidPrice) ? zidPrice : 0,
                notes:   `Zid order #${String(parsed.order?.reference_id || parsed.order?.id || '').slice(0, 100)}`,
                source:  'zid'
              };
              storeData.printLog.unshift(newOrder);
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', newOrder);
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── Carrier shipping-status webhooks (SMSA / Aramex / SPL) ──
        } else if ((pathname === '/api/webhook/smsa' || pathname === '/api/webhook/aramex' || pathname === '/api/webhook/spl') && req.method === 'POST') {
          const carrierId = pathname.split('/').pop();
          let bodyBuf = Buffer.alloc(0);
          req.on('data', chunk => {
            if (bodyBuf.length + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            bodyBuf = Buffer.concat([bodyBuf, chunk]);
          });
          req.on('end', async () => {
            try {
              if (isWebhookAuthLocked(carrierId)) {
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
                return;
              }
              const secret = STORE().settings?.shipping?.[carrierId]?.webhookSecret;
              if (!secret) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Carrier webhook secret not configured in Shipping settings' }));
                return;
              }
              const sigHeader = req.headers['x-khayt-signature'] || req.headers['x-signature'] || '';
              const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyBuf).digest('hex');
              if (!safeTokenEqual(sigHeader, expected)) {
                recordWebhookAuthFailure(carrierId);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid signature' }));
                return;
              }
              if (isReplayedWebhook(sigHeader)) {
                res.writeHead(409, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Duplicate delivery ignored' }));
                return;
              }
              let carriersLib = null;
              try { carriersLib = require('../renderer/carriers.js'); } catch (_) { carriersLib = null; }
              const carrier = carriersLib ? carriersLib.getCarrier(carrierId) : null;
              const parsed = safeJsonParse(bodyBuf.toString('utf8'));
              const evt = carrier ? carrier.parseWebhook(parsed, req.headers, STORE().settings?.shipping?.[carrierId] || {}) : null;
              // Unusable payload, or unknown/deleted order → 200 + ignore (never leak existence).
              if (!evt || !evt.trackingNumber || !evt.shippingStatus) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, ignored: true }));
                return;
              }
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const idx = storeData.printLog.findIndex(o => o && o.trackingNumber && String(o.trackingNumber) === String(evt.trackingNumber));
              if (idx < 0) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
              }
              const order = { ...storeData.printLog[idx] };
              const advanced = carriersLib.advanceShippingStatus(order.shippingStatus, evt.shippingStatus);
              if (advanced !== order.shippingStatus) {
                order.shippingStatus = advanced;
                order.shippingHistory = [...(order.shippingHistory || []), { status: advanced, at: evt.at || new Date().toISOString(), source: 'webhook', note: '' }];
                if (advanced === 'delivered' && order.status === 'completed' && !order.deliveredAt) order.deliveredAt = new Date().toISOString();
                storeData.printLog[idx] = order;
                await persistLanStoreUpdate(storeData);
                if (getMainWindow() && !getMainWindow().isDestroyed()) {
                  getMainWindow().webContents.send('lan-order-updated', order);
                }
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found', endpoints: ['/api/status','/api/orders','/api/queue','/api/machines','/api/inventory','/api/waiting-list','/api/clients','/api/webhook/printer/:machineId','/calendar.ics','/intake','/api/intake','/api/webhook/salla','/api/webhook/zid','/api/webhook/smsa','/api/webhook/aramex','/api/webhook/spl'] }));
        }
      });
      lanServer.listen(port, bindHost, () => {
        const localIp = bindHost === '127.0.0.1' ? '127.0.0.1' : pickLanIPv4(os.networkInterfaces());
        resolve({
          ok: true,
          url: `http://${localIp}:${port}`,
          localIp,
          port,
          loopbackOnly: bindHost === '127.0.0.1',
          intakeTokenGenerated,
          intakePinGenerated,
          calendarTokenGenerated,
          intakePin: intakePinValue, // plaintext — renderer shows it once, then masks
          intakeToken: intakeTokenValue,
          calendarToken: calendarTokenValue,
        });
      });
      lanServer.on('error', e => {
        console.error('LAN server failed to start:', e);
        if (getMainWindow() && !getMainWindow().isDestroyed()) {
          getMainWindow().webContents.send('lan-start-failed', { error: String(e) });
        }
        resolve({ ok: false, error: String(e) });
      });
    } catch(e) {
      console.error('LAN server failed to start:', e);
      if (getMainWindow() && !getMainWindow().isDestroyed()) {
        getMainWindow().webContents.send('lan-start-failed', { error: String(e) });
      }
      resolve({ ok: false, error: String(e) });
    }
  });
});

ipcMain.handle('hub:stop-lan-server', async () => {
  if (_tunnelInstance) {
    try { _tunnelInstance.close(); } catch {}
    _tunnelInstance = null;
    if (getMainWindow() && !getMainWindow().isDestroyed()) {
      getMainWindow().webContents.send('tunnel-status-changed', { active: false });
    }
  }
  if (lanServer) { lanServer.close(); lanServer = null; }
  return { ok: true };
});

ipcMain.handle('hub:get-lan-url', async () => {
  if (!lanServer?.listening) return { ok: false };
  syncLanServerStoreFromDisk();
  const addr = lanServer.address();
  const loopbackOnly = addr?.address === '127.0.0.1' || addr?.address === '::ffff:127.0.0.1';
  const localIp = loopbackOnly ? '127.0.0.1' : pickLanIPv4(os.networkInterfaces());
  const rawPin = STORE()?.settings?.lanApi?.intakePin || '';
  const intakePin = rawPin && !isStoreSecretMasked(rawPin) ? rawPin : '';
  const rawCal = STORE()?.settings?.lanApi?.calendarToken || '';
  const calendarToken = rawCal && !isStoreSecretMasked(rawCal) ? rawCal : '';
  return {
    ok: true,
    url: `http://${localIp}:${addr?.port || 3219}`,
    port: addr?.port,
    loopbackOnly,
    intakePin,
    calendarToken,
  };
});
}

module.exports = {
  registerLanServer,
  lanEscapeHtml,
  safeTokenEqual,
  normalizePrinterEvent,
  pickLanIPv4,
  tunnelClientIp,
  scriptSafeJson,
  uniqueLanId,
  pickLanSpoolFields,
  sanitizeLanHttpUrl,
  globalAuthThrottle,
  weakTunnelPinWarning,
};
