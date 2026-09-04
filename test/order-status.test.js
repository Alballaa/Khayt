'use strict';
/**
 * What happens to a job when its stage changes.
 *
 * These rules were lifted out of `renderer/order-flows.js` so the Mac app can
 * move a job by the same rules the renderer moves it by, instead of inventing
 * a second answer to "is this job finished".
 *
 * The danger in moving code like this is not a crash. It is a job that stops
 * deducting its filament, or a due date that quietly stops being extended, and
 * nobody noticing until a quarter's margins are wrong. So the first test runs
 * the ORIGINAL `updateStatus` — copied out of order-flows.js before the move —
 * and the extracted module over a few thousand generated transitions, and
 * compares the resulting order field by field AND the exact sequence of side
 * effects each one asked for.
 *
 * The original is verbatim except for the clock: `Date.now()` and
 * `new Date().toISOString()` are frozen, because two implementations cannot be
 * compared while time passes between them.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../lib/assembly.js');
const S = require('../lib/order-status.js');

const NOW_MS = Date.parse('2026-09-04T09:15:00.000Z');
const NOW_ISO = new Date(NOW_MS).toISOString();

/* ── The original, copied from renderer/order-flows.js before the move ────────
   Globals become `g`; every UI and side-effect call records itself instead of
   happening. `promptActuals` takes the confirm path — whether to ask is the
   caller's decision, not one of the rules being compared. */
