/**
 * E2E smoke — an edit made inside saveAll()'s debounce window survives quitting.
 *
 * saveAll() debounces ~300ms. Before the quit handshake, anything typed within that
 * window of Cmd+Q or a window close was simply gone: flushSave() existed in the renderer
 * and nothing called it on quit. Verified by disabling the handler — without it the store
 * file is not even created and the edit is lost outright.
 *
 * Run: npm run test:e2e:quitflush
 */
import { _electron as electron } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (c, m) => { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓ ' + m); };

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-quitflush-'));
let app;
let failed = false;
try {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: root,
    // KHAYT_USER_DATA is what main.js actually honours for the store path.
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1', KHAYT_USER_DATA: userData },
    timeout: 120_000,
  });
  const page = await app.firstWindow();
  await page.waitForSelector('.khayt-app', { timeout: 60_000 });
  await page.waitForFunction(() => typeof window.hubAPI?.saveStore === 'function', { timeout: 60_000 });
  await page.evaluate(() => {
    const wiz = document.querySelector('#setup-wizard');
    if (wiz) wiz.style.display = 'none';
    if (typeof settings !== 'undefined' && settings) settings.firstRun = false;
  });
  // Wait for boot to FINISH, not a fixed sleep. The renderer registers the quit-flush
  // listener inside wireEvents(), which runs after `await loadAll()` — a fixed wait races
  // it on a loaded CI machine, and then main's request goes nowhere and the handshake
  // times out with nothing saved.
  await page.waitForFunction(
    () => typeof window.hubAPI?.onFlushSaveRequest === 'function'
      && (document.querySelector('#dashboardContent')?.innerHTML?.length || 0) > 100,
    { timeout: 60_000 },
  );

  ok(await page.evaluate(() => typeof window.hubAPI?.onFlushSaveRequest === 'function'),
    'the quit handshake is exposed on the preload bridge');

  // Add an order and quit IMMEDIATELY — inside the debounce window, no waiting.
  const marker = 'QUIT-FLUSH-MARKER';
  await page.evaluate((m) => {
    printLog.unshift({ id: m, status: 'pending', project: m, date: '2026-07-20', price: 1, parts: [], statusHistory: [] });
    saveAll();
  }, marker);
  await app.close();
  app = null;

  const storePath = path.join(userData, 'khayt-store.json');
  ok(fs.existsSync(storePath), 'the store was written on quit');
  const text = fs.readFileSync(storePath, 'utf8');
  ok(text.includes(marker), 'an edit made inside the debounce window survived the quit');

  console.log('\n✅ Quit-flush smoke: all assertions passed');
} catch (e) {
  failed = true;
  console.error('\n❌ ' + e.message);
} finally {
  try { if (app) await app.close(); } catch { /* already closed */ }
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.exit(failed ? 1 : 0);
