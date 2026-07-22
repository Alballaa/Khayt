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
    const design = reg()?.normalizeDesignId(root.dataset.design || 'workbench') || 'workbench';
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
    // Bed Ready is its own product — never stamp the Khayt (خيط) wordmark here.
    if (document.documentElement.dataset.app === 'bedready') { sub.textContent = 'MAKER STUDIO'; return; }
    const theme = reg()?.getTheme(designId);
    if (theme?.shell === 'workbench') sub.textContent = 'خيط · WORKBENCH';
    else if (theme?.shell === 'command') sub.textContent = 'خيط · COMMAND';
    else if (theme?.shell === 'vivid') sub.textContent = 'خيط · VIVID';
    else if (theme?.custom) sub.textContent = `خيط · ${(theme.label || designId).toUpperCase()}`;
    else sub.textContent = 'خيط · WORKBENCH';
  }

  function unloadCustomThemeStyles() {
    document.querySelectorAll('link[data-khayt-theme-pack="custom"]').forEach((el) => el.remove());
  }

  function loadCustomThemeStyles(theme) {
    unloadCustomThemeStyles();
    if (!theme?.custom || !theme.stylesheets?.length) return;
    theme.stylesheets.forEach((href) => {
      // Defense in depth: only load .css bundled under the custom-theme folder (no traversal).
      if (typeof href !== 'string' || href.includes('..') || !href.startsWith('themes/custom/') || !href.endsWith('.css')) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.khaytThemePack = 'custom';
      document.head.appendChild(link);
    });
  }

  /**
   * Bed Ready is a separate product, not a Khayt design. It used to be pinned to
   * the `studio` theme and reached the registry like any other; since 3.3 it owns
   * its own UI layer (renderer/bedready/) and is identified by the html marker
   * alone, so nothing about it depends on Khayt's theme list.
   */
  function isBedReady() {
    return typeof document !== 'undefined' && document.documentElement.dataset.app === 'bedready';
  }

  function applyBodyClasses(designId) {
    const theme = reg()?.getTheme(designId);
    const shell = theme?.shell || 'workbench';
    // One class, set by product rather than by theme. It was two (khayt-studio +
    // khayt-handoff) that could never disagree once studio was the last handoff shell.
    document.body.classList.toggle('bedready-ui', isBedReady());
    document.body.classList.toggle('khayt-workbench', !isBedReady() && shell === 'workbench');
    document.body.classList.toggle('khayt-command', !isBedReady() && shell === 'command');
    document.body.classList.toggle('khayt-vivid', !isBedReady() && shell === 'vivid');
    document.body.classList.toggle('khayt-shell-default', !isBedReady() && shell === 'default');

    document.querySelectorAll('[data-khayt-body-class]').forEach((el) => {
      el.classList.remove(el.dataset.khaytBodyClass);
      delete el.dataset.khaytBodyClass;
    });
    if (theme?.bodyClass && !['bedready-ui', 'khayt-workbench', 'khayt-command', 'khayt-vivid'].includes(theme.bodyClass)) {
      document.body.classList.add(theme.bodyClass);
      document.body.dataset.khaytBodyClass = theme.bodyClass;
    }
  }

  function applyDesignTheme(designId) {
    const id = reg()?.normalizeDesignId(designId) || 'workbench';
    const theme = reg()?.getTheme(id);
    const root = document.documentElement;
    const wasWorkbench = document.body.classList.contains('khayt-workbench');
    const wasCommand = document.body.classList.contains('khayt-command');
    const wasVivid = document.body.classList.contains('khayt-vivid');
    const nextShell = theme?.shell || 'workbench';

    if (['workbench', 'command', 'vivid'].includes(nextShell)) {
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
    if (wasWorkbench) global.KhaytWorkbenchShell?.teardownWorkbenchShell?.();
    if (wasCommand) global.KhaytCommandShell?.teardownCommandShell?.();
    if (wasVivid) global.KhaytVividShell?.teardownVividShell?.();
    if (nextShell === 'workbench') global.KhaytWorkbenchShell?.applyWorkbenchShell?.();
    if (nextShell === 'command') global.KhaytCommandShell?.applyCommandShell?.();
    if (nextShell === 'vivid') global.KhaytVividShell?.applyVividShell?.();
    if (isBedReady()) {
      global.KhaytBedReadyUI?.init?.();
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderKanban === 'function') renderKanban();
      if (typeof renderClients === 'function') renderClients();
      if (typeof renderInventory === 'function') renderInventory();
    } else if (nextShell === 'workbench' || nextShell === 'command' || nextShell === 'vivid') {
      if (typeof renderDashboard === 'function') renderDashboard();
    }
  }

  function applyDesignSettings() {
    // Bed Ready ships ONE bespoke look (renderer/bedready/ + bedready-theme.css)
    // and no design picker. It no longer borrows a Khayt theme id to get there —
    // applyBodyClasses keys off the html marker — so there is nothing to pin.
    const design = reg()?.normalizeDesignId(settings?.designTheme || 'workbench') || 'workbench';
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
    const design = reg()?.normalizeDesignId(settings?.designTheme || 'workbench') || 'workbench';
    if (designEl) designEl.value = design;
    if (document.getElementById('set_designThemePicker')) {
      global.KhaytThemePicker?.mountSettingsPicker?.();
    }
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
    if (!reg()) return;
    global.KhaytThemePicker?.mountSettingsPicker?.();
    populateAccentSelect(reg().normalizeDesignId(settings?.designTheme || 'workbench'));
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
    normalizeDesign: (id) => reg()?.normalizeDesignId(id) || 'workbench',
    accentsForDesign: (id) => reg()?.accentsForTheme(id) || {},
    DESIGNS: reg()?.BUILTIN_THEMES,
  };

  Object.assign(global, api);
  global.KhaytThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
