'use strict';
/**
 * Bundled 3D-printer catalog — a curated list of popular FDM/resin printers with the
 * specs Khayt needs so a maker can pick a model instead of typing specs by hand.
 *
 * Pure data + lookups, no DOM — shared by the machine editor (renderer/machines.js),
 * the calculator auto-fill, and tests. For breadth beyond this list, the machine
 * editor also merges the installed slicer's profiles via lib/orca-db.js; this bundled
 * set is the offline baseline that works with zero slicer installed.
 *
 * Each entry:
 *   id        stable kebab key
 *   vendor    brand
 *   model     model name (display = `${vendor} ${model}`)
 *   bed       build volume { x, y, z } mm
 *   nozzle    default nozzle diameter mm
 *   maxColors physical multicolour slots (AMS/CFS/MMU/toolheads); 1 = single colour
 *   extruder  'direct' | 'bowden'
 *   powerW    typical AVERAGE power draw while printing, W (for electricity costing —
 *             not nameplate/peak). Best-effort; the maker can override.
 *   tech      'fdm' | 'resin'
 *   flavour   slicer 3MF/g-code dialect: 'bambu' | 'prusa' | 'orca' | 'marlin' | 'generic'
 *
 * Wrapped in an IIFE so its top-level bindings don't leak into the shared classic-
 * script lexical scope (renderer loads it via <script>), then exposed on globalThis.
 */
