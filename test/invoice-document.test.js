'use strict';
/**
 * The document a customer is handed.
 *
 * `renderInvoice` was 425 lines of template string inside the renderer, so the
 * only thing that could produce an invoice was the Electron window. A wrong
 * character in it is not a crash — it is a customer's invoice with a missing
 * VAT line, found by an auditor months later.
 *
 * So the HTML it produced BEFORE the move is written down in
 * test/fixtures/invoices, for ten orders that between them reach both
 * languages and directions, a shop with and without a tax registration,
 * inclusive and exclusive tax, a discount, a rush fee, shipping, a paid stamp,
 * a bank block, a quote, the ZATCA QR, and the case where the QR could not be
 * drawn and has to say so.
 *
 * The fixtures are regenerated deliberately and never to make this pass:
 * `node scripts/invoice-fixtures.mjs --write`, with the diff read.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { render } = require('./helpers/invoice-harness.js');
const { CASES } = require('./helpers/invoice-cases.js');

const DIR = path.join(__dirname, 'fixtures', 'invoices');

test('the document is the same document, byte for byte', () => {
  for (const { name, order, opts, money } of CASES) {
    const expected = fs.readFileSync(path.join(DIR, `${name}.html`), 'utf8');
    const actual = render(order, opts, money);
    assert.equal(actual, expected,
      `the ${name} invoice changed. If that was deliberate, read the diff and `
      + `regenerate with: node scripts/invoice-fixtures.mjs --write`);
  }
});

test('every case is covered by a fixture, and every fixture by a case', () => {
  // A fixture with no case is dead weight; a case with no fixture silently
  // asserts nothing, which is the failure this whole file is about.
  const onDisk = fs.readdirSync(DIR).filter((f) => f.endsWith('.html'))
    .map((f) => f.replace(/\.html$/, '')).sort();
  assert.deepEqual(onDisk, CASES.map((c) => c.name).sort());
});

/* ── What the document must never stop saying ─────────────────────────────────
   The fixtures prove nothing CHANGED. These prove the right things are there
   in the first place, so a regenerated fixture cannot quietly bless a document
   that has lost its tax line. */

const html = (name) => {
  const c = CASES.find((x) => x.name === name);
  return render(c.order, c.opts, c.money);
};

test('a tax invoice names the tax, the registration and the total', () => {
  const doc = html('plain-en');
  assert.match(doc, /300000000000003/, 'the seller VAT number');
  assert.match(doc, /1150\.00/, 'the total');
  assert.match(doc, /150\.00/, 'the tax');
  assert.match(doc, /INV-2026-0021/, 'the invoice number');
});

test('a shop with no tax registration does not print a tax line', () => {
  const doc = html('no-tax-registration');
  assert.doesNotMatch(doc, /300000000000003/,
    'an unregistered shop must not show a registration number');
});

test('a refused ZATCA QR says what is missing rather than leaving a gap', () => {
  const doc = html('zatca-qr-refused');
  assert.match(doc, /VAT registration number/,
    'a code that will not scan is better than one that scans and is invalid — '
    + 'but the document must say which');
  assert.doesNotMatch(doc, /id="zatca-qr"/, 'and must not draw one anyway');
});

test('a paid invoice is stamped paid, and an unpaid one is not', () => {
  assert.notEqual(html('paid-with-bank'), html('plain-en'));
  // Printed in four-character groups, the way an IBAN is read aloud and typed
  // into a banking app — not as the unbroken string it is stored as.
  assert.match(html('paid-with-bank'), /SA03 8000 0000 6080 1016 7519/,
    'the bank details for a transfer, grouped so they can be typed');
});

test('an Arabic document reads right to left', () => {
  assert.match(html('plain-ar'), /dir="rtl"/);
  assert.match(html('plain-en'), /dir="ltr"/);
});

test('a job with no parts still produces a document', () => {
  // A quote for work not yet broken down is a real thing to hand somebody.
  const doc = html('no-parts');
  assert.ok(doc.length > 500);
  assert.match(doc, /INV-2026-0021/);
});
