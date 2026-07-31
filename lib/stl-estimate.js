'use strict';
/**
 * Pure print estimator: turn STL geometry (lib/stl-parse.js) into a *draft*
 * weight + print-time estimate the calculator can price. Like lib/ai-quote.js,
 * it fills the form and surfaces its assumptions — it NEVER finalizes a price.
 *
 * Estimates are deliberately simple + transparent (no slicing):
 *  - weight = solidWeight × (shell + (1−shell)·infill)
 *  - time   = printedVolume / volumetricThroughput
 * Every knob is an option with a sane default; the UI lets the user adjust.
 */
(function (global) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round1 = (v) => Math.round(v * 10) / 10;
  const round2 = (v) => Math.round(v * 100) / 100;

  // Fallbacks, not doctrine. Every one of these is a shop setting now
  // (settings.estimator, see fromSettings below); these are what a shop that has
  // said nothing gets, and they are the values this estimator always used, so an
  // unconfigured shop's numbers do not move.
  //
  // throughputMm3PerS is the weakest of them by far: "effective volumetric flow
  // including travel and acceleration overhead" is not something a shop knows
  // about its own printer, and 8 mm³/s with PLA implies about 35 g/h, which no
  // real FDM machine sustains. lib/estimate-calibration.js derives it from the
  // shop's own measured jobs instead, and that beats anything typed here.
  const DEFAULTS = {
    densityGPerCm3: 1.24,     // PLA
    infillPct: 0.2,           // 20%
    shellFactor: 0.35,        // fraction of solid attributable to walls/top/bottom
    throughputMm3PerS: 8,     // see above — measured in preference to guessed
    wastePct: 0.03,           // purge/brim/support slack
  };

  /**
   * Read the shop's estimator settings, falling back per-field.
   *
   * Per-field on purpose: a shop that set only a density should keep the
   * defaults for everything else rather than having a partial object replace the
   * lot.
   */
  function fromSettings(settings) {
    const e = (settings && settings.estimator) || {};
    const pick = (key, lo, hi) => {
      const v = Number(e[key]);
      return Number.isFinite(v) && v >= lo && v <= hi ? v : DEFAULTS[key];
    };
    return {
      densityGPerCm3:    pick('densityGPerCm3', 0.1, 25),
      infillPct:         pick('infillPct', 0, 1),
      shellFactor:       pick('shellFactor', 0, 1),
      throughputMm3PerS: pick('throughputMm3PerS', 0.5, 500),
      wastePct:          pick('wastePct', 0, 0.5),
    };
  }

  /**
   * @param geom { volumeMm3, bbox:{x,y,z} } from parseStl
   * @param opts subset of DEFAULTS
   * @returns { solidVolumeCm3, solidWeightG, estWeightG, estPrintTimeH, dimsMm, effectiveFraction, assumptions[] }
   */
  function estimateFromStl(geom, opts = {}) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const density = Math.max(0.1, +o.densityGPerCm3 || DEFAULTS.densityGPerCm3);
    const infill = clamp(+o.infillPct || 0, 0, 1);
    const shell = clamp(+o.shellFactor || 0, 0, 1);
    const throughput = Math.max(0.5, +o.throughputMm3PerS || DEFAULTS.throughputMm3PerS);
    const waste = clamp(+o.wastePct || 0, 0, 0.5);

    const volMm3 = Math.max(0, +geom?.volumeMm3 || 0);
    const solidVolumeCm3 = volMm3 / 1000;
    const solidWeightG = solidVolumeCm3 * density;
    const effectiveFraction = shell + (1 - shell) * infill;
    const estWeightG = solidWeightG * effectiveFraction * (1 + waste);

    const printedVolumeMm3 = (estWeightG / density) * 1000;
    const estPrintTimeH = printedVolumeMm3 / (throughput * 3600);

    const bbox = geom && geom.bbox ? geom.bbox : { x: 0, y: 0, z: 0 };
    const dimsMm = { x: round1(bbox.x || 0), y: round1(bbox.y || 0), z: round1(bbox.z || 0) };

    return {
      solidVolumeCm3: round1(solidVolumeCm3),
      solidWeightG: round1(solidWeightG),
      estWeightG: round1(estWeightG),
      estPrintTimeH: round2(estPrintTimeH),
      effectiveFraction: Math.round(effectiveFraction * 100) / 100,
      dimsMm,
      assumptions: {
        densityGPerCm3: density, infillPct: infill, shellFactor: shell,
        throughputMm3PerS: throughput, wastePct: waste,
      },
    };
  }

  const api = { estimateFromStl, fromSettings, ESTIMATE_DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytStl = Object.assign(global.KhaytStl || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
