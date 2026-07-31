'use strict';
/**
 * What the calculator should SAY about a file it just read.
 *
 * lib/model-intake.js decides whether a number came from a slicer or from
 * geometry. This decides how that is presented, and it lives here rather than
 * inside the renderer's event wiring because it is the one piece of R1 that can
 * do real harm: a geometric estimate shown as though it were a sliced figure
 * becomes a quote the shop cannot honour. That branch needs a test, and a
 * function buried in wireEvents() cannot have one.
 *
 * Returns keys and interpolation values, not sentences — the caller translates.
 * Numbers are rounded here so the note and the form field can never disagree
 * about what was applied.
 */
(function (global) {
  const round1 = (v) => Math.round(v * 10) / 10;
  const round2 = (v) => Math.round(v * 100) / 100;

  /**
   * @param {object} res         a model-intake result (or the IPC echo of one)
   * @param {object} [opts]
   * @param {number} [opts.infillPct]  0..1, the shop's current infill
   * @param {function} [opts.estimate] estimateFromStl, injected so this module
   *                                   stays free of a hard dependency
   * @returns {{
   *   mode: 'exact'|'estimate'|'none',
   *   weightG: number|null, timeH: number|null,
   *   note: Array<{key: string, vars?: object, strong?: boolean}>,
   *   toast: {key: string, kind: string},
   *   material: string|null
   * }}
   */
  function presentIntake(res, opts = {}) {
    const none = (key) => ({
      mode: 'none', weightG: null, timeH: null, note: [],
      toast: { key, kind: 'warning' }, material: null,
    });

    if (!res) return none('calc.parse_failed');

    // --- The slicer already worked this out. -------------------------------
    // Guarded on the numbers as well as the flag: `exact` without both figures
    // would fill the form with a missing half that reads as zero.
    if (res.exact && res.printTimeMins > 0 && res.filamentGrams > 0) {
      return {
        mode: 'exact',
        weightG: round1(res.filamentGrams),
        timeH: round2(res.printTimeMins / 60),
        note: [{
          key: 'intake.exact',
          vars: {
            file: res.filename || '',
            slicer: res.slicer || null,       // caller substitutes 'your slicer'
            grams: round1(res.filamentGrams),
            time: round2(res.printTimeMins / 60),
          },
        }],
        toast: { key: 'intake.exact_toast', kind: 'success' },
        material: res.filamentType || null,
      };
    }

    // --- Nobody sliced it: geometry, clearly flagged. -----------------------
    const g = res.geometry;
    if (res.source === 'geometry' && g && g.volumeMm3 > 0 && typeof opts.estimate === 'function') {
      const infillPct = Number.isFinite(opts.infillPct) ? opts.infillPct : 0.2;
      const est = opts.estimate(g, { infillPct });
      return {
        mode: 'estimate',
        weightG: round1(est.estWeightG),
        timeH: round2(est.estPrintTimeH),
        note: [
          // First line, emphasised: the reader must not have to reach the third
          // line to learn this is not a measurement.
          { key: 'intake.estimate_head', strong: true },
          { key: 'stl.note_tpl', vars: {
            x: est.dimsMm.x, y: est.dimsMm.y, z: est.dimsMm.z,
            solid: est.solidWeightG, weight: est.estWeightG, time: est.estPrintTimeH } },
          { key: 'stl.note_assume', vars: {
            infill: Math.round(infillPct * 100), density: est.assumptions.densityGPerCm3 } },
          { key: 'intake.estimate_advice' },
        ],
        toast: { key: 'intake.estimate_toast', kind: 'info' },
        material: null,
      };
    }

    // --- Nothing usable. Say which kind of nothing. -------------------------
    const w = res.warnings || [];
    if (w.includes('no-slicer-summary')) return none('intake.no_summary');
    if (w.includes('unsupported')) return none('intake.unsupported');
    return none('calc.parse_failed');
  }

  const api = { presentIntake };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytIntakeView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
