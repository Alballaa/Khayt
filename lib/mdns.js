'use strict';
/**
 * Minimal mDNS (RFC 6762 / DNS-SD) codec — just enough to ask "what printers are on this
 * LAN?" and understand the answer.
 *
 * Deliberately dependency-free. Every mDNS package on npm pulls a transitive tree for
 * what amounts to a few hundred lines of DNS wire format, and this app ships four runtime
 * dependencies total. The socket lives in main.js; everything here is pure and testable
 * without a network.
 *
 * PRIVACY: discovery is LAN-only multicast (224.0.0.251:5353). Nothing is sent off the
 * network, and the scan is owner-initiated — never on a timer.
 */
(function () {
  const MDNS_ADDR = '224.0.0.251';
  const MDNS_PORT = 5353;

  const TYPE = { A: 1, PTR: 12, TXT: 16, AAAA: 28, SRV: 33 };

  /** Encode a dotted name as length-prefixed DNS labels. */
  function encodeName(name) {
    const parts = [];
    for (const label of String(name || '').split('.')) {
      if (!label) continue;
      const b = Buffer.from(label, 'utf8');
      if (b.length > 63) throw new Error('label too long');
      parts.push(Buffer.from([b.length]), b);
    }
    parts.push(Buffer.from([0]));
    return Buffer.concat(parts);
  }

  /**
   * Build a PTR query for one or more service types.
   *
   * `unicast` sets the QU bit, asking responders to reply straight to our port. Some
   * devices honour it and some only ever multicast — the Prusa CORE One is in the second
   * group — so the caller must ALSO join the multicast group to hear everyone. Learned
   * from real hardware: with QU alone, the Snapmaker answered and the Prusa did not.
   */
  function encodeQuery(names, opts) {
    const list = Array.isArray(names) ? names : [names];
    const header = Buffer.alloc(12);
    header.writeUInt16BE(list.length, 4); // QDCOUNT
    const parts = [header];
    const qclass = (opts && opts.unicast) ? 0x8001 : 0x0001;
    for (const n of list) {
      const q = Buffer.alloc(4);
      q.writeUInt16BE(TYPE.PTR, 0);
      q.writeUInt16BE(qclass, 2);
      parts.push(encodeName(n), q);
    }
    return Buffer.concat(parts);
  }

  /**
   * Read a (possibly compressed) name. Returns [name, offsetAfterName].
   * Compression pointers jump backwards; the guard bounds pathological/hostile packets.
   */
  function readName(buf, offset) {
    const labels = [];
    let off = offset;
    let end = offset;
    let jumped = false;
    for (let guard = 0; guard < 128; guard++) {
      if (off >= buf.length) break;
      const len = buf[off];
      if (len === 0) { if (!jumped) end = off + 1; break; }
      if ((len & 0xc0) === 0xc0) {
        if (off + 1 >= buf.length) break;
        const ptr = ((len & 0x3f) << 8) | buf[off + 1];
        if (!jumped) { end = off + 2; jumped = true; }
        if (ptr >= off) break; // only backwards jumps are legal — refuse loops
        off = ptr;
        continue;
      }
      if (off + 1 + len > buf.length) break;
      labels.push(buf.slice(off + 1, off + 1 + len).toString('utf8'));
      off += len + 1;
    }
    return [labels.join('.'), end];
  }

  /** Parse a TXT rdata block into key/value pairs. */
  function parseTxt(rd) {
    const out = {};
    let p = 0;
    while (p < rd.length) {
      const len = rd[p];
      if (len === undefined || p + 1 + len > rd.length) break;
      const entry = rd.slice(p + 1, p + 1 + len).toString('utf8');
      const eq = entry.indexOf('=');
      if (eq > 0) out[entry.slice(0, eq)] = entry.slice(eq + 1);
      p += len + 1;
    }
    return out;
  }

  /**
   * Decode a DNS message into a flat record list. Returns [] on anything malformed —
   * this parses unauthenticated packets from the local network, so it must never throw.
   */
  function decodeMessage(buf) {
    try {
      if (!Buffer.isBuffer(buf) || buf.length < 12) return [];
      const qd = buf.readUInt16BE(4);
      const counts = [buf.readUInt16BE(6), buf.readUInt16BE(8), buf.readUInt16BE(10)];
      let off = 12;
      for (let i = 0; i < qd; i++) {
        const [, e] = readName(buf, off);
        off = e + 4;
      }
      const records = [];
      for (const count of counts) {
        for (let i = 0; i < count; i++) {
          if (off + 10 > buf.length) return records;
          const [name, e] = readName(buf, off);
          off = e;
          const type = buf.readUInt16BE(off);
          const rdlen = buf.readUInt16BE(off + 8);
          const rdStart = off + 10;
          if (rdStart + rdlen > buf.length) return records;
          const rd = buf.slice(rdStart, rdStart + rdlen);
          off = rdStart + rdlen;
          const rec = { name, type };
          if (type === TYPE.PTR) rec.ptr = readName(buf, rdStart)[0];
          else if (type === TYPE.TXT) rec.txt = parseTxt(rd);
          else if (type === TYPE.SRV && rdlen >= 7) {
            rec.srv = { port: rd.readUInt16BE(4), target: readName(buf, rdStart + 6)[0] };
          } else if (type === TYPE.A && rdlen === 4) rec.a = Array.from(rd).join('.');
          records.push(rec);
        }
      }
      return records;
    } catch {
      return [];
    }
  }

  const api = { MDNS_ADDR, MDNS_PORT, TYPE, encodeName, encodeQuery, readName, parseTxt, decodeMessage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.KhaytMdns = api;
})();
