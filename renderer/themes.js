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
    else if (theme?.shell === 'console') sub.textContent = 'خيط · CONTROL ROOM';
    else if (theme?.shell === 'atelier') sub.textContent = 'خيط · ATELIER';
    else if (theme?.shell === 'vitrine') sub.textContent = 'خيط · VITRINE';
    else if (theme?.shell === 'cockpit') sub.textContent = 'خيط · COCKPIT';
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
    document.body.classList.toggle('khayt-console', shell === 'console');
    document.body.classList.toggle('khayt-atelier', shell === 'atelier');
    document.body.classList.toggle('khayt-vitrine', shell === 'vitrine');
    document.body.classList.toggle('khayt-cockpit', shell === 'cockpit');
    document.body.classList.toggle('khayt-shell-default', shell === 'default');
    document.body.classList.toggle('khayt-handoff', reg()?.usesHandoffScreens?.(shell) === true);

    document.querySelectorAll('[data-khayt-body-class]').forEach((el) => {
      el.classList.remove(el.dataset.khaytBodyClass);
      delete el.dataset.khaytBodyClass;
    });
    if (theme?.bodyClass && !['khayt-studio', 'khayt-ledger', 'khayt-console', 'khayt-atelier', 'khayt-vitrine', 'khayt-cockpit'].includes(theme.bodyClass)) {
      document.body.classList.add(theme.bodyClass);
      document.body.dataset.khaytBodyClass = theme.bodyClass;
    }
  }

  function applyDesignTheme(designId) {
    const id = reg()?.normalizeDesignId(designId) || 'studio';
    const theme = reg()?.getTheme(id);
    const root = document.documentElement;
    const wasLedger = document.body.classList.contains('khayt-ledger');
    const wasConsole = document.body.classList.contains('khayt-console');
    const wasAtelier = document.body.classList.contains('khayt-atelier');
    const wasVitrine = document.body.classList.contains('khayt-vitrine');
    const wasCockpit = document.body.classList.contains('khayt-cockpit');
    const nextShell = theme?.shell || 'studio';

    if (['ledger', 'console', 'atelier', 'vitrine', 'cockpit'].includes(nextShell)) {
      document.getElementById('appSidebar')?.classList.remove('collapsed');
    }

    root.dataset.design = id;
    loadCustomThemeStyles(theme);
    applyBodyClasses(id);
    syncSidebarSubtitle(id);
    if (typeof settings !== 'undefined') {
      const accent = reg()?.normalizeAccent(id, settings.accent) || 'cyan';
      if (settings.accent !== accent) settings.accent = accent;
      applyAccent(accent, reg()?.accentsForTheme(id));
    }
    if (wasLedger) global.KhaytLedgerShell?.teardownLedgerShell?.();
    if (wasConsole) global.KhaytConsoleShell?.teardownConsoleShell?.();
    if (wasAtelier) global.KhaytAtelierShell?.teardownAtelierShell?.();
    if (wasVitrine) global.KhaytVitrineShell?.teardownVitrineShell?.();
    if (wasCockpit) global.KhaytCockpitShell?.teardownCockpitShell?.();
    if (nextShell === 'ledger') global.KhaytLedgerShell?.applyLedgerShell?.();
    if (nextShell === 'console') global.KhaytConsoleShell?.applyConsoleShell?.();
    if (nextShell === 'atelier') global.KhaytAtelierShell?.applyAtelierShell?.();
    if (nextShell === 'vitrine') global.KhaytVitrineShell?.applyVitrineShell?.();
    if (nextShell === 'cockpit') global.KhaytCockpitShell?.applyCockpitShell?.();
    if (reg()?.usesHandoffScreens?.(theme?.shell)) {
      global.KhaytStudio?.init?.();
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderKanban === 'function') renderKanban();
      if (typeof renderClients === 'function') renderClients();
      if (typeof renderInventory === 'function') renderInventory();
    } else if (nextShell === 'cockpit') {
      if (typeof renderDashboard === 'function') renderDashboard();
    }
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
    const cockpitSkinWrap = document.getElementById('set_cockpit_skin_wrap');
    const cockpitSkinEl = document.getElementById('set_cockpitSkin');
    const comingSoonEl = document.getElementById('set_designTheme_coming_soon');
    const design = reg()?.normalizeDesignId(settings?.designTheme || 'studio') || 'studio';
    if (designEl) designEl.value = design;
    if (document.getElementById('set_designThemePicker')) {
      global.KhaytThemePicker?.mountSettingsPicker?.();
    }
    populateAccentSelect(design);
    const accent = reg()?.normalizeAccent(design, settings?.accent);
    if (accentEl) accentEl.value = accent;
    if (accentWrap) accentWrap.style.display = '';
    if (cockpitSkinWrap) cockpitSkinWrap.style.display = design === 'cockpit' ? '' : 'none';
    if (cockpitSkinEl) {
      const skin = settings?.cockpitSkin || 'poster';
      cockpitSkinEl.value = global.KhaytCockpitShell?.COCKPIT_SKINS?.includes(skin) ? skin : 'poster';
    }
    if (comingSoonEl && reg()?.listComingSoonThemes) {
      const soon = reg().listComingSoonThemes();
      comingSoonEl.textContent = soon.length
        ? tr('theme.design.coming_soon', 'More themes coming soon:') + ' ' + soon.map((id) => tr(reg().getTheme(id).labelKey, id)).join(', ')
        : '';
    }
  }

  function populateDesignSelects() {
    if (!reg()) return;
    global.KhaytThemePicker?.mountSettingsPicker?.();
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
    CONSOLE_ACCENTS: reg()?.CONSOLE_ACCENTS,
    ATELIER_ACCENTS: reg()?.ATELIER_ACCENTS,
    VITRINE_ACCENTS: reg()?.VITRINE_ACCENTS,
    COCKPIT_ACCENTS: reg()?.COCKPIT_ACCENTS,
  };

  Object.assign(global, api);
  global.KhaytThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
