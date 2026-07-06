#!/usr/bin/env node
/**
 * Bed Ready packaging wrapper.
 *
 * Bed Ready ships on its OWN independent version line (1.0.0-*), distinct from
 * Khayt's 3.x. We want that version baked into the packaged app's package.json
 * (so app.getVersion(), the About screen, dmg/nsis filenames, and update feeds
 * all read Bed Ready's number) WITHOUT permanently mutating the source tree.
 *
 * TWO source-tree hazards this wrapper defends against, both specific to this
 * repo's layout (the Electron app lives at the project root):
 *   1. We must swap package.json's `version` to Bed Ready's for the build.
 *   2. electron-builder itself PRUNES the root package.json in place while
 *      packaging (drops scripts/devDependencies/build, keeps a production-only
 *      manifest) — the same in-place-rewrite hazard that makes `extraMetadata`
 *      unusable here. It does not restore it.
 * So we snapshot the exact source bytes of package.json AND package-lock.json up
 * front and restore them no matter how the process ends:
 *   - normal exit / build failure  -> finally block
 *   - Ctrl-C / SIGTERM / SIGHUP    -> signal handlers (finally does NOT run on a
 *     signal kill; without these a killed build leaves a corrupted source tree)
 *   - uncaught exception           -> handler
 * Every restore path verifies the bytes are identical again before exiting.
 *
 * The swap is ephemeral: only the electron-builder subprocess ever sees the
 * modified package.json; the on-disk source is identical before and after.
 *
 * Usage:  node scripts/build-bedready.mjs --dir
 *         node scripts/build-bedready.mjs --mac --arm64
 *         BEDREADY_VERSION=1.0.0-beta.2 node scripts/build-bedready.mjs --linux --x64
 */
import { readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Bed Ready's independent version line. Override per-release via BEDREADY_VERSION.
const BEDREADY_VERSION = process.env.BEDREADY_VERSION || '1.0.0-beta.1';

// Files electron-builder may rewrite in place while packaging a root-layout app.
// Snapshot their EXACT bytes so any exit path can restore them verbatim.
const GUARDED = ['package.json', 'package-lock.json'].map((rel) => {
  const file = path.join(root, rel);
  return { rel, file, bytes: readFileSync(file) };
});

let restored = false;
function restoreSources(reason) {
  if (restored) return;
  restored = true;
  let allOk = true;
  for (const g of GUARDED) {
    try {
      writeFileSync(g.file, g.bytes);
      if (!readFileSync(g.file).equals(g.bytes)) allOk = false;
    } catch (e) {
      allOk = false;
      console.error(`[build-bedready] restore of ${g.rel} failed:`, e && e.message);
    }
  }
  console.log(
    allOk
      ? `[build-bedready] source restored byte-identical (${reason}).`
      : `[build-bedready] WARNING: source restore had problems (${reason}).`,
  );
  return allOk;
}

// finally does NOT run when the process is killed by a signal — restore there too.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    restoreSources(sig);
    process.exit(130);
  });
}
process.on('uncaughtException', (err) => {
  console.error('[build-bedready] uncaught:', err && err.stack || err);
  restoreSources('uncaughtException');
  process.exit(1);
});

const builderArgs = process.argv.slice(2);
if (builderArgs.length === 0) builderArgs.push('--dir'); // default: quick unpacked

let exitCode = 0;
try {
  const pkg = JSON.parse(GUARDED[0].bytes.toString('utf8'));
  pkg.version = BEDREADY_VERSION;
  // Formatting of this temporary write is irrelevant — the source is restored
  // to its original bytes on every exit path; electron-builder only needs valid JSON.
  writeFileSync(GUARDED[0].file, JSON.stringify(pkg, null, 2) + '\n');

  console.log(`[build-bedready] packaging Bed Ready ${BEDREADY_VERSION} (${builderArgs.join(' ')})`);
  const res = spawnSync(
    'npx',
    ['electron-builder', ...builderArgs, '--config', 'electron-builder.bedready.js'],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  exitCode = res.status == null ? 1 : res.status;
} finally {
  const ok = restoreSources('finally');
  if (!ok) process.exit(1);
}

process.exit(exitCode);
