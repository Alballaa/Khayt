const { test } = require('node:test');
const assert = require('node:assert/strict');
const { kanbanUrgencyScore } = require('../renderer/kanban.js');

test('kanbanUrgencyScore ranks overdue before future due dates', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const overdue = kanbanUrgencyScore({ dueDate: fmt(yesterday), printTime: 1 });
  const soon = kanbanUrgencyScore({ dueDate: fmt(tomorrow), printTime: 1 });
  const noDue = kanbanUrgencyScore({ printTime: 5 });

  assert.ok(overdue < soon);
  assert.ok(soon < noDue);
});