function originalUpdateStatus(g, id, newStatus) {
  const { printLog, settings, inventory, calls, notices } = g;
  const toast = (msg) => calls.push(`toast:${msg}`);
  const t = (k) => k;
  const saveAll = () => calls.push('saveAll');
  const renderKanban = () => calls.push('render:kanban');
  const renderLogs = () => calls.push('render:logs');
  const renderAnalytics = () => calls.push('render:analytics');
  const renderDashboard = () => calls.push('render:dashboard');
  const logActivity = (kind, text) => calls.push(`logActivity:${text}`);
  const deductFilamentForOrder = () => calls.push('deductFilamentForOrder');
  const deductPackagingConsumables = () => calls.push('deductPackagingConsumables');
  const autoExportStatusPage = () => calls.push('autoExportStatusPage');
  const autoSendEmailNotification = (o, s) => calls.push(`email:${s}`);
  const sendTelegramForOrder = (o, s) => calls.push(`telegram:${s}`);
  const fireWebhook = (ev, p) => calls.push(`webhook:${ev}${p.newStatus ? ':' + p.newStatus : ''}`);
  const fireOrderWebhook = (ev) => calls.push(`orderWebhook:${ev}`);
  const republishPortalIfPublished = () => calls.push('republishPortal');
  // The tier is READ twice by the original (once before the mutation, once
  // after the save) and reported once by the lifted version. Comparing two
  // reads against one report says nothing, so the tier is left out of the
  // sequence and covered by its own test below.
  const getClientTier = () => null;
  const localName = () => '';
  const clients = [];
  const wouldExceedWipLimit = S.wouldExceedWipLimit;
  const localDateStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const promptActuals = (order, onConfirm) => { onConfirm(); };
  const KhaytAssembly = globalThis.KhaytAssembly;

  function fireOrderCompletionEvents(order) {
    fireWebhook('status_changed', { orderId: order.id, project: order.project, newStatus: 'completed', client: order.client });
    fireOrderWebhook('status', order);
    fireWebhook('order_delivered', { orderId: order.id, project: order.project, client: order.client });
    if (!order.surveyToken) {
      order.surveyToken = 'srv-TOKEN';
      calls.push('surveyToken');
      saveAll();
    }
  }

  function resumeFromHold(order, prevStatus, newStatus) {
    if (prevStatus === 'on_hold' && newStatus !== 'on_hold') {
      if (newStatus !== 'completed' && newStatus !== 'delivered' && order.dueDate && order.heldAt) {
        const holdDays = Math.ceil((NOW_MS - new Date(order.heldAt).getTime()) / 86400000);
        if (holdDays > 0) {
          const d = new Date(order.dueDate + 'T00:00:00');
          d.setDate(d.getDate() + holdDays);
          order.dueDate = localDateStr(d);
          notices.push({ code: 'due_extended', params: { days: holdDays, date: order.dueDate } });
        }
      }
      delete order.holdReason;
      delete order.heldAt;
    } else if (newStatus === 'pending' && order.holdReason !== undefined) {
      delete order.holdReason;
      delete order.heldAt;
    }
  }

  const order = printLog.find(o => o.id === id);
  if (!order) return;
  const prevStatus = order.status;
  if (settings.productionPaused && newStatus === 'printing') {
    calls.push('BLOCKED:prod.paused_block');
    return;
  }
  if (newStatus !== 'completed' && wouldExceedWipLimit(printLog, id, newStatus, settings.wipLimits)) {
    if (settings.wipEnforceHardLimit) {
      calls.push('BLOCKED:wip.limit_blocked');
      return;
    }
    calls.push('WARN:wip.limit_reached');
  }
  if (newStatus === 'completed' && typeof KhaytAssembly !== 'undefined' && KhaytAssembly.isAssembly(order)) {
    const gate = KhaytAssembly.canCompleteAssembly(order);
    if (!gate.ok) {
      calls.push(gate.reason === 'not_assembled' ? 'BLOCKED:asm.gate_not_assembled' : 'BLOCKED:asm.gate_parts');
      return;
    }
  }
  if (newStatus === 'completed') {
    promptActuals(order, () => {
      const prevTier = order.clientId ? getClientTier(order.clientId) : null;
      resumeFromHold(order, prevStatus, 'completed');
      if (!order.statusHistory) order.statusHistory = [];
      order.statusHistory.push({ status: 'completed', at: NOW_ISO });
      if (order.statusHistory.length > 200) order.statusHistory = order.statusHistory.slice(-200);
      order.status = 'completed';
      if (!order.completedAt) order.completedAt = NOW_ISO;
      deductFilamentForOrder(order);
      if (!order.costBasis) {
        order.costBasis = (order.parts || []).reduce((s, p) => s + (+p.baseCost || 0), 0);
      }
      deductPackagingConsumables(order);
      saveAll();
      const newTier = order.clientId ? getClientTier(order.clientId) : null;
      if (newTier && (!prevTier || prevTier.name !== newTier.name)) {
        toast('cl.new_tier');
      }
      renderKanban(); renderLogs(); renderAnalytics(); renderDashboard();
      toast('toast.status_updated');
      if (order.clientId) autoExportStatusPage(order);
      sendTelegramForOrder(order, 'completed');
      fireOrderCompletionEvents(order);
      republishPortalIfPublished(order.id);
    });
    return;
  }
  order.status = newStatus;
  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({ status: newStatus, at: NOW_ISO });
  if (order.statusHistory.length > 200) order.statusHistory = order.statusHistory.slice(-200);
  logActivity('status', `${order.id} → ${newStatus}`, order.id);
  if ((prevStatus === 'completed' || prevStatus === 'delivered') &&
      newStatus !== 'completed' && newStatus !== 'delivered') {
    delete order.completedAt;
    delete order.materialDeducted;
    delete order.printingStartedAt;
  }
  if (newStatus === 'post') {
    const invItem = inventory.find(i => i.id === order.filamentId || (order.parts || []).some(p => p.filamentId === i.id));
    if (invItem && invItem.materialType === 'resin') {
      order.isResin = true;
      if (!order.resinPost) {
        order.resinPost = { washDurationMins: null, washIpaVolumeMl: null, cureDurationMins: null, curePowerW: null, inspectionNotes: '', completedAt: null };
      }
    }
  }
  if (newStatus === 'printing') {
    order.timerStart = NOW_ISO;
    if (!order.printingStartedAt) order.printingStartedAt = NOW_ISO;
  } else if (order.timerStart) {
    delete order.timerStart;
    delete order.timerPausedAt;
    delete order.timerPausedMs;
  }
  resumeFromHold(order, prevStatus, newStatus);
  saveAll();
  renderKanban(); renderLogs(); renderAnalytics();
  toast('toast.status_updated:undo');
  if (order.clientId) autoExportStatusPage(order);
  autoSendEmailNotification(order, newStatus);
  sendTelegramForOrder(order, newStatus);
  fireWebhook('status_changed', { orderId: order.id, project: order.project, newStatus, client: order.client });
  fireOrderWebhook('status', order);
  republishPortalIfPublished(order.id);
}

