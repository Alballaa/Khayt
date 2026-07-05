'use strict';
/**
 * Minimal 3MF writer (3.2) — pack a triangle mesh into a clean, standard 3MF (core spec
 * only: geometry, no vendor slicer config). Used to turn an STL into a 3MF any slicer
 * opens. Pure Node (Buffer + the zip writer), main-process only, no DOM.
 *
 * Vertices are emitted per-triangle (no dedup) — valid 3MF and keeps the writer simple;
 * slicers accept it, and the file always opens (worst case it's a little larger on disk).
 */
(function (global) {
  const zipWrite = (typeof require === 'function') ? require('./zip-write') : global.KhaytZipWrite;

  function fmt(n) { const x = Number(n); return Number.isFinite(x) ? String(Math.round(x * 1e4) / 1e4) : '0'; }

  function buildModelXml(triangles) {
    const verts = [];
    const tris = [];
    let vi = 0;
    for (const tri of triangles) {
      if (!tri || tri.length < 3) continue;
      for (let k = 0; k < 3; k++) {
        const p = tri[k] || [0, 0, 0];
        verts.push(`<vertex x="${fmt(p[0])}" y="${fmt(p[1])}" z="${fmt(p[2])}"/>`);
      }
      tris.push(`<triangle v1="${vi}" v2="${vi + 1}" v3="${vi + 2}"/>`);
      vi += 3;
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
      + '<resources><object id="1" type="model"><mesh>'
      + `<vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles>`
      + '</mesh></object></resources>'
      + '<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build></model>';
  }

  const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
    + '</Types>';
  const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
    + '</Relationships>';

  /** Build a generic 3MF Buffer from a triangle list. Returns null if there's no geometry. */
  function meshTo3mf(triangles) {
    if (!Array.isArray(triangles) || !triangles.length) return null;
    return zipWrite.writeZip([
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: '_rels/.rels', data: RELS },
      { name: '3D/3dmodel.model', data: buildModelXml(triangles) },
    ]);
  }

  const api = { meshTo3mf, buildModelXml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') global.KhaytMfWrite = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
