/**
 * The per-branch summary shown in the organisation overview.
 *
 * Pure counting, but two of its decisions are load-bearing and would be easy to
 * "improve" into a wrong number:
 *
 *   - archived orders are excluded, because every active-order view in the app
 *     excludes them. A cross-branch view that counted them would report more work
 *     in flight than the branch's own screen does, and the owner would have no way
 *     to reconcile the two.
 *   - no money, and no calendar days. See the module header for why; these tests
 *     assert the absence, so adding either has to be a deliberate act.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeBranch, totalBranches } = require('../lib/branch-summary.js');

const order = (over) => ({ id: 'o' + Math.random().toString(36).slice(2, 8), status: 'pending', ...over });

test('counts work in flight the way the app defines it', () => {
  const s = summarizeBranch({
    printLog: [
      order({ status: 'pending' }), order({ status: 'printing' }),
      order({ status: 'post' }), order({ status: 'qc' }),
      order({ status: 'quote' }), order({ status: 'on_hold' }),
      order({ status: 'completed' }), order({ status: 'delivered' }),
    ],
  });
  assert.equal(s.inFlight, 4, 'pending + printing + post + qc');
  assert.equal(s.printing, 1);
  assert.equal(s.quotes, 1, 'a quote is not work in flight — nobody has said yes');
  assert.equal(s.onHold, 1, 'nor is one on hold');
  assert.equal(s.done, 2);
  assert.equal(s.orders, 8);
});

test('archived orders are excluded, matching every active-order view in the app', () => {
  const s = summarizeBranch({
    printLog: [order({ status: 'printing' }), order({ status: 'printing', archived: true })],
  });
  assert.equal(s.printing, 1);
  assert.equal(s.orders, 1, 'the archived one is not counted at all');
});

test('last activity is the newest updatedAt, returned raw', () => {
  const s = summarizeBranch({
    printLog: [
      order({ updatedAt: '2026-07-01T10:00:00.000Z' }),
      order({ updatedAt: '2026-07-29T22:00:00.000Z' }),
      order({ updatedAt: '2026-07-15T10:00:00.000Z' }),
    ],
  });
  assert.equal(s.lastActivity, '2026-07-29T22:00:00.000Z');
  // Raw ISO on purpose: the renderer formats it through localeTag(). A calendar
  // day computed here would be the WRONG day for a branch in another timezone.
  assert.match(s.lastActivity, /T\d\d:\d\d/, 'a timestamp, not a date');
});

test('a store with nothing in it is not an error', () => {
  const s = summarizeBranch({ printLog: [], clients: [] });
  assert.equal(s.orders, 0);
  assert.equal(s.inFlight, 0);
  assert.equal(s.lastActivity, null);
  assert.equal(s.unreadable, false);
});

test('junk in, zeros out — never a throw', () => {
  // This runs on data from another machine, decrypted moments earlier. It has to
  // survive anything rather than take the whole overview down with it.
  for (const bad of [null, undefined, 42, 'text', [], { printLog: 'not an array' }]) {
    const s = summarizeBranch(bad);
    assert.equal(typeof s.orders, 'number');
  }
  assert.equal(summarizeBranch(null).unreadable, true);
  assert.equal(summarizeBranch({ printLog: [null, undefined, 7, order({ status: 'printing' })] }).printing, 1);
});

test('the summary carries no money at all', () => {
  // Revenue is not "sum of price" — voids, refunds and credit notes subtract.
  // A chain total computed here would disagree with every branch's own reporting.
  const s = summarizeBranch({ printLog: [order({ price: 5000, status: 'completed' })] });
  const keys = Object.keys(s).join(' ').toLowerCase();
  for (const banned of ['price', 'revenue', 'total', 'paid', 'amount', 'cost']) {
    assert.ok(!keys.includes(banned), `summary must not report ${banned}`);
  }
});

test('totals skip branches that could not be read, and say how many', () => {
  const t = totalBranches([
    { orders: 3, inFlight: 2, printing: 1, onHold: 0, quotes: 1, clients: 5 },
    { orders: 4, inFlight: 1, printing: 1, onHold: 2, quotes: 0, clients: 2 },
    null,                       // a branch whose row carried an error
    { unreadable: true },       // or one the key could not open
  ]);
  assert.equal(t.branches, 4);
  assert.equal(t.reachable, 2, 'so the UI can say the totals leave two out');
  assert.equal(t.inFlight, 3);
  assert.equal(t.printing, 2);
  assert.equal(t.onHold, 2);
  assert.equal(t.clients, 7);
});

test('totals do not invent a chain-wide last activity', () => {
  // "The chain last did something at X" is a fact about ONE branch wearing a
  // costume. Deliberately absent.
  const t = totalBranches([{ orders: 1, lastActivity: '2026-07-29T22:00:00.000Z' }]);
  assert.equal(t.lastActivity, undefined);
});
