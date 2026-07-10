'use strict';

/**
 * BedReady account link (main-process). Stores the Supabase refresh token handed over by the website's
 * bedready:// deep link (see bedready.io/app-link) and exchanges it for fresh access tokens via
 * /api/app-token, so the app stays signed in to BedReady without embedding any Supabase creds.
 *
 * Separate from Khayt Cloud (E2E shop backup) and from lib/bedready-library (which just fetches/downloads
 * given a token). Tokens live in userData/bedready-account.json (0600). Node-only.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://bedready.io';

const fileFor = (userDataDir) => path.join(userDataDir, 'bedready-account.json');

function read(userDataDir) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(userDataDir), 'utf8'));
  } catch {
    return null;
  }
}

function write(userDataDir, data) {
  try {
    fs.writeFileSync(fileFor(userDataDir), JSON.stringify(data), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function clear(userDataDir) {
  try { fs.unlinkSync(fileFor(userDataDir)); } catch { /* not linked */ }
}

/** Parse a `bedready://auth#access_token=...&refresh_token=...&expires_at=...` deep link. */
function parseDeepLink(url) {
  const s = String(url || '');
  const i = s.indexOf('#');
  if (i < 0) return null;
  const p = new URLSearchParams(s.slice(i + 1));
  const refresh = p.get('refresh_token');
  if (!refresh) return null;
  const exp = parseInt(p.get('expires_at') || '', 10);
  return { access: p.get('access_token') || '', refresh, expires: Number.isFinite(exp) ? exp : 0 };
}

/** Persist tokens from a successful link. Returns true on success. */
function link(userDataDir, tokens) {
  if (!tokens || !tokens.refresh) return false;
  return write(userDataDir, { access: tokens.access || '', refresh: tokens.refresh, expires: tokens.expires || 0 });
}

const isLinked = (userDataDir) => !!(read(userDataDir) || {}).refresh;

/**
 * Return a valid access token, refreshing via /api/app-token when it's expired or within 60s of expiry.
 * A rotated refresh token (if the server returns one) is stored. Throws (and clears a dead link on 401).
 */
async function getAccessToken(userDataDir, now = Math.floor(Date.now() / 1000)) {
  const d = read(userDataDir);
  if (!d || !d.refresh) throw new Error('Not linked. Connect the app from bedready.io/app-link.');
  if (d.access && d.expires && d.expires - now > 60) return d.access;

  const res = await fetch(BASE + '/api/app-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: d.refresh }),
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 401) {
    clear(userDataDir);
    throw new Error('Your BedReady link expired — reconnect from bedready.io/app-link.');
  }
  if (!res.ok) throw new Error('Could not refresh your BedReady session (HTTP ' + res.status + ').');
  const j = await res.json().catch(() => null);
  if (!j || !j.access_token) throw new Error('Could not refresh your BedReady session.');
  write(userDataDir, { access: j.access_token, refresh: j.refresh_token || d.refresh, expires: j.expires_at || 0 });
  return j.access_token;
}

module.exports = { parseDeepLink, link, isLinked, getAccessToken, clear, read, fileFor, BASE };
