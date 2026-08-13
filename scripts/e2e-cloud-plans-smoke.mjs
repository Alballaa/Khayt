#!/usr/bin/env node
/**
 * E2E: the Khayt Cloud price ladder renders, and says the right thing.
 *
 * lib/cloud-plans.js is unit-tested, but a plan table that no screen ever paints
 * is worth nothing — and the specific failure this guards is one a unit test
 * cannot see: settings.js is shared with the other flavor, so the module is
 * loaded from renderer/index.html only and every use is guarded on the global.
 * Drop the script tag and the unit tests still pass while the section silently
 * renders empty.
 *
 * It also pins the two claims the UI is making to a shop:
 *
 *   1. Paid prices are STRUCK THROUGH and accompanied by "Free during beta".
 *      Rendering a live price while nothing can collect it would be a lie in the
 *      expensive direction.
 *   2. The struck-through figure is still the real one. "Free during beta" that
 *      hides the future price defeats the point of showing it early.
 *
 * Requires display (use xvfb-run on Linux CI).
 */
import fs from 'fs';
import { applyDesignTheme, dismissWizard, launchApp, makeUserDataDir, switchTab } from './e2e/helpers.mjs';

const userData = makeUserDataDir();
let electronApp;

/**
 * The cloud card lives inside the "automation" panel, not a panel of its own —
 * so drive the app's own navigation rather than guessing a selector, which is
 * how this was wrong the first time.
 */
async function openCloudPanel(window) {
  await switchTab(window, 'settings-tab');
  // The cloud card sits in the "automation" panel, which is .pro-only — in any
  // other mode the panel is display:none even once it is the active one. The
  // wizard does not leave a fresh profile in Professional, so ask for it.
  await window.evaluate(() => {
    settings.mode = 'professional';
    applyMode();
    renderCloudSettings();
    openSettingsSection('automation');
  });
  await window.waitForSelector('#cloudSettingsSection');
  await window.waitForFunction(() =>
    document.querySelector('#cloudSettingsSection')?.innerText.includes('Khayt Cloud'));
}

/** Read the rendered ladder back out of the DOM, not out of the module. */
const readLadder = (window) => window.evaluate(() => {
  const sec = document.querySelector('#cloudSettingsSection');
  const cards = [...sec.querySelectorAll('div')].filter((d) => d.querySelector('ul') && d.querySelector('s, span'));
  return {
    text: sec.innerText,
    struck: [...sec.querySelectorAll('s')].map((s) => s.textContent.trim()),
    cardCount: cards.length,
  };
});

async function testLadderRenders(window) {
  const { text, struck } = await readLadder(window);

  // The module is loaded at all — the guarded-global failure mode.
  const loaded = await window.evaluate(() => typeof KhaytCloudPlans !== 'undefined');
  if (!loaded) throw new Error('KhaytCloudPlans is not loaded in index.html — the section renders empty');

  for (const tier of ['Free', 'Cloud', 'Branches']) {
    if (!text.includes(tier)) throw new Error(`the "${tier}" tier is not on screen`);
  }
  if (!text.includes('Free during beta')) {
    throw new Error('"Free during beta" is missing — a shop cannot tell it is not being charged');
  }
  if (!text.includes('Not built yet')) {
    throw new Error('the Branches tier does not say it is unbuilt, so it reads as purchasable');
  }
  return struck;
}

/** The prices shown must be the real ones, struck through — not hidden, not live. */
async function testPricesAreStruckThroughAndReal(window, struck) {
  if (struck.length !== 2) {
    throw new Error(`expected exactly 2 struck-through prices (cloud + branches), got ${struck.length}: ${struck.join(', ')}`);
  }
  const expected = await window.evaluate(() =>
    ['cloud', 'branches'].map((id) => {
      const p = KhaytCloudPlans.planPrice(id, settings.currency);
      return p.currency === 'USD' ? `$${p.amount}` : `${p.amount} ${p.currency}`;
    }));
  for (const want of expected) {
    if (!struck.includes(want)) {
      throw new Error(`price ${want} is not struck through on screen; struck = ${struck.join(', ')}`);
    }
  }
  // Free is never struck through: there is no future price to reveal.
  if (struck.some((s) => /^\D*0\b/.test(s))) {
    throw new Error(`a zero price is struck through, which implies it will start costing: ${struck.join(', ')}`);
  }
}

/**
 * The prices must follow the shop's currency, because a Saudi shop reading "$9"
 * has to do arithmetic to know what it will pay.
 */
async function testCurrencyFollowsTheShop(window) {
  for (const [currency, want] of [['SAR', '35 SAR'], ['USD', '$9']]) {
    await window.evaluate((cur) => { settings.currency = cur; renderCloudSettings(); }, currency);
    const { struck } = await readLadder(window);
    if (!struck.includes(want)) {
      throw new Error(`with currency=${currency} the Cloud tier should read "${want}"; struck = ${struck.join(', ')}`);
    }
  }
}

/**
 * The beta.18 low-stock regression shipped because a token was a hex literal and
 * only the default dark theme was ever rendered. This block uses --success and
 * --warning, neither of which every theme defines, so paint it in a LIGHT theme
 * and assert the text colour is the theme's normal foreground rather than a
 * colour token used directly as text.
 */
async function testLightThemeDoesNotColourTheText(window) {
  await applyDesignTheme(window, { designId: 'flow', appearance: 'light' });
  await window.evaluate(() => renderCloudSettings());

  const bad = await window.evaluate(() => {
    const sec = document.querySelector('#cloudSettingsSection');
    const body = getComputedStyle(document.body).color;
    const out = [];
    for (const el of sec.querySelectorAll('div, span, s')) {
      if (!el.textContent.trim()) continue;
      const c = getComputedStyle(el).color;
      // #f5a623 / #16a34a used directly as text is the failure mode.
      if (/^rgb\(245, 166, 35\)$/.test(c) || /^rgb\(22, 163, 74\)$/.test(c)) {
        out.push({ text: el.textContent.trim().slice(0, 40), color: c, body });
      }
    }
    return out;
  });
  if (bad.length) {
    throw new Error('colour tokens are used as TEXT colour in a light theme: ' + JSON.stringify(bad));
  }
}

try {
  ({ electronApp } = await launchApp(userData));
  const window = await electronApp.firstWindow();
  window.setDefaultTimeout(120_000);
  await dismissWizard(window);
  await openCloudPanel(window);

  const struck = await testLadderRenders(window);
  await testPricesAreStruckThroughAndReal(window, struck);
  await testCurrencyFollowsTheShop(window);
  await testLightThemeDoesNotColourTheText(window);

  console.log('e2e-cloud-plans: ok (ladder renders, prices struck through and real, currency follows the shop, light theme safe)');
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
