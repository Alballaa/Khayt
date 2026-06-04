/**
 * External integrations: email, webhooks, BNPL, LAN API, status pages, surveys,
 * Telegram, iCal, referral analytics, shipping links.
 */
/* ============================================================
   BNPL / Payment-link service catalog (23 global services)
   ============================================================ */
const BNPL_CATALOG = [
  // ── MENA ────────────────────────────────────────────────────────────────────
  { id:'tabby',       name:'Tabby',              regions:['SA','AE','KW','BH','EG','QA'], color:'#6c5ce7', hasApi:true,  dashUrl:'https://business.tabby.ai',                      desc:'Split into 4 payments, 0% interest · MENA' },
  { id:'tamara',      name:'Tamara',             regions:['SA','AE','KW'],               color:'#00b48a', hasApi:true,  dashUrl:'https://merchant.tamara.co',                      desc:'Pay in 2, 3 or 6 instalments · Gulf' },
  { id:'cashew',      name:'Cashew',             regions:['AE','KW','BH','QA'],          color:'#f59e0b', hasApi:false, dashUrl:'https://getcashew.com',                           desc:'Split purchases in the Gulf' },
  { id:'postpay',     name:'Postpay',            regions:['AE','SA'],                    color:'#0ea5e9', hasApi:false, dashUrl:'https://postpay.io',                              desc:'Pay in 3 installments · UAE/KSA' },
  // ── Europe ──────────────────────────────────────────────────────────────────
  { id:'klarna',      name:'Klarna',             regions:['SE','DE','GB','US','AU','NL'], color:'#ffb3c7', hasApi:false, dashUrl:'https://www.klarna.com/merchant',                 desc:'Pay in 3, finance or pay now · 40+ countries' },
  { id:'clearpay',    name:'Clearpay / Afterpay',regions:['AU','NZ','GB','US','CA','FR'], color:'#b2fce4', hasApi:false, dashUrl:'https://www.clearpay.co.uk/merchant',             desc:'Pay in 4 fortnightly instalments' },
  { id:'scalapay',    name:'Scalapay',           regions:['IT','FR','DE','ES','PT'],     color:'#ff6b6b', hasApi:false, dashUrl:'https://scalapay.com',                            desc:'Split into 3 · Southern Europe' },
  { id:'alma',        name:'Alma',               regions:['FR','BE','ES','IT','NL'],     color:'#fa7268', hasApi:false, dashUrl:'https://almapay.com',                             desc:'Pay in 2–12 instalments · France & Europe' },
  { id:'laybuy',      name:'Laybuy',             regions:['NZ','AU','GB'],               color:'#5b2d8e', hasApi:false, dashUrl:'https://business.laybuy.com',                    desc:'6 weekly instalments · NZ/AU/UK' },
  // ── North America ────────────────────────────────────────────────────────────
  { id:'affirm',      name:'Affirm',             regions:['US','CA'],                    color:'#0fa0db', hasApi:false, dashUrl:'https://www.affirm.com/business',                 desc:'Flexible monthly payments · US & Canada' },
  { id:'sezzle',      name:'Sezzle',             regions:['US','CA','IN','DE'],          color:'#392558', hasApi:false, dashUrl:'https://dashboard.sezzle.com',                    desc:'Pay in 4 interest-free · US/CA/EU' },
  { id:'zip',         name:'Zip (Quadpay)',       regions:['AU','NZ','US','GB','ZA'],     color:'#aa8fff', hasApi:false, dashUrl:'https://zip.co/merchants',                        desc:'Pay in 4 fortnightly · AU/US/UK' },
  // ── Asia-Pacific ─────────────────────────────────────────────────────────────
  { id:'paidy',       name:'Paidy',              regions:['JP'],                         color:'#3d5afe', hasApi:false, dashUrl:'https://merchant.paidy.com',                      desc:'Monthly consolidation & 3-instalments · Japan' },
  { id:'atome',       name:'Atome',              regions:['SG','MY','HK','ID','TH','PH'],color:'#00c853', hasApi:false, dashUrl:'https://www.atome.sg/merchants',                  desc:'Pay in 3 equal instalments · Southeast Asia' },
  { id:'kredivo',     name:'Kredivo',            regions:['ID','VN','TH','PH'],          color:'#e53935', hasApi:false, dashUrl:'https://kredivo.com/business',                    desc:'Southeast Asia BNPL leader' },
  // ── India ────────────────────────────────────────────────────────────────────
  { id:'simpl',       name:'Simpl',              regions:['IN'],                         color:'#ff4b00', hasApi:false, dashUrl:'https://getsimpl.com/merchant',                   desc:'Pay in 3 with no-cost EMI · India' },
  { id:'lazypay',     name:'LazyPay',            regions:['IN'],                         color:'#fbbf24', hasApi:false, dashUrl:'https://lazypay.in',                              desc:'Pay later & EMI · India' },
  // ── Africa ───────────────────────────────────────────────────────────────────
  { id:'mpesa',       name:'M-Pesa',             regions:['KE','TZ','GH','EG','LS','MZ'],color:'#4caf50', hasApi:false, dashUrl:'https://developer.safaricom.co.ke',               desc:'Mobile money · East & Central Africa' },
  { id:'flutterwave', name:'Flutterwave',        regions:['NG','GH','KE','ZA','EG','TZ'],color:'#f68b1e', hasApi:false, dashUrl:'https://merchant.flutterwave.com',                desc:'Pan-African payments platform' },
  // ── Latin America ────────────────────────────────────────────────────────────
  { id:'mercadopago', name:'Mercado Pago',       regions:['BR','AR','MX','CO','CL'],     color:'#00b1ea', hasApi:false, dashUrl:'https://www.mercadopago.com.br/developers',       desc:'Largest LATAM platform · cuotas / instalments' },
  { id:'kueski',      name:'Kueski Pay',         regions:['MX'],                         color:'#ff5722', hasApi:false, dashUrl:'https://kueskipay.com/negocios',                  desc:'Buy now, pay later · Mexico' },
  // ── Global ───────────────────────────────────────────────────────────────────
  { id:'stripe',      name:'Stripe',             regions:['*'],                          color:'#635bff', hasApi:true,  dashUrl:'https://dashboard.stripe.com',                    desc:'Global payments — enables Klarna/Afterpay/Affirm via dashboard' },
  { id:'paypal',      name:'PayPal Pay Later',   regions:['US','GB','AU','DE','FR','IT'], color:'#003087', hasApi:false, dashUrl:'https://www.paypal.com/merchant',                 desc:'Pay in 4 or monthly financing via PayPal' },
];

/* ============================================================
   Feature 5 (new batch): Email notification helpers
   ============================================================ */
