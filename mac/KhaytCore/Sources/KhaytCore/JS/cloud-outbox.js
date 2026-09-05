/**
 * What this device holds that the cloud does not.
 *
 * The desktop answers this question from a CURSOR — `pushedRevs`, the revs it
 * remembers sending — and that is right for a process that stays open and
 * pushes on every save. It is wrong for an app that opens, pulls once, and
 * offers to send: a cursor it never wrote is a cursor it cannot trust, and
 * `changesSincePush` ships everything that merely *disagrees* with it, in
 * either direction. Handed a stale local copy that would send a shop's older
 * record over the newer one already in the cloud, on every device.
 *
 * So this rule compares against the SERVER STORE ITSELF, freshly pulled, and it
 * is deliberately one-directional:
 *
 *   - a record the cloud has never seen is sent
 *   - a record whose local rev is STRICTLY HIGHER is sent
 *   - a record the cloud holds at the same or a higher rev is left alone
 *
 * The third line is the whole point. This app does not merge, so a record that
 * is newer in the cloud is a record this device is simply behind on, and the
 * only safe thing to do with it is nothing.
 *
 * `settings` is not covered, and cannot be: it is one object, not a collection
 * of revisioned records, so the delta shape has nowhere to put it. The desktop
 * sends it by pushing the whole store, which this app must never do — a whole
 * store from a device that has not merged replaces the cloud's copy outright.
 * `settingsDiffer` exists so the screen can say so instead of quietly dropping
 * it.
 */
