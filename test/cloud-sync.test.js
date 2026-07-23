/**
 * Stage C auto-sync controller (renderer/cloud-sync.js). Drives the controller
 * with injected fake push/pull/snapshot deps (no IPC, no DOM) so the conflict
 * merge, single-flight, and status transitions are deterministic.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

require('../renderer/sync.js');          // defines globalThis.KhaytSync (merge engine)
const sync = require('../renderer/cloud-sync.js'); // defines globalThis.KhaytCloudSync

const clone = (o) => JSON.parse(JSON.stringify(o));

beforeEach(() => sync.stop()); // reset module-level state between tests

function makeDeps(overrides = {}) {
  let state = overrides.initialState || { clients: [{ id: 'c1', name: 'Local', rev: 2, updatedAt: 'a' }], tombstones: [] };
  const calls = { push: 0, pull: 0, saved: 0 };
  const deps = {
    debounceMs: 5,
    appendOnly: overrides.appendOnly || [],
    buildSnapshot: () => clone(state),
    applySnapshot: (s) => { state = clone(s); },
    save: () => { calls.saved++; },
    pull: overrides.pull || (async () => { calls.pull++; return { ok: true, store: null, rev: 0 }; }),
    push: overrides.push || (async () => { calls.push++; return { ok: true, rev: 1 }; }),
  };
  return { deps, calls, getState: () => state };
}

test('happy path: push succeeds → status synced', async () => {
  const { deps } = makeDeps();
  sync.configure(deps);
  const r = await sync.syncNow();
  assert.equal(r.ok, true);
  assert.equal(r.rev, 1);
  assert.equal(sync.status(), 'synced');
});

test('conflict resolves via pull → LWW merge → re-push (server-newer wins, new record added, local-newer kept)', async () => {
  let pushCalls = 0;
  const serverStore = {
    clients: [
      { id: 'c1', name: 'Server', rev: 3, updatedAt: 'b' }, // higher rev than local c1 (rev2) → wins
      { id: 'c2', name: 'NewFromServer', rev: 1, updatedAt: 'b' }, // not local → added
      { id: 'c3', name: 'ServerOld', rev: 1, updatedAt: 'b' }, // lower rev than local c3 → local kept
    ],
    tombstones: [],
  };
  const { deps, calls, getState } = makeDeps({
    initialState: {
      clients: [
        { id: 'c1', name: 'Local', rev: 2, updatedAt: 'a' },
        { id: 'c3', name: 'LocalNew', rev: 5, updatedAt: 'z' },
      ],
      tombstones: [],
    },
    pull: async () => { calls.pull++; return { ok: true, store: clone(serverStore), rev: 9 }; },
    push: async () => { pushCalls++; return pushCalls === 1 ? { conflict: true, rev: 9 } : { ok: true, rev: 10 }; },
  });
  sync.configure(deps);
  const r = await sync.syncNow();

  assert.equal(r.ok, true, 'final push succeeds after merge');
  assert.equal(pushCalls, 2, 'pushed once, hit conflict, pushed again');
  assert.equal(calls.pull, 1, 'pulled once to resolve');
  const st = getState();
  assert.equal(st.clients.find((c) => c.id === 'c1').name, 'Server', 'server rev3 overwrote local rev2');
  assert.ok(st.clients.find((c) => c.id === 'c2'), 'server-only record added');
  assert.equal(st.clients.find((c) => c.id === 'c3').name, 'LocalNew', 'local rev5 kept over server rev1');
});

test('append-only collections are never overwritten on merge', async () => {
  let pushCalls = 0;
  const serverStore = { loyaltyLedger: [{ id: 'L1', pts: 999, rev: 9, updatedAt: 'b' }], tombstones: [] };
  const { deps, getState } = makeDeps({
    appendOnly: ['loyaltyLedger'],
    initialState: { loyaltyLedger: [{ id: 'L1', pts: 10, rev: 1, updatedAt: 'a' }], tombstones: [] },
    pull: async () => ({ ok: true, store: clone(serverStore), rev: 9 }),
    push: async () => { pushCalls++; return pushCalls === 1 ? { conflict: true, rev: 9 } : { ok: true, rev: 10 }; },
  });
  sync.configure(deps);
  await sync.syncNow();
  assert.equal(getState().loyaltyLedger.find((r) => r.id === 'L1').pts, 10, 'existing ledger row not overwritten');
});

test('server tombstone removes a local record on merge', async () => {
  let pushCalls = 0;
  const serverStore = { clients: [], tombstones: [{ id: 'c1', collection: 'clients', deletedAt: 'b' }] };
  const { deps, getState } = makeDeps({
    pull: async () => ({ ok: true, store: clone(serverStore), rev: 9 }),
    push: async () => { pushCalls++; return pushCalls === 1 ? { conflict: true, rev: 9 } : { ok: true, rev: 10 }; },
  });
  sync.configure(deps);
  await sync.syncNow();
  assert.equal(getState().clients.find((c) => c.id === 'c1'), undefined, 'tombstoned record removed locally');
});

test('locked push → status locked, no throw', async () => {
  const { deps } = makeDeps({ push: async () => ({ ok: false, error: 'locked' }) });
  sync.configure(deps);
  const r = await sync.syncNow();
  assert.equal(r.error, 'locked');
  assert.equal(sync.status(), 'locked');
});

test('single-flight: a second syncNow while one is in flight is rejected, then coalesced', async () => {
  let resolvePush;
  const { deps, calls } = makeDeps({ push: () => new Promise((res) => { resolvePush = res; }) });
  sync.configure(deps);
  const p1 = sync.syncNow();                 // starts, awaits push
  const p2 = await sync.syncNow();           // in-flight → rejected
  assert.equal(p2.error, 'in-flight');
  resolvePush({ ok: true, rev: 1 });
  const r1 = await p1;
  assert.equal(r1.ok, true);
});

test('pullMerge with empty server → ok+empty, no apply', async () => {
  const { deps, calls } = makeDeps({ pull: async () => ({ ok: true, store: null, rev: 0 }) });
  sync.configure(deps);
  const r = await sync.pullMerge();
  assert.equal(r.ok, true);
  assert.equal(r.empty, true);
  assert.equal(calls.saved, 0, 'nothing saved when server is empty');
});

test('stop() turns it off; scheduleSync after stop is a no-op', async () => {
  const { deps, calls } = makeDeps();
  sync.configure(deps);
  sync.stop();
  assert.equal(sync.status(), 'off');
  sync.scheduleSync();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.push, 0, 'no push after stop');
});

test('onStatus listener receives transitions', async () => {
  const { deps } = makeDeps();
  const seen = [];
  const off = sync.onStatus((s) => seen.push(s));
  sync.configure(deps);
  await sync.syncNow();
  off();
  assert.ok(seen.includes('syncing'));
  assert.ok(seen.includes('synced'));
});

test('offline failure → status offline + auto-retry that succeeds when back online', async () => {
  let attempts = 0;
  const { deps, calls } = makeDeps({
    push: async () => { attempts++; if (attempts === 1) throw new Error('network down'); return { ok: true, rev: 7 }; },
  });
  deps.retryBaseMs = 10; // fast backoff for the test
  sync.configure(deps);
  const r = await sync.syncNow();
  assert.equal(r.ok, false, 'first push fails offline');
  assert.equal(sync.status(), 'offline');
  // the controller scheduled an automatic retry; wait for it
  await new Promise((res) => setTimeout(res, 40));
  assert.equal(attempts, 2, 'auto-retried after backoff');
  assert.equal(sync.status(), 'synced', 'retry succeeded once connectivity returned');
});

test('flush() retries immediately and resets backoff', async () => {
  let attempts = 0;
  const { deps } = makeDeps({
    push: async () => { attempts++; if (attempts === 1) throw new Error('offline'); return { ok: true, rev: 3 }; },
  });
  deps.retryBaseMs = 60_000; // long, so only an explicit flush would retry in time
  sync.configure(deps);
  await sync.syncNow();
  assert.equal(sync.status(), 'offline');
  const r = await sync.flush(); // e.g. the window 'online' event
  assert.equal(r.ok, true);
  assert.equal(attempts, 2);
  assert.equal(sync.status(), 'synced');
});

test('a fresh edit supersedes the pending retry (no double-push)', async () => {
  let attempts = 0;
  const { deps } = makeDeps({
    push: async () => { attempts++; if (attempts === 1) throw new Error('offline'); return { ok: true, rev: 1 }; },
  });
  deps.retryBaseMs = 10; deps.debounceMs = 5;
  sync.configure(deps);
  await sync.syncNow();          // attempt 1 fails → retry scheduled (~10ms)
  sync.scheduleSync();           // a new edit arrives → supersedes the retry (~5ms)
  await new Promise((res) => setTimeout(res, 40));
  assert.equal(attempts, 2, 'exactly one more push, not two');
  assert.equal(sync.status(), 'synced');
});

test('onConflicts fires when a synced delete discards a local edit', async () => {
  // Local has c1 edited to rev 5. The server's snapshot deleted c1 (tombstone at
  // rev 2). Delete wins — but the host must be told the local edit was dropped.
  let pushCalls = 0;
  const seen = [];
  const serverStore = { clients: [], tombstones: [{ collection: 'clients', id: 'c1', rev: 2 }] };
  const { deps } = makeDeps({
    initialState: { clients: [{ id: 'c1', name: 'Edited Locally', rev: 5, updatedAt: 'z' }], tombstones: [] },
    pull: async () => ({ ok: true, store: clone(serverStore), rev: 9 }),
    push: async () => { pushCalls++; return pushCalls === 1 ? { conflict: true, rev: 9 } : { ok: true, rev: 10 }; },
  });
  deps.onConflicts = (c) => seen.push(...c);
  sync.configure(deps);
  await sync.syncNow();

  const discarded = seen.filter((c) => c.kind === 'delete_over_edit');
  assert.equal(discarded.length, 1, 'the discarded edit was surfaced to the host');
  assert.equal(discarded[0].id, 'c1');
  assert.equal(discarded[0].discarded.name, 'Edited Locally', 'the lost record is handed over');
});

test('onConflicts is not called when a merge discards nothing', async () => {
  let called = false;
  const { deps } = makeDeps({
    pull: async () => ({ ok: true, store: { clients: [{ id: 'c2', name: 'Server', rev: 1 }], tombstones: [] }, rev: 9 }),
    push: async () => ({ ok: true, rev: 1 }),
  });
  deps.onConflicts = () => { called = true; };
  sync.configure(deps);
  await sync.syncNow();
  assert.equal(called, false);
});
