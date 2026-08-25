/**
 * Normalisation shared by every printer adapter.
 *
 * Each firmware reports progress differently — OctoPrint gives 0-100, Moonraker
 * a 0-1 fraction, Duet a byte offset into the file, Repetier its own field — and
 * each adapter converted in its own way with no shared floor or ceiling. A
 * printer that reports something unexpected therefore reached the UI unchecked.
 *
 * The concrete bug this was written for: Duet computed
 *
 *     (job.filePosition || 0) / (job.file?.size || 1) * 100
 *
 * so when the file size was absent — which Duet does report during the pre-print
 * phase, before the job file is fully parsed — the divisor fell back to 1 and a
 * 500 KB offset rendered as 50,000,000%.
 */

/** Clamp anything an adapter produces to a whole 0-100. Junk becomes 0. */
function normalizeProgress(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Percentage from a byte position within a file.
 *
 * Without a positive size this is not a percentage at all, so it reports 0
 * rather than inventing one — "unknown" reads better as no progress than as an
 * impossible number.
 */
function fileProgressPct(position, size) {
  const p = Number(position);
  const s = Number(size);
  if (!Number.isFinite(p) || !Number.isFinite(s) || s <= 0) return 0;
  return normalizeProgress((p / s) * 100);
}

/**
 * Seconds remaining, extrapolated linearly from time spent so far.
 *
 * Returns null rather than a number whenever the estimate would be meaningless:
 * no elapsed time, no progress yet (dividing by ~0 gives an absurd ETA), or
 * already finished. A missing ETA is honest; a wild one is not, and the UI shows
 * it to someone deciding whether to wait.
 */
function etaSeconds(elapsedSeconds, progressFraction) {
  const elapsed = Number(elapsedSeconds);
  const f = Number(progressFraction);
  if (!Number.isFinite(elapsed) || !Number.isFinite(f)) return null;
  if (elapsed <= 0) return null;
  if (f <= 0.01) return null;   // under 1% the extrapolation is noise
  if (f >= 1) return 0;
  return Math.max(0, Math.round((elapsed / f) * (1 - f)));
}


/**
 * Percentage from layers printed.
 *
 * Klipper publishes `print_stats.info.{current_layer,total_layer}`. It is a
 * better signal than file position for anything whose G-code is unevenly
 * distributed through the file, which is most decorative work.
 */
function layerProgressPct(info) {
  // Klipper reports EITHER field as null when the slicer has not set it —
  // print_stats.py stores `info_current_layer = None` until a
  // `SET_PRINT_STATS_INFO CURRENT_LAYER=` arrives. `Number(null)` is 0, and 0 is
  // finite, so a naive read turns "not set" into "layer zero": a slicer that
  // announces TOTAL_LAYER in its start g-code but never updates the current one
  // pinned this at 0% for the whole job and — because layers had "answered" —
  // never fell back to byte position, which would have said 44%. Absent has to
  // mean absent, so both fields are required to be actual numbers.
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const cur = n(info && info.current_layer);
  const total = n(info && info.total_layer);
  if (cur === null || total === null || total <= 0) return null;
  if (cur < 0) return null;
  return normalizeProgress((cur / total) * 100);
}

/**
 * How far through a Moonraker job we are, preferring layers over bytes.
 *
 * `virtual_sdcard.progress` is a BYTE position, and bytes are not work. Measured
 * against a real Snapmaker U1 printing a 31 MB relief, 2026-08-01:
 *
 *     actually done (elapsed vs the slicer's own estimate)   19.4%
 *     virtual_sdcard.progress (bytes)                         0.7%
 *     print_stats.info layers (5 of 28)                      17.9%
 *
 * The relief's detail lives in its upper layers, so almost all the G-code sits
 * at the end of the file and byte position barely moves for the first third of
 * the print. Khayt showed that 0.7% as the job's progress and extrapolated an
 * ETA from it — 176 hours, on a five-hour print.
 *
 * Layers are not perfect either (a tall layer takes longer than a short one),
 * so this returns which signal it used and the caller can say so.
 *
 * @returns {{percent: number, source: 'layers'|'bytes'}}
 */
function moonrakerProgress(printStats, virtualSdcard) {
  const byLayer = layerProgressPct(printStats && printStats.info);
  if (byLayer !== null) return { percent: byLayer, source: 'layers' };
  const frac = Number(virtualSdcard && virtualSdcard.progress);
  return { percent: normalizeProgress(Number.isFinite(frac) ? frac * 100 : 0), source: 'bytes' };
}

module.exports = { normalizeProgress, fileProgressPct, etaSeconds, layerProgressPct, moonrakerProgress };
