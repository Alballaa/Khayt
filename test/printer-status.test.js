const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { normalizeProgress, fileProgressPct, etaSeconds, layerProgressPct, moonrakerProgress } = require('../lib/printer-status.js');

/**
 * Six adapters, six different notions of "progress", none of them bounded.
 * The Duet one could produce a genuinely absurd number; the rest simply trusted
 * whatever the printer said.
 */

test('progress is clamped to a whole 0-100', () => {
  assert.equal(normalizeProgress(61.4), 61);
  assert.equal(normalizeProgress(0), 0);
  assert.equal(normalizeProgress(100), 100);
  assert.equal(normalizeProgress(140), 100, 'a printer over-reporting must not exceed the bar');
  assert.equal(normalizeProgress(-5), 0);
});

test('junk progress becomes 0 rather than NaN on screen', () => {
  for (const junk of [undefined, null, '', 'nearly done', NaN, Infinity, {}]) {
    assert.equal(normalizeProgress(junk), 0, `${JSON.stringify(junk)} leaked through`);
  }
});

test('THE DUET BUG: a byte offset with no file size is not a percentage', () => {
  // (job.filePosition || 0) / (job.file?.size || 1) * 100 — with size absent the
  // divisor fell back to 1, so a 500 KB offset rendered as 50,000,000%.
  assert.equal(fileProgressPct(500_000, undefined), 0);
  assert.equal(fileProgressPct(500_000, 0), 0, 'zero size must not divide');
  assert.equal(fileProgressPct(500_000, null), 0);
});

test('a byte offset with a real size is a real percentage', () => {
  assert.equal(fileProgressPct(500_000, 1_000_000), 50);
  assert.equal(fileProgressPct(0, 1_000_000), 0);
  assert.equal(fileProgressPct(1_000_000, 1_000_000), 100);
  assert.equal(fileProgressPct(2_000_000, 1_000_000), 100, 'past the end still caps at 100');
});

test('ETA extrapolates from elapsed time and progress', () => {
  // Half done after an hour → about an hour left.
  assert.equal(etaSeconds(3600, 0.5), 3600);
  assert.equal(etaSeconds(3600, 0.75), 1200);
  assert.equal(etaSeconds(3600, 1), 0, 'finished means nothing left');
});

test('ETA refuses to guess rather than printing a wild number', () => {
  // The old inline version used `progress || 1`, so 0% produced an ETA equal to
  // the elapsed time — a confident answer built on nothing.
  assert.equal(etaSeconds(60, 0), null, 'no progress yet — cannot extrapolate');
  assert.equal(etaSeconds(60, 0.005), null, 'under 1% is noise, not a signal');
  assert.equal(etaSeconds(0, 0.5), null, 'no elapsed time to extrapolate from');
  assert.equal(etaSeconds(undefined, 0.5), null);
  assert.equal(etaSeconds(3600, undefined), null);
});

test('every adapter routes its progress through the normaliser', () => {
  // Structural: a seventh adapter added later must not reintroduce raw arithmetic.
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const fn = main.slice(main.indexOf('async function fetchPrinterStatus'),
                        main.indexOf('function defaultPrinterPort'));
  // The allowlist is "helpers that clamp internally", not "lines I want to pass".
  // moonrakerProgress calls normalizeProgress on both of its branches, and
  // `prog` is its return value — so `progress: prog.percent` IS clamped, just
  // one call away. A raw `vs.progress * 100` still fails, which is the point.
  const rawProgress = fn.split('\n').filter(l =>
    /^\s*progress:/.test(l)
    && !/normalizeProgress\(|fileProgressPct\(/.test(l)
    && !/^\s*progress:\s*prog\.percent,?\s*$/.test(l));
  assert.deepEqual(rawProgress, [],
    `these bypass the clamp: ${rawProgress.map(s => s.trim()).join(' | ')}`);
});

test('the unreachable Bambu HTTP header is gone', () => {
  // Bambu returns earlier via MQTT, so this line never ran — but it implied
  // Bambu used HTTP bearer auth, which would mislead the next person to touch it.
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.ok(!/type === 'bambu'\)\s+headers\['Authorization'\]/.test(main),
    'dead Bambu HTTP auth header is back');
});

/* ── Moonraker authentication ────────────────────────────────────────────── */

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('Moonraker sends its API key like every other authenticated adapter', () => {
  // Moonraker accepts X-Api-Key from untrusted clients. Without it Khayt only
  // worked when the printer listed this machine in `trusted_clients`; a shop
  // running `force_logins: True` got a blanket 401 and no explanation.
  const statusBlock = mainSrc.slice(
    mainSrc.indexOf('async function fetchPrinterStatus'),
    mainSrc.indexOf('const get = async'),
  );
  assert.match(statusBlock, /'moonraker'\) headers\['X-Api-Key'\]|moonraker'\)\s*headers/,
    'moonraker is absent from the status auth headers');
});