(function (global) {
  'use strict';

  const META_COLLECTIONS = new Set(['tombstones']);

  /** Array collections in a snapshot, excluding the meta ones. Mirrors sync.js. */
  function arrayCollections(snapshot) {
    const out = [];
    for (const k of Object.keys(snapshot || {})) {
      if (META_COLLECTIONS.has(k)) continue;
      if (Array.isArray(snapshot[k])) out.push(k);
    }
    return out;
  }

  /** A record's revision, treating anything missing or malformed as 0. Mirrors sync.js. */
  function revOf(rec) {
    return (rec && typeof rec.rev === 'number' && rec.rev > 0) ? rec.rev : 0;
  }

  function tombsOf(snapshot) {
    const t = snapshot && snapshot.tombstones;
    return Array.isArray(t) ? t : [];
  }

  /**
   * A deletion's key must carry its collection.
   *
   * Ids are unique within a collection and not across them, so keying a
   * tombstone by id alone makes one deleted order hide an unrelated deleted
   * spool — and the one it hides is never sent.
   */
  function tombKey(t) { return String(t.collection) + ':' + String(t.id); }

  /** Deterministic, key-sorted serialization. Mirrors sync.js's stableStringify. */
  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }

  /**
   * Has the shop changed a setting the cloud has not got?
   *
   * NOT a plain comparison, and the reason is `settings.cloud.lastServerRev`.
   * The desktop writes it AFTER a successful push — `settings.cloud.lastServerRev
   * = r.rev; saveAll()` — so the blob that went up carries the previous value
   * and the local copy is one ahead of it. Permanently, after every push a shop
   * has ever made.
   *
   * Compared raw, that made "your settings differ" true for every synced shop
   * for ever, and the screen said so beside a comparison reporting no
   * difference at all. It was noise dressed as a warning, which is worse than
   * saying nothing.
   *
   * So the whole `cloud` subtree is left out. That is where the sync's own
   * bookkeeping lives, and it is not a thing a shop edits — every setting a
   * shop actually changes is somewhere else in this object.
   */
  function settingsDiffer(mine, theirs) {
    return !sameIgnoringWhatTheCloudDoesNotCarry(mine || {}, theirs || {}, '');
  }

  /**
   * What the cloud puts where a device secret used to be. `lib/store.js` owns
   * it; read at comparison time rather than at load, because module order is
   * not something this file gets to depend on — and a stale copy of a mask
   * would mean comparing a secret against a sentinel again.
   */
  const mask = () => (global.KhaytStore && global.KhaytStore.SECRET_MASK) || '__KHAYT_MASKED__';

  /**
   * The sync's own bookkeeping, which is not a setting anybody edits.
   *
   * `lastServerRev` is written AFTER a successful push, so the copy that went
   * up carries the previous value and the local one is a step ahead of it —
   * permanently, for every shop that has ever synced.
   */
  const NOT_A_SETTING = ['cloud.lastServerRev'];

  function sameIgnoringWhatTheCloudDoesNotCarry(mine, theirs, path) {
    if (NOT_A_SETTING.includes(path)) return true;
    // THE CLOUD DOES NOT CARRY SECRETS. `redactSettingsForExport` replaces every
    // credential with a mask before the store is pushed, so the API key, the
    // sync token and the print library's S3 secret are all `__KHAYT_MASKED__`
    // up there and encrypted blobs down here. Comparing those as values made
    // "your settings differ" true for ever for any shop that has configured
    // anything at all — which was three of this shop's three differences.
    if (theirs === mask()) return true;
    if (mine === theirs) return true;
    if (!mine || !theirs || typeof mine !== 'object' || typeof theirs !== 'object') {
      return stable(mine === undefined ? null : mine) === stable(theirs === undefined ? null : theirs);
    }
    if (Array.isArray(mine) !== Array.isArray(theirs)) return false;
    const keys = new Set(Object.keys(mine).concat(Object.keys(theirs)));
    for (const key of keys) {
      const next = path ? path + '.' + key : key;
      if (!sameIgnoringWhatTheCloudDoesNotCarry(mine[key], theirs[key], next)) return false;
    }
    return true;
  }

  /**
   * @param {object} local   this device's store
   * @param {object} server  the store as the cloud holds it, base + chain folded
   * @returns {{deltas: Array, tombstones: Array, cursor: object, settingsDiffer: boolean}}
   *          in the shape `KhaytSync.applyDeltas` consumes.
   */
  function changesToSend(local, server) {
    local = local || {};
    server = server || {};

    const serverRev = new Map();
    for (const coll of arrayCollections(server)) {
      for (const rec of server[coll]) {
        if (rec && typeof rec.id === 'string' && rec.id) serverRev.set(coll + ':' + rec.id, revOf(rec));
      }
    }
    const serverTombs = new Set();
    for (const t of tombsOf(server)) if (t && t.collection && t.id) serverTombs.add(tombKey(t));
    const localTombs = new Set();
    for (const t of tombsOf(local)) if (t && t.collection && t.id) localTombs.add(tombKey(t));

    const deltas = [];
    for (const coll of arrayCollections(local)) {
      for (const rec of local[coll]) {
        if (!rec || typeof rec !== 'object') continue;
        if (typeof rec.id !== 'string' || !rec.id) continue;
        const key = coll + ':' + rec.id;
        // Deleted here. The tombstone below carries that; sending the record too
        // would ask every other device to put it back first.
        if (localTombs.has(key)) continue;
        const there = serverRev.get(key);
        if (there === undefined) {
          // Not there because somebody else deleted it — not because it is new.
          if (serverTombs.has(key)) continue;
          deltas.push({ collection: coll, record: rec });
          continue;
        }
        if (revOf(rec) > there) deltas.push({ collection: coll, record: rec });
      }
    }

    const tombstones = [];
    for (const t of tombsOf(local)) {
      if (!t || !t.collection || !t.id) continue;
      if (serverTombs.has(tombKey(t))) continue;
      tombstones.push(t);
    }

    return {
      deltas,
      tombstones,
      // The same empty cursor the desktop's delta payload carries: applyDeltas
      // reads `deltas` and `tombstones`, and a cursor invented here would claim
      // a position in a sequence this device never took part in.
      cursor: { rev: 0, ts: '' },
      settingsDiffer: settingsDiffer(local.settings, server.settings),
    };
  }

  const api = { changesToSend };
  Object.assign(global, { KhaytCloudOutbox: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
