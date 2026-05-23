/* ============================================================
   Khayt — main app logic
   Renderer state, persisted to localStorage. Full product images
   stored on disk via hubAPI (preload). Thumbnails live inline.
   ============================================================ */

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
};

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

// Runtime-only state (not persisted)
let kanbanTimerInterval = null;

// In-memory only — the current quote workspace
let currentBuild = [];
let currentBuildFromProductId = null;
let currentClientId = null;
let currentExtraLines = [];
// Extra material rows for the current part being configured
let currentExtraMaterials = [];

// Feature 5: Price tiers for the current part being configured
let currentPriceTiers = [];

// Restore in-progress build from previous session
(function restoreCurrentBuild() {
  const saved = loadJSON(K.CURRENT_BUILD, null);
  if (saved && Array.isArray(saved.parts) && saved.parts.length > 0) {
    currentBuild = saved.parts;
    currentBuildFromProductId = saved.productId || null;
    currentClientId = saved.clientId || null;
    currentExtraLines = saved.extraLines || [];
    // Show toast after DOM ready
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => toast(t('calc.draft_restored'), 'info', 3000), 600);
    }, { once: true });
  }
})();

function saveBuildDraft() {
  if (currentBuild.length === 0) {
    localStorage.removeItem(K.CURRENT_BUILD);
    return;
  }
  saveJSON(K.CURRENT_BUILD, {
    parts: currentBuild,
    productId: currentBuildFromProductId,
    clientId: currentClientId,
    extraLines: currentExtraLines,
    savedAt: new Date().toISOString(),
  });
}

// UI state for filters and search
let logSearchTerm = '';
let logStatusFilter = '';
let logPayFilter = '';
let logRangeFilter = 'all';
let analyticsRange = 'all';
let catalogSearchTerm = '';
let clientSearchTerm = '';
let portfolioSearchTerm = '';

// Batch selection for the logs table
let selectedOrders = new Set();

// Tag filter for the logs table
let logTagFilter = '';

// Filament manufacturer catalog (loaded from filaments-db.json)
let filamentsDB = [];
fetch('./filaments-db.json').then(r => r.json()).then(data => { filamentsDB = data; }).catch(() => {});

// Undo stack — pushed when a destructive action runs; popped if user clicks "Undo"
const undoStack = [];

/* ============================================================
   Helpers
   ============================================================ */
function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function num(v, fallback = 0) { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; }
function clampPositive(v) { return Math.max(0, num(v, 0)); }
function fmtMoney(n) { return (Math.round((+n || 0) * 100) / 100).toFixed(2); }

/* ── Currency catalogue ────────────────────────────────────────────────── */
const CURRENCIES = {
  SAR: { symbol: 'SAR', label: 'Saudi Riyal (SAR)',            pos: 'after'  },
  AED: { symbol: 'AED', label: 'UAE Dirham (AED)',             pos: 'after'  },
  KWD: { symbol: 'KWD', label: 'Kuwaiti Dinar (KWD)',          pos: 'after'  },
  BHD: { symbol: 'BHD', label: 'Bahraini Dinar (BHD)',         pos: 'after'  },
  QAR: { symbol: 'QAR', label: 'Qatari Riyal (QAR)',           pos: 'after'  },
  OMR: { symbol: 'OMR', label: 'Omani Rial (OMR)',             pos: 'after'  },
  EGP: { symbol: 'EGP', label: 'Egyptian Pound (EGP)',         pos: 'after'  },
  MAD: { symbol: 'MAD', label: 'Moroccan Dirham (MAD)',        pos: 'after'  },
  TND: { symbol: 'TND', label: 'Tunisian Dinar (TND)',         pos: 'after'  },
  DZD: { symbol: 'DZD', label: 'Algerian Dinar (DZD)',        pos: 'after'  },
  IQD: { symbol: 'IQD', label: 'Iraqi Dinar (IQD)',            pos: 'after'  },
  JOD: { symbol: 'JOD', label: 'Jordanian Dinar (JOD)',        pos: 'after'  },
  USD: { symbol: '$',   label: 'US Dollar (USD)',              pos: 'before' },
  EUR: { symbol: '€',   label: 'Euro (EUR)',                   pos: 'before' },
  GBP: { symbol: '£',   label: 'British Pound (GBP)',          pos: 'before' },
  CAD: { symbol: 'CA$', label: 'Canadian Dollar (CAD)',        pos: 'before' },
  AUD: { symbol: 'A$',  label: 'Australian Dollar (AUD)',      pos: 'before' },
  CHF: { symbol: 'CHF', label: 'Swiss Franc (CHF)',            pos: 'before' },
  TRY: { symbol: '₺',   label: 'Turkish Lira (TRY)',           pos: 'before' },
  INR: { symbol: '₹',   label: 'Indian Rupee (INR)',           pos: 'before' },
  JPY: { symbol: '¥',   label: 'Japanese Yen (JPY)',           pos: 'before' },
  CNY: { symbol: '¥',   label: 'Chinese Yuan (CNY)',           pos: 'before' },
  KRW: { symbol: '₩',   label: 'South Korean Won (KRW)',       pos: 'before' },
  BRL: { symbol: 'R$',  label: 'Brazilian Real (BRL)',         pos: 'before' },
  MXN: { symbol: '$',   label: 'Mexican Peso (MXN)',           pos: 'before' },
  ZAR: { symbol: 'R',   label: 'South African Rand (ZAR)',     pos: 'before' },
  NGN: { symbol: '₦',   label: 'Nigerian Naira (NGN)',         pos: 'before' },
};
// Returns "$ 12.50" or "12.50 SAR" depending on currency setting
function fmtPrice(n) {
  const cur = CURRENCIES[settings?.currency] || CURRENCIES.SAR;
  const num = fmtMoney(n);
  return cur.pos === 'before' ? `${cur.symbol} ${num}` : `${num} ${cur.symbol}`;
}
// Just the currency symbol/code for use as a unit label
function currencySymbol() {
  return (CURRENCIES[settings?.currency] || CURRENCIES.SAR).symbol;
}
// Format a money value in a specific currency (for per-client currency, Feature 1)
function fmtMoneyIn(n, currencyCode) {
  const cur = CURRENCIES[currencyCode] || CURRENCIES[settings?.currency] || CURRENCIES.SAR;
  const val = fmtMoney(n);
  return cur.pos === 'before' ? `${cur.symbol} ${val}` : `${val} ${cur.symbol}`;
}
// Return the currency for a given client id (falls back to settings default)
function clientCurrency(clientId) {
  if (!clientId) return settings.currency || 'SAR';
  const c = clients.find(x => x.id === clientId);
  return (c && c.currency) ? c.currency : (settings.currency || 'SAR');
}
// Update all [data-i18n="common.currency"] elements after currency changes
function refreshCurrencyLabels() {
  const sym = currencySymbol();
  document.querySelectorAll('[data-i18n="common.currency"]').forEach(el => {
    el.textContent = sym;
  });
}
// ── Shared helpers ────────────────────────────────────────────────────────────
/** Localised name — picks AR or EN depending on current language. */
function localName(obj) {
  return i18n.current === 'ar' ? (obj.nameAr || obj.nameEn) : (obj.nameEn || obj.nameAr);
}
/** Normalise payment status with fallback. */
function payStatus(order) { return order.paymentStatus || 'unpaid'; }
/** Escape a value for CSV (RFC 4180). */
function csvEsc(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
/** Trigger a file download from a Blob. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
/** Return printLog entries matching the current log filter UI state. */
function getFilteredLogs() {
  return printLog.filter(log => {
    if (logStatusFilter !== 'all' && log.status !== logStatusFilter) return false;
    if (logPayFilter    !== 'all' && payStatus(log) !== logPayFilter) return false;
    if (!inRange(log.date, logRangeFilter, 'log')) return false;
    if (logTagFilter && !(log.tags || []).includes(logTagFilter)) return false;
    if (logSearchTerm) {
      const hay = [log.project, log.client, log.id, log.material, ...(log.tags || [])].join(' ').toLowerCase();
      if (!hay.includes(logSearchTerm.toLowerCase())) return false;
    }
    return true;
  });
}

/** Parse a comma-separated tags string into a sorted, deduped array of trimmed tags. */
function parseTags(str) {
  return [...new Set((str || '').split(',').map(t => t.trim()).filter(Boolean))].sort();
}

/** Render tag chips HTML for display in table rows and kanban cards. */
function renderTagChips(tags, clickable = false) {
  if (!tags || tags.length === 0) return '';
  return tags.map(tag => clickable
    ? `<span class="tag-chip" data-act="filter-tag" data-tag="${escapeHtml(tag)}" title="${escapeHtml(t('tag.filter_hint'))}">${escapeHtml(tag)}</span>`
    : `<span class="tag-chip">${escapeHtml(tag)}</span>`
  ).join('');
}

/** Collect all unique tags used across all orders (for filter dropdown). */
function getAllTags() {
  const all = new Set();
  for (const o of printLog) { for (const tag of (o.tags || [])) all.add(tag); }
  return [...all].sort();
}
function uid(prefix = 'ID') { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5).toUpperCase(); }
function nextInvoiceSeq() {
  let max = 0;
  for (const o of printLog) {
    const m = /-(\d+)$/.exec(o.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return (max + 1).toString().padStart(4, '0');
}
function formatDueDateBadge(dueDate) {
  if (!dueDate) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(dueDate + 'T00:00:00');
  const diff  = Math.round((due - today) / 86400000);
  let cls, label;
  if (diff < 0)       { cls = 'overdue';   label = t('oe.due_overdue', { n: Math.abs(diff) }); }
  else if (diff === 0){ cls = 'due-today'; label = t('oe.due_today'); }
  else if (diff <= 3) { cls = 'due-soon';  label = t('oe.due_soon',  { n: diff }); }
  else                { cls = 'due-ok';    label = t('oe.due_in',    { n: diff }); }
  return `<span class="due-badge ${cls}">${escapeHtml(label)}</span>`;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  })[c]);
}
function initials(name) {
  const n = String(name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]).join('').toUpperCase();
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
    donationUrl:     '',
    firstRunDone:    false,
    // v3.0 additions
    minMarginPct:    0,
    expBudgets:      {},
    postChecklist:   [],
    customFields:    [],
  };
}

function defaultWaTemplates() {
  return [
    { id: 'tpl-ready',   name: 'Order Ready',      body: 'Hi {{client}}, your order {{id}} is ready! Total: {{price}} {{currency}}. Please arrange pickup or delivery. Thank you!' },
    { id: 'tpl-confirm', name: 'Order Confirmed',   body: 'Hi {{client}}, we\'ve received order {{id}} and it\'s now in our production queue. We\'ll notify you when it\'s ready.' },
    { id: 'tpl-payment', name: 'Payment Reminder',  body: 'Hi {{client}}, gentle reminder: payment of {{price}} {{currency}} is outstanding for order {{id}}. Thank you!' },
  ];
}

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

function saveAll() {
  const store = {
    printLog, inventory, templates, products, clients, settings, printers,
    expenses, machines, waTemplates, wasteLog, machMaintLog, consumables,
    suppliers, purchaseOrders,
  };
  if (window.hubAPI?.saveStore) {
    window.hubAPI.saveStore(store).catch(e => console.error('Save failed:', e));
  }
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
      console.log('Migrated data from localStorage to file store');
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

  if (!store) {
    store = migrateFromLocalStorage();
  }

  if (store) {
    if (store.printLog)       printLog       = store.printLog;
    if (store.inventory)      inventory      = store.inventory;
    if (store.templates)      templates      = store.templates;
    if (store.products)       products       = store.products;
    if (store.clients)        clients        = store.clients;
    if (store.printers)       printers       = store.printers;
    if (store.expenses)       expenses       = store.expenses;
    if (store.machines)       machines       = store.machines;
    if (store.waTemplates)    waTemplates    = store.waTemplates;
    if (store.wasteLog)       wasteLog       = store.wasteLog;
    if (store.machMaintLog)   machMaintLog   = store.machMaintLog;
    if (store.consumables)    consumables    = store.consumables;
    if (store.suppliers)      suppliers      = store.suppliers;
    if (store.purchaseOrders) purchaseOrders = store.purchaseOrders;
    if (store.settings)       settings       = Object.assign({}, defaultSettings(), store.settings);
  }
}

/* ============================================================
   Date helpers (filtering by month/quarter/year)
   ============================================================ */
// Custom range state — set when any filter select changes to 'custom'
let customRangeFrom = { log: '', analytics: '', expenses: '' };
let customRangeTo   = { log: '', analytics: '', expenses: '' };

function inRange(dateStr, range, ctx) {
  if (!range || range === 'all') return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d)) return false;
  if (range === 'custom') {
    const from = ctx ? customRangeFrom[ctx] : '';
    const to   = ctx ? customRangeTo[ctx]   : '';
    if (!from && !to) return true;
    const ds = dateStr.slice(0, 10);
    if (from && ds < from) return false;
    if (to   && ds > to)   return false;
    return true;
  }
  const now = new Date();
  if (range === 'month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (range === 'last_month') {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
  }
  if (range === 'quarter') {
    return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  }
  if (range === 'year') {
    return d.getFullYear() === now.getFullYear();
  }
  return true;
}

/* ============================================================
   Locale helpers — Hijri date + Arabic numerals
   ============================================================ */
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function toArabicNumerals(s) {
  return String(s ?? '').replace(/[0-9]/g, d => ARABIC_DIGITS[+d]);
}
// Converts an ISO date string to a Saudi Hijri (Umm al-Qura) display string,
// e.g. "٤ ذو القعدة ١٤٤٧" or "1447/11/04". Defaults to short numeric.
function hijriDate(isoDate, format = 'short') {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (format === 'long') {
      return d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
    }
    // Compact YYYY/MM/DD style
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value || '';
    const m = parts.find(p => p.type === 'month')?.value || '';
    const dd = parts.find(p => p.type === 'day')?.value || '';
    return `${y}/${m}/${dd}`;
  } catch { return ''; }
}

/* ============================================================
   Toasts (now with optional undo button)
   ============================================================ */
function toast(msg, kind = 'info', ms = 2800, opts = {}) {
  const c = $('#toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  if (opts.undo) {
    const btn = document.createElement('button');
    btn.className = 'undo-btn';
    btn.textContent = t('oe.undo');
    btn.addEventListener('click', () => {
      try { opts.undo(); } catch (e) { console.error(e); }
      el.remove();
    });
    el.appendChild(btn);
  }
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; }, ms - 250);
  setTimeout(() => el.remove(), ms);
}

/* ============================================================
   Modals (confirm + form host)
   ============================================================ */
function confirmModal(message, { okText, cancelText, danger = false } = {}) {
  return new Promise(resolve => {
    const mount = $('#modalMount');
    mount.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h3>${escapeHtml(t('common.confirm'))}</h3>
          <p>${escapeHtml(message)}</p>
          <div class="btn-row">
            <button class="btn ghost" data-act="cancel">${escapeHtml(cancelText || t('common.cancel'))}</button>
            <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${escapeHtml(okText || t('common.confirm'))}</button>
          </div>
        </div>
      </div>`;
    const cleanup = (val) => { mount.innerHTML = ''; resolve(val); };
    mount.querySelector('[data-act="ok"]').addEventListener('click', () => cleanup(true));
    mount.querySelector('[data-act="cancel"]').addEventListener('click', () => cleanup(false));
    mount.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) cleanup(false);
    });
  });
}

function openFormModal({ title, bodyHtml, onMount, onSave, saveLabel, sizeLg = true, noSave = false }) {
  const mount = $('#modalMount');
  mount.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal ${sizeLg ? 'modal-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-header">
          <h3 id="modalTitle">${escapeHtml(title)}</h3>
          <button class="btn ghost small" data-act="cancel" aria-label="Close">×</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">
          ${noSave
            ? `<button class="btn ghost" data-act="cancel">${escapeHtml(t('common.close') || 'Close')}</button>`
            : `<button class="btn ghost" data-act="cancel">${escapeHtml(t('common.cancel'))}</button>
               <button class="btn primary" data-act="save">${escapeHtml(saveLabel || t('common.save'))}</button>`
          }
        </div>
      </div>
    </div>`;
  const modal = mount.querySelector('.modal');
  const close = () => {
    document.removeEventListener('keydown', escHandler);
    mount.innerHTML = '';
  };
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  mount.querySelectorAll('[data-act="cancel"]').forEach(b => b.addEventListener('click', close));
  mount.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) close();
  });
  if (!noSave) {
    mount.querySelector('[data-act="save"]').addEventListener('click', async () => {
      try {
        const result = await onSave(modal);
        if (result !== false) close();
      } catch (err) {
        console.error('Modal save error:', err);
        toast(String(err.message || err), 'error');
      }
    });
  }
  if (onMount) onMount(modal);
  // Move focus into modal for keyboard/screen-reader users
  const firstInput = modal.querySelector('input, select, textarea, button');
  if (firstInput) firstInput.focus();
}

/* ============================================================
   Theme
   ============================================================ */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'dark' : 'light';
  } else {
    root.dataset.theme = theme;
  }
  localStorage.setItem(K.THEME, theme);
}

/* ============================================================
   Tabs
   ============================================================ */
function switchTab(tabId) {
  $$('.tab-content').forEach(el => el.classList.remove('active'));
  $$('.tab-btn').forEach(el => el.classList.remove('active'));
  $('#' + tabId)?.classList.add('active');
  $(`.tab-btn[data-tab="${tabId}"]`)?.classList.add('active');

  if (tabId === 'dashboard-tab')  renderDashboard();
  if (tabId === 'expenses-tab')   { renderExpenses(); populateExpOrderDatalist(); }
  if (tabId === 'catalog-tab')    renderCatalog();
  if (tabId === 'clients-tab')    renderClients();
  if (tabId === 'queue-tab')      renderKanban();
  if (tabId === 'analytics-tab')  renderAnalytics();
  if (tabId === 'logs-tab')       renderLogs();
  if (tabId === 'portfolio-tab')  renderPortfolio();
  if (tabId === 'waste-tab')      renderWasteLog();
  if (tabId === 'inventory-tab')  { renderConsumables(); renderSuppliers(); }
}

/* ============================================================
   Calculator
   ============================================================ */
// Pure function: compute base cost (before margin) from a part object.
// Used for parts loaded from the catalog as well as the live calculator form.
function computePartBaseCost(part) {
  const spoolCost   = Math.max(0, +part.spoolCost   || 0);
  const spoolWeight = Math.max(1, +part.spoolWeight || 1);
  const printWeight = Math.max(0, +part.printWeight || 0);
  const materialCost = (spoolCost / spoolWeight) * printWeight;

  const printTime = Math.max(0, +part.printTime || 0);
  const wearCost  = printTime * Math.max(0, +part.wearRate || 0);

  const powerDraw = Math.max(0, +part.powerDraw || 0);
  const elecRate  = Math.max(0, +part.elecRate  || 0);
  const powerCost = printTime * (powerDraw / 1000) * elecRate;

  const prepTime  = Math.max(0, +part.prepTime  || 0);
  const postTime  = Math.max(0, +part.postTime  || 0);
  const laborRate = Math.max(0, +part.laborRate || 0);
  const laborCost = (prepTime + postTime) * laborRate;

  const failureRate = Math.max(0, +part.failureRate || 0);
  // Extra materials cost (Feature 8)
  let extraMatCost = 0;
  for (const em of (part.extraMaterials || [])) {
    if (!em.material || !em.weight) continue;
    const invItem = inventory.find(i => i.material === em.material);
    if (invItem && invItem.cost > 0 && invItem.weight > 0) {
      const pricePerKg = (invItem.cost / invItem.weight) * 1000;
      extraMatCost += (em.weight / 1000) * pricePerKg;
    }
  }
  const baseCost = materialCost + wearCost + powerCost + laborCost + extraMatCost;
  const totalCost = baseCost + (baseCost * (failureRate / 100));
  return totalCost;
}

// Feature 5: Check if a price tier applies and return the override total (final price), or null
function getActivePriceTier(part) {
  if (!part.priceTiers || part.priceTiers.length === 0 || !part.qty) return null;
  const sorted = [...part.priceTiers].sort((a, b) => a.minQty - b.minQty);
  return [...sorted].reverse().find(ti => +part.qty >= +ti.minQty) || null;
}

function computePartBreakdown(part) {
  const spoolCost   = Math.max(0, +part.spoolCost   || 0);
  const spoolWeight = Math.max(1, +part.spoolWeight || 1);
  const printWeight = Math.max(0, +part.printWeight || 0);
  const material    = (spoolCost / spoolWeight) * printWeight;
  const printTime   = Math.max(0, +part.printTime   || 0);
  const machine     = printTime * Math.max(0, +part.wearRate  || 0)
                    + printTime * (Math.max(0, +part.powerDraw || 0) / 1000) * Math.max(0, +part.elecRate || 0);
  const prepTime    = Math.max(0, +part.prepTime  || 0);
  const postTime    = Math.max(0, +part.postTime  || 0);
  const labor       = (prepTime + postTime) * Math.max(0, +part.laborRate || 0);
  const base        = material + machine + labor;
  const buffer      = base * (Math.max(0, +part.failureRate || 0) / 100);
  return { material, machine, labor, buffer };
}

function calculateLivePartCost() {
  // Snapshot the DOM into a part-shaped object and reuse the pure helper.
  return computePartBaseCost({
    spoolCost:   $('#spoolCost').value,
    spoolWeight: $('#spoolWeight').value,
    printWeight: $('#printWeight').value,
    printTime:   $('#printTime').value,
    wearRate:    $('#wearRate').value,
    powerDraw:   $('#powerDraw').value,
    elecRate:    $('#elecRate').value,
    prepTime:    $('#prepTime').value,
    postTime:    $('#postTime').value,
    laborRate:   $('#laborRate').value,
    failureRate: $('#failureRate').value,
    extraMaterials: currentExtraMaterials.filter(m => m.material && m.weight > 0),
  });
}

function updateGrandTotal() {
  const snap = {
    spoolCost: $('#spoolCost').value, spoolWeight: $('#spoolWeight').value,
    printWeight: $('#printWeight').value, printTime: $('#printTime').value,
    wearRate: $('#wearRate').value, powerDraw: $('#powerDraw').value,
    elecRate: $('#elecRate').value, prepTime: $('#prepTime').value,
    postTime: $('#postTime').value, laborRate: $('#laborRate').value,
    failureRate: $('#failureRate').value,
    extraMaterials: currentExtraMaterials.filter(m => m.material && m.weight > 0),
  };
  const bd = computePartBreakdown(snap);
  const liveBase = bd.material + bd.machine + bd.labor + bd.buffer;
  const qty = Math.max(1, Math.round(num($('#partQty').value, 1)));
  const margin = clampPositive($('#margin').value);
  $('#partLivePrice').textContent = fmtMoney(liveBase * (1 + margin / 100) * qty);

  // Cost breakdown chips
  const bdEl = $('#costBreakdown');
  if (bdEl) {
    const items = [
      { key: 'calc.bd.material', val: bd.material },
      { key: 'calc.bd.machine',  val: bd.machine  },
      { key: 'calc.bd.labor',    val: bd.labor    },
      { key: 'calc.bd.buffer',   val: bd.buffer   },
    ].filter(x => x.val >= 0.01);
    if (items.length > 0) {
      bdEl.innerHTML = items.map(x =>
        `<span class="bd-item"><span class="bd-label">${escapeHtml(t(x.key))}</span> <b>${fmtMoney(x.val)}</b></span>`
      ).join('');
      bdEl.style.display = 'flex';
    } else {
      bdEl.style.display = 'none';
    }
  }

  let totalBase = 0;
  if (currentBuild.length > 0) {
    totalBase = currentBuild.reduce((s, p) => s + p.baseCost, 0);
  } else {
    totalBase = liveBase * qty;
  }
  const discountPct = Math.min(100, Math.max(0, num($('#discountPct').value, 0)));
  const shippingCost = Math.max(0, num($('#shippingCost')?.value, 0));
  const extraLinesTotal = currentExtraLines.reduce((s, l) => s + Math.max(0, +l.amount || 0), 0);
  const priceBeforeDiscount = totalBase * (1 + margin / 100);
  const discountAmt = priceBeforeDiscount * discountPct / 100;
  const finalPrice = priceBeforeDiscount - discountAmt + shippingCost + extraLinesTotal;
  $('#finalPrice').textContent = fmtMoney(finalPrice);

  const discountLine = $('#discountLine');
  if (discountLine) {
    if (discountPct > 0) {
      discountLine.textContent = `−${fmtMoney(discountAmt)} (${discountPct}%)`;
      discountLine.style.display = 'inline';
    } else {
      discountLine.style.display = 'none';
    }
  }

  // Min-margin warning
  const marginWarn = $('#marginWarning');
  if (marginWarn) {
    const minPct = num(settings.minMarginPct, 0);
    const actualMarginPct = finalPrice > 0 ? ((finalPrice - (totalBase + shippingCost + extraLinesTotal)) / finalPrice) * 100 : margin;
    if (minPct > 0 && actualMarginPct < minPct) {
      marginWarn.textContent = t('calc.margin_warn', { min: minPct.toFixed(0), actual: actualMarginPct.toFixed(0) });
      marginWarn.style.display = 'block';
    } else {
      marginWarn.style.display = 'none';
    }
  }
}

function snapshotPartFromForm() {
  const filamentSelect = $('#filamentSelect');
  const opt = filamentSelect.options[filamentSelect.selectedIndex];
  const qty = Math.max(1, Math.round(num($('#partQty').value, 1)));
  const unitCost = calculateLivePartCost();
  return {
    name:        $('#partName').value.trim() || t('calc.part.name_ph'),
    material:    opt?.text || '',
    filamentId:  filamentSelect.value,
    spoolCost:   clampPositive($('#spoolCost').value),
    spoolWeight: Math.max(1, num($('#spoolWeight').value, 1)),
    printWeight: clampPositive($('#printWeight').value),
    printTime:   clampPositive($('#printTime').value),
    wearRate:    clampPositive($('#wearRate').value),
    powerDraw:   clampPositive($('#powerDraw').value),
    elecRate:    clampPositive($('#elecRate').value),
    prepTime:    clampPositive($('#prepTime').value),
    postTime:    clampPositive($('#postTime').value),
    laborRate:   clampPositive($('#laborRate').value),
    failureRate: clampPositive($('#failureRate').value),
    qty,
    unitCost,
    baseCost:    (() => {
      // Feature 5: If a price tier applies, baseCost is the tier total (already includes margin)
      // divided by margin factor so the quote flow doesn't double-apply margin
      const tiers = currentPriceTiers.filter(ti => ti.minQty > 0 && ti.pricePerUnit > 0);
      if (tiers.length > 0) {
        const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
        const tier = [...sorted].reverse().find(ti => qty >= ti.minQty);
        if (tier) {
          const marginPct = Math.max(0, num($('#margin').value, 0));
          const tierTotal = +tier.pricePerUnit * qty;
          // Store as baseCost such that baseCost * (1 + margin/100) ≈ tierTotal
          return marginPct > 0 ? tierTotal / (1 + marginPct / 100) : tierTotal;
        }
      }
      return unitCost * qty;
    })(),
    layerHeight: num($('#layerHeight')?.value, 0) || null,
    infill:      num($('#infill')?.value, 0) || null,
    profile:     ($('#printProfile')?.value || '').trim() || null,
    machineId:   $('#partMachineId')?.value || null,
    fileRef:     ($('#partFileRef')?.value || '').trim() || '',
    extraMaterials: currentExtraMaterials.filter(m => m.material && m.weight > 0).map(m => ({ ...m })),
    priceTiers:  currentPriceTiers.filter(ti => ti.minQty > 0 && ti.pricePerUnit > 0).map(ti => ({ ...ti })),
    spoolId:     $('#spoolIdPicker')?.value || null,
  };
}

function addPart() {
  const printWeight = clampPositive($('#printWeight').value);
  const printTime = clampPositive($('#printTime').value);
  if (printWeight <= 0 && printTime <= 0) {
    toast(t('calc.quote.empty'), 'error');
    return;
  }
  const part = snapshotPartFromForm();
  part.id = uid('PRT');
  currentBuild.push(part);

  $('#partName').value = '';
  $('#printWeight').value = '';
  $('#printTime').value = '';
  $('#partQty').value = '1';
  if ($('#layerHeight'))  $('#layerHeight').value  = '';
  if ($('#infill'))       $('#infill').value        = '';
  if ($('#printProfile')) $('#printProfile').value  = '';
  currentExtraMaterials = [];
  currentPriceTiers = [];
  renderExtraMaterials();
  renderPriceTiers();
  const addBtn = $('#btnAddPart');
  if (addBtn && addBtn.dataset.editing) {
    addBtn.textContent = t('calc.quote.add_part');
    delete addBtn.dataset.editing;
  }
  renderBuild();
  saveBuildDraft();
}

function removePart(index) {
  currentBuild.splice(index, 1);
  renderBuild();
  saveBuildDraft();
}

function editPart(index) {
  const part = currentBuild[index];
  if (!part) return;

  // Restore form fields from the saved part snapshot
  $('#partName').value      = part.name;
  $('#partQty').value       = part.qty || 1;
  $('#printWeight').value   = part.printWeight || '';
  $('#printTime').value     = part.printTime || '';
  $('#spoolCost').value     = part.spoolCost || '';
  $('#spoolWeight').value   = part.spoolWeight || '';
  $('#wearRate').value      = part.wearRate || '';
  $('#powerDraw').value     = part.powerDraw || '';
  $('#elecRate').value      = part.elecRate || '';
  $('#prepTime').value      = part.prepTime || '';
  $('#postTime').value      = part.postTime || '';
  $('#laborRate').value     = part.laborRate || '';
  $('#failureRate').value   = part.failureRate || '';

  if (part.filamentId) {
    const sel = $('#filamentSelect');
    const opt = Array.from(sel.options).find(o => o.value === part.filamentId);
    if (opt) sel.value = part.filamentId;
  }
  const partMachSel = $('#partMachineId');
  if (partMachSel) partMachSel.value = part.machineId || '';

  // Restore extra materials
  currentExtraMaterials = (part.extraMaterials || []).map(m => ({ ...m }));
  renderExtraMaterials();

  // Feature 5: Restore price tiers
  currentPriceTiers = (part.priceTiers || []).map(ti => ({ ...ti }));
  renderPriceTiers();

  currentBuild.splice(index, 1);
  renderBuild();
  calculateLivePartCost();

  // Scroll form into view and highlight the add button
  const addBtn = $('#btnAddPart');
  if (addBtn) {
    addBtn.textContent = t('calc.cart.update');
    addBtn.dataset.editing = '1';
    addBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function renderBuild() {
  const tbody = $('#buildTableBody');
  if (currentBuild.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty" style="text-align:center;padding:14px;color:var(--text-muted);font-size:12.5px;">${escapeHtml(t('calc.quote.empty'))}</td></tr>`;
  } else {
    tbody.innerHTML = currentBuild.map((part, i) => {
      const psHint = [
        part.layerHeight ? `${part.layerHeight}mm` : '',
        part.infill      ? `${part.infill}%`        : '',
        part.profile     || ''
      ].filter(Boolean).join(' · ');
      const partMachine = part.machineId ? machines.find(m => m.id === part.machineId) : null;
      // Feature 5: Check if a price tier is applied
      let tierBadge = '';
      if (part.priceTiers && part.priceTiers.length > 0 && part.qty > 0) {
        const sorted = [...part.priceTiers].sort((a, b) => a.minQty - b.minQty);
        const tier = [...sorted].reverse().find(ti => +part.qty >= +ti.minQty);
        if (tier) {
          tierBadge = `<span class="tier-applied-badge">${escapeHtml(t('calc.tier_applied', { n: tier.minQty }))}</span>`;
        }
      }
      return `
      <tr>
        <td>
          <strong>${escapeHtml(part.name)}</strong>
          ${partMachine ? `<span class="machine-badge" style="background:${escapeHtml(partMachine.color)}; font-size:10px; padding:1px 6px; vertical-align:middle; margin-inline-start:4px;">${escapeHtml(partMachine.name)}</span>` : ''}
          ${tierBadge}
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(part.material)}</div>
          ${(part.extraMaterials || []).filter(m => m.material).map(m =>
            `<div style="font-size:11px; color:var(--text-muted); margin-inline-start:8px;">+ ${escapeHtml(m.material)} ${m.weight ? m.weight + 'g' : ''}</div>`
          ).join('')}
          ${psHint ? `<div style="font-size:10.5px; color:var(--text-muted); margin-top:1px; font-style:italic;">${escapeHtml(psHint)}</div>` : ''}
          ${part.fileRef ? `<div class="part-file-ref">📎 ${escapeHtml(part.fileRef)}</div>` : ''}
        </td>
        <td style="text-align: end; font-variant-numeric: tabular-nums; white-space:nowrap;">
          ${part.printTime} ${escapeHtml(t('common.hours'))}
          ${(part.qty && part.qty > 1) ? `<span style="color:var(--primary); margin-inline-start:4px;">×${part.qty}</span>` : ''}
        </td>
        <td style="text-align: end; white-space: nowrap;">
          <button class="btn small" data-act="edit-part" data-idx="${i}" title="${escapeHtml(t('calc.cart.edit'))}" style="margin-inline-end:4px;">✎</button>
          <button class="btn danger small" data-act="remove-part" data-idx="${i}" title="${escapeHtml(t('common.delete'))}">×</button>
        </td>
      </tr>`;
    }).join('');
  }
  renderCartBanner();
  updateGrandTotal();
}

/* ── Extra charges (custom invoice line items) ─────────────── */
function renderExtraLines() {
  const el = $('#extraLinesList');
  if (!el) return;
  if (currentExtraLines.length === 0) { el.innerHTML = ''; updateGrandTotal(); return; }
  el.innerHTML = currentExtraLines.map((line, i) => `
    <div class="extra-line-row">
      <input type="text" class="el-label" value="${escapeHtml(line.label)}" placeholder="${escapeHtml(t('calc.extra_label_ph'))}" style="flex:1; min-width:0;">
      <input type="number" class="el-amount" value="${line.amount || ''}" min="0" step="0.01" placeholder="0.00" style="width:90px;">
      <button class="btn danger small el-rm" data-eli="${i}" aria-label="Remove">×</button>
    </div>`).join('');
  el.querySelectorAll('.el-label').forEach((inp, i) => {
    inp.addEventListener('input', () => { currentExtraLines[i].label = inp.value; updateGrandTotal(); });
  });
  el.querySelectorAll('.el-amount').forEach((inp, i) => {
    inp.addEventListener('input', () => { currentExtraLines[i].amount = Math.max(0, +inp.value || 0); updateGrandTotal(); });
  });
  el.querySelectorAll('.el-rm').forEach(btn => {
    btn.addEventListener('click', () => { currentExtraLines.splice(+btn.dataset.eli, 1); renderExtraLines(); });
  });
  updateGrandTotal();
}

/* ── Extra materials for current part (Feature 8) ─────────────── */
function renderExtraMaterials() {
  const el = $('#extraMaterialsList');
  if (!el) return;
  if (currentExtraMaterials.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = currentExtraMaterials.map((m, i) => {
    const matOptions = inventory.map(item =>
      `<option value="${escapeHtml(item.material)}" ${m.material === item.material ? 'selected' : ''}>${escapeHtml(item.material)}</option>`
    ).join('');
    return `<div class="extra-mat-row" data-emi="${i}" style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
      <select class="em-material" style="flex:2; font-size:12.5px;">
        <option value="">${escapeHtml(t('calc.extra_mat_name'))}</option>
        ${matOptions}
      </select>
      <input type="number" class="em-weight" value="${m.weight || ''}" min="0" step="1" placeholder="${escapeHtml(t('calc.extra_mat_weight'))}" style="width:80px; font-size:12.5px;">
      <button class="btn danger small em-rm" data-emi="${i}" aria-label="Remove">×</button>
    </div>`;
  }).join('');
  el.querySelectorAll('.em-material').forEach((sel, i) => {
    sel.value = currentExtraMaterials[i].material || '';
    sel.addEventListener('change', () => {
      currentExtraMaterials[i].material = sel.value;
      updateGrandTotal();
    });
  });
  el.querySelectorAll('.em-weight').forEach((inp, i) => {
    inp.addEventListener('input', () => {
      currentExtraMaterials[i].weight = Math.max(0, +inp.value || 0);
      updateGrandTotal();
    });
  });
  el.querySelectorAll('.em-rm').forEach(btn => {
    btn.addEventListener('click', () => {
      currentExtraMaterials.splice(+btn.dataset.emi, 1);
      renderExtraMaterials();
      updateGrandTotal();
    });
  });
}

/* Feature 5: Price tiers renderer */
function renderPriceTiers() {
  const el = $('#priceTiersList');
  if (!el) return;
  if (currentPriceTiers.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr auto; gap:4px; align-items:center; font-size:12px; color:var(--text-muted); margin-bottom:2px;">
    <span>${escapeHtml(t('calc.tier_min_qty'))}</span>
    <span>${escapeHtml(t('calc.tier_price'))} (${currencySymbol()})</span>
    <span></span>
  </div>` +
  currentPriceTiers.map((tier, i) => `
    <div class="price-tier-row" data-ti="${i}" style="display:grid; grid-template-columns:1fr 1fr auto; gap:4px; margin-bottom:4px; align-items:center;">
      <input type="number" class="pt-minqty" value="${tier.minQty || 1}" min="1" step="1" style="font-size:12.5px;">
      <input type="number" class="pt-price" value="${tier.pricePerUnit || ''}" min="0" step="0.01" style="font-size:12.5px;" placeholder="0.00">
      <button class="btn danger small pt-rm" data-ti="${i}" aria-label="Remove">×</button>
    </div>`).join('');
  el.querySelectorAll('.pt-minqty').forEach((inp, i) => {
    inp.addEventListener('input', () => { currentPriceTiers[i].minQty = Math.max(1, +inp.value || 1); updateGrandTotal(); });
  });
  el.querySelectorAll('.pt-price').forEach((inp, i) => {
    inp.addEventListener('input', () => { currentPriceTiers[i].pricePerUnit = Math.max(0, +inp.value || 0); updateGrandTotal(); });
  });
  el.querySelectorAll('.pt-rm').forEach(btn => {
    btn.addEventListener('click', () => { currentPriceTiers.splice(+btn.dataset.ti, 1); renderPriceTiers(); updateGrandTotal(); });
  });
}

function renderCartBanner() {
  const banner = $('#cartFromCatalogBanner');
  if (currentBuildFromProductId) {
    const p = products.find(x => x.id === currentBuildFromProductId);
    if (p) {
      banner.style.display = 'flex';
      banner.innerHTML = `
        <span>${escapeHtml(t('calc.quote.from_catalog', { name: localName(p) }))}</span>
        <button class="x" data-act="clear-banner" aria-label="Clear">×</button>`;
      banner.querySelector('[data-act="clear-banner"]').addEventListener('click', () => {
        currentBuildFromProductId = null;
        renderCartBanner();
      });
      return;
    }
  }
  banner.style.display = 'none';
}

/* ============================================================
   Printer Presets
   ============================================================ */
function renderPrinterPresets() {
  const select = $('#printerPreset');
  const prev = select.value;
  select.innerHTML = [
    `<option value="">${escapeHtml(t('calc.machine.no_preset'))}</option>`,
    ...printers.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
  ].join('');
  if (printers.find(p => p.id === prev)) select.value = prev;
  updateDeletePresetBtn();
}

function updateDeletePresetBtn() {
  const btn = $('#btnDeletePreset');
  if (btn) btn.style.display = $('#printerPreset').value ? 'inline-flex' : 'none';
}

function applyPreset(presetId) {
  const p = printers.find(x => x.id === presetId);
  if (!p) return;
  if (p.name)        $('#printerModel').value  = p.name;
  if (p.wearRate    !== undefined) $('#wearRate').value    = p.wearRate;
  if (p.powerDraw   !== undefined) $('#powerDraw').value   = p.powerDraw;
  if (p.elecRate    !== undefined) $('#elecRate').value    = p.elecRate;
  if (p.laborRate   !== undefined) $('#laborRate').value   = p.laborRate;
  if (p.failureRate !== undefined) $('#failureRate').value = p.failureRate;
  if (p.prepTime    !== undefined) $('#prepTime').value    = p.prepTime;
  if (p.postTime    !== undefined) $('#postTime').value    = p.postTime;
  updateGrandTotal();
}

function saveCurrentAsPreset() {
  const defaultName = $('#printerModel').value.trim();
  openFormModal({
    title: t('calc.machine.save_preset'),
    sizeLg: false,
    saveLabel: t('common.save'),
    bodyHtml: `
      <label>${escapeHtml(t('calc.machine.preset'))}</label>
      <input type="text" id="_presetNameInput" value="${escapeHtml(defaultName)}"
             placeholder="${escapeHtml(t('calc.machine.preset_name_ph'))}">
    `,
    onMount(modal) { setTimeout(() => modal.querySelector('#_presetNameInput')?.focus(), 40); },
    async onSave(modal) {
      const name = modal.querySelector('#_presetNameInput').value.trim();
      if (!name) { toast(t('tpl.need_name'), 'error'); return false; }
      const existingIdx = printers.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
      const preset = {
        id:          existingIdx >= 0 ? printers[existingIdx].id : uid('PRNTR'),
        name,
        wearRate:    num($('#wearRate').value,    0.75),
        powerDraw:   num($('#powerDraw').value,   150),
        elecRate:    num($('#elecRate').value,     0.18),
        laborRate:   num($('#laborRate').value,    90),
        failureRate: num($('#failureRate').value,  10),
        prepTime:    num($('#prepTime').value,     0.25),
        postTime:    num($('#postTime').value,     0.5),
      };
      if (existingIdx >= 0) printers[existingIdx] = preset;
      else printers.push(preset);
      saveAll();
      renderPrinterPresets();
      $('#printerPreset').value = preset.id;
      updateDeletePresetBtn();
      toast(t('calc.machine.preset_saved'), 'success');
      return true;
    }
  });
}

function deleteCurrentPreset() {
  const val = $('#printerPreset').value;
  if (!val) return;
  printers = printers.filter(p => p.id !== val);
  saveAll();
  renderPrinterPresets();
  toast(t('calc.machine.preset_deleted'), 'success');
}

/* ============================================================
   Machine profiles (physical printers you assign jobs to)
   ============================================================ */
const MACHINE_COLORS = ['#5b9cf0','#2bb673','#f5a623','#ef4d5e','#a78bfa','#fb923c','#34d399','#f472b6'];

function renderMachines() {
  const list = $('#machinesList');
  if (!list) return;
  if (machines.length === 0) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">${escapeHtml(t('mach.empty'))}</div>`;
    return;
  }
  list.innerHTML = machines.map(m => {
    const active = printLog.filter(o => o.machineId === m.id && !['completed','quote'].includes(o.status)).length;
    const svc = machineServiceStatus(m);
    const svcBadge = svc.due
      ? `<span class="machine-jobs-badge" style="background:var(--danger); color:#fff;">⚠ ${escapeHtml(t('mach.service_due'))}</span>`
      : svc.warning
        ? `<span class="machine-jobs-badge" style="background:var(--warning); color:#000;">⚠ ${escapeHtml(t('mach.service_warn'))}</span>`
        : '';
    const hrsLine = `<span class="machine-hrs-stat">🔧 ${svc.total.toFixed(1)}h ${escapeHtml(t('mach.hours_total'))}${m.serviceInterval > 0 ? ` · ${svc.hours.toFixed(1)}h since service` : ''}</span>`;
    return `
      <div class="machine-row">
        <span class="machine-dot" style="background:${escapeHtml(m.color)};"></span>
        <span class="machine-name">${escapeHtml(m.name)}</span>
        ${m.isOffline ? `<span class="machine-jobs-badge" style="background:var(--danger); color:#fff;">⚠ ${escapeHtml(t('mach.offline_badge'))}</span>` : ''}
        ${active > 0 ? `<span class="machine-jobs-badge">${active} ${escapeHtml(t('mach.active_jobs'))}</span>` : ''}
        ${svcBadge}
        ${hrsLine}
        <button class="btn small" data-act="maint-log" data-id="${m.id}" title="${escapeHtml(t('maint.btn'))}">🔧</button>
        <button class="btn small" data-act="edit-mach" data-id="${m.id}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn danger small" data-act="del-mach" data-id="${m.id}">${escapeHtml(t('common.delete'))}</button>
      </div>`;
  }).join('');
}

function renderMachineDropdown() {
  const optionsHtml = `<option value="">${escapeHtml(t('mach.unassigned'))}</option>` +
    machines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}${m.isOffline ? ' (' + escapeHtml(t('mach.offline_badge')) + ')' : ''}</option>`).join('');
  const sel = $('#machineAssign');
  if (sel) {
    const prev = sel.value;
    sel.innerHTML = optionsHtml;
    if (prev && machines.find(m => m.id === prev)) sel.value = prev;
  }
  // Also populate per-part machine select in calculator
  const partSel = $('#partMachineId');
  if (partSel) {
    const prev2 = partSel.value;
    partSel.innerHTML = optionsHtml;
    if (prev2 && machines.find(m => m.id === prev2)) partSel.value = prev2;
  }
}

function openMachineEditor(machineId = null) {
  const existing = machineId ? machines.find(m => m.id === machineId) : null;
  const draft = existing
    ? { ...existing }
    : { id: uid('MACH'), name: '', color: MACHINE_COLORS[machines.length % MACHINE_COLORS.length] };

  openFormModal({
    title: existing ? t('mach.edit') : t('mach.add'),
    sizeLg: false,
    bodyHtml: `
      <label>${escapeHtml(t('mach.name'))}</label>
      <input type="text" id="machName" value="${escapeHtml(draft.name)}" placeholder="${escapeHtml(t('mach.name_ph'))}">
      <label style="margin-top:12px;">${escapeHtml(t('mach.color'))}</label>
      <div id="machColorPicker" style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
        ${MACHINE_COLORS.map(c => `
          <label style="cursor:pointer;">
            <input type="radio" name="machColor" value="${c}" ${draft.color === c ? 'checked' : ''} style="display:none;">
            <span class="mach-color-swatch" style="background:${c};outline:${draft.color === c ? '3px solid #fff' : '3px solid transparent'};"></span>
          </label>`).join('')}
      </div>
      <div class="inline-pair" style="margin-top:14px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('mach.target_hours'))}</label>
          <input type="number" id="machTargetHours" value="${draft.targetHoursPerDay || ''}" min="0" step="0.5" placeholder="8">
        </div>
        <div style="padding-top:20px; font-size:11.5px; color:var(--text-muted);">${escapeHtml(t('mach.target_hours_hint'))}</div>
      </div>
      <div class="inline-pair" style="margin-top:14px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('mach.service_interval'))}</label>
          <input type="number" id="machServiceInterval" value="${draft.serviceInterval || ''}" min="0" step="1" placeholder="500">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('mach.last_service'))}</label>
          <input type="number" id="machLastServiceHours" value="${draft.lastServiceHours || ''}" min="0" step="0.1" placeholder="0">
        </div>
      </div>
      <label style="margin-top:16px; display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" id="machOffline" style="width:auto; margin:0;" ${draft.isOffline ? 'checked' : ''}>
        <span data-i18n="mach.mark_offline">${escapeHtml(t('mach.mark_offline'))}</span>
      </label>`,
    onMount(modal) {
      modal.querySelector('#machName').addEventListener('input', e => { draft.name = e.target.value; });
      modal.querySelectorAll('input[name="machColor"]').forEach(radio => {
        radio.addEventListener('change', () => {
          draft.color = radio.value;
          modal.querySelectorAll('.mach-color-swatch').forEach((s, i) => {
            s.style.outline = `3px solid ${MACHINE_COLORS[i] === draft.color ? '#fff' : 'transparent'}`;
          });
        });
      });
      modal.querySelector('#machOffline').addEventListener('change', e => { draft.isOffline = e.target.checked; });
      modal.querySelector('#machTargetHours').addEventListener('input', e => { draft.targetHoursPerDay = Math.max(0, +e.target.value || 0) || null; });
      modal.querySelector('#machServiceInterval').addEventListener('input', e => { draft.serviceInterval = parseFloat(e.target.value) || 0; });
      modal.querySelector('#machLastServiceHours').addEventListener('input', e => { draft.lastServiceHours = parseFloat(e.target.value) || 0; });
    },
    async onSave() {
      if (!draft.name.trim()) { toast(t('mach.need_name'), 'error'); return false; }
      const idx = machines.findIndex(m => m.id === draft.id);
      if (idx >= 0) machines[idx] = draft;
      else machines.push(draft);
      saveAll();
      renderMachines();
      renderMachineDropdown();
      toast(t('mach.saved'), 'success');
      return true;
    }
  });
}

async function deleteMachine(machineId) {
  const inUse = printLog.some(o => o.machineId === machineId && o.status !== 'completed');
  const msg = inUse ? t('mach.delete_active_q') : t('mach.delete_q');
  const ok = await confirmModal(msg, { danger: true });
  if (!ok) return;
  machines = machines.filter(m => m.id !== machineId);
  saveAll();
  renderMachines();
  renderMachineDropdown();
}

/* ============================================================
   Printer Maintenance Log
   ============================================================ */
function openMaintLog(machineId) {
  const machine = machines.find(m => m.id === machineId);
  if (!machine) return;

  const getEntries = () => machMaintLog.filter(e => e.machineId === machineId)
    .sort((a, b) => b.date.localeCompare(a.date));

  function listHtml() {
    const list = getEntries();
    if (list.length === 0)
      return `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px 0;">${escapeHtml(t('maint.empty'))}</p>`;
    return `<div class="table-wrap"><table>
      <thead><tr>
        <th>${escapeHtml(t('maint.date'))}</th>
        <th>${escapeHtml(t('maint.note'))}</th>
        <th>${escapeHtml(t('maint.cost'))}</th>
        <th></th>
      </tr></thead>
      <tbody>${list.map(e => `
        <tr>
          <td style="white-space:nowrap;">${escapeHtml(e.date)}</td>
          <td>${escapeHtml(e.note || '')}</td>
          <td style="white-space:nowrap;">${e.cost > 0 ? fmtPrice(e.cost) : '—'}</td>
          <td><button class="btn danger small" data-act="del-maint" data-id="${e.id}">×</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }

  openFormModal({
    title: `${machine.name} — ${t('maint.title')}`,
    noSave: true,
    sizeLg: true,
    bodyHtml: `
      <div style="background:var(--surface-2);padding:14px;border-radius:var(--radius);margin-bottom:14px;">
        <div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px;align-items:end;">
          <div>
            <label style="margin:0;">${escapeHtml(t('maint.date'))}</label>
            <input type="date" id="maintDate" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('maint.note'))}</label>
            <input type="text" id="maintNote" placeholder="${escapeHtml(t('maint.note_ph'))}">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('maint.cost'))} (${currencySymbol()})</label>
            <input type="number" id="maintCost" value="0" min="0" step="0.01">
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-size:12.5px;">
            <input type="checkbox" id="maintAddExpense" style="width:auto;margin:0;">
            <span>${escapeHtml(t('maint.expense_q'))}</span>
          </label>
          <button class="btn primary small" id="btnAddMaintEntry">${escapeHtml(t('maint.add'))}</button>
        </div>
      </div>
      <div id="maintEntriesList">${listHtml()}</div>`,
    onMount(modal) {
      const refresh = () => {
        const el = modal.querySelector('#maintEntriesList');
        if (el) el.innerHTML = listHtml();
      };
      modal.querySelector('#btnAddMaintEntry').addEventListener('click', () => {
        const date  = modal.querySelector('#maintDate').value || new Date().toISOString().split('T')[0];
        const note  = modal.querySelector('#maintNote').value.trim();
        const cost  = Math.max(0, +(modal.querySelector('#maintCost').value) || 0);
        const addExp = modal.querySelector('#maintAddExpense').checked;
        if (!note) { toast(t('maint.need_note'), 'error'); return; }
        machMaintLog.unshift({ id: uid('MAINT'), machineId, date, note, cost });
        if (addExp && cost > 0) {
          expenses.unshift({ id: uid('EXP'), date, category: 'maintenance', amount: cost,
            note: `${machine.name}: ${note}` });
        }
        saveAll();
        modal.querySelector('#maintNote').value  = '';
        modal.querySelector('#maintCost').value  = '0';
        modal.querySelector('#maintAddExpense').checked = false;
        refresh();
        toast(t('maint.saved'), 'success');
      });
      modal.querySelector('#maintEntriesList').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act="del-maint"]');
        if (!btn) return;
        const ok = await confirmModal(t('common.delete') + '?', { danger: true });
        if (!ok) return;
        machMaintLog = machMaintLog.filter(e => e.id !== btn.dataset.id);
        saveAll();
        refresh();
        toast(t('maint.deleted'), 'success');
      });
    }
  });
}

/* ============================================================
   Machine hour meter + service status (Feature 1)
   ============================================================ */
function machineHoursMeter(machineId) {
  return printLog
    .filter(o => o.machineId === machineId && o.status === 'completed')
    .reduce((s, o) => s + (+o.printTime || 0), 0);
}

function machineServiceStatus(machine) {
  const totalHours = machineHoursMeter(machine.id);
  const hoursSinceService = totalHours - (machine.lastServiceHours || 0);
  if (machine.serviceInterval > 0) {
    if (hoursSinceService >= machine.serviceInterval) {
      return { due: true, hours: hoursSinceService, interval: machine.serviceInterval, total: totalHours };
    }
    if (hoursSinceService >= machine.serviceInterval * 0.9) {
      return { warning: true, hours: hoursSinceService, interval: machine.serviceInterval, total: totalHours };
    }
  }
  return { ok: true, hours: hoursSinceService, interval: machine.serviceInterval || 0, total: totalHours };
}

function logMachineService(machineId) {
  const machine = machines.find(m => m.id === machineId);
  if (!machine) return;
  openFormModal({
    title: `${t('mach.log_service')} — ${escapeHtml(machine.name)}`,
    sizeLg: false,
    saveLabel: t('mach.log_service'),
    bodyHtml: `
      <label>${escapeHtml(t('mach.service_note'))}</label>
      <input type="text" id="svcNoteInput" placeholder="${escapeHtml(t('maint.note_ph'))}">
      <p style="font-size:12px; color:var(--text-muted); margin:8px 0 0;">
        ${escapeHtml(t('mach.hours_total'))}: <strong>${machineHoursMeter(machineId).toFixed(1)}h</strong>
      </p>`,
    onMount(modal) { setTimeout(() => modal.querySelector('#svcNoteInput')?.focus(), 40); },
    async onSave(modal) {
      const note = modal.querySelector('#svcNoteInput').value.trim();
      const totalHrs = machineHoursMeter(machineId);
      machine.lastServiceHours = totalHrs;
      const today = new Date().toISOString().split('T')[0];
      machMaintLog.unshift({ id: uid('MAINT'), machineId, date: today, note: note || t('mach.log_service'), cost: 0 });
      saveAll();
      renderMachines();
      renderDashboard();
      toast(t('mach.service_done'), 'success');
      return true;
    }
  });
}

/* ============================================================
   WhatsApp Quick-Reply Templates
   ============================================================ */
function renderWaTemplates() {
  const el = $('#waTemplatesList');
  if (!el) return;
  if (waTemplates.length === 0) {
    el.innerHTML = `<p class="empty-state" style="padding:8px 0; font-size:13px;">${escapeHtml(t('wa.no_templates_hint'))}</p>`;
    return;
  }
  el.innerHTML = waTemplates.map(tpl => `
    <div class="wa-tpl-row">
      <div class="wa-tpl-info">
        <span class="wa-tpl-name">${escapeHtml(tpl.name)}</span>
        <span class="wa-tpl-preview">${escapeHtml(tpl.body.slice(0, 70))}${tpl.body.length > 70 ? '…' : ''}</span>
      </div>
      <div class="wa-tpl-actions">
        <button class="btn small" data-act="edit-wa-tpl" data-id="${tpl.id}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn danger small" data-act="del-wa-tpl" data-id="${tpl.id}">${escapeHtml(t('common.delete'))}</button>
      </div>
    </div>`).join('');
}

function openWaTemplateEditor(tplId = null) {
  const existing = tplId ? waTemplates.find(x => x.id === tplId) : null;
  const draft = existing ? { ...existing } : { id: uid('WATPL'), name: '', body: '' };
  const bodyHtml = `
    <label>${escapeHtml(t('wa.tpl_name'))}</label>
    <input type="text" id="waTplName" value="${escapeHtml(draft.name)}" placeholder="${escapeHtml(t('wa.tpl_name_ph'))}">
    <label style="margin-top:10px;">${escapeHtml(t('wa.tpl_body'))}</label>
    <textarea id="waTplBody" rows="5" style="resize:vertical;">${escapeHtml(draft.body)}</textarea>
    <p style="font-size:11.5px; color:var(--text-muted); margin:6px 0 0;" data-i18n="wa.tpl_hint"></p>
    <p style="font-size:11px; color:var(--text-muted); margin:2px 0 0; font-family:monospace;">{{client}} · {{id}} · {{price}} · {{due}} · {{status}}</p>
  `;
  openFormModal({
    title: existing ? t('wa.edit_tpl') : t('wa.new_tpl'),
    saveLabel: t('common.save'),
    bodyHtml,
    async onSave(modal) {
      draft.name = modal.querySelector('#waTplName').value.trim();
      draft.body = modal.querySelector('#waTplBody').value.trim();
      if (!draft.name) { toast(t('wa.tpl_need_name'), 'error'); return false; }
      if (!draft.body) { toast(t('wa.tpl_need_body'), 'error'); return false; }
      const idx = waTemplates.findIndex(x => x.id === draft.id);
      if (idx >= 0) waTemplates[idx] = draft; else waTemplates.push(draft);
      saveJSON(K.WA_TEMPLATES, waTemplates);
      renderWaTemplates();
      toast(t('wa.tpl_saved'), 'success');
      return true;
    }
  });
}

function deleteWaTemplate(tplId) {
  waTemplates = waTemplates.filter(x => x.id !== tplId);
  saveJSON(K.WA_TEMPLATES, waTemplates);
  renderWaTemplates();
}

function openWaSendModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  if (waTemplates.length === 0) { toast(t('wa.no_templates'), 'info'); return; }
  const tplOptions = waTemplates.map((tpl, i) =>
    `<option value="${i}">${escapeHtml(tpl.name)}</option>`).join('');
  const bodyHtml = `
    <div style="margin-bottom:10px;">
      <label>${escapeHtml(t('wa.phone'))}</label>
      <input type="tel" id="waSendPhone" value="${escapeHtml(client?.phone || '')}" placeholder="+966 5x xxx xxxx">
    </div>
    <label>${escapeHtml(t('wa.template'))}</label>
    <select id="waTplSelect">${tplOptions}</select>
    <label style="margin-top:12px;">${escapeHtml(t('wa.preview'))}</label>
    <textarea id="waMsgPreview" rows="5" style="resize:vertical; font-size:12.5px;" readonly></textarea>
  `;
  openFormModal({
    title: t('wa.send_title'),
    saveLabel: t('wa.open_btn'),
    bodyHtml,
    onMount(modal) {
      const sel     = modal.querySelector('#waTplSelect');
      const preview = modal.querySelector('#waMsgPreview');
      const update  = () => {
        const tpl = waTemplates[+sel.value];
        if (tpl) preview.value = fillWaTemplate(tpl.body, order, client);
      };
      sel.addEventListener('change', update);
      update();
    },
    async onSave(modal) {
      const phone = modal.querySelector('#waSendPhone').value.trim();
      const msg   = modal.querySelector('#waMsgPreview').value;
      if (window.hubAPI?.shareWhatsApp) {
        await window.hubAPI.shareWhatsApp({ phone, message: msg, pdfPath: null });
      }
      return true;
    }
  });
}

/* ============================================================
   Quote Templates
   ============================================================ */
function renderQuoteTemplates() {
  const sel = $('#quoteTplSelect');
  const prev = sel.value;
  sel.innerHTML = [
    `<option value="">${escapeHtml(t('calc.tpl.none'))}</option>`,
    ...templates.map(tpl => `<option value="${tpl.id}">${escapeHtml(tpl.name)}</option>`)
  ].join('');
  if (templates.find(tpl => tpl.id === prev)) sel.value = prev;
  updateDeleteTplBtn();
}

function updateDeleteTplBtn() {
  const btn = $('#btnDeleteTpl');
  if (btn) btn.style.display = $('#quoteTplSelect').value ? 'inline-flex' : 'none';
}

function loadQuoteTemplate() {
  const id = $('#quoteTplSelect').value;
  const tpl = templates.find(t => t.id === id);
  if (!tpl) { toast(t('calc.tpl.none'), 'error'); return; }
  currentBuild = tpl.build.map(p => ({ ...p }));
  if (tpl.margin != null) $('#margin').value = tpl.margin;
  renderBuild();
  toast(t('calc.tpl.loaded'), 'success');
}

function saveQuoteTemplate() {
  if (currentBuild.length === 0) { toast(t('calc.tpl.empty'), 'error'); return; }
  openFormModal({
    title:     t('calc.tpl.save_title'),
    saveLabel: t('common.save'),
    bodyHtml:  `<label>${escapeHtml(t('calc.tpl.name_label'))}</label>
                <input type="text" id="tplNameInput" placeholder="${escapeHtml(t('calc.tpl.name_ph'))}" style="margin-top:6px;">`,
    onMount(modal) { modal.querySelector('#tplNameInput').focus(); },
    onSave() {
      const name = document.getElementById('tplNameInput').value.trim();
      if (!name) { toast(t('calc.tpl.name_ph'), 'error'); return false; }
      templates.push({
        id: uid('TPL'),
        name,
        build:  currentBuild.map(p => ({ ...p })),
        margin: clampPositive($('#margin').value)
      });
      saveAll();
      renderQuoteTemplates();
      toast(t('calc.tpl.saved'), 'success');
      return true;
    }
  });
}

function deleteQuoteTemplate() {
  const id = $('#quoteTplSelect').value;
  if (!id) return;
  templates = templates.filter(tpl => tpl.id !== id);
  saveAll();
  renderQuoteTemplates();
  toast(t('calc.tpl.deleted'), 'success');
}

/* ============================================================
   Inventory
   ============================================================ */
function populateFilamentDropdown() {
  const select = $('#filamentSelect');
  const previous = select.value;
  select.innerHTML = inventory.map(item => `
    <option value="${item.id}" data-cost="${item.cost}" data-weight="${item.weight}" data-color="${escapeHtml(item.color || '#888888')}">
      ${escapeHtml(item.material)}${item.weight <= settings.lowStockThreshold ? '  ⚠' : ''}
    </option>`).join('');
  if (inventory.find(i => i.id === previous)) {
    select.value = previous;
  }
  updateFilamentColorDot();
}

function updateFilamentColorDot() {
  const select = $('#filamentSelect');
  const dot    = $('#filColorDot');
  if (!select || !dot) return;
  const opt = select.options[select.selectedIndex];
  dot.style.background = opt?.dataset.color || '#888888';
}

function handleFilamentChange() {
  const select = $('#filamentSelect');
  const opt = select.options[select.selectedIndex];
  if (opt) {
    if (opt.dataset.cost)   $('#spoolCost').value   = opt.dataset.cost;
    if (opt.dataset.weight) $('#spoolWeight').value = opt.dataset.weight;
    updateGrandTotal();
  }
  updateFilamentColorDot();
  // Feature 4: Show print settings recommendation below filament select
  const item = select.value ? inventory.find(i => i.id === select.value) : null;
  let tipEl = $('#filamentPrintSettingsTip');
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'filamentPrintSettingsTip';
    tipEl.style.cssText = 'font-size:11.5px; color:var(--primary); margin-top:4px; padding:4px 8px; background:rgba(91,156,240,0.08); border-radius:4px; display:none;';
    select.parentNode?.insertBefore(tipEl, select.nextSibling) || select.after(tipEl);
  }
  if (item && (item.printTemp || item.bedTemp)) {
    const parts = [];
    if (item.printTemp) parts.push(`Print: ${item.printTemp}°C`);
    if (item.bedTemp)   parts.push(`Bed: ${item.bedTemp}°C`);
    if (item.maxSpeed)  parts.push(`Max: ${item.maxSpeed}mm/s`);
    tipEl.textContent = `🌡 ${escapeHtml(t('inv.print_settings'))}: ${parts.join(' / ')}`;
    tipEl.style.display = 'block';
  } else {
    tipEl.style.display = 'none';
  }

  // Feature 3: Populate spool picker if visible
  updateSpoolPicker();
}

function updateSpoolPicker() {
  const sel = $('#filamentSelect');
  const spoolPicker = $('#spoolIdPicker');
  if (!spoolPicker) return;
  // Always show this specific spool plus others of same material type
  const selectedItem = sel.value ? inventory.find(i => i.id === sel.value) : null;
  if (!selectedItem) { spoolPicker.style.display = 'none'; return; }
  const sameMaterial = inventory.filter(i => i.material === selectedItem.material);
  spoolPicker.innerHTML = `<option value="">${escapeHtml(t('oe.select_spool'))}</option>` +
    sameMaterial.map(s => `<option value="${s.id}"${s.id === sel.value ? ' selected' : ''}>${escapeHtml(s.material)} — ${Math.round(s.weight)}g</option>`).join('');
  spoolPicker.style.display = sameMaterial.length > 0 ? '' : 'none';
}

function openFilamentCatalog() {
  if (!filamentsDB.length) { toast(t('inv.catalog_loading') || 'Catalog not ready yet', 'error'); return; }

  const brands = [...new Set(filamentsDB.map(f => f.brand))].sort();
  const types  = [...new Set(filamentsDB.map(f => f.type))].sort();

  const bodyHtml = `
    <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center;">
      <input type="search" id="catSearch" placeholder="${escapeHtml(t('inv.catalog_search_ph') || 'Search brand, color, type…')}"
        style="flex:1; min-width:160px; padding:7px 10px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:13px;">
      <select id="catBrand" style="padding:7px 10px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:13px;">
        <option value="">${escapeHtml(t('inv.catalog_all_brands') || 'All brands')}</option>
        ${brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}
      </select>
      <select id="catType" style="padding:7px 10px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface-2); color:var(--text); font-size:13px;">
        <option value="">${escapeHtml(t('inv.catalog_all_types') || 'All types')}</option>
        ${types.map(tp => `<option value="${escapeHtml(tp)}">${escapeHtml(tp)}</option>`).join('')}
      </select>
    </div>
    <p style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">${escapeHtml(t('inv.catalog_hint') || 'Click a filament to fill the add form.')}</p>
    <div id="catGrid" class="filament-cat-grid"></div>
  `;

  openFormModal({
    title: t('inv.catalog_title') || 'Browse Filament Catalog',
    bodyHtml,
    noSave: true,
    onMount() {
      function renderCatalogGrid() {
        const q     = document.getElementById('catSearch').value.toLowerCase();
        const brand = document.getElementById('catBrand').value;
        const tp    = document.getElementById('catType').value;

        const filtered = filamentsDB.filter(f => {
          if (brand && f.brand !== brand) return false;
          if (tp    && f.type  !== tp)    return false;
          if (q) {
            const hay = `${f.brand} ${f.line} ${f.type} ${f.color}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        const grid = document.getElementById('catGrid');
        if (!filtered.length) {
          grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">${escapeHtml(t('inv.catalog_no_results') || 'No filaments match')}</div>`;
          return;
        }

        grid.innerHTML = filtered.map((f, i) => `
          <div class="fil-card" data-idx="${i}">
            <div class="fil-card-swatch" style="background:${escapeHtml(f.hex)};"></div>
            <div class="fil-card-info">
              <span class="fil-card-color">${escapeHtml(f.color)}</span>
              <span class="fil-card-brand">${escapeHtml(f.brand)}</span>
              <span class="fil-card-line">${escapeHtml(f.line)}</span>
              <span class="fil-card-type">${escapeHtml(f.type)}</span>
            </div>
          </div>`).join('');

        grid.querySelectorAll('.fil-card').forEach(card => {
          const f = filtered[+card.dataset.idx];
          card.addEventListener('click', () => {
            $('#invMaterial').value = `${f.brand} ${f.line} – ${f.color}`;
            $('#invColor').value    = f.hex;
            $('#modalMount').innerHTML = '';
            toast(t('inv.catalog_picked') || `${f.color} selected`, 'success', 1800);
          });
        });
      }

      renderCatalogGrid();
      document.getElementById('catSearch').addEventListener('input',  renderCatalogGrid);
      document.getElementById('catBrand').addEventListener('change',  renderCatalogGrid);
      document.getElementById('catType').addEventListener('change',   renderCatalogGrid);
    }
  });
}

/* ── NFC tag parsers ──────────────────────────────────────────────────────
   Two open standards supported:
   1. OpenTag3D  — binary fixed offsets, NDEF MIME: application/opentag3d
                   https://opentag3d.info/spec
   2. OpenPrintTag (Prusa) — CBOR map, NDEF MIME: application/vnd.openprinttag
                   https://openprinttag.org
   On macOS desktop: user pastes a raw hex dump from an NFC reader app.
   On iOS (future): auto-read via Capacitor NFC plugin.
   ──────────────────────────────────────────────────────────────────────── */

// ── OpenTag3D ──────────────────────────────────────────────────────────────
function _ot3dReadStr(bytes, offset, len) {
  const slice = bytes.slice(offset, offset + len);
  const nullIdx = slice.indexOf(0);
  return new TextDecoder('utf-8').decode(slice.slice(0, nullIdx === -1 ? len : nullIdx)).trim();
}
function parseOpenTag3DBytes(bytes) {
  if (!bytes || bytes.length < 0x66) return null;
  const u16 = (o) => (bytes[o] << 8) | bytes[o + 1];
  const u8  = (o) => bytes[o];
  const str = (o, l) => _ot3dReadStr(bytes, o, l);

  const baseMaterial = str(0x02, 5);
  if (!baseMaterial) return null; // empty tag

  const modifiers    = str(0x07, 5);
  const manufacturer = str(0x1B, 16);
  const colorName    = str(0x2B, 32);
  const r = u8(0x4B), g = u8(0x4C), b = u8(0x4D);
  const hex = (r || g || b) ? '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('') : null;
  const weight    = u16(0x5E);
  const printTemp = u8(0x60) * 5;
  const bedTemp   = u8(0x61) * 5;
  const density   = u16(0x62) / 1000;
  const diameter  = u16(0x5C) / 1000;

  let minPrint, maxPrint, minBed, maxBed, dryTemp, dryTime;
  if (bytes.length > 0xB8) {
    minPrint = u8(0xB4) * 5; maxPrint = u8(0xB5) * 5;
    minBed   = u8(0xB6) * 5; maxBed   = u8(0xB7) * 5;
    dryTemp  = u8(0xB2) * 5; dryTime  = u8(0xB3); // hours
  }

  return {
    standard: 'OpenTag3D',
    manufacturer, colorName, hex, weight, density, diameter,
    material: modifiers ? `${baseMaterial} ${modifiers}`.trim() : baseMaterial,
    printTemp, bedTemp, minPrint, maxPrint, minBed, maxBed, dryTemp, dryTime
  };
}

// ── Minimal CBOR decoder ───────────────────────────────────────────────────
function _decodeCBOR(buf, off = 0) {
  if (off >= buf.length) return { v: null, off };
  const first = buf[off++];
  const major = first >> 5;
  const info  = first & 0x1F;

  function count() {
    if (info <= 23) return { n: info, off };
    if (info === 24) return { n: buf[off],             off: off + 1 };
    if (info === 25) return { n: (buf[off] << 8) | buf[off + 1], off: off + 2 };
    if (info === 26) return { n: ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0, off: off + 4 };
    return { n: 0, off }; // 64-bit: treat as 0
  }
  const { n, off: o2 } = count(); off = o2;

  switch (major) {
    case 0: return { v: n, off };                                      // uint
    case 1: return { v: -1 - n, off };                                 // negint
    case 2: return { v: buf.slice(off, off + n), off: off + n };       // bytes
    case 3: return { v: new TextDecoder().decode(buf.slice(off, off + n)), off: off + n }; // text
    case 4: {                                                           // array
      const arr = [];
      for (let i = 0; i < n; i++) { const r = _decodeCBOR(buf, off); arr.push(r.v); off = r.off; }
      return { v: arr, off };
    }
    case 5: {                                                           // map
      const map = {};
      for (let i = 0; i < n; i++) {
        const k = _decodeCBOR(buf, off); off = k.off;
        const vv = _decodeCBOR(buf, off); off = vv.off;
        map[k.v] = vv.v;
      }
      return { v: map, off };
    }
    case 6: return _decodeCBOR(buf, off);                              // tag — skip, decode inner
    case 7: {                                                           // float / special
      if (info === 20) return { v: false, off };
      if (info === 21) return { v: true, off };
      if (info === 22) return { v: null, off };
      if (info === 25) {
        const h = (buf[off] << 8) | buf[off + 1]; off += 2;
        const exp = (h >> 10) & 0x1f, mant = h & 0x3ff;
        const val = exp === 0 ? (mant / 1024) * 2 ** -14
          : exp === 31 ? (mant ? NaN : Infinity)
          : (1 + mant / 1024) * 2 ** (exp - 15);
        return { v: (h >> 15) ? -val : val, off };
      }
      if (info === 26) { const dv = new DataView(buf.buffer, buf.byteOffset + off, 4); return { v: dv.getFloat32(0, false), off: off + 4 }; }
      if (info === 27) { const dv = new DataView(buf.buffer, buf.byteOffset + off, 8); return { v: dv.getFloat64(0, false), off: off + 8 }; }
      return { v: undefined, off };
    }
    default: return { v: null, off };
  }
}

// ── OpenPrintTag (Prusa) CBOR parser ──────────────────────────────────────
// NDEF MIME: application/vnd.openprinttag   Spec: https://openprinttag.org
// Field keys from FieldKeys.swift (https://github.com/marcelkraus/open-print-tag-kit)
const _OPT_MATERIALS = {
  0:'PLA', 1:'PETG', 2:'TPU', 3:'ABS', 4:'ASA', 5:'PC', 6:'PCTG',
  7:'PP', 8:'PA6', 9:'PA11', 10:'PA12', 11:'PA66', 12:'CPE', 13:'TPE',
  14:'HIPS', 15:'PHA', 16:'PET', 17:'PEI', 18:'PBT', 19:'PVB',
  20:'PVA', 21:'PEKK', 22:'PEEK', 23:'BVOH', 24:'TPC', 25:'PPS',
  26:'PPSU', 27:'PVC', 28:'PEBA', 29:'PVDF', 30:'PPA', 31:'PCL',
  32:'PES', 33:'PMMA', 34:'POM', 35:'PPE', 36:'PS', 37:'PSU',
  38:'TPI', 39:'SBS', 40:'OBC', 41:'EVA'
};
function parseOpenPrintTagCBOR(bytes) {
  try {
    const { v: data } = _decodeCBOR(bytes);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

    const matType = data[9] !== undefined ? (_OPT_MATERIALS[data[9]] || String(data[9])) : null;
    const matName = data[10] || data[52] || null; // materialName or abbreviation
    const brand   = data[11] || null;
    const weight  = data[16] ?? data[17] ?? null; // nominal or actual net weight (g)

    // Primary color (key 19): likely array [r, g, b] or map {0:r,1:g,2:b}
    let hex = null;
    const cd = data[19];
    if (cd) {
      let r, g, b;
      if (Array.isArray(cd) && cd.length >= 3)      { [r, g, b] = cd; }
      else if (typeof cd === 'object' && !Array.isArray(cd)) { r = cd[0]; g = cd[1]; b = cd[2]; }
      if (r !== undefined && g !== undefined && b !== undefined) {
        hex = '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
      }
    }

    const material = matType || matName;
    if (!material && !brand) return null;

    return {
      standard:    'OpenPrintTag',
      manufacturer: brand,
      material:    matType || matName,
      colorName:   null,
      hex,
      weight:      weight ? Math.round(weight) : null,
      minPrint:    data[34], maxPrint: data[35],
      minBed:      data[37], maxBed:   data[38],
      dryTemp:     data[57], dryTime:  data[58] // dryTime in minutes
    };
  } catch { return null; }
}

// ── NDEF TLV unwrapper ─────────────────────────────────────────────────────
// Handles raw NTAG213 memory dump (starts with 0x04) or bare NDEF message
function _extractNDEFPayload(bytes, mimeType) {
  let pos = 0;
  // If this looks like a full NTAG213 dump (serial starts 04), skip 16-byte UID/config header
  if (bytes.length > 16 && bytes[0] === 0x04) pos = 16;

  // Find NDEF TLV (0x03)
  while (pos < bytes.length - 2) {
    const t = bytes[pos];
    if (t === 0xFE) break; // Terminator
    if (t === 0x00) { pos++; continue; } // Null TLV
    let len, dataStart;
    if (bytes[pos + 1] === 0xFF) { len = (bytes[pos + 2] << 8) | bytes[pos + 3]; dataStart = pos + 4; }
    else                          { len = bytes[pos + 1];                          dataStart = pos + 2; }
    const tlv = bytes.slice(dataStart, dataStart + len);
    pos = dataStart + len;

    if (t === 0x03) {
      // Parse NDEF records within this TLV
      let p = 0;
      while (p < tlv.length) {
        const flags = tlv[p]; p++;
        const tnf = flags & 0x07;
        if (p + 2 > tlv.length) break;
        const typeLen    = tlv[p++];
        const sr         = !!(flags & 0x10);
        let payloadLen;
        if (sr) { payloadLen = tlv[p++]; }
        else    { payloadLen = (tlv[p]<<24)|(tlv[p+1]<<16)|(tlv[p+2]<<8)|tlv[p+3]; p += 4; }
        const il = !!(flags & 0x08);
        let idLen = 0;
        if (il) { idLen = tlv[p++]; }
        const recType   = new TextDecoder().decode(tlv.slice(p, p + typeLen)); p += typeLen;
        p += idLen;
        const payload   = tlv.slice(p, p + payloadLen); p += payloadLen;
        if (tnf === 0x02 && recType === mimeType) return payload;
        if (flags & 0x40) break; // ME bit — last record
      }
    }
  }
  return null;
}

// ── Main NFC hex entry point ───────────────────────────────────────────────
function parseNFCHex(hexStr) {
  const clean = hexStr.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length < 20) return { error: t('scan.hex_too_short') || 'Too short — paste the full NFC memory dump from your reader app.' };
  if (clean.length % 2 !== 0) return { error: 'Odd number of hex characters — check the dump.' };
  const bytes = new Uint8Array(clean.match(/../g).map(h => parseInt(h, 16)));

  // 1. Try NDEF-wrapped OpenTag3D
  const ot3dPayload = _extractNDEFPayload(bytes, 'application/opentag3d');
  if (ot3dPayload) { const r = parseOpenTag3DBytes(ot3dPayload); if (r) return r; }

  // 2. Try NDEF-wrapped OpenPrintTag (Prusa)
  const optPayload = _extractNDEFPayload(bytes, 'application/vnd.openprinttag');
  if (optPayload) { const r = parseOpenPrintTagCBOR(optPayload); if (r) return r; }

  // 3. Try raw OpenTag3D binary (no NDEF wrapper)
  const raw = parseOpenTag3DBytes(bytes);
  if (raw) return raw;

  return { error: t('scan.hex_no_parse') || 'Could not parse as OpenTag3D or OpenPrintTag. Make sure you paste the raw memory dump (not just the NDEF text).' };
}

// ── Filament scanner (camera + BarcodeDetector) ── */
function parseFilamentFromText(text) {
  // Extract material type (check compound types first)
  const materialMap = [
    ['PLA-CF',  /pla[\s\-]?cf\b/i],
    ['PETG-CF', /petg[\s\-]?cf\b/i],
    ['PA-CF',   /pa[\s\-]?cf\b|nylon[\s\-]?cf\b/i],
    ['PETG',    /\bpetg\b/i],
    ['TPU',     /\btpu\b|\btpe\b/i],
    ['ASA',     /\basa\b/i],
    ['ABS',     /\babs\b/i],
    ['Nylon',   /\bnylon\b|\bpa\s*\d/i],
    ['HIPS',    /\bhips\b/i],
    ['PVA',     /\bpva\b/i],
    ['PLA',     /\bpla\b/i],
  ];
  let detectedType = null;
  for (const [type, re] of materialMap) {
    if (re.test(text)) { detectedType = type; break; }
  }

  // Extract brand
  const brandMap = [
    ['Bambu Lab',  /bambu/i],
    ['eSun',       /esun/i],
    ['Polymaker',  /polymaker/i],
    ['Creality',   /creality/i],
    ['SUNLU',      /sunlu/i],
    ['Prusament',  /prusament|prusa/i],
    ['Hatchbox',   /hatchbox/i],
    ['Overture',   /overture/i],
  ];
  let detectedBrand = null;
  for (const [brand, re] of brandMap) {
    if (re.test(text)) { detectedBrand = brand; break; }
  }

  // Extract color keywords
  const colorMap = [
    ['White',   /\bwhite\b|\bأبيض\b/i],
    ['Black',   /\bblack\b|\bأسود\b/i],
    ['Red',     /\bred\b|\bأحمر\b/i],
    ['Orange',  /\borange\b|\bبرتقالي\b/i],
    ['Yellow',  /\byellow\b|\bأصفر\b/i],
    ['Green',   /\bgreen\b|\bأخضر\b/i],
    ['Blue',    /\bblue\b|\bأزرق\b/i],
    ['Purple',  /\bpurple\b|\bviolet\b|\bبنفسجي\b/i],
    ['Pink',    /\bpink\b|\bوردي\b/i],
    ['Gray',    /\bgray\b|\bgrey\b|\bرمادي\b/i],
    ['Brown',   /\bbrown\b|\bبني\b/i],
    ['Gold',    /\bgold\b|\bذهبي\b/i],
    ['Silver',  /\bsilver\b|\bفضي\b/i],
    ['Copper',  /\bcopper\b|\bنحاسي\b/i],
    ['Clear',   /\bclear\b|\btransparent\b|\bشفاف\b/i],
    ['Natural', /\bnatural\b|\bطبيعي\b/i],
  ];
  let detectedColor = null;
  for (const [color, re] of colorMap) {
    if (re.test(text)) { detectedColor = color; break; }
  }

  return { type: detectedType, brand: detectedBrand, color: detectedColor };
}

function scoreFil(f, parsed) {
  let score = 0;
  if (parsed.brand && f.brand === parsed.brand) score += 10;
  if (parsed.type  && f.type  === parsed.type)  score += 8;
  if (parsed.color && f.color.toLowerCase().includes(parsed.color.toLowerCase())) score += 5;
  return score;
}

async function openFilamentScanner() {
  const hasBarcodeDetector = 'BarcodeDetector' in window;
  const hasCamera = !!navigator.mediaDevices?.getUserMedia;

  const bodyHtml = `
    <!-- Mode toggle -->
    <div style="display:flex; gap:6px; margin-bottom:14px;">
      <button id="scanModeCamera" class="btn small primary" style="flex:1;">${escapeHtml(t('scan.mode_camera') || '📷 Camera Scan')}</button>
      <button id="scanModeNFC"    class="btn ghost small"  style="flex:1;">${escapeHtml(t('scan.mode_nfc')    || '📋 Paste NFC Dump')}</button>
    </div>

    <!-- ── Camera panel ── -->
    <div id="scanPanelCamera">
      <div style="position:relative; display:inline-block; width:100%;">
        <video id="scanVideo" autoplay playsinline muted
          style="width:100%; max-height:280px; border-radius:var(--radius); background:#000; display:block;"></video>
        <div style="position:absolute;inset:0;pointer-events:none;border-radius:var(--radius);box-shadow:inset 0 0 0 3px rgba(91,156,240,0.4);"></div>
        <div style="position:absolute;inset:20%;pointer-events:none;">
          <div style="position:absolute;top:0;left:0;width:20px;height:20px;border-top:3px solid var(--primary);border-left:3px solid var(--primary);border-radius:2px 0 0 0;"></div>
          <div style="position:absolute;top:0;right:0;width:20px;height:20px;border-top:3px solid var(--primary);border-right:3px solid var(--primary);border-radius:0 2px 0 0;"></div>
          <div style="position:absolute;bottom:0;left:0;width:20px;height:20px;border-bottom:3px solid var(--primary);border-left:3px solid var(--primary);border-radius:0 0 0 2px;"></div>
          <div style="position:absolute;bottom:0;right:0;width:20px;height:20px;border-bottom:3px solid var(--primary);border-right:3px solid var(--primary);border-radius:0 0 2px 0;"></div>
        </div>
      </div>
      <p id="scanStatus" style="margin:8px 0 4px; font-size:12.5px; color:var(--text-muted); text-align:center;">
        ${escapeHtml(t('scan.aim') || 'Point camera at the QR code or barcode on the spool…')}
      </p>
      <div id="scanResultCamera" style="display:none; margin-top:10px; padding:14px; background:var(--surface-2); border:1px solid var(--primary); border-radius:var(--radius); text-align:left;"></div>
    </div>

    <!-- ── NFC paste panel ── -->
    <div id="scanPanelNFC" style="display:none;">
      <p style="font-size:12.5px; color:var(--text-dim); margin-bottom:10px;">
        ${escapeHtml(t('scan.nfc_paste_hint') || 'Use an NFC reader app on your phone (e.g. NFC Tools) to read the spool tag, then copy the raw hex dump and paste it here.')}
      </p>
      <textarea id="scanHexInput" rows="6" style="width:100%; font-family:monospace; font-size:11px; padding:8px;
        border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--surface-2); color:var(--text);
        resize:vertical;" placeholder="04 A1 B2 C3 D4 E5 F6 07 …&#10;(raw hex dump from NFC Tools or similar)"></textarea>
      <div style="display:flex; gap:8px; margin-top:8px; align-items:center;">
        <button class="btn small primary" id="btnParseHex">${escapeHtml(t('scan.parse_hex') || 'Parse NFC Data')}</button>
        <span style="font-size:11px; color:var(--text-muted);">
          ${escapeHtml(t('scan.nfc_standards') || 'Supports: OpenTag3D · OpenPrintTag (Prusa)')}
        </span>
      </div>
      <div id="scanResultNFC" style="display:none; margin-top:12px; padding:14px; background:var(--surface-2); border:1px solid var(--primary); border-radius:var(--radius);"></div>

      <div style="margin-top:14px; padding:10px 12px; background:rgba(91,156,240,0.06);
        border:1px solid rgba(91,156,240,0.2); border-radius:var(--radius-sm); font-size:11.5px; color:var(--text-muted);">
        <strong style="color:var(--primary);">iOS (coming soon):</strong>
        ${escapeHtml(t('scan.nfc_ios_note') || 'The iOS version will read NFC tags automatically — just tap the spool. Both OpenTag3D and OpenPrintTag (Prusa) are fully supported.')}
      </div>
    </div>
  `;

  openFormModal({
    title: t('scan.title') || 'Scan Filament Label',
    bodyHtml,
    noSave: true,
    onMount() {
      // ── shared: apply NFC/OpenTag result to form ──────────────────────────
      function applyNFCResult(nfcData, resultEl) {
        if (nfcData.error) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = `<div style="color:var(--danger); font-size:12.5px;">⚠ ${escapeHtml(nfcData.error)}</div>`;
          return;
        }

        const colorDot = nfcData.hex
          ? `<span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${escapeHtml(nfcData.hex)};border:2px solid rgba(255,255,255,0.2);vertical-align:middle;margin-inline-end:8px;"></span>`
          : '';
        const stdBadge = `<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:rgba(91,156,240,0.18);color:var(--primary);font-weight:600;">${escapeHtml(nfcData.standard)}</span>`;

        const metaRows = [];
        if (nfcData.weight)    metaRows.push(`${escapeHtml(t('inv.weight')||'Weight')}: <strong>${nfcData.weight} g</strong>`);
        if (nfcData.printTemp) metaRows.push(`Print: <strong>${nfcData.printTemp}°C</strong>`);
        if (nfcData.minPrint && nfcData.maxPrint) metaRows.push(`Print range: <strong>${nfcData.minPrint}–${nfcData.maxPrint}°C</strong>`);
        if (nfcData.bedTemp)   metaRows.push(`Bed: <strong>${nfcData.bedTemp}°C</strong>`);
        if (nfcData.minBed && nfcData.maxBed)     metaRows.push(`Bed range: <strong>${nfcData.minBed}–${nfcData.maxBed}°C</strong>`);
        if (nfcData.dryTemp)   metaRows.push(`Dry: <strong>${nfcData.dryTemp}°C${nfcData.dryTime ? ' × ' + nfcData.dryTime + ' h' : ''}</strong>`);
        if (nfcData.density)   metaRows.push(`Density: <strong>${nfcData.density} g/cm³</strong>`);

        resultEl.style.display = 'block';
        resultEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
            ${colorDot}
            <div style="flex:1;">
              <div style="font-weight:600;font-size:13px;">${escapeHtml(nfcData.colorName || nfcData.material || '—')}</div>
              <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(nfcData.manufacturer||'')} · ${escapeHtml(nfcData.material||'')} ${stdBadge}</div>
            </div>
            <button class="btn small primary" id="btnUseNFC">${escapeHtml(t('scan.use')||'Use this')}</button>
          </div>
          ${metaRows.length ? `<div style="font-size:11px;color:var(--text-dim);display:flex;flex-wrap:wrap;gap:8px 16px;">${metaRows.map(r=>`<span>${r}</span>`).join('')}</div>` : ''}`;

        document.getElementById('btnUseNFC').addEventListener('click', () => {
          const parts = [nfcData.manufacturer, nfcData.material, nfcData.colorName].filter(Boolean);
          $('#invMaterial').value = parts.join(' – ') || nfcData.material || '';
          if (nfcData.hex)    $('#invColor').value  = nfcData.hex;
          if (nfcData.weight) $('#invWeight').value = nfcData.weight;
          $('#modalMount').innerHTML = '';
          toast(t('inv.catalog_picked') || 'Filament imported from NFC tag', 'success', 2000);
        });
      }

      // ── mode toggle ───────────────────────────────────────────────────────
      let stream = null, scanTimer = null, cameraRunning = false;

      function stopCamera() {
        clearInterval(scanTimer); scanTimer = null;
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        cameraRunning = false;
      }

      document.getElementById('scanModeCamera').addEventListener('click', () => {
        document.getElementById('scanModeCamera').className = 'btn small primary';
        document.getElementById('scanModeNFC').className    = 'btn ghost small';
        document.getElementById('scanPanelCamera').style.display = '';
        document.getElementById('scanPanelNFC').style.display    = 'none';
        if (!cameraRunning) startCamera();
      });

      document.getElementById('scanModeNFC').addEventListener('click', () => {
        document.getElementById('scanModeNFC').className    = 'btn small primary';
        document.getElementById('scanModeCamera').className = 'btn ghost small';
        document.getElementById('scanPanelNFC').style.display    = '';
        document.getElementById('scanPanelCamera').style.display = 'none';
        stopCamera();
      });

      // ── NFC paste panel ───────────────────────────────────────────────────
      document.getElementById('btnParseHex').addEventListener('click', () => {
        const hex = document.getElementById('scanHexInput').value.trim();
        const result = parseNFCHex(hex);
        applyNFCResult(result, document.getElementById('scanResultNFC'));
      });

      // ── Camera panel ──────────────────────────────────────────────────────
      const video   = document.getElementById('scanVideo');
      const status  = document.getElementById('scanStatus');
      const resultC = document.getElementById('scanResultCamera');
      let done = false;

      // Stop camera when modal closes (disconnect observer immediately after firing)
      const _scanObserver = new MutationObserver(() => {
        if (!document.getElementById('scanVideo')) { stopCamera(); _scanObserver.disconnect(); }
      });
      _scanObserver.observe(document.getElementById('modalMount'), { childList: true, subtree: false });

      function showCameraMatch(rawText, parsed, matches) {
        done = true; stopCamera(); video.style.opacity = '0.4';
        if (matches.length) {
          const top = matches[0];
          resultC.style.display = 'block';
          resultC.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="width:26px;height:26px;border-radius:50%;background:${escapeHtml(top.hex)};border:2px solid rgba(255,255,255,0.2);flex-shrink:0;"></span>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:13px;">${escapeHtml(top.color)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(top.brand)} · ${escapeHtml(top.line)} · ${escapeHtml(top.type)}</div>
              </div>
              <button class="btn small primary" id="btnUseScan">${escapeHtml(t('scan.use')||'Use this')}</button>
            </div>
            ${matches.length > 1 ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:5px;">${escapeHtml(t('scan.other_matches')||'Other matches:')}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">${matches.slice(1,6).map((m,i)=>`
              <button class="btn ghost small scan-alt" data-idx="${i+1}" style="display:flex;align-items:center;gap:5px;font-size:11px;">
                <span style="width:10px;height:10px;border-radius:50%;background:${escapeHtml(m.hex)};flex-shrink:0;"></span>
                ${escapeHtml(m.color)} (${escapeHtml(m.type)})</button>`).join('')}</div>` : ''}
            <div style="margin-top:8px;font-size:10.5px;color:var(--text-muted);">
              ${escapeHtml(t('scan.raw')||'Scanned:')} <code>${escapeHtml(rawText.slice(0,80))}</code></div>`;

          document.getElementById('btnUseScan').addEventListener('click', () => {
            $('#invMaterial').value = `${top.brand} ${top.line} – ${top.color}`;
            $('#invColor').value    = top.hex;
            $('#modalMount').innerHTML = '';
            toast(t('inv.catalog_picked')||`${top.color} selected`, 'success', 1800);
          });
          resultC.querySelectorAll('.scan-alt').forEach(btn => {
            btn.addEventListener('click', () => {
              const m2 = matches[+btn.dataset.idx];
              $('#invMaterial').value = `${m2.brand} ${m2.line} – ${m2.color}`;
              $('#invColor').value    = m2.hex;
              $('#modalMount').innerHTML = '';
              toast(t('inv.catalog_picked')||`${m2.color} selected`, 'success', 1800);
            });
          });
        } else {
          resultC.style.display = 'block';
          resultC.innerHTML = `
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">${escapeHtml(t('scan.no_match')||'Not found in catalog:')}</div>
            <code style="font-size:11px;word-break:break-all;">${escapeHtml(rawText.slice(0,200))}</code>
            <div style="display:flex;gap:8px;margin-top:10px;">
              <button class="btn small primary" id="btnScanManual">${escapeHtml(t('scan.fill_manual')||'Fill from text')}</button>
              <button class="btn ghost small"   id="btnScanRetry">${escapeHtml(t('scan.retry')||'Scan again')}</button>
            </div>`;
          document.getElementById('btnScanManual').addEventListener('click', () => {
            $('#invMaterial').value = [parsed.brand, parsed.type, parsed.color].filter(Boolean).join(' ') || rawText.slice(0, 80);
            $('#modalMount').innerHTML = '';
          });
          document.getElementById('btnScanRetry').addEventListener('click', () => {
            done = false; resultC.style.display = 'none'; video.style.opacity = '1';
            status.textContent = t('scan.aim') || 'Point camera…'; status.style.color = 'var(--text-muted)';
            startCamera();
          });
        }
      }

      function startCamera() {
        if (!hasCamera) {
          status.textContent = t('scan.no_camera') || 'Camera not available';
          status.style.color = 'var(--danger)'; return;
        }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })
          .then(s => { stream = s; video.srcObject = s; cameraRunning = true; })
          .catch(() => {
            status.textContent = t('scan.camera_error') || 'Could not access camera.';
            status.style.color = 'var(--danger)';
          });
      }

      function startScanning() {
        if (!hasBarcodeDetector) {
          status.textContent = t('scan.no_detector') || 'Live barcode detection not supported.'; return;
        }
        const detector = new BarcodeDetector({ formats: ['qr_code','code_128','ean_13','data_matrix','aztec','pdf417'] });
        scanTimer = setInterval(async () => {
          if (done || video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0) {
              clearInterval(scanTimer);
              status.textContent = `✓ ${t('scan.detected')||'Code detected!'}`;
              status.style.color = 'var(--success, #22c55e)';
              const raw    = codes[0].rawValue;
              const parsed = parseFilamentFromText(raw);
              const scored = filamentsDB.map(f => ({ ...f, _score: scoreFil(f, parsed) })).filter(f => f._score > 0).sort((a,b) => b._score - a._score);
              showCameraMatch(raw, parsed, scored);
            }
          } catch { /* frame not ready */ }
        }, 400);
      }

      video.addEventListener('loadeddata', startScanning);
      startCamera();
    }
  });
}

function addInventoryItem() {
  const material = $('#invMaterial').value.trim();
  const cost = clampPositive($('#invCost').value);
  const weight = Math.max(1, num($('#invWeight').value, 1000));
  const color = $('#invColor').value || '#888888';
  if (!material) { toast(t('inv.material_ph'), 'error'); return; }
  const today = new Date().toISOString().split('T')[0];
  inventory.push({ id: uid('INV'), material, cost, weight, color, purchasedAt: today });
  saveAll();
  renderInventory();
  $('#invMaterial').value = '';
  toast(t('inv.added'), 'success');
}

async function deleteInventoryItem(id) {
  const item = inventory.find(i => i.id === id);
  const label = item ? `${item.material || ''} ${item.color || ''}`.trim() : id;
  const ok = await confirmModal(`${t('common.delete')} "${label}"?`, { danger: true });
  if (!ok) return;
  inventory = inventory.filter(i => i.id !== id);
  saveAll();
  renderInventory();
  toast(t('inv.removed'), 'success');
}

function openInventoryEditor(id) {
  const item = inventory.find(i => i.id === id);
  if (!item) return;

  const priceHistory = item.priceHistory || [];
  const histHtml = priceHistory.length > 0 ? `
    <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border-soft);">
      <label style="margin-top:0;">${escapeHtml(t('inv.price_history'))}</label>
      <div class="price-history-list">
        ${priceHistory.slice(-6).reverse().map(h => `
          <div class="price-history-row">
            <span class="ph-date">${escapeHtml(h.date)}</span>
            <span class="ph-cost">${fmtPrice(h.cost)}</span>
          </div>`).join('')}
      </div>
    </div>` : '';

  const bodyHtml = `
    <div class="inline-pair" style="align-items:end;">
      <div>
        <label>${escapeHtml(t('inv.material'))}</label>
        <input type="text" id="ieMatInput" value="${escapeHtml(item.material)}" placeholder="${escapeHtml(t('inv.material_ph'))}">
      </div>
      <div>
        <label>${escapeHtml(t('inv.color'))}</label>
        <input type="color" id="ieColorInput" value="${escapeHtml(item.color || '#888888')}" style="width:100%; height:38px; padding:3px 4px; border-radius:var(--radius-sm); border:1px solid var(--border); cursor:pointer; background:var(--bg-elev);">
      </div>
    </div>
    <label style="margin-top:14px;">${escapeHtml(t('inv.cost'))}</label>
    <input type="number" id="ieCostInput" value="${item.cost}" min="0" step="0.01">
    <label style="margin-top:14px;">${escapeHtml(t('inv.remaining'))}</label>
    <input type="number" id="ieWeightInput" value="${Math.round(item.weight)}" min="0" step="1">
    <div class="inline-pair" style="margin-top:14px;">
      <div>
        <label style="margin-top:0;">${escapeHtml(t('inv.purchased_on'))}</label>
        <input type="date" id="iePurchasedAt" value="${escapeHtml(item.purchasedAt || '')}">
      </div>
      <div>
        <label style="margin-top:0;">${escapeHtml(t('inv.opened_on'))}</label>
        <input type="date" id="ieOpenedAt" value="${escapeHtml(item.openedAt || '')}">
      </div>
    </div>
    <div style="margin-top:14px; padding:10px 12px; background:rgba(255,255,255,0.04); border-radius:var(--radius-sm); border:1px solid var(--border-soft);">
      <label style="margin-top:0; font-size:12px; font-weight:600;">🌡 ${escapeHtml(t('inv.print_settings'))}</label>
      <div class="inline-pair" style="margin-top:8px;">
        <div>
          <label style="margin-top:0; font-size:11.5px;">${escapeHtml(t('inv.print_temp'))}</label>
          <input type="number" id="iePrintTemp" value="${item.printTemp || ''}" min="0" step="1" placeholder="e.g. 215">
        </div>
        <div>
          <label style="margin-top:0; font-size:11.5px;">${escapeHtml(t('inv.bed_temp'))}</label>
          <input type="number" id="ieBedTemp" value="${item.bedTemp || ''}" min="0" step="1" placeholder="e.g. 60">
        </div>
        <div>
          <label style="margin-top:0; font-size:11.5px;">${escapeHtml(t('inv.max_speed'))}</label>
          <input type="number" id="ieMaxSpeed" value="${item.maxSpeed || ''}" min="0" step="1" placeholder="e.g. 200">
        </div>
      </div>
    </div>
    ${histHtml}
  `;

  openFormModal({
    title: t('inv.edit_title'),
    saveLabel: t('common.save'),
    bodyHtml,
    onSave() {
      const material = document.getElementById('ieMatInput').value.trim();
      if (!material) { toast(t('inv.material_ph'), 'error'); return false; }
      item.material = material;
      item.color    = document.getElementById('ieColorInput').value || '#888888';
      const newCost = clampPositive(document.getElementById('ieCostInput').value);
      // Track price history when cost changes
      if (newCost !== item.cost) {
        if (!item.priceHistory) item.priceHistory = [];
        item.priceHistory.push({ cost: item.cost, date: new Date().toISOString().split('T')[0] });
      }
      item.cost        = newCost;
      item.weight      = Math.max(0, num(document.getElementById('ieWeightInput').value, 0));
      item.purchasedAt = document.getElementById('iePurchasedAt').value || undefined;
      item.openedAt    = document.getElementById('ieOpenedAt').value || undefined;
      // Feature 4: Print settings
      const pt = num(document.getElementById('iePrintTemp').value, 0);
      const bt = num(document.getElementById('ieBedTemp').value, 0);
      const ms = num(document.getElementById('ieMaxSpeed').value, 0);
      item.printTemp = pt > 0 ? pt : undefined;
      item.bedTemp   = bt > 0 ? bt : undefined;
      item.maxSpeed  = ms > 0 ? ms : undefined;
      saveAll();
      renderInventory();
      toast(t('inv.updated'), 'success');
      return true;
    }
  });
}

function getQueuedWeight(itemId) {
  return printLog
    .filter(o => o.status !== 'completed' && o.status !== 'quote')
    .reduce((s, o) =>
      s + (o.parts || [])
        .filter(p => p.filamentId === itemId)
        .reduce((ps, p) => ps + (+p.printWeight || 0) * (+p.qty || 1), 0)
    , 0);
}

// Feature 3: Compute grams reserved for a specific spool across active orders
function getSpoolReservedGrams(spoolId) {
  return printLog
    .filter(o => o.status !== 'completed' && o.status !== 'quote')
    .reduce((s, o) =>
      s + (o.parts || [])
        .filter(p => p.spoolId === spoolId)
        .reduce((ps, p) => ps + (+p.weight || +p.printWeight || 0), 0)
    , 0);
}

function renderInventory() {
  const tbody = $('#inventoryTable tbody');
  if (inventory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(t('inv.empty'))}</td></tr>`;
  } else {
    const todayMs = Date.now();
    tbody.innerHTML = inventory.map(item => {
      const low = item.weight <= settings.lowStockThreshold;
      const queued = Math.round(getQueuedWeight(item.id));
      const warn   = queued > 0 && queued > item.weight;
      // Spool age badge
      const refDate = item.openedAt || item.purchasedAt;
      let ageBadge = '';
      if (refDate) {
        const ageMonths = Math.floor((todayMs - new Date(refDate + 'T00:00:00').getTime()) / (30.44 * 86400000));
        if (ageMonths >= 12) {
          ageBadge = ` <span style="font-size:10px; color:var(--danger); font-weight:600;" title="${escapeHtml(t('inv.spool_old_tip'))}">⚠ ${ageMonths}mo</span>`;
        } else if (ageMonths >= 6) {
          ageBadge = ` <span style="font-size:10px; color:var(--warning);" title="${escapeHtml(t('inv.spool_age_tip'))}">📅 ${ageMonths}mo</span>`;
        }
      }
      const reserved = Math.round(getSpoolReservedGrams(item.id));
      const reservedBadge = reserved > 0
        ? ` <span class="spool-reserved-badge">${escapeHtml(t('inv.reserved'))}: ${reserved}${escapeHtml(t('common.grams'))}</span>`
        : '';
      return `
        <tr${low ? ' style="background: rgba(245,166,35,0.08);"' : ''}>
          <td style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${escapeHtml(item.color || '#888888')}; flex-shrink:0; border:1px solid rgba(255,255,255,0.15);"></span>
            <strong>${escapeHtml(item.material)}</strong>${low ? ' <span style="color:var(--warning); font-size:11px;">· low</span>' : ''}${ageBadge}${reservedBadge}
            ${item.printTemp || item.bedTemp ? `<span style="font-size:10px; color:var(--primary);">🌡 ${item.printTemp ? item.printTemp + '°C print' : ''}${item.printTemp && item.bedTemp ? ' / ' : ''}${item.bedTemp ? item.bedTemp + '°C bed' : ''}</span>` : ''}
          </td>
          <td style="font-variant-numeric: tabular-nums;">${fmtPrice(item.cost)}</td>
          <td style="font-variant-numeric: tabular-nums;">${Math.round(item.weight)} ${escapeHtml(t('common.grams'))}</td>
          <td style="font-variant-numeric: tabular-nums; color:${queued > 0 ? (warn ? 'var(--danger)' : 'var(--text-dim)') : 'var(--text-muted)'};">
            ${queued > 0 ? Math.round(queued) + ' ' + escapeHtml(t('common.grams')) : '—'}${warn ? ' <span style="color:var(--danger); font-size:11px;">⚠</span>' : ''}
          </td>
          <td style="white-space:nowrap;">
            ${(() => {
              const mat = (item.material || '').toLowerCase();
              const isHygroscopic = ['nylon','pa','tpu','tpe','pva','petg'].some(h => mat.includes(h));
              if (!isHygroscopic) return '';
              const dryLog = item.dryingLog || [];
              if (dryLog.length === 0) {
                return `<span class="drying-warn-badge" style="margin-inline-end:6px;" title="${escapeHtml(t('inv.dry_log'))}">⚠ ${escapeHtml(t('inv.dry_warn'))}</span>`;
              }
              const lastDry = dryLog.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
              const daysSince = lastDry.date ? Math.floor((Date.now() - new Date(lastDry.date + 'T00:00:00').getTime()) / 86400000) : 999;
              if (daysSince > 7) {
                return `<span class="drying-warn-badge" style="margin-inline-end:6px;">⚠ ${escapeHtml(t('inv.dry_warn'))}</span>`;
              }
              return `<span class="drying-ok-badge" style="margin-inline-end:6px;">✅ ${escapeHtml(t('inv.dry_ok', { n: daysSince }))}</span>`;
            })()}
            ${low ? `<button class="btn small" data-act="reorder-inv" data-id="${item.id}" style="margin-inline-end:4px; color:var(--warning); border-color:var(--warning);">${escapeHtml(t('inv.reorder'))}</button>` : ''}
            <button class="btn small ghost" data-act="inv-dry-log" data-id="${item.id}" style="margin-inline-end:4px;" title="${escapeHtml(t('inv.dry_log'))}">🌡</button>
            <button class="btn small ghost" data-act="inv-spool-history" data-id="${item.id}" style="margin-inline-end:4px;" title="${escapeHtml(t('inv.spool_history'))}">📋</button>
            <button class="btn small ghost" data-act="adj-inv" data-id="${item.id}" style="margin-inline-end:4px;">${escapeHtml(t('inv.adjust'))}</button>
            <button class="btn small" data-act="edit-inv" data-id="${item.id}" style="margin-inline-end:4px;">${escapeHtml(t('common.edit'))}</button>
            <button class="btn danger small" data-act="del-inv" data-id="${item.id}">${escapeHtml(t('common.delete'))}</button>
          </td>
        </tr>`;
    }).join('');
  }
  populateFilamentDropdown();
}

function openStockAdjustModal(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const today = new Date().toISOString().split('T')[0];
  if (!item.adjustments) item.adjustments = [];
  const recentAdjs = item.adjustments.slice(0, 5);

  const histHtml = recentAdjs.length === 0
    ? ''
    : `<div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-soft);">
        <label style="margin-top:0; font-size:12px; font-weight:600; color:var(--text-muted);">${escapeHtml(t('inv.adj_history'))}</label>
        <div style="margin-top:6px;">
          ${recentAdjs.map(adj => `
            <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-dim); padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
              <span>${escapeHtml(adj.date)}</span>
              <span style="color:${adj.type === 'add' ? 'var(--success)' : 'var(--danger)'};">${adj.type === 'add' ? '+' : '-'}${escapeHtml(String(adj.amount))}g</span>
              <span style="flex:1; text-align:right; color:var(--text-muted);">${escapeHtml(adj.reason || '')}</span>
            </div>`).join('')}
        </div>
      </div>`;

  openFormModal({
    title: `${t('inv.adjust_title')} — ${escapeHtml(item.material)}`,
    saveLabel: t('common.save'),
    bodyHtml: `
      <p style="font-size:13px; color:var(--text-muted); margin:0 0 12px;">
        ${escapeHtml(t('inv.current_stock'))}: <strong>${Math.round(item.weight)}g</strong>
      </p>
      <label>${escapeHtml(t('inv.adj_amount'))} </label>
      <input type="number" id="adjAmountInput" min="1" step="1" value="" placeholder="0">
      <label style="margin-top:12px;">${escapeHtml(t('inv.adj_reason'))}</label>
      <input type="text" id="adjReasonInput" placeholder="">
      <div style="margin-top:12px; display:flex; gap:16px;">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="radio" name="adjType" value="add" checked style="width:auto; margin:0;">
          <span style="color:var(--success);">+ ${escapeHtml(t('inv.adj_add'))}</span>
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="radio" name="adjType" value="remove" style="width:auto; margin:0;">
          <span style="color:var(--danger);">− ${escapeHtml(t('inv.adj_remove'))}</span>
        </label>
      </div>
      ${histHtml}`,
    onSave() {
      const amount = num(document.getElementById('adjAmountInput').value, 0);
      if (amount <= 0) { toast(t('sup.amount_required'), 'error'); return false; }
      const type   = document.querySelector('input[name="adjType"]:checked').value;
      const reason = document.getElementById('adjReasonInput').value.trim();
      if (!item.adjustments) item.adjustments = [];
      item.adjustments.unshift({ id: uid('ADJ'), date: today, type, amount, reason });
      if (type === 'add') {
        item.weight = Math.max(0, item.weight + amount);
      } else {
        item.weight = Math.max(0, item.weight - amount);
      }
      saveAll();
      renderInventory();
      toast(t('inv.adj_saved'), 'success');
      return true;
    }
  });
}

/* ============================================================
   Spool usage history (Feature 3)
   ============================================================ */
function openSpoolHistory(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const history = item.usageHistory || [];
  const totalConsumed = history.reduce((s, h) => s + (+h.weightUsed || 0), 0);
  const tableHtml = history.length === 0
    ? `<p style="color:var(--text-muted); font-size:13px; text-align:center; padding:16px 0;">${escapeHtml(t('inv.spool_hist_empty'))}</p>`
    : `<div class="table-wrap"><table style="width:100%;">
        <thead><tr>
          <th>${escapeHtml(t('common.date'))}</th>
          <th>${escapeHtml(t('log.client'))}</th>
          <th>${escapeHtml(t('inv.spool_hist_weight'))}</th>
        </tr></thead>
        <tbody>${history.map(h => `<tr>
          <td style="font-family:var(--font-num); font-size:12px; color:var(--text-dim); white-space:nowrap;">${escapeHtml(h.date || '')}</td>
          <td>${escapeHtml(h.project || h.orderId || '')}</td>
          <td style="text-align:right; font-variant-numeric:tabular-nums;">${(+h.weightUsed || 0).toFixed(0)}g</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  openFormModal({
    title: `${t('inv.spool_history')} — ${escapeHtml(item.material)}`,
    noSave: true,
    sizeLg: true,
    bodyHtml: `
      <div style="display:flex; gap:20px; flex-wrap:wrap; margin-bottom:14px; font-size:13px;">
        <span>${escapeHtml(t('inv.current_stock'))}: <strong>${Math.round(item.weight)}g</strong></span>
        <span>${escapeHtml(t('inv.spool_consumed'))}: <strong>${totalConsumed.toFixed(0)}g</strong></span>
      </div>
      ${tableHtml}`,
  });
}

/* ============================================================
   Filament drying log (Feature 4)
   ============================================================ */
function openDryingLog(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  if (!item.dryingLog) item.dryingLog = [];
  const todayStr = new Date().toISOString().split('T')[0];

  function listHtml() {
    const log = [...item.dryingLog].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (log.length === 0)
      return `<p style="color:var(--text-muted); font-size:13px; text-align:center; padding:10px 0;">${escapeHtml(t('inv.dry_log'))} — ${escapeHtml(t('inv.spool_hist_empty'))}</p>`;
    return `<div class="table-wrap"><table style="width:100%;">
      <thead><tr>
        <th>${escapeHtml(t('inv.dry_date'))}</th>
        <th>${escapeHtml(t('inv.dry_temp'))}</th>
        <th>${escapeHtml(t('inv.dry_duration'))}</th>
        <th>${escapeHtml(t('common.notes'))}</th>
        <th></th>
      </tr></thead>
      <tbody>${log.map(e => `<tr>
        <td style="white-space:nowrap; font-size:12px; color:var(--text-dim);">${escapeHtml(e.date || '')}</td>
        <td style="text-align:center;">${e.tempC ? escapeHtml(String(e.tempC)) + '°C' : '—'}</td>
        <td style="text-align:center;">${e.durationH ? escapeHtml(String(e.durationH)) + 'h' : '—'}</td>
        <td style="color:var(--text-muted); font-size:12.5px;">${escapeHtml(e.notes || '')}</td>
        <td><button class="btn danger small" data-act="del-dry" data-dry-id="${e.id}">×</button></td>
      </tr>`).join('')}
      </tbody>
    </table></div>`;
  }

  openFormModal({
    title: `${escapeHtml(item.material)} — ${t('inv.dry_log')}`,
    saveLabel: t('inv.dry_add'),
    sizeLg: true,
    bodyHtml: `
      <div style="background:var(--surface-2); padding:14px; border-radius:var(--radius); margin-bottom:14px;">
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr 2fr; gap:8px; align-items:end;">
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.dry_date'))}</label>
            <input type="date" id="dryDate" value="${todayStr}">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.dry_temp'))}</label>
            <input type="number" id="dryTemp" min="0" max="120" step="1" placeholder="65">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.dry_duration'))}</label>
            <input type="number" id="dryDuration" min="0" step="0.5" placeholder="4">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('common.notes'))}</label>
            <input type="text" id="dryNotes" placeholder="${escapeHtml(t('common.optional'))}">
          </div>
        </div>
      </div>
      <div id="dryLogList">${listHtml()}</div>
    `,
    onMount(modal) {
      modal.querySelector('#dryLogList').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act="del-dry"]');
        if (!btn) return;
        item.dryingLog = item.dryingLog.filter(e2 => e2.id !== btn.dataset.dryId);
        saveAll();
        modal.querySelector('#dryLogList').innerHTML = listHtml();
      });
    },
    onSave(modal) {
      const date     = modal.querySelector('#dryDate').value     || todayStr;
      const tempC    = parseFloat(modal.querySelector('#dryTemp').value)     || null;
      const durationH = parseFloat(modal.querySelector('#dryDuration').value) || null;
      const notes    = modal.querySelector('#dryNotes').value.trim();
      item.dryingLog.unshift({ id: uid('DRY'), date, tempC, durationH, notes });
      saveAll();
      renderInventory();
      toast(t('inv.dry_add'), 'success');
      return true;
    }
  });
}

/* ============================================================
   Auto filament deduction (on completion)
   ============================================================ */
function deductFilamentForOrder(order) {
  if (!settings.autoDeduct) return;
  if (order.materialDeducted) return;
  let deductedAny = false;
  const today = new Date().toISOString().split('T')[0];
  for (const part of (order.parts || [])) {
    if (!part.filamentId || !part.printWeight) continue;
    const item = inventory.find(i => i.id === part.filamentId);
    if (!item) continue;
    item.weight = Math.max(0, item.weight - part.printWeight);
    if (!item.usageHistory) item.usageHistory = [];
    item.usageHistory.unshift({ orderId: order.id, project: order.project || '', weightUsed: +part.printWeight, date: today });
    deductedAny = true;
    toast(t('inv.deducted', { material: item.material, weight: Math.round(part.printWeight) }), 'info', 2200);
    if (item.weight <= settings.lowStockThreshold) {
      toast(t('inv.low_stock', { material: item.material, weight: Math.round(item.weight) }), 'error', 3800);
    }
  }
  if (deductedAny) {
    order.materialDeducted = true;
    saveAll();
    renderInventory();
  }

  // Feature 2: Deduct consumables based on print hours
  const printHrs = +order.printTime || 0;
  if (printHrs > 0) {
    consumables.forEach(c => {
      if (c.usagePerHour && c.usagePerHour > 0) {
        const used = c.usagePerHour * printHrs;
        c.stock = Math.max(0, (c.stock || 0) - used);
        if (c.stock <= (c.minStock || 0)) {
          toast(`${escapeHtml(t('cons.low'))}: ${c.name}`, 'warning', 3000);
        }
      }
    });
    saveAll();
    renderConsumables();
  }
}

/* ============================================================
   Non-filament consumables (glue, isopropyl, sandpaper, etc.)
   ============================================================ */
function renderConsumables() {
  const el = $('#consumablesTable tbody');
  if (!el) return;
  if (consumables.length === 0) {
    el.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(t('cons.empty'))}</td></tr>`;
    return;
  }
  el.innerHTML = consumables.map(c => {
    const low = c.minStock > 0 && c.stock <= c.minStock;
    const usageHint = c.usagePerHour > 0
      ? `<div style="font-size:10.5px; color:var(--primary); margin-top:1px;">${escapeHtml(t('cons.usage_per_hour'))}: ${c.usagePerHour} / h</div>`
      : '';
    return `
      <tr${low ? ' style="background:rgba(245,166,35,0.08);"' : ''}>
        <td><strong>${escapeHtml(c.name)}</strong>${low ? ` <span style="color:var(--warning); font-size:11px;">· ${escapeHtml(t('cons.low'))}</span>` : ''}${usageHint}</td>
        <td style="font-variant-numeric:tabular-nums;">${c.stock} ${escapeHtml(c.unit || '')}</td>
        <td style="font-variant-numeric:tabular-nums;">${c.minStock > 0 ? c.minStock + ' ' + escapeHtml(c.unit || '') : '—'}</td>
        <td style="font-variant-numeric:tabular-nums;">${c.cost > 0 ? fmtPrice(c.cost) : '—'}</td>
        <td style="white-space:nowrap;">
          <button class="btn small" data-act="edit-cons" data-id="${c.id}" style="margin-inline-end:4px;">${escapeHtml(t('common.edit'))}</button>
          <button class="btn danger small" data-act="del-cons" data-id="${c.id}">${escapeHtml(t('common.delete'))}</button>
        </td>
      </tr>`;
  }).join('');
}

function openConsumableEditor(id) {
  const existing = id ? consumables.find(c => c.id === id) : null;
  const draft = existing
    ? { ...existing }
    : { id: uid('CNS'), name: '', stock: 0, unit: '', cost: 0, minStock: 0, usagePerHour: 0 };

  const bodyHtml = `
    <label>${escapeHtml(t('cons.name'))}</label>
    <input type="text" data-f="name" value="${escapeHtml(draft.name)}" placeholder="${escapeHtml(t('cons.name_ph'))}">
    <div class="inline-pair" style="margin-top:12px;">
      <div>
        <label style="margin-top:0;">${escapeHtml(t('cons.stock'))}</label>
        <input type="number" data-f="stock" value="${draft.stock}" min="0" step="0.1">
      </div>
      <div>
        <label style="margin-top:0;">${escapeHtml(t('cons.unit'))}</label>
        <input type="text" data-f="unit" value="${escapeHtml(draft.unit)}" placeholder="pcs / ml / g">
      </div>
    </div>
    <div class="inline-pair" style="margin-top:12px;">
      <div>
        <label style="margin-top:0;">${escapeHtml(t('cons.cost'))} (${currencySymbol()})</label>
        <input type="number" data-f="cost" value="${draft.cost}" min="0" step="0.01">
      </div>
      <div>
        <label style="margin-top:0;">${escapeHtml(t('cons.min_stock'))}</label>
        <input type="number" data-f="minStock" value="${draft.minStock}" min="0" step="1">
      </div>
    </div>
    <div style="margin-top:12px; padding:10px 12px; background:rgba(255,255,255,0.04); border-radius:var(--radius-sm); border:1px solid var(--border-soft);">
      <label style="margin-top:0; font-size:12px; font-weight:600;">${escapeHtml(t('cons.usage_per_hour'))} <span style="font-weight:400; color:var(--text-muted);">(${escapeHtml(t('cons.auto_deducted'))})</span></label>
      <input type="number" id="consUsagePerHour" data-f="usagePerHour" value="${draft.usagePerHour || 0}" min="0" step="0.01" placeholder="0 = disabled">
    </div>`;

  openFormModal({
    title: existing ? t('cons.edit_title') : t('cons.add_title'),
    saveLabel: t('common.save'),
    bodyHtml,
    onMount(modal) {
      modal.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('input', () => { draft[inp.dataset.f] = inp.value; });
      });
    },
    onSave() {
      const name = draft.name?.trim ? draft.name.trim() : '';
      if (!name) { toast(t('cons.name_ph'), 'error'); return false; }
      draft.name         = name;
      draft.stock        = Math.max(0, num(draft.stock, 0));
      draft.cost         = Math.max(0, num(draft.cost, 0));
      draft.minStock     = Math.max(0, num(draft.minStock, 0));
      draft.unit         = (draft.unit || '').trim();
      draft.usagePerHour = Math.max(0, num(draft.usagePerHour, 0));
      if (existing) {
        Object.assign(existing, draft);
      } else {
        consumables.push(draft);
      }
      saveAll();
      renderConsumables();
      toast(t('cons.saved'), 'success');
      return true;
    }
  });
}

function deleteConsumable(id) {
  const c = consumables.find(x => x.id === id);
  if (!c) return;
  confirmModal(`${t('common.delete')} "${c.name}"?`, { danger: true }).then(ok => {
    if (!ok) return;
    consumables = consumables.filter(x => x.id !== id);
    saveAll();
    renderConsumables();
    toast(t('cons.deleted'), 'success');
  });
}

/* ============================================================
   Supplier / Vendor database
   ============================================================ */
const SUPPLIER_CATEGORIES = ['filament', 'hardware', 'tools', 'packaging', 'services', 'other'];

function renderSuppliers() {
  const tbody = $('#suppliersTable tbody');
  if (!tbody) return;
  if (suppliers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">${escapeHtml(t('sup.empty'))}</td></tr>`;
    return;
  }
  tbody.innerHTML = suppliers.map(s => {
    const totalSpent = s.purchases ? s.purchases.reduce((sum, p) => sum + (+p.amount || 0), 0) : 0;
    return `<tr>
      <td><strong>${escapeHtml(s.name)}</strong>${s.notes ? `<div style="font-size:11px;color:var(--text-muted);">${escapeHtml(s.notes)}</div>` : ''}</td>
      <td>${escapeHtml(t('sup.cat.' + (s.category || 'other')))}</td>
      <td>${s.phone ? `<button class="btn small ghost" data-act="sup-wa" data-id="${s.id}" title="WhatsApp">📲 ${escapeHtml(s.phone)}</button>` : '—'}</td>
      <td>${s.leadDays ? `${escapeHtml(String(s.leadDays))} ${escapeHtml(t('common.days'))}` : '—'}</td>
      <td style="font-variant-numeric:tabular-nums;">${totalSpent > 0 ? fmtPrice(totalSpent) : '—'}</td>
      <td>
        <button class="btn small" data-act="edit-sup" data-id="${s.id}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn small" data-act="log-purchase" data-id="${s.id}">${escapeHtml(t('sup.log_purchase'))}</button>
        <button class="btn small ghost" data-act="sup-history" data-id="${s.id}">${escapeHtml(t('sup.history'))}</button>
        <button class="btn danger small" data-act="del-sup" data-id="${s.id}">${escapeHtml(t('common.delete'))}</button>
      </td>
    </tr>`;
  }).join('');
}

function openSupplierEditor(id) {
  const sup = id ? suppliers.find(s => s.id === id) : null;
  const catOptions = SUPPLIER_CATEGORIES.map(c =>
    `<option value="${c}"${(!id && c === 'other') || (sup?.category === c) ? ' selected' : ''}>${escapeHtml(t('sup.cat.' + c))}</option>`
  ).join('');

  const bodyHtml = `
    <label>${escapeHtml(t('sup.name'))}</label>
    <input type="text" id="supNameInput" value="${escapeHtml(sup?.name || '')}" placeholder="${escapeHtml(t('sup.name_ph'))}">
    <label style="margin-top:12px;">${escapeHtml(t('sup.category'))}</label>
    <select id="supCatSelect">${catOptions}</select>
    <div class="inline-pair" style="margin-top:12px;">
      <div>
        <label>${escapeHtml(t('sup.phone'))}</label>
        <input type="tel" id="supPhoneInput" value="${escapeHtml(sup?.phone || '')}" placeholder="+966…">
      </div>
      <div>
        <label>${escapeHtml(t('sup.lead_time'))}</label>
        <input type="number" id="supLeadInput" min="0" step="1" value="${escapeHtml(String(sup?.leadDays || ''))}">
      </div>
    </div>
    <label style="margin-top:12px;">${escapeHtml(t('sup.website'))}</label>
    <input type="url" id="supWebInput" value="${escapeHtml(sup?.website || '')}" placeholder="https://…">
    <label style="margin-top:12px;">${escapeHtml(t('common.notes'))}</label>
    <textarea id="supNotesInput" rows="2" style="resize:vertical;">${escapeHtml(sup?.notes || '')}</textarea>`;

  openFormModal({
    title: sup ? t('sup.edit') : t('sup.add'),
    saveLabel: t('common.save'),
    bodyHtml,
    onSave() {
      const name = document.getElementById('supNameInput').value.trim();
      if (!name) { toast(t('sup.name_required'), 'error'); return false; }
      const data = {
        name,
        category: document.getElementById('supCatSelect').value,
        phone:    document.getElementById('supPhoneInput').value.trim(),
        leadDays: num(document.getElementById('supLeadInput').value, 0) || null,
        website:  document.getElementById('supWebInput').value.trim(),
        notes:    document.getElementById('supNotesInput').value.trim(),
      };
      if (sup) {
        Object.assign(sup, data);
      } else {
        suppliers.push({ id: uid('sup'), purchases: [], ...data });
      }
      saveAll();
      renderSuppliers();
      toast(t('sup.saved'), 'success');
      return true;
    }
  });
}

function openLogPurchaseModal(supplierId) {
  const sup = suppliers.find(s => s.id === supplierId);
  if (!sup) return;
  const today = new Date().toISOString().split('T')[0];

  const bodyHtml = `
    <p style="font-size:13px; font-weight:600; margin:0 0 12px;">${escapeHtml(sup.name)}</p>
    <label>${escapeHtml(t('sup.purchase_date'))}</label>
    <input type="date" id="purchDateInput" value="${today}">
    <label style="margin-top:12px;">${escapeHtml(t('sup.purchase_amount'))} (${currencySymbol()})</label>
    <input type="number" id="purchAmtInput" min="0" step="0.01" placeholder="0.00">
    <label style="margin-top:12px;">${escapeHtml(t('sup.purchase_item'))}</label>
    <input type="text" id="purchItemInput" placeholder="${escapeHtml(t('sup.purchase_item_ph'))}">
    <label style="margin-top:12px;">${escapeHtml(t('common.notes'))}</label>
    <input type="text" id="purchNotesInput" placeholder="${escapeHtml(t('sup.purchase_notes_ph'))}">`;

  openFormModal({
    title: t('sup.log_purchase'),
    saveLabel: t('common.save'),
    bodyHtml,
    onSave() {
      const amt = num(document.getElementById('purchAmtInput').value, 0);
      if (amt <= 0) { toast(t('sup.amount_required'), 'error'); return false; }
      if (!sup.purchases) sup.purchases = [];
      sup.purchases.unshift({
        id:     uid('pch'),
        date:   document.getElementById('purchDateInput').value,
        amount: amt,
        item:   document.getElementById('purchItemInput').value.trim(),
        notes:  document.getElementById('purchNotesInput').value.trim(),
      });
      saveAll();
      renderSuppliers();
      toast(t('sup.purchase_saved'), 'success');
      return true;
    }
  });
}

function openSupplierHistory(supplierId) {
  const sup = suppliers.find(s => s.id === supplierId);
  if (!sup) return;
  const purchases = sup.purchases || [];
  const totalSpent = purchases.reduce((sum, p) => sum + (+p.amount || 0), 0);

  const rowsHtml = purchases.length === 0
    ? `<p style="color:var(--text-muted); font-size:13px; margin:12px 0;">${escapeHtml(t('sup.history_empty'))}</p>`
    : `<div class="table-wrap" style="margin-top:12px;">
        <table>
          <thead><tr>
            <th>${escapeHtml(t('sup.hist_date'))}</th>
            <th>${escapeHtml(t('sup.hist_item'))}</th>
            <th>${escapeHtml(t('sup.hist_amount'))}</th>
            <th>${escapeHtml(t('common.notes'))}</th>
          </tr></thead>
          <tbody>
            ${purchases.map(p => `
              <tr>
                <td style="white-space:nowrap; font-size:12px; color:var(--text-dim);">${escapeHtml(p.date || '')}</td>
                <td>${escapeHtml(p.item || '')}</td>
                <td style="font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap;">${fmtPrice(p.amount || 0)}</td>
                <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.notes || '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px; text-align:right; font-weight:600; font-size:14px;">
        ${escapeHtml(t('sup.hist_total'))}: ${fmtPrice(totalSpent)}
      </div>`;

  openFormModal({
    title: `${escapeHtml(sup.name)} — ${t('sup.history')}`,
    noSave: true,
    sizeLg: true,
    bodyHtml: `
      <p style="font-size:12px; color:var(--text-muted); margin:0 0 4px;">${escapeHtml(t('sup.cat.' + (sup.category || 'other')))}</p>
      ${rowsHtml}`,
  });
}

async function deleteSupplier(id) {
  const sup = suppliers.find(s => s.id === id);
  if (!sup) return;
  const ok = await confirmModal(`${t('common.delete')} "${sup.name}"?`, { danger: true });
  if (!ok) return;
  suppliers = suppliers.filter(s => s.id !== id);
  saveAll();
  renderSuppliers();
  toast(t('sup.deleted'), 'success');
}

/* ============================================================
   Catalog — products with photos, multi-part, "Quote this"
   ============================================================ */
function getProductStats(productId) {
  const orders = printLog.filter(o => o.productId === productId);
  const completed = orders.filter(o => o.status === 'completed');
  return {
    count: orders.length,
    completedCount: completed.length,
    revenue: completed.reduce((s, o) => s + +o.price, 0),
    lastDate: orders[0]?.date || null
  };
}

function renderCatalog() {
  const grid = $('#catalogGrid');
  const term = (catalogSearchTerm || '').toLowerCase().trim();
  let filtered = products;
  if (term) {
    filtered = products.filter(p =>
      (p.nameEn || '').toLowerCase().includes(term) ||
      (p.nameAr || '').toLowerCase().includes(term) ||
      (p.description || '').toLowerCase().includes(term)
    );
  }

  if (products.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">${escapeHtml(t('cat.empty'))}</div>`;
    return;
  }
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">${escapeHtml(t('cat.empty_search'))}</div>`;
    return;
  }

  // Precompute stats for all products in one pass to avoid O(n²) scan
  const productStatsMap = new Map();
  for (const o of printLog) {
    if (!o.productId) continue;
    let s = productStatsMap.get(o.productId);
    if (!s) { s = { count: 0, completedCount: 0, revenue: 0, lastDate: null }; productStatsMap.set(o.productId, s); }
    s.count++;
    if (o.status === 'completed') { s.completedCount++; s.revenue += +o.price; }
    if (!s.lastDate || o.date > s.lastDate) s.lastDate = o.date;
  }

  grid.innerHTML = filtered.map(p => {
    const stats = productStatsMap.get(p.id) || { count: 0, completedCount: 0, revenue: 0, lastDate: null };
    const displayName = localName(p);
    const altName     = i18n.current === 'ar' ? p.nameEn : p.nameAr;
    const partsCount = (p.parts || []).length;
    const partsLabel = partsCount === 1 ? t('cat.part') : t('cat.parts');
    const printedLabel = stats.count > 0 ? t('cat.printed_n', { n: stats.count }) : t('cat.never_printed');
    const lastLabel = stats.lastDate ? t('cat.last', { date: stats.lastDate }) : '';
    const photo = p.thumbnail
      ? `<img src="${p.thumbnail}" alt="${escapeHtml(displayName)}">`
      : `<div class="no-photo">
           <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
           <span>${escapeHtml(t('cat.no_photo'))}</span>
         </div>`;

    return `
      <div class="product-card" data-id="${p.id}">
        <div class="product-photo">${photo}</div>
        <div class="product-body">
          <h4 class="product-name">${escapeHtml(displayName || '—')}</h4>
          ${altName ? `<div class="product-name-ar">${escapeHtml(altName)}</div>` : ''}
          <div class="product-meta">
            <span>${partsCount} ${escapeHtml(partsLabel)}</span>
            <span class="sep">·</span>
            <span>${escapeHtml(printedLabel)}</span>
            ${lastLabel ? `<span class="sep">·</span><span>${escapeHtml(lastLabel)}</span>` : ''}
          </div>
          ${stats.revenue > 0 ? `<div class="product-meta"><span style="color: var(--success);">${fmtPrice(stats.revenue)} ${escapeHtml(t('cat.revenue'))}</span></div>` : ''}
        </div>
        <div class="product-actions">
          <button class="btn success" data-act="cat-quote" data-id="${p.id}">${escapeHtml(t('cat.quote'))}</button>
          <button class="btn" data-act="cat-edit" data-id="${p.id}">${escapeHtml(t('common.edit'))}</button>
          <button class="btn danger" data-act="cat-del" data-id="${p.id}">${escapeHtml(t('common.delete'))}</button>
        </div>
      </div>`;
  }).join('');
}

function quoteFromProduct(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  // Append parts to current build, each with a fresh id and freshly computed baseCost.
  // Catalog parts only store raw inputs — baseCost is derived so it always reflects
  // the part's current numbers (and any future calculator changes).
  for (const part of (p.parts || [])) {
    const partCopy = { ...part, id: uid('PRT') };
    if (!partCopy.material && partCopy.filamentId) {
      const inv = inventory.find(i => i.id === partCopy.filamentId);
      if (inv) partCopy.material = inv.material;
    }
    partCopy.baseCost = computePartBaseCost(partCopy);
    currentBuild.push(partCopy);
  }
  currentBuildFromProductId = p.id;
  if (p.defaultMargin !== undefined && p.defaultMargin !== '') {
    $('#margin').value = p.defaultMargin;
  }
  switchTab('calculator-tab');
  renderBuild();
  renderProductTierChips(p);
  toast(t('calc.quote.from_catalog', { name: localName(p) }), 'info');
}

async function deleteProduct(productId) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  const ok = await confirmModal(t('pe.delete_q'), { danger: true });
  if (!ok) return;
  if (p.imagePath && window.hubAPI?.deleteProductImage) {
    try { await window.hubAPI.deleteProductImage(p.imagePath); } catch (_) {}
  }
  products = products.filter(x => x.id !== productId);
  saveAll();
  renderCatalog();
  toast(t('pe.deleted'), 'success');
}

/* ----- Product editor modal ----- */
function openProductEditor(productId = null) {
  const existing = productId ? products.find(p => p.id === productId) : null;
  const editing = !!existing;
  const draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        id: uid('PROD'),
        nameEn: '',
        nameAr: '',
        description: '',
        thumbnail: null,
        imagePath: null,
        defaultMargin: 30,
        priceTiers: [],
        parts: [],
        createdAt: new Date().toISOString().split('T')[0]
      };
  if (!draft.priceTiers) draft.priceTiers = [];

  // Local mutable photo state for the modal
  let stagedThumbnail = draft.thumbnail || null;
  let stagedFullDataUrl = null; // only set if a new photo was picked

  const partsHtml = () => (draft.parts.length === 0
    ? `<div class="empty-state" style="padding:18px;">${escapeHtml(t('pe.no_parts'))}</div>`
    : draft.parts.map((part, i) => renderPartRow(part, i)).join(''));

  function renderPartRow(part, i) {
    const filamentOptions = inventory.map(it =>
      `<option value="${it.id}" ${part.filamentId === it.id ? 'selected' : ''}>${escapeHtml(it.material)}</option>`
    ).join('');
    return `
      <div class="part-row" data-pi="${i}">
        <div class="part-head">
          <h4>${escapeHtml(t('pe.part_n', { n: i + 1 }))}</h4>
          <button class="btn danger small" data-act="rm-part" data-pi="${i}">${escapeHtml(t('pe.remove_part'))}</button>
        </div>
        <div class="pair-3">
          <div>
            <label>${escapeHtml(t('calc.part.name'))}</label>
            <input type="text" data-f="name" value="${escapeHtml(part.name || '')}">
          </div>
          <div>
            <label>${escapeHtml(t('calc.part.filament'))}</label>
            <select data-f="filamentId">${filamentOptions}</select>
          </div>
          <div>
            <label>${escapeHtml(t('calc.part.print_wt'))} (${escapeHtml(t('common.grams'))})</label>
            <input type="number" min="0" step="1" data-f="printWeight" value="${part.printWeight ?? 0}">
          </div>
          <div>
            <label>${escapeHtml(t('calc.machine.time'))} (${escapeHtml(t('common.hours'))})</label>
            <input type="number" min="0" step="0.1" data-f="printTime" value="${part.printTime ?? 0}">
          </div>
          <div>
            <label>${escapeHtml(t('calc.labor.prep'))} (${escapeHtml(t('common.hours'))})</label>
            <input type="number" min="0" step="0.1" data-f="prepTime" value="${part.prepTime ?? 0}">
          </div>
          <div>
            <label>${escapeHtml(t('calc.labor.post'))} (${escapeHtml(t('common.hours'))})</label>
            <input type="number" min="0" step="0.1" data-f="postTime" value="${part.postTime ?? 0}">
          </div>
        </div>
      </div>`;
  }

  const bodyHtml = `
    <div class="photo-uploader">
      <div class="photo-drop ${stagedThumbnail ? 'has-photo' : ''}" data-act="pick-photo">
        ${stagedThumbnail
            ? `<img src="${stagedThumbnail}" alt="">`
            : `<span>${escapeHtml(t('pe.photo_drop'))}</span>`}
      </div>
      <div class="photo-actions">
        <button class="btn small" data-act="pick-photo">${escapeHtml(stagedThumbnail ? t('pe.photo_change') : t('pe.photo'))}</button>
        ${stagedThumbnail ? `<button class="btn danger small" data-act="remove-photo">${escapeHtml(t('pe.photo_remove'))}</button>` : ''}
      </div>
    </div>
    <input type="file" id="productPhotoInput" accept="image/jpeg,image/png,image/webp" style="display:none;">

    <div class="inline-pair" style="margin-top: 16px;">
      <div>
        <label>${escapeHtml(t('pe.name_en'))}</label>
        <input type="text" data-f="nameEn" placeholder="${escapeHtml(t('pe.name_en_ph'))}" value="${escapeHtml(draft.nameEn || '')}">
      </div>
      <div>
        <label>${escapeHtml(t('pe.name_ar'))}</label>
        <input type="text" data-f="nameAr" dir="rtl" placeholder="${escapeHtml(t('pe.name_ar_ph'))}" value="${escapeHtml(draft.nameAr || '')}">
      </div>
    </div>

    <label>${escapeHtml(t('pe.description'))}</label>
    <input type="text" data-f="description" placeholder="${escapeHtml(t('pe.description_ph'))}" value="${escapeHtml(draft.description || '')}">

    <label>${escapeHtml(t('pe.default_margin'))} (${escapeHtml(t('common.percent'))})</label>
    <input type="number" min="0" data-f="defaultMargin" value="${draft.defaultMargin ?? 30}">

    <div style="display:flex; align-items:center; margin-top:14px; gap:10px;">
      <label style="margin:0; flex:1;">${escapeHtml(t('cat.tiers_section'))}</label>
      <button class="btn small" data-act="add-tier">${escapeHtml(t('cat.add_tier'))}</button>
    </div>
    <div id="tiersEditor" style="margin-top:6px;"></div>
    <p style="font-size:11.5px;color:var(--text-muted);margin:4px 0 0;">${escapeHtml(t('cat.tiers_hint'))}</p>

    <div style="display:flex; align-items:center; margin: 18px 0 8px; gap:10px;">
      <h3 class="card-head" style="margin:0; flex:1;"><span class="swatch"></span>${escapeHtml(t('pe.parts'))}</h3>
      <button class="btn small primary" data-act="add-part">${escapeHtml(t('pe.add_part'))}</button>
    </div>

    <div class="parts-editor" id="partsEditor">${partsHtml()}</div>
  `;

  openFormModal({
    title: editing ? t('pe.edit_title') : t('pe.new_title'),
    saveLabel: t('pe.save'),
    bodyHtml,
    onMount(modal) {
      // Pricing tiers
      const tiersContainer = modal.querySelector('#tiersEditor');
      const tiersHtml = () => {
        if (!draft.priceTiers || draft.priceTiers.length === 0)
          return `<p style="font-size:12px;color:var(--text-muted);margin:0;">${escapeHtml(t('cat.no_tiers'))}</p>`;
        return draft.priceTiers.map((tier, i) => `
          <div class="tier-row" data-ti="${i}" style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
            <input type="text" class="tier-lbl" value="${escapeHtml(tier.label)}" placeholder="${escapeHtml(t('cat.tier_label'))}" style="flex:1;margin:0;">
            <input type="number" class="tier-mg" value="${tier.margin}" min="0" step="1" style="width:70px;margin:0;">
            <span style="font-size:12px;color:var(--text-muted);">%</span>
            <button class="btn danger small" data-act="rm-tier" data-ti="${i}" style="margin:0;">×</button>
          </div>`).join('');
      };
      const refreshTiers = () => { tiersContainer.innerHTML = tiersHtml(); };
      refreshTiers();

      modal.querySelector('[data-act="add-tier"]').addEventListener('click', () => {
        draft.priceTiers.push({ label: 'Wholesale', margin: 20 });
        refreshTiers();
      });
      tiersContainer.addEventListener('input', (e) => {
        const row = e.target.closest('[data-ti]');
        if (!row) return;
        const ti = +row.dataset.ti;
        if (e.target.classList.contains('tier-lbl')) draft.priceTiers[ti].label = e.target.value;
        if (e.target.classList.contains('tier-mg')) draft.priceTiers[ti].margin = num(e.target.value, 0);
      });
      tiersContainer.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-act="rm-tier"]');
        if (rm) { draft.priceTiers.splice(+rm.dataset.ti, 1); refreshTiers(); }
      });

      const partsContainer = modal.querySelector('#partsEditor');

      function refreshParts() {
        partsContainer.innerHTML = partsHtml();
      }

      // Sync top-level inputs into draft
      modal.querySelectorAll('[data-f]').forEach(input => {
        input.addEventListener('input', () => {
          const f = input.dataset.f;
          if (f && Object.prototype.hasOwnProperty.call(draft, f)) {
            draft[f] = input.type === 'number' ? num(input.value, 0) : input.value;
          }
        });
      });

      // Part row inputs (delegated)
      partsContainer.addEventListener('input', (e) => {
        const input = e.target.closest('[data-f]');
        const row = e.target.closest('[data-pi]');
        if (!input || !row) return;
        const pi = +row.dataset.pi;
        const f = input.dataset.f;
        if (!draft.parts[pi]) return;
        draft.parts[pi][f] = input.type === 'number' ? num(input.value, 0) : input.value;
      });

      // Part row actions
      partsContainer.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-act="rm-part"]');
        if (rm) {
          draft.parts.splice(+rm.dataset.pi, 1);
          refreshParts();
        }
      });

      // Add a new part — defaults pulled from current calculator form
      modal.querySelector('[data-act="add-part"]').addEventListener('click', () => {
        draft.parts.push({
          name: '',
          filamentId: inventory[0]?.id || '',
          spoolCost:   num($('#spoolCost').value, 75),
          spoolWeight: num($('#spoolWeight').value, 1000),
          printWeight: 0,
          printTime: 0,
          wearRate:    num($('#wearRate').value, 0.75),
          powerDraw:   num($('#powerDraw').value, 150),
          elecRate:    num($('#elecRate').value, 0.18),
          prepTime: 0.1,
          postTime: 0.2,
          laborRate:   num($('#laborRate').value, 90),
          failureRate: num($('#failureRate').value, 10),
        });
        refreshParts();
      });

      // Photo upload
      const photoInput = modal.querySelector('#productPhotoInput');
      const photoDrop  = modal.querySelector('.photo-drop');

      const pickPhoto = () => photoInput.click();
      modal.querySelectorAll('[data-act="pick-photo"]').forEach(el => el.addEventListener('click', pickPhoto));

      photoInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) { toast(t('pe.image_too_big'), 'error'); return; }
        try {
          stagedThumbnail   = await resizeImage(file, 240, 0.85);
          stagedFullDataUrl = await resizeImage(file, 1600, 0.88);
          // Re-render the uploader area
          photoDrop.classList.add('has-photo');
          photoDrop.innerHTML = `<img src="${stagedThumbnail}" alt="">`;
        } catch (err) {
          console.error(err);
          toast('Image error', 'error');
        }
      });

      // Drag-and-drop
      ['dragover', 'dragenter'].forEach(ev => photoDrop.addEventListener(ev, (e) => {
        e.preventDefault();
        photoDrop.classList.add('dragover');
      }));
      ['dragleave', 'drop'].forEach(ev => photoDrop.addEventListener(ev, () => {
        photoDrop.classList.remove('dragover');
      }));
      photoDrop.addEventListener('drop', async (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
          try {
            stagedThumbnail   = await resizeImage(file, 240, 0.85);
            stagedFullDataUrl = await resizeImage(file, 1600, 0.88);
            photoDrop.classList.add('has-photo');
            photoDrop.innerHTML = `<img src="${stagedThumbnail}" alt="">`;
          } catch (err) { console.error(err); }
        }
      });

      // Remove photo
      const removeBtn = modal.querySelector('[data-act="remove-photo"]');
      if (removeBtn) removeBtn.addEventListener('click', () => {
        stagedThumbnail = null;
        stagedFullDataUrl = null;
        draft.thumbnail = null;
        // If editing, also queue deletion of disk image
        if (draft.imagePath && window.hubAPI?.deleteProductImage) {
          window.hubAPI.deleteProductImage(draft.imagePath).catch(() => {});
        }
        draft.imagePath = null;
        photoDrop.classList.remove('has-photo');
        photoDrop.innerHTML = `<span>${escapeHtml(t('pe.photo_drop'))}</span>`;
      });
    },

    async onSave(modal) {
      // Validate
      if (!draft.nameEn?.trim() && !draft.nameAr?.trim()) {
        toast(t('pe.need_name'), 'error');
        return false;
      }
      if (!draft.parts || draft.parts.length === 0) {
        toast(t('pe.need_part'), 'error');
        return false;
      }

      // Save full image to disk if a new one was picked
      if (stagedFullDataUrl && window.hubAPI?.saveProductImage) {
        try {
          const filename = await window.hubAPI.saveProductImage(draft.id, stagedFullDataUrl);
          draft.imagePath = filename;
        } catch (err) {
          console.error('save image failed', err);
        }
      }
      if (stagedThumbnail !== undefined) draft.thumbnail = stagedThumbnail;

      // Persist
      const idx = products.findIndex(p => p.id === draft.id);
      if (idx >= 0) products[idx] = draft;
      else products.push(draft);

      saveAll();
      renderCatalog();
      toast(t('pe.saved'), 'success');
      return true;
    }
  });
}

/* ----- Image resize util (returns dataURL) ----- */
function resizeImage(file, maxDim, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // flatten transparency to white for JPEG
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============================================================
   Clients
   ============================================================ */
function getClientStats(clientId) {
  const orders = printLog.filter(o => o.clientId === clientId);
  const completed = orders.filter(o => o.status === 'completed');
  return {
    count: orders.length,
    completedCount: completed.length,
    revenue: completed.reduce((s, o) => s + +o.price, 0),
    lastDate: orders[0]?.date || null
  };
}

function renderClients() {
  const tbody = $('#clientsTable tbody');
  const term = (clientSearchTerm || '').toLowerCase().trim();
  let filtered = clients;
  if (term) {
    filtered = clients.filter(c =>
      (c.nameEn || '').toLowerCase().includes(term) ||
      (c.nameAr || '').toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term) ||
      (c.email || '').toLowerCase().includes(term)
    );
  }
  if (clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(t('cl.empty'))}</td></tr>`;
    return;
  }
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(t('cl.empty_search'))}</td></tr>`;
    return;
  }
  // Precompute client stats in one pass to avoid O(n²) scan
  const clientStatsMap = new Map();
  for (const o of printLog) {
    if (!o.clientId) continue;
    let s = clientStatsMap.get(o.clientId);
    if (!s) { s = { count: 0, completedCount: 0, revenue: 0, lastDate: null }; clientStatsMap.set(o.clientId, s); }
    s.count++;
    if (o.status === 'completed') { s.completedCount++; s.revenue += +o.price; }
    if (!s.lastDate || o.date > s.lastDate) s.lastDate = o.date;
  }

  tbody.innerHTML = filtered.map(c => {
    const stats = clientStatsMap.get(c.id) || { count: 0, completedCount: 0, revenue: 0, lastDate: null };
    const displayName = localName(c);
    const altName     = i18n.current === 'ar' ? c.nameEn : c.nameAr;
    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="avatar">${escapeHtml(initials(displayName))}</span>
            <div>
              <strong>${escapeHtml(displayName || '—')}</strong>
              ${c.recurring?.enabled ? `<span class="rec-badge">${escapeHtml(t('rec.badge.' + (c.recurring.interval || 'monthly')))}</span>` : ''}
              ${c.currency && c.currency !== (settings.currency || 'SAR') ? `<span class="currency-badge">${escapeHtml(c.currency)}</span>` : ''}
              ${altName ? `<div style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(altName)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="font-variant-numeric: tabular-nums;">${escapeHtml(c.phone || '—')}</td>
        <td style="font-variant-numeric: tabular-nums;">${stats.count}</td>
        <td style="font-variant-numeric: tabular-nums; color: var(--success);">${fmtPrice(stats.revenue)}</td>
        <td style="font-variant-numeric: tabular-nums; color: var(--text-dim);">${escapeHtml(stats.lastDate || t('cl.never_ordered'))}</td>
        <td>
          <button class="btn small" data-act="cl-history" data-id="${c.id}">${escapeHtml(t('cl.history'))}</button>
          <button class="btn small success" data-act="cl-quote" data-id="${c.id}">${escapeHtml(t('cl.quote'))}</button>
          <button class="btn small" data-act="cl-intake-form" data-id="${c.id}" title="${escapeHtml(t('cl.intake_form'))}">📋</button>
          <button class="btn small" data-act="cl-edit" data-id="${c.id}">${escapeHtml(t('common.edit'))}</button>
          <button class="btn danger small" data-act="cl-del" data-id="${c.id}">${escapeHtml(t('common.delete'))}</button>
        </td>
      </tr>`;
  }).join('');
}

function quoteForClient(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  currentClientId = c.id;
  const display = localName(c);
  $('#clientInput').value = display;
  switchTab('calculator-tab');
}

/* Feature 6: Client job intake form (PDF/HTML export) */
async function generateIntakeForm(clientId) {
  const client = clientId ? clients.find(c => c.id === clientId) : null;
  const shopName  = settings.bizEn || settings.bizAr || 'Khayt';
  const shopPhone = settings.phone || '';
  const shopEmail = settings.email || '';
  const clientName = client ? localName(client) : '';
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const accentColor = settings.invAccentColor || '#5E2E14';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${shopName} — ${t('cl.intake_title')}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #222; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${accentColor}; padding-bottom: 16px; margin-bottom: 24px; }
  .shop-name { font-size: 22px; font-weight: 700; color: ${accentColor}; }
  .shop-contact { font-size: 12px; color: #555; text-align: right; }
  h1 { font-size: 20px; color: ${accentColor}; margin-bottom: 20px; }
  .field { margin-bottom: 18px; }
  label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #333; }
  .field-line { border-bottom: 1px solid #999; height: 28px; }
  .checkbox-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .checkbox-row input { width: 16px; height: 16px; }
  .signature-area { display: flex; gap: 40px; margin-top: 32px; border-top: 1px solid #ccc; padding-top: 20px; }
  .sig-block { flex: 1; }
  .sig-block .sig-line { border-bottom: 1px solid #555; height: 40px; margin-bottom: 6px; }
  .sig-block label { font-size: 12px; color: #666; }
  .footer { margin-top: 32px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="shop-name">${escapeHtml(shopName)}</div>
      ${shopPhone ? `<div style="font-size:12px; color:#555;">${escapeHtml(shopPhone)}</div>` : ''}
    </div>
    <div class="shop-contact">
      ${shopEmail ? `<div>${escapeHtml(shopEmail)}</div>` : ''}
      <div>${dateStr}</div>
    </div>
  </div>

  <h1>${escapeHtml(t('cl.intake_title'))}</h1>

  <div class="field">
    <label>${escapeHtml(t('cl.name'))}</label>
    <div class="field-line">${escapeHtml(clientName)}</div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.phone'))} / ${escapeHtml(t('cl.email'))}</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.intake_project'))}</label>
    <div class="field-line"></div>
    <div class="field-line" style="margin-top:8px;"></div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.intake_qty'))}</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>Material preference</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>Color preference</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.intake_deadline'))}</label>
    <div class="field-line"></div>
  </div>
  <div class="field">
    <label>${escapeHtml(t('cl.intake_requirements'))}</label>
    <div class="field-line"></div>
    <div class="field-line" style="margin-top:8px;"></div>
  </div>
  <div class="field">
    <label>File delivery method</label>
    <div class="checkbox-row"><input type="checkbox"> Email</div>
    <div class="checkbox-row"><input type="checkbox"> WeTransfer</div>
    <div class="checkbox-row"><input type="checkbox"> USB</div>
  </div>
  <div class="checkbox-row" style="margin-top:12px;">
    <input type="checkbox">
    <label style="font-weight:400; font-size:13px;">I approve minor design adjustments if needed</label>
  </div>

  <div class="signature-area">
    <div class="sig-block">
      <div class="sig-line"></div>
      <label>Client Signature &amp; Date</label>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <label>Studio Representative</label>
    </div>
  </div>

  <div class="footer">${escapeHtml(shopName)} · ${escapeHtml(settings.addrEn || '')}</div>
</body>
</html>`;

  if (window.hubAPI?.saveHtml) {
    await window.hubAPI.saveHtml(html, 'intake-form.html');
    toast(t('cl.intake_saved'), 'success');
  }
}

function openClientHistory(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  const displayName = localName(c);
  const orders = printLog.filter(o => o.clientId === clientId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const { revenue: totalRev, count: completedCount } = getClientStats(clientId);
  const totalOrders = orders.length;
  const avgOrder = completedCount > 0 ? totalRev / completedCount : 0;

  const statusCls = { pending:'pending', printing:'printing', post:'post', completed:'completed' };

  const rowsHtml = orders.length === 0
    ? `<p style="color:var(--text-muted); font-size:13px; margin:12px 0 0;">${escapeHtml(t('cl.history_empty'))}</p>`
    : `<div class="table-wrap" style="margin-top:14px;">
        <table>
          <thead><tr>
            <th data-i18n="common.date">${escapeHtml(t('common.date'))}</th>
            <th>${escapeHtml(t('log.client'))}</th>
            <th>${escapeHtml(t('common.status'))}</th>
            <th>${escapeHtml(t('log.price'))}</th>
            <th>${escapeHtml(t('log.pay_status'))}</th>
          </tr></thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td style="font-size:12px; color:var(--text-dim); white-space:nowrap;">${escapeHtml(o.date)}</td>
                <td><strong>${escapeHtml(o.project || o.id)}</strong><div style="font-size:11px; color:var(--text-muted);">${escapeHtml(o.id)}</div></td>
                <td><span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span></td>
                <td style="font-weight:600; color:var(--success); font-variant-numeric:tabular-nums; white-space:nowrap;">${fmtPrice(o.price)}</td>
                <td>${paymentBadge(o)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

  openFormModal({
    title:     `${displayName} — ${t('cl.history')}`,
    saveLabel: t('cl.quote'),
    sizeLg:    true,
    bodyHtml:  `
      <div class="cl-hist-stats">
        <div class="cl-hist-stat">
          <div class="v">${totalOrders}</div>
          <div class="l">${escapeHtml(t('cl.hist_orders'))}</div>
        </div>
        <div class="cl-hist-stat">
          <div class="v">${fmtMoney(totalRev)}</div>
          <div class="l">${escapeHtml(t('cl.hist_revenue'))} ${escapeHtml(currencySymbol())}</div>
        </div>
        <div class="cl-hist-stat">
          <div class="v">${isFinite(avgOrder) && avgOrder > 0 ? fmtMoney(avgOrder) : '—'}</div>
          <div class="l">${escapeHtml(t('cl.hist_avg'))} ${escapeHtml(currencySymbol())}</div>
        </div>
      </div>
      ${rowsHtml}
      <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border-soft); display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn small primary" id="btnPrintStatement">${escapeHtml(t('cl.print_statement'))}</button>
        <button class="btn small ghost" id="btnExportClientInvoices">${escapeHtml(t('cl.export_all_invoices'))}</button>
      </div>`,
    onMount(modal) {
      modal.querySelector('#btnPrintStatement')?.addEventListener('click', () => {
        generateClientStatement(clientId);
      });
      modal.querySelector('#btnExportClientInvoices')?.addEventListener('click', () => {
        exportClientInvoices(clientId);
      });
    },
    onSave() { quoteForClient(clientId); return true; }
  });
}

function generateClientStatement(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  const displayName = localName(c);
  const orders = printLog.filter(o => o.clientId === clientId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const bizPrimary = i18n.current === 'ar'
    ? (settings.bizAr || settings.bizEn || 'Khayt')
    : (settings.bizEn || settings.bizAr || 'Khayt');

  const totalCharges = orders.reduce((s, o) => s + (+o.price || 0), 0);
  const totalPaid    = orders.reduce((s, o) => s + (+o.paidAmount || (payStatus(o) === 'paid' ? +o.price : 0)), 0);
  const outstanding  = Math.max(0, totalCharges - totalPaid);

  const rowsHtml = orders.map(o => {
    const paid  = +o.paidAmount || (payStatus(o) === 'paid' ? +o.price : 0);
    const bal   = Math.max(0, (+o.price || 0) - paid);
    return `<tr style="border-bottom:1px solid #eee;">
      <td style="padding:6px 8px; font-size:12px; white-space:nowrap;">${escapeHtml(o.date || '')}</td>
      <td style="padding:6px 8px; font-size:12px;">${escapeHtml(o.id)}</td>
      <td style="padding:6px 8px; font-size:12px;">${escapeHtml(o.project || '')}</td>
      <td style="padding:6px 8px; font-size:12px; text-align:right;">${fmtPrice(o.price)}</td>
      <td style="padding:6px 8px; font-size:12px; text-align:right; color:#2a9d8f;">${fmtPrice(paid)}</td>
      <td style="padding:6px 8px; font-size:12px; text-align:right; color:${bal > 0 ? '#e63946' : '#2a9d8f'};">${fmtPrice(bal)}</td>
    </tr>`;
  }).join('');

  const area = $('#invoice-print-area');
  area.innerHTML = `
    <div class="inv-wrap">
    <div class="inv-top-bar" style="background:var(--primary);"></div>
    <div class="inv" style="--brand:#1a1a2e; --accent:#4a90e2; --highlight:#eef3fc;">
      <div class="inv-header">
        <div class="biz">
          <div class="mark">${settings.bizLogo ? `<img src="${settings.bizLogo}" style="max-height:60px; max-width:120px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name"><h1>${escapeHtml(bizPrimary)}</h1></div>
        </div>
        <div class="doc">
          <div class="title">${escapeHtml(t('cl.statement_title'))}</div>
          <div class="meta">
            <div class="meta-row"><span class="k">${escapeHtml(t('common.date'))}</span><span class="v">${escapeHtml(new Date().toISOString().split('T')[0])}</span></div>
          </div>
        </div>
      </div>
      <div class="bill-to">
        <div class="label"><span>${escapeHtml(t('inv.billed_to'))}</span></div>
        <div>
          <div class="name">${escapeHtml(displayName)}</div>
          ${c.phone ? `<div class="name-sub">${escapeHtml(c.phone)}</div>` : ''}
          ${c.email ? `<div class="name-sub">${escapeHtml(c.email)}</div>` : ''}
        </div>
      </div>
      <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:13px;">
        <thead>
          <tr style="border-bottom:2px solid #333; text-align:left;">
            <th style="padding:6px 8px;">${escapeHtml(t('common.date'))}</th>
            <th style="padding:6px 8px;">${escapeHtml(t('log.id') || 'Order ID')}</th>
            <th style="padding:6px 8px;">${escapeHtml(t('oe.project') || 'Description')}</th>
            <th style="padding:6px 8px; text-align:right;">${escapeHtml(t('log.price'))}</th>
            <th style="padding:6px 8px; text-align:right;">${escapeHtml(t('cl.stmt_paid'))}</th>
            <th style="padding:6px 8px; text-align:right;">${escapeHtml(t('cl.stmt_outstanding'))}</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="border-top:2px solid #333; font-weight:700;">
            <td colspan="3" style="padding:8px 8px;">${escapeHtml(t('common.total'))}</td>
            <td style="padding:8px 8px; text-align:right;">${fmtPrice(totalCharges)}</td>
            <td style="padding:8px 8px; text-align:right; color:#2a9d8f;">${fmtPrice(totalPaid)}</td>
            <td style="padding:8px 8px; text-align:right; color:${outstanding > 0 ? '#e63946' : '#2a9d8f'};">${fmtPrice(outstanding)}</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:20px; display:flex; gap:24px; flex-wrap:wrap;">
        <div style="background:#f8f9fa; padding:12px 16px; border-radius:6px; min-width:150px;">
          <div style="font-size:11px; color:#666;">${escapeHtml(t('cl.stmt_charges'))}</div>
          <div style="font-size:18px; font-weight:700;">${fmtPrice(totalCharges)}</div>
        </div>
        <div style="background:#f0fdf4; padding:12px 16px; border-radius:6px; min-width:150px;">
          <div style="font-size:11px; color:#666;">${escapeHtml(t('cl.stmt_paid'))}</div>
          <div style="font-size:18px; font-weight:700; color:#2a9d8f;">${fmtPrice(totalPaid)}</div>
        </div>
        <div style="background:${outstanding > 0 ? '#fff5f5' : '#f0fdf4'}; padding:12px 16px; border-radius:6px; min-width:150px;">
          <div style="font-size:11px; color:#666;">${escapeHtml(t('cl.stmt_outstanding'))}</div>
          <div style="font-size:18px; font-weight:700; color:${outstanding > 0 ? '#e63946' : '#2a9d8f'};">${fmtPrice(outstanding)}</div>
        </div>
      </div>
      <div class="footer" style="margin-top:24px;">
        <div class="legal">${escapeHtml(t('legal') || 'Generated by Khayt')}</div>
      </div>
    </div>
    </div>`;
  setTimeout(() => window.print(), 80);
}

/* ============================================================
   Export all invoices for a client — renders each sequentially
   into the print area then triggers the system print dialog once,
   which the user can save as a single multi-page PDF.
   ============================================================ */
async function exportClientInvoices(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  const orders = printLog
    .filter(o => o.clientId === clientId && o.status === 'completed')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (orders.length === 0) {
    toast(t('cl.no_invoices'), 'info');
    return;
  }
  toast(t('cl.exporting_invoices', { n: orders.length }), 'info', 2000);

  // If hubAPI.exportPDF exists, export each invoice as a separate file
  if (window.hubAPI?.exportPDF) {
    for (let i = 0; i < orders.length; i++) {
      await renderInvoiceForOrder(orders[i]);
      await new Promise(r => setTimeout(r, 60));
      try {
        await window.hubAPI.exportPDF({ filename: `${orders[i].id}.pdf`, askWhere: i === 0, openAfter: false });
      } catch (_) {}
    }
    toast(t('cl.invoices_exported', { n: orders.length }), 'success', 4000);
    return;
  }

  // Fallback: render all invoices concatenated into print area, print once
  const area = $('#invoice-print-area');
  area.innerHTML = '';
  for (const order of orders) {
    await renderInvoiceForOrder(order);
    const snap = area.innerHTML;
    area.innerHTML += snap + '<div style="page-break-after:always;"></div>';
  }
  setTimeout(() => window.print(), 100);
}

async function deleteClient(clientId) {
  const ok = await confirmModal(t('ce.delete_q'), { danger: true });
  if (!ok) return;
  clients = clients.filter(c => c.id !== clientId);
  saveAll();
  renderClients();
  toast(t('ce.deleted'), 'success');
}

function openClientEditor(clientId = null) {
  const existing = clientId ? clients.find(c => c.id === clientId) : null;
  const draft = existing
    ? { ...existing }
    : { id: uid('CLI'), nameEn: '', nameAr: '', phone: '', email: '', cr: '', vat: '', notes: '', defaultDiscount: 0, createdAt: new Date().toISOString().split('T')[0] };
  if (!draft.priceList) draft.priceList = [];
  const rec = draft.recurring || { enabled: false, interval: 'monthly', nextDue: '' };

  const intervalOptions = ['weekly','biweekly','monthly','quarterly']
    .map(v => `<option value="${v}" ${rec.interval === v ? 'selected' : ''}>${escapeHtml(t('rec.interval.' + v))}</option>`)
    .join('');

  const bodyHtml = `
    <div class="inline-pair">
      <div>
        <label>${escapeHtml(t('ce.name_en'))}</label>
        <input type="text" data-f="nameEn" placeholder="${escapeHtml(t('ce.name_en_ph'))}" value="${escapeHtml(draft.nameEn || '')}">
      </div>
      <div>
        <label>${escapeHtml(t('ce.name_ar'))}</label>
        <input type="text" data-f="nameAr" dir="rtl" placeholder="${escapeHtml(t('ce.name_ar_ph'))}" value="${escapeHtml(draft.nameAr || '')}">
      </div>
    </div>
    <div class="inline-pair">
      <div>
        <label>${escapeHtml(t('ce.phone'))}</label>
        <input type="tel" data-f="phone" placeholder="+966 5x xxx xxxx" value="${escapeHtml(draft.phone || '')}">
      </div>
      <div>
        <label>${escapeHtml(t('ce.email'))}</label>
        <input type="email" data-f="email" value="${escapeHtml(draft.email || '')}">
      </div>
    </div>
    <div class="inline-pair">
      <div>
        <label>${escapeHtml(t('ce.cr'))}</label>
        <input type="text" data-f="cr" value="${escapeHtml(draft.cr || '')}">
      </div>
      <div>
        <label>${escapeHtml(t('ce.vat'))}</label>
        <input type="text" data-f="vat" maxlength="15" value="${escapeHtml(draft.vat || '')}">
      </div>
    </div>
    <label>${escapeHtml(t('ce.notes'))}</label>
    <input type="text" data-f="notes" placeholder="${escapeHtml(t('ce.notes_ph'))}" value="${escapeHtml(draft.notes || '')}">

    <div style="margin-top:14px; display:flex; align-items:center; gap:12px;">
      <div style="flex:1;">
        <label style="margin-top:0;">${escapeHtml(t('ce.default_discount'))} (%)</label>
        <input type="number" data-f="defaultDiscount" min="0" max="100" step="1" value="${draft.defaultDiscount || 0}" placeholder="0">
      </div>
      <div style="flex:2; padding-top:20px; font-size:12px; color:var(--text-muted);">${escapeHtml(t('ce.default_discount_hint'))}</div>
    </div>

    <div style="margin-top:14px;">
      <label style="margin-top:0;">${escapeHtml(t('ce.currency'))}</label>
      <select id="ceCurrency">
        <option value="">${escapeHtml(t('common.default') !== 'common.default' ? t('common.default') : 'Default')} (${escapeHtml(settings.currency || 'SAR')})</option>
        ${Object.entries(CURRENCIES).map(([code, c]) => `<option value="${code}"${draft.currency === code ? ' selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
      </select>
      <p style="font-size:11.5px;color:var(--text-muted);margin:3px 0 0;">${escapeHtml(t('ce.currency_hint'))}</p>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="margin:0; flex:1; font-size:12.5px; font-weight:600;">${escapeHtml(t('ce.price_list'))}</label>
        <button class="btn ghost small" id="cePlAdd" type="button">${escapeHtml(t('ce.pl_add'))}</button>
      </div>
      <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 8px;">${escapeHtml(t('ce.price_list_hint'))}</p>
      <div id="cePriceListWrap"></div>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:0;">
        <input type="checkbox" id="recEnabled" style="width:auto;margin:0;" ${rec.enabled ? 'checked' : ''}>
        <span>${escapeHtml(t('rec.enable'))}</span>
      </label>
      <div id="recFields" style="${rec.enabled ? '' : 'display:none;'} margin-top:10px;">
        <div class="inline-pair">
          <div>
            <label>${escapeHtml(t('rec.interval'))}</label>
            <select id="recInterval">${intervalOptions}</select>
          </div>
          <div>
            <label>${escapeHtml(t('rec.next_due'))}</label>
            <input type="date" id="recNextDue" value="${escapeHtml(rec.nextDue || '')}">
          </div>
        </div>
        <p style="font-size:11.5px;color:var(--text-muted);margin:4px 0 0;">${escapeHtml(t('rec.hint'))}</p>
      </div>
    </div>

    <div id="clientHistorySection" style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border-soft);">
    </div>
  `;

  openFormModal({
    title: existing ? t('ce.edit_title') : t('ce.new_title'),
    saveLabel: t('ce.save'),
    sizeLg: false,
    bodyHtml,
    onMount(modal) {
      modal.querySelectorAll('[data-f]').forEach(input => {
        input.addEventListener('input', () => { draft[input.dataset.f] = input.value; });
      });
      const recCb  = modal.querySelector('#recEnabled');
      const recDiv = modal.querySelector('#recFields');
      recCb.addEventListener('change', () => { recDiv.style.display = recCb.checked ? '' : 'none'; });
      modal.querySelector('#recInterval').addEventListener('change', e => { rec.interval = e.target.value; });
      modal.querySelector('#recNextDue').addEventListener('change', e => { rec.nextDue = e.target.value; });
      // Currency (Feature 1)
      const ceCurrEl = modal.querySelector('#ceCurrency');
      if (ceCurrEl) ceCurrEl.addEventListener('change', e => { draft.currency = e.target.value || null; });

      // Price list (Feature 4)
      const plWrap = modal.querySelector('#cePriceListWrap');
      function renderPriceList() {
        if (!plWrap) return;
        if (!draft.priceList || draft.priceList.length === 0) {
          plWrap.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;padding:4px 0;">${escapeHtml(t('ce.price_list_empty'))}</div>`;
          return;
        }
        plWrap.innerHTML = `<table class="price-list-table">
          <thead><tr>
            <th>${escapeHtml(t('ce.pl_product'))}</th>
            <th>${escapeHtml(t('ce.pl_price'))}</th>
            <th>${escapeHtml(t('ce.pl_note'))}</th>
            <th></th>
          </tr></thead>
          <tbody>
          ${draft.priceList.map((pl, i) => `<tr>
            <td><input type="text" class="pl-prod" data-pli="${i}" value="${escapeHtml(pl.product || '')}" placeholder="${escapeHtml(t('ce.pl_product'))}" style="width:100%;font-size:12px;"></td>
            <td><input type="number" class="pl-price" data-pli="${i}" value="${pl.price || ''}" min="0" step="0.01" style="width:90px;font-size:12px;"></td>
            <td><input type="text" class="pl-note" data-pli="${i}" value="${escapeHtml(pl.note || '')}" placeholder="${escapeHtml(t('ce.pl_note'))}" style="width:100%;font-size:12px;"></td>
            <td><button class="btn danger small pl-rm" data-pli="${i}">×</button></td>
          </tr>`).join('')}
          </tbody></table>`;
        plWrap.querySelectorAll('.pl-prod').forEach(inp => { inp.addEventListener('input', () => { draft.priceList[+inp.dataset.pli].product = inp.value; }); });
        plWrap.querySelectorAll('.pl-price').forEach(inp => { inp.addEventListener('input', () => { draft.priceList[+inp.dataset.pli].price = Math.max(0, +inp.value || 0); }); });
        plWrap.querySelectorAll('.pl-note').forEach(inp => { inp.addEventListener('input', () => { draft.priceList[+inp.dataset.pli].note = inp.value; }); });
        plWrap.querySelectorAll('.pl-rm').forEach(btn => { btn.addEventListener('click', () => { draft.priceList.splice(+btn.dataset.pli, 1); renderPriceList(); }); });
      }
      renderPriceList();
      const cePlBtn = modal.querySelector('#cePlAdd');
      if (cePlBtn) cePlBtn.addEventListener('click', () => { draft.priceList.push({ product: '', price: 0, note: '' }); renderPriceList(); });

      // Order history
      const histEl = modal.querySelector('#clientHistorySection');
      if (clientId && histEl) {
        const clientOrders = printLog
          .filter(o => o.clientId === clientId)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (clientOrders.length === 0) {
          histEl.innerHTML = `<p style="font-size:12.5px; color:var(--text-muted);">${escapeHtml(t('ce.no_history'))}</p>`;
        } else {
          histEl.innerHTML = `
            <h4 style="font-size:11.5px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.07em; margin:0 0 10px;">${escapeHtml(t('ce.history_title'))} (${clientOrders.length})</h4>
            <div class="client-history">
              ${clientOrders.slice(0, 15).map(o => `
                <div class="ch-row">
                  <span class="ch-date">${escapeHtml(o.date)}</span>
                  <span class="ch-name">${escapeHtml(o.project)}</span>
                  <span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span>
                  <span class="ch-price">${fmtPrice(o.price)}</span>
                </div>`).join('')}
            </div>`;
        }
      }
    },
    async onSave(modal) {
      if (!draft.nameEn.trim() && !draft.nameAr.trim()) {
        toast(t('ce.need_name'), 'error');
        return false;
      }
      draft.defaultDiscount = Math.min(100, Math.max(0, num(draft.defaultDiscount, 0)));
      draft.recurring = {
        enabled:  modal.querySelector('#recEnabled').checked,
        interval: modal.querySelector('#recInterval').value,
        nextDue:  modal.querySelector('#recNextDue').value || null,
      };
      draft.currency = modal.querySelector('#ceCurrency')?.value || null;
      draft.priceList = (draft.priceList || []).filter(pl => pl.product.trim() || pl.price > 0);
      const idx = clients.findIndex(c => c.id === draft.id);
      if (idx >= 0) clients[idx] = draft;
      else clients.push(draft);
      saveAll();
      renderClients();
      toast(t('ce.saved'), 'success');
      return true;
    }
  });
}

/* ============================================================
   Recurring orders — auto-create on boot when overdue
   ============================================================ */
function checkRecurringOrders() {
  const today = new Date().toISOString().split('T')[0];
  const INTERVAL_DAYS = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 };
  let created = 0;

  clients.forEach(client => {
    const rec = client.recurring;
    if (!rec?.enabled || !rec.nextDue || rec.nextDue > today) return;

    // Use most recent completed order for this client as a template
    const template = printLog.find(o => o.clientId === client.id && o.status === 'completed');
    if (!template) return;

    const now = new Date();
    const seq = nextInvoiceSeq();
    const id = `${settings.invPrefix || 'INV'}-${now.getFullYear()}-${seq}`;
    printLog.unshift({
      ...template,
      parts: template.parts ? template.parts.map(p => ({ ...p })) : [],
      id,
      date: today,
      timestamp: now.toISOString(),
      status: 'pending',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      paymentMethod: null,
      paidAt: null,
      printPhotos: [],
      notes: '',
      dueDate: null,
      priority: false,
      materialDeducted: false,
      actualPrintTime: null,
      actualWeight: null,
      quoteSentAt: null,
      quoteExpiresAt: null,
      quoteAcceptedAt: null,
      deliveredAt: null,
      attachedFiles: [],
    });
    created++;

    const days = INTERVAL_DAYS[rec.interval] || 30;
    const next = new Date(rec.nextDue + 'T00:00:00');
    next.setDate(next.getDate() + days);
    rec.nextDue = next.toISOString().split('T')[0];
  });

  if (created > 0) {
    saveAll();
    renderKanban(); renderLogs(); renderDashboard();
    toast(t('rec.created', { n: created }), 'success', 4500);
  }
}

/* ----- Client autocomplete on the calculator ----- */
function renderClientSuggestions() {
  const input = $('#clientInput');
  const list  = $('#clientSuggestions');
  const term  = input.value.toLowerCase().trim();
  let matches = clients;
  if (term) {
    matches = clients.filter(c =>
      (c.nameEn || '').toLowerCase().includes(term) ||
      (c.nameAr || '').toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term)
    );
  }
  matches = matches.slice(0, 6);

  const items = matches.map(c => {
    const dn = localName(c);
    const stats = getClientStats(c.id);
    return `<div class="suggest-item" data-cid="${c.id}">
      <span class="avatar">${escapeHtml(initials(dn))}</span>
      <span>${escapeHtml(dn)}</span>
      ${stats.count > 0 ? `<span class="meta">${stats.count} · ${fmtPrice(stats.revenue)}</span>` : ''}
    </div>`;
  }).join('');

  const newRow = (term && !clients.some(c => (c.nameEn || c.nameAr || '').toLowerCase() === term))
    ? `<div class="suggest-item new" data-act="cl-new" data-name="${escapeHtml(input.value)}">+ ${escapeHtml(t('calc.quote.client_save_new'))}: “${escapeHtml(input.value)}”</div>`
    : '';

  if (!items && !newRow) { list.style.display = 'none'; return; }
  list.innerHTML = items + newRow;
  list.style.display = 'block';
}

function hideClientSuggestions() {
  setTimeout(() => { $('#clientSuggestions').style.display = 'none'; }, 150);
}

/* ============================================================
   Orders, Kanban, Logs, Analytics
   ============================================================ */
function logPrint(asQuote = false) {
  if (currentBuild.length === 0) {
    const before = currentBuild.length;
    addPart();
    if (currentBuild.length === before) return;
  }

  const totalBaseCost  = currentBuild.reduce((s, p) => s + p.baseCost, 0);
  const totalPrintTime = currentBuild.reduce((s, p) => s + p.printTime, 0);
  const margin = clampPositive($('#margin').value);
  const discountPct = Math.min(100, Math.max(0, num($('#discountPct').value, 0)));
  const shippingCost = Math.max(0, num($('#shippingCost')?.value, 0));
  const extraLinesTotal = currentExtraLines.reduce((s, l) => s + Math.max(0, +l.amount || 0), 0);
  const priceBeforeDiscount = totalBaseCost * (1 + margin / 100);
  const finalPrice = priceBeforeDiscount * (1 - discountPct / 100) + shippingCost + extraLinesTotal;

  const clientInputVal = $('#clientInput').value.trim();
  const project = clientInputVal;
  const now = new Date();
  const materials = [...new Set(currentBuild.map(p => p.material))].join(', ');

  const seq = nextInvoiceSeq();
  const prefix = asQuote ? (settings.quotePrefix || 'QUO') : (settings.invPrefix || 'INV');
  const id = `${prefix}-${now.getFullYear()}-${seq}`;

  printLog.unshift({
    id,
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),
    project,
    clientId: currentClientId || null,
    productId: currentBuildFromProductId || null,
    material: materials,
    printTime: +totalPrintTime.toFixed(1),
    price: +finalPrice.toFixed(2),
    discountPct: discountPct || 0,
    priceBeforeDiscount: discountPct > 0 ? +priceBeforeDiscount.toFixed(2) : null,
    shippingCost: shippingCost > 0 ? +shippingCost.toFixed(2) : 0,
    deliveredAt: null,
    attachedFiles: [],
    extraLines: currentExtraLines.length > 0 ? currentExtraLines.map(l => ({ ...l })) : undefined,
    status: asQuote ? 'quote' : 'pending',
    statusHistory: [{ status: asQuote ? 'quote' : 'pending', at: now.toISOString() }],
    queuePos: printLog.filter(o => o.status === 'pending').length + 1,
    machineId: $('#machineAssign')?.value || null,
    materialDeducted: false,
    depositAmount: Math.max(0, num($('#depositAmount')?.value, 0)),
    paymentStatus: (() => {
      const dep = Math.max(0, num($('#depositAmount')?.value, 0));
      if (dep <= 0) return 'unpaid';
      return dep >= finalPrice ? 'paid' : 'partial';
    })(),
    paidAmount: Math.max(0, num($('#depositAmount')?.value, 0)),
    paymentMethod: null,
    paidAt: null,
    notes: '',
    invoiceNotes: '',
    tags: [],
    dueDate: null,
    priority: false,
    printPhotos: [],
    parts: currentBuild.map(p => ({ ...p, partStatus: p.partStatus || 'pending' })),
    // Actuals — filled in when order is marked completed
    actualPrintTime: null,
    actualWeight:    null,
    // Quote lifecycle
    quoteSentAt:     asQuote ? now.toISOString().split('T')[0] : null,
    quoteExpiresAt:  asQuote ? new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0] : null,
    quoteAcceptedAt: null,
  });

  saveAll();

  currentBuild = [];
  currentBuildFromProductId = null;
  currentClientId = null;
  currentExtraLines = [];
  localStorage.removeItem(K.CURRENT_BUILD);
  renderBuild();
  renderExtraLines();
  $('#clientInput').value = '';
  $('#discountPct').value = '0';
  if ($('#shippingCost')) $('#shippingCost').value = '0';
  if ($('#depositAmount')) $('#depositAmount').value = '0';
  const tierStrip = $('#priceTiersStrip');
  if (tierStrip) tierStrip.style.display = 'none';

  toast(asQuote ? t('quote.saved') : t('calc.quote.saved'), 'success');
  renderLogs();
  renderKanban();
  renderAnalytics();
  renderDashboard();
}

/* ============================================================
   Quote workflow — approve, reject, share
   ============================================================ */
function approveQuote(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  order.status = 'pending';
  order.quoteAcceptedAt = new Date().toISOString().split('T')[0];
  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({ status: 'pending', at: new Date().toISOString() });
  saveAll();
  renderKanban(); renderLogs(); renderDashboard();
  toast(t('quote.approved'), 'success');
}

async function rejectQuote(orderId) {
  const ok = await confirmModal(t('quote.reject_q'), { danger: true });
  if (!ok) return;
  const idx = printLog.findIndex(o => o.id === orderId);
  if (idx < 0) return;
  const removed = printLog[idx];
  printLog.splice(idx, 1);
  saveAll();
  renderKanban(); renderLogs();
  toast(t('quote.rejected'), 'success', 5000, {
    undo: () => { printLog.splice(idx, 0, removed); saveAll(); renderKanban(); renderLogs(); }
  });
}

/* ============================================================
   Actual-vs-estimated — prompt on job completion
   ============================================================ */
function promptActuals(order, onConfirm) {
  const estWeight = order.parts
    ? order.parts.reduce((s, p) => s + (+p.printWeight || 0) * (p.qty || 1), 0)
    : 0;
  const initTime   = order.actualPrintTime ?? order.printTime;
  const initWeight = order.actualWeight    ?? Math.round(estWeight);

  openFormModal({
    title:     t('act.title'),
    saveLabel: t('act.confirm'),
    sizeLg:    false,
    bodyHtml: `
      <p style="font-size:13px;color:var(--text-dim);margin-bottom:14px;">${escapeHtml(t('act.hint'))}</p>
      <div class="inline-pair">
        <div>
          <label>${escapeHtml(t('act.print_time'))} (${escapeHtml(t('common.hours'))})</label>
          <input type="number" id="actTime" value="${initTime}" min="0" step="0.1">
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escapeHtml(t('act.est'))}: ${order.printTime} ${escapeHtml(t('common.hours'))}</div>
        </div>
        <div>
          <label>${escapeHtml(t('act.weight'))} (${escapeHtml(t('common.grams'))})</label>
          <input type="number" id="actWeight" value="${initWeight}" min="0" step="1">
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escapeHtml(t('act.est'))}: ${estWeight.toFixed(0)} ${escapeHtml(t('common.grams'))}</div>
        </div>
      </div>`,
    onSave(modal) {
      const tv = num(modal.querySelector('#actTime').value,   order.printTime);
      const wv = num(modal.querySelector('#actWeight').value, 0);
      order.actualPrintTime = +tv.toFixed(2);
      order.actualWeight    = +wv.toFixed(1);
      onConfirm();
      return true;
    }
  });
}

function updateStatus(id, newStatus) {
  const order = printLog.find(o => o.id === id);
  if (!order) return;
  if (newStatus === 'completed') {
    promptActuals(order, () => {
      order.status = 'completed';
      if (!order.completedAt) order.completedAt = new Date().toISOString();
      deductFilamentForOrder(order);
      saveAll();
      renderKanban(); renderLogs(); renderAnalytics(); renderDashboard();
      toast(t('toast.status_updated'), 'success');
    });
    return;
  }
  order.status = newStatus;
  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({ status: newStatus, at: new Date().toISOString() });
  // Live timer: record when printing starts, clear when it ends
  if (newStatus === 'printing') {
    order.timerStart = new Date().toISOString();
    if (!order.printingStartedAt) order.printingStartedAt = new Date().toISOString();
  } else if (order.timerStart) {
    delete order.timerStart;
  }
  // Clear hold reason when resuming from on_hold
  if (newStatus === 'pending' && order.holdReason !== undefined) {
    delete order.holdReason;
    delete order.heldAt;
  }
  saveAll();
  renderKanban(); renderLogs(); renderAnalytics();
  toast(t('toast.status_updated'), 'success');
}

function holdOrder(id) {
  const order = printLog.find(o => o.id === id);
  if (!order) return;
  openFormModal({
    title: t('ord.hold_btn'),
    sizeLg: false,
    saveLabel: t('ord.hold_btn'),
    bodyHtml: `
      <label>${escapeHtml(t('ord.hold_reason'))}</label>
      <input type="text" id="holdReasonInput" placeholder="${escapeHtml(t('ord.hold_reason'))}" style="width:100%;">
    `,
    onMount(modal) { setTimeout(() => modal.querySelector('#holdReasonInput')?.focus(), 40); },
    onSave(modal) {
      const reason = modal.querySelector('#holdReasonInput').value.trim();
      order.status = 'on_hold';
      order.holdReason = reason || null;
      order.heldAt = new Date().toISOString();
      if (!order.statusHistory) order.statusHistory = [];
      order.statusHistory.push({ status: 'on_hold', at: new Date().toISOString() });
      saveAll();
      renderKanban(); renderLogs();
      toast(t('ord.on_hold'), 'info');
      return true;
    }
  });
}

async function deleteLog(id) {
  const ok = await confirmModal(`${id} — ${t('common.delete')}?`, { danger: true });
  if (!ok) return;
  const idx = printLog.findIndex(o => o.id === id);
  if (idx < 0) return;
  const removed = printLog[idx];
  printLog.splice(idx, 1);
  saveAll();
  renderKanban(); renderLogs(); renderAnalytics(); renderPortfolio();
  // Toast with Undo — restores at the same position
  toast(t('oe.deleted'), 'success', 5000, {
    undo: () => {
      printLog.splice(idx, 0, removed);
      saveAll();
      renderKanban(); renderLogs(); renderAnalytics(); renderPortfolio();
    }
  });
}

function markDelivered(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order || order.status !== 'completed') return;
  order.deliveredAt = new Date().toISOString().split('T')[0];
  saveAll();
  renderKanban(); renderLogs(); renderDashboard();
  toast(t('queue.delivered_toast', { id: order.id }), 'success');
}

/* ============================================================
   Payment tracking
   ============================================================ */
function paymentBadge(o) {
  const s = payStatus(o);
  return `<span class="badge pay-${s}">${escapeHtml(t('pay.' + s))}</span>`;
}

function openPaymentModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const fullAmount = +order.price || 0;
  const draft = {
    paymentStatus: order.paymentStatus || 'paid',
    paidAmount:    order.paidAmount || fullAmount,
    paymentMethod: order.paymentMethod || 'cash',
    paidAt:        order.paidAt || new Date().toISOString().split('T')[0]
  };

  const methodOptions = ['cash','mada','transfer','stcpay','applepay','visa','other']
    .map(m => `<option value="${m}" ${draft.paymentMethod === m ? 'selected' : ''}>${escapeHtml(t('pay.method.' + m))}</option>`)
    .join('');

  const depositNote = (order.depositAmount || 0) > 0
    ? `<p style="font-size:12px; color:var(--primary); margin:6px 0 0;">💰 ${escapeHtml(t('pay.deposit_on_file', { amt: fmtPrice(order.depositAmount) }))}</p>`
    : '';

  const bodyHtml = `
    <div class="inline-pair">
      <div>
        <label>${escapeHtml(t('pay.amount_paid'))} (${escapeHtml(currencySymbol())})</label>
        <input type="number" data-f="paidAmount" min="0" step="0.01" value="${draft.paidAmount}">
      </div>
      <div>
        <label>${escapeHtml(t('pay.payment_method'))}</label>
        <select data-f="paymentMethod">${methodOptions}</select>
      </div>
    </div>
    <label>${escapeHtml(t('pay.paid_on'))}</label>
    <input type="date" data-f="paidAt" value="${draft.paidAt}">
    <p style="font-size:11.5px; color:var(--text-muted); margin:10px 0 0;">
      ${order.id} · ${escapeHtml(order.project)} · ${fmtPrice(fullAmount)}
    </p>
    ${depositNote}
  `;

  openFormModal({
    title: t('pay.modal_title'),
    saveLabel: t('pay.mark_paid'),
    sizeLg: false,
    bodyHtml,
    onMount(modal) {
      modal.querySelectorAll('[data-f]').forEach(input => {
        input.addEventListener('input', () => {
          draft[input.dataset.f] = input.type === 'number' ? num(input.value, 0) : input.value;
        });
      });
    },
    async onSave() {
      order.paidAmount    = draft.paidAmount;
      order.paymentMethod = draft.paymentMethod;
      order.paidAt        = draft.paidAt;
      order.paymentStatus = (draft.paidAmount >= fullAmount) ? 'paid'
                          : (draft.paidAmount > 0 ? 'partial' : 'unpaid');
      saveAll();
      renderLogs(); renderKanban(); renderAnalytics();
      toast(t('pay.saved'), 'success');
      return true;
    }
  });
}

function clearPayment(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  order.paymentStatus = 'unpaid';
  order.paidAmount = 0;
  order.paymentMethod = null;
  order.paidAt = null;
  saveAll();
  renderLogs(); renderKanban(); renderAnalytics();
  toast(t('pay.cleared'), 'success');
}

/* Builds the extra-lines rows HTML for the order-editor modal */
function renderOeExtraLinesHtml(lines) {
  if (!lines || lines.length === 0) return '';
  return lines.map((line, i) => `
    <div class="extra-line-row" data-oeli="${i}">
      <input type="text" class="oe-el-label" value="${escapeHtml(line.label)}" placeholder="${escapeHtml(t('calc.extra_label_ph'))}" style="flex:1; min-width:0;">
      <input type="number" class="oe-el-amount" value="${line.amount || ''}" min="0" step="0.01" placeholder="0.00" style="width:90px;">
      <button class="btn danger small oe-el-rm" data-oeli="${i}" aria-label="Remove">×</button>
    </div>`).join('');
}

/* ============================================================
   Order editor — notes + print photos
   ============================================================ */
function openOrderEditor(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const draft = {
    notes: order.notes || '',
    invoiceNotes: order.invoiceNotes || '',
    tags: (order.tags || []).slice(),
    dueDate: order.dueDate || '',
    priority: !!order.priority,
    discountPct: order.discountPct || 0,
    shippingCost: order.shippingCost || 0,
    extraLines: (order.extraLines || []).map(l => ({ ...l })),
    printPhotos: (order.printPhotos || []).map(p => ({ ...p })),
    attachedFiles: (order.attachedFiles || []).map(f => ({ ...f })),
    courierName: order.courierName || '',
    trackingNumber: order.trackingNumber || '',
    deliveryAddress: order.deliveryAddress || '',
    instalments: (order.instalments || []).map(ins => ({ ...ins })),
  };
  const pendingFileDeletes = [];
  // newly-uploaded photos to flush to disk on save (full data URLs)
  const pendingFulls = []; // [{ idx, dataUrl }]
  const pendingDeletes = []; // filenames to delete from disk on save

  const photosHtml = () => {
    const cells = draft.printPhotos.map((ph, i) => `
      <div class="order-photo-cell" data-pi="${i}">
        <img src="${ph.thumb}" alt="">
        <button class="rm" data-act="rm-photo" data-pi="${i}" aria-label="Remove">×</button>
      </div>`).join('');
    const adder = `<div class="order-photo-cell add" data-act="add-photo">${escapeHtml(t('oe.add_photo'))}</div>`;
    return cells + adder;
  };

  const bodyHtml = `
    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:0;">
      <input type="checkbox" data-f="priority" style="width:auto; margin:0;"${draft.priority ? ' checked' : ''}>
      <span>${escapeHtml(t('oe.priority'))}</span>
    </label>
    <label style="margin-top:14px;">${escapeHtml(t('oe.due_date'))}</label>
    <input type="date" data-f="dueDate" value="${escapeHtml(draft.dueDate)}" style="max-width:180px;">

    <div class="inline-pair" style="margin-top:14px;">
      <div>
        <label>${escapeHtml(t('oe.courier'))}</label>
        <input type="text" data-f="courierName" value="${escapeHtml(draft.courierName)}" placeholder="e.g. Aramex, DHL">
      </div>
      <div>
        <label>${escapeHtml(t('oe.tracking_number'))}</label>
        <input type="text" data-f="trackingNumber" value="${escapeHtml(draft.trackingNumber)}" placeholder="…">
      </div>
    </div>
    <label style="margin-top:10px;">${escapeHtml(t('oe.delivery_address'))}</label>
    <input type="text" data-f="deliveryAddress" value="${escapeHtml(draft.deliveryAddress)}" placeholder="…">

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:18px;">
      <div>
        <label style="margin-top:0;">${escapeHtml(t('oe.discount_pct'))} (%)</label>
        <input type="number" data-f="discountPct" value="${draft.discountPct}" min="0" max="100" step="1">
      </div>
      <div>
        <label style="margin-top:0;">${escapeHtml(t('oe.shipping'))} (${currencySymbol()})</label>
        <input type="number" data-f="shippingCost" value="${draft.shippingCost}" min="0" step="0.01">
      </div>
    </div>

    <div style="margin-top:14px;">
      <label style="margin:0; display:flex; align-items:center; justify-content:space-between;">
        <span>${escapeHtml(t('calc.extra_lines'))}</span>
        <button class="btn ghost small" id="oeAddExtraLine" type="button">${escapeHtml(t('calc.add_extra_line'))}</button>
      </label>
      <div id="oeExtraLinesList" style="margin-top:6px;">${renderOeExtraLinesHtml(draft.extraLines)}</div>
    </div>

    <label style="margin-top:18px;">${escapeHtml(t('oe.notes'))}</label>
    <textarea data-f="notes" rows="3" style="resize:vertical; min-height:60px;" placeholder="${escapeHtml(t('oe.notes_ph'))}">${escapeHtml(draft.notes)}</textarea>

    <label style="margin-top:14px;">${escapeHtml(t('oe.invoice_notes'))}</label>
    <p style="font-size:11.5px;color:var(--text-muted);margin:2px 0 5px;">${escapeHtml(t('oe.invoice_notes_hint'))}</p>
    <textarea data-f="invoiceNotes" rows="2" style="resize:vertical; min-height:48px;" placeholder="${escapeHtml(t('oe.invoice_notes_ph'))}">${escapeHtml(draft.invoiceNotes)}</textarea>

    <label style="margin-top:14px;">${escapeHtml(t('tag.label'))}</label>
    <input type="text" data-f="tags" value="${escapeHtml(draft.tags.join(', '))}" placeholder="${escapeHtml(t('tag.ph'))}" style="font-size:13px;">
    <p style="font-size:11.5px;color:var(--text-muted);margin:3px 0 0;">${escapeHtml(t('tag.hint'))}</p>

    <label style="margin-top:18px;">${escapeHtml(t('oe.photos'))}</label>
    <div class="order-photo-strip" id="orderPhotos">${photosHtml()}</div>
    <input type="file" id="orderPhotoInput" accept="image/jpeg,image/png,image/webp" style="display:none;">

    <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);">
      <label style="margin-top:0; display:flex; align-items:center; justify-content:space-between;">
        <span>${escapeHtml(t('oe.files'))}</span>
        ${window.hubAPI?.pickAndSaveOrderFile ? `<button id="btnAttachFile" class="btn small" type="button">${escapeHtml(t('oe.attach_file'))}</button>` : ''}
      </label>
      <div id="attachedFilesList">${renderAttachedFiles(draft.attachedFiles || [])}</div>
    </div>

    ${(() => {
      const hist = order.statusHistory || [];
      if (hist.length === 0) return '';
      const rows = hist.map(h => {
        const d = new Date(h.at);
        const dateStr = d.toLocaleDateString(i18n.current === 'ar' ? 'ar-SA' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = d.toTimeString().slice(0, 5);
        return `<div class="status-timeline-row">
          <span class="badge ${escapeHtml(h.status)}" style="font-size:10px;">${escapeHtml(t('queue.' + h.status))}</span>
          <span class="st-date">${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</span>
        </div>`;
      }).join('');
      return `<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border-soft);">
        <label style="margin-top:0;">${escapeHtml(t('oe.status_history'))}</label>
        <div class="status-timeline">${rows}</div>
      </div>`;
    })()}

    <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="margin:0; flex:1; font-size:12.5px; font-weight:600;">${escapeHtml(t('inst.title'))}</label>
        <button class="btn ghost small" id="oeAddInstalment" type="button">${escapeHtml(t('inst.add'))}</button>
      </div>
      <div id="oeInstalmentList"></div>
    </div>

    ${buildProfitabilityHtml(order)}

    ${(settings.customFields || []).length > 0 ? `
    <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);">
      <label style="margin-top:0; font-weight:600;">${escapeHtml(t('set.custom_fields_title'))}</label>
      ${(settings.customFields || []).map(f => `
        <label style="margin-top:10px;">${escapeHtml(f.label)}</label>
        <input type="text" data-cf="${escapeHtml(f.id)}" value="${escapeHtml((order.customData || {})[f.id] || '')}" placeholder="${escapeHtml(f.label)}">
      `).join('')}
    </div>` : ''}
  `;

  openFormModal({
    title: `${t('oe.title')} — ${order.id}`,
    saveLabel: t('common.save'),
    sizeLg: true,
    bodyHtml,
    onMount(modal) {
      modal.querySelector('[data-f="priority"]').addEventListener('change', (e) => {
        draft.priority = e.target.checked;
      });
      modal.querySelector('[data-f="dueDate"]').addEventListener('change', (e) => {
        draft.dueDate = e.target.value;
      });
      modal.querySelector('[data-f="courierName"]').addEventListener('input', (e) => {
        draft.courierName = e.target.value;
      });
      modal.querySelector('[data-f="trackingNumber"]').addEventListener('input', (e) => {
        draft.trackingNumber = e.target.value;
      });
      modal.querySelector('[data-f="deliveryAddress"]').addEventListener('input', (e) => {
        draft.deliveryAddress = e.target.value;
      });
      modal.querySelector('[data-f="discountPct"]').addEventListener('input', (e) => {
        draft.discountPct = Math.min(100, Math.max(0, +e.target.value || 0));
      });
      modal.querySelector('[data-f="shippingCost"]').addEventListener('input', (e) => {
        draft.shippingCost = Math.max(0, +e.target.value || 0);
      });
      modal.querySelector('[data-f="notes"]').addEventListener('input', (e) => {
        draft.notes = e.target.value;
      });
      modal.querySelector('[data-f="invoiceNotes"]').addEventListener('input', (e) => {
        draft.invoiceNotes = e.target.value;
      });
      modal.querySelector('[data-f="tags"]').addEventListener('input', (e) => {
        draft.tags = parseTags(e.target.value);
      });

      // Extra lines
      const oeExtraListEl = modal.querySelector('#oeExtraLinesList');
      const refreshOeLines = () => {
        if (oeExtraListEl) {
          oeExtraListEl.innerHTML = renderOeExtraLinesHtml(draft.extraLines);
          wireOeLines();
        }
      };
      function wireOeLines() {
        oeExtraListEl.querySelectorAll('.oe-el-label').forEach((inp, i) => {
          inp.addEventListener('input', () => { draft.extraLines[i].label = inp.value; });
        });
        oeExtraListEl.querySelectorAll('.oe-el-amount').forEach((inp, i) => {
          inp.addEventListener('input', () => { draft.extraLines[i].amount = Math.max(0, +inp.value || 0); });
        });
        oeExtraListEl.querySelectorAll('.oe-el-rm').forEach(btn => {
          btn.addEventListener('click', () => { draft.extraLines.splice(+btn.dataset.oeli, 1); refreshOeLines(); });
        });
      }
      wireOeLines();
      modal.querySelector('#oeAddExtraLine').addEventListener('click', () => {
        draft.extraLines.push({ id: uid('EL'), label: '', amount: 0 });
        refreshOeLines();
      });

      // Instalments (Feature 8)
      const instListEl = modal.querySelector('#oeInstalmentList');
      function renderInstalments() {
        if (!instListEl) return;
        if (draft.instalments.length === 0) {
          instListEl.innerHTML = `<div style="color:var(--text-muted); font-size:12.5px; padding:4px 0;">${escapeHtml(t('inst.unpaid'))}</div>`;
          return;
        }
        const paidTotal = draft.instalments.filter(ins => ins.paid).reduce((s, ins) => s + (+ins.amount || 0), 0);
        const totalAmt  = draft.instalments.reduce((s, ins) => s + (+ins.amount || 0), 0);
        instListEl.innerHTML = `
          <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:8px;">
            ${escapeHtml(t('inst.progress', { paid: fmtMoney(paidTotal), total: fmtMoney(totalAmt) }))}
          </div>
          ${draft.instalments.map((ins, i) => `
            <div class="instalment-row${ins.paid ? ' paid' : ''}">
              <span class="inst-label">
                <input type="text" class="inst-note-inp" data-ii="${i}" value="${escapeHtml(ins.note || '')}" placeholder="${escapeHtml(t('inst.note'))}" style="width:120px; font-size:12px; border:1px solid var(--border); background:var(--surface-2); border-radius:4px; padding:2px 6px; color:var(--text);">
                ${ins.dueDate ? `<span class="inst-due">${escapeHtml(ins.dueDate)}</span>` : ''}
              </span>
              <input type="number" class="inst-amt-inp" data-ii="${i}" value="${ins.amount || ''}" min="0" step="0.01" style="width:80px; font-size:12px; border:1px solid var(--border); background:var(--surface-2); border-radius:4px; padding:2px 6px; color:var(--text);">
              <input type="date" class="inst-due-inp" data-ii="${i}" value="${escapeHtml(ins.dueDate || '')}" style="font-size:11px; border:1px solid var(--border); background:var(--surface-2); border-radius:4px; padding:2px 4px; color:var(--text);">
              <button class="btn small${ins.paid ? '' : ' success'} inst-pay-btn" data-ii="${i}">${escapeHtml(ins.paid ? t('inst.paid') : t('inst.mark_paid'))}</button>
              <button class="btn danger small inst-rm-btn" data-ii="${i}">×</button>
            </div>`).join('')}`;
        instListEl.querySelectorAll('.inst-note-inp').forEach(inp => { inp.addEventListener('input', () => { draft.instalments[+inp.dataset.ii].note = inp.value; }); });
        instListEl.querySelectorAll('.inst-amt-inp').forEach(inp => { inp.addEventListener('input', () => { draft.instalments[+inp.dataset.ii].amount = Math.max(0, +inp.value || 0); }); });
        instListEl.querySelectorAll('.inst-due-inp').forEach(inp => { inp.addEventListener('input', () => { draft.instalments[+inp.dataset.ii].dueDate = inp.value; }); });
        instListEl.querySelectorAll('.inst-pay-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const ins = draft.instalments[+btn.dataset.ii];
            ins.paid = !ins.paid;
            ins.paidAt = ins.paid ? new Date().toISOString().split('T')[0] : null;
            renderInstalments();
          });
        });
        instListEl.querySelectorAll('.inst-rm-btn').forEach(btn => {
          btn.addEventListener('click', () => { draft.instalments.splice(+btn.dataset.ii, 1); renderInstalments(); });
        });
      }
      renderInstalments();
      modal.querySelector('#oeAddInstalment')?.addEventListener('click', () => {
        draft.instalments.push({ id: uid('INS'), amount: 0, note: '', dueDate: '', paid: false, paidAt: null });
        renderInstalments();
      });

      // File attachments
      const attachBtn = modal.querySelector('#btnAttachFile');
      const filesListEl = modal.querySelector('#attachedFilesList');
      const refreshFiles = () => { if (filesListEl) filesListEl.innerHTML = renderAttachedFiles(draft.attachedFiles); };
      if (attachBtn) {
        attachBtn.addEventListener('click', async () => {
          try {
            const result = await window.hubAPI.pickAndSaveOrderFile(order.id);
            if (result) {
              draft.attachedFiles.push(result);
              refreshFiles();
            }
          } catch (e) { console.error('attach file error', e); }
        });
      }
      if (filesListEl) {
        filesListEl.addEventListener('click', (e) => {
          const openBtn = e.target.closest('[data-act="open-file"]');
          const rmBtn   = e.target.closest('[data-act="rm-file"]');
          if (openBtn && window.hubAPI?.openOrderFile) {
            const f = draft.attachedFiles[+openBtn.dataset.fi];
            if (f) window.hubAPI.openOrderFile(f.filename);
          }
          if (rmBtn) {
            const fi = +rmBtn.dataset.fi;
            const removed = draft.attachedFiles[fi];
            if (removed?.filename) pendingFileDeletes.push(removed.filename);
            draft.attachedFiles.splice(fi, 1);
            refreshFiles();
          }
        });
      }

      const grid = modal.querySelector('#orderPhotos');
      const fileInput = modal.querySelector('#orderPhotoInput');

      const refresh = () => { grid.innerHTML = photosHtml(); };

      grid.addEventListener('click', (e) => {
        const add = e.target.closest('[data-act="add-photo"]');
        const rm  = e.target.closest('[data-act="rm-photo"]');
        if (add) fileInput.click();
        if (rm) {
          const i = +rm.dataset.pi;
          const removed = draft.printPhotos[i];
          if (removed?.filename) pendingDeletes.push(removed.filename);
          draft.printPhotos.splice(i, 1);
          // Drop any pending full for this index
          for (let p = pendingFulls.length - 1; p >= 0; p--) {
            if (pendingFulls[p].idx === i) pendingFulls.splice(p, 1);
            else if (pendingFulls[p].idx > i) pendingFulls[p].idx--;
          }
          refresh();
        }
      });

      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) { toast(t('pe.image_too_big'), 'error'); return; }
        try {
          const thumb = await resizeImage(file, 240, 0.85);
          const full  = await resizeImage(file, 1600, 0.88);
          const idx = draft.printPhotos.length;
          draft.printPhotos.push({ thumb, filename: null });
          pendingFulls.push({ idx, dataUrl: full });
          refresh();
        } catch (err) { console.error(err); }
      });
    },
    async onSave() {
      // Persist any pending full images to disk
      for (const { idx, dataUrl } of pendingFulls) {
        if (!draft.printPhotos[idx]) continue;
        try {
          const fname = await window.hubAPI.saveOrderPhoto(order.id, idx + '-' + Date.now().toString(36), dataUrl);
          draft.printPhotos[idx].filename = fname;
        } catch (e) {
          console.error('save order photo failed', e);
        }
      }
      // Delete any queued removals
      if (pendingDeletes.length > 0 && window.hubAPI?.deleteOrderPhoto) {
        for (const f of pendingDeletes) {
          try { await window.hubAPI.deleteOrderPhoto(f); } catch (_) {}
        }
      }
      order.notes = draft.notes;
      order.invoiceNotes = draft.invoiceNotes || undefined;
      order.tags = draft.tags.length > 0 ? draft.tags : undefined;
      order.dueDate = draft.dueDate || null;
      order.priority = draft.priority;
      order.printPhotos = draft.printPhotos;
      order.attachedFiles = draft.attachedFiles;
      order.courierName = draft.courierName || undefined;
      order.trackingNumber = draft.trackingNumber || undefined;
      order.deliveryAddress = draft.deliveryAddress || undefined;
      order.instalments = draft.instalments.length > 0 ? draft.instalments.map(ins => ({ ...ins })) : undefined;
      // Update paidAmount from instalments if present
      if (draft.instalments.length > 0) {
        const instPaid = draft.instalments.filter(ins => ins.paid).reduce((s, ins) => s + (+ins.amount || 0), 0);
        const totalInst = draft.instalments.reduce((s, ins) => s + (+ins.amount || 0), 0);
        order.paidAmount = instPaid;
        order.paymentStatus = instPaid <= 0 ? 'unpaid' : (instPaid >= totalInst ? 'paid' : 'partial');
      }
      // Delete removed files from disk
      if (pendingFileDeletes.length > 0 && window.hubAPI?.deleteOrderFile) {
        for (const fn of pendingFileDeletes) {
          try { await window.hubAPI.deleteOrderFile(fn); } catch (_) {}
        }
      }
      // Recalculate price when any price-affecting field changed (compute prev values BEFORE overwriting)
      const prevOldExtra   = (order.extraLines || []).reduce((s, l) => s + (+l.amount || 0), 0);
      const newExtraTotal  = draft.extraLines.reduce((s, l) => s + Math.max(0, +l.amount || 0), 0);
      if (draft.discountPct !== (order.discountPct || 0) ||
          draft.shippingCost !== (+order.shippingCost || 0) ||
          newExtraTotal !== prevOldExtra) {
        const prevDiscountPct = order.discountPct || 0;
        const prevShipping    = +order.shippingCost || 0;
        const sellingBase = order.priceBeforeDiscount ||
          (+order.price - prevShipping - prevOldExtra) / (1 - prevDiscountPct / 100);
        const newPrice = sellingBase * (1 - draft.discountPct / 100) + draft.shippingCost + newExtraTotal;
        order.price = +newPrice.toFixed(2);
        order.discountPct = draft.discountPct;
        order.priceBeforeDiscount = draft.discountPct > 0 ? +sellingBase.toFixed(2) : null;
        order.shippingCost = draft.shippingCost;
      }
      // Persist extra lines (after price recalculation to use correct prev values)
      order.extraLines = draft.extraLines.length > 0 ? draft.extraLines.map(l => ({ ...l })) : undefined;
      // Persist custom metadata fields
      const customFields = settings.customFields || [];
      if (customFields.length > 0) {
        const customData = {};
        customFields.forEach(f => {
          const el = document.querySelector(`[data-cf="${f.id}"]`);
          if (el) customData[f.id] = el.value.trim();
        });
        order.customData = Object.keys(customData).some(k => customData[k]) ? customData : undefined;
      }
      saveAll();
      renderLogs(); renderPortfolio(); renderDashboard(); renderAnalytics();
      toast(t('common.save'), 'success');
      return true;
    }
  });
}

/* ============================================================
   Duplicate an order — clone into the build cart
   ============================================================ */
function duplicateOrder(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  currentBuild = (order.parts || []).map(p => {
    const copy = { ...p, id: uid('PRT') };
    copy.baseCost = computePartBaseCost(copy);
    return copy;
  });
  currentBuildFromProductId = order.productId || null;
  currentClientId = order.clientId || null;
  // Pre-fill client field with the order's client display name
  $('#clientInput').value = order.project || '';
  switchTab('calculator-tab');
  renderBuild();
  toast(t('oe.duplicated'), 'success');
}

function reprintOrder(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  // Load parts into calculator cart
  currentBuild = (order.parts || []).map(p => {
    const copy = { ...p, id: uid('PRT') };
    copy.baseCost = computePartBaseCost(copy);
    return copy;
  });
  currentBuildFromProductId = order.productId || null;
  currentClientId = order.clientId || null;
  currentExtraLines = (order.extraLines || []).map(l => ({ ...l }));
  $('#clientInput').value = order.project || '';
  // Restore discount/shipping/extra lines from original order
  if ($('#discountPct')) $('#discountPct').value = String(order.discountPct || 0);
  if ($('#shippingCost')) $('#shippingCost').value = String(order.shippingCost || 0);
  switchTab('calculator-tab');
  renderBuild();
  renderExtraLines();
  updateGrandTotal();
  toast(t('oe.reprint_toast'), 'success');
}

/* ============================================================
   Portfolio
   ============================================================ */
function getPortfolioEntries() {
  // Flatten all order photos into a single browsable list
  const entries = [];
  for (const o of printLog) {
    for (let i = 0; i < (o.printPhotos || []).length; i++) {
      entries.push({
        orderId: o.id,
        project: o.project,
        date: o.date,
        photoIndex: i,
        thumb: o.printPhotos[i].thumb,
        filename: o.printPhotos[i].filename
      });
    }
  }
  return entries;
}

function renderPortfolio() {
  const grid = $('#portfolioGrid');
  if (!grid) return;
  const term = (portfolioSearchTerm || '').toLowerCase().trim();
  let entries = getPortfolioEntries();
  if (term) {
    entries = entries.filter(e =>
      (e.project || '').toLowerCase().includes(term) ||
      (e.orderId || '').toLowerCase().includes(term));
  }
  if (entries.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">${escapeHtml(t('pf.empty'))}</div>`;
    return;
  }
  grid.innerHTML = entries.map(e => `
    <div class="portfolio-cell" data-oid="${e.orderId}" data-pi="${e.photoIndex}">
      <img src="${e.thumb}" alt="">
      <div class="overlay">
        <div>${escapeHtml(e.project)}</div>
        <div class="id">${escapeHtml(e.orderId)} · ${escapeHtml(e.date)}</div>
      </div>
    </div>`).join('');
}

/* ============================================================
   PDF export + WhatsApp share
   ============================================================ */
async function exportInvoicePDF(orderId, { askWhere = true, openAfter = true } = {}) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return null;
  // Render invoice into print area, then call printToPDF via IPC
  await renderInvoiceForOrder(order);
  await new Promise(r => setTimeout(r, 60)); // let layout settle
  if (!window.hubAPI?.exportPDF) return null;
  try {
    const finalPath = await window.hubAPI.exportPDF({
      askWhere,
      defaultName: `${order.id}.pdf`
    });
    if (!finalPath) return null;
    toast(t('inv.saved'), 'success');
    if (openAfter && window.hubAPI.openPath) await window.hubAPI.openPath(finalPath);
    return finalPath;
  } catch (e) {
    console.error(e);
    toast('PDF error', 'error');
    return null;
  }
}

async function shareInvoiceWhatsApp(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  // Save PDF to default location (not the dialog) so we have a file path to attach
  await renderInvoiceForOrder(order);
  await new Promise(r => setTimeout(r, 60));
  let pdfPath = null;
  if (window.hubAPI?.exportPDF) {
    try { pdfPath = await window.hubAPI.exportPDF({ askWhere: false, defaultName: `${order.id}.pdf` }); }
    catch (e) { console.error(e); }
  }
  const displayName = client ? (localName(client))
                              : (order.project || '');
  const total = fmtMoney(order.price);
  const message = t('inv.message_template', { name: displayName, id: order.id, total });
  if (!client?.phone) toast(t('inv.no_phone'), 'info', 3200);
  if (window.hubAPI?.shareWhatsApp) {
    await window.hubAPI.shareWhatsApp({
      phone: client?.phone || '',
      message,
      pdfPath
    });
  }
}

async function sendStatusWhatsApp(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  if (!client?.phone) { toast(t('queue.wa_no_phone'), 'info', 3200); return; }
  const displayName = localName(client);
  const statusLabel = t('queue.' + order.status);
  const message = t('queue.wa_status_msg', { name: displayName, project: order.project, id: order.id, status: statusLabel });
  if (window.hubAPI?.shareWhatsApp) {
    await window.hubAPI.shareWhatsApp({ phone: client.phone, message, pdfPath: null });
  }
}

async function sendPaymentReminder(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  if (!client?.phone) { toast(t('pay.remind_no_phone'), 'info', 3200); return; }
  // Use the payment-reminder WA template if available, otherwise a default
  const tpl = waTemplates.find(w => w.id === 'tpl-payment') || waTemplates[0];
  const message = tpl
    ? fillWaTemplate(tpl.body, order, client)
    : t('pay.remind_default', { name: localName(client), id: order.id, price: fmtPrice(order.price), currency: currencySymbol() });
  if (window.hubAPI?.shareWhatsApp) {
    await window.hubAPI.shareWhatsApp({ phone: client.phone, message, pdfPath: null });
  }
}

async function shareTrackingWhatsApp(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order?.trackingNumber) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const phone = client?.phone;
  if (!phone) { toast(t('pay.remind_no_phone'), 'info'); return; }
  const msg = t('ship.tracking_msg', {
    project: order.project || order.id,
    courier: order.courierName || '',
    tracking: order.trackingNumber,
  });
  if (window.hubAPI?.shareWhatsApp) await window.hubAPI.shareWhatsApp({ phone, message: msg, pdfPath: null });
}

// Render the invoice with QR (used by Print, PDF, and WhatsApp paths)
async function renderInvoiceForOrder(order) {
  const ts = order.timestamp || new Date(order.date + 'T12:00:00').toISOString();
  const price    = +order.price || 0;
  const shipping = +order.shippingCost || 0;
  const rate     = settings.enableVat ? (+settings.vatRate || 15) : 0;
  // Prices are VAT-inclusive. Extract VAT portion from the total.
  const vatAmt    = rate > 0 ? price * rate / (100 + rate) : 0;
  const exVat     = price - vatAmt;
  const total     = fmtMoney(price);
  const vatAmount = fmtMoney(vatAmt);
  const subtotal  = fmtMoney(exVat);
  let qrSvg = '';
  if (settings.enableZatca && window.hubAPI?.generateQR) {
    const tlvB64 = buildZatcaTLV({
      sellerName: settings.bizEn || settings.bizAr || '',
      vatNumber:  settings.vat || '',
      timestamp:  ts,
      total, vatAmount
    });
    try { qrSvg = await window.hubAPI.generateQR(tlvB64, { width: 140, margin: 1 }); }
    catch (e) { console.error(e); }
  }

  // Payment QR — encode IBAN + amount + ref so client can scan to initiate transfer
  let payQrSvg = '';
  if (settings.iban && window.hubAPI?.generateQR) {
    const iban = settings.iban.replace(/\s+/g, '');
    const payRef = order.id;
    const payAmt = price.toFixed(2);
    // BeneficiaryName|IBAN|Amount|Ref (simple format readable by Saudi banking apps)
    const payText = [settings.bizEn || settings.bizAr || '', iban, payAmt, payRef].join('|');
    try { payQrSvg = await window.hubAPI.generateQR(payText, { width: 120, margin: 1 }); }
    catch (e) { console.warn('Payment QR failed', e); }
  }

  renderInvoice(order, { qrSvg, payQrSvg, total, vatAmount, subtotal, vatRate: rate, shipping });
}

/* ============================================================
   Daily auto-backup
   ============================================================ */
async function maybeAutoBackup() {
  if (!settings.autoBackup || !window.hubAPI?.lastBackupDate) return;
  try {
    const last  = await window.hubAPI.lastBackupDate();
    const today = new Date().toISOString().split('T')[0];
    const json  = JSON.stringify({
      version: 4, exportedAt: new Date().toISOString(),
      printLog, inventory, templates, products, clients, settings, expenses, machines, waTemplates, wasteLog
    });
    if (last !== today) {
      const p = await window.hubAPI.writeBackup(json);
      if (p) console.log('Auto-backup written:', p);
      updateLastBackupDisplay();
    }
    if (settings.useIcloud && window.hubAPI?.writeIcloudBackup) {
      await window.hubAPI.writeIcloudBackup(json).catch(e => console.warn('iCloud backup failed', e));
    }
  } catch (e) { console.warn('Auto-backup failed', e); }
}

async function updateLastBackupDisplay() {
  const el = $('#lastBackupDate');
  if (!el || !window.hubAPI?.lastBackupDate) return;
  try {
    const last = await window.hubAPI.lastBackupDate();
    el.textContent = last || t('set.backup_never');
  } catch { /* ignore */ }
}

/* ============================================================
   Expense tracker
   ============================================================ */
let expRangeFilter = 'all';

const EXP_CATEGORIES = ['filament','electricity','maintenance','tools','shipping','other'];

function expCatLabel(cat) {
  return t('exp.cat.' + cat) || cat;
}

// Module-level variable for the current expense receipt path
let _expReceiptPath = null;

function addExpense() {
  const amount = clampPositive($('#expAmount').value);
  if (amount <= 0) { toast(t('exp.amount_required'), 'error'); return; }
  const dateVal = $('#expDate').value || new Date().toISOString().split('T')[0];
  const orderRef = ($('#expOrderRef')?.value || '').trim() || null;
  expenses.unshift({
    id:          uid('EXP'),
    date:        dateVal,
    category:    $('#expCategory').value || 'other',
    amount,
    note:        $('#expNote').value.trim(),
    orderId:     orderRef,
    receiptPath: _expReceiptPath || null,
  });
  saveAll();
  $('#expAmount').value = '';
  $('#expNote').value   = '';
  if ($('#expOrderRef')) $('#expOrderRef').value = '';
  _expReceiptPath = null;
  const nameEl = $('#expReceiptName');
  if (nameEl) nameEl.textContent = '';
  renderExpenses();
  toast(t('exp.added'), 'success');
}

function showLinkedExpenses(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const linked = expenses.filter(e => e.orderId === orderId);
  const total = linked.reduce((s, e) => s + (+e.amount || 0), 0);
  const tableHtml = linked.length === 0
    ? `<p style="color:var(--text-muted); font-size:13px; text-align:center; padding:16px 0;">${escapeHtml(t('exp.no_linked'))}</p>`
    : `<div class="table-wrap"><table style="width:100%;">
        <thead><tr>
          <th>${escapeHtml(t('common.date'))}</th>
          <th>${escapeHtml(t('exp.category'))}</th>
          <th>${escapeHtml(t('exp.amount'))}</th>
          <th>${escapeHtml(t('exp.note'))}</th>
        </tr></thead>
        <tbody>${linked.map(e => `<tr>
          <td style="font-size:12px; color:var(--text-dim);">${escapeHtml(e.date || '')}</td>
          <td><span class="exp-cat-badge cat-${escapeHtml(e.category)}">${escapeHtml(expCatLabel(e.category))}</span></td>
          <td style="color:var(--danger); font-variant-numeric:tabular-nums;">${fmtPrice(e.amount)}</td>
          <td style="color:var(--text-muted); font-size:12.5px;">${escapeHtml(e.note || '')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="text-align:right; font-size:13px; font-weight:600; margin-top:10px; color:var(--danger);">
        ${escapeHtml(t('exp.sum.expenses'))}: ${fmtPrice(total)}
      </div>`;
  openFormModal({
    title: `${t('exp.linked_expenses')} — ${escapeHtml(order.id)}`,
    noSave: true,
    sizeLg: true,
    bodyHtml: tableHtml,
  });
}

function emailOrderToClient(orderId, isQuote = false) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  if (!client?.email) { toast(t('ord.no_email'), 'error'); return; }
  const clientName = localName(client) || order.project || '';
  const subject = encodeURIComponent(
    isQuote
      ? `Quote #${order.id} — ${order.project}`
      : `Invoice for order #${order.id} — ${order.project}`
  );
  const bodyLines = [
    `Dear ${clientName},`,
    '',
    isQuote
      ? `Please find attached your quote #${order.id} for ${fmtPrice(order.price)}.`
      : `Please find attached your invoice #${order.id} for ${fmtPrice(order.price)}.`,
    `Order: ${order.project}`,
    `Date: ${order.date}`,
  ];
  if (!isQuote && settings.paymentInstructions) {
    bodyLines.push('', settings.paymentInstructions);
  }
  bodyLines.push('', `Thank you for your business!`, settings.bizEn || 'Khayt');
  const body = encodeURIComponent(bodyLines.join('\n'));
  const mailtoUrl = `mailto:${encodeURIComponent(client.email)}?subject=${subject}&body=${body}`;
  window.open(mailtoUrl);
  toast(t('ord.email_opened'), 'success');
}

function populateExpOrderDatalist() {
  const dl = $('#expOrderList');
  if (!dl) return;
  dl.innerHTML = printLog.slice(0, 50).map(o =>
    `<option value="${escapeHtml(o.id)}">${escapeHtml(o.id)} — ${escapeHtml(o.project || '')}</option>`
  ).join('');
}

async function deleteExpense(id) {
  const ok = await confirmModal(t('common.delete') + '?', { danger: true });
  if (!ok) return;
  expenses = expenses.filter(e => e.id !== id);
  saveAll();
  renderExpenses();
}

function renderExpenses() {
  const filtered = expenses.filter(e => inRange(e.date, expRangeFilter, 'expenses'));
  const tbody = $('#expenseTable tbody');

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(t('exp.empty'))}</td></tr>`;
  } else if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${escapeHtml(t('exp.empty_filter'))}</td></tr>`;
  } else {
    tbody.innerHTML = filtered.map(e => `
      <tr>
        <td style="font-family:var(--font-num); font-size:12px; color:var(--text-dim); white-space:nowrap;">${escapeHtml(e.date)}</td>
        <td><span class="exp-cat-badge cat-${escapeHtml(e.category)}">${escapeHtml(expCatLabel(e.category))}</span></td>
        <td style="font-weight:600; font-variant-numeric:tabular-nums; color:var(--danger);">${fmtPrice(e.amount)}</td>
        <td style="color:var(--text-muted); font-size:12.5px;">${escapeHtml(e.note)}</td>
        <td style="white-space:nowrap;">
          ${e.receiptPath ? `<button class="btn small ghost" data-act="open-receipt" data-path="${escapeHtml(e.receiptPath)}" title="${escapeHtml(t('exp.open_receipt'))}">📎</button>` : ''}
          <button class="btn danger small" data-act="del-exp" data-id="${e.id}">${escapeHtml(t('common.delete'))}</button>
        </td>
      </tr>`).join('');
  }

  // Summary
  const totalExpenses = filtered.reduce((s, e) => s + e.amount, 0);
  const revenue = printLog
    .filter(o => o.status === 'completed' && inRange(o.date, expRangeFilter, 'expenses'))
    .reduce((s, o) => s + +o.price, 0);
  const profit = revenue - totalExpenses;

  const byCategory = {};
  EXP_CATEGORIES.forEach(c => { byCategory[c] = 0; });
  filtered.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

  const summaryEl = $('#expenseSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="exp-summary-row">
        <span>${escapeHtml(t('exp.sum.revenue'))}</span>
        <strong style="color:var(--success);">${fmtPrice(revenue)}</strong>
      </div>
      <div class="exp-summary-row">
        <span>${escapeHtml(t('exp.sum.expenses'))}</span>
        <strong style="color:var(--danger);">${fmtPrice(totalExpenses)}</strong>
      </div>
      <div class="exp-summary-row exp-profit">
        <span>${escapeHtml(t('exp.sum.profit'))}</span>
        <strong style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${fmtPrice(profit)}</strong>
      </div>
      <hr style="border:none; border-top:1px solid var(--border); margin:14px 0 10px;">
      ${EXP_CATEGORIES.filter(c => byCategory[c] > 0).map(c => {
        const budget = (settings.expBudgets || {})[c] || 0;
        const pct = budget > 0 ? Math.min(100, (byCategory[c] / budget) * 100) : 0;
        const over = budget > 0 && byCategory[c] > budget;
        return `
        <div class="exp-summary-row" style="font-size:12.5px; flex-direction:column; align-items:stretch; gap:3px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="exp-cat-badge cat-${escapeHtml(c)}">${escapeHtml(expCatLabel(c))}</span>
            <span style="color:${over ? 'var(--danger)' : 'var(--text-dim)'};">${fmtPrice(byCategory[c])}${budget > 0 ? ` / ${fmtPrice(budget)}` : ''}</span>
          </div>
          ${budget > 0 ? `<div class="exp-budget-bar"><div class="exp-budget-fill${over ? ' over' : ''}" style="width:${pct.toFixed(1)}%;"></div></div>` : ''}
        </div>`;
      }).join('')}
    `;
  }
  renderExpenseBudgets();
}

function renderExpenseBudgets() {
  const el = $('#expenseBudgetSection');
  if (!el) return;
  const budgets = settings.expBudgets || {};
  const hasBudgets = EXP_CATEGORIES.some(c => (budgets[c] || 0) > 0);
  if (!hasBudgets) {
    el.innerHTML = `<p style="color:var(--text-muted); font-size:13px;">${escapeHtml(t('exp.no_budgets'))}</p>`;
    return;
  }
  const now = new Date();
  const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthExpenses = expenses.filter(e => (e.date || '') >= firstDayOfMonth);
  const byCategory = {};
  EXP_CATEGORIES.forEach(c => { byCategory[c] = 0; });
  monthExpenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

  const rows = EXP_CATEGORIES.filter(c => (budgets[c] || 0) > 0).map(c => {
    const budget = budgets[c];
    const spent = byCategory[c] || 0;
    const remaining = budget - spent;
    const pct = Math.min(100, (spent / budget) * 100);
    const barColor = pct >= 100 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)';
    return `<tr>
      <td><span class="exp-cat-badge cat-${escapeHtml(c)}">${escapeHtml(expCatLabel(c))}</span></td>
      <td style="font-variant-numeric:tabular-nums; text-align:right;">${fmtPrice(budget)}</td>
      <td style="font-variant-numeric:tabular-nums; text-align:right; color:${pct >= 100 ? 'var(--danger)' : 'inherit'};">${fmtPrice(spent)}</td>
      <td style="font-variant-numeric:tabular-nums; text-align:right; color:${remaining >= 0 ? 'var(--success)' : 'var(--danger)'};">${remaining >= 0 ? fmtPrice(remaining) : '−' + fmtPrice(-remaining)}</td>
      <td style="min-width:120px; padding-inline-start:12px;">
        <div style="background:rgba(255,255,255,0.08); border-radius:4px; height:8px; overflow:hidden;">
          <div style="background:${barColor}; width:${pct.toFixed(1)}%; height:100%; border-radius:4px; transition:width 0.3s;"></div>
        </div>
        ${pct >= 100 ? `<div style="font-size:10px; color:var(--danger); margin-top:2px;">${escapeHtml(t('exp.over_budget'))}</div>` : ''}
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `<div class="table-wrap"><table style="width:100%;">
    <thead><tr>
      <th>${escapeHtml(t('exp.category'))}</th>
      <th style="text-align:right;">${escapeHtml(t('exp.budget_col'))}</th>
      <th style="text-align:right;">${escapeHtml(t('exp.actual_col'))}</th>
      <th style="text-align:right;">${escapeHtml(t('exp.remaining_col'))}</th>
      <th style="padding-inline-start:12px;">Progress</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function exportExpensesCsv() {
  const filtered = expenses.filter(e => inRange(e.date, expRangeFilter, 'expenses'));
  const lines = [
    [`Date`,`Category`,`Amount (${currencySymbol()})`,`Note`].map(csvEsc).join(','),
    ...filtered.map(e => [e.date, expCatLabel(e.category), e.amount, e.note].map(csvEsc).join(','))
  ];
  downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    `expenses-${new Date().toISOString().slice(0,10)}.csv`);
}

/* ============================================================
   Order file attachments helpers
   ============================================================ */
function renderAttachedFiles(files) {
  if (!files || files.length === 0) {
    return `<p style="font-size:12px; color:var(--text-muted); margin:6px 0 0;">${escapeHtml(t('oe.no_files'))}</p>`;
  }
  return files.map((f, i) => {
    const fmtSize = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB'
      : f.size > 1024 ? (f.size / 1024).toFixed(0) + ' KB' : (f.size || 0) + ' B';
    return `<div class="attached-file-row" data-fi="${i}">
      <span class="attached-file-icon">📎</span>
      <span class="attached-file-name">${escapeHtml(f.originalName || f.filename)}</span>
      <span class="attached-file-size">${fmtSize}</span>
      <button class="btn small ghost" data-act="open-file" data-fi="${i}" title="${escapeHtml(t('oe.open_file'))}">${escapeHtml(t('oe.open_file'))}</button>
      <button class="btn danger small" data-act="rm-file" data-fi="${i}" title="${escapeHtml(t('common.delete'))}">×</button>
    </div>`;
  }).join('');
}

function buildProfitabilityHtml(order) {
  if (!order.parts || order.parts.length === 0) return '';
  const estCost = order.parts.reduce((s, p) => s + computePartBaseCost(p), 0);
  if (estCost <= 0) return '';
  const revenue = +order.price || 0;

  // --- Estimated row ---
  const estProfit = revenue - estCost;
  const estMargin = revenue > 0 ? (estProfit / revenue) * 100 : 0;
  const estCol = estProfit >= 0 ? 'var(--success)' : 'var(--danger)';

  const statCell = (label, value, color = '') => `
    <div style="background:var(--surface-2,rgba(255,255,255,.04)); padding:8px; border-radius:6px; text-align:center;">
      <div style="color:var(--text-muted); font-size:11px;">${label}</div>
      <div style="font-weight:600;${color ? ` color:${color};` : ''}">${value}</div>
    </div>`;

  let actualRowHtml = '';
  const hasActual = (order.actualWeight != null && order.actualWeight > 0) ||
                    (order.actualPrintTime != null && order.actualPrintTime > 0);
  if (hasActual) {
    // Compute actual cost by scaling each part's material & machine components
    const totalEstWeight    = order.parts.reduce((s, p) => s + (+p.printWeight || 0), 0);
    const totalEstTime      = order.parts.reduce((s, p) => s + (+p.printTime   || 0), 0);
    const weightRatio = (totalEstWeight > 0 && order.actualWeight   > 0) ? order.actualWeight   / totalEstWeight : 1;
    const timeRatio   = (totalEstTime   > 0 && order.actualPrintTime > 0) ? order.actualPrintTime / totalEstTime  : 1;
    const actualCost = order.parts.reduce((s, p) => {
      const bd = computePartBreakdown(p);
      return s + (bd.material * weightRatio) + (bd.machine * timeRatio) + bd.labor + bd.buffer;
    }, 0);
    const actualProfit = revenue - actualCost;
    const actualMargin = revenue > 0 ? (actualProfit / revenue) * 100 : 0;
    const actualCol    = actualProfit >= 0 ? 'var(--success)' : 'var(--danger)';
    actualRowHtml = `
      <div style="font-size:11px; color:var(--text-muted); margin:8px 0 4px; padding-inline-start:2px;">${escapeHtml(t('oe.actual_row'))}</div>
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; font-size:13px;">
        ${statCell(escapeHtml(t('oe.revenue')), fmtPrice(revenue))}
        ${statCell(escapeHtml(t('oe.actual_cost')), fmtPrice(actualCost))}
        ${statCell(escapeHtml(t('oe.profit')), `${fmtPrice(actualProfit)} <span style="font-size:11px;">(${actualMargin.toFixed(0)}%)</span>`, actualCol)}
      </div>`;
  }

  return `
    <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);">
      <label style="margin-top:0;">${escapeHtml(t('oe.profitability'))}</label>
      <div style="font-size:11px; color:var(--text-muted); margin:6px 0 4px; padding-inline-start:2px;">${escapeHtml(t('oe.est_row'))}</div>
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; font-size:13px;">
        ${statCell(escapeHtml(t('oe.revenue')), fmtPrice(revenue))}
        ${statCell(escapeHtml(t('oe.est_cost')), fmtPrice(estCost))}
        ${statCell(escapeHtml(t('oe.profit')), `${fmtPrice(estProfit)} <span style="font-size:11px;">(${estMargin.toFixed(0)}%)</span>`, estCol)}
      </div>
      ${actualRowHtml}
    </div>`;
}

/* ============================================================
   Waste Log (failed prints & wasted filament)
   ============================================================ */
function renderWasteLog() {
  const tbody = document.querySelector('#wasteTable tbody');
  if (!tbody) return;

  const sorted = [...wasteLog].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const totalWasteCost = wasteLog.reduce((s, w) => s + (+w.cost || 0), 0);
  const totalWasteGrams = wasteLog.reduce((s, w) => s + (+w.weight || 0), 0);

  // Failure type breakdown
  const ftCounts = {};
  wasteLog.forEach(w => { const ft = w.failureType || 'other'; ftCounts[ft] = (ftCounts[ft] || 0) + 1; });

  const statEl = $('#wasteStats');
  if (statEl) {
    const maxFt = Object.values(ftCounts).reduce((a, b) => Math.max(a, b), 1);
    const ftBars = WASTE_FAILURE_TYPES.filter(ft => ftCounts[ft] > 0).sort((a, b) => (ftCounts[b] || 0) - (ftCounts[a] || 0)).map(ft => {
      const pct = ((ftCounts[ft] || 0) / maxFt * 100).toFixed(1);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px;">
        <span style="width:130px;color:var(--text-muted);text-align:end;">${escapeHtml(t('waste.ft.' + ft))}</span>
        <div style="flex:1;background:rgba(255,255,255,0.08);border-radius:3px;height:8px;"><div style="background:var(--danger);width:${pct}%;height:100%;border-radius:3px;opacity:0.75;"></div></div>
        <span style="width:24px;text-align:start;">${ftCounts[ft]}</span>
      </div>`;
    }).join('');
    statEl.innerHTML = `
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:${ftBars ? '12px' : '0'};">
        <span>${escapeHtml(t('waste.total_entries'))}: <strong>${wasteLog.length}</strong></span>
        <span>${escapeHtml(t('waste.total_weight'))}: <strong>${totalWasteGrams.toFixed(0)}g</strong></span>
        <span>${escapeHtml(t('waste.total_cost'))}: <strong>${fmtPrice(totalWasteCost)}</strong></span>
      </div>
      ${ftBars ? `<div style="margin-top:8px;"><div style="font-size:11.5px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">${escapeHtml(t('waste.failure_breakdown'))}</div>${ftBars}</div>` : ''}
    `;
  }

  // Top orders by waste cost
  const topWasteOrdersEl = $('#wasteTopOrdersSection');
  if (topWasteOrdersEl) {
    const orderWaste = {};
    for (const w of wasteLog) {
      if (!w.orderId) continue;
      if (!orderWaste[w.orderId]) orderWaste[w.orderId] = 0;
      orderWaste[w.orderId] += (+w.cost || 0);
    }
    const topOrders = Object.entries(orderWaste)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (topOrders.length === 0) {
      topWasteOrdersEl.innerHTML = '';
    } else {
      const order_rows = topOrders.map(([oid, cost]) => {
        const ord = printLog.find(o => o.id === oid);
        return `<tr>
          <td style="font-size:12px; color:var(--text-dim);">${escapeHtml(oid)}</td>
          <td>${escapeHtml(ord ? (ord.project || '') : '—')}</td>
          <td style="color:var(--danger); font-variant-numeric:tabular-nums; text-align:right;">${fmtPrice(cost)}</td>
        </tr>`;
      }).join('');
      topWasteOrdersEl.innerHTML = `
        <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-soft);">
          <label style="margin-top:0; font-size:12px; font-weight:600; color:var(--text-muted);">${escapeHtml(t('waste.top_orders'))}</label>
          <div class="table-wrap" style="margin-top:6px;"><table style="width:100%;">
            <thead><tr>
              <th>${escapeHtml(t('log.filter_status'))}</th>
              <th>${escapeHtml(t('log.client'))}</th>
              <th style="text-align:right;">${escapeHtml(t('waste.est_cost'))}</th>
            </tr></thead>
            <tbody>${order_rows}</tbody>
          </table></div>
        </div>`;
    }
  }

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">${escapeHtml(t('waste.empty'))}</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(w => {
    const ftLabel = w.failureType ? `<span class="waste-ft-badge">${escapeHtml(t('waste.ft.' + w.failureType))}</span>` : '';
    return `
    <tr>
      <td>${escapeHtml(w.date || '')}</td>
      <td>${escapeHtml(w.material || '—')}</td>
      <td style="text-align:center;">${escapeHtml(String(w.weight || 0))}g</td>
      <td>${ftLabel}</td>
      <td>${escapeHtml(w.reason || '—')}</td>
      <td style="text-align:right; font-variant-numeric:tabular-nums;">${fmtPrice(+w.cost || 0)}</td>
      <td style="text-align:center;">
        <button class="btn danger small" data-act="del-waste" data-id="${escapeHtml(w.id)}">${escapeHtml(t('common.delete'))}</button>
      </td>
    </tr>`;
  }).join('');
}

const WASTE_FAILURE_TYPES = ['bed_adhesion','nozzle_jam','warping','stringing','operator_error','design_issue','power_failure','material_quality','other'];

function openWasteForm() {
  const today = new Date().toISOString().split('T')[0];
  const invOptions = inventory.map(f =>
    `<option value="${escapeHtml(f.material)}">${escapeHtml(f.material)}</option>`
  ).join('');
  const failureOptions = WASTE_FAILURE_TYPES.map(ft =>
    `<option value="${ft}">${escapeHtml(t('waste.ft.' + ft))}</option>`
  ).join('');
  const recentOrderOptions = printLog.slice(0, 60).map(o =>
    `<option value="${escapeHtml(o.id)}">${escapeHtml(o.id)} — ${escapeHtml(o.project || '')}</option>`
  ).join('');

  openFormModal({
    title: t('waste.add'),
    saveLabel: t('waste.log_btn'),
    bodyHtml: `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('waste.date'))}</label>
          <input type="date" id="wf_date" value="${today}">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('waste.material'))}</label>
          <select id="wf_material">${invOptions || '<option value="">—</option>'}</select>
        </div>
      </div>
      <label style="margin-top:12px;">${escapeHtml(t('waste.failure_type'))}</label>
      <select id="wf_failure_type">${failureOptions}</select>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
        <div>
          <label style="margin-top:0;">${escapeHtml(t('waste.weight'))} (g)</label>
          <input type="number" id="wf_weight" value="0" min="0" step="1">
        </div>
        <div>
          <label style="margin-top:0;">${escapeHtml(t('waste.est_cost'))} (${currencySymbol()})</label>
          <input type="number" id="wf_cost" value="0" min="0" step="0.01">
        </div>
      </div>
      <label style="margin-top:12px;">${escapeHtml(t('waste.reason'))}</label>
      <input type="text" id="wf_reason" placeholder="${escapeHtml(t('waste.reason_ph'))}">
      <label style="margin-top:12px;">${escapeHtml(t('waste.order_ref'))}</label>
      <input type="text" id="wf_order_ref" list="wasteOrderList" placeholder="${escapeHtml(t('waste.order_ref'))}">
      <datalist id="wasteOrderList">${recentOrderOptions}</datalist>
      <label style="margin-top:12px;">${escapeHtml(t('waste.notes'))}</label>
      <textarea id="wf_notes" rows="2" style="resize:vertical;"></textarea>
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:14px;">
        <input type="checkbox" id="wf_deduct" checked style="width:auto; margin:0;">
        <span>${escapeHtml(t('waste.deduct_inv'))}</span>
      </label>
    `,
    onSave() {
      const material    = $('#wf_material').value.trim();
      const failureType = $('#wf_failure_type').value;
      const weight      = Math.max(0, +$('#wf_weight').value || 0);
      const cost        = Math.max(0, +$('#wf_cost').value || 0);
      const reason      = $('#wf_reason').value.trim();
      const notes       = $('#wf_notes').value.trim();
      const deduct      = $('#wf_deduct').checked;
      const date        = $('#wf_date').value || today;
      const orderRef    = ($('#wf_order_ref').value || '').trim() || null;

      if (!material) { toast(t('waste.err_material'), 'error'); return false; }

      const entry = {
        id: 'w-' + Date.now().toString(36),
        date,
        material,
        failureType,
        weight,
        cost,
        reason,
        notes,
        orderId: orderRef,
      };
      wasteLog.unshift(entry);

      // Auto-deduct from matching inventory spool
      if (deduct && weight > 0) {
        const spool = inventory.find(f => f.material === material);
        if (spool) {
          spool.weight = Math.max(0, (+spool.weight || 0) - weight);
        }
      }

      saveAll();
      renderWasteLog();
      if (document.querySelector('#inventory-tab.active')) renderInventory();
      toast(t('waste.saved'), 'success');
    }
  });
}

function deleteWasteEntry(id) {
  const idx = wasteLog.findIndex(w => w.id === id);
  if (idx < 0) return;
  wasteLog.splice(idx, 1);
  saveAll();
  renderWasteLog();
  toast(t('waste.deleted'), 'success');
}

/* ============================================================
   Monthly Tax Summary Export
   ============================================================ */
function exportTaxSummary() {
  // Group completed orders by YYYY-MM
  const monthMap = {};
  for (const o of printLog) {
    if (o.status !== 'completed') continue;
    const month = (o.date || '').slice(0, 7);
    if (!month) continue;
    if (!monthMap[month]) monthMap[month] = { orders: 0, revenue: 0, vatCollected: 0, shipping: 0 };
    monthMap[month].orders++;
    monthMap[month].revenue += +o.price || 0;
    monthMap[month].shipping += +o.shippingCost || 0;
    const rate = settings.enableVat ? (+settings.vatRate || 15) : 0;
    monthMap[month].vatCollected += rate > 0 ? (+o.price || 0) * rate / (100 + rate) : 0;
  }
  // Group expenses by YYYY-MM
  const expMap = {};
  for (const e of expenses) {
    const month = (e.date || '').slice(0, 7);
    if (!month) continue;
    expMap[month] = (expMap[month] || 0) + (+e.amount || 0);
  }

  const allMonths = [...new Set([...Object.keys(monthMap), ...Object.keys(expMap)])].sort();

  if (allMonths.length === 0) {
    toast(t('an.tax_empty'), 'error');
    return;
  }

  const cur = currencySymbol();
  const headers = [
    `Month`, `Orders`, `Revenue (${cur})`, `Shipping (${cur})`,
    `VAT Collected (${cur})`, `Expenses (${cur})`, `Net Income (${cur})`
  ].map(csvEsc).join(',');

  const rows = allMonths.map(m => {
    const rev = monthMap[m]?.revenue || 0;
    const ship = monthMap[m]?.shipping || 0;
    const vat  = monthMap[m]?.vatCollected || 0;
    const exp  = expMap[m] || 0;
    const net  = rev - exp;
    return [
      m,
      monthMap[m]?.orders || 0,
      rev.toFixed(2),
      ship.toFixed(2),
      vat.toFixed(2),
      exp.toFixed(2),
      net.toFixed(2)
    ].map(csvEsc).join(',');
  });

  downloadBlob(
    new Blob(['﻿' + [headers, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    `tax-summary-${new Date().toISOString().slice(0, 10)}.csv`
  );
  toast(t('an.tax_exported'), 'success');
}

/* ============================================================
   Dashboard
   ============================================================ */
function renderDashboard() {
  const el = $('#dashboardContent');
  if (!el) return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  // Monthly goal
  const thisMonthStr = today.toISOString().slice(0, 7);
  const monthlyRev   = printLog
    .filter(o => o.status === 'completed' && (o.date || '').startsWith(thisMonthStr))
    .reduce((s, o) => s + +o.price, 0);

  // Stats
  const active   = printLog.filter(o => o.status !== 'completed');
  const todayDone = printLog.filter(o => o.status === 'completed' && o.date === todayStr);
  const todayRev  = todayDone.reduce((s, o) => s + +o.price, 0);
  const receivables = printLog
    .filter(o => (payStatus(o)) !== 'paid')
    .reduce((s, o) => s + Math.max(0, +o.price - (+o.paidAmount || 0)), 0);

  // Queue clearance forecast (exclude on_hold orders — they are frozen)
  const pendingHours = printLog
    .filter(o => o.status !== 'completed' && o.status !== 'quote' && o.status !== 'on_hold')
    .reduce((s, o) => s + (+o.printTime || 0), 0);
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(today.getDate() - 30);
  const thirtyStr = thirtyDaysAgo.toISOString().split('T')[0];
  const recentCompleted = printLog.filter(o => o.status === 'completed' && (o.date || '') >= thirtyStr);
  const avgDailyHours = recentCompleted.length > 0
    ? recentCompleted.reduce((s, o) => s + (+o.printTime || 0), 0) / 30
    : 0;
  const clearDays = (avgDailyHours > 0 && pendingHours > 0)
    ? Math.ceil(pendingHours / avgDailyHours)
    : null;

  // Quotes expiring soon (≤ 2 days) or already expired
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const expiringQuotes = printLog
    .filter(o => o.status === 'quote' && o.quoteExpiresAt)
    .filter(o => Math.round((new Date(o.quoteExpiresAt + 'T00:00:00') - today0) / 86400000) <= 2)
    .sort((a, b) => (a.quoteExpiresAt || '').localeCompare(b.quoteExpiresAt || ''));

  // Orders awaiting delivery (completed but not yet delivered)
  const awaitingDelivery = printLog.filter(o => o.status === 'completed' && !o.deliveredAt);

  // Due-date buckets (non-completed only)
  const withDue = printLog.filter(o => o.dueDate && o.status !== 'completed');
  const overdue  = withDue.filter(o => new Date(o.dueDate + 'T00:00:00') < today).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const dueSoon  = withDue.filter(o => {
    const d = new Date(o.dueDate + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    return diff >= 0 && diff <= 3;
  }).sort((a,b) => a.dueDate.localeCompare(b.dueDate));

  // Unpaid orders
  const unpaid = printLog.filter(o => (payStatus(o)) !== 'paid' && o.status === 'completed')
    .slice(0, 5);

  // Receivables aging (all non-fully-paid orders)
  const unpaidOrders = printLog.filter(o => payStatus(o) !== 'paid');
  const agingBuckets = { c0_30: { count: 0, amount: 0 }, c31_60: { count: 0, amount: 0 }, c61_90: { count: 0, amount: 0 }, c91plus: { count: 0, amount: 0 } };
  for (const o of unpaidOrders) {
    const owed = Math.max(0, +o.price - (+o.paidAmount || 0));
    if (owed <= 0) continue;
    const age = Math.round((today - new Date(o.date + 'T00:00:00')) / 86400000);
    if (age <= 30)      { agingBuckets.c0_30.count++;   agingBuckets.c0_30.amount   += owed; }
    else if (age <= 60) { agingBuckets.c31_60.count++;  agingBuckets.c31_60.amount  += owed; }
    else if (age <= 90) { agingBuckets.c61_90.count++;  agingBuckets.c61_90.amount  += owed; }
    else                { agingBuckets.c91plus.count++;  agingBuckets.c91plus.amount += owed; }
  }

  const orderCard = (o, badge) => {
    const isUnpaid = payStatus(o) !== 'paid';
    const client = o.clientId ? clients.find(c => c.id === o.clientId) : null;
    const hasPhone = !!(client?.phone || '').trim();
    const reminderBtn = (isUnpaid && hasPhone)
      ? `<button class="btn small ghost" data-act="pay-remind" data-id="${o.id}" title="${escapeHtml(t('pay.remind_btn'))}">💰</button>`
      : '';
    return `
    <div class="dash-order-row">
      <div class="dash-order-info">
        <strong>${escapeHtml(o.project || t('inv.walkin'))}</strong>
        <span class="dash-order-id">${escapeHtml(o.id)}</span>
      </div>
      <div class="dash-order-meta">
        ${badge}
        <span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span>
        <span class="dash-price">${fmtPrice(o.price)}</span>
        ${reminderBtn}
        <button class="btn small" data-act="edit-log" data-id="${o.id}">${escapeHtml(t('common.edit'))}</button>
      </div>
    </div>`;
  };

  const noItems = (key) => `<p class="dash-empty">${escapeHtml(t(key))}</p>`;

  const dashIsAr = i18n.current === 'ar';
  const dashBizPrimary   = dashIsAr ? (settings.bizAr || settings.bizEn) : (settings.bizEn || settings.bizAr);
  const dashBizSecondary = dashIsAr ? (settings.bizEn || '') : (settings.bizAr || '');
  const dashTagline      = dashIsAr ? (settings.taglineAr || settings.taglineEn) : (settings.taglineEn || settings.taglineAr);

  el.innerHTML = `
    <div class="dash-hero">
      <div class="dash-hero-brand">
        <div class="dash-hero-logo">${settings.bizLogo ? `<img src="${settings.bizLogo}" alt="logo">` : BRAND_MARK_SVG}</div>
        <div class="dash-hero-info">
          <div class="dash-hero-name">${escapeHtml(dashBizPrimary || 'Khayt')}</div>
          ${dashBizSecondary ? `<div class="dash-hero-name-sec">${escapeHtml(dashBizSecondary)}</div>` : ''}
          ${dashTagline ? `<div class="dash-hero-tagline">${escapeHtml(dashTagline)}</div>` : ''}
        </div>
      </div>
      <div class="dash-hero-right">
        <span class="dash-greeting">${escapeHtml(t('dash.greeting'))}</span>
        <span class="dash-date">${today.toLocaleDateString(dashIsAr ? 'ar-SA' : 'en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</span>
      </div>
    </div>

    <div class="dash-stats">
      <div class="dash-stat">
        <div class="dash-stat-val">${active.length}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.active_orders'))}</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-val">${overdue.length}</div>
        <div class="dash-stat-lbl dash-stat-overdue">${escapeHtml(t('dash.overdue'))}</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-val">${fmtMoney(todayRev)}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.today_rev'))} <small>${escapeHtml(currencySymbol())}</small></div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-val">${fmtMoney(receivables)}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.receivables'))} <small>${escapeHtml(currencySymbol())}</small></div>
      </div>
      ${awaitingDelivery.length > 0 ? `
      <div class="dash-stat">
        <div class="dash-stat-val">${awaitingDelivery.length}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.awaiting_delivery'))}</div>
      </div>` : ''}
      ${clearDays !== null ? `
      <div class="dash-stat">
        <div class="dash-stat-val">${clearDays}</div>
        <div class="dash-stat-lbl">${escapeHtml(t('dash.clear_days'))}</div>
      </div>` : ''}
    </div>

    ${settings.monthlyGoal > 0 ? (() => {
      const pct = Math.min(100, (monthlyRev / settings.monthlyGoal) * 100);
      const monthName = today.toLocaleDateString(dashIsAr ? 'ar-SA' : 'en-US', { month: 'long' });
      const col = pct >= 100 ? 'var(--success)' : pct >= 60 ? 'var(--primary)' : 'var(--warning)';
      return `
        <div class="dash-goal">
          <div class="dash-goal-top">
            <span class="dash-goal-label">${escapeHtml(monthName)} ${escapeHtml(t('dash.goal'))}</span>
            <span class="dash-goal-nums">${fmtMoney(monthlyRev)} / ${fmtPrice(settings.monthlyGoal)} · ${Math.round(pct)}%</span>
          </div>
          <div class="dash-goal-bar"><div class="dash-goal-fill" style="width:${pct}%; background:${col};"></div></div>
        </div>`;
    })() : ''}

    ${machines.length > 0 ? (() => {
      const activeOrds = printLog.filter(o => o.status !== 'completed' && o.status !== 'quote');
      const WORK_HRS_PER_DAY = 8; // assumed working hours per day for queue depth estimate
      // Feature 1: Per-machine clearance forecast
      const machRows = machines.map(m => {
        const mJobs  = activeOrds.filter(o => o.machineId === m.id);
        const mHrs   = mJobs.reduce((s, o) => s + +o.printTime, 0);
        const estDays = mHrs > 0 ? Math.ceil(mHrs / WORK_HRS_PER_DAY) : 0;
        const clearHtml = estDays > 0
          ? ` · <span style="color:var(--text-muted);">${escapeHtml(t('dash.est_clear', { n: estDays }))}</span>`
          : '';
        return `<div class="dash-mach-row">
          <span class="dash-mach-dot" style="background:${escapeHtml(m.color)};"></span>
          <span class="dash-mach-name">${escapeHtml(m.name)}</span>
          <span class="dash-mach-stat">${mJobs.length} ${escapeHtml(t('dash.mach_jobs'))} · ${mHrs.toFixed(1)} ${escapeHtml(t('common.hours'))}${clearHtml}</span>
        </div>`;
      });
      const unassigned = activeOrds.filter(o => !o.machineId);
      if (unassigned.length > 0) {
        const uHrs = unassigned.reduce((s, o) => s + +o.printTime, 0);
        const uDays = uHrs > 0 ? Math.ceil(uHrs / WORK_HRS_PER_DAY) : 0;
        const uClearHtml = uDays > 0
          ? ` · <span style="color:var(--text-muted);">${escapeHtml(t('dash.est_clear', { n: uDays }))}</span>`
          : '';
        machRows.push(`<div class="dash-mach-row">
          <span class="dash-mach-dot" style="background:var(--text-muted);"></span>
          <span class="dash-mach-name">${escapeHtml(t('dash.unassigned'))}</span>
          <span class="dash-mach-stat">${unassigned.length} ${escapeHtml(t('dash.mach_jobs'))} · ${uHrs.toFixed(1)} ${escapeHtml(t('common.hours'))}${uClearHtml}</span>
        </div>`);
      }
      return `<div class="dash-section" style="margin-bottom:14px;">
        <h3 class="dash-section-head">${escapeHtml(t('dash.machine_load'))}</h3>
        ${machRows.join('')}
      </div>`;
    })() : ''}

    ${(() => {
      const lowSpools = inventory.filter(i => i.weight <= settings.lowStockThreshold);
      if (lowSpools.length === 0) return '';
      return `<div class="dash-low-stock">
        <span class="dash-low-stock-icon">⚠</span>
        <span class="dash-low-stock-label">${escapeHtml(t('dash.low_stock_alert'))}</span>
        <span class="dash-low-stock-items">${lowSpools.map(i =>
          `<span class="dash-low-spool"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escapeHtml(i.color||'#888')};margin-inline-end:4px;vertical-align:middle;"></span>${escapeHtml(i.material)} (${Math.round(i.weight)}g)</span>`
        ).join('')}</span>
      </div>`;
    })()}

    ${(() => {
      const maintMachines = machines.filter(m => {
        const s = machineServiceStatus(m);
        return s.due || s.warning;
      });
      if (maintMachines.length === 0) return '';
      return `<div class="dash-section dash-maint-section">
        <h3 class="dash-section-head" style="color:var(--danger);">🔧 ${escapeHtml(t('dash.maint_title'))} (${maintMachines.length})</h3>
        ${maintMachines.map(m => {
          const s = machineServiceStatus(m);
          const badge = s.due
            ? `<span class="due-badge overdue">${escapeHtml(t('mach.service_due'))}</span>`
            : `<span class="due-badge due-soon">${escapeHtml(t('mach.service_warn'))}</span>`;
          return `<div class="dash-order-row">
            <div class="dash-order-info">
              <span class="machine-dot" style="background:${escapeHtml(m.color)};display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:6px;vertical-align:middle;"></span>
              <strong>${escapeHtml(m.name)}</strong>
              <span class="dash-order-id">${s.hours.toFixed(1)}h since service / ${s.interval}h interval</span>
            </div>
            <div class="dash-order-meta">
              ${badge}
              <button class="btn small primary" data-act="log-service" data-id="${m.id}">${escapeHtml(t('mach.log_service'))}</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    })()}

    ${(() => {
      const sevenDays = new Date(today); sevenDays.setDate(sevenDays.getDate() + 7);
      const dueClients = clients.filter(c => {
        const rec = c.recurring;
        if (!rec?.enabled || !rec.nextDue) return false;
        const nd = new Date(rec.nextDue + 'T00:00:00');
        return nd <= sevenDays;
      }).sort((a, b) => a.recurring.nextDue.localeCompare(b.recurring.nextDue));
      if (dueClients.length === 0) return '';
      return `<div class="dash-section" style="border-left:3px solid var(--primary); padding-inline-start:12px;">
        <h3 class="dash-section-head" style="color:var(--primary);">${escapeHtml(t('dash.recurring_due'))} (${dueClients.length})</h3>
        ${dueClients.map(c => {
          const nd = new Date(c.recurring.nextDue + 'T00:00:00');
          const daysLeft = Math.round((nd - today) / 86400000);
          const badge = daysLeft < 0
            ? `<span class="due-badge overdue">${escapeHtml(t('dash.recurring_overdue'))}</span>`
            : daysLeft === 0
              ? `<span class="due-badge due-today">${escapeHtml(t('dash.recurring_today'))}</span>`
              : `<span class="due-badge due-soon">${escapeHtml(t('dash.recurring_in', { n: daysLeft }))}</span>`;
          const dn = localName(c);
          return `<div class="dash-order-row">
            <div class="dash-order-info">
              <strong>${escapeHtml(dn)}</strong>
              <span class="dash-order-id">${escapeHtml(t('rec.interval.' + (c.recurring.interval || 'monthly')))}</span>
            </div>
            <div class="dash-order-meta">
              ${badge}
              <button class="btn small primary" data-act="cl-quote" data-id="${c.id}">${escapeHtml(t('dash.recurring_start'))}</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    })()}

    ${overdue.length > 0 ? `
    <div class="dash-section">
      <h3 class="dash-section-head overdue-head">${escapeHtml(t('dash.overdue_section'))} (${overdue.length})</h3>
      ${overdue.map(o => orderCard(o, formatDueDateBadge(o.dueDate))).join('')}
    </div>` : ''}

    <div class="dash-section">
      <h3 class="dash-section-head">${escapeHtml(t('dash.due_soon_section'))}</h3>
      ${dueSoon.length > 0 ? dueSoon.map(o => orderCard(o, formatDueDateBadge(o.dueDate))).join('') : noItems('dash.no_due_soon')}
    </div>

    <div class="dash-section">
      <h3 class="dash-section-head">${escapeHtml(t('dash.unpaid_section'))}</h3>
      ${unpaid.length > 0 ? unpaid.map(o => orderCard(o, paymentBadge(o))).join('') : noItems('dash.no_unpaid')}
    </div>

    ${unpaidOrders.length > 0 ? (() => {
      const agingCell = (label, bucket, urgency) => {
        if (bucket.count === 0) return '';
        const col = urgency === 'high' ? 'var(--danger)' : urgency === 'med' ? 'var(--warning)' : 'var(--text-dim)';
        return `<div class="aging-bucket">
          <div class="aging-label">${escapeHtml(label)}</div>
          <div class="aging-count" style="color:${col};">${bucket.count}</div>
          <div class="aging-amount">${fmtPrice(bucket.amount)}</div>
        </div>`;
      };
      return `<div class="dash-section">
        <h3 class="dash-section-head">${escapeHtml(t('dash.aging_title'))}</h3>
        <div class="aging-grid">
          ${agingCell(t('dash.aging_0_30'), agingBuckets.c0_30, 'ok')}
          ${agingCell(t('dash.aging_31_60'), agingBuckets.c31_60, 'low')}
          ${agingCell(t('dash.aging_61_90'), agingBuckets.c61_90, 'med')}
          ${agingCell(t('dash.aging_91plus'), agingBuckets.c91plus, 'high')}
        </div>
      </div>`;
    })() : ''}

    ${expiringQuotes.length > 0 ? `
    <div class="dash-section">
      <h3 class="dash-section-head" style="color:var(--warning);">${escapeHtml(t('dash.expiring_quotes'))} (${expiringQuotes.length})</h3>
      ${expiringQuotes.map(q => {
        const daysLeft = Math.round((new Date(q.quoteExpiresAt + 'T00:00:00') - today0) / 86400000);
        const badge = daysLeft < 0
          ? `<span class="due-badge overdue">${escapeHtml(t('quote.expired'))}</span>`
          : `<span class="due-badge due-soon">${escapeHtml(t('quote.expires_in', { n: daysLeft }))}</span>`;
        return orderCard(q, badge);
      }).join('')}
    </div>` : ''}

    <div class="dash-quick">
      <button class="btn primary" data-act="goto-tab" data-tab="calculator-tab" data-i18n="tab.calculator">Calculator</button>
      <button class="btn" data-act="goto-tab" data-tab="queue-tab" data-i18n="tab.queue">Production Queue</button>
      <button class="btn" data-act="goto-tab" data-tab="logs-tab" data-i18n="tab.logs">Orders Log</button>
    </div>
  `;

  // Wire the edit-log and goto-tab buttons inside the dashboard
  el.querySelectorAll('[data-act="edit-log"]').forEach(btn =>
    btn.addEventListener('click', () => openOrderEditor(btn.dataset.id))
  );
  el.querySelectorAll('[data-act="goto-tab"]').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );
}

function renderKanban() {
  // --- Quotes awaiting approval ---
  const quotes = printLog.filter(o => o.status === 'quote');
  const quotesSec = $('#quotesSection');
  if (quotesSec) {
    quotesSec.style.display = quotes.length > 0 ? '' : 'none';
    const qCount = $('#count-quote');
    if (qCount) qCount.textContent = quotes.length;
    const ql = $('#list-quote');
    if (ql) {
      ql.innerHTML = quotes.map(q => {
        const today0 = new Date(); today0.setHours(0,0,0,0);
        const expiresIn = q.quoteExpiresAt
          ? Math.round((new Date(q.quoteExpiresAt + 'T00:00:00') - today0) / 86400000)
          : null;
        const expiryHtml = expiresIn !== null
          ? (expiresIn < 0
            ? `<span class="due-badge overdue">${escapeHtml(t('quote.expired'))}</span>`
            : `<span class="due-badge ${expiresIn <= 2 ? 'due-soon' : 'due-ok'}">${escapeHtml(t('quote.expires_in', { n: expiresIn }))}</span>`)
          : '';
        return `
          <div class="quote-card">
            <div class="quote-main">
              <div class="quote-title">${q.priority ? `<span class="priority-badge">!</span> ` : ''}${escapeHtml(q.project || q.id)}</div>
              <div class="quote-meta">${escapeHtml(q.id)} · ${fmtPrice(q.price)} ${expiryHtml}</div>
            </div>
            <div class="quote-actions">
              <button class="btn small success" data-act="approve-quote" data-id="${q.id}">${escapeHtml(t('quote.approve'))}</button>
              <button class="btn small" data-act="share-quote" data-id="${q.id}">${escapeHtml(t('quote.share_pdf'))}</button>
              <button class="btn danger small" data-act="reject-quote" data-id="${q.id}">${escapeHtml(t('quote.reject'))}</button>
            </div>
          </div>`;
      }).join('');
    }
  }

  // --- Production columns (exclude quotes) ---
  const cols = { pending: [], on_hold: [], printing: [], post: [], completed: [] };
  printLog.filter(o => o.status !== 'quote').forEach(o => { if (cols[o.status]) cols[o.status].push(o); });

  Object.entries(cols).forEach(([status, items]) => {
    // For pending: sort by queuePos (Feature 7), then priority
    const sorted = status === 'pending'
      ? [...items].sort((a, b) => {
          if ((b.priority ? 1 : 0) !== (a.priority ? 1 : 0)) return (b.priority ? 1 : 0) - (a.priority ? 1 : 0);
          return (a.queuePos || 9999) - (b.queuePos || 9999);
        })
      : [...items].sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0));
    const countEl = $('#count-' + status);
    if (countEl) countEl.textContent = sorted.length;

    // Column totals meta line
    const totalHrs = sorted.reduce((s, o) => s + (+o.printTime || 0), 0);
    const totalVal = sorted.reduce((s, o) => s + (+o.price || 0), 0);
    const metaEl = $('#meta-' + status);
    if (metaEl) {
      metaEl.textContent = sorted.length > 0
        ? `${totalHrs.toFixed(1)} ${t('common.hours')} · ${fmtPrice(totalVal)}`
        : '';
    }

    const container = $('#list-' + status);
    if (sorted.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:20px 8px;">${escapeHtml(t('queue.empty'))}</div>`;
      return;
    }
    container.innerHTML = sorted.map(log => {
      let actions = '';
      const notifyBtn = `<button class="btn small ghost" data-act="wa-quick" data-id="${log.id}" title="${escapeHtml(t('queue.notify'))}">📲</button>`;
      const woBtn = `<button class="btn small ghost" data-act="wo-kanban" data-id="${log.id}" title="${escapeHtml(t('wo.title'))}">WO</button>`;
      if (status === 'pending') {
        const qIdx = sorted.indexOf(log);
        const queueControls = `<span class="queue-pos-ctrl">
          ${qIdx > 0 ? `<button data-act="q-up" data-id="${log.id}" title="${escapeHtml(t('queue.move_up'))}">▲</button>` : ''}
          ${qIdx < sorted.length - 1 ? `<button data-act="q-down" data-id="${log.id}" title="${escapeHtml(t('queue.move_down'))}">▼</button>` : ''}
        </span>`;
        // Feature 1: Per-machine ETA — only sum hours from same machine's queue
        let hrsBefore = 0;
        if (log.machineId) {
          // Only count prior jobs on the same machine
          hrsBefore = sorted.slice(0, qIdx)
            .filter(o => o.machineId === log.machineId)
            .reduce((s, o) => s + (+o.printTime || 0), 0);
        } else {
          // Unassigned: pool all preceding unassigned jobs
          hrsBefore = sorted.slice(0, qIdx)
            .filter(o => !o.machineId)
            .reduce((s, o) => s + (+o.printTime || 0), 0);
        }
        const estStart = hrsBefore > 0 ? `<span class="est-start-badge">${escapeHtml(t('queue.est_start'))}: +${hrsBefore.toFixed(1)}h</span>` : '';
        const holdBtn = `<button class="btn small ghost" data-act="hold-order" data-id="${log.id}" title="${escapeHtml(t('ord.hold_btn'))}" style="color:var(--warning);">⏸</button>`;
        actions = `${queueControls}<button class="btn small primary" data-act="status" data-id="${log.id}" data-to="printing">${escapeHtml(t('queue.start'))}</button>${holdBtn}${estStart}${woBtn}${notifyBtn}`;
      }
      if (status === 'on_hold') {
        const holdReason = log.holdReason ? `<div style="font-size:11px; color:var(--warning); margin-top:2px;">⏸ ${escapeHtml(log.holdReason)}</div>` : '';
        actions = `<button class="btn small primary" data-act="status" data-id="${log.id}" data-to="pending">${escapeHtml(t('ord.unhold_btn'))}</button>${woBtn}${notifyBtn}`;
      }
      if (status === 'printing')  actions = `<button class="btn small" data-act="status" data-id="${log.id}" data-to="post">${escapeHtml(t('queue.to_post'))}</button>${woBtn}${notifyBtn}`;
      if (status === 'post')      actions = `<button class="btn small success" data-act="status" data-id="${log.id}" data-to="completed">${escapeHtml(t('queue.complete'))}</button>${woBtn}${notifyBtn}`;
      if (status === 'completed') {
        const deliverBtn = log.deliveredAt
          ? `<span style="font-size:11px;color:var(--success);">✓ ${escapeHtml(t('queue.delivered'))}</span>`
          : `<button class="btn small success" data-act="mark-delivered" data-id="${log.id}">${escapeHtml(t('queue.mark_delivered'))}</button>`;
        actions = `<button class="btn small" data-act="invoice" data-id="${log.id}">${escapeHtml(t('queue.invoice'))}</button>${deliverBtn}${notifyBtn}`;
      }
      const partCount = log.parts ? log.parts.length : 1;
      const partsLabel = partCount === 1 ? t('queue.parts_count_1') : t('queue.parts_count', { n: partCount });
      const machine = log.machineId ? machines.find(m => m.id === log.machineId) : null;
      const machineBadge = machine
        ? `<span class="machine-badge${machine.isOffline ? ' mach-offline' : ''}" style="background:${escapeHtml(machine.color)};">${machine.isOffline ? '⚠ ' : ''}${escapeHtml(machine.name)}</span>`
        : '';
      // Live timer badge for printing orders
      let timerBadge = '';
      if (status === 'printing' && log.timerStart) {
        const elapsed = Math.floor((Date.now() - new Date(log.timerStart).getTime()) / 60000);
        const hrs = Math.floor(elapsed / 60);
        const mins = elapsed % 60;
        const elapsedStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        const expected = +log.printTime * 60;
        const isOver = elapsed > expected;
        timerBadge = `<span class="timer-badge${isOver ? ' timer-over' : ''}">⏱ ${escapeHtml(elapsedStr)}${isOver ? ' ⚠' : ''}</span>`;
      }
      // Post-processing checklist (shown only in 'post' column)
      let postCheckHtml = '';
      if (status === 'post' && settings.postChecklist && settings.postChecklist.length > 0) {
        const checks = log.postChecks || {};
        const doneCount = settings.postChecklist.filter(ch => checks[ch.id]).length;
        postCheckHtml = `
          <div class="post-checklist">
            <div class="post-checklist-header">
              <span>${escapeHtml(t('post.checklist'))}</span>
              <span class="post-check-count">${doneCount}/${settings.postChecklist.length}</span>
            </div>
            ${settings.postChecklist.map(ch => `
              <label class="post-check-item${checks[ch.id] ? ' done' : ''}">
                <input type="checkbox" class="post-check-cb" data-order="${log.id}" data-check="${ch.id}" ${checks[ch.id] ? 'checked' : ''}>
                <span>${escapeHtml(ch.label)}</span>
              </label>`).join('')}
          </div>`;
      }
      return `
        <div class="kanban-card${log.priority ? ' kanban-priority' : ''}">
          <h4>${log.priority ? `<span class="priority-badge">!</span> ` : ''}${escapeHtml(log.project)}${machineBadge}</h4>
          <div class="meta">
            <span class="price">${fmtPrice(log.price)}</span>
            <span>·</span>
            <span>${log.printTime} ${escapeHtml(t('common.hours'))}</span>
            <span>·</span>
            <span>${escapeHtml(partsLabel)}</span>
          </div>
          ${(() => { const refs = (log.parts || []).map(p => p.fileRef).filter(Boolean); return refs.length > 0 ? `<div class="part-file-ref" style="margin-top:2px;">📎 ${escapeHtml(refs.join(', '))}</div>` : ''; })()}
          <div class="order-meta-row">${paymentBadge(log)}${log.dueDate && status !== 'completed' ? ' ' + formatDueDateBadge(log.dueDate) : ''}${timerBadge}</div>
          ${status === 'on_hold' && log.holdReason ? `<div style="font-size:11px; color:var(--warning); margin-top:3px;">⏸ ${escapeHtml(log.holdReason)}</div>` : ''}
          ${(log.tags && log.tags.length > 0) ? `<div class="kanban-tags">${renderTagChips(log.tags)}</div>` : ''}
          ${postCheckHtml}
          ${log.parts && log.parts.length > 0 ? `
          <div class="part-status-list">
            ${log.parts.map((p, i) => {
              const ps = p.partStatus || 'pending';
              return `<div class="part-status-row">
                <span class="part-status-dot ${escapeHtml(ps)}"
                      data-act="toggle-part-status"
                      data-order-id="${log.id}"
                      data-part-index="${i}"
                      title="${escapeHtml(t('kan.parts_status'))}"></span>
                <span class="part-status-name">${escapeHtml(p.name || 'Part ' + (i + 1))}</span>
                <span class="part-status-badge ${escapeHtml(ps)}">${escapeHtml(t('kan.part_' + ps) || ps)}</span>
              </div>`;
            }).join('')}
          </div>` : ''}
          <div class="actions">${actions}</div>
        </div>`;
    }).join('');
  });

  // Auto-refresh kanban every 60 s while any job is actively printing (for live timer)
  const hasPrinting = printLog.some(o => o.status === 'printing' && o.timerStart);
  if (hasPrinting) {
    if (!kanbanTimerInterval) {
      kanbanTimerInterval = setInterval(() => renderKanban(), 60000);
    }
  } else {
    if (kanbanTimerInterval) {
      clearInterval(kanbanTimerInterval);
      kanbanTimerInterval = null;
    }
  }
}

function renderLogs() {
  const tbody = $('#logTable tbody');
  // Repopulate tag filter dropdown with all existing tags
  const tagSel = $('#logTagFilter');
  if (tagSel) {
    const allTags = getAllTags();
    const curTag = tagSel.value;
    tagSel.innerHTML = `<option value="">${escapeHtml(t('tag.all'))}</option>` +
      allTags.map(tg => `<option value="${escapeHtml(tg)}"${tg === curTag ? ' selected' : ''}>${escapeHtml(tg)}</option>`).join('');
  }
  const filtered = getFilteredLogs();

  if (printLog.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${escapeHtml(t('log.empty'))}</td></tr>`;
    return;
  }
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${escapeHtml(t('log.empty_search'))}</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(log => {
    const ps = payStatus(log);
    const isPaid = ps === 'paid';
    const photoCount = (log.printPhotos || []).length;
    const fileCount  = (log.attachedFiles || []).length;
    const isOverdue = log.dueDate && log.status !== 'completed' && new Date(log.dueDate + 'T00:00:00') < new Date(new Date().setHours(0,0,0,0));
    const isSel = selectedOrders.has(log.id);
    return `
    <tr${isOverdue ? ' class="row-overdue"' : ''}${isSel ? ' style="background:rgba(91,156,240,0.07);"' : ''}>
      <td style="width:32px;padding:8px 6px;"><input type="checkbox" class="log-sel" data-id="${log.id}" style="width:auto;" ${isSel ? 'checked' : ''}></td>
      <td style="font-family: var(--font-num); font-size: 12px; color: var(--text-dim); white-space:nowrap;">${escapeHtml(log.date)}</td>
      <td>
        ${log.priority ? `<span class="priority-badge" style="margin-inline-end:5px;">!</span>` : ''}<strong>${escapeHtml(log.project)}</strong>${log.dueDate && log.status !== 'completed' ? ' ' + formatDueDateBadge(log.dueDate) : ''}
        ${(log.tags && log.tags.length > 0) ? `<div style="margin-top:3px;">${renderTagChips(log.tags, true)}</div>` : ''}
        <div style="font-family: var(--font-num); font-size: 11.5px; color: var(--text-muted);">${escapeHtml(log.id)}${photoCount ? ` · ${photoCount}📷` : ''}${fileCount ? ` · ${fileCount}📎` : ''}${log.notes ? ' · 📝' : ''}</div>
      </td>
      <td>
        <span class="badge ${escapeHtml(log.status)}">${escapeHtml(t('queue.' + log.status))}</span>${log.deliveredAt ? ` <span style="font-size:10px; color:var(--success);">✓ ${escapeHtml(t('queue.delivered'))}</span>` : ''}
        ${log.status === 'completed' && log.completedAt ? `<div style="font-size:10.5px; color:var(--text-muted); margin-top:2px;">✓ ${escapeHtml(t('ord.completed_at'))}: ${escapeHtml(new Date(log.completedAt).toLocaleDateString())}</div>` : ''}
      </td>
      <td>${paymentBadge(log)}</td>
      <td style="font-size: 12.5px; color: var(--text-dim);">${escapeHtml(log.material)}</td>
      <td style="color: var(--success); font-weight: 600; font-variant-numeric: tabular-nums; white-space:nowrap;">${fmtPrice(log.price)}</td>
      <td style="white-space:nowrap;">
        ${expenses.some(e => e.orderId === log.id) ? `<button class="btn small ghost" data-act="linked-expenses" data-id="${log.id}" title="${escapeHtml(t('exp.linked_expenses'))}">💰</button>` : ''}
        ${(() => { const linkedWaste = wasteLog.filter(w => w.orderId === log.id); const wCost = linkedWaste.reduce((s, w) => s + (+w.cost || 0), 0); return linkedWaste.length > 0 ? `<span title="${escapeHtml(t('waste.linked_cost'))}: ${fmtPrice(wCost)}" style="font-size:10.5px; color:var(--danger); cursor:default;">🗑 ${fmtPrice(wCost)}</span>` : ''; })()}
        ${log.clientId ? clients.find(c => c.id === log.clientId)?.email ? '' : '' : ''}
        <button class="btn small ghost" data-act="export-status-page" data-id="${log.id}" title="${escapeHtml(t('ord.status_page'))}">📄</button>
        ${(() => { const cl = log.clientId ? clients.find(c => c.id === log.clientId) : null; return cl?.email ? `<button class="btn small ghost" data-act="${log.status === 'quote' ? 'email-quote' : 'email-invoice'}" data-id="${log.id}" title="${escapeHtml(t(log.status === 'quote' ? 'ord.email_quote' : 'ord.email_invoice'))}">✉️</button>` : ''; })()}
        <button class="btn small ${isPaid ? '' : 'primary'}" data-act="${isPaid ? 'unpay' : 'pay'}" data-id="${log.id}" title="${escapeHtml(isPaid ? t('pay.mark_unpaid') : t('pay.mark_paid'))}">${escapeHtml(isPaid ? '✓' : t('pay.mark_paid'))}</button>
        <button class="btn small" data-act="invoice"   data-id="${log.id}" title="${escapeHtml(t('inv.print'))}">${escapeHtml(t('inv.print'))}</button>
        <button class="btn small" data-act="inv-pdf"   data-id="${log.id}" title="${escapeHtml(t('inv.save_pdf'))}">PDF</button>
        <button class="btn small" data-act="inv-wa"    data-id="${log.id}" title="${escapeHtml(t('inv.share_whatsapp'))}">WA</button>
        <button class="btn small ghost" data-act="dn-log" data-id="${log.id}" title="${escapeHtml(t('dn.print'))}">DN</button>
        <button class="btn small ghost" data-act="cn-log" data-id="${log.id}" title="${escapeHtml(t('cn.title'))}">CN</button>
        <button class="btn small ghost" data-act="wo-log" data-id="${log.id}" title="${escapeHtml(t('wo.title'))}">WO</button>
        <button class="btn small" data-act="edit-log"  data-id="${log.id}" title="${escapeHtml(t('common.edit'))}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn small" data-act="dup-log"    data-id="${log.id}" title="${escapeHtml(t('oe.duplicate'))}">${escapeHtml(t('oe.duplicate'))}</button>
        <button class="btn small ghost" data-act="reprint-log" data-id="${log.id}" title="${escapeHtml(t('oe.reprint'))}">${escapeHtml(t('oe.reprint'))}</button>
        ${!isPaid ? `<button class="btn small ghost" data-act="pay-remind" data-id="${log.id}" title="${escapeHtml(t('pay.remind_btn'))}">💰</button>` : ''}
        ${log.trackingNumber ? `<button class="btn small ghost" data-act="share-tracking" data-id="${log.id}" title="${escapeHtml(t('ship.tracking_share'))}">📦</button>` : ''}
        <button class="btn danger small" data-act="del-log" data-id="${log.id}">${escapeHtml(t('common.delete'))}</button>
      </td>
    </tr>`;
  }).join('');
}

/* ============================================================
   Batch order actions (logs tab)
   ============================================================ */
function renderBatchBar() {
  const bar = $('#batchBar');
  if (!bar) return;
  const count = selectedOrders.size;
  if (count === 0) {
    bar.style.display = 'none';
    const selAll = $('#logSelectAll');
    if (selAll) selAll.checked = false;
  } else {
    bar.style.display = 'flex';
    const countEl = $('#batchCount');
    if (countEl) countEl.textContent = t('batch.selected', { n: count });
  }
}

async function batchExportPDFs() {
  const ids = [...selectedOrders];
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i++) {
    toast(t('batch.exporting', { n: i + 1, total: ids.length }), 'info', 1600);
    await exportInvoicePDF(ids[i], { askWhere: false, openAfter: false });
    await new Promise(r => setTimeout(r, 120));
  }
  toast(t('batch.done', { n: ids.length }), 'success');
}

function batchWaSend() {
  const ids = [...selectedOrders];
  if (ids.length === 0) return;
  if (waTemplates.length === 0) { toast(t('wa.no_templates'), 'info'); return; }
  const tplOptions = waTemplates.map((tpl, i) =>
    `<option value="${i}">${escapeHtml(tpl.name)}</option>`).join('');
  const ordersHtml = ids.map(id => {
    const o = printLog.find(x => x.id === id);
    if (!o) return '';
    const client = o.clientId ? clients.find(c => c.id === o.clientId) : null;
    const name = client ? (localName(client)) : (o.project || '');
    return `<div style="font-size:12px;color:var(--text-dim);padding:2px 0;">${escapeHtml(o.id)} — ${escapeHtml(name)} — ${fmtPrice(o.price)}</div>`;
  }).join('');
  openFormModal({
    title: `${t('batch.wa_all')} (${ids.length})`,
    saveLabel: t('wa.open_btn'),
    bodyHtml: `
      <label>${escapeHtml(t('wa.template'))}</label>
      <select id="batchWaTplSelect">${tplOptions}</select>
      <div style="margin-top:10px; padding:8px 10px; background:var(--surface-2); border-radius:var(--radius-sm); max-height:110px; overflow-y:auto;">${ordersHtml}</div>
      <p style="font-size:11.5px;color:var(--text-muted);margin:8px 0 0;">${escapeHtml(t('batch.wa_hint'))}</p>`,
    async onSave(modal) {
      const tpl = waTemplates[+modal.querySelector('#batchWaTplSelect').value];
      if (!tpl) return true;
      for (const id of ids) {
        const order = printLog.find(o => o.id === id);
        if (!order) continue;
        const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
        const msg = fillWaTemplate(tpl.body, order, client);
        if (window.hubAPI?.shareWhatsApp) {
          await window.hubAPI.shareWhatsApp({ phone: client?.phone || '', message: msg, pdfPath: null });
          await new Promise(r => setTimeout(r, 250));
        }
      }
      return true;
    }
  });
}

function batchMoveStatus() {
  const status = $('#batchStatusSelect')?.value;
  if (!status) { toast(t('batch.move_to_hint'), 'info'); return; }
  const ids = [...selectedOrders];
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  for (const id of ids) {
    const o = printLog.find(x => x.id === id);
    if (o) {
      o.status = status;
      if (!o.statusHistory) o.statusHistory = [];
      o.statusHistory.push({ status, at: now });
    }
  }
  saveAll();
  selectedOrders.clear();
  renderBatchBar();
  renderKanban();
  renderLogs();
  renderDashboard();
  toast(t('batch.moved', { n: ids.length }), 'success');
}

/* ============================================================
   Filament performance analytics
   ============================================================ */
function renderFilamentAnalytics() {
  const el = $('#filamentPerfSection');
  if (!el) return;

  const agg = {};
  printLog
    .filter(o => o.status === 'completed')
    .forEach(o => {
      const parts = o.parts || [];
      if (parts.length === 0) return;
      const totalBase = parts.reduce((s, p) => s + (+p.baseCost || 0), 0);
      parts.forEach(p => {
        const key = p.filamentId || p.material || 'unknown';
        const filItem = inventory.find(i => i.id === p.filamentId);
        const label = p.material || filItem?.material || key;
        if (!agg[key]) agg[key] = { label, color: filItem?.color || '#888', orderIds: new Set(), revenue: 0, matCost: 0, timePerGrams: [] };

        agg[key].orderIds.add(o.id);

        const revShare = totalBase > 0 ? (+p.baseCost / totalBase) * +o.price : +o.price / parts.length;
        agg[key].revenue += revShare;

        const spoolC = +p.spoolCost || 0;
        const spoolW = Math.max(1, +p.spoolWeight || 1000);
        const pw = +p.printWeight || 0;
        agg[key].matCost += (spoolC / spoolW) * pw;

        if (o.actualPrintTime != null && o.actualWeight != null && o.actualWeight > 0 && o.printTime > 0) {
          const timeShare = (p.printTime / o.printTime) * o.actualPrintTime;
          const weightShare = pw > 0 ? pw : o.actualWeight / parts.length;
          if (weightShare > 0) agg[key].timePerGrams.push(timeShare / weightShare);
        }
      });
    });

  const rows = Object.values(agg).sort((a, b) => b.revenue - a.revenue);
  if (rows.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.filament_no_data'))}</p>`;
    return;
  }

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${escapeHtml(t('inv.material'))}</th>
          <th>${escapeHtml(t('an.filament_orders'))}</th>
          <th>${escapeHtml(t('an.revenue'))}</th>
          <th>${escapeHtml(t('an.filament_margin'))}</th>
          <th>${escapeHtml(t('an.filament_time_pg'))}</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const margin = r.revenue > 0 ? ((r.revenue - r.matCost) / r.revenue * 100) : 0;
            const avgTPG = r.timePerGrams.length > 0
              ? r.timePerGrams.reduce((s, v) => s + v, 0) / r.timePerGrams.length
              : null;
            const mCol = margin >= 60 ? 'var(--success)' : margin >= 30 ? 'var(--primary)' : 'var(--warning)';
            return `<tr>
              <td style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escapeHtml(r.color)};flex-shrink:0;border:1px solid rgba(255,255,255,0.15);"></span>
                <strong>${escapeHtml(r.label)}</strong>
              </td>
              <td style="font-variant-numeric:tabular-nums;">${r.orderIds.size}</td>
              <td style="font-variant-numeric:tabular-nums;color:var(--success);">${fmtPrice(r.revenue)}</td>
              <td style="font-weight:600;color:${mCol};">${margin.toFixed(0)}%</td>
              <td style="color:var(--text-dim);">${avgTPG != null ? (avgTPG * 100).toFixed(2) + ' ' + escapeHtml(t('common.hours')) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   Product pricing tier chips (calculator)
   ============================================================ */
function renderProductTierChips(product) {
  const strip = $('#priceTiersStrip');
  if (!strip) return;
  if (!product?.priceTiers || product.priceTiers.length === 0) {
    strip.style.display = 'none';
    return;
  }
  strip.style.display = 'flex';
  strip.innerHTML = `
    <span style="font-size:12px;color:var(--text-muted);align-self:center;">${escapeHtml(t('cat.pick_tier'))}</span>
    ${product.priceTiers.map(tier => `
      <button class="tier-chip" data-margin="${+tier.margin}" data-act="pick-tier">
        ${escapeHtml(tier.label)} <span class="tier-margin">${tier.margin}%</span>
      </button>`).join('')}`;
  strip.querySelectorAll('[data-act="pick-tier"]').forEach(btn => {
    btn.addEventListener('click', () => {
      $('#margin').value = btn.dataset.margin;
      updateGrandTotal();
      strip.querySelectorAll('.tier-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

/* ============================================================
   Reorder reminder (inventory low-stock)
   ============================================================ */
function createPurchaseOrder(item) {
  const po = {
    id: uid('PO'),
    itemId: item.id,
    itemName: item.material,
    supplierId: null,
    supplierName: '',
    qty: 1,
    status: 'ordered',
    orderedAt: new Date().toISOString().split('T')[0],
    receivedAt: null,
    notes: '',
  };
  purchaseOrders.unshift(po);
  saveAll();
  renderPurchaseOrders();
  toast(t('po.created_toast'), 'success');
}

function renderPurchaseOrders() {
  const sec = $('#poSection');
  if (!sec) return;
  const relevant = purchaseOrders.slice(); // all POs for now
  sec.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <h3 class="card-head" style="margin:0; flex:1;"><span class="swatch"></span><span>${escapeHtml(t('po.title'))}</span></h3>
    </div>
    ${relevant.length === 0
      ? `<p style="color:var(--text-muted); font-size:13px;">${escapeHtml(t('po.empty'))}</p>`
      : `<div class="table-wrap"><table class="po-table">
          <thead><tr>
            <th>${escapeHtml(t('po.item'))}</th>
            <th>${escapeHtml(t('po.supplier'))}</th>
            <th>${escapeHtml(t('po.ordered_at'))}</th>
            <th>${escapeHtml(t('po.status'))}</th>
            <th></th>
          </tr></thead>
          <tbody>
          ${relevant.map(po => `
            <tr>
              <td><strong>${escapeHtml(po.itemName || po.id)}</strong></td>
              <td style="color:var(--text-dim);">${escapeHtml(po.supplierName || '—')}</td>
              <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(po.orderedAt || '')}</td>
              <td><span class="po-badge ${escapeHtml(po.status)}">${escapeHtml(t('po.status.' + po.status))}</span></td>
              <td style="white-space:nowrap;">
                ${po.status === 'ordered' ? `<button class="btn small success" data-act="po-receive" data-id="${po.id}">${escapeHtml(t('po.receive'))}</button>` : `<span style="font-size:11px; color:var(--text-muted);">${escapeHtml(po.receivedAt || '')}</span>`}
                <button class="btn danger small" data-act="po-del" data-id="${po.id}" style="margin-inline-start:4px;">×</button>
              </td>
            </tr>`).join('')}
          </tbody></table></div>`
    }`;
}

function openReorderModal(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const defaultMsg = t('inv.reorder_msg', { material: item.material, weight: Math.round(item.weight) });
  openFormModal({
    title: t('inv.reorder_title'),
    saveLabel: t('wa.open_btn'),
    sizeLg: false,
    bodyHtml: `
      <label>${escapeHtml(t('set.supplier_phone'))}</label>
      <input type="tel" id="reorderPhone" value="${escapeHtml(settings.supplierPhone || '')}" data-i18n-placeholder="set.supplier_ph">
      <label style="margin-top:12px;">${escapeHtml(t('wa.tpl_body'))}</label>
      <textarea id="reorderMsg" rows="4" style="resize:vertical;">${escapeHtml(defaultMsg)}</textarea>`,
    async onSave(modal) {
      const phone = modal.querySelector('#reorderPhone').value.trim();
      const msg   = modal.querySelector('#reorderMsg').value;
      if (phone && phone !== settings.supplierPhone) {
        settings.supplierPhone = phone;
        saveAll();
        const el = $('#set_supplierPhone');
        if (el) el.value = phone;
      }
      if (window.hubAPI?.shareWhatsApp) {
        await window.hubAPI.shareWhatsApp({ phone, message: msg, pdfPath: null });
      }
      // Also create a purchase order automatically
      createPurchaseOrder(item);
      return true;
    }
  });
}

function renderAnalytics() {
  const orders = printLog.filter(o => inRange(o.date, analyticsRange, 'analytics'));
  const completed = orders.filter(o => o.status === 'completed');
  const revenue = completed.reduce((s, o) => s + +o.price, 0);
  const hours   = orders.reduce((s, o) => s + +o.printTime, 0);
  const inProgress = orders.filter(o => o.status !== 'completed' && o.status !== 'pending').length;
  // Receivables — outstanding amount across all unpaid/partial orders, regardless of status
  const receivables = printLog
    .filter(o => (payStatus(o)) !== 'paid')
    .reduce((s, o) => s + Math.max(0, +o.price - (+o.paidAmount || 0)), 0);

  $('#stat-revenue').textContent = fmtMoney(revenue);
  $('#stat-orders').textContent  = completed.length;
  $('#stat-hours').textContent   = hours.toFixed(1);
  $('#stat-pending').textContent = inProgress;
  const recEl = $('#stat-receivables');
  if (recEl) recEl.textContent = fmtMoney(receivables);

  // Quote conversion rate
  const quotesCreated   = printLog.filter(o => o.quoteSentAt   && inRange(o.quoteSentAt,   analyticsRange, 'analytics'));
  const quotesConverted = printLog.filter(o => o.quoteAcceptedAt && inRange(o.quoteAcceptedAt, analyticsRange, 'analytics'));
  const convRate = quotesCreated.length > 0 ? Math.round(quotesConverted.length / quotesCreated.length * 100) : null;
  const qcEl = $('#stat-quotes-created');
  if (qcEl) qcEl.textContent = quotesCreated.length;
  const crEl = $('#stat-conv-rate');
  if (crEl) crEl.textContent = convRate !== null ? `${convRate}%` : '—';

  // Top products
  const productAgg = {};
  orders.forEach(o => {
    if (!o.productId) return;
    productAgg[o.productId] = productAgg[o.productId] || { count: 0, revenue: 0 };
    productAgg[o.productId].count++;
    if (o.status === 'completed') productAgg[o.productId].revenue += +o.price;
  });
  const topProducts = Object.entries(productAgg)
    .map(([id, agg]) => {
      const p = products.find(x => x.id === id);
      const name = p ? (localName(p)) : id;
      return { name, ...agg };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const tpList = $('#topProductsList');
  if (topProducts.length === 0) {
    tpList.innerHTML = `<li><span class="rank">—</span><span class="name" style="color: var(--text-muted);">${escapeHtml(t('an.no_top_products'))}</span></li>`;
  } else {
    tpList.innerHTML = topProducts.map((p, i) => `
      <li>
        <span class="rank">${i + 1}.</span>
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="value">${p.count}× · ${fmtPrice(p.revenue)}</span>
      </li>`).join('');
  }

  // Top clients
  const clientAgg = {};
  completed.forEach(o => {
    if (!o.clientId) return;
    clientAgg[o.clientId] = clientAgg[o.clientId] || { count: 0, revenue: 0 };
    clientAgg[o.clientId].count++;
    clientAgg[o.clientId].revenue += +o.price;
  });
  const topClients = Object.entries(clientAgg)
    .map(([id, agg]) => {
      const c = clients.find(x => x.id === id);
      const name = c ? (localName(c)) : id;
      return { name, ...agg };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const tcList = $('#topClientsList');
  if (topClients.length === 0) {
    tcList.innerHTML = `<li><span class="rank">—</span><span class="name" style="color: var(--text-muted);">${escapeHtml(t('an.no_top_clients'))}</span></li>`;
  } else {
    tcList.innerHTML = topClients.map((c, i) => `
      <li>
        <span class="rank">${i + 1}.</span>
        <span class="name">${escapeHtml(c.name)}</span>
        <span class="value">${fmtPrice(c.revenue)} · ${c.count}×</span>
      </li>`).join('');
  }

  // Recent activity
  const ul = $('#activityList');
  if (orders.length === 0) {
    ul.innerHTML = `<li>${escapeHtml(t('an.no_activity'))}</li>`;
  } else {
    ul.innerHTML = orders.slice(0, 8).map(log => `
      <li>
        <span class="date">${escapeHtml(log.date)}</span>
        <span><strong>${escapeHtml(log.project)}</strong> · <span class="badge ${escapeHtml(log.status)}">${escapeHtml(t('queue.' + log.status))}</span></span>
      </li>`).join('');
  }

  // Accuracy section
  const accuracyEl = $('#accuracySection');
  if (accuracyEl) {
    const withActuals = completed.filter(o => o.actualPrintTime != null);
    if (withActuals.length === 0) {
      accuracyEl.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.accuracy_none'))}</p>`;
    } else {
      const sign = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
      const col  = v => Math.abs(v) <= 10 ? 'var(--success)' : Math.abs(v) <= 25 ? 'var(--warning)' : 'var(--danger)';
      const avgTimeVar = withActuals.reduce((s, o) =>
        s + (o.printTime > 0 ? (o.actualPrintTime - o.printTime) / o.printTime * 100 : 0), 0) / withActuals.length;
      const withWeight = withActuals.filter(o => o.actualWeight != null);
      const estW = o => (o.parts || []).reduce((s, p) => s + (+p.printWeight || 0) * (p.qty || 1), 0);
      const avgWeightVar = withWeight.length > 0
        ? withWeight.reduce((s, o) => {
            const e = estW(o);
            return s + (e > 0 ? (o.actualWeight - e) / e * 100 : 0);
          }, 0) / withWeight.length
        : null;

      accuracyEl.innerHTML = `
        <div class="accuracy-stats">
          <div class="accuracy-stat">
            <div class="v" style="color:${col(avgTimeVar)}">${sign(avgTimeVar)}</div>
            <div class="l">${escapeHtml(t('an.time_accuracy'))}</div>
            <div class="hint">${escapeHtml(t('an.accuracy_based_on', { n: withActuals.length }))}</div>
          </div>
          ${avgWeightVar !== null ? `
          <div class="accuracy-stat">
            <div class="v" style="color:${col(avgWeightVar)}">${sign(avgWeightVar)}</div>
            <div class="l">${escapeHtml(t('an.weight_accuracy'))}</div>
            <div class="hint">${escapeHtml(t('an.accuracy_based_on', { n: withWeight.length }))}</div>
          </div>` : ''}
        </div>
        <div class="table-wrap" style="margin-top:12px;">
          <table>
            <thead><tr>
              <th>${escapeHtml(t('log.client'))}</th>
              <th>${escapeHtml(t('an.est_time'))}</th>
              <th>${escapeHtml(t('an.act_time'))}</th>
              <th>${escapeHtml(t('an.variance'))}</th>
            </tr></thead>
            <tbody>
              ${withActuals.slice(0, 8).map(o => {
                const diff = o.printTime > 0 ? (o.actualPrintTime - o.printTime) / o.printTime * 100 : 0;
                return `<tr>
                  <td>${escapeHtml(o.project || o.id)}</td>
                  <td style="color:var(--text-dim);">${o.printTime} ${escapeHtml(t('common.hours'))}</td>
                  <td style="color:var(--text-dim);">${o.actualPrintTime} ${escapeHtml(t('common.hours'))}</td>
                  <td style="font-weight:600; color:${col(diff)};">${sign(diff)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }
  }

  // --- Feature 2: Estimation accuracy from printingStartedAt / completedAt timestamps ---
  (function renderTimestampAccuracy() {
    const el = $('#timestampAccuracySection');
    if (!el) return;
    const ordersWithBoth = printLog.filter(o =>
      o.status === 'completed' && o.printingStartedAt && o.completedAt && o.printTime > 0
    );
    if (ordersWithBoth.length < 2) { el.innerHTML = ''; return; }
    let totalActual = 0, totalEst = 0;
    for (const o of ordersWithBoth) {
      const actualH = (new Date(o.completedAt) - new Date(o.printingStartedAt)) / 3600000;
      totalActual += actualH;
      totalEst    += +o.printTime;
    }
    const avgActual = totalActual / ordersWithBoth.length;
    const avgEst    = totalEst    / ordersWithBoth.length;
    const diffPct   = avgEst > 0 ? Math.round((avgActual - avgEst) / avgEst * 100) : 0;
    const sign      = diffPct >= 0 ? `+${diffPct}` : `${diffPct}`;
    const col       = diffPct > 15 ? 'var(--danger)' : diffPct < -5 ? 'var(--warning)' : 'var(--success)';
    el.innerHTML = `
      <div class="accuracy-stat">
        <div class="v" style="color:${col};">${sign}%</div>
        <div class="l">${escapeHtml(t('an.est_accuracy'))}</div>
        <div class="hint">${escapeHtml(t('an.actual_vs_est', {
          actual: avgActual.toFixed(1),
          est:    avgEst.toFixed(1),
          diff:   sign,
        }))}</div>
      </div>`;
  })();

  renderRevenueChart();
  renderFilamentAnalytics();
  renderPrinterUtilizationChart();
  renderPnLSection();
  renderProductProfitability();
  renderSLASection();
  renderMachinePL();
}

/* ============================================================
   Printer utilization chart — hours per machine
   ============================================================ */
function renderPrinterUtilizationChart() {
  const el = $('#printerUtilSection');
  if (!el || machines.length === 0) { if (el) el.innerHTML = ''; return; }

  const orders = printLog.filter(o => inRange(o.date, analyticsRange, 'analytics') && o.status === 'completed');
  const machMap = {};
  for (const m of machines) machMap[m.id] = { name: m.name, color: m.color, hours: 0, revenue: 0, cost: 0, count: 0 };
  for (const o of orders) {
    const key = o.machineId || '__none__';
    if (!machMap[key]) continue;
    machMap[key].hours += +o.printTime || 0;
    machMap[key].revenue += +o.price || 0;
    machMap[key].count++;
    // Estimate material + machine cost from order parts
    const orderCost = (o.parts || []).reduce((s, p) => s + computePartBaseCost(p), 0);
    machMap[key].cost += orderCost;
  }
  // Determine date range for utilization calculation
  const now2 = new Date();
  let rangeDays = 30; // default for 'all'
  if (analyticsRange === 'month') rangeDays = new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate();
  else if (analyticsRange === 'last_month') rangeDays = new Date(now2.getFullYear(), now2.getMonth(), 0).getDate();
  else if (analyticsRange === 'quarter') rangeDays = 91;
  else if (analyticsRange === 'year') rangeDays = 365;

  // Attach targetHoursPerDay from machines array to machMap
  for (const m of machines) {
    if (machMap[m.id]) machMap[m.id].targetHoursPerDay = m.targetHoursPerDay || null;
  }

  const rows = Object.values(machMap).filter(m => m.hours > 0).sort((a, b) => b.revenue - a.revenue);
  if (rows.length === 0) { el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.no_utilization'))}</p>`; return; }

  const maxRev = Math.max(...rows.map(r => r.revenue), 1);
  el.innerHTML = rows.map(r => {
    const pct = (r.revenue / maxRev) * 100;
    const margin = r.cost > 0 && r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue * 100) : null;
    const marginStr = margin !== null ? `${margin.toFixed(1)}%` : '—';
    const marginCol = margin !== null ? (margin >= 30 ? 'var(--success)' : margin >= 10 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)';
    // Utilization %
    let utilStr = '';
    if (r.targetHoursPerDay) {
      const targetTotal = r.targetHoursPerDay * rangeDays;
      const utilPct = targetTotal > 0 ? Math.min(100, (r.hours / targetTotal) * 100) : null;
      if (utilPct !== null) {
        const utilCol = utilPct >= 80 ? 'var(--success)' : utilPct >= 50 ? 'var(--warning)' : 'var(--danger)';
        utilStr = ` · <span style="color:${utilCol};font-weight:600;">${escapeHtml(t('an.utilization_pct'))}: ${utilPct.toFixed(0)}%</span>`;
      }
    }
    return `<div style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px; flex-wrap:wrap; gap:4px;">
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${escapeHtml(r.color||'#5b9cf0')};margin-inline-end:5px;vertical-align:middle;"></span><strong>${escapeHtml(r.name)}</strong></span>
        <span style="color:var(--text-muted);">${r.hours.toFixed(1)}h · ${r.count} ${escapeHtml(t('an.orders'))} · ${fmtPrice(r.revenue)} · <span style="color:${marginCol};font-weight:600;">${escapeHtml(t('an.margin_col'))}: ${marginStr}</span>${utilStr}</span>
      </div>
      <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:10px;">
        <div style="background:${escapeHtml(r.color||'#5b9cf0')};width:${pct.toFixed(1)}%;height:100%;border-radius:4px;opacity:0.8;transition:width 0.4s;"></div>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   P&L (Profit & Loss) quarterly/annual view
   ============================================================ */
function renderPnLSection() {
  const el = $('#pnlSection');
  if (!el) return;

  // Group completed orders by YYYY-Q (quarter)
  const qMap = {};
  for (const o of printLog) {
    if (o.status !== 'completed') continue;
    const d = new Date((o.date || '') + 'T00:00:00');
    if (isNaN(d)) continue;
    const q = Math.ceil((d.getMonth() + 1) / 3);
    const key = `${d.getFullYear()}-Q${q}`;
    if (!qMap[key]) qMap[key] = { revenue: 0, shipping: 0, vatCollected: 0, orders: 0 };
    qMap[key].revenue += +o.price || 0;
    qMap[key].shipping += +o.shippingCost || 0;
    qMap[key].orders++;
    const rate = settings.enableVat ? (+settings.vatRate || 15) : 0;
    qMap[key].vatCollected += rate > 0 ? (+o.price || 0) * rate / (100 + rate) : 0;
  }
  const expQ = {};
  for (const e of expenses) {
    const d = new Date((e.date || '') + 'T00:00:00');
    if (isNaN(d)) continue;
    const q = Math.ceil((d.getMonth() + 1) / 3);
    const key = `${d.getFullYear()}-Q${q}`;
    expQ[key] = (expQ[key] || 0) + (+e.amount || 0);
  }

  const allKeys = [...new Set([...Object.keys(qMap), ...Object.keys(expQ)])].sort().reverse();
  if (allKeys.length === 0) { el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.pnl_empty'))}</p>`; return; }

  const cur = currencySymbol();
  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="color:var(--text-muted); text-align:right;">
            <th style="text-align:left; padding:4px 8px;">${escapeHtml(t('an.pnl_period'))}</th>
            <th style="padding:4px 8px;">${escapeHtml(t('an.pnl_orders'))}</th>
            <th style="padding:4px 8px;">${escapeHtml(t('an.revenue'))} (${cur})</th>
            <th style="padding:4px 8px;">${escapeHtml(t('an.pnl_expenses'))} (${cur})</th>
            <th style="padding:4px 8px;">${escapeHtml(t('an.pnl_vat'))} (${cur})</th>
            <th style="padding:4px 8px; font-weight:700;">${escapeHtml(t('an.pnl_net'))} (${cur})</th>
          </tr>
        </thead>
        <tbody>
          ${allKeys.map(k => {
            const r = qMap[k]?.revenue || 0;
            const exp = expQ[k] || 0;
            const vat = qMap[k]?.vatCollected || 0;
            const net = r - exp;
            const netCol = net >= 0 ? 'var(--success)' : 'var(--danger)';
            return `<tr style="border-top:1px solid rgba(255,255,255,0.06);">
              <td style="padding:6px 8px; font-weight:600;">${escapeHtml(k)}</td>
              <td style="padding:6px 8px; text-align:right;">${qMap[k]?.orders || 0}</td>
              <td style="padding:6px 8px; text-align:right; font-variant-numeric:tabular-nums;">${fmtMoney(r)}</td>
              <td style="padding:6px 8px; text-align:right; color:var(--danger); font-variant-numeric:tabular-nums;">−${fmtMoney(exp)}</td>
              <td style="padding:6px 8px; text-align:right; color:var(--text-muted); font-variant-numeric:tabular-nums;">${fmtMoney(vat)}</td>
              <td style="padding:6px 8px; text-align:right; font-weight:700; color:${netCol}; font-variant-numeric:tabular-nums;">${fmtMoney(net)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   Profitability by product — shows revenue / cost / margin
   per product type for completed orders in selected range
   ============================================================ */
function renderProductProfitability() {
  const el = $('#productProfitSection');
  if (!el) return;

  const completed = printLog.filter(o => o.status === 'completed' && inRange(o.date, analyticsRange, 'analytics'));
  if (completed.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.no_data'))}</p>`;
    return;
  }

  // Aggregate by productId (fall back to 'Untagged' bucket)
  const map = {};
  for (const o of completed) {
    const key = o.productId || '__none__';
    if (!map[key]) {
      const prod = products.find(p => p.id === key);
      map[key] = { name: prod ? localName(prod) : t('an.untagged'), revenue: 0, cost: 0, count: 0 };
    }
    map[key].revenue += +o.price || 0;
    map[key].count++;
    // Estimate cost from parts if available
    const partCost = (o.parts || []).reduce((s, p) => s + computePartBaseCost(p), 0);
    // Add linked expenses to cost (Feature 4)
    const linkedExpCost = expenses.filter(e => e.orderId === o.id).reduce((s, e) => s + (+e.amount || 0), 0);
    map[key].cost += partCost + linkedExpCost;
  }

  const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue);
  const maxRev = Math.max(...rows.map(r => r.revenue), 1);

  el.innerHTML = `
    <div class="table-wrap">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1); text-align:left;">
            <th style="padding:6px 8px;" data-i18n="an.product_col">${escapeHtml(t('an.product_col'))}</th>
            <th style="padding:6px 8px; text-align:center;" data-i18n="an.orders">${escapeHtml(t('an.orders'))}</th>
            <th style="padding:6px 8px; text-align:right;" data-i18n="an.revenue">${escapeHtml(t('an.revenue'))}</th>
            <th style="padding:6px 8px; text-align:right;" data-i18n="an.cost_col">${escapeHtml(t('an.cost_col'))}</th>
            <th style="padding:6px 8px; text-align:right;" data-i18n="an.margin_col">${escapeHtml(t('an.margin_col'))}</th>
            <th style="padding:6px 8px; width:120px;" data-i18n="an.revenue_bar">${escapeHtml(t('an.revenue_bar'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const margin = r.cost > 0 ? ((r.revenue - r.cost) / r.revenue * 100) : null;
            const marginStr = margin !== null ? `${margin.toFixed(1)}%` : '—';
            const marginCol = margin !== null ? (margin >= 30 ? 'var(--success)' : margin >= 10 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-muted)';
            const barPct = (r.revenue / maxRev * 100).toFixed(1);
            return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:7px 8px; font-weight:500;">${escapeHtml(r.name)}</td>
              <td style="padding:7px 8px; text-align:center;">${r.count}</td>
              <td style="padding:7px 8px; text-align:right; font-variant-numeric:tabular-nums;">${fmtPrice(r.revenue)}</td>
              <td style="padding:7px 8px; text-align:right; color:var(--danger); font-variant-numeric:tabular-nums;">${r.cost > 0 ? fmtPrice(r.cost) : '—'}</td>
              <td style="padding:7px 8px; text-align:right; font-weight:600; color:${marginCol};">${marginStr}</td>
              <td style="padding:7px 8px;">
                <div style="background:rgba(255,255,255,0.08);border-radius:3px;height:8px;">
                  <div style="background:var(--primary);width:${barPct}%;height:100%;border-radius:3px;transition:width 0.4s;"></div>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   SLA — On-Time Delivery Rate
   ============================================================ */
function renderSLASection() {
  const el = $('#slaSection');
  if (!el) return;

  const completed = printLog.filter(o =>
    o.status === 'completed' &&
    o.dueDate &&
    inRange(o.date, analyticsRange, 'analytics')
  );

  if (completed.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.sla_no_data'))}</p>`;
    return;
  }

  const onTime = completed.filter(o => {
    const delivered = o.deliveredAt || o.date;
    return delivered <= o.dueDate;
  });
  const late = completed.filter(o => {
    const delivered = o.deliveredAt || o.date;
    return delivered > o.dueDate;
  });

  const rate = Math.round(onTime.length / completed.length * 100);
  const avgDelay = late.length > 0 ? Math.round(
    late.reduce((s, o) => {
      const delivered = o.deliveredAt || o.date;
      return s + Math.round((new Date(delivered + 'T00:00:00') - new Date(o.dueDate + 'T00:00:00')) / 86400000);
    }, 0) / late.length
  ) : 0;

  const rateColor = rate >= 90 ? 'var(--success)' : rate >= 70 ? 'var(--warning)' : 'var(--danger)';

  el.innerHTML = `
    <div style="display:flex; gap:24px; flex-wrap:wrap; margin-bottom:16px;">
      <div class="cl-hist-stat">
        <div class="v" style="color:${rateColor};">${rate}%</div>
        <div class="l">${escapeHtml(t('an.sla_rate'))}</div>
      </div>
      <div class="cl-hist-stat">
        <div class="v">${completed.length}</div>
        <div class="l">${escapeHtml(t('an.sla_with_due'))}</div>
      </div>
      <div class="cl-hist-stat">
        <div class="v">${onTime.length}</div>
        <div class="l" style="color:var(--success);">${escapeHtml(t('an.sla_on_time'))}</div>
      </div>
      <div class="cl-hist-stat">
        <div class="v">${late.length}</div>
        <div class="l" style="color:var(--danger);">${escapeHtml(t('an.sla_late'))}</div>
      </div>
      ${late.length > 0 ? `<div class="cl-hist-stat">
        <div class="v">${avgDelay}</div>
        <div class="l">${escapeHtml(t('an.sla_avg_delay'))}</div>
      </div>` : ''}
    </div>
    <div style="background:rgba(255,255,255,0.08);border-radius:6px;height:12px;overflow:hidden;">
      <div style="background:${rateColor};width:${rate}%;height:100%;border-radius:6px;transition:width 0.5s;"></div>
    </div>`;
}

/* ============================================================
   Feature 7: Per-machine P&L
   ============================================================ */
function renderMachinePL() {
  const el = $('#machinePLSection');
  if (!el) return;
  if (machines.length === 0) { el.innerHTML = ''; return; }

  const completed = printLog.filter(o => o.status === 'completed' && inRange(o.date, analyticsRange, 'analytics'));
  if (completed.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.no_data'))}</p>`;
    return;
  }

  // Build per-machine aggregation
  const machMap = {};
  for (const m of machines) {
    machMap[m.id] = { name: m.name, color: m.color || '#888', jobs: 0, revenue: 0, materialCost: 0, linkedExp: 0 };
  }
  machMap['__none__'] = { name: t('dash.unassigned'), color: '#888', jobs: 0, revenue: 0, materialCost: 0, linkedExp: 0 };

  for (const o of completed) {
    const key = o.machineId && machMap[o.machineId] ? o.machineId : '__none__';
    machMap[key].jobs++;
    machMap[key].revenue += +o.price || 0;
    machMap[key].materialCost += (o.parts || []).reduce((s, p) => s + computePartBaseCost(p), 0);
    // Linked expenses
    machMap[key].linkedExp += expenses
      .filter(e => e.orderId === o.id)
      .reduce((s, e) => s + (+e.amount || 0), 0);
  }

  const rows = Object.values(machMap).filter(r => r.jobs > 0);
  if (rows.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('an.no_data'))}</p>`;
    return;
  }

  const cur = currencySymbol();
  el.innerHTML = `
    <div class="table-wrap">
      <table class="machine-pl-table" style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="color:var(--text-muted);">
            <th style="text-align:left; padding:6px 8px;">Machine</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.pnl_orders'))}</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.revenue'))} (${cur})</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.mat_cost_col'))} (${cur})</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.linked_exp_col'))} (${cur})</th>
            <th style="text-align:right; padding:6px 8px; font-weight:700;">${escapeHtml(t('an.net_contribution'))} (${cur})</th>
            <th style="text-align:right; padding:6px 8px;">${escapeHtml(t('an.margin_col'))}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const net = r.revenue - r.materialCost - r.linkedExp;
            const margin = r.revenue > 0 ? (net / r.revenue * 100) : 0;
            const marginCol = margin >= 30 ? 'var(--success)' : margin >= 10 ? 'var(--warning)' : 'var(--danger)';
            return `<tr style="border-top:1px solid rgba(255,255,255,0.06);">
              <td style="padding:6px 8px;">
                <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${escapeHtml(r.color)};margin-inline-end:6px;vertical-align:middle;"></span>
                <strong>${escapeHtml(r.name)}</strong>
              </td>
              <td style="text-align:right; padding:6px 8px;">${r.jobs}</td>
              <td style="text-align:right; padding:6px 8px; font-variant-numeric:tabular-nums;">${fmtMoney(r.revenue)}</td>
              <td style="text-align:right; padding:6px 8px; color:var(--danger); font-variant-numeric:tabular-nums;">−${fmtMoney(r.materialCost)}</td>
              <td style="text-align:right; padding:6px 8px; color:var(--danger); font-variant-numeric:tabular-nums;">−${fmtMoney(r.linkedExp)}</td>
              <td style="text-align:right; padding:6px 8px; font-weight:700; color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}; font-variant-numeric:tabular-nums;">${fmtMoney(net)}</td>
              <td style="text-align:right; padding:6px 8px; font-weight:600; color:${marginCol};">${margin.toFixed(1)}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ============================================================
   Revenue chart — SVG bar chart, last 12 months
   ============================================================ */
function renderRevenueChart() {
  const wrap = $('#revenueChartWrap');
  if (!wrap) return;

  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key:     `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label:   d.toLocaleDateString(i18n.current === 'ar' ? 'ar-SA' : 'en-US', { month: 'short' }),
      revenue: 0,
      orders:  0
    });
  }
  for (const o of printLog) {
    if (o.status !== 'completed') continue;
    const m = months.find(x => x.key === (o.date || '').slice(0, 7));
    if (m) { m.revenue += +o.price || 0; m.orders++; }
  }

  const maxRev = Math.max(...months.map(m => m.revenue), 1);
  const W = 600, H = 210;
  const padL = 48, padR = 12, padT = 18, padB = 34;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW   = chartW / months.length;
  const gap    = Math.max(2, barW * 0.18);
  const TICKS  = 4;

  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Grid lines + y-labels
  for (let i = 0; i <= TICKS; i++) {
    const y   = padT + chartH - (i / TICKS) * chartH;
    const val = (maxRev / TICKS) * i;
    const lbl = val >= 1000 ? (val / 1000).toFixed(val >= 10000 ? 0 : 1) + 'k' : val.toFixed(0);
    s += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#ffffff10" stroke-width="1"/>`;
    s += `<text x="${(padL - 6).toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#6b7793">${escapeHtml(lbl)}</text>`;
  }

  // Bars
  months.forEach((m, i) => {
    const x   = padL + i * barW + gap / 2;
    const bw  = barW - gap;
    const bh  = m.revenue > 0 ? Math.max(3, (m.revenue / maxRev) * chartH) : 3;
    const y   = padT + chartH - bh;
    const cx  = (x + bw / 2).toFixed(1);
    const op  = m.revenue > 0 ? '0.85' : '0.12';

    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="#5b9cf0" rx="3" opacity="${op}"/>`;

    // Value above bar
    if (m.revenue > 0) {
      const vl = m.revenue >= 1000 ? (m.revenue / 1000).toFixed(1) + 'k' : m.revenue.toFixed(0);
      s += `<text x="${cx}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="#9aa6c0">${escapeHtml(vl)}</text>`;
    }
    // Order count dot + label
    if (m.orders > 0) {
      s += `<text x="${cx}" y="${(padT + chartH + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="#5b9cf0" font-weight="600">${m.orders}</text>`;
    }
    // Month label
    s += `<text x="${cx}" y="${(padT + chartH + 26).toFixed(1)}" text-anchor="middle" font-size="10" fill="#6b7793">${escapeHtml(m.label)}</text>`;
  });

  s += `</svg>`;
  wrap.innerHTML = s;
}

/* ============================================================
   Due-date desktop notifications
   ============================================================ */
async function checkDueDateNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission !== 'granted') return;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const active = printLog.filter(o => o.dueDate && o.status !== 'completed');

  const overdue = active.filter(o => new Date(o.dueDate + 'T00:00:00') < today);
  const dueToday = active.filter(o => {
    const d = new Date(o.dueDate + 'T00:00:00');
    return Math.round((d - today) / 86400000) === 0;
  });
  const dueTomorrow = active.filter(o => {
    const d = new Date(o.dueDate + 'T00:00:00');
    return Math.round((d - today) / 86400000) === 1;
  });

  const bizName = settings.bizEn || settings.bizAr || 'Khayt';

  if (overdue.length > 0) {
    new Notification(t('notif.overdue_title', { n: overdue.length }), {
      body: overdue.slice(0, 3).map(o => o.project || o.id).join(', ') + (overdue.length > 3 ? ` +${overdue.length - 3}` : ''),
      tag:  'hub-overdue'
    });
  }
  if (dueToday.length > 0) {
    new Notification(t('notif.due_today_title', { n: dueToday.length }), {
      body: dueToday.map(o => o.project || o.id).join(', '),
      tag:  'hub-due-today'
    });
  }
  if (dueTomorrow.length > 0) {
    new Notification(t('notif.due_tomorrow_title', { n: dueTomorrow.length }), {
      body: dueTomorrow.map(o => o.project || o.id).join(', '),
      tag:  'hub-due-tomorrow'
    });
  }
}

function exportOrdersCsv() {
  const rows = getFilteredLogs();

  const headers = ['ID', 'Date', 'Client', 'Material', 'Print Time (hrs)', `Price (${currencySymbol()})`, 'Status', 'Payment', 'Paid Amount', 'Due Date', 'Machine', 'Tags', 'Notes'];
  const lines = [
    headers.map(csvEsc).join(','),
    ...rows.map(o => [
      o.id,
      o.date,
      o.project || '',
      o.material || '',
      o.printTime,
      o.price,
      o.status,
      payStatus(o),
      o.paidAmount || 0,
      o.dueDate || '',
      machines.find(m => m.id === o.machineId)?.name || '',
      (o.tags || []).join(', '),
      (o.notes || '').replace(/\n/g, ' ')
    ].map(csvEsc).join(','))
  ];

  downloadBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    `orders-${new Date().toISOString().slice(0, 10)}.csv`);
}

/* ============================================================
   Feature 7: Shareable order status page (local HTML export)
   ============================================================ */
async function exportOrderStatusPage(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const clientName = client ? (localName(client) || order.project) : (order.project || '');
  const bizName = settings.bizEn || settings.bizAr || 'Khayt';
  const accentColor = settings.invAccentColor || '#5E2E14';

  const STATUS_ORDER = ['quote', 'pending', 'on_hold', 'printing', 'post', 'completed'];
  const STATUS_LABELS = {
    quote:     'Quote',
    pending:   'Pending',
    on_hold:   'On Hold',
    printing:  'Printing',
    post:      'Post-Processing',
    completed: 'Completed',
  };

  const curIdx = STATUS_ORDER.indexOf(order.status);
  const stepsHtml = ['Quote', 'Pending', 'Printing', 'Post-Processing', 'Completed']
    .map((lbl, i) => {
      const stepStatus = ['quote', 'pending', 'printing', 'post', 'completed'][i];
      const stepIdx = STATUS_ORDER.indexOf(stepStatus);
      const done    = curIdx >= stepIdx;
      const current = order.status === stepStatus;
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;">
        <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;
          background:${done ? accentColor : '#e5e7eb'};color:${done ? '#fff' : '#9ca3af'};
          ${current ? 'box-shadow:0 0 0 4px ' + accentColor + '33;' : ''}">
          ${done ? '✓' : (i + 1)}
        </div>
        <div style="font-size:11px;margin-top:6px;text-align:center;color:${done ? '#111827' : '#9ca3af'};font-weight:${current ? '700' : '400'};">${lbl}</div>
      </div>`;
    });
  const connectors = stepsHtml.map((s, i) => i < stepsHtml.length - 1
    ? s + `<div style="flex:0 0 24px;height:2px;background:${curIdx > STATUS_ORDER.indexOf(['quote','pending','printing','post','completed'][i]) ? accentColor : '#e5e7eb'};margin-top:15px;"></div>`
    : s
  ).join('');

  const isReady = order.status === 'completed';
  const msg = isReady
    ? 'Your order is ready for pickup / delivery!'
    : order.status === 'on_hold'
      ? `Your order is temporarily on hold.${order.holdReason ? ' Reason: ' + order.holdReason : ''}`
      : 'Your order is being processed. We\'ll notify you when it\'s ready.';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Status — ${order.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; padding: 24px 16px; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); max-width: 480px; margin: 0 auto; overflow: hidden; }
    .header { background: ${accentColor}; color: #fff; padding: 24px; }
    .header h1 { font-size: 22px; font-weight: 700; }
    .header p { font-size: 13px; opacity: 0.8; margin-top: 4px; }
    .body { padding: 24px; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #6b7280; }
    .info-value { font-weight: 600; }
    .stepper { display: flex; align-items: flex-start; margin: 24px 0; }
    .message { background: ${isReady ? '#d1fae5' : '#fffbeb'}; border-left: 4px solid ${isReady ? '#10b981' : '#f59e0b'}; padding: 14px 16px; border-radius: 8px; margin-top: 16px; font-size: 14px; color: #374151; }
    .footer { text-align: center; padding: 16px 24px; background: #f9fafb; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${bizName}</h1>
      <p>Order Status Update</p>
    </div>
    <div class="body">
      <div class="stepper">${connectors}</div>
      <div class="info-row"><span class="info-label">Order #</span><span class="info-value">${order.id}</span></div>
      <div class="info-row"><span class="info-label">Project</span><span class="info-value">${escapeHtml(order.project || '—')}</span></div>
      <div class="info-row"><span class="info-label">Client</span><span class="info-value">${escapeHtml(clientName)}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value">${STATUS_LABELS[order.status] || order.status}</span></div>
      ${order.dueDate ? `<div class="info-row"><span class="info-label">Estimated completion</span><span class="info-value">${escapeHtml(order.dueDate)}</span></div>` : ''}
      <div class="message">${msg}</div>
    </div>
    <div class="footer">Generated by ${escapeHtml(bizName)} · ${new Date().toLocaleDateString()}</div>
  </div>
</body>
</html>`;

  if (window.hubAPI?.saveHtml) {
    await window.hubAPI.saveHtml(html, `order-status-${order.id}.html`);
    toast(t('ord.status_page_saved'), 'success');
  } else {
    // Fallback: download as blob
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `order-status-${order.id}.html`);
    toast(t('ord.status_page_saved'), 'success');
  }
}

async function clearAllLogs() {
  const ok = await confirmModal(t('log.clear_q'), { danger: true });
  if (!ok) return;
  printLog = [];
  saveAll();
  renderLogs(); renderKanban(); renderAnalytics();
  toast(t('log.cleared'), 'success');
}

/* ============================================================
   ZATCA Phase 1 — TLV-encoded base64 QR
   ============================================================ */
function buildZatcaTLV({ sellerName, vatNumber, timestamp, total, vatAmount }) {
  const enc = new TextEncoder();
  function tlv(tag, value) {
    const bytes = enc.encode(value);
    const out = new Uint8Array(bytes.length + 2);
    out[0] = tag; out[1] = bytes.length; out.set(bytes, 2);
    return out;
  }
  const fields = [
    tlv(1, String(sellerName || '')),
    tlv(2, String(vatNumber  || '')),
    tlv(3, String(timestamp  || '')),
    tlv(4, String(total      || '')),
    tlv(5, String(vatAmount  || '')),
  ];
  const totalLen = fields.reduce((s, b) => s + b.length, 0);
  const combined = new Uint8Array(totalLen);
  let off = 0; for (const b of fields) { combined.set(b, off); off += b.length; }
  let bin = ''; for (let i = 0; i < combined.length; i++) bin += String.fromCharCode(combined[i]);
  return btoa(bin);
}

// "Print invoice" path — renders into the print area then opens the system print dialog
async function generateInvoice(id) {
  const order = printLog.find(o => o.id === id);
  if (!order) return;
  await renderInvoiceForOrder(order);
  setTimeout(() => window.print(), 80);
}

function openCreditNoteModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  let creditAmt = +order.price || 0;
  let reason = '';

  const bodyHtml = `
    <p style="font-size:12.5px; color:var(--text-muted); margin:0 0 14px;">
      ${escapeHtml(t('cn.ref_order'))}: <strong>${escapeHtml(order.id)}</strong> · ${fmtPrice(order.price)} ${currencySymbol()}
    </p>
    <label>${escapeHtml(t('cn.credit_amount'))} (${currencySymbol()})</label>
    <input type="number" id="cnAmtInput" value="${creditAmt.toFixed(2)}" min="0.01" step="0.01" max="${order.price}">
    <label style="margin-top:14px;">${escapeHtml(t('cn.reason'))}</label>
    <textarea id="cnReasonInput" rows="3" style="resize:vertical;" placeholder="${escapeHtml(t('cn.reason_ph'))}">${escapeHtml(reason)}</textarea>`;

  openFormModal({
    title: t('cn.title'),
    saveLabel: t('cn.generate'),
    sizeLg: false,
    bodyHtml,
    onSave() {
      const amt = Math.min(Math.max(0.01, num(document.getElementById('cnAmtInput').value, creditAmt)), +order.price);
      const rsn = document.getElementById('cnReasonInput').value.trim();
      generateCreditNote(order, amt, rsn);
      return true;
    }
  });
}

function generateCreditNote(order, creditAmount, reason) {
  const area = $('#invoice-print-area');
  const isAr = i18n.current === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';
  const bizPrimary = isAr ? (settings.bizAr || settings.bizEn) : (settings.bizEn || settings.bizAr);
  const cnId = 'CN-' + order.id;
  const today = new Date().toISOString().split('T')[0];
  const linkedClient = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const clientName = (order.project || '').trim() || t('inv.walk_in');
  const clientSub  = linkedClient ? [linkedClient.phone, linkedClient.email].filter(Boolean).join(' · ') : '';

  area.innerHTML = `
    <div class="inv-wrap">
    <div class="inv-top-bar" style="background:#b91c1c;"></div>
    <div class="inv" dir="${dir}" lang="${i18n.current}" style="--brand:#7f1d1d; --accent:#dc2626; --highlight:#fee2e2;">
      <div class="inv-header">
        <div class="biz">
          <div class="mark">${settings.bizLogo ? `<img src="${settings.bizLogo}" style="max-height:60px; max-width:120px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name">
            <h1>${escapeHtml(bizPrimary || 'Khayt')}</h1>
          </div>
        </div>
        <div class="doc">
          <div class="title" style="color:#dc2626;">${escapeHtml(isAr ? 'إشعار دائن' : 'Credit Note')}</div>
          <div class="title-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Credit Note' : 'إشعار دائن')}</div>
          <div class="meta">
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'رقم' : 'No.')}</span><span class="v">${escapeHtml(cnId)}</span></div>
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'التاريخ' : 'Date')}</span><span class="v">${escapeHtml(formatPrintDate(today))}</span></div>
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'يشير إلى' : 'Ref.')}</span><span class="v">${escapeHtml(order.id)}</span></div>
          </div>
        </div>
      </div>

      <div class="bill-to">
        <div class="label"><span>${escapeHtml(isAr ? 'صادر إلى' : 'Issued to')}</span></div>
        <div>
          <div class="name">${escapeHtml(clientName)}</div>
          ${clientSub ? `<div class="name-sub">${escapeHtml(clientSub)}</div>` : ''}
        </div>
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th>${escapeHtml(isAr ? 'الوصف' : 'Description')}</th>
            <th style="text-align:center; width:60px;">${escapeHtml(isAr ? 'الكمية' : 'Qty')}</th>
            <th class="th-amount" style="width:150px;">${escapeHtml(isAr ? 'الإجمالي' : 'Amount')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="desc-en">${escapeHtml(isAr ? 'إشعار دائن' : 'Credit Note')} — ${escapeHtml(order.project || order.id)}</div>
              ${reason ? `<div class="meta">${escapeHtml(reason)}</div>` : ''}
            </td>
            <td class="center">1</td>
            <td class="amount" style="color:#dc2626;">−${fmtMoney(creditAmount)} <span style="color:#666; font-weight:500;">${currencySymbol()}</span></td>
          </tr>
        </tbody>
      </table>

      <div class="totals">
        <div class="summary">
          <div class="row grand">
            <span class="label-en" style="color:#dc2626;">${escapeHtml(isAr ? 'إجمالي الإشعار' : 'Credit total')}</span>
            <span class="v" style="color:#dc2626;">−${fmtMoney(creditAmount)}<span class="unit">${currencySymbol()}</span></span>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="legal">${escapeHtml(isAr ? 'تم التوليد بواسطة Khayt' : 'Generated by Khayt')}</div>
      </div>
    </div>
    </div>`;

  setTimeout(() => window.print(), 80);
}

function generateDeliveryNote(id) {
  const order = printLog.find(o => o.id === id);
  if (!order) return;
  const area = $('#invoice-print-area');
  const isAr = i18n.current === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';
  const bizPrimary = isAr ? (settings.bizAr || settings.bizEn) : (settings.bizEn || settings.bizAr);
  const linkedClient = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const clientName = (order.project || '').trim() || t('inv.walk_in');
  const clientSub  = linkedClient ? [linkedClient.phone, linkedClient.email].filter(Boolean).join(' · ') : '';
  const lines = (order.parts && order.parts.length > 0) ? order.parts
    : [{ name: t('inv.services_default'), qty: 1 }];

  area.innerHTML = `
    <div class="inv-wrap">
    <div class="inv-top-bar" style="background:var(--primary);"></div>
    <div class="inv" dir="${dir}" lang="${i18n.current}" style="--brand:#1a1a2e; --accent:#4a90e2; --highlight:#eef3fc;">
      <div class="inv-header">
        <div class="biz">
          <div class="mark">${settings.bizLogo ? `<img src="${settings.bizLogo}" style="max-height:60px; max-width:120px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name">
            <h1>${escapeHtml(bizPrimary || 'Khayt')}</h1>
          </div>
        </div>
        <div class="doc">
          <div class="title">${escapeHtml(isAr ? 'إشعار تسليم' : 'Delivery Note')}</div>
          <div class="title-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Delivery Note' : 'إشعار تسليم')}</div>
          <div class="meta">
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'رقم' : 'Ref.')}</span><span class="v">${escapeHtml(order.id)}</span></div>
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'التاريخ' : 'Date')}</span><span class="v">${escapeHtml(formatPrintDate(order.date))}</span></div>
          </div>
        </div>
      </div>
      <div class="bill-to">
        <div class="label"><span>${escapeHtml(isAr ? 'تسليم إلى' : 'Deliver to')}</span></div>
        <div>
          <div class="name">${escapeHtml(clientName)}</div>
          ${clientSub ? `<div class="name-sub">${escapeHtml(clientSub)}</div>` : ''}
        </div>
      </div>
      ${(order.trackingNumber || order.courierName || order.deliveryAddress) ? `
      <div class="delivery-tracking">
        ${order.courierName ? `<div><strong>${escapeHtml(isAr ? 'شركة الشحن' : 'Courier')}:</strong> ${escapeHtml(order.courierName)}</div>` : ''}
        ${order.trackingNumber ? `<div><strong>${escapeHtml(isAr ? 'رقم التتبع' : 'Tracking')}:</strong> ${escapeHtml(order.trackingNumber)}</div>` : ''}
        ${order.deliveryAddress ? `<div><strong>${escapeHtml(isAr ? 'العنوان' : 'Address')}:</strong> ${escapeHtml(order.deliveryAddress)}</div>` : ''}
      </div>` : ''}
      <table class="lines">
        <thead>
          <tr>
            <th>${escapeHtml(isAr ? 'الصنف' : 'Item')}</th>
            <th style="text-align:center; width:60px;">${escapeHtml(isAr ? 'الكمية' : 'Qty')}</th>
            <th style="width:120px;">${escapeHtml(isAr ? 'ملاحظات' : 'Notes')}</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map(p => `
            <tr>
              <td>${escapeHtml(p.name)}</td>
              <td class="center">${p.qty || 1}</td>
              <td></td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:32px; display:flex; justify-content:space-between; gap:32px;">
        <div style="flex:1; border-top:1px solid #ccc; padding-top:8px; font-size:12px; color:#888;">${escapeHtml(isAr ? 'توقيع المستلم' : 'Received by')}</div>
        <div style="flex:1; border-top:1px solid #ccc; padding-top:8px; font-size:12px; color:#888;">${escapeHtml(isAr ? 'توقيع المسلِّم' : 'Delivered by')}</div>
      </div>
      <div class="footer" style="margin-top:24px;">
        <div class="legal">${escapeHtml(isAr ? 'تم التوليد بواسطة Khayt' : 'Generated by Khayt')}</div>
      </div>
    </div>
    </div>`;

  setTimeout(() => window.print(), 80);
}

/* ============================================================
   Work Order — internal shop-floor sheet (no pricing shown)
   ============================================================ */
function generateWorkOrder(id) {
  const order = printLog.find(o => o.id === id);
  if (!order) return;
  const area = $('#work-order-print-area');
  const isAr = i18n.current === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';
  const bizPrimary = isAr ? (settings.bizAr || settings.bizEn) : (settings.bizEn || settings.bizAr);
  const today = new Date().toISOString().split('T')[0];
  const linkedClient = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const clientName = (order.project || '').trim() || (linkedClient ? localName(linkedClient) : t('inv.walk_in'));
  const lines = (order.parts && order.parts.length > 0) ? order.parts
    : [{ name: order.project || order.id, qty: 1, material: '', weight: '', printTime: order.printTime || 0 }];
  const machine = order.machineId ? machines.find(m => m.id === order.machineId) : null;
  const customDataHtml = (settings.customFields || []).length > 0 && order.customData
    ? (settings.customFields || []).map(f => {
        const val = (order.customData || {})[f.id] || '';
        return val ? `<div class="meta-row"><span class="k">${escapeHtml(f.label)}</span><span class="v">${escapeHtml(val)}</span></div>` : '';
      }).join('')
    : '';

  area.innerHTML = `
    <div class="inv-wrap wo-wrap">
    <div class="inv-top-bar" style="background:#374151;"></div>
    <div class="inv" dir="${dir}" lang="${i18n.current}" style="--brand:#1f2937; --accent:#374151; --highlight:#f3f4f6;">
      <div class="inv-header">
        <div class="biz">
          <div class="mark">${settings.bizLogo ? `<img src="${settings.bizLogo}" style="max-height:50px; max-width:100px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name"><h1>${escapeHtml(bizPrimary || 'Khayt')}</h1></div>
        </div>
        <div class="doc">
          <div class="title">${escapeHtml(isAr ? 'أمر تشغيل داخلي' : 'Work Order')}</div>
          <div class="title-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Work Order' : 'أمر تشغيل داخلي')}</div>
          <div class="meta">
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'رقم الأمر' : 'WO No.')}</span><span class="v">WO-${escapeHtml(order.id)}</span></div>
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'التاريخ' : 'Date')}</span><span class="v">${escapeHtml(formatPrintDate(today))}</span></div>
            <div class="meta-row"><span class="k">${escapeHtml(isAr ? 'تاريخ التسليم' : 'Due')}</span><span class="v">${order.dueDate ? escapeHtml(formatPrintDate(order.dueDate)) : '—'}</span></div>
            ${machine ? `<div class="meta-row"><span class="k">${escapeHtml(isAr ? 'الآلة' : 'Machine')}</span><span class="v">${escapeHtml(machine.name)}</span></div>` : ''}
            ${customDataHtml}
          </div>
        </div>
      </div>

      <div class="bill-to">
        <div class="label"><span>${escapeHtml(isAr ? 'العميل' : 'Client')}</span></div>
        <div>
          <div class="name">${escapeHtml(clientName)}</div>
          ${order.notes ? `<div class="name-sub">${escapeHtml(order.notes)}</div>` : ''}
        </div>
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th>${escapeHtml(isAr ? 'الجزء' : 'Part')}</th>
            <th style="text-align:center; width:40px;">${escapeHtml(isAr ? 'الكمية' : 'Qty')}</th>
            <th style="width:120px;">${escapeHtml(isAr ? 'المادة' : 'Material')}</th>
            <th style="width:80px; text-align:center;">${escapeHtml(isAr ? 'الوزن (غ)' : 'Weight (g)')}</th>
            <th style="width:80px; text-align:center;">${escapeHtml(isAr ? 'الوقت (س)' : 'Time (h)')}</th>
            <th style="width:100px;">${escapeHtml(isAr ? 'الإعدادات' : 'Settings')}</th>
            <th style="width:100px;">${escapeHtml(isAr ? 'الملف' : 'File')}</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map(p => {
            const invItem = p.filamentId ? inventory.find(f => f.id === p.filamentId) : null;
            const filamentName = invItem?.material || (p.material || '');
            // Feature 4: Include spool print settings in work order
            const printSettingsStr = invItem && (invItem.printTemp || invItem.bedTemp)
              ? [
                  invItem.printTemp ? `${invItem.printTemp}°C` : '',
                  invItem.bedTemp   ? `Bed: ${invItem.bedTemp}°C` : '',
                  invItem.maxSpeed  ? `${invItem.maxSpeed}mm/s` : '',
                ].filter(Boolean).join(' / ')
              : '';
            const settings_str = [
              p.infill ? `${p.infill}%` : '',
              p.layerHeight ? `${p.layerHeight}mm` : '',
              p.supports ? (isAr ? 'دعامات' : 'Supports') : '',
              printSettingsStr
            ].filter(Boolean).join(', ');
            return `<tr>
              <td>${escapeHtml(p.name || order.project || '')}</td>
              <td class="center">${escapeHtml(String(p.qty || 1))}</td>
              <td>${escapeHtml(filamentName)}</td>
              <td class="center">${p.weight ? escapeHtml(String(+p.weight)) : '—'}</td>
              <td class="center">${p.printTime ? escapeHtml((+p.printTime).toFixed(1)) : '—'}</td>
              <td style="font-size:10px;">${escapeHtml(settings_str)}</td>
              <td style="font-size:10px; color:#4a8ee8;">${escapeHtml(p.fileRef || '—')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <div class="wo-checks" style="margin-top:20px;">
        ${(settings.postChecklist || []).length > 0 ? `
          <div style="font-size:12px; font-weight:600; margin-bottom:8px;">${escapeHtml(isAr ? 'قائمة التحقق بعد الطباعة' : 'Post-Processing Checklist')}</div>
          ${settings.postChecklist.map(ch => `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
              <div style="width:14px;height:14px;border:1.5px solid #666;border-radius:3px;flex-shrink:0;"></div>
              <span style="font-size:12px;">${escapeHtml(ch.label)}</span>
            </div>`).join('')}` : ''}
      </div>

      <div style="margin-top:28px; display:flex; justify-content:space-between; gap:32px;">
        <div style="flex:1; border-top:1px solid #ccc; padding-top:8px; font-size:12px; color:#888;">${escapeHtml(isAr ? 'المشغّل' : 'Operator')}</div>
        <div style="flex:1; border-top:1px solid #ccc; padding-top:8px; font-size:12px; color:#888;">${escapeHtml(isAr ? 'المراجع' : 'Reviewed by')}</div>
        <div style="flex:1; border-top:1px solid #ccc; padding-top:8px; font-size:12px; color:#888;">${escapeHtml(isAr ? 'التاريخ والوقت' : 'Date / Time')}</div>
      </div>
    </div>
    </div>`;

  setTimeout(() => window.print(), 80);
}

function renderInvoice(order, { qrSvg, payQrSvg = '', total, vatAmount, subtotal, vatRate, shipping = 0 }) {
  const area = $('#invoice-print-area');
  const issuedDate = formatPrintDate(order.date);
  const issuedTime = order.timestamp ? new Date(order.timestamp).toTimeString().slice(0, 5) : '';
  // Feature 1: use per-client currency if set
  const invCurrencyCode = clientCurrency(order.clientId);
  const invCurObj = CURRENCIES[invCurrencyCode] || CURRENCIES[settings.currency] || CURRENCIES.SAR;
  const invCurrSym = invCurObj.symbol;

  // Direction follows the current app language. The invoice is always bilingual,
  // but the primary label (larger, bolder) matches the user's working language.
  const isAr = i18n.current === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  // Numeral formatting helper — only converts when in Arabic mode with the toggle on
  const num = (v) => (isAr && settings.useArabicNumerals) ? toArabicNumerals(v) : String(v);
  const isPaid = (order.paymentStatus === 'paid');

  // Label pairs — (primary, secondary). Primary = working language.
  const isQuoteDoc = order.status === 'quote';
  const L = {
    invoice:    isAr ? (isQuoteDoc ? ['عرض سعر','Quotation'] : ['فاتورة','Invoice'])
                     : (isQuoteDoc ? ['Quotation','عرض سعر'] : ['Invoice','فاتورة']),
    no:         isAr ? ['رقم',                 'No.']             : ['No.',               'رقم'],
    date:       isAr ? ['التاريخ',             'Date']            : ['Date',              'التاريخ'],
    time:       isAr ? ['الوقت',               'Time']            : ['Time',              'الوقت'],
    billTo:     isAr ? ['الفاتورة إلى',        'Bill to']         : ['Bill to',           'الفاتورة إلى'],
    description:isAr ? ['الوصف',               'Description']     : ['Description',       'الوصف'],
    qty:        isAr ? ['الكمية',              'Qty']             : ['Qty',               'الكمية'],
    amount:     isAr ? ['الإجمالي',            'Amount']          : ['Amount',            'الإجمالي'],
    subtotal:   isAr ? ['الإجمالي الفرعي',    'Subtotal']        : ['Subtotal',          'الإجمالي الفرعي'],
    vat:        isAr ? [`ضريبة القيمة (${vatRate || 15}٪)`, `VAT (${vatRate || 15}%)`] : [`VAT (${vatRate || 15}%)`, `ضريبة القيمة (${vatRate || 15}%)`],
    totalDue:   isAr ? ['الإجمالي المستحق',   'Total due']       : ['Total due',         'الإجمالي المستحق'],
    qrLabel:    isAr ? ['رمز هيئة الزكاة — امسح للتحقق', 'ZATCA QR — scan to verify']
                     : ['ZATCA QR — scan to verify',     'رمز هيئة الزكاة — امسح للتحقق'],
    legal:      settings.enableZatca
                  ? (isAr ? 'فاتورة متوافقة مع المرحلة الأولى من هيئة الزكاة والضريبة والجمارك'
                           : 'ZATCA Phase 1 compliant invoice with TLV-encoded QR code.')
                  : (isAr ? `صادرة بواسطة Khayt · ${t('inv.generated_by') || 'Professional Invoice'}`
                           : `Generated by Khayt · ${t('inv.generated_by') || 'Professional Invoice'}`),
  };

  // Pretty label: primary on top, smaller secondary underneath
  const pair = (k) => {
    const [p, s] = L[k];
    return `${escapeHtml(p)} <span class="sub${isAr ? ' ltr' : ' rtl'}">${escapeHtml(s)}</span>`;
  };

  // Bill-to: real client name, OR generic walk-in label
  const linkedClient = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const hasName = (order.project || '').trim().length > 0;
  const billToName = hasName ? order.project : t('inv.walk_in');
  const billToSub  = hasName
    ? (linkedClient ? renderClientSub(linkedClient) : '')
    : `<div class="name-sub">${isAr ? 'بدون عميل محدد' : 'No specific client'}</div>`;

  // Lines
  const orderExtraLines = order.extraLines || [];
  const orderExtraTotal = orderExtraLines.reduce((s, l) => s + (+l.amount || 0), 0);
  const lines = (order.parts && order.parts.length > 0)
    ? order.parts
    : [{ name: t('inv.services_default'), material: order.material, printTime: order.printTime, baseCost: order.price }];
  const totalBase = lines.reduce((s, p) => s + (+p.baseCost || 0), 0);
  // Pool for parts = total price minus shipping minus extra lines (fixed fees)
  const partsPool = +order.price - (+order.shippingCost || 0) - orderExtraTotal;
  const linesHtml = lines.map(p => {
    const share = totalBase > 0 ? (p.baseCost / totalBase) * partsPool : partsPool / lines.length;
    const meta = [
      p.material,
      p.printTime ? `${p.printTime} hrs` : '',
      p.printWeight ? `${Math.round(p.printWeight)} g` : '',
      p.layerHeight ? `${p.layerHeight}mm` : '',
      p.infill ? `${p.infill}% infill` : '',
      p.profile || ''
    ].filter(Boolean).join(' · ');
    return `
      <tr>
        <td>
          <div class="desc-en">${escapeHtml(p.name)}</div>
          ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
        </td>
        <td class="center">${num(String(p.qty || 1))}</td>
        <td class="amount">${fmtMoney(share)} <span style="color:var(--ink-mute); font-weight:500;">${invCurrSym}</span></td>
      </tr>`;
  }).join('');
  // Extra charge lines
  const extraLinesHtml = orderExtraLines.map(l => `
      <tr>
        <td><div class="desc-en">${escapeHtml(l.label || t('calc.extra_label_ph'))}</div></td>
        <td class="center">1</td>
        <td class="amount">${fmtMoney(+l.amount || 0)} <span style="color:var(--ink-mute); font-weight:500;">${invCurrSym}</span></td>
      </tr>`).join('');

  // Compact contact line in the header
  const contactBits = [
    settings.phone, settings.email,
    settings.cr ? `CR ${settings.cr}` : '',
    settings.vat ? `VAT ${settings.vat}` : ''
  ].filter(Boolean).join(' · ');

  // Choose business name & address based on language
  const bizPrimary    = isAr ? (settings.bizAr || settings.bizEn) : (settings.bizEn || settings.bizAr);
  const bizSecondary  = isAr ? (settings.bizEn || '') : (settings.bizAr || '');
  const addrPrimary   = isAr ? (settings.addrAr || settings.addrEn) : (settings.addrEn || settings.addrAr);
  const addrSecondary = isAr ? (settings.addrEn || '') : (settings.addrAr || '');

  const taglinePrimary   = isAr ? (settings.taglineAr || settings.taglineEn || '') : (settings.taglineEn || settings.taglineAr || '');
  const taglineSecondary = isAr ? (settings.taglineEn || '') : (settings.taglineAr || '');

  // Brand color: amber for quotes, user-chosen (or default) for invoices
  const invBrand     = isQuoteDoc ? '#92400e' : (settings.invAccentColor || '#5E2E14');
  const invAccent    = isQuoteDoc ? '#d97706' : (settings.invAccentColor || '#B8723D');
  const invHighlight = isQuoteDoc ? '#fef3c7' : '#fcefdc';

  // Terms / conditions section
  const termsPrimary   = isAr ? (settings.invTermsAr || settings.invTermsEn || '') : (settings.invTermsEn || settings.invTermsAr || '');
  const termsSecondary = isAr ? (settings.invTermsEn || '') : (settings.invTermsAr || '');
  const termsSectionHtml = termsPrimary.trim() ? `
    <div class="inv-terms">
      <div class="label-strip">
        <span>${escapeHtml(isAr ? 'الشروط والأحكام' : 'Terms & Conditions')}</span>
        <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Terms & Conditions' : 'الشروط والأحكام')}</span>
      </div>
      <p class="inv-terms-body">${escapeHtml(termsPrimary)}</p>
      ${termsSecondary ? `<p class="inv-terms-body sec">${escapeHtml(termsSecondary)}</p>` : ''}
    </div>` : '';

  // Hijri date display (always bilingual when toggle is on)
  const hijri = settings.useHijri ? hijriDate(order.date, 'short') : '';

  // Bank / payment info section — only render if at least one bank field is set
  const hasBank = (settings.bankName || settings.iban || settings.accountHolder);
  const bankSectionHtml = hasBank ? `
    <div class="bank-section">
      <div class="label-strip">
        <span>${escapeHtml(isAr ? 'بيانات الدفع' : 'Payment information')}</span>
        <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Payment information' : 'بيانات الدفع')}</span>
      </div>
      <div class="bank-grid">
        ${settings.bankName ? `<span class="k">${escapeHtml(t('inv.bank'))}</span><span class="v">${escapeHtml(settings.bankName)}</span>` : ''}
        ${settings.accountHolder ? `<span class="k">${escapeHtml(t('inv.account'))}</span><span class="v">${escapeHtml(settings.accountHolder)}</span>` : ''}
        ${settings.iban ? `<span class="k">${escapeHtml(t('inv.iban'))}</span><span class="v" style="letter-spacing:0.05em;">${escapeHtml(settings.iban.replace(/(.{4})/g, '$1 ').trim())}</span>` : ''}
      </div>
      ${(settings.acceptedPayments && settings.acceptedPayments.length > 0) ? `
        <div class="accepted-strip">
          <span class="label">${escapeHtml(t('inv.accepted'))}</span>
          <span class="methods">
            ${settings.acceptedPayments.map(m => `<span class="pm-pill ${m}">${escapeHtml(t('pay.method.' + m))}</span>`).join('')}
          </span>
        </div>` : ''}
      ${payQrSvg ? `
        <div class="pay-qr-row">
          <div class="pay-qr-code">${payQrSvg}</div>
          <div class="pay-qr-label">
            <span>${escapeHtml(isAr ? 'امسح للدفع' : 'Scan to pay')}</span>
            <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Scan to pay' : 'امسح للدفع')}</span>
          </div>
        </div>` : ''}
    </div>` : '';

  // "Paid" stamp overlay
  const paidStampHtml = isPaid ? `<div class="paid-stamp">${escapeHtml(isAr ? 'مدفوع' : 'PAID')}</div>` : '';

  area.innerHTML = `
    <div class="inv-wrap">
    <div class="inv-top-bar" style="background:${invBrand};"></div>
    <div class="inv" dir="${dir}" lang="${i18n.current}" style="--brand:${invBrand}; --accent:${invAccent}; --highlight:${invHighlight};">
      ${paidStampHtml}

      <div class="inv-header">
        <div class="biz">
          <div class="mark">${settings.bizLogo ? `<img src="${settings.bizLogo}" style="max-height:80px; max-width:150px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name">
            <h1>${escapeHtml(bizPrimary || 'Khayt')}</h1>
            ${taglinePrimary ? `<div class="biz-tagline">${escapeHtml(taglinePrimary)}</div>` : ''}
            ${taglineSecondary ? `<div class="biz-tagline sec ${isAr ? 'ltr' : 'ar'}">${escapeHtml(taglineSecondary)}</div>` : ''}
            ${bizSecondary ? `<div class="biz-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(bizSecondary)}</div>` : ''}
            <div class="biz-meta">
              ${addrPrimary ? `<p>${escapeHtml(addrPrimary)}</p>` : ''}
              ${addrSecondary ? `<p class="${isAr ? 'ltr' : 'ar-line ar'}">${escapeHtml(addrSecondary)}</p>` : ''}
              ${contactBits ? `<p>${escapeHtml(contactBits)}</p>` : ''}
            </div>
          </div>
        </div>

        <div class="doc">
          <div class="title">${escapeHtml(L.invoice[0])}</div>
          <div class="title-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.invoice[1])}</div>
          <div class="meta">
            <div class="meta-row">
              <span class="k">${escapeHtml(L.no[0])}</span>
              <span class="v">${escapeHtml(num(order.id))}</span>
            </div>
            <div class="meta-row">
              <span class="k">${escapeHtml(L.date[0])}</span>
              <span class="v">${escapeHtml(num(issuedDate))}</span>
            </div>
            ${hijri ? `
            <div class="meta-row">
              <span class="k">${escapeHtml(t('inv.hijri'))}</span>
              <span class="v">${escapeHtml(num(hijri))}</span>
            </div>` : ''}
            ${issuedTime ? `
            <div class="meta-row">
              <span class="k">${escapeHtml(L.time[0])}</span>
              <span class="v">${escapeHtml(num(issuedTime))}</span>
            </div>` : ''}
          </div>
        </div>
      </div>

      <div class="bill-to">
        <div class="label">
          <span>${escapeHtml(L.billTo[0])}</span>
          <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.billTo[1])}</span>
        </div>
        <div>
          <div class="name">${escapeHtml(billToName)}</div>
          ${billToSub}
        </div>
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th>${pair('description')}</th>
            <th style="text-align:center; width: 60px;">${pair('qty')}</th>
            <th class="th-amount" style="width: 150px;">${pair('amount')}</th>
          </tr>
        </thead>
        <tbody>${linesHtml}${extraLinesHtml}</tbody>
      </table>

      <div class="totals">
        ${settings.enableZatca ? `
        <div class="qr-box">
          <div class="qr-svg">${qrSvg || '<div style="font-size:11px;color:#888;padding:24px;">QR unavailable</div>'}</div>
          <div class="qr-label">
            <span>${escapeHtml(L.qrLabel[0])}</span>
            <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.qrLabel[1])}</span>
          </div>
        </div>` : ''}
        <div class="summary">
          <div class="row">
            <span class="label-en">${escapeHtml(L.subtotal[0])}</span>
            <span class="v">${order.priceBeforeDiscount ? fmtMoney(order.priceBeforeDiscount) : (subtotal || total)} ${invCurrSym}</span>
          </div>
          ${order.discountPct > 0 ? `
          <div class="row" style="color:#22c55e;">
            <span class="label-en">${escapeHtml(isAr ? `خصم (${order.discountPct}%)` : `Discount (${order.discountPct}%)`)}</span>
            <span class="v">−${fmtMoney((order.priceBeforeDiscount || 0) - ((+order.price || 0) - (+order.shippingCost || 0)))} ${invCurrSym}</span>
          </div>` : ''}
          ${(+order.shippingCost || 0) > 0 ? `
          <div class="row">
            <span class="label-en">${escapeHtml(isAr ? 'رسوم الشحن' : 'Shipping')}</span>
            <span class="v">${fmtMoney(+order.shippingCost)} ${invCurrSym}</span>
          </div>` : ''}
          ${vatRate > 0 ? `
          <div class="row">
            <span class="label-en">${escapeHtml(L.vat[0])}</span>
            <span class="v">${vatAmount} ${invCurrSym}</span>
          </div>` : ''}
          <div class="row grand">
            <span>
              <span class="label-en">${escapeHtml(L.totalDue[0])}</span>
              <span class="label-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.totalDue[1])}</span>
            </span>
            <span class="v">${total}<span class="unit">${invCurrSym}</span></span>
          </div>
        </div>
      </div>

      ${bankSectionHtml}

      ${(order.invoiceNotes || '').trim() ? `
      <div class="inv-notes-section">
        <div class="label-strip">
          <span>${escapeHtml(isAr ? 'ملاحظات' : 'Notes')}</span>
          <span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? 'Notes' : 'ملاحظات')}</span>
        </div>
        <p class="inv-notes-body">${escapeHtml(order.invoiceNotes)}</p>
      </div>` : ''}

      ${termsSectionHtml}

      <div class="footer">
        <div class="thanks">${escapeHtml(isAr ? (settings.footerAr || t('inv.thank_you')) : (settings.footerEn || t('inv.thank_you')))}</div>
        ${(isAr ? settings.footerEn : settings.footerAr) ? `<div class="thanks-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(isAr ? settings.footerEn : settings.footerAr)}</div>` : ''}
        <div class="legal">${escapeHtml(L.legal)}</div>
      </div>

    </div>
    </div>`;

  // Apply Arabic numerals to body content after render (line items / amounts)
  if (isAr && settings.useArabicNumerals) {
    area.querySelectorAll('.amount, .v, .qty, td.center, td.amount, .biz-meta, .meta').forEach(el => {
      el.textContent = toArabicNumerals(el.textContent);
    });
  }
}

// Sub-line of contact info beneath the bill-to name (when client is linked)
function renderClientSub(c) {
  const bits = [c.phone, c.email].filter(Boolean).join(' · ');
  if (!bits) return '';
  return `<div class="name-sub">${escapeHtml(bits)}</div>`;
}

// Pretty date for invoice headers — e.g. "21 May 2026"
function formatPrintDate(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return isoDate; }
}

// The Layered Tuwaiq mark, inlined for the invoice header (Strata palette)
const BRAND_MARK_SVG = `
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="152" y="720" width="720" height="64" rx="12" fill="#5E2E14"/>
  <rect x="180" y="648" width="664" height="64" rx="12" fill="#A8542A"/>
  <rect x="252" y="576" width="520" height="64" rx="12" fill="#D88A3D"/>
  <rect x="342" y="504" width="340" height="64" rx="12" fill="#EFB46E"/>
  <rect x="422" y="432" width="180" height="64" rx="12" fill="#F5D6A3"/>
</svg>`;

/* ============================================================
   Settings
   ============================================================ */
function updateLogoPreview() {
  const preview = $('#logoPreview');
  const removeBtn = $('#btnRemoveLogo');
  if (!preview) return;
  if (settings.bizLogo) {
    preview.src = settings.bizLogo;
    preview.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    preview.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function loadSettingsIntoForm() {
  $('#set_bizEn').value     = settings.bizEn     || '';
  $('#set_bizAr').value     = settings.bizAr     || '';
  $('#set_vat').value       = settings.vat       || '';
  $('#set_cr').value        = settings.cr        || '';
  $('#set_phone').value     = settings.phone     || '';
  $('#set_email').value     = settings.email     || '';
  $('#set_addrEn').value    = settings.addrEn    || '';
  $('#set_addrAr').value    = settings.addrAr    || '';
  $('#set_lang').value      = settings.lang      || 'en';
  $('#set_theme').value     = settings.theme     || 'dark';
  $('#set_invPrefix').value = settings.invPrefix || 'INV';
  $('#set_footerEn').value  = settings.footerEn  || '';
  $('#set_footerAr').value  = settings.footerAr  || '';
  $('#set_autoDeduct').checked = settings.autoDeduct !== false;
  $('#set_lowStock').value  = settings.lowStockThreshold ?? 200;
  // 1.3 additions
  $('#set_bankName').value      = settings.bankName      || '';
  $('#set_accountHolder').value = settings.accountHolder || '';
  $('#set_iban').value          = settings.iban          || '';
  $('#set_useHijri').checked    = settings.useHijri !== false;
  $('#set_useArabicNumerals').checked = !!settings.useArabicNumerals;
  $('#set_autoBackup').checked  = settings.autoBackup !== false;
  $('#set_enableVat').checked   = !!settings.enableVat;
  $('#set_vatRate').value       = settings.vatRate ?? 15;
  $('#set_quotePrefix').value   = settings.quotePrefix || 'QUO';
  $('#set_useIcloud').checked   = !!settings.useIcloud;
  $('#set_taglineEn').value     = settings.taglineEn   || '';
  $('#set_taglineAr').value     = settings.taglineAr   || '';
  $('#set_invAccent').value     = settings.invAccentColor || '#5E2E14';
  $('#set_invTermsEn').value    = settings.invTermsEn  || '';
  $('#set_invTermsAr').value    = settings.invTermsAr  || '';
  $('#set_monthlyGoal').value     = settings.monthlyGoal ?? 0;
  $('#set_supplierPhone').value   = settings.supplierPhone || '';
  updateLogoPreview();
  // Accepted payments checkboxes
  $$('#acceptedPaymentsList input[data-pm]').forEach(cb => {
    cb.checked = (settings.acceptedPayments || []).includes(cb.dataset.pm);
  });
  // 2.0 worldwide / regional
  const curSel = $('#set_currency');
  if (curSel && !curSel.options.length) {
    curSel.innerHTML = Object.entries(CURRENCIES)
      .map(([code, c]) => `<option value="${code}">${escapeHtml(c.label)}</option>`)
      .join('');
  }
  if (curSel) curSel.value = settings.currency || 'SAR';
  const langSelHdr = $('#langSelect');
  if (langSelHdr) langSelHdr.value = settings.lang || 'en';
  const zatcaEl = $('#set_enableZatca');
  if (zatcaEl) zatcaEl.checked = settings.enableZatca !== false;
  const donEl = $('#set_donationUrl');
  if (donEl) donEl.value = settings.donationUrl || '';
  const sponsorBtn = $('#btnGithubSponsors');
  if (sponsorBtn) sponsorBtn.href = settings.donationUrl || 'https://github.com/sponsors';
  // Min-margin warning threshold
  const minMargEl = $('#set_minMarginPct');
  if (minMargEl) minMargEl.value = settings.minMarginPct ?? 0;
  // Expense budgets
  EXP_CATEGORIES.forEach(c => {
    const el = $(`#set_budget_${c}`);
    if (el) el.value = (settings.expBudgets || {})[c] || 0;
  });
  // Post-processing checklist
  renderPostChecklistSettings();
  // Custom order fields
  renderCustomFieldsSettings();
  refreshCurrencyLabels();
  updateLastBackupDisplay();
  // Feature 8 / Task 0: Storage usage display
  renderStorageUsage();
}

/* Feature 8 / Task 0: File-store size display in Settings */
async function renderStorageUsage() {
  const el = $('#storageUsageDisplay');
  if (!el) return;
  let sizeBytes = 0;
  try {
    sizeBytes = await window.hubAPI?.storeSize?.() || 0;
  } catch(e) {}
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
  el.innerHTML = `
    <div style="margin-bottom:6px;">
      <span style="font-weight:600;">Storage file:</span> khayt-store.json
    </div>
    <div style="margin-bottom:6px;">
      <span style="font-weight:600;">Size:</span>
      <span style="color:var(--success);">${sizeMB} MB</span>
    </div>
    <div style="color:var(--success); font-size:12px;">No size limit — file-based storage ✓</div>
    <button id="btnRevealStoreFile" class="btn small" style="margin-top:10px;">Reveal data file</button>`;
  el.querySelector('#btnRevealStoreFile')?.addEventListener('click', () => {
    window.hubAPI?.revealStoreFile?.();
  });
}

function saveSettingsFromForm() {
  const accepted = $$('#acceptedPaymentsList input[data-pm]')
    .filter(cb => cb.checked).map(cb => cb.dataset.pm);
  settings = {
    bizEn:     $('#set_bizEn').value.trim(),
    bizAr:     $('#set_bizAr').value.trim(),
    vat:       $('#set_vat').value.trim(),
    cr:        $('#set_cr').value.trim(),
    phone:     $('#set_phone').value.trim(),
    email:     $('#set_email').value.trim(),
    addrEn:    $('#set_addrEn').value.trim(),
    addrAr:    $('#set_addrAr').value.trim(),
    lang:      $('#set_lang').value,
    theme:     $('#set_theme').value,
    invPrefix: $('#set_invPrefix').value.trim() || 'INV',
    footerEn:  $('#set_footerEn').value.trim(),
    footerAr:  $('#set_footerAr').value.trim(),
    autoDeduct: $('#set_autoDeduct').checked,
    lowStockThreshold: Math.max(0, num($('#set_lowStock').value, 200)),
    // 1.3 additions
    bankName:      $('#set_bankName').value.trim(),
    accountHolder: $('#set_accountHolder').value.trim(),
    iban:          $('#set_iban').value.trim().replace(/\s+/g, ''),
    acceptedPayments: accepted,
    useHijri:      $('#set_useHijri').checked,
    useArabicNumerals: $('#set_useArabicNumerals').checked,
    autoBackup:    $('#set_autoBackup').checked,
    enableVat:     $('#set_enableVat').checked,
    vatRate:       Math.max(0, num($('#set_vatRate').value, 15)),
    bizLogo:       settings.bizLogo || '',
    taglineEn:     $('#set_taglineEn').value.trim(),
    taglineAr:     $('#set_taglineAr').value.trim(),
    invAccentColor:$('#set_invAccent').value || '#5E2E14',
    invTermsEn:    $('#set_invTermsEn').value.trim(),
    invTermsAr:    $('#set_invTermsAr').value.trim(),
    quotePrefix:   $('#set_quotePrefix').value.trim() || 'QUO',
    useIcloud:     $('#set_useIcloud').checked,
    monthlyGoal:   Math.max(0, num($('#set_monthlyGoal').value, 0)),
    supplierPhone: $('#set_supplierPhone').value.trim(),
    // 2.0 worldwide / regional
    currency:      $('#set_currency')?.value    || 'SAR',
    enableZatca:   !!$('#set_enableZatca')?.checked,
    donationUrl:   $('#set_donationUrl')?.value.trim() || '',
    firstRunDone:  true,
    // Operational settings
    minMarginPct:  Math.max(0, Math.min(100, num($('#set_minMarginPct')?.value, 0))),
    expBudgets:    Object.fromEntries(EXP_CATEGORIES.map(c => [c, Math.max(0, num($(`#set_budget_${c}`)?.value, 0))])),
    postChecklist: settings.postChecklist || [],
  };
  saveAll();
  i18n.set(settings.lang);
  applyTheme(settings.theme);
  renderInventory();
  // Keep sponsor link live after save
  const sponsorBtn = $('#btnGithubSponsors');
  if (sponsorBtn) sponsorBtn.href = settings.donationUrl || 'https://github.com/sponsors';
  refreshCurrencyLabels();
  toast(t('set.saved'), 'success');
}

/* ============================================================
   Backup restore UI (Feature 6)
   ============================================================ */
async function openRestoreBackupModal() {
  if (!window.hubAPI?.listBackups) { toast(t('set.restore_error'), 'error'); return; }
  let backups = [];
  try { backups = await window.hubAPI.listBackups(); } catch (_) {}
  if (backups.length === 0) {
    toast(t('set.restore_error') + ': no backups found', 'error');
    return;
  }
  const listHtml = backups.map((b, i) => `
    <label style="display:flex; align-items:center; gap:10px; padding:6px 8px; border-radius:6px; cursor:pointer; border:1px solid var(--border); margin-bottom:6px; ${i === 0 ? 'background:rgba(91,156,240,0.07);' : ''}">
      <input type="radio" name="backupChoice" value="${escapeHtml(b.path)}" ${i === 0 ? 'checked' : ''} style="width:auto; margin:0;">
      <span style="flex:1; font-size:13px; font-weight:${i === 0 ? '600' : '400'};">${escapeHtml(b.name)}</span>
      <span style="font-size:11px; color:var(--text-muted);">${new Date(b.mtime).toLocaleDateString()}</span>
    </label>`).join('');
  openFormModal({
    title: t('set.restore_title'),
    saveLabel: t('common.confirm'),
    sizeLg: false,
    bodyHtml: `
      <p style="font-size:13px; color:var(--text-muted); margin:0 0 14px;">${escapeHtml(t('set.restore_hint'))}</p>
      <div id="backupList">${listHtml}</div>`,
    async onSave(modal) {
      const chosen = modal.querySelector('input[name="backupChoice"]:checked');
      if (!chosen) return false;
      const ok = await confirmModal(t('set.restore_confirm'), { danger: true });
      if (!ok) return false;
      try {
        const json = await window.hubAPI.restoreBackup(chosen.value);
        if (!json) { toast(t('set.restore_error'), 'error'); return false; }
        importData(new File([json], 'restore.json', { type: 'application/json' }));
        toast(t('set.restore_success'), 'success');
        return true;
      } catch (e) {
        console.error('restore backup failed', e);
        toast(t('set.restore_error'), 'error');
        return false;
      }
    }
  });
}

/* ============================================================
   Post-processing checklist (settings management)
   ============================================================ */
function renderPostChecklistSettings() {
  const el = $('#postChecklistItems');
  if (!el) return;
  const list = settings.postChecklist || [];
  if (list.length === 0) {
    el.innerHTML = `<div style="color:var(--text-muted); font-size:12.5px; padding:6px 0;" data-i18n="post.empty">${escapeHtml(t('post.empty'))}</div>`;
    return;
  }
  el.innerHTML = list.map((ch, i) => `
    <div class="post-check-setting-row">
      <span style="flex:1; font-size:13px;">${escapeHtml(ch.label)}</span>
      <button class="btn danger small" data-act="del-post-check" data-idx="${i}" aria-label="${escapeHtml(t('common.delete'))}">×</button>
    </div>`).join('');
}

function addPostCheckItem() {
  const inp = $('#postCheckInput');
  if (!inp) return;
  const label = inp.value.trim();
  if (!label) return;
  if (!settings.postChecklist) settings.postChecklist = [];
  settings.postChecklist.push({ id: uid('PCH'), label });
  inp.value = '';
  saveAll();
  renderPostChecklistSettings();
}

function deletePostCheckItem(idx) {
  if (!settings.postChecklist) return;
  settings.postChecklist.splice(idx, 1);
  saveAll();
  renderPostChecklistSettings();
  renderKanban(); // refresh cards
}

/* ============================================================
   Custom order metadata fields — settings management
   ============================================================ */
function renderCustomFieldsSettings() {
  const el = $('#customFieldsList');
  if (!el) return;
  const fields = settings.customFields || [];
  if (fields.length === 0) {
    el.innerHTML = `<div style="color:var(--text-muted); font-size:12.5px; padding:6px 0;">${escapeHtml(t('set.custom_fields_empty'))}</div>`;
    return;
  }
  el.innerHTML = fields.map((f, i) => `
    <div class="post-check-setting-row">
      <span style="flex:1; font-size:13px;">${escapeHtml(f.label)}</span>
      <span style="font-size:11px; color:var(--text-muted); margin-inline-end:8px;">${escapeHtml(f.type || 'text')}</span>
      <button class="btn danger small" data-act="del-custom-field" data-idx="${i}" aria-label="${escapeHtml(t('common.delete'))}">×</button>
    </div>`).join('');
}

function addCustomField() {
  const inp = $('#customFieldInput');
  if (!inp) return;
  const label = inp.value.trim();
  if (!label) return;
  if (!settings.customFields) settings.customFields = [];
  settings.customFields.push({ id: uid('CF'), label, type: 'text' });
  inp.value = '';
  saveAll();
  renderCustomFieldsSettings();
  toast(t('set.custom_field_added'), 'success');
}

function deleteCustomField(idx) {
  if (!settings.customFields) return;
  settings.customFields.splice(idx, 1);
  saveAll();
  renderCustomFieldsSettings();
}

function exportData() {
  downloadBlob(
    new Blob([JSON.stringify({
      version: 4,
      exportedAt: new Date().toISOString(),
      printLog, inventory, templates, products, clients, settings, expenses, machines, waTemplates, wasteLog
    }, null, 2)], { type: 'application/json' }),
    `khayt-${new Date().toISOString().split('T')[0]}.json`
  );
  toast(t('set.exported'), 'success');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (Array.isArray(data.printLog))  printLog  = data.printLog;
      if (Array.isArray(data.inventory)) inventory = data.inventory;
      if (Array.isArray(data.templates)) templates = data.templates;
      if (Array.isArray(data.products))  products  = data.products;
      if (Array.isArray(data.clients))   clients   = data.clients;
      if (Array.isArray(data.expenses))  expenses  = data.expenses;
      if (Array.isArray(data.machines))    machines    = data.machines;
      if (Array.isArray(data.waTemplates)) waTemplates = data.waTemplates;
      if (Array.isArray(data.wasteLog))    wasteLog    = data.wasteLog;
      if (data.settings && typeof data.settings === 'object') {
        settings = Object.assign(defaultSettings(), data.settings);
      }
      saveAll();
      initialRender();
      loadSettingsIntoForm();
      applyTheme(settings.theme);
      i18n.set(settings.lang);
      toast(t('set.imported'), 'success');
    } catch (e) {
      console.error(e);
      toast(t('set.import_error'), 'error');
    }
  };
  reader.readAsText(file);
}

async function resetAllData() {
  const ok = await confirmModal(t('set.reset_q'), { danger: true });
  if (!ok) return;
  printLog = []; templates = []; products = []; clients = []; expenses = []; machines = []; waTemplates = defaultWaTemplates(); wasteLog = [];
  inventory = [
    { id: 'seed-1', material: 'PLA+ 2.0',   cost: 75, weight: 1000 },
    { id: 'seed-2', material: 'Sunlu PETG', cost: 85, weight: 1000 },
  ];
  settings = defaultSettings();
  saveAll();
  initialRender();
  loadSettingsIntoForm();
  applyTheme('dark');
  i18n.set('en');
  toast(t('log.cleared'), 'success');
}

/* ============================================================
   Render-everything entry point
   ============================================================ */
function initialRender() {
  renderPrinterPresets();
  renderQuoteTemplates();
  renderMachines();
  renderMachineDropdown();
  renderWaTemplates();
  renderInventory();
  renderConsumables();
  renderSuppliers();
  renderPurchaseOrders();
  renderLogs();
  renderKanban();
  renderAnalytics();
  renderBuild();
  renderCatalog();
  renderClients();
  renderPortfolio();
  renderDashboard();
  renderExpenses();
  checkDueDateNotifications();
  checkRecurringOrders();
}

/* ============================================================
   Global ⌘K / Ctrl+K search
   ============================================================ */
let globalSearchOpen = false;

function openGlobalSearch() {
  const overlay = $('#globalSearchOverlay');
  const input   = $('#globalSearchInput');
  if (!overlay) return;
  globalSearchOpen = true;
  overlay.style.display = 'flex';
  input.value = '';
  input.focus();
  renderGlobalResults('');
}

function closeGlobalSearch() {
  const overlay = $('#globalSearchOverlay');
  if (!overlay) return;
  globalSearchOpen = false;
  overlay.style.display = 'none';
}

function renderGlobalResults(term) {
  const el = $('#globalSearchResults');
  if (!el) return;
  if (!term.trim()) {
    el.innerHTML = `<div class="gs-hint">${escapeHtml(t('search.hint'))}</div>`;
    return;
  }
  const q = term.toLowerCase();
  const sections = [];

  // Orders — search id, project, material, tags, notes, tracking, and linked client name
  const matchOrders = printLog.filter(o => {
    if ((o.id || '').toLowerCase().includes(q)) return true;
    if ((o.project || '').toLowerCase().includes(q)) return true;
    if ((o.material || '').toLowerCase().includes(q)) return true;
    if ((o.notes || '').toLowerCase().includes(q)) return true;
    if ((o.trackingNumber || '').toLowerCase().includes(q)) return true;
    if ((o.tags || []).some(tg => tg.toLowerCase().includes(q))) return true;
    if (o.clientId) {
      const c = clients.find(x => x.id === o.clientId);
      if (c && ((c.nameEn || '').toLowerCase().includes(q) || (c.nameAr || '').toLowerCase().includes(q))) return true;
    }
    return false;
  }).slice(0, 6);
  if (matchOrders.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.orders'))}</div>`);
    sections.push(matchOrders.map(o => `
      <div class="gs-result" data-gs-action="order" data-gs-id="${escapeHtml(o.id)}">
        <span class="gs-icon">📋</span>
        <span class="gs-title">${escapeHtml(o.project || o.id)}</span>
        <span class="gs-meta">${escapeHtml(o.id)} · ${fmtPrice(o.price)} · <span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span></span>
      </div>`).join(''));
  }

  // Clients
  const matchClients = clients.filter(c =>
    (c.nameEn || '').toLowerCase().includes(q) ||
    (c.nameAr || '').toLowerCase().includes(q) ||
    (c.phone  || '').toLowerCase().includes(q) ||
    (c.email  || '').toLowerCase().includes(q)
  ).slice(0, 4);
  if (matchClients.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.clients'))}</div>`);
    sections.push(matchClients.map(c => `
      <div class="gs-result" data-gs-action="client" data-gs-id="${escapeHtml(c.id)}">
        <span class="gs-icon">👤</span>
        <span class="gs-title">${escapeHtml(localName(c))}</span>
        <span class="gs-meta">${escapeHtml(c.phone || c.email || '')}</span>
      </div>`).join(''));
  }

  // Products
  const matchProducts = products.filter(p =>
    (p.nameEn || '').toLowerCase().includes(q) ||
    (p.nameAr || '').toLowerCase().includes(q)
  ).slice(0, 4);
  if (matchProducts.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.products'))}</div>`);
    sections.push(matchProducts.map(p => `
      <div class="gs-result" data-gs-action="product" data-gs-id="${escapeHtml(p.id)}">
        <span class="gs-icon">📦</span>
        <span class="gs-title">${escapeHtml(localName(p))}</span>
        <span class="gs-meta">${fmtPrice(p.basePrice || 0)}</span>
      </div>`).join(''));
  }

  // Inventory
  const matchInv = inventory.filter(i => (i.material || '').toLowerCase().includes(q)).slice(0, 4);
  if (matchInv.length) {
    sections.push(`<div class="gs-group-label">${escapeHtml(t('search.inventory'))}</div>`);
    sections.push(matchInv.map(i => `
      <div class="gs-result" data-gs-action="inventory">
        <span class="gs-icon">🧵</span>
        <span class="gs-title">${escapeHtml(i.material)}</span>
        <span class="gs-meta">${Math.round(i.weight)}g · ${fmtPrice(i.cost)}</span>
      </div>`).join(''));
  }

  el.innerHTML = sections.length ? sections.join('') : `<div class="gs-hint">${escapeHtml(t('search.no_results'))}</div>`;

  el.querySelectorAll('.gs-result').forEach(row => {
    row.addEventListener('click', () => {
      const action = row.dataset.gsAction;
      const id     = row.dataset.gsId;
      closeGlobalSearch();
      if (action === 'order')     { switchTab('logs-tab');     setTimeout(() => { logSearchTerm = id; renderLogs(); }, 50); }
      if (action === 'client')    { switchTab('clients-tab');  setTimeout(() => { clientSearchTerm = id; renderClients(); }, 50); }
      if (action === 'product')   { switchTab('catalog-tab'); }
      if (action === 'inventory') { switchTab('inventory-tab'); }
    });
  });
}

/* ============================================================
   In-app help system (Feature 9)
   ============================================================ */
function openHelpModal() {
  const tabs = ['start', 'calc', 'queue', 'invoice', 'backup'];
  const tabNavHtml = tabs.map((tab, i) => `<button class="help-tab-btn${i === 0 ? ' active' : ''}" data-htab="${tab}">${escapeHtml(t('help.tab.' + tab))}</button>`).join('');
  const tabContentHtml = tabs.map((tab, i) => `
    <div class="help-tab-content${i === 0 ? ' active' : ''}" id="htab-${tab}">
      <div class="help-section">
        <h4>${escapeHtml(t('help.' + tab + '.h1'))}</h4>
        <p>${escapeHtml(t('help.' + tab + '.p1'))}</p>
        ${t('help.' + tab + '.h2') !== 'help.' + tab + '.h2' ? `<h4>${escapeHtml(t('help.' + tab + '.h2'))}</h4>` : ''}
        ${['li1','li2','li3'].some(k => t('help.' + tab + '.' + k) !== 'help.' + tab + '.' + k)
          ? `<ul>${['li1','li2','li3'].filter(k => t('help.' + tab + '.' + k) !== 'help.' + tab + '.' + k).map(k => `<li>${escapeHtml(t('help.' + tab + '.' + k))}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`).join('');

  openFormModal({
    title: t('help.title'),
    noSave: true,
    sizeLg: true,
    bodyHtml: `
      <div class="help-tab-nav">${tabNavHtml}</div>
      <div id="helpTabContents">${tabContentHtml}</div>`,
    onMount(modal) {
      modal.querySelector('.help-tab-nav').addEventListener('click', (e) => {
        const btn = e.target.closest('.help-tab-btn');
        if (!btn) return;
        modal.querySelectorAll('.help-tab-btn').forEach(b => b.classList.remove('active'));
        modal.querySelectorAll('.help-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tc = modal.querySelector('#htab-' + btn.dataset.htab);
        if (tc) tc.classList.add('active');
      });
    }
  });
}

/* ============================================================
   Feedback / Bug report modal
   ============================================================ */
function openFeedbackModal() {
  openFormModal({
    title: t('feedback.title'),
    saveLabel: t('feedback.send'),
    noSave: false,
    bodyHtml: `
      <label style="margin-top:0;">${escapeHtml(t('feedback.type'))}</label>
      <select id="fbType">
        <option value="feedback">${escapeHtml(t('feedback.type_feedback'))}</option>
        <option value="suggestion">${escapeHtml(t('feedback.type_suggestion'))}</option>
        <option value="bug">${escapeHtml(t('feedback.type_bug'))}</option>
      </select>
      <label style="margin-top:14px;">${escapeHtml(t('feedback.message'))}</label>
      <textarea id="fbMessage" rows="5" style="resize:vertical;" placeholder="${escapeHtml(t('feedback.message_ph'))}"></textarea>
      <label style="margin-top:14px;">${escapeHtml(t('feedback.email'))} <span style="color:var(--text-muted);font-size:11.5px;">(${escapeHtml(t('common.optional'))})</span></label>
      <input type="email" id="fbEmail" placeholder="you@example.com">
      <p style="font-size:11.5px;color:var(--text-muted);margin:10px 0 0;">${escapeHtml(t('feedback.hint'))}</p>
      <div style="margin-top:12px;">
        <button id="btnFbGithub" class="btn ghost small" type="button">🐛 ${escapeHtml(t('feedback.github_btn'))}</button>
      </div>`,
    onMount(modal) {
      modal.querySelector('#btnFbGithub').addEventListener('click', () => {
        const url = 'https://github.com/TurkiAlballaa/AtharTuwaiq/issues/new';
        if (window.hubAPI?.openExternal) window.hubAPI.openExternal(url);
        else window.open(url);
      });
    },
    onSave(modal) {
      const type    = modal.querySelector('#fbType').value;
      const message = (modal.querySelector('#fbMessage').value || '').trim();
      const email   = (modal.querySelector('#fbEmail').value  || '').trim();
      if (!message) { toast(t('feedback.err_empty'), 'error'); return false; }
      const subject = encodeURIComponent(`[Khayt] ${t('feedback.type_' + type)}`);
      const body = encodeURIComponent(
        `Type: ${t('feedback.type_' + type)}\n\n${message}${email ? `\n\nFrom: ${email}` : ''}`
      );
      const mailto = `mailto:khayt@athartuwaiq.com?subject=${subject}&body=${body}`;
      if (window.hubAPI?.openExternal) window.hubAPI.openExternal(mailto);
      else window.open(mailto);
      toast(t('feedback.sent'), 'success');
      return true;
    }
  });
}

/* ============================================================
   Event wiring
   ============================================================ */
function wireEvents() {
  // Global search
  const btnGs = $('#btnGlobalSearch');
  if (btnGs) btnGs.addEventListener('click', openGlobalSearch);

  // Help button (Feature 9)
  $('#btnHelp')?.addEventListener('click', openHelpModal);

  // Feedback button (header + settings)
  $$('#btnFeedback, #btnFeedbackSettings').forEach(b => b?.addEventListener('click', openFeedbackModal));

  // Extra charge lines (calculator)
  const btnAEL = $('#btnAddExtraLine');
  if (btnAEL) btnAEL.addEventListener('click', () => {
    currentExtraLines.push({ id: uid('EL'), label: '', amount: 0 });
    renderExtraLines();
  });

  // Batch status move
  $('#btnBatchMove')?.addEventListener('click', batchMoveStatus);

  // Tabs
  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // Language select
  $('#langSelect').addEventListener('change', (e) => {
    const lang = e.target.value;
    i18n.set(lang);
    settings.lang = lang;
    saveAll();
    refreshCurrencyLabels();
    initialRender();
  });

  // Theme toggle
  $('#themeToggle').addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    settings.theme = next;
    saveAll();
  });

  // Calculator
  $('#filamentSelect').addEventListener('change', handleFilamentChange);
  $$('#calculator-tab input, #calculator-tab select').forEach(el => {
    if (el.id !== 'clientInput' && el.id !== 'printerPreset') el.addEventListener('input', updateGrandTotal);
  });
  $('#btnAddPart').addEventListener('click', addPart);
  $('#btnSaveQuote').addEventListener('click', logPrint);

  // Extra materials (Feature 8)
  $('#btnAddExtraMaterial')?.addEventListener('click', () => {
    currentExtraMaterials.push({ material: '', weight: 0 });
    renderExtraMaterials();
  });

  // Feature 5: Add price tier
  $('#btnAddPriceTier')?.addEventListener('click', () => {
    currentPriceTiers.push({ minQty: 1, pricePerUnit: 0 });
    renderPriceTiers();
  });

  // Printer presets
  $('#printerPreset').addEventListener('change', (e) => {
    if (e.target.value) applyPreset(e.target.value);
    updateDeletePresetBtn();
  });
  $('#btnSavePreset').addEventListener('click', saveCurrentAsPreset);
  $('#btnDeletePreset').addEventListener('click', deleteCurrentPreset);

  // Quote templates
  $('#quoteTplSelect').addEventListener('change', updateDeleteTplBtn);
  $('#btnLoadTpl').addEventListener('click', loadQuoteTemplate);
  $('#btnSaveTpl').addEventListener('click', saveQuoteTemplate);
  $('#btnDeleteTpl').addEventListener('click', deleteQuoteTemplate);

  // Client autocomplete
  const clientInput = $('#clientInput');
  clientInput.addEventListener('focus', renderClientSuggestions);
  clientInput.addEventListener('input', () => {
    currentClientId = null; // typing implies new/different client
    renderClientSuggestions();
  });
  clientInput.addEventListener('blur', hideClientSuggestions);
  $('#clientSuggestions').addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    if (item.dataset.cid) {
      const c = clients.find(x => x.id === item.dataset.cid);
      if (c) {
        const dn = localName(c);
        clientInput.value = dn;
        currentClientId = c.id;
        // Auto-apply client's default discount
        if ((c.defaultDiscount || 0) > 0) {
          const discEl = $('#discountPct');
          if (discEl) { discEl.value = c.defaultDiscount; updateGrandTotal(); }
        }
        // Feature 4: check price list auto-fill
        if ((c.priceList || []).length > 0 && currentBuild.length > 0) {
          let applied = false;
          for (const part of currentBuild) {
            const pl = (c.priceList || []).find(p => p.product && part.name && part.name.toLowerCase().includes(p.product.toLowerCase()));
            if (pl && pl.price > 0) {
              part.unitCost = pl.price;
              part.baseCost = pl.price * (part.qty || 1);
              applied = true;
            }
          }
          if (applied) { renderBuild(); updateGrandTotal(); toast(t('ce.pl_autofill'), 'info', 2000); }
        }
      }
    } else if (item.dataset.act === 'cl-new') {
      // Open client editor with name pre-filled
      const name = item.dataset.name || clientInput.value;
      openClientEditor(null);
      setTimeout(() => {
        const m = $('#modalMount');
        if (m) {
          const ne = m.querySelector('[data-f="nameEn"]');
          if (ne) ne.value = name;
        }
      }, 30);
    }
    $('#clientSuggestions').style.display = 'none';
  });

  // Build cart row clicks
  $('#buildTableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'remove-part') removePart(+btn.dataset.idx);
    if (btn.dataset.act === 'edit-part')   editPart(+btn.dataset.idx);
  });

  // Inventory
  $('#btnAddInv').addEventListener('click', addInventoryItem);
  $('#btnBrowseCatalog').addEventListener('click', openFilamentCatalog);
  $('#btnScanLabel').addEventListener('click', openFilamentScanner);
  $('#inventoryTable').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'del-inv')           deleteInventoryItem(btn.dataset.id);
    if (btn.dataset.act === 'edit-inv')          openInventoryEditor(btn.dataset.id);
    if (btn.dataset.act === 'reorder-inv')       openReorderModal(btn.dataset.id);
    if (btn.dataset.act === 'adj-inv')           openStockAdjustModal(btn.dataset.id);
    if (btn.dataset.act === 'inv-spool-history') openSpoolHistory(btn.dataset.id);
    if (btn.dataset.act === 'inv-dry-log')       openDryingLog(btn.dataset.id);
  });

  // Consumables
  $('#btnAddConsumable')?.addEventListener('click', () => openConsumableEditor(null));
  $('#consumablesTable')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'edit-cons') openConsumableEditor(btn.dataset.id);
    if (btn.dataset.act === 'del-cons')  deleteConsumable(btn.dataset.id);
  });

  // Suppliers
  $('#btnAddSupplier')?.addEventListener('click', () => openSupplierEditor(null));
  $('#suppliersTable')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'edit-sup')      openSupplierEditor(btn.dataset.id);
    if (btn.dataset.act === 'del-sup')       deleteSupplier(btn.dataset.id);
    if (btn.dataset.act === 'log-purchase')  openLogPurchaseModal(btn.dataset.id);
    if (btn.dataset.act === 'sup-history')   openSupplierHistory(btn.dataset.id);
    if (btn.dataset.act === 'sup-wa') {
      const sup = suppliers.find(s => s.id === btn.dataset.id);
      if (sup?.phone && window.hubAPI?.shareWhatsApp) {
        window.hubAPI.shareWhatsApp({ phone: sup.phone, message: '', pdfPath: null });
      }
    }
  });

  // Expenses
  $('#btnAddExpense').addEventListener('click', addExpense);
  $('#btnExportExpCsv').addEventListener('click', exportExpensesCsv);
  $('#expRangeFilter').addEventListener('change', (e) => {
    expRangeFilter = e.target.value;
    const cr = $('#expCustomRange');
    if (cr) cr.style.display = expRangeFilter === 'custom' ? 'inline-flex' : 'none';
    renderExpenses();
  });
  $('#expRangeFrom')?.addEventListener('change', (e) => { customRangeFrom.expenses = e.target.value; renderExpenses(); });
  $('#expRangeTo')?.addEventListener('change',   (e) => { customRangeTo.expenses   = e.target.value; renderExpenses(); });
  $('#expenseTable').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act="del-exp"]');
    if (btn) { deleteExpense(btn.dataset.id); return; }
    const receiptBtn = e.target.closest('[data-act="open-receipt"]');
    if (receiptBtn && window.hubAPI?.openFile) {
      await window.hubAPI.openFile(receiptBtn.dataset.path);
    }
  });
  // Receipt picker
  const btnExpReceipt = $('#btnExpReceipt');
  if (btnExpReceipt) {
    btnExpReceipt.addEventListener('click', async () => {
      if (!window.hubAPI?.pickFile) return;
      const filePath = await window.hubAPI.pickFile({
        filters: [{ name: 'Images/PDF', extensions: ['jpg','jpeg','png','pdf'] }]
      });
      if (filePath) {
        _expReceiptPath = filePath;
        const nameEl = $('#expReceiptName');
        if (nameEl) {
          const parts = filePath.split('/');
          nameEl.textContent = parts[parts.length - 1];
        }
        toast(t('exp.receipt_attached'), 'success', 2000);
      }
    });
  }
  // Set default date to today
  $('#expDate').value = new Date().toISOString().split('T')[0];

  // Waste Log
  const btnLogWaste = $('#btnLogWaste');
  if (btnLogWaste) btnLogWaste.addEventListener('click', openWasteForm);
  const wasteTableEl = $('#wasteTable');
  if (wasteTableEl) wasteTableEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="del-waste"]');
    if (btn) deleteWasteEntry(btn.dataset.id);
  });

  // Monthly Tax Summary Export
  const btnTaxExport = $('#btnTaxExport');
  if (btnTaxExport) btnTaxExport.addEventListener('click', exportTaxSummary);

  // Logs — batch bar
  $('#btnBatchPdf').addEventListener('click', batchExportPDFs);
  $('#btnBatchWa').addEventListener('click', batchWaSend);
  $('#btnBatchClear').addEventListener('click', () => { selectedOrders.clear(); renderBatchBar(); renderLogs(); });
  $('#logSelectAll').addEventListener('change', (e) => {
    const checked = e.target.checked;
    const visible = Array.from($('#logTable tbody').querySelectorAll('.log-sel')).map(cb => cb.dataset.id);
    if (checked) visible.forEach(id => selectedOrders.add(id));
    else visible.forEach(id => selectedOrders.delete(id));
    renderBatchBar();
    renderLogs();
  });

  // Logs — row checkbox delegation
  $('#logTable').addEventListener('change', (e) => {
    const cb = e.target.closest('.log-sel');
    if (!cb) return;
    if (cb.checked) selectedOrders.add(cb.dataset.id);
    else selectedOrders.delete(cb.dataset.id);
    renderBatchBar();
    // Re-render just the row highlight without full re-render
    const tr = cb.closest('tr');
    if (tr) tr.style.background = cb.checked ? 'rgba(91,156,240,0.07)' : '';
  });

  // Logs — search/filter/export
  $('#btnExportCsv').addEventListener('click', exportOrdersCsv);
  $('#btnClearLogs').addEventListener('click', clearAllLogs);
  $('#logSearch').addEventListener('input', (e) => { logSearchTerm = e.target.value; renderLogs(); });
  $('#logStatusFilter').addEventListener('change', (e) => { logStatusFilter = e.target.value; renderLogs(); });
  $('#logPayFilter').addEventListener('change', (e) => { logPayFilter = e.target.value; renderLogs(); });
  $('#logRangeFilter').addEventListener('change', (e) => {
    logRangeFilter = e.target.value;
    const cr = $('#logCustomRange');
    if (cr) cr.style.display = logRangeFilter === 'custom' ? 'inline-flex' : 'none';
    renderLogs();
  });
  $('#logRangeFrom')?.addEventListener('change', (e) => { customRangeFrom.log = e.target.value; renderLogs(); });
  $('#logRangeTo')?.addEventListener('change',   (e) => { customRangeTo.log   = e.target.value; renderLogs(); });
  $('#logTagFilter')?.addEventListener('change', (e) => { logTagFilter = e.target.value; renderLogs(); });
  $('#logTable').addEventListener('click', (e) => {
    const inv  = e.target.closest('[data-act="invoice"]');
    const pdf  = e.target.closest('[data-act="inv-pdf"]');
    const wa   = e.target.closest('[data-act="inv-wa"]');
    const dn   = e.target.closest('[data-act="dn-log"]');
    const cn   = e.target.closest('[data-act="cn-log"]');
    const wo   = e.target.closest('[data-act="wo-log"]');
    const pay  = e.target.closest('[data-act="pay"]');
    const unp  = e.target.closest('[data-act="unpay"]');
    const edit    = e.target.closest('[data-act="edit-log"]');
    const dup     = e.target.closest('[data-act="dup-log"]');
    const reprint = e.target.closest('[data-act="reprint-log"]');
    const del     = e.target.closest('[data-act="del-log"]');
    const tagBtn = e.target.closest('[data-act="filter-tag"]');
    if (inv)     generateInvoice(inv.dataset.id);
    if (pdf)     exportInvoicePDF(pdf.dataset.id, { askWhere: true, openAfter: true });
    if (wa)      shareInvoiceWhatsApp(wa.dataset.id);
    if (dn)      generateDeliveryNote(dn.dataset.id);
    if (cn)      openCreditNoteModal(cn.dataset.id);
    if (wo)      generateWorkOrder(wo.dataset.id);
    const remind = e.target.closest('[data-act="pay-remind"]');
    if (remind)  sendPaymentReminder(remind.dataset.id);
    const tracking = e.target.closest('[data-act="share-tracking"]');
    if (tracking) shareTrackingWhatsApp(tracking.dataset.id);
    if (pay)     openPaymentModal(pay.dataset.id);
    if (unp)     clearPayment(unp.dataset.id);
    if (edit)    openOrderEditor(edit.dataset.id);
    if (dup)     duplicateOrder(dup.dataset.id);
    if (reprint) reprintOrder(reprint.dataset.id);
    if (del)     deleteLog(del.dataset.id);
    const linkedExp = e.target.closest('[data-act="linked-expenses"]');
    if (linkedExp) showLinkedExpenses(linkedExp.dataset.id);
    const emailInv = e.target.closest('[data-act="email-invoice"]');
    if (emailInv) emailOrderToClient(emailInv.dataset.id, false);
    const emailQuo = e.target.closest('[data-act="email-quote"]');
    if (emailQuo) emailOrderToClient(emailQuo.dataset.id, true);
    const statusPage = e.target.closest('[data-act="export-status-page"]');
    if (statusPage) exportOrderStatusPage(statusPage.dataset.id);
    if (tagBtn) {
      logTagFilter = tagBtn.dataset.tag;
      const sel = $('#logTagFilter');
      if (sel) sel.value = logTagFilter;
      renderLogs();
    }
  });

  // Portfolio
  $('#portfolioSearch').addEventListener('input', (e) => { portfolioSearchTerm = e.target.value; renderPortfolio(); });
  $('#portfolioGrid').addEventListener('click', (e) => {
    const cell = e.target.closest('.portfolio-cell');
    if (cell) openOrderEditor(cell.dataset.oid);
  });
  $('#btnRevealOrderPhotos').addEventListener('click', () => {
    if (window.hubAPI?.revealOrderPhotosFolder) window.hubAPI.revealOrderPhotosFolder();
  });

  // Kanban — production columns
  document.querySelector('.kanban').addEventListener('click', (e) => {
    const s  = e.target.closest('[data-act="status"]');
    const i  = e.target.closest('[data-act="invoice"]');
    const wa = e.target.closest('[data-act="wa-quick"]');
    const md = e.target.closest('[data-act="mark-delivered"]');
    const wo = e.target.closest('[data-act="wo-kanban"]');
    const qUp = e.target.closest('[data-act="q-up"]');
    const qDn = e.target.closest('[data-act="q-down"]');
    const tps = e.target.closest('[data-act="toggle-part-status"]');
    const holdBtn = e.target.closest('[data-act="hold-order"]');
    if (s)  updateStatus(s.dataset.id, s.dataset.to);
    if (holdBtn) holdOrder(holdBtn.dataset.id);
    if (i)  generateInvoice(i.dataset.id);
    if (wa) openWaSendModal(wa.dataset.id);
    if (md) markDelivered(md.dataset.id);
    if (wo) generateWorkOrder(wo.dataset.id);
    if (tps) {
      const order = printLog.find(o => o.id === tps.dataset.orderId);
      const partIdx = parseInt(tps.dataset.partIndex, 10);
      if (order && order.parts && order.parts[partIdx] !== undefined) {
        const cycle = ['pending', 'printing', 'done', 'failed'];
        const cur = order.parts[partIdx].partStatus || 'pending';
        const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
        order.parts[partIdx].partStatus = next;
        saveAll();
        renderKanban();
      }
    }
    if (qUp) {
      // Swap queuePos with the previous pending order
      const pending = printLog.filter(o => o.status === 'pending')
        .sort((a, b) => (a.queuePos || 9999) - (b.queuePos || 9999));
      const idx = pending.findIndex(o => o.id === qUp.dataset.id);
      if (idx > 0) {
        const t1 = pending[idx].queuePos; pending[idx].queuePos = pending[idx - 1].queuePos; pending[idx - 1].queuePos = t1;
        saveAll(); renderKanban();
      }
    }
    if (qDn) {
      const pending = printLog.filter(o => o.status === 'pending')
        .sort((a, b) => (a.queuePos || 9999) - (b.queuePos || 9999));
      const idx = pending.findIndex(o => o.id === qDn.dataset.id);
      if (idx >= 0 && idx < pending.length - 1) {
        const t2 = pending[idx].queuePos; pending[idx].queuePos = pending[idx + 1].queuePos; pending[idx + 1].queuePos = t2;
        saveAll(); renderKanban();
      }
    }
  });

  // Post-checklist checkbox changes (delegated from kanban, uses change not click)
  document.querySelector('.kanban').addEventListener('change', (e) => {
    const cb = e.target.closest('.post-check-cb');
    if (!cb) return;
    const order = printLog.find(o => o.id === cb.dataset.order);
    if (!order) return;
    if (!order.postChecks) order.postChecks = {};
    order.postChecks[cb.dataset.check] = cb.checked;
    saveAll();
    // Update the card header count without full re-render
    const card = cb.closest('.post-checklist');
    if (card) {
      const header = card.querySelector('.post-check-count');
      if (header) {
        const total = card.querySelectorAll('.post-check-cb').length;
        const done  = card.querySelectorAll('.post-check-cb:checked').length;
        header.textContent = `${done}/${total}`;
      }
      // Toggle done class on label
      const label = cb.closest('.post-check-item');
      if (label) label.classList.toggle('done', cb.checked);
    }
  });

  // Kanban — quotes section
  $('#quotesSection').addEventListener('click', (e) => {
    const approve = e.target.closest('[data-act="approve-quote"]');
    const reject  = e.target.closest('[data-act="reject-quote"]');
    const share   = e.target.closest('[data-act="share-quote"]');
    if (approve) approveQuote(approve.dataset.id);
    if (reject)  rejectQuote(reject.dataset.id);
    if (share)   exportInvoicePDF(share.dataset.id, { askWhere: true, openAfter: true });
  });

  // Save-as-Quote button
  $('#btnSaveAsQuote').addEventListener('click', () => logPrint(true));

  // Machine profiles (settings section)
  $('#btnAddMachine').addEventListener('click', () => openMachineEditor(null));
  $('#machinesList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'maint-log') openMaintLog(btn.dataset.id);
    if (btn.dataset.act === 'edit-mach') openMachineEditor(btn.dataset.id);
    if (btn.dataset.act === 'del-mach') deleteMachine(btn.dataset.id);
  });

  // WA template management (settings section)
  $('#btnAddWaTemplate').addEventListener('click', () => openWaTemplateEditor(null));
  $('#waTemplatesList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'edit-wa-tpl') openWaTemplateEditor(btn.dataset.id);
    if (btn.dataset.act === 'del-wa-tpl') deleteWaTemplate(btn.dataset.id);
  });

  // Analytics range
  $('#analyticsRange').addEventListener('change', (e) => {
    analyticsRange = e.target.value;
    const cr = $('#analyticsCustomRange');
    if (cr) cr.style.display = analyticsRange === 'custom' ? 'inline-flex' : 'none';
    renderAnalytics();
  });
  $('#analyticsRangeFrom')?.addEventListener('change', (e) => { customRangeFrom.analytics = e.target.value; renderAnalytics(); });
  $('#analyticsRangeTo')?.addEventListener('change',   (e) => { customRangeTo.analytics   = e.target.value; renderAnalytics(); });

  // Catalog
  $('#btnAddProduct').addEventListener('click', () => openProductEditor(null));
  $('#catalogSearch').addEventListener('input', (e) => { catalogSearchTerm = e.target.value; renderCatalog(); });
  $('#catalogGrid').addEventListener('click', (e) => {
    const quote = e.target.closest('[data-act="cat-quote"]');
    const edit  = e.target.closest('[data-act="cat-edit"]');
    const del   = e.target.closest('[data-act="cat-del"]');
    if (quote) quoteFromProduct(quote.dataset.id);
    if (edit)  openProductEditor(edit.dataset.id);
    if (del)   deleteProduct(del.dataset.id);
  });

  // Dashboard click delegation (recurring order start, order edit, payment reminder)
  $('#dashboardContent')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'cl-quote')   quoteForClient(btn.dataset.id);
    if (btn.dataset.act === 'edit-log')   openOrderEditor(btn.dataset.id);
    if (btn.dataset.act === 'pay-remind') sendPaymentReminder(btn.dataset.id);
    if (btn.dataset.act === 'log-service') logMachineService(btn.dataset.id);
  });

  // Clients
  $('#btnAddClient').addEventListener('click', () => openClientEditor(null));
  $('#btnBlankIntakeForm')?.addEventListener('click', () => generateIntakeForm(null));
  $('#clientSearch').addEventListener('input', (e) => { clientSearchTerm = e.target.value; renderClients(); });
  $('#clientsTable').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'cl-history')     openClientHistory(btn.dataset.id);
    if (btn.dataset.act === 'cl-quote')       quoteForClient(btn.dataset.id);
    if (btn.dataset.act === 'cl-intake-form') generateIntakeForm(btn.dataset.id);
    if (btn.dataset.act === 'cl-edit')        openClientEditor(btn.dataset.id);
    if (btn.dataset.act === 'cl-del')         deleteClient(btn.dataset.id);
  });

  // Post-processing checklist settings
  $('#btnAddPostCheck')?.addEventListener('click', addPostCheckItem);
  $('#postCheckInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPostCheckItem(); } });
  $('#postChecklistItems')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="del-post-check"]');
    if (btn) deletePostCheckItem(+btn.dataset.idx);
  });

  // Custom order fields
  $('#btnAddCustomField')?.addEventListener('click', addCustomField);
  $('#customFieldInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } });
  $('#customFieldsList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="del-custom-field"]');
    if (btn) deleteCustomField(+btn.dataset.idx);
  });

  // Operational settings save (separate card)
  $('#btnSaveOpsSettings')?.addEventListener('click', () => {
    settings.minMarginPct = Math.max(0, Math.min(100, num($('#set_minMarginPct')?.value, 0)));
    settings.expBudgets   = Object.fromEntries(EXP_CATEGORIES.map(c => [c, Math.max(0, num($(`#set_budget_${c}`)?.value, 0))]));
    saveAll();
    toast(t('set.saved'), 'success');
    renderExpenses();
  });

  // Settings
  $('#btnSaveSettings').addEventListener('click', saveSettingsFromForm);
  $('#logoUploadInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { toast(t('set.logo_too_big'), 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      settings.bizLogo = ev.target.result;
      saveAll();
      updateLogoPreview();
      toast(t('set.logo_saved'), 'success');
    };
    reader.readAsDataURL(file);
  });
  $('#btnRemoveLogo').addEventListener('click', () => {
    settings.bizLogo = '';
    saveAll();
    updateLogoPreview();
    toast(t('set.logo_removed'), 'success');
  });
  $('#btnExport').addEventListener('click', exportData);
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  $('#btnReset').addEventListener('click', resetAllData);
  $('#btnRevealPhotos').addEventListener('click', () => {
    if (window.hubAPI?.revealProductsFolder) window.hubAPI.revealProductsFolder();
  });
  $('#btnRevealBackups').addEventListener('click', () => {
    if (window.hubAPI?.revealBackupsFolder) window.hubAPI.revealBackupsFolder();
  });
  $('#btnRestoreBackup')?.addEventListener('click', openRestoreBackupModal);

  // Purchase orders (Feature 3) — delegate from section
  $('#poSection')?.addEventListener('click', (e) => {
    const recv = e.target.closest('[data-act="po-receive"]');
    const del  = e.target.closest('[data-act="po-del"]');
    if (recv) {
      const po = purchaseOrders.find(p => p.id === recv.dataset.id);
      if (po) {
        po.status = 'received';
        po.receivedAt = new Date().toISOString().split('T')[0];
        const invItem = inventory.find(i => i.id === po.itemId);
        if (invItem) {
          invItem.weight = Math.min(invItem.weight + 1000, 99000);
          renderInventory();
          toast(t('po.received_toast') + ' · +1000g', 'success');
        } else {
          toast(t('po.received_toast'), 'success');
        }
        saveAll();
        renderPurchaseOrders();
      }
    }
    if (del) {
      purchaseOrders = purchaseOrders.filter(p => p.id !== del.dataset.id);
      saveAll();
      renderPurchaseOrders();
    }
  });
}

/* ============================================================
   First-run onboarding
   ============================================================ */
function openOnboarding() {
  const curOptions = Object.entries(CURRENCIES)
    .map(([code, c]) => `<option value="${code}"${code === 'SAR' ? ' selected' : ''}>${escapeHtml(c.label)}</option>`)
    .join('');

  openFormModal({
    title: '👋 ' + t('onboard.title'),
    sizeLg: true,
    saveLabel: t('onboard.lets_go'),
    bodyHtml: `
      <div style="text-align:center; margin-bottom:20px;">
        <div style="font-size:3rem; margin-bottom:8px;">🧵</div>
        <h2 style="margin:0; font-size:1.35rem; color:var(--accent);">Khayt · خيط</h2>
        <p style="margin:8px 0 0; color:var(--muted); font-size:.93rem;">${escapeHtml(t('onboard.subtitle'))}</p>
      </div>

      <div style="display:grid; gap:14px;">
        <div class="form-group">
          <label>${escapeHtml(t('onboard.biz_name'))}</label>
          <input id="ob_bizEn" type="text" placeholder="My 3D Print Studio" value="${escapeHtml(settings.bizEn || '')}">
        </div>
        <div class="form-group">
          <label>${escapeHtml(t('onboard.currency'))}</label>
          <select id="ob_currency">${curOptions}</select>
          <small style="color:var(--muted);">${escapeHtml(t('onboard.currency_hint'))}</small>
        </div>
        <div class="form-group">
          <label>${escapeHtml(t('onboard.lang'))}</label>
          <select id="ob_lang">
            <option value="en"${(settings.lang||'en')==='en'?' selected':''}>English</option>
            <option value="ar"${(settings.lang||'en')==='ar'?' selected':''}>العربية</option>
            <option value="de"${(settings.lang||'en')==='de'?' selected':''}>Deutsch</option>
            <option value="es"${(settings.lang||'en')==='es'?' selected':''}>Español</option>
            <option value="fr"${(settings.lang||'en')==='fr'?' selected':''}>Français</option>
            <option value="zh"${(settings.lang||'en')==='zh'?' selected':''}>中文</option>
          </select>
        </div>
        <div class="form-group" style="background:var(--surface-2,rgba(255,255,255,.04)); padding:12px; border-radius:8px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin:0;">
            <input type="checkbox" id="ob_enableZatca" style="width:auto; margin:0;" ${settings.enableZatca !== false ? 'checked' : ''}>
            <span>${escapeHtml(t('onboard.zatca'))}</span>
          </label>
          <small style="color:var(--muted); margin-top:4px; display:block;">${escapeHtml(t('onboard.zatca_hint'))}</small>
        </div>
        <p style="text-align:center; color:var(--muted); font-size:.82rem; margin:4px 0 0;">${escapeHtml(t('onboard.change_later'))}</p>
      </div>
    `,
    onMount() {},
    onSave() {
      const bizEn = $('#ob_bizEn').value.trim() || 'Khayt';
      const currency = $('#ob_currency').value || 'SAR';
      const lang     = $('#ob_lang').value || 'en';
      const enableZatca = !!$('#ob_enableZatca').checked;
      settings.bizEn        = bizEn;
      settings.bizAr        = settings.bizAr || 'خيط';
      settings.currency     = currency;
      settings.lang         = lang;
      settings.enableZatca  = enableZatca;
      settings.firstRunDone = true;
      saveAll();
      i18n.set(lang);
      loadSettingsIntoForm();
      initialRender();
      toast('🎉 ' + t('onboard.welcome'), 'success');
      // openFormModal auto-closes after onSave returns
    }
  });
}

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();

  applyTheme(settings.theme || 'dark');
  i18n.init();
  if (settings.lang) i18n.set(settings.lang, { silent: true });
  const langSel = $('#langSelect');
  if (langSel) langSel.value = i18n.current;

  wireEvents();
  loadSettingsIntoForm();
  refreshCurrencyLabels();
  initialRender();

  if (window.hubAPI?.appVersion) {
    try { $('#appVersion').textContent = await window.hubAPI.appVersion(); }
    catch (_) { $('#appVersion').textContent = '1.0.0-rc.1'; }
  } else {
    $('#appVersion').textContent = '1.0.0-rc.1 (dev)';
  }

  // Daily auto-backup (silent) + populate last-backup label
  maybeAutoBackup();
  updateLastBackupDisplay();

  // First-run onboarding (shown once, after a short delay so UI paints first)
  if (!settings.firstRunDone) {
    setTimeout(openOnboarding, 400);
  }

  // Global search keyboard shortcut ⌘K / Ctrl+K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      globalSearchOpen ? closeGlobalSearch() : openGlobalSearch();
      return;
    }
    if (e.key === 'Escape' && globalSearchOpen) {
      closeGlobalSearch();
    }
  });

  const gsOverlay = $('#globalSearchOverlay');
  if (gsOverlay) {
    gsOverlay.addEventListener('click', (e) => {
      if (e.target === gsOverlay) closeGlobalSearch();
    });
    const gsInput = $('#globalSearchInput');
    if (gsInput) gsInput.addEventListener('input', (e) => renderGlobalResults(e.target.value));
  }
});

document.addEventListener('languagechange', () => {
  initialRender();
});
