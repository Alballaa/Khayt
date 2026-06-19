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
    return out;
  }

  async function writeStoreToDisk(data) {
    const fp = dataFilePath();
    const tmp = fp + '.tmp';
    const serialized = JSON.stringify(encryptForDisk(data));
    if (serialized.length > 50_000_000) throw new Error('Store too large');
    await fs.promises.writeFile(tmp, serialized, 'utf8');
    await fs.promises.rename(tmp, fp);
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
    const fp = dataFilePath();
    const tmp = fp + '.tmp';
    await fs.promises.writeFile(tmp, serialized, 'utf8');
    await fs.promises.rename(tmp, fp);
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
