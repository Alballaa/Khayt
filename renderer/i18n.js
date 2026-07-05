/* ============================================================
   i18n — language switcher (strings loaded from locales/*.js)
   ============================================================ */

const STRINGS = (typeof globalThis !== 'undefined' && globalThis.KhaytLocales)
  ? globalThis.KhaytLocales
  : (typeof window !== 'undefined' && window.KhaytLocales ? window.KhaytLocales : {});

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