/* ── The extracted module, driven the way a host drives it ─────────────────── */
function liftedUpdateStatus(g, id, newStatus) {
  const { printLog, settings, inventory, calls, notices } = g;
  const order = printLog.find(o => o.id === id);
  if (!order) return;

  const decision = S.gate(order, newStatus, { orders: printLog, settings });
  if (decision.warn) calls.push(`WARN:wip.limit_${decision.warn.code === 'wip_reached' ? 'reached' : '?'}`);
  if (!decision.ok) {
    const map = {
      production_paused: 'BLOCKED:prod.paused_block',
      wip_blocked: 'BLOCKED:wip.limit_blocked',
      assembly_not_assembled: 'BLOCKED:asm.gate_not_assembled',
      assembly_parts: 'BLOCKED:asm.gate_parts',
    };
    calls.push(map[decision.block.code]);
    return;
  }

  const out = S.apply(order, newStatus, { now: NOW_MS, inventory });
  for (const n of out.notices) notices.push(n);
  for (const e of out.effects) {
    switch (e.type) {
      case 'activity_log': calls.push(`logActivity:${e.text}`); break;
      case 'tier_check': break; // left out of the sequence on purpose — see above
      case 'deduct_filament': calls.push('deductFilamentForOrder'); break;
      case 'deduct_packaging': calls.push('deductPackagingConsumables'); break;
      case 'save': calls.push('saveAll'); break;
      case 'render':
        calls.push('render:kanban'); calls.push('render:logs'); calls.push('render:analytics');
        if (e.dashboard) calls.push('render:dashboard');
        break;
      case 'toast_updated': calls.push('toast:toast.status_updated'); break;
      case 'toast_updated_undoable': calls.push('toast:toast.status_updated:undo'); break;
      case 'export_status_page': calls.push('autoExportStatusPage'); break;
      case 'email': calls.push(`email:${e.status}`); break;
      case 'telegram': calls.push(`telegram:${e.status}`); break;
      case 'webhook': calls.push(`webhook:${e.event}${e.newStatus ? ':' + e.newStatus : ''}`); break;
      case 'order_webhook': calls.push(`orderWebhook:${e.event}`); break;
      case 'ensure_survey_token':
        order.surveyToken = 'srv-TOKEN'; calls.push('surveyToken'); calls.push('saveAll'); break;
      case 'republish_portal': calls.push('republishPortal'); break;
      default: throw new Error(`unknown effect ${e.type}`);
    }
  }
}

/* ── Generated orders ──────────────────────────────────────────────────────── */
const STATUSES = ['quote', 'pending', 'printing', 'post', 'qc', 'on_hold', 'completed', 'delivered', 'cancelled'];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeOrder(rnd, i) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const maybe = (p) => rnd() < p;
  const o = {
    id: `o${i}`,
    project: `Job ${i}`,
    client: 'Acme',
    status: pick(STATUSES),
    parts: Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, k) => ({
      id: `p${k}`, name: `part ${k}`, qty: 1 + Math.floor(rnd() * 3),
      baseCost: Math.round(rnd() * 5000) / 100,
      filamentId: maybe(0.6) ? pick(['f1', 'f2', 'f3']) : null,
    })),
  };
  if (maybe(0.7)) o.clientId = `c${Math.floor(rnd() * 5)}`;
  if (maybe(0.7)) o.dueDate = `2026-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`;
  if (maybe(0.5)) o.filamentId = pick(['f1', 'f2', 'f3']);
  if (o.status === 'on_hold' || maybe(0.2)) {
    o.holdReason = maybe(0.5) ? 'waiting on filament' : null;
    o.heldAt = new Date(NOW_MS - Math.floor(rnd() * 20) * 86400000).toISOString();
  }
  if (o.status === 'completed' || o.status === 'delivered') {
    o.completedAt = new Date(NOW_MS - 86400000).toISOString();
    if (maybe(0.8)) o.materialDeducted = true;
    if (maybe(0.8)) o.printingStartedAt = new Date(NOW_MS - 3 * 86400000).toISOString();
    if (maybe(0.5)) o.costBasis = Math.round(rnd() * 20000) / 100;
  }
  if (o.status === 'printing') {
    o.timerStart = new Date(NOW_MS - 3600000).toISOString();
    if (maybe(0.4)) o.timerPausedAt = new Date(NOW_MS - 1800000).toISOString();
    if (maybe(0.4)) o.timerPausedMs = Math.floor(rnd() * 100000);
  }
  if (maybe(0.15)) o.surveyToken = 'srv-existing';
  if (maybe(0.2)) {
    o.statusHistory = Array.from({ length: 195 + Math.floor(rnd() * 10) }, (_, k) => ({
      status: 'pending', at: new Date(NOW_MS - k * 60000).toISOString(),
    }));
  }
  if (maybe(0.25)) {
    // A true BOM assembly: bought-in components alongside the printed parts.
    // The completion gate reads `parts[].partStatus` and `assembledAt`, so vary
    // both — an assembly that passes the gate is as important to compare as one
    // that does not.
    o.components = [{ id: 'k1', name: 'body', qty: 1 }, { id: 'k2', name: 'lid', qty: 1 }];
    const roll = rnd();
    for (const p of o.parts) p.partStatus = roll < 0.6 ? 'qc_pass' : pick(['pending', 'printed', 'qc_fail']);
    if (roll < 0.35) o.assembledAt = new Date(NOW_MS - 3600000).toISOString();
  }
  return o;
}

