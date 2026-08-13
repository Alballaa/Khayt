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
/**
 * Delta writes are OFF, and this is the readers-first half of the rollout.
 *
 * A push today ships the whole store. Measured on a real store, that is 9,590 B
 * where the record that actually changed is 1,134 B — and the gap widens every
 * month a shop operates, because blob cost is `store size × saves` while delta
 * cost is flat. docs/KHAYT-CLOUD-COST-PER-SHOP.md §4.
 *
 * Turning it on is NOT a one-line flip, and the reason is worth stating where
 * the flag is rather than in a document nobody reads first. A shop can be
 * running several desktops on different versions. If the server holds
 * `base + deltas` and an OLD desktop pulls, it gets the base alone — a store
 * that is silently missing every delta — merges into it, and pushes the result
 * as a full blob. That push is well-formed and its baseRev is correct, so
 * nothing rejects it, and the newer edits are gone.
 *
 * That is worse than the compression rollout it otherwise resembles: a beta.16
 * client hitting a gzipped blob simply STOPS syncing, loudly. This one keeps
 * working and eats data.
 *
 * So the ordering is: ship the reader (this), let it reach the field, and only
 * then let anything write deltas — and even then the server has to refuse a
 * delta push for a shop that still has a blob-only device attached, which is a
 * server-side decision this module cannot make on its own.
 */
const DELTA_WRITES = false;

