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

/* ── Data-integrity regressions ─────────────────────────────────────────────
 * Each of these reproduces a defect that could destroy a shop's data. */

test('CONCURRENT WRITES: overlapping saves must not destroy the store', async () => {
  // Every writer used one hardcoded temp path (fp + '.tmp') with no lock. Two overlapping
  // writes cross-wrote the same file; the loser's rename then moved the mixed garbage onto
  // .prev, leaving NO primary and a corrupt backup.
  const io = makeStoreIo();
  const big = { who: 'A', printLog: Array.from({ length: 8000 }, (_, i) => ({ id: 'O-' + i, note: 'x'.repeat(60) })) };
  const small = { who: 'B', printLog: [] };

  await Promise.all([
    io.writeStoreToDisk(big),
    io.writeStoreToDisk(small),
  ]);

  const rec = io.recoverStoreRaw();
  assert.ok(rec.data, 'store must still be readable after concurrent writes');
  assert.equal(rec.source, 'primary', 'primary must exist, not be recovered from a backup');
  assert.ok(['A', 'B'].includes(rec.data.who), 'must be one writer’s COMPLETE payload, not a blend');
  assert.equal(rec.existed, true);
});

test('CONCURRENT WRITES: every queued write completes in order, none silently vanish', async () => {
  const io = makeStoreIo();
  await Promise.all([1, 2, 3, 4, 5].map(n => io.writeStoreToDisk({ who: 'w' + n, printLog: [] })));
  const rec = io.recoverStoreRaw();
  // The last write to be queued wins; what matters is that the file is one intact payload.
  assert.equal(rec.data.who, 'w5', 'writes must land in arrival order');
});

test('temp files are uniquely named so writers cannot cross-write', async () => {
  const io = makeStoreIo();
  await io.writeStoreToDisk({ who: 'A', printLog: [] });
  const strays = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp'));
  assert.deepEqual(strays, [], 'a completed write must leave no temp file behind');
});

test('a surviving backup is never mistaken for a fresh install', () => {
  // recoverStoreRaw reported existed:false when the primary was missing, even with a
  // .prev on disk. main.js turned that into null, and the renderer read null as a genuine
  // first run: setup wizard, empty store, and the next save overwrote the last good copy.
  const io = makeStoreIo();
  const fp = path.join(tmpDir, fs.readdirSync(tmpDir).find(f => f.endsWith('.json')) || 'khayt-store.json');
  fs.writeFileSync(fp, JSON.stringify({ who: 'GOOD', printLog: [{ id: 'O-1' }] }), 'utf8');
  fs.renameSync(fp, fp + '.prev');            // interrupted write: primary gone, .prev good
  assert.equal(fs.existsSync(fp), false);

  const rec = io.recoverStoreRaw();
  assert.equal(rec.existed, true, 'a shop with a backup on disk is NOT a fresh install');
  assert.equal(rec.source, 'prev');
  assert.equal(rec.data.who, 'GOOD');
});

test('SECRETS: a load→save round-trip never writes the mask over a real credential', () => {
  // The mask list and the restore list were hand-maintained and had drifted: five
  // credential groups — including the Khayt Cloud token, i.e. the off-site backup —
  // were masked on load and never restored, so one round-trip destroyed them.
  const io = makeStoreIo();
  const real = {
    settings: {
      emailConfig: { apiKey: 'EMAIL-REAL' },
      smsConfig: { authToken: 'TWILIO-REAL', token: 'WA-REAL', appSid: 'SID-REAL', secret: 'HOOK-REAL' },
      accountingSync: { secret: 'ACCT-REAL' },
      ai: { apiKey: 'sk-ant-REAL' },
      cloud: { token: 'CLOUD-REAL' },
      telegram: { botToken: 'TG-REAL' },
      lanApi: { pin: 'PIN-REAL' },
    },
  };
  return (async () => {
    await io.writeStoreToDisk(real);
    const masked = io.maskStoreSecretsForRenderer(io.readStoreDecryptedFromDisk());
    // The renderer hands the masked object straight back on the next save.
    const merged = io.mergeStoreSecretsFromDisk(masked);
    const s = merged.settings;
    for (const [path_, val] of [
      ['emailConfig.apiKey', s.emailConfig.apiKey],
      ['smsConfig.authToken', s.smsConfig.authToken],
      ['smsConfig.token', s.smsConfig.token],
      ['smsConfig.appSid', s.smsConfig.appSid],
      ['smsConfig.secret', s.smsConfig.secret],
      ['accountingSync.secret', s.accountingSync.secret],
      ['ai.apiKey', s.ai.apiKey],
      ['cloud.token', s.cloud.token],
      ['telegram.botToken', s.telegram.botToken],
      ['lanApi.pin', s.lanApi.pin],
    ]) {
      assert.notEqual(val, STORE_SECRET_MASK, `CREDENTIAL DESTROYED: ${path_}`);
      assert.ok(val && val.endsWith('REAL'), `${path_} should be the real value, got ${val}`);
    }
  })();
});

