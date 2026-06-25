'use strict';

/**
 * Desktop-side Khayt Cloud sync client (Phase 1, blob-first, single writer).
 * See docs/KHAYT-3.0-PHASE1-SPEC.md §5.
 *
 * Implements the Phase 0 SyncBackend shape (pushDeltas / pullDeltas / status)
 * over a blob-first protocol: the whole store is end-to-end encrypted (via the
 * injected `crypto` = lib/sync-crypto) and pushed with an optimistic `rev` guard.
 * The desktop is the single writer, so a 409 (another device pushed) is the rare
 * safety-net path: caller pulls, merges, and re-pushes.
 *
 * Pure and testable by construction: `transport` is injected (HTTP in the app,
 * an in-memory server in tests), so this module makes NO hosting assumptions and
 * holds no secrets — the DEK is supplied per call via `getDek()`.
 *
 *   transport({ method, path, headers?, body? }) -> { status, headers?, body? }
 */
function createCloudBackend({ transport, crypto, shopId, getDek }) {
  if (typeof transport !== 'function') throw new Error('transport function required');
  if (!crypto || typeof crypto.encryptStore !== 'function') throw new Error('crypto (sync-crypto) required');
  if (!shopId) throw new Error('shopId required');
  if (typeof getDek !== 'function') throw new Error('getDek() required');

  let lastServerRev = 0;
  let statusVal = 'idle';

  async function pull() {
    statusVal = 'syncing';
    try {
      const res = await transport({ method: 'GET', path: `/v1/shops/${shopId}/store` });
      if (res.status === 204) { statusVal = 'idle'; return { store: null, rev: lastServerRev }; }
      if (res.status !== 200) throw new Error(`pull failed: HTTP ${res.status}`);
      const { ciphertext, rev } = res.body || {};
      const store = crypto.decryptStore(ciphertext, getDek()); // throws on wrong key / tamper
      lastServerRev = rev || 0;
      statusVal = 'idle';
      return { store, rev: lastServerRev };
    } catch (e) {
      statusVal = 'error';
      throw e;
    }
  }

  /**
   * Push the whole store as an encrypted blob with an optimistic rev guard.
   * Returns { conflict:false, rev } on success, or { conflict:true, serverRev }
   * if the server's rev moved (caller should pull → merge → re-push).
   */
  async function push(snapshot) {
    statusVal = 'syncing';
    try {
      const ciphertext = crypto.encryptStore(snapshot, getDek());
      const res = await transport({
        method: 'PUT',
        path: `/v1/shops/${shopId}/store`,
        body: { ciphertext, baseRev: lastServerRev },
      });
      if (res.status === 409) {
        statusVal = 'idle';
        return { conflict: true, serverRev: (res.body && res.body.rev) || 0 };
      }
      if (res.status !== 200) throw new Error(`push failed: HTTP ${res.status}`);
      lastServerRev = (res.body && res.body.rev) || 0;
      statusVal = 'idle';
      return { conflict: false, rev: lastServerRev };
    } catch (e) {
      statusVal = 'error';
      throw e;
    }
  }

  /** List the shop's server-side snapshot history (metadata only — no ciphertext).
   *  Returns [{ id, rev, createdAt, bytes }] newest-first. */
  async function listSnapshots() {
    const res = await transport({ method: 'GET', path: `/v1/shops/${shopId}/snapshots` });
    if (res.status !== 200) throw new Error(`snapshots list failed: HTTP ${res.status}`);
    return (res.body && res.body.snapshots) || [];
  }

  /** Fetch one snapshot and decrypt it with the DEK → { store, rev, createdAt }.
   *  Returns null if the snapshot no longer exists (404). Throws on wrong key/tamper. */
  async function getSnapshot(id) {
    const res = await transport({ method: 'GET', path: `/v1/shops/${shopId}/snapshots/${id}` });
    if (res.status === 404) return null;
    if (res.status !== 200) throw new Error(`snapshot get failed: HTTP ${res.status}`);
    const { ciphertext, rev, createdAt } = res.body || {};
    const store = crypto.decryptStore(ciphertext, getDek()); // throws on wrong key / tamper
    return { store, rev: rev || 0, createdAt: createdAt || null };
  }

  return {
    name: 'cloud',
    // Phase 0 SyncBackend interface
    pushDeltas(snapshot) { return push(snapshot); },
    pullDeltas() { return pull(); },
    status() { return statusVal; },
    // blob-first helpers / introspection
    push,
    pull,
    listSnapshots,
    getSnapshot,
    serverRev() { return lastServerRev; },
    _setServerRev(r) { lastServerRev = r | 0; },
  };
}

module.exports = { createCloudBackend };