const INVENTORY = [
  { id: 'f1', material: 'PLA', materialType: 'filament', weight: 900 },
  { id: 'f2', material: 'Resin', materialType: 'resin', weight: 500 },
  { id: 'f3', material: 'PETG', materialType: 'filament', weight: 300 },
];

const SETTINGS_VARIANTS = [
  {},
  { productionPaused: true },
  { wipLimits: { printing: 2, post: 1 }, wipEnforceHardLimit: false },
  { wipLimits: { printing: 2, post: 1 }, wipEnforceHardLimit: true },
  { productionPaused: true, wipLimits: { post: 1 }, wipEnforceHardLimit: true },
];

test('the lifted rules and the originals agree on every transition', () => {
  const rnd = mulberry32(20260904);
  let compared = 0;
  for (let seed = 0; seed < 60; seed++) {
    const base = Array.from({ length: 8 }, (_, i) => makeOrder(rnd, i));
    for (const settings of SETTINGS_VARIANTS) {
      for (const o of base) {
        for (const target of STATUSES) {
          const a = {
            printLog: JSON.parse(JSON.stringify(base)), settings, inventory: INVENTORY,
            calls: [], notices: [],
          };
          const b = {
            printLog: JSON.parse(JSON.stringify(base)), settings, inventory: INVENTORY,
            calls: [], notices: [],
          };
          originalUpdateStatus(a, o.id, target);
          liftedUpdateStatus(b, o.id, target);
          const label = `${o.id} ${o.status} → ${target} / ${JSON.stringify(settings)}`;
          assert.deepEqual(b.printLog, a.printLog, `order state diverged: ${label}`);
          assert.deepEqual(b.calls, a.calls, `effects diverged: ${label}`);
          assert.deepEqual(b.notices, a.notices, `notices diverged: ${label}`);
          compared++;
        }
      }
    }
  }
  assert.ok(compared > 15000, `expected thousands of transitions, compared ${compared}`);
});

/* ── The rules that are easy to break and hard to notice ───────────────────── */

test('a job held for nine days has its due date pushed out by nine', () => {
  const order = {
    id: 'o1', status: 'on_hold', dueDate: '2026-09-20',
    heldAt: new Date(NOW_MS - 9 * 86400000).toISOString(), holdReason: 'no filament',
  };
  const out = S.apply(order, 'printing', { now: NOW_MS });
  assert.equal(order.dueDate, '2026-09-29');
  assert.equal(order.holdReason, undefined);
  assert.equal(order.heldAt, undefined);
  assert.deepEqual(out.notices, [{ code: 'due_extended', params: { days: 9, date: '2026-09-29' } }]);
});

