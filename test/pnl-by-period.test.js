/**
 * `pnlByPeriod` is renderer/analytics.js's quarterly P&L, lifted.
 *
 * THE PROOF: the original's aggregation — the whole of `renderPnLSection` down
 * to where it starts writing HTML — is copied below VERBATIM, given the same
 * globals it read (`printLog`, `expenses`, `settings`, `KhaytTax`,
 * `orderNetRevenueBase`, `convertToBase`, `orderCurrency`) with its clock
 * frozen, and both are run over thousands of generated books. Every figure the
 * table prints is compared: orders, revenue, expenses, the overhead charged to
 * the period, VAT collected, and net.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../lib/business-scope.js');
const money = require('../lib/order-money.js');
const KhaytTax = require('../lib/tax.js');
const { CURRENCIES } = require('../lib/currencies.js');
const { pnlByPeriod } = require('../lib/pnl-report.js');

const ORIGINAL = `
function renderPnLSection() {
  const el = $('#pnlSection');
  if (!el) return;

  // Group completed orders by YYYY-Q (quarter)
  const qMap = {};
  for (const o of printLog) {
      // Voiding keeps status 'completed' by design (invoicing.js) and only sets
      // voidedAt, so a status-only filter books a cancelled invoice as full
      // revenue AND full VAT collected.
    if (o.status !== 'completed' || o.voidedAt) continue;
    const d = new Date((o.date || '') + 'T00:00:00');
    if (isNaN(d)) continue;
    const q = Math.ceil((d.getMonth() + 1) / 3);
    const key = \`\${d.getFullYear()}-Q\${q}\`;
    if (!qMap[key]) qMap[key] = { revenue: 0, shipping: 0, vatCollected: 0, orders: 0 };
    qMap[key].revenue += orderNetRevenueBase(o);
    qMap[key].shipping += convertToBase(+o.shippingCost || 0, orderCurrency(o));
    qMap[key].orders++;
    // NB: orderNetRevenueBase is net of CREDIT NOTES, not net of tax — it is
    // still a gross figure. The old line extracted tax out of it, which is right
    // only when prices include tax. computeTax().taxTotal is right either way:
    // it extracts under inclusive pricing and adds under exclusive.
    qMap[key].vatCollected += KhaytTax.computeTax(
      orderNetRevenueBase(o), KhaytTax.profileFromSettings(settings)).taxTotal;
  }
  const expQ = {};
  for (const e of expenses) {
    const d = new Date((e.date || '') + 'T00:00:00');
    if (isNaN(d)) continue;
    const q = Math.ceil((d.getMonth() + 1) / 3);
    const key = \`\${d.getFullYear()}-Q\${q}\`;
    expQ[key] = (expQ[key] || 0) + (+e.amount || 0);
  }

  // Aggregate fixedCosts per quarter (assume monthly recurring → multiply by 3)
  const fixedCostPerMonth = (settings.fixedCosts || []).reduce((s, fc) => s + (+fc.amount || 0), 0);
  const fixedCostPerQ = fixedCostPerMonth * 3;

  const allKeys = [...new Set([...Object.keys(qMap), ...Object.keys(expQ)])].sort().reverse();
  if (allKeys.length === 0) { el.innerHTML = \`<p style="color:var(--text-muted);font-size:13px;">\${escapeHtml(t('an.pnl_empty'))}</p>\`; return; }

  const hasFixed = fixedCostPerQ > 0;
  const nowQ = (() => { const d = new Date(); const q = Math.ceil((d.getMonth() + 1) / 3); return \`\${d.getFullYear()}-Q\${q}\`; })();
  // Fraction of the current quarter elapsed, so the in-progress period is comparable.
  const nowQuarterFraction = (() => {
    const d = new Date();
    const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
    const start = new Date(d.getFullYear(), qStartMonth, 1);
    const end = new Date(d.getFullYear(), qStartMonth + 3, 0);
    const total = Math.round((end - start) / 86400000) + 1;
    const done = Math.round((d - start) / 86400000) + 1;
    return Math.max(0, Math.min(1, done / total));
  })();

  return { qMap, expQ, allKeys, fixedCostPerQ, nowQ, nowQuarterFraction };
}
return renderPnLSection;`;

/** The original's aggregation, with its clock frozen and its globals supplied. */
function runOriginal(orders, expenses, settings, clients, now) {
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  }
  const ctx = { settings, clients };
  const scope = {
    Date: FrozenDate,
    $: () => ({}),                       // the element exists; nothing is written to it
    printLog: orders,
    expenses,
    settings,
    KhaytTax,
    escapeHtml: (x) => String(x),
    t: (k) => k,
    orderNetRevenueBase: (o) => money.orderNetRevenueBase(o, ctx, CURRENCIES),
    convertToBase: (a, c) => money.convertToBase(a, c, ctx),
    orderCurrency: (o) => money.orderCurrency(o, ctx, CURRENCIES),
  };
  return new Function(...Object.keys(scope), ORIGINAL)(...Object.values(scope))();
}

/** The original's own arithmetic for one period, from what it aggregated.
 *  Undefined when it returned early — its "nothing to show" path. */
function originalRows(out) {
  if (!out) return [];
  return out.allKeys.map((k) => {
    const fixed = (k === out.nowQ) ? out.fixedCostPerQ * out.nowQuarterFraction : out.fixedCostPerQ;
    const revenue = out.qMap[k]?.revenue || 0;
    const exp = out.expQ[k] || 0;
    return {
      period: k,
      orders: out.qMap[k]?.orders || 0,
      revenue,
      shipping: out.qMap[k]?.shipping || 0,
      expenses: exp,
      fixed,
      vatCollected: out.qMap[k]?.vatCollected || 0,
      net: revenue - exp - fixed,
    };
  });
}

