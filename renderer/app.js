/* ============================================================
   Khayt — main app logic
   Renderer state, persisted to localStorage. Full product images
   stored on disk via hubAPI (preload). Thumbnails live inline.
   ============================================================ */

/* Collections and persistence — renderer/app-state.js; UI shell — renderer/shell.js */


let clientSearchTerm = '';
let portfolioSearchTerm = '';

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
let logOperatorFilter = '';
let logDisplayLimit = 100;      // pagination: rows shown in log table
let _lastLogFilterHash = '';    // detects filter/sort changes to reset page
let wasteSearchTerm = '';
let wasteMaterialFilter = '';
let wasteFailureFilter = '';
let wasteDateFilter = 'all';


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
function calcNextDueDate(fromDate, recurring) {
  if (!fromDate || !recurring) return null;
  const d = new Date(fromDate + 'T00:00:00');
  if (recurring === 'monthly')    d.setMonth(d.getMonth() + 1);
  else if (recurring === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (recurring === 'annually')  d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d.toISOString().split('T')[0];
}

function checkRecurringExpenses() {
  const todayStr = new Date().toISOString().split('T')[0];
  const due = expenses.filter(e => e.recurring && e.nextDue && e.nextDue <= todayStr);
  if (due.length === 0) return;
  for (const exp of due) {
    const label = `${expCatLabel(exp.category)} ${fmtPrice(exp.amount)}`;
    const c = document.createElement('div');
    c.className = 'toast info';
    c.style.cssText = 'max-width:360px;';
    c.innerHTML = `<span>${escapeHtml(t('exp.recurring_due'))}: ${escapeHtml(label)}</span>`;
    const addBtn = document.createElement('button');
    addBtn.className = 'undo-btn';
    addBtn.textContent = t('common.add') || 'Add';
    const skipBtn = document.createElement('button');
    skipBtn.className = 'undo-btn';
    skipBtn.style.marginInlineStart = '4px';
    skipBtn.textContent = 'Skip';
    addBtn.addEventListener('click', () => {
      expenses.unshift({
        id: uid('EXP'),
        date: todayStr,
        category: exp.category,
        amount: exp.amount,
        note: exp.note || '',
        recurring: null, // the new copy is not recurring
        orderId: null,
      });
      exp.nextDue = calcNextDueDate(todayStr, exp.recurring);
      saveAll();
      renderExpenses();
      toast(t('exp.recurring_added'), 'success');
      c.remove();
    });
    skipBtn.addEventListener('click', () => {
      exp.nextDue = calcNextDueDate(todayStr, exp.recurring);
      saveAll();
      c.remove();
    });
    c.appendChild(addBtn);
    c.appendChild(skipBtn);
    $('#toastContainer').appendChild(c);
    setTimeout(() => { c.style.opacity = '0'; c.style.transition = 'opacity .2s'; }, 8000 - 250);
    setTimeout(() => c.remove(), 8000);
  }
}

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
   Machine profiles (physical printers you assign jobs to)
   ============================================================ */
const MACHINE_COLORS = ['#5b9cf0','#2bb673','#f5a623','#ef4d5e','#a78bfa','#fb923c','#34d399','#f472b6'];

/* Feature 4: Grams printed on a machine since last nozzle install */
function machineGramsSinceNozzle(machine) {
  const sinceDate = machine.nozzle?.installedAt || '';
  return printLog
    .filter(o => o.machineId === machine.id && o.status === 'completed' && (o.date || '') >= sinceDate)
    .reduce((s, o) => s + (o.parts || []).reduce((ps, p) => ps + (+p.weight || 0), 0), 0);
}

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
    const now2Str = new Date().toISOString();
    const hasDowntime = (m.downtimeBlocks || []).some(b => b.to && b.to > now2Str);
    const downtimeBadge = hasDowntime
      ? `<span class="machine-jobs-badge" style="background:var(--warning); color:#000;">🔧 ${escapeHtml(t('mach.downtime_badge'))}</span>`
      : '';
    // Feature 4: Nozzle info
    const nozzleGrams = machineGramsSinceNozzle(m);
    const nozzleThreshold = m.nozzle?.gramsThreshold || 2000;
    const nozzlePct = Math.min(100, nozzleThreshold > 0 ? (nozzleGrams / nozzleThreshold) * 100 : 0);
    const nozzleOver = nozzleGrams >= nozzleThreshold && nozzleThreshold > 0;
    const nozzleHtml = m.nozzle?.installedAt ? `
      <div style="margin-top:4px; font-size:11px; color:var(--text-muted);">
        🔩 ${escapeHtml(m.nozzle.material || 'brass')} nozzle${m.nozzleDiameter ? ` · ${m.nozzleDiameter}mm` : ''}${m.extruderType ? ` · ${escapeHtml(m.extruderType)}` : ''}
        · ${nozzleGrams.toFixed(0)}g/${nozzleThreshold}g
        ${nozzleOver ? `<span class="machine-jobs-badge" style="background:var(--danger);color:#fff;">🔩 ${escapeHtml(t('mach.nozzle_replace'))}</span>` : ''}
      </div>
      <div class="nozzle-progress" style="max-width:200px;margin-top:3px;">
        <div class="nozzle-progress-bar" style="width:${nozzlePct.toFixed(1)}%;background:${nozzleOver ? 'var(--danger)' : 'var(--primary)'};"></div>
      </div>` : '';
    // Feature 3: compat materials
    const compatHtml = (m.compatMaterials && m.compatMaterials.length > 0)
      ? `<span style="font-size:10.5px;color:var(--text-muted);margin-inline-start:6px;">[${escapeHtml(m.compatMaterials.join(', '))}]</span>`
      : '';
    return `
      <div class="machine-row" style="flex-wrap:wrap;">
        <span class="machine-dot" style="background:${safeCssColor(m.color)};"></span>
        <span class="machine-name">${escapeHtml(m.name)}</span>
        ${compatHtml}
        ${m.isOffline ? `<span class="machine-jobs-badge" style="background:var(--danger); color:#fff;">⚠ ${escapeHtml(t('mach.offline_badge'))}</span>` : ''}
        ${active > 0 ? `<span class="machine-jobs-badge">${active} ${escapeHtml(t('mach.active_jobs'))}</span>` : ''}
        ${svcBadge}
        ${downtimeBadge}
        ${hrsLine}
        <button class="btn small" data-act="maint-log" data-id="${m.id}" title="${escapeHtml(t('maint.btn'))}">🔧</button>
        <button class="btn small ghost" data-act="log-nozzle-change" data-id="${m.id}" title="${escapeHtml(t('mach.log_nozzle'))}" style="font-size:11px;">🔩</button>
        <button class="btn small" data-act="edit-mach" data-id="${m.id}">${escapeHtml(t('common.edit'))}</button>
        <button class="btn danger small" data-act="del-mach" data-id="${m.id}">${escapeHtml(t('common.delete'))}</button>
        ${nozzleHtml}
      </div>`;
  }).join('');
  updateNotifBadge();
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
      <label style="margin-top:14px;">${escapeHtml(t('mach.location'))}</label>
      <select id="machLocationId" style="margin-top:6px;">
        <option value="">— ${escapeHtml(t('an.unassigned_location'))} —</option>
        ${locations.map(l => `<option value="${escapeHtml(l.id)}"${draft.locationId === l.id ? ' selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
      </select>

      <label style="margin-top:16px; display:flex; align-items:center; gap:8px; cursor:pointer;">
        <input type="checkbox" id="machOffline" style="width:auto; margin:0;" ${draft.isOffline ? 'checked' : ''}>
        <span data-i18n="mach.mark_offline">${escapeHtml(t('mach.mark_offline'))}</span>
      </label>

      <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);">
        <label style="font-size:12.5px; font-weight:600; margin-bottom:8px;">${escapeHtml(t('mach.compat_materials'))}</label>
        <div id="machCompatMaterialsSection" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;"></div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;">
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.nozzle_diameter'))}</label>
            <input type="number" id="machNozzleDiameter" value="${draft.nozzleDiameter || ''}" step="0.1" min="0.1" placeholder="0.4" style="font-size:12.5px;">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.extruder_type'))}</label>
            <input type="text" id="machExtruderType" value="${escapeHtml(draft.extruderType || '')}" placeholder="Bowden / Direct Drive" style="font-size:12.5px;">
          </div>
        </div>
      </div>

      <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border-soft);">
        <label style="font-size:12.5px; font-weight:600; margin:0 0 8px;">${escapeHtml(t('mach.nozzle'))}</label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px;">
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.nozzle_material'))}</label>
            <select id="machNozzleMaterial" style="font-size:12.5px;">
              <option value="brass"${(draft.nozzle?.material||'brass') === 'brass' ? ' selected' : ''}>${escapeHtml(t('mach.nozzle_brass'))}</option>
              <option value="hardened"${draft.nozzle?.material === 'hardened' ? ' selected' : ''}>${escapeHtml(t('mach.nozzle_hardened'))}</option>
              <option value="ruby"${draft.nozzle?.material === 'ruby' ? ' selected' : ''}>${escapeHtml(t('mach.nozzle_ruby'))}</option>
              <option value="stainless"${draft.nozzle?.material === 'stainless' ? ' selected' : ''}>Stainless</option>
              <option value="other"${draft.nozzle?.material === 'other' ? ' selected' : ''}>Other</option>
            </select>
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.nozzle_installed'))}</label>
            <input type="date" id="machNozzleInstalledAt" value="${escapeHtml(draft.nozzle?.installedAt || '')}" style="font-size:12.5px;">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('mach.nozzle_threshold'))}</label>
            <input type="number" id="machNozzleGramsThreshold" value="${draft.nozzle?.gramsThreshold || 2000}" min="0" step="100" style="font-size:12.5px;">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml('Lifetime grams at install')}</label>
            <input type="number" id="machNozzleGramsAtInstall" value="${draft.nozzle?.gramsAtInstall || 0}" min="0" step="1" style="font-size:12.5px;">
          </div>
        </div>
      </div>

      <div style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <label style="margin:0; flex:1; font-size:12.5px; font-weight:600;">${escapeHtml(t('mach.downtime'))}</label>
          <button class="btn ghost small" id="btnAddDowntime" type="button">${escapeHtml(t('mach.downtime_add'))}</button>
        </div>
        <div id="downtimeBlocksList"></div>
      </div>

      <details style="margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft);" class="pro-only">
        <summary style="cursor:pointer; font-size:12.5px; font-weight:600; color:var(--text-dim); user-select:none; padding:2px 0;">${escapeHtml(t('mach.api_live'))}</summary>
        <div style="margin-top:10px;">
          <label style="margin-top:0;">${escapeHtml(t('mach.api_type'))}</label>
          <select id="machApiType" style="font-size:12.5px;">
            <option value="none">${escapeHtml(t('common.none'))}</option>
            <option value="octoprint">OctoPrint</option>
            <option value="moonraker">Moonraker / Klipper</option>
            <option value="bambu">Bambu Lab (local network)</option>
            <option value="prusalink">PrusaLink (Prusa MK4 / XL / Mini+)</option>
            <option value="duet">Duet / RepRapFirmware</option>
            <option value="repetier">Repetier-Server</option>
          </select>
          <div id="machApiFields" style="display:none; margin-top:8px;">
            <div class="inline-pair">
              <div>
                <label style="margin-top:0;">${escapeHtml(t('mach.api_host'))}</label>
                <input id="machApiHost" placeholder="192.168.1.50" style="font-size:12.5px;" value="${escapeHtml(draft.printerApi?.host || '')}">
              </div>
              <div>
                <label style="margin-top:0;">${escapeHtml(t('mach.api_port'))}</label>
                <input id="machApiPort" type="number" placeholder="default" style="font-size:12.5px;" value="${draft.printerApi?.port || ''}">
              </div>
            </div>
            <label style="margin-top:8px;">${escapeHtml(t('mach.api_key'))}</label>
            <input id="machApiKey" type="password" placeholder="API key / token" style="font-size:12.5px;" value="${escapeHtml(secretInputValue(draft.printerApi?.apiKey))}" autocomplete="off">
            <label style="margin-top:8px;">Access code (Bambu)</label>
            <input id="machApiAccessCode" type="password" placeholder="Bambu access code" style="font-size:12.5px;" value="${escapeHtml(secretInputValue(draft.printerApi?.accessCode))}" autocomplete="off">
            <label style="margin-top:8px;">Printer slug (Repetier)</label>
            <input id="machApiSlug" placeholder="default" style="font-size:12.5px;" value="${escapeHtml(draft.printerApi?.printerSlug || '')}">
            <div style="display:flex; align-items:center; gap:8px; margin-top:10px;">
              <button type="button" id="btnTestApi" class="btn small">${escapeHtml(t('mach.api_test'))}</button>
              <span id="apiTestResult" style="font-size:12px;"></span>
            </div>
          </div>
        </div>
      </details>`,
    onMount(modal) {
      if (!draft.downtimeBlocks) draft.downtimeBlocks = [];
      if (!draft.compatMaterials) draft.compatMaterials = [];
      if (!draft.nozzle) draft.nozzle = { material: 'brass', installedAt: '', gramsThreshold: 2000, gramsAtInstall: 0 };
      if (!draft.printerApi) draft.printerApi = { type: 'none', host: '', port: '', apiKey: '', accessCode: '', printerSlug: '' };
      modal.querySelector('#machName').addEventListener('input', e => { draft.name = e.target.value; });

      // Feature 2 (new batch): Printer API section wiring
      const apiTypeSel = modal.querySelector('#machApiType');
      const apiFields  = modal.querySelector('#machApiFields');
      if (apiTypeSel) {
        apiTypeSel.value = draft.printerApi.type || 'none';
        const toggleApiFields = () => {
          if (apiFields) apiFields.style.display = apiTypeSel.value !== 'none' ? 'block' : 'none';
        };
        toggleApiFields();
        apiTypeSel.addEventListener('change', () => {
          draft.printerApi.type = apiTypeSel.value;
          toggleApiFields();
        });
      }
      modal.querySelector('#machApiHost')?.addEventListener('input', e => { draft.printerApi.host = e.target.value; });
      modal.querySelector('#machApiPort')?.addEventListener('input', e => { draft.printerApi.port = e.target.value ? parseInt(e.target.value) : null; });
      modal.querySelector('#machApiKey')?.addEventListener('input', e => { draft.printerApi.apiKey = e.target.value; });
      modal.querySelector('#machApiAccessCode')?.addEventListener('input', e => { draft.printerApi.accessCode = e.target.value; });
      modal.querySelector('#machApiSlug')?.addEventListener('input', e => { draft.printerApi.printerSlug = e.target.value; });
      modal.querySelector('#btnTestApi')?.addEventListener('click', async () => {
        const resultEl = modal.querySelector('#apiTestResult');
        if (resultEl) resultEl.textContent = '…testing';
        try {
          if (window.hubAPI?.startPrinterPolling) {
            const testMachine = { id: draft.id, printerApi: { ...draft.printerApi } };
            await window.hubAPI.startPrinterPolling([testMachine]);
            const cache = await window.hubAPI.getPrinterStatus();
            if (resultEl) {
              const s = cache[draft.id];
              if (s?.error) {
                resultEl.textContent = t('mach.api_fail') + ': ' + s.error;
                resultEl.style.color = 'var(--danger)';
              } else if (s) {
                resultEl.textContent = t('mach.api_ok') + ' — ' + (s.state || '');
                resultEl.style.color = 'var(--success)';
              }
            }
          }
        } catch(e) {
          if (resultEl) { resultEl.textContent = t('mach.api_fail'); resultEl.style.color = 'var(--danger)'; }
        }
      });

      // Compat materials checkboxes (Feature 3)
      const compatEl = modal.querySelector('#machCompatMaterialsSection');
      if (compatEl) {
        const COMMON_MATS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA/Nylon', 'PC', 'PVA', 'HIPS', 'Resin'];
        const allMats = [...new Set([...COMMON_MATS, ...inventory.map(i => i.material).filter(Boolean)])];
        compatEl.innerHTML = allMats.map(mat => {
          const checked = draft.compatMaterials.includes(mat);
          return `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;background:var(--surface-2);padding:3px 8px;border-radius:4px;border:1px solid ${checked ? 'var(--primary)' : 'var(--border)'};">
            <input type="checkbox" class="compat-mat-cb" data-mat="${escapeHtml(mat)}" style="width:auto;margin:0;" ${checked ? 'checked' : ''}>
            ${escapeHtml(mat)}
          </label>`;
        }).join('');
        compatEl.querySelectorAll('.compat-mat-cb').forEach(cb => {
          cb.addEventListener('change', () => {
            const m = cb.dataset.mat;
            if (cb.checked) { if (!draft.compatMaterials.includes(m)) draft.compatMaterials.push(m); }
            else { draft.compatMaterials = draft.compatMaterials.filter(x => x !== m); }
            cb.closest('label').style.borderColor = cb.checked ? 'var(--primary)' : 'var(--border)';
          });
        });
      }
      // Nozzle field listeners (Feature 4)
      modal.querySelector('#machNozzleDiameter')?.addEventListener('input', e => { draft.nozzleDiameter = parseFloat(e.target.value) || null; });
      modal.querySelector('#machExtruderType')?.addEventListener('input', e => { draft.extruderType = e.target.value; });
      modal.querySelector('#machNozzleMaterial')?.addEventListener('change', e => { draft.nozzle.material = e.target.value; });
      modal.querySelector('#machNozzleInstalledAt')?.addEventListener('change', e => { draft.nozzle.installedAt = e.target.value; });
      modal.querySelector('#machNozzleGramsThreshold')?.addEventListener('input', e => { draft.nozzle.gramsThreshold = parseFloat(e.target.value) || 2000; });
      modal.querySelector('#machNozzleGramsAtInstall')?.addEventListener('input', e => { draft.nozzle.gramsAtInstall = parseFloat(e.target.value) || 0; });
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

      // Downtime blocks
      function renderDowntimeList() {
        const el = modal.querySelector('#downtimeBlocksList');
        if (!el) return;
        if (!draft.downtimeBlocks || draft.downtimeBlocks.length === 0) {
          el.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;padding:4px 0;">${escapeHtml(t('mach.empty') || 'No downtime blocks.')}</div>`;
          return;
        }
        el.innerHTML = draft.downtimeBlocks.map((b, i) => `
          <div style="display:grid; grid-template-columns:1fr 1fr auto auto; gap:6px; align-items:center; margin-bottom:6px; font-size:12px;">
            <input type="datetime-local" class="dt-from" data-dti="${i}" value="${escapeHtml(b.from || '')}" style="font-size:11.5px;">
            <input type="datetime-local" class="dt-to" data-dti="${i}" value="${escapeHtml(b.to || '')}" style="font-size:11.5px;">
            <input type="text" class="dt-reason" data-dti="${i}" value="${escapeHtml(b.reason || '')}" placeholder="${escapeHtml(t('mach.downtime_reason'))}" style="font-size:11.5px; min-width:80px;">
            <button class="btn danger small dt-rm" data-dti="${i}">×</button>
          </div>`).join('');
        el.querySelectorAll('.dt-from').forEach(inp => { inp.addEventListener('change', () => { draft.downtimeBlocks[+inp.dataset.dti].from = inp.value; }); });
        el.querySelectorAll('.dt-to').forEach(inp => { inp.addEventListener('change', () => { draft.downtimeBlocks[+inp.dataset.dti].to = inp.value; }); });
        el.querySelectorAll('.dt-reason').forEach(inp => { inp.addEventListener('input', () => { draft.downtimeBlocks[+inp.dataset.dti].reason = inp.value; }); });
        el.querySelectorAll('.dt-rm').forEach(btn => {
          btn.addEventListener('click', () => { draft.downtimeBlocks.splice(+btn.dataset.dti, 1); renderDowntimeList(); });
        });
      }
      renderDowntimeList();
      modal.querySelector('#btnAddDowntime').addEventListener('click', () => {
        if (!draft.downtimeBlocks) draft.downtimeBlocks = [];
        draft.downtimeBlocks.push({ id: uid('DT'), from: '', to: '', reason: '' });
        renderDowntimeList();
      });
    },
    async onSave() {
      if (!draft.name.trim()) { toast(t('mach.need_name'), 'error'); return false; }
      draft.downtimeBlocks = (draft.downtimeBlocks || []).filter(b => b.from && b.to);
      // Feature 2 (new batch): Persist printer API config from modal
      const apiTypeFinal = document.getElementById('machApiType');
      if (apiTypeFinal) {
        draft.printerApi = {
          type:         apiTypeFinal.value || 'none',
          host:         document.getElementById('machApiHost')?.value.trim() || '',
          port:         document.getElementById('machApiPort')?.value ? parseInt(document.getElementById('machApiPort').value) : null,
          apiKey:       secretInputSave(draft.printerApi?.apiKey, document.getElementById('machApiKey')?.value),
          accessCode:   document.getElementById('machApiAccessCode')?.value.trim() || '',
          printerSlug:  document.getElementById('machApiSlug')?.value.trim() || '',
        };
      }
      // Persist nozzle/compat fields from form (Feature 3 & 4)
      const nozzleDiamEl = document.getElementById('machNozzleDiameter');
      if (nozzleDiamEl) draft.nozzleDiameter = parseFloat(nozzleDiamEl.value) || null;
      const extruderTypeEl = document.getElementById('machExtruderType');
      if (extruderTypeEl) draft.extruderType = extruderTypeEl.value.trim() || null;
      const nozzleMatEl = document.getElementById('machNozzleMaterial');
      const nozzleInstEl = document.getElementById('machNozzleInstalledAt');
      const nozzleThreshEl = document.getElementById('machNozzleGramsThreshold');
      const nozzleAtInstEl = document.getElementById('machNozzleGramsAtInstall');
      if (nozzleMatEl) {
        draft.nozzle = {
          material: nozzleMatEl.value || 'brass',
          installedAt: nozzleInstEl?.value || '',
          gramsThreshold: parseFloat(nozzleThreshEl?.value) || 2000,
          gramsAtInstall: parseFloat(nozzleAtInstEl?.value) || 0,
        };
      }
      // Persist locationId
      const machLocEl = document.getElementById('machLocationId');
      if (machLocEl) draft.locationId = machLocEl.value || '';
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

function logNozzleChange(machineId) {
  const machine = machines.find(m => m.id === machineId);
  if (!machine) return;
  const totalGrams = machineGramsSinceNozzle(machine);
  openFormModal({
    title: `${machine.name} — ${t('mach.log_nozzle')}`,
    sizeLg: false,
    saveLabel: t('common.save'),
    bodyHtml: `
      <label>${escapeHtml(t('mach.nozzle_material'))}</label>
      <select id="nlNozzleMat" style="margin-bottom:10px;">
        <option value="brass">${escapeHtml(t('mach.nozzle_brass'))}</option>
        <option value="hardened">${escapeHtml(t('mach.nozzle_hardened'))}</option>
        <option value="ruby">${escapeHtml(t('mach.nozzle_ruby'))}</option>
        <option value="stainless">Stainless</option>
        <option value="other">Other</option>
      </select>
      <label>${escapeHtml(t('mach.nozzle_installed'))}</label>
      <input type="date" id="nlInstalledAt" value="${new Date().toISOString().split('T')[0]}">
      <label style="margin-top:10px;">${escapeHtml(t('mach.nozzle_threshold'))}</label>
      <input type="number" id="nlThreshold" value="${machine.nozzle?.gramsThreshold || 2000}" min="0" step="100">
      <p style="font-size:12px;color:var(--text-muted);margin-top:8px;">
        Lifetime grams at install: <strong>${totalGrams.toFixed(0)}g</strong>
      </p>`,
    async onSave(modal) {
      const mat       = modal.querySelector('#nlNozzleMat').value;
      const installed = modal.querySelector('#nlInstalledAt').value;
      const threshold = parseFloat(modal.querySelector('#nlThreshold').value) || 2000;
      const idx = machines.findIndex(m => m.id === machineId);
      if (idx < 0) return false;
      machines[idx].nozzle = {
        material: mat,
        installedAt: installed,
        gramsThreshold: threshold,
        gramsAtInstall: totalGrams,
      };
      saveAll();
      renderMachines();
      toast(t('mach.nozzle_done'), 'success');
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
            <input type="date" id="maintDate" value="${new Date().toISOString().split('T')[0]}" max="${new Date().toISOString().split('T')[0]}">
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
      saveAll();
      renderWaTemplates();
      toast(t('wa.tpl_saved'), 'success');
      return true;
    }
  });
}

async function deleteWaTemplate(tplId) {
  const ok = await confirmModal(t('common.delete') + '?', { danger: true });
  if (!ok) return;
  waTemplates = waTemplates.filter(x => x.id !== tplId);
  saveAll();
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
   Clients
   ============================================================ */
function getClientStats(clientId) {
  const orders = printLog.filter(o => o.clientId === clientId);
  const completed = orders.filter(o => o.status === 'completed');
  const sorted = [...orders].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return {
    count: orders.length,
    completedCount: completed.length,
    revenue: completed.reduce((s, o) => s + orderRevenueBase(o), 0),
    lastDate: sorted[0]?.date || null
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
    const grid0 = $('#clientsCardsGrid');
    const wrap0 = $('#clientsTableWrap');
    if (grid0 && document.body.classList.contains('khayt-studio')) {
      grid0.innerHTML = `<p class="dash-empty" style="padding:18px">${escapeHtml(t('cl.empty'))}</p>`;
      grid0.style.display = 'grid';
      grid0.removeAttribute('aria-hidden');
      if (wrap0) wrap0.classList.add('khayt-clients-legacy-hidden');
    }
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(t('cl.empty'))}</td></tr>`;
    return;
  }
  if (filtered.length === 0) {
    const gridE = $('#clientsCardsGrid');
    if (gridE && document.body.classList.contains('khayt-studio')) {
      gridE.innerHTML = `<p class="dash-empty" style="padding:18px">${escapeHtml(t('cl.empty_search'))}</p>`;
      gridE.style.display = 'grid';
      if ($('#clientsTableWrap')) $('#clientsTableWrap').classList.add('khayt-clients-legacy-hidden');
    }
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(t('cl.empty_search'))}</td></tr>`;
    return;
  }
  // Precompute all per-client aggregates in a single O(n) pass to avoid O(n²) scans
  const clientStatsMap = new Map();
  const clientSurveyMap = new Map();  // clientId -> { sum, count }
  const clientBalanceMap = new Map(); // clientId -> outstanding balance
  for (const o of printLog) {
    if (!o.clientId) continue;
    // Stats (count, revenue, lastDate)
    let s = clientStatsMap.get(o.clientId);
    if (!s) { s = { count: 0, completedCount: 0, revenue: 0, lastDate: null }; clientStatsMap.set(o.clientId, s); }
    s.count++;
    if (o.status === 'completed') { s.completedCount++; s.revenue += orderRevenueBase(o); }
    if (!s.lastDate || o.date > s.lastDate) s.lastDate = o.date;
    // Survey ratings
    if (o.survey?.rating) {
      let sv = clientSurveyMap.get(o.clientId);
      if (!sv) { sv = { sum: 0, count: 0 }; clientSurveyMap.set(o.clientId, sv); }
      sv.sum += o.survey.rating; sv.count++;
    }
    // Outstanding balance (unpaid non-quote orders)
    if (o.status !== 'quote' && payStatus(o) !== 'paid') {
      const outstanding = orderOwedBase(o);
      if (outstanding > 0) clientBalanceMap.set(o.clientId, (clientBalanceMap.get(o.clientId) || 0) + outstanding);
    }
  }
  // Precompute loyalty tiers in one pass (getClientTier itself iterates printLog)
  const clientTierMap = new Map();
  if (settings.loyaltyEnabled) {
    const tiers = (settings.loyaltyTiers || []).filter(tier => tier.name);
    if (tiers.length > 0) {
      const tierSpend  = new Map(); // clientId -> { completedCount, totalSpend }
      for (const o of printLog) {
        if (!o.clientId || o.status !== 'completed') continue;
        let ts = tierSpend.get(o.clientId);
        if (!ts) { ts = { completedCount: 0, totalSpend: 0 }; tierSpend.set(o.clientId, ts); }
        ts.completedCount++; ts.totalSpend += orderRevenueBase(o);
      }
      for (const [cid, { completedCount, totalSpend }] of tierSpend) {
        const eligible = tiers.filter(tier =>
          (!tier.minOrders || completedCount >= +tier.minOrders) &&
          (!tier.minSpend  || totalSpend     >= +tier.minSpend)
        );
        if (eligible.length > 0) {
          clientTierMap.set(cid, eligible.sort((a, b) => {
            const d = (+b.minOrders || 0) - (+a.minOrders || 0);
            return d !== 0 ? d : (+b.minSpend || 0) - (+a.minSpend || 0);
          })[0]);
        }
      }
    }
  }

  const clientMaps = { clientStatsMap, clientBalanceMap, clientTierMap, clientSurveyMap };
  if (window.KhaytStudio?.renderClientsStudioCards?.(filtered, clientMaps)) return;

  tbody.innerHTML = filtered.map(c => {
    const stats = clientStatsMap.get(c.id) || { count: 0, completedCount: 0, revenue: 0, lastDate: null };
    const displayName = localName(c);
    const altName     = i18n.current === 'ar' ? c.nameEn : c.nameAr;
    const balance = clientBalanceMap.get(c.id) || 0;
    const isOverLimit = (c.creditLimit > 0) && (balance > c.creditLimit);
    // Feature 8 (new 8-pack): Loyalty tier badge
    const tier = clientTierMap.get(c.id) || null;
    const tierHtml = tier ? `<span class="loyalty-tier-badge tier-${escapeHtml(tier.name.toLowerCase().replace(/\s+/g,''))}">${escapeHtml(tier.name)}</span>` : '';
    // Survey rating from completed orders (pre-computed above)
    const sv = clientSurveyMap.get(c.id);
    const avgRating = sv ? sv.sum / sv.count : null;
    const clientOrdersWithSurveyCount = sv ? sv.count : 0;
    const ratingBadge = avgRating !== null
      ? `<span style="font-size:10px;color:#f59e0b;margin-inline-start:5px;white-space:nowrap;" title="${clientOrdersWithSurveyCount} ${escapeHtml(t('an.survey_responses') || 'survey response(s)')}">⭐ ${avgRating.toFixed(1)}</span>`
      : '';
    const sourceBadge = c.source && c.source !== 'other'
      ? `<span class="source-badge source-${escapeHtml(c.source)}">${escapeHtml(t('cl.source_' + c.source))}</span>`
      : '';
    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="avatar">${escapeHtml(initials(displayName))}</span>
            <div>
              <strong>${escapeHtml(displayName || '—')}</strong>${ratingBadge}${sourceBadge}
              ${c.recurring?.enabled ? `<span class="rec-badge">${escapeHtml(t('rec.badge.' + (c.recurring.interval || 'monthly')))}</span>` : ''}
              ${c.currency && c.currency !== (settings.currency || 'SAR') ? `<span class="currency-badge">${escapeHtml(c.currency)}</span>` : ''}
              ${(c.addresses && c.addresses.length > 0) ? `<span style="font-size:10px; color:var(--primary); margin-inline-start:4px;">📍 ${c.addresses.length}</span>` : ''}
              ${isOverLimit ? `<span class="machine-jobs-badge" style="background:var(--danger);color:#fff;font-size:10px;">⚠ ${escapeHtml(t('cl.over_limit'))}</span>` : ''}
              ${tierHtml}
              ${altName ? `<div style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(altName)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="font-variant-numeric: tabular-nums;">${escapeHtml(c.phone || '—')}</td>
        <td style="font-variant-numeric: tabular-nums;">${stats.count}</td>
        <td style="font-variant-numeric: tabular-nums; color: var(--success);">${fmtPrice(stats.revenue)}</td>
        <td style="font-variant-numeric: tabular-nums; color: var(--text-dim);">${escapeHtml(stats.lastDate || t('cl.never_ordered'))}</td>
        <td style="font-variant-numeric:tabular-nums;text-align:right;color:${balance > 0 ? 'var(--danger)' : 'var(--text-muted)'};">${balance > 0 ? fmtPrice(balance) : '—'}</td>
        <td>
          <button class="btn small" data-act="cl-history" data-id="${c.id}">${escapeHtml(t('cl.history'))}</button>
          <button class="btn small success" data-act="cl-quote" data-id="${c.id}">${escapeHtml(t('cl.quote'))}</button>
          <button class="btn small" data-act="cl-intake-form" data-id="${c.id}" title="${escapeHtml(t('cl.intake_form'))}">📋</button>
          <button class="btn small" data-act="cl-note" data-id="${c.id}" title="${escapeHtml(t('cl.add_note'))}">💬</button>
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
  const accentColor = safeCssColor(settings.invAccentColor, '#5E2E14');

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
  .shop-contact { font-size: 12px; color: #555; text-align: end; }
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
        <button class="btn small ghost" id="btnExportClientPortal">🌐 ${escapeHtml(t('cl.portal_export'))}</button>
      </div>`,
    onMount(modal) {
      modal.querySelector('#btnPrintStatement')?.addEventListener('click', () => {
        generateClientStatement(clientId);
      });
      modal.querySelector('#btnExportClientInvoices')?.addEventListener('click', () => {
        exportClientInvoices(clientId);
      });
      modal.querySelector('#btnExportClientPortal')?.addEventListener('click', () => {
        exportClientPortal(clientId);
      });
    },
    onSave() { quoteForClient(clientId); return true; }
  });
}


async function deleteClient(clientId) {
  const ok = await confirmModal(t('ce.delete_q'), { danger: true });
  if (!ok) return;
  clients = clients.filter(c => c.id !== clientId);
  // Null-out orders that reference the deleted client
  for (const o of printLog) {
    if (o.clientId === clientId) o.clientId = null;
  }
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

    <label style="margin-top:10px;">${escapeHtml(t('cl.source'))}</label>
    <select data-f="source">
      ${['instagram','referral','walk_in','website','exhibition','other'].map(s =>
        `<option value="${s}" ${(draft.source || 'other') === s ? 'selected' : ''}>${escapeHtml(t('cl.source_' + s))}</option>`
      ).join('')}
    </select>

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

    <div style="margin-top:14px; display:flex; align-items:center; gap:12px;">
      <div style="flex:1;">
        <label style="margin-top:0;">${escapeHtml(t('ce.credit_limit'))} (${currencySymbol()})</label>
        <input type="number" id="ceCreditLimit" min="0" step="1" value="${draft.creditLimit || 0}" placeholder="0">
      </div>
      <div style="flex:2; padding-top:20px; font-size:12px; color:var(--text-muted);">${escapeHtml(t('ce.credit_limit_hint'))}</div>
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

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-soft);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="margin:0; flex:1; font-size:12.5px; font-weight:600;">📍 ${escapeHtml(t('ce.address_book'))}</label>
        <button class="btn ghost small" id="ceAddrAdd" type="button">${escapeHtml(t('ce.addr_add'))}</button>
      </div>
      <div id="ceAddressBookWrap"></div>
    </div>

    <div id="clientHistorySection" style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border-soft);">
    </div>

    <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border-soft);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <label style="margin:0; flex:1; font-size:12.5px; font-weight:600;">💬 ${escapeHtml(t('ce.comm_log'))}</label>
      </div>
      <div style="display:flex; gap:6px; margin-bottom:8px;">
        <select id="ceCommType" style="min-width:90px; font-size:12px;">
          <option value="call">${escapeHtml(t('ce.comm_call'))}</option>
          <option value="email">${escapeHtml(t('ce.comm_email'))}</option>
          <option value="whatsapp">${escapeHtml(t('ce.comm_wa'))}</option>
          <option value="meeting">${escapeHtml(t('ce.comm_meeting'))}</option>
          <option value="note">${escapeHtml(t('ce.comm_note'))}</option>
        </select>
        <input type="text" id="ceCommNote" placeholder="${escapeHtml(t('ce.comm_note_ph'))}" style="flex:1; font-size:12px;">
        <button type="button" id="ceCommAdd" class="btn small primary">${escapeHtml(t('common.add'))}</button>
      </div>
      <div id="ceCommLogList" style="max-height:160px; overflow-y:auto;"></div>
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
            <td><button class="btn danger small pl-rm" data-pli="${i}" aria-label="${escapeHtml(t('common.delete'))}">×</button></td>
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

      // Address book (Feature 4)
      if (!draft.addresses) draft.addresses = [];
      const addrWrap = modal.querySelector('#ceAddressBookWrap');
      function renderAddressBook() {
        if (!addrWrap) return;
        if (!draft.addresses || draft.addresses.length === 0) {
          addrWrap.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;padding:4px 0;">${escapeHtml(t('ce.price_list_empty'))}</div>`;
          return;
        }
        addrWrap.innerHTML = `<table style="width:100%; border-collapse:collapse;">
          <thead><tr>
            <th style="font-size:11px; text-align:start; padding:2px 4px;">${escapeHtml(t('ce.addr_label'))}</th>
            <th style="font-size:11px; text-align:start; padding:2px 4px;">${escapeHtml(t('ce.addr_address'))}</th>
            <th></th>
          </tr></thead>
          <tbody>${draft.addresses.map((a, i) => `<tr>
            <td style="padding:2px 4px;"><input type="text" class="addr-label" data-ai="${i}" value="${escapeHtml(a.label || '')}" placeholder="${escapeHtml(t('ce.addr_label'))}" style="width:100%;font-size:12px;"></td>
            <td style="padding:2px 4px;"><input type="text" class="addr-addr" data-ai="${i}" value="${escapeHtml(a.address || '')}" placeholder="${escapeHtml(t('ce.addr_address'))}" style="width:100%;font-size:12px;"></td>
            <td><button class="btn danger small addr-rm" data-ai="${i}" aria-label="${escapeHtml(t('common.delete'))}">×</button></td>
          </tr>`).join('')}</tbody>
        </table>`;
        addrWrap.querySelectorAll('.addr-label').forEach(inp => { inp.addEventListener('input', () => { draft.addresses[+inp.dataset.ai].label = inp.value; }); });
        addrWrap.querySelectorAll('.addr-addr').forEach(inp => { inp.addEventListener('input', () => { draft.addresses[+inp.dataset.ai].address = inp.value; }); });
        addrWrap.querySelectorAll('.addr-rm').forEach(btn => { btn.addEventListener('click', () => { draft.addresses.splice(+btn.dataset.ai, 1); renderAddressBook(); }); });
      }
      renderAddressBook();
      const ceAddrAddBtn = modal.querySelector('#ceAddrAdd');
      if (ceAddrAddBtn) ceAddrAddBtn.addEventListener('click', () => { draft.addresses.push({ id: uid('ADDR'), label: '', address: '' }); renderAddressBook(); });

      // Communication log
      if (!draft.commLog) draft.commLog = [];
      const commListEl = modal.querySelector('#ceCommLogList');
      const COMM_ICONS = { call: '📞', email: '📧', whatsapp: '💬', meeting: '🤝', note: '📝' };
      function renderCommLog() {
        if (!commListEl) return;
        if (draft.commLog.length === 0) {
          commListEl.innerHTML = `<p style="color:var(--text-muted);font-size:12px;margin:4px 0;">${escapeHtml(t('ce.comm_empty'))}</p>`;
          return;
        }
        const sorted = [...draft.commLog].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
        commListEl.innerHTML = sorted.map((e, idx) => `
          <div style="display:flex;align-items:flex-start;gap:6px;padding:5px 0;border-bottom:1px solid var(--border-soft);font-size:12px;">
            <span>${COMM_ICONS[e.type] || '📝'}</span>
            <div style="flex:1;">
              <span style="font-weight:600;">${escapeHtml(t('ce.comm_' + (e.type || 'note')))}</span>
              <span style="color:var(--text-dim);font-size:11px;margin-inline-start:6px;">${escapeHtml((e.at || '').slice(0, 10))}</span>
              <div style="color:var(--text-muted);">${escapeHtml(e.note || '')}</div>
            </div>
            <button class="btn danger small comm-del" data-ci="${idx}" style="flex-shrink:0;">×</button>
          </div>`).join('');
        commListEl.querySelectorAll('.comm-del').forEach(btn => {
          btn.addEventListener('click', () => {
            // find by reverse index since we sorted
            const sorted2 = [...draft.commLog].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
            const toRemove = sorted2[+btn.dataset.ci];
            const idx2 = draft.commLog.indexOf(toRemove);
            if (idx2 >= 0) draft.commLog.splice(idx2, 1);
            renderCommLog();
          });
        });
      }
      renderCommLog();
      const commAddBtn = modal.querySelector('#ceCommAdd');
      if (commAddBtn) {
        commAddBtn.addEventListener('click', () => {
          const noteInput = modal.querySelector('#ceCommNote');
          const typeInput = modal.querySelector('#ceCommType');
          const noteVal = (noteInput?.value || '').trim();
          if (!noteVal) return;
          const newEntry = { id: uid('CMM'), type: typeInput?.value || 'note', note: noteVal, at: new Date().toISOString() };
          draft.commLog.push(newEntry);
          if (draft.commLog.length > 200) draft.commLog.length = 200;
          // Immediately persist to the real client record so it isn't lost if modal is closed via ×
          const liveClient = clients.find(c => c.id === draft.id);
          if (liveClient) {
            if (!liveClient.commLog) liveClient.commLog = [];
            liveClient.commLog.push(newEntry);
            if (liveClient.commLog.length > 200) liveClient.commLog.length = 200;
            saveAll();
          }
          if (noteInput) noteInput.value = '';
          renderCommLog();
        });
      }

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
              ${clientOrders.slice(0, 30).map(o => `
                <div class="ch-row">
                  <span class="ch-date">${escapeHtml(o.date)}</span>
                  <span class="ch-name">${escapeHtml(o.project)}</span>
                  <span class="badge ${escapeHtml(o.status)}">${escapeHtml(t('queue.' + o.status))}</span>
                  <span class="ch-price">${fmtPrice(o.price)}</span>
                </div>`).join('')}
            </div>
            ${clientOrders.length > 30 ? `<p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0;">+${clientOrders.length - 30} more — see Orders log</p>` : ''}`;
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
      draft.creditLimit = Math.max(0, num(modal.querySelector('#ceCreditLimit')?.value, 0)) || 0;
      draft.source = modal.querySelector('[data-f="source"]')?.value || 'other';
      draft.priceList = (draft.priceList || []).filter(pl => pl.product.trim() || pl.price > 0);
      draft.addresses = (draft.addresses || []).filter(a => a.label.trim() || a.address.trim());
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

    // Check if an order was already created for this cycle — prevents duplicates
    // when patchRecurringOrdersWithLeadDays also runs on boot
    // Must happen BEFORE consuming the invoice number to avoid wasting sequence numbers
    const alreadyCreated = printLog.some(o =>
      o.clientId === client.id && o.recurringCycle === rec.nextDue);
    if (alreadyCreated) return;

    const now = new Date();
    const invoiceNum = nextInvoiceNumber();
    const seq = String(settings.invNumNext - 1).padStart(4, '0');
    const id = `${settings.invPrefix || 'INV'}-${now.getFullYear()}-${seq}`;

    printLog.unshift({
      ...template,
      parts: template.parts ? template.parts.map(p => ({ ...p })) : [],
      id,
      invoiceNum,
      invoiceNumber: invoiceNum,
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
      recurringCycle: rec.nextDue,
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
/* Order flows — renderer/order-flows.js */
/* exportAnalyticsReport — renderer/analytics.js */

/* Waiting list (job intake) — renderer/waiting-list.js */

/* ============================================================
   Feature 2: Schedule view — per-machine timeline
   ============================================================ */
function renderScheduleView() {
  const el = $('#scheduleView');
  if (!el) return;
  const activeOrders = printLog.filter(o => !['completed', 'quote'].includes(o.status));
  if (activeOrders.length === 0) {
    el.innerHTML = `<div class="card"><p style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px 0;">${escapeHtml(t('queue.empty'))}</p></div>`;
    return;
  }

  // Group orders by machine
  const machineMap = {};
  activeOrders.forEach(o => {
    const mid = o.machineId || '__unassigned__';
    if (!machineMap[mid]) machineMap[mid] = [];
    machineMap[mid].push(o);
  });

  // Determine time horizon (max 48h or sum of queued)
  const totalHours = Math.max(48, activeOrders.reduce((s, o) => s + (+o.printTime || 0), 0));
  const tickMarks = [0, 4, 8, 12, 16, 24, 32, 48].filter(h => h <= totalHours + 4);

  // Build axis HTML
  const axisHtml = `<div class="schedule-axis">
    ${tickMarks.map(h => {
      const pct = (h / totalHours) * 100;
      return `<div class="schedule-axis-tick" style="position:absolute; left:${pct.toFixed(1)}%; transform:translateX(-50%);">${h}h</div>`;
    }).join('')}
  </div>`;

  // Build rows
  const rowsHtml = Object.entries(machineMap).map(([mid, orders]) => {
    const machine = machines.find(m => m.id === mid);
    const label = machine ? machine.name : t('dash.unassigned');
    const dotColor = machine ? machine.color : '#888';
    let offset = 0;
    const blocks = orders.map(o => {
      const pct = ((+o.printTime || 0) / totalHours) * 100;
      const blockHtml = `<div class="schedule-block status-${escapeHtml(o.status)}"
        style="flex: 0 0 ${pct.toFixed(2)}%; background:${escapeHtml(dotColor)};"
        title="${escapeHtml((o.invoiceNum || o.id) + ' · ' + (o.project || ''))}">
        ${pct > 5 ? escapeHtml((o.invoiceNum || o.id).slice(-6)) : ''}
      </div>`;
      offset += pct;
      return blockHtml;
    }).join('');
    return `<div class="schedule-machine-row">
      <div class="schedule-machine-label">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${escapeHtml(dotColor)}; flex-shrink:0;"></span>
        ${escapeHtml(label)}
      </div>
      <div class="schedule-track">${blocks}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="card">
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
      <h3 class="card-head" style="margin:0; flex:1;"><span class="swatch"></span>${escapeHtml(t('kan.schedule_view'))}</h3>
      <span style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(t('kan.schedule_now'))}: ${new Date().toLocaleTimeString()}</span>
    </div>
    <div class="schedule-view" style="position:relative; padding-top:22px;">
      <div style="position:relative; height:22px; margin-inline-start:130px; margin-bottom:4px;">
        ${tickMarks.map(h => {
          const pct = (h / totalHours) * 100;
          return `<div style="position:absolute; left:${pct.toFixed(1)}%; transform:translateX(-50%); font-size:10.5px; color:var(--text-muted);">${h}h</div>`;
        }).join('')}
      </div>
      <div style="position:absolute; left:130px; top:22px; bottom:0; width:2px; background:var(--primary); opacity:0.6; z-index:2; pointer-events:none;">
        <span style="position:absolute; top:-18px; left:50%; transform:translateX(-50%); font-size:9.5px; font-weight:700; color:var(--primary); white-space:nowrap; background:var(--bg-card); padding:0 3px;">▼ NOW</span>
      </div>
      ${rowsHtml}
    </div>
  </div>`;
}

/* ============================================================
   Calendar view — monthly grid by due date
   ============================================================ */
let calendarViewMonth = null; // null = current month

function renderCalendarView() {
  const el = $('#calendarView');
  if (!el) return;

  const now = new Date();
  if (!calendarViewMonth) calendarViewMonth = { y: now.getFullYear(), m: now.getMonth() };
  const { y, m } = calendarViewMonth;

  const firstDay = new Date(y, m, 1);
  const lastDay  = new Date(y, m + 1, 0);
  const monthStr = firstDay.toLocaleDateString(i18n.current === 'ar' ? 'ar-SA' : 'en-US', { year: 'numeric', month: 'long' });

  // Build a map: "YYYY-MM-DD" -> orders[]
  const dayMap = {};
  printLog.forEach(o => {
    if (!o.dueDate || o.status === 'completed' || o.status === 'quote') return;
    const d = (o.dueDate || '').slice(0, 10);
    if (!dayMap[d]) dayMap[d] = [];
    dayMap[d].push(o);
  });

  // Day-of-week headers (Sun–Sat for LTR; adapt for RTL)
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const headerHtml = dayNames.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // Calendar cells: pad before first day
  const startDow = firstDay.getDay(); // 0=Sun
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell cal-empty"></div>`;

  const todayStr = localDateStr(now);

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const orders  = dayMap[dateStr] || [];

    const chips = orders.slice(0, 3).map(o => {
      const mc = machines.find(x => x.id === o.machineId);
      const bg = mc?.color ? mc.color : (
        o.status === 'printing' ? '#5b9cf0' :
        o.status === 'post'     ? '#a78bfa' :
        o.status === 'qc'       ? '#f59e0b' :
                                  '#6b7793'
      );
      return `<div class="cal-chip" style="background:${escapeHtml(bg)};" title="${escapeHtml(o.project || o.id)}">${escapeHtml((o.project || o.id).slice(0, 18))}</div>`;
    }).join('');

    const overflow = orders.length > 3 ? `<div class="cal-chip-more">+${orders.length - 3}</div>` : '';

    cells += `<div class="cal-cell${isToday ? ' cal-today' : ''}" data-date="${dateStr}">
      <div class="cal-day-num">${d}</div>
      ${chips}${overflow}
    </div>`;
  }

  el.innerHTML = `<div class="card" style="padding:12px;">
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
      <button class="btn small ghost" id="calPrev">‹</button>
      <h3 style="margin:0; flex:1; text-align:center; font-size:14px;">${escapeHtml(monthStr)}</h3>
      <button class="btn small ghost" id="calNext">›</button>
    </div>
    <div class="cal-grid">
      ${headerHtml}
      ${cells}
    </div>
  </div>`;

  el.querySelector('#calPrev')?.addEventListener('click', () => {
    calendarViewMonth = { y: m === 0 ? y - 1 : y, m: m === 0 ? 11 : m - 1 };
    renderCalendarView();
  });
  el.querySelector('#calNext')?.addEventListener('click', () => {
    calendarViewMonth = { y: m === 11 ? y + 1 : y, m: m === 11 ? 0 : m + 1 };
    renderCalendarView();
  });

  // Click a day cell to open a popup showing orders for that day
  el.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      const orders = dayMap[date] || [];
      if (orders.length === 0) return;
      const body = orders.map(o => {
        const mc = machines.find(x => x.id === o.machineId);
        return `<div style="padding:8px 0; border-bottom:1px solid var(--border-soft); font-size:13px;">
          <strong>${escapeHtml(o.project || o.id)}</strong>
          <span style="margin-inline-start:8px; font-size:11px; color:var(--text-muted);">${escapeHtml(o.status)}</span>
          ${mc ? `<span style="margin-inline-start:6px; font-size:11px; color:var(--primary);">🖨 ${escapeHtml(mc.name)}</span>` : ''}
        </div>`;
      }).join('');
      openFormModal({
        title: `📆 ${escapeHtml(date)}`,
        noSave: true,
        bodyHtml: `<div>${body}</div>`
      });
    });
  });
}