test('a job completed straight out of hold keeps its due date but loses the hold', () => {
  const order = {
    id: 'o1', status: 'on_hold', dueDate: '2026-09-20',
    heldAt: new Date(NOW_MS - 9 * 86400000).toISOString(), holdReason: 'no filament',
  };
  const out = S.apply(order, 'completed', { now: NOW_MS });
  assert.equal(order.dueDate, '2026-09-20', 'a finished job needs no new due date');
  assert.equal(order.holdReason, undefined, 'the hold must not outlive the job');
  assert.equal(order.heldAt, undefined);
  assert.deepEqual(out.notices, []);
});

test('re-opening a finished job clears what would make the reprint free', () => {
  const order = {
    id: 'o1', status: 'completed', completedAt: NOW_ISO,
    materialDeducted: true, printingStartedAt: '2026-09-01T00:00:00.000Z',
  };
  S.apply(order, 'printing', { now: NOW_MS });
  assert.equal(order.completedAt, undefined);
  assert.equal(order.materialDeducted, undefined, 'else the reprint consumes no filament');
  assert.equal(order.printingStartedAt, NOW_ISO, 'the new run starts now');
});

test('the cost basis is fixed once and never rewritten', () => {
  const order = { id: 'o1', status: 'qc', parts: [{ baseCost: 10 }, { baseCost: 5.5 }] };
  S.apply(order, 'completed', { now: NOW_MS });
  assert.equal(order.costBasis, 15.5);
  order.status = 'qc';
  order.parts = [{ baseCost: 999 }];
  S.apply(order, 'completed', { now: NOW_MS });
  assert.equal(order.costBasis, 15.5, "last year's margins are not recomputed at today's prices");
});

test('history is capped at two hundred moves', () => {
  const order = {
    id: 'o1', status: 'pending',
    statusHistory: Array.from({ length: 200 }, (_, k) => ({ status: 'pending', at: `t${k}` })),
  };
  S.apply(order, 'printing', { now: NOW_MS });
  assert.equal(order.statusHistory.length, S.HISTORY_CAP);
  assert.equal(order.statusHistory[0].at, 't1', 'the oldest move is the one that falls off');
  assert.equal(order.statusHistory[199].status, 'printing');
});

test('a paused shop refuses to start a print and nothing else', () => {
  const settings = { productionPaused: true };
  const order = { id: 'o1', status: 'pending' };
  assert.equal(S.gate(order, 'printing', { settings, orders: [order] }).ok, false);
  assert.equal(S.gate(order, 'completed', { settings, orders: [order] }).ok, true);
  assert.equal(S.gate(order, 'delivered', { settings, orders: [order] }).ok, true);
});

test('a full column warns when soft and refuses when hard', () => {
  const orders = [
    { id: 'a', status: 'printing' }, { id: 'b', status: 'printing' }, { id: 'c', status: 'pending' },
  ];
  const soft = S.gate(orders[2], 'printing', { orders, settings: { wipLimits: { printing: 2 } } });
  assert.equal(soft.ok, true);
  assert.deepEqual(soft.warn, { code: 'wip_reached', params: { col: 'printing', n: 2 } });

  const hard = S.gate(orders[2], 'printing', {
    orders, settings: { wipLimits: { printing: 2 }, wipEnforceHardLimit: true },
  });
  assert.equal(hard.ok, false);
  assert.equal(hard.block.code, 'wip_blocked');
});

test('a finished column is never full — a limit stops work starting, not finishing', () => {
  const orders = [
    { id: 'a', status: 'completed' }, { id: 'b', status: 'completed' }, { id: 'c', status: 'qc' },
  ];
  const settings = { wipLimits: { completed: 1, delivered: 1 }, wipEnforceHardLimit: true };
  assert.equal(S.gate(orders[2], 'completed', { orders, settings }).ok, true);
  assert.equal(S.gate(orders[2], 'delivered', { orders, settings }).ok, true);
});

