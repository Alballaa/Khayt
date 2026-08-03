/**
 * Bed Ready's queue transitions.
 *
 * The bug this replaces was not a crash. `updateStatus` lives in order-flows.js, which is
 * business-only, so bedready-shim.js declared it a no-op to stop a boot-time ReferenceError
 * — and Bed Ready shipped a production queue whose buttons rendered, whose click handler
 * ran, and whose jobs never moved. `function () { return ''; }` is a very quiet failure.
 *
 * So two things are tested here. That the transitions do what a workshop needs — which is
 * ordinary logic — and that the module is loaded in an order where it actually replaces the
 * stub, which is the part that would silently undo all of it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'renderer/bedready-queue.js'), 'utf8');

/** A renderer-ish global scope with only what Bed Ready actually provides. */
function boot({ orders = [], settings = {} } = {}) {
  const calls = { saved: 0, filament: [], packaging: [], activity: [], toasts: [], repaints: 0 };
  const ctx = {
    printLog: orders,
    settings,
    structuredClone: (o) => JSON.parse(JSON.stringify(o)),
    t: (k) => k,
    toast: (msg, kind, ms, opts) => calls.toasts.push({ msg, kind, opts }),
    saveAll: () => { calls.saved += 1; },
    renderKanban: () => { calls.repaints += 1; },
    renderQueueList: () => {},
    deductFilamentForOrder: (o) => calls.filament.push(o.id),
    deductPackagingConsumables: (o) => calls.packaging.push(o.id),
    logActivity: (kind, msg, id) => calls.activity.push({ kind, msg, id }),
    wouldExceedWipLimit: () => false,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, calls, order: orders[0] };
}

const job = (over) => Object.assign({ id: 'J1', status: 'pending', parts: [], statusHistory: [] }, over || {});

test('it replaces the shim no-op rather than sitting beside it', () => {
  // The shim gets there first and assigns only when undefined; this must overwrite.
  const ctx = { updateStatus: function () { return ''; }, printLog: [], settings: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  assert.ok(!/return\s*''/.test(String(ctx.updateStatus)), 'the no-op is still installed');
});

test('a job moves through the queue, and the live timer starts with it', () => {
  const { ctx, order, calls } = boot({ orders: [job()] });
  ctx.updateStatus('J1', 'printing');
  assert.equal(order.status, 'printing');
  assert.ok(order.timerStart, 'kanban draws its timer badge from this, and nothing was setting it');
  assert.ok(order.printingStartedAt);
  assert.equal(calls.saved, 1, 'a move that is not persisted is a move that did not happen');
  assert.ok(calls.repaints > 0, 'and the board has to redraw or the card stays where it was');
});

test('completing deducts the filament the print actually used', () => {
  const { ctx, order, calls } = boot({ orders: [job({ status: 'printing', timerStart: 'x' })] });
  ctx.updateStatus('J1', 'completed');
  assert.equal(order.status, 'completed');
  assert.ok(order.completedAt, 'completedAt is what everything downstream reads');
  assert.ok(!order.timerStart, 'the timer stops when the print does');
  assert.deepEqual(calls.filament, ['J1'], 'finishing a print is the moment the spool is lighter');
  assert.deepEqual(calls.packaging, ['J1']);
});

test('re-opening a finished job clears the completion, not just the column', () => {
  const { ctx, order } = boot({ orders: [job({ status: 'completed', completedAt: '2026-01-01T00:00:00Z' })] });
  ctx.updateStatus('J1', 'pending');
  assert.equal(order.status, 'pending');
  assert.ok(!order.completedAt,
    'a job going round again is not finished; leaving the stamp reports it as done to anything reading completedAt');
});

test('every move is recorded, and the history cannot grow without bound', () => {
  const { ctx, order } = boot({ orders: [job({ statusHistory: new Array(200).fill({ status: 'pending', at: 'x' }) })] });
  ctx.updateStatus('J1', 'printing');
  assert.equal(order.statusHistory.length, 200, 'trimmed, not grown');
  assert.equal(order.statusHistory[199].status, 'printing', 'and the newest move is the one kept');
});

test('a paused shop does not start new prints, but can still finish the ones running', () => {
  const paused = { productionPaused: true };
  const a = boot({ orders: [job()], settings: paused });
  a.ctx.updateStatus('J1', 'printing');
  assert.equal(a.order.status, 'pending', 'a paused shop means it');

  const b = boot({ orders: [job({ status: 'printing' })], settings: paused });
  b.ctx.updateStatus('J1', 'completed');
  assert.equal(b.order.status, 'completed', 'pausing must never strand a job that is already on the bed');
});

test('a hard WIP limit blocks the move; completing is never blocked', () => {
  const over = { wipLimits: { printing: 1 }, wipEnforceHardLimit: true };
  const a = boot({ orders: [job()], settings: over });
  a.ctx.wouldExceedWipLimit = () => true;
  a.ctx.updateStatus('J1', 'printing');
  assert.equal(a.order.status, 'pending', 'the limit should have stopped this');

  const b = boot({ orders: [job({ status: 'qc' })], settings: over });
  b.ctx.wouldExceedWipLimit = () => true;
  b.ctx.updateStatus('J1', 'completed');
  assert.equal(b.order.status, 'completed',
    'the point of a WIP limit is to stop work starting, never to strand what is already done');
});

test('a soft WIP limit warns and lets the move through', () => {
  const { ctx, order, calls } = boot({ orders: [job()], settings: { wipLimits: { printing: 1 } } });
  ctx.wouldExceedWipLimit = () => true;
  ctx.updateStatus('J1', 'printing');
  assert.equal(order.status, 'printing');
  assert.ok(calls.toasts.some((x) => x.kind === 'warning'), 'it should say so, though');
});

test('the move can be undone', () => {
  const { ctx, calls, order } = boot({ orders: [job()] });
  ctx.updateStatus('J1', 'printing');
  const undo = calls.toasts.map((x) => x.opts && x.opts.undo).filter(Boolean)[0];
  assert.ok(undo, 'a status change should be undoable');
  undo();
  assert.equal(ctx.printLog[0].status, 'pending', 'undo should put it back');
  assert.ok(!ctx.printLog[0].timerStart, 'including the timer it started');
});

test('nothing happens for an unknown job, or a move to where it already is', () => {
  const { ctx, calls } = boot({ orders: [job({ status: 'printing' })] });
  ctx.updateStatus('NOPE', 'completed');
  ctx.updateStatus('J1', 'printing');
  assert.equal(calls.saved, 0, 'neither is a change, so neither should write');
});

test('bedready.html loads it after the shim it has to override', () => {
  const html = fs.readFileSync(path.join(ROOT, 'renderer/bedready.html'), 'utf8');
  const shim = html.indexOf('bedready-shim.js');
  const queue = html.indexOf('bedready-queue.js');
  assert.ok(shim !== -1, 'the shim should be loaded');
  assert.ok(queue !== -1, 'bedready-queue.js is not loaded at all — the queue is inert again');
  assert.ok(queue > shim,
    'loaded before the shim, the shim would find updateStatus defined, leave it alone... '
    + 'and this would still work. Loaded after, it overwrites. Either way the ORDER is the '
    + 'contract, so it is pinned rather than left to chance.');
});

test('Khayt does not load it — its own updateStatus is the real one', () => {
  const html = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
  assert.ok(!html.includes('bedready-queue.js'),
    'this would replace order-flows.js updateStatus and silently drop invoicing, loyalty and webhooks');
});