async function autoSendEmailNotification(order, newStatus) {
  const cfg = settings.emailConfig;
  if (!cfg || cfg.provider === 'none' || !(cfg.triggers || []).includes(newStatus)) return;
  if (!order.clientId) return;
  const client = clients.find(c => c.id === order.clientId);
  if (!client?.email) {
    // Only toast if email notifications are expected (not a silent skip)
    if (cfg && cfg.provider !== 'none' && (cfg.triggers || []).includes(newStatus)) {
      toast(t('notify.no_email') || `No email on file for ${localName(client)} — notification not sent`, 'info', 3000);
    }
    return;
  }
  const shopName = settings.bizEn || 'Khayt';
  const statusLabel = t('queue.' + newStatus) || newStatus;
  const subject = `${shopName} — Order ${order.id} Update: ${statusLabel}`;
  const body = `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
    <h2 style="color:#5E2E14;">${escapeHtml(shopName)}</h2>
    <p>Dear ${escapeHtml(localName(client) || client.email)},</p>
    <p>Your order <strong>${escapeHtml(order.id)}</strong> (${escapeHtml(order.project || '')}) has been updated:</p>
    <p style="font-size:18px;font-weight:bold;color:#5E2E14;">${escapeHtml(statusLabel)}</p>
    ${order.dueDate ? `<p>Due date: ${escapeHtml(order.dueDate)}</p>` : ''}
    <p>Thank you for your business!</p>
    <p style="font-size:12px;color:#888;">— ${escapeHtml(shopName)}</p>
  </div>`;
  try {
    const result = await window.hubAPI?.sendEmail?.({ to: client.email, subject, body, smtpConfig: cfg });
    if (result?.ok) {
      toast('📧 Email sent', 'success', 2000);
    } else if (result?.fallback && result?.mailtoUrl) {
      // silently ignore fallback — user has WhatsApp
    }
  } catch(e) { /* silent */ }
}

async function checkAndSendDigest() {
  if (_digestInFlight) return;
  const d = settings.emailDigest;
  if (!d?.enabled) return;
  const cfg = settings.emailConfig;
  if (!cfg || cfg.provider === 'none') return;
  const to = d.recipientEmail || settings.email;
  if (!to) return;
  const now = new Date();
  if (now.getHours() !== (d.hour ?? 8)) return;
  // Compute period key
  let periodKey;
  if (d.frequency === 'weekly') {
    if (now.getDay() !== (d.weekday ?? 1)) return;
    // ISO week number
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    periodKey = `${now.getFullYear()}-W${String(week).padStart(2,'0')}`;
  } else {
    periodKey = now.toISOString().split('T')[0];
  }
  if (d.lastSentDate === periodKey) return; // already sent
  const body = buildDigestEmailHtml();
  const subject = `${settings.bizEn || 'Khayt'} — ${d.frequency === 'weekly' ? 'Weekly' : 'Daily'} Digest`;
  _digestInFlight = true;
  try {
    const result = await window.hubAPI?.sendEmail?.({ to, subject, body, smtpConfig: cfg });
    if (result?.ok) {
      settings.emailDigest = { ...settings.emailDigest, lastSentDate: periodKey };
      saveAll();
    }
  } finally {
    _digestInFlight = false;
  }
}

/* ============================================================
   Feature 8 (new 8-pack): Customer loyalty tiers
   ============================================================ */

/** Get the best matching tier for a client based on their completed order stats */

/** Render the loyalty tier management UI in settings */


/* ============================================================
   Round 12 — Feature 1: Outbound Webhooks
   ============================================================ */
async function fireWebhook(eventName, payload) {
  const wh = settings.webhooks;
  if (!wh?.enabled) return;
  const url = (wh.events || {})[eventName];
  if (!url) return;
  try {
    await window.hubAPI?.fireWebhook?.(url, eventName, payload, wh.secret || '');
  } catch(e) { /* silent — webhook failures must not block UI */ }
}


/* ============================================================
   Round 12 — Feature 3: Post-Delivery NPS / Star Rating Survey
   ============================================================ */
