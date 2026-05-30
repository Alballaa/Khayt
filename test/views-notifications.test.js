const { test } = require('node:test');
const assert = require('node:assert/strict');

test('getStaleOrders finds printing jobs past stale threshold', () => {
  const old = new Date(Date.now() - 72 * 3600000).toISOString();
  global.settings = { staleHours: { printing: 48 } };
  global.printLog = [{
    id: 'O1',
    status: 'printing',
    printingStartedAt: old,
  }];
  const { getStaleOrders } = require('../renderer/notifications.js');
  assert.equal(getStaleOrders().length, 1);
  assert.equal(getStaleOrders()[0].id, 'O1');
});

test('getPortfolioEntries flattens order photo thumbs', () => {
  global.printLog = [{
    id: 'O1',
    project: 'Widget',
    date: '2026-01-01',
    printPhotos: [{ thumb: 'data:image/png;base64,abc', filename: 'a.png' }],
  }];
  const { getPortfolioEntries } = require('../renderer/views.js');
  const entries = getPortfolioEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].orderId, 'O1');
  assert.equal(entries[0].photoIndex, 0);
});

test('KhaytViews and KhaytNotifications export entry points', () => {
  const views = require('../renderer/views.js');
  const notifications = require('../renderer/notifications.js');
  assert.equal(typeof views.renderScheduleView, 'function');
  assert.equal(typeof views.renderPortfolio, 'function');
  assert.equal(typeof notifications.buildNotifications, 'function');
  assert.equal(typeof notifications.updateTabBadges, 'function');
});
