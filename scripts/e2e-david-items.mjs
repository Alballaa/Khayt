/**
 * E2E smoke — marketplace fee presets, and a low-stock colour of your own.
 *
 * Both come from issue #364. Both are UI wiring, which is exactly the class a
 * unit test cannot vouch for: lib/platform-fees.js can be perfect while the
 * dropdown appends nothing, and the CSS token can exist while no code sets it.
 *
 * The two assertions that carry the most weight:
 *   - picking a second marketplace REPLACES the first one's fees rather than
 *     stacking them, which a shop would otherwise discover on a finished invoice;
 *   - recolouring low stock does NOT recolour --warning, which also paints
 *     overdue jobs and spool age.
 *
 * Run: npm run test:e2e:david
 */
import { launchApp, dismissWizard, makeUserDataDir } from './e2e/helpers.mjs';

const ok = (c, m) => { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓ ' + m); };

const { electronApp, window } = await launchApp(makeUserDataDir());
let failed = false;
try {
  await dismissWizard(window);
  await window.evaluate(() => { settings.mode = 'pro'; applyMode(); saveAll(); });

  // ── marketplace fees ────────────────────────────────────────────────────
  const fees = await window.evaluate(() => {
    currentExtraLines.length = 0;
    currentExtraLines.push({ id: 'EL1', label: 'Rush', amount: 15 });   // the shop's own
    const sel = document.querySelector('#platformFeeSelect');
    sel.value = 'etsy';
    sel.dispatchEvent(new Event('change'));
    const etsy = currentExtraLines.map((l) => ({ label: l.label, pct: l.pct, amount: l.amount }));
    sel.value = 'shopify';
    sel.dispatchEvent(new Event('change'));
    const swapped = currentExtraLines.map((l) => l.label);
    sel.value = '';
    sel.dispatchEvent(new Event('change'));
    return { etsy, swapped, cleared: currentExtraLines.map((l) => l.label) };
  });

  ok(fees.etsy.length === 4, `Etsy adds its fees alongside the shop's own line (${fees.etsy.length} lines)`);
  ok(fees.etsy.filter((l) => l.pct != null).length === 2, 'two percentage fees, as Etsy charges');
  ok(fees.etsy.some((l) => l.amount === 0.20), 'and the 0.20 listing fee he named');
  ok(fees.etsy[0].label === 'Rush', "the shop's own line stays first and untouched");

  ok(!fees.swapped.some((l) => /Etsy/.test(l)), 'switching marketplace REMOVES the previous one’s fees');
  ok(fees.swapped.filter((l) => /Shopify/.test(l)).length === 2, 'and adds the new one’s');
  ok(fees.swapped[0] === 'Rush', "without disturbing the shop's own line");

  ok(fees.cleared.length === 1 && fees.cleared[0] === 'Rush',
    'choosing no marketplace strips the fees and leaves the rest');

  // ── low-stock colour ────────────────────────────────────────────────────
  const colour = await window.evaluate(() => {
    const root = document.documentElement;
    const read = (v) => getComputedStyle(root).getPropertyValue(v).trim();
    const warnBefore = read('--warning');
    const before = read('--low-stock');
    settings.lowStockColor = '#e11d48';
    applyDesignSettings();
    const after = read('--low-stock');
    const warnAfter = read('--warning');
    settings.lowStockColor = '';
    applyDesignSettings();
    return { before, after, reset: read('--low-stock'), warnBefore, warnAfter };
  });

  ok(colour.before === '#f5a623', `low stock starts on the shipped amber (${colour.before})`);
  ok(colour.after === '#e11d48', `and follows the shop's choice (${colour.after})`);
  ok(colour.warnBefore === colour.warnAfter,
    `--warning is NOT dragged along (${colour.warnBefore} → ${colour.warnAfter})`);
  ok(colour.reset === '#f5a623', 'clearing the setting returns to the theme default');

  console.log('\ndavid items smoke: all assertions passed');
} catch (err) {
  failed = true;
  console.error('\n' + (err && err.message ? err.message : String(err)));
} finally {
  await electronApp.close();
}
process.exit(failed ? 1 : 0);
