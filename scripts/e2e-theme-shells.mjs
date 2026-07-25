#!/usr/bin/env node
/**
 * E2E: tab/nav smoke per Khayt-4 design shell (all selectable themes).
 * Linux CI: xvfb-run -a node scripts/e2e-theme-shells.mjs
 */
import fs from 'fs';
import {
  dismissWizard,
  launchApp,
  makeUserDataDir,
  switchTab,
} from './e2e/helpers.mjs';
import { buildScreenshotDemoStore } from './screenshot-demo-store.mjs';

const THEME_CASES = [
  { id: 'workbench', bodyClass: 'khayt-workbench', appearance: 'light', dashSel: '.wb-dash', dashMin: 80 },
  { id: 'vivid', bodyClass: 'khayt-vivid', appearance: 'light', dashSel: '.vv-dash', dashMin: 80 },
  { id: 'command', bodyClass: 'khayt-command', appearance: 'light', dashSel: '.cmd-dash', dashMin: 80 },
];

const userData = makeUserDataDir();
let electronApp;

async function applyThemeCase(window, themeCase) {
  await window.evaluate(({ id, appearance }) => {
    settings.designTheme = id;
    settings.theme = appearance;
    if (typeof applyTheme === 'function') applyTheme(appearance);
    if (typeof applyDesignSettings === 'function') applyDesignSettings();
    window.KhaytShell?.switchTab?.('dashboard-tab');
  }, themeCase);

  await window.waitForFunction(
    ({ bodyClass, id }) => document.body.classList.contains(bodyClass)
      && document.documentElement.dataset.design === id,
    themeCase,
    { timeout: 15_000 },
  );
}

// The top-bar global search (⌕ + input + ⌘K) is a flexbox row. Its base layout
// lived in studio/shell.css and reached Khayt only because index.html linked that
// CSS globally; the Bed Ready rebase moved the layer out and the flexbox went with
// it, so the three children stacked and overlapped. Every theme relies on the base,
// so assert it here — this is exactly the regression that shipped unnoticed.
async function assertSearchBarLaidOut(window, themeCase) {
  const r = await window.evaluate(() => {
    const el = document.querySelector('.khayt-search');
    if (!el || el.offsetParent === null) return { skip: true };   // some shells hide it
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const mid = (box.top + box.bottom) / 2;
    const childrenOnOneRow = [...el.children].every((c) => {
      const cr = c.getBoundingClientRect();
      return Math.abs((cr.top + cr.bottom) / 2 - mid) < 8;
    });
    const input = el.querySelector('input');
    return { display: cs.display, childrenOnOneRow, inputWidth: input ? Math.round(input.getBoundingClientRect().width) : 0 };
  });
  if (r.skip) return;
  if (r.display !== 'flex') throw new Error(`${themeCase.id}: search bar is not a flex row (display:${r.display}) — base layout lost`);
  if (!r.childrenOnOneRow) throw new Error(`${themeCase.id}: search bar children stacked instead of one row`);
  if (r.inputWidth < 40) throw new Error(`${themeCase.id}: search input collapsed (${r.inputWidth}px) — flex:1 missing`);
}

async function assertDashboard(window, themeCase) {
  const dash = await window.evaluate(({ dashSel, dashMin }) => {
    const el = document.querySelector(dashSel);
    return { found: !!el, len: el?.innerHTML?.length || 0, min: dashMin };
  }, themeCase);
  if (!dash.found || dash.len < dash.min) {
    throw new Error(`${themeCase.id}: dashboard not rendered (${JSON.stringify(dash)})`);
  }
}

async function navigateSecondaryTab(window, themeCase) {
  await window.click('#tabbtn-queue-tab');
  await window.waitForFunction(
    () => document.getElementById('queue-tab')?.classList.contains('active') === true,
    { timeout: 10_000 },
  );
  const queueReady = await window.evaluate(
    () => !!document.querySelector('#list-pending') && document.querySelectorAll('.kanban-col').length >= 5,
  );
  if (!queueReady) throw new Error(`${themeCase.id}: queue tab did not render kanban`);

  await switchTab(window, 'settings-tab');
  const settingsReady = await window.evaluate(
    () => document.getElementById('settings-tab')?.classList.contains('active') === true
      && !!document.querySelector('#settings-panel-prefs'),
  );
  if (!settingsReady) throw new Error(`${themeCase.id}: settings tab did not activate`);
}

