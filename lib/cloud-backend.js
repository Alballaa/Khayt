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

/**
 * When a delta chain has to be reset by a full push.
 *
 * A chain cannot grow forever: a cold device pays for the base PLUS every delta
 * ever appended, and every delta in that pull is one decrypt. Two bounds, and
 * whichever binds first wins.
 *
 * **COMPACT_RATIO — chain bytes ≤ R × base bytes.** Derived rather than picked
 * (`scripts/cloud-cost-model.mjs`): a shop sends `R × base / delta` deltas per
 * cycle and then one base, so
 *
 *     push bytes/month = saves × delta × (1 + 1/R)
 *
 * The store size **cancels**. R alone fixes the push cost as a multiple of the
 * ideal, identically for a hobbyist and a farm, and what it trades against is
 * the cold pull, bounded by `base × (1 + R)`. R = 2 costs 1.50× the ideal for a
 * cold pull of at most 3× a blob — the knee of that curve. R = 10 saves another
 * 0.4× on push and costs 11× on a cold pull, which is a bad trade.
 *
 * **MAX_CHAIN_DELTAS — an absolute count.** The ratio self-scales by store size,
 * which is right for bytes and wrong for TIME: at R = 2 a busy shop would reach
 * ~3,850 deltas, i.e. 3,850 decrypts on a cold pull. The cap bounds that at a
 * fixed latency for every shop. For a small shop the ratio binds first and the
 * cap never applies, which is the intended division of labour.
 */
const COMPACT_RATIO = 2;
const MAX_CHAIN_DELTAS = 1000;

/**
 * A failure the shop can act on, rather than a number it cannot.
 *
 * Every non-200 here used to become `push failed: HTTP 413` — and 413 is the
 * plan's size limit, which the server already explains in words the owner can do
 * something about. The badge then said "Sync error" and nothing else, so a shop
 * that had outgrown its plan saw a red light with no reason and no next step,
 * indefinitely. Same for the 412 a build that cannot read a delta chain gets: the
 * whole point of failing loudly is lost if the loud part is a status code.
 *
 * The code is kept as well — it is what a bug report needs — but the server's
 * sentence leads, because that is the half a shop can act on.
 */
