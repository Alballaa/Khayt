/**
 * Khayt store snapshot helpers — export/import/backup payloads and secret redaction.
 * Loaded before app.js; collections live in app.js globals.
 */
(function (global) {
  const STORE_VERSION = 10;
  const STORE_SECRET_MASK = '__KHAYT_MASKED__';
  // Credential-shaped key names, for the data-driven provider groups below where the
  // exact field names are not known ahead of time. Mirrors lib/telemetry-scrub.js.
  const STORE_SECRET_KEY_RE = /(api[-_]?key|secret|password|passwd|token|pin|csid|pcsid|authorization|bearer|access[-_]?code|private[-_]?key)/i;

  function redactSettingsForExport(src) {
    const s = JSON.parse(JSON.stringify(src || {}));
    const mask = (obj, key) => { if (obj?.[key]) obj[key] = STORE_SECRET_MASK; };
    mask(s.emailConfig, 'apiKey');
    mask(s.emailConfig, 'smtpPassword');
    for (const k of ['authToken', 'token', 'appSid', 'secret']) mask(s.smsConfig, k);
    mask(s.accountingSync, 'secret');
    mask(s.telegram, 'botToken');
    mask(s.webhooks, 'secret');
    mask(s.eventWebhooks, 'secret');
    mask(s.ai, 'apiKey');
    mask(s.cloud, 'token');
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
    // Scoped API tokens: drop the hashes entirely on export (a hash is still a
    // credential-equivalent for offline cracking; the owner re-mints instead).
    if (Array.isArray(s.lanApi?.apiTokens)) {
      s.lanApi.apiTokens = s.lanApi.apiTokens.map(tk => ({
        id: tk.id, label: tk.label, scopes: tk.scopes, createdAt: tk.createdAt, lastUsedAt: tk.lastUsedAt,
        hash: STORE_SECRET_MASK,
      }));
    }
    // Per-subscription webhook signing secrets.
    if (Array.isArray(s.webhooks?.subscriptions)) {
      s.webhooks.subscriptions = s.webhooks.subscriptions.map(sub => (
        sub && sub.secret ? { ...sub, secret: STORE_SECRET_MASK } : sub
      ));
    }
    // Shipping carriers and BNPL providers are DATA-DRIVEN: a new one is added to a
    // catalog (renderer/carriers.js, BNPL_CATALOG), not here. A hardcoded list of ids
    // would silently export the next carrier's credentials in cleartext, so iterate
    // whatever is actually present and mask every credential-shaped key on it.
    for (const group of [s.shipping, s.bnpl]) {
      for (const provider of Object.values(group || {})) {
        if (!provider || typeof provider !== 'object') continue; // e.g. shipping.defaultCarrier
        for (const key of Object.keys(provider)) {
          if (STORE_SECRET_KEY_RE.test(key)) mask(provider, key);
        }
      }
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
