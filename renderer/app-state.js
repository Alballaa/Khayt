/**
 * App collections, persistence (load/save), and store validators.
 */
/* ---------- Storage keys (versioned) ---------- */
const K = {
  LOG:       '3d_print_log_v4',
  INV:       '3d_filament_inventory_v4',
  TPL:       '3d_part_templates_v4',
  PROD:      'hub_products_v1',
  CLIENTS:   'hub_clients_v1',
  SETTINGS:  'hub_settings_v2',
  THEME:     'hub_theme',
  PRINTERS:  'hub_printers_v1',
  EXPENSES:  'hub_expenses_v1',
  MACHINES:  'hub_machines_v1',
  WA_TEMPLATES: 'hub_wa_templates_v1',
  WASTE:     'hub_waste_log_v1',
  MAINT:     'hub_maint_log_v1',
  CONSUMABLES: 'hub_consumables_v1',
  SUPPLIERS:   'hub_suppliers_v1',
  CURRENT_BUILD: 'hub_current_build_v1',
  PURCHASE_ORDERS: 'hub_purchase_orders_v1',
  TEST_PRINTS: 'hub_test_prints_v1',
  LOCATIONS: 'hub_locations_v1',
  OPERATORS: 'hub_operators_v1',
  WAITING:   'hub_waiting_v1',
  WAITING_HISTORY: 'hub_waiting_history_v1',
  TIME_ENTRIES: 'hub_time_entries_v1',
};

const STORE_SECRET_MASK = KhaytStore.SECRET_MASK;
function secretInputValue(v) { return v === STORE_SECRET_MASK ? '' : (v || ''); }
function secretInputSave(current, typed) {
  const t = (typed || '').trim();
  if (t) return t;
  return current === STORE_SECRET_MASK ? STORE_SECRET_MASK : (current || '');
}

function isSecretMasked(v) { return v === STORE_SECRET_MASK; }
function secretFieldPlaceholder(current) {
  return isSecretMasked(current) ? (t('common.secret_unchanged') || 'Leave blank to keep current') : '';
}
function migrateLanApiSettings() {
  if (!settings.lanApi) settings.lanApi = {};
  if (settings.sallaWebhookSecret && !settings.lanApi.sallaWebhookSecret) {
    settings.lanApi.sallaWebhookSecret = settings.sallaWebhookSecret;
  }
  if (settings.zidWebhookSecret && !settings.lanApi.zidWebhookSecret) {
    settings.lanApi.zidWebhookSecret = settings.zidWebhookSecret;
  }
}
function sanitizePrintHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

