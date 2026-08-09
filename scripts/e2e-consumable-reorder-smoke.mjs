/**
 * E2E smoke — consumables through the whole reorder chain, in a real window.
 *
 * The unit tests check the forecast and the wiring tests grep the source. Neither
 * can answer the question that actually matters here: when someone clicks the
 * button, does stock move?
 *
 * The chain has four links and three of them were built for filament, so this
 * drives all of it against real DOM: the modal renders → the draft button is
 * clicked → a purchase order exists → it is received through its own dialog →
 * the CONSUMABLE's stock goes up and the expense is not filament.
 *
 * Run: npm run test:e2e:consumables
 */
import { launchApp, dismissWizard, makeUserDataDir, switchTab } from './e2e/helpers.mjs';

const ok = (c, m) => { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓ ' + m); };

const { electronApp, window } = await launchApp(makeUserDataDir());
let failed = false;
try {
  await dismissWizard(window);

  // Purchase orders are a pro surface — #poSection is `pro-only`, so in any other
  // mode the whole receive path is display:none and nothing here is clickable.
  await window.evaluate(() => { settings.mode = 'pro'; applyMode(); saveAll(); });

  // Four shelves in four states, and completed orders to give two of them a rate.
  await window.evaluate(() => {
    consumables.length = 0;
    consumables.push(
      { id: 'CNS-IPA', name: 'Isopropyl', stock: 20, minStock: 1, unit: 'ml', cost: 0.1, usagePerHour: 6 },
      { id: 'CNS-BAG', name: 'Mailer bags', stock: 0, minStock: 0, unit: 'boxes', cost: 12, isPackaging: true },
      { id: 'CNS-GLUE', name: 'Glue stick', stock: 2, minStock: 10, unit: 'pcs', cost: 3 },
      { id: 'CNS-SAND', name: 'Sandpaper', stock: 500, minStock: 5, unit: 'sheets', cost: 1 },
    );
    const day = 86400000;
    for (let i = 1; i <= 3; i++) {
      printLog.push({
        id: 'E2E-CR-' + i, client: 'reorder e2e', status: 'completed',
        completedAt: new Date(Date.now() - i * day).toISOString(),
        printTime: 10, materialDeducted: true, packagingDeducted: true, parts: [],
      });
    }
    purchaseOrders.length = 0;
    expenses.length = 0;
    saveAll();
  });

  // ---- the modal, rendered for real ----
  await window.evaluate(() => openReorderSuggestions());
  await window.waitForSelector('.modal', { timeout: 5000 });

  const seen = await window.evaluate(() => {
    const heads = [...document.querySelectorAll('.modal h4')].map((h) => h.textContent.trim());
    const rows = [...document.querySelectorAll('.modal table')].pop();
    return { heads, text: rows ? rows.innerText : '' };
  });
  ok(seen.heads.some((h) => /consumab/i.test(h)), `consumables section rendered (${seen.heads.join('|')})`);
  ok(/Mailer bags/.test(seen.text), 'the empty shelf is listed');
  ok(/Glue stick/.test(seen.text), 'the below-minimum shelf is listed');
  ok(/Isopropyl/.test(seen.text), 'the forecast-to-deplete shelf is listed');
  ok(!/Sandpaper/.test(seen.text), 'a healthy shelf is left off the list');

  // The unit is the shop's own, and no consumable row claims grams.
  ok(/boxes/.test(seen.text), 'the unit "boxes" is shown');
  ok(!/\d+\s*g\b/.test(seen.text), `no consumable quantity claims grams:\n${seen.text}`);

  // ---- click the real button, confirm the real dialog ----
  const btn = await window.$('#reorderDraftPo');
  ok(!!btn, 'the draft-purchase-orders button is present');
  await btn.click();
  await window.waitForSelector('[data-act="ok"]', { timeout: 5000 });
  await window.click('[data-act="ok"]');
  await window.waitForTimeout(400);

  const pos = await window.evaluate(() => purchaseOrders.map((p) => ({
    kind: p.kind, itemId: p.itemId, itemName: p.itemName, qty: p.qty, unit: p.unit, status: p.status,
  })));
  const bagPo = pos.find((p) => p.itemId === 'CNS-BAG');
  const gluePo = pos.find((p) => p.itemId === 'CNS-GLUE');
  ok(pos.length >= 2, `draft POs created (${JSON.stringify(pos)})`);
  ok(gluePo && gluePo.kind === 'consumable', 'the glue PO is marked as a consumable order');
  ok(gluePo && gluePo.itemName === 'Glue stick', `the PO is named, not undefined (${gluePo && gluePo.itemName})`);
  ok(gluePo && gluePo.unit === 'pcs', 'the PO carries the unit');
  ok(gluePo && gluePo.qty === 8, `glue tops up to its minimum: 10 − 2 (${gluePo && gluePo.qty})`);
  ok(!bagPo || bagPo.qty !== 1000, 'no spool-sized default quantity leaked onto a consumable');

  // ---- receive it through the real dialog ----
  // Close the suggestions modal first: its overlay sits over the PO list, so the
  // receive button is in the DOM but not clickable.
  await window.click('.modal [data-act="cancel"]');
  await window.waitForSelector('.modal', { state: 'detached', timeout: 5000 });

  const stockBefore = await window.evaluate(() => consumables.find((c) => c.id === 'CNS-GLUE').stock);
  await window.evaluate(() => {
    const po = purchaseOrders.find((p) => p.itemId === 'CNS-GLUE');
    po.status = 'ordered';
    saveAll(); renderPurchaseOrders();
  });
  await switchTab(window, 'inventory-tab');
  await window.waitForTimeout(200);
  const recvBtn = await window.$(`[data-act="po-receive"]`);
  ok(!!recvBtn, 'the receive button is present on the drafted order');
  await recvBtn.click();
  await window.waitForSelector('#poRecvWeight', { timeout: 5000 });

  const caption = await window.evaluate(() => {
    const lbl = [...document.querySelectorAll('.modal label')].find((l) => /\(/.test(l.textContent));
    return lbl ? lbl.textContent.trim() : '';
  });
  ok(/\(pcs\)/.test(caption), `the dialog asks in the shop's unit (got "${caption}")`);
  // The label must carry ONE unit. `po.weight_received` bakes "(g)" into 8 of the 9
  // locales, so appending to it produced "Weight received (g) (pcs)" — and called a
  // count of boxes a weight.
  ok(!/\(g\)/.test(caption), `no grams caption survives on a consumable: "${caption}"`);
  ok((caption.match(/\(/g) || []).length === 1, `the caption carries exactly one unit: "${caption}"`);

  const asked = await window.evaluate(() => +document.querySelector('#poRecvWeight').value);
  ok(asked === 8, `it offers the outstanding quantity, not 1000 (${asked})`);

  await window.click('.modal [data-act="save"]');
  await window.waitForTimeout(500);

  const after = await window.evaluate(() => ({
    stock: consumables.find((c) => c.id === 'CNS-GLUE').stock,
    spoolTouched: inventory.some((i) => i.id === 'CNS-GLUE'),
    po: purchaseOrders.find((p) => p.itemId === 'CNS-GLUE').status,
    exp: expenses.map((e) => ({ cat: e.category, amt: e.amount })),
  }));
  ok(after.stock === stockBefore + 8, `the CONSUMABLE was restocked ${stockBefore} → ${after.stock}`);
  ok(!after.spoolTouched, 'no spool row was invented for a consumable');
  ok(after.po === 'received', `the order completed rather than sticking at partial (${after.po})`);
  const filamentExp = after.exp.filter((e) => e.cat === 'filament');
  ok(filamentExp.length === 0, `glue is not booked as filament spend: ${JSON.stringify(after.exp)}`);
  ok(after.exp.some((e) => e.cat === 'other' && Math.abs(e.amt - 24) < 0.01),
    `the expense is 8 × 3 = 24 as general spend (${JSON.stringify(after.exp)})`);

  // ---- the filament path through the same dialog, unchanged ----
  // `po.weight_received` already ends in "(g)" in 8 of 9 locales, so the caption
  // must NOT have a unit appended to it here either.
  await window.evaluate(() => {
    const spool = inventory[0];
    purchaseOrders.unshift({
      id: 'PO-FIL-E2E', itemId: spool.id, itemName: spool.material, qty: 1000,
      // `unitCost`, not `unitPrice`: the receipt's expense branch reads unitCost /
      // totalCost, while createPurchaseOrder only ever writes unitPrice. That
      // mismatch predates this change — an auto-drafted filament order books no
      // expense when received — so it is exercised here as it actually behaves,
      // not as it ought to.
      weightOrdered: 1000, unitCost: 85, status: 'ordered', orderedAt: '2026-08-09',
      receivedAt: null, notes: '',
    });
    saveAll(); renderPurchaseOrders();
  });
  const filBefore = await window.evaluate(() => +inventory[0].weight || 0);
  await window.click('[data-act="po-receive"]');
  await window.waitForSelector('#poRecvWeight', { timeout: 5000 });
  const filCaption = await window.evaluate(() => {
    const lbl = [...document.querySelectorAll('.modal label')].find((l) => /\(/.test(l.textContent));
    return lbl ? lbl.textContent.trim() : '';
  });
  ok(/\(g\)/.test(filCaption), `filament still asks in grams (got "${filCaption}")`);
  ok((filCaption.match(/\(/g) || []).length === 1, `the filament caption carries exactly one unit: "${filCaption}"`);
  await window.evaluate(() => { document.querySelector('#poRecvWeight').value = '250'; });
  await window.click('.modal [data-act="save"]');
  await window.waitForTimeout(500);
  const filAfter = await window.evaluate(() => ({
    w: +inventory[0].weight || 0,
    exp: expenses.filter((e) => e.category === 'filament').length,
  }));
  ok(filAfter.w === filBefore + 250, `the spool was restocked ${filBefore} → ${filAfter.w}`);
  ok(filAfter.exp === 1, `filament receipt still books filament spend (${filAfter.exp})`);

  console.log('e2e-consumable-reorder: ok (modal → draft → receive → restock, units and expense intact; filament path unchanged)');
} catch (err) {
  failed = true;
  console.error('e2e-consumable-reorder FAILED:', err && err.message);
} finally {
  await electronApp.close();
  process.exit(failed ? 1 : 0);
}
