'use strict';

/**
 * The document a customer is handed.
 *
 * Four hundred lines of template string that lived inside the renderer, so the
 * only thing in the world that could produce a Khayt invoice was the Electron
 * window. The native Mac app can take a job, price it and be paid for it, and
 * could not give anybody a receipt.
 *
 * It was already almost pure: one element written to at the end, and everything
 * else computed from the order, the shop's settings and the money figures its
 * caller had already worked out. So the body moved here unchanged and its
 * twenty renderer globals became an argument.
 *
 * RETURNS A STRING, and a flag. The Arabic-numeral pass is the one thing that
 * cannot be done in a string — it rewrites the text of elements after they are
 * laid out — so this says whether it is needed and which elements it applies
 * to, and each app does it on its own DOM.
 *
 * PURE: no globals, no clock beyond what the order carries. `KhaytTax` and
 * `KhaytInvoiceLanguage` are consulted the way every sibling module consults a
 * sibling: through the global they assign themselves to, present in both apps.
 */
(function (global) {

  /** The elements whose digits become Arabic-Indic when a shop asks for it. */
  const NUMERAL_SELECTOR = '.amount, .v, .qty, td.center, td.amount, .biz-meta, .meta';

function invoiceHtml(order, ctx) {
  const {
    qrSvg, qrProblem = null, payQrSvg = '', total, vatAmount, subtotal,
    subtotalShown, vatRate, shipping = 0,
    // The shop, and the ways it says things. Every one of these was a renderer
    // global; naming them is what lets a second app produce the same document.
    settings = {}, clients = [], CURRENCIES = {}, i18n = { current: 'en' },
    t = (k) => k,
    escapeHtml = (s) => String(s == null ? '' : s),
    fmtMoney = (n) => String(n),
    formatPrintDate = (d) => String(d || ''),
    shopField = () => '', safeBizLogo = () => '', safeCssColor = (v, f) => f,
    renderClientSub = () => '', BRAND_MARK_SVG = '',
    orderCurrency = null, clientCurrency = () => '',
    payStatus = (o) => o.paymentStatus || 'unpaid',
    hijriDate = () => '', toArabicNumerals = (s) => String(s),
  } = ctx || {};
  const issuedDate = formatPrintDate(order.date);
  const issuedTime = order.timestamp ? new Date(order.timestamp).toTimeString().slice(0, 5) : '';
  // Feature 1: use the order's currency (per-order override, else client, else base)
  const invCurrencyCode = (typeof orderCurrency === 'function') ? orderCurrency(order) : clientCurrency(order.clientId);
  const invCurObj = CURRENCIES[invCurrencyCode] || CURRENCIES[settings.currency] || CURRENCIES.SAR;
  const invCurrSym = invCurObj.symbol;

  // Direction follows the current app language, and the primary label (larger,
  // bolder) matches it.
  //
  // Whether there is a SECOND label under it is a decision, not a constant. It
  // used to be unconditional, which meant the hardcoded Arabic half printed on
  // documents in all nine languages — a shop in the US sent customers quotes
  // captioned عرض سعر. lib/invoice-language.js owns the rule, including the part
  // that cannot be overridden: ZATCA Phase 1 requires Arabic on a Saudi tax
  // invoice, so bilingual stays forced there whatever the setting says.
  const isAr = i18n.current === 'ar';
  const docLang = KhaytInvoiceLanguage.resolveDocumentLanguage({
    mode: settings.invoiceBilingual,
    lang: i18n.current,
    secondary: settings.invoiceSecondLang,
    enableZatca: settings.enableZatca,
  });
  // `bi` gates every second-language element below: the hardcoded label halves
  // AND the shop's own secondary name/address/terms. Both answer the same
  // question — "is this a two-language document?" — and gating only the labels
  // would leave an English quote carrying an Arabic address.
  const bi = docLang.bilingual;
  // The shop's OWN second-language content — its name, address, tagline, terms
  // and footer — exists only as an English/Arabic pair in settings. There is no
  // bizFr. So a document whose second language is French can carry French
  // LABELS, which come from the locale files, but has no French shop name to
  // put beside them; printing the Arabic one there would pair French headings
  // with an Arabic address, which is how this looked before the gate existed.
  // Show that block only when the second language is the one those fields hold.
  const biContent = bi
    && docLang.secondary === KhaytInvoiceLanguage.defaultSecondaryFor(i18n.current);
  const dir = isAr ? 'rtl' : 'ltr';
  // Numeral formatting helper — only converts when in Arabic mode with the toggle on
  const num = (v) => (isAr && settings.useArabicNumerals) ? toArabicNumerals(v) : String(v);
  const isPaid = (payStatus(order) === 'paid');

  // Label pairs — (primary, secondary). Primary = working language.
  const isQuoteDoc = order.status === 'quote';
  // Every printed label, as [primary, secondary].
  //
  // These used to be hardcoded English/Arabic literal pairs, which is why the
  // second language could only ever BE Arabic. They now come out of the locale
  // files like the rest of the app: the primary through t(), the secondary
  // through tIn() against whichever language the shop picked. That is the whole
  // reason for the doc.* vocabulary — a label the second language cannot be
  // looked up in is a label that language cannot print.
  const L2 = (key, vars) => [t(key, vars), bi ? i18n.tIn(docLang.secondary, key, vars) : ""];
  const rate = vatRate || 15;
  const L = {
    invoice:    L2(isQuoteDoc ? "doc.quotation" : "doc.invoice"),
    no:         L2("doc.no"),
    date:       L2("doc.date"),
    time:       L2("doc.time"),
    billTo:     L2("doc.bill_to"),
    description:L2("doc.description"),
    qty:        L2("doc.qty"),
    amount:     L2("doc.amount"),
    subtotal:   L2("doc.subtotal"),
    vat:        L2("doc.vat", { rate }),
    totalDue:   L2("doc.total_due"),
    qrLabel:    L2("doc.qr_label"),
    // A sentence, not a label — it is set once in the working language and has
    // no second-language twin on the page.
    legal:      settings.enableZatca
                  ? (isAr ? "فاتورة متوافقة مع المرحلة الأولى من هيئة الزكاة والضريبة والجمارك"
                           : "ZATCA Phase 1 compliant invoice with TLV-encoded QR code.")
                  : (isAr ? `صادرة بواسطة Khayt · ${t("inv.generated_by") || "Professional Invoice"}`
                           : `Generated by Khayt · ${t("inv.generated_by") || "Professional Invoice"}`),
  };

  // Pretty label: primary on top, smaller secondary underneath — or just the
  // primary on a single-language document.
  const pair = (k) => {
    const [p, s] = L[k];
    if (!bi) return escapeHtml(p);
    return `${escapeHtml(p)} <span class="sub${isAr ? ' ltr' : ' rtl'}">${escapeHtml(s)}</span>`;
  };
  /**
   * The secondary half of a label strip — empty on a single-language document.
   * Takes a locale KEY, not a literal: the second language is the shop's choice,
   * so the text has to be looked up rather than written inline.
   */
  const sub = (key) => (bi
    ? `<span class="sub ${isAr ? 'ltr' : 'ar'}">${escapeHtml(i18n.tIn(docLang.secondary, key))}</span>`
    : '');

  // Bill-to: real client name, OR generic walk-in label
  const linkedClient = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const hasName = (order.project || '').trim().length > 0;
  const billToName = hasName ? order.project : t('inv.walk_in');
  const billToSub  = hasName
    ? (linkedClient ? renderClientSub(linkedClient) : '')
    : `<div class="name-sub">${t("doc.no_specific_client")}</div>`;

  // Lines
  const orderExtraLines = order.extraLines || [];
  const orderExtraTotal = orderExtraLines.reduce((s, l) => s + (+l.amount || 0), 0);
  const lines = (order.parts && order.parts.length > 0)
    ? order.parts
    : [{ name: t('inv.services_default'), material: order.material, printTime: order.printTime, baseCost: order.price }];
  const totalBase = lines.reduce((s, p) => s + (+p.baseCost || 0), 0);
  // Pool for parts = total price minus shipping minus extra lines (fixed fees)
  const partsPool = +order.price - (+order.shippingCost || 0) - orderExtraTotal - (+order.rushFeeAmount || 0);
  const linesHtml = lines.map(p => {
    const share = totalBase > 0 ? (p.baseCost / totalBase) * partsPool : partsPool / lines.length;
    const meta = [
      p.material,
      p.printTime ? `${p.printTime} hrs` : '',
      p.printWeight ? `${Math.round(p.printWeight)} g` : '',
      p.layerHeight ? `${p.layerHeight}mm` : '',
      p.infill ? `${p.infill}% infill` : '',
      p.profile || ''
    ].filter(Boolean).join(' · ');
    return `
      <tr>
        <td>
          <div class="desc-en">${escapeHtml(p.name)}</div>
          ${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}
        </td>
        <td class="center">${num(String(p.qty || 1))}</td>
        <td class="amount">${fmtMoney(share)} <span style="color:var(--ink-mute); font-weight:500;">${invCurrSym}</span></td>
      </tr>`;
  }).join('');
  // Extra charge lines
  const extraLinesHtml = orderExtraLines.map(l => `
      <tr>
        <td><div class="desc-en">${escapeHtml(l.label || t('calc.extra_label_ph'))}${
          // A percentage fee says so on the invoice. The money is the frozen
          // `amount` written when the order was logged — an invoice reports what
          // was charged, it does not recompute a percentage months later.
          (+l.pct > 0) ? ` <span style="color:var(--ink-mute);">(${escapeHtml(String(l.pct))}%)</span>` : ''
        }</div></td>
        <td class="center">1</td>
        <td class="amount">${fmtMoney(+l.amount || 0)} <span style="color:var(--ink-mute); font-weight:500;">${invCurrSym}</span></td>
      </tr>`).join('');

  // Compact contact line in the header
  const contactBits = [
    settings.phone, settings.email,
    settings.cr ? `CR ${settings.cr}` : '',
    settings.vat ? `VAT ${settings.vat}` : ''
  ].filter(Boolean).join(' · ');

  /* The shop's own text, in the document's languages.
   *
   * This picked between an Arabic field and an English one and nothing else, so
   * a shop writing Turkish printed an invoice with a BLANK business name — the
   * labels were translated by resolveDocumentLanguage and the shop's own name
   * was not. The document already knows which two languages it is in; these now
   * ask for those.
   */
  const _p = docLang.lang;
  const _s = docLang.secondary;
  const bizPrimary    = shopField('biz', _p);
  const bizSecondary  = bi ? (settings[KhaytContentLanguages.fieldKey('biz', _s)] || '') : '';
  const addrPrimary   = shopField('addr', _p);
  const addrSecondary = bi ? (settings[KhaytContentLanguages.fieldKey('addr', _s)] || '') : '';

  const taglinePrimary   = shopField('tagline', _p);
  const taglineSecondary = bi ? (settings[KhaytContentLanguages.fieldKey('tagline', _s)] || '') : '';

  // Brand color: amber for quotes, user-chosen (or default) for invoices
  const invBrand     = isQuoteDoc ? '#92400e' : (safeCssColor(settings.invAccentColor, '#5E2E14'));
  const invAccent    = isQuoteDoc ? '#d97706' : (safeCssColor(settings.invAccentColor, '#B8723D'));
  const invHighlight = isQuoteDoc ? '#fef3c7' : '#fcefdc';

  // Terms / conditions section
  const termsPrimary   = shopField('invTerms', _p);
  const termsSecondary = bi ? (settings[KhaytContentLanguages.fieldKey('invTerms', _s)] || '') : '';
  const termsSectionHtml = termsPrimary.trim() ? `
    <div class="inv-terms">
      <div class="label-strip">
        <span>${escapeHtml(t("doc.terms"))}</span>
        ${sub("doc.terms")}
      </div>
      <p class="inv-terms-body">${escapeHtml(termsPrimary)}</p>
      ${biContent && termsSecondary ? `<p class="inv-terms-body sec">${escapeHtml(termsSecondary)}</p>` : ''}
    </div>` : '';

  // Hijri date — a second rendering of the issue date for an Arabic-reading
  // audience, which is the same job every other secondary element does, so it
  // follows the same gate. (The original note here already called it "always
  // bilingual when toggle is on"; `bi` is now what "bilingual" means.)
  //
  // This is why the toggle alone was not enough: `useHijri` shipped defaulting
  // to true for every shop in the world, so an English quote for a US customer
  // carried a Hijri date nobody had asked for and few would recognise. The
  // default is fixed for new setups, but existing stores already have `true`
  // written into them — gating the row is what actually reaches those shops.
  const hijri = (bi && settings.useHijri) ? hijriDate(order.date, 'short') : '';

  // Bank / payment info section — only render if at least one bank field is set
  const hasBank = (settings.bankName || settings.iban || settings.accountHolder);
  const bankSectionHtml = hasBank ? `
    <div class="bank-section">
      <div class="label-strip">
        <span>${escapeHtml(t("doc.payment_info"))}</span>
        ${sub("doc.payment_info")}
      </div>
      <div class="bank-grid">
        ${settings.bankName ? `<span class="k">${escapeHtml(t('inv.bank'))}</span><span class="v">${escapeHtml(settings.bankName)}</span>` : ''}
        ${settings.accountHolder ? `<span class="k">${escapeHtml(t('inv.account'))}</span><span class="v">${escapeHtml(settings.accountHolder)}</span>` : ''}
        ${settings.iban ? `<span class="k">${escapeHtml(t('inv.iban'))}</span><span class="v" style="letter-spacing:0.05em;">${escapeHtml(settings.iban.replace(/(.{4})/g, '$1 ').trim())}</span>` : ''}
      </div>
      ${(settings.acceptedPayments && settings.acceptedPayments.length > 0) ? `
        <div class="accepted-strip">
          <span class="label">${escapeHtml(t('inv.accepted'))}</span>
          <span class="methods">
            ${settings.acceptedPayments.map(m => `<span class="pm-pill ${m}">${escapeHtml(t('pay.method.' + m))}</span>`).join('')}
          </span>
        </div>` : ''}
      ${payQrSvg ? `
        <div class="pay-qr-row">
          <div class="pay-qr-code">${payQrSvg}</div>
          <div class="pay-qr-label">
            <span>${escapeHtml(t("doc.scan_to_pay"))}</span>
            ${sub("doc.scan_to_pay")}
          </div>
        </div>` : ''}
    </div>` : '';

  // "Paid" stamp overlay
  const paidStampHtml = isPaid ? `<div class="paid-stamp">${escapeHtml(t("doc.paid_stamp"))}</div>` : '';

  const invTmpl = ['classic', 'modern', 'minimal'].includes(settings.invTemplate) ? settings.invTemplate : 'classic';
  const html = `
    <div class="inv-wrap inv-tmpl-${invTmpl}">
    <div class="inv-top-bar" style="background:${invBrand};"></div>
    <div class="inv" dir="${dir}" lang="${i18n.current}" style="--brand:${invBrand}; --accent:${invAccent}; --highlight:${invHighlight};">
      ${paidStampHtml}

      <div class="inv-header">
        <div class="biz">
          <div class="mark">${safeBizLogo() ? `<img src="${safeBizLogo()}" style="max-height:80px; max-width:150px; object-fit:contain;" alt="logo">` : BRAND_MARK_SVG}</div>
          <div class="biz-name">
            <h1>${escapeHtml(bizPrimary || 'Khayt')}</h1>
            ${taglinePrimary ? `<div class="biz-tagline">${escapeHtml(taglinePrimary)}</div>` : ''}
            ${biContent && taglineSecondary ? `<div class="biz-tagline sec ${isAr ? 'ltr' : 'ar'}">${escapeHtml(taglineSecondary)}</div>` : ''}
            ${biContent && bizSecondary ? `<div class="biz-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(bizSecondary)}</div>` : ''}
            <div class="biz-meta">
              ${addrPrimary ? `<p>${escapeHtml(addrPrimary)}</p>` : ''}
              ${biContent && addrSecondary ? `<p class="${isAr ? 'ltr' : 'ar-line ar'}">${escapeHtml(addrSecondary)}</p>` : ''}
              ${contactBits ? `<p>${escapeHtml(contactBits)}</p>` : ''}
            </div>
          </div>
        </div>

        <div class="doc">
          <div class="title">${escapeHtml(L.invoice[0])}</div>
          ${bi ? `<div class="title-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.invoice[1])}</div>` : ''}
          <div class="meta">
            <div class="meta-row">
              <span class="k">${escapeHtml(L.no[0])}</span>
              <span class="v">${escapeHtml(num(order.id))}</span>
            </div>
            <div class="meta-row">
              <span class="k">${escapeHtml(L.date[0])}</span>
              <span class="v">${escapeHtml(num(issuedDate))}</span>
            </div>
            ${hijri ? `
            <div class="meta-row">
              <span class="k">${escapeHtml(t("doc.hijri"))}</span>
              <span class="v">${escapeHtml(num(hijri))}</span>
            </div>` : ''}
            ${issuedTime ? `
            <div class="meta-row">
              <span class="k">${escapeHtml(L.time[0])}</span>
              <span class="v">${escapeHtml(num(issuedTime))}</span>
            </div>` : ''}
            ${order.clientRef ? `
            <div class="meta-row">
              <span class="k">${escapeHtml(t("doc.client_ref"))}</span>
              <span class="v">${escapeHtml(order.clientRef)}</span>
            </div>` : ''}
          </div>
        </div>
      </div>

      <div class="bill-to">
        <div class="label">
          <span>${escapeHtml(L.billTo[0])}</span>
          ${sub(L.billTo[1])}
        </div>
        <div>
          <div class="name">${escapeHtml(billToName)}${(() => {
            if (!order.clientId || !settings.loyaltyEnabled) return '';
            const tierObj = getClientTier(order.clientId);
            if (!tierObj) return '';
            return ` <span style="display:inline-block;background:#D88A3D;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;vertical-align:middle;margin-inline-start:4px;">${escapeHtml(tierObj.name)}</span>`;
          })()}</div>
          ${billToSub}
        </div>
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th>${pair('description')}</th>
            <th style="text-align:center; width: 60px;">${pair('qty')}</th>
            <th class="th-amount" style="width: 150px;">${pair('amount')}</th>
          </tr>
        </thead>
        <tbody>${linesHtml}${extraLinesHtml}</tbody>
      </table>

      <div class="totals">
        ${settings.enableZatca ? `
        <div class="qr-box">
          <div class="qr-svg">${qrSvg || `<div style="font-size:11px;color:#b91c1c;padding:18px 8px;line-height:1.5;">
            <strong>${escapeHtml(t('inv.qr_not_compliant'))}</strong><br>${escapeHtml(qrProblem || t('inv.qr_failed'))}</div>`}</div>
          <div class="qr-label">
            <span>${escapeHtml(L.qrLabel[0])}</span>
            ${sub(L.qrLabel[1])}
          </div>
        </div>` : ''}
        <div class="summary">
          <div class="row">
            <span class="label-en">${escapeHtml(L.subtotal[0])}</span>
            <span class="v">${subtotalShown} ${invCurrSym}</span>
          </div>
          ${order.discountPct > 0 ? `
          <div class="row" style="color:#22c55e;">
            <span class="label-en">${escapeHtml(isAr ? `خصم (${order.discountPct}%)` : `Discount (${order.discountPct}%)`)}</span>
            <span class="v">−${fmtMoney(Math.max(0, (+order.priceBeforeDiscount || 0) * (+order.discountPct || 0) / 100))} ${invCurrSym}</span>
          </div>` : ''}
          ${(+order.rushFeeAmount || 0) > 0 ? `
          <div class="row">
            <span class="label-en">${escapeHtml(t("doc.rush_fee"))}</span>
            <span class="v">${fmtMoney(+order.rushFeeAmount)} ${invCurrSym}</span>
          </div>` : ''}
          ${(+order.shippingCost || 0) > 0 ? `
          <div class="row">
            <span class="label-en">${escapeHtml(t("doc.shipping"))}</span>
            <span class="v">${fmtMoney(+order.shippingCost)} ${invCurrSym}</span>
          </div>` : ''}
          ${vatRate > 0 ? `
          <div class="row">
            <span class="label-en">${escapeHtml(L.vat[0])} ${t("doc.incl")}</span>
            <span class="v">${vatAmount} ${invCurrSym}</span>
          </div>` : ''}
          <div class="row grand">
            <span>
              <span class="label-en">${escapeHtml(L.totalDue[0])}</span>
              ${bi ? `<span class="label-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(L.totalDue[1])}</span>` : ''}
            </span>
            <span class="v">${total}<span class="unit">${invCurrSym}</span></span>
          </div>
          ${(() => {
            const orderCur = invCurrencyCode;
            const baseCur = settings.currency || 'SAR';
            const xrate = (settings.exchangeRates || {})[orderCur];
            if (orderCur && orderCur !== baseCur && xrate && xrate > 0) {
              const convertedAmt = fmtMoney((+order.price || 0) * xrate);
              const baseSym = (CURRENCIES[baseCur] || CURRENCIES.SAR).symbol;
              return `<div class="row" style="opacity:0.65;font-size:11px;border-top:1px dashed rgba(0,0,0,0.1);padding-top:4px;margin-top:4px;">
                <span class="label-en">${escapeHtml(isAr ? `المبلغ بـ ${baseCur}` : `Amount in ${baseCur}`)}</span>
                <span class="v">${convertedAmt}<span class="unit">${escapeHtml(baseSym)}</span></span>
              </div>`;
            }
            return '';
          })()}
        </div>
      </div>

      ${bankSectionHtml}

      ${(order.instalments && order.instalments.length > 0) ? `
      <div class="inv-notes-section" style="margin-top:12px;">
        <div class="label-strip">
          <span>${escapeHtml(t("doc.payment_schedule"))}</span>
          ${sub("doc.payment_schedule")}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px;">
          <thead><tr style="color:var(--ink-mute);text-align:left;">
            <th style="padding:3px 6px;">#</th>
            <th style="padding:3px 6px;">${escapeHtml(t("doc.due_date"))}</th>
            <th style="padding:3px 6px;text-align:right;">${escapeHtml(t("doc.amount"))}</th>
            <th style="padding:3px 6px;text-align:center;">${escapeHtml(t("doc.status"))}</th>
          </tr></thead>
          <tbody>
            ${order.instalments.map((ins, i) => `
            <tr style="border-top:1px solid rgba(0,0,0,.06);">
              <td style="padding:3px 6px;">${i + 1}</td>
              <td style="padding:3px 6px;">${escapeHtml(ins.dueDate ? formatPrintDate(ins.dueDate) : '—')}</td>
              <td style="padding:3px 6px;text-align:right;">${fmtMoney(+ins.amount || 0)} ${invCurrSym}</td>
              <td style="padding:3px 6px;text-align:center;color:${ins.paid ? 'var(--ink-success,#15803d)' : 'var(--ink-mute)'}">${ins.paid ? (t("doc.paid_check")) : (t("doc.pending"))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      ${(order.invoiceNotes || '').trim() ? `
      <div class="inv-notes-section">
        <div class="label-strip">
          <span>${escapeHtml(t("doc.notes"))}</span>
          ${sub("doc.notes")}
        </div>
        <p class="inv-notes-body">${escapeHtml(order.invoiceNotes)}</p>
      </div>` : ''}

      ${termsSectionHtml}

      <div class="footer">
        <div class="thanks">${escapeHtml(shopField('footer', _p) || t('inv.thank_you'))}</div>
        ${biContent && settings[KhaytContentLanguages.fieldKey('footer', _s)] ? `<div class="thanks-ar ${isAr ? 'ltr' : 'ar'}">${escapeHtml(settings[KhaytContentLanguages.fieldKey('footer', _s)])}</div>` : ''}
        <div class="legal">${escapeHtml(L.legal)}</div>
      </div>

    </div>
    </div>`;

  // The Arabic-numeral pass is the ONE thing a string cannot do: it rewrites
  // the text of elements after they are laid out. This says whether it is
  // needed and which elements it touches, and each app does it on its own DOM.
  return { html, arabicNumerals: !!(isAr && settings.useArabicNumerals),
           selector: NUMERAL_SELECTOR };
}
const api = { invoiceHtml, NUMERAL_SELECTOR };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.KhaytInvoiceDocument = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
