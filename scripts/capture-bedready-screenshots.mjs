#!/usr/bin/env node
/**
 * Capture a COMPLETE Bed Ready screenshot library (website / release / store).
 *
 * Boots the app in the Bed Ready flavor (KHAYT_FLAVOR=bedready) with demo data
 * and captures every maker surface plus the flagship 3MF converter (3D preview +
 * target picker + Full Spectrum) and the Help & FAQ.
 *
 * Output → assets/bedready/*.png  (+ index.md manifest)
 *
 * The converter shots need a real multicolour .3mf. By default it looks for one
 * at ~/dev/3DWebsite/samples/Mario-6color-1plate.3mf; override with
 *   BEDREADY_SAMPLE_3MF=/path/to/model.3mf
 * If no sample is found those two shots are skipped (the rest still capture).
 *
 * macOS/Windows: node scripts/capture-bedready-screenshots.mjs
 * Linux CI:      xvfb-run -a node scripts/capture-bedready-screenshots.mjs
 */
import { _electron as electron } from 'playwright-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildScreenshotDemoStore } from './screenshot-demo-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'bedready');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bedready-shots-'));
const VIEWPORT = { width: 1480, height: 940 };

// Samples for the converter shots (optional). FS needs >4 colours (Mario = 8);
// the 3D-preview hero looks best with a single dramatic model (the dragon).
const samplesDir = path.join(os.homedir(), 'dev', '3DWebsite', 'samples');
const FS_SAMPLE = process.env.BEDREADY_SAMPLE_3MF || path.join(samplesDir, 'Mario-6color-1plate.3mf');
const HERO_SAMPLE = process.env.BEDREADY_HERO_3MF || path.join(samplesDir, '3+color+AMS.3mf');

fs.mkdirSync(outDir, { recursive: true });

// Maker-flavoured store: reuse the rich demo data (print files, filament,
// queue, waste) but strip the business branding so nothing Khayt-ish leaks.
function buildBedReadyStore() {
  const store = buildScreenshotDemoStore();
  store.settings = {
    ...store.settings,
    mode: 'enthusiast',          // Bed Ready is single-mode; the flavor forces this anyway
    businessName: 'My Workshop',
    bizEn: 'My Workshop', bizAr: '',
    taglineEn: '', taglineAr: '',
    currency: 'USD',
    monthlyGoal: 0,
    loyaltyEnabled: false,
    zatca: undefined,
    emailConfig: undefined,
  };
  return store;
}

const TABS = [
  { tab: 'dashboard-tab', file: '01-dashboard.png', label: 'Dashboard / home',
    wait: '#dashboard-tab' },
  { tab: 'printfiles-tab', file: '02-print-files.png', label: 'Print-file library',
    wait: '#printfiles-tab' },
  { tab: 'converter-tab', file: '03-converter-landing.png', label: 'Converter (landing)',
    wait: '#converter-tab' },
  { tab: 'colorstudio-tab', file: '04-colour-studio.png', label: 'Colour studio',
    wait: '#colorstudio-tab' },
  { tab: 'calculator-tab', file: '05-cost-calculator.png', label: 'Print-cost calculator',
    wait: '#calculator-tab', setup: 'calculator' },
  { tab: 'inventory-tab', file: '06-filament-inventory.png', label: 'Filament inventory',
    wait: '#inventory-tab' },
  { tab: 'queue-tab', file: '07-print-queue.png', label: 'Print queue',
    wait: '#queue-tab' },
  { tab: 'waste-tab', file: '08-waste-log.png', label: 'Waste / failure log',
    wait: '#waste-tab' },
  { tab: 'settings-tab', file: '09-settings-slicers.png', label: 'Settings · slicer integration',
    wait: '#settings-tab', setup: 'settings-printers' },
];

const MANIFEST = [];

async function seedCalculator(page) {
  await page.evaluate(() => {
    window.KhaytShell?.switchTab?.('calculator-tab');
    const parts = [
      { name: 'Articulated dragon', qty: 1, printWeight: 180, printTime: 9.4, spoolCost: 95, spoolWeight: 1000, wearRate: 0.05, powerDraw: 120, elecRate: 0.16, prepTime: 0.2, postTime: 0.4, laborRate: 40, failureRate: 5 },
      { name: 'Enclosure panel', qty: 2, printWeight: 96, printTime: 3.2, spoolCost: 82, spoolWeight: 1000, wearRate: 0.05, powerDraw: 120, elecRate: 0.16, prepTime: 0.15, postTime: 0.3, laborRate: 40, failureRate: 5 },
      { name: 'Cable clip', qty: 12, printWeight: 8, printTime: 0.4, spoolCost: 75, spoolWeight: 1000, wearRate: 0.05, powerDraw: 120, elecRate: 0.16, prepTime: 0.05, postTime: 0.1, laborRate: 40, failureRate: 8 },
    ];
    for (const p of parts) {
      const set = (id, v) => { const el = document.querySelector(id); if (el) el.value = String(v); };
      set('#partName', p.name); set('#partQty', p.qty); set('#printWeight', p.printWeight);
      set('#printTime', p.printTime); set('#spoolCost', p.spoolCost); set('#spoolWeight', p.spoolWeight);
      set('#wearRate', p.wearRate); set('#powerDraw', p.powerDraw); set('#elecRate', p.elecRate);
      set('#prepTime', p.prepTime); set('#postTime', p.postTime); set('#laborRate', p.laborRate);
      set('#failureRate', p.failureRate); set('#margin', 35);
      window.addPart?.();
    }
    window.renderBuild?.();
    window.calculateLivePartCost?.();
    window.KhaytStudio?.initStudioCalculatorLayout?.();
  });
}

