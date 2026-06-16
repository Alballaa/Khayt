/**
 * Loads community/custom themes listed in themes/custom/index.json.
 */
(function (global) {
  const INDEX_PATH = 'themes/custom/index.json';

  async function loadCustomThemes() {
    const reg = global.KhaytThemeRegistry;
    if (!reg) return [];
    try {
      const res = await fetch(INDEX_PATH, { cache: 'no-cache' });
      if (!res.ok) return [];
      const data = await res.json();
      const loaded = [];
      for (const entry of data.themes || []) {
        const folder = entry.folder || entry.id;
        const manifestRes = await fetch(`themes/custom/${folder}/manifest.json`, { cache: 'no-cache' });
        if (!manifestRes.ok) continue;
        const manifest = await manifestRes.json();
        const result = reg.registerCustomTheme(manifest, 'themes/custom');
        if (result.ok) loaded.push(result.id);
      }
      return loaded;
    } catch (e) {
      console.warn('[themes] custom theme load failed', e);
      return [];
    }
  }

  global.KhaytCustomThemes = { loadCustomThemes };
})(typeof window !== 'undefined' ? window : globalThis);