async function generateSurveyPage(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const token = order.surveyToken || ('srv-' + Date.now().toString(36));
  if (!order.surveyToken) { order.surveyToken = token; saveAll(); }

  const lanInfo = await window.hubAPI?.getLanUrl?.();
  const surveyUrl = lanInfo?.ok ? lanInfo.url + '/api/survey' : null;

  const shopName = escapeHtml(settings.bizEn || settings.bizAr || 'Khayt');
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${shopName} — Order Feedback</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;}
  .card{background:#1e293b;border-radius:16px;padding:40px 36px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5);}
  h1{font-size:22px;margin:0 0 6px;} p{color:#94a3b8;margin:0 0 24px;}
  .stars{display:flex;justify-content:center;gap:8px;margin-bottom:24px;}
  .star{font-size:40px;cursor:pointer;transition:transform .15s;} .star:hover,.star.sel{transform:scale(1.2);}
  textarea{width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;color:#e2e8f0;border-radius:8px;padding:12px;font-size:14px;resize:vertical;min-height:90px;margin-bottom:16px;}
  button{background:#5E2E14;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:15px;cursor:pointer;font-weight:600;}
  button:hover{background:#7c3d1b;} .thanks{display:none;font-size:18px;font-weight:600;color:#4ade80;}
</style></head>
<body><div class="card">
  <h1>📦 ${shopName}</h1>
  <p>Order <strong>${escapeHtml(order.id)}</strong>${order.project ? ' — ' + escapeHtml(order.project) : ''}</p>
  <p>How would you rate your experience?</p>
  <div class="stars" id="stars">
    <span class="star" data-v="1">⭐</span>
    <span class="star" data-v="2">⭐</span>
    <span class="star" data-v="3">⭐</span>
    <span class="star" data-v="4">⭐</span>
    <span class="star" data-v="5">⭐</span>
  </div>
  <div id="ratingErr" style="display:none;color:#f87171;font-size:13px;margin:-16px 0 12px;">Please select a rating first.</div>
  <textarea id="comment" placeholder="Any comments? (optional)"></textarea>
  <button onclick="submit()">Submit Feedback</button>
  <div class="thanks" id="thanks">🎉 Thank you for your feedback!</div>
</div>
<script id="survey-config" type="application/json">{"token":${JSON.stringify(token)},"orderId":${JSON.stringify(orderId)}}</script>
<script>
  const _cfg = JSON.parse(document.getElementById('survey-config').textContent);
  let rating = 0;
  document.querySelectorAll('.star').forEach(s => {
    s.addEventListener('click', () => {
      rating = parseInt(s.dataset.v);
      document.querySelectorAll('.star').forEach((st, i) => st.classList.toggle('sel', i < rating));
    });
  });
  async function submit() {
    if (!rating) { document.getElementById('ratingErr').style.display='block'; return; }
    document.getElementById('ratingErr').style.display='none';
    const btn = document.querySelector('button');
    btn.disabled = true; btn.textContent = 'Sending…';
    const data = { token: _cfg.token, orderId: _cfg.orderId, rating, comment: document.getElementById('comment').value.trim() };
    ${surveyUrl ? `
    try {
      const r = await fetch(${JSON.stringify(surveyUrl)}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (r.ok) {
        document.getElementById('thanks').style.display = 'block';
        btn.style.display = 'none';
        document.getElementById('stars').style.pointerEvents = 'none';
      } else {
        btn.disabled = false; btn.textContent = 'Submit Feedback';
        document.getElementById('thanks').textContent = '⚠ Submission failed. Please try again.';
        document.getElementById('thanks').style.cssText = 'display:block;color:#f87171;';
      }
    } catch(e) {
      btn.disabled = false; btn.textContent = 'Submit Feedback';
      document.getElementById('thanks').textContent = '⚠ Could not connect. Make sure you are on the same network.';
      document.getElementById('thanks').style.cssText = 'display:block;color:#f87171;';
    }
    ` : `
    document.getElementById('thanks').textContent = '⚠ Survey endpoint not available. Please contact the shop directly.';
    document.getElementById('thanks').style.cssText = 'display:block;color:#f87171;font-size:14px;';
    btn.disabled = false; btn.textContent = 'Submit Feedback';
    `}
  }
</script>
</body></html>`;

  window.hubAPI?.saveHtml?.(html, `survey-${orderId}.html`);
  toast(t('cl.portal_generated'), 'success', 4000);
}

function openRecordSurveyModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  openFormModal({
    title: '📊 Record Customer Feedback',
    saveLabel: 'Save',
    bodyHtml: `
      <p style="color:var(--text-muted);margin:0 0 16px;">Manually record the customer's rating for order <strong>${escapeHtml(orderId)}</strong>.</p>
      <label>Star Rating (1–5)</label>
      <div style="display:flex;gap:8px;margin-bottom:16px;" id="surveyStarRow">
        ${[1,2,3,4,5].map(n => `<button class="btn${(order.survey?.rating||0)>=n ? ' primary' : ' ghost'}" data-star="${n}" style="font-size:20px;padding:6px 10px;" type="button">⭐</button>`).join('')}
      </div>
      <label>Comment (optional)</label>
      <textarea id="surveyComment" rows="3">${escapeHtml(order.survey?.comment||'')}</textarea>`,
    onMount: () => {
      $$('#surveyStarRow button').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = parseInt(btn.dataset.star);
          $$('#surveyStarRow button').forEach((b, i) => {
            b.className = 'btn ' + (i < v ? 'primary' : 'ghost');
          });
        });
      });
    },
    onSave: () => {
      const rating = $$('#surveyStarRow button').filter(b => b.className.includes('primary')).length;
      order.survey = { rating, comment: $('#surveyComment').value.trim(), recordedAt: new Date().toISOString() };
      saveAll();
      toast(`✅ Rating saved: ${rating}/5`, 'success');
    }
  });
}


/* ============================================================
   Round 12 — Feature 6: Recurring job auto-clone improvements
   (Existing checkRecurringOrders extended with leadDays + template selection)
   ============================================================ */
// (checkRecurringOrders is extended in-place below its existing definition via post-load call)

/* ============================================================
   Round 12 — Feature 7: LAN API settings
   ============================================================ */

/* ============================================================
   ZATCA Phase 2 Settings
   ============================================================ */

/* ============================================================
   Feature H3: Exchange Rates Settings
   ============================================================ */

/* ============================================================
   BNPL / Payment Link Settings
   ============================================================ */

async function openBnplModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const buyer  = { name: client ? localName(client) : (order.client || ''), phone: client?.phone || '', email: client?.email || '' };
  const amount = +order.price || 0;
  const b      = settings.bnpl || {};

  const apiSvcs = BNPL_CATALOG.filter(s => s.hasApi && b[s.id]?.enabled && b[s.id]?.apiKey);

  const svcRows = apiSvcs.length
    ? apiSvcs.map(svc => `
        <div class="bnpl-modal-svc" data-svc="${escapeHtml(svc.id)}" style="padding:12px;background:var(--bg-elev);border-radius:var(--radius);margin-bottom:10px;border-left:3px solid ${escapeHtml(svc.color)};">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="font-weight:600;">${escapeHtml(svc.name)}</span>
            <button class="btn ghost small" id="bnplGen_${escapeHtml(svc.id)}">${t('bnpl.generate')}</button>
          </div>
          <div id="bnplResult_${escapeHtml(svc.id)}" style="margin-top:8px;font-size:12px;"></div>
        </div>`
    ).join('')
    : `<p style="color:var(--text-muted);font-size:13px;">${t('bnpl.configure_first')}</p>`;

  const infoCards = BNPL_CATALOG.filter(s => !s.hasApi).map(s =>
    `<a href="#" class="bnpl-info-card" data-url="${escapeHtml(s.dashUrl)}" style="padding:8px 10px;background:var(--bg-elev);border-radius:var(--radius);border-left:2px solid ${escapeHtml(s.color)};text-decoration:none;color:inherit;cursor:pointer;display:block;">
      <span style="font-weight:600;font-size:12px;">${escapeHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--text-muted);margin-left:6px;">${s.regions.slice(0,4).join('·')}</span>
    </a>`
  ).join('');

  openFormModal({
    title: `💳 ${t('bnpl.payment_modal')} — ${escapeHtml(order.project || order.id)}`,
    fields: [],
    extraHtml: `
      <div style="margin-bottom:6px;font-size:12px;color:var(--text-muted);">${t('bnpl.amount_label')}: <strong>${fmtPrice(amount)} ${currencySymbol()}</strong></div>
      <h4 style="font-size:13px;margin-bottom:8px;">${t('bnpl.integrated')}</h4>
      ${svcRows}
      <details style="margin-top:12px;">
        <summary style="font-size:12px;cursor:pointer;color:var(--text-muted);">${t('bnpl.directory')} (${BNPL_CATALOG.filter(s=>!s.hasApi).length} ${t('bnpl.services')})</summary>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px;margin-top:8px;">${infoCards}</div>
      </details>`,
    onSubmit: () => {},
  });

  // Wire up generate buttons
  for (const svc of apiSvcs) {
    document.getElementById(`bnplGen_${svc.id}`)?.addEventListener('click', async () => {
      const btn = document.getElementById(`bnplGen_${svc.id}`);
      const res_el = document.getElementById(`bnplResult_${svc.id}`);
      if (btn) { btn.disabled = true; btn.textContent = t('bnpl.generating'); }
      let result;
      const cfg = b[svc.id];
      const commonArgs = { amount, currency: cfg.currency || 'SAR', description: order.project || order.id, buyer, orderId: order.invoiceNumber || order.id, itemName: order.project || order.id };
      if (svc.id === 'tabby')  result = await window.hubAPI?.bnplTabby?.({ ...commonArgs, apiKey: cfg.apiKey, merchantCode: cfg.merchantCode });
      if (svc.id === 'tamara') result = await window.hubAPI?.bnplTamara?.({ ...commonArgs, apiKey: cfg.apiKey, country: cfg.country || 'SA' });
      if (svc.id === 'stripe') result = await window.hubAPI?.bnplStripe?.({ ...commonArgs, apiKey: cfg.apiKey, successUrl: cfg.successUrl, cancelUrl: cfg.cancelUrl, customerEmail: buyer.email });
      if (btn) { btn.disabled = false; btn.textContent = t('bnpl.generate'); }
      if (!res_el) return;
      if (result?.ok && result.url) {
        // Generate QR for the link
        let qrHtml = '';
        try { const svg = await window.hubAPI?.generateQR?.(result.url, { width: 120, margin: 1 }); if (svg) qrHtml = svg; } catch {}
        const waMsg = t('bnpl.wa_message',{name:buyer.name,url:result.url,service:svc.name}) || `Hi ${buyer.name}, here is your payment link: ${result.url}`;
        res_el.innerHTML = `
          <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
            <div>${qrHtml}</div>
            <div style="flex:1;min-width:120px;">
              <div style="word-break:break-all;font-size:11px;margin-bottom:6px;"><a href="#" class="bnpl-open-link" data-url="${escapeHtml(result.url)}" style="color:var(--primary);">${escapeHtml(result.url)}</a></div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn ghost small bnpl-copy-link" data-url="${escapeHtml(result.url)}">${t('bnpl.copy_link')}</button>
                <button class="btn ghost small bnpl-share-wa" data-wa-phone="${escapeHtml(buyer.phone||'')}" data-wa-msg="${escapeHtml(waMsg)}">${t('bnpl.share_wa')}</button>
              </div>
            </div>
          </div>`;
        res_el.querySelectorAll('.bnpl-open-link').forEach(a => {
          a.addEventListener('click', e => { e.preventDefault(); window.hubAPI?.openExternal?.(a.dataset.url); });
        });
        res_el.querySelectorAll('.bnpl-copy-link').forEach(btn => {
          btn.addEventListener('click', () => { navigator.clipboard.writeText(btn.dataset.url).then(() => window._toast?.(window._t?.('bnpl.link_copied') || 'Copied', 'success')).catch(() => {}); });
        });
        res_el.querySelectorAll('.bnpl-share-wa').forEach(btn => {
          btn.addEventListener('click', () => { window.hubAPI?.shareWhatsApp?.({ phone: btn.dataset.waPhone, message: btn.dataset.waMsg, pdfPath: null }); });
        });
        toast(t('bnpl.link_generated'), 'success');
      } else {
        res_el.innerHTML = `<span style="color:var(--danger);font-size:12px;">❌ ${escapeHtml(result?.error || 'Failed')}</span>`;
      }
    });
  }

  // Info card clicks
  document.querySelectorAll('.bnpl-info-card').forEach(card => {
    card.addEventListener('click', e => { e.preventDefault(); window.hubAPI?.openExternal?.(card.dataset.url); });
  });
}

async function startLanServer() {
  const lan = settings.lanApi || {};
  const res = await window.hubAPI?.startLanServer?.({ port: lan.port || 3219, pin: lan.pin || '', bindLan: lan.bindLan ? 'lan' : 'loopback' });
  const statusRow = $('#lanStatusRow');
  const qrWrap    = $('#lanQrWrap');
  if (res?.ok) {
    if (statusRow) {
      statusRow.innerHTML = `🟢 Active at <a href="#" class="lan-url-link" data-url="${escapeHtml(res.url)}" style="color:var(--primary);">${escapeHtml(res.url)}</a>`;
      statusRow.querySelectorAll('.lan-url-link').forEach(a => { a.addEventListener('click', e => { e.preventDefault(); window.hubAPI?.openExternal?.(a.dataset.url); }); });
    }
    settings.lanApi = { ...settings.lanApi, enabled: true };
    if (res.intakeTokenGenerated) settings.lanApi.intakeToken = STORE_SECRET_MASK;
    if (res.intakePinGenerated) settings.lanApi.intakePin = STORE_SECRET_MASK;
    saveAll();
    loadLanQr(res.url);
    updateWebhookUrlDisplay(res.url);
  } else {
    if (statusRow) statusRow.textContent = `❌ Failed: ${res?.error || 'unknown error'}`;
  }
}

function updateWebhookUrlDisplay(baseUrl) {
  const section = document.getElementById('lanWebhookSection');
  const display = document.getElementById('webhookUrlDisplay');
  if (!section || !display) return;
  const token = settings.lanApi?.webhookToken || '';
  if (!baseUrl || !token) { section.style.display = 'none'; return; }
  const firstMachine = machines[0];
  const machineId = firstMachine?.id || 'machine-id';
  const url = `${baseUrl}/api/webhook/printer/${encodeURIComponent(machineId)}`;
  display.textContent = url;
  let hint = section.querySelector('.webhook-token-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'webhook-token-hint';
    hint.style.cssText = 'font-size:11px;color:var(--text-muted);margin:6px 0 0;';
    display.insertAdjacentElement('afterend', hint);
  }
  hint.textContent = t('lan.webhook_header_hint') || 'Send webhook token via x-khayt-webhook-token header (not in URL)';
  section.style.display = 'block';
}

async function loadLanQr(urlOverride) {
  const qrWrap = $('#lanQrWrap');
  if (!qrWrap) return;
  let url = urlOverride;
  if (!url) {
    const res = await window.hubAPI?.getLanUrl?.();
    if (!res?.ok) return;
    url = res.url;
  }
  // PIN is passed via x-khayt-pin header by clients — never embed it in the QR URL
  const qrUrl = url + '/api/status';
  const svg = await window.hubAPI?.generateQR?.(qrUrl, { width: 150 });
  if (svg) {
    const pin = settings.lanApi?.pin;
    const pinNote = pin && !isSecretMasked(pin)
      ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">PIN: <code style="background:var(--bg);padding:1px 5px;border-radius:4px;">${escapeHtml(pin)}</code> (send via <code>x-khayt-pin</code> header)</div>`
      : pin && isSecretMasked(pin)
        ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">${escapeHtml(t('lan.pin_configured') || 'PIN configured — use Settings to view or change')}</div>`
        : '';
    qrWrap.style.display = 'block';
    qrWrap.innerHTML = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">Scan from phone to view queue: <span style="font-size:11px;opacity:0.7;">(click QR to copy URL)</span></div><div id="lanQrSvgWrap" style="cursor:pointer;display:inline-block;" title="Click to copy URL">${svg}</div>${pinNote}`;
    document.getElementById('lanQrSvgWrap')?.addEventListener('click', () => {
      navigator.clipboard.writeText(qrUrl).then(() => toast('URL copied to clipboard', 'success')).catch(() => {});
    });
  }
}

/* ============================================================
   Round 12 — Feature 8: Accounting Export (double-entry CSV)
   ============================================================ */
function exportAccountingCSV() {
  const rows = [['Date','DocNumber','Type','Description','Account','Debit','Credit','VAT','Currency']];
  const cur = currencySymbol();

  // Revenue entries (completed invoices)
  printLog.filter(o => o.status === 'completed').forEach(o => {
    const vatRate = settings.enableVat ? (settings.vatRate || 0) / 100 : 0;
    const subtotal = (+o.price || 0) / (1 + vatRate);
    const vat = (+o.price || 0) - subtotal;
    // Debit Accounts Receivable
    rows.push([o.date||o.timestamp?.split('T')[0]||'', o.id, 'Invoice', escapeHtml(o.project||o.client||'Order'), 'Accounts Receivable', (+o.price||0).toFixed(2), '', vat.toFixed(2), cur]);
    // Credit Revenue
    rows.push([o.date||o.timestamp?.split('T')[0]||'', o.id, 'Invoice', escapeHtml(o.project||o.client||'Order'), 'Revenue', '', subtotal.toFixed(2), '', cur]);
    // Credit VAT Payable
    if (vat > 0) rows.push([o.date||o.timestamp?.split('T')[0]||'', o.id, 'Invoice', 'VAT Payable', 'VAT Payable', '', vat.toFixed(2), vat.toFixed(2), cur]);
    // Payment entries
    if (o.paidAmount > 0) {
      rows.push([o.paidAt?.split('T')[0]||o.date||'', o.id, 'Payment', `Payment for ${escapeHtml(o.id)}`, 'Cash / Bank', (+o.paidAmount||0).toFixed(2), '', '', cur]);
      rows.push([o.paidAt?.split('T')[0]||o.date||'', o.id, 'Payment', `Payment for ${escapeHtml(o.id)}`, 'Accounts Receivable', '', (+o.paidAmount||0).toFixed(2), '', cur]);
    }
    if ((+o.giftCardDiscount || 0) > 0) {
      // Clear the gift-card-settled portion from A/R against the gift-card liability,
      // otherwise the exported ledger leaves that portion open forever.
      const gd = (+o.giftCardDiscount).toFixed(2);
      rows.push([o.paidAt?.split('T')[0]||o.date||'', o.id, 'Payment', `Gift card redeemed for ${escapeHtml(o.id)}`, 'Gift Card Liability', gd, '', '', cur]);
      rows.push([o.paidAt?.split('T')[0]||o.date||'', o.id, 'Payment', `Gift card redeemed for ${escapeHtml(o.id)}`, 'Accounts Receivable', '', gd, '', cur]);
    }
  });

  // Expense entries
  expenses.forEach(e => {
    rows.push([e.date||'', e.id||'', 'Expense', escapeHtml(e.note||e.category||'Expense'), `Expense: ${escapeHtml(e.category||'Other')}`, (+e.amount||0).toFixed(2), '', '', cur]);
    rows.push([e.date||'', e.id||'', 'Expense', escapeHtml(e.note||e.category||'Expense'), 'Cash / Bank', '', (+e.amount||0).toFixed(2), '', cur]);
  });

  downloadBlob(new Blob([rows.map(r => r.map(csvEsc).join(',')).join('\n')], { type: 'text/csv' }), 'khayt-accounting-journal.csv');
  toast('Accounting journal exported ✓', 'success');
}

/* ============================================================
   Round 12 — Feature 9: Saved filter presets
   ============================================================ */

/* ============================================================
   Round 12 — Feature 10: Per-job internal comment thread
   ============================================================ */
function renderOrderComments(orderId) {
  const el = $('#orderCommentsSection');
  if (!el) return;
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const comments = order.comments || [];
  const opName = settings.activeOperatorId
    ? (operators.find(op => op.id === settings.activeOperatorId)?.name || 'Operator')
    : (settings.bizEn || 'Admin');

  el.innerHTML = `
    <div id="commentFeed" style="max-height:260px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;">
      ${comments.length === 0 ? '<p style="color:var(--text-muted);font-size:12.5px;margin:0;">No internal notes yet.</p>' :
        comments.map(c => `
          <div style="background:var(--bg-elev);border-radius:var(--radius);padding:8px 12px;border-left:3px solid var(--primary);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:12px;font-weight:600;color:var(--primary);">${escapeHtml(c.authorName||'—')}</span>
              <span style="font-size:11px;color:var(--text-muted);">${new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <p style="margin:0;font-size:13px;white-space:pre-wrap;">${escapeHtml(c.text)}</p>
          </div>`).join('')
      }
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;">
      <textarea id="commentInput" rows="2" placeholder="Add internal note…" style="flex:1;resize:vertical;font-size:13px;"></textarea>
      <button class="btn primary" id="btnPostComment">Post</button>
    </div>`;

  // Auto-scroll to bottom
  const feed = el.querySelector('#commentFeed');
  if (feed) feed.scrollTop = feed.scrollHeight;

  el.querySelector('#btnPostComment')?.addEventListener('click', () => {
    const text = el.querySelector('#commentInput')?.value?.trim();
    if (!text) return;
    if (!order.comments) order.comments = [];
    order.comments.push({
      id: Date.now().toString(36),
      authorName: opName,
      text,
      createdAt: new Date().toISOString(),
    });
    saveAll();
    renderOrderComments(orderId);
  });
}

/* ============================================================
   Feature 7: Shareable order status page (local HTML export)
   ============================================================ */
async function exportOrderStatusPage(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
  const clientName = client ? (localName(client) || order.project) : (order.project || '');
  const bizName = settings.bizEn || settings.bizAr || 'Khayt';
  const accentColor = safeCssColor(settings.invAccentColor, '#5E2E14');

  const STATUS_ORDER = ['quote', 'pending', 'on_hold', 'printing', 'post', 'completed'];
  const STATUS_LABELS = {
    quote:     'Quote',
    pending:   'Pending',
    on_hold:   'On Hold',
    printing:  'Printing',
    post:      'Post-Processing',
    completed: 'Completed',
  };

  const curIdx = STATUS_ORDER.indexOf(order.status);
  const stepsHtml = ['Quote', 'Pending', 'Printing', 'Post-Processing', 'Completed']
    .map((lbl, i) => {
      const stepStatus = ['quote', 'pending', 'printing', 'post', 'completed'][i];
      const stepIdx = STATUS_ORDER.indexOf(stepStatus);
      const done    = curIdx >= stepIdx;
      const current = order.status === stepStatus;
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;">
        <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;
          background:${done ? accentColor : '#e5e7eb'};color:${done ? '#fff' : '#9ca3af'};
          ${current ? 'box-shadow:0 0 0 4px ' + accentColor + '33;' : ''}">
          ${done ? '✓' : (i + 1)}
        </div>
        <div style="font-size:11px;margin-top:6px;text-align:center;color:${done ? '#111827' : '#9ca3af'};font-weight:${current ? '700' : '400'};">${lbl}</div>
      </div>`;
    });
  const connectors = stepsHtml.map((s, i) => i < stepsHtml.length - 1
    ? s + `<div style="flex:0 0 24px;height:2px;background:${curIdx > STATUS_ORDER.indexOf(['quote','pending','printing','post','completed'][i]) ? accentColor : '#e5e7eb'};margin-top:15px;"></div>`
    : s
  ).join('');

  const isReady = order.status === 'completed';
  const msg = isReady
    ? 'Your order is ready for pickup / delivery!'
    : order.status === 'on_hold'
      ? `Your order is temporarily on hold.${order.holdReason ? ' Reason: ' + escapeHtml(order.holdReason) : ''}`
      : 'Your order is being processed. We\'ll notify you when it\'s ready.';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Status — ${escapeHtml(order.id)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; padding: 24px 16px; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); max-width: 480px; margin: 0 auto; overflow: hidden; }
    .header { background: ${accentColor}; color: #fff; padding: 24px; }
    .header h1 { font-size: 22px; font-weight: 700; }
    .header p { font-size: 13px; opacity: 0.8; margin-top: 4px; }
    .body { padding: 24px; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #6b7280; }
    .info-value { font-weight: 600; }
    .stepper { display: flex; align-items: flex-start; margin: 24px 0; }
    .message { background: ${isReady ? '#d1fae5' : '#fffbeb'}; border-left: 4px solid ${isReady ? '#10b981' : '#f59e0b'}; padding: 14px 16px; border-radius: 8px; margin-top: 16px; font-size: 14px; color: #374151; }
    .footer { text-align: center; padding: 16px 24px; background: #f9fafb; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${escapeHtml(bizName)}</h1>
      <p>Order Status Update</p>
    </div>
    <div class="body">
      <div class="stepper">${connectors}</div>
      <div class="info-row"><span class="info-label">Order #</span><span class="info-value">${escapeHtml(order.id)}</span></div>
      <div class="info-row"><span class="info-label">Project</span><span class="info-value">${escapeHtml(order.project || '—')}</span></div>
      <div class="info-row"><span class="info-label">Client</span><span class="info-value">${escapeHtml(clientName)}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value">${escapeHtml(STATUS_LABELS[order.status] || order.status)}</span></div>
      ${order.dueDate ? `<div class="info-row"><span class="info-label">Estimated completion</span><span class="info-value">${escapeHtml(order.dueDate)}</span></div>` : ''}
      <div class="message">${msg}</div>
    </div>
    <div class="footer">Generated by ${escapeHtml(bizName)} · ${new Date().toLocaleDateString()}</div>
  </div>
</body>
</html>`;

  if (window.hubAPI?.saveHtml) {
    await window.hubAPI.saveHtml(html, `order-status-${order.id}.html`);
    toast(t('ord.status_page_saved'), 'success');
  } else {
    // Fallback: download as blob
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `order-status-${order.id}.html`);
    toast(t('ord.status_page_saved'), 'success');
  }
}

/* ============================================================
   New 8-pack Feature 6: Split order across machines
   ============================================================ */

/* ============================================================
   New 8-pack Feature 8: Auto-export status page on status change
   ============================================================ */
async function autoExportStatusPage(order) {
  if (!order || !order.clientId) return;
  if (!window.hubAPI?.writeStatusPage) return;
  try {
    // Build the same HTML as exportOrderStatusPage but don't open it
    const client = order.clientId ? clients.find(c => c.id === order.clientId) : null;
    const clientName = client ? (localName(client) || order.project) : (order.project || '');
    const bizName = settings.bizEn || settings.bizAr || 'Khayt';
    const accentColor = safeCssColor(settings.invAccentColor, '#5E2E14');
    const STATUS_ORDER = ['quote', 'pending', 'on_hold', 'printing', 'post', 'completed'];
    const curIdx = STATUS_ORDER.indexOf(order.status);
    const stepsHtml = ['Quote', 'Pending', 'Printing', 'Post-Processing', 'Completed']
      .map((lbl, i) => {
        const stepStatus = ['quote', 'pending', 'printing', 'post', 'completed'][i];
        const stepIdx = STATUS_ORDER.indexOf(stepStatus);
        const done    = curIdx >= stepIdx;
        const current = order.status === stepStatus;
        return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;">
          <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;
            background:${done ? accentColor : '#e5e7eb'};color:${done ? '#fff' : '#9ca3af'};
            ${current ? 'box-shadow:0 0 0 4px ' + accentColor + '33;' : ''}">
            ${done ? '✓' : (i + 1)}
          </div>
          <div style="font-size:11px;margin-top:6px;text-align:center;color:${done ? '#111827' : '#9ca3af'};font-weight:${current ? '700' : '400'};">${lbl}</div>
        </div>`;
      });
    const connectors = stepsHtml.map((s, i) => i < stepsHtml.length - 1
      ? s + `<div style="flex:0 0 24px;height:2px;background:${curIdx > STATUS_ORDER.indexOf(['quote','pending','printing','post','completed'][i]) ? accentColor : '#e5e7eb'};margin-top:15px;"></div>`
      : s
    ).join('');
    const isReady = order.status === 'completed';
    const msg = isReady
      ? 'Your order is ready for pickup / delivery!'
      : order.status === 'on_hold'
        ? `Your order is temporarily on hold.${order.holdReason ? ' Reason: ' + escapeHtml(order.holdReason) : ''}`
        : 'Your order is being processed. We\'ll notify you when it\'s ready.';
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Order Status — ${escapeHtml(order.id)}</title>
<style>* { box-sizing: border-box; margin: 0; padding: 0; }body { font-family: -apple-system, sans-serif; background: #f9fafb; color: #111827; padding: 24px 16px; }.card { background: #fff; border-radius: 16px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); max-width: 480px; margin: 0 auto; overflow: hidden; }.header { background: ${accentColor}; color: #fff; padding: 24px; }.header h1 { font-size: 22px; font-weight: 700; }.body { padding: 24px; }.info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }.info-label { color: #6b7280; }.info-value { font-weight: 600; }.stepper { display: flex; align-items: flex-start; margin: 24px 0; }.message { background: ${isReady ? '#d1fae5' : '#fffbeb'}; border-left: 4px solid ${isReady ? '#10b981' : '#f59e0b'}; padding: 14px 16px; border-radius: 8px; margin-top: 16px; font-size: 14px; color: #374151; }.footer { text-align: center; padding: 16px 24px; background: #f9fafb; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }</style></head><body>
<div class="card"><div class="header"><h1>${escapeHtml(bizName)}</h1><p>Order Status Update</p></div>
<div class="body"><div class="stepper">${connectors}</div>
<div class="info-row"><span class="info-label">Order #</span><span class="info-value">${escapeHtml(order.id)}</span></div>
<div class="info-row"><span class="info-label">Project</span><span class="info-value">${escapeHtml(order.project || '—')}</span></div>
<div class="info-row"><span class="info-label">Client</span><span class="info-value">${escapeHtml(clientName)}</span></div>
<div class="info-row"><span class="info-label">Status</span><span class="info-value">${escapeHtml(order.status)}</span></div>
${order.dueDate ? `<div class="info-row"><span class="info-label">Due</span><span class="info-value">${escapeHtml(order.dueDate)}</span></div>` : ''}
<div class="message">${escapeHtml(msg)}</div></div>
<div class="footer">Generated by ${escapeHtml(bizName)} · ${new Date().toLocaleDateString()}</div></div></body></html>`;
    const filePath = await window.hubAPI.writeStatusPage(html, order.id);
    return filePath || null;
  } catch (e) { console.error('autoExportStatusPage error', e); return null; }
}

async function openSavedStatusPage(orderId) {
  if (!window.hubAPI?.writeStatusPage || !window.hubAPI?.openFile) return;
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;
  const filePath = await autoExportStatusPage(order);
  if (filePath) {
    await window.hubAPI.openFile(filePath);
  }
  toast(t('ord.status_page_open'), 'success');
}

// Feature G1: Customer Portal QR modal
async function openCustomerPortalModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;

  const lanInfo = await window.hubAPI?.getLanUrl?.();
  if (!lanInfo?.ok) {
    openFormModal({
      title: t('ord.portal_qr_title') || 'Customer Portal QR',
      noSave: true,
      sizeLg: false,
      bodyHtml: `
        <div style="text-align:center;padding:16px 0;">
          <div style="font-size:32px;margin-bottom:12px;">⚠</div>
          <p style="color:var(--warning);font-weight:600;margin-bottom:8px;">${escapeHtml(t('lan.not_running') || 'LAN server is not running')}</p>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">${escapeHtml(t('lan.start_hint') || 'Start the LAN server in Settings first')}</p>
          <button type="button" class="btn primary" data-act="open-settings-from-modal">${escapeHtml(t('nav.settings') || 'Go to Settings')}</button>
        </div>`,
    });
    return;
  }

  const url = `${lanInfo.url}/order/${orderId}/status`;
  let qrHtml = '';
  try {
    const qrDataUrl = await window.hubAPI.generateQR(url, { width: 200 });
    if (qrDataUrl) qrHtml = `<img src="${escapeHtml(qrDataUrl)}" alt="QR" style="width:200px;height:200px;display:block;margin:0 auto;">`;
  } catch(e) { /* silent */ }

  openFormModal({
    title: t('ord.portal_qr_title') || 'Customer Portal QR',
    noSave: true,
    sizeLg: false,
    bodyHtml: `
      <div style="text-align:center;padding:12px 0;">
        ${qrHtml || '<p style="color:var(--text-muted);">QR unavailable</p>'}
        <p style="font-size:12px;color:var(--text-muted);margin:12px 0 6px;word-break:break-all;">${escapeHtml(url)}</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px;">
          <button class="btn small" id="portalQrCopy">${escapeHtml(t('common.copy') || 'Copy URL')}</button>
          <button class="btn small primary" id="portalQrWa">${escapeHtml(t('inv.share_whatsapp') || 'Share WhatsApp')}</button>
        </div>
      </div>`,
    onMount(modal) {
      modal.querySelector('#portalQrCopy')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); toast(t('common.copied') || 'Copied!', 'success'); }
        catch { toast(url, 'info', 6000); }
      });
      modal.querySelector('#portalQrWa')?.addEventListener('click', async () => {
        const waMsg = `${t('ord.portal_track_msg') || 'Track your order'}: ${url}`;
        const cl = order.clientId ? clients.find(c => c.id === order.clientId) : null;
        const phone = cl?.phone || '';
        if (window.hubAPI?.shareWhatsApp) {
          await window.hubAPI.shareWhatsApp({ phone, message: waMsg, pdfPath: null });
        } else {
          const waUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
          window.open(waUrl, '_blank');
        }
      });
    },
  });
}

async function openQuoteApprovalLinkModal(orderId) {
  const order = printLog.find(o => o.id === orderId);
  if (!order) return;

  const lanInfo = await window.hubAPI?.getLanUrl?.();
  if (!lanInfo?.ok) {
    openFormModal({
      title: t('ord.quote_approval_link_title') || 'Quote Approval Link',
      noSave: true,
      sizeLg: false,
      bodyHtml: `
        <div style="text-align:center;padding:16px 0;">
          <div style="font-size:32px;margin-bottom:12px;">⚠</div>
          <p style="color:var(--warning);font-weight:600;margin-bottom:8px;">${escapeHtml(t('lan.not_running') || 'LAN server is not running')}</p>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">${escapeHtml(t('lan.start_hint') || 'Start the LAN server in Settings first')}</p>
          <button type="button" class="btn primary" data-act="open-settings-from-modal">${escapeHtml(t('nav.settings') || 'Go to Settings')}</button>
        </div>`,
    });
    return;
  }

  const token = ensureQuoteApprovalToken(order);
  const url = `${lanInfo.url}/order/${orderId}/quote?token=${encodeURIComponent(token)}`;
  let qrHtml = '';
  try {
    const qrDataUrl = await window.hubAPI.generateQR(url, { width: 200 });
    if (qrDataUrl) qrHtml = `<img src="${escapeHtml(qrDataUrl)}" alt="QR" style="width:200px;height:200px;display:block;margin:0 auto;">`;
  } catch (e) { /* silent */ }

  openFormModal({
    title: t('ord.quote_approval_link_title') || 'Quote Approval Link',
    noSave: true,
    sizeLg: false,
    bodyHtml: `
      <div style="text-align:center;padding:12px 0;">
        ${qrHtml || '<p style="color:var(--text-muted);">QR unavailable</p>'}
        <p style="font-size:12px;color:var(--text-muted);margin:12px 0 6px;word-break:break-all;">${escapeHtml(url)}</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px;">
          <button class="btn small" id="quoteApprovalCopy">${escapeHtml(t('common.copy') || 'Copy URL')}</button>
          <button class="btn small primary" id="quoteApprovalWa">${escapeHtml(t('inv.share_whatsapp') || 'Share WhatsApp')}</button>
        </div>
      </div>`,
    onMount(modal) {
      modal.querySelector('#quoteApprovalCopy')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); toast(t('common.copied') || 'Copied!', 'success'); }
        catch { toast(url, 'info', 6000); }
      });
      modal.querySelector('#quoteApprovalWa')?.addEventListener('click', async () => {
        const waMsg = `${t('ord.quote_approve_msg') || 'Please review and approve your quote'}: ${url}`;
        const cl = order.clientId ? clients.find(c => c.id === order.clientId) : null;
        const phone = cl?.phone || '';
        if (window.hubAPI?.shareWhatsApp) {
          await window.hubAPI.shareWhatsApp({ phone, message: waMsg, pdfPath: null });
        } else {
          window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, '_blank');
        }
      });
    },
  });
}

