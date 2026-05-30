/* ============================================================
   Khayt — main app logic
   Renderer state, persisted to localStorage. Full product images
   stored on disk via hubAPI (preload). Thumbnails live inline.
   ============================================================ */


/* ============================================================
   BNPL / Payment-link service catalog (23 global services)
   ============================================================ */
const BNPL_CATALOG = [
  // ── MENA ────────────────────────────────────────────────────────────────────
  { id:'tabby',       name:'Tabby',              regions:['SA','AE','KW','BH','EG','QA'], color:'#6c5ce7', hasApi:true,  dashUrl:'https://business.tabby.ai',                      desc:'Split into 4 payments, 0% interest · MENA' },
  { id:'tamara',      name:'Tamara',             regions:['SA','AE','KW'],               color:'#00b48a', hasApi:true,  dashUrl:'https://merchant.tamara.co',                      desc:'Pay in 2, 3 or 6 instalments · Gulf' },
  { id:'cashew',      name:'Cashew',             regions:['AE','KW','BH','QA'],          color:'#f59e0b', hasApi:false, dashUrl:'https://getcashew.com',                           desc:'Split purchases in the Gulf' },
  { id:'postpay',     name:'Postpay',            regions:['AE','SA'],                    color:'#0ea5e9', hasApi:false, dashUrl:'https://postpay.io',                              desc:'Pay in 3 installments · UAE/KSA' },
  // ── Europe ──────────────────────────────────────────────────────────────────
  { id:'klarna',      name:'Klarna',             regions:['SE','DE','GB','US','AU','NL'], color:'#ffb3c7', hasApi:false, dashUrl:'https://www.klarna.com/merchant',                 desc:'Pay in 3, finance or pay now · 40+ countries' },
  { id:'clearpay',    name:'Clearpay / Afterpay',regions:['AU','NZ','GB','US','CA','FR'], color:'#b2fce4', hasApi:false, dashUrl:'https://www.clearpay.co.uk/merchant',             desc:'Pay in 4 fortnightly instalments' },
  { id:'scalapay',    name:'Scalapay',           regions:['IT','FR','DE','ES','PT'],     color:'#ff6b6b', hasApi:false, dashUrl:'https://scalapay.com',                            desc:'Split into 3 · Southern Europe' },
  { id:'alma',        name:'Alma',               regions:['FR','BE','ES','IT','NL'],     color:'#fa7268', hasApi:false, dashUrl:'https://almapay.com',                             desc:'Pay in 2–12 instalments · France & Europe' },
  { id:'laybuy',      name:'Laybuy',             regions:['NZ','AU','GB'],               color:'#5b2d8e', hasApi:false, dashUrl:'https://business.laybuy.com',                    desc:'6 weekly instalments · NZ/AU/UK' },
  // ── North America ────────────────────────────────────────────────────────────
  { id:'affirm',      name:'Affirm',             regions:['US','CA'],                    color:'#0fa0db', hasApi:false, dashUrl:'https://www.affirm.com/business',                 desc:'Flexible monthly payments · US & Canada' },
  { id:'sezzle',      name:'Sezzle',             regions:['US','CA','IN','DE'],          color:'#392558', hasApi:false, dashUrl:'https://dashboard.sezzle.com',                    desc:'Pay in 4 interest-free · US/CA/EU' },
  { id:'zip',         name:'Zip (Quadpay)',       regions:['AU','NZ','US','GB','ZA'],     color:'#aa8fff', hasApi:false, dashUrl:'https://zip.co/merchants',                        desc:'Pay in 4 fortnightly · AU/US/UK' },
  // ── Asia-Pacific ─────────────────────────────────────────────────────────────
  { id:'paidy',       name:'Paidy',              regions:['JP'],                         color:'#3d5afe', hasApi:false, dashUrl:'https://merchant.paidy.com',                      desc:'Monthly consolidation & 3-instalments · Japan' },
  { id:'atome',       name:'Atome',              regions:['SG','MY','HK','ID','TH','PH'],color:'#00c853', hasApi:false, dashUrl:'https://www.atome.sg/merchants',                  desc:'Pay in 3 equal instalments · Southeast Asia' },
  { id:'kredivo',     name:'Kredivo',            regions:['ID','VN','TH','PH'],          color:'#e53935', hasApi:false, dashUrl:'https://kredivo.com/business',                    desc:'Southeast Asia BNPL leader' },
  // ── India ────────────────────────────────────────────────────────────────────
  { id:'simpl',       name:'Simpl',              regions:['IN'],                         color:'#ff4b00', hasApi:false, dashUrl:'https://getsimpl.com/merchant',                   desc:'Pay in 3 with no-cost EMI · India' },
  { id:'lazypay',     name:'LazyPay',            regions:['IN'],                         color:'#fbbf24', hasApi:false, dashUrl:'https://lazypay.in',                              desc:'Pay later & EMI · India' },
  // ── Africa ───────────────────────────────────────────────────────────────────
  { id:'mpesa',       name:'M-Pesa',             regions:['KE','TZ','GH','EG','LS','MZ'],color:'#4caf50', hasApi:false, dashUrl:'https://developer.safaricom.co.ke',               desc:'Mobile money · East & Central Africa' },
  { id:'flutterwave', name:'Flutterwave',        regions:['NG','GH','KE','ZA','EG','TZ'],color:'#f68b1e', hasApi:false, dashUrl:'https://merchant.flutterwave.com',                desc:'Pan-African payments platform' },
  // ── Latin America ────────────────────────────────────────────────────────────
  { id:'mercadopago', name:'Mercado Pago',       regions:['BR','AR','MX','CO','CL'],     color:'#00b1ea', hasApi:false, dashUrl:'https://www.mercadopago.com.br/developers',       desc:'Largest LATAM platform · cuotas / instalments' },
  { id:'kueski',      name:'Kueski Pay',         regions:['MX'],                         color:'#ff5722', hasApi:false, dashUrl:'https://kueskipay.com/negocios',                  desc:'Buy now, pay later · Mexico' },
  // ── Global ───────────────────────────────────────────────────────────────────
  { id:'stripe',      name:'Stripe',             regions:['*'],                          color:'#635bff', hasApi:true,  dashUrl:'https://dashboard.stripe.com',                    desc:'Global payments — enables Klarna/Afterpay/Affirm via dashboard' },
  { id:'paypal',      name:'PayPal Pay Later',   regions:['US','GB','AU','DE','FR','IT'], color:'#003087', hasApi:false, dashUrl:'https://www.paypal.com/merchant',                 desc:'Pay in 4 or monthly financing via PayPal' },
];
let supplierSearchTerm = '';


// Undo stack — pushed when a destructive action runs; popped if user clicks "Undo"
const undoStack = [];

/* util, currency — renderer/util.js, renderer/currency.js */
/* num, clampPositive, fmtMoney, computeUnitPrice — renderer/format.js */

