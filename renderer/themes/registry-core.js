/**
 * Theme registry — pure definitions and helpers (browser + Node testable).
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

  /** Reserved built-ins — enable when art direction lands. */
  const RESERVED_THEMES = {
    blueprint: {
      labelKey: 'theme.design.blueprint',
      descKey: 'theme.design.blueprint_desc',
      shell: 'studio',
      enabled: false,
      comingSoon: true,
      defaultAccent: 'cyan',
      accents: STUDIO_ACCENTS,
      defaultAppearance: 'dark',
      bodyClass: 'khayt-blueprint',
      stylesheets: [],
    },
    atlas: {
      labelKey: 'theme.design.atlas',
      descKey: 'theme.design.atlas_desc',
      shell: 'ledger',
      enabled: false,
      comingSoon: true,
      defaultAccent: 'safety',
      accents: LEDGER_ACCENTS,
      defaultAppearance: 'light',
      bodyClass: 'khayt-atlas',
      stylesheets: [],
    },
  };

  const BUILTIN_THEMES = {
    studio: {
      labelKey: 'theme.design.studio',
      descKey: 'theme.design.studio_desc',
      shell: 'studio',
      enabled: true,
      defaultAccent: 'cyan',
      accents: STUDIO_ACCENTS,
      defaultAppearance: 'dark',
      bodyClass: 'khayt-studio',
      stylesheets: [
        'studio/ds.css',
        'studio/shell.css',
        'studio/screens.css',
        'studio/compat.css',
        'studio/phase4.css',
        'studio/phase5.css',
      ],
    },
    ledger: {
      labelKey: 'theme.design.ledger',
      descKey: 'theme.design.ledger_desc',
      shell: 'ledger',
      enabled: true,
      defaultAccent: 'safety',
      accents: LEDGER_ACCENTS,
      defaultAppearance: 'light',
      bodyClass: 'khayt-ledger',
      stylesheets: [
        'themes/ledger/tokens.css',
        'themes/ledger/compat.css',
        'themes/ledger/shell.css',
        'themes/ledger/screens.css',
      ],
    },
  };

  const registry = { ...BUILTIN_THEMES, ...RESERVED_THEMES };
  const customThemes = {};

  function isCustomThemeId(themeId) {
    return typeof themeId === 'string' && themeId.startsWith('custom:');
  }

  function customIdFromTheme(themeId) {
    return isCustomThemeId(themeId) ? themeId.slice(7) : null;
  }

  function normalizeDesignId(designId) {
    if (!designId) return 'studio';
    if (designId === 'classic') return 'ledger';
    if (isCustomThemeId(designId)) {
      const id = customIdFromTheme(designId);
      return customThemes[id] ? designId : 'studio';
    }
    const theme = registry[designId];
    if (!theme || theme.enabled === false) return 'studio';
    return designId;
  }

  function getTheme(designId) {
    const id = normalizeDesignId(designId);
    if (isCustomThemeId(id)) return customThemes[customIdFromTheme(id)];
    return registry[id] || registry.studio;
  }

  function listSelectableThemes() {
    const builtins = Object.entries(registry)
      .filter(([, t]) => t.enabled !== false && !t.comingSoon)
      .map(([id]) => id);
    const custom = Object.keys(customThemes).map((id) => `custom:${id}`);
    return [...builtins, ...custom];
  }

  function listComingSoonThemes() {
    return Object.entries(registry)
      .filter(([, t]) => t.comingSoon)
      .map(([id]) => id);
  }

  function accentsForTheme(designId) {
    return getTheme(designId).accents || STUDIO_ACCENTS;
  }

  function defaultAccentForTheme(designId) {
    return getTheme(designId).defaultAccent || 'cyan';
  }

  function normalizeAccent(designId, accentId) {
    const set = accentsForTheme(designId);
    if (accentId && set[accentId]) return accentId;
    return defaultAccentForTheme(designId);
  }

  function validateCustomManifest(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== 'object') errors.push('manifest must be an object');
    if (!manifest.id || !/^[a-z][a-z0-9-]{1,31}$/.test(manifest.id)) errors.push('id must be lowercase slug (2–32 chars)');
    if (!manifest.name || typeof manifest.name !== 'string') errors.push('name is required');
    if (!manifest.tokens || typeof manifest.tokens !== 'string') errors.push('tokens css path required');
    if (manifest.accents && typeof manifest.accents !== 'object') errors.push('accents must be an object');
    if (manifest.shell && !['studio', 'ledger', 'default'].includes(manifest.shell)) errors.push('shell must be studio, ledger, or default');
    return errors;
  }

  function registerCustomTheme(manifest, basePath = 'themes/custom') {
    const errors = validateCustomManifest(manifest);
    if (errors.length) return { ok: false, errors };
    const id = manifest.id;
    if (registry[id] || customThemes[id]) return { ok: false, errors: ['id already registered'] };

    const accents = {};
    const sourceAccents = manifest.accents || {
      brand: { h: 200, s: '70%', l: '50%', label: manifest.name },
    };
    Object.entries(sourceAccents).forEach(([key, a]) => {
      accents[key] = {
        h: a.h,
        s: a.s,
        l: a.l,
        labelKey: a.labelKey || `theme.custom.${id}.${key}`,
        label: a.label || key,
      };
    });

    const shell = manifest.shell || 'default';
    const bodyClass = manifest.bodyClass || `khayt-custom-${id}`;
    const stylesheets = [`${basePath}/${id}/${manifest.tokens}`];
    if (manifest.compat) stylesheets.push(`${basePath}/${id}/${manifest.compat}`);
    if (manifest.shellCss) stylesheets.push(`${basePath}/${id}/${manifest.shellCss}`);

    customThemes[id] = {
      id,
      labelKey: manifest.labelKey || `theme.custom.${id}.name`,
      descKey: manifest.descKey || `theme.custom.${id}.desc`,
      label: manifest.name,
      description: manifest.description || '',
      shell,
      enabled: true,
      custom: true,
      defaultAccent: manifest.defaultAccent || Object.keys(accents)[0],
      accents,
      defaultAppearance: manifest.defaultAppearance || 'dark',
      bodyClass,
      stylesheets,
      manifest,
    };
    return { ok: true, id: `custom:${id}` };
  }

  function registerBuiltinTheme(id, def) {
    if (!id || registry[id]) return false;
    registry[id] = { enabled: true, ...def };
    return true;
  }

  const api = {
    STUDIO_ACCENTS,
    LEDGER_ACCENTS,
    BUILTIN_THEMES,
    RESERVED_THEMES,
    registry,
    customThemes,
    isCustomThemeId,
    customIdFromTheme,
    normalizeDesignId,
    getTheme,
    listSelectableThemes,
    listComingSoonThemes,
    accentsForTheme,
    defaultAccentForTheme,
    normalizeAccent,
    validateCustomManifest,
    registerCustomTheme,
    registerBuiltinTheme,
  };

  Object.assign(global, api);
  global.KhaytThemeRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
