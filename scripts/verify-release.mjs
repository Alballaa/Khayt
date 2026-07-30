#!/usr/bin/env node
/**
 * Verify a PUBLISHED release the way a shop receives it: download the build,
 * launch it, and see whether it runs.
 *
 * Everything else stops short of this. The unit suite and every e2e run against
 * the source tree; CI proves the source is good. The release workflow proves the
 * files uploaded. Between them sits the packaging step, and a mistake there —
 * a file excluded from `build.files`, a module that only resolves from the repo
 * root, an asar path that differs from the dev path — produces a build that fails
 * for every user and for nobody testing it.
 *
 * v3.5.1 added lib/branch-summary.js, a NEW top-level require in main.js. If
 * `lib/**` had not been in the packaging allowlist, main would have thrown at
 * startup: green CI, green e2e, and an app that does not open. That is the class
 * of failure this closes.
 *
 * Usage:
 *   node scripts/verify-release.mjs v3.5.1        # download and check that tag
 *   node scripts/verify-release.mjs --app /path/to/Khayt.app
 *
 * macOS only for now — it checks the arm64 .app, because that is what can be
 * launched on the machine this is usually run from. Deliberately NOT in CI: it
 * downloads ~150 MB and needs a display. Run it once, after publishing.
 *
 * PROVEN, on an unsigned local build (`electron-builder --mac --dir` with
 * `-c.mac.identity=null`), by removing lib/branch-summary.js from the packaged
 * asar: exit 1 and `Cannot find module './lib/branch-summary'`.
 *
 * Do NOT test it by tampering with a SIGNED build. Repacking the asar breaks the
 * signature, macOS then refuses to run the app at all — exit 137, no stderr, and
 * a "Khayt is damaged" dialog at whoever is at the keyboard — and the script
 * fails for a reason that has nothing to do with the missing file. That looks
 * like a pass and is not one.
 *
 * Note the real failure shape: Electron STARTS, main.js throws, and no window
 * ever appears, so playwright only reports a timeout waiting for a window. The
 * diagnosis below is what turns that into the cause.
 */
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = 'KhaytApp/Khayt';
const args = process.argv.slice(2);
const appFlag = args.indexOf('--app');
const tag = appFlag === -1 ? args[0] : null;
let appPath = appFlag === -1 ? null : args[appFlag + 1];

if (!tag && !appPath) {
  console.error('usage: node scripts/verify-release.mjs <tag> | --app <Khayt.app>');
  process.exit(2);
}

const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-verify-'));

if (tag) {
  const asset = `Khayt-${tag.replace(/^v/, '')}-arm64-mac.zip`;
  const url = `https://github.com/${REPO}/releases/download/${tag}/${asset}`;
  console.log(`Downloading ${asset} …`);
  try {
    execFileSync('curl', ['-fsSL', '-o', path.join(work, 'mac.zip'), url], { stdio: 'pipe' });
  } catch {
    fail(`could not download ${url}\n  A published release must carry ${asset}.`);
  }
  execFileSync('unzip', ['-q', path.join(work, 'mac.zip'), '-d', work]);
  appPath = path.join(work, 'Khayt.app');
  ok(`downloaded and unpacked ${asset}`);
}

const binary = path.join(appPath, 'Contents', 'MacOS', 'Khayt');
if (!fs.existsSync(binary)) fail(`no executable at ${binary}`);

// The version inside the bundle must match the tag. A mismatch means the tag was
// cut before the bump landed, which auto-update would then read as "no update".
const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
if (!fs.existsSync(asarPath)) fail('no app.asar in the bundle');
let packagedVersion = null;
try {
  execFileSync('npx', ['--yes', '@electron/asar', 'extract-file', asarPath, 'package.json'], { cwd: work, stdio: 'pipe' });
  packagedVersion = JSON.parse(fs.readFileSync(path.join(work, 'package.json'), 'utf8')).version;
  ok(`package.json inside the bundle says ${packagedVersion}`);
} catch {
  console.log('  … could not read package.json from the asar (skipping that check)');
}
if (tag && packagedVersion && `v${packagedVersion}` !== tag) {
  fail(`tag ${tag} but the bundle contains ${packagedVersion} — the tag was cut before the version bump`);
}

