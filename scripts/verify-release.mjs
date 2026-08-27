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

/**
 * ── Two flavours, and the one that needed this more ────────────────────────
 *
 * Bed Ready ships from this repo as a second flavour, and until now this script
 * could not look at it — which is backwards, because Bed Ready's packaging can
 * fail in a way Khayt's cannot.
 *
 * `lib/flavor.js` resolves the flavour in three steps: KHAYT_FLAVOR, then a
 * `flavor` marker file that `electron-builder.bedready.js`'s afterPack hook
 * writes into the packaged app's Resources, then a DEFAULT OF 'khayt'.
 *
 * The shipped build has no env var, so it depends entirely on that marker.
 *
 * WHAT ACTUALLY HAPPENS WITHOUT IT, measured rather than reasoned about — I had
 * written the opposite here first. Deleting the marker from the published
 * 1.2.0 bundle and launching it does NOT produce a working Khayt. The app never
 * opens a window at all: `electron.launch: Timeout 120000ms exceeded`. The cause
 * is that a Bed Ready bundle contains exactly ONE entry document —
 * `/renderer/bedready.html`, confirmed by listing the asar — so falling back to
 * `entryHtml: 'index.html'` points at a file that is not there.
 *
 * That is a better failure than the one I assumed, and it is still worth a check
 * here, for the reason `launchDiagnosis()` further down already exists: "Timeout
 * 120000ms exceeded" is the least useful sentence available, and a missing
 * module, a bad signature and a crashed GPU all read the same. This names the
 * cause in one line, before anything is launched.
 *
 * The genuinely silent direction is the other one — a KHAYT build that picked up
 * a marker — which is why that case is checked too rather than ignored.
 *
 * Either way the marker is invisible to every other check here.
 * `test:e2e:bedready` sets KHAYT_FLAVOR=bedready and so exercises step 1, never
 * the marker; the marker exists ONLY in build output, which no test in this repo
 * has ever seen.
 */
const FLAVORS = {
  khayt: {
    repo: 'KhaytApp/Khayt',
    tagPrefix: 'v',
    asset: (v) => `Khayt-${v}-arm64-mac.zip`,
    bundle: 'Khayt.app',
    binary: 'Khayt',
    // A Khayt build must NOT carry the marker; if it does, the two flavours'
    // afterPack hooks have crossed and Khayt would boot as Bed Ready.
    marker: null,
    shellClass: 'khayt-app',
    notClass: 'bedready-ui',
  },
  bedready: {
    repo: 'KhaytApp/bedready',
    tagPrefix: 'bedready-v',
    asset: (v) => `BedReady-${v}-mac-arm64.zip`,
    bundle: 'Bed Ready.app',
    binary: 'Bed Ready',
    marker: 'bedready',
    shellClass: 'khayt-app',   // the shared shell; the flavour shows in notClass
    isClass: 'bedready-ui',
  },
};

const args = process.argv.slice(2);
const appFlag = args.indexOf('--app');
const tag = appFlag === -1 ? args[0] : null;
let appPath = appFlag === -1 ? null : args[appFlag + 1];

if (!tag && !appPath) {
  console.error('usage: node scripts/verify-release.mjs <tag> | --app <path to .app>');
  console.error('       tags: v3.7.0-beta.8 (Khayt) | bedready-v1.2.0 (Bed Ready)');
  process.exit(2);
}

/** Which product this invocation is about, from the tag or the bundle name. */
const flavorKey = (tag ? tag.startsWith('bedready-') : /Bed Ready\.app\/?$/.test(appPath))
  ? 'bedready' : 'khayt';
const F = FLAVORS[flavorKey];
const REPO = F.repo;
/** The version inside the tag, whichever prefix it carries. */
const tagVersion = tag ? tag.replace(/^bedready-/, '').replace(/^v/, '') : null;
console.log(`Verifying ${flavorKey === 'bedready' ? 'Bed Ready' : 'Khayt'} ${tag || appPath}`);

const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-verify-'));

if (tag) {
  const asset = F.asset(tagVersion);
  const url = `https://github.com/${REPO}/releases/download/${tag}/${asset}`;
  console.log(`Downloading ${asset} …`);
  try {
    execFileSync('curl', ['-fsSL', '-o', path.join(work, 'mac.zip'), url], { stdio: 'pipe' });
  } catch {
    fail(`could not download ${url}\n  A published release must carry ${asset}.`);
  }
  execFileSync('unzip', ['-q', path.join(work, 'mac.zip'), '-d', work]);
  appPath = path.join(work, F.bundle);
  ok(`downloaded and unpacked ${asset}`);
}