(function () {
const PRINTERS = [
  // ── Bambu Lab ─────────────────────────────────────────────
  { id: 'bambu-x1c',      vendor: 'Bambu Lab', model: 'X1 Carbon', bed: { x: 256, y: 256, z: 256 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 120, tech: 'fdm', flavour: 'bambu' },
  { id: 'bambu-x1e',      vendor: 'Bambu Lab', model: 'X1E',       bed: { x: 256, y: 256, z: 256 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 140, tech: 'fdm', flavour: 'bambu' },
  { id: 'bambu-p1s',      vendor: 'Bambu Lab', model: 'P1S',       bed: { x: 256, y: 256, z: 256 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 110, tech: 'fdm', flavour: 'bambu' },
  { id: 'bambu-p1p',      vendor: 'Bambu Lab', model: 'P1P',       bed: { x: 256, y: 256, z: 256 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 100, tech: 'fdm', flavour: 'bambu' },
  { id: 'bambu-a1',       vendor: 'Bambu Lab', model: 'A1',        bed: { x: 256, y: 256, z: 256 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 95,  tech: 'fdm', flavour: 'bambu' },
  { id: 'bambu-a1-mini',  vendor: 'Bambu Lab', model: 'A1 mini',   bed: { x: 180, y: 180, z: 180 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 55,  tech: 'fdm', flavour: 'bambu' },
  { id: 'bambu-h2d',      vendor: 'Bambu Lab', model: 'H2D',       bed: { x: 350, y: 320, z: 325 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 180, tech: 'fdm', flavour: 'bambu' },

  // ── Prusa Research ────────────────────────────────────────
  { id: 'prusa-mk4s',     vendor: 'Prusa',     model: 'MK4S',      bed: { x: 250, y: 210, z: 220 }, nozzle: 0.4, maxColors: 5, extruder: 'direct', powerW: 90,  tech: 'fdm', flavour: 'prusa' },
  { id: 'prusa-mk4',      vendor: 'Prusa',     model: 'MK4',       bed: { x: 250, y: 210, z: 220 }, nozzle: 0.4, maxColors: 5, extruder: 'direct', powerW: 90,  tech: 'fdm', flavour: 'prusa' },
  { id: 'prusa-mk3s',     vendor: 'Prusa',     model: 'MK3S+',     bed: { x: 250, y: 210, z: 210 }, nozzle: 0.4, maxColors: 5, extruder: 'direct', powerW: 100, tech: 'fdm', flavour: 'prusa' },
  { id: 'prusa-mini',     vendor: 'Prusa',     model: 'MINI+',     bed: { x: 180, y: 180, z: 180 }, nozzle: 0.4, maxColors: 1, extruder: 'bowden', powerW: 60,  tech: 'fdm', flavour: 'prusa' },
  { id: 'prusa-xl',       vendor: 'Prusa',     model: 'XL',        bed: { x: 360, y: 360, z: 360 }, nozzle: 0.4, maxColors: 5, extruder: 'direct', powerW: 220, tech: 'fdm', flavour: 'prusa' },
  { id: 'prusa-core-one', vendor: 'Prusa',     model: 'CORE One',  bed: { x: 250, y: 220, z: 270 }, nozzle: 0.4, maxColors: 5, extruder: 'direct', powerW: 120, tech: 'fdm', flavour: 'prusa' },

  // ── Creality ──────────────────────────────────────────────
  { id: 'creality-k1',      vendor: 'Creality', model: 'K1',        bed: { x: 220, y: 220, z: 250 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 110, tech: 'fdm', flavour: 'orca' },
  { id: 'creality-k1-max',  vendor: 'Creality', model: 'K1 Max',    bed: { x: 300, y: 300, z: 300 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 150, tech: 'fdm', flavour: 'orca' },
  { id: 'creality-k2-plus', vendor: 'Creality', model: 'K2 Plus',   bed: { x: 350, y: 350, z: 350 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 190, tech: 'fdm', flavour: 'orca' },
  { id: 'creality-ender3v3', vendor: 'Creality', model: 'Ender-3 V3', bed: { x: 220, y: 220, z: 250 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 100, tech: 'fdm', flavour: 'marlin' },
  { id: 'creality-ender3v3se', vendor: 'Creality', model: 'Ender-3 V3 SE', bed: { x: 220, y: 220, z: 250 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 90, tech: 'fdm', flavour: 'marlin' },
  { id: 'creality-ender3s1', vendor: 'Creality', model: 'Ender-3 S1', bed: { x: 220, y: 220, z: 270 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 100, tech: 'fdm', flavour: 'marlin' },
  { id: 'creality-ender3',  vendor: 'Creality', model: 'Ender-3',   bed: { x: 220, y: 220, z: 250 }, nozzle: 0.4, maxColors: 1, extruder: 'bowden', powerW: 110, tech: 'fdm', flavour: 'marlin' },
  { id: 'creality-cr10',    vendor: 'Creality', model: 'CR-10',     bed: { x: 300, y: 300, z: 400 }, nozzle: 0.4, maxColors: 1, extruder: 'bowden', powerW: 150, tech: 'fdm', flavour: 'marlin' },

  // ── Anycubic ──────────────────────────────────────────────
  { id: 'anycubic-kobra3',  vendor: 'Anycubic', model: 'Kobra 3',    bed: { x: 250, y: 250, z: 260 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 120, tech: 'fdm', flavour: 'orca' },
  { id: 'anycubic-kobra2',  vendor: 'Anycubic', model: 'Kobra 2',    bed: { x: 220, y: 220, z: 250 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 100, tech: 'fdm', flavour: 'marlin' },
  { id: 'anycubic-photon-m5s', vendor: 'Anycubic', model: 'Photon Mono M5s', bed: { x: 218, y: 123, z: 200 }, nozzle: 0, maxColors: 1, extruder: 'direct', powerW: 60, tech: 'resin', flavour: 'generic' },
  { id: 'anycubic-photon-m3', vendor: 'Anycubic', model: 'Photon Mono M3', bed: { x: 163, y: 102, z: 180 }, nozzle: 0, maxColors: 1, extruder: 'direct', powerW: 50, tech: 'resin', flavour: 'generic' },

  // ── Elegoo ────────────────────────────────────────────────
  { id: 'elegoo-neptune4',    vendor: 'Elegoo', model: 'Neptune 4',    bed: { x: 225, y: 225, z: 265 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 110, tech: 'fdm', flavour: 'marlin' },
  { id: 'elegoo-neptune4pro', vendor: 'Elegoo', model: 'Neptune 4 Pro', bed: { x: 225, y: 225, z: 265 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 120, tech: 'fdm', flavour: 'marlin' },
  { id: 'elegoo-centauri-carbon', vendor: 'Elegoo', model: 'Centauri Carbon', bed: { x: 256, y: 256, z: 256 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 130, tech: 'fdm', flavour: 'orca' },
  { id: 'elegoo-saturn4-ultra', vendor: 'Elegoo', model: 'Saturn 4 Ultra', bed: { x: 218, y: 123, z: 220 }, nozzle: 0, maxColors: 1, extruder: 'direct', powerW: 65, tech: 'resin', flavour: 'generic' },
  { id: 'elegoo-mars5-ultra', vendor: 'Elegoo', model: 'Mars 5 Ultra', bed: { x: 153, y: 77, z: 165 }, nozzle: 0, maxColors: 1, extruder: 'direct', powerW: 45, tech: 'resin', flavour: 'generic' },

  // ── Sovol ─────────────────────────────────────────────────
  { id: 'sovol-sv08',       vendor: 'Sovol',    model: 'SV08',      bed: { x: 350, y: 350, z: 345 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 160, tech: 'fdm', flavour: 'orca' },
  { id: 'sovol-sv06',       vendor: 'Sovol',    model: 'SV06',      bed: { x: 220, y: 220, z: 250 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 100, tech: 'fdm', flavour: 'marlin' },
  { id: 'sovol-sv07',       vendor: 'Sovol',    model: 'SV07',      bed: { x: 220, y: 220, z: 250 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 110, tech: 'fdm', flavour: 'orca' },

  // ── Snapmaker ─────────────────────────────────────────────
  { id: 'snapmaker-u1',     vendor: 'Snapmaker', model: 'U1',       bed: { x: 270, y: 270, z: 270 }, nozzle: 0.4, maxColors: 4, extruder: 'direct', powerW: 140, tech: 'fdm', flavour: 'orca' },
  { id: 'snapmaker-artisan', vendor: 'Snapmaker', model: 'Artisan', bed: { x: 400, y: 400, z: 400 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 200, tech: 'fdm', flavour: 'marlin' },
  { id: 'snapmaker-j1',     vendor: 'Snapmaker', model: 'J1',       bed: { x: 300, y: 200, z: 200 }, nozzle: 0.4, maxColors: 2, extruder: 'direct', powerW: 150, tech: 'fdm', flavour: 'marlin' },

  // ── Qidi ──────────────────────────────────────────────────
  { id: 'qidi-plus4',       vendor: 'QIDI',     model: 'Plus4',     bed: { x: 305, y: 305, z: 280 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 170, tech: 'fdm', flavour: 'orca' },
  { id: 'qidi-x-max3',      vendor: 'QIDI',     model: 'X-Max 3',   bed: { x: 325, y: 325, z: 315 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 180, tech: 'fdm', flavour: 'orca' },
  { id: 'qidi-x-plus3',     vendor: 'QIDI',     model: 'X-Plus 3',  bed: { x: 280, y: 280, z: 270 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 150, tech: 'fdm', flavour: 'orca' },

  // ── Voron (self-build) ────────────────────────────────────
  { id: 'voron-24-350',     vendor: 'Voron',    model: '2.4 (350mm)', bed: { x: 350, y: 350, z: 350 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 170, tech: 'fdm', flavour: 'marlin' },
  { id: 'voron-trident-300', vendor: 'Voron',   model: 'Trident (300mm)', bed: { x: 300, y: 300, z: 250 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 150, tech: 'fdm', flavour: 'marlin' },
  { id: 'voron-01',         vendor: 'Voron',    model: 'V0.1',      bed: { x: 120, y: 120, z: 120 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 70,  tech: 'fdm', flavour: 'marlin' },

  // ── FLSUN (delta) ─────────────────────────────────────────
  { id: 'flsun-v400',       vendor: 'FLSUN',    model: 'V400',      bed: { x: 300, y: 300, z: 410 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 140, tech: 'fdm', flavour: 'marlin' },
  { id: 'flsun-s1',         vendor: 'FLSUN',    model: 'S1',        bed: { x: 320, y: 320, z: 430 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 160, tech: 'fdm', flavour: 'orca' },

  // ── Ultimaker / Raise3D (pro) ─────────────────────────────
  { id: 'ultimaker-s5',     vendor: 'UltiMaker', model: 'S5',       bed: { x: 330, y: 240, z: 300 }, nozzle: 0.4, maxColors: 2, extruder: 'bowden', powerW: 150, tech: 'fdm', flavour: 'generic' },
  { id: 'ultimaker-s3',     vendor: 'UltiMaker', model: 'S3',       bed: { x: 230, y: 190, z: 200 }, nozzle: 0.4, maxColors: 2, extruder: 'bowden', powerW: 120, tech: 'fdm', flavour: 'generic' },
  { id: 'raise3d-pro3',     vendor: 'Raise3D',   model: 'Pro3',     bed: { x: 300, y: 300, z: 300 }, nozzle: 0.4, maxColors: 2, extruder: 'direct', powerW: 190, tech: 'fdm', flavour: 'generic' },

  // ── Generic fallback ──────────────────────────────────────
  { id: 'generic-fdm',      vendor: 'Generic',  model: 'FDM printer', bed: { x: 220, y: 220, z: 250 }, nozzle: 0.4, maxColors: 1, extruder: 'direct', powerW: 100, tech: 'fdm', flavour: 'generic' },
  { id: 'generic-resin',    vendor: 'Generic',  model: 'Resin printer', bed: { x: 150, y: 90, z: 170 }, nozzle: 0, maxColors: 1, extruder: 'direct', powerW: 50, tech: 'resin', flavour: 'generic' },
];

function displayName(p) { return p ? `${p.vendor} ${p.model}`.trim() : ''; }

/** All catalog entries with a precomputed display name, sorted by vendor then model. */
function list() {
  return PRINTERS.map((p) => ({ ...p, name: displayName(p) }))
    .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.model.localeCompare(b.model));
}

/** Lookup by stable id. Returns the entry (with name) or null. */
function get(id) {
  const p = PRINTERS.find((x) => x.id === id);
  return p ? { ...p, name: displayName(p) } : null;
}

/**
 * Token search over vendor/model/name — every whitespace-separated token in the query
 * must appear somewhere in the entry, so "bambu x1" matches "Bambu Lab X1 Carbon".
 * Empty query → full list.
 */
function search(query) {
  const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = list();
  if (!tokens.length) return all;
  return all.filter((p) => {
    const hay = `${p.name} ${p.vendor} ${p.model}`.toLowerCase();
    return tokens.every((tok) => hay.includes(tok));
  });
}

/**
 * Map a catalog entry to the fields a Khayt machine stores. Non-destructive: returns a
 * patch to merge onto a machine draft. `machineName` is the display name; the caller
 * decides whether to overwrite a user-edited name.
 */
function toMachineSpecs(entry) {
  const p = typeof entry === 'string' ? get(entry) : entry;
  if (!p) return {};
  return {
    printerModel: p.id,
    printerName: displayName(p),
    vendor: p.vendor,
    bed: p.bed ? { ...p.bed } : null,
    nozzleDiameter: p.nozzle || null,
    maxColors: p.maxColors || 1,
    extruderType: p.extruder === 'direct' ? 'Direct Drive' : (p.extruder === 'bowden' ? 'Bowden' : ''),
    powerDraw: p.powerW || null,
    tech: p.tech || 'fdm',
    flavour: p.flavour || 'generic',
  };
}

const api = { list, get, search, displayName, toMachineSpecs, PRINTERS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytPrinterCatalog = api;
})();
