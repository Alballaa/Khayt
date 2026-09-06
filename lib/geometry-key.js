'use strict';
(function (global) {

/**
 * The key for "the same mesh, however it was packaged".
 *
 * Split out of `lib/model-identity.js`, which cannot be shared with the Mac
 * app: its `contentHash` falls back to `require('crypto')` and JavaScriptCore
 * has no `require`. The repo's drift guards refuse a bundled module that names
 * Node at all — rightly, since a guarded require is still a require somebody
 * will later unguard — so the pure half lives here and the whole half keeps
 * re-exporting it.
 *
 * WHY IT IS SHARED AT ALL. It is three numbers joined by punctuation, which is
 * exactly the kind of thing two implementations agree on until they do not: a
 * rounding, a separator, an order. These keys are compared against records the
 * other app wrote, so the format has to have one author.
 *
 * Triangle count is exact on purpose: a re-container preserves it, and a re-mesh
 * does not — and a re-mesh IS a different model as far as a print shop is
 * concerned, because it will slice differently.
 *
 * Returns null for geometry with no substance, so an unparsed or empty model
 * never acquires an identity that another empty one would share.
 */
function round(v, dp) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

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

const api = { geometryKey, round };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.KhaytGeometryKey = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
