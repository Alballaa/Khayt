'use strict';

/**
 * Buy-now-pay-later checkout links: Tabby, Tamara and Stripe Checkout.
 *
 * Lifted out of main.js unchanged. Three providers that share one shape — take a
 * shop's API key, POST an amount, hand back a URL for the customer — and that
 * shape has nothing to do with printers, files or windows, which is what the
 * rest of the main process is about.
 *
 * Registered the way lib/updater.js is, with its dependencies passed in rather
 * than reached for. There are only two, which is why this was the first section
 * to move: `ipcMain`, and `resolveStoreSecret` because a key may be stored
 * masked and has to be resolved from disk before it is sent anywhere.
 */

function registerPaymentLinks({ ipcMain, resolveStoreSecret }) {
  // ── BNPL: Tabby ──────────────────────────────────────────────────────────────
  ipcMain.handle('hub:bnpl-tabby', async (_e, { apiKey, merchantCode, amount, currency, description, buyer, orderId, itemName }) => {
    apiKey = resolveStoreSecret(apiKey, d => d?.settings?.bnpl?.tabby?.apiKey);
    if (!apiKey) return { ok: false, error: 'No API key configured' };
    try {
      const body = {
        payment: {
          amount:      (+amount || 0).toFixed(2),
          currency:    currency  || 'SAR',
          description: String(description || ''),
          buyer: {
            phone: String(buyer?.phone || ''),
            name:  String(buyer?.name  || ''),
            email: String(buyer?.email || ''),
          },
          buyer_history: { registered_since: '2024-01-01T00:00:00Z', loyalty_level: 0 },
          order: {
            reference_id: String(orderId || ''),
            items: [{ title: String(itemName || description || ''), unit_price: (+amount || 0).toFixed(2), qty: 1, category: '3D Printing', reference_id: String(orderId || '') }],
            tax_amount: '0.00', shipping_amount: '0.00',
          },
          meta: { order_id: String(orderId || ''), customer: String(buyer?.name || '') },
        },
        lang: 'en',
        merchant_code: String(merchantCode || ''),
        merchant_urls: {
          success: 'https://khaytapp.com/success',
          cancel:  'https://khaytapp.com/cancel',
          failure: 'https://khaytapp.com/failure',
        },
      };
      const res = await fetch('https://api.tabby.ai/api/v2/checkout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status, error: data?.error || JSON.stringify(data) };
      const url = data?.configuration?.available_products?.installments?.[0]?.web_url
               || data?.configuration?.available_products?.pay_now?.[0]?.web_url
               || null;
      return { ok: true, url, checkoutId: data?.id };
    } catch (e) { return { ok: false, error: String(e) }; }
  });

  // ── BNPL: Tamara ─────────────────────────────────────────────────────────────
  ipcMain.handle('hub:bnpl-tamara', async (_e, { apiKey, amount, currency, country, description, buyer, orderId, itemName }) => {
    apiKey = resolveStoreSecret(apiKey, d => d?.settings?.bnpl?.tamara?.apiKey);
    if (!apiKey) return { ok: false, error: 'No API key configured' };
    try {
      const cur = (currency || 'SAR').toUpperCase();
      const body = {
        order_reference_id: String(orderId || ''),
        total_amount:       { amount: (+amount || 0).toFixed(2), currency: cur },
        description:        String(description || itemName || ''),
        country_code:       (country || 'SA').toUpperCase(),
        payment_type:       'PAY_BY_INSTALMENTS',
        instalments:        3,
        items: [{
          name:         String(itemName || description || ''),
          sku:          String(orderId  || ''),
          quantity:     1,
          unit_price:   { amount: (+amount || 0).toFixed(2), currency: cur },
          total_amount: { amount: (+amount || 0).toFixed(2), currency: cur },
          type:         'digital',
        }],
        consumer: {
          email:        String(buyer?.email || ''),
          first_name:   (String(buyer?.name || '')).split(' ')[0]             || '',
          last_name:    (String(buyer?.name || '')).split(' ').slice(1).join(' ') || '',
          phone_number: String(buyer?.phone || ''),
        },
        merchant_url: {
          success:      'https://khaytapp.com/success',
          failure:      'https://khaytapp.com/failure',
          cancel:       'https://khaytapp.com/cancel',
          notification: 'https://khaytapp.com/notify',
        },
      };
      const res = await fetch('https://api.tamara.co/checkout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status, error: data?.message || JSON.stringify(data) };
      return { ok: true, url: data?.checkout_url, checkoutId: data?.checkout_id };
    } catch (e) { return { ok: false, error: String(e) }; }
  });

  // ── BNPL: Stripe Checkout (supports Klarna/Afterpay/Affirm via dashboard) ────
  ipcMain.handle('hub:bnpl-stripe', async (_e, { apiKey, amount, currency, description, successUrl, cancelUrl, customerEmail }) => {
    apiKey = resolveStoreSecret(apiKey, d => d?.settings?.bnpl?.stripe?.apiKey);
    if (!apiKey || !apiKey.startsWith('sk_')) return { ok: false, error: 'Invalid Stripe secret key (must start with sk_)' };
    // Validate redirect URLs — must be https:// and must not point to private/loopback addresses
    const validateStripeRedirectUrl = (u, fallback) => {
      const s = String(u || '');
      if (!s) return fallback;
      if (!s.startsWith('https://')) return fallback;
      try {
        const parsed = new URL(s);
        if (isBlockedHost(parsed.hostname)) return fallback;
        return s;
      } catch { return fallback; }
    };
    const safeSuccessUrl = validateStripeRedirectUrl(successUrl, 'https://khaytapp.com/success');
    const safeCancelUrl  = validateStripeRedirectUrl(cancelUrl,  'https://khaytapp.com/cancel');
    try {
      const params = new URLSearchParams({
        'mode':                                         'payment',
        'payment_method_types[]':                       'card',
        'line_items[0][price_data][currency]':          (currency || 'sar').toLowerCase(),
        'line_items[0][price_data][product_data][name]':String(description || 'Order'),
        'line_items[0][price_data][unit_amount]':       String(Math.round((+amount || 0) * 100)),
        'line_items[0][quantity]':                      '1',
        'success_url':                                  safeSuccessUrl,
        'cancel_url':                                   safeCancelUrl,
      });
      if (customerEmail) params.set('customer_email', String(customerEmail));
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, status: res.status, error: data?.error?.message || JSON.stringify(data) };
      return { ok: true, url: data?.url, sessionId: data?.id };
    } catch (e) { return { ok: false, error: String(e) }; }
  });
}

module.exports = { registerPaymentLinks };