function defaultSettings() {
  return {
    bizEn:     'Khayt',
    bizAr:     'خيط',
    vat:       '',
    cr:        '',
    phone:     '',
    email:     '',
    addrEn:    'Riyadh, Saudi Arabia',
    addrAr:    'الرياض، المملكة العربية السعودية',
    lang:      'en',
    theme:     'dark',
    invPrefix: 'INV',
    footerEn:  'Thank you for your business!',
    footerAr:  'شكراً لتعاملكم معنا!',
    autoDeduct: true,
    lowStockThreshold: 200,
    // New in 1.3
    bankName:        '',
    accountHolder:   '',
    iban:            '',
    acceptedPayments: ['cash', 'mada', 'transfer'],
    useHijri:        true,
    useArabicNumerals: false,
    autoBackup:      true,
    enableVat:       false,
    vatRate:         15,
    bizLogo:         '',
    taglineEn:       '',
    taglineAr:       '',
    invAccentColor:  '#5E2E14',
    invTermsEn:      '',
    invTermsAr:      '',
    quotePrefix:     'QUO',
    useIcloud:       false,
    monthlyGoal:     0,
    supplierPhone:   '',
    // v2.0 — worldwide
    currency:        'SAR',
    enableZatca:     true,
    zatcaPhase2:     { enabled: false, environment: 'sandbox', csid: '', pcsid: '', cn: '', invoiceCounter: 0, lastInvoiceHash: 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI4NjJhNGRhNjM3NWQ2OGM5', org: '', city: 'Riyadh', industry: '3D Printing' },
    bnpl: {
      tabby:  { enabled: false, apiKey: '', merchantCode: '', currency: 'SAR' },
      tamara: { enabled: false, apiKey: '', notificationToken: '', currency: 'SAR', country: 'SA' },
      stripe: { enabled: false, apiKey: '', currency: 'usd', successUrl: '', cancelUrl: '' },
    },
    donationUrl:     '',
    firstRunDone:    false,
    // v3.0 additions
    minMarginPct:    0,
    expBudgets:      {},
    postChecklist:   [],
    customFields:    [],
    // Feature 7: Invoice number sequence
    invNumPrefix:    'INV',
    invNumYear:      new Date().getFullYear(),
    invNumNext:      1,
    quoteNumYear:    new Date().getFullYear(),
    quoteNumNext:    1,
    invNumFormat:    '{prefix}-{year}-{seq4}',
    // New Feature 7: Working hours schedule
    workingHours:    { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0, sat: 0, sun: 0 },
    holidays:        [],
    // Business Mode (simple | professional)
    mode:            'simple',
    firstRun:        true,
    // Stale order alert thresholds (hours per status)
    staleHours: { printing: 48, post: 24, qc: 12, pending: 72 },
    // Feature 8 (this batch): Production pause
    productionPaused: false,
    pauseReason:      '',
    pausedAt:         null,
    // Feature 5 (this batch): Filament colour library
    filamentColours:  {},
    // Feature 5 (new batch): Email notifications
    emailConfig:      { provider: 'none', apiKey: '', fromEmail: '', fromName: '', domain: '', triggers: [] },
    // Feature 7 (new batch): Operator lock
    activeOperatorId: null,
    operatorLockEnabled: false,
    // Feature 8 (new batch): Loyalty tiers
    loyaltyEnabled:   false,
    loyaltyTiers:     [],
    // Round 12: Webhooks
    webhooks:         { enabled: false, secret: '', events: {
      order_created: '', status_changed: '', payment_received: '', quote_approved: '', order_delivered: ''
    }},
    // Round 12: Break-even / fixed overhead
    fixedCosts:       [],
    // Round 12: LAN API
    lanApi:           { enabled: false, port: 3219, pin: '', intakePin: '', intakeToken: '', webhookToken: '', sallaWebhookSecret: '', zidWebhookSecret: '', tunnelEnabled: false, bindLan: false },
    // Round 12: Saved filter presets
    savedFilters:     [],
    betaAcknowledged: true, // legacy field — kept so old saved data doesn't break
    // Easy-wins batch: Calculator
    quoteValidityDays: 7,
    minOrderAmount:    0,
    rushFeeEnabled:    false,
    rushFeePct:        25,
    // Analysis batch
    wipLimits:            {},           // e.g. { printing: 3, qc: 2 }
    postProcessPresets:   [],           // [{ name, amount }]
    defaultPackagingCost: 0,
    paymentInstructions:  '',           // Shown in client portal and invoices
    // Job templates — full calculator config presets
    jobTemplates:         [],
    // Resin exposure profile presets
    resinProfiles:        [],
    // Dismissed/snoozed notifications: key → expiresAt ISO string or 'forever'
    dismissedNotifs:      {},
    // Kanban column collapsed state (array of column IDs) — synced with settings to survive backup restore
    kanbanCollapsed:      [],
    // Feature H: Exchange rates — how many base-currency units per 1 foreign unit
    exchangeRates:        {},  // e.g. { USD: 3.75, EUR: 4.12 }
    // Feature I: Email digest scheduler
    emailDigest: {
      enabled: false,
      frequency: 'daily',   // 'daily' | 'weekly'
      hour: 8,              // 0–23, hour of day to send
      weekday: 1,           // 0=Sun…6=Sat, only used when frequency='weekly'
      recipientEmail: '',   // defaults to settings.email if blank
      lastSentDate: '',     // 'YYYY-MM-DD' or 'YYYY-WW' (ISO week), prevents double-send
    },
  };
}


function defaultWaTemplates() {
  return [
    { id: 'tpl-ready',   name: 'Order Ready',      body: 'Hi {{client}}, your order {{id}} is ready! Total: {{price}} {{currency}}. Please arrange pickup or delivery. Thank you!' },
    { id: 'tpl-confirm', name: 'Order Confirmed',   body: 'Hi {{client}}, we\'ve received order {{id}} and it\'s now in our production queue. We\'ll notify you when it\'s ready.' },
    { id: 'tpl-payment', name: 'Payment Reminder',  body: 'Hi {{client}}, gentle reminder: payment of {{price}} {{currency}} is outstanding for order {{id}}. Thank you!' },
  ];
}

/* ---------- App state ---------- */
let printLog   = loadJSON(K.LOG, []);
let machines   = loadJSON(K.MACHINES, []);
let waTemplates = loadJSON(K.WA_TEMPLATES, defaultWaTemplates());
let printers   = loadJSON(K.PRINTERS, []);
let inventory  = loadJSON(K.INV, [
  { id: 'seed-1', material: 'PLA+ 2.0',   cost: 75, weight: 1000 },
  { id: 'seed-2', material: 'Sunlu PETG', cost: 85, weight: 1000 },
  { id: 'seed-3', material: 'Sunlu TPU',  cost: 110, weight: 1000 }
]);
let templates  = loadJSON(K.TPL, []);
let products   = loadJSON(K.PROD, []);
let clients    = loadJSON(K.CLIENTS, []);
let settings   = loadJSON(K.SETTINGS, defaultSettings());
let expenses   = loadJSON(K.EXPENSES, []);
let wasteLog      = loadJSON(K.WASTE, []);
let machMaintLog  = loadJSON(K.MAINT, []);
let consumables   = loadJSON(K.CONSUMABLES, []);
let suppliers     = loadJSON(K.SUPPLIERS, []);
let purchaseOrders = loadJSON(K.PURCHASE_ORDERS, []);
let testPrints     = loadJSON(K.TEST_PRINTS, []);
let locations      = loadJSON(K.LOCATIONS, []);
let operators      = loadJSON(K.OPERATORS, []);
let waitingList    = loadJSON(K.WAITING, []);
let waitingListHistory = loadJSON(K.WAITING_HISTORY, []);
let timeEntries    = loadJSON(K.TIME_ENTRIES, []);

// Batch-2 new arrays
let shiftLogs      = [];
let giftCards      = [];
let slicerProfiles = [];
let envLogs        = [];

// Runtime-only state (not persisted)
let kanbanTimerInterval = null;
let activeLocation = null; // Feature 8: null = all locations

// Feature 2 (new batch): Live printer status cache (in-memory only)
let machineStatusCache = {};


// UI state for filters and search
let logSearchTerm = '';
let logClientFilter = '';       // filter logs by specific clientId
let kanSearchTerm = '';
let kanbanCollapsed = new Set(settings?.kanbanCollapsed || []);
let logStatusFilter = '';
let logPayFilter = '';
let logRangeFilter = 'all';
let analyticsRange = 'all';

// Batch selection for the logs table
let selectedOrders = new Set();

// Tag filter for the logs table
let logTagFilter = '';
let logSortCol = 'date';  // 'date' | 'project' | 'price' | 'material' | 'status'
let logSortDir = 'desc';  // 'asc' | 'desc'
let showArchivedOrders = false;
let kanbanSortByPriority = false;

(function (global) {

function fillWaTemplate(body, order, client) {
  const name = client
    ? (localName(client))
    : (order.project || '');
  return body
    .replace(/\{\{client\}\}/g, name || '...')
    .replace(/\{\{id\}\}/g,     order.id || '')
    .replace(/\{\{price\}\}/g,    fmtMoney(order.price))
    .replace(/\{\{currency\}\}/g, currencySymbol())
    .replace(/\{\{due\}\}/g,      order.dueDate || '—')
    .replace(/\{\{status\}\}/g,   t('queue.' + order.status));
}

function sanitiseForAssign(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const val = obj[key];
    // Recurse into plain objects so nested __proto__ keys are also stripped
    clean[key] = (val && typeof val === 'object' && !Array.isArray(val)) ? sanitiseForAssign(val) : val;
  }
  return clean;
}
function isValidOrder(o) {
  return o && typeof o === 'object' &&
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.date === 'string' &&
    typeof o.status === 'string' &&
    typeof o.project === 'string';
}
function isValidClient(c) {
  return c && typeof c === 'object' && typeof c.id === 'string' && c.id.length > 0;
}
function isValidInventoryItem(i) {
  return i && typeof i === 'object' && typeof i.id === 'string' && i.id.length > 0;
}
function isValidRecord(r) {
  return r && typeof r === 'object' && typeof r.id === 'string' && r.id.length > 0;
}
let _saveAllTimer = null;

function collectStoreCollections() {
  return {
    printLog, inventory, templates, products, clients, settings, printers,
    expenses, machines, waTemplates, wasteLog, machMaintLog, consumables,
    suppliers, purchaseOrders, testPrints, locations, operators, waitingList,
    waitingListHistory, timeEntries, shiftLogs, giftCards, slicerProfiles, envLogs,
  };
}

/** Snapshot current in-memory state as a plain object. */
function buildStoreSnapshot() {
  return KhaytStore.buildSnapshot(collectStoreCollections());
}

/** Build a versioned export/backup payload; optionally redact secrets. */
function buildExportPayload({ redactSecrets = false } = {}) {
  return KhaytStore.buildExportPayload(collectStoreCollections(), { redactSecrets });
}

const redactSettingsForExport = (src) => KhaytStore.redactSettingsForExport(src);
const redactMachinesForExport = (arr) => KhaytStore.redactMachinesForExport(arr);

/** Load all collections from a store snapshot (disk load or import). */
function applyStoreFromSnapshot(store) {
  if (!store) return;
  const isObj = x => x && typeof x === 'object';
  if (store.printLog)       printLog       = store.printLog.filter(isValidOrder);
  if (store.inventory)      inventory      = store.inventory.filter(isValidRecord);
  if (store.templates)      templates      = store.templates.filter(isValidRecord);
  if (store.products)       products       = store.products.filter(isValidRecord);
  if (store.clients)        clients        = store.clients.filter(isValidClient);
  if (store.printers)       printers       = store.printers.filter(isObj);
  if (store.expenses)       expenses       = store.expenses.filter(isObj);
  if (store.machines)       machines       = store.machines.filter(isValidRecord);
  if (store.waTemplates)    waTemplates    = store.waTemplates.filter(isValidRecord);
  if (store.wasteLog)       wasteLog       = store.wasteLog.filter(isObj);
  if (store.machMaintLog)   machMaintLog   = store.machMaintLog.filter(isObj);
  if (store.consumables)    consumables    = store.consumables.filter(isValidRecord);
  if (store.suppliers)      suppliers      = store.suppliers.filter(isValidRecord);
  if (store.purchaseOrders) purchaseOrders = store.purchaseOrders.filter(isValidRecord);
  if (store.testPrints)     testPrints     = store.testPrints.filter(isObj);
  if (store.locations)      locations      = store.locations.filter(isValidRecord);
  if (store.operators)           operators           = store.operators.filter(isValidRecord);
  if (store.waitingList)         waitingList         = store.waitingList.filter(isValidRecord);
  if (store.waitingListHistory)  waitingListHistory  = store.waitingListHistory.filter(isObj);
  if (store.timeEntries)         timeEntries         = store.timeEntries.filter(isObj);
  if (store.shiftLogs)           shiftLogs           = store.shiftLogs.filter(isObj);
  if (store.giftCards)           giftCards           = store.giftCards.filter(isObj);
  if (store.slicerProfiles)      slicerProfiles      = store.slicerProfiles.filter(isObj);
  if (store.envLogs)             envLogs             = store.envLogs.filter(isObj);
  if (store.settings)            settings            = Object.assign({}, defaultSettings(), sanitiseForAssign(store.settings));
  migrateLanApiSettings();
  if (store.settings) {
    const nested = ['emailDigest', 'emailConfig', 'zatcaPhase2', 'bnpl', 'lanApi', 'exchangeRates', 'printerApi'];
    for (const key of nested) {
      if (store.settings[key] && typeof store.settings[key] === 'object' && !Array.isArray(store.settings[key])) {
        settings[key] = Object.assign({}, defaultSettings()[key] || {}, sanitiseForAssign(store.settings[key]));
      }
    }
  }
}

/** Write the store snapshot to disk; returns the IPC Promise. */
function _doSave(snapshot) {
  if (!window.hubAPI?.saveStore) return Promise.resolve();
  return window.hubAPI.saveStore(snapshot).catch(e => {
    console.error('Save failed:', e);
    toast('⚠ ' + (t('common.save_failed') || 'Save failed — check disk space'), 'error', 6000);
  });
}

function saveAll() {
  // Debounce: coalesce rapid successive saves into one disk write (300 ms window)
  if (_saveAllTimer) clearTimeout(_saveAllTimer);
  _saveAllTimer = setTimeout(() => {
    _saveAllTimer = null;
    _doSave(buildStoreSnapshot());
  }, 300);
}

/**
 * Cancel any pending debounced save and write to disk immediately.
 * Returns a Promise that resolves when the write is complete.
 * Use before quitting (update install, app close, etc.) to avoid data loss.
 */
function flushSave() {
  if (_saveAllTimer) { clearTimeout(_saveAllTimer); _saveAllTimer = null; }
  return _doSave(buildStoreSnapshot());
}

function migrateFromLocalStorage() {
  try {
    const store = {};
    const keyMap = {
      printLog:       K.LOG,
      inventory:      K.INV,
      templates:      K.TPL,
      products:       K.PROD,
      clients:        K.CLIENTS,
      settings:       K.SETTINGS,
      printers:       K.PRINTERS,
      expenses:       K.EXPENSES,
      machines:       K.MACHINES,
      waTemplates:    K.WA_TEMPLATES,
      wasteLog:       K.WASTE,
      machMaintLog:   K.MAINT,
      consumables:    K.CONSUMABLES,
      suppliers:      K.SUPPLIERS,
      purchaseOrders: K.PURCHASE_ORDERS,
    };
    for (const [name, key] of Object.entries(keyMap)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) store[name] = JSON.parse(raw);
      } catch(e) {}
    }
    if (Object.keys(store).length > 0) {
      console.debug('Migrated data from localStorage to file store');
      return store;
    }
  } catch(e) {}
  return null;
}

