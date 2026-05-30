const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_SHIFT_CHECKLIST,
  getShiftChecklistItems,
  summarizeShiftChecks,
  canStartShift,
} = require('../lib/shift-checklist');

test('getShiftChecklistItems returns defaults when unset', () => {
  const items = getShiftChecklistItems({});
  assert.equal(items.length, DEFAULT_SHIFT_CHECKLIST.length);
});

test('getShiftChecklistItems uses custom settings list', () => {
  const items = getShiftChecklistItems({
    shiftChecklistItems: [{ id: 'x1', label: 'Custom step' }],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'Custom step');
});

test('canStartShift respects require-all flag', () => {
  const items = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  assert.equal(canStartShift(items, ['a'], false), true);
  assert.equal(canStartShift(items, ['a'], true), false);
  assert.equal(canStartShift(items, ['a', 'b'], true), true);
});

test('summarizeShiftChecks counts checked items', () => {
  const summary = summarizeShiftChecks(
    [{ id: 'a' }, { id: 'b' }],
    ['a']
  );
  assert.equal(summary.checked, 1);
  assert.equal(summary.total, 2);
  assert.equal(summary.allComplete, false);
});
