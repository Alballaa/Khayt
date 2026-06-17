/**
 * Calculator / build workspace: quote cart, presets, filament picker, quote templates.
 */
const CURRENT_BUILD_KEY = 'hub_current_build_v1';

// In-memory only — the current quote workspace
let currentBuild = [];
let currentBuildFromProductId = null;
let currentClientId = null;
let currentExtraLines = [];
// Extra material rows for the current part being configured
let currentExtraMaterials = [];

// Feature 5: Price tiers for the current part being configured
let currentPriceTiers = [];

/* ============================================================
   Electricity tariff auto-fill (Calculator → "📍 Auto")
   Approximate commercial/SME rates in LOCAL currency per kWh — starting values
   only; users adjust to their actual bill (rates vary by tier/region/season).
   There is no free global electricity-price API, so this is a maintained table.
   ============================================================ */
const ELEC_TARIFFS = {
  SA: { name: 'Saudi Arabia',         rate: 0.18,  currency: 'SAR' },
  AE: { name: 'United Arab Emirates', rate: 0.38,  currency: 'AED' },
  QA: { name: 'Qatar',                rate: 0.13,  currency: 'QAR' },
  KW: { name: 'Kuwait',               rate: 0.025, currency: 'KWD' },
  BH: { name: 'Bahrain',              rate: 0.016, currency: 'BHD' },
  OM: { name: 'Oman',                 rate: 0.024, currency: 'OMR' },
  EG: { name: 'Egypt',                rate: 1.65,  currency: 'EGP' },
  JO: { name: 'Jordan',               rate: 0.10,  currency: 'JOD' },
  IQ: { name: 'Iraq',                 rate: 72,    currency: 'IQD' },
  MA: { name: 'Morocco',              rate: 1.20,  currency: 'MAD' },
  TN: { name: 'Tunisia',              rate: 0.30,  currency: 'TND' },
  DZ: { name: 'Algeria',              rate: 4.50,  currency: 'DZD' },
  TR: { name: 'Türkiye',              rate: 2.60,  currency: 'TRY' },
  US: { name: 'United States',        rate: 0.13,  currency: 'USD' },
  CA: { name: 'Canada',               rate: 0.14,  currency: 'CAD' },
  GB: { name: 'United Kingdom',       rate: 0.25,  currency: 'GBP' },
  DE: { name: 'Germany',              rate: 0.22,  currency: 'EUR' },
  FR: { name: 'France',               rate: 0.18,  currency: 'EUR' },
  IN: { name: 'India',                rate: 8.0,   currency: 'INR' },
  CN: { name: 'China',                rate: 0.65,  currency: 'CNY' },
  JP: { name: 'Japan',                rate: 22,    currency: 'JPY' },
  AU: { name: 'Australia',            rate: 0.30,  currency: 'AUD' },
  BR: { name: 'Brazil',               rate: 0.80,  currency: 'BRL' },
  ZA: { name: 'South Africa',         rate: 2.50,  currency: 'ZAR' },
  NG: { name: 'Nigeria',              rate: 70,    currency: 'NGN' },
};

// Best-effort base-currency → default country, to preselect the picker.
const CURRENCY_DEFAULT_COUNTRY = {
  SAR: 'SA', AED: 'AE', QAR: 'QA', KWD: 'KW', BHD: 'BH', OMR: 'OM', EGP: 'EG',
  JOD: 'JO', IQD: 'IQ', MAD: 'MA', TND: 'TN', DZD: 'DZ', TRY: 'TR', USD: 'US',
  CAD: 'CA', GBP: 'GB', EUR: 'DE', INR: 'IN', CNY: 'CN', JPY: 'JP', AUD: 'AU',
  BRL: 'BR', ZAR: 'ZA', NGN: 'NG',
};

/** Resolve a country's tariff into the shop's base currency when possible. */
function electricityRateForCountry(countryCode) {
  const tar = ELEC_TARIFFS[countryCode];
  if (!tar) return null;
  const base = (typeof settings !== 'undefined' && settings.currency) || 'SAR';
  if (tar.currency === base) return { rate: tar.rate, currency: base, converted: false };
  const xr = (settings.exchangeRates || {})[tar.currency];
  if (xr && xr > 0) {
    return { rate: +(tar.rate * xr).toFixed(3), currency: base, converted: true, from: tar.currency };
  }
  // No exchange rate set — hand back the local value flagged so the UI can warn.
  return { rate: tar.rate, currency: tar.currency, converted: false, noConvert: true };
}