async function prepareTab(page, shot) {
  if (shot.setup === 'calculator') { await seedCalculator(page); return; }
  await page.evaluate((tabId) => window.KhaytShell.switchTab(tabId), shot.tab);
  if (shot.setup === 'settings-printers') {
    await page.evaluate(() => document.querySelector('.settings-nav-item[data-settings-section="printers"]')?.click());
    // Populate the "installed slicers" list so the integration card isn't empty.
    await page.evaluate(async () => {
      try { await window.hubAPI?.detectSlicers?.(); document.querySelector('#btnDetectSlicers')?.click?.(); } catch (_) {}
    });
  }
}

async function shoot(page, selector, file, label) {
  await page.waitForTimeout(350);
  const target = (await page.locator(selector).count()) ? page.locator(selector).first() : page.locator('.khayt-app');
  await target.screenshot({ path: path.join(outDir, file), type: 'png' });
  MANIFEST.push({ file, label });
  console.log(`  ✓ ${file}  — ${label}`);
}

// The converter modal has an internally-scrolling body; scroll a section into
// view before screenshotting the fixed-height modal so a below-the-fold panel
// (e.g. the Full Spectrum plan) is what's captured.
async function scrollModalTo(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ block: 'start' });
  }, selector);
  await page.waitForTimeout(400);
}