async function loadAll() {
  let store = null;
  try {
    store = await window.hubAPI.loadStore();
  } catch(e) {}

  if (store && store.__corrupt) {
    console.error('Store corruption detected:', store.error);
    setTimeout(() => toast('⚠ Data file could not be read — starting fresh. Check backups!', 'error', 10000), 1500);
    store = null;
  }

  if (!store) {
    store = migrateFromLocalStorage();
  }

  if (store) applyStoreFromSnapshot(store);

  // One-time migration: pull localStorage kanban state into settings
  const legacyCollapsed = localStorage.getItem('khayt_kan_collapsed');
  if (legacyCollapsed && !settings.kanbanCollapsed?.length) {
    try {
      settings.kanbanCollapsed = JSON.parse(legacyCollapsed);
      localStorage.removeItem('khayt_kan_collapsed');
      saveAll(); // persist the migration
    } catch {}
  }

  // Sync in-memory kanbanCollapsed Set from settings (ensures restore doesn't cause desync)
  kanbanCollapsed = new Set(settings.kanbanCollapsed || []);

  // One-time migration (Bug A): de-duplicate any colliding order/quote ids.
  // Quotes historically reused the invoice counter without advancing it, so two
  // quotes could share an id — and id is the primary key for every lookup.
  (function dedupeOrderIds() {
    if (settings._idDedupeDone) return;
    const seen = new Set();
    const remap = {};
    for (const o of printLog) {
      if (!o || !o.id) continue;
      if (seen.has(o.id)) {
        const oldId = o.id;
        let n = 2;
        let candidate = `${oldId}-${n}`;
        while (seen.has(candidate)) { n++; candidate = `${oldId}-${n}`; }
        o.id = candidate;
        remap[oldId] = remap[oldId] || [];
        remap[oldId].push(candidate);
      }
      seen.add(o.id);
    }
    // Seed the quote counter past the highest existing quote number for this year
    // so freshly-minted quotes don't immediately collide with pre-existing ones.
    const yr = new Date().getFullYear();
    const qPrefix = settings.quotePrefix || 'QUO';
    let maxQ = 0;
    for (const o of printLog) {
      const m = (o.id || '').match(new RegExp('^' + qPrefix + '-' + yr + '-(\\d+)'));
      if (m) maxQ = Math.max(maxQ, parseInt(m[1], 10) || 0);
    }
    if (settings.quoteNumNext === undefined || (settings.quoteNumYear === yr && settings.quoteNumNext <= maxQ)) {
      settings.quoteNumYear = yr;
      settings.quoteNumNext = maxQ + 1;
    }
    settings._idDedupeDone = true;
    if (Object.keys(remap).length) {
      console.warn('[migration] de-duplicated colliding order ids:', remap);
      saveAll();
    }
  })();

  // Feature 4 (batch-2): Process any due recurring orders on load
  processRecurringOrders();
}

function pruneExpiredNotifs() {
  const dismissed = settings.dismissedNotifs;
  if (!dismissed || typeof dismissed !== 'object') return;
  const now = new Date().toISOString();
  let changed = false;
  for (const key of Object.keys(dismissed)) {
    const val = dismissed[key];
    if (val !== 'forever' && val < now) {
      delete dismissed[key];
      changed = true;
    }
  }
  if (changed) saveAll();
}

  const api = {
    defaultSettings,
    defaultWaTemplates,
    fillWaTemplate,
    collectStoreCollections,
    buildStoreSnapshot,
    buildExportPayload,
    applyStoreFromSnapshot,
    saveAll,
    flushSave,
    migrateFromLocalStorage,
    loadAll,
    pruneExpiredNotifs,
    sanitiseForAssign,
    isValidOrder,
    isValidClient,
    isValidInventoryItem,
    isValidRecord,
  };
  Object.assign(global, api);
  global.KhaytAppState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
