'use strict';
/**
 * Changing a job's own details, and remembering that it changed.
 *
 * Five fields are recorded in `editHistory` — the due date, the discount, the
 * shipping and the two that carry the priority — because those are the ones a
 * customer can be told a different answer about later. The rule lived inside
 * the order editor's save handler, so anything else that changed a due date
 * changed it silently.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/order-edit.js');

const NOW = Date.parse('2026-09-04T09:15:00.000Z');
const NOW_ISO = new Date(NOW).toISOString();

/* ── The original, copied from renderer/order-flows.js before the move ─────── */
function originalChangedFields(existingOrder, draft) {
  const changedFields = {};
  const checkField = (key, newVal) => {
    const oldVal = existingOrder[key];
    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      changedFields[key] = { from: oldVal, to: newVal };
    }
  };
  checkField('dueDate', draft.dueDate || null);
  checkField('discountPct', draft.discountPct);
  checkField('shippingCost', draft.shippingCost);
  checkField('priority', draft.priority);
  checkField('priorityLevel', draft.priorityLevel);
  return changedFields;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVELS = ['normal', 'high', 'urgent', undefined];
const DATES = ['2026-09-20', '2026-10-01', '', null, undefined];

test('the lifted comparison and the original agree on what changed', () => {
  const rnd = mulberry32(20260904);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < 3000; i++) {
    const order = {
      id: `o${i}`,
      dueDate: pick(DATES),
      discountPct: rnd() < 0.5 ? Math.round(rnd() * 40) : undefined,
      shippingCost: rnd() < 0.5 ? Math.round(rnd() * 200) : undefined,
      priority: rnd() < 0.4,
      priorityLevel: pick(LEVELS),
    };
    const draft = {
      dueDate: pick(DATES),
      discountPct: rnd() < 0.5 ? Math.round(rnd() * 40) : 0,
      shippingCost: rnd() < 0.5 ? Math.round(rnd() * 200) : 0,
      priority: rnd() < 0.4,
      priorityLevel: pick(LEVELS),
    };
    // The renderer passes `dueDate || null`; the module is handed the same.
    const next = Object.assign({}, draft, { dueDate: draft.dueDate || null });
    assert.deepEqual(E.changesBetween(order, next), originalChangedFields(order, draft),
      `diverged for ${JSON.stringify({ order, draft })}`);
  }
});

/* ── The rules that are easy to break and hard to notice ───────────────────── */

test('the priority is two fields and they move together', () => {
  assert.deepEqual(E.priorityFrom('urgent'), { priorityLevel: 'urgent', priority: true });
  assert.deepEqual(E.priorityFrom('high'), { priorityLevel: 'high', priority: true });
  assert.deepEqual(E.priorityFrom('normal'), { priorityLevel: 'normal', priority: false });
  // A job whose urgency nobody can read is not urgent: guessing upward would
  // put it at the top of every queue.
  assert.deepEqual(E.priorityFrom('screaming'), { priorityLevel: 'normal', priority: false });
  assert.deepEqual(E.priorityFrom(undefined), { priorityLevel: 'normal', priority: false });
});

test('an older record with only the boolean still reads as high', () => {
  assert.equal(E.priorityOf({ priority: true }), 'high');
  assert.equal(E.priorityOf({ priority: false }), 'normal');
  assert.equal(E.priorityOf({ priority: true, priorityLevel: 'normal' }), 'normal',
    'an explicit normal beats the legacy flag');
  assert.equal(E.priorityOf({ priorityLevel: 'urgent' }), 'urgent');
  assert.equal(E.priorityOf({}), 'normal');
  assert.equal(E.priorityOf(null), 'normal');
});

test('setting the level sets the flag, whichever way the caller says it', () => {
  const order = { id: 'o1', priority: false, priorityLevel: 'normal' };
  E.applyEdit(order, { priorityLevel: 'urgent' }, { now: NOW, id: 'e1' });
  assert.equal(order.priority, true, 'or the card shows no flag on an urgent job');
  assert.equal(order.priorityLevel, 'urgent');

  E.applyEdit(order, { priorityLevel: 'normal' }, { now: NOW, id: 'e2' });
  assert.equal(order.priority, false);
});

test('a due date can be cleared, because no due date is a real answer', () => {
  const order = { id: 'o1', dueDate: '2026-09-20' };
  const out = E.applyEdit(order, { dueDate: '' }, { now: NOW, id: 'e1' });
  assert.equal(order.dueDate, null);
  assert.deepEqual(out.changes.dueDate, { from: '2026-09-20', to: '' });
});

test('an editor opened and closed again is not an edit', () => {
  const order = { id: 'o1', dueDate: '2026-09-20', priority: false, priorityLevel: 'normal' };
  const out = E.applyEdit(order, { dueDate: '2026-09-20', priorityLevel: 'normal' }, { now: NOW });
  assert.deepEqual(out.changes, {});
  assert.deepEqual(out.effects, [], 'nothing saved, so no revision and no sync');
  assert.equal(order.editHistory, undefined, 'and a history of nothing hides the real ones');
});

test('an edit is written down with what it was and what it became', () => {
  const order = { id: 'o1', dueDate: '2026-09-20', priority: false, priorityLevel: 'normal' };
  E.applyEdit(order, { dueDate: '2026-09-25' }, { now: NOW, id: 'edit-1' });
  assert.equal(order.editHistory.length, 1);
  assert.deepEqual(order.editHistory[0], {
    id: 'edit-1', at: NOW_ISO,
    fields: { dueDate: { from: '2026-09-20', to: '2026-09-25' } },
  });
});

test('a job remembers its last hundred edits and no more', () => {
  const order = {
    id: 'o1', dueDate: '2026-01-01',
    editHistory: Array.from({ length: 100 }, (_, k) => ({ id: `old${k}` })),
  };
  E.applyEdit(order, { dueDate: '2026-02-02' }, { now: NOW, id: 'new' });
  assert.equal(order.editHistory.length, E.EDIT_HISTORY_CAP);
  assert.equal(order.editHistory[0].id, 'old1', 'the oldest falls off');
  assert.equal(order.editHistory[99].id, 'new');
});

test('a field nobody named is left exactly as it was', () => {
  const order = { id: 'o1', dueDate: '2026-09-20', discountPct: 15, shippingCost: 30 };
  E.applyEdit(order, { dueDate: '2026-09-25' }, { now: NOW, id: 'e1' });
  assert.equal(order.discountPct, 15, 'an app that offers two fields must not blank the other three');
  assert.equal(order.shippingCost, 30);
});

test('the same value typed two ways is not a change', () => {
  const order = { id: 'o1', discountPct: 5 };
  assert.deepEqual(E.changesBetween(order, { discountPct: '5' }), {},
    'a number input and a stored number are the same answer');
  const blank = { id: 'o2', dueDate: null };
  assert.deepEqual(E.changesBetween(blank, { dueDate: '' }), {},
    'null, undefined and empty are all "not set"');
});
