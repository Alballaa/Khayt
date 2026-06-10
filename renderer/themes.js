/**
 * Design themes (visual identity) + accent presets.
 * Appearance (dark/light/system) is separate — see applyTheme() in shell.js.
 */
(function (global) {
  const reg = () => global.KhaytThemeRegistry;

  function tr(key, fallback) {
    if (typeof t === 'function') {
      const v = t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  function themeLabel(theme, id) {
    if (theme.label) return theme.label;
    return tr(theme.labelKey, id);
  }

  function applyAccent(accentId, accentSet) {
    const root = document.documentElement;
    const design = reg()?.normalizeDesignId(root.dataset.design || 'studio') || 'studio';
    const set = accentSet || reg()?.accentsForTheme(design) || {};
    const preset = set[accentId] || set[reg()?.defaultAccentForTheme(design)];
    if (!preset) return;
    root.style.setProperty('--accent-h', String(preset.h));
    root.style.setProperty('--accent-s', preset.s);
    root.style.setProperty('--accent-l', preset.l);
    root.dataset.accent = accentId;
  }

  function syncSidebarSubtitle(designId) {
    const sub = document.querySelector('.sidebar-subtitle');
    if (!sub) return;
    const theme = reg()?.getTheme(designId);
    if (theme?.shell === 'ledger') sub.textContent = 'خيط · LEDGER';
    else if (theme?.custom) sub.textContent = `خيط · ${(theme.label || designId).toUpperCase()}`;
    else sub.textContent = 'خيط · STUDIO';
  }

  function unloadCustomThemeStyles() {
    document.querySelectorAll('link[data-khayt-theme-pack="custom"]').forEach((el) => el.remove());
  }

  function loadCustomThemeStyles(theme) {
    unloadCustomThemeStyles();
    if (!theme?.custom || !theme.stylesheets?.length) return;
    theme.stylesheets.forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.khaytThemePack = 'custom';
      document.head.appendChild(link);
    });
  }

  function applyBodyClasses(designId) {
    const theme = reg()?.getTheme(designId);
    const shell = theme?.shell || 'studio';
    document.body.classList.toggle('khayt-studio', shell === 'studio');
    document.body.classList.toggle('khayt-ledger', shell === 'ledger');
    document.body.classList.toggle('khayt-shell-default', shell === 'default');

    document.querySelectorAll('[data-khayt-body-class]').forEach((el) => {
      el.classList.remove(el.dataset.khaytBodyClass);
      delete el.dataset.khaytBodyClass;
    });
    if (theme?.bodyClass && !['khayt-studio', 'khayt-ledger'].includes(theme.bodyClass)) {
      document.body.classList.add(theme.bodyClass);
      document.body.dataset.khaytBodyClass = theme.bodyClass;
    }
  }

  function applyDesignTheme(designId) {
    const id = reg()?.normalizeDesignId(designId) || 'studio';
    const theme = reg()?.getTheme(id);
    const root = document.documentElement;
    root.dataset.design = id;
    loadCustomThemeStyles(theme);
    applyBodyClasses(id);
    syncSidebarSubtitle(id);
    if (typeof settings !== 'undefined') {
      const accent = reg()?.normalizeAccent(id, settings.accent) || 'cyan';
      if (settings.accent !== accent) settings.accent = accent;
      applyAccent(accent, reg()?.accentsForTheme(id));
    }
    global.KhaytLedgerShell?.apply?.(id);
  }

  function applyDesignSettings() {
    if (typeof settings !== 'undefined' && settings.designTheme === 'classic') {
      settings.designTheme = 'ledger';
    }
    const design = reg()?.normalizeDesignId(settings?.designTheme || 'studio') || 'studio';
    const accent = reg()?.normalizeAccent(design, settings?.accent) || 'cyan';
    if (settings && settings.accent !== accent) settings.accent = accent;
    applyDesignTheme(design);
    applyAccent(accent, reg()?.accentsForTheme(design));
    syncDesignSettingsUi();
  }

  function syncDesignSettingsUi() {
    const designEl = document.getElementById('set_designTheme');
    const accentEl = document.getElementById('set_accent');
    const accentWrap = document.getElementById('set_accent_wrap');
    const comingSoonEl = document.getElementById('set_designTheme_coming_soon');
    const design = reg()?.normalizeDesignId(settings?.designTheme || 'studio') || 'studio';
    if (designEl) designEl.value = design;
    populateAccentSelect(design);
    const accent = reg()?.normalizeAccent(design, settings?.accent);
    if (accentEl) accentEl.value = accent;
    if (accentWrap) accentWrap.style.display = '';
    if (comingSoonEl && reg()?.listComingSoonThemes) {
      const soon = reg().listComingSoonThemes();
      comingSoonEl.textContent = soon.length
        ? tr('theme.design.coming_soon', 'More themes coming soon:') + ' ' + soon.map((id) => tr(reg().getTheme(id).labelKey, id)).join(', ')
        : '';
    }
  }

  function populateDesignSelects() {
    const designEl = document.getElementById('set_designTheme');
    if (!designEl || !reg()) return;

    const selectable = reg().listSelectableThemes();
    const comingSoon = reg().listComingSoonThemes();
    let html = '<optgroup label="' + escapeHtml(tr('theme.design.group_builtin', 'Built-in')) + '">';
    html += selectable.filter((id) => !reg().isCustomThemeId(id)).map((id) => {
      const theme = reg().getTheme(id);
      return `<option value="${escapeHtml(id)}">${escapeHtml(themeLabel(theme, id))}</option>`;
    }).join('');
    html += '</optgroup>';

    const custom = selectable.filter((id) => reg().isCustomThemeId(id));
    if (custom.length) {
      html += '<optgroup label="' + escapeHtml(tr('theme.design.group_custom', 'Community')) + '">';
      html += custom.map((id) => {
        const theme = reg().getTheme(id);
        return `<option value="${escapeHtml(id)}">${escapeHtml(themeLabel(theme, id))}</option>`;
      }).join('');
      html += '</optgroup>';
    }

    if (comingSoon.length) {
      html += '<optgroup label="' + escapeHtml(tr('theme.design.group_soon', 'Coming soon')) + '">';
      html += comingSoon.map((id) => {
        const theme = reg().getTheme(id);
        return `<option value="${escapeHtml(id)}" disabled>${escapeHtml(themeLabel(theme, id))}</option>`;
      }).join('');
      html += '</optgroup>';
    }

    designEl.innerHTML = html;
    populateAccentSelect(reg().normalizeDesignId(settings?.designTheme || 'studio'));
  }

  function populateAccentSelect(designId) {
    const accentEl = document.getElementById('set_accent');
    if (!accentEl || !reg()) return;
    const design = reg().normalizeDesignId(designId);
    const set = reg().accentsForTheme(design);
    accentEl.innerHTML = Object.entries(set).map(([id, a]) =>
      `<option value="${id}">${escapeHtml(tr(a.labelKey, a.label || id))}</option>`,
    ).join('');
  }

  const api = {
    applyAccent,
    applyDesignTheme,
    applyDesignSettings,
    syncDesignSettingsUi,
    populateDesignSelects,
    populateAccentSelect,
    normalizeDesign: (id) => reg()?.normalizeDesignId(id) || 'studio',
    accentsForDesign: (id) => reg()?.accentsForTheme(id) || {},
    DESIGNS: reg()?.BUILTIN_THEMES,
    ACCENTS: reg()?.STUDIO_ACCENTS,
    STUDIO_ACCENTS: reg()?.STUDIO_ACCENTS,
    LEDGER_ACCENTS: reg()?.LEDGER_ACCENTS,
  };

  Object.assign(global, api);
  global.KhaytThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
