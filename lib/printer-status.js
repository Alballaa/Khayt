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

module.exports = { normalizeProgress, fileProgressPct, etaSeconds };