// Guard the theme tab-reachability regression: the 3.1 tabs (printfiles/colorstudio/
// converter) and others must have a nav entry point in every shell.
async function assertNewTabsReachable(window, themeCase) {
  const ok = await window.evaluate(() => {
    const b = document.getElementById('tabbtn-converter-tab');
    return !!(b && b.offsetParent !== null);
  });
  if (!ok) throw new Error(`${themeCase.id}: converter tab has no visible nav entry`);
}

// Enthusiast (hobbyist) mode must not leak revenue/margin into the bespoke
// per-theme dashboards. Seed a completed order with revenue + cost, render each
// themed dashboard in enthusiast mode, and assert the currency symbol and the
// word "margin" are absent from the dashboard (and, for cockpit, its stats bar).
async function assertEnthusiastThemesNoMoney(window) {
  const THEMES = [
    { id: 'command', sel: '.cmd-dash', extra: '#commandStatusBar' },
    { id: 'workbench', sel: '.wb-dash', extra: null },
    { id: 'vivid', sel: '.vv-dash', extra: null },
  ];
  for (const th of THEMES) {
    const r = await window.evaluate(({ id, sel, extra }) => {
      const ccy = (typeof currencySymbol === 'function') ? currencySymbol() : 'SAR';
      const todayStr = (typeof localDateStr === 'function') ? localDateStr(new Date()) : new Date().toISOString().slice(0, 10);
      printLog.unshift({ id: 'REV-e2e', project: 'Rev probe', status: 'completed', price: 73219, cost: 21000, date: todayStr, printTime: 3, clientId: '' });
      settings.mode = 'enthusiast';
      settings.designTheme = id;
      if (typeof applyDesignSettings === 'function') applyDesignSettings();
      window.KhaytShell?.switchTab?.('dashboard-tab');
      const root = document.querySelector(sel);
      let html = root ? root.innerHTML : null;
      if (extra) { const e = document.querySelector(extra); if (e) html = (html || '') + e.innerHTML; }
      // Match the profit-margin KPI label specifically ("Avg margin") — a bare
      // /margin/i would false-match CSS "margin:" in inline styles.
      const out = {
        found: !!root,
        hasCcy: html != null && html.includes(ccy),
        hasMargin: html != null && /Avg margin|profit margin/i.test(html),
        ccy,
      };
      printLog.shift();
      settings.mode = 'professional';
      if (typeof applyDesignSettings === 'function') applyDesignSettings();
      return out;
    }, th);
    if (!r.found) throw new Error(`${th.id}: enthusiast dashboard ${th.sel} not found`);
    if (r.hasCcy) throw new Error(`${th.id}: enthusiast dashboard leaks currency (${r.ccy})`);
    if (r.hasMargin) throw new Error(`${th.id}: enthusiast dashboard leaks "margin"`);
  }
}

// RTL smoke. This used to run against atlas; that theme was deleted, so it now
// covers workbench — the default, and the one carrying the rebuilt dashboard.
async function testRtlWorkbench(window) {
  await window.evaluate(() => {
    settings.lang = 'ar';
    settings.designTheme = 'workbench';
    settings.theme = 'dark';
    i18n.set('ar');
    if (typeof applyTheme === 'function') applyTheme('dark');
    if (typeof applyDesignSettings === 'function') applyDesignSettings();
    window.KhaytShell?.switchTab?.('dashboard-tab');
  });
  await window.waitForFunction(
    () => document.documentElement.dir === 'rtl'
      && document.body.classList.contains('khayt-workbench')
      && !!document.querySelector('.wb-dash'),
    { timeout: 15_000 },
  );
  // The attention bar must mirror with the layout, not stay pinned left.
  const bar = await window.evaluate(() => {
    const el = document.querySelector('.wb-dash .dash-attn');
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    return { present: true, left: cs.borderLeftWidth, right: cs.borderRightWidth };
  });
  // Assert presence separately — an absent bar must fail, not pass quietly.
  if (!bar.present) throw new Error('RTL: attention bar missing from the workbench dashboard');
  if (bar.right === '0px') {
    throw new Error(`RTL: attention bar accent edge did not mirror (${JSON.stringify(bar)})`);
  }
}

