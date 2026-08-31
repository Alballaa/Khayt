'use strict';
/**
 * Which languages a shop writes its CONTENT in — and how those fields are keyed.
 *
 * Khayt's interface speaks nine languages. Its content has always spoken exactly
 * two, hard-coded: every record carries `nameEn` and `nameAr` and nothing else.
 * That is wrong in both directions at once.
 *
 *   A shop that sells only in Arabic still has to look at an English field, and
 *   fill it in or leave it blank knowing the blank is what a customer might see.
 *
 *   A Turkish or German shop cannot enter its own language AT ALL. The interface
 *   translates for them; the thing they actually sell does not.
 *
 * And the catalogue was inconsistent even within its own two: a product had
 * `nameEn` and `nameAr` but a single `description`. So the name could be
 * bilingual and the paragraph a customer reads to decide could not — which is
 * the wrong way round, because a name is the part a customer can guess.
 *
 * ── The keying, and why it looks like this ──────────────────────────────────
 * English stays `nameEn` and Arabic stays `nameAr`. Every existing record in
 * every existing store uses those, and so do the invoice templates, the
 * storefront payload and the CSV importers. Renaming them would be a migration
 * across the whole app to buy nothing.
 *
 * Every OTHER language gets `name_tr`, `name_de` and so on. A shop that never
 * leaves English and Arabic has a store file identical to the one it has today.
 *
 * Pure: no DOM, no fs, no Electron.
 */
(function (global) {

  /** The languages Khayt's interface ships in; content may use any of them. */
  const SUPPORTED = ['en', 'ar', 'de', 'es', 'fr', 'tr', 'ja', 'zh', 'pt-BR'];

  /** What a shop gets if it has never chosen — exactly today's behaviour. */
  const DEFAULT_LANGS = ['en', 'ar'];

  /** How many content languages a shop may keep. More than two is a form nobody fills in. */
  const MAX_LANGS = 2;

  /**
   * The content languages for a shop, always valid and never empty.
   *
   * An empty or nonsense setting falls back to the default rather than leaving
   * a product editor with no fields at all — a shop that cannot type a name is
   * a worse failure than one typing it in a language it did not pick.
   */
  function contentLangs(settings) {
    const raw = (settings && Array.isArray(settings.contentLangs)) ? settings.contentLangs : null;
    if (!raw) return [...DEFAULT_LANGS];
    const seen = new Set();
    const out = [];
    for (const l of raw) {
      const code = String(l || '').trim();
      if (!SUPPORTED.includes(code) || seen.has(code)) continue;
      seen.add(code);
      out.push(code);
      if (out.length >= MAX_LANGS) break;
    }
    return out.length ? out : [...DEFAULT_LANGS];
  }

  /**
   * The store key for one field in one language.
   *
   * `en` and `ar` keep the names every existing record and every invoice
   * template already uses; the rest are suffixed. This is the whole
   * back-compatibility story, and it is deliberately boring.
   */
  function fieldKey(base, lang) {
    const b = String(base || '');
    const l = String(lang || '');
    if (l === 'en') return `${b}En`;
    if (l === 'ar') return `${b}Ar`;
    return `${b}_${l}`;
  }

  /** Every key a field could occupy, for readers that need to look everywhere. */
  function allKeys(base) {
    return SUPPORTED.map((l) => fieldKey(base, l));
  }

  /**
   * Read a field in the language the reader wants, falling back sensibly.
   *
   * Order: the language asked for, then the shop's own content languages in the
   * order it chose them, then anything at all that is filled in. The last step
   * matters more than it looks — showing a customer a Turkish name is a far
   * better outcome than showing them a blank where the product should be.
   */
  function read(obj, base, wantLang, settings) {
    const o = obj || {};
    const tried = [];
    const push = (l) => { if (l && !tried.includes(l)) tried.push(l); };
    push(wantLang);
    for (const l of contentLangs(settings)) push(l);
    for (const l of SUPPORTED) push(l);
    for (const l of tried) {
      const v = o[fieldKey(base, l)];
      if (typeof v === 'string' && v.trim()) return v;
    }
    // `description` with no suffix predates this entirely: the catalogue had one
    // description and no language on it at all.
    const plain = o[base];
    return (typeof plain === 'string' && plain.trim()) ? plain : '';
  }

  /** Write a field in one language, leaving the others alone. */
  function write(obj, base, lang, value) {
    if (!obj) return obj;
    obj[fieldKey(base, lang)] = String(value == null ? '' : value);
    return obj;
  }

  /**
   * Fold a pre-language field into the shop's first content language.
   *
   * A product saved before the catalogue had per-language descriptions carries
   * `description` with no suffix. Moving it into the first content language is
   * the only reading that does not lose it — and it is not a guess about which
   * language it was written in, it is a decision to keep it visible.
   */
  function migratePlain(obj, base, settings) {
    if (!obj) return obj;
    const plain = obj[base];
    if (typeof plain !== 'string' || !plain.trim()) return obj;
    const first = contentLangs(settings)[0];
    const key = fieldKey(base, first);
    if (!obj[key]) obj[key] = plain;
    return obj;
  }

  /** A label for a language code, for the field captions. */
  const NAMES = {
    en: 'English', ar: 'العربية', de: 'Deutsch', es: 'Español', fr: 'Français',
    tr: 'Türkçe', ja: '日本語', zh: '中文', 'pt-BR': 'Português',
  };
  const languageName = (code) => NAMES[code] || String(code || '');

  const api = { SUPPORTED, DEFAULT_LANGS, MAX_LANGS, contentLangs, fieldKey, allKeys,
    read, write, migratePlain, languageName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytContentLanguages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
