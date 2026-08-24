'use strict';
/**
 * An order that arrives twice from a storefront is one order.
 *
 * Salla and Zid POST a signed webhook when an order is placed, and lan-server
 * turns it into a row in the shop's print log. Each row got a fresh random id —
 * `uniqueLanId('salla')` — and the platform's own order reference was written
 * into the free-text `notes` field. So nothing about the record said which order
 * it was, and two deliveries of the same order made two orders.
 *
 * The only thing standing in the way was `isReplayedWebhook`, an in-memory LRU
 * of recently-seen signatures. Its own comment is honest about the shape of it:
 * "per-process (cleared on restart) and capped in size", with a ten-minute TTL.
 * All three of those are ordinary events rather than edge cases:
 *
 *   - providers RETRY. A delivery that times out or answers non-2xx comes back,
 *     and it comes back byte-identical, which is the only reason the signature
 *     cache works at all when it works.
 *   - Khayt restarts. A shop closes the app at night.
 *   - 500 webhooks evict the entry, or ten minutes pass.
 *
 * Any one of those turns a retry into a duplicate order in the shop's queue —
 * printed twice, or invoiced twice.
 *
 * So the durable answer is the platform's own order id, which is in the payload
 * already and simply was not being kept. The print log is persisted, so a check
 * against it survives everything the signature cache does not. The cache stays:
 * it is a cheap early-out that costs nothing, and it still catches a replay of a
 * payload carrying no id at all.
 *
 * Pure: takes a payload and a print log, returns strings and booleans.
 */
(function (global) {
  const str = (v) => String(v == null ? '' : v).trim();

  /**
   * Where each platform puts its own order id.
   *
   * Deliberately the SAME field the notes line already quoted, so an order
   * recorded before this existed can still be recognised — see recordedNoteRef.
   */
  function sourceOrderIdFrom(source, payload) {
    const p = payload || {};
    if (source === 'salla') return str(p.data && p.data.reference_id);
    if (source === 'zid') {
      const o = p.order || {};
      return str(o.reference_id) || str(o.id);
    }
    return '';
  }

  /** The `notes` line lan-server writes, so the two cannot drift apart. */
  function noteFor(source, sourceOrderId) {
    const label = source === 'zid' ? 'Zid' : 'Salla';
    return `${label} order #${str(sourceOrderId).slice(0, 100)}`;
  }

  /**
   * Pull an order reference back out of a note written before `sourceOrderId`
   * was recorded as a field.
   *
   * A migration aid, and bounded: the string being parsed is one Khayt wrote
   * itself, in a format defined immediately above. Without it the fix protects
   * only orders that arrive from now on, and a shop's existing queue — which is
   * exactly where a duplicate is most annoying — would keep collecting them.
   */
  function recordedNoteRef(entry) {
    const m = /^(?:Salla|Zid) order #(.+)$/.exec(str(entry && entry.notes));
    return m ? str(m[1]) : '';
  }

  /**
   * Has this exact platform order already been written down?
   *
   * An EMPTY id is never a match. Two payloads that both failed to name
   * themselves are not thereby the same order, and treating them as one would
   * silently drop a real second order — a worse failure than the duplicate this
   * is here to prevent, because nothing about it is visible.
   */
  function alreadyRecorded(printLog, source, sourceOrderId) {
    const id = str(sourceOrderId);
    if (!id) return false;
    const src = str(source);
    return (Array.isArray(printLog) ? printLog : []).some((e) => {
      if (!e || str(e.source) !== src) return false;
      const known = str(e.sourceOrderId) || recordedNoteRef(e);
      return !!known && known === id;
    });
  }

  const api = { sourceOrderIdFrom, alreadyRecorded, noteFor, recordedNoteRef };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytStorefrontOrders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
