'use strict';
/**
 * HueForge → Snapmaker U1 3MF assembler (main-process, Node). Packs a relief mesh + a
 * per-height filament plan into a Snapmaker-Orca 3MF that opens ready-to-slice: the colour
 * swaps are encoded as `Metadata/layer_config_ranges.xml` height-range modifiers (each Z
 * band → an `extruder` = one of the U1's 4 SnapSwap heads), exactly as a real
 * Snapmaker-Orca HueForge export does — so Orca changes tool automatically at each band, no
 * manual setup, no baked M600.
 *
 * The envelope + full U1 process/machine settings (native start/tool-change G-code, bed,
 * flavour — 572 keys) come from `hueforge-u1-template.json`, a genericised project_settings
 * captured from a real U1 export; we mutate only filament_colour + layer height. Structure
 * (object ids, model_settings, content-types) mirrors that known-good file.
 *
 * Only the ≤4-colour automatic case is emitted here (the U1's sweet spot); >4 colours fall
 * back to STL + the mm swap guide in the UI.
 */
(function (global) {
  const zipWrite = (typeof require === 'function') ? require('./zip-write') : global.KhaytZipWrite;
  let TEMPLATE = null;
  function template() {
    if (!TEMPLATE && typeof require === 'function') TEMPLATE = require('./hueforge-u1-template.json');
    return TEMPLATE;
  }

  const xmlEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (n) => { const x = Number(n); return Number.isFinite(x) ? String(Math.round(x * 1e4) / 1e4) : '0'; };

  const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + '<Default Extension="gcode" ContentType="text/x.gcode"/></Types>';
  const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  const MODEL_RELS = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';

  /** The mesh, as a Bambu/Orca object part file (core-spec geometry; object id=1). */
  function objectModelXml(triangles) {
    const verts = [];
    const tris = [];
    let vi = 0;
    for (const tri of triangles) {
      if (!tri || tri.length < 3) continue;
      for (let k = 0; k < 3; k++) { const p = tri[k] || [0, 0, 0]; verts.push('<vertex x="' + num(p[0]) + '" y="' + num(p[1]) + '" z="' + num(p[2]) + '"/>'); }
      tris.push('<triangle v1="' + vi + '" v2="' + (vi + 1) + '" v3="' + (vi + 2) + '"/>');
      vi += 3;
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">'
      + '<resources><object id="1" type="model"><mesh><vertices>' + verts.join('') + '</vertices><triangles>' + tris.join('') + '</triangles></mesh></object></resources></model>';
  }

  /** Root model: an assembly object (id=2) referencing the mesh, placed centred on the bed. */
  function rootModelXml(tx, ty) {
    const t = '1 0 0 0 1 0 0 0 1 ' + num(tx) + ' ' + num(ty) + ' 0';
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">'
      + '<metadata name="Application">BedReady-HueForge</metadata><metadata name="BambuStudio:3mfVersion">1</metadata>'
      + '<resources><object id="2" type="model"><components>'
      + '<component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>'
      + '</components></object></resources>'
      + '<build><item objectid="2" transform="' + t + '" printable="1"/></build></model>';
  }

  function modelSettingsXml(name) {
    const n = xmlEsc(name || 'HueForge');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n'
      + '  <object id="2">\n'
      + '    <metadata key="name" value="' + n + '"/>\n'
      + '    <metadata key="bottom_surface_pattern" value="alignedrectilinear"/>\n'
      + '    <metadata key="enable_support" value="0"/>\n'
      + '    <metadata key="extruder" value="1"/>\n'
      + '    <metadata key="internal_solid_infill_pattern" value="alignedrectilinear"/>\n'
      + '    <metadata key="seam_position" value="back"/>\n'
      + '    <metadata key="sparse_infill_density" value="100%"/>\n'
      + '    <metadata key="sparse_infill_pattern" value="alignedrectilinear"/>\n'
      + '    <metadata key="top_surface_pattern" value="alignedrectilinear"/>\n'
      + '    <metadata key="wall_generator" value="arachne"/>\n'
      + '    <part id="1" subtype="normal_part">\n'
      + '      <metadata key="name" value="' + n + '"/>\n'
      + '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n'
      + '    </part>\n'
      + '  </object>\n'
      + '  <plate>\n'
      + '    <metadata key="plater_id" value="1"/>\n'
      + '    <metadata key="locked" value="false"/>\n'
      + '    <metadata key="filament_map_mode" value="Auto For Flush"/>\n'
      + '    <metadata key="filament_maps" value="1 1 1 1"/>\n'
      + '    <model_instance>\n'
      + '      <metadata key="object_id" value="2"/>\n'
      + '      <metadata key="instance_id" value="0"/>\n'
      + '    </model_instance>\n'
      + '  </plate>\n</config>\n';
  }

  /** The swap encoding: one Z-range per band → its U1 head (extruder, 1-based). */
  function layerRangesXml(bands, layerH) {
    const ranges = bands.map((b) =>
      '  <range min_z="' + num(b.z0) + '" max_z="' + num(b.z1) + '">\n'
      + '   <option opt_key="extruder">' + ((b.head | 0) + 1) + '</option>\n'
      + '   <option opt_key="layer_height">' + num(layerH) + '</option>\n'
      + '  </range>').join('\n');
    return '<?xml version="1.0" encoding="utf-8"?>\n<objects>\n <object id="1">\n' + ranges + '\n </object>\n</objects>\n';
  }

  function pad4(arr, fill) { const out = arr.slice(0, 4); while (out.length < 4) out.push(fill); return out; }

  /**
   * @param {{ triangles:Array, bands:Array<{z0,z1,head,hex}>, layerH:number, name?:string,
   *           bed?:{x,y}, sizeMm?:{x,y,z} }} o
   * @returns {Buffer|null}
   */
  function buildU1_3mf(o) {
    const tpl = template();
    if (!tpl || !o || !Array.isArray(o.triangles) || !o.triangles.length || !Array.isArray(o.bands) || !o.bands.length) return null;
    const layerH = +o.layerH > 0 ? +o.layerH : 0.12;
    const bed = o.bed && o.bed.x ? o.bed : { x: 270, y: 270 };

    // model spans 0..sizeX, 0..sizeY → centre on the bed via the build item translation.
    let sx = o.sizeMm && o.sizeMm.x, sy = o.sizeMm && o.sizeMm.y;
    if (!sx || !sy) {
      let maxX = 0, maxY = 0;
      for (const t of o.triangles) for (const p of t) { if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1]; }
      sx = maxX; sy = maxY;
    }
    const tx = bed.x / 2 - sx / 2, ty = bed.y / 2 - sy / 2;

    const cfg = JSON.parse(JSON.stringify(tpl));
    cfg.filament_colour = pad4(o.bands.map((b) => String(b.hex || '#FFFFFF').toUpperCase()), '#FFFFFF');
    cfg.layer_height = String(layerH);
    cfg.initial_layer_print_height = String(layerH);

    const name = o.name || 'HueForge';
    const members = [
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: '_rels/.rels', data: ROOT_RELS },
      { name: '3D/3dmodel.model', data: rootModelXml(tx, ty) },
      { name: '3D/_rels/3dmodel.model.rels', data: MODEL_RELS },
      { name: '3D/Objects/object_1.model', data: objectModelXml(o.triangles) },
      { name: 'Metadata/project_settings.config', data: JSON.stringify(cfg) },
      { name: 'Metadata/model_settings.config', data: modelSettingsXml(name) },
      { name: 'Metadata/layer_config_ranges.xml', data: layerRangesXml(o.bands, layerH) },
    ];
    return zipWrite.writeZip(members);
  }

  const api = { buildU1_3mf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') global.KhaytHueForge3mf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
