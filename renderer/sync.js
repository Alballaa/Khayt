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
        idx.set(coll + ':' + rec.id, fingerprint(rec));
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
        } else if (prev !== fp) {
          rec.rev = (typeof rec.rev === 'number' ? rec.rev : 0) + 1;
          rec.updatedAt = now;
          summary.changed.push({ collection: coll, id: rec.id });
        }
        next.set(key, fp); // fp excludes reserved fields, so it's stable post-stamp
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
        tomb.push({ id, collection: coll, deletedAt: now });
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
    const result = { applied: 0, skipped: 0, removed: 0 };

    for (const d of (payload && payload.deltas) || []) {
      const coll = d && d.collection;
      const incoming = d && d.record;
      if (!coll || !incoming || typeof incoming.id !== 'string') { result.skipped++; continue; }
      if (!Array.isArray(snapshot[coll])) snapshot[coll] = [];
      const arr = snapshot[coll];
      const i = arr.findIndex((r) => r && r.id === incoming.id);
      if (i === -1) { arr.push(incoming); result.applied++; continue; }
      if (appendOnly.has(coll)) { result.skipped++; continue; }
      const curRev = typeof arr[i].rev === 'number' ? arr[i].rev : 0;
      const inRev = typeof incoming.rev === 'number' ? incoming.rev : 0;
      if (inRev > curRev) { arr[i] = incoming; result.applied++; }
      else { result.skipped++; }
    }

    for (const t of (payload && payload.tombstones) || []) {
      if (!t || !t.collection || !t.id || !Array.isArray(snapshot[t.collection])) continue;
      const arr = snapshot[t.collection];
      const i = arr.findIndex((r) => r && r.id === t.id);
      if (i !== -1) { arr.splice(i, 1); result.removed++; }
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

  const api = {
    SCHEMA,
    fingerprint,
    seedIndex,
    backfill,
    stampChanges,
    extractDeltas,
    applyDeltas,
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
