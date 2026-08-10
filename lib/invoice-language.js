'use strict';
(function () {

/**
 * Decide what language(s) a customer-facing document prints in.
 *
 * Khayt's invoices, quotes, credit notes and delivery notes were unconditionally
 * bilingual: every label rendered twice, the working language above and Arabic
 * below. That is right for the market it was built in and wrong everywhere else —
 * the second language is hardcoded Arabic, not "the user's other language", so a
 * French shop printed French and Arabic, and an English shop in Ohio sent
 * customers a quote captioned عرض سعر.
 *
 * The rule cannot simply be "print one language", because of ZATCA.
 *
 * ZATCA Phase 1 — Saudi Arabia's e-invoicing mandate — REQUIRES Arabic on a tax
 * invoice. For a shop operating under it, bilingual output is a legal obligation
 * and not a preference, so `enableZatca` outranks the setting rather than being
 * one more input to it. A shop cannot switch that off by accident and quietly
 * start issuing non-compliant invoices.
 *
 * Pure (no DOM, no globals) so the decision is unit-testable without rendering a
 * document.
 */

/**
 * - `auto`   — bilingual only where a second language earns its place (default)
 * - `both`   — always bilingual, for a shop serving two language groups
 * - `single` — the working language only
 */
const MODES = Object.freeze(['auto', 'both', 'single']);
const DEFAULT_MODE = 'auto';

/**
 * The partner language. Arabic is the pair for everything else, and English is
 * the pair for Arabic — that is the pairing ZATCA expects and the one the
 * templates were written around. It is deliberately NOT a free choice: offering
 * nine secondary languages would mean nine translated label sets per document,
 * and no user has asked for German-and-Spanish invoices.
 */
function secondaryFor(primary) {
  return primary === 'ar' ? 'en' : 'ar';
}

/**
 * @param {object}  opts
 * @param {string}  opts.mode         one of MODES; anything unrecognised reads as 'auto'
 * @param {string}  opts.lang         the working language ('en', 'ar', 'fr', …)
 * @param {boolean} opts.enableZatca  whether ZATCA e-invoicing fields are on
 * @returns {{bilingual: boolean, primary: string, secondary: string|null, forced: boolean}}
 *   `forced` is true when ZATCA is what decided it — the caller shows the
 *   setting as locked rather than pretending the choice had an effect.
 */
function resolveDocumentLanguage({ mode = DEFAULT_MODE, lang = 'en', enableZatca = false } = {}) {
  const primary = String(lang || 'en');
  const both = (f) => ({ bilingual: true, primary, secondary: secondaryFor(primary), forced: f });

  // Legal requirement first — it is not one input among several.
  if (enableZatca) return both(true);

  const m = MODES.includes(mode) ? mode : DEFAULT_MODE;
  if (m === 'both') return both(false);
  if (m === 'single') return { bilingual: false, primary, secondary: null, forced: false };

  // auto: an Arabic shop keeps its English pairing, because that is the one
  // combination where the second line is doing real work — Gulf shops invoice
  // international customers. Everyone else gets the language they chose.
  return primary === 'ar' ? both(false) : { bilingual: false, primary, secondary: null, forced: false };
}

/**
 * Whether the ZATCA toggle should start on for a shop setting up in `lang`.
 *
 * It shipped defaulting to ON for everyone, so a shop anywhere in the world got
 * Saudi e-invoicing fields, a ZATCA QR code and the line "ZATCA Phase 1 compliant
 * invoice" on documents sent to customers who have never heard of it — and,
 * once this module exists, would also have been forced bilingual by it forever.
 * Regional compliance has to be opted into by the region it applies to.
 */
function zatcaDefaultFor(lang) {
  return String(lang || '') === 'ar';
}

const api = { MODES, DEFAULT_MODE, secondaryFor, resolveDocumentLanguage, zatcaDefaultFor };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytInvoiceLanguage = api;

})();
