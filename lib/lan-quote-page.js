'use strict';

const crypto = require('crypto');

/** Escape text for LAN HTML responses. */
function lanEscapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LAN_QUOTE_STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;padding:24px 16px}
.container{max-width:520px;margin:0 auto}
.header{text-align:center;margin-bottom:24px}
.header h1{font-size:1.5rem;font-weight:700;color:#f1f5f9;margin-bottom:4px}
.header p{color:#94a3b8;font-size:.9rem}
.card{background:#1e293b;border-radius:16px;padding:24px;margin-bottom:16px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.meta label{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:#64748b;display:block;margin-bottom:2px}
.meta span{font-size:.9rem;color:#e2e8f0}
table{width:100%;border-collapse:collapse;font-size:.85rem;margin:12px 0}
th{text-align:left;color:#64748b;font-size:.72rem;text-transform:uppercase;padding:8px 6px;border-bottom:1px solid #334155}
td{padding:8px 6px;border-bottom:1px solid #0f172a}
.total-row td{font-weight:700;color:#f1f5f9}
.btn{display:block;width:100%;padding:14px;border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;margin-top:8px}
.btn-primary{background:#6366f1;color:#fff}
.btn-primary:disabled{opacity:.5;cursor:not-allowed}
.note{font-size:.85rem;color:#94a3b8;line-height:1.5;text-align:center}
.ok{color:#4ade80;font-size:1.1rem;font-weight:600;text-align:center}
`;

/**
 * Render mobile-friendly quote approval page.
 * @param {{ order: object, shopName: string, approvePath: string, alreadyApproved?: boolean, expired?: boolean }} opts
 */
/** Ensure per-order secret required to approve quotes over LAN (prevents IDOR by order id alone). */
function ensureQuoteApprovalToken(order) {
  if (!order) return '';
  if (!order.quoteApprovalToken) {
    order.quoteApprovalToken = crypto.randomBytes(16).toString('hex');
  }
  return order.quoteApprovalToken;
}

function verifyQuoteApprovalToken(order, provided) {
  const expected = order?.quoteApprovalToken;
  const token = String(provided || '').trim();
  if (!expected || !token) return false;
  try {
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(String(expected), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function renderLanQuoteApprovalPage({
  order,
  shopName,
  approvePath,
  approvalToken = '',
  alreadyApproved = false,
  expired = false,
  currencyLabel = 'SAR',
}) {
  const project = lanEscapeHtml(order.project || order.id);
  const id = lanEscapeHtml(order.id);
  const price = lanEscapeHtml(String(+order.price || 0));
  const parts = order.parts || [];
  const partsRows = parts.length
    ? parts.map((p, i) => `<tr><td>${i + 1}. ${lanEscapeHtml(p.name || p.material || 'Part')}</td><td style="text-align:right;">${lanEscapeHtml(String(p.qty || 1))}</td></tr>`).join('')
    : `<tr><td colspan="2">${project}</td></tr>`;

  let actionBlock = '';
  if (alreadyApproved) {
    actionBlock = `<p class="ok">✅ Quote approved — we'll start production soon.</p>`;
  } else if (expired) {
    actionBlock = `<p class="note" style="color:#f87171;">This quote has expired. Please contact ${lanEscapeHtml(shopName)} for an updated quote.</p>`;
  } else {
    actionBlock = `
      <p class="note" style="margin-bottom:12px;">Review the quote below and tap approve to confirm your order.</p>
      <button class="btn btn-primary" id="approveBtn">✅ Approve Quote</button>
      <p class="note" style="margin-top:12px;font-size:.75rem;">By approving you agree to proceed with this order at the quoted price.</p>
      <script>
        document.getElementById('approveBtn').addEventListener('click', async function() {
          const btn = this;
          btn.disabled = true;
          btn.textContent = 'Submitting…';
          try {
            const r = await fetch(${JSON.stringify(approvePath)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', approvalToken: ${JSON.stringify(approvalToken)} }) });
            if (r.ok) { location.reload(); return; }
            btn.disabled = false;
            btn.textContent = '✅ Approve Quote';
            alert('Could not approve — please try again or contact the shop.');
          } catch (e) {
            btn.disabled = false;
            btn.textContent = '✅ Approve Quote';
            alert('Network error — check your Wi-Fi connection.');
          }
        });
      </script>`;
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote ${id} — ${lanEscapeHtml(shopName)}</title><style>${LAN_QUOTE_STYLES}</style></head><body>
<div class="container">
  <div class="header"><h1>${lanEscapeHtml(shopName)}</h1><p>Quote approval · ${id}</p></div>
  <div class="card">
    <div class="meta">
      <div><label>Project</label><span>${project}</span></div>
      <div><label>Quote #</label><span>${id}</span></div>
      ${order.date ? `<div><label>Date</label><span>${lanEscapeHtml(order.date)}</span></div>` : ''}
      ${order.quoteExpiresAt ? `<div><label>Expires</label><span>${lanEscapeHtml(order.quoteExpiresAt)}</span></div>` : ''}
    </div>
    <table><thead><tr><th>Description</th><th style="text-align:right;">Qty</th></tr></thead><tbody>${partsRows}</tbody>
    <tfoot><tr class="total-row"><td>Total</td><td style="text-align:right;">${price} ${lanEscapeHtml(currencyLabel)}</td></tr></tfoot></table>
    ${actionBlock}
  </div>
</div></body></html>`;
}

/** Apply quote approval to a store snapshot; returns updated order or null. */
function applyQuoteApprovalToStore(storeData, orderId) {
  const idx = (storeData.printLog || []).findIndex(o => o.id === orderId);
  if (idx === -1) return null;
  const order = storeData.printLog[idx];
  if (isQuoteExpired(order)) return { error: 'expired', order };
  const canApprove = order.status === 'quote' || (order.status === 'on_hold' && order.hasQuote);
  if (!canApprove) return { error: 'cannot_approve', order };
  const now = new Date().toISOString();
  storeData.printLog[idx] = {
    ...order,
    status: 'pending',
    clientApprovedAt: now,
    quoteAcceptedAt: now.split('T')[0],
  };
  return { order: storeData.printLog[idx] };
}

function isQuoteExpired(order) {
  if (!order?.quoteExpiresAt) return false;
  const today = new Date().toISOString().slice(0, 10);
  return order.quoteExpiresAt < today;
}

module.exports = {
  lanEscapeHtml,
  ensureQuoteApprovalToken,
  verifyQuoteApprovalToken,
  renderLanQuoteApprovalPage,
  applyQuoteApprovalToStore,
  isQuoteExpired,
};
