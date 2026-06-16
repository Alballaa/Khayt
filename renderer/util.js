/**
 * DOM, storage, date, HTML escape, CSV parse, and small string helpers.
 */
(function (global) {
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      const v = safeJsonParse(raw);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function $$(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function localDateStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function localMonthStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Allow only safe image URLs in img src (blocks javascript: and markup injection). */
  function safeImageSrc(url) {
    const s = String(url || '').trim();
    if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return escapeHtml(s);
    if (/^file:\/\//i.test(s)) return escapeHtml(s);
    return '';
  }

  /** Allow only http(s) links in href attributes. */
  function safeHttpUrl(url) {
    const s = String(url || '').trim();
    if (/^https?:\/\//i.test(s)) return escapeHtml(s);
    return '';
  }

  /** Parse JSON without prototype-pollution keys (matches lib/safe-json.js). */
  function safeJsonParse(text) {
    return JSON.parse(text, (key, value) => {
      if (key === '__proto__' || key === 'constructor') return undefined;
      return value;
    });
  }

  /** Full LAN URL for live order tracking (includes token). */
  function buildLanOrderTrackingUrl(lanBaseUrl, order) {
    if (!lanBaseUrl || !order?.id) return '';
    const base = String(lanBaseUrl).replace(/\/$/, '');
    const token = ensureTrackingToken(order);
    return `${base}/order/${encodeURIComponent(order.id)}?token=${encodeURIComponent(token)}`;
  }

  /** Full LAN URL for quote approval page (includes token when available). */
  function buildLanQuoteApprovalUrl(lanBaseUrl, order) {
    if (!lanBaseUrl || !order?.id) return '';
    const base = String(lanBaseUrl).replace(/\/$/, '');
    const token = ensureQuoteApprovalToken(order);
    return `${base}/order/${encodeURIComponent(order.id)}/quote?token=${encodeURIComponent(token)}`;
  }

  /** Per-order LAN live tracking secret; persists when newly generated. */
  function ensureTrackingToken(order) {
    if (!order) return '';
    if (!order.trackingToken) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      order.trackingToken = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      if (typeof saveAll === 'function') saveAll();
    }
    return order.trackingToken;
  }

  /** Per-order LAN quote approval secret; persists when newly generated. */
  function ensureQuoteApprovalToken(order) {
    if (!order) return '';
    if (!order.quoteApprovalToken) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      order.quoteApprovalToken = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      if (typeof saveAll === 'function') saveAll();
    }
    return order.quoteApprovalToken;
  }

  function timingSafeEqualHex(a, b) {
    const sa = String(a || '');
    const sb = String(b || '');
    if (sa.length !== sb.length) return false;
    let diff = 0;
    for (let i = 0; i < sa.length; i++) diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
    return diff === 0;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);
  }

  function uid(prefix = 'ID') {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  function safeCssColor(val, fallback = '#5E2E14') {
    return /^#[0-9a-fA-F]{3,8}$/.test(String(val || '')) ? String(val) : fallback;
  }

  function initials(name) {
    const n = String(name || '').trim();
    if (!n) return '?';
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join('').toUpperCase();
  }

  function parseCsvString(csv) {
    const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    if (!lines.length) return { headers: [], rows: [] };

    function parseLine(line) {
      const cols = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQ = !inQ;
        } else if (c === ',' && !inQ) {
          cols.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      cols.push(cur.trim());
      return cols;
    }

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).filter((l) => l.trim()).map(parseLine);
    return { headers, rows };
  }

  const api = {
    $,
    $$,
    loadJSON,
    saveJSON,
    localDateStr,
    localMonthStr,
    escapeHtml,
    timingSafeEqualHex,
    safeJsonParse,
    ensureQuoteApprovalToken,
    ensureTrackingToken,
    buildLanOrderTrackingUrl,
    buildLanQuoteApprovalUrl,
    safeImageSrc,
    safeHttpUrl,
    uid,
    safeCssColor,
    initials,
    parseCsvString,
  };

  Object.assign(global, api);
  global.KhaytUtil = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