async function clearAllLogs() {
  const ok = await confirmModal(t('log.clear_q'), { danger: true });
  if (!ok) return;
  printLog = [];
  saveAll();
  renderLogs(); renderKanban(); renderAnalytics();
  toast(t('log.cleared'), 'success');
}

const CARRIER_TRACKING_URLS = {
  aramex:     n => `https://www.aramex.com/express/track?mode=0&ShipmentNumber=${n}`,
  dhl:        n => `https://www.dhl.com/en/express/tracking.html?AWB=${n}&brand=DHL`,
  fedex:      n => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  ups:        n => `https://www.ups.com/track?loc=en_US&tracknum=${n}`,
  'saudi post': n => `https://www.splonline.com.sa/en/track-your-shipment/?awb=${n}`,
  spl:        n => `https://www.splonline.com.sa/en/track-your-shipment/?awb=${n}`,
  smsa:       n => `https://www.smsaexpress.com/en/tracking?trackno=${n}`,
  dpd:        n => `https://tracking.dpd.de/status/en_US/parcel/${n}`,
  'j&t':      n => `https://www.jtexpress.sa/index/query/giftSearch.html?billcode=${n}`,
};

function getCarrierTrackingUrl(courierName, trackingNumber) {
  if (!courierName || !trackingNumber) return null;
  const key = courierName.toLowerCase().trim();
  const fn = CARRIER_TRACKING_URLS[key] ||
    Object.entries(CARRIER_TRACKING_URLS).find(([k]) => key.includes(k))?.[1];
  return fn ? fn(trackingNumber) : null;
}