function createCloudBackend({ transport, crypto, shopId, getDek, sync, deltaWrites }) {
  if (typeof transport !== 'function') throw new Error('transport function required');
  if (!crypto || typeof crypto.encryptStore !== 'function') throw new Error('crypto (sync-crypto) required');
  if (!shopId) throw new Error('shopId required');
  if (typeof getDek !== 'function') throw new Error('getDek() required');

  let lastServerRev = 0;
  let statusVal = 'idle';
  /** null = not yet probed; false = server is blob-only, stop asking. */
  let serverTakesDeltas = null;

  /**
   * What this backend has already sent the server: `collection:id -> rev`, plus
   * the tombstones it has sent.
   *
   * It is NOT a cursor, and that is the whole point. The obvious implementation
   * — `extractDeltas(snapshot, maxCursor(lastPushed))` — is broken, because
   * `rev` is a PER-RECORD counter rather than a global sequence. `maxCursor`
   * returns the largest rev in the store, so in a store whose records sit at
   * rev 1, a brand-new record also arrives at rev 1 and `rev > since.rev` is
   * false: the new record is invisible and never ships.
   *
   * The existing engine tests did not catch this because they extract from
   * `{rev: 0}`, which selects everything and never exercises the comparison.
   *
   * Comparing each record's rev against the rev we last sent has no such
   * failure mode: it asks "is this the version they have?", which is the actual
   * question, and it needs nothing global.
   */
  let pushedRevs = new Map();
  let pushedTombs = new Set();

  const META = new Set(['tombstones', 'settings', 'meta']);
  const collectionsOf = (snapshot) => Object.keys(snapshot)
    .filter((k) => !META.has(k) && Array.isArray(snapshot[k]));
  const keyOf = (coll, rec) => coll + ':' + (rec && rec.id);

  /** Record everything in `snapshot` as sent — after a full push, or a pull. */
  function markAllPushed(snapshot) {
    pushedRevs = new Map();
    pushedTombs = new Set();
    if (!snapshot || typeof snapshot !== 'object') return;
    for (const coll of collectionsOf(snapshot)) {
      for (const rec of snapshot[coll]) {
        if (rec && typeof rec === 'object') pushedRevs.set(keyOf(coll, rec), rec.rev || 0);
      }
    }
    for (const t of (Array.isArray(snapshot.tombstones) ? snapshot.tombstones : [])) {
      if (t) pushedTombs.add(keyOf(t.collection, t));
    }
  }

  /**
   * Everything the server does not yet have, in the shape applyDeltas consumes.
   * `settings` is not an array collection, so it is not covered here — a
   * settings change still needs a full push, which is why compaction exists.
   */
  function changesSincePush(snapshot) {
    const deltas = [];
    for (const coll of collectionsOf(snapshot)) {
      for (const rec of snapshot[coll]) {
        if (!rec || typeof rec !== 'object') continue;
        if (pushedRevs.get(keyOf(coll, rec)) !== (rec.rev || 0)) deltas.push({ collection: coll, record: rec });
      }
    }
    const tombstones = (Array.isArray(snapshot.tombstones) ? snapshot.tombstones : [])
      .filter((t) => t && !pushedTombs.has(keyOf(t.collection, t)));
    return { deltas, tombstones, cursor: { rev: 0, ts: '' } };
  }

  /** Delta writes need both the engine and the switch; either missing = blob. */
  const canWriteDeltas = () =>
    !!sync && typeof sync.applyDeltas === 'function'
    && (typeof deltaWrites === 'boolean' ? deltaWrites : DELTA_WRITES);

  /**
   * Fold an encrypted delta chain onto a decrypted base.
   *
   * Each entry is its own ciphertext, so the server stores and returns opaque
   * items and never learns what changed — only that something did, and how big
   * it was. Order is the server's rev order, which is a total order because the
   * optimistic guard refuses anything built on a stale head.
   */
  function foldDeltas(base, deltas) {
    if (!Array.isArray(deltas) || !deltas.length) return base;
    if (!sync || typeof sync.applyDeltas !== 'function') {
      // Refusing beats guessing: a store folded without the engine would be
      // missing exactly the newest edits, which is the failure this whole
      // module is arranged to prevent.
      throw new Error('server returned deltas but no sync engine is available to fold them');
    }
    let store = base;
    for (const d of deltas) {
      const payload = crypto.decryptStore(d.ciphertext, getDek()); // throws on wrong key / tamper
      sync.applyDeltas(store, payload, { appendOnly: [] });
    }
    return store;
  }

  /**
   * Pull the store. Understands both shapes: the blob a Phase 1 server returns,
   * and a `{ ciphertext, deltas: [...] }` chain from a delta-capable one.
   */
  async function pull() {
    statusVal = 'syncing';
    try {
      const res = await transport({ method: 'GET', path: `/v1/shops/${shopId}/store` });
      if (res.status === 204) { statusVal = 'idle'; return { store: null, rev: lastServerRev }; }
      if (res.status !== 200) throw new Error(`pull failed: HTTP ${res.status}`);
      const { ciphertext, rev, deltas } = res.body || {};
      const base = crypto.decryptStore(ciphertext, getDek()); // throws on wrong key / tamper
      const store = foldDeltas(base, deltas);
      lastServerRev = rev || 0;
      // Whatever we just folded is what the server has, so it is the baseline
      // the next delta is measured against.
      markAllPushed(store);
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
      if (canWriteDeltas() && lastServerRev > 0 && serverTakesDeltas !== false) {
        const sent = await pushDelta(snapshot);
        if (sent) return sent;   // null = server cannot take deltas; fall through to the blob
      }
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
      // A full push republishes the base and compacts the chain, so everything
      // in this snapshot now counts as sent.
      markAllPushed(snapshot);
      statusVal = 'idle';
      return { conflict: false, rev: lastServerRev };
    } catch (e) {
      statusVal = 'error';
      throw e;
    }
  }

  /**
   * Push only what changed since the last successful push, as its own ciphertext.
   *
   * Returns the same shape as push() on success, or **null** when the server has
   * no delta endpoint — the caller then sends the whole blob, which is why a
   * Phase 1 server needs no flag and no version negotiation to keep working.
   *
   * The cursor advances only on success. A delta that was rejected or never
   * arrived must stay in the next payload, or the change it carried is lost from
   * every device that was not the one holding it.
   */
  async function pushDelta(snapshot) {
    const payload = changesSincePush(snapshot);
    if (!payload.deltas.length && !payload.tombstones.length) {
      statusVal = 'idle';
      return { conflict: false, rev: lastServerRev, noop: true };
    }
    const res = await transport({
      method: 'POST',
      path: `/v1/shops/${shopId}/deltas`,
      body: { ciphertext: crypto.encryptStore(payload, getDek()), baseRev: lastServerRev },
    });
    // No such route on a Phase 1 server. Remember it, so this costs one probe
    // per session rather than a wasted round trip on every save.
    if (res.status === 404 || res.status === 405) { serverTakesDeltas = false; return null; }
    serverTakesDeltas = true;
    if (res.status === 409) {
      statusVal = 'idle';
      return { conflict: true, serverRev: (res.body && res.body.rev) || 0 };
    }
    if (res.status !== 200) throw new Error(`delta push failed: HTTP ${res.status}`);
    lastServerRev = (res.body && res.body.rev) || 0;
    markAllPushed(snapshot);
    statusVal = 'idle';
    return { conflict: false, rev: lastServerRev, delta: true };
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
    // Introspection for tests and for the sync UI, which will need to say which
    // protocol a shop is actually on once delta writes are switchable.
    writesDeltas() { return canWriteDeltas(); },
    pushedCount() { return pushedRevs.size; },
  };
}

module.exports = { createCloudBackend, DELTA_WRITES };
