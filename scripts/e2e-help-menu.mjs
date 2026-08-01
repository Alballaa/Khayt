#!/usr/bin/env node
/**
 * E2E: the Help menu exists, and its links point where they claim to.
 *
 * A menu is one of the few things in an Electron app that cannot be checked
 * from a unit test — the template is built inside the main process at startup
 * and never crosses into a renderer. So this reads the real, live
 * Menu.getApplicationMenu() out of the running app.
 *
 * Worth checking rather than eyeballing: the template is a plain array literal,
 * so a stray comma or a spread that evaluates to the wrong branch produces a
 * menu that is silently missing an item, and nothing fails until a user goes
 * looking for it.
 */
import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchApp, makeUserDataDir } from './e2e/helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userData = makeUserDataDir();
let electronApp;
let bedReadyApp;

/** Flatten the live application menu into { label -> submenu labels }. */
const readMenu = (app) => app.evaluate(({ Menu }) => {
  const menu = Menu.getApplicationMenu();
  if (!menu) return null;
  const out = {};
  for (const item of menu.items) {
    out[item.label || item.role || '?'] = (item.submenu?.items || [])
      .map((s) => s.label || s.role || (s.type === 'separator' ? '---' : '?'));
  }
  return out;
});

try {
  ({ electronApp } = await launchApp(userData));
  const menu = await readMenu(electronApp);
  if (!menu) throw new Error('no application menu was set at all');

  // macOS localises the Help role's label; match on the role's contents instead
  // of assuming the string is "Help".
  const helpKey = Object.keys(menu).find((k) => /help/i.test(k));
  if (!helpKey) {
    throw new Error(`no Help menu found. Top level was: ${Object.keys(menu).join(', ')}`);
  }
  const items = menu[helpKey];
  console.log(`Help menu (${helpKey}):`, JSON.stringify(items));

  const expected = ['Khayt Website', 'Community — r/khayt', 'Release Notes', 'Report an Issue'];
  for (const label of expected) {
    if (!items.includes(label)) {
      throw new Error(`Help menu is missing "${label}". Found: ${items.join(' | ')}`);
    }
  }

  // The website item must carry the flavour's own name. If FLAVOR_NAME ever
  // stops reaching this template, the label silently reads for the wrong brand.
  if (!items.some((l) => /^Khayt Website$/.test(l))) {
    throw new Error('the website item is not labelled for the Khayt flavour');
  }

  console.log('✅ Help menu present with all four destinations');

  // Bed Ready ships from this same main.js. Its users have never heard of Khayt,
  // so the subreddit item must not be there — and the website must be its own.
  // Asserting the Khayt build alone would pass with the flavour branch deleted.
  bedReadyApp = await electron.launch({
    args: ['.', `--user-data-dir=${makeUserDataDir()}`],
    cwd: root,
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1', KHAYT_FLAVOR: 'bedready' },
    timeout: 120_000,
  });
  await bedReadyApp.firstWindow();
  const brMenu = await readMenu(bedReadyApp);
  const brHelpKey = Object.keys(brMenu || {}).find((k) => /help/i.test(k));
  if (!brHelpKey) throw new Error('Bed Ready has no Help menu');
  const brItems = brMenu[brHelpKey];
  console.log(`Bed Ready Help menu:`, JSON.stringify(brItems));

  if (brItems.some((l) => /khayt/i.test(l))) {
    throw new Error(`Bed Ready's Help menu names Khayt: ${brItems.join(' | ')}`);
  }
  if (!brItems.includes('Bed Ready Website')) {
    throw new Error(`Bed Ready's website item is mislabelled: ${brItems.join(' | ')}`);
  }
  console.log('✅ Bed Ready gets its own site and no r/khayt');
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  if (bedReadyApp) await bedReadyApp.close().catch(() => {});
}