let electronApp;
try {
  electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: root,
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1', KHAYT_FLAVOR: 'bedready' },
    timeout: 120_000,
  });

  const page = await electronApp.firstWindow();
  await page.setViewportSize(VIEWPORT);
  await page.waitForSelector('.khayt-app', { timeout: 90_000 });
  await page.waitForFunction(
    () => typeof window.hubAPI?.saveStore === 'function' && typeof window.KhaytShell?.switchTab === 'function',
    { timeout: 90_000 },
  );

  // Seed demo data, flush to disk, reload so loadAll() applies it.
  const saved = await page.evaluate(async (store) => window.hubAPI.saveStore(store), buildBedReadyStore());
  if (!saved?.ok) throw new Error(`saveStore failed: ${JSON.stringify(saved)}`);
  await page.evaluate(async () => { await window.hubAPI.loadStore(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.khayt-app', { timeout: 90_000 });
  await page.waitForFunction(
    () => typeof window.KhaytShell?.switchTab === 'function'
      && typeof printLog !== 'undefined' && Array.isArray(printLog) && printLog.length > 5,
    { timeout: 60_000 },
  );

  // Clean transient chrome (wizard, toasts, leftover modals).
  await page.evaluate(() => {
    const wiz = document.querySelector('#setup-wizard'); if (wiz) wiz.style.display = 'none';
    document.querySelector('#toastContainer')?.replaceChildren();
    document.querySelector('#modalMount')?.replaceChildren();
  });
  await page.evaluate(() => window.KhaytShell?.switchTab?.('dashboard-tab'));
  await page.waitForTimeout(700);

  console.log(`\nBed Ready screenshot library → assets/bedready/`);
  for (const shot of TABS) {
    await prepareTab(page, shot);
    try { await page.waitForSelector(shot.wait, { timeout: 12_000 }); } catch { /* capture anyway */ }
    await shoot(page, '.khayt-app', shot.file, shot.label);
    // Reset any settings sub-nav back for the next iteration.
    await page.evaluate(() => document.querySelector('#modalMount')?.replaceChildren());
  }

  // ---- Flagship: the 3MF converter -------------------------------------------
  async function openConverterWith(srcPath, destName) {
    const local = path.join(userData, destName); // inside userData → an allowed read dir
    fs.copyFileSync(srcPath, local);
    const opened = await page.evaluate(async (p) => {
      if (!window.KhaytConverter?.openConverter) return 'no-api';
      await window.KhaytConverter.openConverter({ path: p, name: p.split('/').pop() });
      return 'ok';
    }, local);
    if (opened !== 'ok') return opened;
    await page.waitForSelector('#modalMount .modal-form', { timeout: 30_000 });
    try { await page.waitForSelector('.conv-preview-ctrls', { timeout: 60_000 }); } catch { /* thumbnail fallback */ }
    await page.waitForTimeout(1500);
    return 'ok';
  }
  const closeModal = () => page.evaluate(() => document.querySelector('#modalMount')?.replaceChildren());

  // (10) 3D-preview hero — a single dramatic model fills the frame.
  const heroSrc = fs.existsSync(HERO_SAMPLE) ? HERO_SAMPLE : (fs.existsSync(FS_SAMPLE) ? FS_SAMPLE : null);
  if (heroSrc) {
    const o = await openConverterWith(heroSrc, 'hero.3mf');
    if (o === 'ok') {
      await page.evaluate(() => document.querySelector('.conv-preview-ctrls [data-pv="iso"]')?.click());
      await page.waitForTimeout(1000);
      await shoot(page, '#modalMount .modal-form', '10-converter-3d-preview.png', 'Converter · 3D preview + target picker');
    } else {
      console.warn(`  · converter open failed for hero (${o}) — skipping 10`);
    }
    await closeModal();
  } else {
    console.warn(`  · no hero .3mf — skipping 10-converter-3d-preview.png`);
  }

  // (11) Full Spectrum — an 8-colour file retargeted to the 4-slot Snapmaker U1.
  if (fs.existsSync(FS_SAMPLE)) {
    const o = await openConverterWith(FS_SAMPLE, 'fs.3mf');
    if (o === 'ok') {
      const fs4 = await page.evaluate(() => {
        const sel = document.querySelector('#convTarget');
        if (!sel) return 'no-select';
        if (![...sel.options].some((op) => op.value === 'snapmaker-u1')) return 'no-u1';
        sel.value = 'snapmaker-u1';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return 'set';
      });
      if (fs4 === 'set') {
        await page.waitForTimeout(900);
        const toggled = await page.evaluate(() => {
          const cb = document.querySelector('#convFsOn');
          if (!cb) return false;
          if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
          return true;
        });
        if (toggled) {
          try { await page.waitForSelector('.conv-fs-plan .conv-fs-mix, .conv-fs-heads', { timeout: 30_000 }); } catch { /* */ }
          await page.waitForTimeout(1200);
          await scrollModalTo(page, '#convFsWrap'); // bring the plan into the modal viewport
          await shoot(page, '#modalMount .modal-form', '11-full-spectrum.png', 'Full Spectrum · mix plan (Snapmaker U1)');
        } else {
          console.warn('  · Full Spectrum toggle not present — skipping 11-full-spectrum.png');
        }
      } else {
        console.warn(`  · could not target U1 (${fs4}) — skipping Full Spectrum shot`);
      }
    } else {
      console.warn(`  · converter open failed for FS sample (${o}) — skipping 11`);
    }
    await closeModal();
  } else {
    console.warn(`  · no FS sample .3mf at ${FS_SAMPLE} — skipping Full Spectrum shot`);
    console.warn(`    (set BEDREADY_SAMPLE_3MF=/path/to/multicolour.3mf to include it)`);
  }

  // ---- Help & FAQ ------------------------------------------------------------
  const help = await page.evaluate(() => {
    if (window.KhaytShell?.openBedReadyHelp) { window.KhaytShell.openBedReadyHelp('start'); return 'ok'; }
    document.querySelector('#btnHelp')?.click();
    return 'click';
  });
  try {
    await page.waitForSelector('#modalMount .modal .help-tabs, #modalMount .modal .help-section', { timeout: 15_000 });
    await page.waitForTimeout(500);
    await shoot(page, '#modalMount .modal', '12-help-faq.png', 'Help & FAQ');
  } catch {
    console.warn(`  · Help modal did not open (${help}) — skipping help shot`);
  }

  // Manifest so the website team knows what each file is.
  const md = ['# Bed Ready screenshot library', '',
    `${MANIFEST.length} screenshots, viewport ${VIEWPORT.width}×${VIEWPORT.height}, PNG, dark theme.`,
    'Public-beta build (the BETA badge is intentional). Demo data — no real customer content.', '',
    '## Contents', '',
    ...MANIFEST.map((m) => `- \`${m.file}\` — ${m.label}`), '',
    '## Regenerate', '',
    '```', 'npm run capture:bedready', '```', '',
    'The converter shots (10, 11) need local multicolour `.3mf` samples; override with',
    '`BEDREADY_HERO_3MF` (single model for the 3D hero) and `BEDREADY_SAMPLE_3MF`',
    '(>4 colours for Full Spectrum). Without them the other 10 shots still capture.', ''].join('\n');
  fs.writeFileSync(path.join(outDir, 'index.md'), md);

  console.log(`\n✅ Bed Ready library: ${MANIFEST.length} screenshots in assets/bedready/`);
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
