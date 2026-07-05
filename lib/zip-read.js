'use strict';
/**
 * Minimal, dependency-free ZIP reader — just enough to pull named members out of a
 * 3MF container (which is a ZIP): the embedded slicer thumbnail PNG and the small
 * *.config text members that carry colour / filament-swap info.
 *
 * Design rules:
 *   - Central-directory driven. Sizes come from the central directory, so entries
 *     written with a streaming data-descriptor (flag bit 3, zero sizes in the local
 *     header) still read correctly.
 *   - Supports STORE (method 0) and DEFLATE (method 8) via Node's built-in zlib.
 *     Zip64 / encrypted / other methods are skipped (return null), never guessed.
 *   - NEVER throws on malformed input — returns empty listings / null members so the
 *     main process can't be crashed by a bad file.
 *
 * Pure Node (uses Buffer + zlib) — main-process only, no DOM.
 */
let zlib = null;
try { zlib = require('zlib'); } catch (_) { zlib = null; }

const SIG_EOCD  = 0x06054b50;
const SIG_CDH   = 0x02014b50;
const SIG_LFH   = 0x04034b50;
const U32_MAX   = 0xffffffff;

function toBuf(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  return null;
}

/** Find the End-Of-Central-Directory record by scanning backward from the tail. */
function findEocd(buf) {
  const min = 22; // EOCD fixed size
  if (buf.length < min) return null;
  const maxComment = 0xffff;
  const start = Math.max(0, buf.length - (min + maxComment));
  for (let i = buf.length - min; i >= start; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      const cdCount  = buf.readUInt16LE(i + 10);
      const cdSize   = buf.readUInt32LE(i + 12);
      const cdOffset = buf.readUInt32LE(i + 16);
      if (cdOffset === U32_MAX || cdSize === U32_MAX) return null; // zip64 — unsupported
      if (cdOffset + cdSize > buf.length) continue; // false-positive signature
      return { cdCount, cdSize, cdOffset };
    }
  }
  return null;
}

/**
 * List the members of a ZIP.
 * @returns {Array<{name, method, compSize, size, localOffset}>} (empty on any error)
 */
function listEntries(input) {
  const buf = toBuf(input);
  if (!buf) return [];
  const eocd = findEocd(buf);
  if (!eocd) return [];
  const entries = [];
  let p = eocd.cdOffset;
  for (let n = 0; n < eocd.cdCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CDH) break;
    const method     = buf.readUInt16LE(p + 10);
    const compSize   = buf.readUInt32LE(p + 20);
    const size       = buf.readUInt32LE(p + 24);
    const fnameLen   = buf.readUInt16LE(p + 28);
    const extraLen   = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + fnameLen);
    // Skip zip64-marked entries — we can't trust the 32-bit fields.
    if (compSize !== U32_MAX && size !== U32_MAX && localOffset !== U32_MAX) {
      entries.push({ name, method, compSize, size, localOffset });
    }
    p += 46 + fnameLen + extraLen + commentLen;
  }
  return entries;
}

/** Read + decompress one central-directory entry → Buffer, or null on any problem. */
function readEntry(input, entry) {
  const buf = toBuf(input);
  if (!buf || !entry) return null;
  const lo = entry.localOffset;
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== SIG_LFH) return null;
  // Local header may have its own (different) filename/extra lengths.
  const fnameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const dataStart = lo + 30 + fnameLen + extraLen;
  const dataEnd = dataStart + entry.compSize;
  if (dataEnd > buf.length) return null;
  const comp = buf.subarray(dataStart, dataEnd);
  try {
    if (entry.method === 0) return Buffer.from(comp);           // STORE
    if (entry.method === 8) {                                   // DEFLATE
      if (!zlib) return null;
      // Zip-bomb guard: bound the inflated size. The central directory declares the
      // uncompressed size; honour it (with a little slack) and cap at a hard ceiling so
      // a member that lies about its size — or has none (streaming descriptor) — can't
      // inflate to gigabytes and OOM the process. Over-limit throws → caught → null.
      const HARD = 400 * 1024 * 1024;
      const cap = entry.size > 0 ? Math.min(entry.size + 1024, HARD) : HARD;
      return zlib.inflateRawSync(comp, { maxOutputLength: cap });
    }
    return null; // unsupported method
  } catch (_) {
    return null;
  }
}

/**
 * Convenience: open a ZIP and expose lookups.
 * @returns {{ entries, file(name)=>Buffer|null, match(regexp)=>Buffer|null, matchName(regexp)=>entry|null }}
 */
function openZip(input) {
  const buf = toBuf(input);
  const entries = listEntries(buf);
  const norm = (s) => String(s).replace(/^\.?\//, '').toLowerCase();
  return {
    entries,
    file(name) {
      const target = norm(name);
      const e = entries.find((x) => norm(x.name) === target);
      return e ? readEntry(buf, e) : null;
    },
    matchName(re) {
      return entries.find((x) => re.test(x.name)) || null;
    },
    match(re) {
      const e = entries.find((x) => re.test(x.name));
      return e ? readEntry(buf, e) : null;
    },
  };
}

const api = { listEntries, readEntry, openZip, findEocd };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytZip = api;
