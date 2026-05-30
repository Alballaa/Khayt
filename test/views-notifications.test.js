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

test('buildNotifications surfaces overdue orders and low stock', () => {
  global.settings = { dismissedNotifs: {}, lowStockThreshold: 200, staleHours: { pending: 72 } };
  global.printLog = [{
    id: 'O-overdue',
    project: 'Late job',
    dueDate: '2020-01-01',
    status: 'pending',
    date: '2020-01-01',
  }];
  global.inventory = [{ id: 'S1', material: 'PLA', weight: 50, reorderPoint: 200 }];
  global.machines = [];
  global.consumables = [];
  global.clients = [];
  global.escapeHtml = (s) => String(s ?? '');
  global.t = (k) => k;
  global.switchTab = () => {};
  global.machineServiceStatus = () => ({ due: false, warning: false });
  global.localName = () => '';

  const { buildNotifications } = require('../renderer/notifications.js');
  const types = buildNotifications().map((a) => a.type);
  assert.ok(types.includes('overdue'));
  assert.ok(types.includes('stock'));
});

test('buildNotifications respects dismissed alert keys', () => {
  global.settings = {
    dismissedNotifs: { 'overdue:O1': 'forever' },
    lowStockThreshold: 200,
    staleHours: {},
  };
  global.printLog = [{ id: 'O1', project: 'X', dueDate: '2020-01-01', status: 'pending' }];
  global.inventory = [];
  global.machines = [];
  global.consumables = [];
  global.clients = [];
  global.escapeHtml = (s) => String(s ?? '');
  global.t = (k) => k;
  global.switchTab = () => {};
  global.machineServiceStatus = () => ({ due: false, warning: false });
  global.localName = () => '';

  const { buildNotifications } = require('../renderer/notifications.js');
  assert.equal(buildNotifications().some((a) => a.key === 'overdue:O1'), false);
});
