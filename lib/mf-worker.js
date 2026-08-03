'use strict';
/**
 * Worker entry: runs a 3MF analyse or convert away from the main process.
 *
 * lib/mf-convert.js is synchronous CPU work, and it was being called straight
 * from an ipcMain handler. Measured on a real 229 MB six-colour project:
 *
 *     analyze    8.1 s     — runs on every file drop
 *     convert  377.9 s     — a retarget to a Snapmaker U1
 *
 * For all of that the main process could not turn a menu, close a window or
 * answer another IPC call, and macOS marks the app not responding. A shop
 * watching a frozen window for six minutes force-quits, which is
 * indistinguishable from the conversion being broken — and that is exactly how
 * the bug that led here was first described.
 *
 * Nothing about the conversion itself changes. It is the same function on the
 * same bytes; it simply runs somewhere the UI is not waiting on.
 */
const { parentPort, workerData } = require('worker_threads');
const MF = require('./mf-convert.js');

/**
 * A Buffer's underlying ArrayBuffer may be a shared pool slab — Node pools
 * allocations under 8 KB — so transferring it could hand away memory that other
 * Buffers are still using. Only transfer when the view owns the whole buffer.
 */
function transferable(buf) {
  if (!buf) return { view: null, transfer: [] };
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
    return { view: u8, transfer: [u8.buffer] };
  }
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return { view: copy, transfer: [copy.buffer] };
}

try {
  const { op, bytes, opts } = workerData;
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (op === 'analyze') {
    parentPort.postMessage({ ok: true, result: MF.analyze(buf, opts || {}) });
  } else if (op === 'convert') {
    const r = MF.convert(buf, opts || {});
    // The converted 3MF comes back as a Buffer. Transfer it rather than
    // structured-cloning it: a cloned 200 MB result is 200 MB copied for no
    // reason, and the worker is about to exit anyway.
    if (r && r.ok && r.buffer) {
      const { view, transfer } = transferable(r.buffer);
      parentPort.postMessage({ ok: true, result: { ...r, buffer: view } }, transfer);
    } else {
      parentPort.postMessage({ ok: true, result: r });
    }
  } else {
    parentPort.postMessage({ ok: false, error: `unknown op "${op}"` });
  }
} catch (e) {
  // A throw inside a worker surfaces as an 'error' event with a stripped stack;
  // reporting it as a message keeps the message the caller would have seen had
  // this still run inline.
  parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
}