function httpFailure(what, res) {
  const said = res && res.body && typeof res.body.error === 'string' && res.body.error.trim();
  const code = `HTTP ${res && res.status}`;
  return new Error(said ? `${what}: ${said} (${code})` : `${what}: ${code}`);
}

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
   * The store as the server holds it at `lastServerRev` — the thing `?since=`
   * folds onto. null = cold: ask for the base and the whole chain.
   *
   * It has to be its OWN copy, and that is the entire difficulty of the warm
   * pull. The tempting target is the local store, and it is quietly wrong:
   * `applyDeltas` assigns records by reference (`arr[i] = incoming`), and the
   * local store carries edits the server has never seen. Fold onto it and the
   * following `markAllPushed` records those local-only records as already sent,
   * so they never ship again — a data-loss bug wearing the costume of an
   * optimisation.
   *
   * So it is cloned on the way IN (nothing the caller holds can reach into it)
   * and on the way OUT (the caller merges the returned store into local state by
   * reference, and must not thereby be editing our copy of the server's).
   *
   * INVARIANT: `serverView` and `lastServerRev` move together or not at all. A
   * view that lags its rev is worse than no view — `?since=rev` would return the
   * empty slice the server correctly considers complete, and the fold would hand
   * back a store missing everything between the two.
   */
  let serverView = null;

  /**
   * Deep copy. JSON round-trip rather than structuredClone because it is exactly
   * what the wire does: the store is JSON on the way to `encryptStore` and comes
   * back JSON-parsed from `decryptStore`, so anything this would drop has already
   * been dropped by the time it could matter.
   */
  const clone = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));

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

  /** Wire size of the base this backend last published, and the chain on top. */
  let baseWireBytes = 0;
  let chainWireBytes = 0;
  let chainCount = 0;

  const wireSize = (body) => {
    try { return JSON.stringify(body).length; } catch (e) { return 0; }
  };

  /**
   * Has the chain earned a full push? See COMPACT_RATIO / MAX_CHAIN_DELTAS.
   *
   * Unknown base size means the chain cannot be judged against anything, so the
   * count cap is the only guard — never "no opinion", which would let a chain
   * run away on exactly the path where state was lost.
   */
  function shouldCompact() {
    if (chainCount >= MAX_CHAIN_DELTAS) return true;
    if (!baseWireBytes) return false;
    return chainWireBytes > COMPACT_RATIO * baseWireBytes;
  }

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
   *
   * Asks for `?since=` whenever it holds a server view, which is a requirement
   * rather than an optimisation: without it every pull re-downloads the base AND
   * the whole chain, which makes pulls WORSE than blob-only and can cancel the
   * push saving on its own.
   *
   * Which reply came back is decided by the presence of `ciphertext`, not by
   * what was asked for. The server includes the base exactly when the caller is
   * behind it, so a chain that was compacted while this device was away arrives
   * as a cold reply on its own and needs no special case here.
   */
  async function pull() {
    statusVal = 'syncing';
    try {
      const warm = !!serverView && lastServerRev > 0;
      const res = await transport({
        method: 'GET',
        path: `/v1/shops/${shopId}/store` + (warm ? `?since=${lastServerRev}` : ''),
      });
      if (res.status === 204) { statusVal = 'idle'; return { store: null, rev: lastServerRev }; }
      if (res.status !== 200) throw httpFailure('pull failed', res);
      const { ciphertext, rev, deltas } = res.body || {};

      let base;
      if (ciphertext !== undefined && ciphertext !== null) {
        base = crypto.decryptStore(ciphertext, getDek());   // throws on wrong key / tamper
      } else if (warm) {
        // A warm reply deliberately carries no base: the whole point is to fold
        // onto what we already hold. Clone on the way in so folding cannot touch
        // the retained view until we choose to adopt the result.
        base = clone(serverView);
      } else {
        // Asked for everything and got no base. Refusing beats guessing, for the
        // same reason foldDeltas refuses: a store built on the wrong base is
        // missing exactly the edits this module exists to protect.
        throw new Error('pull returned no base and no server view to fold onto');
      }

      const store = foldDeltas(base, deltas);
      const slice = Array.isArray(deltas) ? deltas : [];
      lastServerRev = rev || 0;
      // Whatever we just folded is what the server has, so it is both the
      // baseline the next delta is measured against and the next `?since=` base.
      serverView = store;
      markAllPushed(serverView);

      if (ciphertext !== undefined && ciphertext !== null) {
        // A cold reply shows the whole chain, so adopt it outright — it may be
        // longer than anything this backend appended, because another device
        // pushes onto the same chain.
        baseWireBytes = wireSize({ ciphertext, baseRev: 0 });
        chainCount = slice.length;
        chainWireBytes = slice.reduce((n, d) => n + wireSize(d), 0);
      } else {
        // A warm reply shows only what is NEWER than `since`, so these ADD to
        // what was already known. Replacing them would undercount the chain and
        // let it run past MAX_CHAIN_DELTAS without ever asking for compaction.
        // The base is untouched by any of this, so its size still stands.
        chainCount += slice.length;
        chainWireBytes += slice.reduce((n, d) => n + wireSize(d), 0);
      }
      statusVal = 'idle';
      // Out by clone as well: the caller merges this into local state by
      // reference, and those records must not be ours.
      return { store: clone(store), rev: lastServerRev };
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
      if (canWriteDeltas() && lastServerRev > 0 && serverTakesDeltas !== false && !shouldCompact()) {
        const sent = await pushDelta(snapshot);
        if (sent) return sent;   // null = server cannot take deltas; fall through to the blob
      }
      const ciphertext = crypto.encryptStore(snapshot, getDek());
      const blobBody = { ciphertext, baseRev: lastServerRev };
      const res = await transport({
        method: 'PUT',
        path: `/v1/shops/${shopId}/store`,
        body: blobBody,
      });
      if (res.status === 409) {
        statusVal = 'idle';
        return { conflict: true, serverRev: (res.body && res.body.rev) || 0 };
      }
      if (res.status !== 200) throw httpFailure('push failed', res);
      lastServerRev = (res.body && res.body.rev) || 0;
      // A full push republishes the base and compacts the chain, so everything
      // in this snapshot now counts as sent.
      markAllPushed(snapshot);
      // The server now holds exactly this, so the view moves with the rev — by
      // clone, because the caller goes on editing the snapshot it handed us.
      serverView = clone(snapshot);
      // The chain is gone and this is the base everything is now measured from.
      baseWireBytes = wireSize(blobBody);
      chainWireBytes = 0;
      chainCount = 0;
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
    const deltaBody = { ciphertext: crypto.encryptStore(payload, getDek()), baseRev: lastServerRev };
    const res = await transport({
      method: 'POST',
      path: `/v1/shops/${shopId}/deltas`,
      body: deltaBody,
    });
    // No such route on a Phase 1 server. Remember it, so this costs one probe
    // per session rather than a wasted round trip on every save.
    if (res.status === 404 || res.status === 405) { serverTakesDeltas = false; return null; }
    serverTakesDeltas = true;
    if (res.status === 409) {
      statusVal = 'idle';
      return { conflict: true, serverRev: (res.body && res.body.rev) || 0 };
    }
    if (res.status !== 200) throw httpFailure('delta push failed', res);
    lastServerRev = (res.body && res.body.rev) || 0;
    markAllPushed(snapshot);
    // Mirror onto the view exactly what the server appended — the same payload,
    // not the whole snapshot. `settings` is not delta-covered, so the server's
    // copy of it is unchanged and the view's has to be too, or the next warm
    // pull would report a settings change the server never received.
    if (serverView) sync.applyDeltas(serverView, clone(payload), { appendOnly: [] });
    chainWireBytes += wireSize(deltaBody);
    // Prefer the server's count: another device may have appended to the same
    // chain, and this backend would otherwise only ever see its own.
    chainCount = (res.body && Number.isFinite(res.body.deltaCount))
      ? res.body.deltaCount : chainCount + 1;
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
    // Moving the rev by hand invalidates the view: the two must agree, and this
    // cannot know what store the new rev corresponds to. Cold is always safe.
    _setServerRev(r) { lastServerRev = r | 0; serverView = null; },
    // Introspection for tests and for the sync UI, which will need to say which
    // protocol a shop is actually on once delta writes are switchable.
    writesDeltas() { return canWriteDeltas(); },
    pushedCount() { return pushedRevs.size; },
    /** Whether the next pull can ask for `?since=` — i.e. whether it is warm. */
    isWarm() { return !!serverView && lastServerRev > 0; },
    chainState() { return { baseWireBytes, chainWireBytes, chainCount, dueForCompaction: shouldCompact() }; },
  };
}

module.exports = { createCloudBackend, DELTA_WRITES, COMPACT_RATIO, MAX_CHAIN_DELTAS };
