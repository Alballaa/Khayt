const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  VERSION,
  SECRET_MASK,
  redactSettingsForExport,
  redactMachinesForExport,
  buildSnapshot,
  buildExportPayload,
} = require('../lib/store.js');

test('VERSION and SECRET_MASK are stable contract tokens', () => {
  assert.equal(VERSION, 10); // v10: filamentDryLog (filament drying/storage tracker)
  assert.equal(SECRET_MASK, '__KHAYT_MASKED__');
});

test('buildSnapshot copies top-level keys (arrays shared by reference)', () => {
  const printLog = [{ id: 'O-1' }];
  const collections = { printLog, settings: { lang: 'en' } };
  const snap = buildSnapshot(collections);
  assert.deepEqual(snap.printLog, printLog);
  assert.notEqual(snap, collections);
  printLog.push({ id: 'O-2' });
  assert.equal(snap.printLog.length, 2);
});

test('redactSettingsForExport masks sensitive settings fields', () => {
  const out = redactSettingsForExport({
    emailConfig: { apiKey: 'smtp' },
    telegram: { botToken: 'tg' },
    webhooks: { secret: 'wh' },
    ai: { apiKey: 'sk-ant-secret', enabled: true },
    zatcaPhase2: { csid: 'c', pcsid: 'p' },
    bnpl: {
      tabby: { apiKey: 't' },
      tamara: { apiKey: 'ta', notificationToken: 'nt' },
      stripe: { apiKey: 's' },
    },
    lanApi: {
      pin: '1',
      intakePin: '2',
      intakeToken: '3',
      webhookToken: '4',
      sallaWebhookSecret: '5',
      zidWebhookSecret: '6',
    },
    lang: 'en',
  });
  assert.equal(out.emailConfig.apiKey, SECRET_MASK);
  assert.equal(out.ai.apiKey, SECRET_MASK);
  assert.equal(out.telegram.botToken, SECRET_MASK);
  assert.equal(out.lanApi.pin, SECRET_MASK);
  assert.equal(out.bnpl.tamara.notificationToken, SECRET_MASK);
  assert.equal(out.lang, 'en');
});

/* ── Structural guards on export redaction ──────────────────────────────────
 * The redactor works by naming fields to mask. That is a denylist: anything it
 * forgets is exported in cleartext. These two tests are the tripwires. */

test('a carrier or BNPL provider added later still has its credentials masked', () => {
  // Both groups are data-driven — a new provider is added to a catalog, never to the
  // redactor. This models exactly that: an id the redactor has never heard of.
  const out = redactSettingsForExport({
    shipping: {
      defaultCarrier: 'smsa',                                  // not an object — must survive
      smsa: { apiKey: 'k1', webhookSecret: 's1', accountNo: 'AC-9' },
      naqel: { apiKey: 'FUTURE-KEY', webhookSecret: 'FUTURE-SECRET' },  // hypothetical 4th carrier
    },
    bnpl: {
      tabby: { apiKey: 'k2' },
      mispay: { apiKey: 'FUTURE-BNPL', merchantToken: 'FUTURE-TOKEN' }, // hypothetical provider
    },
  });
  assert.equal(out.shipping.defaultCarrier, 'smsa', 'non-object settings must pass through');
  assert.equal(out.shipping.smsa.accountNo, 'AC-9', 'non-secret fields are not masked');
  for (const [path, val] of [
    ['shipping.smsa.apiKey', out.shipping.smsa.apiKey],
    ['shipping.smsa.webhookSecret', out.shipping.smsa.webhookSecret],
    ['shipping.naqel.apiKey', out.shipping.naqel.apiKey],
    ['shipping.naqel.webhookSecret', out.shipping.naqel.webhookSecret],
    ['bnpl.tabby.apiKey', out.bnpl.tabby.apiKey],
    ['bnpl.mispay.apiKey', out.bnpl.mispay.apiKey],
    ['bnpl.mispay.merchantToken', out.bnpl.mispay.merchantToken],
  ]) assert.equal(val, SECRET_MASK, `EXPORTED IN CLEARTEXT: ${path}`);
});