// A missed poll is not a fault. Every themed dashboard has independently gotten
// this wrong — workbench, command and vivid each shipped `m.isOffline ||
// cache.error`, which paints a printer red on the first missed poll while the
// attention bar (correctly) stays silent. Three separate regressions of the same
// shape, so guard it rather than fix it a fourth time.
//
// Seeds two machines: one genuinely gone (past the miss threshold) and one that
// blipped once. The dead one must read offline; the blip must not.
async function assertReconnectingNotOffline(window) {
  // Render a fleet of exactly one machine per case, so the dashboard's wording
  // is unambiguous without needing per-theme selectors to pair a name with its
  // state label (workbench puts them on separate lines, command/vivid don't).
  const CASES = [
    { misses: 1, mustNotMatch: /offline/i, mustMatch: /reconnect/i, label: 'one missed poll' },
    { misses: 5, mustMatch: /offline/i, label: 'past the miss threshold' },
  ];
  for (const id of ['workbench', 'command', 'vivid']) {
    for (const c of CASES) {
      const r = await window.evaluate(({ theme, misses }) => {
        // Seed our own fleet rather than leaning on the demo store: that store
        // emits `machines` while the persisted schema uses `printers`, so it
        // does not survive the save/reload and the rest of this suite runs
        // against an empty fleet.
        const saved = machines;
        machines = [{ id: 'E2E-M', name: 'E2E Probe Printer', color: '#c00' }];
        machineStatusCache['E2E-M'] = {
          error: 'ETIMEDOUT', consecutiveFailures: misses, state: 'Printing', progress: 61,
        };
        settings.designTheme = theme;
        if (typeof applyDesignSettings === 'function') applyDesignSettings();
        window.KhaytShell?.switchTab?.('dashboard-tab');
        if (typeof renderDashboard === 'function') renderDashboard();
        const root = document.querySelector('.wb-dash, .cmd-dash, .vv-dash');
        const out = {
          rendered: !!root,
          barPresent: !!document.querySelector('.dash-attn'),
          text: ((root && root.innerText) || '').replace(/\s+/g, ' '),
        };
        machines = saved;
        delete machineStatusCache['E2E-M'];
        return out;
      }, { theme: id, misses: c.misses });

      if (!r.rendered) throw new Error(`${id}: dashboard did not render (${c.label})`);
      if (!r.barPresent) throw new Error(`${id}: attention bar missing from the dashboard`);
      if (c.mustMatch && !c.mustMatch.test(r.text)) {
        throw new Error(`${id}: ${c.label} should match ${c.mustMatch} — got "${r.text.slice(0, 160)}"`);
      }
      if (c.mustNotMatch && c.mustNotMatch.test(r.text)) {
        throw new Error(`${id}: ${c.label} must not read offline — got "${r.text.slice(0, 160)}"`);
      }
    }
  }
}

async function seedDemoStore(window) {
  const demoStore = buildScreenshotDemoStore();
  demoStore.settings = demoStore.settings || {};
  demoStore.settings.firstRun = false;
  demoStore.settings.firstRunDone = true;
  demoStore.settings.designTheme = 'workbench';
  // Seeding via saveStore alone loses the data: boot schedules a debounced
  // saveAll() (300ms) built from the still-empty globals, and that write lands
  // AFTER this one and overwrites it. The suite then ran every theme against an
  // empty app — dashboards rendered, so nothing failed, but nothing was really
  // being tested either. Empty states flatter a design.
  //
  // Apply the snapshot to the in-memory globals first, so any save the renderer
  // performs writes the demo data rather than emptiness, then flush it.
  const saveResult = await window.evaluate(async (store) => {
    if (typeof applyStoreFromSnapshot === 'function') applyStoreFromSnapshot(store);
    if (typeof flushSave === 'function') await flushSave();
    return window.hubAPI.saveStore(store);
  }, demoStore);
  if (!saveResult?.ok) throw new Error(`saveStore failed: ${JSON.stringify(saveResult)}`);
  await window.reload({ waitUntil: 'domcontentloaded' });
  await window.waitForSelector('.khayt-app', { timeout: 90_000 });
  await dismissWizard(window);

  // Prove the seed survived — the whole point of this function.
  const seeded = await window.evaluate(() => ({
    machines: typeof machines !== 'undefined' ? machines.length : -1,
    orders: typeof printLog !== 'undefined' ? printLog.length : -1,
  }));
  if (seeded.machines < 2 || seeded.orders < 1) {
    throw new Error(`demo store did not survive the reload: ${JSON.stringify(seeded)}`);
  }
}

/**
 * Two redesign promises that are easy to regress silently:
 *  - the queue group head must be an operable control. It rendered
 *    `is-collapsed` from lib/queue-groups.js but nothing ever toggled it, so
 *    "Finished today" showed totals that could never be opened.
 *  - nav chrome must stay quiet. All 13 items used to carry a saturated tile
 *    from the STATUS palette, making permanent navigation louder than the
 *    attention bar it sits beside.
 */