// ── Shared helpers ────────────────────────────────────────────────────────────
/** Localised name — picks AR or EN depending on current language. */
function localName(obj) {
  return i18n.current === 'ar' ? (obj.nameAr || obj.nameEn) : (obj.nameEn || obj.nameAr);
}
/** Normalise payment status with fallback, accounting for credit notes. */
function payStatus(order) {
  if (order.voidedAt) return 'voided';
  const price = +order.price || 0;
  if (price === 0) return order.paymentStatus || 'paid';

  // Subtract any issued credit notes (refunds) from cash paid, then ADD gift-card
  // redemption as a credit toward the order (it pays the order down, like a payment).
  const totalCredited = (order.creditNotes || []).reduce((s, cn) => s + (+cn.amount || 0), 0);
  const effectivePaid = Math.max(0, (+order.paidAmount || 0) - totalCredited) + (+order.giftCardDiscount || 0);

  if (effectivePaid <= 0) return 'unpaid';
  if (effectivePaid >= price) return 'paid';
  return 'partial';
}
/* csvFormulaNeutralize — renderer/format.js */
/** Escape a value for CSV (RFC 4180). */
function csvEsc(v) { return '"' + csvFormulaNeutralize(v).replace(/"/g, '""') + '"'; }
/** Trigger a file download from a Blob. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
/** Return printLog entries matching the current log filter UI state. */
/* getFilteredLogs, clearLogFilters, renderLogs, batch actions, exportOrdersCsv — renderer/logs.js */

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
/* uid — renderer/util.js */

/** Hash a PIN with SHA-256 (hex string, 64 chars). Used for operator PINs instead of btoa(). */
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(pin)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
/** Detect legacy base64-encoded PINs (btoa output is always < 64 chars for 4-8 digit PINs). */
function isLegacyPin(hash) { return typeof hash === 'string' && hash.length > 0 && hash.length !== 64; }

/** Feature 2: Return normalised priority level for an order.
 *  Supports both legacy boolean and new string values. */
function getPriorityLevel(order) {
  if (order.priorityLevel === 'urgent') return 'urgent';
  if (order.priorityLevel === 'high')   return 'high';
  if (order.priority === true && !order.priorityLevel) return 'high';
  return 'normal';
}
/** Feature 2: Sort comparator — urgent > high > normal, then by queuePos */
function prioritySortValue(order) {
  const lv = getPriorityLevel(order);
  return lv === 'urgent' ? 0 : lv === 'high' ? 1 : 2;
}
/** Feature 2: HTML badge for priority level (empty string if normal) */
function priorityBadgeHtml(order) {
  const lv = getPriorityLevel(order);
  if (lv === 'urgent') return `<span class="priority-label priority-urgent">${escapeHtml(t('ord.priority_urgent'))}</span>`;
  if (lv === 'high')   return `<span class="priority-label priority-high">${escapeHtml(t('ord.priority_high'))}</span>`;
  return '';
}
/* Invoicing — renderer/invoicing.js */

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
/* escapeHtml, parseCsvString — renderer/util.js */

/**
 * Reusable CSV import modal.
 * @param {object} opts
 * @param {string}   opts.title    — Modal title
 * @param {Array}    opts.fields   — [{ key, label, required?, type? }]
 * @param {Function} opts.onImport — (objects) => { imported, skipped }
 */
function openCsvImportModal({ title, fields, onImport }) {
  let parsedHeaders = [];
  let parsedRows = [];

  function autoMapIdx(fieldKey, fieldLabel, headers) {
    const norm = s => s.toLowerCase().replace(/[\s_-]/g, '');
    const targets = [norm(fieldKey), norm(fieldLabel)];
    const idx = headers.findIndex(h => targets.includes(norm(h)));
    return idx >= 0 ? String(idx) : '';
  }

  function buildMappingHtml(headers, rows) {
    if (!headers.length) return '';
    return `
      <div style="margin-top:12px;">
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${rows.length} ${escapeHtml(t('csv.rows_found') || 'rows found')}. ${escapeHtml(t('csv.map_hint') || 'Map CSV columns to fields:')}</p>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--bg-alt);">
              <th style="padding:6px 8px;text-align:left;">${escapeHtml(t('csv.field') || 'Field')}</th>
              <th style="padding:6px 8px;text-align:left;">${escapeHtml(t('csv.column') || 'CSV Column')}</th>
              <th style="padding:6px 8px;text-align:left;color:var(--text-muted);">${escapeHtml(t('csv.preview') || 'Preview')}</th>
            </tr>
          </thead>
          <tbody>
            ${fields.map(f => {
              const autoIdx = autoMapIdx(f.key, f.label, headers);
              const optHtml = `<option value="">(${escapeHtml(t('csv.skip') || 'skip')})</option>` +
                headers.map((h, i) => `<option value="${i}"${String(i) === autoIdx ? ' selected' : ''}>${escapeHtml(h)}</option>`).join('');
              const previewVal = autoIdx !== '' ? (rows[0]?.[+autoIdx] || '—') : '—';
              return `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:6px 8px;font-weight:${f.required ? '600' : '400'};">${escapeHtml(f.label)}${f.required ? ' <span style="color:var(--danger);">*</span>' : ''}</td>
                <td style="padding:6px 8px;"><select class="csv-map-sel" data-field="${escapeHtml(f.key)}" style="width:100%;font-size:12px;padding:3px;">${optHtml}</select></td>
                <td class="csv-map-preview" data-field="${escapeHtml(f.key)}" style="padding:6px 8px;color:var(--text-muted);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(String(previewVal))}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <p id="csvImportCount" style="margin-top:8px;font-size:12px;color:var(--primary);font-weight:600;"></p>
      </div>`;
  }

  function updatePreviewsAndCount() {
    $$('.csv-map-sel').forEach(sel => {
      const field = sel.dataset.field;
      const idx = sel.value !== '' ? +sel.value : -1;
      const previewEl = $(`.csv-map-preview[data-field="${field}"]`);
      if (previewEl) previewEl.textContent = idx >= 0 ? (parsedRows[0]?.[idx] || '—') : '—';
    });
    const required = fields.filter(f => f.required);
    const mappings = {};
    $$('.csv-map-sel').forEach(sel => { mappings[sel.dataset.field] = sel.value !== '' ? +sel.value : -1; });
    const validCount = parsedRows.filter(row => required.every(f => mappings[f.key] >= 0 && row[mappings[f.key]]?.trim())).length;
    const countEl = $('#csvImportCount');
    if (countEl) countEl.textContent = `${validCount} ${t('csv.rows_to_import') || 'rows will be imported'}`;
  }

  function parseAndRender(text) {
    const { headers, rows } = parseCsvString(text);
    parsedHeaders = headers;
    parsedRows = rows;
    const area = $('#csvMappingArea');
    if (area) {
      area.innerHTML = buildMappingHtml(headers, rows);
      $$('.csv-map-sel').forEach(sel => sel.addEventListener('change', updatePreviewsAndCount));
      updatePreviewsAndCount();
    }
  }

  openFormModal({
    title,
    sizeLg: true,
    bodyHtml: `
      <div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <label class="btn small ghost" style="cursor:pointer;margin:0;">
            ${escapeHtml(t('csv.choose_file') || 'Choose CSV file')}
            <input type="file" id="csvFileInput" accept=".csv,.txt" style="display:none;">
          </label>
          <span style="font-size:12px;color:var(--text-muted);" id="csvFileName">${escapeHtml(t('csv.no_file') || 'No file chosen')}</span>
          <button class="btn small ghost" id="csvPasteToggle" style="margin-inline-start:auto;">${escapeHtml(t('csv.paste') || 'Paste CSV')}</button>
        </div>
        <textarea id="csvPasteArea" rows="4" class="form-control" placeholder="${escapeHtml(t('csv.paste_ph') || 'Paste CSV text here…')}" style="display:none;font-size:11px;font-family:monospace;"></textarea>
        <div id="csvMappingArea"></div>
      </div>`,
    saveLabel: t('csv.import_btn') || 'Import',
    onSave: () => {
      if (!parsedRows.length) { toast(t('csv.no_data') || 'No data to import', 'error'); return false; }
      const mappings = {};
      $$('.csv-map-sel').forEach(sel => { mappings[sel.dataset.field] = sel.value !== '' ? +sel.value : -1; });
      const objects = parsedRows.map(row => {
        const obj = {};
        fields.forEach(f => {
          if (mappings[f.key] >= 0) {
            const raw = row[mappings[f.key]]?.trim() || '';
            obj[f.key] = f.type === 'number' ? (+raw || 0) : raw;
          }
        });
        return obj;
      }).filter(obj => fields.filter(f => f.required).every(f => obj[f.key]));

      if (!objects.length) { toast(t('csv.no_valid_rows') || 'No valid rows found — check required fields', 'error'); return false; }
      const result = onImport(objects);
      toast(`${result.imported} ${t('csv.imported') || 'imported'}${result.skipped ? `, ${result.skipped} ${t('csv.skipped') || 'skipped'}` : ''}`, 'success', 4000);
      return true;
    }
  });

  requestAnimationFrame(() => {
    $('#csvFileInput')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const nameEl = $('#csvFileName');
      if (nameEl) nameEl.textContent = file.name;
      const reader = new FileReader();
      reader.onload = ev => parseAndRender(ev.target.result);
      reader.readAsText(file, 'UTF-8');
    });
    $('#csvPasteToggle')?.addEventListener('click', () => {
      const ta = $('#csvPasteArea');
      if (!ta) return;
      ta.style.display = ta.style.display === 'none' ? 'block' : 'none';
    });
    $('#csvPasteArea')?.addEventListener('input', e => {
      if (e.target.value.trim()) parseAndRender(e.target.value);
    });
  });
}




/* safeCssColor, initials — renderer/util.js */
function safeBizLogo() {
  const v = settings.bizLogo;
  return (v && v.startsWith('data:image/')) ? v : '';
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
  // Validate the date string is parseable
  if (isNaN(new Date(dateStr))) return false;
  if (range === 'custom') {
    const from = ctx ? customRangeFrom[ctx] : '';
    const to   = ctx ? customRangeTo[ctx]   : '';
    if (!from && !to) return true;
    const ds = dateStr.slice(0, 10);
    if (from && ds < from) return false;
    if (to   && ds > to)   return false;
    return true;
  }
  // Use string slicing for all range checks to avoid UTC/local timezone boundary issues
  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth(); // 0-based
  const ds = dateStr.slice(0, 10); // YYYY-MM-DD
  if (range === 'month') {
    const nowStr = `${nowY}-${String(nowM + 1).padStart(2, '0')}`;
    return ds.slice(0, 7) === nowStr;
  }
  if (range === 'last_month') {
    const lm = new Date(nowY, nowM - 1, 1);
    const lmStr = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}`;
    return ds.slice(0, 7) === lmStr;
  }
  if (range === 'quarter') {
    const nowQ = Math.floor(nowM / 3);
    const dsMonth = parseInt(ds.slice(5, 7), 10) - 1; // 0-based
    const dsYear  = parseInt(ds.slice(0, 4), 10);
    return dsYear === nowY && Math.floor(dsMonth / 3) === nowQ;
  }
  if (range === 'last_quarter') {
    const lastQEnd   = new Date(nowY, nowM - (nowM % 3), 0); // last day of prev quarter
    const lastQStart = new Date(lastQEnd.getFullYear(), Math.floor(lastQEnd.getMonth() / 3) * 3, 1);
    const fromStr = lastQStart.toISOString().slice(0, 10);
    const toStr   = lastQEnd.toISOString().slice(0, 10);
    return ds >= fromStr && ds <= toStr;
  }
  if (range === 'year') {
    return ds.slice(0, 4) === String(nowY);
  }
  return true;
}

/* ============================================================
   New Feature 7: Working-hours helpers
   ============================================================ */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Count available working hours from now until targetDate (exclusive), using
 *  settings.workingHours per day-of-week and skipping settings.holidays. */
function availableHoursUntil(targetDate) {
  const wh = settings.workingHours || { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0, sat: 0, sun: 0 };
  const holidays = new Set(settings.holidays || []);
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(targetDate);
  end.setHours(0, 0, 0, 0);
  let total = 0;
  while (cursor < end) {
    const iso = cursor.toISOString().split('T')[0];
    if (!holidays.has(iso)) {
      const key = DAY_KEYS[cursor.getDay()];
      total += Math.max(0, +(wh[key] || 0));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

/** Get daily working hours for today (used in clearDays forecast) */
function avgDailyWorkingHours() {
  const wh = settings.workingHours || { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0, sat: 0, sun: 0 };
  const days = Object.values(wh);
  const totalWeeklyHours = days.reduce((s, h) => s + (h > 0 ? h : 0), 0);
  // Divide by 7 to get calendar-day average (correct for delivery-date estimation)
  return totalWeeklyHours > 0 ? totalWeeklyHours / 7 : 8;
}

/* ============================================================
   Feature 2 (new): Machine downtime helpers
   ============================================================ */
/** Sum hours of overlap between [fromDate, toDate] and machine.downtimeBlocks */
function machineDowntimeHoursInRange(machine, fromDate, toDate) {
  const blocks = machine.downtimeBlocks || [];
  if (blocks.length === 0) return 0;
  const from = new Date(fromDate).getTime();
  const to   = new Date(toDate).getTime();
  let total = 0;
  for (const b of blocks) {
    if (!b.from || !b.to) continue;
    const bFrom = new Date(b.from).getTime();
    const bTo   = new Date(b.to).getTime();
    const overlapStart = Math.max(from, bFrom);
    const overlapEnd   = Math.min(to,   bTo);
    if (overlapEnd > overlapStart) {
      total += (overlapEnd - overlapStart) / 3600000;
    }
  }
  return total;
}

/* ============================================================
   Feature 6 (new): Client credit limit helpers
   ============================================================ */
function clientOutstandingBalance(clientId) {
  return printLog
    .filter(o => o.clientId === clientId && o.status !== 'quote' && payStatus(o) !== 'paid')
    .reduce((s, o) => s + orderOwedBase(o), 0);
}

/* ============================================================
   Feature 4 (new): Recurring expenses
   ============================================================ */

/* ============================================================
   Feature 7 (new): Client retention analytics
   ============================================================ */
/* Analytics helpers — renderer/analytics.js */

/* ============================================================
   Feature 8 (new): Locations management
   ============================================================ */
function ensureDefaultLocation() {
  if (locations.length === 0) {
    locations.push({ id: uid('LOC'), name: 'Main', address: '' });
    saveAll();
  }
}

/* Settings tab — renderer/settings.js */

function openLocationEditor(locId = null) {
  const existing = locId ? locations.find(l => l.id === locId) : null;
  const draft = existing ? { ...existing } : { id: uid('LOC'), name: '', address: '' };
  openFormModal({
    title: existing ? t('set.locations') : t('set.location_add'),
    sizeLg: false,
    bodyHtml: `
      <label>${escapeHtml(t('set.location_name'))}</label>
      <input type="text" id="locName" value="${escapeHtml(draft.name)}" placeholder="Main">
      <label style="margin-top:12px;">${escapeHtml(t('set.location_addr'))}</label>
      <input type="text" id="locAddr" value="${escapeHtml(draft.address || '')}" placeholder="e.g. Riyadh, Floor 2">`,
    async onSave(modal) {
      draft.name = modal.querySelector('#locName').value.trim();
      draft.address = modal.querySelector('#locAddr').value.trim();
      if (!draft.name) { toast(t('mach.need_name'), 'error'); return false; }
      const idx = locations.findIndex(l => l.id === draft.id);
      if (idx >= 0) locations[idx] = draft; else locations.push(draft);
      saveAll();
      renderLocationsSettings();
      renderLocationFilter();
      toast(t('common.save'), 'success');
      return true;
    }
  });
}

function renderLocationFilter() {
  const sel = $('#locationFilter');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="">${escapeHtml(t('loc.all'))}</option>` +
    locations.map(l => `<option value="${l.id}"${l.id === prev ? ' selected' : ''}>${escapeHtml(l.name)}</option>`).join('');
  sel.value = prev && locations.find(l => l.id === prev) ? prev : '';
}

function locationBadgeHtml(locationId) {
  if (!locationId) return '';
  const loc = locations.find(l => l.id === locationId);
  if (!loc) return '';
  return `<span class="location-badge">${escapeHtml(loc.name)}</span>`;
}

/* ============================================================
   Feature 8 (this batch): Production pause
   ============================================================ */
function applyProductionPause() {
  const banner = document.getElementById('pauseBanner');
  const btn = document.getElementById('btnPauseProduction');
  if (!banner) return;
  if (settings.productionPaused) {
    const reason = settings.pauseReason ? ` — ${escapeHtml(settings.pauseReason)}` : '';
    banner.innerHTML = `⏸ ${escapeHtml(t('prod.paused_banner'))}${reason} <button data-act="resume-production">${escapeHtml(t('prod.resume'))}</button>`;
    banner.style.display = 'flex';
    if (btn) {
      btn.textContent = '▶ ' + t('prod.resume');
      btn.style.background = 'rgba(34,197,94,0.15)';
      btn.style.color = '#4ade80';
      btn.style.borderColor = 'rgba(34,197,94,0.3)';
    }
  } else {
    banner.style.display = 'none';
    if (btn) {
      btn.textContent = '⏸ ' + t('prod.pause');
      btn.style.background = 'rgba(220,38,38,0.15)';
      btn.style.color = '#f87171';
      btn.style.borderColor = 'rgba(220,38,38,0.3)';
    }
  }
}

function pauseProduction() {
  openFormModal({
    title: t('prod.pause'),
    sizeLg: false,
    saveLabel: t('prod.pause'),
    bodyHtml: `
      <label>${escapeHtml(t('prod.pause_reason'))}</label>
      <input type="text" id="pauseReasonInput" placeholder="${escapeHtml(t('prod.pause_reason'))}" style="width:100%;">`,
    onMount(modal) { setTimeout(() => modal.querySelector('#pauseReasonInput')?.focus(), 40); },
    onSave(modal) {
      const reason = modal.querySelector('#pauseReasonInput').value.trim();
      settings.productionPaused = true;
      settings.pauseReason = reason || '';
      settings.pausedAt = new Date().toISOString();
      saveAll();
      applyProductionPause();
      renderKanban();
      toast(t('prod.paused_toast'), 'warning');
      return true;
    }
  });
}

function resumeProduction() {
  settings.productionPaused = false;
  settings.pauseReason = '';
  settings.pausedAt = null;
  saveAll();
  applyProductionPause();
  renderKanban();
  toast(t('prod.resumed'), 'success');
}

/* ============================================================
   New 8-pack Feature 7: Cost & Revenue Trends
   ============================================================ */

/* ============================================================
   Feature K: Multi-Operator Time Tracking
   ============================================================ */

function openTimeEntryModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  const activeOps = operators.filter(o => o.active !== false);
  const today = new Date().toISOString().split('T')[0];

  if (activeOps.length === 0) {
    toast(t('op.no_operators') || 'No active operators — add operators in Settings first', 'warning', 3000);
    return;
  }

  const opOpts = activeOps.map(op =>
    `<option value="${op.id}" data-rate="${+op.hourlyRate || 0}">${escapeHtml(op.name)}${op.role ? ' (' + escapeHtml(op.role) + ')' : ''}</option>`
  ).join('');

  openFormModal({
    title: t('time.log_title') || 'Log Work Time',
    sizeLg: false,
    bodyHtml: `
      ${order ? `<p style="font-size:13px;color:var(--text-muted);margin-top:0;">Order: <strong>${escapeHtml(order.project || order.id)}</strong></p>` : ''}
      <label>${escapeHtml(t('time.operator') || 'Operator')}</label>
      <select id="teOperator">${opOpts}</select>
      <div style="display:flex;gap:12px;margin-top:10px;">
        <div style="flex:1;">
          <label style="margin-top:0;">${escapeHtml(t('time.hours') || 'Hours')}</label>
          <input type="number" id="teHours" value="1" min="0.25" step="0.25">
        </div>
        <div style="flex:1;">
          <label style="margin-top:0;">${escapeHtml(t('time.date') || 'Date')}</label>
          <input type="date" id="teDate" value="${today}">
        </div>
      </div>
      <label style="margin-top:10px;">${escapeHtml(t('time.notes') || 'Notes (optional)')}</label>
      <textarea id="teNotes" rows="2" style="resize:vertical;"></textarea>`,
    onSave(modal) {
      const opId    = modal.querySelector('#teOperator').value;
      const op      = operators.find(o => o.id === opId);
      const hours   = parseFloat(modal.querySelector('#teHours').value) || 0;
      const date    = modal.querySelector('#teDate').value || today;
      const notes   = modal.querySelector('#teNotes').value.trim();
      if (!opId)    { toast('Select an operator', 'error'); return false; }
      if (hours <= 0) { toast('Hours must be > 0', 'error'); return false; }
      const rate = +op?.hourlyRate || 0;
      timeEntries.push({
        id: uid('TE'),
        orderId:       orderId || null,
        operatorId:    opId,
        operatorName:  op?.name || '',
        hours,
        hourlyRate:    rate,
        cost:          hours * rate,
        date,
        notes,
        createdAt:     new Date().toISOString(),
      });
      saveAll();
      toast(`${t('time.logged') || 'Time logged'}: ${hours}h ${t('common.by') || 'by'} ${op?.name || ''}`, 'success');
      return true;
    }
  });
}


/* ============================================================
   New 8-pack Feature 1: Operators / Staff
   ============================================================ */
function renderOperatorsList() {
  const el = $('#operatorsList');
  if (!el) return;
  if (operators.length === 0) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">${escapeHtml(t('mach.empty') || 'No operators yet.')}</div>`;
    return;
  }
  el.innerHTML = operators.map(op => `
    <div class="machine-row">
      <span class="machine-name">${escapeHtml(op.name)}</span>
      ${op.role ? `<span style="font-size:11.5px;color:var(--text-muted);margin-inline-start:8px;">${escapeHtml(op.role)}</span>` : ''}
      ${op.hourlyRate ? `<span style="font-size:11px;color:var(--primary);margin-inline-start:8px;">${fmtPrice(+op.hourlyRate)}/hr</span>` : ''}
      ${op.active === false ? `<span class="machine-jobs-badge" style="background:var(--danger);color:#fff;">Inactive</span>` : ''}
      <button class="btn small" data-act="edit-operator" data-id="${op.id}">${escapeHtml(t('common.edit'))}</button>
      <button class="btn danger small" data-act="del-operator" data-id="${op.id}">${escapeHtml(t('common.delete'))}</button>
    </div>`).join('');
}

function openOperatorEditor(opId = null) {
  const existing = opId ? operators.find(o => o.id === opId) : null;
  const draft = existing ? { ...existing } : { id: uid('OP'), name: '', role: '', active: true, hourlyRate: 0 };
  if (!('hourlyRate' in draft)) draft.hourlyRate = 0;
  const currency = settings.currency || 'SAR';
  openFormModal({
    title: existing ? t('op.title') : t('op.add'),
    sizeLg: false,
    bodyHtml: `
      <label>${escapeHtml(t('op.name'))}</label>
      <input type="text" id="opName" value="${escapeHtml(draft.name)}" placeholder="e.g. Ali Al-Hassan">
      <label style="margin-top:12px;">${escapeHtml(t('op.role'))}</label>
      <input type="text" id="opRole" value="${escapeHtml(draft.role || '')}" placeholder="e.g. Senior Technician">
      <label style="margin-top:12px;">${escapeHtml(t('op.hourly_rate') || 'Hourly Rate')} (${escapeHtml(currency)})</label>
      <input type="number" id="opHourlyRate" value="${+draft.hourlyRate || 0}" min="0" step="0.01">
      <label style="margin-top:12px;display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="opActive" style="width:auto;margin:0;" ${draft.active !== false ? 'checked' : ''}>
        <span>Active</span>
      </label>`,
    async onSave(modal) {
      draft.name       = modal.querySelector('#opName').value.trim();
      draft.role       = modal.querySelector('#opRole').value.trim();
      draft.hourlyRate = parseFloat(modal.querySelector('#opHourlyRate')?.value) || 0;
      draft.active     = modal.querySelector('#opActive').checked;
      if (!draft.name) { toast(t('mach.need_name'), 'error'); return false; }
      const idx = operators.findIndex(o => o.id === draft.id);
      if (idx >= 0) operators[idx] = draft; else operators.push(draft);
      saveAll();
      renderOperatorsList();
      toast(t('common.save'), 'success');
      return true;
    }
  });
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
   Orders, Kanban, Logs, Analytics
   ============================================================ */
/* Order flows — renderer/order-flows.js */
/* exportAnalyticsReport — renderer/analytics.js */

/* Waiting list (job intake) — renderer/waiting-list.js */


/* ============================================================
   PDF export + WhatsApp share
   ============================================================ */

/* ============================================================
   Daily auto-backup
   ============================================================ */
async function maybeAutoBackup() {
  if (!settings.autoBackup || !window.hubAPI?.lastBackupDate) return;
  try {
    const last  = await window.hubAPI.lastBackupDate();
    const today = new Date().toISOString().split('T')[0];
    const localJson  = JSON.stringify(buildExportPayload({ redactSecrets: false }));
    const icloudJson = JSON.stringify(buildExportPayload({ redactSecrets: true }));
    if (last !== today) {
      const p = await window.hubAPI.writeBackup(localJson);
      if (p) console.debug('Auto-backup written:', p);
      updateLastBackupDisplay();
    }
    if (settings.useIcloud && window.hubAPI?.writeIcloudBackup) {
      await window.hubAPI.writeIcloudBackup(icloudJson).catch(e => console.warn('iCloud backup failed', e));
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
   Dashboard
   ============================================================ */
/* ============================================================
   Feature 6: Quote Approval Page Export
   ============================================================ */
async function exportQuoteApprovalPage(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const bizName = settings.bizEn || 'Khayt';
  const contactEmail = settings.email || '';
  const contactPhone = settings.phone || '';
  const cur = currencySymbol();
  const vatEnabled = settings.enableVat && settings.vatRate > 0;
  const vatRate = +settings.vatRate || 15;
  const subtotal = +order.price || 0;
  const vatAmt = vatEnabled ? Math.round(subtotal / (1 + vatRate / 100) * (vatRate / 100) * 100) / 100 : 0;
  const grandTotal = subtotal;

  const _qaParts = order.parts || [];
  const _qaTotalBase = _qaParts.reduce((s, p) => s + (+p.baseCost || 0), 0);
  const _qaTotal = +order.price || 0;
  const partsHtml = _qaParts.map((p, i) => {
    const lineTotal = _qaTotalBase > 0
      ? (+p.baseCost / _qaTotalBase) * _qaTotal
      : _qaTotal / Math.max(1, _qaParts.length);
    const qty = p.qty || 1;
    const unitPrice = lineTotal / qty;
    return `
    <tr>
      <td>${i + 1}. ${escapeHtml(p.name || '')}</td>
      <td style="text-align:center;">${qty}</td>
      <td>${escapeHtml(p.material || '')}</td>
      <td style="text-align:right;">${fmtMoney(unitPrice)} ${cur}</td>
      <td style="text-align:right;">${fmtMoney(lineTotal)} ${cur}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quote ${escapeHtml(order.id)} — ${escapeHtml(bizName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; background: #f8f9fa; padding: 20px; }
    .container { max-width: 700px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 20px rgba(0,0,0,0.08); }
    .header { background: ${safeCssColor(settings.invAccentColor, '#5E2E14')}; color: #fff; padding: 28px 32px; }
    .header h1 { font-size: 1.6rem; font-weight: 700; }
    .header p { opacity: 0.85; font-size: 0.9rem; margin-top: 4px; }
    .body { padding: 28px 32px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .meta-block { }
    .meta-block h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 4px; }
    .meta-block p { font-size: 0.95rem; color: #1a1a2e; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #f1f3f5; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: #555; padding: 10px 14px; text-align: left; }
    td { padding: 10px 14px; border-bottom: 1px solid #eee; font-size: 0.9rem; }
    .total-row { font-weight: 700; background: #f8f9fa; }
    .approve-section { margin-top: 28px; padding: 20px; background: #f0f7ff; border-radius: 8px; border-left: 4px solid ${safeCssColor(settings.invAccentColor, '#5E2E14')}; }
    .approve-section h2 { font-size: 1.1rem; margin-bottom: 10px; color: ${safeCssColor(settings.invAccentColor, '#5E2E14')}; }
    .approve-section p { font-size: 0.9rem; color: #333; line-height: 1.5; }
    @media (max-width: 600px) { .meta { grid-template-columns: 1fr; } .container { border-radius: 0; } }
    @media print { body { background: #fff; } .container { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(bizName)}</h1>
      <p>${escapeHtml(t('ord.quote_approval_page'))} · ${escapeHtml(order.id)}</p>
    </div>
    <div class="body">
      <div class="meta">
        <div class="meta-block">
          <h3>${escapeHtml(t('inv.invoice_no') || 'Quote #')}</h3>
          <p>${escapeHtml(order.id)}</p>
        </div>
        <div class="meta-block">
          <h3>${escapeHtml(t('inv.date'))}</h3>
          <p>${escapeHtml(order.date || '')}</p>
        </div>
        ${order.quoteExpiresAt ? `<div class="meta-block">
          <h3>Expires</h3>
          <p>${escapeHtml(order.quoteExpiresAt)}</p>
        </div>` : ''}
        ${client ? `<div class="meta-block">
          <h3>${escapeHtml(t('inv.billed_to'))}</h3>
          <p>${escapeHtml(client.nameEn || client.nameAr || '')}</p>
        </div>` : ''}
      </div>

      <table>
        <thead><tr>
          <th>${escapeHtml(t('inv.description'))}</th>
          <th style="text-align:center;">${escapeHtml(t('inv.qty'))}</th>
          <th>Material</th>
          <th style="text-align:right;">Unit Price</th>
          <th style="text-align:right;">${escapeHtml(t('inv.line_total'))}</th>
        </tr></thead>
        <tbody>
          ${partsHtml || `<tr><td colspan="5">${escapeHtml(order.project || '')}</td></tr>`}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="4" style="text-align:right;">${escapeHtml(t('inv.grand_total'))}</td>
            <td style="text-align:right;">${fmtMoney(grandTotal)} ${cur}</td>
          </tr>
          ${vatEnabled ? `<tr style="font-size:0.82rem;color:#888;"><td colspan="4" style="text-align:right;">VAT (${vatRate}%)</td><td style="text-align:right;">${fmtMoney(vatAmt)} ${cur}</td></tr>` : ''}
        </tfoot>
      </table>

      <div class="approve-section">
        <h2>✅ ${escapeHtml(t('ord.quote_approval_page'))}</h2>
        <p>${escapeHtml(t('ord.quote_how_to_approve'))}</p>
        ${contactEmail ? `<p style="margin-top:8px;">📧 <a href="mailto:${escapeHtml(contactEmail)}?subject=I approve quote ${escapeHtml(order.id)}">${escapeHtml(contactEmail)}</a></p>` : ''}
        ${contactPhone ? `<p style="margin-top:4px;">📱 <a href="https://wa.me/${contactPhone.replace(/\D/g,'')}?text=${encodeURIComponent('I approve quote ' + order.id)}">${escapeHtml(contactPhone)} (WhatsApp)</a></p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    const saved = await window.hubAPI.saveHtml(html, `quote-${orderId}.html`);
    if (saved) toast(t('ord.quote_approval_saved'), 'success');
  } catch (e) {
    console.error('exportQuoteApprovalPage error', e);
    toast('Could not save approval page.', 'error');
  }
}

/* ============================================================
   Feature 8: Order Edit History / Audit Trail
   ============================================================ */

/* ============================================================
   Feature 5: Capacity Forecast
   ============================================================ */

/* ============================================================
   Feature 5 (new batch): Email notification helpers
   ============================================================ */
async function autoSendEmailNotification(order, newStatus) {
  const cfg = settings.emailConfig;
  if (!cfg || cfg.provider === 'none' || !(cfg.triggers || []).includes(newStatus)) return;
  if (!order.clientId) return;
  const client = clients.find(c => c.id === order.clientId);
  if (!client?.email) {
    // Only toast if email notifications are expected (not a silent skip)
    if (cfg && cfg.provider !== 'none' && (cfg.triggers || []).includes(newStatus)) {
      toast(t('notify.no_email') || `No email on file for ${localName(client)} — notification not sent`, 'info', 3000);
    }
    return;
  }
  const shopName = settings.bizEn || 'Khayt';
  const statusLabel = t('queue.' + newStatus) || newStatus;
  const subject = `${shopName} — Order ${order.id} Update: ${statusLabel}`;
  const body = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
    <h2 style="color:#5E2E14;">${escapeHtml(shopName)}</h2>
    <p>Dear ${escapeHtml(localName(client) || client.email)},</p>
    <p>Your order <strong>${escapeHtml(order.id)}</strong> (${escapeHtml(order.project || '')}) has been updated:</p>
    <p style="font-size:18px;font-weight:bold;color:#5E2E14;">${escapeHtml(statusLabel)}</p>
    ${order.dueDate ? `<p>Due date: ${escapeHtml(order.dueDate)}</p>` : ''}
    <p>Thank you for your business!</p>
    <p style="font-size:12px;color:#888;">— ${escapeHtml(shopName)}</p>
  </div>`;
  try {
    const result = await window.hubAPI?.sendEmail?.({ to: client.email, subject, body, smtpConfig: cfg });
    if (result?.ok) {
      toast('📧 Email sent', 'success', 2000);
    } else if (result?.fallback && result?.mailtoUrl) {
      // silently ignore fallback — user has WhatsApp
    }
  } catch(e) { /* silent */ }
}

async function checkAndSendDigest() {
  if (_digestInFlight) return;
  const d = settings.emailDigest;
  if (!d?.enabled) return;
  const cfg = settings.emailConfig;
  if (!cfg || cfg.provider === 'none') return;
  const to = d.recipientEmail || settings.email;
  if (!to) return;
  const now = new Date();
  if (now.getHours() !== (d.hour ?? 8)) return;
  // Compute period key
  let periodKey;
  if (d.frequency === 'weekly') {
    if (now.getDay() !== (d.weekday ?? 1)) return;
    // ISO week number
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    periodKey = `${now.getFullYear()}-W${String(week).padStart(2,'0')}`;
  } else {
    periodKey = now.toISOString().split('T')[0];
  }
  if (d.lastSentDate === periodKey) return; // already sent
  const body = buildDigestEmailHtml();
  const subject = `${settings.bizEn || 'Khayt'} — ${d.frequency === 'weekly' ? 'Weekly' : 'Daily'} Digest`;
  _digestInFlight = true;
  try {
    const result = await window.hubAPI?.sendEmail?.({ to, subject, body, smtpConfig: cfg });
    if (result?.ok) {
      settings.emailDigest = { ...settings.emailDigest, lastSentDate: periodKey };
      saveAll();
    }
  } finally {
    _digestInFlight = false;
  }
}

/* ============================================================
   Feature 7 (new 8-pack): Operator PIN lock
   ============================================================ */

/** Render the PIN lock settings sub-section inside settings tab */
function openPinPadModal(afterUnlock) {
  const mount = $('#modalMount');
  const opList = operators.filter(o => o.active !== false);
  if (opList.length === 0) { toast('No operators configured', 'info'); return; }

  let selectedOpId = opList[0].id;
  let enteredPin = '';

  const render = () => {
    mount.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" style="max-width:340px;">
          <h3>${escapeHtml(t('op.switch') || 'Switch Operator')}</h3>
          <div style="margin-bottom:12px;">
            <label style="font-size:12.5px;">${escapeHtml(t('op.enter_pin') || 'Select operator')}</label>
            <select id="pinOpSelect" style="margin-top:4px;">
              ${opList.map(op => `<option value="${op.id}"${op.id === selectedOpId ? ' selected' : ''}>${escapeHtml(op.name)}${op.role ? ' · ' + escapeHtml(op.role) : ''}</option>`).join('')}
            </select>
          </div>
          <div id="pinDisplay" style="font-size:24px;letter-spacing:10px;text-align:center;margin:10px 0;min-height:36px;color:var(--primary);">${'●'.repeat(enteredPin.length)}</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;">
            ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="btn pin-key" data-k="${n}" style="font-size:18px;padding:12px;">${n}</button>`).join('')}
            <button class="btn pin-key" data-k="C" style="font-size:14px;padding:12px;">C</button>
            <button class="btn pin-key" data-k="0" style="font-size:18px;padding:12px;">0</button>
            <button class="btn pin-key" data-k="⌫" style="font-size:18px;padding:12px;">⌫</button>
          </div>
          <div id="pinError" style="color:var(--danger);font-size:12.5px;min-height:20px;text-align:center;"></div>
          <div class="btn-row" style="margin-top:8px;">
            <button class="btn ghost" data-act="cancel-pin">${escapeHtml(t('common.cancel'))}</button>
            <button class="btn primary" id="btnConfirmPin">${escapeHtml(t('common.confirm'))}</button>
          </div>
        </div>
      </div>`;

    mount.querySelector('#pinOpSelect')?.addEventListener('change', e => {
      selectedOpId = e.target.value;
      enteredPin = '';
      render();
    });

    mount.querySelectorAll('.pin-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.k;
        if (k === 'C') { enteredPin = ''; }
        else if (k === '⌫') { enteredPin = enteredPin.slice(0, -1); }
        else if (enteredPin.length < 8) { enteredPin += k; }
        const disp = mount.querySelector('#pinDisplay');
        if (disp) disp.textContent = '●'.repeat(enteredPin.length);
      });
    });

    mount.querySelector('[data-act="cancel-pin"]')?.addEventListener('click', () => {
      mount.innerHTML = '';
    });

    mount.querySelector('#btnConfirmPin')?.addEventListener('click', async () => {
      const op = operators.find(o => o.id === selectedOpId);
      if (!op) { mount.innerHTML = ''; return; }
      // If no PIN set, allow free switch
      if (!op.pinHash) {
        settings.activeOperatorId = op.id;
        saveAll();
        mount.innerHTML = '';
        renderOperatorLockSettings();
        applyOperatorPermissions();
        toast(`Switched to ${op.name}`, 'success', 1800);
        if (afterUnlock) afterUnlock();
        return;
      }
      const errEl = mount.querySelector('#pinError');
      // Support legacy btoa PINs (migration: clear them and prompt re-set)
      if (isLegacyPin(op.pinHash)) {
        op.pinHash = '';
        saveAll();
        if (errEl) errEl.textContent = 'PIN reset for security upgrade — please set a new PIN in Settings.';
        enteredPin = '';
        return;
      }
      const entered = await hashPin(enteredPin);
      if (entered !== op.pinHash) {
        if (errEl) errEl.textContent = t('op.wrong_pin') || 'Incorrect PIN';
        enteredPin = '';
        const disp = mount.querySelector('#pinDisplay');
        if (disp) disp.textContent = '';
        return;
      }
      settings.activeOperatorId = op.id;
      saveAll();
      mount.innerHTML = '';
      renderOperatorLockSettings();
      applyOperatorPermissions();
      toast(`Switched to ${op.name}`, 'success', 1800);
      if (afterUnlock) afterUnlock();
    });
  };

  render();
}

/** Apply tab/feature restrictions based on active operator's role */
function applyOperatorPermissions() {
  if (!settings.operatorLockEnabled) {
    // Remove all restrictions
    $$('.tab-btn').forEach(b => b.style.display = '');
    $$('.restricted-blur').forEach(el => el.classList.remove('restricted-blur'));
    // Update nav operator badge if present
    const badge = $('#operatorNavBadge');
    if (badge) badge.textContent = '';
    return;
  }
  const activeOp = settings.activeOperatorId ? operators.find(o => o.id === settings.activeOperatorId) : null;
  const role = activeOp?.role?.toLowerCase() || '';

  // Role: 'sales' — hide settings, expenses, analytics deep features
  // Role: 'technician' — hide clients, settings financial details
  // Role: 'admin' — full access
  const isAdmin = !role || role.includes('admin');
  const isTech  = role.includes('tech');
  const isSales = role.includes('sales');

  // Settings tab restricted for non-admin
  const settingsBtn = $('[data-tab="settings-tab"]');
  if (settingsBtn) settingsBtn.style.display = isAdmin ? '' : 'none';

  // Analytics/expenses restricted for technician
  const analyticsBtn = $('[data-tab="analytics-tab"]');
  if (analyticsBtn && isTech) analyticsBtn.style.display = 'none';
  else if (analyticsBtn) analyticsBtn.style.display = '';

  // Clients restricted for technician
  const clientsBtn = $('[data-tab="clients-tab"]');
  if (clientsBtn && isTech) clientsBtn.style.display = 'none';
  else if (clientsBtn) clientsBtn.style.display = '';

  // Update nav badge
  const badge = $('#operatorNavBadge');
  if (badge && activeOp) badge.textContent = activeOp.name;
  else if (badge) badge.textContent = '';
}


/* ============================================================
   Round 12 — Feature 1: Outbound Webhooks
   ============================================================ */
async function fireWebhook(eventName, payload) {
  const wh = settings.webhooks;
  if (!wh?.enabled) return;
  const url = (wh.events || {})[eventName];
  if (!url) return;
  try {
    await window.hubAPI?.fireWebhook?.(url, eventName, payload, wh.secret || '');
  } catch(e) { /* silent — webhook failures must not block UI */ }
}


/* ============================================================
   Round 12 — Feature 3: Post-Delivery NPS / Star Rating Survey
   ============================================================ */
async function generateSurveyPage(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const token = order.surveyToken || ('srv-' + Date.now().toString(36));
  if (!order.surveyToken) { order.surveyToken = token; saveAll(); }

  const lanInfo = await window.hubAPI?.getLanUrl?.();
  const surveyUrl = lanInfo?.ok ? lanInfo.url + '/api/survey' : null;

  const shopName = escapeHtml(settings.bizEn || settings.bizAr || 'Khayt');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${shopName} — Order Feedback</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;}
  .card{background:#1e293b;border-radius:16px;padding:40px 36px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5);}
  h1{font-size:22px;margin:0 0 6px;} p{color:#94a3b8;margin:0 0 24px;}
  .stars{display:flex;justify-content:center;gap:8px;margin-bottom:24px;}
  .star{font-size:40px;cursor:pointer;transition:transform .15s;} .star:hover,.star.sel{transform:scale(1.2);}
  textarea{width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;color:#e2e8f0;border-radius:8px;padding:12px;font-size:14px;resize:vertical;min-height:90px;margin-bottom:16px;}
  button{background:#5E2E14;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:15px;cursor:pointer;font-weight:600;}
  button:hover{background:#7c3d1b;} .thanks{display:none;font-size:18px;font-weight:600;color:#4ade80;}
</style></head>
<body><div class="card">
  <h1>📦 ${shopName}</h1>
  <p>Order <strong>${escapeHtml(order.id)}</strong>${order.project ? ' — ' + escapeHtml(order.project) : ''}</p>
  <p>How would you rate your experience?</p>
  <div class="stars" id="stars">
    <span class="star" data-v="1">⭐</span>
    <span class="star" data-v="2">⭐</span>
    <span class="star" data-v="3">⭐</span>
    <span class="star" data-v="4">⭐</span>
    <span class="star" data-v="5">⭐</span>
  </div>
  <div id="ratingErr" style="display:none;color:#f87171;font-size:13px;margin:-16px 0 12px;">Please select a rating first.</div>
  <textarea id="comment" placeholder="Any comments? (optional)"></textarea>
  <button onclick="submit()">Submit Feedback</button>
  <div class="thanks" id="thanks">🎉 Thank you for your feedback!</div>
</div>
<script id="survey-config" type="application/json">{"token":${JSON.stringify(token)},"orderId":${JSON.stringify(orderId)}}</script>
<script>
  const _cfg = JSON.parse(document.getElementById('survey-config').textContent);
  let rating = 0;
  document.querySelectorAll('.star').forEach(s => {
    s.addEventListener('click', () => {
      rating = parseInt(s.dataset.v);
      document.querySelectorAll('.star').forEach((st, i) => st.classList.toggle('sel', i < rating));
    });
  });
  async function submit() {
    if (!rating) { document.getElementById('ratingErr').style.display='block'; return; }
    document.getElementById('ratingErr').style.display='none';
    const btn = document.querySelector('button');
    btn.disabled = true; btn.textContent = 'Sending…';
    const data = { token: _cfg.token, orderId: _cfg.orderId, rating, comment: document.getElementById('comment').value.trim() };
    ${surveyUrl ? `
    try {
      const r = await fetch(${JSON.stringify(surveyUrl)}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (r.ok) {
        document.getElementById('thanks').style.display = 'block';
        btn.style.display = 'none';
        document.getElementById('stars').style.pointerEvents = 'none';
      } else {
        btn.disabled = false; btn.textContent = 'Submit Feedback';
        document.getElementById('thanks').textContent = '⚠ Submission failed. Please try again.';
        document.getElementById('thanks').style.cssText = 'display:block;color:#f87171;';
      }
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Submit Feedback';
      document.getElementById('thanks').textContent = '⚠ Could not connect. Make sure you are on the same network.';
      document.getElementById('thanks').style.cssText = 'display:block;color:#f87171;';
    }
    ` : `
    document.getElementById('thanks').textContent = '⚠ Survey endpoint not available. Please contact the shop directly.';
    document.getElementById('thanks').style.cssText = 'display:block;color:#f87171;font-size:14px;';
    btn.disabled = false; btn.textContent = 'Submit Feedback';
    `}
  }
</script>
</body></html>`;

  window.hubAPI?.saveHtml?.(html, `survey-${orderId}.html`);
  toast(t('cl.portal_generated'), 'success', 4000);
}

function openRecordSurveyModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  openFormModal({
    title: '📊 Record Customer Feedback',
    saveLabel: 'Save',
    bodyHtml: `
      <p style="color:var(--text-muted);margin:0 0 16px;">Manually record the customer's rating for order <strong>${escapeHtml(orderId)}</strong>.</p>
      <label>Star Rating (1–5)</label>
      <div style="display:flex;gap:8px;margin-bottom:16px;" id="surveyStarRow">
        ${[1,2,3,4,5].map(n => `<button class="btn${(order.survey?.rating||0)>=n ? ' primary' : ' ghost'}" data-star="${n}" style="font-size:20px;padding:6px 10px;" type="button">⭐</button>`).join('')}
      </div>
      <label>Comment (optional)</label>
      <textarea id="surveyComment" rows="3">${escapeHtml(order.survey?.comment||'')}</textarea>`,
    onMount: () => {
      $$('#surveyStarRow button').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = parseInt(btn.dataset.star);
          $$('#surveyStarRow button').forEach((b, i) => {
            b.className = 'btn ' + (i < v ? 'primary' : 'ghost');
          });
        });
      });
    },
    onSave: () => {
      const rating = $$('#surveyStarRow button').filter(b => b.className.includes('primary')).length;
      order.survey = { rating, comment: $('#surveyComment').value.trim(), recordedAt: new Date().toISOString() };
      saveAll();
      toast(`✅ Rating saved: ${rating}/5`, 'success');
    }
  });
}


function getCarrierTrackingUrl(courierName, trackingNumber) {
  if (!courierName || !trackingNumber) return null;
  const key = courierName.toLowerCase().trim();
  const fn = CARRIER_TRACKING_URLS[key] ||
    Object.entries(CARRIER_TRACKING_URLS).find(([k]) => key.includes(k))?.[1];
  return fn ? fn(trackingNumber) : null;
}

/* ============================================================

/* ============================================================
   Round 12 — Feature 7: LAN API settings
   ============================================================ */

/* ============================================================
   ZATCA Phase 2 Settings
   ============================================================ */

/* ============================================================
   Feature H3: Exchange Rates Settings
   ============================================================ */

/* ============================================================
   BNPL / Payment Link Settings
   ============================================================ */

async function openBnplModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const buyer  = { name: client ? localName(client) : (order.client || ''), phone: client?.phone || '', email: client?.email || '' };
  const amount = +order.price || 0;
  const b      = settings.bnpl || {};

  const apiSvcs = BNPL_CATALOG.filter(s => s.hasApi && b[s.id]?.enabled && b[s.id]?.apiKey);

  const svcRows = apiSvcs.length
    ? apiSvcs.map(svc => `
        <div class="bnpl-modal-svc" data-svc="${escapeHtml(svc.id)}" style="padding:12px;background:var(--bg-elev);border-radius:var(--radius);margin-bottom:10px;border-left:3px solid ${escapeHtml(svc.color)};">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="font-weight:600;">${escapeHtml(svc.name)}</span>
            <button class="btn ghost small" id="bnplGen_${escapeHtml(svc.id)}">${t('bnpl.generate')}</button>
          </div>
          <div id="bnplResult_${escapeHtml(svc.id)}" style="margin-top:8px;font-size:12px;"></div>
        </div>`
    ).join('')
    : `<p style="color:var(--text-muted);font-size:13px;">${t('bnpl.configure_first')}</p>`;

  const infoCards = BNPL_CATALOG.filter(s => !s.hasApi).map(s =>
    `<a href="#" class="bnpl-info-card" data-url="${escapeHtml(s.dashUrl)}" style="padding:8px 10px;background:var(--bg-elev);border-radius:var(--radius);border-left:2px solid ${escapeHtml(s.color)};text-decoration:none;color:inherit;cursor:pointer;display:block;">
      <span style="font-weight:600;font-size:12px;">${escapeHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--text-muted);margin-left:6px;">${s.regions.slice(0,4).join('·')}</span>
    </a>`
  ).join('');

  openFormModal({
    title: `💳 ${t('bnpl.payment_modal')} — ${escapeHtml(order.project || order.id)}`,
    fields: [],
    extraHtml: `
      <div style="margin-bottom:6px;font-size:12px;color:var(--text-muted);">${t('bnpl.amount_label')}: <strong>${fmtPrice(amount)} ${currencySymbol()}</strong></div>
      <h4 style="font-size:13px;margin-bottom:8px;">${t('bnpl.integrated')}</h4>
      ${svcRows}
      <details style="margin-top:12px;">
        <summary style="font-size:12px;cursor:pointer;color:var(--text-muted);">${t('bnpl.directory')} (${BNPL_CATALOG.filter(s=>!s.hasApi).length} ${t('bnpl.services')})</summary>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px;margin-top:8px;">${infoCards}</div>
      </details>`,
    onSubmit: () => {},
  });

  // Wire up generate buttons
  for (const svc of apiSvcs) {
    document.getElementById(`bnplGen_${svc.id}`)?.addEventListener('click', async () => {
      const btn = document.getElementById(`bnplGen_${svc.id}`);
      const res_el = document.getElementById(`bnplResult_${svc.id}`);
      if (btn) { btn.disabled = true; btn.textContent = t('bnpl.generating'); }
      let result;
      const cfg = b[svc.id];
      const commonArgs = { amount, currency: cfg.currency || 'SAR', description: order.project || order.id, buyer, orderId: order.invoiceNumber || order.id, itemName: order.project || order.id };
      if (svc.id === 'tabby')  result = await window.hubAPI?.bnplTabby?.({ ...commonArgs, apiKey: cfg.apiKey, merchantCode: cfg.merchantCode });
      if (svc.id === 'tamara') result = await window.hubAPI?.bnplTamara?.({ ...commonArgs, apiKey: cfg.apiKey, country: cfg.country || 'SA' });
      if (svc.id === 'stripe') result = await window.hubAPI?.bnplStripe?.({ ...commonArgs, apiKey: cfg.apiKey, successUrl: cfg.successUrl, cancelUrl: cfg.cancelUrl, customerEmail: buyer.email });
      if (btn) { btn.disabled = false; btn.textContent = t('bnpl.generate'); }
      if (!res_el) return;
      if (result?.ok && result.url) {
        // Generate QR for the link
        let qrHtml = '';
        try { const svg = await window.hubAPI?.generateQR?.(result.url, { width: 120, margin: 1 }); if (svg) qrHtml = svg; } catch {}
        const waMsg = t('bnpl.wa_message',{name:buyer.name,url:result.url,service:svc.name}) || `Hi ${buyer.name}, here is your payment link: ${result.url}`;
        res_el.innerHTML = `
          <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
            <div>${qrHtml}</div>
            <div style="flex:1;min-width:120px;">
              <div style="word-break:break-all;font-size:11px;margin-bottom:6px;"><a href="#" class="bnpl-open-link" data-url="${escapeHtml(result.url)}" style="color:var(--primary);">${escapeHtml(result.url)}</a></div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn ghost small bnpl-copy-link" data-url="${escapeHtml(result.url)}">${t('bnpl.copy_link')}</button>
                <button class="btn ghost small bnpl-share-wa" data-wa-phone="${escapeHtml(buyer.phone||'')}" data-wa-msg="${escapeHtml(waMsg)}">${t('bnpl.share_wa')}</button>
              </div>
            </div>
          </div>`;
        res_el.querySelectorAll('.bnpl-open-link').forEach(a => {
          a.addEventListener('click', e => { e.preventDefault(); window.hubAPI?.openExternal?.(a.dataset.url); });
        });
        res_el.querySelectorAll('.bnpl-copy-link').forEach(btn => {
          btn.addEventListener('click', () => { navigator.clipboard.writeText(btn.dataset.url).then(() => window._toast?.(window._t?.('bnpl.link_copied') || 'Copied', 'success')).catch(() => {}); });
        });
        res_el.querySelectorAll('.bnpl-share-wa').forEach(btn => {
          btn.addEventListener('click', () => { window.hubAPI?.shareWhatsApp?.({ phone: btn.dataset.waPhone, message: btn.dataset.waMsg, pdfPath: null }); });
        });
        toast(t('bnpl.link_generated'), 'success');
      } else {
        res_el.innerHTML = `<span style="color:var(--danger);font-size:12px;">❌ ${escapeHtml(result?.error || 'Failed')}</span>`;
      }
    });
  }

  // Info card clicks
  document.querySelectorAll('.bnpl-info-card').forEach(card => {
    card.addEventListener('click', e => { e.preventDefault(); window.hubAPI?.openExternal?.(card.dataset.url); });
  });
}

async function startLanServer() {
  const lan = settings.lanApi || {};
  const res = await window.hubAPI?.startLanServer?.({ port: lan.port || 3219, pin: lan.pin || '', bindLan: lan.bindLan ? 'lan' : 'loopback' });
  const statusRow = $('#lanStatusRow');
  const qrWrap    = $('#lanQrWrap');
  if (res?.ok) {
    if (statusRow) {
      statusRow.innerHTML = `🟢 Active at <a href="#" class="lan-url-link" data-url="${escapeHtml(res.url)}" style="color:var(--primary);">${escapeHtml(res.url)}</a>`;
      statusRow.querySelectorAll('.lan-url-link').forEach(a => { a.addEventListener('click', e => { e.preventDefault(); window.hubAPI?.openExternal?.(a.dataset.url); }); });
    }
    settings.lanApi = { ...settings.lanApi, enabled: true };
    if (res.intakeTokenGenerated) settings.lanApi.intakeToken = STORE_SECRET_MASK;
    if (res.intakePinGenerated) settings.lanApi.intakePin = STORE_SECRET_MASK;
    saveAll();
    loadLanQr(res.url);
    updateWebhookUrlDisplay(res.url);
  } else {
    if (statusRow) statusRow.textContent = `❌ Failed: ${res?.error || 'unknown error'}`;
  }
}

function updateWebhookUrlDisplay(baseUrl) {
  const section = document.getElementById('lanWebhookSection');
  const display = document.getElementById('webhookUrlDisplay');
  if (!section || !display) return;
  const token = settings.lanApi?.webhookToken || '';
  if (!baseUrl || !token) { section.style.display = 'none'; return; }
  const firstMachine = machines[0];
  const machineId = firstMachine?.id || 'machine-id';
  const url = `${baseUrl}/api/webhook/printer/${encodeURIComponent(machineId)}`;
  display.textContent = url;
  let hint = section.querySelector('.webhook-token-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'webhook-token-hint';
    hint.style.cssText = 'font-size:11px;color:var(--text-muted);margin:6px 0 0;';
    display.insertAdjacentElement('afterend', hint);
  }
  hint.textContent = t('lan.webhook_header_hint') || 'Send webhook token via x-khayt-webhook-token header (not in URL)';
  section.style.display = 'block';
}

async function loadLanQr(urlOverride) {
  const qrWrap = $('#lanQrWrap');
  if (!qrWrap) return;
  let url = urlOverride;
  if (!url) {
    const res = await window.hubAPI?.getLanUrl?.();
    if (!res?.ok) return;
    url = res.url;
  }
  // PIN is passed via x-khayt-pin header by clients — never embed it in the QR URL
  const qrUrl = url + '/api/status';
  const svg = await window.hubAPI?.generateQR?.(qrUrl, { width: 150 });
  if (svg) {
    const pin = settings.lanApi?.pin;
    const pinNote = pin && !isSecretMasked(pin)
      ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">PIN: <code style="background:var(--bg);padding:1px 5px;border-radius:4px;">${escapeHtml(pin)}</code> (send via <code>x-khayt-pin</code> header)</div>`
      : pin && isSecretMasked(pin)
        ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">${escapeHtml(t('lan.pin_configured') || 'PIN configured — use Settings to view or change')}</div>`
        : '';
    qrWrap.style.display = 'block';
    qrWrap.innerHTML = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">Scan from phone to view queue: <span style="font-size:11px;opacity:0.7;">(click QR to copy URL)</span></div><div id="lanQrSvgWrap" style="cursor:pointer;display:inline-block;" title="Click to copy URL">${svg}</div>${pinNote}`;
    document.getElementById('lanQrSvgWrap')?.addEventListener('click', () => {
      navigator.clipboard.writeText(qrUrl).then(() => toast('URL copied to clipboard', 'success')).catch(() => {});
    });
  }
}

/* ============================================================
   Round 12 — Feature 8: Accounting Export (double-entry CSV)
   ============================================================ */
function exportAccountingCSV() {
  const rows = [['Date','DocNumber','Type','Description','Account','Debit','Credit','VAT','Currency']];
  const cur = currencySymbol();

  // Revenue entries (completed invoices)
  printLog.filter(o => o.status === 'completed').forEach(o => {
    const vatRate = settings.enableVat ? (settings.vatRate || 0) / 100 : 0;
    const subtotal = (+o.price || 0) / (1 + vatRate);
    const vat = (+o.price || 0) - subtotal;
    // Debit Accounts Receivable
    rows.push([o.date||o.timestamp?.split('T')[0]||'', o.id, 'Invoice', escapeHtml(o.project||o.client||'Order'), 'Accounts Receivable', (+o.price||0).toFixed(2), '', vat.toFixed(2), cur]);
    // Credit Revenue
    rows.push([o.date||o.timestamp?.split('T')[0]||'', o.id, 'Invoice', escapeHtml(o.project||o.client||'Order'), 'Revenue', '', subtotal.toFixed(2), '', cur]);
    // Credit VAT Payable
    if (vat > 0) rows.push([o.date||o.timestamp?.split('T')[0]||'', o.id, 'Invoice', 'VAT Payable', 'VAT Payable', '', vat.toFixed(2), vat.toFixed(2), cur]);
    // Payment entries
    if (o.paidAmount > 0) {
      rows.push([o.paidAt?.split('T')[0]||o.date||'', o.id, 'Payment', `Payment for ${escapeHtml(o.id)}`, 'Cash / Bank', (+o.paidAmount||0).toFixed(2), '', '', cur]);
      rows.push([o.paidAt?.split('T')[0]||o.date||'', o.id, 'Payment', `Payment for ${escapeHtml(o.id)}`, 'Accounts Receivable', '', (+o.paidAmount||0).toFixed(2), '', cur]);
    }
    if ((+o.giftCardDiscount || 0) > 0) {
      // Clear the gift-card-settled portion from A/R against the gift-card liability,
      // otherwise the exported ledger leaves that portion open forever.
      const gd = (+o.giftCardDiscount).toFixed(2);
      rows.push([o.paidAt?.split('T')[0]||o.date||'', o.id, 'Payment', `Gift card redeemed for ${escapeHtml(o.id)}`, 'Gift Card Liability', gd, '', '', cur]);
      rows.push([o.paidAt?.split('T')[0]||o.date||'', o.id, 'Payment', `Gift card redeemed for ${escapeHtml(o.id)}`, 'Accounts Receivable', '', gd, '', cur]);
    }
  });

  // Expense entries
  expenses.forEach(e => {
    rows.push([e.date||'', e.id||'', 'Expense', escapeHtml(e.note||e.category||'Expense'), `Expense: ${escapeHtml(e.category||'Other')}`, (+e.amount||0).toFixed(2), '', '', cur]);
    rows.push([e.date||'', e.id||'', 'Expense', escapeHtml(e.note||e.category||'Expense'), 'Cash / Bank', '', (+e.amount||0).toFixed(2), '', cur]);
  });

  downloadBlob(new Blob([rows.map(r => r.map(csvEsc).join(',')).join('\n')], { type: 'text/csv' }), 'khayt-accounting-journal.csv');
  toast('Accounting journal exported ✓', 'success');
}

/* ============================================================
   Round 12 — Feature 9: Saved filter presets
   ============================================================ */

/* ============================================================
   Round 12 — Feature 10: Per-job internal comment thread
   ============================================================ */
function renderOrderComments(orderId) {
  const el = $('#orderCommentsSection');
  if (!el) return;
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const comments = order.comments || [];
  const opName = settings.activeOperatorId
    ? (operators.find(op => op.id === settings.activeOperatorId)?.name || 'Operator')
    : (settings.bizEn || 'Admin');

  el.innerHTML = `
    <div id="commentFeed" style="max-height:260px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;">
      ${comments.length === 0 ? '<p style="color:var(--text-muted);font-size:12.5px;margin:0;">No internal notes yet.</p>' :
        comments.map(c => `
          <div style="background:var(--bg-elev);border-radius:var(--radius);padding:8px 12px;border-left:3px solid var(--primary);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:12px;font-weight:600;color:var(--primary);">${escapeHtml(c.authorName||'—')}</span>
              <span style="font-size:11px;color:var(--text-muted);">${new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <p style="margin:0;font-size:13px;white-space:pre-wrap;">${escapeHtml(c.text)}</p>
          </div>`).join('')
      }
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;">
      <textarea id="commentInput" rows="2" placeholder="Add internal note…" style="flex:1;resize:vertical;font-size:13px;"></textarea>
      <button class="btn primary" id="btnPostComment">Post</button>
    </div>`;

  // Auto-scroll to bottom
  const feed = el.querySelector('#commentFeed');
  if (feed) feed.scrollTop = feed.scrollHeight;

  el.querySelector('#btnPostComment')?.addEventListener('click', () => {
    const text = el.querySelector('#commentInput')?.value?.trim();
    if (!text) return;
    if (!order.comments) order.comments = [];
    order.comments.push({
      id: Date.now().toString(36),
      authorName: opName,
      text,
      createdAt: new Date().toISOString(),
    });
    saveAll();
    renderOrderComments(orderId);
  });
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
  const accentColor = safeCssColor(settings.invAccentColor, '#5E2E14');

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
      ? `Your order is temporarily on hold.${order.holdReason ? ' Reason: ' + escapeHtml(order.holdReason) : ''}`
      : 'Your order is being processed. We\'ll notify you when it\'s ready.';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Status — ${escapeHtml(order.id)}</title>
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
      <h1>${escapeHtml(bizName)}</h1>
      <p>Order Status Update</p>
    </div>
    <div class="body">
      <div class="stepper">${connectors}</div>
      <div class="info-row"><span class="info-label">Order #</span><span class="info-value">${escapeHtml(order.id)}</span></div>
      <div class="info-row"><span class="info-label">Project</span><span class="info-value">${escapeHtml(order.project || '—')}</span></div>
      <div class="info-row"><span class="info-label">Client</span><span class="info-value">${escapeHtml(clientName)}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value">${escapeHtml(STATUS_LABELS[order.status] || order.status)}</span></div>
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

/* ============================================================
   New 8-pack Feature 6: Split order across machines
   ============================================================ */

/* ============================================================
   New 8-pack Feature 8: Auto-export status page on status change
   ============================================================ */
async function autoExportStatusPage(order) {
  if (!order || !order.clientId) return;
  if (!window.hubAPI?.writeStatusPage) return;
  try {
    // Build the same HTML as exportOrderStatusPage but don't open it
    const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
    const clientName = client ? (localName(client) || order.project) : (order.project || '');
    const bizName = settings.bizEn || settings.bizAr || 'Khayt';
    const accentColor = safeCssColor(settings.invAccentColor, '#5E2E14');
    const STATUS_ORDER = ['quote', 'pending', 'on_hold', 'printing', 'post', 'completed'];
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
        ? `Your order is temporarily on hold.${order.holdReason ? ' Reason: ' + escapeHtml(order.holdReason) : ''}`
        : 'Your order is being processed. We\'ll notify you when it\'s ready.';
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Order Status — ${escapeHtml(order.id)}</title>
<style>* { box-sizing: border-box; margin: 0; padding: 0; }body { font-family: -apple-system, sans-serif; background: #f9fafb; color: #111827; padding: 24px 16px; }.card { background: #fff; border-radius: 16px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); max-width: 480px; margin: 0 auto; overflow: hidden; }.header { background: ${accentColor}; color: #fff; padding: 24px; }.header h1 { font-size: 22px; font-weight: 700; }.body { padding: 24px; }.info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }.info-label { color: #6b7280; }.info-value { font-weight: 600; }.stepper { display: flex; align-items: flex-start; margin: 24px 0; }.message { background: ${isReady ? '#d1fae5' : '#fffbeb'}; border-left: 4px solid ${isReady ? '#10b981' : '#f59e0b'}; padding: 14px 16px; border-radius: 8px; margin-top: 16px; font-size: 14px; color: #374151; }.footer { text-align: center; padding: 16px 24px; background: #f9fafb; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }</style></head><body>
<div class="card"><div class="header"><h1>${escapeHtml(bizName)}</h1><p>Order Status Update</p></div>
<div class="body"><div class="stepper">${connectors}</div>
<div class="info-row"><span class="info-label">Order #</span><span class="info-value">${escapeHtml(order.id)}</span></div>
<div class="info-row"><span class="info-label">Project</span><span class="info-value">${escapeHtml(order.project || '—')}</span></div>
<div class="info-row"><span class="info-label">Client</span><span class="info-value">${escapeHtml(clientName)}</span></div>
<div class="info-row"><span class="info-label">Status</span><span class="info-value">${escapeHtml(order.status)}</span></div>
${order.dueDate ? `<div class="info-row"><span class="info-label">Due</span><span class="info-value">${escapeHtml(order.dueDate)}</span></div>` : ''}
<div class="message">${escapeHtml(msg)}</div></div>
<div class="footer">Generated by ${escapeHtml(bizName)} · ${new Date().toLocaleDateString()}</div></div></body></html>`;
    const filePath = await window.hubAPI.writeStatusPage(html, order.id);
    return filePath || null;
  } catch (e) { console.error('autoExportStatusPage error', e); return null; }
}

async function openSavedStatusPage(orderId) {
  if (!window.hubAPI?.writeStatusPage || !window.hubAPI?.openFile) return;
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const filePath = await autoExportStatusPage(order);
  if (filePath) {
    await window.hubAPI.openFile(filePath);
  }
  toast(t('ord.status_page_open'), 'success');
}

// Feature G1: Customer Portal QR modal
async function openCustomerPortalModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;

  const lanInfo = await window.hubAPI?.getLanUrl?.();
  if (!lanInfo?.ok) {
    openFormModal({
      title: t('ord.portal_qr_title') || 'Customer Portal QR',
      noSave: true,
      sizeLg: false,
      bodyHtml: `
        <div style="text-align:center;padding:16px 0;">
          <div style="font-size:32px;margin-bottom:12px;">⚠</div>
          <p style="color:var(--warning);font-weight:600;margin-bottom:8px;">${escapeHtml(t('lan.not_running') || 'LAN server is not running')}</p>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">${escapeHtml(t('lan.start_hint') || 'Start the LAN server in Settings first')}</p>
          <button class="btn primary" onclick="showTab('settings-tab');$('#modalMount').innerHTML='';">${escapeHtml(t('nav.settings') || 'Go to Settings')}</button>
        </div>`,
    });
    return;
  }

  const url = `${lanInfo.url}/order/${orderId}/status`;
  let qrHtml = '';
  try {
    const qrDataUrl = await window.hubAPI.generateQR(url, { width: 200 });
    if (qrDataUrl) qrHtml = `<img src="${escapeHtml(qrDataUrl)}" alt="QR" style="width:200px;height:200px;display:block;margin:0 auto;">`;
  } catch(e) { /* silent */ }

  openFormModal({
    title: t('ord.portal_qr_title') || 'Customer Portal QR',
    noSave: true,
    sizeLg: false,
    bodyHtml: `
      <div style="text-align:center;padding:12px 0;">
        ${qrHtml || '<p style="color:var(--text-muted);">QR unavailable</p>'}
        <p style="font-size:12px;color:var(--text-muted);margin:12px 0 6px;word-break:break-all;">${escapeHtml(url)}</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px;">
          <button class="btn small" id="portalQrCopy">${escapeHtml(t('common.copy') || 'Copy URL')}</button>
          <button class="btn small primary" id="portalQrWa">${escapeHtml(t('inv.share_whatsapp') || 'Share WhatsApp')}</button>
        </div>
      </div>`,
    onMount(modal) {
      modal.querySelector('#portalQrCopy')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); toast(t('common.copied') || 'Copied!', 'success'); }
        catch { toast(url, 'info', 6000); }
      });
      modal.querySelector('#portalQrWa')?.addEventListener('click', async () => {
        const waMsg = `${t('ord.portal_track_msg') || 'Track your order'}: ${url}`;
        const cl = order.clientId ? clients.find(c => c.id === order.clientId) : null;
        const phone = cl?.phone || '';
        if (window.hubAPI?.shareWhatsApp) {
          await window.hubAPI.shareWhatsApp({ phone, message: waMsg, pdfPath: null });
        } else {
          const waUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
          window.open(waUrl, '_blank');
        }
      });
    },
  });
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

/* ============================================================
   Invoice void / cancel
   ============================================================ */


/* ============================================================
   Feature 3 (this batch): Milestone / partial invoice
   ============================================================ */

function openMilestoneInvoices(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  if (!order.milestoneInvoices) order.milestoneInvoices = [];

  function listHtml() {
    if (order.milestoneInvoices.length === 0) {
      return `<p style="color:var(--text-muted);font-size:13px;">${escapeHtml(t('waste.empty'))}</p>`;
    }
    return `<table style="width:100%;font-size:12.5px;border-collapse:collapse;">
      <thead><tr style="border-bottom:1px solid var(--border-soft);color:var(--text-muted);">
        <th style="padding:5px 8px;text-align:left;">${escapeHtml(t('ord.milestone_label'))}</th>
        <th style="padding:5px 8px;text-align:right;">${escapeHtml(t('ord.milestone_pct'))}</th>
        <th style="padding:5px 8px;text-align:right;">${escapeHtml(t('ord.milestone_amount'))}</th>
        <th style="padding:5px 8px;">${escapeHtml(t('ord.milestone_issued'))}</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${order.milestoneInvoices.map((m, i) => `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
          <td style="padding:6px 8px;">${escapeHtml(m.label)}</td>
          <td style="padding:6px 8px;text-align:right;">${escapeHtml(String(m.percentage))}%</td>
          <td style="padding:6px 8px;text-align:right;">${fmtPrice(m.amount)}</td>
          <td style="padding:6px 8px;color:var(--text-muted);">${m.issuedAt ? escapeHtml(m.issuedAt) : '—'}</td>
          <td style="padding:6px 8px;">
            <button class="btn small" data-mi="${i}">${escapeHtml(t('ord.milestone_issue'))}</button>
            <button class="btn danger small" data-mi-del="${i}" style="margin-inline-start:4px;">×</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  openFormModal({
    title: `${t('ord.milestone_invoices')} — ${escapeHtml(order.id)}`,
    sizeLg: true,
    noSave: true,
    bodyHtml: `
      <div id="milestoneListWrap">${listHtml()}</div>
      <hr class="divider" style="margin:16px 0;">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;align-items:end;">
        <div>
          <label style="margin:0;">${escapeHtml(t('ord.milestone_label'))}</label>
          <input type="text" id="msLabel" placeholder="e.g. Deposit" style="font-size:12.5px;">
        </div>
        <div>
          <label style="margin:0;">${escapeHtml(t('ord.milestone_pct'))} (%)</label>
          <input type="number" id="msPct" min="1" max="100" step="1" placeholder="50" style="font-size:12.5px;">
        </div>
        <div>
          <label style="margin:0;">${escapeHtml(t('ord.milestone_amount'))} (${currencySymbol()})</label>
          <input type="number" id="msAmount" min="0" step="0.01" placeholder="0.00" style="font-size:12.5px;">
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn small primary" id="btnAddMilestone">${escapeHtml(t('ord.milestone_add'))}</button>
      </div>`,
    onMount(modal) {
      const wrap = modal.querySelector('#milestoneListWrap');
      function refresh() { wrap.innerHTML = listHtml(); wireIssue(); }
      function wireIssue() {
        wrap.querySelectorAll('[data-mi]').forEach(btn => {
          btn.addEventListener('click', () => {
            generateMilestoneInvoice(orderId, order.milestoneInvoices[+btn.dataset.mi]);
          });
        });
        wrap.querySelectorAll('[data-mi-del]').forEach(btn => {
          btn.addEventListener('click', () => {
            order.milestoneInvoices.splice(+btn.dataset['mi-del'] ?? +btn.getAttribute('data-mi-del'), 1);
            saveAll(); refresh();
          });
        });
      }
      wireIssue();
      // Auto-compute amount when % changes
      modal.querySelector('#msPct')?.addEventListener('input', (e) => {
        const pct = parseFloat(e.target.value) || 0;
        const amtEl = modal.querySelector('#msAmount');
        if (amtEl && order.price) amtEl.value = fmtMoney(+order.price * pct / 100);
      });
      modal.querySelector('#btnAddMilestone').addEventListener('click', () => {
        const label = modal.querySelector('#msLabel').value.trim() || 'Milestone';
        const pct = parseFloat(modal.querySelector('#msPct').value) || 0;
        const amount = parseFloat(modal.querySelector('#msAmount').value) || 0;
        order.milestoneInvoices.push({ id: uid('MS'), label, percentage: pct, amount, issuedAt: null });
        saveAll(); refresh();
        modal.querySelector('#msLabel').value = '';
        modal.querySelector('#msPct').value = '';
        modal.querySelector('#msAmount').value = '';
      });
    }
  });
}

/* ============================================================
   Feature 4 (this batch): AP — supplier invoice recording
   ============================================================ */


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
          <div class="mark">${safeBizLogo() ? `<img src="${safeBizLogo()}" style="max-height:50px; max-width:100px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
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
            <th style="width:80px;">${escapeHtml(isAr ? 'اللون' : 'Colour')}</th>
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
              <td style="font-size:11px;">${escapeHtml(p.colour || invItem?.colourVariant || '—')}</td>
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



// showBetaWarning() removed — app is out of beta as of v2.0.5

/* ============================================================
   Setup wizard (Business Mode first-run)
   ============================================================ */
function initWizard() {
  if (!settings.firstRun) return;
  const wiz = $('#setup-wizard');
  if (!wiz) return;
  wiz.style.display = 'flex';
  i18n.applyToDom(wiz);

  let selectedMode = 'simple';

  // Step navigation
  wiz.addEventListener('click', e => {
    const nextBtn   = e.target.closest('[data-next]');
    const optionBtn = e.target.closest('.wizard-option');
    const finishBtn = e.target.closest('#wizFinish');

    if (optionBtn) {
      wiz.querySelectorAll('.wizard-option').forEach(o => o.classList.remove('selected'));
      optionBtn.classList.add('selected');
      selectedMode = optionBtn.dataset.mode;
      setTimeout(() => goToStep(parseInt(optionBtn.dataset.next)), 300);
      return;
    }

    if (nextBtn && !optionBtn) {
      goToStep(parseInt(nextBtn.dataset.next));
      return;
    }

    if (finishBtn) {
      finishWizard();
    }
  });

  function goToStep(n) {
    wiz.querySelectorAll('.wizard-step').forEach(s => s.style.display = 'none');
    const step = $(`#wiz-step-${n}`);
    if (step) step.style.display = '';
    wiz.querySelectorAll('.wizard-dot').forEach(d => {
      d.classList.toggle('active', parseInt(d.dataset.step) <= n);
    });
  }

  function finishWizard() {
    const bizName  = $('#wizBizName').value.trim();
    const currency = $('#wizCurrency').value;
    const lang     = $('#wizLang').value;

    if (bizName) settings.businessName = bizName;
    if (bizName) settings.bizEn = bizName;
    settings.currency = currency;
    settings.mode     = selectedMode;
    settings.enableZatca = $('#wizEnableZatca')?.checked !== false;
    settings.firstRun = false;
    settings.firstRunDone = true;
    saveAll();

    settings.lang = lang || 'en';
    i18n.set(settings.lang);
    saveAll();

    wiz.style.display = 'none';
    applyMode();
    loadSettingsIntoForm();
    initialRender();
    toast(t('wiz.welcome_done'), 'success', 4000);
  }
}

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  pruneExpiredNotifs();

  // Existing users who had data before Business Mode was introduced:
  // give them Professional mode and skip the wizard.
  // Detection: firstRun=true but firstRunDone=true means old user (firstRun defaulted in).
  // Also catch cases where firstRun is undefined/null.
  const isExistingUser = (
    (settings.firstRun === undefined || settings.firstRun === null) ||
    (settings.firstRun === true && settings.firstRunDone === true)
  ) && (printLog.length > 0 || clients.length > 0);
  if (isExistingUser) {
    settings.mode = settings.mode || 'professional';
    settings.firstRun = false;
    settings.firstRunDone = true;
    saveAll();
  }

  applyTheme(settings.theme || 'dark');
  applyMode();
  i18n.init();
  if (settings.lang) i18n.set(settings.lang, { silent: true });
  const langSel = $('#langSelect');
  if (langSel) langSel.value = i18n.current;

  wireEvents();
  loadSettingsIntoForm();
  refreshCurrencyLabels();
  initialRender();
  updateNotifBadge();
  applyProductionPause();
  // Feature 7 (new 8-pack): Apply operator permissions at startup
  applyOperatorPermissions();
  // Show/hide the nav operator switch button
  const navOpBtn = $('#btnNavSwitchOp');
  if (navOpBtn) navOpBtn.style.display = settings.operatorLockEnabled ? 'inline-flex' : 'none';

  initAppShell();

  // Feature 2 (new batch): Start live printer polling for connected machines
  const apiMachines = machines.filter(m => m.printerApi?.type && m.printerApi.type !== 'none');
  if (apiMachines.length > 0 && window.hubAPI?.startPrinterPolling) {
    window.hubAPI.startPrinterPolling(apiMachines).then(cache => {
      machineStatusCache = cache || {};
      updateKanbanLiveStatus();
    }).catch(() => {});
  }
  if (window.hubAPI?.onPrinterStatusUpdate) {
    window.hubAPI.onPrinterStatusUpdate(data => {
      machineStatusCache = data || {};
      updateKanbanLiveStatus();
    });
  }

  let currentVersion = '2.0.16';
  if (window.hubAPI?.appVersion) {
    try { currentVersion = await window.hubAPI.appVersion(); }
    catch (_) {}
  }
  if ($('#appVersion')) $('#appVersion').textContent = currentVersion || '2.0.16 (dev)';

  // ── Post-update "data survived" toast ────────────────────────────────────────
  // If the previous session stored a pending-update version and we're now running
  // that version (or any newer one), show a brief confirmation.
  (function checkPostUpdateNotice() {
    const pendingVer = localStorage.getItem('khayt_pending_update_to');
    if (!pendingVer) return;
    // Strip only the pre-release suffix ('2.1.0-beta.1' → '2.1.0') before comparing.
    // Don't use a regex that removes hyphens mid-string — that collapses '2.0.4-beta.1'
    // to '2.0.41' and confuses the comparator.
    const norm = v => (v || '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    const gte = (a, b) => {
      const [aa, ba] = [norm(a), norm(b)];
      const len = Math.max(aa.length, ba.length);
      for (let i = 0; i < len; i++) {
        if ((aa[i] || 0) > (ba[i] || 0)) return true;
        if ((aa[i] || 0) < (ba[i] || 0)) return false;
      }
      return true; // equal
    };
    // Extra guard: if currentVersion still carries a pre-release tag (e.g. '-beta.1')
    // the stable release hasn't landed yet — suppress the toast.
    const isStable = !String(currentVersion).includes('-');
    if (isStable && gte(currentVersion, pendingVer)) {
      localStorage.removeItem('khayt_pending_update_to');
      setTimeout(() => {
        toast(
          `✅ Updated to Khayt ${escapeHtml(currentVersion)} — your data is intact. ` +
          `A pre-update backup was saved to <em>Settings → Backup</em>.`,
          'success', 7000
        );
      }, 2500); // slight delay so the UI is fully painted first
    }
  })();

  // ── Auto-updater UI ─────────────────────────────────────────────────────────
  // electron-updater fires IPC events from main; we show a non-intrusive banner.
  (function wireUpdaterUI() {
    const BANNER_CSS = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'background:var(--primary);color:#fff;padding:10px 18px;border-radius:20px;font-size:13px;' +
      'font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.35);display:flex;align-items:center;gap:10px;white-space:nowrap;';

    function makeBanner(html) {
      const el = document.createElement('div');
      el.id = 'updateBanner';
      el.style.cssText = BANNER_CSS;
      el.innerHTML = html;
      document.getElementById('updateBanner')?.remove();
      document.body.appendChild(el);
      return el;
    }

    // 1. Update available — ask user to download
    window.hubAPI?.onUpdateAvailable?.((info) => {
      const banner = makeBanner(
        `🎉 Khayt <strong>${escapeHtml(info.version)}</strong> is available! ` +
        `<button id="updBtnDownload" style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:3px 12px;border-radius:12px;cursor:pointer;font-size:12px;">Download</button> ` +
        `<span id="updBtnClose" style="opacity:.7;font-size:18px;cursor:pointer;line-height:1;">×</span>`
      );
      banner.querySelector('#updBtnDownload')?.addEventListener('click', () => {
        banner.innerHTML = `⬇️ Downloading update… <span id="updProgress" style="opacity:.8;font-size:12px;">0%</span>`;
        window.hubAPI?.startUpdateDownload?.();
      });
      banner.querySelector('#updBtnClose')?.addEventListener('click', () => banner.remove());
    });

    // 2. Download progress — update the % counter
    window.hubAPI?.onUpdateDownloadProgress?.((progress) => {
      const el = document.getElementById('updProgress');
      if (el) el.textContent = `${progress.percent}%`;
    });

    // 2b. Update error — surface it instead of leaving the banner stuck at 0%
    window.hubAPI?.onUpdateError?.((err) => {
      const banner = document.getElementById('updateBanner');
      if (!banner) return;
      const msg = escapeHtml(err?.message || 'Update failed');
      banner.innerHTML =
        `⚠ Update failed: <span style="opacity:.85;font-size:12px;">${msg}</span> ` +
        `<span id="updBtnCloseErr" style="opacity:.7;font-size:18px;cursor:pointer;line-height:1;margin-inline-start:6px;">×</span>`;
      banner.querySelector('#updBtnCloseErr')?.addEventListener('click', () => banner.remove());
    });

    // 3. Download complete — show restart button
    window.hubAPI?.onUpdateDownloaded?.((info) => {
      const banner = makeBanner(
        `✅ Khayt <strong>${escapeHtml(info.version)}</strong> ready — ` +
        `<button id="updBtnRestart" style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:3px 12px;border-radius:12px;cursor:pointer;font-size:12px;">Restart &amp; install</button> ` +
        `<span id="updBtnClose2" style="opacity:.7;font-size:18px;cursor:pointer;line-height:1;">×</span>`
      );
      banner.querySelector('#updBtnRestart')?.addEventListener('click', async () => {
        const btn = banner.querySelector('#updBtnRestart');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving data…'; }

        // 1. Flush any pending debounced save immediately — closes the race window.
        //    Cancel the timer BEFORE capturing the snapshot so no concurrent
        //    debounced write can race with the explicit flush below.
        if (_saveAllTimer) { clearTimeout(_saveAllTimer); _saveAllTimer = null; }
        const snapshot = buildStoreSnapshot();
        try { await _doSave(snapshot); } catch (_) {}

        // 2. Write a named pre-update backup so the user can always roll back.
        if (btn) btn.textContent = 'Backing up…';
        try {
          const json = JSON.stringify({
            version: 5, exportedAt: new Date().toISOString(), ...snapshot,
          });
          await window.hubAPI?.writeUpdateBackup?.(json, info.version);
        } catch (_) {}

        // 3. Record the pending update version so we can show a "what's new" banner
        //    after the app relaunches on the new version.
        localStorage.setItem('khayt_pending_update_to', String(info.version));

        // Safety valve: if the process hasn't quit after 30 s the install
        // silently failed — clear the key so we never show a false "updated" toast.
        setTimeout(() => {
          if (localStorage.getItem('khayt_pending_update_to') === String(info.version)) {
            localStorage.removeItem('khayt_pending_update_to');
            toast('⚠ Update installation failed — please restart the app manually.', 'error', 8000);
            if (btn) { btn.disabled = false; btn.textContent = 'Restart & install'; }
          }
        }, 30_000);

        // 4. Hand the final snapshot to main.js so it can do one last atomic write
        //    before killing the process.
        window.hubAPI?.installUpdate?.(snapshot);
      });
      banner.querySelector('#updBtnClose2')?.addEventListener('click', () => banner.remove());
    });
  })();

  // ── Manual "Check for updates" button in Settings ────────────────────────
  (function wireCheckForUpdatesBtn() {
    const btn = document.getElementById('btnCheckForUpdates');
    const msg = document.getElementById('updateStatusMsg');
    if (!btn || !window.hubAPI?.checkForUpdates) return;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Checking…';
      if (msg) { msg.textContent = ''; }
      try {
        await window.hubAPI.checkForUpdates();
        // Give the updater 4 seconds to fire onUpdateAvailable if there is one.
        // If nothing fires we show "You're up to date".
        setTimeout(() => {
          if (!document.getElementById('updateBanner')) {
            if (msg) msg.textContent = '✓ You\'re up to date';
          }
          btn.disabled = false;
          btn.textContent = t('set.check_updates') || 'Check for updates';
        }, 4000);
      } catch (e) {
        if (msg) msg.textContent = '⚠ Check failed';
        btn.disabled = false;
        btn.textContent = t('set.check_updates') || 'Check for updates';
      }
    });
  })();

  // Email digest scheduler — checks every 5 minutes
  setInterval(checkAndSendDigest, 5 * 60 * 1000);
  setTimeout(checkAndSendDigest, 10_000); // also run ~10s after boot in case we're already in the send window

  // Daily auto-backup (silent) + populate last-backup label
  maybeAutoBackup();
  updateLastBackupDisplay();

  // iOS companion: react to spools/orders changed via LAN API from phone
  if (window.hubAPI?.onLanSpoolAdded) {
    window.hubAPI.onLanSpoolAdded(spool => {
      // Phone added a spool — patch in-memory state and persist so next saveAll() doesn't clobber it
      if (spool && spool.id && !inventory.find(s => s.id === spool.id)) {
        inventory.push(spool);
        saveAll(); // keep in-memory and on-disk in sync before any UI save can overwrite
        renderInventory();
        toast('📱 ' + t('inv.spool_added_phone', { name: ((spool.brand || '') + ' ' + (spool.material || '')).trim() || spool.id }), 'success', 4000);
      }
    });
  }
  if (window.hubAPI?.onLanOrderUpdated) {
    window.hubAPI.onLanOrderUpdated((payload) => {
      const { id, status } = payload;
      const idx = printLog.findIndex(o => o.id === id);
      if (idx !== -1) {
        // Existing order: patch status
        printLog[idx].status = status;
        if (payload.clientApprovedAt) printLog[idx].clientApprovedAt = payload.clientApprovedAt;
        if (!printLog[idx].statusHistory) printLog[idx].statusHistory = [];
        printLog[idx].statusHistory.push({ status, at: new Date().toISOString() });
        if (printLog[idx].statusHistory.length > 200) printLog[idx].statusHistory = printLog[idx].statusHistory.slice(-200);
        saveAll();
        renderLogs();
        renderKanban();
        toast('📱 ' + t('ord.status_updated_phone', { id, status }), 'info', 3000);
      } else if (id && payload.project) {
        // New order from Salla/Zid (or other source): add to printLog
        printLog.unshift({ ...payload });
        saveAll();
        renderLogs();
        renderKanban();
        const src = payload.source === 'zid' ? t('zidOrderReceived') : t('sallaOrderReceived');
        toast('🛒 ' + (src || 'New order received'), 'success', 4000);
      }
    });
  }
  if (window.hubAPI?.onLanSurveySubmitted) {
    window.hubAPI.onLanSurveySubmitted(({ orderId, rating }) => {
      const o = printLog.find(x => x.id === orderId);
      if (o) {
        loadFromDisk();
        toast(`⭐ Survey received for "${o.project || orderId}": ${rating}/5`, 'success', 5000);
      }
    });
  }
  if (window.hubAPI?.onLanStartFailed) {
    window.hubAPI.onLanStartFailed(() => {
      toast(t('lan.start_failed') || 'LAN server failed to start — port may be in use', 'warning', 6000);
    });
  }
  window.hubAPI?.onLanKanbanAdvanced?.(({ id, from, to, project }) => {
    // Update the order in memory
    const idx = printLog.findIndex(o => o.id === id);
    if (idx !== -1) {
      printLog[idx] = { ...printLog[idx], status: to };
      renderKanban();
      renderLog();
    }
    toast(`🖨️ ${escapeHtml(project || id)}: ${from} → ${to}`, 'success');
  });
  window.hubAPI?.onTunnelStatusChanged?.(({ active, url, error }) => {
    const tRow = document.getElementById('tunnelStatusRow');
    if (!active) {
      if (tRow) tRow.textContent = error ? `❌ ${error}` : '⚫ Tunnel inactive';
    } else if (url && tRow) {
      tRow.innerHTML = `🟢 Active at <a href="#" class="lan-url-link" data-url="${escapeHtml(url)}" style="color:var(--primary)">${escapeHtml(url)}</a>`;
      tRow.querySelectorAll('.lan-url-link').forEach(a => { a.addEventListener('click', e => { e.preventDefault(); window.hubAPI?.openExternal?.(a.dataset.url); }); });
      updateWebhookUrlDisplay(url);
    }
  });

  // LAN intake form submission → add to waiting list and refresh
  window.hubAPI?.onLanIntakeSubmitted?.((entry) => {
    if (!entry?.id) return;
    if (waitingList.some(w => w.id === entry.id)) {
      renderWaitingList();
      updateWaitingBadge();
      toast(t('intakeFormSubmitted'), 'success');
      return;
    }
    const draft = {
      id: entry.id,
      project: entry.project || (entry.description ? entry.description.slice(0, 80) : null) || t('waiting.untitled'),
      clientName: entry.clientName || entry.name || '',
      notes: entry.notes || entry.description || '',
      email: entry.email,
      phone: entry.phone,
      material: entry.material,
      budget: entry.budget,
      referenceLink: entry.referenceLink,
      priority: entry.priority || 'normal',
      status: entry.status || 'active',
      source: entry.source || 'intake_form',
      estValue: entry.estValue || 0,
      reminderDate: entry.reminderDate || entry.deadline || entry.dueDate || null,
      createdAt: entry.submittedAt || entry.createdAt || new Date().toISOString(),
    };
    Object.keys(draft).forEach(k => draft[k] === undefined && delete draft[k]);
    waitingList.unshift(draft);
    renderWaitingList();
    updateWaitingBadge();
    toast(t('intakeFormSubmitted'), 'success');
  });

  // Round 12: Start LAN API server if enabled
  if (settings.lanApi?.enabled) {
    startLanServer().catch(e => {
      console.error('LAN server failed to start:', e);
      toast(t('lan.start_failed') || 'LAN server failed to start — port may be in use', 'warning', 6000);
    });
  }

  // Business Mode setup wizard (new first-run experience)
  initWizard();

  // Upgraded installs: wizard already done but legacy onboarding flag never set
  if (!settings.firstRunDone && !settings.firstRun) {
    settings.firstRunDone = true;
    saveAll();
  }

  // Global search keyboard shortcut ⌘K / Ctrl+K, plus tab-nav shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      globalSearchOpen ? closeGlobalSearch() : openGlobalSearch();
      return;
    }
    if (e.key === 'Escape' && globalSearchOpen) {
      closeGlobalSearch();
      return;
    }
    // Single-key navigation shortcuts — only when no input/modal is focused
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.querySelector('.modal-backdrop')) return; // modal open
    switch (e.key) {
      case 'n': case 'N': switchTab('calculator-tab'); break;
      case 'o': case 'O': switchTab('logs-tab'); break;
      case 'q': case 'Q': switchTab('queue-tab'); break;
      case 'i': case 'I': switchTab('inventory-tab'); break;
      case 'a': case 'A': switchTab('analytics-tab'); break;
      case 'c': case 'C': switchTab('clients-tab'); break;
      case '?': openHelpModal(); break;
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

/* ============================================================
   BATCH-2 FEATURES (Features 1-15)
   ============================================================ */


/* ── Feature 2: Shift-Start Checklist ──────────────────────── */
function openShiftChecklistModal() {
  const checks = [
    { id: 'c1', label: t('checkFilamentLevels')    || 'Check filament levels on all printers' },
    { id: 'c2', label: t('verifyTemperatures')     || 'Verify printer temperatures are correct' },
    { id: 'c3', label: t('reviewOrderQueue')       || "Review today's order queue" },
    { id: 'c4', label: t('checkFailedPrints')      || 'Check for any failed prints from previous shift' },
    { id: 'c5', label: t('cleanPrintSurfaces')     || 'Clean print surfaces' },
    { id: 'c6', label: t('logShiftStartTime')      || 'Log shift start time' },
  ];
  const bodyHtml = `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">${escapeHtml(t('shiftChecklistHint') || 'Complete the checklist before starting your shift.')}</p>
    ${checks.map(c => `
      <label style="display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;border-bottom:1px solid var(--border-soft);">
        <input type="checkbox" id="shift_${c.id}" style="width:auto;margin:0;accent-color:var(--primary);">
        <span style="font-size:13px;">${escapeHtml(c.label)}</span>
      </label>`).join('')}`;
  openFormModal({
    title: '▶ ' + t('shiftChecklist'),
    bodyHtml,
    saveLabel: t('startShift') || 'Start Shift',
    sizeLg: false,
    onSave(modal) {
      const count = checks.filter(c => modal.querySelector(`#shift_${c.id}`)?.checked).length;
      if (!shiftLogs) shiftLogs = [];
      const activeOp = settings.activeOperatorId
        ? (operators.find(o => o.id === settings.activeOperatorId)?.name || null)
        : null;
      shiftLogs.push({
        id: uid('SHF'),
        startedAt: new Date().toISOString(),
        operator: activeOp,
        checksCompleted: count,
        totalChecks: checks.length,
      });
      saveAll();
      toast('Shift started!', 'success');
    },
  });
}

/* ── Feature 3: End-of-Day Report Modal ─────────────────────── */
function openEndOfDayReport() {
  const today = localDateStr();
  const completedToday = printLog.filter(o => o.status === 'completed' && (o.completedAt || o.date || '').startsWith(today));
  const revenueToday   = completedToday.reduce((s, o) => s + orderRevenueBase(o), 0);
  const inProgress     = printLog.filter(o => ['pending','printing','post','qc'].includes(o.status));
  const wasteToday     = wasteLog.filter(w => (w.date || '').startsWith(today));
  const wasteTotalG    = wasteToday.reduce((s, w) => s + (+w.weight || 0), 0);
  const timeToday      = timeEntries.filter(te => (te.date || te.startedAt || '').startsWith(today));
  const timeTotal      = timeToday.reduce((s, te) => s + (+te.durationMins || 0), 0);
  const overdueOrders  = printLog.filter(o => o.dueDate === today && o.status !== 'completed' && o.status !== 'quote');

  const overdueHtml = overdueOrders.length > 0 ? `
    <div style="background:rgba(245,166,35,0.1);border:1px solid rgba(245,166,35,0.35);border-radius:6px;padding:10px;margin-top:12px;">
      <strong style="font-size:12px;color:var(--warning);">Due Today — Not Completed</strong>
      ${overdueOrders.map(o => `<div style="font-size:12px;margin-top:4px;">• ${escapeHtml(o.project || o.id)}</div>`).join('')}
    </div>` : '';

  const bodyHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-muted);">Orders Completed</div>
        <div style="font-size:24px;font-weight:700;">${completedToday.length}</div>
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-muted);">Revenue Today</div>
        <div style="font-size:20px;font-weight:700;">${fmtPrice(revenueToday)}</div>
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-muted);">In Progress</div>
        <div style="font-size:24px;font-weight:700;">${inProgress.length}</div>
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-muted);">Filament Used Today</div>
        <div style="font-size:20px;font-weight:700;">${wasteTotalG.toFixed(0)}g</div>
      </div>
      <div class="card" style="padding:12px;grid-column:1/-1;">
        <div style="font-size:11px;color:var(--text-muted);">Time Logged Today</div>
        <div style="font-size:20px;font-weight:700;">${(timeTotal / 60).toFixed(1)}h (${timeTotal} min)</div>
      </div>
    </div>
    ${overdueHtml}`;

  const eodHtmlForExport = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>End of Day Report — ${today}</title>
    <style>body{font-family:sans-serif;max-width:600px;margin:auto;padding:24px;}h1{font-size:20px;}table{width:100%;border-collapse:collapse;}td,th{border:1px solid #ddd;padding:8px;}</style></head>
    <body><h1>End of Day Report — ${escapeHtml(today)}</h1>
    <table><tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Orders Completed</td><td>${completedToday.length}</td></tr>
    <tr><td>Revenue</td><td>${fmtPrice(revenueToday)}</td></tr>
    <tr><td>In Progress</td><td>${inProgress.length}</td></tr>
    <tr><td>Filament Used</td><td>${wasteTotalG.toFixed(0)}g</td></tr>
    <tr><td>Time Logged</td><td>${timeTotal} min</td></tr>
    </table>${overdueOrders.length > 0 ? '<h2>Due Today — Not Completed</h2><ul>' + overdueOrders.map(o => `<li>${escapeHtml(o.project || o.id)}</li>`).join('') + '</ul>' : ''}
    </body></html>`;

  openFormModal({
    title: 'End of Day Report — ' + today,
    bodyHtml,
    sizeLg: false,
    noSave: false,
    saveLabel: 'Export as PDF',
    onSave() {
      if (window.hubAPI?.exportPDF) {
        window.hubAPI.exportPDF({ html: eodHtmlForExport, filename: `eod-report-${today}.pdf` })
          .then(() => toast('Report exported!', 'success'))
          .catch(() => toast('PDF export not available', 'error'));
      } else {
        toast('PDF export not available in this build', 'info');
      }
      return false; // keep modal open after export
    },
  });
}

/* ── Feature 4: Recurring Order Auto-Generation ─────────────── */
function processRecurringOrders() {
  const today = localDateStr();
  let created = 0;
  const toUpdate = [];

  for (const order of printLog) {
    if (!order.isRecurring) continue;
    if (!order.nextDueDate || order.nextDueDate > today) continue;

    // Check no child created in last 24h
    const recentChild = printLog.find(o =>
      o.parentRecurringId === order.id &&
      o.date >= new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    );
    if (recentChild) continue;

    const newOrder = {
      ...order,
      id: uid('REC'),
      date: today,
      dueDate: order.nextDueDate,
      status: 'pending',
      isRecurring: false,
      parentRecurringId: order.id,
      queuePos: printLog.filter(o => o.status === 'pending').length + 1,
      createdAt: new Date().toISOString(),
      completedAt: null,
      printingStartedAt: null,
      timerStart: null,
      timerPausedAt: null,
      timerPausedMs: null,
      // Clear fields that must not carry over from the parent order
      survey: null,
      paymentStatus: null,
      invoiceId: null,
      giftCardCode: null,
      giftCardDiscount: null,
      changeLog: [],
      failurePhotoPath: null,
    };
    printLog.push(newOrder);
    created++;

    // Advance nextDueDate
    const d = new Date(order.nextDueDate + 'T00:00:00');
    if (order.recurringInterval === 'weekly')   d.setDate(d.getDate() + 7);
    else if (order.recurringInterval === 'biweekly') d.setDate(d.getDate() + 14);
    else /* monthly */                          d.setMonth(d.getMonth() + 1);
    order.nextDueDate = d.toISOString().slice(0, 10);
    toUpdate.push(order.id);
  }

  if (created > 0) {
    saveAll();
    setTimeout(() => toast(`Auto-created ${created} recurring order${created > 1 ? 's' : ''}`, 'success', 4000), 500);
  }
}

/* ── Feature 5: Gift Cards / Store Credit ───────────────────── */
function renderGiftCards() {
  const container = document.getElementById('giftCardsContainer');
  if (!container) return;
  if (giftCards.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:24px;">${escapeHtml(t('giftCardEmpty') || 'No gift cards issued yet.')}</div>`;
    return;
  }
  const today = localDateStr();
  const rows = giftCards.map(gc => {
    const cl = gc.issuedTo ? clients.find(c => c.id === gc.issuedTo) : null;
    const expired = gc.expiresAt && gc.expiresAt < today;
    const status = expired ? t('gcExpired') || 'Expired' : (+gc.balance <= 0 ? t('gcUsed') || 'Used' : t('gcActive') || 'Active');
    const statusColor = expired ? 'var(--danger)' : (+gc.balance <= 0 ? 'var(--text-muted)' : 'var(--success)');
    return `<tr>
      <td style="font-family:monospace;">${escapeHtml(gc.code)}</td>
      <td>${fmtPrice(gc.balance)} / ${fmtPrice(gc.initialBalance)}</td>
      <td>${cl ? escapeHtml(localName(cl)) : (gc.issuedToName ? escapeHtml(gc.issuedToName) : '—')}</td>
      <td>${gc.expiresAt ? escapeHtml(gc.expiresAt) : '—'}</td>
      <td style="color:${statusColor};font-weight:600;">${escapeHtml(status)}</td>
    </tr>`;
  }).join('');
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>${escapeHtml(t('giftCardCode'))}</th><th>${escapeHtml(t('giftCardBalance'))}</th><th>${escapeHtml(t('giftCardIssuedTo'))}</th><th>${escapeHtml(t('giftCardExpiry'))}</th><th>${escapeHtml(t('common.status'))}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openCreateGiftCardModal() {
  const shortUid = () => uid('GC').replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const code = shortUid();
  const clientOptions = clients.map(c => `<option value="${c.id}">${escapeHtml(localName(c))}</option>`).join('');
  openFormModal({
    title: t('issueGiftCard'),
    sizeLg: false,
    saveLabel: t('common.save'),
    bodyHtml: `
      <label>${escapeHtml(t('giftCardCode'))}</label>
      <input type="text" id="gcCode" value="${escapeHtml(code)}" style="font-family:monospace;">
      <label style="margin-top:10px;">${escapeHtml(t('giftCardIssuedTo'))}</label>
      <select id="gcClient"><option value="">— ${escapeHtml(t('common.none') || 'None')} —</option>${clientOptions}</select>
      <label style="margin-top:10px;">${escapeHtml(t('giftCardInitialBalance'))} (${currencySymbol()})</label>
      <input type="number" id="gcBalance" min="0" step="0.01" value="50">
      <label style="margin-top:10px;">${escapeHtml(t('giftCardExpiry'))}</label>
      <input type="date" id="gcExpiry">`,
    onSave(modal) {
      const codeVal = modal.querySelector('#gcCode').value.trim().toUpperCase();
      const balance = Math.max(0, Math.min(100000, num(modal.querySelector('#gcBalance').value, 0)));
      if (!codeVal) { toast(t('giftCardCodeRequired') || 'Enter a code', 'error'); return false; }
      if (!/^[A-Z0-9]{3,20}$/.test(codeVal)) { toast(t('giftCardCodeInvalid') || 'Code must be 3–20 alphanumeric characters', 'error'); return false; }
      if (balance <= 0) { toast(t('giftCardBalanceRequired') || 'Initial balance must be greater than 0', 'error'); return false; }
      if (giftCards.find(g => g.code === codeVal)) { toast(t('giftCardCodeDuplicate') || 'Code already exists', 'error'); return false; }
      const clientId = modal.querySelector('#gcClient').value;
      const cl = clientId ? clients.find(c => c.id === clientId) : null;
      giftCards.push({
        id: uid('GC'),
        code: codeVal,
        initialBalance: balance,
        balance,
        issuedTo: clientId || null,
        issuedToName: cl ? localName(cl) : '',
        issuedAt: new Date().toISOString(),
        expiresAt: modal.querySelector('#gcExpiry').value || null,
        redeemedOrders: [],
      });
      saveAll();
      renderGiftCards();
      toast(t('giftCardIssued') || 'Gift card issued!', 'success');
    },
  });
}

function applyGiftCard(orderId, code) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return false;
  const gc = giftCards.find(g => g.code === code.trim().toUpperCase());
  if (!gc) { toast('Gift card not found', 'error'); return false; }
  if (+gc.balance <= 0) { toast('Gift card has no remaining balance', 'error'); return false; }
  const today = localDateStr();
  if (gc.expiresAt && gc.expiresAt < today) { toast('Gift card is expired', 'error'); return false; }
  const outstanding = Math.max(0, (+order.price || 0) - (+order.paidAmount || 0) - (+order.giftCardDiscount || 0));
  const deduct = Math.min(+gc.balance, outstanding);
  if (deduct <= 0) { toast('Order is already fully covered', 'info'); return false; }
  // Guard legacy/imported cards that predate the redeemedOrders field (avoids a
  // TypeError that would abort after the balance was already mutated in memory).
  if (!Array.isArray(gc.redeemedOrders)) gc.redeemedOrders = [];
  gc.balance = Math.max(0, +gc.balance - deduct);
  gc.redeemedOrders.push({ orderId, amount: deduct, at: new Date().toISOString() });
  order.giftCardCode = code;
  // Accumulate so applying a second card to the same order keeps the prior credit
  // (outstanding above is already computed net of any existing giftCardDiscount).
  order.giftCardDiscount = (+order.giftCardDiscount || 0) + deduct;
  saveAll();
  toast(`Gift card applied! ${fmtPrice(deduct)} deducted.`, 'success');
  return true;
}

/* ── Feature 6: Multi-Material AMS/MMU Cost ─────────────────── */
// Note: Multi-material support already exists via currentExtraMaterials / extraMaterials array
// and computePartBaseCost already handles part.extraMaterials.
// This feature exposes a UI "Add Material" button that appends to currentExtraMaterials.
// The existing renderExtraMaterials() function in app.js handles display.
// We add a convenience wrapper here for clarity.
function addAMSMaterialRow() {
  currentExtraMaterials.push({ material: '', weight: 0 });
  if (typeof renderExtraMaterials === 'function') renderExtraMaterials();
}

/* ── Feature 7: GAZT VAT Return Export ─────────────────────── */
function exportGaztVatReturn(period) {
  period = period || 'year';
  const now = new Date();
  let fromDate, toDate;
  if (period === 'year') {
    fromDate = `${now.getFullYear()}-01-01`;
    toDate   = `${now.getFullYear()}-12-31`;
  } else if (period === 'q1') { fromDate = `${now.getFullYear()}-01-01`; toDate = `${now.getFullYear()}-03-31`; }
  else if (period === 'q2') { fromDate = `${now.getFullYear()}-04-01`; toDate = `${now.getFullYear()}-06-30`; }
  else if (period === 'q3') { fromDate = `${now.getFullYear()}-07-01`; toDate = `${now.getFullYear()}-09-30`; }
  else if (period === 'q4') { fromDate = `${now.getFullYear()}-10-01`; toDate = `${now.getFullYear()}-12-31`; }
  else { fromDate = `${now.getFullYear()}-01-01`; toDate = `${now.getFullYear()}-12-31`; }

  const periodOrders = printLog.filter(o =>
    o.status === 'completed' && o.date >= fromDate && o.date <= toDate
  );
  const box1 = periodOrders.reduce((s, o) => s + orderRevenueBase(o), 0);
  const box2 = periodOrders.filter(o => +o.vatRate === 0).reduce((s, o) => s + orderRevenueBase(o), 0);
  const box3 = periodOrders.reduce((s, o) => s + (convertToBase(+o.vatAmount || 0, clientCurrency(o.clientId))), 0);
  const periodExp = (expenses || []).filter(e => e.date >= fromDate && e.date <= toDate);
  const box6 = periodExp.reduce((s, e) => s + (+e.amount || 0), 0);
  const box7 = periodExp.filter(e => e.vatAmount > 0).reduce((s, e) => s + (+e.vatAmount || 0), 0);
  const netVat = box3 - box7;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>GAZT VAT Return — ${escapeHtml(period)} ${now.getFullYear()}</title>
    <style>body{font-family:sans-serif;max-width:700px;margin:auto;padding:24px;}
      h1{font-size:18px;} table{width:100%;border-collapse:collapse;margin-top:16px;}
      th{background:#f3f4f6;text-align:left;padding:8px;border:1px solid #ddd;font-size:13px;}
      td{padding:8px;border:1px solid #ddd;font-size:13px;}
      .net{font-weight:700;background:#fef3c7;}</style></head>
    <body>
      <h1>GAZT VAT Return — ${escapeHtml(settings.bizEn || '')} (${escapeHtml(period.toUpperCase())} ${now.getFullYear()})</h1>
      <p style="font-size:12px;color:#666;">Period: ${escapeHtml(fromDate)} to ${escapeHtml(toDate)}</p>
      <table>
        <thead><tr><th>Box</th><th>Description</th><th>Amount (${escapeHtml(currencySymbol())})</th></tr></thead>
        <tbody>
          <tr><td>Box 1</td><td>Total Sales (Standard-rated)</td><td>${fmtMoney(box1)}</td></tr>
          <tr><td>Box 2</td><td>Zero-rated Sales</td><td>${fmtMoney(box2)}</td></tr>
          <tr><td>Box 3</td><td>VAT Collected on Sales</td><td>${fmtMoney(box3)}</td></tr>
          <tr><td>Box 6</td><td>Total Purchases</td><td>${fmtMoney(box6)}</td></tr>
          <tr><td>Box 7</td><td>Input VAT (Recoverable)</td><td>${fmtMoney(box7)}</td></tr>
          <tr class="net"><td colspan="2">Net VAT Payable (Box 3 − Box 7)</td><td>${fmtMoney(netVat)}</td></tr>
        </tbody>
      </table>
    </body></html>`;

  if (window.hubAPI?.exportPDF) {
    window.hubAPI.exportPDF({ html, filename: `vat-return-${period}-${now.getFullYear()}.pdf` })
      .then(() => toast('VAT return exported!', 'success'))
      .catch(() => _fallbackVatDownload(html, period, now.getFullYear()));
  } else {
    _fallbackVatDownload(html, period, now.getFullYear());
  }
}

function _fallbackVatDownload(html, period, year) {
  const blob = new Blob([html], { type: 'text/html' });
  downloadBlob(blob, `vat-return-${period}-${year}.html`);
  toast('VAT return downloaded as HTML', 'info');
}

/* ── Feature 8: Slicer Profile Library ─────────────────────── */
function renderSlicerProfiles() {
  const container = document.getElementById('slicerProfilesContainer');
  if (!container) return;

  const machFilter = (document.getElementById('slicerMachineFilter') || {}).value || '';
  const matFilter  = (document.getElementById('slicerMaterialFilter') || {}).value || '';

  let profiles = slicerProfiles || [];
  if (machFilter) profiles = profiles.filter(p => p.machineId === machFilter);
  if (matFilter)  profiles = profiles.filter(p => p.material === matFilter);

  if (profiles.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px;">No slicer profiles yet.</div>`;
    return;
  }

  const rows = profiles.map(p => {
    const mach = p.machineId ? machines.find(m => m.id === p.machineId) : null;
    return `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${mach ? escapeHtml(mach.name) : '—'}</td>
      <td>${escapeHtml(p.material || '—')}</td>
      <td>${p.layerHeight ? p.layerHeight + ' mm' : '—'}</td>
      <td>${p.infill ? p.infill + '%' : '—'}</td>
      <td>${p.supports ? 'Yes' : 'No'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.notes || '')}</td>
      <td>
        <button class="btn small ghost" onclick="openSlicerProfileModal('${escapeHtml(p.id)}')">Edit</button>
        <button class="btn danger small" onclick="deleteSlicerProfile('${escapeHtml(p.id)}')">×</button>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Machine</th><th>Material</th><th>Layer</th><th>Infill</th><th>Supports</th><th>Notes</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openSlicerProfileModal(profileId) {
  const existing = profileId ? (slicerProfiles || []).find(p => p.id === profileId) : null;
  const machOptions = machines.map(m => `<option value="${m.id}"${existing && existing.machineId === m.id ? ' selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
  const matOptions = [...new Set(inventory.map(i => i.material).filter(Boolean))].map(m =>
    `<option value="${escapeHtml(m)}"${existing && existing.material === m ? ' selected' : ''}>${escapeHtml(m)}</option>`
  ).join('');

  openFormModal({
    title: existing ? 'Edit Slicer Profile' : 'New Slicer Profile',
    sizeLg: false,
    saveLabel: existing ? 'Save' : 'Create',
    bodyHtml: `
      <label>Profile Name</label>
      <input type="text" id="spName" value="${escapeHtml(existing?.name || '')}">
      <label style="margin-top:10px;">Machine</label>
      <select id="spMachine"><option value="">— Any —</option>${machOptions}</select>
      <label style="margin-top:10px;">Material</label>
      <select id="spMaterial"><option value="">— Any —</option>${matOptions}</select>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
        <div><label>Layer Height (mm)</label><input type="number" id="spLayer" step="0.01" min="0.01" value="${existing?.layerHeight || 0.2}"></div>
        <div><label>Infill %</label><input type="number" id="spInfill" min="0" max="100" value="${existing?.infill || 20}"></div>
      </div>
      <label style="margin-top:10px;display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="spSupports" style="width:auto;" ${existing?.supports ? 'checked' : ''}> Supports
      </label>
      <label style="margin-top:10px;">Notes</label>
      <textarea id="spNotes" rows="2">${escapeHtml(existing?.notes || '')}</textarea>`,
    onSave(modal) {
      const name = modal.querySelector('#spName').value.trim();
      if (!name) { toast('Enter a profile name', 'error'); return false; }
      const profile = {
        id: existing ? existing.id : uid('SP'),
        name,
        machineId: modal.querySelector('#spMachine').value || null,
        material:  modal.querySelector('#spMaterial').value || '',
        layerHeight: num(modal.querySelector('#spLayer').value, 0.2),
        infill:    num(modal.querySelector('#spInfill').value, 20),
        supports:  modal.querySelector('#spSupports').checked,
        notes:     modal.querySelector('#spNotes').value.trim(),
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
      };
      if (!slicerProfiles) slicerProfiles = [];
      if (existing) {
        const idx = slicerProfiles.findIndex(p => p.id === profileId);
        if (idx !== -1) slicerProfiles[idx] = profile;
      } else {
        slicerProfiles.push(profile);
      }
      saveAll();
      renderSlicerProfiles();
      toast(existing ? 'Profile updated' : 'Profile created', 'success');
    },
  });
}

function deleteSlicerProfile(profileId) {
  slicerProfiles = (slicerProfiles || []).filter(p => p.id !== profileId);
  saveAll();
  renderSlicerProfiles();
  toast('Profile deleted', 'success');
}

/* ── Feature 9: Environmental Condition Logging ─────────────── */
function renderEnvLogs() {
  const container = document.getElementById('envLogsContainer');
  if (!container) return;

  const recent = (envLogs || []).slice().sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).slice(0, 50);

  if (recent.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:20px;">No environmental logs yet.</div>`;
    return;
  }

  const rows = recent.map(log => {
    const mach = log.machineId ? machines.find(m => m.id === log.machineId) : null;
    return `<tr>
      <td style="font-size:11px;">${escapeHtml(new Date(log.timestamp).toLocaleString())}</td>
      <td>${log.temperature != null ? log.temperature + ' °C' : '—'}</td>
      <td>${log.humidity    != null ? log.humidity    + '%'  : '—'}</td>
      <td>${mach ? escapeHtml(mach.name) : '—'}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(log.notes || '')}</td>
    </tr>`;
  }).join('');

  // Simple SVG sparkline for temperature — last 20 entries in chronological order
  const sparkData = (envLogs || [])
    .filter(l => l.temperature != null)
    .slice().sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
    .slice(-20);

  let sparkHtml = '';
  if (sparkData.length >= 2) {
    const temps = sparkData.map(l => +l.temperature);
    const minT = Math.min(...temps), maxT = Math.max(...temps);
    const range = maxT - minT || 1;
    const W = 240, H = 48;
    const pts = temps.map((t, i) => {
      const x = (i / (temps.length - 1)) * W;
      const y = H - ((t - minT) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    sparkHtml = `<div style="margin-bottom:12px;">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Temperature trend (last ${temps.length} readings)</div>
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="overflow:visible;">
        <polyline fill="none" stroke="var(--primary)" stroke-width="2" points="${escapeHtml(pts)}"/>
      </svg>
    </div>`;
  }

  container.innerHTML = `
    ${sparkHtml}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Machine</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function openLogEnvModal() {
  const machOptions = machines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  openFormModal({
    title: 'Log Environmental Conditions',
    sizeLg: false,
    saveLabel: 'Log',
    bodyHtml: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><label>Temperature (°C)</label><input type="number" id="envTemp" step="0.1" placeholder="e.g. 22"></div>
        <div><label>Humidity (%)</label><input type="number" id="envHumidity" min="0" max="100" step="1" placeholder="e.g. 45"></div>
      </div>
      <label style="margin-top:10px;">Machine (optional)</label>
      <select id="envMachine"><option value="">— All / None —</option>${machOptions}</select>
      <label style="margin-top:10px;">Notes (optional)</label>
      <textarea id="envNotes" rows="2"></textarea>`,
    onSave(modal) {
      const temp     = modal.querySelector('#envTemp').value;
      const humidity = modal.querySelector('#envHumidity').value;
      if (temp === '' && humidity === '') { toast('Enter at least temperature or humidity', 'error'); return false; }
      if (temp !== '') {
        const t = num(temp, null);
        if (t === null || t < -50 || t > 100) { toast('Temperature must be between -50°C and 100°C', 'error'); return false; }
      }
      if (humidity !== '') {
        const h = num(humidity, null);
        if (h === null || h < 0 || h > 100) { toast('Humidity must be between 0% and 100%', 'error'); return false; }
      }
      if (!envLogs) envLogs = [];
      envLogs.push({
        id: uid('ENV'),
        timestamp:   new Date().toISOString(),
        temperature: temp !== '' ? num(temp, null) : null,
        humidity:    humidity !== '' ? num(humidity, null) : null,
        machineId:   modal.querySelector('#envMachine').value || null,
        notes:       modal.querySelector('#envNotes').value.trim(),
      });
      saveAll();
      renderEnvLogs();
      toast('Environment logged', 'success');
    },
  });
}

/* ── Feature 10: Telegram Notification Settings ─────────────── */

function sendTelegramForOrder(order, newStatus) {
  const tg = settings.telegram;
  if (!tg || !tg.botToken || !tg.chatId) return;
  let shouldSend = false;
  let message = '';
  // tgSafe: strip control chars and truncate to prevent message manipulation
  const tgSafe = s => String(s ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 200);
  if (newStatus === 'completed' && tg.notifyOnComplete) {
    shouldSend = true;
    message = `✅ Order completed: ${tgSafe(order.project || order.id)} (${fmtPrice(order.price)})`;
  } else if (newStatus === 'on_hold' && tg.notifyOnHold) {
    shouldSend = true;
    message = `⏸ Order on hold: ${tgSafe(order.project || order.id)}${order.holdReason ? ' — ' + tgSafe(order.holdReason) : ''}`;
  }
  if (!shouldSend) return;
  window.hubAPI?.sendTelegram?.({ botToken: tg.botToken, chatId: tg.chatId, message })
    .catch(e => console.warn('Telegram notify failed:', e));
}

function checkTelegramLowStock() {
  const tg = settings.telegram;
  if (!tg || !tg.botToken || !tg.chatId || !tg.notifyOnLowStock) return;
  const threshold = settings.lowStockThreshold || 200;
  const lowItems = inventory.filter(i => (+i.weight || 0) < threshold);
  if (lowItems.length === 0) return;
  const tgSafe = s => String(s ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 100);
  const names = lowItems.slice(0, 5).map(i => tgSafe(i.material)).join(', ');
  const message = `⚠️ Low stock alert: ${names}${lowItems.length > 5 ? ` and ${lowItems.length - 5} more` : ''}`;
  window.hubAPI?.sendTelegram?.({ botToken: tg.botToken, chatId: tg.chatId, message })
    .catch(e => console.warn('Telegram low-stock notify failed:', e));
}

/* ── Feature 11: iCal Export ────────────────────────────────── */
async function exportIcalFeed() {
  const lanUrl = await window.hubAPI?.getLanUrl?.().catch(() => null);
  if (!lanUrl?.ok) { toast('Start LAN server first to use iCal', 'error'); return; }
  const icalUrl = lanUrl.url + '/calendar.ics';
  window.hubAPI?.openExternal?.(icalUrl);
}

/* ── Feature 12: Referral Attribution ──────────────────────── */
function renderReferralAnalytics() {
  const el = document.getElementById('acquisitionSourcesContainer');
  if (!el) return;

  const sources = ['instagram','referral','walk_in','website','exhibition','salla','zid','intake_form','other'];
  const counts = {};
  sources.forEach(s => { counts[s] = 0; });
  for (const o of printLog) {
    const s = o.source || 'other';
    counts[s] = (counts[s] || 0) + 1;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const colors = {
    instagram:'#e1306c', referral:'#22c55e', walk_in:'#3b82f6',
    website:'#f59e0b',   exhibition:'#a855f7', salla:'#10b981',
    zid:'#6366f1',       intake_form:'#f97316', other:'#6b7280',
  };

  const bars = sources.filter(s => counts[s] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .map(s => {
      const pct = Math.round((counts[s] / total) * 100);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="min-width:100px;font-size:12px;text-align:end;">${escapeHtml(s.replace(/_/g,' '))}</span>
        <div style="flex:1;background:var(--border);border-radius:3px;height:12px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${colors[s] || '#888'};border-radius:3px;"></div>
        </div>
        <span style="min-width:40px;font-size:11px;color:var(--text-muted);">${counts[s]} (${pct}%)</span>
      </div>`;
    }).join('');

  // Top referrers (clients whose referralCode appears on orders as referredBy)
  const referralMap = {};
  for (const o of printLog) {
    if (o.referredBy) referralMap[o.referredBy] = (referralMap[o.referredBy] || 0) + 1;
  }
  const topReferrers = Object.entries(referralMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([cid, cnt]) => {
      const cl = clients.find(c => c.id === cid);
      return `<tr><td>${cl ? escapeHtml(localName(cl)) : escapeHtml(cid)}</td><td>${cnt}</td></tr>`;
    }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;padding:14px;">
      <h4 style="margin-bottom:10px;">Acquisition Sources</h4>
      ${bars || '<span style="color:var(--text-muted);font-size:12px;">No data</span>'}
    </div>
    ${topReferrers ? `<div class="card" style="padding:14px;">
      <h4 style="margin-bottom:10px;">Top Referrers</h4>
      <table><thead><tr><th>Client</th><th>Referrals</th></tr></thead><tbody>${topReferrers}</tbody></table>
    </div>` : ''}`;
}

/* ── Feature 13: Change Order Workflow ──────────────────────── */

/* ── Feature 14: Print Failure Photo Capture ────────────────── */

/* ── Feature 15: Shipping Carrier Integration ───────────────── */
function trackShipment(trackingNumber, carrier) {
  if (!trackingNumber) { toast('No tracking number', 'error'); return; }
  let url = '';
  const tn = encodeURIComponent(trackingNumber.trim());
  const c  = (carrier || '').toLowerCase();
  if (c === 'aramex') {
    url = `https://www.aramex.com/track/results?ShipmentNumber=${tn}`;
  } else if (c === 'saudipost' || c === 'saudi_post' || c === 'saudi post') {
    url = `https://www.saudipost.com.sa/en/tools/track?num=${tn}`;
  } else if (c === 'dhl') {
    url = `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`;
  } else if (c === 'fedex') {
    url = `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
  } else {
    toast('Copy tracking number and check carrier website: ' + escapeHtml(trackingNumber), 'info', 6000);
    return;
  }
  window.hubAPI?.openExternal?.(url) || window.open(url, '_blank');
}

// Note: getCarrierTrackingUrl() is already defined earlier in this file.