/* ── Kiosk view ─────────────────────────────────────────── */
function renderKioskView() {
  const el = $('#kioskView');
  if (!el) return;

  // Build a map: machineId → current active order
  const activeMachines = machines.filter(m => !m.deleted);
  const activeOrders = printLog.filter(o => o.status !== 'completed' && o.status !== 'quote');

  const cards = activeMachines.map(m => {
    const job = activeOrders.filter(o => o.machineId === m.id)
      .sort((a, b) => {
        const rankOf = s => ({ printing: 0, post: 1, qc: 2, pending: 3, on_hold: 4 })[s] ?? 5;
        return rankOf(a.status) - rankOf(b.status);
      })[0] || null;

    const statusColors = {
      printing: '#22c55e',
      post:     '#f59e0b',
      qc:       '#3b82f6',
      pending:  '#6b7280',
      on_hold:  '#ef4444',
    };
    const idleColor = '#374151';

    const borderColor = job ? (statusColors[job.status] || '#6b7280') : idleColor;

    let progressHtml = '';
    if (job) {
      const printHrs = +job.printTime || 0;
      const startedAt = job.printingStartedAt ? new Date(job.printingStartedAt).getTime() : null;
      let pct = 0;
      let etaStr = '';
      if (printHrs > 0 && startedAt) {
        const elapsed = (Date.now() - startedAt) / 3600000;
        pct = Math.min(100, Math.round((elapsed / printHrs) * 100));
        const remaining = Math.max(0, printHrs - elapsed);
        if (remaining > 0) {
          const h = Math.floor(remaining);
          const min = Math.round((remaining - h) * 60);
          etaStr = h > 0 ? `${h}h ${min}m` : `${min}m`;
        } else {
          etaStr = t('kiosk.done') || 'Done';
        }
      } else if (printHrs > 0) {
        etaStr = `~${printHrs}h total`;
      }

      const client = job.clientId ? clients.find(c => c.id === job.clientId) : null;
      const clientName = client ? (client.nameEn || client.nameAr || '') : (job.client || '');

      progressHtml = `
        <div class="kiosk-job">
          <div class="kiosk-job-name">${escapeHtml(job.project || t('inv.walk_in'))}</div>
          ${clientName ? `<div class="kiosk-job-client">👤 ${escapeHtml(clientName)}</div>` : ''}
          <div class="kiosk-job-status">
            <span class="badge ${escapeHtml(job.status)}" style="font-size:13px;padding:3px 10px;">${escapeHtml(t('queue.' + job.status))}</span>
          </div>
          ${pct > 0 ? `
          <div class="kiosk-progress-wrap">
            <div class="kiosk-progress-bar" style="width:${pct}%;background:${borderColor};"></div>
          </div>
          <div class="kiosk-eta">${pct}% ${etaStr ? `· ETA ${escapeHtml(etaStr)}` : ''}</div>` : ''}
          ${job.dueDate ? `<div class="kiosk-due">📅 ${escapeHtml(job.dueDate)}</div>` : ''}
        </div>`;
    } else {
      progressHtml = `<div class="kiosk-idle">${escapeHtml(t('kiosk.idle') || 'Idle')}</div>`;
    }

    return `
      <div class="kiosk-card" style="border-color:${borderColor};">
        <div class="kiosk-machine-name">${escapeHtml(m.name || m.model || m.id)}</div>
        ${m.model && m.name !== m.model ? `<div class="kiosk-machine-model">${escapeHtml(m.model)}</div>` : ''}
        ${progressHtml}
      </div>`;
  });

  if (cards.length === 0) {
    el.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:32px;">${escapeHtml(t('kiosk.no_machines') || 'No machines configured.')}</p>`;
    return;
  }

  el.innerHTML = `<div class="kiosk-grid">${cards.join('')}</div>`;
}

