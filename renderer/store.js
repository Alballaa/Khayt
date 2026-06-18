/**
 * Khayt store snapshot helpers — export/import/backup payloads and secret redaction.
 * Loaded before app.js; collections live in app.js globals.
 */
(function (global) {
  const STORE_VERSION = 7;
  const STORE_SECRET_MASK = '__KHAYT_MASKED__';

  function redactSettingsForExport(src) {
    const s = JSON.parse(JSON.stringify(src || {}));
    const mask = (obj, key) => { if (obj?.[key]) obj[key] = STORE_SECRET_MASK; };
    mask(s.emailConfig, 'apiKey');
    mask(s.emailConfig, 'smtpPassword');
    mask(s.telegram, 'botToken');
    mask(s.webhooks, 'secret');
    mask(s.zatcaPhase2, 'csid');
    mask(s.zatcaPhase2, 'pcsid');
    ['tabby', 'tamara', 'stripe'].forEach(prov => {
      mask(s.bnpl?.[prov], 'apiKey');
      if (prov === 'tamara') mask(s.bnpl?.tamara, 'notificationToken');
    });
    if (s.lanApi) {
      ['pin', 'intakePin', 'intakeToken', 'calendarToken', 'webhookToken', 'sallaWebhookSecret', 'zidWebhookSecret']
        .forEach(k => mask(s.lanApi, k));
    }
    return s;
  }

  function redactMachinesForExport(arr) {
    return (arr || []).map(m => {
      if (!m?.printerApi) return m;
      const pa = { ...m.printerApi };
      if (pa.apiKey) pa.apiKey = STORE_SECRET_MASK;
      if (pa.accessCode) pa.accessCode = STORE_SECRET_MASK;
      return { ...m, printerApi: pa };
    });
  }

  /** Plain snapshot of all persisted collections (shallow object of live arrays). */
  function buildSnapshot(collections) {
    return { ...collections };
  }

  function buildExportPayload(collections, { redactSecrets = false } = {}) {
    const snap = buildSnapshot(collections);
    return {
      version: STORE_VERSION,
      exportedAt: new Date().toISOString(),
      ...snap,
      settings: redactSecrets ? redactSettingsForExport(snap.settings) : snap.settings,
      machines: redactSecrets ? redactMachinesForExport(snap.machines) : snap.machines,
    };
  }

  const api = {
    VERSION: STORE_VERSION,
    SECRET_MASK: STORE_SECRET_MASK,
    redactSettingsForExport,
    redactMachinesForExport,
    buildSnapshot,
    buildExportPayload,
  };

  global.KhaytStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
