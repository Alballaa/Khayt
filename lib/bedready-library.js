'use strict';

/**
 * BedReady library client (main-process). Pulls the signed-in user's saved designs from bedready.io
 * (GET /api/library) using their BedReady access token, and downloads the files locally. This is the
 * desktop side of site↔app library sync.
 *
 * Deliberately SEPARATE from Khayt Cloud (lib/cloud-client): Khayt Cloud is E2E-encrypted shop-data
 * backup across the user's devices; this is a read-only pull of the user's *public* BedReady library
 * (their saved designs). Different identity, different data, no crossover.
 *
 * Auth: the user signs in on bedready.io (openSignIn opens it in the system browser) and supplies their
 * access token; we send it as a Bearer to /api/library. No Supabase SDK or secrets live in the app.
 * Node-only (uses Node fetch + fs) — never loaded in the renderer.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://bedready.io';

/** GET /api/library → array of items. Throws with a user-facing message on failure. */
async function fetchLibrary(token) {
  const t = String(token || '').trim();
  if (!t) throw new Error('Sign in to BedReady first, then paste your access token.');
  const res = await fetch(BASE + '/api/library', {
    headers: { authorization: 'Bearer ' + t },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 401) throw new Error('Your BedReady session expired — sign in again.');
  if (!res.ok) throw new Error('Library fetch failed (HTTP ' + res.status + ').');
  const data = await res.json().catch(() => null);
  return data && Array.isArray(data.items) ? data.items : [];
}

/** Turn a design title into a safe filename base. */
function safeBase(s) {
  return String(s || 'design').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'design';
}

/** Pick a file extension from the item's declared type, else its filename, else .3mf. */
function extFor(item) {
  if (item && item.fileType && /^(3mf|stl|obj|step)$/i.test(item.fileType)) return '.' + item.fileType.toLowerCase();
  const e = item && item.filename ? path.extname(item.filename) : '';
  return e || '.3mf';
}

/**
 * Download one item's file into destDir. Returns the written path, or null when the item has no
 * downloadable file (age-gated NSFW, or a link-only design).
 */
async function downloadItem(item, destDir) {
  if (!item || !item.downloadUrl) return null;
  const res = await fetch(item.downloadUrl, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error('Download failed for "' + (item.title || item.slug) + '" (HTTP ' + res.status + ').');
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.mkdir(destDir, { recursive: true });
  const out = path.join(destDir, safeBase(item.title) + extFor(item));
  await fs.promises.writeFile(out, buf);
  return out;
}

/** Download every item that has a file, into destDir. Never throws for one bad item — collects results. */
async function downloadAll(items, destDir) {
  const saved = [], skipped = [], failed = [];
  for (const it of items || []) {
    if (!it || !it.downloadUrl) { skipped.push(it && (it.title || it.slug)); continue; }
    try {
      const p = await downloadItem(it, destDir);
      if (p) saved.push(p); else skipped.push(it.title || it.slug);
    } catch (e) {
      failed.push({ title: it.title || it.slug, error: e && e.message ? e.message : String(e) });
    }
  }
  return { saved, skipped, failed };
}

/** Where the user signs in / copies their access token. */
const signInUrl = () => BASE + '/account';

module.exports = { fetchLibrary, downloadItem, downloadAll, signInUrl, safeBase, extFor, BASE };
