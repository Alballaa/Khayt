/**
 * The quote approval page must not name a currency it does not know.
 *
 * This page is where a CUSTOMER agrees to a price. It used to default the unit to
 * 'SAR' in two places — the caller in lib/lan-server.js and the parameter default
 * here — and Khayt ships a flavour (Bed Ready) whose default currency is USD. A
 * shop whose store carried no `settings.currency` therefore showed "100 SAR" for a
 * $100 quote: understating it roughly 3.75x, to the one person who cannot check.
 *
 * Reachable because the LAN server reads the store straight off disk, with no
 * defaultSettings() merge behind it — unlike the renderer, where settings.currency
 * is always present, which is why the two dozen `settings.currency || 'SAR'`
 * fallbacks over there are unreachable and were left alone.
 *
 * Reproduced against the real server before the fix: the page rendered
 * `100 SAR`. After: `100`.
 *
 * A missing unit is ambiguous. A wrong one is a lie with a number attached.
 *
 * ONE MUTANT SURVIVES, AND SHOULD.
 *
 * Restoring the unconditional space — `${price} ${esc(currencyLabel)}` — is not
 * caught, and chasing it would be over-fitting. lanEscapeHtml is `String(s ?? '')`,
 * so an absent label renders a trailing space and nothing else; "100 " and "100"
 * are the same to every reader. The conditional is tidiness. The two mutations
 * that matter — either default coming back — are both killed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderLanQuoteApprovalPage } = require('../lib/lan-quote-page.js');

const order = { id: 'Q1', project: 'bracket', price: 100, quoteApprovalToken: 'tok', parts: [] };
const page = (over = {}) => renderLanQuoteApprovalPage({
  order, shopName: 'A Shop', approvePath: '/order/Q1/approve', approvalToken: 'tok', ...over,
});

/** The total cell, which is the only place money is shown. */
const totalCell = (html) => {
  const m = html.match(/class="total-row"><td>Total<\/td><td[^>]*>([^<]*)</);
  assert.ok(m, 'could not find the total row — this test is blind, fix the extraction');
  return m[1].trim();
};

test('an unknown currency shows the number with no unit', () => {
  assert.equal(totalCell(page()), '100');
  assert.equal(totalCell(page({ currencyLabel: '' })), '100');
  assert.equal(totalCell(page({ currencyLabel: null })), '100');
  assert.equal(totalCell(page({ currencyLabel: undefined })), '100');
});

test('a known currency is shown', () => {
  assert.equal(totalCell(page({ currencyLabel: 'SAR' })), '100 SAR');
  assert.equal(totalCell(page({ currencyLabel: 'USD' })), '100 USD');
  assert.equal(totalCell(page({ currencyLabel: 'EUR' })), '100 EUR');
});

test('the page never invents SAR on its own', () => {
  // The specific regression: no code path may put SAR on a page whose caller did
  // not ask for it. Checked across the WHOLE page, not just the total, since the
  // unit could reappear in a summary line later.
  for (const label of [undefined, '', null, 'USD']) {
    const html = page({ currencyLabel: label });
    assert.ok(!/\bSAR\b/.test(html), `currencyLabel=${String(label)} produced SAR somewhere on the page`);
  }
});

test('the caller passes the shop currency through without a default', () => {
  // The other half of the fix lives in lib/lan-server.js. A default restored
  // there would put SAR back on the page with this file unchanged, so the guard
  // has to look at both.
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'lan-server.js'), 'utf8');
  const m = src.match(/currencyLabel:\s*([^\n,]+)/);
  assert.ok(m, 'lan-server no longer passes currencyLabel — check this still applies');
  assert.ok(!/'SAR'|"SAR"/.test(m[1]),
    `lan-server defaults the currency to SAR again: ${m[1].trim()}`);
});

test('a currency label is escaped, not interpolated raw', () => {
  const html = page({ currencyLabel: '<script>x</script>' });
  assert.ok(!html.includes('<script>x</script>'), 'the label must be escaped');
});
