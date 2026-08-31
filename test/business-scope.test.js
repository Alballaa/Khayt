/**
 * Prints that happened, but were not business.
 *
 * Asked for directly: "is there an option to select a print as not applicable
 * for the business?" There was not. A workshop prints calibration cubes, gifts
 * and brackets for its own shelf, and counting them as trade makes a shop's own
 * numbers lie to it — an average order value diluted by a run of free test
 * prints is worse than no average at all.
 *
 * The scope was chosen rather than assumed: out of money and trade counts, IN
 * for nozzle wear and for machine capacity. A personal print wears a nozzle
 * exactly as much as a paid one and occupies the bed exactly as long.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../lib/business-scope.js');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

test('an ordinary order counts, a marked one does not', () => {
  assert.equal(B.countsForBusiness({ id: 'O1' }), true);
  assert.equal(B.countsForBusiness({ id: 'O1', nonBusiness: true }), false);
  // Every order in every existing store predates this flag.
  assert.equal(B.countsForBusiness({ id: 'O1', nonBusiness: false }), true);
  assert.equal(B.countsForBusiness(null), false, 'nothing is not an order');
});

test('marking stores absence, never false', () => {
  /* An absent key must mean one thing rather than two: every order written
   * before this existed has no key at all. */
  const o = { id: 'O1' };
  B.setNonBusiness(o, true);
  assert.equal(o.nonBusiness, true);
  B.setNonBusiness(o, false);
  assert.equal('nonBusiness' in o, false, 'unmarking removes the key rather than writing false');
});

test('the trade subset drops exactly the marked ones', () => {
  const orders = [{ id: 'a' }, { id: 'b', nonBusiness: true }, { id: 'c' }];
  assert.deepEqual(B.businessOrders(orders).map((o) => o.id), ['a', 'c']);
  assert.deepEqual(B.businessOrders(null), []);
});

/* ── where the flag is actually applied ──────────────────────────────────── */

test('revenue is gated at the one chokepoint, not at 53 call sites', () => {
  const src = fs.readFileSync(path.join(ROOT, 'renderer', 'currency.js'), 'utf8');
  const fn = src.slice(src.indexOf('function orderNetRevenueBase'), src.indexOf('function refreshCurrencyLabels'));
  assert.match(fn, /countsForBusiness/,
    'orderNetRevenueBase is the single revenue chokepoint — gating here covers every report at once');
  // And nothing is owed on a print that was never sold.
  assert.match(src.slice(src.indexOf('function orderOwedBase')), /countsForBusiness/);
});

test('an order document still shows its own price', () => {
  /* The chokepoint is stats-only. An invoice, a statement and a work order read
   * `price` directly, so marking a print must not rewrite a document for the one
   * order that might still carry a figure. */
  for (const f of ['invoicing.js', 'order-flows.js', 'app-exports.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'renderer', f), 'utf8');
    assert.equal(/orderNetRevenueBase\s*\(/.test(src), false,
      `${f} renders an order's own document and must not go through the stats chokepoint`);
  }
});

test('every trade-set filter in the reports applies it', () => {
  /* `status === 'completed' && !o.voidedAt` IS the trade set — thirteen of them
   * in analytics.js. One left unpatched is a report that silently disagrees with
   * the other twelve, which is worse than not having the flag. */
  const src = fs.readFileSync(path.join(ROOT, 'renderer', 'analytics.js'), 'utf8');
  const tradeSets = src.match(/o\.status === 'completed' && !o\.voidedAt(?! && _countsForBusiness)/g) || [];
  assert.deepEqual(tradeSets, [],
    'a completed-order filter that does not check countsForBusiness reports personal prints as turnover');
  assert.ok((src.match(/_countsForBusiness\(o\)/g) || []).length >= 13);
});

test('nozzle wear and capacity are deliberately NOT gated', () => {
  // The print happened. The nozzle does not know who it was for, and the bed was
  // occupied either way — the two things this flag must never touch.
  for (const f of ['nozzle-wear.js', 'lead-time-publish.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'lib', f), 'utf8');
    assert.equal(/countsForBusiness/.test(src), false,
      `${f} must keep counting a print the shop marked as its own`);
  }
});

test('the editor can set it, and the module is loaded to do so', () => {
  const of = fs.readFileSync(path.join(ROOT, 'renderer', 'order-flows.js'), 'utf8');
  assert.match(of, /data-f="nonBusiness"/, 'the order editor needs a control');
  assert.match(of, /nbEl\.checked/, 'a checkbox is `checked`, not `value` — a generic handler cannot clear it');
  assert.match(of, /KhaytBusinessScope\.setNonBusiness\(order/, 'and the save has to commit it');
  for (const page of ['index.html', 'bedready.html']) {
    const src = fs.readFileSync(path.join(ROOT, 'renderer', page), 'utf8');
    assert.match(src, /business-scope\.js/, `${page} must load the module it calls`);
  }
});

test('the on-time delivery rate counts only promises to customers', () => {
  /* Every other completed-order filter that reports on trade excludes voided
   * orders. renderSLASection silently did not, so a CANCELLED job counted for or
   * against the shop's delivery record — and it counted prints the shop marked
   * as its own, which are a promise to nobody.
   *
   * Missed by the earlier pass because that matched the one-line idiom and this
   * filter is spread over four lines. Found by sweeping every
   * `status === 'completed'` in the file instead.
   */
  const src = fs.readFileSync(path.join(ROOT, 'renderer', 'analytics.js'), 'utf8');
  const at = src.indexOf('function renderSLASection');
  assert.ok(at > -1);
  const filter = src.slice(at, src.indexOf('if (completed.length === 0)', at));
  assert.match(filter, /!o\.voidedAt/, 'a cancelled order is not a delivery promise');
  assert.match(filter, /_countsForBusiness\(o\)/, 'and a calibration cube is not one either');
});