test('an unfinished assembly cannot be completed', () => {
  const order = {
    id: 'o1', status: 'qc',
    components: [{ id: 'k1', name: 'bracket' }],
    parts: [{ name: 'body', partStatus: 'qc_pass' }, { name: 'lid', partStatus: 'printed' }],
  };
  const waiting = S.gate(order, 'completed', { orders: [order], settings: {} });
  assert.equal(waiting.ok, false);
  assert.equal(waiting.block.code, 'assembly_parts');
  assert.ok(waiting.block.params.parts.includes('lid'), 'say which part is holding it up');

  order.parts[1].partStatus = 'qc_pass';
  const unassembled = S.gate(order, 'completed', { orders: [order], settings: {} });
  assert.equal(unassembled.block.code, 'assembly_not_assembled', 'passing QC is not being assembled');

  order.assembledAt = NOW_ISO;
  assert.equal(S.gate(order, 'completed', { orders: [order], settings: {} }).ok, true);

  const plain = { id: 'o2', status: 'qc', parts: [{ name: 'body', partStatus: 'pending' }] };
  assert.equal(S.gate(plain, 'completed', { orders: [plain], settings: {} }).ok, true,
    'an order with no components[] is not an assembly and is not gated');
});

test('the completion webhooks are asked for once, and only when there is no token yet', () => {
  const fresh = { id: 'o1', status: 'qc', clientId: 'c1' };
  const effects = S.apply(fresh, 'completed', { now: NOW_MS }).effects;
  const wired = effects.map(e => `${e.type}${e.event ? ':' + e.event : ''}`);
  assert.equal(wired.filter(x => x === 'webhook:order_delivered').length, 1);
  assert.ok(wired.includes('ensure_survey_token'));

  const known = { id: 'o2', status: 'qc', surveyToken: 'srv-already' };
  const t2 = S.apply(known, 'completed', { now: NOW_MS }).effects.map(e => e.type);
  assert.ok(!t2.includes('ensure_survey_token'), 'a token is minted once per job');
});

test('a completion asks for no email and a plain move does', () => {
  const done = S.apply({ id: 'o1', status: 'qc' }, 'completed', { now: NOW_MS });
  assert.ok(!done.effects.some(e => e.type === 'email'));
  const moved = S.apply({ id: 'o2', status: 'pending' }, 'printing', { now: NOW_MS });
  assert.deepEqual(moved.effects.filter(e => e.type === 'email'), [{ type: 'email', status: 'printing' }]);
});

test('a resin job entering post gets somewhere to record the wash and cure', () => {
  const order = { id: 'o1', status: 'printing', filamentId: 'f2' };
  S.apply(order, 'post', { now: NOW_MS, inventory: INVENTORY });
  assert.equal(order.isResin, true);
  assert.equal(order.resinPost.washDurationMins, null);

  const pla = { id: 'o2', status: 'printing', filamentId: 'f1' };
  S.apply(pla, 'post', { now: NOW_MS, inventory: INVENTORY });
  assert.equal(pla.isResin, undefined);
  assert.equal(pla.resinPost, undefined);
});

test('the timer stops the moment the job stops printing', () => {
  const order = {
    id: 'o1', status: 'printing',
    timerStart: '2026-09-04T08:00:00.000Z', timerPausedAt: '2026-09-04T08:30:00.000Z', timerPausedMs: 900000,
    printingStartedAt: '2026-09-03T00:00:00.000Z',
  };
  S.apply(order, 'qc', { now: NOW_MS });
  assert.equal(order.timerStart, undefined);
  assert.equal(order.timerPausedAt, undefined);
  assert.equal(order.timerPausedMs, undefined);
  assert.equal(order.printingStartedAt, '2026-09-03T00:00:00.000Z', 'the first start survives');
});

test('a survey token is minted in the format both apps read', () => {
  const token = S.makeSurveyToken(new Uint8Array([0, 15, 255, 1]));
  assert.equal(token, 'srv-000fff01');
});

test('a customer is checked for a new tier, and a walk-in is not', () => {
  const known = S.apply({ id: 'o1', status: 'qc', clientId: 'c1' }, 'completed', { now: NOW_MS });
  assert.ok(known.effects.some(e => e.type === 'tier_check'));

  const walkIn = S.apply({ id: 'o2', status: 'qc' }, 'completed', { now: NOW_MS });
  assert.ok(!walkIn.effects.some(e => e.type === 'tier_check'), 'no customer, no tier');
  assert.ok(!walkIn.effects.some(e => e.type === 'export_status_page'),
    'and nobody to publish a status page for');
});
