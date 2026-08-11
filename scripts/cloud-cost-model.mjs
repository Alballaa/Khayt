#!/usr/bin/env node
/**
 * What one shop costs Khayt Cloud per month, and how many fit on a plan.
 *
 * KHAYT-3.0-CLOUD-INFRA-SPEC §10 gives a cost envelope for a Node + Postgres +
 * Redis stack. Production does not run that — it is PHP 8.3 + MySQL on shared
 * hosting — so that envelope cannot price anything. This model replaces it with
 * measured numbers.
 *
 * The per-record constants below were MEASURED from a real store, not estimated:
 *
 *     collection      count     bytes   bytes/record
 *     printLog           19     29591           1557
 *     printFiles         11      7241            658
 *     inventory           3       332            111
 *     settings (fixed)          4877
 *
 * Two properties of the sync protocol turn those into the real cost, and both
 * are visible in lib/cloud-backend.js:
 *
 *   1. It is BLOB-FIRST. push() encrypts and sends the WHOLE store every time,
 *      so bandwidth is store size × how often the shop saves — not the size of
 *      what changed. A shop that edits often pays for its whole history on every
 *      edit.
 *   2. There is NO COMPRESSION, and the ciphertext is base64 in a JSON body, so
 *      the wire cost is about 4/3 of the plaintext. Measured on the same store:
 *      55,593 B plaintext → 74,124 B on the wire, where gzip would have sent
 *      7,556 B.
 *
 * Shared hosting is a flat fee with capped resources, so "cost per shop" is not
 * a bill — it is the plan price divided by how many shops fit before the
 * binding resource runs out. That is the number this prints.
 *
 * Usage:
 *   node scripts/cloud-cost-model.mjs
 *   node scripts/cloud-cost-model.mjs --plan-price 25 --bandwidth-gb 500 --storage-gb 100
 */

// ── measured constants ──────────────────────────────────────────────────────
const BYTES = {
  settingsFixed: 4877,
  perOrder: 1557,
  perPrintFile: 658,
  perInventoryItem: 111,
  perClient: 200,      // not in the sampled store; conservative, small either way
};
/** base64 of ciphertext inside a JSON body. Measured: 74124 / 55593 = 1.333. */
const WIRE_OVERHEAD = 4 / 3;
/** Measured gzip ratio on a real store — what compression WOULD save. */
const GZIP_RATIO = 0.136;

// ── shop profiles ───────────────────────────────────────────────────────────
// `savesPerDay` is the one number here that is judgement rather than measurement,
// and it is also the one the answer is most sensitive to — hence --saves and the
// sensitivity table at the end. A save is any change that survives the 2.5s
// debounce in renderer/cloud-sync.js: adding an order, moving a kanban card,
// receiving stock, editing a quote.
const PROFILES = [
  { name: 'Hobbyist',   ordersPerMonth: 5,   savesPerDay: 5,   years: 2, files: 20,  inventory: 10 },
  { name: 'Side shop',  ordersPerMonth: 40,  savesPerDay: 30,  years: 2, files: 150, inventory: 30 },
  { name: 'Busy shop',  ordersPerMonth: 250, savesPerDay: 150, years: 2, files: 600, inventory: 80 },
  { name: 'Small farm', ordersPerMonth: 800, savesPerDay: 400, years: 2, files: 2000, inventory: 200 },
];

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};

// Plan shape. Defaults are placeholders, NOT a quote — pass the real ones.
const PLAN = {
  price: arg('--plan-price', 25),
  bandwidthGb: arg('--bandwidth-gb', 500),
  storageGb: arg('--storage-gb', 100),
  currency: 'USD',
};

const fmtBytes = (b) => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB'
  : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB'
  : (b / 1e3).toFixed(0) + ' KB';

function modelShop(p) {
  const orders = p.ordersPerMonth * 12 * p.years;
  const storeBytes = BYTES.settingsFixed
    + orders * BYTES.perOrder
    + p.files * BYTES.perPrintFile
    + p.inventory * BYTES.perInventoryItem
    + Math.round(orders * 0.3) * BYTES.perClient;
  // Every save pushes the whole store; a pull costs the same again on a device
  // that has fallen behind, but the common case is push-only.
  const perPush = storeBytes * WIRE_OVERHEAD;
  const monthlyBandwidth = perPush * p.savesPerDay * 30;
  return { ...p, orders, storeBytes, perPush, monthlyBandwidth,
    gzipMonthly: monthlyBandwidth * GZIP_RATIO };
}

console.log('Khayt Cloud — measured cost model');
console.log('Plan assumed: ' + PLAN.price + ' ' + PLAN.currency + '/mo · '
  + PLAN.bandwidthGb + ' GB bandwidth · ' + PLAN.storageGb + ' GB storage\n');

const rows = PROFILES.map(modelShop);
console.log(
  'profile'.padEnd(12), 'orders'.padStart(7), 'store'.padStart(9),
  'per push'.padStart(9), 'bw/month'.padStart(10), 'gzipped'.padStart(9),
);
for (const r of rows) {
  console.log(
    r.name.padEnd(12), String(r.orders).padStart(7), fmtBytes(r.storeBytes).padStart(9),
    fmtBytes(r.perPush).padStart(9), fmtBytes(r.monthlyBandwidth).padStart(10),
    fmtBytes(r.gzipMonthly).padStart(9),
  );
}

console.log('\nHow many shops fit on one plan, and what that makes a shop cost:\n');
console.log('profile'.padEnd(12), 'by bandwidth'.padStart(13), 'by storage'.padStart(11),
  'binding'.padStart(10), 'cost/shop'.padStart(10));
for (const r of rows) {
  const byBw = Math.floor((PLAN.bandwidthGb * 1e9) / r.monthlyBandwidth);
  const bySt = Math.floor((PLAN.storageGb * 1e9) / r.storeBytes);
  const fits = Math.max(1, Math.min(byBw, bySt));
  const binding = byBw <= bySt ? 'bandwidth' : 'storage';
  console.log(
    r.name.padEnd(12), String(byBw).padStart(13), String(bySt).padStart(11),
    binding.padStart(10), (PLAN.price / fits).toFixed(2).padStart(10),
  );
}

console.log('\nSensitivity — the model turns on saves/day, so vary only that (Busy shop):\n');
const busy = PROFILES.find((p) => p.name === 'Busy shop');
console.log('saves/day'.padStart(9), 'bw/month'.padStart(10), 'shops/plan'.padStart(11), 'cost/shop'.padStart(10));
for (const saves of [25, 50, 100, 150, 300, 600]) {
  const r = modelShop({ ...busy, savesPerDay: saves });
  const fits = Math.max(1, Math.floor((PLAN.bandwidthGb * 1e9) / r.monthlyBandwidth));
  console.log(String(saves).padStart(9), fmtBytes(r.monthlyBandwidth).padStart(10),
    String(fits).padStart(11), (PLAN.price / fits).toFixed(2).padStart(10));
}

const busyRow = rows.find((r) => r.name === 'Busy shop');
console.log('\nWhat two cheap changes would do to the binding resource:\n');
console.log('  gzip before encrypting :', fmtBytes(busyRow.monthlyBandwidth), '→',
  fmtBytes(busyRow.gzipMonthly), `(${Math.round(1 / GZIP_RATIO)}× less)`);
console.log('  entity deltas instead  : bandwidth stops scaling with store SIZE at all —');
console.log('                           a shop pays for what changed, not its whole history.');
console.log('\nNumbers are per shop per month. Plan figures are inputs: pass --plan-price,');
console.log('--bandwidth-gb and --storage-gb from the real Hostinger plan to get real answers.');
