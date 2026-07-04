'use strict';
/**
 * Target-printer registry for the 3MF converter — the "add more printers" surface.
 * Pure data + lookups, no DOM, so it's shared by the engine (lib/mf-convert.js), the
 * main-process IPC and the renderer UI, and is trivially extended: add an entry here and
 * it appears everywhere.
 *
 * Each profile describes what a converted 3MF needs to target that printer's multicolour
 * system. Values are best-effort defaults the maker can rely on for slot remapping and
 * re-profiling; the converter only rewrites metadata/config members and never touches the
 * mesh, so an imperfect field degrades gracefully (the file still opens; the maker tweaks
 * in their slicer) rather than corrupting geometry.
 *
 *   id           stable key
 *   name         display name
 *   vendor       brand
 *   flavour      the slicer 3MF dialect this printer uses: 'bambu'|'orca'|'prusa'|'generic'
 *   maxColors    physical multicolour slots (AMS / CFS / MMU / toolhead)
 *   bed          build volume {x,y,z} mm
 *   nozzle       default nozzle diameter mm
 *   printerModel vendor printer_model identifier written into project settings
 *   gcodeFlavour target g-code flavour hint
 *   system       name of the multicolour system (for UI copy)
 */
const PROFILES = [
  {
    id: 'snapmaker-u1', name: 'Snapmaker U1', vendor: 'Snapmaker', flavour: 'orca',
    maxColors: 4, bed: { x: 220, y: 220, z: 220 }, nozzle: 0.4,
    printerModel: 'Snapmaker U1', gcodeFlavour: 'marlin', system: 'U1 4-colour',
  },
  {
    id: 'bambu-x1c', name: 'Bambu Lab X1 Carbon', vendor: 'Bambu Lab', flavour: 'bambu',
    maxColors: 4, bed: { x: 256, y: 256, z: 256 }, nozzle: 0.4,
    printerModel: 'Bambu Lab X1 Carbon', gcodeFlavour: 'marlin', system: 'AMS',
  },
  {
    id: 'bambu-p1s', name: 'Bambu Lab P1S', vendor: 'Bambu Lab', flavour: 'bambu',
    maxColors: 4, bed: { x: 256, y: 256, z: 256 }, nozzle: 0.4,
    printerModel: 'Bambu Lab P1S', gcodeFlavour: 'marlin', system: 'AMS',
  },
  {
    id: 'bambu-a1', name: 'Bambu Lab A1', vendor: 'Bambu Lab', flavour: 'bambu',
    maxColors: 4, bed: { x: 256, y: 256, z: 256 }, nozzle: 0.4,
    printerModel: 'Bambu Lab A1', gcodeFlavour: 'marlin', system: 'AMS lite',
  },
  {
    id: 'prusa-mk4-mmu3', name: 'Prusa MK4 + MMU3', vendor: 'Prusa Research', flavour: 'prusa',
    maxColors: 5, bed: { x: 250, y: 210, z: 220 }, nozzle: 0.4,
    printerModel: 'MK4IS', gcodeFlavour: 'marlin', system: 'MMU3 5-colour',
  },
  {
    id: 'prusa-xl-5t', name: 'Prusa XL (5 toolheads)', vendor: 'Prusa Research', flavour: 'prusa',
    maxColors: 5, bed: { x: 360, y: 360, z: 360 }, nozzle: 0.4,
    printerModel: 'XL5T', gcodeFlavour: 'marlin', system: '5 toolheads',
  },
  {
    id: 'creality-k2', name: 'Creality K2 Plus', vendor: 'Creality', flavour: 'orca',
    maxColors: 4, bed: { x: 350, y: 350, z: 350 }, nozzle: 0.4,
    printerModel: 'Creality K2 Plus', gcodeFlavour: 'marlin', system: 'CFS',
  },
  {
    id: 'anycubic-kobra-s1', name: 'Anycubic Kobra S1', vendor: 'Anycubic', flavour: 'orca',
    maxColors: 4, bed: { x: 250, y: 250, z: 250 }, nozzle: 0.4,
    printerModel: 'Anycubic Kobra S1', gcodeFlavour: 'marlin', system: 'ACE Pro',
  },
];

// A synthetic "target" for the format-normalize mode (strip vendor lock → generic 3MF).
const GENERIC = {
  id: 'generic-3mf', name: 'Generic / any slicer', vendor: '', flavour: 'generic',
  maxColors: 16, bed: null, nozzle: 0.4, printerModel: '', gcodeFlavour: 'marlin', system: 'standard 3MF',
};

function listProfiles() {
  return PROFILES.map((p) => ({ ...p }));
}

function getProfile(id) {
  if (id === GENERIC.id) return { ...GENERIC };
  const p = PROFILES.find((x) => x.id === id);
  return p ? { ...p } : null;
}

const api = { PROFILES, GENERIC, listProfiles, getProfile };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytPrinterProfiles = api;
