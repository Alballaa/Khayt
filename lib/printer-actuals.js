'use strict';

(function (global) {
/**
 * What the print ACTUALLY used, taken from the printer rather than typed in.
 *
 * Khayt has had `actualPrintTime` and `actualWeight` on every order for a long
 * time, and analytics, the dashboard and the expense split all read them. The
 * only thing that ever wrote them was a dialog on completion, pre-filled with
 * the ESTIMATE — so a shop that hits confirm records the estimate a second time
 * under a different name, and estimate-versus-actual reports a variance of zero
 * for a job that ran two hours long. That is worse than an empty field: it looks
 * like knowledge.
 *
 * Two of the printers Khayt already polls hand these numbers over for free, in
 * responses it was already fetching and discarding:
 *
 *   Moonraker  print_stats.filament_used   mm extruded
 *              print_stats.print_duration  seconds actually printing
 *   OctoPrint  job.filament.tool0.length   mm extruded (volume, in cm³, too)
 *              progress.printTime          seconds actually printing
 *   PrusaLink  job.time_printing
 *   Duet       job.rawExtrusion, job.duration
 *
 * Note `print_duration`, not `total_duration`: Moonraker's total includes the
 * time the machine sat heating and idling either side of the job, which is not
 * what the shop is comparing against a sliced estimate.
 *
 * Pure — takes the payload a poller already has, returns numbers. No fetch, no
 * store, no clock.
 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Filament stock the shop might be running, for the mm → grams conversion. */
const DEFAULT_DIAMETER_MM = 1.75;
const DEFAULT_DENSITY_G_CM3 = 1.24;   // PLA

/**
 * Length of extruded filament → grams.
 *
 * A printer reports how far it pushed the filament, not what that weighed, so
 * the conversion needs the stock's diameter and density. Getting the diameter
 * wrong matters more than it looks: 2.85mm stock is 2.65× the cross-section of
 * 1.75mm, so the same length is more than two and a half times the mass.
 *
 *   grams = π · (d/2)² · L / 1000 · density
 */
function filamentMmToGrams(lengthMm, opts = {}) {
  const L = num(lengthMm);
  if (L === null || L === 0) return null;
  // Absent stock figures fall back to the documented defaults. Figures that are
  // PRESENT but impossible do not: a diameter of 0 is corrupt configuration, and
  // quietly substituting 1.75 would hand back a number that looks measured while
  // resting on an assumption the shop never made.
  const given = (v) => v !== undefined && v !== null && v !== '';
  const d = given(opts.diameterMm) ? num(opts.diameterMm) : DEFAULT_DIAMETER_MM;
  const density = given(opts.densityGPerCm3) ? num(opts.densityGPerCm3) : DEFAULT_DENSITY_G_CM3;
  if (d === null || density === null || d <= 0 || density <= 0) return null;
  const r = d / 2;
  const volumeCm3 = (Math.PI * r * r * L) / 1000;
  return volumeCm3 * density;
}

function blank() {
  return { filamentMm: null, filamentGrams: null, durationS: null, source: null };
}

/**
 * Pull the actuals out of one printer's raw poll payload.
 *
 * @param {string} type    'moonraker' | 'octoprint' | 'prusalink' | 'duet' | 'bambu' | …
 * @param {object} raw     the payload the poller already fetched
 * @param {object} [opts]  { diameterMm, densityGPerCm3 } for the mm → g conversion
 * @returns {{filamentMm, filamentGrams, durationS, source}}
 */
function extractActuals(type, raw, opts = {}) {
  const out = blank();
  if (!raw || typeof raw !== 'object') return out;
  const kind = String(type || '').toLowerCase();

  if (kind === 'moonraker') {
    const ps = raw?.result?.status?.print_stats || raw?.print_stats || {};
    out.filamentMm = num(ps.filament_used);
    // print_duration, not total_duration — see the header.
    out.durationS = num(ps.print_duration);
    out.source = 'moonraker';
  } else if (kind === 'octoprint') {
    const job = raw?.job || {};
    const progress = raw?.progress || {};
    // OctoPrint splits filament per tool. A multi-tool job is the sum, not tool0.
    const fil = job?.filament;
    if (fil && typeof fil === 'object') {
      let mm = 0, volume = 0, any = false;
      for (const tool of Object.values(fil)) {
        if (!tool || typeof tool !== 'object') continue;
        const l = num(tool.length);
        const v = num(tool.volume);
        if (l !== null) { mm += l; any = true; }
        if (v !== null) volume += v;
      }
      if (any) out.filamentMm = mm;
      // OctoPrint gives volume in cm³ directly, which needs no diameter guess —
      // strictly better than deriving it from length, so prefer it.
      if (volume > 0) {
        const density = num(opts.densityGPerCm3) || DEFAULT_DENSITY_G_CM3;
        out.filamentGrams = volume * density;
      }
    }
    out.durationS = num(progress.printTime);
    out.source = 'octoprint';
  } else if (kind === 'prusalink') {
    const job = raw?.job || {};
    out.durationS = num(job.time_printing);
    // PrusaLink reports no filament figure, so weight stays unknown rather than
    // being invented from progress.
    out.source = 'prusalink';
  } else if (kind === 'duet') {
    const job = raw?.result?.job || raw?.job || {};
    const rawEx = job.rawExtrusion;
    out.filamentMm = num(rawEx);
    out.durationS = num(job.duration);
    out.source = 'duet';
  } else if (kind === 'bambu') {
    // Bambu's MQTT report carries no cumulative extrusion, and deriving elapsed
    // time from "remaining ÷ percent" is badly behaved at both ends of a job.
    // So nothing is claimed here — the shop types these, as they did before.
    out.source = 'bambu';
  } else {
    return out;
  }

  if (out.filamentGrams === null && out.filamentMm !== null) {
    out.filamentGrams = filamentMmToGrams(out.filamentMm, opts);
  }
  // A zero-length or zero-second reading is a printer that has not run, not a
  // job that used nothing. Reporting 0 g would tell a shop the print was free.
  if (out.filamentMm === 0) out.filamentMm = null;
  if (out.durationS === 0) out.durationS = null;
  // Belt and braces: filamentMmToGrams already refuses a zero length, and the
  // OctoPrint volume branch is guarded on volume > 0, so nothing reaching here
  // should be non-positive. This only makes that impossible rather than merely
  // unlikely — a 0 g reading recorded against a job says the print was free.
  if (out.filamentGrams !== null && !(out.filamentGrams > 0)) out.filamentGrams = null;
  return out;
}

/** Does this reading carry anything worth recording? */
const hasActuals = (a) => !!(a && (a.filamentGrams > 0 || a.durationS > 0));

/**
 * Estimate versus actual, as a shop would read it.
 *
 * Returns nulls rather than zeros when a side is missing — "we don't know" and
 * "it was bang on" must not look the same in a margin report.
 *
 * @param {{printTime?: number, weightG?: number}} estimate  hours and grams
 * @param {{durationS?: number, filamentGrams?: number}} actual
 */
function compareToEstimate(estimate, actual) {
  const est = estimate || {};
  const act = actual || {};
  const estH = num(est.printTime);
  const estG = num(est.weightG);
  const actH = act.durationS > 0 ? act.durationS / 3600 : null;
  const actG = act.filamentGrams > 0 ? act.filamentGrams : null;

  const pct = (e, a) => (e > 0 && a !== null ? ((a - e) / e) * 100 : null);
  const round2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
  const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);

  return {
    estimatedHours: round2(estH),
    actualHours: round2(actH),
    hoursDeltaPct: round1(pct(estH, actH)),
    estimatedGrams: round1(estG),
    actualGrams: round1(actG),
    gramsDeltaPct: round1(pct(estG, actG)),
    // True only when a real measurement exists on at least one axis — the flag
    // the UI uses to decide whether to say "measured" or ask the shop to type.
    measured: hasActuals(act),
  };
}

/**
 * How long a frozen completion stays relevant to an order. Beyond this the shop
 * has almost certainly run other jobs, and offering the figures would be
 * offering somebody else's print.
 */
const COMPLETION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * What to put in the "actual time / actual weight" fields when a job is marked
 * complete.
 *
 * The old dialog pre-filled both from the ESTIMATE, so the common case — a shop
 * glancing at the numbers and hitting confirm — wrote the estimate back under a
 * second name and reported a variance of zero. This offers the measurement when
 * there is one, and is explicit about which fields are measured so the dialog
 * can say so rather than implying it.
 *
 * A printer that reports only one of the two (PrusaLink gives duration and no
 * filament) yields a mixed answer: measured on one axis, estimated on the other.
 * Pretending otherwise in either direction would be a lie.
 *
 * @param {object} input
 *   estimate    { printTime (hours), weightG }
 *   completion  a poll cache `lastCompleted` — { at, filename, actuals }
 *   now         epoch ms
 * @returns {{
 *   timeH: number|null, weightG: number|null,
 *   timeMeasured: boolean, weightMeasured: boolean,
 *   measured: boolean, source: string|null, filename: string|null,
 *   staleReason: 'too-old'|'nothing-measured'|null
 * }}
 */
function prefillActuals(input) {
  const { estimate, completion, now } = input || {};
  const est = estimate || {};
  const estH = num(est.printTime);
  const estG = num(est.weightG);

  const base = {
    timeH: estH, weightG: estG,
    timeMeasured: false, weightMeasured: false,
    measured: false, source: null, filename: null,
    staleReason: null,
  };

  if (!completion || !completion.actuals) return { ...base, staleReason: 'nothing-measured' };
  const age = num(now) !== null && num(completion.at) !== null ? now - completion.at : null;
  if (age === null || age < 0 || age > COMPLETION_MAX_AGE_MS) {
    return { ...base, staleReason: 'too-old' };
  }
  const a = completion.actuals;
  if (!hasActuals(a)) return { ...base, staleReason: 'nothing-measured' };

  const measuredH = a.durationS > 0 ? a.durationS / 3600 : null;
  const measuredG = a.filamentGrams > 0 ? a.filamentGrams : null;

  return {
    timeH: measuredH !== null ? Math.round(measuredH * 100) / 100 : estH,
    weightG: measuredG !== null ? Math.round(measuredG * 10) / 10 : estG,
    timeMeasured: measuredH !== null,
    weightMeasured: measuredG !== null,
    measured: true,
    source: a.source || null,
    filename: completion.filename || null,
    staleReason: null,
  };
}

const api = {
  extractActuals,
  prefillActuals,
  COMPLETION_MAX_AGE_MS,
  filamentMmToGrams,
  compareToEstimate,
  hasActuals,
  DEFAULT_DIAMETER_MM,
  DEFAULT_DENSITY_G_CM3,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.KhaytPrinterActuals = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
