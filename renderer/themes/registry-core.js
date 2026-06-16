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

  const CONSOLE_ACCENTS = {
    signal: { h: 135, s: '62%', l: '52%', labelKey: 'theme.accent.signal' },
    amber:  { h: 42,  s: '92%', l: '54%', labelKey: 'theme.accent.amber' },
    cyan:   { h: 187, s: '76%', l: '53%', labelKey: 'theme.accent.cyan' },
    white:  { h: 90,  s: '6%',  l: '88%', labelKey: 'theme.accent.white' },
  };

  const ATELIER_ACCENTS = {
    clay:   { h: 18,  s: '55%', l: '47%', labelKey: 'theme.accent.clay' },
    sage:   { h: 150, s: '28%', l: '40%', labelKey: 'theme.accent.sage' },
    sea:    { h: 196, s: '42%', l: '42%', labelKey: 'theme.accent.sea' },
    violet: { h: 262, s: '32%', l: '50%', labelKey: 'theme.accent.violet' },
  };

  const VITRINE_ACCENTS = {
    aurora: { h: 187, s: '80%', l: '60%', labelKey: 'theme.accent.aurora' },
    iris:   { h: 262, s: '72%', l: '68%', labelKey: 'theme.accent.iris' },
    orchid: { h: 320, s: '65%', l: '64%', labelKey: 'theme.accent.orchid' },
    sunset: { h: 28,  s: '88%', l: '60%', labelKey: 'theme.accent.sunset' },
  };

  const COCKPIT_ACCENTS = {
    electric: { h: 224, s: '88%', l: '54%', labelKey: 'theme.accent.electric' },
    violet:   { h: 262, s: '72%', l: '58%', labelKey: 'theme.accent.violet' },
    emerald:  { h: 158, s: '85%', l: '32%', labelKey: 'theme.accent.emerald' },
    flare:    { h: 356, s: '78%', l: '54%', labelKey: 'theme.accent.flare' },
  };

  const ATLAS_ACCENTS = {
    phosphor: { h: 84,  s: '100%', l: '62%', labelKey: 'theme.accent.phosphor' },
    ember:    { h: 12,  s: '100%', l: '60%', labelKey: 'theme.accent.ember' },
    iris:     { h: 252, s: '100%', l: '74%', labelKey: 'theme.accent.iris' },
    signal:   { h: 135, s: '62%',  l: '52%', labelKey: 'theme.accent.signal' },
  };

  const WORKBENCH_ACCENTS = {
    indigo:  { h: 236, s: '86%', l: '63%', labelKey: 'theme.accent.indigo' },
    blue:    { h: 220, s: '100%', l: '59%', labelKey: 'theme.accent.workbench_blue' },
    grape:   { h: 264, s: '72%', l: '60%', labelKey: 'theme.accent.grape' },
    emerald: { h: 152, s: '74%', l: '37%', labelKey: 'theme.accent.emerald' },
  };

  const VIVID_ACCENTS = {
    indigo: { h: 244, s: '84%', l: '65%', labelKey: 'theme.accent.vivid_indigo' },
    violet: { h: 271, s: '91%', l: '65%', labelKey: 'theme.accent.vivid_violet' },
    pink:   { h: 330, s: '81%', l: '60%', labelKey: 'theme.accent.vivid_pink' },
    cyan:   { h: 189, s: '94%', l: '43%', labelKey: 'theme.accent.vivid_cyan' },
  };

  /** Shell types that share the Khayt handoff six-screen layer (A–E family). */
  const HANDOFF_SCREEN_SHELLS = ['studio', 'ledger', 'console', 'atelier', 'vitrine'];

  function usesHandoffScreens(shell) {
    return HANDOFF_SCREEN_SHELLS.includes(shell);
  }

  /** Reserved Frontier concepts — Pulse and Stream (vNext). */
  const RESERVED_THEMES = {
    pulse: {
      labelKey: 'theme.design.pulse',
      descKey: 'theme.design.pulse_desc',
      shell: 'pulse',
      enabled: false,
      comingSoon: true,
      defaultAccent: 'ember',
      accents: { ember: { h: 12, s: '100%', l: '60%', labelKey: 'theme.accent.ember' } },
      defaultAppearance: 'dark',
      bodyClass: 'khayt-pulse',
      stylesheets: [],
    },
    stream: {
      labelKey: 'theme.design.stream',
      descKey: 'theme.design.stream_desc',
      shell: 'stream',
      enabled: false,
      comingSoon: true,
      defaultAccent: 'iris',
      accents: { iris: { h: 252, s: '100%', l: '74%', labelKey: 'theme.accent.iris' } },
      defaultAppearance: 'dark',
      bodyClass: 'khayt-stream',
      stylesheets: [],
    },
  };

  const BUILTIN_THEMES = {
    studio: {
      labelKey: 'theme.design.studio',
      descKey: 'theme.design.studio_desc',
      preview: 'themes/previews/studio.png',
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
      preview: 'themes/previews/ledger.png',
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
    console: {
      labelKey: 'theme.design.console',
      descKey: 'theme.design.console_desc',
      preview: 'themes/previews/console.png',
      shell: 'console',
      enabled: true,
      defaultAccent: 'signal',
      accents: CONSOLE_ACCENTS,
      defaultAppearance: 'dark',
      bodyClass: 'khayt-console',
      stylesheets: [
        'themes/console/tokens.css',
        'themes/console/compat.css',
        'themes/console/shell.css',
        'themes/console/screens.css',
      ],
    },
    atelier: {
      labelKey: 'theme.design.atelier',
      descKey: 'theme.design.atelier_desc',
      preview: 'themes/previews/atelier.png',
      shell: 'atelier',
      enabled: true,
      defaultAccent: 'clay',
      accents: ATELIER_ACCENTS,
      defaultAppearance: 'light',
      bodyClass: 'khayt-atelier',
      stylesheets: [
        'themes/atelier/tokens.css',
        'themes/atelier/compat.css',
        'themes/atelier/shell.css',
        'themes/atelier/screens.css',
      ],
    },
    vitrine: {
      labelKey: 'theme.design.vitrine',
      descKey: 'theme.design.vitrine_desc',
      preview: 'themes/previews/vitrine.png',
      shell: 'vitrine',
      enabled: true,
      defaultAccent: 'aurora',
      accents: VITRINE_ACCENTS,
      defaultAppearance: 'dark',
      bodyClass: 'khayt-vitrine',
      stylesheets: [
        'themes/vitrine/tokens.css',
        'themes/vitrine/compat.css',
        'themes/vitrine/shell.css',
        'themes/vitrine/screens.css',
      ],
    },
    cockpit: {
      labelKey: 'theme.design.cockpit',
      descKey: 'theme.design.cockpit_desc',
      preview: 'themes/previews/cockpit.png',
      shell: 'cockpit',
      enabled: true,
      defaultAccent: 'electric',
      accents: COCKPIT_ACCENTS,
      defaultAppearance: 'light',
      bodyClass: 'khayt-cockpit',
      stylesheets: [
        'themes/cockpit/tokens.css',
        'themes/cockpit/spectrum.css',
        'themes/cockpit/shell.css',
        'themes/cockpit/sections.css',
        'themes/cockpit/compat.css',
      ],
    },
    atlas: {
      labelKey: 'theme.design.atlas',
      descKey: 'theme.design.atlas_desc',
      preview: 'themes/previews/atlas.png',
      shell: 'atlas',
      enabled: true,
      defaultAccent: 'phosphor',
      accents: ATLAS_ACCENTS,
      defaultAppearance: 'dark',
      bodyClass: 'khayt-atlas',
      stylesheets: [
        'themes/atlas/tokens.css',
        'themes/atlas/shell.css',
        'themes/atlas/compat.css',
      ],
    },
    workbench: {
      labelKey: 'theme.design.workbench',
      descKey: 'theme.design.workbench_desc',
      preview: 'themes/previews/workbench.png',
      shell: 'workbench',
      enabled: true,
      defaultAccent: 'indigo',
      accents: WORKBENCH_ACCENTS,
      defaultAppearance: 'light',
      bodyClass: 'khayt-workbench',
      stylesheets: [
        'themes/workbench/tokens.css',
        'themes/workbench/shell.css',
      ],
    },
    vivid: {
      labelKey: 'theme.design.vivid',
      descKey: 'theme.design.vivid_desc',
      preview: 'themes/previews/vivid.png',
      shell: 'vivid',
      enabled: true,
      defaultAccent: 'indigo',
      accents: VIVID_ACCENTS,
      defaultAppearance: 'light',
      bodyClass: 'khayt-vivid',
      stylesheets: [
        'themes/vivid/tokens.css',
        'themes/vivid/shell.css',
        'themes/vivid/screens.css',
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
    if (!manifest || typeof manifest !== 'object') return ['manifest must be an object'];
    const errors = [];
    if (!manifest.id || !/^[a-z][a-z0-9-]{1,31}$/.test(manifest.id)) errors.push('id must be lowercase slug (2–32 chars)');
    if (!manifest.name || typeof manifest.name !== 'string') errors.push('name is required');
    if (!manifest.tokens || typeof manifest.tokens !== 'string') errors.push('tokens css path required');
    // Stylesheet refs must be plain .css filenames inside the theme folder — block path traversal.
    const SAFE_CSS = /^[a-zA-Z0-9._-]+\.css$/;
    for (const f of ['tokens', 'compat', 'shellCss']) {
      if (manifest[f] && !SAFE_CSS.test(manifest[f])) errors.push(`${f} must be a .css filename (no path separators)`);
    }
    if (manifest.bodyClass && !/^[a-zA-Z][\w-]{0,63}$/.test(manifest.bodyClass)) errors.push('bodyClass must be a simple class name');
    if (manifest.accents !== undefined) {
      if (typeof manifest.accents !== 'object' || manifest.accents === null || Array.isArray(manifest.accents)) {
        errors.push('accents must be an object');
      } else {
        const isPct = (v) => (typeof v === 'number' && v >= 0 && v <= 100)
          || (typeof v === 'string' && /^\d{1,3}(\.\d+)?%$/.test(v.trim()));
        for (const [key, a] of Object.entries(manifest.accents)) {
          if (!a || typeof a !== 'object') { errors.push(`accent "${key}" must be an object`); continue; }
          const h = Number(a.h);
          if (!Number.isFinite(h) || h < 0 || h > 360) errors.push(`accent "${key}".h must be a number 0–360`);
          if (!isPct(a.s)) errors.push(`accent "${key}".s must be a percentage`);
          if (!isPct(a.l)) errors.push(`accent "${key}".l must be a percentage`);
        }
      }
    }
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
    CONSOLE_ACCENTS,
    ATELIER_ACCENTS,
    VITRINE_ACCENTS,
    COCKPIT_ACCENTS,
    ATLAS_ACCENTS,
    WORKBENCH_ACCENTS,
    VIVID_ACCENTS,
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
    HANDOFF_SCREEN_SHELLS,
    usesHandoffScreens,
  };

  Object.assign(global, api);
  global.KhaytThemeRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
