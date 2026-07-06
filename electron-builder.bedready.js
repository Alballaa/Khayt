'use strict';

/**
 * electron-builder config for the BED READY flavor.
 *
 * Bed Ready is the standalone maker app built from this same repo and shared core.
 * This config inherits Khayt's base `build` block (so platform targets, dmg/nsis
 * options, etc. never drift) and overrides only what makes it a separate, smaller
 * product:
 *   - its own appId / productName / output dir / (no) publish target;
 *   - an `afterPack` hook that writes a `flavor` marker file into the packaged
 *     app's resources dir. lib/flavor.js reads it at runtime (via
 *     process.resourcesPath) to route main.js to renderer/bedready.html and skip
 *     business-only main-process wiring. This marker lives ONLY in the build
 *     output — it never modifies the source tree.
 *   - a trimmed `files` glob that EXCLUDES the business renderer modules that
 *     bedready.html does not load — this is what makes the download genuinely
 *     smaller (~0.85 MB of renderer JS never shipped).
 *
 * NOTE: we deliberately do NOT use electron-builder `extraMetadata` to bake the
 * flavor/version — for this repo layout (app at project root) it rewrites the
 * SOURCE package.json in place (strips scripts, injects version) and does not
 * restore it. The afterPack marker avoids touching source entirely. Bed Ready's
 * independent 1.0.0-beta.N version therefore lives at the release/tag lane
 * (bedready-v*) for now; baking it into the binary is a follow-up (would need a
 * separate app manifest, not extraMetadata).
 *
 * Build:  npm run pack:bedready   (unpacked, quick)
 *         npm run dist:bedready:mac:arm64
 * Dev:    npm run start:bedready
 *
 * TODO(bedready): ship branded icons (assets/bedready.icns / .ico); for now it
 * reuses the Khayt icons inherited from the base config.
 */

const base = require('./package.json').build;

// Business renderer modules that renderer/bedready.html deliberately does NOT
// <script>-include. Excluding them from the package is the size win. Keep this
// list in lockstep with the tags dropped in bedready.html.
const EXCLUDED_BUSINESS_RENDERER = [
  'analytics.js',
  'order-flows.js',
  'integrations.js',
  'invoicing.js',
  'clients.js',
  'operations-extras.js',
  'expenses.js',
  'logs.js',
  'waiting-list.js',
  'views.js',
  'online.js',
];

// The 8 alternate Khayt theme designs. Bed Ready ships ONE bespoke look
// (bedready-theme.css), so their CSS is never linked → exclude it from the
// package. The small per-theme shell JS stays (it's optional-chained and only
// activates for a design Bed Ready never selects). handoff-screens.css and the
// theme registry JS are shared/kept.
const EXCLUDED_THEME_DIRS = [
  'ledger', 'console', 'atelier', 'vitrine', 'cockpit',
  'atlas', 'workbench', 'vivid', 'command',
];

module.exports = {
  ...base,

  appId: 'app.bedready.desktop',
  productName: 'Bed Ready',

  // Separate output dir so Bed Ready artifacts never clobber Khayt's build/.
  directories: {
    ...base.directories,
    output: 'build-bedready',
  },

  // No publish target wired for Bed Ready yet (its own bedready-v* release lane
  // is a later step). Local builds only for Phase 1.
  publish: null,

  // Write the flavor marker into the packaged app's resources dir (build output
  // only — never the source tree). lib/flavor.js reads it via process.resourcesPath.
  afterPack: async (context) => {
    const fs = require('fs');
    const path = require('path');
    let resourcesDir;
    try {
      resourcesDir = context.packager.getResourcesDir(context.appOutDir);
    } catch (_) {
      // Fallback: derive per platform. mac bundles into <productName>.app/Contents/Resources.
      if (context.electronPlatformName === 'darwin') {
        const appName = `${context.packager.appInfo.productFilename}.app`;
        resourcesDir = path.join(context.appOutDir, appName, 'Contents', 'Resources');
      } else {
        resourcesDir = path.join(context.appOutDir, 'resources');
      }
    }
    fs.writeFileSync(path.join(resourcesDir, 'flavor'), 'bedready\n', 'utf8');
  },

  files: [
    'main.js',
    'preload.js',
    'lib/**/*',
    'renderer/**/*',
    'assets/**/*',
    'package.json',
    // Ship the Bed Ready entry, not Khayt's — and drop the business renderer JS.
    '!renderer/index.html',
    ...EXCLUDED_BUSINESS_RENDERER.map((f) => `!renderer/${f}`),
    // Drop the 8 alternate theme designs' CSS (bespoke look ships instead).
    ...EXCLUDED_THEME_DIRS.map((d) => `!renderer/themes/${d}/*.css`),
    '!renderer/themes/theme-picker.css',
  ],

  // Bed Ready branded icons (spectrum print-bed mark).
  mac: { ...(base.mac || {}), icon: 'assets/bedready.icns' },
  win: { ...(base.win || {}), icon: 'assets/bedready-512.png' },
  linux: { ...(base.linux || {}), icon: 'assets/bedready-512.png' },

  dmg: {
    ...(base.dmg || {}),
    title: 'Bed Ready ${version}',
  },

  nsis: {
    ...(base.nsis || {}),
    shortcutName: 'Bed Ready',
  },
};