const round2 = (n) => Math.round((+n || 0) * 100) / 100;

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const day = (r) => {
  const y = 2024 + Math.floor(r() * 3), m = 1 + Math.floor(r() * 12), d = 1 + Math.floor(r() * 28);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

function someBook(r) {
  const orders = [];
  for (let i = 0; i < 1 + Math.floor(r() * 12); i++) {
    const o = {
      id: 'O' + i,
      date: pick(r, [day(r), '', 'not a date']),
      status: pick(r, ['completed', 'completed', 'completed', 'pending', 'printing']),
      price: pick(r, [0, 120, 999.5, 4000]),
    };
    if (r() < 0.2) o.voidedAt = day(r);
    if (r() < 0.3) o.creditNotes = [{ amount: pick(r, [50, 200]) }];
    if (r() < 0.3) o.shippingCost = pick(r, [0, 35]);
    if (r() < 0.3) o.currency = pick(r, ['USD', 'EUR', 'SAR']);
    if (r() < 0.2) o.clientId = 'C1';
    orders.push(o);
  }
  const expenses = [];
  for (let i = 0; i < Math.floor(r() * 8); i++) {
    expenses.push({ date: pick(r, [day(r), '', 'x']), amount: pick(r, [0, 90, 610, '250']) });
  }
  const settings = {
    currency: 'SAR',
    enableVat: r() < 0.7,
    vatRate: pick(r, [0, 5, 15]),
    exchangeRates: pick(r, [{}, { USD: 3.75, EUR: 4.1 }]),
    fixedCosts: pick(r, [[], [{ amount: 100 }], [{ amount: 40 }, { amount: 60 }]]),
  };
  if (r() < 0.3) settings.tax = { country: 'US', name: 'Sales Tax', mode: 'exclusive', registration: 'EIN',
                                  rates: [{ id: 's', label: 'Sales Tax', percent: 8.875 }] };
  const clients = [{ id: 'C1', currency: pick(r, ['USD', 'SAR']) }];
  return { orders, expenses, settings, clients };
}

test('the module and the original agree, every figure, over 2000 generated books', () => {
  const r = rng(20260906);
  for (let i = 0; i < 2000; i++) {
    const { orders, expenses, settings, clients } = someBook(r);
    const now = new Date(2024 + Math.floor(r() * 3), Math.floor(r() * 12), 1 + Math.floor(r() * 28));
    const theirs = originalRows(runOriginal(orders, expenses, settings, clients, now));
    const ours = pnlByPeriod(orders, expenses, { settings, clients, currencies: CURRENCIES, now });
    assert.equal(ours.length, theirs.length, `case ${i}: row count`);
    for (let j = 0; j < ours.length; j++) {
      for (const field of ['period', 'orders']) {
        assert.equal(ours[j][field], theirs[j][field], `case ${i} row ${j} ${field}`);
      }
      for (const field of ['revenue', 'shipping', 'expenses', 'fixed', 'vatCollected', 'net']) {
        // The module rounds to the cent where the original handed raw floats
        // to fmtMoney; comparing at that precision is comparing what is printed.
        assert.equal(ours[j][field], round2(theirs[j][field]), `case ${i} row ${j} ${field}`);
      }
    }
  }
});

test('a voided invoice is not revenue, and not VAT collected either', () => {
  const settings = { currency: 'SAR', enableVat: true, vatRate: 15 };
  const rows = pnlByPeriod([
    { id: 'A', status: 'completed', date: '2026-08-10', price: 1000 },
    { id: 'B', status: 'completed', date: '2026-08-11', price: 5000, voidedAt: '2026-08-12' },
  ], [], { settings, now: new Date(2026, 8, 4) });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].orders, 1, 'the voided one is not counted at all');
  assert.equal(rows[0].revenue, 1000);
  assert.equal(rows[0].vatCollected, 130.43, 'nor is its VAT');
});

test('the overhead is charged to every quarter, and pro-rated for the one in progress', () => {
  const settings = { currency: 'SAR', fixedCosts: [{ amount: 100 }] };
  const rows = pnlByPeriod([
    { id: 'A', status: 'completed', date: '2026-08-10', price: 1000 },
    { id: 'B', status: 'completed', date: '2026-04-02', price: 1000 },
  ], [], { settings, now: new Date(2026, 8, 4) });   // 4 Sep — 66 of Q3's 92 days
  const [q3, q2] = rows;
  assert.equal(q2.fixed, 300, 'a finished quarter carries three months of it');
  assert.ok(q3.fixed > 200 && q3.fixed < 240,
    `the quarter in progress is pro-rated, not charged the lot on day three (got ${q3.fixed})`);
});

test('a book with nothing in it has no rows, rather than a row of zeros', () => {
  assert.deepEqual(pnlByPeriod([], [], { settings: {}, now: new Date() }), []);
  assert.deepEqual(pnlByPeriod([{ status: 'pending', date: '2026-08-01', price: 90 }], [],
                               { settings: {}, now: new Date() }), []);
});

test('the renderer builds no P&L of its own any more', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'analytics.js'), 'utf8');
  const at = src.indexOf('function renderPnLSection(');
  assert.notEqual(at, -1, 'renderPnLSection has been renamed — update this test');
  const body = src.slice(at, src.indexOf('\n}\n', at));
  assert.match(body, /\.pnlByPeriod\(/, 'the table must come from the shared rule');
  assert.doesNotMatch(body, /nowQuarterFraction|fixedCostPerQ|qMap/,
    'and the renderer must not keep its own aggregation, or the two apps drift');
});
