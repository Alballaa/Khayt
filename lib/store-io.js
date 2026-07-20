'use strict';

const path = require('path');

const STORE_SECRET_MASK = '__KHAYT_MASKED__';

/**
 * Store encrypt/decrypt, disk read/write, secret merge/mask for hub + LAN.
 * @param {{ app: import('electron').App, fs: typeof import('fs'), safeStorage: import('electron').SafeStorage, safeJsonParse: Function, crypto: typeof import('crypto'), onStoreUpdated?: (data: object) => void }} deps
 */
function createStoreIo({ app, fs, safeStorage, safeJsonParse, crypto, onStoreUpdated }) {
  function dataFilePath() {
    return path.join(app.getPath('userData'), 'khayt-store.json');
  }

  function encryptStoreField(val) {
    if (!val || typeof val !== 'string' || !safeStorage.isEncryptionAvailable()) return val;
    if (val.startsWith('__enc__') || val === STORE_SECRET_MASK) return val;
    return '__enc__' + safeStorage.encryptString(val).toString('base64');
  }

  function decryptStoreField(val) {
    if (!val || typeof val !== 'string' || !val.startsWith('__enc__')) return val;
    if (!safeStorage.isEncryptionAvailable()) return val;
    try { return safeStorage.decryptString(Buffer.from(val.slice(7), 'base64')); }
    catch { return val; }
  }

  function encryptForDisk(data) {
    const d = JSON.parse(JSON.stringify(data));
    if (d?.settings?.emailConfig?.apiKey)
      d.settings.emailConfig.apiKey = encryptStoreField(d.settings.emailConfig.apiKey);
    if (d?.settings?.emailConfig?.smtpPassword)
      d.settings.emailConfig.smtpPassword = encryptStoreField(d.settings.emailConfig.smtpPassword);
    for (const k of ['authToken', 'token', 'appSid', 'secret'])
      if (d?.settings?.smsConfig?.[k]) d.settings.smsConfig[k] = encryptStoreField(d.settings.smsConfig[k]);
    if (d?.settings?.accountingSync?.secret) d.settings.accountingSync.secret = encryptStoreField(d.settings.accountingSync.secret);
    if (Array.isArray(d?.machines))
      d.machines = d.machines.map(m => {
        if (!m?.printerApi) return m;
        const pa = { ...m.printerApi };
        if (pa.apiKey) pa.apiKey = encryptStoreField(pa.apiKey);
        if (pa.accessCode) pa.accessCode = encryptStoreField(pa.accessCode);
        return { ...m, printerApi: pa };
      });
    if (d?.settings?.zatcaPhase2?.csid)  d.settings.zatcaPhase2.csid  = encryptStoreField(d.settings.zatcaPhase2.csid);
    if (d?.settings?.zatcaPhase2?.pcsid) d.settings.zatcaPhase2.pcsid = encryptStoreField(d.settings.zatcaPhase2.pcsid);
    if (d?.settings?.bnpl?.tabby?.apiKey)  d.settings.bnpl.tabby.apiKey  = encryptStoreField(d.settings.bnpl.tabby.apiKey);
    if (d?.settings?.bnpl?.tamara?.apiKey)             d.settings.bnpl.tamara.apiKey             = encryptStoreField(d.settings.bnpl.tamara.apiKey);
    if (d?.settings?.bnpl?.tamara?.notificationToken)  d.settings.bnpl.tamara.notificationToken  = encryptStoreField(d.settings.bnpl.tamara.notificationToken);
    if (d?.settings?.bnpl?.stripe?.apiKey) d.settings.bnpl.stripe.apiKey = encryptStoreField(d.settings.bnpl.stripe.apiKey);
    if (d?.settings?.telegram?.botToken)   d.settings.telegram.botToken   = encryptStoreField(d.settings.telegram.botToken);
    if (d?.settings?.lanApi?.webhookToken)        d.settings.lanApi.webhookToken        = encryptStoreField(d.settings.lanApi.webhookToken);
    if (d?.settings?.lanApi?.sallaWebhookSecret)  d.settings.lanApi.sallaWebhookSecret  = encryptStoreField(d.settings.lanApi.sallaWebhookSecret);
    if (d?.settings?.lanApi?.zidWebhookSecret)    d.settings.lanApi.zidWebhookSecret    = encryptStoreField(d.settings.lanApi.zidWebhookSecret);
    if (d?.settings?.lanApi?.pin)                 d.settings.lanApi.pin                 = encryptStoreField(d.settings.lanApi.pin);
    if (d?.settings?.lanApi?.intakeToken)         d.settings.lanApi.intakeToken         = encryptStoreField(d.settings.lanApi.intakeToken);
    if (d?.settings?.lanApi?.intakePin)          d.settings.lanApi.intakePin          = encryptStoreField(d.settings.lanApi.intakePin);
    if (d?.settings?.lanApi?.calendarToken)      d.settings.lanApi.calendarToken      = encryptStoreField(d.settings.lanApi.calendarToken);
    if (d?.settings?.webhooks?.secret)            d.settings.webhooks.secret            = encryptStoreField(d.settings.webhooks.secret);
    if (d?.settings?.ai?.apiKey)                  d.settings.ai.apiKey                  = encryptStoreField(d.settings.ai.apiKey);
    if (d?.settings?.cloud?.token)                d.settings.cloud.token                = encryptStoreField(d.settings.cloud.token);
    return d;
  }

  function isStoreSecretMasked(val) {
    return val === STORE_SECRET_MASK;
  }

  function decryptStoreSecrets(data) {
    if (!data) return data;
    if (data?.settings?.emailConfig?.apiKey) {
      data.settings.emailConfig.apiKey = decryptStoreField(data.settings.emailConfig.apiKey);
    }
    if (data?.settings?.emailConfig?.smtpPassword) {
      data.settings.emailConfig.smtpPassword = decryptStoreField(data.settings.emailConfig.smtpPassword);
    }
    for (const k of ['authToken', 'token', 'appSid', 'secret'])
      if (data?.settings?.smsConfig?.[k]) data.settings.smsConfig[k] = decryptStoreField(data.settings.smsConfig[k]);
    if (data?.settings?.accountingSync?.secret) data.settings.accountingSync.secret = decryptStoreField(data.settings.accountingSync.secret);
    if (Array.isArray(data?.machines)) {
      data.machines = data.machines.map(m => {
        if (!m?.printerApi) return m;
        const pa = { ...m.printerApi };
        if (pa.apiKey) pa.apiKey = decryptStoreField(pa.apiKey);
        if (pa.accessCode) pa.accessCode = decryptStoreField(pa.accessCode);
        return { ...m, printerApi: pa };
      });
    }
    if (data?.settings?.zatcaPhase2?.csid)  data.settings.zatcaPhase2.csid  = decryptStoreField(data.settings.zatcaPhase2.csid);
    if (data?.settings?.zatcaPhase2?.pcsid) data.settings.zatcaPhase2.pcsid = decryptStoreField(data.settings.zatcaPhase2.pcsid);
    if (data?.settings?.bnpl?.tabby?.apiKey)             data.settings.bnpl.tabby.apiKey             = decryptStoreField(data.settings.bnpl.tabby.apiKey);
    if (data?.settings?.bnpl?.tamara?.apiKey)            data.settings.bnpl.tamara.apiKey            = decryptStoreField(data.settings.bnpl.tamara.apiKey);
    if (data?.settings?.bnpl?.tamara?.notificationToken) data.settings.bnpl.tamara.notificationToken = decryptStoreField(data.settings.bnpl.tamara.notificationToken);
    if (data?.settings?.bnpl?.stripe?.apiKey)            data.settings.bnpl.stripe.apiKey            = decryptStoreField(data.settings.bnpl.stripe.apiKey);
    if (data?.settings?.telegram?.botToken)              data.settings.telegram.botToken              = decryptStoreField(data.settings.telegram.botToken);
    if (data?.settings?.lanApi?.webhookToken)            data.settings.lanApi.webhookToken            = decryptStoreField(data.settings.lanApi.webhookToken);
    if (data?.settings?.lanApi?.sallaWebhookSecret)      data.settings.lanApi.sallaWebhookSecret      = decryptStoreField(data.settings.lanApi.sallaWebhookSecret);
    if (data?.settings?.lanApi?.zidWebhookSecret)        data.settings.lanApi.zidWebhookSecret        = decryptStoreField(data.settings.lanApi.zidWebhookSecret);
    if (data?.settings?.lanApi?.pin)                     data.settings.lanApi.pin                     = decryptStoreField(data.settings.lanApi.pin);
    if (data?.settings?.lanApi?.intakeToken)             data.settings.lanApi.intakeToken             = decryptStoreField(data.settings.lanApi.intakeToken);
    if (data?.settings?.lanApi?.intakePin)              data.settings.lanApi.intakePin              = decryptStoreField(data.settings.lanApi.intakePin);
    if (data?.settings?.lanApi?.calendarToken)          data.settings.lanApi.calendarToken          = decryptStoreField(data.settings.lanApi.calendarToken);
    if (data?.settings?.webhooks?.secret)                data.settings.webhooks.secret                = decryptStoreField(data.settings.webhooks.secret);
    if (data?.settings?.ai?.apiKey)                      data.settings.ai.apiKey                      = decryptStoreField(data.settings.ai.apiKey);
    if (data?.settings?.cloud?.token)                    data.settings.cloud.token                    = decryptStoreField(data.settings.cloud.token);
    return data;
  }

  function maskStoreSecretsForRenderer(data) {
    if (!data) return data;
    const mask = (obj, key) => { if (obj?.[key]) obj[key] = STORE_SECRET_MASK; };
    mask(data.settings?.emailConfig, 'apiKey');
    mask(data.settings?.emailConfig, 'smtpPassword');
    for (const k of ['authToken', 'token', 'appSid', 'secret']) mask(data.settings?.smsConfig, k);
    mask(data.settings?.accountingSync, 'secret');
    if (Array.isArray(data?.machines)) {
      data.machines = data.machines.map((m) => {
        if (!m?.printerApi) return m;
        const pa = { ...m.printerApi };
        if (pa.apiKey) pa.apiKey = STORE_SECRET_MASK;
        if (pa.accessCode) pa.accessCode = STORE_SECRET_MASK;
        return { ...m, printerApi: pa };
      });
    }
    mask(data.settings?.zatcaPhase2, 'csid');
    mask(data.settings?.zatcaPhase2, 'pcsid');
    mask(data.settings?.bnpl?.tabby, 'apiKey');
    mask(data.settings?.bnpl?.tamara, 'apiKey');
    mask(data.settings?.bnpl?.tamara, 'notificationToken');
    mask(data.settings?.bnpl?.stripe, 'apiKey');
    mask(data.settings?.telegram, 'botToken');
    mask(data.settings?.webhooks, 'secret');
    mask(data.settings?.ai, 'apiKey');
    mask(data.settings?.cloud, 'token');
    if (data.settings?.lanApi) {
      ['webhookToken', 'sallaWebhookSecret', 'zidWebhookSecret', 'pin', 'intakeToken', 'intakePin', 'calendarToken'].forEach(k => mask(data.settings.lanApi, k));
    }
    return data;
  }

  function readStoreRawFromDisk() {
    const fp = dataFilePath();
    if (!fs.existsSync(fp)) return null;
    try {
      const stat = fs.statSync(fp);
      if (stat.size > 50_000_000) return null;
      return safeJsonParse(fs.readFileSync(fp, 'utf8'));
    } catch { return null; }
  }

  function readStoreDecryptedFromDisk() {
    const raw = readStoreRawFromDisk();
    if (!raw) return null;
    return decryptStoreSecrets(JSON.parse(JSON.stringify(raw)));
  }

  function mergeStoreSecretsFromDisk(incoming) {
    const out = JSON.parse(JSON.stringify(incoming || {}));
    const disk = readStoreDecryptedFromDisk();
    if (!disk) return out;
    const pick = (getIn, setOut, getDisk) => {
      const inVal = getIn(out);
      if (!isStoreSecretMasked(inVal) && inVal) return;
      const diskVal = getDisk(disk);
      if (diskVal) setOut(out, diskVal);
    };
    pick(
      d => d?.settings?.emailConfig?.apiKey,
      (d, v) => { if (!d.settings) d.settings = {}; if (!d.settings.emailConfig) d.settings.emailConfig = {}; d.settings.emailConfig.apiKey = v; },
      d => d?.settings?.emailConfig?.apiKey
    );
    pick(
      d => d?.settings?.emailConfig?.smtpPassword,
      (d, v) => { if (!d.settings) d.settings = {}; if (!d.settings.emailConfig) d.settings.emailConfig = {}; d.settings.emailConfig.smtpPassword = v; },
      d => d?.settings?.emailConfig?.smtpPassword
    );
    if (Array.isArray(out.machines)) {
      const diskById = new Map(
        (disk.machines || []).filter((m) => m && m.id).map((m) => [m.id, m]),
      );
      out.machines = out.machines.map((m, i) => {
        const inKey = m?.printerApi?.apiKey;
        const inCode = m?.printerApi?.accessCode;
        if (!isStoreSecretMasked(inKey) && inKey && !isStoreSecretMasked(inCode) && inCode) return m;
        const diskM = m?.id ? diskById.get(m.id) : null;
        const diskKey = diskM?.printerApi?.apiKey;
        const diskCode = diskM?.printerApi?.accessCode;
        let next = m;
        if (isStoreSecretMasked(inKey) && diskKey) {
          next = { ...next, printerApi: { ...(next.printerApi || {}), apiKey: diskKey } };
        }
        if (isStoreSecretMasked(inCode) && diskCode) {
          next = { ...next, printerApi: { ...(next.printerApi || {}), accessCode: diskCode } };
        }
        return next;
      });
    }
    pick(
      d => d?.settings?.zatcaPhase2?.csid,
      (d, v) => { if (!d.settings) d.settings = {}; if (!d.settings.zatcaPhase2) d.settings.zatcaPhase2 = {}; d.settings.zatcaPhase2.csid = v; },
      d => d?.settings?.zatcaPhase2?.csid
    );
    pick(
      d => d?.settings?.zatcaPhase2?.pcsid,
      (d, v) => { if (!d.settings) d.settings = {}; if (!d.settings.zatcaPhase2) d.settings.zatcaPhase2 = {}; d.settings.zatcaPhase2.pcsid = v; },
      d => d?.settings?.zatcaPhase2?.pcsid
    );
    const mergeBnpl = (provider, key) => pick(
      d => d?.settings?.bnpl?.[provider]?.[key],
      (d, v) => { if (!d.settings) d.settings = {}; if (!d.settings.bnpl) d.settings.bnpl = {}; if (!d.settings.bnpl[provider]) d.settings.bnpl[provider] = {}; d.settings.bnpl[provider][key] = v; },
      d => d?.settings?.bnpl?.[provider]?.[key]
    );
    mergeBnpl('tabby', 'apiKey');
    mergeBnpl('tamara', 'apiKey');
    mergeBnpl('tamara', 'notificationToken');
    mergeBnpl('stripe', 'apiKey');
    pick(
      d => d?.settings?.telegram?.botToken,
      (d, v) => { if (!d.settings) d.settings = {}; if (!d.settings.telegram) d.settings.telegram = {}; d.settings.telegram.botToken = v; },
      d => d?.settings?.telegram?.botToken
    );
    pick(
      d => d?.settings?.webhooks?.secret,
      (d, v) => { if (!d.settings) d.settings = {}; if (!d.settings.webhooks) d.settings.webhooks = {}; d.settings.webhooks.secret = v; },
      d => d?.settings?.webhooks?.secret
    );
    ['webhookToken', 'sallaWebhookSecret', 'zidWebhookSecret', 'pin', 'intakeToken', 'intakePin', 'calendarToken'].forEach(field => {
      pick(
        d => d?.settings?.lanApi?.[field],
        (d, v) => { if (!d.settings) d.settings = {}; if (!d.settings.lanApi) d.settings.lanApi = {}; d.settings.lanApi[field] = v; },
        d => d?.settings?.lanApi?.[field]
      );
    });

    // BACKSTOP — the list above is hand-maintained and had drifted out of sync with the
    // mask list, so smsConfig.{authToken,token,appSid,secret}, accountingSync.secret,
    // ai.apiKey and cloud.token were masked on load and never restored on save: one
    // load→save round-trip wrote the literal mask to disk and destroyed the credential
    // irrecoverably. That silently broke SMS, accounting sync, AI assist and — worst —
    // the Khayt Cloud token, i.e. the owner's off-site backup.
    //
    // Rather than adding four more entries that can drift again, walk the settings tree:
    // ANY value still equal to the mask is restored from its counterpart on disk. New
    // secret fields are covered automatically.
    restoreMaskedFromDisk(out.settings, disk && disk.settings);
    return out;
  }

  /**
   * Recursively replace every masked value in `target` with the value at the same path in
   * `source`. Only ever copies over a mask, so real user edits are never clobbered.
   */
  function restoreMaskedFromDisk(target, source, depth) {
    const d = depth || 0;
    if (d > 8 || !target || !source || typeof target !== 'object' || typeof source !== 'object') return;
    for (const key of Object.keys(target)) {
      const tv = target[key];
      const sv = source[key];
      if (isStoreSecretMasked(tv)) {
        if (typeof sv === 'string' && sv && !isStoreSecretMasked(sv)) target[key] = sv;
      } else if (tv && typeof tv === 'object' && !Array.isArray(tv)) {
        restoreMaskedFromDisk(tv, sv, d + 1);
      }
    }
  }

  /**
   * Atomic, durable store write. Writes a temp file and fsyncs it before swapping, so a
   * crash/power-loss can't leave a half-written store, then rolls the current good file to
   * `.prev` (a cheap rename, not a copy) so there's always a one-generation rollback. The
   * `.prev` backup is best-effort; the write itself always completes.
   */
  // Serializes ALL store writes. The renderer had its own save chain, but nothing
  // serialized renderer-vs-LAN or LAN-vs-LAN, and the 15 LAN HTTP handlers write
  // unserialized. Two overlapping writes shared one hardcoded temp path, so writer B
  // opened the same file at position 0 while A was still streaming into it; B renamed it
  // into place, then A — still holding a live fd on the file now living at the primary
  // path — kept writing, and A's own rename moved that mixed garbage onto .prev. Result:
  // primary gone, .prev corrupt, and recoverStoreRaw reporting "no store" — which the app
  // reads as a FRESH INSTALL and greets the owner with the setup wizard.
  let _writeChain = Promise.resolve();
  let _tmpCounter = 0;

  async function atomicWriteStore(serialized) {
    // Chain before awaiting so concurrent callers queue in arrival order rather than
    // racing. Errors are contained so one failed write can't poison the chain.
    const run = _writeChain.then(() => atomicWriteStoreUnsafe(serialized));
    _writeChain = run.catch(() => {});
    return run;
  }

  async function atomicWriteStoreUnsafe(serialized) {
    const fp = dataFilePath();
    // Unique per write: even if a temp file is orphaned by a crash, no other writer can
    // ever be handed the same path to cross-write.
    const tmp = `${fp}.tmp.${process.pid}.${++_tmpCounter}`;
    const fh = await fs.promises.open(tmp, 'w');
    try { await fh.writeFile(serialized, 'utf8'); await fh.sync(); }
    finally { await fh.close(); }
    try { if (fs.existsSync(fp)) await fs.promises.rename(fp, fp + '.prev'); } catch (_) { /* rollback copy is best-effort */ }
    try {
      await fs.promises.rename(tmp, fp);
    } catch (e) {
      // Never leave a stray temp behind if the swap fails.
      try { await fs.promises.unlink(tmp); } catch (_) { /* already gone */ }
      throw e;
    }
  }

  /**
   * Read the best available on-disk store, recovering transparently from a crash:
   *  - primary `khayt-store.json` if it parses;
   *  - else quarantine an unreadable primary (renamed to `.corrupt-<ts>.json`, never
   *    overwritten, so it can be recovered by hand) and fall back to a completed-but-
   *    unswapped `.tmp` (crash between the two renames) or the previous generation `.prev`.
   * Restores the chosen fallback to the primary path so the app continues normally.
   * @returns {{ data: object|null, source: 'primary'|'tmp'|'prev'|null, existed: boolean, quarantined: string|null }}
   */
  function recoverStoreRaw(maxBytes = 50_000_000) {
    const fp = dataFilePath();
    const prev = fp + '.prev';
    // Temp files are now uniquely named (fp.tmp.<pid>.<n>); the bare fp.tmp is still
    // checked so a store left behind by an older build is still recoverable. Newest
    // first — the most recent interrupted write is the closest to the owner's work.
    const tmpCandidates = (() => {
      const out = [];
      try {
        const dir = path.dirname(fp);
        const base = path.basename(fp);
        for (const name of fs.readdirSync(dir)) {
          if (name === base + '.tmp' || name.startsWith(base + '.tmp.')) {
            const full = path.join(dir, name);
            let mtime = 0;
            try { mtime = fs.statSync(full).mtimeMs; } catch (_) { /* skip */ }
            out.push({ full, mtime });
          }
        }
      } catch (_) { /* unreadable dir → no candidates */ }
      return out.sort((a, b) => b.mtime - a.mtime).map(x => x.full);
    })();
    const tryRead = (p) => {
      try {
        if (!fs.existsSync(p)) return null;
        const st = fs.statSync(p);
        if (st.size < 2 || st.size > maxBytes) return null;
        const parsed = safeJsonParse(fs.readFileSync(p, 'utf8'));
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
      } catch (_) { return null; }
    };
    // A store "existed" if ANY generation is on disk — not just the primary. If an
    // interrupted write left the primary missing while .prev/.tmp survive, reporting
    // existed:false makes the app treat a working shop as a fresh install: setup wizard,
    // empty store, and the next save overwrites the very backup that still held the data.
    const primaryExists = fs.existsSync(fp);
    const existed = primaryExists || fs.existsSync(prev) || tmpCandidates.length > 0;
    const primary = tryRead(fp);
    if (primary) return { data: primary, source: 'primary', existed: true, quarantined: null };
    let quarantined = null;
    if (primaryExists) {
      try { quarantined = fp.replace(/\.json$/i, '') + '.corrupt-' + Date.now() + '.json'; fs.renameSync(fp, quarantined); }
      catch (_) { quarantined = null; }
    }
    for (const tmp of tmpCandidates) {
      const fromTmp = tryRead(tmp);
      if (fromTmp) { try { fs.copyFileSync(tmp, fp); } catch (_) {} return { data: fromTmp, source: 'tmp', existed, quarantined }; }
    }
    const fromPrev = tryRead(prev);
    if (fromPrev) { try { fs.copyFileSync(prev, fp); } catch (_) {} return { data: fromPrev, source: 'prev', existed, quarantined }; }
    return { data: null, source: null, existed, quarantined };
  }

  async function writeStoreToDisk(data) {
    const serialized = JSON.stringify(encryptForDisk(data));
    if (serialized.length > 50_000_000) throw new Error('Store too large');
    await atomicWriteStore(serialized);
    if (onStoreUpdated) onStoreUpdated(data);
  }

  function syncLanServerStoreFromDisk() {
    const disk = readStoreDecryptedFromDisk();
    if (disk && onStoreUpdated) onStoreUpdated(disk);
  }

  function migrateLanApiSecrets(store) {
    if (!store?.settings) return;
    if (!store.settings.lanApi) store.settings.lanApi = {};
    const la = store.settings.lanApi;
    if (store.settings.sallaWebhookSecret && !la.sallaWebhookSecret) {
      la.sallaWebhookSecret = store.settings.sallaWebhookSecret;
    }
    if (store.settings.zidWebhookSecret && !la.zidWebhookSecret) {
      la.zidWebhookSecret = store.settings.zidWebhookSecret;
    }
  }

  function ensureLanIntakeToken(store) {
    if (!store.settings) store.settings = {};
    if (!store.settings.lanApi) store.settings.lanApi = {};
    const existing = store.settings.lanApi.intakeToken;
    if (existing && !isStoreSecretMasked(existing)) return { token: existing, generated: false };
    const token = crypto.randomBytes(16).toString('hex');
    store.settings.lanApi.intakeToken = token;
    return { token, generated: true };
  }

  function ensureLanIntakePin(store) {
    if (!store.settings) store.settings = {};
    if (!store.settings.lanApi) store.settings.lanApi = {};
    const existing = store.settings.lanApi.intakePin;
    if (existing && !isStoreSecretMasked(existing)) return { pin: existing, generated: false };
    const pin = String(crypto.randomInt(100000, 1000000));
    store.settings.lanApi.intakePin = pin;
    return { pin, generated: true };
  }

  function ensureLanCalendarToken(store) {
    if (!store.settings) store.settings = {};
    if (!store.settings.lanApi) store.settings.lanApi = {};
    const existing = store.settings.lanApi.calendarToken;
    if (existing && !isStoreSecretMasked(existing)) return { token: existing, generated: false };
    const token = crypto.randomBytes(16).toString('hex');
    store.settings.lanApi.calendarToken = token;
    return { token, generated: true };
  }

  function isEncryptionAvailable() {
    return !!safeStorage.isEncryptionAvailable();
  }

  async function persistLanStoreUpdate(storeData) {
    const serialized = JSON.stringify(encryptForDisk(storeData));
    if (serialized.length > 50_000_000) throw new Error('Store too large');
    await atomicWriteStore(serialized);
    if (onStoreUpdated) onStoreUpdated(storeData);
  }

  function resolveStoreSecret(incoming, getter) {
    if (incoming && !isStoreSecretMasked(incoming)) return incoming;
    const disk = readStoreDecryptedFromDisk();
    return disk ? getter(disk) || '' : '';
  }

  return {
    STORE_SECRET_MASK,
    dataFilePath,
    encryptStoreField,
    decryptStoreField,
    encryptForDisk,
    isStoreSecretMasked,
    decryptStoreSecrets,
    maskStoreSecretsForRenderer,
    readStoreRawFromDisk,
    readStoreDecryptedFromDisk,
    mergeStoreSecretsFromDisk,
    writeStoreToDisk,
    atomicWriteStore,
    recoverStoreRaw,
    syncLanServerStoreFromDisk,
    migrateLanApiSecrets,
    ensureLanIntakeToken,
    ensureLanIntakePin,
    ensureLanCalendarToken,
    isEncryptionAvailable,
    persistLanStoreUpdate,
    resolveStoreSecret,
  };
}

module.exports = { createStoreIo, STORE_SECRET_MASK };