async function assertQuietChromeAndOperableGroups(window) {
  await applyThemeCase(window, THEME_CASES.find((c) => c.id === 'workbench'));

  const g = await window.evaluate(() => {
    const head = document.querySelector('.ql-group .ql-group-head');
    if (!head) return { missing: true };
    const before = head.getAttribute('aria-expanded');
    head.click();
    return { tag: head.tagName, before, after: head.getAttribute('aria-expanded') };
  });
  if (g.missing) throw new Error('no queue group head rendered — cannot verify it is operable');
  if (g.tag !== 'BUTTON') throw new Error(`queue group head is <${g.tag}>, expected BUTTON`);
  if (!g.before || !g.after || g.before === g.after) {
    throw new Error(`clicking the group head did not flip aria-expanded (${g.before} -> ${g.after})`);
  }

  // The invariant is "chrome is quiet", not "exactly one colour" — a second
  // neutral is fine. What must not happen is a nav icon carrying a saturated
  // hue from the STATUS palette, which is reserved for conditions.
  // .nav-icon animates background over 120ms. Measuring immediately after a
  // navigation reads a mid-transition colour on the tab we just left — it has
  // already lost .active but is still fading down from the accent.
  await window.waitForTimeout(300);
  // A row that paints a hover highlight must actually open the order — and a
  // click on the row's own action button must NOT also open it, or advancing a
  // job would pop the editor every time.
  const rowClick = await window.evaluate(() => {
    const out = { opened: null, openedFromButton: null };
    const realOpen = window.openOrderEditor;
    let lastId = null;
    window.openOrderEditor = (id) => { lastId = id; };
    try {
      const row = document.querySelector('.ql-row.is-openable');
      if (!row) return { skipped: true };
      const wantId = row.dataset.orderId;

      lastId = null;
      row.click();
      out.opened = (lastId === wantId);

      const btn = row.querySelector('button[data-act="status"]');
      if (btn) { lastId = null; btn.click(); out.openedFromButton = (lastId !== null); }
      return out;
    } finally { window.openOrderEditor = realOpen; }
  });
  if (!rowClick.skipped) {
    if (!rowClick.opened) throw new Error('clicking a queue row did not open its order');
    if (rowClick.openedFromButton) throw new Error('clicking the row action button also opened the order editor');
  }

  const nav = await window.evaluate(() => {
    const sat = (css) => {
      const m = /rgba?\(([^)]+)\)/.exec(css || '');
      if (!m) return 0;
      const [r, g, b] = m[1].split(',').slice(0, 3).map((n) => parseFloat(n));
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      return mx === 0 ? 0 : (mx - mn) / mx;   // HSV saturation, 0..1
    };
    const items = [...document.querySelectorAll('.khayt-navitem')];
    const loud = [];
    for (const b of items) {
      // The active item legitimately takes the accent. Check both signals:
      // the class and aria-selected, since nav state is mirrored in both.
      if (b.classList.contains('active') || b.getAttribute('aria-selected') === 'true') continue;
      const icon = b.querySelector('.nav-icon');
      if (!icon) continue;
      const bg = getComputedStyle(icon).backgroundColor;
      if (sat(bg) > 0.25) loud.push(`${b.dataset.tab}=${bg}`);
    }
    return { count: items.length, loud, inlineTiles: items.filter((b) => b.style.getPropertyValue('--wb-tile')).length };
  });
  if (nav.count > 3) {
    if (nav.loud.length) throw new Error(`nav chrome is not quiet — saturated icons: ${nav.loud.join(', ')}`);
    if (nav.inlineTiles) throw new Error(`${nav.inlineTiles} nav items still carry an inline --wb-tile colour`);
  }
}

try {
  ({ electronApp } = await launchApp(userData));
  const window = await electronApp.firstWindow();
  await seedDemoStore(window);

  for (const themeCase of THEME_CASES) {
    await applyThemeCase(window, themeCase);
    await assertDashboard(window, themeCase);
    await assertSearchBarLaidOut(window, themeCase);
    await navigateSecondaryTab(window, themeCase);
    await assertNewTabsReachable(window, themeCase);
    console.log(`  ${themeCase.id}: dashboard + queue + settings + reach ok`);
  }

  await assertEnthusiastThemesNoMoney(window);
  console.log('  enthusiast themed dashboards: no revenue/margin ok');

  await assertReconnectingNotOffline(window);
  console.log('  a missed poll reads reconnecting, not offline: ok');

  await assertQuietChromeAndOperableGroups(window);
  console.log('  quiet nav chrome + operable queue groups: ok');

  await testRtlWorkbench(window);
  console.log('  workbench + ar RTL: ok');

  console.log(`e2e-theme-shells: ok (${THEME_CASES.length} themes + RTL workbench)`);
} finally {
  if (electronApp) await electronApp.close().catch(() => {});
  fs.rmSync(userData, { recursive: true, force: true });
}
