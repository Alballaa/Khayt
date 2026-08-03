'use strict';
/**
 * Run a 3MF analyse or convert on a worker thread instead of the main process.
 *
 * See lib/mf-worker.js for the measurements that made this necessary. This side
 * owns the lifecycle: one worker per job, always terminated, never left behind
 * to hold a few hundred megabytes after the answer has been delivered.
 *
 * Deliberately NOT a pool. These jobs are minutes long and hundreds of
 * megabytes; a warm pool would keep that memory resident between conversions to
 * save a worker startup measured in milliseconds.
 */
const path = require('path');

/**
 * Where the worker file really is.
 *
 * In a packaged build lib/ lives inside app.asar, and `new Worker()` needs a
 * path the OS can open — Electron's asar shim covers fs reads, not thread
 * bootstrap. build.asarUnpack keeps mf-worker.js outside the archive; this
 * rewrites the path to match, and falls back to the in-place path so a dev run
 * (no asar at all) is unaffected. Getting this wrong is invisible until the
 * app is packaged, which is the worst time to find out.
 */
const IN_PLACE = path.join(__dirname, 'mf-worker.js');
const UNPACKED = IN_PLACE.replace(/\bapp\.asar\b/, 'app.asar.unpacked');
const WORKER = (() => {
  if (UNPACKED === IN_PLACE) return IN_PLACE;
  try { return require('fs').existsSync(UNPACKED) ? UNPACKED : IN_PLACE; } catch (_) { return IN_PLACE; }
})();

/** A convert can legitimately run for minutes. This is a hang guard, not a budget. */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * @param {'analyze'|'convert'} op
 * @param {Buffer} buf                the file's bytes
 * @param {object} [opts]             passed through to mf-convert
 * @param {object} [deps]             { Worker, timeoutMs } — injected for tests
 * @returns {Promise<object>} whatever mf-convert would have returned
 */
function runMf(op, buf, opts = {}, deps = {}) {
  const Worker = deps.Worker || require('worker_threads').Worker;
  const timeoutMs = deps.timeoutMs || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    let worker = null;
    let timer = null;

    // Every exit path goes through here. The `settled` flag buys idempotent
    // TEARDOWN — one terminate, one clearTimeout — not resolution safety:
    // resolving a promise twice is already a no-op, so removing this flag
    // changes nothing a caller can observe. Worth keeping and worth not
    // overstating; a worker told to terminate twice, or a timer left to fire
    // after the answer, is untidy rather than wrong.
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { worker && worker.terminate(); } catch (_) { /* already gone */ }
      resolve(value);
    };

    // The bytes are handed over, not copied — a 229 MB structured clone would
    // double peak memory for no gain, and this side does not read them again.
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const owns = u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength;
    const bytes = owns ? u8 : new Uint8Array(u8);
    if (!owns) bytes.set(u8);

    try {
      worker = new Worker(WORKER, {
        workerData: { op, bytes, opts },
        transferList: [bytes.buffer],
      });
    } catch (e) {
      return finish({ ok: false, error: String((e && e.message) || e) });
    }

    timer = setTimeout(() => finish({ ok: false, error: `${op} timed out` }), timeoutMs);

    worker.on('message', (msg) => {
      if (!msg || !msg.ok) return finish({ ok: false, error: (msg && msg.error) || 'worker failed' });
      const r = msg.result;
      // Convert hands back a Uint8Array across the thread boundary; callers
      // downstream write it to disk and expect a Buffer.
      if (r && r.buffer && !Buffer.isBuffer(r.buffer)) {
        r.buffer = Buffer.from(r.buffer.buffer, r.buffer.byteOffset, r.buffer.byteLength);
      }
      finish(r);
    });
    worker.on('error', (e) => finish({ ok: false, error: String((e && e.message) || e) }));
    worker.on('exit', (code) => {
      // Only meaningful if it beat the message — a worker killed by the OS
      // under memory pressure exits without ever posting anything, and the
      // caller must get an answer rather than a promise that never settles.
      if (code !== 0) finish({ ok: false, error: `worker stopped (exit ${code})` });
      else finish({ ok: false, error: 'worker exited without a result' });
    });
  });
}

module.exports = { runMf, WORKER, DEFAULT_TIMEOUT_MS };
