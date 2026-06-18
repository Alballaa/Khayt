const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  VERSION,
  SECRET_MASK,
  redactSettingsForExport,
  redactMachinesForExport,
  buildSnapshot,
  buildExportPayload,
} = require('../renderer/store.js');

test('VERSION and SECRET_MASK are stable contract tokens', () => {
  assert.equal(VERSION, 6); // v6: Phase 0 sync foundation (rev/updatedAt + tombstones)
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
  assert.equal(out.telegram.botToken, SECRET_MASK);
  assert.equal(out.lanApi.pin, SECRET_MASK);
  assert.equal(out.bnpl.tamara.notificationToken, SECRET_MASK);
  assert.equal(out.lang, 'en');
});

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
