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
const { resolvesToBlockedHost } = require('./host-guard');

const BASE = 'https://bedready.io';
const MAX_FILE_BYTES = 512 * 1024 * 1024; // 512 MB ceiling per design file (3MF/STL/OBJ/STEP)

/**
 * Reject a download URL that isn't HTTPS or resolves to a private/loopback/metadata address (SSRF).
 * `downloadUrl` comes from the /api/library response and is relayed back through the renderer, so the
 * privileged main process must not blindly fetch it — this mirrors the host-guard already applied to
 * every other outbound surface (webhooks, SMTP, printer polling, etc.).
 */
async function assertSafeDownloadUrl(url) {
  let u;
  try { u = new URL(String(url || '')); } catch { throw new Error('That design has an invalid download URL.'); }
  if (u.protocol !== 'https:') throw new Error('Refusing a non-HTTPS download URL.');
  if (await resolvesToBlockedHost(u.hostname)) throw new Error('Refusing a download from a private/internal address.');
}

/**
 * Fetch a download URL, following redirects MANUALLY so every hop is re-validated by
 * assertSafeDownloadUrl. undici's default `redirect:'follow'` would let a 3xx bounce the
 * request past the initial guard to a private/loopback/metadata address (SSRF) — the same
 * hole the outbound webhook handlers avoid with `redirect:'manual'`. Bounded to maxHops so a
 * redirect loop can't spin forever; the caller's abort signal covers the whole chain.
 */
async function safeFetchDownload(url, signal, maxHops = 5) {
  let current = String(url);
  for (let hop = 0; ; hop++) {
    await assertSafeDownloadUrl(current);
    const res = await fetch(current, { signal, redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get('location');
    if (!loc) return res; // 3xx with no target — let the caller surface the non-ok status
    if (hop >= maxHops) throw new Error('Too many redirects while downloading that design.');
    try { current = new URL(loc, current).toString(); }
    catch { throw new Error('That design has an invalid download URL.'); }
  }
}

/**
 * Resolve a collision-free destination path within a single download batch. safeBase() collapses
 * distinct titles (punctuation stripped, truncated to 60 chars), so two library designs can map to
 * the same filename — without this, the second write would silently clobber the first while the UI
 * still reported both as saved. `used` tracks paths already claimed this batch; a taken name gets a
 * " (n)" suffix. (Re-downloading the SAME design across batches still overwrites, which is intended.)
 */
function uniqueDest(destDir, base, ext, used) {
  let full = path.join(destDir, base + ext);
  if (used) {
    let i = 1;
    while (used.has(full)) { full = path.join(destDir, base + ' (' + i + ')' + ext); i++; }
    used.add(full);
  }
  return full;
}

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
async function downloadItem(item, destDir, used) {
  if (!item || !item.downloadUrl) return null;
  const tooLarge = '"' + (item.title || item.slug) + '" is too large to download.';
  // Own AbortController so we can tear the connection down the instant the body
  // exceeds the cap; combine with a wall-clock timeout via AbortSignal.any.
  const ac = new AbortController();
  // safeFetchDownload re-validates every redirect hop (guards the initial URL too).
  const res = await safeFetchDownload(item.downloadUrl, AbortSignal.any([ac.signal, AbortSignal.timeout(120000)]));
  if (!res.ok) throw new Error('Download failed for "' + (item.title || item.slug) + '" (HTTP ' + res.status + ').');
  // Trust the declared size as a cheap first gate, but never rely on it: a server can lie
  // about (or omit) content-length. Stream the body with a running byte counter and abort
  // the moment it crosses MAX_FILE_BYTES, so one design file can't exhaust memory/disk.
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_FILE_BYTES) throw new Error(tooLarge);
  const chunks = [];
  let total = 0;
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_FILE_BYTES) {
          try { ac.abort(); } catch { /* already torn down */ }
          try { await reader.cancel(); } catch { /* best effort */ }
          throw new Error(tooLarge);
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      try { reader.releaseLock(); } catch { /* stream already closed */ }
    }
  } else {
    // Environments without a streaming body (older runtimes): fall back to the buffered read,
    // still bounded by the post-facto length check.
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) throw new Error(tooLarge);
    chunks.push(buf);
    total = buf.length;
  }
  await fs.promises.mkdir(destDir, { recursive: true });
  const out = uniqueDest(destDir, safeBase(item.title), extFor(item), used);
  await fs.promises.writeFile(out, Buffer.concat(chunks, total));
  return out;
}

/** Download every item that has a file, into destDir. Never throws for one bad item — collects results. */
async function downloadAll(items, destDir) {
  const saved = [], skipped = [], failed = [];
  const used = new Set(); // claimed output paths, so same-named designs don't clobber each other
  for (const it of items || []) {
    if (!it || !it.downloadUrl) { skipped.push(it && (it.title || it.slug)); continue; }
    try {
      const p = await downloadItem(it, destDir, used);
      if (p) saved.push(p); else skipped.push(it.title || it.slug);
    } catch (e) {
      failed.push({ title: it.title || it.slug, error: e && e.message ? e.message : String(e) });
    }
  }
  return { saved, skipped, failed };
}

/** Where the user connects the app (deep-link handoff page). */
const signInUrl = () => BASE + '/app-link';

module.exports = { fetchLibrary, downloadItem, downloadAll, signInUrl, safeBase, extFor, BASE };
