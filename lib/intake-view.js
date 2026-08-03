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
   * @param {object} [opts]      the estimator options in full — everything
   *                             lib/stl-estimate.js accepts is forwarded, so the
   *                             shop's density, wall and calibrated throughput
   *                             all reach the number the calculator shows
   * @param {number} [opts.infillPct]  0..1, the shop's current infill
   * @param {function} [opts.estimate] estimateFromStl, injected so this module
   *                                   stays free of a hard dependency
   * @param {{scope: string, jobs: number}} [opts.calibratedFrom]
   *                             set by lib/estimate-calibration.js when measured
   *                             jobs earned the rate; drives measured-vs-assumed
   * @returns {{
   *   mode: 'exact'|'estimate'|'none',
   *   weightG: number|null, timeH: number|null,
   *   calibrated: {scope: string, jobs: number, gramsPerHour: number}|null,
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
      // The WHOLE option set, not just the infill. The caller has already folded
      // the shop's own settings and any calibration learned from its measured
      // jobs into `opts`; forwarding one field of it meant the calculator quoted
      // on the module defaults — PLA at 1.24 and a shipped throughput — while
      // the settings panel showed the shop something else entirely, and a
      // measured rate never reached a quote at all.
      const est = opts.estimate(g, Object.assign({}, opts, { infillPct }));

      // Where the rate came from. lib/estimate-calibration.js sets
      // `calibratedFrom` only when real jobs earned it, so its absence is the
      // honest signal that the time below is a guess.
      const cal = (opts.calibratedFrom && opts.calibratedFrom.jobs > 0) ? opts.calibratedFrom : null;
      // Rearranged back out of the throughput the estimator works in: grams per
      // hour is the figure a shop can recognise, and the only one it can measure.
      const rateGPerH = round1(
        est.assumptions.densityGPerCm3 * est.assumptions.throughputMm3PerS * 3.6);

      return {
        mode: 'estimate',
        weightG: round1(est.estWeightG),
        timeH: round2(est.estPrintTimeH),
        // Surfaced so the caller can style the whole block as a warning rather
        // than relying on one line of prose being read.
        reliable: est.reliable !== false,
        // Provenance of the RATE, structured. Prose can be reworded or
        // translated away; a test asserting on the sentence proves nothing about
        // what the shop was told.
        calibrated: cal ? { scope: cal.scope || 'shop', jobs: cal.jobs, gramsPerHour: rateGPerH } : null,
        note: [
          // First line, emphasised: the reader must not have to reach the third
          // line to learn this is not a measurement.
          { key: 'intake.estimate_head', strong: true },
          // Second line, also emphasised, ONLY when the geometry is outside what
          // the estimator can describe. Measured against a real slicer, those
          // parts come out anywhere from +58% to -66%, which is not a margin —
          // it is the difference between a job and a loss.
          ...(est.reliable === false ? [{ key: 'intake.estimate_unreliable', strong: true }] : []),
          { key: 'stl.note_tpl', vars: {
            x: est.dimsMm.x, y: est.dimsMm.y, z: est.dimsMm.z,
            solid: est.solidWeightG, weight: est.estWeightG, time: est.estPrintTimeH } },
          { key: 'stl.note_assume', vars: {
            infill: Math.round(infillPct * 100), density: est.assumptions.densityGPerCm3 } },
          // A measured rate and a guessed one must never read the same. The time
          // above is the half of the estimate that moves most between shops, and
          // a shop that has taught Khayt what its printers do should be able to
          // see that it took.
          cal
            ? { key: 'stl.note_rate_measured', vars: { rate: rateGPerH, n: cal.jobs } }
            : { key: 'stl.note_rate_assumed', vars: { rate: rateGPerH } },
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
