'use strict';
(function () {

/**
 * Feature tiers — the SINGLE SOURCE OF TRUTH for what belongs to the Professional
 * mode vs the always-on Simple core. The UI gates Pro features with the .pro-only
 * class (hidden under body.mode-simple) and the isProMode() helper; this registry
 * documents the boundary in one place and drives the in-app tier comparison.
 *
 * Pure (no DOM/globals) so it can be unit-tested and reused.
 */

/** Always available, in every mode — the core daily workflow. */
const SIMPLE_CORE = [
  { key: 'quote',      label: { en: 'Quoting & cost calculator', ar: 'التسعير وحاسبة التكلفة' } },
  { key: 'queue',      label: { en: 'Production queue (Kanban)', ar: 'قائمة الإنتاج (كانبان)' } },
  { key: 'invoices',   label: { en: 'Invoices & payments', ar: 'الفواتير والمدفوعات' } },
  { key: 'inventory',  label: { en: 'Filament inventory', ar: 'مخزون الخيوط' } },
  { key: 'clients',    label: { en: 'Clients', ar: 'العملاء' } },
  { key: 'reports',    label: { en: 'Simple reports', ar: 'تقارير مبسّطة' } },
];

/** Professional-only — unlocked in Professional mode (each maps to .pro-only UI). */
const PRO_FEATURES = [
  { key: 'analytics',     label: { en: 'Full analytics & forecasting', ar: 'تحليلات وتوقّعات كاملة' } },
  { key: 'zatca',         label: { en: 'ZATCA Phase 2 e-invoicing', ar: 'فوترة هيئة الزكاة (المرحلة الثانية)' } },
  { key: 'proforma',      label: { en: 'Proforma & milestone invoices, credit notes', ar: 'فواتير مبدئية ومراحل وإشعارات دائنة' } },
  { key: 'purchasing',    label: { en: 'Purchase orders & accounts payable', ar: 'أوامر الشراء والذمم الدائنة' } },
  { key: 'multiLocation', label: { en: 'Multiple locations & print-farm view', ar: 'فروع متعددة وعرض مزرعة الطباعة' } },
  { key: 'team',          label: { en: 'Team accounts & roles', ar: 'حسابات الفريق والأدوار' } },
  { key: 'maintenance',   label: { en: 'Machine maintenance & downtime', ar: 'صيانة الأجهزة والتوقّف' } },
  { key: 'loyalty',       label: { en: 'Loyalty tiers & break-even', ar: 'مستويات الولاء ونقطة التعادل' } },
];

/** Is the given mode the Professional tier? (default mode = professional) */
function isProMode(mode) { return (mode || 'professional') !== 'simple'; }

/** Is a feature key available in the given mode? Unknown keys = Simple-core (always on). */
function isFeatureEnabled(key, mode) {
  if (PRO_FEATURES.some((f) => f.key === key)) return isProMode(mode);
  return true;
}

/** Localized rows for the tier-comparison UI. */
function tierComparison(lang) {
  const L = (o) => (o && (o[lang] || o.en)) || '';
  return {
    simple: SIMPLE_CORE.map((f) => ({ key: f.key, label: L(f.label) })),
    pro: PRO_FEATURES.map((f) => ({ key: f.key, label: L(f.label) })),
  };
}

const api = { SIMPLE_CORE, PRO_FEATURES, isProMode, isFeatureEnabled, tierComparison };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytTiers = api;

})();
