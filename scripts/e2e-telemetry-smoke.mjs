/**
 * E2E smoke — telemetry consent gate (TELEMETRY-SPEC §9).
 *
 * The headline guarantee: with telemetry OFF (the default) nothing is collected at all —
 * no queue file is ever created, even when errors occur. Opting in starts collection;
 * opting back out purges everything immediately.
 *
 * Run: npm run test:e2e:telemetry   (CI wraps it in xvfb-run)
 */
import { launchApp, dismissWizard, makeUserDataDir } from './e2e/helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ok = (c, m) => { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓ ' + m); };

const userData = makeUserDataDir();
const { electronApp, window } = await launchApp(userData);
let failed = false;
try {
  await dismissWizard(window);

  // Default state must be fully off.
  const def = await window.evaluate(() => settings.telemetry || {});
  ok(def.crashOptIn === false && def.usageOptIn === false, 'both streams OFF by default');
  ok(!def.installId, 'no install id exists until opt-in');

  // launchApp starts Electron with --user-data-dir=<userData>, so the queue lands here.
  const queuePathOf = path.join(userData, 'telemetry-queue.json');

  // With consent off, recording an event must be a no-op — no file, ever.
  await window.evaluate(() => window.hubAPI.telemetryRecord({
    kind: 'crash', payload: { type: 'uncaughtException', name: 'TypeError', message: 'boom', stack: 'at x' },
  }));
  await new Promise(r => setTimeout(r, 500));
  ok(!fs.existsSync(queuePathOf), 'consent off → no telemetry queue file created at all');

  // Opt in to crashes only.
  await window.evaluate(() => {
    settings.telemetry = { crashOptIn: true, usageOptIn: false, installId: 'a1b2c3d4e5f6a7b8', consentAt: new Date().toISOString() };
    saveAll();
  });
  await new Promise(r => setTimeout(r, 700));

  await window.evaluate(() => window.hubAPI.telemetryRecord({
    kind: 'crash',
    payload: {
      type: 'uncaughtException', name: 'TypeError',
      message: 'failed for sara@example.com +966501234567',
      stack: 'TypeError: boom\n    at save (/Users/turki/Library/Application Support/Khayt/khayt-store.json:1:1)',
      process: 'renderer', appVersion: '3.2.0', osFamily: 'macOS', osMajor: '14', locale: 'ar', channel: 'beta',
    },
  }));
  await new Promise(r => setTimeout(r, 700));
  ok(fs.existsSync(queuePathOf), 'crash opt-in → events start queueing');
  const raw = fs.readFileSync(queuePathOf, 'utf8');
  ok(!raw.includes('sara@example.com'), 'queued crash contains NO email');
  ok(!raw.includes('+966501234567'), 'queued crash contains NO phone');
  ok(!raw.includes('/Users/turki'), 'queued crash contains NO home path');
  ok(raw.includes('TypeError'), 'but still keeps the useful error class');

  // Usage stream is separately consented — still off, so usage must not queue.
  const beforeUsage = JSON.parse(raw).length;
  await window.evaluate(() => window.hubAPI.telemetryRecord({ kind: 'usage', payload: { feature: 'quote_created' } }));
  await new Promise(r => setTimeout(r, 600));
  const afterUsage = JSON.parse(fs.readFileSync(queuePathOf, 'utf8')).length;
  ok(afterUsage === beforeUsage, 'usage stream stays off while only crash is consented');

  // Opting fully out purges the queue immediately.
  await window.evaluate(async () => {
    settings.telemetry = { crashOptIn: false, usageOptIn: false, installId: '', consentAt: '' };
    saveAll();
    await window.hubAPI.telemetryPurge();
  });
  await new Promise(r => setTimeout(r, 700));
  ok(!fs.existsSync(queuePathOf), 'opt-out purges the local queue immediately');

  console.log('\n✅ Telemetry smoke: all assertions passed');
} catch (e) {
  failed = true;
  console.error('\n❌ ' + e.message);
} finally {
  await electronApp.close();
}
process.exit(failed ? 1 : 0);
