const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  applyQuoteApprovalToStore,
  isQuoteExpired,
  renderLanQuoteApprovalPage,
} = require('../lib/lan-quote-page');

test('applyQuoteApprovalToStore moves quote to pending', () => {
  const store = {
    printLog: [{ id: 'Q-1', status: 'quote', project: 'Widget', price: 100 }],
  };
  const result = applyQuoteApprovalToStore(store, 'Q-1');
  assert.equal(result.error, undefined);
  assert.equal(result.order.status, 'pending');
  assert.ok(result.order.clientApprovedAt);
  assert.ok(result.order.quoteAcceptedAt);
  assert.equal(store.printLog[0].status, 'pending');
});

test('applyQuoteApprovalToStore accepts on_hold with hasQuote', () => {
  const store = {
    printLog: [{ id: 'Q-2', status: 'on_hold', hasQuote: true, price: 50 }],
  };
  const result = applyQuoteApprovalToStore(store, 'Q-2');
  assert.equal(result.order.status, 'pending');
});

test('applyQuoteApprovalToStore rejects non-quote status', () => {
  const store = {
    printLog: [{ id: 'Q-3', status: 'pending', price: 50 }],
  };
  const result = applyQuoteApprovalToStore(store, 'Q-3');
  assert.equal(result.error, 'cannot_approve');
});

test('applyQuoteApprovalToStore returns null for missing order', () => {
  const store = { printLog: [] };
  assert.equal(applyQuoteApprovalToStore(store, 'missing'), null);
});

test('isQuoteExpired compares quoteExpiresAt to today', () => {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(isQuoteExpired({ quoteExpiresAt: yesterday }), true);
  assert.equal(isQuoteExpired({ quoteExpiresAt: today }), false);
  assert.equal(isQuoteExpired({}), false);
});

test('renderLanQuoteApprovalPage includes approve button when actionable', () => {
  const html = renderLanQuoteApprovalPage({
    order: { id: 'Q-9', project: 'Test', price: 10, parts: [] },
    shopName: 'Shop',
    approvePath: '/order/Q-9/approve',
  });
  assert.match(html, /Approve Quote/);
  assert.match(html, /Q-9/);
});

test('renderLanQuoteApprovalPage shows expired message', () => {
  const html = renderLanQuoteApprovalPage({
    order: { id: 'Q-10', project: 'Test', price: 10 },
    shopName: 'Shop',
    approvePath: '/order/Q-10/approve',
    expired: true,
  });
  assert.match(html, /expired/i);
  assert.doesNotMatch(html, /id="approveBtn"/);
});
