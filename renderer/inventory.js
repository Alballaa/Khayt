/**
 * Inventory tab, product catalog, purchase orders, NFC spool import.
 */
let catalogSearchTerm = '';
let invSearchTerm = '';
let supplierSearchTerm = '';
let poSearchTerm = '';
let poStatusFilter = '';
let poDisplayLimit = 50;        // pagination: rows shown in PO table
let _lastPoFilterHash = '';     // detects filter changes to reset PO page
// Filament manufacturer catalog (loaded from filaments-db.json)
let filamentsDB = [];
if (typeof fetch === 'function' && typeof document !== 'undefined') {
  fetch('./filaments-db.json').then(r => r.json()).then(data => { filamentsDB = data; }).catch(e => {
    console.warn('filaments-db.json not loaded:', e);
    filamentsDB = null;
    const catalogEl = document.getElementById('filamentCatalog') || document.getElementById('filamentDbSection');
    if (catalogEl) catalogEl.innerHTML = `<p style="color:var(--text-muted);padding:12px;font-size:13px;">⚠ ${escapeHtml(t('inv.catalog_unavailable') || 'Filament catalog unavailable')}</p>`;
  });
}

(function (global) {
/* ============================================================
   CSV import — Spools / Inventory
   ============================================================ */
function importSpoolsCsv() {
  openCsvImportModal({
    title: t('csv.import_spools') || 'Import Spools from CSV',
    fields: [
      { key: 'material',        label: t('inv.material')        || 'Material',            required: true },
      { key: 'brand',           label: t('inv.brand')           || 'Brand' },
      { key: 'color',           label: t('inv.color')           || 'Color' },
      { key: 'lot',             label: t('inv.lot')             || 'Lot / Batch' },
      { key: 'diameter',        label: t('inv.diameter')        || 'Diameter (mm)',        type: 'number' },
      { key: 'weightTotal',     label: t('inv.weight_total')    || 'Total Weight (g)',     type: 'number' },
      { key: 'weightRemaining', label: t('inv.remaining')       || 'Remaining (g)',        type: 'number' },
      { key: 'costPerKg',       label: t('inv.cost_per_kg')     || 'Cost/kg',              type: 'number' },
      { key: 'reorderPoint',    label: t('inv.reorder_point')   || 'Reorder Point (g)',    type: 'number' },
      { key: 'location',        label: t('inv.location')        || 'Location' },
      { key: 'notes',           label: t('common.notes')        || 'Notes' },
    ],
    onImport: (rows) => {
      let imported = 0, skipped = 0;
      rows.forEach(row => {
        const exists = (inventory || []).some(s =>
          s.material?.toLowerCase() === row.material?.toLowerCase() &&
          s.brand?.toLowerCase() === (row.brand || '').toLowerCase() &&
          s.color?.toLowerCase() === (row.color || '').toLowerCase()
        );
        if (exists) { skipped++; return; }
        const wt = row.weightTotal || 1000;
        inventory.push({
          id: uid('S'),
          material: row.material,
          brand: row.brand || '',
          color: row.color || '',
          lot: row.lot || undefined,
          diameter: row.diameter || 1.75,
          weight: row.weightRemaining != null ? row.weightRemaining : wt,
          weightTotal: wt,
          cost: row.costPerKg || 0,
          reorderPoint: row.reorderPoint ?? (settings.lowStockThreshold ?? 200),
          location: row.location || '',
          notes: row.notes || '',
          addedAt: localDateStr(),
          usageHistory: [],
        });
        imported++;
      });
      saveAll();
      renderInventory();
      return { imported, skipped };
    }
  });
}

/* ============================================================
   CSV import — Clients
   ============================================================ */
function importClientsCsv() {
  openCsvImportModal({
    title: t('csv.import_clients') || 'Import Clients from CSV',
    fields: [
      { key: 'nameEn',    label: t('cl.name_en')   || 'Name (English)',  required: true },
      { key: 'nameAr',    label: t('cl.name_ar')   || 'Name (Arabic)' },
      { key: 'phone',     label: t('cl.phone')     || 'Phone' },
      { key: 'email',     label: t('cl.email')     || 'Email' },
      { key: 'city',      label: t('cl.city')      || 'City' },
      { key: 'address',   label: t('cl.address')   || 'Address' },
      { key: 'vatNumber', label: t('cl.vat')       || 'VAT Number' },
      { key: 'company',   label: t('cl.company')   || 'Company' },
      { key: 'notes',     label: t('common.notes') || 'Notes' },
    ],
    onImport: (rows) => {
      let imported = 0, skipped = 0;
      rows.forEach(row => {
        const exists = (clients || []).some(c =>
          (c.nameEn?.toLowerCase() === row.nameEn?.toLowerCase()) ||
          (row.phone && c.phone === row.phone) ||
          (row.email && c.email?.toLowerCase() === row.email?.toLowerCase())
        );
        if (exists) { skipped++; return; }
        clients.push({
          id: uid('CL'),
          nameEn: row.nameEn,
          nameAr: row.nameAr || '',
          phone: row.phone || '',
          email: row.email || '',
          city: row.city || '',
          address: row.address || '',
          vat: row.vatNumber || '',
          company: row.company || '',
          notes: row.notes || '',
          createdAt: localDateStr(),
          commLog: [],
          loyaltyTier: 'standard',
        });
        imported++;
      });
      saveAll();
      renderClients();
      return { imported, skipped };
    }
  });
}

/* ============================================================
   CSV import — Products / Catalog
   ============================================================ */
function importProductsCsv() {
  openCsvImportModal({
    title: t('csv.import_products') || 'Import Products from CSV',
    fields: [
      { key: 'nameEn',        label: t('pe.name_en')     || 'Name (English)',   required: true },
      { key: 'nameAr',        label: t('pe.name_ar')     || 'Name (Arabic)' },
      { key: 'description',   label: t('pe.description') || 'Description' },
      { key: 'defaultMargin', label: t('pe.default_margin') || 'Default Margin (%)', type: 'number' },
      { key: 'sku',           label: t('cat.sku')        || 'SKU' },
    ],
    onImport: (rows) => {
      let imported = 0, skipped = 0;
      rows.forEach(row => {
        const exists = (products || []).some(p =>
          (p.nameEn?.toLowerCase() === row.nameEn?.toLowerCase()) ||
          (row.sku && p.sku === row.sku)
        );
        if (exists) { skipped++; return; }
        products.push({
          id: uid('PROD'),
          nameEn: row.nameEn,
          nameAr: row.nameAr || '',
          description: row.description || '',
          defaultMargin: row.defaultMargin || 30,
          sku: row.sku || '',
          thumbnail: null,
          imagePath: null,
          priceTiers: [],
          parts: [],
          createdAt: localDateStr(),
        });
        imported++;
      });
      saveAll();
      renderCatalog();
      return { imported, skipped };
    }
  });
}


/* ============================================================
   Inventory
   ============================================================ */

function openFilamentCatalog() {
  if (filamentsDB === null) { toast(t('inv.catalog_unavailable') || 'Filament catalog unavailable', 'error'); return; }
  if (!filamentsDB || !filamentsDB.length) { toast(t('inv.catalog_loading') || 'Catalog not ready yet', 'error'); return; }

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
              const scored = (filamentsDB || []).map(f => ({ ...f, _score: scoreFil(f, parsed) })).filter(f => f._score > 0).sort((a,b) => b._score - a._score);
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
  const invMaterialType = $('#invMaterialType')?.value || 'fdm';
  const lot = ($('#invLot')?.value || '').trim() || undefined;
  inventory.push({ id: uid('INV'), material, cost, weight, color, purchasedAt: today, materialType: invMaterialType, lot });
  saveAll();
  renderInventory();
  $('#invMaterial').value = '';
  if ($('#invLot')) $('#invLot').value = '';
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

  const existingColours = (settings.filamentColours || {})[item.material] || [];

  const bodyHtml = `
    <div class="inline-pair" style="align-items:end;">
      <div>
        <label>${escapeHtml(t('inv.material'))}</label>
        <input type="text" id="ieMatInput" value="${escapeHtml(item.material)}" placeholder="${escapeHtml(t('inv.material_ph'))}">
      </div>
      <div>
        <label>${escapeHtml(t('inv.material_type'))}</label>
        <select id="ieMaterialType">
          <option value="fdm"${(item.materialType || 'fdm') === 'fdm' ? ' selected' : ''}>${escapeHtml(t('inv.type_fdm'))}</option>
          <option value="resin"${item.materialType === 'resin' ? ' selected' : ''}>${escapeHtml(t('inv.type_resin'))}</option>
          <option value="other"${item.materialType === 'other' ? ' selected' : ''}>${escapeHtml(t('inv.type_other'))}</option>
        </select>
      </div>
    </div>
    <div class="inline-pair" style="align-items:end; margin-top:14px;">
      <div>
        <label>${escapeHtml(t('inv.colour_variant'))}</label>
        <input type="text" id="ieColourInput" list="ieColourDL" value="${escapeHtml(item.colourVariant || '')}" placeholder="${escapeHtml(t('inv.colour_variant_ph'))}">
        <datalist id="ieColourDL">${existingColours.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
      </div>
      <div>
        <label>${escapeHtml(t('inv.color'))}</label>
        <input type="color" id="ieColorInput" value="${escapeHtml(item.color || '#888888')}" style="width:100%; height:38px; padding:3px 4px; border-radius:var(--radius-sm); border:1px solid var(--border); cursor:pointer; background:var(--bg-elev);">
      </div>
    </div>
    <label style="margin-top:14px;" id="ieCostLabel">${escapeHtml(t('inv.cost'))}</label>
    <input type="number" id="ieCostInput" value="${item.cost}" min="0" step="0.01">
    <label style="margin-top:14px;" id="ieWeightLabel">${escapeHtml(t(item.materialType === 'resin' ? 'inv.volume_ml' : 'inv.remaining'))}</label>
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
    <div style="margin-top:14px;">
      <label style="margin-top:0;">${escapeHtml(t('inv.lot') || 'Lot / Batch')}</label>
      <input type="text" id="ieLot" value="${escapeHtml(item.lot || '')}" placeholder="${escapeHtml(t('inv.lot_ph') || 'e.g. 2024-Q1-A')}">
    </div>
    <div class="inline-pair" style="margin-top:14px;">
      <div>
        <label style="margin-top:0;">${escapeHtml(t('inv.reorder_point'))}</label>
        <input type="number" id="ieReorderPoint" value="${item.reorderPoint ?? 200}" min="0" step="1" placeholder="200">
      </div>
      <div>
        <label style="margin-top:0;">${escapeHtml(t('inv.reorder_qty'))}</label>
        <input type="number" id="ieReorderQty" value="${item.reorderQty ?? 1000}" min="0" step="1" placeholder="1000">
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
      // Feature 7: Material type
      item.materialType = document.getElementById('ieMaterialType')?.value || 'fdm';
      // Feature 5: Colour variant — save to item and to settings.filamentColours library
      const colourVariant = (document.getElementById('ieColourInput')?.value || '').trim();
      item.colourVariant = colourVariant || undefined;
      if (colourVariant) {
        if (!settings.filamentColours) settings.filamentColours = {};
        if (!settings.filamentColours[material]) settings.filamentColours[material] = [];
        if (!settings.filamentColours[material].includes(colourVariant)) {
          settings.filamentColours[material].push(colourVariant);
        }
      }
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
      item.lot         = (document.getElementById('ieLot')?.value || '').trim() || undefined;
      // Feature 4: Print settings
      const pt = num(document.getElementById('iePrintTemp').value, 0);
      const bt = num(document.getElementById('ieBedTemp').value, 0);
      const ms = num(document.getElementById('ieMaxSpeed').value, 0);
      item.printTemp = pt > 0 ? pt : undefined;
      item.bedTemp   = bt > 0 ? bt : undefined;
      item.maxSpeed  = ms > 0 ? ms : undefined;
      // New Feature 5: Per-spool reorder thresholds
      const rp = num(document.getElementById('ieReorderPoint')?.value, 200);
      const rq = num(document.getElementById('ieReorderQty')?.value, 1000);
      item.reorderPoint = rp >= 0 ? rp : 200;
      item.reorderQty   = rq >= 0 ? rq : 1000;
      saveAll();
      renderInventory();
      toast(t('inv.updated'), 'success');
      return true;
    }
  });
}

/* New Feature 6: Price history modal */
function openPriceHistory(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const history = (item.priceHistory || []).slice().reverse(); // newest first
  if (history.length === 0) {
    toast(t('inv.price_hist_empty'), 'info');
    return;
  }
  const rows = history.map((h, i) => {
    const prev = history[i + 1];
    let changePct = '';
    if (prev && prev.cost > 0) {
      const diff = ((h.cost - prev.cost) / prev.cost * 100).toFixed(1);
      const arrow = +diff > 0 ? '▲' : (+diff < 0 ? '▼' : '—');
      const color = +diff > 0 ? 'var(--danger)' : (+diff < 0 ? 'var(--success)' : 'var(--text-muted)');
      changePct = `<span style="color:${color}; font-weight:600;">${arrow} ${Math.abs(+diff)}%</span>`;
    }
    return `<tr>
      <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(h.date || '')}</td>
      <td style="font-weight:600;">${fmtPrice(h.cost)}</td>
      <td>${changePct}</td>
    </tr>`;
  });
  // Add current cost as the most recent entry
  const currentRow = `<tr style="background:rgba(91,156,240,0.08);">
    <td style="font-size:12px; color:var(--primary); font-weight:600;">${escapeHtml(t('inv.current_stock'))}</td>
    <td style="font-weight:700; color:var(--primary);">${fmtPrice(item.cost)}</td>
    <td></td>
  </tr>`;

  openFormModal({
    title: `${t('inv.price_history')} — ${escapeHtml(item.material)}`,
    noSave: true,
    bodyHtml: `
      <div class="table-wrap">
        <table class="price-history-table">
          <thead><tr>
            <th>${escapeHtml(t('common.date'))}</th>
            <th>${escapeHtml(t('inv.cost'))}</th>
            <th>${escapeHtml(t('inv.price_change'))}</th>
          </tr></thead>
          <tbody>${currentRow}${rows.join('')}</tbody>
        </table>
      </div>`,
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

// Helper: return YYYY-MM-DD string n days from now
function todayPlusDays(n) {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// Feature 3: Check if saving parts would over-commit any spool
function checkSpoolOvercommit(parts, excludeOrderId) {
  const warnings = [];
  for (const part of (parts || [])) {
    if (!part.spoolId) continue;
    const item = inventory.find(i => i.id === part.spoolId);
    if (!item) continue;
    // Compute already-reserved excluding the order being edited
    const alreadyReserved = printLog
      .filter(o => o.status !== 'completed' && o.status !== 'quote' && o.id !== excludeOrderId)
      .reduce((s, o) =>
        s + (o.parts || [])
          .filter(p => p.spoolId === part.spoolId)
          .reduce((ps, p) => ps + (+p.weight || +p.printWeight || 0), 0)
      , 0);
    const thisJobNeeds = +(part.weight || part.printWeight || 0);
    if (alreadyReserved + thisJobNeeds > item.weight) {
      warnings.push({
        spoolName: item.material,
        available: Math.max(0, item.weight - alreadyReserved),
        needed: thisJobNeeds,
      });
    }
  }
  return warnings;
}

/* ── Pipeline material demand ───────────────────────────── */
function renderPipelineDemand() {
  const el = $('#pipelineDemand');
  if (!el) return;

  const activeOrders = printLog.filter(o => o.status !== 'completed' && o.status !== 'quote' && !o.archived);
  if (activeOrders.length === 0) {
    el.innerHTML = '';
    return;
  }

  // Aggregate by material + colour
  const demand = {};
  for (const o of activeOrders) {
    for (const p of (o.parts || [])) {
      const mat = p.material || p.filament || '';
      const col = p.colour || p.color || '';
      const key = mat ? (col ? `${mat} / ${col}` : mat) : (col || t('inv.unknown_material') || 'Unknown');
      const grams = +(p.printWeight || p.weight || 0);
      if (!demand[key]) demand[key] = { grams: 0, count: 0, mat, col };
      demand[key].grams += grams;
      demand[key].count++;
    }
  }

  const entries = Object.entries(demand)
    .filter(([, d]) => d.grams > 0)
    .sort((a, b) => b[1].grams - a[1].grams);

  if (entries.length === 0) {
    el.innerHTML = '';
    return;
  }

  const rows = entries.map(([key, d]) => {
    // Check if we have enough stock
    const totalStock = inventory
      .filter(spool => {
        const spoolMat = spool.material || spool.filament || '';
        const spoolCol = spool.colour || spool.color || '';
        return spoolMat.toLowerCase() === d.mat.toLowerCase() &&
               (!d.col || spoolCol.toLowerCase() === d.col.toLowerCase());
      })
      .reduce((s, spool) => s + (+spool.remaining || +spool.weight || 0), 0);
    const deficit = totalStock - d.grams;
    const color = deficit >= 0 ? 'var(--success)' : 'var(--danger)';
    const icon  = deficit >= 0 ? '✅' : '⚠';
    return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:13px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <span style="font-size:12.5px;font-weight:500;">${escapeHtml(key)}</span>
      </div>
      <div style="font-size:12px;text-align:end;white-space:nowrap;">
        <span style="color:var(--text);">${d.grams.toFixed(0)}g ${escapeHtml(t('inv.needed') || 'needed')}</span>
        <span style="color:${color};margin-inline-start:8px;font-size:11px;">${deficit >= 0 ? `${totalStock.toFixed(0)}g ${escapeHtml(t('inv.in_stock') || 'in stock')}` : `${Math.abs(deficit).toFixed(0)}g ${escapeHtml(t('inv.short') || 'short')}`}</span>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;border-left:3px solid var(--primary);">
      <h3 class="card-head" style="margin-bottom:8px;"><span class="swatch" style="background:var(--primary);"></span>
        ${escapeHtml(t('inv.pipeline_title'))}
        <span class="count" style="margin-inline-start:6px;">${activeOrders.length}</span>
      </h3>
      ${rows}
    </div>`;
}

// Feature F2: Render a prominent amber alert banner listing all low-stock items
function renderReorderAlerts() {
  const el = $('#reorderAlertsSection');
  if (!el) return;

  const lowItems = inventory.filter(i =>
    i.weight <= (i.reorderPoint ?? settings.lowStockThreshold ?? 200)
  );

  if (lowItems.length === 0) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }

  const collapsed = el.dataset.collapsed === 'true';

  const itemRows = lowItems.map(item => {
    const daysLeft = estimateDaysRemaining(item);
    const daysHtml = daysLeft !== null
      ? `<span style="font-size:11px;color:${daysLeft <= 3 ? 'var(--danger)' : 'var(--warning)'};margin-inline-start:6px;" title="${escapeHtml(t('inv.usage_prediction') || 'Usage prediction')}">⏱ ${escapeHtml(t('inv.est_days_remaining') || 'Est.')} ${daysLeft}d</span>`
      : '';
    const threshold = item.reorderPoint ?? settings.lowStockThreshold ?? 200;
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 10px;background:rgba(245,166,35,0.08);border-radius:var(--radius-sm);margin-bottom:4px;flex-wrap:wrap;">
      <span style="width:10px;height:10px;border-radius:50%;background:${safeCssColor(item.color, '#f5a623')};display:inline-block;flex-shrink:0;"></span>
      <span style="flex:1;font-size:12.5px;font-weight:600;">${escapeHtml(item.material)}${item.colourVariant ? ` — ${escapeHtml(item.colourVariant)}` : ''}</span>
      <span style="font-size:11.5px;color:var(--danger);white-space:nowrap;">${Math.round(item.weight)}g / ${Math.round(threshold)}g</span>
      ${daysHtml}
      <button class="btn small primary" data-act="reorder-alert-item" data-id="${escapeHtml(item.id)}" style="font-size:11px;padding:2px 8px;">${escapeHtml(t('inv.draft_po') || 'Draft PO')}</button>
    </div>`;
  }).join('');

  el.style.display = '';
  el.innerHTML = `
    <div style="border:1px solid rgba(245,166,35,0.4);border-radius:var(--radius);background:rgba(245,166,35,0.06);margin-bottom:14px;overflow:hidden;">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;background:rgba(245,166,35,0.1);" id="reorderAlertToggle">
        <span style="font-size:16px;">⚠</span>
        <span style="font-weight:700;color:var(--warning);flex:1;">${escapeHtml(t('inv.low_stock_alert') || 'Low Stock Alert')} <span style="background:var(--warning);color:#000;font-size:11px;padding:1px 6px;border-radius:10px;margin-inline-start:4px;">${lowItems.length}</span></span>
        <span style="font-size:12px;color:var(--text-muted);">${collapsed ? '▶' : '▼'}</span>
      </div>
      ${collapsed ? '' : `<div style="padding:10px 14px;">${itemRows}</div>`}
    </div>`;

  const toggle = el.querySelector('#reorderAlertToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      el.dataset.collapsed = collapsed ? 'false' : 'true';
      renderReorderAlerts();
    });
  }
  el.querySelectorAll('[data-act="reorder-alert-item"]').forEach(btn => {
    btn.addEventListener('click', () => openReorderModal(btn.dataset.id));
  });
}

function renderInventory() {
  window.KhaytStudio?.renderInventoryStudioStats?.();
  renderReorderAlerts();
  renderSupplierReorderList();
  renderPipelineDemand();
  // Inventory valuation summary
  const valEl = $('#invValuationSummary');
  if (valEl && !window.KhaytStudio?.useHandoffScreens?.()) {
    if (inventory.length > 0) {
      const totalValue = inventory.reduce((s, item) => {
        const pricePerG = item.weight > 0 && item.cost > 0 ? item.cost / Math.max(1, item.spoolWeight || item.weight || 1000) * item.weight : 0;
        return s + pricePerG;
      }, 0);
      const totalGrams = inventory.reduce((s, item) => s + Math.max(0, +item.weight || 0), 0);
      const lowCount = inventory.filter(i => i.weight <= (i.reorderPoint ?? settings.lowStockThreshold)).length;
      valEl.innerHTML = `
        <span>${escapeHtml(t('inv.total_value'))}: <strong style="color:var(--success);">${fmtMoney(totalValue)}</strong></span>
        <span style="margin-inline-start:16px;">${escapeHtml(t('inv.total_stock'))}: <strong>${Math.round(totalGrams).toLocaleString()}g</strong></span>
        ${lowCount > 0 ? `<span style="margin-inline-start:16px; color:var(--warning);">⚠ ${lowCount} ${escapeHtml(t('inv.low_stock_count'))}</span>` : ''}
      `;
      valEl.style.display = 'flex';
    } else {
      valEl.style.display = 'none';
    }
  }

  window.KhaytStudio?.patchInventoryTableHead?.();
  const _studioInv = window.KhaytStudio?.useHandoffScreens?.();
  const tbody = $('#inventoryTable tbody');
  if (inventory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${_studioInv ? 6 : 5}" class="empty-state">${escapeHtml(t('inv.empty'))} <button type="button" class="btn small primary" data-act="focus-inv-material" style="margin-inline-start:12px;">${escapeHtml(t('inv.add_title') || 'Add Filament')}</button></td></tr>`;
  } else {
    const todayMs = Date.now();
    const invTerm = invSearchTerm.toLowerCase().trim();
    const visibleInv = invTerm
      ? inventory.filter(i => (i.material || '').toLowerCase().includes(invTerm) || (i.colourVariant || '').toLowerCase().includes(invTerm))
      : inventory;
    // Build a forecast map: materialName → daysRemaining
    const forecastMap = {};
    try {
      computeMaterialForecast().forEach(f => { forecastMap[f.material] = f; });
    } catch(e) { /* silent */ }
    tbody.innerHTML = visibleInv.map(item => {
      const studioRow = window.KhaytStudio?.renderInventoryRow?.(item, { forecastMap, todayMs });
      if (studioRow) return studioRow;
      const low = item.weight <= (item.reorderPoint ?? settings.lowStockThreshold);
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
      const isOvercommit = reserved > item.weight;
      const reservedBadge = reserved > 0
        ? ` <span class="spool-reserved-badge">${escapeHtml(t('inv.reserved'))}: ${reserved}${escapeHtml(t('common.grams'))}</span>`
        : '';
      const overcommitBadge = isOvercommit
        ? ` <span style="background:var(--danger);color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:600;">⚠ ${escapeHtml(t('inv.overcommit_warn'))}</span>`
        : '';
      // Feature 7: Test prints badge
      const spoolTestCount = testPrints.filter(tp => tp.spoolId === item.id).length;
      const testBadge = spoolTestCount > 0
        ? ` <span style="font-size:10px;color:var(--primary);">🧪 ${spoolTestCount}</span>`
        : '';
      // Run-out forecast badge
      const fc = forecastMap[item.material];
      const runoutBadge = fc
        ? fc.available < 0
          ? ` <span style="font-size:10px;background:var(--danger);color:#fff;padding:1px 5px;border-radius:3px;font-weight:600;">⚠ ${escapeHtml(t('inv.overcommit_warn'))}</span>`
          : ` <span style="font-size:10px;color:${fc.urgent ? 'var(--danger)' : 'var(--warning)'};font-weight:600;" title="${escapeHtml(t('inv.runout_in') || 'Run-out in')} ${fc.daysRemaining} ${escapeHtml(t('common.days') || 'days')}">📉 ${fc.daysRemaining}d</span>`
        : '';
      const isResin = item.materialType === 'resin';
      const weightUnit = isResin ? 'mL' : escapeHtml(t('common.grams'));
      const resinBadge = isResin ? ` <span class="resin-badge">${escapeHtml(t('inv.type_resin'))}</span>` : '';
      const colourChip = item.colourVariant ? ` <span class="variant-chip">${escapeHtml(item.colourVariant)}</span>` : '';
      const lotChip = item.lot ? ` <span style="font-size:10px; color:var(--text-dim); background:var(--bg-elev); border:1px solid var(--border-soft); border-radius:3px; padding:0 4px;" title="${escapeHtml(t('inv.lot') || 'Lot')}">${escapeHtml(item.lot)}</span>` : '';
      return `
        <tr data-inv-id="${escapeHtml(item.id)}"${low ? ' style="background: rgba(245,166,35,0.08);"' : ''}>
          <td style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${safeCssColor(item.color, '#888888')}; flex-shrink:0; border:1px solid rgba(255,255,255,0.15);"></span>
            <strong>${escapeHtml(item.material)}</strong>${low ? ' <span style="color:var(--warning); font-size:11px;">· low</span>' : ''}${resinBadge}${colourChip}${lotChip}${ageBadge}${reservedBadge}${overcommitBadge}${testBadge}${runoutBadge}
            ${item.printTemp || item.bedTemp ? `<span style="font-size:10px; color:var(--primary);">🌡 ${item.printTemp ? item.printTemp + '°C print' : ''}${item.printTemp && item.bedTemp ? ' / ' : ''}${item.bedTemp ? item.bedTemp + '°C bed' : ''}</span>` : ''}
          </td>
          <td style="font-variant-numeric: tabular-nums;">${fmtPrice(item.cost)}</td>
          <td style="font-variant-numeric: tabular-nums;">
            ${window.KhaytStudio?.useHandoffScreens?.() ? window.KhaytStudio.invStockMeterHtml(item) : `${Math.round(item.weight)} ${weightUnit}`}
          </td>
          <td style="font-variant-numeric: tabular-nums; color:${queued > 0 ? (warn ? 'var(--danger)' : 'var(--text-dim)') : 'var(--text-muted)'};">
            ${queued > 0 ? Math.round(queued) + ' ' + weightUnit : '—'}${warn ? ' <span style="color:var(--danger); font-size:11px;">⚠</span>' : ''}
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
              const lastDry = [...dryLog].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
              const daysSince = lastDry.date ? Math.floor((Date.now() - new Date(lastDry.date + 'T00:00:00').getTime()) / 86400000) : 999;
              if (daysSince > 7) {
                return `<span class="drying-warn-badge" style="margin-inline-end:6px;">⚠ ${escapeHtml(t('inv.dry_warn'))}</span>`;
              }
              return `<span class="drying-ok-badge" style="margin-inline-end:6px;">✅ ${escapeHtml(t('inv.dry_ok', { n: daysSince }))}</span>`;
            })()}
            ${low ? `<button class="btn small" data-act="reorder-inv" data-id="${item.id}" style="margin-inline-end:4px; color:var(--warning); border-color:var(--warning);">${escapeHtml(t('inv.reorder'))}</button>` : ''}
            <button class="btn small ghost" data-act="inv-test-print" data-id="${item.id}" style="margin-inline-end:4px;" title="${escapeHtml(t('inv.test_prints'))}">🧪</button>
            <button class="btn small ghost" data-act="inv-dry-log" data-id="${item.id}" style="margin-inline-end:4px;" title="${escapeHtml(t('inv.dry_log'))}">🌡</button>
            <button class="btn small ghost" data-act="inv-spool-history" data-id="${item.id}" style="margin-inline-end:4px;" title="${escapeHtml(t('inv.spool_history'))}">📋</button>
            <button class="btn small ghost" data-act="adj-inv" data-id="${item.id}" style="margin-inline-end:4px;">${escapeHtml(t('inv.adjust'))}</button>
            ${(item.priceHistory && item.priceHistory.length > 0) ? `<button class="btn small ghost" data-act="inv-price-history" data-id="${item.id}" style="margin-inline-end:4px;" title="${escapeHtml(t('inv.price_history'))}">📈</button>` : ''}
            <button class="btn small" data-act="edit-inv" data-id="${item.id}" style="margin-inline-end:4px;">${escapeHtml(t('common.edit'))}</button>
            <button class="btn danger small" data-act="del-inv" data-id="${item.id}">${escapeHtml(t('common.delete'))}</button>
          </td>
        </tr>`;
    }).join('');
  }
  populateFilamentDropdown();
  updateNotifBadge();
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
        <tbody>${history.map(h => {
          const orderLabel = h.orderId
            ? `<a class="spool-hist-order-link" href="#" data-order-id="${escapeHtml(h.orderId)}" style="color:var(--primary); text-decoration:none; font-size:12px;">${escapeHtml(h.project || h.orderId)}</a>`
            : escapeHtml(h.project || '');
          return `<tr>
            <td style="font-family:var(--font-num); font-size:12px; color:var(--text-dim); white-space:nowrap;">${escapeHtml(h.date || '')}</td>
            <td>${orderLabel}</td>
            <td style="text-align:right; font-variant-numeric:tabular-nums;">${(+h.weightUsed || 0).toFixed(0)}g</td>
          </tr>`;
        }).join('')}</tbody>
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
    onMount(modal) {
      modal.querySelectorAll('.spool-hist-order-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const oid = link.dataset.orderId;
          // Close modal by clicking cancel, then navigate
          modal.closest('.modal-backdrop')?.querySelector('[data-act="cancel"]')?.click();
          switchTab('logs-tab');
          setTimeout(() => { logSearchTerm = oid; renderLogs(); }, 60);
        });
      });
    },
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
        <td><button class="btn danger small" data-act="del-dry" data-dry-id="${e.id}" aria-label="${escapeHtml(t('common.delete'))}">×</button></td>
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
        const ok = await confirmModal(t('common.delete') + '?', { danger: true });
        if (!ok) return;
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
   Feature 7: Test Print / Calibration Library
   ============================================================ */