/* ── Feature 10: Telegram Notification Settings ─────────────── */

function sendTelegramForOrder(order, newStatus) {
  const tg = settings.telegram;
  if (!tg || !tg.botToken || !tg.chatId) return;
  let shouldSend = false;
  let message = '';
  // tgSafe: strip control chars and truncate to prevent message manipulation
  const tgSafe = s => String(s ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 200);
  if (newStatus === 'completed' && tg.notifyOnComplete) {
    shouldSend = true;
    message = `✅ Order completed: ${tgSafe(order.project || order.id)} (${fmtPrice(order.price)})`;
  } else if (newStatus === 'on_hold' && tg.notifyOnHold) {
    shouldSend = true;
    message = `⏸ Order on hold: ${tgSafe(order.project || order.id)}${order.holdReason ? ' — ' + tgSafe(order.holdReason) : ''}`;
  }
  if (!shouldSend) return;
  window.hubAPI?.sendTelegram?.({ botToken: tg.botToken, chatId: tg.chatId, message })
    .catch(e => console.warn('Telegram notify failed:', e));
}

function checkTelegramLowStock() {
  const tg = settings.telegram;
  if (!tg || !tg.botToken || !tg.chatId || !tg.notifyOnLowStock) return;
  const threshold = settings.lowStockThreshold || 200;
  const lowItems = inventory.filter(i => (+i.weight || 0) < threshold);
  if (lowItems.length === 0) return;
  const tgSafe = s => String(s ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 100);
  const names = lowItems.slice(0, 5).map(i => tgSafe(i.material)).join(', ');
  const message = `⚠️ Low stock alert: ${names}${lowItems.length > 5 ? ` and ${lowItems.length - 5} more` : ''}`;
  window.hubAPI?.sendTelegram?.({ botToken: tg.botToken, chatId: tg.chatId, message })
    .catch(e => console.warn('Telegram low-stock notify failed:', e));
}

