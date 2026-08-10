/**
 * E2E smoke — what language a customer-facing document actually comes out in.
 *
 * lib/invoice-language.js decides, and its unit tests cover the decision. They
 * cannot cover the part that went wrong: renderInvoice had roughly twenty
 * separate places that emitted a second language — hardcoded Arabic label
 * halves, the shop's own secondary name and address, a Hijri date row — and
 * missing any one of them leaves Arabic on an English quote while every unit
 * test still passes.
 *
 * So this renders the real document in a real window and reads the text back.
 *
 * The case that matters most is ZATCA: Saudi Phase 1 requires Arabic on a tax
 * invoice, so "print one language" must NOT be reachable there, whatever the
 * setting says. That is a compliance guarantee, and it is asserted here against
 * a rendered document rather than against the resolver that decides it.
 *
 * Run: npm run test:e2e:invlang
 */
import { launchApp, dismissWizard, makeUserDataDir } from './e2e/helpers.mjs';

const ok = (c, m) => { if (!c) throw new Error('ASSERT FAILED: ' + m); console.log('  ✓ ' + m); };

const { electronApp, window } = await launchApp(makeUserDataDir());
let failed = false;
try {
  await dismissWizard(window);

  /** Render a quote under one configuration and report what reached the page. */
  const render = (opts) => window.evaluate(async (o) => {
    settings.lang = o.lang;
    settings.enableZatca = o.zatca;
    settings.invoiceBilingual = o.mode;
    // The shipped default, and the reason gating the toggle alone was not enough:
    // stores created before the fix already carry `true`.
    settings.useHijri = true;
    settings.bizEn = 'Erickson 3D Prints';
    settings.bizAr = 'خيط';
    settings.addrEn = 'Columbus, Ohio';
    // The default seed. An English shop never typed this and must never print it.
    settings.addrAr = 'الرياض، المملكة العربية السعودية';
    i18n.set(o.lang, { silent: true });
    clients.length = 0;
    clients.push({ id: 'C1', name: 'Acme Robotics' });
    const order = {
      id: 'Q1', status: 'quote', clientId: 'C1', project: 'Acme Robotics',
      date: '2026-08-10', price: 120, material: 'PLA', printTime: 6,
      parts: [{ name: 'Bracket', material: 'PLA', printTime: 6, printWeight: 210, baseCost: 120 }],
      extraLines: [],
    };
    await renderInvoiceForOrder(order);
    const txt = document.querySelector('#invoice-print-area').innerText;
    return {
      arabic: (txt.match(/[؀-ۿ]/g) || []).length,
      // The English label halves an Arabic document carries when bilingual.
      english: ['Quotation', 'Bill to', 'Total due'].filter((s) => txt.includes(s)).length,
      hijri: /Hijri|هجري/i.test(txt),
      // Proof the document rendered at all, so a blank page cannot pass as "no Arabic".
      rendered: txt.trim().length > 200,
    };
  }, opts);

  // ---- the reported bug: an English shop, English quote ----
  const en = await render({ lang: 'en', zatca: false, mode: 'auto' });
  ok(en.rendered, 'the English quote actually rendered');
  ok(en.arabic === 0, `no Arabic on an English quote (found ${en.arabic} characters)`);
  ok(!en.hijri, 'no Hijri date row on an English quote');

  // ---- the same bug, worse: Arabic was never "the other language" ----
  for (const lang of ['fr', 'de', 'tr']) {
    const r = await render({ lang, zatca: false, mode: 'auto' });
    ok(r.rendered && r.arabic === 0, `no Arabic on a ${lang.toUpperCase()} quote (found ${r.arabic})`);
  }

  // ---- no regression for the shops the document was designed for ----
  const ar = await render({ lang: 'ar', zatca: false, mode: 'auto' });
  ok(ar.rendered && ar.arabic > 0, 'an Arabic shop still gets its Arabic document');
  ok(ar.english === 3, `and keeps the English pairing that serves its overseas customers (${ar.english}/3)`);
  ok(ar.hijri, 'and keeps the Hijri date');

  // ---- opting in ----
  const both = await render({ lang: 'en', zatca: false, mode: 'both' });
  ok(both.arabic > 0, 'an English shop that chooses bilingual gets Arabic back');

  // ---- opting out, from the other side ----
  const arSingle = await render({ lang: 'ar', zatca: false, mode: 'single' });
  ok(arSingle.rendered && arSingle.arabic > 0, 'an Arabic single-language document is still Arabic');
  ok(arSingle.english === 0, `and drops the English half (${arSingle.english} English labels left)`);

  // ---- the compliance guarantee ----
  // Arabic is mandatory on a Saudi tax invoice. Every mode must fail to remove it.
  for (const mode of ['auto', 'both', 'single']) {
    const z = await render({ lang: 'en', zatca: true, mode });
    ok(z.arabic > 0, `ZATCA keeps Arabic on the document with mode="${mode}" (${z.arabic} characters)`);
  }

  console.log('\ninvoice language smoke: all assertions passed');
} catch (err) {
  failed = true;
  console.error('\n' + (err && err.message ? err.message : String(err)));
} finally {
  await electronApp.close();
}
process.exit(failed ? 1 : 0);
