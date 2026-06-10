/**
 * Design themes (visual identity) + accent presets.
 * Appearance (dark/light/system) is separate — see applyTheme() in shell.js.
 */
(function (global) {
  const STUDIO_ACCENTS = {
    cyan:  { h: 187, s: '76%', l: '53%', labelKey: 'theme.accent.cyan' },
    teal:  { h: 171, s: '58%', l: '45%', labelKey: 'theme.accent.teal' },
    aqua:  { h: 184, s: '66%', l: '64%', labelKey: 'theme.accent.aqua' },
    sky:   { h: 200, s: '82%', l: '57%', labelKey: 'theme.accent.sky' },
    azure: { h: 213, s: '72%', l: '61%', labelKey: 'theme.accent.azure' },
  };

  const LEDGER_ACCENTS = {
    safety:      { h: 24,  s: '88%', l: '48%', labelKey: 'theme.accent.safety' },
    ultramarine: { h: 224, s: '72%', l: '46%', labelKey: 'theme.accent.ultramarine' },
    press:       { h: 152, s: '50%', l: '34%', labelKey: 'theme.accent.press' },
    cyan:        { h: 189, s: '80%', l: '38%', labelKey: 'theme.accent.filament_cyan' },
  };

  const DESIGNS = {
    studio: { labelKey: 'theme.design.studio', descKey: 'theme.design.studio_desc' },
    ledger: { labelKey: 'theme.design.ledger', descKey: 'theme.design.ledger_desc' },
  };

  function tr(key, fallback) {
    if (typeof t === 'function') {
      const v = t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function normalizeDesign(designId) {
    if (designId === 'classic') return 'ledger';
    return DESIGNS[designId] ? designId : 'studio';
  }

  function accentsForDesign(designId) {
    return normalizeDesign(designId) === 'ledger' ? LEDGER_ACCENTS : STUDIO_ACCENTS;
  }

  function defaultAccentForDesign(designId) {
    return normalizeDesign(designId) === 'ledger' ? 'safety' : 'cyan';
  }

  function normalizeAccent(designId, accentId) {
    const set = accentsForDesign(designId);
    if (accentId && set[accentId]) return accentId;
    return defaultAccentForDesign(designId);
  }

  function applyAccent(accentId, accentSet) {
    const root = document.documentElement;
    const set = accentSet || accentsForDesign(root.dataset.design || 'studio');
    const preset = set[accentId] || set[defaultAccentForDesign(root.dataset.design)];
    root.style.setProperty('--accent-h', String(preset.h));
    root.style.setProperty('--accent-s', preset.s);
    root.style.setProperty('--accent-l', preset.l);
    root.dataset.accent = accentId;
  }

  function syncSidebarSubtitle(design) {
    const sub = document.querySelector('.sidebar-subtitle');
    if (!sub) return;
    sub.textContent = design === 'ledger' ? 'خيط · LEDGER' : 'خيط · STUDIO';
  }

  function applyDesignTheme(designId) {
    const design = normalizeDesign(designId);
    const root = document.documentElement;
    root.dataset.design = design;
    document.body.classList.toggle('khayt-studio', design === 'studio');
    document.body.classList.toggle('khayt-ledger', design === 'ledger');
    syncSidebarSubtitle(design);
    if (typeof settings !== 'undefined') {
      const accent = normalizeAccent(design, settings.accent);
      if (settings.accent !== accent) settings.accent = accent;
      applyAccent(accent, accentsForDesign(design));
    }
  }

  function applyDesignSettings() {
    if (typeof settings !== 'undefined' && settings.designTheme === 'classic') {
      settings.designTheme = 'ledger';
    }
    const design = normalizeDesign(settings?.designTheme || 'studio');
    const accent = normalizeAccent(design, settings?.accent);
    if (settings && settings.accent !== accent) settings.accent = accent;
    applyDesignTheme(design);
    applyAccent(accent, accentsForDesign(design));
    syncDesignSettingsUi();
  }

  function syncDesignSettingsUi() {
    const designEl = document.getElementById('set_designTheme');
    const accentEl = document.getElementById('set_accent');
    const accentWrap = document.getElementById('set_accent_wrap');
    const design = normalizeDesign(settings?.designTheme || 'studio');
    if (designEl) designEl.value = design;
    populateAccentSelect(design);
    const accent = normalizeAccent(design, settings?.accent);
    if (accentEl) accentEl.value = accent;
    if (accentWrap) accentWrap.style.display = '';
  }

  function populateDesignSelects() {
    const designEl = document.getElementById('set_designTheme');
    if (designEl && !designEl.options.length) {
      designEl.innerHTML = Object.entries(DESIGNS).map(([id, d]) =>
        `<option value="${id}">${escapeHtml(tr(d.labelKey, id))}</option>`,
      ).join('');
    }
    populateAccentSelect(normalizeDesign(settings?.designTheme || 'studio'));
  }

  function populateAccentSelect(designId) {
    const accentEl = document.getElementById('set_accent');
    if (!accentEl) return;
    const design = normalizeDesign(designId);
    const set = accentsForDesign(design);
    accentEl.innerHTML = Object.entries(set).map(([id, a]) =>
      `<option value="${id}">${escapeHtml(tr(a.labelKey, id))}</option>`,
    ).join('');
  }

  const api = {
    STUDIO_ACCENTS,
    LEDGER_ACCENTS,
    ACCENTS: STUDIO_ACCENTS,
    DESIGNS,
    accentsForDesign,
    normalizeDesign,
    normalizeAccent,
    applyAccent,
    applyDesignTheme,
    applyDesignSettings,
    syncDesignSettingsUi,
    populateDesignSelects,
    populateAccentSelect,
  };

  Object.assign(global, api);
  global.KhaytThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
