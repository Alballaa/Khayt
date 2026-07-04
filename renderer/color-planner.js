'use strict';
/*
 * Multicolour print planner (3.1 Colour Mixer) — the centrepiece of the colour suite.
 *
 * Launched from a print-file library card that carries multiple extracted colours
 * (renderer/printfiles.js "Plan colours" button) or from the Colour tab. For each
 * colour the file needs it lets the maker assign an inventory filament (defaulting to
 * the nearest ΔE match), edit grams, and see per-colour cost + swap count, then push
 * the whole thing to the cost calculator as ONE synthesized part.
 *
 * The synthesis needs NO change to the cost maths: we set spoolCost = Σ material cost,
 * spoolWeight = printWeight = Σ grams, so computePartBaseCost's (spoolCost/spoolWeight)
 * × printWeight collapses to the true blended material cost. The part also carries
 * part.colours = [{filamentId, hex, grams, cost}] so completion deduction draws from
 * each colour's own spool (see deductFilamentForOrder). Reads live `inventory`.
 */
(function (global) {
  const KC = () => global.KhaytColor;

  function coloredFilaments() {
    const list = Array.isArray(inventory) ? inventory : [];
    const kc = KC();
    return kc ? list.filter((it) => it && kc.hexToRgb(it.color)) : [];
  }
  function filamentLabel(it) {
    return [it.material, it.colourVariant].filter(Boolean).join(' — ') || (t('cmix.filament') || 'Filament');
  }
  function swatch(hex, size) {
    const s = size || 18;
    return `<span class="cs-swatch" style="background:${safeCssColor(hex, '#888')};width:${s}px;height:${s}px;"></span>`;
  }
  const costPerGram = (it) => (it ? (+it.cost || 0) / Math.max(1, +it.weight || 1) : 0);
  const money = (n) => (typeof fmtMoney === 'function' ? fmtMoney(n) : (Math.round(n * 100) / 100).toFixed(2));

  // Which print-file records can be planned (more than one colour).
  function plannableFiles() {
    return (Array.isArray(printFiles) ? printFiles : [])
      .filter((r) => Array.isArray(r.colors) && r.colors.filter((c) => c && c.hex).length > 1);
  }

  function openColorPlanner(rec) {
    const colours = (rec && Array.isArray(rec.colors)) ? rec.colors.filter((c) => c && c.hex) : [];
    if (colours.length < 1) { toast(t('plan.no_colours') || 'This file has no colour data to plan.', 'error'); return; }
    const kc = KC();
    const cands = coloredFilaments();
    if (!cands.length) { toast(t('plan.no_filaments') || 'Add filaments with a hex colour first.', 'error'); return; }

    const saved = Array.isArray(rec.colorPlan) ? rec.colorPlan : [];
    const plan = colours.map((c, i) => {
      const prev = saved.find((s) => String(s.hex).toLowerCase() === String(c.hex).toLowerCase());
      const near = kc.nearest(c.hex, cands, { limit: 1 })[0];
      const fid = prev && cands.some((x) => x.id === prev.filamentId) ? prev.filamentId : (near ? near.id : (cands[0] && cands[0].id) || '');
      return { hex: c.hex, label: c.label || `#${i + 1}`, grams: +(prev && prev.grams != null ? prev.grams : c.grams) || 0, filamentId: fid };
    });

    const optionsFor = (fid) =>
      `<option value="">${escapeHtml(t('plan.unassigned') || '— none —')}</option>` +
      cands.map((it) => `<option value="${escapeHtml(it.id)}"${it.id === fid ? ' selected' : ''}>${escapeHtml(filamentLabel(it))}</option>`).join('');

    const rowHtml = (p, i) => `
      <tr data-i="${i}">
        <td class="cp-c">${swatch(p.hex, 20)}<span class="cp-hex">${escapeHtml(String(p.hex).toUpperCase())}</span>${p.label ? `<span class="cp-lbl">${escapeHtml(p.label)}</span>` : ''}</td>
        <td><select class="cp-fil" data-i="${i}">${optionsFor(p.filamentId)}</select> <span class="cp-de" data-de="${i}"></span></td>
        <td><input type="number" class="cp-g" data-i="${i}" min="0" step="0.1" value="${p.grams}" style="width:80px;"></td>
        <td class="cp-cost" data-cost="${i}">—</td>
      </tr>`;

    const body = `
      <p class="cp-hint">${escapeHtml(t('plan.hint') || 'Assign each colour to a filament you own. Grams default to the sliced estimate; the total is pushed to the calculator as one part.')}</p>
      <div class="cp-table-wrap">
        <table class="cp-table">
          <thead><tr>
            <th>${escapeHtml(t('plan.colour') || 'Colour')}</th>
            <th>${escapeHtml(t('plan.filament') || 'Filament')}</th>
            <th>${escapeHtml(t('plan.grams') || 'Grams')}</th>
            <th>${escapeHtml(t('plan.cost') || 'Cost')}</th>
          </tr></thead>
          <tbody id="cpBody">${plan.map(rowHtml).join('')}</tbody>
          <tfoot><tr>
            <td class="cp-tot-lbl">${escapeHtml(t('plan.total') || 'Total')} <span id="cpSwaps" class="cp-swaps"></span></td>
            <td></td>
            <td id="cpTotG" class="cp-tot">—</td>
            <td id="cpTotCost" class="cp-tot">—</td>
          </tr></tfoot>
        </table>
      </div>`;

    openFormModal({
      title: `🎨 ${t('plan.title') || 'Plan colours'} — ${rec.name || rec.originalName || ''}`,
      bodyHtml: body,
      saveLabel: t('plan.add_to_calc') || 'Add to calculator',
      onMount: (modal) => {
        const recompute = () => {
          let totG = 0, totC = 0;
          plan.forEach((p, i) => {
            const it = cands.find((x) => x.id === p.filamentId);
            const c = costPerGram(it) * (p.grams || 0);
            totG += p.grams || 0; totC += c;
            const costEl = modal.querySelector(`[data-cost="${i}"]`);
            if (costEl) costEl.textContent = it ? money(c) : '—';
            const deEl = modal.querySelector(`[data-de="${i}"]`);
            if (deEl) {
              const de = it ? kc.deltaE(p.hex, it.color) : Infinity;
              deEl.textContent = isFinite(de) ? `ΔE ${de.toFixed(1)}` : '';
              deEl.className = 'cp-de' + (isFinite(de) ? (de < 5 ? ' good' : de < 12 ? ' ok' : ' far') : '');
            }
          });
          const tg = modal.querySelector('#cpTotG'); if (tg) tg.textContent = `${Math.round(totG * 10) / 10} g`;
          const tc = modal.querySelector('#cpTotCost'); if (tc) tc.textContent = money(totC);
          const sw = modal.querySelector('#cpSwaps');
          if (sw) sw.textContent = rec.swapCount > 0 ? `· ↔ ${rec.swapCount} ${t('plib.swaps') || 'swaps'}` : '';
        };
        modal.querySelectorAll('.cp-fil').forEach((sel) => {
          sel.onchange = () => { plan[+sel.dataset.i].filamentId = sel.value; recompute(); };
        });
        modal.querySelectorAll('.cp-g').forEach((inp) => {
          inp.oninput = () => { plan[+inp.dataset.i].grams = Math.max(0, +inp.value || 0); recompute(); };
        });
        recompute();
      },
      onSave: () => {
        const assigned = plan.filter((p) => p.filamentId && p.grams > 0);
        if (!assigned.length) { toast(t('plan.assign_first') || 'Assign a filament and grams to at least one colour.', 'error'); return false; }
        // Persist the assignment so re-opening the file remembers it.
        rec.colorPlan = plan.map((p) => ({ hex: p.hex, filamentId: p.filamentId, grams: p.grams }));
        if (typeof saveAll === 'function') saveAll();
        addPlannedPartToCalculator(rec, assigned);
        if (typeof switchTab === 'function') switchTab('calculator-tab');
        toast(t('plan.added') || 'Added to the cost calculator.', 'success');
        return true;
      },
    });
  }

  // Synthesize ONE calculator part from an assigned colour plan and push it onto the
  // current build. Machine/labour rate fields are read from the live calculator form so
  // the synthesized part costs consistently with a normally-entered part.
  function addPlannedPartToCalculator(rec, assigned) {
    const cands = coloredFilaments();
    const colours = assigned.map((p) => {
      const it = cands.find((x) => x.id === p.filamentId);
      return { filamentId: p.filamentId, hex: p.hex, grams: p.grams, cost: costPerGram(it) * p.grams };
    });
    const totalGrams = colours.reduce((s, c) => s + c.grams, 0);
    const totalCost = colours.reduce((s, c) => s + c.cost, 0);
    const dominant = [...colours].sort((a, b) => b.grams - a.grams)[0];
    const rf = (id) => (typeof clampPositive === 'function' ? clampPositive($(id) && $(id).value) : Math.max(0, +($(id) && $(id).value) || 0));

    const part = {
      name: `${rec.name || rec.originalName || 'Multicolour'} ${t('plan.suffix') || '(multicolour)'}`.trim(),
      colour: colours.map((c) => String(c.hex).toUpperCase()).join(' / '),
      material: t('plan.material_label') || 'Multicolour',
      filamentId: dominant ? dominant.filamentId : '',
      spoolCost: totalCost,
      spoolWeight: Math.max(1, totalGrams),
      printWeight: totalGrams,
      supportWeight: 0,
      printTime: (rec.parsed && +rec.parsed.printTimeMins) || rf('#printTime'),
      wearRate: rf('#wearRate'),
      powerDraw: rf('#powerDraw'),
      elecRate: rf('#elecRate'),
      prepTime: rf('#prepTime'),
      postTime: rf('#postTime'),
      laborRate: rf('#laborRate'),
      failureRate: rf('#failureRate'),
      qty: 1,
      extraMaterials: [],
      priceTiers: [],
      colours,
      fileRef: rec.name || rec.originalName || '',
    };
    part.unitCost = (typeof computePartBaseCost === 'function') ? computePartBaseCost(part) : totalCost;
    part.baseCost = part.unitCost * part.qty;
    part.id = (typeof uid === 'function') ? uid('PRT') : ('PRT-' + totalGrams + '-' + colours.length);

    if (!Array.isArray(currentBuild)) return;
    currentBuild.push(part);
    if (typeof renderBuild === 'function') renderBuild();
    if (typeof saveBuildDraft === 'function') saveBuildDraft();
  }

  const pub = { openColorPlanner, plannableFiles };
  Object.assign(global, pub);
  global.KhaytColorPlanner = pub;
  if (typeof module !== 'undefined' && module.exports) module.exports = pub;
})(typeof globalThis !== 'undefined' ? globalThis : this);