/* ── Feature 11: iCal Export ────────────────────────────────── */
async function exportIcalFeed() {
  const lanUrl = await window.hubAPI?.getLanUrl?.().catch(() => null);
  if (!lanUrl?.ok) { toast('Start LAN server first to use iCal', 'error'); return; }
  const icalUrl = lanUrl.url + '/calendar.ics';
  window.hubAPI?.openExternal?.(icalUrl);
}

/* ── Feature 12: Referral Attribution ──────────────────────── */
function renderReferralAnalytics() {
  const el = document.getElementById('acquisitionSourcesContainer');
  if (!el) return;

  const sources = ['instagram','referral','walk_in','website','exhibition','salla','zid','intake_form','other'];
  const counts = {};
  sources.forEach(s => { counts[s] = 0; });
  for (const o of printLog) {
    const s = o.source || 'other';
    counts[s] = (counts[s] || 0) + 1;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const colors = {
    instagram:'#e1306c', referral:'#22c55e', walk_in:'#3b82f6',
    website:'#f59e0b',   exhibition:'#a855f7', salla:'#10b981',
    zid:'#6366f1',       intake_form:'#f97316', other:'#6b7280',
  };

  const bars = sources.filter(s => counts[s] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .map(s => {
      const pct = Math.round((counts[s] / total) * 100);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="min-width:100px;font-size:12px;text-align:end;">${escapeHtml(s.replace(/_/g,' '))}</span>
        <div style="flex:1;background:var(--border);border-radius:3px;height:12px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${colors[s] || '#888'};border-radius:3px;"></div>
        </div>
        <span style="min-width:40px;font-size:11px;color:var(--text-muted);">${counts[s]} (${pct}%)</span>
      </div>`;
    }).join('');

  // Top referrers (clients whose referralCode appears on orders as referredBy)
  const referralMap = {};
  for (const o of printLog) {
    if (o.referredBy) referralMap[o.referredBy] = (referralMap[o.referredBy] || 0) + 1;
  }
  const topReferrers = Object.entries(referralMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([cid, cnt]) => {
      const cl = clients.find(c => c.id === cid);
      return `<tr><td>${cl ? escapeHtml(localName(cl)) : escapeHtml(cid)}</td><td>${cnt}</td></tr>`;
    }).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;padding:14px;">
      <h4 style="margin-bottom:10px;">Acquisition Sources</h4>
      ${bars || '<span style="color:var(--text-muted);font-size:12px;">No data</span>'}
    </div>
    ${topReferrers ? `<div class="card" style="padding:14px;">
      <h4 style="margin-bottom:10px;">Top Referrers</h4>
      <table><thead><tr><th>Client</th><th>Referrals</th></tr></thead><tbody>${topReferrers}</tbody></table>
    </div>` : ''}`;
}

/* ── Feature 13: Change Order Workflow ──────────────────────── */

/* ── Feature 14: Print Failure Photo Capture ────────────────── */

/* ── Feature 15: Shipping Carrier Integration ───────────────── */
function trackShipment(trackingNumber, carrier) {
  if (!trackingNumber) { toast('No tracking number', 'error'); return; }
  let url = '';
  const tn = encodeURIComponent(trackingNumber.trim());
  const c  = (carrier || '').toLowerCase();
  if (c === 'aramex') {
    url = `https://www.aramex.com/track/results?ShipmentNumber=${tn}`;
  } else if (c === 'saudipost' || c === 'saudi_post' || c === 'saudi post') {
    url = `https://www.saudipost.com.sa/en/tools/track?num=${tn}`;
  } else if (c === 'dhl') {
    url = `https://www.dhl.com/en/express/tracking.html?AWB=${tn}`;
  } else if (c === 'fedex') {
    url = `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
  } else {
    toast('Copy tracking number and check carrier website: ' + escapeHtml(trackingNumber), 'info', 6000);
    return;
  }
  window.hubAPI?.openExternal?.(url) || window.open(url, '_blank');
}
(function (global) {
  global.BNPL_CATALOG = BNPL_CATALOG;
  const api = {
    autoSendEmailNotification,
    checkAndSendDigest,
    fireWebhook,
    generateSurveyPage,
    openRecordSurveyModal,
    getCarrierTrackingUrl,
    openBnplModal,
    startLanServer,
    updateWebhookUrlDisplay,
    loadLanQr,
    exportAccountingCSV,
    renderOrderComments,
    exportOrderStatusPage,
    autoExportStatusPage,
    openSavedStatusPage,
    openCustomerPortalModal,
    openQuoteApprovalLinkModal,
    clearAllLogs,
    sendTelegramForOrder,
    checkTelegramLowStock,
    exportIcalFeed,
    renderReferralAnalytics,
    trackShipment,
  };
  Object.assign(global, api);
  global.KhaytIntegrations = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = { BNPL_CATALOG, ...api };
})(typeof globalThis !== 'undefined' ? globalThis : window);
