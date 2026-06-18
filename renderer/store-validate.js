/**
 * Khayt store snapshot contract — shape checks and normalization on load/import.
 * @see KhaytStore.VERSION for export payload version (optional on disk snapshots).
 */
(function (global) {
  const STORE_VERSION = 7; // v7: machMaintTasks (recurring maintenance)
  const MAX_EXPORT_VERSION = STORE_VERSION;

  /** @type {readonly string[]} */
  const ARRAY_COLLECTIONS = [
    'printLog', 'inventory', 'templates', 'products', 'clients', 'printers',
    'expenses', 'machines', 'waTemplates', 'wasteLog', 'machMaintLog', 'consumables',
    'suppliers', 'purchaseOrders', 'testPrints', 'locations', 'operators',
    'waitingList', 'waitingListHistory', 'timeEntries', 'shiftLogs', 'giftCards',
    'slicerProfiles', 'envLogs', 'tombstones', 'machMaintTasks',
  ];

  function sanitisePlainObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const clean = {};
    for (const key of Object.keys(obj)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const val = obj[key];
      clean[key] = (val && typeof val === 'object' && !Array.isArray(val))
        ? sanitisePlainObject(val)
        : val;
    }
    return clean;
  }

  function isPlainObject(x) {
    return x && typeof x === 'object' && !Array.isArray(x);
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

  /** @type {Record<string, (item: unknown) => boolean>} */
  const COLLECTION_FILTERS = {
    printLog: isValidOrder,
    clients: isValidClient,
    inventory: isValidRecord,
    templates: isValidRecord,
    products: isValidRecord,
    machines: isValidRecord,
    waTemplates: isValidRecord,
    consumables: isValidRecord,
    suppliers: isValidRecord,
    purchaseOrders: isValidRecord,
    locations: isValidRecord,
    operators: isValidRecord,
    waitingList: isValidRecord,
    printers: isPlainObject,
    expenses: isPlainObject,
    wasteLog: isPlainObject,
    machMaintLog: isPlainObject,
    testPrints: isPlainObject,
    waitingListHistory: isPlainObject,
    timeEntries: isPlainObject,
    shiftLogs: isPlainObject,
    giftCards: isPlainObject,
    slicerProfiles: isPlainObject,
    envLogs: isPlainObject,
    tombstones: (t) => isPlainObject(t) && typeof t.id === 'string' && typeof t.collection === 'string',
    machMaintTasks: isValidRecord,
  };

  /**
   * @param {unknown} store
   * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
   */
  function validateStoreSnapshot(store) {
    const errors = [];
    const warnings = [];

    if (store == null) {
      errors.push('Store is null or undefined');
      return { ok: false, errors, warnings };
    }
    if (typeof store !== 'object' || Array.isArray(store)) {
      errors.push('Store must be a plain object');
      return { ok: false, errors, warnings };
    }
    if (store.__corrupt) {
      return { ok: false, errors: ['Store marked corrupt'], warnings };
    }

    if (store.version !== undefined) {
      if (typeof store.version !== 'number' || !Number.isInteger(store.version)) {
        errors.push('Export version must be an integer');
      } else if (store.version > MAX_EXPORT_VERSION) {
        warnings.push(`Export version ${store.version} is newer than supported ${MAX_EXPORT_VERSION}`);
      } else if (store.version < 1) {
        warnings.push(`Export version ${store.version} is unusually low`);
      }
    }

    if (store.settings !== undefined && !isPlainObject(store.settings)) {
      errors.push('settings must be a plain object');
    }

    for (const key of ARRAY_COLLECTIONS) {
      if (store[key] === undefined) continue;
      if (!Array.isArray(store[key])) {
        errors.push(`${key} must be an array`);
      }
    }

    return { ok: errors.length === 0, errors, warnings };
  }

  /**
   * Return a sanitized snapshot: invalid array elements dropped, settings stripped of prototype keys.
   * @param {unknown} store
   * @returns {{ normalized: object|null, warnings: string[], errors: string[] }}
   */
  function normalizeStoreSnapshot(store) {
    if (store != null && typeof store === 'object' && store.__corrupt) {
      return { normalized: store, warnings: [], errors: [] };
    }

    const { errors, warnings: validateWarnings } = validateStoreSnapshot(store);
    const warnings = [...validateWarnings];

    // Only bail completely for fatal input (unparseable / not an object). For
    // recoverable issues (a collection isn't an array, settings isn't an object,
    // bad version) we SALVAGE: the loop below skips the bad parts and keeps every
    // valid collection, so one corrupt field can't discard the whole store on
    // load (which previously risked overwriting good data with empty state).
    if (store == null || typeof store !== 'object' || Array.isArray(store)) {
      return { normalized: null, warnings, errors };
    }

    /** @type {Record<string, unknown>} */
    const normalized = {};

    for (const key of ARRAY_COLLECTIONS) {
      const raw = store[key];
      if (raw === undefined) continue;
      if (!Array.isArray(raw)) continue;
      const filter = COLLECTION_FILTERS[key] || isPlainObject;
      const kept = [];
      let dropped = 0;
      for (const item of raw) {
        if (filter(item)) kept.push(item);
        else dropped++;
      }
      if (dropped > 0) {
        warnings.push(`Dropped ${dropped} invalid item(s) from ${key}`);
      }
      normalized[key] = kept;
    }

    if (isPlainObject(store.settings)) {
      normalized.settings = sanitisePlainObject(store.settings);
    }

    if (typeof store.version === 'number') {
      normalized.version = store.version;
    }
    if (typeof store.exportedAt === 'string') {
      normalized.exportedAt = store.exportedAt;
    }

    // Surface any recoverable validation errors (e.g. a skipped non-array
    // collection) so callers can log them; the data itself was salvaged.
    return { normalized, warnings, errors };
  }

  const api = {
    STORE_VERSION,
    ARRAY_COLLECTIONS,
    sanitisePlainObject,
    isValidOrder,
    isValidClient,
    isValidInventoryItem,
    isValidRecord,
    validateStoreSnapshot,
    normalizeStoreSnapshot,
  };

  global.KhaytStoreValidate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
