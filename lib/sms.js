'use strict';

/**
 * Outbound SMS / WhatsApp sender (main-process, Node-only) — the automated
 * counterpart to the manual `shareWhatsApp` (wa.me) link. Mirrors the email
 * provider approach in main.js: a pluggable provider with hand-built HTTP
 * requests (no SDKs).
 *
 * Providers: twilio (SMS + WhatsApp), whatsapp_cloud (Meta WhatsApp Cloud API),
 * unifonic (popular SMS gateway in the Gulf), and a generic webhook.
 *
 * buildSmsRequest() is pure (no I/O) and unit-tested; sendSms() performs the
 * fetch and normalizes the result.
 */

/** Normalize a phone to digits, preserving a single leading "+". */
function normalizePhone(p, { plus = true } = {}) {
  const digits = String(p || '').replace(/[^\d]/g, '');
  return plus ? '+' + digits : digits;
}

/**
 * Build the HTTP request for a provider. Returns
 * { url, method, headers, body, contentType } or throws if mis-configured.
 *   msg = { to, message, channel('sms'|'whatsapp') }
 */
function buildSmsRequest(provider, cfg, msg) {
  cfg = cfg || {};
  const to = String(msg.to || '').trim();
  const body = String(msg.message || '').slice(0, 4096);
  const channel = msg.channel === 'whatsapp' ? 'whatsapp' : 'sms';
  if (!to) throw new Error('Missing recipient phone');

  if (provider === 'twilio') {
    if (!cfg.accountSid || !cfg.authToken) throw new Error('Twilio needs Account SID + Auth Token');
    const pre = channel === 'whatsapp' ? 'whatsapp:' : '';
    const form = new URLSearchParams({
      From: pre + (channel === 'whatsapp' ? normalizePhone(cfg.from) : (cfg.from || '')),
      To: pre + normalizePhone(to),
      Body: body,
    });
    return {
      url: `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`,
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64') },
      body: form.toString(),
      contentType: 'application/x-www-form-urlencoded',
    };
  }

  if (provider === 'whatsapp_cloud') {
    if (!cfg.phoneNumberId || !cfg.token) throw new Error('WhatsApp Cloud needs Phone Number ID + token');
    return {
      url: `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.phoneNumberId)}/messages`,
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.token },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: normalizePhone(to, { plus: false }), type: 'text', text: { preview_url: false, body } }),
      contentType: 'application/json',
    };
  }

  if (provider === 'unifonic') {
    if (!cfg.appSid) throw new Error('Unifonic needs an AppSid');
    const form = new URLSearchParams({
      AppSid: cfg.appSid,
      SenderID: cfg.senderId || '',
      Body: body,
      Recipient: normalizePhone(to, { plus: false }),
    });
    return {
      url: 'https://api.unifonic.com/rest/SMS/messages',
      method: 'POST',
      headers: {},
      body: form.toString(),
      contentType: 'application/x-www-form-urlencoded',
    };
  }

  if (provider === 'webhook') {
    if (!/^https?:\/\//i.test(String(cfg.url || ''))) throw new Error('Webhook needs an http(s) URL');
    const headers = { };
    if (cfg.secret) headers['X-Khayt-Secret'] = String(cfg.secret);
    return {
      url: cfg.url,
      method: 'POST',
      headers,
      body: JSON.stringify({ to: normalizePhone(to), message: body, channel }),
      contentType: 'application/json',
    };
  }

  throw new Error(`Unknown SMS provider: ${provider || 'none'}`);
}

/** Perform the send. Returns { ok, status } | { ok:false, error }. */
async function sendSms(provider, cfg, msg, { fetchImpl } = {}) {
  const f = fetchImpl || fetch;
  let req;
  try { req = buildSmsRequest(provider, cfg, msg); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  try {
    const res = await f(req.url, {
      method: req.method,
      headers: { 'Content-Type': req.contentType, ...req.headers },
      body: req.body,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const txt = await res.text(); if (txt) detail += ` — ${txt.slice(0, 200)}`; } catch { /* ignore */ }
      return { ok: false, status: res.status, error: detail };
    }
    return { ok: true, status: res.status };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

module.exports = { normalizePhone, buildSmsRequest, sendSms };