const binary = path.join(appPath, 'Contents', 'MacOS', F.binary);
if (!fs.existsSync(binary)) fail(`no executable at ${binary}`);

/**
 * The flavour marker, checked before anything is launched.
 *
 * Checked here rather than only at runtime because the runtime symptom is a
 * working app that is the WRONG app, and "it opened fine" is exactly how that
 * ships. The file is the mechanism; the runtime assertion further down is the
 * consequence. Both, because either alone reads as fine.
 */
const markerPath = path.join(appPath, 'Contents', 'Resources', 'flavor');
const markerValue = fs.existsSync(markerPath)
  ? fs.readFileSync(markerPath, 'utf8').trim().toLowerCase() : null;
if (F.marker) {
  if (markerValue === null) {
    fail(`no flavor marker in ${F.bundle}/Contents/Resources.\n` +
      `  lib/flavor.js then falls back to 'khayt' and asks for renderer/index.html,\n` +
      `  which a Bed Ready bundle does not contain — so the app opens no window at\n` +
      `  all and the only symptom is a launch timeout. Check the afterPack hook in\n` +
      `  electron-builder.bedready.js.`);
  }
  if (markerValue !== F.marker) {
    fail(`the flavor marker says '${markerValue}', expected '${F.marker}'`);
  }
  ok(`the flavor marker says ${markerValue}`);
} else if (markerValue !== null) {
  fail(`a Khayt build carries a flavor marker saying '${markerValue}' — the two\n` +
    `  afterPack hooks have crossed, and this build would boot as that flavour.`);
} else {
  ok('no flavor marker, which is correct for Khayt');
}

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
if (tag && packagedVersion && packagedVersion !== tagVersion) {
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

  await page.waitForSelector(`.${F.shellClass}`, { timeout: 90_000 });
  ok('the window opened');

  // The consequence of the marker, asserted independently of it. A build could
  // carry the right marker and still load the wrong entry HTML.
  const isBedReady = await page.evaluate(() =>
    !!document.querySelector('.bedready-ui') || document.documentElement.classList.contains('bedready-ui'));
  if (F.isClass && !isBedReady) {
    fail('the packaged app opened as KHAYT, not Bed Ready — the flavour did not take');
  }
  if (F.notClass && isBedReady) {
    fail('the packaged Khayt app opened as BED READY — the flavour marker leaked into this build');
  }
  ok(`it opened as ${isBedReady ? 'Bed Ready' : 'Khayt'}`);

  // Booting is not enough: the renderer must actually render, and the main
  // process must answer. A packaging fault often shows as a blank shell.
  await page.waitForFunction(
    () => (document.querySelector('#dashboardContent')?.innerHTML?.length || 0) > 100,
    { timeout: 90_000 },
  );
  ok('the dashboard rendered');

  const reported = await page.evaluate(() => window.hubAPI.appVersion());
  if (tag && reported !== tagVersion) fail(`the running app reports ${reported}, not ${tagVersion}`);
  ok(`the running app reports ${reported}`);

  // One round trip per process boundary — preload bridge and main handler. If a
  // lib/ module failed to package, main would have died before answering.
  //
  // What counts as healthy is "it ANSWERED", not "it answered with data". This
  // launches against a fresh --user-data-dir, so there is no store yet and
  // loadStore correctly resolves to null. The old check was `!store`, which
  // treats that null as a dead main process — so this assertion could never
  // pass, on any release, however good the build. Verified 2026-07-31 against
  // v3.5.2 and v3.6.0-beta.1: both return null on a clean profile and a 33-key
  // object on a populated one.
  const store = await page.evaluate(async () => {
    try {
      const v = await window.hubAPI.loadStore();
      return { answered: true, type: v === null ? 'null' : typeof v };
    } catch (e) {
      return { answered: false, error: String((e && e.message) || e) };
    }
  });
  if (!store.answered) fail(`hub:load-store threw — ${store.error}`);
  else if (store.type !== 'object' && store.type !== 'null') {
    fail(`hub:load-store returned ${store.type} — the main process is not healthy`);
  }
  ok(`the main process answers IPC (fresh profile → ${store.type})`);
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
