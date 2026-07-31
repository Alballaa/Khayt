'use strict';

(function (global) {
/**
 * Telling whether the shop already has this model.
 *
 * The case that matters is not tidiness. A repeat customer sends the same
 * bracket they sent in March; without this it becomes a second library entry
 * with no history, and the shop re-slices a part they already have a known-good
 * setup for (lib/print-setups.js) and a measured cost for (lib/printer-actuals).
 * Recognising the file is what connects the new job to everything already
 * learned about the old one.
 *
 * Two kinds of match, and they are NOT the same claim:
 *
 *   contentHash   the bytes are identical. This is certain. Same file.
 *   geometryKey   the mesh has the same triangle count, volume and bounding box.
 *                 This is a STRONG HINT and nothing more — it survives a
 *                 re-container (the same STL saved binary instead of ascii, or
 *                 wrapped into a 3MF) but it is not proof, and two genuinely
 *                 different parts can collide.
 *
 * The distinction is the whole point of keeping them apart. "You already have
 * this file" is a statement a shop can act on without checking. "This looks like
 * a part you already have" is an invitation to look. Presenting the second as
 * the first would eventually merge two different customers' parts, which is a
 * far worse failure than a missed duplicate.
 *
 * Pure. Hashing is delegated so this module runs in the renderer too.
 */

/**
 * SHA-256 of a file's bytes, hex.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer|string} bytes
 * @param {{createHash?: function}} [deps]  node:crypto, injected
 */
function contentHash(bytes, deps = {}) {
  const createHash = deps.createHash
    || (typeof require === 'function' ? require('crypto').createHash : null);
  if (typeof createHash !== 'function') return null;
  if (bytes === null || bytes === undefined) return null;
  let buf = bytes;
  if (buf instanceof ArrayBuffer) buf = Buffer.from(buf);
  else if (ArrayBuffer.isView(buf) && !Buffer.isBuffer(buf)) buf = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  else if (typeof buf === 'string') buf = Buffer.from(buf, 'utf8');
  if (!Buffer.isBuffer(buf)) return null;
  // An empty file is not a model, and hashing it would give every empty file the
  // same identity — which would then "already exist" for the next one.
  if (!buf.length) return null;
  return createHash('sha256').update(buf).digest('hex');
}

const round = (v, dp) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * A key for "the same mesh, however it was packaged".
 *
 * Triangle count is exact on purpose: a re-container preserves it, and a re-mesh
 * does not — and a re-mesh IS a different model as far as a print shop is
 * concerned, because it will slice differently.
 *
 * Returns null for geometry with no substance, so an unparsed or empty model
 * never acquires an identity that another empty one would share.
 */
function geometryKey(geometry) {
  const g = geometry || {};
  const tris = Number(g.triangleCount);
  const vol = Number(g.volumeMm3);
  if (!Number.isFinite(tris) || tris <= 0) return null;
  if (!Number.isFinite(vol) || vol <= 0) return null;
  const bbox = g.bbox || {};
  const dims = [round(bbox.x, 2), round(bbox.y, 2), round(bbox.z, 2)];
  if (dims.some((d) => d === null)) return null;
  return `${tris}:${round(vol, 2)}:${dims.join('x')}`;
}

/** Build the identity fields to store on a library record. */
function identify({ bytes, geometry }, deps = {}) {
  return {
    contentHash: contentHash(bytes, deps),
    geometryKey: geometryKey(geometry),
  };
}

/**
 * What in the library matches this candidate.
 *
 * `exact` and `similar` are disjoint: a record that matches by content is not
 * also reported as a look-alike, because the caller shows a different sentence
 * for each and a record in both lists would be described two ways at once.
 *
 * @param {Array} records    library entries carrying contentHash / geometryKey
 * @param {{contentHash?: string, geometryKey?: string, id?: string}} candidate
 * @returns {{exact: Array, similar: Array}}
 */
function findMatches(records, candidate) {
  const list = Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : [];
  const c = candidate || {};
  const exact = [];
  const similar = [];
  for (const r of list) {
    // Never match a record against itself — re-checking an existing entry after
    // an edit must not report that it duplicates itself.
    if (c.id && r.id === c.id) continue;
    if (c.contentHash && r.contentHash && r.contentHash === c.contentHash) {
      exact.push(r);
      continue;
    }
    if (c.geometryKey && r.geometryKey && r.geometryKey === c.geometryKey) {
      similar.push(r);
    }
  }
  return { exact, similar };
}

/** Groups of records that are byte-identical to each other, largest first. */
function duplicateGroups(records) {
  const list = Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : [];
  const byHash = new Map();
  for (const r of list) {
    if (!r.contentHash) continue;
    if (!byHash.has(r.contentHash)) byHash.set(r.contentHash, []);
    byHash.get(r.contentHash).push(r);
  }
  return [...byHash.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length);
}

const api = { contentHash, geometryKey, identify, findMatches, duplicateGroups };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.KhaytModelIdentity = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