/**
 * Why the app refused to start.
 *
 * Playwright reports "Process failed to launch!" and nothing else, which is the
 * least useful sentence available: a missing module, a bad signature and a
 * crashed GPU all read the same. Running the binary directly and keeping its
 * stderr turns that into the actual reason — for the fault this script exists to
 * catch, the line is `Cannot find module './lib/…'`.
 */
function launchDiagnosis() {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-probe-'));
  try {
    execFileSync(binary, [`--user-data-dir=${probe}`], {
      timeout: 15_000, stdio: 'pipe',
      env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
    });
    return null;   // it stayed up on its own; the failure was elsewhere
  } catch (e) {
    const err = String((e && e.stderr) || '').trim();
    if (!err) return null;
    const lines = err.split('\n').filter(Boolean);
    // The module-resolution failure is the one worth naming outright.
    const missing = lines.find((l) => /Cannot find module/.test(l));
    return { missing, tail: lines.slice(0, 12).join('\n    ') };
  }
}

console.log('Launching the packaged app …');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-verify-data-'));
const problems = [];
let app;

// A launch failure surfaces as an uncaught exception from inside playwright, not
// only as a rejection, so the diagnosis has to be reachable from both.
process.on('uncaughtException', (e) => {
  const why = launchDiagnosis();
  console.error(`\n✗ the packaged app did not come up: ${e && e.message ? e.message : e}`);
  if (why && why.missing) {
    console.error(`\n  ${why.missing}`);
    console.error('  A file is in the repo but not in the build. Check "files" in');
    console.error('  package.json → build, then re-cut the release.');
  } else if (why) {
    console.error('\n  stderr from the app:\n    ' + why.tail);
  }
  process.exit(1);
});

try {
  app = await electron.launch({
    executablePath: binary,
    args: [`--user-data-dir=${userData}`],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
    timeout: 120_000,
  });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console.error: ' + m.text().slice(0, 200)); });

  await page.waitForSelector('.khayt-app', { timeout: 90_000 });
  ok('the window opened');

  // Booting is not enough: the renderer must actually render, and the main
  // process must answer. A packaging fault often shows as a blank shell.
  await page.waitForFunction(
    () => (document.querySelector('#dashboardContent')?.innerHTML?.length || 0) > 100,
    { timeout: 90_000 },
  );
  ok('the dashboard rendered');

  const reported = await page.evaluate(() => window.hubAPI.appVersion());
  if (tag && `v${reported}` !== tag) fail(`the running app reports ${reported}, not ${tag}`);
  ok(`the running app reports ${reported}`);

  // One round trip per process boundary — preload bridge and main handler. If a
  // lib/ module failed to package, main would have died before answering.
  const store = await page.evaluate(() => window.hubAPI.loadStore());
  if (!store || typeof store !== 'object') fail('hub:load-store returned nothing — the main process is not healthy');
  ok('the main process answers IPC');
} catch (e) {
  const why = launchDiagnosis();
  console.error(`\n✗ the packaged app did not come up: ${e && e.message ? e.message : e}`);
  if (why && why.missing) {
    console.error(`\n  ${why.missing}`);
    console.error('  A file is in the repo but not in the build. Check "files" in');
    console.error('  package.json → build, then re-cut the release.');
  } else if (why) {
    console.error('\n  stderr from the app:\n    ' + why.tail);
  }
  process.exit(1);
} finally {
  if (app) await app.close().catch(() => {});
}

if (problems.length) {
  console.error('\n✗ the app ran but reported errors:');
  for (const p of problems.slice(0, 10)) console.error('    ' + p);
  process.exit(1);
}

console.log(`\n✅ ${tag || appPath} runs as published.`);
