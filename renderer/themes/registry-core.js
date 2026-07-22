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

  const COMMAND_ACCENTS = {
    blue:    { h: 212, s: '73%',  l: '53%', labelKey: 'theme.accent.command_blue' },
    teal:    { h: 168, s: '78%',  l: '37%', labelKey: 'theme.accent.command_teal' },
    violet:  { h: 255, s: '100%', l: '68%', labelKey: 'theme.accent.violet' },
    orange:  { h: 24,  s: '76%',  l: '53%', labelKey: 'theme.accent.command_orange' },
  };

  /**
   * Shell types that share the Khayt handoff six-screen layer.
   *
   * Was ['studio', 'ledger', 'console', 'atelier', 'vitrine']; the other four
   * went with the legacy-theme deletion. Only `studio` remains, and only
   * because Bed Ready is pinned to it (see applyDesignSettings in themes.js) —
   * no Khayt user can select it. If Bed Ready is ever rebased onto its own
   * design, this list and renderer/studio/ go with it.
   */
  const HANDOFF_SCREEN_SHELLS = ['studio'];

  /** Shells a community theme may declare in its manifest. */
  const CUSTOM_THEME_SHELLS = ['workbench', 'command', 'vivid', 'default'];

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
      legacy: true,
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
    command: {
      labelKey: 'theme.design.command',
      descKey: 'theme.design.command_desc',
      preview: 'themes/previews/command.png',
      shell: 'command',
      enabled: true,
      defaultAccent: 'blue',
      accents: COMMAND_ACCENTS,
      defaultAppearance: 'light',
      bodyClass: 'khayt-command',
      stylesheets: [
        'themes/command/tokens.css',
        'themes/command/shell.css',
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
    if (!designId) return 'workbench';
    // 'classic' was the pre-2.6 name for ledger, which the legacy-theme
    // deletion removed; its users land on the default like any other stale id.
    if (designId === 'classic') return 'workbench';
    if (isCustomThemeId(designId)) {
      const id = customIdFromTheme(designId);
      return customThemes[id] ? designId : 'workbench';
    }
    const theme = registry[designId];
    if (!theme || theme.enabled === false) return 'workbench';
    return designId;
  }

  function getTheme(designId) {
    const id = normalizeDesignId(designId);
    if (isCustomThemeId(id)) return customThemes[customIdFromTheme(id)];
    return registry[id] || registry.studio;
  }

  function listSelectableThemes() {
    const builtins = Object.entries(registry)
      .filter(([, t]) => t.enabled !== false && !t.comingSoon && !t.legacy)
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
    // Shells a custom theme may adopt. 'ledger' was accepted here until the 3.3
    // legacy deletion removed it — a manifest naming it would have validated and
    // then rendered nothing. 'studio' stays out: it is Bed Ready's, not Khayt's.
    if (manifest.shell && !CUSTOM_THEME_SHELLS.includes(manifest.shell)) {
      errors.push(`shell must be one of: ${CUSTOM_THEME_SHELLS.join(', ')}`);
    }
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
    WORKBENCH_ACCENTS,
    VIVID_ACCENTS,
    COMMAND_ACCENTS,
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
    CUSTOM_THEME_SHELLS,
    usesHandoffScreens,
  };

  Object.assign(global, api);
  global.KhaytThemeRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