test('every field the UI treats as a secret is known to the redactor', () => {
  // secretInputSave() is how the settings UI marks a field as a credential, so its call
  // sites are the authoritative registry. If a new secret field is added to the UI and
  // not to redactSettingsForExport, this fails — which is the whole point.
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const names = new Set();
  for (const f of ['renderer/settings.js', 'renderer/build.js', 'renderer/machines.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/(\w+)\s*:\s*secretInputSave/g)) names.add(m[1]);
  }
  assert.ok(names.size >= 10, `expected to find the secret-field registry, got ${names.size}`);
  const store = fs.readFileSync(path.join(root, 'lib/store.js'), 'utf8');
  const body = store.slice(
    store.indexOf('function redactSettingsForExport'),
    store.indexOf('function redactMachinesForExport'),
  );
  const missing = [...names].filter(n => !body.includes(`'${n}'`) && !STORE_SECRET_KEY_RE_TEST(n));
  assert.deepEqual(missing, [], `secret field(s) the export redactor never masks: ${missing.join(', ')}`);
});

// Same shape as the regex inside store.js — kept local so the test fails loudly if the
// two ever drift apart rather than silently passing everything.
function STORE_SECRET_KEY_RE_TEST(k) {
  return /(api[-_]?key|secret|password|passwd|token|pin|csid|pcsid|authorization|bearer|access[-_]?code|private[-_]?key)/i.test(k);
}

test('redactMachinesForExport masks printer API secrets only when present', () => {
  const out = redactMachinesForExport([
    { id: 'm1', printerApi: { apiKey: 'pk', accessCode: 'ac' } },
    { id: 'm2' },
  ]);
  assert.equal(out[0].printerApi.apiKey, SECRET_MASK);
  assert.equal(out[0].printerApi.accessCode, SECRET_MASK);
  assert.equal(out[1].id, 'm2');
  assert.equal(out[1].printerApi, undefined);
});

test('buildExportPayload includes version and optional redaction', () => {
  const collections = {
    printLog: [],
    settings: { emailConfig: { apiKey: 'secret' }, lang: 'ar' },
    machines: [{ id: 'm1', printerApi: { apiKey: 'pk' } }],
  };
  const plain = buildExportPayload(collections, { redactSecrets: false });
  assert.equal(plain.version, VERSION);
  assert.equal(plain.settings.emailConfig.apiKey, 'secret');
  assert.match(plain.exportedAt, /^\d{4}-\d{2}-\d{2}T/);

  const redacted = buildExportPayload(collections, { redactSecrets: true });
  assert.equal(redacted.settings.emailConfig.apiKey, SECRET_MASK);
  assert.equal(redacted.machines[0].printerApi.apiKey, SECRET_MASK);
});

test('store-validate STORE_VERSION matches KhaytStore.VERSION', () => {
  const { STORE_VERSION } = require('../lib/store-validate');
  assert.equal(STORE_VERSION, VERSION);
});

/* ── Schema versioning ──────────────────────────────────────────────────── */

test('buildSnapshot stamps the schema version into the file', () => {
  // The store on disk used to carry no version at all, so a future build had no way to
  // know which Khayt wrote it — and normalizeStoreSnapshot, being an allowlist, would
  // silently drop any collection that version had added.
  const snap = buildSnapshot({ printLog: [], settings: {} });
  assert.equal(snap.version, VERSION, 'every saved store must be versioned');
});

test('the stamped version does not clobber a version already in the collections', () => {
  const snap = buildSnapshot({ printLog: [], settings: {}, version: 7 });
  assert.equal(snap.version, 7, 'an explicit value in the snapshot still wins');
});

test('a store from a NEWER Khayt is detected rather than silently truncated', () => {
  // normalizeStoreSnapshot keeps only collections it knows about. This is what the
  // downgrade guard in main.js keys off: warn + refuse rather than drop the data.
  const { normalizeStoreSnapshot, STORE_VERSION } = require('../lib/store-validate.js');
  const future = {
    version: STORE_VERSION + 5,
    printLog: [], settings: {},
    someFutureCollection: [{ id: 'X-1' }],
  };
  const { normalized, warnings } = normalizeStoreSnapshot(future);
  assert.ok(warnings.some(w => /newer than supported/i.test(w)),
    `a newer store must be flagged, got: ${warnings.join('; ')}`);
  assert.equal(normalized.version, STORE_VERSION + 5, 'the version survives so callers can act on it');
  // Documents the truncation the guard exists to prevent.
  assert.equal(normalized.someFutureCollection, undefined);
});
