const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createStoreIo, STORE_SECRET_MASK } = require('../lib/store-io');
const { safeJsonParse } = require('../lib/safe-json');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-store-io-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeStoreIo({ encryption = false } = {}) {
  const safeStorage = {
    isEncryptionAvailable: () => encryption,
    encryptString: (plain) => Buffer.from(`test:${plain}`, 'utf8'),
    decryptString: (buf) => {
      const s = buf.toString('utf8');
      return s.startsWith('test:') ? s.slice(5) : '';
    },
  };
  return createStoreIo({
    app: { getPath: () => tmpDir },
    fs,
    safeStorage,
    safeJsonParse,
    crypto,
  });
}

test('isStoreSecretMasked recognises mask token', () => {
  const { isStoreSecretMasked } = makeStoreIo();
  assert.equal(isStoreSecretMasked(STORE_SECRET_MASK), true);
  assert.equal(isStoreSecretMasked('real-key'), false);
  assert.equal(isStoreSecretMasked(''), false);
});

test('ensureLanCalendarToken generates and reuses calendar token', () => {
  const { ensureLanCalendarToken } = makeStoreIo();
  const store = { settings: { lanApi: {} } };
  const first = ensureLanCalendarToken(store);
  assert.equal(first.generated, true);
  assert.ok(first.token.length >= 16);
  const second = ensureLanCalendarToken(store);
  assert.equal(second.generated, false);
  assert.equal(second.token, first.token);
});

test('maskStoreSecretsForRenderer masks accessCode-only printer configs', () => {
  const { maskStoreSecretsForRenderer } = makeStoreIo();
  const data = {
    machines: [{ id: 'm2', printerApi: { accessCode: 'code-only' } }],
  };
  maskStoreSecretsForRenderer(data);
  assert.equal(data.machines[0].printerApi.accessCode, STORE_SECRET_MASK);
});

test('maskStoreSecretsForRenderer replaces sensitive fields', () => {
  const { maskStoreSecretsForRenderer } = makeStoreIo();
  const data = {
    settings: {
      emailConfig: { apiKey: 'smtp-secret' },
      telegram: { botToken: 'tg-token' },
      lanApi: { pin: '1234', intakeToken: 'abc' },
    },
    machines: [{ id: 'm1', printerApi: { apiKey: 'pk', accessCode: 'ac' } }],
  };
  maskStoreSecretsForRenderer(data);
  assert.equal(data.settings.emailConfig.apiKey, STORE_SECRET_MASK);
  assert.equal(data.settings.telegram.botToken, STORE_SECRET_MASK);
  assert.equal(data.settings.lanApi.pin, STORE_SECRET_MASK);
  assert.equal(data.machines[0].printerApi.apiKey, STORE_SECRET_MASK);
  assert.equal(data.machines[0].printerApi.accessCode, STORE_SECRET_MASK);
});

test('encryptForDisk prefixes secrets when encryption is available', () => {
  const { encryptForDisk } = makeStoreIo({ encryption: true });
  const out = encryptForDisk({
    settings: { emailConfig: { apiKey: 'plain-key' } },
  });
  assert.match(out.settings.emailConfig.apiKey, /^__enc__/);
});

test('mergeStoreSecretsFromDisk keeps disk value when renderer sends mask', async () => {
  const io = makeStoreIo({ encryption: false });
  const diskStore = {
    settings: { emailConfig: { apiKey: 'disk-smtp-key' } },
    machines: [{ id: 'm1', printerApi: { apiKey: 'disk-printer-key' } }],
  };
  await fs.promises.writeFile(
    io.dataFilePath(),
    JSON.stringify(io.encryptForDisk(diskStore)),
    'utf8'
  );
  const incoming = {
    settings: { emailConfig: { apiKey: STORE_SECRET_MASK } },
    machines: [{ id: 'm1', printerApi: { apiKey: STORE_SECRET_MASK } }],
  };
  const merged = io.mergeStoreSecretsFromDisk(incoming);
  assert.equal(merged.settings.emailConfig.apiKey, 'disk-smtp-key');
  assert.equal(merged.machines[0].printerApi.apiKey, 'disk-printer-key');
});

test('mergeStoreSecretsFromDisk does not merge machine secrets by array index', async () => {
  const io = makeStoreIo({ encryption: false });
  const diskStore = {
    machines: [
      { id: 'a', printerApi: { apiKey: 'key-a' } },
      { id: 'b', printerApi: { apiKey: 'key-b' } },
    ],
  };
  await fs.promises.writeFile(
    io.dataFilePath(),
    JSON.stringify(io.encryptForDisk(diskStore)),
    'utf8'
  );
  const incoming = {
    machines: [
      { id: 'b', printerApi: { apiKey: STORE_SECRET_MASK } },
      { id: 'a', printerApi: { apiKey: STORE_SECRET_MASK } },
    ],
  };
  const merged = io.mergeStoreSecretsFromDisk(incoming);
  assert.equal(merged.machines[0].printerApi.apiKey, 'key-b');
  assert.equal(merged.machines[1].printerApi.apiKey, 'key-a');
});

test('mergeStoreSecretsFromDisk keeps renderer value when not masked', async () => {
  const io = makeStoreIo({ encryption: false });
  const diskStore = { settings: { emailConfig: { apiKey: 'old-key' } } };
  await fs.promises.writeFile(
    io.dataFilePath(),
    JSON.stringify(io.encryptForDisk(diskStore)),
    'utf8'
  );
  const merged = io.mergeStoreSecretsFromDisk({
    settings: { emailConfig: { apiKey: 'new-key' } },
  });
  assert.equal(merged.settings.emailConfig.apiKey, 'new-key');
});

