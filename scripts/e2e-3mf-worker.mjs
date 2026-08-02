#!/usr/bin/env node
/**
 * E2E: the converter's work happens somewhere other than the thread drawing the app.
 *
 * Everything else about this change is covered by node tests, because lib/mf-jobs.js is
 * deliberately Electron-free. The one thing they cannot see is the only thing that
 * actually changed: whether utilityProcess.fork() finds lib/mf-worker.js in a real
 * Electron, whether parentPort messages round-trip, and — the point of the exercise —
 * whether the main thread keeps running while a job is in flight.
 *
 * The responsiveness check is the load-bearing one. Before this, converting a large 3MF
 * ran zlib on the main thread and the event loop stopped dead: no timer fired, no frame
 * drew, no button responded. So this counts timer ticks during a job. If the work is back
 * on the main thread the count collapses to roughly zero, whatever else still passes.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import { launchApp, makeUserDataDir } from './e2e/helpers.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = makeUserDataDir();
let electronApp;
const fail = (m) => { throw new Error(m); };

/** A 3MF big enough that the job takes real time, small enough to build in a second. */
function buildFixture() {
  const { writeZip } = require(path.join(root, 'lib', 'zip-write.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-worker-e2e-'));
  const v = [], t = [];
  for (let i = 0; i < 120000; i++) {
    const b = i * 3;
    for (let k = 0; k < 3; k++) v.push(`<vertex x="${i % 97}.5" y="${k}.25" z="${i % 31}.125"/>`);
    t.push(`<triangle v1="${b}" v2="${b + 1}" v3="${b + 2}"/>`);
  }
  const model = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
    + `<resources><object id="1" type="model"><mesh><vertices>${v.join('')}</vertices>`
    + `<triangles>${t.join('')}</triangles></mesh></object></resources>`
    + '<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build></model>';
  const buf = writeZip([
    { name: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>', 'utf8') },
    { name: 'Metadata/project_settings.config', data: Buffer.from(JSON.stringify({ filament_colour: ['#FF0000', '#00FF00'], printable_area: ['0x0', '256x0', '256x256', '0x256'] }), 'utf8') },
    { name: '3D/3dmodel.model', data: Buffer.from(model, 'utf8') },
  ]);
  const p = path.join(dir, 'big.3mf');
  fs.writeFileSync(p, buf);
  return { dir, path: p, bytes: buf.length };
}
let fixture;
try {
  fixture = buildFixture();
  console.log(`fixture: ${(fixture.bytes / 1048576).toFixed(1)} MB 3MF`);

  ({ electronApp } = await launchApp(userData));

  // Run the SAME job twice from the real main process — once through the worker, once
  // inline — counting how often a 10 ms timer got to fire during each. Comparing the two
  // is what makes the number mean something: no fixed threshold to tune, and the inline
  // run proves the metric can still detect a blocked thread on this machine.
  const res = await electronApp.evaluate(async ({ utilityProcess }, { src, outPath, inlineOut, workerPath, jobsPath }) => {
    const jobArgs = (tmpOut) => ({ src, maxBytes: 600000000, tmpOut, opts: { targetId: 'generic', mode: 'normalize' } });

    /** Count 10 ms timer firings while `work` runs. */
    const measure = async (work) => {
      let ticks = 0;
      const timer = setInterval(() => { ticks++; }, 10);
      const startedAt = Date.now();
      const reply = await work();
      clearInterval(timer);
      return { reply, ticks, elapsed: Date.now() - startedAt };
    };

    const viaWorker = await measure(() => {
      const worker = utilityProcess.fork(workerPath, [], { serviceName: 'khayt-3mf-e2e', stdio: 'ignore' });
      return new Promise((resolve) => {
        const to = setTimeout(() => resolve({ ok: false, error: 'worker never replied' }), 90000);
        const done = (r) => { clearTimeout(to); try { worker.kill(); } catch (_) {} resolve(r); };
        worker.on('message', (m) => done(m && m.res));
        worker.on('exit', (c) => done({ ok: false, error: 'worker exited ' + c }));
        worker.postMessage({ id: 1, op: 'convert', args: jobArgs(outPath) });
      });
    });

    // The control: the identical job on this thread, which is what the app used to do.
    // Playwright's evaluate runs outside module scope, so `require` is not bound here;
    // the main module's own loader is.
    const nodeRequire = (typeof require === 'function') ? require
      : (process.mainModule && process.mainModule.require
        ? process.mainModule.require.bind(process.mainModule) : null);
    if (!nodeRequire) return { viaWorker, inline: { reply: { ok: false, error: 'no require in main process' } } };
    const inline = await measure(() => nodeRequire(jobsPath).run('convert', jobArgs(inlineOut)));

    return { viaWorker, inline };
  }, {
    src: fixture.path,
    outPath: path.join(fixture.dir, 'out.3mf'),
    inlineOut: path.join(fixture.dir, 'inline.3mf'),
    workerPath: path.join(root, 'lib', 'mf-worker.js'),
    jobsPath: path.join(root, 'lib', 'mf-jobs.js'),
  });

  const { viaWorker, inline } = res;
  if (!viaWorker.reply || !viaWorker.reply.ok) fail(`the worker could not convert: ${viaWorker.reply && viaWorker.reply.error}`);
  if (!fs.existsSync(path.join(fixture.dir, 'out.3mf'))) fail('the worker reported success but wrote no file');
  if (!inline.reply || !inline.reply.ok) fail(`the inline control failed, so it proves nothing: ${inline.reply && inline.reply.error}`);

  const rate = (m) => (m.elapsed ? (m.ticks / (m.elapsed / 10)) : 0);
  console.log(`worker: ${viaWorker.ticks} ticks / ${viaWorker.elapsed} ms  (${(rate(viaWorker) * 100).toFixed(0)}% of a free thread)`);
  console.log(`inline: ${inline.ticks} ticks / ${inline.elapsed} ms  (${(rate(inline) * 100).toFixed(0)}%)`);

  // The control has to actually block, or the comparison below is measuring nothing.
  if (rate(inline) > 0.5) {
    fail(`the inline control did not block this thread (${(rate(inline) * 100).toFixed(0)}%) — `
      + 'the fixture is too small to tell the two apart, so this test cannot prove anything');
  }
  if (rate(viaWorker) < 0.5) {
    fail(`main thread was blocked while the worker converted: ${viaWorker.ticks} ticks in `
      + `${viaWorker.elapsed} ms (${(rate(viaWorker) * 100).toFixed(0)}%) — the work is back on the main thread`);
  }
  if (rate(viaWorker) < rate(inline) * 3) {
    fail('the worker run was no more responsive than running it inline');
  }

  // And the window is still alive and answering afterwards.
  const win = await electronApp.firstWindow();
  const title = await win.evaluate(() => document.title);
  if (!title) fail('the window stopped responding');

  // Now the real path a maker takes: the IPC handler, which routes through the worker
  // client, has the child write to a temp file, and moves that into place afterwards.
  // An explicit outPath under temp keeps the save dialog out of it (temp is already an
  // allowed destination), so this runs unattended and still exercises the finalize.
  //
  // Ticks are counted in the MAIN process across the whole IPC call. This is the assertion
  // that cannot be satisfied by accident: if mfRun ever stops reaching the worker and runs
  // the job here instead, every other check in this file still passes and only this one
  // fails.
  const handlerOut = path.join(fixture.dir, 'handler-out.3mf');
  await electronApp.evaluate(() => {
    globalThis.__ticks = 0;
    globalThis.__t0 = Date.now();
    globalThis.__timer = setInterval(() => { globalThis.__ticks++; }, 10);
  });
  const viaIpc = await win.evaluate(
    ([src, out]) => window.hubAPI.mfConvert({ path: src, targetId: 'generic', mode: 'normalize', outPath: out }),
    [fixture.path, handlerOut],
  );
  const ipcMeasure = await electronApp.evaluate(() => {
    clearInterval(globalThis.__timer);
    return { ticks: globalThis.__ticks, elapsed: Date.now() - globalThis.__t0 };
  });
  const ipcRate = ipcMeasure.elapsed ? ipcMeasure.ticks / (ipcMeasure.elapsed / 10) : 0;
  console.log(`hub:mf-convert: ${ipcMeasure.ticks} ticks / ${ipcMeasure.elapsed} ms  (${(ipcRate * 100).toFixed(0)}%)`);
  if (ipcRate < 0.5) {
    fail(`the real hub:mf-convert handler blocked the main thread (${(ipcRate * 100).toFixed(0)}%) — `
      + 'it is not going through the worker');
  }
  if (!viaIpc || !viaIpc.ok) fail(`hub:mf-convert failed: ${viaIpc && (viaIpc.error || 'canceled')}`);
  if (viaIpc.outPath !== handlerOut) fail(`converted file landed at ${viaIpc.outPath}, not the path asked for`);
  if (!fs.existsSync(handlerOut)) fail('the handler reported success but no file arrived at the destination');
  if (!viaIpc.report) fail('the handler returned no report');

  // The temp file it worked through must not be left behind.
  const strays = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('khayt-3mf-'));
  if (strays.length) fail(`the converter left ${strays.length} temp file(s) behind: ${strays.slice(0, 3).join(', ')}`);
  console.log(`hub:mf-convert wrote ${(fs.statSync(handlerOut).size / 1048576).toFixed(1)} MB to the requested path, no temp left over`);

  console.log('PASS — 3MF work runs off the main thread and the app stays responsive');
} catch (err) {
  console.error('FAIL —', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  try { if (electronApp) await electronApp.close(); } catch (_) {}
  try { if (fixture) fs.rmSync(fixture.dir, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch (_) {}
}