function openTestPrintLog(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const todayStr = new Date().toISOString().split('T')[0];
  const TEST_TYPES = ['temp_tower','retraction','first_layer','stringing','overhang','dimensional','other'];
  const TEST_RESULTS = ['excellent','good','fair','poor'];

  function listHtml() {
    const entries = testPrints.filter(tp => tp.spoolId === itemId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (entries.length === 0)
      return `<p style="color:var(--text-muted); font-size:13px; text-align:center; padding:10px 0;">${escapeHtml(t('inv.spool_hist_empty'))}</p>`;
    return `<div class="table-wrap"><table style="width:100%; font-size:12px;">
      <thead><tr>
        <th>${escapeHtml(t('common.date'))}</th>
        <th>${escapeHtml(t('inv.test_machine'))}</th>
        <th>${escapeHtml(t('inv.test_type'))}</th>
        <th>Print°C</th>
        <th>Bed°C</th>
        <th>${escapeHtml(t('inv.test_speed'))}</th>
        <th>${escapeHtml(t('inv.test_result'))}</th>
        <th>${escapeHtml(t('common.notes'))}</th>
        <th>${escapeHtml(t('inv.test_weight_used'))}</th>
        <th></th>
      </tr></thead>
      <tbody>${entries.map(e => {
        const mach = e.machineId ? machines.find(m => m.id === e.machineId) : null;
        return `<tr>
          <td style="white-space:nowrap; color:var(--text-dim);">${escapeHtml(e.date || '')}</td>
          <td>${mach ? escapeHtml(mach.name) : '—'}</td>
          <td>${escapeHtml(t('inv.test.' + (e.testType || 'other')))}</td>
          <td>${e.printTemp ? escapeHtml(String(e.printTemp)) + '°' : '—'}</td>
          <td>${e.bedTemp ? escapeHtml(String(e.bedTemp)) + '°' : '—'}</td>
          <td>${e.speed ? escapeHtml(String(e.speed)) : '—'}</td>
          <td style="color:${e.result === 'excellent' || e.result === 'good' ? 'var(--success)' : e.result === 'poor' ? 'var(--danger)' : 'var(--warning)'};">${escapeHtml(t('inv.test.' + (e.result || 'good')))}</td>
          <td style="color:var(--text-muted);">${escapeHtml(e.notes || '')}</td>
          <td>${e.weightUsed ? escapeHtml(String(e.weightUsed)) + 'g' : '—'}</td>
          <td><button class="btn danger small" data-act="del-test" data-test-id="${e.id}" aria-label="${escapeHtml(t('common.delete'))}">×</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`;
  }

  const machOptions = `<option value="">${escapeHtml(t('mach.unassigned'))}</option>` +
    machines.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  const typeOptions = TEST_TYPES.map(tp => `<option value="${tp}">${escapeHtml(t('inv.test.' + tp))}</option>`).join('');
  const resultOptions = TEST_RESULTS.map(r => `<option value="${r}">${escapeHtml(t('inv.test.' + r))}</option>`).join('');

  openFormModal({
    title: `${escapeHtml(item.material)} — ${t('inv.test_prints')}`,
    saveLabel: t('inv.test_add'),
    sizeLg: true,
    bodyHtml: `
      <div style="background:var(--surface-2); padding:14px; border-radius:var(--radius); margin-bottom:14px;">
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; align-items:end;">
          <div>
            <label style="margin:0;">${escapeHtml(t('common.date'))}</label>
            <input type="date" id="tpDate" value="${todayStr}" max="${todayStr}">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.test_machine'))}</label>
            <select id="tpMachine">${machOptions}</select>
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.test_type'))}</label>
            <select id="tpType">${typeOptions}</select>
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.test_result'))}</label>
            <select id="tpResult">${resultOptions}</select>
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.print_temp'))}</label>
            <input type="number" id="tpPrintTemp" min="0" max="350" step="1" placeholder="210">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.bed_temp'))}</label>
            <input type="number" id="tpBedTemp" min="0" max="150" step="1" placeholder="60">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.test_speed'))}</label>
            <input type="number" id="tpSpeed" min="0" step="1" placeholder="60">
          </div>
          <div>
            <label style="margin:0;">${escapeHtml(t('inv.test_weight_used'))}</label>
            <input type="number" id="tpWeight" min="0" step="1" placeholder="5">
          </div>
        </div>
        <div style="margin-top:8px;">
          <label style="margin:0;">${escapeHtml(t('common.notes'))}</label>
          <input type="text" id="tpNotes" placeholder="${escapeHtml(t('common.optional'))}">
        </div>
      </div>
      <div id="testPrintList">${listHtml()}</div>
    `,
    onMount(modal) {
      modal.querySelector('#testPrintList').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act="del-test"]');
        if (!btn) return;
        const ok = await confirmModal(t('common.delete') + '?', { danger: true });
        if (!ok) return;
        const tp = testPrints.find(x => x.id === btn.dataset.testId);
        testPrints = testPrints.filter(x => x.id !== btn.dataset.testId);
        // Restore filament weight when deleting a test print
        if (tp && tp.weightUsed > 0) {
          item.weight = (item.weight || 0) + tp.weightUsed;
        }
        saveAll();
        modal.querySelector('#testPrintList').innerHTML = listHtml();
        renderInventory();
      });
    },
    onSave(modal) {
      const date      = modal.querySelector('#tpDate').value || todayStr;
      const machineId = modal.querySelector('#tpMachine').value || null;
      const testType  = modal.querySelector('#tpType').value || 'other';
      const result    = modal.querySelector('#tpResult').value || 'good';
      const printTemp = parseFloat(modal.querySelector('#tpPrintTemp').value) || null;
      const bedTemp   = parseFloat(modal.querySelector('#tpBedTemp').value) || null;
      const speed     = parseFloat(modal.querySelector('#tpSpeed').value) || null;
      const notes     = modal.querySelector('#tpNotes').value.trim();
      const weightUsed = parseFloat(modal.querySelector('#tpWeight').value) || 0;
      const newTp = { id: uid('TP'), spoolId: itemId, date, machineId, testType, result, printTemp, bedTemp, speed, notes, weightUsed };
      testPrints.unshift(newTp);
      if (weightUsed > 0) {
        item.weight = Math.max(0, item.weight - weightUsed);
        if (!item.usageHistory) item.usageHistory = [];
        item.usageHistory.unshift({ orderId: newTp.id, project: `Test print (${testType})`, weightUsed, date });
        if (item.usageHistory.length > 200) item.usageHistory.length = 200;
      }
      saveAll();
      renderInventory();
      toast(t('inv.test_saved'), 'success');
      return true;
    }
  });
}

/* ============================================================
   Auto filament deduction (on completion)
   ============================================================ */
function deductFilamentForOrder(order, { skipRender = false } = {}) {
  if (!settings.autoDeduct) return;
  if (order.materialDeducted) return;
  let deductedAny = false;
  const today = new Date().toISOString().split('T')[0];
  for (const part of (order.parts || [])) {
    if (!part.filamentId || !part.printWeight) continue;
    const item = inventory.find(i => i.id === part.filamentId);
    if (!item) continue;
    const deductAmt = ((+part.printWeight || 0) + (+part.supportWeight || 0)) * (part.qty || 1);
    item.weight = Math.max(0, item.weight - deductAmt);
    if (!item.usageHistory) item.usageHistory = [];
    item.usageHistory.unshift({ orderId: order.id, project: order.project || '', weightUsed: deductAmt, date: today });
    if (item.usageHistory.length > 200) item.usageHistory.length = 200;
    deductedAny = true;
    toast(t('inv.deducted', { material: item.material, weight: Math.round(deductAmt) }), 'info', 2200);
    if (item.weight <= (item.reorderPoint ?? settings.lowStockThreshold)) {
      toast(t('inv.low_stock', { material: item.material, weight: Math.round(item.weight) }), 'error', 3800);
    }
  }
  if (deductedAny) {
    saveAll();
    if (!skipRender) renderInventory();
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

  // Always mark materialDeducted so re-runs never double-deduct
  order.materialDeducted = true;
}

/* Feature 6: Deduct packaging consumables when order completes */
function deductPackagingConsumables(order) {
  if (order.packagingDeducted) return;
  const packagingItems = consumables.filter(c => c.isPackaging && c.stock > 0);
  if (packagingItems.length === 0) return;
  packagingItems.forEach(c => {
    c.stock = Math.max(0, (c.stock || 0) - 1);
    if (c.stock <= (c.minStock || 0)) {
      toast(`📦 ${escapeHtml(t('cons.low'))}: ${c.name}`, 'warning', 3000);
    }
  });
  saveAll();
  renderConsumables();
  toast(t('cons.packaging_deducted'), 'info', 2200);
  order.packagingDeducted = true;
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
    const packagingBadge = c.isPackaging
      ? `<span style="font-size:10px; background:rgba(251,146,60,0.18); color:var(--warning); padding:1px 6px; border-radius:6px; margin-inline-start:6px; vertical-align:middle;">📦 ${escapeHtml(t('cons.packaging_badge'))}</span>`
      : '';
    return `
      <tr${low ? ' style="background:rgba(245,166,35,0.08);"' : ''}>
        <td><strong>${escapeHtml(c.name)}</strong>${packagingBadge}${low ? ` <span style="color:var(--warning); font-size:11px;">· ${escapeHtml(t('cons.low'))}</span>` : ''}${usageHint}</td>
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
    : { id: uid('CNS'), name: '', stock: 0, unit: '', cost: 0, minStock: 0, usagePerHour: 0, isPackaging: false };

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
    </div>
    <label style="margin-top:12px; display:flex; align-items:center; gap:8px; cursor:pointer;">
      <input type="checkbox" id="consIsPackaging" style="width:auto; margin:0;" ${draft.isPackaging ? 'checked' : ''}>
      <span>📦 ${escapeHtml(t('cons.is_packaging'))}</span>
    </label>`;

  openFormModal({
    title: existing ? t('cons.edit_title') : t('cons.add_title'),
    saveLabel: t('common.save'),
    bodyHtml,
    onMount(modal) {
      modal.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('input', () => { draft[inp.dataset.f] = inp.value; });
      });
    },
    onSave(modal) {
      const name = draft.name?.trim ? draft.name.trim() : '';
      if (!name) { toast(t('cons.name_ph'), 'error'); return false; }
      draft.name         = name;
      draft.stock        = Math.max(0, num(draft.stock, 0));
      draft.cost         = Math.max(0, num(draft.cost, 0));
      draft.minStock     = Math.max(0, num(draft.minStock, 0));
      draft.unit         = (draft.unit || '').trim();
      draft.usagePerHour = Math.max(0, num(draft.usagePerHour, 0));
      draft.isPackaging  = !!(modal.querySelector('#consIsPackaging')?.checked);
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

// Feature F3: Estimate days remaining for an inventory item based on recent usage history
function estimateDaysRemaining(item) {
  const hist = (item.usageHistory || []).filter(h => h.weightUsed > 0);
  if (!hist.length) return null;
  const cutoff = Date.now() - 30 * 86400000;
  const recent = hist.filter(h => new Date(h.date).getTime() >= cutoff);
  const totalUsed = recent.reduce((s, h) => s + (+h.weightUsed || 0), 0);
  const days = recent.length > 0 ? Math.min(30, (Date.now() - new Date(recent[recent.length-1]?.date || Date.now()).getTime()) / 86400000 + recent.length) : 30;
  const dailyRate = totalUsed / Math.max(days, 1);
  if (dailyRate <= 0) return null;
  return Math.round((item.weight || 0) / dailyRate);
}

function renderSupplierReorderList() {
  const el = $('#supplierReorderList');
  if (!el) return;

  const lowItems = inventory.filter(i =>
    i.weight <= (i.reorderPoint ?? settings.lowStockThreshold ?? 200)
  );

  if (lowItems.length === 0) {
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(34,197,94,0.08);border-radius:var(--radius);border:1px solid rgba(34,197,94,0.2);margin-bottom:12px;font-size:13px;color:var(--success);">
      ✅ ${escapeHtml(t('inv.stock_ok') || 'All materials are above reorder levels')}
    </div>`;
    return;
  }

  const bySupplier = {};
  for (const item of lowItems) {
    const key = item.supplierId || '__unknown__';
    if (!bySupplier[key]) bySupplier[key] = [];
    bySupplier[key].push(item);
  }

  const groupHtml = Object.entries(bySupplier).map(([supId, items]) => {
    const sup = supId !== '__unknown__' ? suppliers.find(s => s.id === supId) : null;
    const supName = sup ? escapeHtml(sup.name) : escapeHtml(t('sup.unknown') || 'Unknown supplier');
    const phoneBtn = sup?.phone
      ? `<a href="https://wa.me/${encodeURIComponent(sup.phone.replace(/\D/g, ''))}" target="_blank" class="btn small ghost" style="font-size:11px;">📲 ${escapeHtml(sup.phone)}</a>`
      : '';
    const webBtn = sup?.website && safeHttpUrl(sup.website)
      ? `<a href="${safeHttpUrl(sup.website)}" target="_blank" rel="noopener noreferrer" class="btn small ghost" style="font-size:11px;">🌐 ${escapeHtml(t('sup.website') || 'Website')}</a>`
      : '';
    const itemRows = items.map(item => {
      const needed = Math.max(0, (item.reorderPoint ?? settings.lowStockThreshold ?? 200) * 2 - item.weight);
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg-elev);border-radius:var(--radius-sm);margin-bottom:4px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${safeCssColor(item.color, '#888')};display:inline-block;flex-shrink:0;"></span>
        <span style="flex:1;font-size:12.5px;">${escapeHtml(item.material)}${item.brand ? ` — ${escapeHtml(item.brand)}` : ''}</span>
        <span style="font-size:11.5px;color:var(--danger);white-space:nowrap;">${Math.round(item.weight)}g left</span>
        <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">need ~${Math.round(needed)}g</span>
        <button class="btn small primary" data-act="reorder-item" data-id="${item.id}" style="font-size:11px;padding:2px 8px;">${escapeHtml(t('inv.reorder') || 'Order')}</button>
      </div>`;
    }).join('');

    return `<div style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:12px;font-weight:700;color:var(--text);">🏭 ${supName}</span>
        ${sup?.leadDays ? `<span style="font-size:11px;color:var(--text-muted);">${sup.leadDays}d lead time</span>` : ''}
        ${phoneBtn}${webBtn}
      </div>
      ${itemRows}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="card" style="border-left:3px solid var(--warning);">
      <h3 class="card-head" style="margin-bottom:10px;color:var(--warning);">
        <span class="swatch" style="background:var(--warning);"></span>
        ⚠ ${escapeHtml(t('inv.reorder_list') || 'Reorder List')} <span style="background:var(--warning);color:#000;font-size:11px;padding:1px 6px;border-radius:10px;margin-inline-start:6px;">${lowItems.length}</span>
      </h3>
      ${groupHtml}
    </div>`;

  el.querySelectorAll('[data-act="reorder-item"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = inventory.find(i => i.id === btn.dataset.id);
      if (item) openReorderModal(item.id);
    });
  });
}

function renderSuppliers() {
  const tbody = $('#suppliersTable tbody');
  if (!tbody) return;
  const filtered = supplierSearchTerm
    ? suppliers.filter(s => {
        const term = supplierSearchTerm.toLowerCase();
        return (s.name || '').toLowerCase().includes(term) ||
               (s.city || '').toLowerCase().includes(term) ||
               (s.category || '').toLowerCase().includes(term) ||
               (s.notes || '').toLowerCase().includes(term);
      })
    : suppliers;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">${escapeHtml(t('sup.empty'))}</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(s => {
    const totalSpent = s.purchases ? s.purchases.reduce((sum, p) => sum + (+p.amount || 0), 0) : 0;
    return `<tr data-supplier-id="${escapeHtml(s.id)}">
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

  // Render supplier price history chart below the table
  const hasPurchases = suppliers.some(s => s.purchases && s.purchases.length > 0);
  if (hasPurchases) renderSupplierPriceHistory();
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
    <input type="text" id="purchNotesInput" placeholder="${escapeHtml(t('sup.purchase_notes_ph'))}">
    <div class="inline-pair" style="margin-top:12px;">
      <div>
        <label style="margin:0;">${escapeHtml(t('sup.unit_price'))}</label>
        <input type="number" id="pur_unitPrice" min="0" step="0.01" placeholder="0.00">
      </div>
      <div>
        <label style="margin:0;">${escapeHtml(t('sup.quantity'))}</label>
        <input type="number" id="pur_quantity" min="0" step="1" placeholder="1" value="1">
      </div>
    </div>
    <div class="inline-pair" style="margin-top:12px;">
      <div>
        <label style="margin:0;">${escapeHtml(t('sup.unit'))}</label>
        <select id="pur_unit">
          ${['spool','kg','g','L','piece','roll','box'].map(u => `<option value="${u}">${u}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="margin:0;">${escapeHtml(t('sup.material_type'))}</label>
        <input type="text" id="pur_materialType" placeholder="PLA, PETG, Resin…">
      </div>
    </div>`;

  openFormModal({
    title: t('sup.log_purchase'),
    saveLabel: t('common.save'),
    bodyHtml,
    onSave() {
      const amt = num(document.getElementById('purchAmtInput').value, 0);
      if (amt <= 0) { toast(t('sup.amount_required'), 'error'); return false; }
      if (!sup.purchases) sup.purchases = [];
      sup.purchases.unshift({
        id:           uid('pch'),
        date:         document.getElementById('purchDateInput').value,
        amount:       amt,
        item:         document.getElementById('purchItemInput').value.trim(),
        notes:        document.getElementById('purchNotesInput').value.trim(),
        unitPrice:    parseFloat(document.getElementById('pur_unitPrice')?.value)  || null,
        quantity:     parseFloat(document.getElementById('pur_quantity')?.value)   || 1,
        unit:         document.getElementById('pur_unit')?.value                    || 'spool',
        materialType: document.getElementById('pur_materialType')?.value?.trim()   || '',
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
    revenue: completed.reduce((s, o) => s + orderRevenueBase(o), 0),
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
    if (o.status === 'completed') { s.completedCount++; s.revenue += orderRevenueBase(o); }
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
    const photo = p.thumbnail && safeImageSrc(p.thumbnail)
      ? `<img src="${safeImageSrc(p.thumbnail)}" alt="${escapeHtml(displayName)}">`
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
   Feature 4 (new batch): Material depletion forecast
   ============================================================ */
function computeMaterialForecast() {
  const results = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  for (const item of inventory) {
    // Sum weight queued (non-completed, non-quote orders using this material)
    let queued = 0;
    for (const o of printLog) {
      if (o.status === 'completed' || o.status === 'quote') continue;
      for (const p of (o.parts || [])) {
        if (p.filamentId === item.id) queued += (+p.printWeight || 0);
      }
      if (!o.parts || o.parts.length === 0) {
        if (o.material && o.material === item.material) queued += (+o.weight || 0);
      }
    }
    const available = (item.weight || 0) - queued;

    // Daily usage from last 30 days of completed orders
    const recentCompleted = printLog.filter(o => o.status === 'completed' && (o.date || '') >= thirtyAgoStr);
    let recentGrams = 0;
    for (const o of recentCompleted) {
      for (const p of (o.parts || [])) {
        if (p.filamentId === item.id) recentGrams += (+p.printWeight || 0);
      }
    }
    const dailyUsage = recentGrams / 30;
    const daysRemaining = (dailyUsage > 0 && available > 0) ? Math.floor(available / dailyUsage) : null;

    if (available < 0 || (daysRemaining !== null && daysRemaining < 30)) {
      results.push({
        material: item.material,
        available: Math.round(available),
        daysRemaining,
        urgent: available < 0 || (daysRemaining !== null && daysRemaining < 7),
      });
    }
  }
  return results.sort((a, b) => (a.daysRemaining ?? -999) - (b.daysRemaining ?? -999));
}

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
async function batchGenPOs() {
  const lowStockItems = inventory.filter(item =>
    (item.weight || 0) < (item.reorderPoint ?? settings.lowStockThreshold ?? 200)
  );
  if (lowStockItems.length === 0) {
    toast(t('po.none_needed'), 'info');
    return;
  }
  // Group by supplier
  const bySupplier = {};
  for (const item of lowStockItems) {
    const key = item.supplier || '—';
    if (!bySupplier[key]) bySupplier[key] = [];
    bySupplier[key].push(item);
  }
  const rowsHtml = Object.entries(bySupplier).map(([sup, items]) =>
    items.map(item => `
      <tr>
        <td>${escapeHtml(sup)}</td>
        <td>${escapeHtml(item.material)}</td>
        <td>${Math.round(item.weight || 0)}g</td>
        <td>${Math.round(item.reorderQty || 1000)}g</td>
      </tr>`).join('')
  ).join('');
  const confirmed = await new Promise(resolve => {
    openFormModal({
      title: t('po.batch_confirm', { n: lowStockItems.length }),
      saveLabel: t('common.confirm'),
      sizeLg: false,
      bodyHtml: `
        <div style="overflow-x:auto;max-height:280px;overflow-y:auto;">
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <thead><tr style="color:var(--text-muted);">
              <th style="text-align:left;padding:4px 6px;">${escapeHtml(t('po.supplier'))}</th>
              <th style="text-align:left;padding:4px 6px;">${escapeHtml(t('po.item'))}</th>
              <th style="text-align:right;padding:4px 6px;">${escapeHtml('Current')}</th>
              <th style="text-align:right;padding:4px 6px;">${escapeHtml('Order qty')}</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`,
      async onSave() { resolve(true); return true; }
    });
    // If modal is closed without save, resolve false
    const observer = new MutationObserver(() => {
      if (!document.querySelector('#modalMount .modal')) { observer.disconnect(); resolve(false); }
    });
    observer.observe($('#modalMount'), { childList: true });
  });
  if (!confirmed) return;
  for (const item of lowStockItems) {
    createPurchaseOrder(item);
  }
  saveAll();
  renderPurchaseOrders();
  toast(t('po.batch_done', { n: lowStockItems.length }), 'success');
}

function createPurchaseOrder(item, opts) {
  // opts: { supplierId, supplierName, qty, unitPrice, estimatedDelivery, notes }
  const resolvedSupplierId = (opts && opts.supplierId) || item.supplierId || null;
  const resolvedSupplierName = (opts && opts.supplierName) || (resolvedSupplierId ? (suppliers.find(s => s.id === resolvedSupplierId)?.name || '') : '');
  const po = {
    id: uid('PO'),
    itemId: item.id,
    itemName: item.material,
    supplierId: resolvedSupplierId,
    supplierName: resolvedSupplierName,
    qty: (opts && opts.qty) ? +opts.qty : (item.reorderQty || 1000),
    unitPrice: (opts && opts.unitPrice) ? +opts.unitPrice : undefined,
    estimatedDelivery: (opts && opts.estimatedDelivery) || null,
    status: 'ordered',
    orderedAt: new Date().toISOString().split('T')[0],
    receivedAt: null,
    notes: (opts && opts.notes) || '',
  };
  purchaseOrders.unshift(po);
  saveAll();
  renderPurchaseOrders();
  toast(t('po.created_toast'), 'success');
}

function renderPurchaseOrders() {
  const sec = $('#poSection');
  if (!sec) return;
  const relevant = purchaseOrders.filter(po => {
    if (poStatusFilter && po.status !== poStatusFilter) return false;
    if (poSearchTerm) {
      const term = poSearchTerm.toLowerCase();
      if (!(po.itemName || po.id || '').toLowerCase().includes(term) &&
          !(po.supplierName || '').toLowerCase().includes(term) &&
          !(po.notes || '').toLowerCase().includes(term)) return false;
    }
    return true;
  });

  // Reset display limit when filters change
  const poFilterHash = [poStatusFilter, poSearchTerm].join('\x00');
  if (poFilterHash !== _lastPoFilterHash) {
    poDisplayLimit = 50;
    _lastPoFilterHash = poFilterHash;
  }

  // AP Aging: unpaid/pending POs grouped by age
  const today = Date.now();
  const unpaidPOs = relevant.filter(po => po.status !== 'received' || (po.supplierInvoice && !po.invoicePaid));
  const aging = { current: 0, d30: 0, d60: 0 };
  for (const po of unpaidPOs) {
    const orderedMs = po.orderedAt ? new Date(po.orderedAt + 'T00:00:00').getTime() : today;
    const agedays = Math.floor((today - orderedMs) / 86400000);
    if (agedays < 30) aging.current++;
    else if (agedays < 60) aging.d30++;
    else aging.d60++;
  }
  const agingHtml = unpaidPOs.length > 0 ? `
    <div class="ap-aging-bar" style="display:flex;gap:12px;flex-wrap:wrap;padding:8px 12px;background:var(--surface-2);border-radius:var(--radius);margin-bottom:12px;font-size:12.5px;align-items:center;">
      <span style="font-weight:600;color:var(--text-muted);">AP Aging:</span>
      <span style="color:var(--success);">● ${aging.current} &lt;30d</span>
      <span style="color:var(--warning);">● ${aging.d30} 30-60d</span>
      <span style="color:var(--danger);">● ${aging.d60} 60d+</span>
      <span style="margin-inline-start:auto;color:var(--text-muted);">${unpaidPOs.length} ${escapeHtml(t('po.aging_unpaid'))}</span>
    </div>` : '';

  sec.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap;">
      <h3 class="card-head" style="margin:0; flex:1;"><span class="swatch"></span><span>${escapeHtml(t('po.title'))}</span></h3>
      <input type="search" id="poSearch" class="search-input" placeholder="${escapeHtml(t('po.search_ph'))}" value="${escapeHtml(poSearchTerm)}" style="max-width:200px;">
      <select id="poStatusSel" style="background:var(--bg-elev);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;">
        <option value=""${poStatusFilter===''?' selected':''}>${escapeHtml(t('common.all'))}</option>
        <option value="pending"${poStatusFilter==='pending'?' selected':''}>${escapeHtml(t('queue.pending'))}</option>
        <option value="ordered"${poStatusFilter==='ordered'?' selected':''}>${escapeHtml(t('po.status.ordered'))}</option>
        <option value="partial"${poStatusFilter==='partial'?' selected':''}>${escapeHtml(t('po.partial'))}</option>
        <option value="received"${poStatusFilter==='received'?' selected':''}>${escapeHtml(t('po.status.received'))}</option>
      </select>
      <button class="btn small pro-only" data-act="batch-gen-pos">📦 ${escapeHtml(t('po.batch_gen'))}</button>
    </div>
    ${agingHtml}
    ${relevant.length === 0
      ? `<p style="color:var(--text-muted); font-size:13px;">${escapeHtml(t('po.empty'))}</p>`
      : (() => {
          const page = relevant.slice(0, poDisplayLimit);
          const loadMoreRow = relevant.length > poDisplayLimit
            ? `<tr><td colspan="5" style="text-align:center;padding:12px;">
                <button class="btn small ghost" data-act="load-more-pos">
                  ${escapeHtml(t('log.load_more') || 'Load more')} (${relevant.length - poDisplayLimit} ${escapeHtml(t('log.remaining') || 'remaining')})
                </button>
              </td></tr>` : '';
          return `<div class="table-wrap"><table class="po-table">
          <thead><tr>
            <th>${escapeHtml(t('po.item'))}</th>
            <th>${escapeHtml(t('po.supplier'))}</th>
            <th>${escapeHtml(t('po.ordered_at'))}</th>
            <th>${escapeHtml(t('po.status'))}</th>
            <th></th>
          </tr></thead>
          <tbody>
          ${page.map(po => {
            const receivedSoFar = po.receivedSoFar || 0;
            const weightOrdered = po.weightOrdered || 0;
            const progressPct = weightOrdered > 0 ? Math.min(100, (receivedSoFar / weightOrdered) * 100) : 0;
            const isPartial = po.status === 'partial';
            const progressHtml = isPartial && weightOrdered > 0 ? `
              <div style="margin-top:4px; font-size:11px; color:var(--text-muted);">${escapeHtml(t('po.received_so_far'))}: ${receivedSoFar}g / ${weightOrdered}g</div>
              <div class="po-progress-bar"><div style="width:${progressPct.toFixed(1)}%;background:var(--primary);height:100%;border-radius:2px;"></div></div>` : '';
            return `
            <tr>
              <td><strong>${escapeHtml(po.itemName || po.id)}</strong>${progressHtml}</td>
              <td style="color:var(--text-dim);">${escapeHtml(po.supplierName || '—')}</td>
              <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(po.orderedAt || '')}</td>
              <td>
                <span class="po-badge ${escapeHtml(po.status)}">${isPartial ? escapeHtml(t('po.partial')) : escapeHtml(t('po.status.' + po.status))}</span>
                ${po.supplierInvoice ? (po.invoiceDiscrepancy
                  ? `<span class="ap-mismatch-badge" title="${escapeHtml(t('po.ap_mismatch'))}">⚠ ${escapeHtml(t('po.ap_mismatch'))}</span>`
                  : `<span class="ap-matched-badge" title="${escapeHtml(t('po.ap_matched'))}">✔ ${escapeHtml(t('po.ap_matched'))}</span>`) : ''}
              </td>
              <td style="white-space:nowrap;">
                ${(po.status === 'ordered' || isPartial) ? `<button class="btn small success" data-act="po-receive" data-id="${po.id}">${escapeHtml(isPartial ? t('po.receive_more') : t('po.receive'))}</button>` : `<span style="font-size:11px; color:var(--text-muted);">${escapeHtml(po.receivedAt || '')}</span>`}
                ${isPartial ? `<button class="btn small ghost" data-act="po-close" data-id="${po.id}" style="margin-inline-start:4px;">${escapeHtml(t('po.close_po'))}</button>` : ''}
                ${(po.status === 'received' || isPartial) ? `<button class="btn small ghost pro-only" data-act="po-record-invoice" data-id="${po.id}" style="margin-inline-start:4px;" title="${escapeHtml(t('po.ap_record'))}">🧾 ${escapeHtml(t('po.ap_record'))}</button>` : ''}
                <button class="btn danger small" data-act="po-del" data-id="${po.id}" style="margin-inline-start:4px;">×</button>
              </td>
            </tr>`;
          }).join('')}
          ${loadMoreRow}
          </tbody></table></div>`;
        })()
    }`;
  // Attach event listeners to the dynamically-rendered search/filter controls
  const poSearchEl = sec.querySelector('#poSearch');
  if (poSearchEl) poSearchEl.addEventListener('input', (e) => { poSearchTerm = e.target.value; renderPurchaseOrders(); });
  const poStatusSelEl = sec.querySelector('#poStatusSel');
  if (poStatusSelEl) poStatusSelEl.addEventListener('change', (e) => { poStatusFilter = e.target.value; renderPurchaseOrders(); });
}

function openReorderModal(itemId) {
  const item = inventory.find(i => i.id === itemId);
  if (!item) return;
  const orderQty = item.reorderQty || 1000;
  const defaultMsg = t('inv.reorder_msg', { material: item.material, weight: Math.round(item.weight) })
    .replace(/\.$/, '') + `. Please send ${orderQty}g. Thank you!`;
  const supplierOptions = suppliers.map(s =>
    `<option value="${escapeHtml(s.id)}"${s.id === item.supplierId ? ' selected' : ''}>${escapeHtml(s.name)}</option>`
  ).join('');
  const overlay = appendStackedModal(`
      <div class="modal modal-form modal-lg" role="dialog" aria-modal="true" aria-labelledby="reorderModalTitle">
        <div class="modal-header">
          <h3 id="reorderModalTitle">${escapeHtml(t('inv.draft_po_title') || 'Draft Purchase Order')}</h3>
          <button class="btn ghost small" id="reorderModalClose" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <div class="inline-pair">
            <div>
              <label>${escapeHtml(t('po.supplier') || 'Supplier')}</label>
              <select id="reorderSupplier" style="width:100%;">
                <option value="">— ${escapeHtml(t('po.no_supplier') || 'No supplier')} —</option>
                ${supplierOptions}
              </select>
            </div>
            <div>
              <label>${escapeHtml(t('po.qty') || 'Quantity')} (g)</label>
              <input type="number" id="reorderQtyInput" value="${orderQty}" min="1">
            </div>
          </div>
          <div class="inline-pair" style="margin-top:10px;">
            <div>
              <label>${escapeHtml(t('po.unit_price') || 'Unit price')} (${escapeHtml(t('inv.per_g') || 'per g, optional')})</label>
              <input type="number" id="reorderUnitPrice" value="" min="0" step="0.01" placeholder="0.00">
            </div>
            <div>
              <label>${escapeHtml(t('po.est_delivery') || 'Estimated delivery')}</label>
              <input type="date" id="reorderDeliveryDate">
            </div>
          </div>
          <label style="margin-top:10px;">${escapeHtml(t('common.notes') || 'Notes')}</label>
          <textarea id="reorderNotes" rows="2" style="resize:vertical;"></textarea>
          <hr style="margin:14px 0;border:none;border-top:1px solid var(--border);">
          <label>${escapeHtml(t('set.supplier_phone'))}</label>
          <input type="tel" id="reorderPhone" value="${escapeHtml((suppliers.find(s => s.id === item.supplierId)?.phone) || settings.supplierPhone || '')}" data-i18n-placeholder="set.supplier_ph">
          <label style="margin-top:10px;">${escapeHtml(t('wa.tpl_body'))}</label>
          <textarea id="reorderMsg" rows="3" style="resize:vertical;">${escapeHtml(defaultMsg)}</textarea>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="reorderModalCancel">${escapeHtml(t('common.cancel'))}</button>
          <button class="btn" id="reorderDraftOnly">${escapeHtml(t('inv.draft_po_only') || 'Draft PO Only')}</button>
          <button class="btn primary" id="reorderDraftAndWa">${escapeHtml(t('inv.draft_po_whatsapp') || 'Draft PO + WhatsApp')}</button>
        </div>
      </div>`, { zIndex: 10040 });
  if (!overlay) return;

  const close = () => {
    document.removeEventListener('keydown', escH);
    const idx = _escHandlerStack.indexOf(escH);
    if (idx !== -1) _escHandlerStack.splice(idx, 1);
    overlay.remove();
  };
  const escH = (e) => { if (e.key === 'Escape') close(); };
  _escHandlerStack.push(escH);
  document.addEventListener('keydown', escH);
  overlay.querySelector('#reorderModalClose').addEventListener('click', close);
  overlay.querySelector('#reorderModalCancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  // Update phone when supplier changes
  overlay.querySelector('#reorderSupplier').addEventListener('change', function() {
    const sup = suppliers.find(s => s.id === this.value);
    if (sup?.phone) overlay.querySelector('#reorderPhone').value = sup.phone;
  });

  const collectOpts = () => {
    const modal = overlay.querySelector('.modal');
    const supId = modal.querySelector('#reorderSupplier').value;
    const sup = suppliers.find(s => s.id === supId);
    return {
      supplierId:        supId || null,
      supplierName:      sup?.name || '',
      qty:               +modal.querySelector('#reorderQtyInput').value || orderQty,
      unitPrice:         +modal.querySelector('#reorderUnitPrice').value || undefined,
      estimatedDelivery: modal.querySelector('#reorderDeliveryDate').value || null,
      notes:             modal.querySelector('#reorderNotes').value.trim(),
    };
  };

  overlay.querySelector('#reorderDraftOnly').addEventListener('click', () => {
    const opts = collectOpts();
    const phone = overlay.querySelector('#reorderPhone').value.trim();
    if (phone && phone !== settings.supplierPhone) {
      settings.supplierPhone = phone;
      saveAll();
      const el = $('#set_supplierPhone');
      if (el) el.value = phone;
    }
    createPurchaseOrder(item, opts);
    close();
  });

  overlay.querySelector('#reorderDraftAndWa').addEventListener('click', async () => {
    const opts = collectOpts();
    const phone = overlay.querySelector('#reorderPhone').value.trim();
    const msg   = overlay.querySelector('#reorderMsg').value;
    if (phone && phone !== settings.supplierPhone) {
      settings.supplierPhone = phone;
      saveAll();
      const el = $('#set_supplierPhone');
      if (el) el.value = phone;
    }
    createPurchaseOrder(item, opts);
    if (window.hubAPI?.shareWhatsApp) {
      await window.hubAPI.shareWhatsApp({ phone, message: msg, pdfPath: null });
    }
    close();
  });
}

function exportInventoryCsv() {
  const threshold = +(settings.lowStockThreshold || 200);

  const headers = [
    'ID', 'Material', 'Color', 'Brand',
    `Weight (g)`, `Remaining (g)`, `Cost/g (${currencySymbol()})`,
    'Location', 'Low Stock'
  ];

  const lines = [
    headers.map(csvEsc).join(','),
    ...inventory.map(spool => [
      spool.id,
      spool.material || '',
      spool.colorName || spool.color || '',
      spool.brand || '',
      +spool.weight  || 0,
      +spool.remaining !== undefined ? +spool.remaining : +spool.weight || 0,
      spool.costPerGram != null ? (+spool.costPerGram).toFixed(4) : '',
      spool.location || '',
      (+spool.remaining || +spool.weight || 0) < threshold ? 'Yes' : 'No'
    ].map(csvEsc).join(','))
  ];

  downloadBlob(
    new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
    `inventory-${new Date().toISOString().slice(0, 10)}.csv`
  );
}

function recordSupplierInvoice(poId) {
  const po = purchaseOrders.find(p => p.id === poId);
  if (!po) return;
  openFormModal({
    title: t('po.ap_record'),
    sizeLg: false,
    saveLabel: t('common.save'),
    bodyHtml: `
      <label>${escapeHtml(t('po.sup_inv_num'))}</label>
      <input type="text" id="poSupInvNum" placeholder="${escapeHtml(t('po.sup_inv_num'))}" value="${escapeHtml(po.supplierInvoice?.number || '')}">
      <label style="margin-top:12px;">${escapeHtml(t('po.sup_inv_amount'))} (${currencySymbol()})</label>
      <input type="number" id="poSupInvAmount" min="0" step="0.01" value="${po.supplierInvoice?.amount || ''}">
      <label style="margin-top:12px;">${escapeHtml(t('po.sup_inv_date'))}</label>
      <input type="date" id="poSupInvDate" value="${escapeHtml(po.supplierInvoice?.date || new Date().toISOString().split('T')[0])}">`,
    onSave(modal) {
      const number = modal.querySelector('#poSupInvNum').value.trim();
      const amount = parseFloat(modal.querySelector('#poSupInvAmount').value) || 0;
      const date   = modal.querySelector('#poSupInvDate').value;
      po.supplierInvoice = { number, amount, date };
      // Check discrepancy: compare invoiced amount vs. PO expected amount
      const expectedAmt = (po.weightOrdered || 0) * ((po.unitCost || 0) / 1000);
      po.invoiceDiscrepancy = expectedAmt > 0 && Math.abs(amount - expectedAmt) > 1;
      saveAll();
      renderPurchaseOrders();
      toast(t('common.save'), 'success');
      return true;
    }
  });
}

  const api = {
    importSpoolsCsv,
    importClientsCsv,
    importProductsCsv,
    openFilamentCatalog,
    openFilamentScanner,
    addInventoryItem,
    deleteInventoryItem,
    deleteSupplier,
    deleteProduct,
    openInventoryEditor,
    openPriceHistory,
    checkSpoolOvercommit,
    todayPlusDays,
    getQueuedWeight,
    getSpoolReservedGrams,
    renderInventory,
    openStockAdjustModal,
    openSpoolHistory,
    openDryingLog,
    openTestPrintLog,
    deductFilamentForOrder,
    deductPackagingConsumables,
    renderConsumables,
    openConsumableEditor,
    deleteConsumable,
    renderSupplierReorderList,
    renderSuppliers,
    openSupplierEditor,
    openLogPurchaseModal,
    openSupplierHistory,
    getProductStats,
    renderCatalog,
    quoteFromProduct,
    openProductEditor,
    resizeImage,
    computeMaterialForecast,
    renderProductTierChips,
    batchGenPOs,
    createPurchaseOrder,
    renderPurchaseOrders,
    openReorderModal,
    exportInventoryCsv,
    recordSupplierInvoice,
  };
  Object.assign(global, api);
  global.KhaytInventory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