test('SECRETS: a genuine user edit still overwrites the stored credential', async () => {
  // The mask backstop must only ever replace a mask — never clobber a real change.
  const io = makeStoreIo();
  await io.writeStoreToDisk({ settings: { ai: { apiKey: 'OLD-KEY' }, cloud: { token: 'OLD-TOKEN' } } });
  const merged = io.mergeStoreSecretsFromDisk({
    settings: { ai: { apiKey: 'NEW-KEY' }, cloud: { token: STORE_SECRET_MASK } },
  });
  assert.equal(merged.settings.ai.apiKey, 'NEW-KEY', 'a real edit must win');
  assert.equal(merged.settings.cloud.token, 'OLD-TOKEN', 'an untouched (masked) field is restored');
});

/* ── hasPlaintextSecrets — gates the keychain explanation ──────────
   The store LOAD masks and never decrypts, so the one-time keychain dialog was
   blocking boot for an access that only happens on save (encrypt) / restore
   (decrypt). This predicate decides when the encrypt path will really reach the
   keychain. */

test('hasPlaintextSecrets is false when encryption is unavailable', () => {
  const io = makeStoreIo({ encryption: false });
  assert.equal(io.hasPlaintextSecrets({ settings: { emailConfig: { apiKey: 'sk-live' } } }), false);
});

test('hasPlaintextSecrets is false for an empty store or no secrets', () => {
  const io = makeStoreIo({ encryption: true });
  assert.equal(io.hasPlaintextSecrets(null), false);
  assert.equal(io.hasPlaintextSecrets({}), false);
  assert.equal(io.hasPlaintextSecrets({ settings: { shopName: 'X' }, machines: [{ id: 'M1' }] }), false);
});

test('hasPlaintextSecrets ignores already-encrypted and masked values', () => {
  const io = makeStoreIo({ encryption: true });
  assert.equal(io.hasPlaintextSecrets({ settings: { emailConfig: { apiKey: '__enc__abc' } } }), false);
  assert.equal(io.hasPlaintextSecrets({ settings: { emailConfig: { apiKey: STORE_SECRET_MASK } } }), false);
});

test('hasPlaintextSecrets detects a plaintext secret in each family', () => {
  const io = makeStoreIo({ encryption: true });
  const cases = [
    { settings: { emailConfig: { apiKey: 'x' } } },
    { settings: { emailConfig: { smtpPassword: 'x' } } },
    { settings: { smsConfig: { authToken: 'x' } } },
    { settings: { accountingSync: { secret: 'x' } } },
    { machines: [{ id: 'M', printerApi: { apiKey: 'x' } }] },
    { machines: [{ id: 'M', printerApi: { accessCode: 'x' } }] },
    { settings: { zatcaPhase2: { csid: 'x' } } },
    { settings: { bnpl: { tamara: { notificationToken: 'x' } } } },
    { settings: { telegram: { botToken: 'x' } } },
    { settings: { lanApi: { pin: 'x' } } },
    { settings: { webhooks: { secret: 'x' } } },
    { settings: { eventWebhooks: { secret: 'x' } } },
    { settings: { ai: { apiKey: 'x' } } },
    { settings: { cloud: { token: 'x' } } },
  ];
  for (const c of cases) {
    assert.equal(io.hasPlaintextSecrets(c), true, `should detect: ${JSON.stringify(c)}`);
  }
});

test('hasPlaintextSecrets stays in lockstep with encryptForDisk', () => {
  // The safety net for drift: whenever encryptForDisk would change the store
  // (i.e. actually reach the keychain), the predicate must have said so, and
  // vice-versa. If a secret field is added to one and not the other, this fails.
  const io = makeStoreIo({ encryption: true });
  const full = {
    settings: {
      emailConfig: { apiKey: 'a', smtpPassword: 'b' },
      smsConfig: { authToken: 'c', token: 'd', appSid: 'e', secret: 'f' },
      accountingSync: { secret: 'g' },
      zatcaPhase2: { csid: 'h', pcsid: 'i' },
      bnpl: { tabby: { apiKey: 'j' }, tamara: { apiKey: 'k', notificationToken: 'l' }, stripe: { apiKey: 'm' } },
      telegram: { botToken: 'n' },
      lanApi: { webhookToken: 'o', sallaWebhookSecret: 'p', zidWebhookSecret: 'q', pin: 'r', intakeToken: 's', intakePin: 't', calendarToken: 'u' },
      webhooks: { secret: 'v' }, eventWebhooks: { secret: 'w' },
      ai: { apiKey: 'x' }, cloud: { token: 'y' },
    },
    machines: [{ id: 'M', printerApi: { apiKey: 'z', accessCode: 'z2' } }],
  };
  const changed = (d) => JSON.stringify(io.encryptForDisk(d)) !== JSON.stringify(d);
  assert.equal(io.hasPlaintextSecrets(full), changed(full), 'full store: predicate must match encryptForDisk');
  const empty = { settings: { shopName: 'X' }, machines: [{ id: 'M1' }] };
  assert.equal(io.hasPlaintextSecrets(empty), changed(empty), 'empty store: predicate must match encryptForDisk');
});
