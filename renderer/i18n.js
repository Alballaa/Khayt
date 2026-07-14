/* ============================================================
   i18n — language switcher (strings loaded from locales/*.js)
   ============================================================ */

const STRINGS = (typeof globalThis !== 'undefined' && globalThis.KhaytLocales)
  ? globalThis.KhaytLocales
  : (typeof window !== 'undefined' && window.KhaytLocales ? window.KhaytLocales : {});

// Bed Ready is a standalone product built from the SHARED (Khayt) locale files, so any visible
// "Khayt" in a translated string must read as the flavor's product name — in every language.
// This rebrands at the single t() chokepoint (render-time; the locale data is never mutated).
// Capital-K, word-bounded only: lowercase infra tokens (khaytapp.com, storage keys) are untouched,
// and the few "Khayt Cloud"/"X-Khayt-Signature"-style tokens live in business-only UI the Bed Ready
// flavor never shows (and the real header/URL strings are set in lib code, not via t()).
let _brand;
function productBrand() {
  if (_brand === undefined) {
    _brand = (typeof document !== 'undefined' && document.documentElement &&
      document.documentElement.dataset.app === 'bedready') ? 'Bed Ready' : 'Khayt';
  }
  return _brand;
}

const i18n = {
  current: 'en',

  init() {
    const saved = localStorage.getItem('app_language');
    const valid = ['en', 'ar', 'de', 'es', 'fr', 'zh', 'ja', 'tr'];
    this.set(valid.includes(saved) ? saved : 'en', { silent: true });
  },

  set(lang, opts = {}) {
    if (!STRINGS[lang]) lang = 'en';
    this.current = lang;
    localStorage.setItem('app_language', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
    this.applyToDom();
    if (typeof window.refreshCurrencyLabels === 'function') {
      window.refreshCurrencyLabels();
    }
    if (!opts.silent) {
      document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
    }
  },

  t(key, vars) {
    let s = (STRINGS[this.current] && STRINGS[this.current][key]) || STRINGS.en[key] || key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replaceAll('{' + k + '}', String(vars[k]));
      }
    }
    const b = productBrand();
    if (b !== 'Khayt') {
      // Bed Ready's drafting chrome uses a bespoke line-icon vocabulary, so decorative leading
      // emoji baked into shared labels ("📐 Estimate…", "🤖 AI quote") read as off-identity.
      // Strip a leading emoji run at the single render chokepoint; geometric/arrow glyphs
      // (◉ ▤ → ↔ ＋) aren't Extended_Pictographic and are preserved.
      s = s.replace(/^(?:\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*[\s ]*)+/u, '');
      if (s.indexOf('Khayt') !== -1) s = s.replace(/\bKhayt\b/g, b);
    }
    return s;
  },

  applyToDom(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      // Currency unit labels come from settings, not locale strings
      if (key === 'common.currency') return;
      el.textContent = this.t(key);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.setAttribute('title', this.t(el.getAttribute('data-i18n-title')));
    });
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = this.t(el.getAttribute('data-i18n-html'));
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria-label')));
    });
  }
};

window.i18n = i18n;
window.t = (...args) => i18n.t(...args);
