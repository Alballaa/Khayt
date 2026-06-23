'use strict';
(function () {

/**
 * Integrations registry — the curated top-3 storefronts + top-3 payment systems
 * for each market Khayt is translated into. Single source of truth driving the
 * Settings → Integrations directory, the inbound import mappers, and the payment
 * options. Pure data + lookups (no DOM/globals) so it's unit-testable.
 *
 * `dir` on a storefront = supported directions: 'in' (import orders), 'out'
 * (publish catalog). `webhook:true` means it can POST orders to Khayt's inbound
 * endpoint. Payment entries carry a site for the owner to get their pay link/key.
 */

const MARKETS = {
  ar: { country: { en: 'Saudi Arabia & Gulf', ar: 'السعودية والخليج' },
    storefronts: [
      { id: 'salla',     name: 'Salla',       dir: ['in', 'out'], webhook: true },
      { id: 'zid',       name: 'Zid',         dir: ['in', 'out'], webhook: true },
      { id: 'shopify',   name: 'Shopify',     dir: ['in', 'out'], webhook: true },
    ],
    payments: [
      { id: 'mada',   name: 'Mada' },
      { id: 'stcpay', name: 'STC Pay' },
      { id: 'tabby',  name: 'Tabby' },
    ] },
  en: { country: { en: 'United States & Global', ar: 'الولايات المتحدة وعالمياً' },
    storefronts: [
      { id: 'shopify',     name: 'Shopify',     dir: ['in', 'out'], webhook: true },
      { id: 'woocommerce', name: 'WooCommerce', dir: ['in', 'out'], webhook: true },
      { id: 'etsy',        name: 'Etsy',        dir: ['in', 'out'], webhook: true },
    ],
    payments: [
      { id: 'stripe', name: 'Stripe' },
      { id: 'paypal', name: 'PayPal' },
      { id: 'square', name: 'Square' },
    ] },
  es: { country: { en: 'Spain', ar: 'إسبانيا' },
    storefronts: [
      { id: 'shopify',     name: 'Shopify',     dir: ['in', 'out'], webhook: true },
      { id: 'woocommerce', name: 'WooCommerce', dir: ['in', 'out'], webhook: true },
      { id: 'prestashop',  name: 'PrestaShop',  dir: ['in', 'out'], webhook: true },
    ],
    payments: [
      { id: 'stripe', name: 'Stripe' },
      { id: 'paypal', name: 'PayPal' },
      { id: 'bizum',  name: 'Bizum' },
    ] },
  fr: { country: { en: 'France', ar: 'فرنسا' },
    storefronts: [
      { id: 'shopify',     name: 'Shopify',     dir: ['in', 'out'], webhook: true },
      { id: 'woocommerce', name: 'WooCommerce', dir: ['in', 'out'], webhook: true },
      { id: 'prestashop',  name: 'PrestaShop',  dir: ['in', 'out'], webhook: true },
    ],
    payments: [
      { id: 'stripe',  name: 'Stripe' },
      { id: 'paypal',  name: 'PayPal' },
      { id: 'payplug', name: 'PayPlug' },
    ] },
  de: { country: { en: 'Germany', ar: 'ألمانيا' },
    storefronts: [
      { id: 'shopify',     name: 'Shopify',     dir: ['in', 'out'], webhook: true },
      { id: 'woocommerce', name: 'WooCommerce', dir: ['in', 'out'], webhook: true },
      { id: 'shopware',    name: 'Shopware',    dir: ['in', 'out'], webhook: true },
    ],
    payments: [
      { id: 'paypal', name: 'PayPal' },
      { id: 'klarna', name: 'Klarna' },
      { id: 'stripe', name: 'Stripe' },
    ] },
  ja: { country: { en: 'Japan', ar: 'اليابان' },
    storefronts: [
      { id: 'shopify', name: 'Shopify', dir: ['in', 'out'], webhook: true },
      { id: 'base',    name: 'BASE',    dir: ['in', 'out'], webhook: true },
      { id: 'rakuten', name: 'Rakuten', dir: ['in'],        webhook: true },
    ],
    payments: [
      { id: 'paypay',     name: 'PayPay' },
      { id: 'rakutenpay', name: 'Rakuten Pay' },
      { id: 'stripe',     name: 'Stripe' },
    ] },
  zh: { country: { en: 'China', ar: 'الصين' },
    storefronts: [
      { id: 'taobao', name: 'Taobao / Tmall', dir: ['in'],        webhook: true },
      { id: 'jd',     name: 'JD.com',         dir: ['in'],        webhook: true },
      { id: 'youzan', name: 'Youzan (WeChat)', dir: ['in', 'out'], webhook: true },
    ],
    payments: [
      { id: 'alipay',   name: 'Alipay' },
      { id: 'wechatpay', name: 'WeChat Pay' },
      { id: 'unionpay', name: 'UnionPay' },
    ] },
};

/** Registry for a locale (falls back to 'en'). */
function forLocale(locale) { return MARKETS[locale] || MARKETS.en; }

/** All known storefront platform ids (deduped, for the inbound import router). */
function allStorefrontIds() {
  const s = new Set();
  for (const m of Object.values(MARKETS)) for (const sf of m.storefronts) s.add(sf.id);
  return [...s];
}

/** All known payment provider ids (deduped). */
function allPaymentIds() {
  const s = new Set();
  for (const m of Object.values(MARKETS)) for (const p of m.payments) s.add(p.id);
  return [...s];
}

/** Look up a storefront platform by id across all markets. */
function storefront(id) {
  for (const m of Object.values(MARKETS)) { const f = m.storefronts.find((x) => x.id === id); if (f) return f; }
  return null;
}

const api = { MARKETS, forLocale, allStorefrontIds, allPaymentIds, storefront };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytIntegrations = api;

})();
