/**
 * Design themes (visual identity) + accent presets.
 * Appearance (dark/light/system) is separate — see applyTheme() in shell.js.
 */
(function (global) {
  const ACCENTS = {
    cyan:  { h: 187, s: '76%', l: '53%', labelKey: 'theme.accent.cyan' },
    teal:  { h: 171, s: '58%', l: '45%', labelKey: 'theme.accent.teal' },
    aqua:  { h: 184, s: '66%', l: '64%', labelKey: 'theme.accent.aqua' },
    sky:   { h: 200, s: '82%', l: '57%', labelKey: 'theme.accent.sky' },
    azure: { h: 213, s: '72%', l: '61%', labelKey: 'theme.accent.azure' },
  };

  const DESIGNS = {
    studio:  { labelKey: 'theme.design.studio',  descKey: 'theme.design.studio_desc' },
    classic: { labelKey: 'theme.design.classic', descKey: 'theme.design.classic_desc' },
  };

  function tr(key, fallback) {
    if (typeof t === 'function') {
      const v = t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function applyAccent(accentId) {
    const root = document.documentElement;
    const preset = ACCENTS[accentId] || ACCENTS.cyan;
    root.style.setProperty('--accent-h', String(preset.h));
    root.style.setProperty('--accent-s', preset.s);
    root.style.setProperty('--accent-l', preset.l);
    root.dataset.accent = accentId;
  }

  function applyDesignTheme(designId) {
    const design = DESIGNS[designId] ? designId : 'studio';
    const root = document.documentElement;
    root.dataset.design = design;
    document.body.classList.toggle('khayt-studio', design === 'studio');
    if (design === 'classic') {
      root.style.removeProperty('--accent-h');
      root.style.removeProperty('--accent-s');
      root.style.removeProperty('--accent-l');
    } else if (typeof settings !== 'undefined') {
      applyAccent(settings.accent || 'cyan');
    }
  }

  function applyDesignSettings() {
    const design = settings?.designTheme || 'studio';
    const accent = settings?.accent || 'cyan';
    applyDesignTheme(design);
    if (design === 'studio') applyAccent(accent);
    syncDesignSettingsUi();
  }

  function syncDesignSettingsUi() {
    const designEl = document.getElementById('set_designTheme');
    const accentEl = document.getElementById('set_accent');
    const accentWrap = document.getElementById('set_accent_wrap');
    if (designEl) designEl.value = settings?.designTheme || 'studio';
    if (accentEl) accentEl.value = settings?.accent || 'cyan';
    if (accentWrap) {
      accentWrap.style.display = (settings?.designTheme || 'studio') === 'studio' ? '' : 'none';
    }
  }

  function populateDesignSelects() {
    const designEl = document.getElementById('set_designTheme');
    const accentEl = document.getElementById('set_accent');
    if (designEl && !designEl.options.length) {
      designEl.innerHTML = Object.entries(DESIGNS).map(([id, d]) =>
        `<option value="${id}">${escapeHtml(tr(d.labelKey, id))}</option>`,
      ).join('');
    }
    if (accentEl && !accentEl.options.length) {
      accentEl.innerHTML = Object.entries(ACCENTS).map(([id, a]) =>
        `<option value="${id}">${escapeHtml(tr(a.labelKey, id))}</option>`,
      ).join('');
    }
  }

  const api = {
    ACCENTS,
    DESIGNS,
    applyAccent,
    applyDesignTheme,
    applyDesignSettings,
    syncDesignSettingsUi,
    populateDesignSelects,
  };

  Object.assign(global, api);
  global.KhaytThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