/** Calculator "📍 Auto": ask the user for their country, then fill #elecRate. */
function openElecRatePicker() {
  const base = (typeof settings !== 'undefined' && settings.currency) || 'SAR';
  const defCountry = CURRENCY_DEFAULT_COUNTRY[base] || 'SA';
  const opts = Object.entries(ELEC_TARIFFS)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([code, tar]) => `<option value="${escapeHtml(code)}"${code === defCountry ? ' selected' : ''}>${escapeHtml(tar.name)}</option>`)
    .join('');
  const renderPreview = (r) => {
    if (!r) return '';
    if (r.noConvert) {
      return (t('calc.elec_preview_local') || '≈ {rate} {cur}/kWh — no {cur}→{base} rate set; value kept in {cur}. Fetch exchange rates in Settings to convert.')
        .replace(/{rate}/g, r.rate).replace(/{cur}/g, r.currency).replace(/{base}/g, base);
    }
    return (t('calc.elec_preview') || '≈ {rate} {base}/kWh').replace('{rate}', r.rate).replace('{base}', r.currency)
      + (r.converted ? ` (${(t('calc.elec_converted') || 'converted from {from}').replace('{from}', r.from)})` : '');
  };
  openFormModal({
    title: t('calc.elec_pick_title') || 'Auto-fill electricity rate',
    sizeLg: false,
    saveLabel: t('calc.elec_fill') || 'Fill rate',
    bodyHtml: `
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 10px;">
        ${escapeHtml(t('calc.elec_pick_hint') || 'Pick your country to fill a typical commercial electricity rate. These are approximate starting values — adjust to match your actual bill.')}
      </p>
      <label style="font-size:12px;font-weight:600;">${escapeHtml(t('calc.elec_country') || 'Country / location')}</label>
      <select id="elecCountrySel" style="width:100%;margin-top:4px;">${opts}</select>
      <p id="elecPickPreview" style="font-size:12px;color:var(--text-muted);margin:10px 0 0;"></p>`,
    onMount() {
      const sel = $('#elecCountrySel');
      const prev = $('#elecPickPreview');
      if (!sel || !prev) return;
      const upd = () => { prev.textContent = renderPreview(electricityRateForCountry(sel.value)); };
      sel.addEventListener('change', upd);
      upd();
    },
    onSave() {
      const sel = $('#elecCountrySel');
      const r = sel && electricityRateForCountry(sel.value);
      if (!r) return true;
      const input = $('#elecRate');
      if (input) {
        input.value = r.rate;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const cc = ELEC_TARIFFS[sel.value];
      toast((t('calc.elec_filled') || 'Electricity set to {rate} {cur}/kWh ({country})')
        .replace('{rate}', r.rate).replace('{cur}', r.currency).replace('{country}', cc ? cc.name : sel.value),
        r.noConvert ? 'warning' : 'success', 4000);
      return true;
    },
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnElecAuto')?.addEventListener('click', openElecRatePicker);
  }, { once: true });
}

// Restore in-progress build from previous session (browser only)
(function restoreCurrentBuild() {
  if (typeof loadJSON !== 'function' || typeof document === 'undefined') return;
  const saved = loadJSON(CURRENT_BUILD_KEY, null);
  if (saved && Array.isArray(saved.parts) && saved.parts.length > 0) {
    currentBuild = saved.parts;
    currentBuildFromProductId = saved.productId || null;
    currentClientId = saved.clientId || null;
    currentExtraLines = saved.extraLines || [];
    // Show toast after DOM ready
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => toast(t('calc.draft_restored'), 'info', 3000), 600);
    }, { once: true });
    // Restore calculator form state after DOM is ready
    if (saved.formState) {
      document.addEventListener('DOMContentLoaded', () => {
        const fs = saved.formState;
        if ($('#margin') && fs.margin)             $('#margin').value       = fs.margin;
        if ($('#spoolCost') && fs.spoolCost)       $('#spoolCost').value    = fs.spoolCost;
        if ($('#spoolWeight') && fs.spoolWeight)   $('#spoolWeight').value  = fs.spoolWeight;
        if ($('#partQty') && fs.partQty)           $('#partQty').value      = fs.partQty;
        if ($('#partName') && fs.partName)         $('#partName').value     = fs.partName;
        if ($('#printWeight') && fs.printWeight)   $('#printWeight').value  = fs.printWeight;
        if ($('#printTime') && fs.printTime)       $('#printTime').value    = fs.printTime;
        if ($('#resinLayers') && fs.resinLayers)           $('#resinLayers').value           = fs.resinLayers;
        if ($('#resinLayerHeight') && fs.resinLayerHeight) $('#resinLayerHeight').value       = fs.resinLayerHeight;
        if ($('#resinExposure') && fs.resinExposure)       $('#resinExposure').value          = fs.resinExposure;
        if ($('#resinBaseLayers') && fs.resinBaseLayers)   $('#resinBaseLayers').value        = fs.resinBaseLayers;
        if ($('#resinBaseExposure') && fs.resinBaseExposure) $('#resinBaseExposure').value    = fs.resinBaseExposure;
        updateResinFieldsVisibility();
        // filamentSelect needs to be restored after the select is populated
        if (fs.filamentId) {
          setTimeout(() => {
            if ($('#filamentSelect')) $('#filamentSelect').value = fs.filamentId;
            updateResinFieldsVisibility();
          }, 100);
        }
      }, { once: true });
    }
  }
})();

