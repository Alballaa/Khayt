/**
 * Shared order/client helpers, tags, priorities, date filters, CSV import, locale.
 */
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

/** True when moving orderId into newStatus would meet or exceed the configured WIP limit. */
function wouldExceedWipLimit(orders, orderId, newStatus, wipLimits) {
  if (!newStatus || newStatus === 'completed' || newStatus === 'delivered' || newStatus === 'quote') return false;
  const limit = (wipLimits || {})[newStatus] || 0;
  if (limit <= 0) return false;
  const colCount = (orders || []).filter(o => o.id !== orderId && o.status === newStatus).length;
  return colCount >= limit;
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








(function (global) {
  const api = {
    localName,
    payStatus,
    csvEsc,
    downloadBlob,
    parseTags,
    renderTagChips,
    getAllTags,
    getPriorityLevel,
    prioritySortValue,
    priorityBadgeHtml,
    formatDueDateBadge,
    openCsvImportModal,
    safeBizLogo,
    inRange,
    availableHoursUntil,
    avgDailyWorkingHours,
    machineDowntimeHoursInRange,
    clientOutstandingBalance,
    wouldExceedWipLimit,
    toArabicNumerals,
    hijriDate,
  };
  Object.assign(global, api);
  global.KhaytAppHelpers = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ...api, customRangeFrom, customRangeTo, DAY_KEYS };
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
