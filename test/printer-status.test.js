const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { normalizeProgress, fileProgressPct, etaSeconds } = require('../lib/printer-status.js');

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
  const rawProgress = fn.split('\n').filter(l =>
    /^\s*progress:/.test(l) && !/normalizeProgress\(|fileProgressPct\(/.test(l));
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
