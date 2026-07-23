/**
 * Sync foundation (Phase 0) — local change-tracking, deltas, and the Sync Engine
 * interface. See docs/KHAYT-3.0-PHASE0-SPEC.md.
 *
 * Cloud-independent by construction: with the default LocalBackend (no-op) this
 * only stamps per-record change metadata (`rev` + `updatedAt`), records
 * tombstones for deletes, and can extract/apply deltas — enabling incremental
 * backups today and cloud sync later. No cloud code lives here.
 *
 * The change-stamper runs at the single save choke point (`_doSave`) and mutates
 * records in place; because the snapshot shares record references with live
 * state, stamping the snapshot stamps the persisted records.
 */
(function (global) {
  'use strict';

  const SCHEMA = 1;
  // Collections that are NOT stamped/tombstoned (meta collections we manage).
  const META_COLLECTIONS = new Set(['tombstones']);
  // Reserved fields excluded from a record's content fingerprint, so stamping
  // them never counts as a content change (the critical idempotency property).
  const RESERVED = new Set(['rev', 'updatedAt']);

  let lastIndex = new Map();   // "collection:id" -> content fingerprint
  let backend = null;          // null => LocalBackend (cloud off)
  let statusVal = 'off';

  function nowIso() { return new Date().toISOString(); }

  /** Deterministic, key-sorted serialization (stable across key insertion order). */
  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }

  /** Content fingerprint of a record, excluding the reserved change-metadata fields. */
  function fingerprint(rec) {
    const o = {};
    for (const k of Object.keys(rec)) {
      if (RESERVED.has(k)) continue;
      o[k] = rec[k];
    }
    return stableStringify(o);
  }

  /** Array collections in a snapshot, excluding meta collections (e.g. tombstones). */
  function arrayCollections(snapshot) {
    const out = [];
    for (const k of Object.keys(snapshot)) {
      if (META_COLLECTIONS.has(k)) continue;
      if (Array.isArray(snapshot[k])) out.push(k);
    }
    return out;
  }

  /** A record's revision, treating anything missing or malformed as 0. */
  function revOf(rec) {
    return (rec && typeof rec.rev === 'number' && rec.rev > 0) ? rec.rev : 0;
  }

  function ensureId(rec, coll) {
    if (typeof rec.id === 'string' && rec.id) return rec.id;
    const prefix = String(coll).slice(0, 3).toUpperCase() || 'REC';
    rec.id = (typeof global.uid === 'function')
      ? global.uid(prefix)
      : prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5).toUpperCase();
    return rec.id;
  }

  /**
   * Seed the in-memory index from current state WITHOUT bumping anything.
   * Call after load so the next save doesn't see every record as "new".
   */
  function seedIndex(snapshot) {
    const idx = new Map();
    for (const coll of arrayCollections(snapshot)) {
      for (const rec of snapshot[coll]) {
        if (!rec || typeof rec !== 'object') continue;
        ensureId(rec, coll);
        // {fp, rev}: the rev is needed later to stamp a tombstone with the
        // version being deleted, so a stale delete can't outrank a newer edit.
        idx.set(coll + ':' + rec.id, { fp: fingerprint(rec), rev: revOf(rec) });
      }
    }
    lastIndex = idx;
    return idx.size;
  }

  /**
   * One-time backfill (idempotent): give every record a stable id, and records
   * lacking change metadata `rev:1` + `updatedAt`. Safe to run on every load.
   * Returns the count of records that gained a `rev`.
   */
  function backfill(snapshot, exportedAt) {
    const ts = (typeof exportedAt === 'string' && exportedAt) ? exportedAt : nowIso();
    let n = 0;
    for (const coll of arrayCollections(snapshot)) {
      for (const rec of snapshot[coll]) {
        if (!rec || typeof rec !== 'object') continue;
        ensureId(rec, coll);
        if (typeof rec.rev !== 'number' || rec.rev < 1) { rec.rev = 1; n++; }
        if (typeof rec.updatedAt !== 'string') rec.updatedAt = ts;
      }
    }
    return n;
  }

  /**
   * Stamp content changes at save time. Mutates records in place: new/changed
   * records get a bumped `rev` + fresh `updatedAt`; disappeared records become
   * tombstones (pushed into snapshot.tombstones when present). Returns a summary
   * of {created, changed, deleted} for downstream consumers (e.g. audit log).
   */
  function stampChanges(snapshot) {
    const now = nowIso();
    const next = new Map();
    const summary = { created: [], changed: [], deleted: [] };

    for (const coll of arrayCollections(snapshot)) {
      for (const rec of snapshot[coll]) {
        if (!rec || typeof rec !== 'object') continue;
        ensureId(rec, coll);
        const key = coll + ':' + rec.id;
        const fp = fingerprint(rec);
        const prev = lastIndex.get(key);
        if (prev === undefined) {
          rec.rev = (typeof rec.rev === 'number' ? rec.rev : 0) + 1;
          rec.updatedAt = now;
          summary.created.push({ collection: coll, id: rec.id });
        } else if (prev.fp !== fp) {
          rec.rev = (typeof rec.rev === 'number' ? rec.rev : 0) + 1;
          rec.updatedAt = now;
          summary.changed.push({ collection: coll, id: rec.id });
        }
        next.set(key, { fp, rev: revOf(rec) }); // fp excludes reserved fields — stable post-stamp
      }
    }

    const tomb = Array.isArray(snapshot.tombstones) ? snapshot.tombstones : null;
    for (const key of lastIndex.keys()) {
      if (next.has(key)) continue;
      const sep = key.indexOf(':');
      const coll = key.slice(0, sep);
      const id = key.slice(sep + 1);
      summary.deleted.push({ collection: coll, id });
      if (tomb && !tomb.some((t) => t && t.id === id && t.collection === coll)) {
        // Carry the rev that was deleted. Without it a delete outranks every
        // later edit: a tombstone from rev 2 would remove a record another
        // device had since edited to rev 9, and the edit was gone silently.
        const gone = lastIndex.get(key);
        tomb.push({ id, collection: coll, rev: gone ? gone.rev : 0, deletedAt: now });
      }
    }

    // Bound growth: tombstones are transient delete-markers for sync; once every device has
    // seen a delete they're dead weight. Keep the most recent set (appended oldest-first) so
    // the array can't grow without limit and bloat every save/sync blob.
    const TOMB_CAP = 5000;
    if (tomb && tomb.length > TOMB_CAP) tomb.splice(0, tomb.length - TOMB_CAP);

    lastIndex = next;
    return summary;
  }

  /** High-water cursor across the snapshot (rev authoritative; updatedAt advisory). */
  function maxCursor(snapshot) {
    let rev = 0;
    let ts = '';
    for (const coll of arrayCollections(snapshot)) {
      for (const rec of snapshot[coll]) {
        if (!rec || typeof rec !== 'object') continue;
        if (typeof rec.rev === 'number' && rec.rev > rev) rev = rec.rev;
        if (typeof rec.updatedAt === 'string' && rec.updatedAt > ts) ts = rec.updatedAt;
      }
    }
    return { rev, ts };
  }

  /**
   * Extract everything changed since a cursor — the wire format for incremental
   * backup today and cloud sync later. Returns { deltas, tombstones, cursor }.
   */
  function extractDeltas(snapshot, cursor) {
    const since = cursor || { rev: 0, ts: '' };
    const deltas = [];
    for (const coll of arrayCollections(snapshot)) {
      for (const rec of snapshot[coll]) {
        if (!rec || typeof rec !== 'object') continue;
        if (typeof rec.rev === 'number' && rec.rev > (since.rev || 0)) {
          deltas.push({ collection: coll, record: rec });
        }
      }
    }
    const tombstones = (Array.isArray(snapshot.tombstones) ? snapshot.tombstones : [])
      .filter((t) => t && (!since.ts || (t.deletedAt || '') > since.ts));
    return { deltas, tombstones, cursor: maxCursor(snapshot) };
  }

  /**
   * Apply incoming deltas into a target snapshot (mutates it) per the Phase 0
   * conflict policy: LWW by `rev` (rev authoritative); append-only collections
   * never overwrite; tombstones remove. Returns {applied, skipped, removed}.
   */
  function applyDeltas(snapshot, payload, opts) {
    opts = opts || {};
    const appendOnly = new Set(opts.appendOnly || []);
    const result = { applied: 0, skipped: 0, removed: 0, conflicts: [] };

    for (const d of (payload && payload.deltas) || []) {
      const coll = d && d.collection;
      const incoming = d && d.record;
      if (!coll || !incoming || typeof incoming.id !== 'string') { result.skipped++; continue; }
      if (!Array.isArray(snapshot[coll])) snapshot[coll] = [];
      const arr = snapshot[coll];
      const i = arr.findIndex((r) => r && r.id === incoming.id);
      if (i === -1) { arr.push(incoming); result.applied++; continue; }
      if (appendOnly.has(coll)) { result.skipped++; continue; }
      const curRev = revOf(arr[i]);
      const inRev = revOf(incoming);
      if (inRev > curRev) { arr[i] = incoming; result.applied++; }
      else if (inRev < curRev) { result.skipped++; }
      else {
        // Same rev, different content: two devices edited independently from the
        // same base. Skipping used to mean each device kept its own copy and
        // they diverged permanently, with nothing to tell anyone.
        //
        // One of the two edits is lost either way — `rev` is a per-record counter,
        // not a causal clock, so there is no information here to merge on. What
        // this does buy is CONVERGENCE: every device applies the same rule and
        // ends up with the same record, instead of each believing it is right.
        // Tie-break on updatedAt, then on a stable fingerprint compare so the
        // outcome never depends on who pulled first.
        if (fingerprint(incoming) !== fingerprint(arr[i])) {
          const curT = String(arr[i].updatedAt || '');
          const inT = String(incoming.updatedAt || '');
          const takeIncoming = inT !== curT
            ? inT > curT
            : fingerprint(incoming) > fingerprint(arr[i]);
          if (takeIncoming) { arr[i] = incoming; result.applied++; }
          else { result.skipped++; }
          result.conflicts.push({ collection: coll, id: incoming.id, rev: inRev, tookIncoming: takeIncoming });
        } else {
          result.skipped++;   // identical content — not a conflict, just a re-send
        }
      }
    }

    for (const t of (payload && payload.tombstones) || []) {
      if (!t || !t.collection || !t.id || !Array.isArray(snapshot[t.collection])) continue;
      const arr = snapshot[t.collection];
      const i = arr.findIndex((r) => r && r.id === t.id);
      if (i === -1) continue;
      // Tombstones win unconditionally, on purpose: a delete must not be undone
      // by a stale delta re-adding the record (see sync-foundation.test.js).
      //
      // The cost is that a delete also outranks a genuinely newer edit made on
      // another device — delete at rev 2 removes a record edited to rev 9. Both
      // cannot be fixed with `rev` alone, because a counter cannot tell "stale
      // delete" from "stale re-add"; that needs a causal clock. The tombstone
      // carries the rev it deleted (see stampChanges), which lets us at least
      // KNOW when a delete is discarding a newer edit.
      const removed = arr[i];
      const localRev = revOf(removed);
      const tombRev = revOf(t);
      arr.splice(i, 1); result.removed++;
      // Delete still wins — reversing that silently would resurrect deleted
      // records — but it is no longer silent. When the record here was edited
      // (localRev) after the delete saw it (tombRev), report the discarded edit
      // so a shop learns an order it just changed was removed on another device,
      // instead of the change vanishing without a trace. A one-click cross-device
      // "restore" is deliberately not offered: the tombstone wins on every other
      // device too, so a restored record would just be deleted again on the next
      // sync — an honest "this was lost" beats a button that quietly fails.
      if (localRev > tombRev) {
        result.conflicts.push({
          collection: t.collection, id: t.id, kind: 'delete_over_edit',
          tombRev, localRev, discarded: removed,
        });
      }
    }
    return result;
  }

  // ---- Sync Engine backend interface (LocalBackend = no-op; cloud is opt-in) ----
  const LocalBackend = {
    name: 'local',
    pushDeltas() { return Promise.resolve({ newCursor: null }); },
    pullDeltas() { return Promise.resolve({ deltas: [], tombstones: [], newCursor: null }); },
    status() { return 'off'; },
  };

  function setBackend(b) { backend = b || null; statusVal = backend ? 'idle' : 'off'; }
  function getBackend() { return backend; }
  function status() { return backend ? statusVal : 'off'; }

  /**
   * Reduce a merge's conflicts to what the UI needs to announce a delete that
   * discarded a local edit. Pure — no DOM, no i18n — so the message logic is
   * testable away from the renderer glue that calls toast()/t().
   * @returns {{count:number, firstName:string}} count 0 means nothing to show.
   */
  function summarizeDiscardedEdits(conflicts) {
    const discarded = (conflicts || []).filter((c) => c && c.kind === 'delete_over_edit');
    if (!discarded.length) return { count: 0, firstName: '' };
    const r = discarded[0].discarded || {};
    const firstName = String(r.project || r.name || r.title || discarded[0].id || '').slice(0, 40);
    return { count: discarded.length, firstName };
  }

  const api = {
    SCHEMA,
    fingerprint,
    seedIndex,
    backfill,
    stampChanges,
    extractDeltas,
    applyDeltas,
    summarizeDiscardedEdits,
    maxCursor,
    setBackend,
    getBackend,
    status,
    LocalBackend,
    // test-only helpers
    _resetIndex() { lastIndex = new Map(); },
    _indexSize() { return lastIndex.size; },
  };

  Object.assign(global, { KhaytSync: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