function saveBuildDraft() {
  if (currentBuild.length === 0) {
    localStorage.removeItem(CURRENT_BUILD_KEY);
    return;
  }
  saveJSON(CURRENT_BUILD_KEY, {
    parts:      currentBuild,
    productId:  currentBuildFromProductId,
    clientId:   currentClientId,
    extraLines: currentExtraLines,
    savedAt:    new Date().toISOString(),
    // Persist calculator form state
    formState: {
      margin:      $('#margin')?.value || '',
      filamentId:  $('#filamentSelect')?.value || '',
      spoolCost:   $('#spoolCost')?.value || '',
      spoolWeight: $('#spoolWeight')?.value || '',
      partQty:     $('#partQty')?.value || '1',
      partName:    $('#partName')?.value || '',
      printWeight: $('#printWeight')?.value || '',
      printTime:   $('#printTime')?.value || '',
      resinLayers:       $('#resinLayers')?.value || '',
      resinLayerHeight:  $('#resinLayerHeight')?.value || '0.05',
      resinExposure:     $('#resinExposure')?.value || '',
      resinBaseLayers:   $('#resinBaseLayers')?.value || '',
      resinBaseExposure: $('#resinBaseExposure')?.value || '',
    },
  });
}
(function (global) {
/* ============================================================
   Calculator
   ============================================================ */
// Returns { rate, n } suggestion from waste history for a machine+material pair,
// or null if there is insufficient data (< 5 completed jobs).
function suggestedFailureRate(machineId, material) {
  if (!machineId || !material) return null;
  const mat = material.toLowerCase();
  const completed = printLog.filter(o =>
    o.machineId === machineId &&
    o.status === 'completed' &&
    ((o.material || '').toLowerCase() === mat ||
     (o.parts || []).some(p => (p.material || '').toLowerCase() === mat))
  );
  if (completed.length < 5) return null;
  const wastes = wasteLog.filter(w =>
    w.machineId === machineId &&
    (w.material || '').toLowerCase() === mat
  );
  const rate = Math.round((wastes.length / completed.length) * 1000) / 10;
  return { rate, n: completed.length };
}

function updateFailureRateHint() {
  const hint = $('#failureRateHint');
  if (!hint) return;
  const machineId = $('#partMachineId')?.value || '';
  const filamentSel = $('#filamentSelect');
  const material = filamentSel?.options[filamentSel.selectedIndex]?.dataset?.material ||
    (filamentSel?.value ? (inventory.find(i => i.id === filamentSel.value)?.material || '') : '');
  const sugg = suggestedFailureRate(machineId, material);
  if (sugg) {
    hint.textContent = `↗ ${t('calc.fail_suggested') || 'suggested'}: ${sugg.rate}% (${sugg.n} ${t('an.jobs') || 'jobs'})`;
  } else {
    hint.textContent = '';
  }
}

/* computePartBaseCost, getActivePriceTier, computePartBreakdown — renderer/calculator-cost.js */

function calculateLivePartCost() {
  // Snapshot the DOM into a part-shaped object and reuse the pure helper.
  return computePartBaseCost({
    spoolCost:     $('#spoolCost').value,
    spoolWeight:   $('#spoolWeight').value,
    printWeight:   $('#printWeight').value,
    supportWeight: $('#supportWeight')?.value || 0,
    printTime:     $('#printTime').value,
    wearRate:      $('#wearRate').value,
    powerDraw:     $('#powerDraw').value,
    elecRate:      $('#elecRate').value,
    prepTime:      $('#prepTime').value,
    postTime:      $('#postTime').value,
    laborRate:     $('#laborRate').value,
    failureRate:   $('#failureRate').value,
    extraMaterials: currentExtraMaterials.filter(m => m.material && m.weight > 0),
  });
}

function updateGrandTotal() {
  const snap = {
    spoolCost: $('#spoolCost').value, spoolWeight: $('#spoolWeight').value,
    printWeight: $('#printWeight').value, supportWeight: $('#supportWeight')?.value || 0,
    printTime: $('#printTime').value,
    wearRate: $('#wearRate').value, powerDraw: $('#powerDraw').value,
    elecRate: $('#elecRate').value, prepTime: $('#prepTime').value,
    postTime: $('#postTime').value, laborRate: $('#laborRate').value,
    failureRate: $('#failureRate').value,
    filamentId: $('#filamentSelect')?.value || '',
    extraMaterials: currentExtraMaterials.filter(m => m.material && m.weight > 0),
  };
  const bd = computePartBreakdown(snap);
  const liveBase = bd.material + bd.machine + bd.labor + bd.buffer;
  const qty = Math.max(1, Math.round(num($('#partQty').value, 1)));
  const margin = clampPositive($('#margin').value);
  // Apply price tier if one matches current qty
  const activeTier = (() => {
    const tiers = currentPriceTiers.filter(ti => ti.minQty > 0 && ti.pricePerUnit > 0);
    if (tiers.length === 0) return null;
    return [...tiers].sort((a, b) => b.minQty - a.minQty).find(ti => qty >= ti.minQty) || null;
  })();
  const liveUnitPrice = activeTier
    ? activeTier.pricePerUnit
    : liveBase * (1 + margin / 100);
  $('#partLivePrice').textContent = fmtMoney(liveUnitPrice * qty);

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
    totalBase = currentBuild.reduce((s, p) => s + (+p.baseCost || 0), 0);
  } else {
    totalBase = liveBase * qty;
  }
  const discountPct = Math.min(100, Math.max(0, num($('#discountPct').value, 0)));
  const shippingCost = Math.max(0, num($('#shippingCost')?.value, 0));
  const extraLinesTotal = currentExtraLines.reduce((s, l) => s + Math.max(0, +l.amount || 0), 0);
  const priceBeforeDiscount = (currentBuild.length === 0 && activeTier)
    ? activeTier.pricePerUnit * qty
    : totalBase * (1 + margin / 100);
  const discountAmt = priceBeforeDiscount * discountPct / 100;
  const subAfterDiscount = priceBeforeDiscount - discountAmt;
  // Rush fee
  const rushEnabled = !!$('#calcRushFee')?.checked;
  const rushPct = rushEnabled ? num(settings.rushFeePct, 25) : 0;
  const rushFeeAmt = subAfterDiscount * rushPct / 100;
  const finalPrice = subAfterDiscount + rushFeeAmt + shippingCost + extraLinesTotal;
  const finalEl = $('#finalPrice');
  if (finalEl) {
    if (!finalEl.getAttribute('aria-live')) finalEl.setAttribute('aria-live', 'polite');
    finalEl.textContent = fmtMoney(finalPrice);
  }

  let bdForChart = bd;
  let breakdownScope = 'live';
  if (currentBuild.length > 0) {
    bdForChart = currentBuild.reduce((acc, part) => {
      const partBd = computePartBreakdown(part);
      const q = Math.max(1, +part.qty || 1);
      acc.material += partBd.material * q;
      acc.machine += partBd.machine * q;
      acc.labor += partBd.labor * q;
      acc.buffer += partBd.buffer * q;
      return acc;
    }, { material: 0, machine: 0, labor: 0, buffer: 0 });
    breakdownScope = 'cart';
  }
  window.KhaytStudio?.updateCalcBreakdown?.(bdForChart, {
    currency: settings.currency,
    margin,
    finalPrice,
    breakdownScope,
  });

  const discountLine = $('#discountLine');
  if (discountLine) {
    if (discountPct > 0) {
      discountLine.textContent = `−${fmtMoney(discountAmt)} (${discountPct}%)`;
      discountLine.style.display = 'inline';
    } else {
      discountLine.style.display = 'none';
    }
  }

  // Rush fee chip
  const rushChip = $('#rushFeeChip');
  if (rushChip) {
    if (rushEnabled && rushFeeAmt > 0) {
      rushChip.textContent = `⚡ ${t('calc.rush_fee')}: +${rushPct}% (${fmtMoney(rushFeeAmt)})`;
      rushChip.style.display = 'inline-block';
    } else {
      rushChip.style.display = 'none';
    }
  }

  // Min-margin warning + live margin display
  const marginWarn = $('#marginWarning');
  const actualMarginPct = finalPrice > 0 ? ((finalPrice - (totalBase + shippingCost + extraLinesTotal)) / finalPrice) * 100 : margin;
  if (marginWarn) {
    const minPct = num(settings.minMarginPct, 0);
    const marginColor = actualMarginPct >= 40 ? 'var(--success)' : actualMarginPct >= 20 ? 'var(--warning)' : 'var(--danger)';
    const marginDisplay = `<span style="color:${marginColor}; font-weight:600;">${actualMarginPct.toFixed(0)}% margin</span>`;
    if (minPct > 0 && actualMarginPct < minPct) {
      marginWarn.innerHTML = `${marginDisplay} — ${escapeHtml(t('calc.margin_warn', { min: minPct.toFixed(0), actual: actualMarginPct.toFixed(0) }))}`;
      marginWarn.style.display = 'block';
    } else if (totalBase > 0) {
      marginWarn.innerHTML = marginDisplay;
      marginWarn.style.display = 'block';
    } else {
      marginWarn.style.display = 'none';
    }
  }

  // Min order amount warning
  const minOrderWarn = $('#minOrderWarning');
  if (minOrderWarn) {
    const minAmt = num(settings.minOrderAmount, 0);
    if (minAmt > 0 && finalPrice < minAmt) {
      minOrderWarn.textContent = t('calc.min_order_warn', { min: fmtMoney(minAmt) });
      minOrderWarn.style.display = 'block';
    } else {
      minOrderWarn.style.display = 'none';
    }
  }
}

function snapshotPartFromForm() {
  const filamentSelect = $('#filamentSelect');
  const opt = filamentSelect.options[filamentSelect.selectedIndex];
  const qty = Math.max(1, Math.round(num($('#partQty').value, 1)));
  const unitCost = calculateLivePartCost();
  return {
    name:          $('#partName').value.trim() || t('calc.part.name_ph'),
    colour:        ($('#partColour')?.value || '').trim(),
    partNote:      ($('#partNote')?.value || '').trim(),
    material:      opt?.text || '',
    filamentId:    filamentSelect.value,
    spoolCost:     clampPositive($('#spoolCost').value),
    spoolWeight:   Math.max(1, num($('#spoolWeight').value, 1)),
    printWeight:   clampPositive($('#printWeight').value),
    supportWeight: Math.max(0, num($('#supportWeight')?.value, 0)),
    printTime:     clampPositive($('#printTime').value),
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
  if ($('#partColour')) $('#partColour').value = '';
  if ($('#partNote'))   $('#partNote').value   = '';
  if ($('#supportWeight')) $('#supportWeight').value = '';
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
  updateFailureRateHint();

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
          ${partMachine ? `<span class="machine-badge" style="background:${safeCssColor(partMachine.color)}; font-size:10px; padding:1px 6px; vertical-align:middle; margin-inline-start:4px;">${escapeHtml(partMachine.name)}</span>` : ''}
          ${tierBadge}
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(part.material)}</div>
          ${(part.extraMaterials || []).filter(m => m.material).map(m =>
            `<div style="font-size:11px; color:var(--text-muted); margin-inline-start:8px;">+ ${escapeHtml(m.material)} ${m.weight ? m.weight + 'g' : ''}</div>`
          ).join('')}
          ${psHint ? `<div style="font-size:10.5px; color:var(--text-muted); margin-top:1px; font-style:italic;">${escapeHtml(psHint)}</div>` : ''}
          ${part.fileRef ? `<div class="part-file-ref">📎 ${escapeHtml(part.fileRef)}</div>` : ''}
          ${part.colour ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px;">🎨 ${escapeHtml(part.colour)}</div>` : ''}
          ${part.partNote ? `<div style="font-size:11px;color:var(--text-dim);margin-top:1px;font-style:italic;">📝 ${escapeHtml(part.partNote)}</div>` : ''}
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
  updateResinFieldsVisibility();
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
  if (currentPriceTiers.length === 0) {
    el.innerHTML = `<p style="font-size:12px; color:var(--text-muted); margin:4px 0;">${escapeHtml(t('calc.no_price_tiers') || 'No volume tiers — click + Add tier for quantity pricing')}</p>`;
    return;
  }
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

async function deleteCurrentPreset() {
  const val = $('#printerPreset').value;
  if (!val) return;
  const ok = await confirmModal(t('common.delete') + '?', { danger: true });
  if (!ok) return;
  printers = printers.filter(p => p.id !== val);
  saveAll();
  renderPrinterPresets();
  toast(t('calc.machine.preset_deleted'), 'success');
}

/* ============================================================
   Job Templates — save/load full job configs
   ============================================================ */
function renderJobTemplateSelect() {
  const sel = $('#jobTemplateSelect');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = [
    `<option value="">${escapeHtml(t('tpl.job_no_tpl') || 'No template')}</option>`,
    ...(settings.jobTemplates || []).map(tpl =>
      `<option value="${escapeHtml(tpl.id)}">${escapeHtml(tpl.name)}</option>`)
  ].join('');
  if ((settings.jobTemplates || []).find(t => t.id === prev)) sel.value = prev;
  const delBtn = $('#btnDeleteJobTemplate');
  if (delBtn) delBtn.style.display = sel.value ? 'inline-flex' : 'none';
}

function applyJobTemplate(tplId) {
  const tpl = (settings.jobTemplates || []).find(t => t.id === tplId);
  if (!tpl) return;
  if (tpl.margin      !== undefined && $('#margin'))      $('#margin').value      = tpl.margin;
  if (tpl.spoolCost   !== undefined && $('#spoolCost'))   $('#spoolCost').value   = tpl.spoolCost;
  if (tpl.spoolWeight !== undefined && $('#spoolWeight')) $('#spoolWeight').value = tpl.spoolWeight;
  if (tpl.printWeight !== undefined && $('#printWeight')) $('#printWeight').value = tpl.printWeight;
  if (tpl.printTime   !== undefined && $('#printTime'))   $('#printTime').value   = tpl.printTime;
  if (tpl.wearRate    !== undefined && $('#wearRate'))    $('#wearRate').value    = tpl.wearRate;
  if (tpl.powerDraw   !== undefined && $('#powerDraw'))   $('#powerDraw').value   = tpl.powerDraw;
  if (tpl.elecRate    !== undefined && $('#elecRate'))    $('#elecRate').value    = tpl.elecRate;
  if (tpl.laborRate   !== undefined && $('#laborRate'))   $('#laborRate').value   = tpl.laborRate;
  if (tpl.filamentId  !== undefined && $('#filamentSelect')) {
    $('#filamentSelect').value = tpl.filamentId;
    $('#filamentSelect').dispatchEvent(new Event('change'));
  }
  updateGrandTotal();
  toast(t('tpl.job_applied') || `Template "${tpl.name}" applied`, 'success', 2500);
}

function saveCurrentAsJobTemplate() {
  openFormModal({
    title: t('tpl.job_save') || 'Save Job Template',
    sizeLg: false,
    saveLabel: t('common.save'),
    bodyHtml: `
      <label>${escapeHtml(t('tpl.job_name') || 'Template name')}</label>
      <input type="text" id="_jobTplNameInput" placeholder="${escapeHtml(t('tpl.job_name_ph') || 'e.g. Large PLA Print')}">
      <label style="margin-top:12px; font-size:11.5px; color:var(--text-muted);">${escapeHtml(t('tpl.job_captures') || 'Captures: margin, spool cost/weight, print weight, time, machine rates, material')}</label>`,
    onMount(modal) { setTimeout(() => modal.querySelector('#_jobTplNameInput')?.focus(), 40); },
    onSave(modal) {
      const name = (modal.querySelector('#_jobTplNameInput')?.value || '').trim();
      if (!name) { toast(t('tpl.need_name') || 'Name required', 'error'); return false; }
      if (!settings.jobTemplates) settings.jobTemplates = [];
      const existingIdx = settings.jobTemplates.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
      const tpl = {
        id:          existingIdx >= 0 ? settings.jobTemplates[existingIdx].id : uid('JTPL'),
        name,
        margin:      $('#margin')?.value || '',
        spoolCost:   $('#spoolCost')?.value || '',
        spoolWeight: $('#spoolWeight')?.value || '',
        printWeight: $('#printWeight')?.value || '',
        printTime:   $('#printTime')?.value || '',
        wearRate:    $('#wearRate')?.value || '',
        powerDraw:   $('#powerDraw')?.value || '',
        elecRate:    $('#elecRate')?.value || '',
        laborRate:   $('#laborRate')?.value || '',
        filamentId:  $('#filamentSelect')?.value || '',
        savedAt:     new Date().toISOString(),
      };
      if (existingIdx >= 0) settings.jobTemplates[existingIdx] = tpl;
      else settings.jobTemplates.push(tpl);
      saveAll();
      renderJobTemplateSelect();
      $('#jobTemplateSelect').value = tpl.id;
      const delBtn = $('#btnDeleteJobTemplate');
      if (delBtn) delBtn.style.display = 'inline-flex';
      toast(t('tpl.job_saved') || `Template "${name}" saved`, 'success');
      return true;
    }
  });
}

async function deleteCurrentJobTemplate() {
  const sel = $('#jobTemplateSelect');
  if (!sel?.value) return;
  const ok = await confirmModal(t('common.delete') + '?', { danger: true });
  if (!ok) return;
  if (!settings.jobTemplates) return;
  settings.jobTemplates = settings.jobTemplates.filter(t => t.id !== sel.value);
  saveAll();
  renderJobTemplateSelect();
  toast(t('tpl.job_deleted') || 'Template deleted', 'success');
}

/* ============================================================
   Resin Exposure Profile Presets
   ============================================================ */
function renderResinProfiles() {
  const sel = $('#resinProfileSelect');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = [
    `<option value="">${escapeHtml(t('resin.no_profile') || 'No profile')}</option>`,
    ...(settings.resinProfiles || []).map(p =>
      `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
  ].join('');
  if ((settings.resinProfiles || []).find(p => p.id === prev)) sel.value = prev;
  const delBtn = $('#btnDeleteResinProfile');
  if (delBtn) delBtn.style.display = sel.value ? 'inline-flex' : 'none';
}

function applyResinProfile(profileId) {
  const profile = (settings.resinProfiles || []).find(p => p.id === profileId);
  if (!profile) return;
  if (profile.layers      !== undefined && $('#resinLayers'))      $('#resinLayers').value      = profile.layers;
  if (profile.layerHeight !== undefined && $('#resinLayerHeight')) $('#resinLayerHeight').value = profile.layerHeight;
  if (profile.exposure    !== undefined && $('#resinExposure'))    $('#resinExposure').value    = profile.exposure;
  if (profile.baseLayers  !== undefined && $('#resinBaseLayers'))  $('#resinBaseLayers').value  = profile.baseLayers;
  if (profile.baseExposure!== undefined && $('#resinBaseExposure'))$('#resinBaseExposure').value= profile.baseExposure;
  toast(t('resin.profile_applied') || `Profile "${profile.name}" applied`, 'success', 2000);
}

function saveCurrentAsResinProfile() {
  openFormModal({
    title: t('resin.save_profile') || 'Save Resin Profile',
    sizeLg: false,
    saveLabel: t('common.save'),
    bodyHtml: `
      <label>${escapeHtml(t('resin.profile_name') || 'Profile name')}</label>
      <input type="text" id="_resinProfileNameInput" placeholder="${escapeHtml(t('resin.profile_name_ph') || 'e.g. Elegoo Standard 0.05mm')}">
      <div style="margin-top:10px; font-size:11.5px; color:var(--text-muted);">
        ${escapeHtml(t('resin.profile_captures') || 'Captures: layer count, height, exposure times, base settings')}
      </div>`,
    onMount(modal) { setTimeout(() => modal.querySelector('#_resinProfileNameInput')?.focus(), 40); },
    onSave(modal) {
      const name = (modal.querySelector('#_resinProfileNameInput')?.value || '').trim();
      if (!name) { toast(t('tpl.need_name') || 'Name required', 'error'); return false; }
      if (!settings.resinProfiles) settings.resinProfiles = [];
      const existingIdx = settings.resinProfiles.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
      const profile = {
        id:           existingIdx >= 0 ? settings.resinProfiles[existingIdx].id : uid('RSNP'),
        name,
        layers:       $('#resinLayers')?.value      || '',
        layerHeight:  $('#resinLayerHeight')?.value || '0.05',
        exposure:     $('#resinExposure')?.value    || '',
        baseLayers:   $('#resinBaseLayers')?.value  || '',
        baseExposure: $('#resinBaseExposure')?.value|| '',
        savedAt:      new Date().toISOString(),
      };
      if (existingIdx >= 0) settings.resinProfiles[existingIdx] = profile;
      else settings.resinProfiles.push(profile);
      saveAll();
      renderResinProfiles();
      $('#resinProfileSelect').value = profile.id;
      const delBtn = $('#btnDeleteResinProfile');
      if (delBtn) delBtn.style.display = 'inline-flex';
      toast(t('resin.profile_saved') || `Profile "${name}" saved`, 'success');
      return true;
    }
  });
}

async function deleteCurrentResinProfile() {
  const sel = $('#resinProfileSelect');
  if (!sel?.value) return;
  const ok = await confirmModal(t('common.delete') + '?', { danger: true });
  if (!ok) return;
  if (!settings.resinProfiles) return;
  settings.resinProfiles = settings.resinProfiles.filter(p => p.id !== sel.value);
  saveAll();
  renderResinProfiles();
  toast(t('resin.profile_deleted') || 'Profile deleted', 'success');
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

async function loadQuoteTemplate() {
  const id = $('#quoteTplSelect').value;
  const tpl = templates.find(t => t.id === id);
  if (!tpl) { toast(t('calc.tpl.none'), 'error'); return; }
  if (currentBuild.length > 0) {
    const ok = await confirmModal(
      t('calc.tpl.overwrite_confirm') || 'Loading this template will replace your current build. Continue?',
      { danger: true, okText: t('calc.tpl.overwrite_ok') || 'Load template' }
    );
    if (!ok) return;
  }
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

async function deleteQuoteTemplate() {
  const id = $('#quoteTplSelect').value;
  if (!id) return;
  const ok = await confirmModal(t('common.delete') + '?', { danger: true });
  if (!ok) return;
  templates = templates.filter(tpl => tpl.id !== id);
  saveAll();
  renderQuoteTemplates();
  toast(t('calc.tpl.deleted'), 'success');
}
function populateFilamentDropdown() {
  const select = $('#filamentSelect');
  const previous = select.value;
  select.innerHTML = inventory.map(item => `
    <option value="${item.id}" data-cost="${item.cost}" data-weight="${item.weight}" data-color="${escapeHtml(item.color || '#888888')}">
      ${escapeHtml(item.material)}${item.weight <= (item.reorderPoint ?? settings.lowStockThreshold) ? '  ⚠' : ''}
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

  // Show/hide resin-specific fields
  updateResinFieldsVisibility();

  // Feature 5 (colour library): populate datalist for part colour field
  const colourDL = $('#partColourList');
  if (colourDL) {
    const item = $('#filamentSelect').value ? inventory.find(i => i.id === $('#filamentSelect').value) : null;
    const matKey = item ? item.material : null;
    const colours = matKey ? (settings.filamentColours?.[matKey] || []) : [];
    colourDL.innerHTML = colours.map(c => `<option value="${escapeHtml(c)}">`).join('');
  }
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

function updateResinFieldsVisibility() {
  const fid = $('#filamentSelect')?.value;
  const isResin = fid ? (inventory.find(i => i.id === fid)?.materialType === 'resin') : false;
  const resinRow = $('#resinFieldsRow');
  if (resinRow) resinRow.style.display = isResin ? '' : 'none';
  renderResinProfiles();
  // Swap the printWeight label unit
  const pwUnitEl = $('#printWeightUnit');
  if (pwUnitEl) pwUnitEl.textContent = isResin ? 'mL' : (t('common.grams') || 'g');
}

  const api = {
    saveBuildDraft,
    suggestedFailureRate,
    updateFailureRateHint,
    calculateLivePartCost,
    updateGrandTotal,
    snapshotPartFromForm,
    addPart,
    removePart,
    editPart,
    renderBuild,
    renderExtraLines,
    renderExtraMaterials,
    renderPriceTiers,
    renderCartBanner,
    renderPrinterPresets,
    updateDeletePresetBtn,
    applyPreset,
    saveCurrentAsPreset,
    deleteCurrentPreset,
    renderJobTemplateSelect,
    applyJobTemplate,
    saveCurrentAsJobTemplate,
    deleteCurrentJobTemplate,
    renderResinProfiles,
    applyResinProfile,
    saveCurrentAsResinProfile,
    deleteCurrentResinProfile,
    renderQuoteTemplates,
    updateDeleteTplBtn,
    loadQuoteTemplate,
    saveQuoteTemplate,
    deleteQuoteTemplate,
    populateFilamentDropdown,
    updateFilamentColorDot,
    handleFilamentChange,
    updateSpoolPicker,
    updateResinFieldsVisibility,
  };

  Object.assign(global, api);
  global.KhaytBuild = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