test('writeStoreToDisk and readStoreDecryptedFromDisk round-trip', async () => {
  const io = makeStoreIo({ encryption: true });
  let updated = null;
  const ioWithHook = createStoreIo({
    app: { getPath: () => tmpDir },
    fs,
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (p) => Buffer.from(`test:${p}`, 'utf8'),
      decryptString: (buf) => buf.toString('utf8').slice(5),
    },
    safeJsonParse,
    crypto,
    onStoreUpdated: (d) => { updated = d; },
  });
  const store = {
    settings: { telegram: { botToken: 'my-bot' } },
    printLog: [],
  };
  await ioWithHook.writeStoreToDisk(store);
  assert.equal(updated?.settings?.telegram?.botToken, 'my-bot');
  const fromDisk = ioWithHook.readStoreDecryptedFromDisk();
  assert.equal(fromDisk.settings.telegram.botToken, 'my-bot');
});

test('migrateLanApiSecrets copies legacy webhook fields into lanApi', () => {
  const { migrateLanApiSecrets } = makeStoreIo();
  const store = {
    settings: {
      sallaWebhookSecret: 'salla-sec',
      zidWebhookSecret: 'zid-sec',
      lanApi: {},
    },
  };
  migrateLanApiSecrets(store);
  assert.equal(store.settings.lanApi.sallaWebhookSecret, 'salla-sec');
  assert.equal(store.settings.lanApi.zidWebhookSecret, 'zid-sec');
});

test('ensureLanIntakeToken generates token when missing', () => {
  const { ensureLanIntakeToken } = makeStoreIo();
  const store = { settings: { lanApi: {} } };
  const r = ensureLanIntakeToken(store);
  assert.equal(r.generated, true);
  assert.match(r.token, /^[a-f0-9]{32}$/);
  assert.equal(store.settings.lanApi.intakeToken, r.token);
});

test('ensureLanIntakeToken does not replace existing token', () => {
  const { ensureLanIntakeToken } = makeStoreIo();
  const store = { settings: { lanApi: { intakeToken: 'existing' } } };
  const r = ensureLanIntakeToken(store);
  assert.equal(r.generated, false);
  assert.equal(r.token, 'existing');
});

test('resolveStoreSecret returns incoming when not masked', async () => {
  const { resolveStoreSecret } = makeStoreIo();
  const v = resolveStoreSecret('live-key', () => 'disk-key');
  assert.equal(v, 'live-key');
});

test('resolveStoreSecret reads from disk when masked', async () => {
  const io = makeStoreIo({ encryption: false });
  await fs.promises.writeFile(
    io.dataFilePath(),
    JSON.stringify({
      settings: { telegram: { botToken: 'disk-bot' } },
    }),
    'utf8'
  );
  const v = io.resolveStoreSecret(STORE_SECRET_MASK, d => d?.settings?.telegram?.botToken);
  assert.equal(v, 'disk-bot');
});

// --- Atomic/durable write + crash recovery (Beat B data-safety) ---

test('atomicWriteStore writes the store and keeps a one-generation .prev rollback', async () => {
  const io = makeStoreIo();
  const fp = io.dataFilePath();
  await io.atomicWriteStore(JSON.stringify({ v: 1 }));
  assert.equal(safeJsonParse(fs.readFileSync(fp, 'utf8')).v, 1);
  assert.equal(fs.existsSync(fp + '.prev'), false); // nothing to roll back on the first write
  await io.atomicWriteStore(JSON.stringify({ v: 2 }));
  assert.equal(safeJsonParse(fs.readFileSync(fp, 'utf8')).v, 2);
  assert.equal(safeJsonParse(fs.readFileSync(fp + '.prev', 'utf8')).v, 1); // previous generation preserved
});

test('recoverStoreRaw reads a valid primary', () => {
  const io = makeStoreIo();
  fs.writeFileSync(io.dataFilePath(), JSON.stringify({ printLog: [{ id: 'O' }] }));
  const r = io.recoverStoreRaw();
  assert.equal(r.source, 'primary');
  assert.equal(r.data.printLog[0].id, 'O');
});

test('recoverStoreRaw quarantines a corrupt primary and restores from .prev', () => {
  const io = makeStoreIo();
  const fp = io.dataFilePath();
  fs.writeFileSync(fp + '.prev', JSON.stringify({ good: true }));
  fs.writeFileSync(fp, '{ this is not valid json');
  const r = io.recoverStoreRaw();
  assert.equal(r.source, 'prev');
  assert.equal(r.data.good, true);
  assert.ok(r.quarantined && fs.existsSync(r.quarantined), 'corrupt primary preserved aside');
  assert.equal(fs.readFileSync(r.quarantined, 'utf8'), '{ this is not valid json');
  assert.ok(fs.existsSync(fp), 'primary restored from prev');
});

test('recoverStoreRaw recovers from a completed .tmp when the primary is missing', () => {
  const io = makeStoreIo();
  const fp = io.dataFilePath();
  fs.writeFileSync(fp + '.tmp', JSON.stringify({ fromTmp: 1 }));
  const r = io.recoverStoreRaw();
  assert.equal(r.source, 'tmp');
  assert.equal(r.data.fromTmp, 1);
  assert.ok(fs.existsSync(fp), 'tmp promoted to primary');
});

test('recoverStoreRaw reports a fresh install when nothing is on disk', () => {
  const io = makeStoreIo();
  const r = io.recoverStoreRaw();
  assert.equal(r.data, null);
  assert.equal(r.existed, false);
});