/* ============================================================
   Feature 3: Spool switch modal
   ============================================================ */

/* ============================================================
   Feature 5: Throughput heatmap
   ============================================================ */

/* ============================================================
   Feature 7: Invoice numbering settings UI helpers
   ============================================================ */
function renderPostProcessPresetsList() {
  const el = $('#postProcessPresetsList');
  if (!el) return;
  const presets = settings.postProcessPresets || [];
  if (presets.length === 0) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text-muted);margin:0 0 6px;">${escapeHtml(t('set.no_presets') || 'No presets yet.')}</p>`;
  } else {
    el.innerHTML = presets.map((p, i) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="flex:1;font-size:13px;">${escapeHtml(p.name)}</span>
        <span style="font-size:13px;color:var(--success);min-width:60px;text-align:right;">${fmtMoney(p.amount)}</span>
        <button class="btn danger small" data-pp-del="${i}">×</button>
      </div>`).join('');
    el.querySelectorAll('[data-pp-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        settings.postProcessPresets.splice(+btn.dataset.ppDel, 1);
        saveAll();
        renderPostProcessPresetsList();
      });
    });
  }
  // Wire Add button
  const addBtn = $('#btnAddPostPreset');
  if (addBtn && !addBtn._wired) {
    addBtn._wired = true;
    addBtn.addEventListener('click', () => {
      const name = $('#set_ppName')?.value.trim();
      const amount = Math.max(0, num($('#set_ppAmount')?.value, 0));
      if (!name) return toast(t('common.required') || 'Name is required', 'error');
      if (!settings.postProcessPresets) settings.postProcessPresets = [];
      settings.postProcessPresets.push({ name, amount });
      saveAll();
      if ($('#set_ppName')) $('#set_ppName').value = '';
      if ($('#set_ppAmount')) $('#set_ppAmount').value = '';
      renderPostProcessPresetsList();
      toast(t('set.preset_saved') || 'Preset saved', 'success');
    });
  }
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
  const recurringVal = $('#expRecurring')?.value || null;
  const nextDue = recurringVal ? calcNextDueDate(dateVal, recurringVal) : null;
  const expCat = $('#expCategory').value || 'other';
  expenses.unshift({
    id:          uid('EXP'),
    date:        dateVal,
    category:    expCat,
    amount,
    note:        $('#expNote').value.trim(),
    orderId:     orderRef,
    receiptPath: _expReceiptPath || null,
    recurring:   recurringVal || null,
    nextDue:     nextDue,
    locationId:  $('#exp_locationId')?.value || '',
  });
  saveAll();
  // Budget overspend check
  const budget = (settings.expBudgets || {})[expCat] || 0;
  if (budget > 0) {
    const curMonth = new Date().toISOString().slice(0, 7);
    const monthSpent = expenses
      .filter(e => e.category === expCat && (e.date || '').startsWith(curMonth))
      .reduce((s, e) => s + (+e.amount || 0), 0);
    if (monthSpent > budget) {
      toast(t('exp.budget_exceeded', { cat: expCatLabel(expCat), spent: fmtMoney(monthSpent), budget: fmtMoney(budget) }), 'warning', 5000);
    }
  }
  $('#expAmount').value = '';
  $('#expNote').value   = '';
  if ($('#expOrderRef')) $('#expOrderRef').value = '';
  if ($('#expRecurring')) $('#expRecurring').value = '';
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

async function emailOrderToClient(orderId, isQuote = false) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  if (!client?.email) { toast(t('ord.no_email'), 'error'); return; }
  const clientName = localName(client) || order.project || '';
  const shopName = settings.bizEn || 'Khayt';
  const subjectText = isQuote
    ? `Quote #${order.id} — ${order.project}`
    : `Invoice for order #${order.id} — ${order.project}`;

  // Use configured SMTP if available, fall back to mailto
  const cfg = settings.emailConfig;
  const smtpReady = cfg && cfg.provider !== 'none' && cfg.provider !== 'mailto' && cfg.apiKey;
  if (smtpReady && window.hubAPI?.sendEmail) {
    const htmlBody = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
      <h2 style="color:${safeCssColor(settings.invAccentColor, '#5E2E14')};">${escapeHtml(shopName)}</h2>
      <p>Dear ${escapeHtml(clientName)},</p>
      <p>${isQuote
        ? `Please find below your quote <strong>${escapeHtml(order.id)}</strong> for <strong>${fmtPrice(order.price)}</strong>.`
        : `Please find below your invoice <strong>${escapeHtml(order.id)}</strong> for <strong>${fmtPrice(order.price)}</strong>.`
      }</p>
      <p>Project: ${escapeHtml(order.project || '')}</p>
      <p>Date: ${escapeHtml(order.date || '')}</p>
      ${!isQuote && settings.paymentInstructions ? `<p>${escapeHtml(settings.paymentInstructions)}</p>` : ''}
      <p>Thank you for your business!</p>
      <p style="font-size:12px;color:#888;">— ${escapeHtml(shopName)}</p>
    </div>`;
    try {
      const result = await window.hubAPI.sendEmail({ to: client.email, subject: subjectText, body: htmlBody, smtpConfig: cfg });
      if (result?.ok) {
        toast('📧 ' + t('ord.email_sent'), 'success');
        return;
      }
    } catch(e) { /* fall through to mailto */ }
  }

  // Fallback: open OS mail client
  const bodyLines = [
    `Dear ${clientName},`, '',
    isQuote
      ? `Please find attached your quote #${order.id} for ${fmtPrice(order.price)}.`
      : `Please find attached your invoice #${order.id} for ${fmtPrice(order.price)}.`,
    `Order: ${order.project}`, `Date: ${order.date}`,
  ];
  if (!isQuote && settings.paymentInstructions) bodyLines.push('', settings.paymentInstructions);
  bodyLines.push('', 'Thank you for your business!', shopName);
  const mailtoUrl = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
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
  const expense = expenses.find(e => e.id === id);
  const label = expense ? (expense.note || expCatLabel(expense.category) || expense.category) : '';
  const msg = expense
    ? `${t('common.delete')} "${escapeHtml(label)}" — ${fmtPrice(expense.amount)}?`
    : t('common.delete') + '?';
  const ok = await confirmModal(msg, { danger: true });
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
        <td style="color:var(--text-muted); font-size:12.5px;">
          ${escapeHtml(e.note)}
          ${e.recurring ? `<span class="rec-badge" style="font-size:10px;">🔁 ${escapeHtml(t('exp.recurring_' + e.recurring))}${e.nextDue ? ' · ' + escapeHtml(e.nextDue) : ''}</span>` : ''}
        </td>
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
    .reduce((s, o) => s + orderRevenueBase(o), 0);
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
  // Budgets are monthly — use the active month if a month filter is selected, otherwise current month
  const budgetFilter = (expRangeFilter === 'month' || expRangeFilter === 'last_month') ? expRangeFilter : 'month';
  const filteredExpenses = expenses.filter(e => inRange(e.date, budgetFilter, 'expenses'));
  const byCategory = {};
  EXP_CATEGORIES.forEach(c => { byCategory[c] = 0; });
  filteredExpenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

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
    [`Date`,`Category`,`Amount (${currencySymbol()})`,`Note`,`Order ID`].map(csvEsc).join(','),
    ...filtered.map(e => [e.date, expCatLabel(e.category), e.amount, e.note, e.orderId || ''].map(csvEsc).join(','))
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
const WASTE_FAILURE_TYPES = ['bed_adhesion','nozzle_jam','warping','stringing','operator_error','design_issue','power_failure','material_quality','other'];

function renderWasteLog() {
  const tbody = document.querySelector('#wasteTable tbody');
  if (!tbody) return;

  const wasteFiltered = wasteLog.filter(w => {
    if (wasteMaterialFilter && w.material !== wasteMaterialFilter) return false;
    if (wasteFailureFilter && w.failureType !== wasteFailureFilter) return false;
    if (wasteSearchTerm) {
      const hay = [w.material || '', w.reason || '', w.failureType || ''].join(' ').toLowerCase();
      if (!hay.includes(wasteSearchTerm.toLowerCase())) return false;
    }
    if (wasteDateFilter !== 'all') {
      if (!inRange(w.date, wasteDateFilter, 'waste')) return false;
    }
    return true;
  });
  const sorted = [...wasteFiltered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const totalWasteCost = wasteLog.reduce((s, w) => s + (+w.cost || 0), 0);
  const totalWasteGrams = wasteLog.reduce((s, w) => s + (+w.weight || 0), 0);

  // Failure type breakdown
  const ftCounts = {};
  wasteLog.forEach(w => { const ft = w.failureType || 'other'; ftCounts[ft] = (ftCounts[ft] || 0) + 1; });

  const statEl = $('#wasteStats');
  // QW9: Populate waste filter dropdowns
  const wasteMaterialSel = $('#wasteMaterialFilter');
  if (wasteMaterialSel) {
    const mats = [...new Set(wasteLog.map(w => w.material).filter(Boolean))].sort();
    wasteMaterialSel.innerHTML = `<option value="">${escapeHtml(t('common.all') || 'All materials')}</option>` +
      mats.map(m => `<option value="${escapeHtml(m)}"${m === wasteMaterialFilter ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('');
  }
  const wasteFailureSel = $('#wasteFailureFilter');
  if (wasteFailureSel) {
    wasteFailureSel.innerHTML = `<option value="">${escapeHtml(t('common.all') || 'All failure types')}</option>` +
      WASTE_FAILURE_TYPES.map(ft => `<option value="${escapeHtml(ft)}"${ft === wasteFailureFilter ? ' selected' : ''}>${escapeHtml(t('waste.ft.' + ft))}</option>`).join('');
  }
  if (statEl) {
    const completedRevenue = printLog.filter(o => o.status === 'completed').reduce((s, o) => s + orderRevenueBase(o), 0);
    const wastePct = completedRevenue > 0 ? (totalWasteCost / completedRevenue * 100) : null;
    const maxFt = Object.values(ftCounts).reduce((a, b) => Math.max(a, b), 1);
    const ftBars = WASTE_FAILURE_TYPES.filter(ft => ftCounts[ft] > 0).sort((a, b) => (ftCounts[b] || 0) - (ftCounts[a] || 0)).map(ft => {
      const pct = ((ftCounts[ft] || 0) / maxFt * 100).toFixed(1);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px;">
        <span style="width:130px;color:var(--text-muted);text-align:end;">${escapeHtml(t('waste.ft.' + ft))}</span>
        <div style="flex:1;background:rgba(255,255,255,0.08);border-radius:3px;height:8px;"><div style="background:var(--danger);width:${pct}%;height:100%;border-radius:3px;opacity:0.75;"></div></div>
        <span style="width:24px;text-align:start;">${ftCounts[ft]}</span>
      </div>`;
    }).join('');
    const wastePctHtml = wastePct !== null
      ? `<span>${escapeHtml(t('waste.pct_revenue'))}: <strong style="color:${wastePct > 5 ? 'var(--danger)' : wastePct > 2 ? 'var(--warning)' : 'var(--success)'};">${wastePct.toFixed(1)}%</strong></span>`
      : '';
    statEl.innerHTML = `
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:${ftBars ? '12px' : '0'};">
        <span>${escapeHtml(t('waste.total_entries'))}: <strong>${wasteLog.length}</strong></span>
        <span>${escapeHtml(t('waste.total_weight'))}: <strong>${totalWasteGrams.toFixed(0)}g</strong></span>
        <span>${escapeHtml(t('waste.total_cost'))}: <strong>${fmtPrice(totalWasteCost)}</strong></span>
        ${wastePctHtml}
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">${escapeHtml(t('waste.empty'))} <button class="btn small primary" id="btnLogWasteEmpty" style="margin-inline-start:12px;">${escapeHtml(t('waste.add') || 'Log Failed Print')}</button></td></tr>`;
    // Wire up the CTA
    document.querySelector('#btnLogWasteEmpty')?.addEventListener('click', () => document.querySelector('#btnLogWaste')?.click());
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
          <input type="date" id="wf_date" value="${today}" max="${today}">
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
      <label style="margin-top:12px;">${escapeHtml(t('waste.printer') || 'Printer / Machine')}</label>
      <select id="wf_machine">
        <option value="">${escapeHtml(t('mach.unassigned') || '— Unassigned —')}</option>
        ${machines.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join('')}
      </select>
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:14px;">
        <input type="checkbox" id="wf_deduct" checked style="width:auto; margin:0;">
        <span>${escapeHtml(t('waste.deduct_inv'))}</span>
      </label>
    `,
    onMount(modal) {
      // Auto-calculate cost when material or weight changes
      const autoCalcCost = () => {
        const mat = modal.querySelector('#wf_material')?.value;
        const wt  = Math.max(0, +modal.querySelector('#wf_weight')?.value || 0);
        if (!mat || wt <= 0) return;
        const invItem = inventory.find(i => i.material === mat);
        if (invItem && invItem.cost > 0 && invItem.weight > 0) {
          const costPerGram = invItem.cost / invItem.weight;
          const costEl = modal.querySelector('#wf_cost');
          if (costEl) costEl.value = (wt * costPerGram).toFixed(2);
        }
      };
      modal.querySelector('#wf_material')?.addEventListener('change', autoCalcCost);
      modal.querySelector('#wf_weight')?.addEventListener('input', autoCalcCost);
    },
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
      const machineId   = ($('#wf_machine')?.value || '').trim() || null;

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
        machineId,
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

function openLogWasteFromCard(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  // Pre-fill material from first part with material data
  const firstPart = (order.parts || []).find(p => p.material);
  const defaultMaterial = firstPart?.material || order.material || '';
  const invOptions = inventory.map(f =>
    `<option value="${escapeHtml(f.material)}"${f.material === defaultMaterial ? ' selected' : ''}>${escapeHtml(f.material)}</option>`
  ).join('');
  const failureOptions = WASTE_FAILURE_TYPES.map(ft =>
    `<option value="${ft}">${escapeHtml(t('waste.ft.' + ft))}</option>`
  ).join('');

  openFormModal({
    title: t('waste.log_from_card'),
    saveLabel: t('waste.log_btn'),
    sizeLg: false,
    bodyHtml: `
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px;">${escapeHtml(order.id)} — ${escapeHtml(order.project || '')}</p>
      <label>${escapeHtml(t('waste.material'))}</label>
      <select id="wfc_material">${invOptions || `<option value="">${escapeHtml(defaultMaterial)}</option>`}</select>
      <label style="margin-top:12px;">${escapeHtml(t('waste.weight_g'))}</label>
      <input type="number" id="wfc_weight" value="0" min="0" step="1">
      <label style="margin-top:12px;">${escapeHtml(t('waste.failure_type'))}</label>
      <select id="wfc_failure_type">${failureOptions}</select>
      <label style="margin-top:12px;">${escapeHtml(t('waste.notes'))}</label>
      <textarea id="wfc_notes" rows="2" style="resize:vertical;"></textarea>
    `,
    onSave() {
      const material    = $('#wfc_material').value.trim();
      const weight      = Math.max(0, +$('#wfc_weight').value || 0);
      const failureType = $('#wfc_failure_type').value;
      const notes       = $('#wfc_notes').value.trim();
      if (!material) { toast(t('waste.err_material'), 'error'); return false; }
      // Compute cost per gram from inventory
      const invItem = inventory.find(i => i.material === material);
      const costPerGram = (invItem && invItem.cost > 0 && invItem.weight > 0)
        ? invItem.cost / invItem.weight : 0;
      const entry = {
        id: uid('W'),
        date: localDateStr(),
        orderId: order.id,
        material,
        weight,
        failureType,
        notes,
        cost: +(weight * costPerGram).toFixed(2),
      };
      wasteLog.unshift(entry);
      saveAll();
      renderWasteLog();
      toast(t('waste.saved'), 'success');
      return true;
    }
  });
}

async function deleteWasteEntry(id) {
  const ok = await confirmModal(t('common.delete') + '?', { danger: true });
  if (!ok) return;
  const idx = wasteLog.findIndex(w => w.id === id);
  if (idx < 0) return;
  const entry = wasteLog[idx];
  wasteLog.splice(idx, 1);
  // Restore filament weight if the waste entry tracked a spool
  if (entry.spoolId && entry.weight > 0) {
    const spool = inventory.find(i => i.id === entry.spoolId);
    if (spool) spool.weight = (spool.weight || 0) + entry.weight;
  }
  saveAll();
  renderWasteLog();
  renderInventory();
  toast(t('waste.deleted'), 'success');
}

/* ============================================================
   Monthly Tax Summary Export
   ============================================================ */
function exportTaxSummary() {
  // New Feature 4: Show period selector modal before exporting
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth(); // 0-based
  const curQ = Math.floor(curM / 3); // 0-based quarter

  openFormModal({
    title: t('tax.period'),
    sizeLg: false,
    saveLabel: t('set.export'),
    bodyHtml: `
      <label>${escapeHtml(t('tax.period'))}</label>
      <select id="taxPeriodSel" style="margin-bottom:10px;">
        <option value="month">${escapeHtml(t('an.this_month') || 'This month')}</option>
        <option value="last_month">${escapeHtml(t('an.last_month') || 'Last month')}</option>
        <option value="quarter">${escapeHtml(t('tax.this_quarter'))}</option>
        <option value="last_quarter">${escapeHtml(t('tax.last_quarter'))}</option>
        <option value="year">${escapeHtml(t('tax.this_year'))}</option>
        <option value="all" selected>${escapeHtml(t('common.all'))}</option>
        <option value="custom">${escapeHtml(t('tax.custom_range'))}</option>
      </select>
      <div id="taxCustomRange" style="display:none;">
        <div class="inline-pair">
          <div>
            <label style="margin-top:0;">${escapeHtml(t('common.date'))} (from)</label>
            <input type="date" id="taxFromDate">
          </div>
          <div>
            <label style="margin-top:0;">${escapeHtml(t('common.date'))} (to)</label>
            <input type="date" id="taxToDate">
          </div>
        </div>
      </div>`,
    onMount(modal) {
      const sel = modal.querySelector('#taxPeriodSel');
      const customDiv = modal.querySelector('#taxCustomRange');
      sel.addEventListener('change', () => {
        customDiv.style.display = sel.value === 'custom' ? '' : 'none';
      });
    },
    onSave(modal) {
      const period = modal.querySelector('#taxPeriodSel').value;
      const fromInput = modal.querySelector('#taxFromDate')?.value || '';
      const toInput   = modal.querySelector('#taxToDate')?.value || '';

      // Helper: last calendar day of a given year/month (1-based month)
      const lastDay = (y, m) => new Date(y, m, 0).getDate();
      const pad = n => String(n).padStart(2, '0');

      // Compute date range
      let fromDate = '', toDate = '';
      if (period === 'month') {
        fromDate = `${curY}-${pad(curM + 1)}-01`;
        toDate   = `${curY}-${pad(curM + 1)}-${lastDay(curY, curM + 1)}`;
      } else if (period === 'last_month') {
        const lm = new Date(curY, curM - 1, 1);
        const ly = lm.getFullYear(), lmm = lm.getMonth() + 1;
        fromDate = `${ly}-${pad(lmm)}-01`;
        toDate   = `${ly}-${pad(lmm)}-${lastDay(ly, lmm)}`;
      } else if (period === 'quarter') {
        const qFrom = curQ * 3 + 1, qTo = curQ * 3 + 3;
        fromDate = `${curY}-${pad(qFrom)}-01`;
        toDate   = `${curY}-${pad(qTo)}-${lastDay(curY, qTo)}`;
      } else if (period === 'last_quarter') {
        const lq = curQ === 0 ? { y: curY - 1, q: 3 } : { y: curY, q: curQ - 1 };
        const lqFrom = lq.q * 3 + 1, lqTo = lq.q * 3 + 3;
        fromDate = `${lq.y}-${pad(lqFrom)}-01`;
        toDate   = `${lq.y}-${pad(lqTo)}-${lastDay(lq.y, lqTo)}`;
      } else if (period === 'year') {
        fromDate = `${curY}-01-01`;
        toDate   = `${curY}-12-31`;
      } else if (period === 'custom') {
        fromDate = fromInput;
        toDate   = toInput;
      }
      // 'all' — no filter

      _doExportTaxSummary(period, fromDate, toDate);
      return true;
    }
  });
}

function _doExportTaxSummary(periodLabel, fromDate, toDate) {
  const inPeriod = (dateStr) => {
    if (!fromDate && !toDate) return true;
    if (!dateStr) return false;
    if (fromDate && dateStr < fromDate) return false;
    if (toDate   && dateStr > toDate)   return false;
    return true;
  };

  // Group completed orders by YYYY-MM
  const monthMap = {};
  for (const o of printLog) {
    if (o.status !== 'completed') continue;
    const ds = (o.date || '').slice(0, 10);
    if (!inPeriod(ds)) continue;
    const month = ds.slice(0, 7);
    if (!month) continue;
    if (!monthMap[month]) monthMap[month] = { orders: 0, revenue: 0, vatCollected: 0, shipping: 0 };
    monthMap[month].orders++;
    monthMap[month].revenue += orderRevenueBase(o);
    monthMap[month].shipping += convertToBase(+o.shippingCost || 0, clientCurrency(o.clientId));
    const rate = settings.enableVat ? (+settings.vatRate || 15) : 0;
    monthMap[month].vatCollected += rate > 0 ? orderRevenueBase(o) * rate / (100 + rate) : 0;
  }
  // Group expenses by YYYY-MM
  const expMap = {};
  for (const e of expenses) {
    const ds = (e.date || '').slice(0, 10);
    if (!inPeriod(ds)) continue;
    const month = ds.slice(0, 7);
    if (!month) continue;
    expMap[month] = (expMap[month] || 0) + (+e.amount || 0);
  }

  const allMonths = [...new Set([...Object.keys(monthMap), ...Object.keys(expMap)])].sort();

  if (allMonths.length === 0) {
    toast(t('an.tax_empty'), 'error');
    return;
  }

  // Build period label for filename/header
  const labelMap = {
    month: 'this-month', last_month: 'last-month',
    quarter: 'this-quarter', last_quarter: 'last-quarter',
    year: 'this-year', all: 'all'
  };
  const fileLabel = labelMap[periodLabel] || periodLabel;

  const cur = currencySymbol();
  const headers = [
    `Period: ${fileLabel} ${fromDate ? fromDate + ' to ' + toDate : ''}`,
    `Month`, `Orders`, `Revenue (${cur})`, `Shipping (${cur})`,
    `VAT Collected (${cur})`, `Expenses (${cur})`, `Net Income (${cur})`
  ];
  const headerRow = headers.slice(1).map(csvEsc).join(',');
  const periodRow = [csvEsc(headers[0]), ...new Array(6).fill(csvEsc(''))].join(',');

  const rows = allMonths.map(m => {
    const rev  = monthMap[m]?.revenue  || 0;
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
    new Blob(['﻿' + [periodRow, headerRow, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    `tax-summary-${fileLabel}-${new Date().toISOString().slice(0, 10)}.csv`
  );
  toast(t('an.tax_exported'), 'success');
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
   Feature 8 (new 8-pack): Customer loyalty tiers
   ============================================================ */

/** Get the best matching tier for a client based on their completed order stats */
function getClientTier(clientId) {
  if (!settings.loyaltyEnabled) return null;
  const tiers = (settings.loyaltyTiers || []).filter(tier => tier.name);
  if (tiers.length === 0) return null;

  let completedCount = 0;
  let totalSpend = 0;
  for (const o of printLog) {
    if (o.clientId !== clientId || o.status !== 'completed') continue;
    completedCount++;
    totalSpend += orderRevenueBase(o);
  }

  // Find the highest tier the client qualifies for
  const eligible = tiers.filter(tier =>
    (!tier.minOrders || completedCount >= +tier.minOrders) &&
    (!tier.minSpend  || totalSpend     >= +tier.minSpend)
  );
  if (eligible.length === 0) return null;
  // Return the tier with the highest benefit (largest minOrders/minSpend combo)
  return eligible.sort((a, b) => {
    const orderDiff = (+b.minOrders || 0) - (+a.minOrders || 0);
    if (orderDiff !== 0) return orderDiff;
    return (+b.minSpend || 0) - (+a.minSpend || 0);
  })[0];
}

/** Render the loyalty tier management UI in settings */
function estimateMachineQueueClearDate(machineId, excludeOrderId) {
  const wh = settings.workingHours || { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0, sat: 0, sun: 0 };
  const holidays = settings.holidays || [];
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  // Sum queued print hours for this machine (active/pending orders)
  let queueHours = 0;
  for (const o of printLog) {
    if (o.id === excludeOrderId) continue;
    if (o.status === 'completed' || o.status === 'quote') continue;
    if (o.machineId !== machineId) continue;
    const hrs = +(o.printTime || 0);
    queueHours += hrs;
  }
  if (queueHours <= 0) return new Date();

  // Walk forward through working hours until queue is consumed
  const cursor = new Date();
  cursor.setSeconds(0, 0);
  let remaining = queueHours;
  let safety = 0;
  while (remaining > 0 && safety < 730) { // max 2 years
    safety++;
    const dateStr = cursor.toISOString().split('T')[0];
    if (!holidays.includes(dateStr)) {
      const dayKey = dayKeys[cursor.getDay()];
      const hoursAvail = +(wh[dayKey] || 0);
      if (hoursAvail > 0) {
        remaining -= hoursAvail;
      }
    }
    if (remaining > 0) cursor.setDate(cursor.getDate() + 1);
  }
  return cursor;
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
   Round 12 — Feature 6: Recurring job auto-clone improvements
   (Existing checkRecurringOrders extended with leadDays + template selection)
   ============================================================ */
// (checkRecurringOrders is extended in-place below its existing definition via post-load call)
function patchRecurringOrdersWithLeadDays() {
  // Wrap the existing checkRecurringOrders to also respect leadDays
  // This runs at startup after loadAll() to check for orders due within leadDays
  const today = new Date().toISOString().split('T')[0];
  const INTERVAL_DAYS = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91 };
  let created = 0;

  clients.forEach(client => {
    const rec = client.recurring;
    if (!rec?.enabled || !rec.nextDue) return;
    const leadDays = rec.leadDays || 0;
    const triggerDate = new Date(rec.nextDue + 'T00:00:00');
    triggerDate.setDate(triggerDate.getDate() - leadDays);
    const triggerStr = triggerDate.toISOString().split('T')[0];
    if (triggerStr > today) return;

    // Check if an order was already created for this cycle (any status — prevents duplicate on re-completion)
    const alreadyCreated = printLog.some(o =>
      o.clientId === client.id && o.recurringCycle === rec.nextDue);
    if (alreadyCreated) return;

    // Find template: use specific templateOrderId or last completed order
    const template = rec.templateOrderId
      ? printLog.find(o => o.id === rec.templateOrderId)
      : printLog.find(o => o.clientId === client.id && o.status === 'completed');
    if (!template) return;

    const now = new Date();
    const invoiceNum = nextInvoiceNumber();
    const seq = String(settings.invNumNext - 1).padStart(4, '0');
    const id = `${settings.invPrefix || 'INV'}-${now.getFullYear()}-${seq}`;
    printLog.unshift({
      ...template,
      parts: template.parts ? template.parts.map(p => ({ ...p })) : [],
      id,
      invoiceNum,
      invoiceNumber: invoiceNum,
      date: today,
      timestamp: now.toISOString(),
      status: rec.cloneStatus || 'pending',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      paymentMethod: null,
      paidAt: null,
      printPhotos: [],
      notes: '',
      dueDate: rec.nextDue,
      priority: false,
      materialDeducted: false,
      actualPrintTime: null,
      actualWeight: null,
      quoteSentAt: null,
      quoteExpiresAt: null,
      quoteAcceptedAt: null,
      deliveredAt: null,
      attachedFiles: [],
      comments: [],
      recurringCycle: rec.nextDue,
    });
    created++;

    const days = INTERVAL_DAYS[rec.interval] || 30;
    const next = new Date(rec.nextDue + 'T00:00:00');
    next.setDate(next.getDate() + days);
    rec.nextDue = next.toISOString().split('T')[0];
  });

  if (created > 0) {
    saveAll(); renderKanban(); renderLogs(); renderDashboard();
    toast(t('rec.created', { n: created }), 'success', 4500);
  }
}

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

function getStaleOrders() {
  const thresholds = settings.staleHours || { printing: 48, post: 24, qc: 12, pending: 72 };
  const now = Date.now();
  return printLog.filter(o => {
    if (['completed', 'quote', 'on_hold'].includes(o.status)) return false;
    const threshold = thresholds[o.status];
    if (!threshold) return false;
    // Find the last status change time
    let lastAt = null;
    if (o.statusHistory && o.statusHistory.length > 0) {
      lastAt = o.statusHistory[o.statusHistory.length - 1].at;
    } else if (o.status === 'printing' && o.printingStartedAt) {
      lastAt = o.printingStartedAt;
    } else if (o.date) {
      lastAt = o.date + 'T00:00:00.000Z';
    }
    if (!lastAt) return false;
    const hoursAgo = (now - new Date(lastAt).getTime()) / 3600000;
    return hoursAgo >= threshold;
  }).sort((a, b) => {
    // Most stale first
    const getLastAt = o => {
      if (o.statusHistory?.length) return o.statusHistory[o.statusHistory.length - 1].at;
      return o.printingStartedAt || o.date + 'T00:00:00Z' || '';
    };
    return getLastAt(a).localeCompare(getLastAt(b));
  });
}

/* ============================================================
   Notification Centre
   ============================================================ */
function buildNotifications() {
  const alerts = [];
  const today = new Date(); today.setHours(0,0,0,0);

  const dismissed = settings.dismissedNotifs || {};
  const now = new Date().toISOString();
  function isDismissed(key) {
    const until = dismissed[key];
    if (!until) return false;
    if (until === 'forever') return true;
    return until > now;
  }

  // 1. Overdue orders
  const overdue = printLog.filter(o =>
    o.dueDate && o.status !== 'completed' && o.status !== 'quote' &&
    new Date(o.dueDate + 'T00:00:00') < today
  );
  for (const o of overdue.slice(0, 8)) {
    const key = 'overdue:' + o.id;
    if (!isDismissed(key)) {
      alerts.push({
        key,
        type: 'overdue', icon: '🔴',
        title: escapeHtml(t('notif.overdue') || 'Overdue'),
        body:  escapeHtml(o.project || o.id),
        action() { switchTab('queue-tab'); }
      });
    }
  }
  if (overdue.length > 8) alerts.push({ key: 'overdue:more', type: 'overdue', icon: '🔴', title: '', body: `+${overdue.length - 8} more overdue`, action() { switchTab('queue-tab'); } });

  // 2. Expiring quotes (≤ 2 days)
  const expiringQuotes = printLog
    .filter(o => o.status === 'quote' && o.quoteExpiresAt)
    .filter(o => Math.round((new Date(o.quoteExpiresAt + 'T00:00:00') - today) / 86400000) <= 2)
    .slice(0, 5);
  for (const o of expiringQuotes) {
    const key = 'quote:' + o.id;
    if (!isDismissed(key)) {
      const d = Math.round((new Date(o.quoteExpiresAt + 'T00:00:00') - today) / 86400000);
      alerts.push({
        key,
        type: 'quote', icon: '📋',
        title: escapeHtml(t('notif.quote_expiring') || 'Quote expiring'),
        body:  `${escapeHtml(o.project || o.id)} — ${d <= 0 ? (t('oe.due_overdue', {n: Math.abs(d)}) || 'expired') : d + 'd left'}`,
        action() { switchTab('logs-tab'); }
      });
    }
  }

  // 3. Low stock spools
  const lowSpools = inventory.filter(i =>
    i.weight <= (i.reorderPoint ?? settings.lowStockThreshold ?? 200)
  ).slice(0, 6);
  for (const spool of lowSpools) {
    const key = 'stock:' + spool.id;
    if (!isDismissed(key)) {
      alerts.push({
        key,
        type: 'stock', icon: '🧵',
        title: escapeHtml(t('notif.low_stock') || 'Low stock'),
        body:  `${escapeHtml(spool.material)} — ${Math.round(spool.weight)}g remaining`,
        action() { switchTab('inventory-tab'); }
      });
    }
  }

  // 4. Machines due for service
  for (const m of machines) {
    const svc = machineServiceStatus(m);
    if (svc.due || svc.warning) {
      const key = 'service:' + m.id;
      if (!isDismissed(key)) {
        alerts.push({
          key,
          type: 'service', icon: '🔧',
          title: escapeHtml(svc.due ? (t('notif.service_due') || 'Service due') : (t('notif.service_soon') || 'Service soon')),
          body:  escapeHtml(m.name),
          action() { switchTab('settings-tab'); }
        });
      }
    }
  }

  // 5. Stale orders (uses existing helper)
  const stale = typeof getStaleOrders === 'function' ? getStaleOrders().slice(0, 5) : [];
  for (const o of stale) {
    const key = 'stale:' + o.id;
    if (!isDismissed(key)) {
      alerts.push({
        key,
        type: 'stale', icon: '⚠️',
        title: escapeHtml(t('notif.stale_order') || 'Order stalled'),
        body:  `${escapeHtml(o.project || o.id)} — ${escapeHtml(t('queue.' + o.status) || o.status)}`,
        action() { switchTab('queue-tab'); }
      });
    }
  }

  // 6. Consumables low stock
  const lowCons = consumables.filter(c => c.minStock > 0 && c.stock <= c.minStock).slice(0, 4);
  for (const c of lowCons) {
    const key = 'cons:' + (c.id || c.name);
    if (!isDismissed(key)) {
      alerts.push({
        key,
        type: 'stock', icon: '📦',
        title: escapeHtml(t('notif.low_consumable') || 'Low consumable'),
        body:  `${escapeHtml(c.name)} — ${c.stock} ${escapeHtml(c.unit || '')}`,
        action() { switchTab('inventory-tab'); }
      });
    }
  }

  // 7. Recurring order reminders
  clients.filter(c => c.recurring?.enabled && c.recurring?.intervalDays).forEach(c => {
    const lastOrder = printLog.filter(o => o.clientId === c.id)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (!lastOrder) return;
    const daysSince = Math.floor((Date.now() - new Date(lastOrder.date).getTime()) / 86400000);
    const due = daysSince >= c.recurring.intervalDays;
    if (!due) return;
    const key = 'recurring:' + c.id;
    if (isDismissed(key)) return;
    alerts.push({
      key,
      type: 'recurring',
      icon: '🔄',
      title: escapeHtml(t('notif.group_recurring') || 'Recurring Orders'),
      body: escapeHtml(t('notif.recurring_due', { name: localName(c), days: daysSince })),
      dismissKey: key,
      clientId: c.id,
      action() { logClientFilter = c.id; switchTab('queue-tab'); logPrint && logPrint(); }
    });
  });

  return alerts;
}

function updateNotifBadge() {
  const badge = $('#notifBadge');
  if (!badge) return;
  const count = buildNotifications().length;
  if (count === 0) {
    badge.style.display = 'none';
  } else {
    badge.style.display = '';
    badge.textContent = count > 99 ? '99+' : String(count);
  }
}

function openNotifPanel() {
  const panel = $('#notifPanel');
  if (!panel) return;
  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    return;
  }

  const alerts = buildNotifications();

  if (alerts.length === 0) {
    panel.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--text-muted);font-size:13px;">
      ✅ ${escapeHtml(t('notif.all_clear') || 'All clear — no active alerts')}
    </div>`;
    panel.style.display = 'block';
    return;
  }

  // Group by type
  const groups = [
    { key: 'overdue',    label: t('notif.group_overdue')    || 'Overdue Orders' },
    { key: 'quote',      label: t('notif.group_quotes')     || 'Expiring Quotes' },
    { key: 'stock',      label: t('notif.group_stock')      || 'Low Stock' },
    { key: 'service',    label: t('notif.group_service')    || 'Machine Service' },
    { key: 'recurring',  label: t('notif.group_recurring')  || 'Recurring Orders' },
    { key: 'stale',   label: t('notif.group_stale')   || 'Stalled Orders' },
  ];

  let html = `<div style="padding:10px 14px 6px;font-size:13px;font-weight:700;border-bottom:1px solid var(--border-soft);">
    🔔 ${escapeHtml(t('notif.title') || 'Notifications')}
    <span style="float:right;font-size:11px;font-weight:400;color:var(--text-muted);">${alerts.length} alert${alerts.length !== 1 ? 's' : ''}</span>
  </div>`;

  for (const g of groups) {
    const items = alerts.filter(a => a.type === g.key);
    if (items.length === 0) continue;
    html += `<div style="padding:6px 14px 2px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);">${escapeHtml(g.label)}</div>`;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const newOrderBtn = item.type === 'recurring' && item.clientId
        ? `<button type="button" class="btn small ghost notif-new-order-btn" data-client="${escapeHtml(item.clientId)}" style="font-size:11px;padding:2px 6px;margin-inline-end:4px;">${escapeHtml(t('common.new_order') || 'New Order')}</button>`
        : '';
      html += `<div class="notif-row" data-notif-idx="${alerts.indexOf(item)}"
        style="display:flex;align-items:flex-start;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border-soft);transition:background .1s;">
        <span style="font-size:15px;flex-shrink:0;margin-top:1px;">${escapeHtml(String(item.icon || ''))}</span>
        <div style="flex:1;overflow:hidden;">
          ${item.title ? `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;">${escapeHtml(item.title)}</div>` : ''}
          <div style="font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.body)}</div>
        </div>
        ${newOrderBtn}
        ${item.key ? `<button type="button" class="btn small ghost notif-dismiss-btn" data-key="${escapeHtml(item.key)}" title="${escapeHtml(t('notif.dismiss') || 'Snooze until tomorrow')}" style="font-size:11px;padding:2px 6px;margin-inline-end:4px;">✕</button>` : ''}
        <span style="font-size:11px;color:var(--primary);flex-shrink:0;padding-top:2px;">${escapeHtml(t('notif.go') || 'Go →')}</span>
      </div>`;
    }
  }

  html += `<div style="padding:8px 14px;border-top:1px solid var(--border-soft);text-align:center;">
    <button class="btn small ghost" id="notifDismissAll">${escapeHtml(t('notif.dismiss_all') || 'Snooze all for today')}</button>
  </div>`;

  panel.innerHTML = html;
  panel.style.display = 'block';

  // Attach click handlers
  panel.querySelectorAll('.notif-row').forEach(row => {
    const idx = parseInt(row.dataset.notifIdx, 10);
    row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-elev)');
    row.addEventListener('mouseleave', () => row.style.background = '');
    row.addEventListener('click', () => {
      panel.style.display = 'none';
      if (alerts[idx]) alerts[idx].action();
    });
  });

  panel.querySelectorAll('.notif-new-order-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.style.display = 'none';
      logClientFilter = btn.dataset.client || '';
      switchTab('calculator-tab');
    });
  });

  panel.querySelectorAll('.notif-dismiss-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.key;
      if (!settings.dismissedNotifs) settings.dismissedNotifs = {};
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      settings.dismissedNotifs[key] = tomorrow.toISOString();
      saveAll();
      updateNotifBadge();
      openNotifPanel();
    });
  });

  panel.querySelector('#notifDismissAll')?.addEventListener('click', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    const exp = tomorrow.toISOString();
    if (!settings.dismissedNotifs) settings.dismissedNotifs = {};
    alerts.forEach(a => { if (a.key) settings.dismissedNotifs[a.key] = exp; });
    saveAll();
    updateNotifBadge();
    panel.style.display = 'none';
  });
}


/* Dashboard — renderer/dashboard.js */

/* ============================================================
   Product pricing tier chips (calculator)
   ============================================================ */

/* Analytics tab — renderer/analytics.js */
function updateTabBadges() {
  // Queue tab: count all active (non-completed, non-quote) orders
  const activeCount = printLog.filter(o => o.status !== 'completed' && o.status !== 'quote').length;
  const queueTabBtn = document.querySelector('.tab-btn[data-tab="queue-tab"]');
  if (queueTabBtn) {
    let badge = queueTabBtn.querySelector('.tab-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.style.cssText = 'display:inline-block;min-width:16px;padding:0 4px;height:16px;line-height:16px;border-radius:8px;font-size:10px;font-weight:700;background:var(--primary);color:#fff;margin-inline-start:4px;text-align:center;vertical-align:middle;';
      queueTabBtn.appendChild(badge);
    }
    badge.textContent = activeCount > 0 ? String(activeCount) : '';
    badge.style.display = activeCount > 0 ? 'inline-block' : 'none';
  }
  // Overdue orders badge on logs tab
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdueCount = printLog.filter(o => o.dueDate && o.status !== 'completed' && new Date(o.dueDate + 'T00:00:00') < today).length;
  const logsTabBtn = document.querySelector('.tab-btn[data-tab="logs-tab"]');
  if (logsTabBtn) {
    let badge = logsTabBtn.querySelector('.tab-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.style.cssText = 'display:inline-block;min-width:16px;padding:0 4px;height:16px;line-height:16px;border-radius:8px;font-size:10px;font-weight:700;background:var(--danger);color:#fff;margin-inline-start:4px;text-align:center;vertical-align:middle;';
      logsTabBtn.appendChild(badge);
    }
    badge.textContent = overdueCount > 0 ? String(overdueCount) : '';
    badge.style.display = overdueCount > 0 ? 'inline-block' : 'none';
  }
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

  // Expiring quotes (≤ 1 day remaining, not yet reminded this session)
  if (!checkDueDateNotifications._quotesReminded) checkDueDateNotifications._quotesReminded = new Set();
  const expiringQuotes = printLog.filter(o => {
    if (o.status !== 'quote' || !o.quoteExpiresAt) return false;
    const daysLeft = Math.round((new Date(o.quoteExpiresAt + 'T00:00:00') - today) / 86400000);
    return daysLeft <= 1;
  });
  for (const q of expiringQuotes) {
    if (checkDueDateNotifications._quotesReminded.has(q.id)) continue;
    checkDueDateNotifications._quotesReminded.add(q.id);
    const daysLeft = Math.round((new Date(q.quoteExpiresAt + 'T00:00:00') - today) / 86400000);
    const msg = daysLeft < 0
      ? `Quote ${q.id} for "${q.project}" expired ${Math.abs(daysLeft)} day(s) ago`
      : `Quote ${q.id} for "${q.project}" expires ${daysLeft === 0 ? 'today' : 'tomorrow'}`;
    toast(msg, 'warning', 6000);
  }
}


function exportClientsCsv() {
  // Build stats map (same as renderClients uses)
  const clientStatsMap = new Map();
  for (const o of printLog) {
    if (!o.clientId) continue;
    let s = clientStatsMap.get(o.clientId);
    if (!s) { s = { count: 0, revenue: 0, lastDate: null }; clientStatsMap.set(o.clientId, s); }
    s.count++;
    if (o.status === 'completed') s.revenue += orderRevenueBase(o);
    if (!s.lastDate || o.date > s.lastDate) s.lastDate = o.date;
  }

  const headers = [
    'ID', 'Name (EN)', 'Name (AR)', 'Phone', 'Email',
    'Source', 'Total Orders', `Revenue (${currencySymbol()})`,
    `Outstanding (${currencySymbol()})`, 'Last Order'
  ];

  const lines = [
    headers.map(csvEsc).join(','),
    ...clients.map(c => {
      const stats = clientStatsMap.get(c.id) || { count: 0, revenue: 0, lastDate: null };
      const outstanding = clientOutstandingBalance(c.id);
      return [
        c.id,
        c.nameEn || '',
        c.nameAr || '',
        c.phone  || '',
        c.email  || '',
        c.source || '',
        stats.count,
        stats.revenue.toFixed(2),
        outstanding.toFixed(2),
        stats.lastDate || ''
      ].map(csvEsc).join(',');
    })
  ];

  downloadBlob(
    new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    `clients-${new Date().toISOString().slice(0, 10)}.csv`
  );
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
          <button type="button" class="btn primary" data-act="open-settings-from-modal">${escapeHtml(t('nav.settings') || 'Go to Settings')}</button>
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
   Feature 4 (this batch): AP — supplier invoice recording
   ============================================================ */

/* ============================================================
   Feature 6 (this batch): Client portal export
   ============================================================ */
function exportClientPortal(clientId) {
  const c = clients.find(x => x.id === clientId);
  if (!c) return;
  const displayName = localName(c);
  const orders = printLog.filter(o => o.clientId === clientId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const activeOrders = orders.filter(o => !['completed','quote'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'completed');
  const outstanding = orders
    .filter(o => payStatus(o) !== 'paid')
    .reduce((s, o) => s + orderOwedBase(o), 0);

  const statusColors = {
    pending: '#f59e0b', printing: '#3b82f6', post: '#8b5cf6',
    qc: '#a78bfa', completed: '#22c55e', on_hold: '#f97316', quote: '#94a3b8'
  };
  const statusSteps = ['pending','printing','post','qc','completed'];

  const stepperHtml = (order) => {
    const si = statusSteps.indexOf(order.status);
    return `<div style="display:flex;gap:4px;align-items:center;margin-top:6px;font-size:10px;">
      ${statusSteps.map((st, i) => {
        const done = i < si;
        const cur  = i === si;
        const col  = cur ? (statusColors[st] || '#94a3b8') : (done ? '#22c55e' : '#374151');
        return `<span style="background:${col};color:#fff;padding:2px 7px;border-radius:4px;opacity:${cur?1:done?0.7:0.35};">${escapeHtml(st)}</span>${i < statusSteps.length-1 ? `<span style="color:#555;font-size:9px;">›</span>` : ''}`;
      }).join('')}
    </div>`;
  };

  const bizName = (settings.bizEn || settings.bizAr || 'Khayt');
  const portalIsAr = i18n.current === 'ar';
  const portalLang = portalIsAr ? 'ar' : 'en';
  const PL = {
    activeOrders:      portalIsAr ? 'طلبات نشطة'   : 'Active orders',
    completed:         portalIsAr ? 'مكتملة'        : 'Completed',
    outstandingBal:    portalIsAr ? 'الرصيد المستحق': 'Outstanding balance',
    date:              portalIsAr ? 'التاريخ'       : 'Date',
    project:           portalIsAr ? 'المشروع'       : 'Project',
    status:            portalIsAr ? 'الحالة'        : 'Status',
    amount:            portalIsAr ? 'المبلغ'        : 'Amount',
    payment:           portalIsAr ? 'الدفع'         : 'Payment',
    paid:              portalIsAr ? '✓ مدفوع'      : '✓ Paid',
    outstanding:       portalIsAr ? 'مستحق'         : 'Outstanding',
    paymentInfo:       portalIsAr ? 'معلومات الدفع' : 'Payment Information',
    orderPortal:       portalIsAr ? 'بوابة الطلبات' : 'Order portal for',
    generatedBy:       portalIsAr ? 'أُنشئ بواسطة Khayt' : 'Generated by Khayt',
  };
  const rowsHtml = orders.map(o => {
    const isPaid = payStatus(o) === 'paid';
    return `<tr style="border-bottom:1px solid #2a2a2a;">
      <td style="padding:8px;font-size:12px;white-space:nowrap;color:#888;">${escapeHtml(o.date || '')}</td>
      <td style="padding:8px;font-size:12px;"><strong style="color:#e2e8f0;">${escapeHtml(o.project || o.id)}</strong><div style="font-size:10px;color:#666;">${escapeHtml(o.id)}</div>
        ${!['completed','quote'].includes(o.status) ? stepperHtml(o) : ''}
      </td>
      <td style="padding:8px;"><span style="background:${statusColors[o.status]||'#555'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">${escapeHtml(o.status)}</span></td>
      <td style="padding:8px;text-align:right;font-weight:600;color:#4ade80;">${fmtPrice(o.price)}</td>
      <td style="padding:8px;text-align:center;font-size:11px;color:${isPaid?'#4ade80':'#f87171'};">${isPaid ? PL.paid : PL.outstanding}</td>
    </tr>`;
  }).join('');

  const paymentBlock = settings.paymentInstructions
    ? `<div style="margin-top:24px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #2a2a3e;">
        <h3 style="margin:0 0 8px;color:#94a3b8;font-size:13px;">${escapeHtml(PL.paymentInfo)}</h3>
        <p style="margin:0;color:#cbd5e1;font-size:13px;white-space:pre-line;">${escapeHtml(settings.paymentInstructions)}</p>
      </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="${portalLang}" dir="${portalIsAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(displayName)} — Client Portal — ${escapeHtml(bizName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0f0f0f; color:#e2e8f0; margin:0; padding:20px; }
    .header { background:linear-gradient(135deg,#1e1e3f,#2d2d5a); padding:24px 28px; border-radius:12px; margin-bottom:20px; }
    h1 { margin:0 0 4px; font-size:1.4rem; color:#a78bfa; }
    .subtitle { color:#94a3b8; font-size:13px; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom:20px; }
    .stat-card { background:#1a1a2e; border:1px solid #2a2a3e; border-radius:8px; padding:14px 16px; }
    .stat-val { font-size:1.5rem; font-weight:700; color:#a78bfa; }
    .stat-lbl { font-size:11px; color:#64748b; margin-top:2px; }
    table { width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden; }
    th { padding:10px 8px; text-align:left; font-size:11px; color:#64748b; border-bottom:1px solid #2a2a2a; }
    @media(max-width:600px){ td,th { padding:6px 4px; font-size:11px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(bizName)}</h1>
    <div class="subtitle">${escapeHtml(PL.orderPortal)} ${escapeHtml(displayName)}</div>
  </div>
  <div class="stats">
    <div class="stat-card"><div class="stat-val">${activeOrders.length}</div><div class="stat-lbl">${escapeHtml(PL.activeOrders)}</div></div>
    <div class="stat-card"><div class="stat-val">${completedOrders.length}</div><div class="stat-lbl">${escapeHtml(PL.completed)}</div></div>
    <div class="stat-card"><div class="stat-val">${fmtPrice(outstanding)}</div><div class="stat-lbl">${escapeHtml(PL.outstandingBal)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>${escapeHtml(PL.date)}</th><th>${escapeHtml(PL.project)}</th><th>${escapeHtml(PL.status)}</th><th style="text-align:right;">${escapeHtml(PL.amount)}</th><th style="text-align:center;">${escapeHtml(PL.payment)}</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  ${paymentBlock}
  <p style="text-align:center;color:#374151;font-size:11px;margin-top:24px;">${escapeHtml(PL.generatedBy)} · ${new Date().toISOString().split('T')[0]}</p>
</body>
</html>`;

  if (window.hubAPI?.saveHtml) {
    window.hubAPI.saveHtml(html, `client-portal-${c.id}.html`).then(() => {
      toast(t('cl.portal_saved'), 'success');
    }).catch(() => {
      toast(t('cl.portal_saved'), 'info');
    });
  } else {
    const blob = new Blob([html], { type: 'text/html' });
    downloadBlob(blob, `client-portal-${c.id}.html`);
    toast(t('cl.portal_saved'), 'info');
  }
}


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
        <button type="button" class="btn small ghost" data-act="edit-slicer-profile" data-id="${escapeHtml(p.id)}">Edit</button>
        <button type="button" class="btn danger small" data-act="delete-slicer-profile" data-id="${escapeHtml(p.id)}">×</button>
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


// Note: getCarrierTrackingUrl() is already defined earlier in this file.