test('the upload path authenticates Moonraker too', () => {
  const upload = mainSrc.slice(
    mainSrc.indexOf("fd.set('root', 'gcodes')") - 200,
    mainSrc.indexOf("fd.set('root', 'gcodes')") + 260,
  );
  assert.match(upload, /X-Api-Key/, 'moonraker upload sends no key');
});

test('an unset key is not sent as the string "undefined"', () => {
  // The old lines assigned apiKey unconditionally, so a machine saved without a
  // key sent `X-Api-Key: undefined` — worse than sending nothing, because
  // Moonraker in trusted-client mode needs no key at all.
  assert.ok(!/headers\['X-Api-Key'\] = apiKey;\n\s*if \(type === 'prusalink'\)/.test(mainSrc),
    'unguarded header assignment is back');
  assert.match(mainSrc, /if \(apiKey\) \{/, 'the non-empty-key guard is gone');
});

/**
 * Moonraker progress. The fixture below is a REAL payload, captured from a
 * Snapmaker U1 on 2026-08-01 while it printed a 31 MB relief — not a shape I
 * invented, which matters because the whole defect was that the invented shape
 * never showed the problem.
 *
 * At that moment the job was 19.4% done by the clock (65 min of the slicer's
 * 5h17m). Bytes said 0.7%; layers said 17.9%.
 */
const LIVE_U1 = {
  print_stats: {
    filename: 'KING-Abdulaziz-ART-200mm-U1_PLA_5h17m.gcode',
    total_duration: 4259.78, print_duration: 3688.72, filament_used: 16950.31,
    state: 'printing', info: { total_layer: 28, current_layer: 5 },
  },
  virtual_sdcard: { progress: 0.00668172566645534, is_active: true, file_position: 208363, file_size: 31184010 },
};

test('a real printing U1 does not report a five-hour job as 1% done', () => {
  const p = moonrakerProgress(LIVE_U1.print_stats, LIVE_U1.virtual_sdcard);
  assert.equal(p.source, 'layers');
  assert.equal(p.percent, 18, 'layer 5 of 28');
  // The byte figure this replaces. Guard the specific number so nobody
  // "simplifies" back to virtual_sdcard.progress.
  assert.notEqual(p.percent, normalizeProgress(LIVE_U1.virtual_sdcard.progress * 100));
});

test('and its ETA is hours, not weeks', () => {
  const p = moonrakerProgress(LIVE_U1.print_stats, LIVE_U1.virtual_sdcard);
  const eta = etaSeconds(LIVE_U1.print_stats.print_duration, p.percent / 100);
  const hours = eta / 3600;
  // ~4.2 h genuinely remained. Anything in the right ballpark is fine; what
  // must never come back is the 178 hours the inline arithmetic produced.
  assert.ok(hours > 2 && hours < 8, `ETA was ${hours.toFixed(1)} h`);

  // What the old inline expression did with this very payload.
  const vs = LIVE_U1.virtual_sdcard, ps = LIVE_U1.print_stats;
  const old = Math.round((ps.total_duration / (vs.progress || 1)) * (1 - (vs.progress || 0)));
  assert.ok(old / 3600 > 100, 'the old path really did produce a triple-digit-hour ETA');
});

test('layers are used only when Klipper actually reports them', () => {
  assert.equal(layerProgressPct({ current_layer: 5, total_layer: 28 }), 18);
  assert.equal(layerProgressPct({ current_layer: 0, total_layer: 28 }), 0, 'first layer is not "no data"');
  // Anything unusable falls through to bytes rather than inventing a number.
  for (const info of [null, undefined, {}, { total_layer: 0, current_layer: 3 }, { current_layer: 'x', total_layer: 10 }]) {
    assert.equal(layerProgressPct(info), null, JSON.stringify(info));
  }
  const noLayers = moonrakerProgress({ info: {} }, { progress: 0.5 });
  assert.deepEqual(noLayers, { percent: 50, source: 'bytes' });
});

test('a printer that reports neither reads as 0, not as NaN', () => {
  assert.deepEqual(moonrakerProgress({}, {}), { percent: 0, source: 'bytes' });
  assert.deepEqual(moonrakerProgress(null, null), { percent: 0, source: 'bytes' });
});
