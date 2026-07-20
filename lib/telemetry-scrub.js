'use strict';
/**
 * Telemetry scrubbing pipeline — implements §4 of docs/KHAYT-3.0-TELEMETRY-SPEC.md.
 *
 * HARD INVARIANT: no shop data, no PII, no secrets, no raw paths ever leave the device.
 * That is enforced two ways, and the second is the one that matters:
 *   1. Values are scrubbed (paths → <userData>, secrets → mask, PII → <redacted>).
 *   2. The final object is rebuilt FIELD BY FIELD from an allowlist — anything the caller
 *      passes that isn't on the list simply never gets copied. So an upstream mistake
 *      cannot leak a new field; it can only fail to include one.
 *
 * Fails closed: if scrubbing throws, the caller drops the event rather than sending raw.
 */
(function () {
  const SECRET_MASK = '__KHAYT_MASKED__';
  const REDACTED = '<redacted>';
  const MESSAGE_CAP = 300;

  // Key shapes that hold credentials anywhere in the app (mirrors store.js redaction).
  const SECRET_KEY_RE = /(api[-_]?key|secret|password|passwd|token|pin|csid|pcsid|authorization|bearer|access[-_]?code|webhook[-_]?secret|private[-_]?key)/i;

  // Value shapes that are personal data regardless of the key they sit under.
  const PII_PATTERNS = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,          // email
    /\+?\d[\d\s().-]{7,}\d/g,                            // phone (incl. +9665…)
    /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,                 // IBAN
    /\b\d{9,}\b/g,                                       // long digit runs (card / CR / VAT)
  ];

  /** Collapse any filesystem path to a basename, so home dirs and usernames never leak. */
  function scrubPath(str) {
    if (typeof str !== 'string') return str;
    return str
      // file:// and absolute POSIX/Windows paths → <path>/basename
      .replace(/(?:file:\/\/)?(?:\/[^\s:()]+)+/g, (m) => '<path>/' + m.split('/').filter(Boolean).pop())
      .replace(/[A-Za-z]:\\(?:[^\s:()\\]+\\)*([^\s:()\\]+)/g, '<path>/$1');
  }

  /** Strip PII value shapes out of any free text. */
  function scrubPii(str) {
    if (typeof str !== 'string') return str;
    let out = str;
    for (const re of PII_PATTERNS) out = out.replace(re, REDACTED);
    return out;
  }

  /** Full text scrub: paths first (so path digits aren't seen as PII), then PII, then cap. */
  function scrubText(str, cap) {
    if (typeof str !== 'string') return '';
    let out = scrubPii(scrubPath(str));
    const limit = cap || MESSAGE_CAP;
    if (out.length > limit) out = out.slice(0, limit) + '…';
    return out;
  }

  /** A stack trace reduced to frame function + module basename + line. */
  function scrubStack(stack) {
    if (typeof stack !== 'string') return '';
    return stack
      .split('\n')
      .slice(0, 30)
      .map(line => scrubText(line, 200))
      .join('\n');
  }

  /** True when a key looks like it holds a credential. */
  function isSecretKey(key) { return SECRET_KEY_RE.test(String(key || '')); }

  /**
   * Deep-scrub an arbitrary object: mask secret-shaped keys, scrub strings, drop functions.
   * Used defensively — the allowlist below is the real guarantee.
   */
  function scrubValue(val, key, depth) {
    const d = depth || 0;
    if (d > 6) return null;
    if (val == null) return val;
    if (isSecretKey(key)) return SECRET_MASK;
    if (typeof val === 'string') return scrubText(val);
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    if (Array.isArray(val)) return val.slice(0, 50).map(v => scrubValue(v, '', d + 1));
    if (typeof val === 'object') {
      const out = {};
      for (const k of Object.keys(val)) out[k] = scrubValue(val[k], k, d + 1);
      return out;
    }
    return null;
  }

  // ── Allowlists (§1). Anything absent here is never sent. ────────────────
  const CRASH_FIELDS = ['type', 'name', 'message', 'stack', 'process', 'appVersion', 'electronVersion', 'osFamily', 'osMajor', 'locale', 'channel', 'installId', 'at'];
  const USAGE_FIELDS = ['feature', 'count', 'mode', 'businessType', 'vatEnabled', 'zatcaEnabled', 'onlineEnabled', 'lanEnabled', 'sessions', 'appVersion', 'locale', 'channel', 'installId', 'at'];

  const USAGE_ENUMS = {
    mode: ['simple', 'professional', 'enthusiast'],
    businessType: ['solo', 'shop', 'farm', 'b2b'],
    channel: ['stable', 'beta'],
    locale: ['en', 'ar', 'de', 'es', 'fr', 'tr', 'ja', 'zh'],
  };

  function pickEnum(val, allowed) {
    return allowed.includes(val) ? val : null;
  }

  /**
   * Build a crash report from raw input. Returns null if there is nothing useful —
   * callers treat null as "drop it".
   */
  function buildCrashReport(raw) {
    const r = raw || {};
    const out = {
      type: pickEnum(r.type, ['uncaughtException', 'unhandledRejection', 'render-process-gone', 'child-process-gone', 'renderer-error']) || 'unknown',
      name: scrubText(String(r.name || 'Error'), 80),
      message: scrubText(String(r.message || ''), MESSAGE_CAP),
      stack: scrubStack(r.stack),
      process: pickEnum(r.process, ['main', 'renderer']) || 'main',
      appVersion: scrubText(String(r.appVersion || ''), 24),
      electronVersion: scrubText(String(r.electronVersion || ''), 24),
      osFamily: pickEnum(r.osFamily, ['macOS', 'Windows', 'Linux']) || 'unknown',
      osMajor: scrubText(String(r.osMajor || ''), 12),
      locale: pickEnum(r.locale, USAGE_ENUMS.locale) || 'en',
      channel: pickEnum(r.channel, USAGE_ENUMS.channel) || 'stable',
      installId: /^[a-f0-9-]{8,64}$/i.test(String(r.installId || '')) ? String(r.installId) : '',
      at: /^\d{4}-\d{2}-\d{2}$/.test(String(r.at || '')) ? String(r.at) : new Date().toISOString().slice(0, 10),
    };
    // Rebuild strictly from the allowlist — nothing else can survive.
    const gated = {};
    for (const k of CRASH_FIELDS) gated[k] = out[k];
    return gated;
  }

  /** Build a usage counter event. Counts and enums only — never any string content. */
  function buildUsageEvent(raw) {
    const r = raw || {};
    const feature = String(r.feature || '').slice(0, 40);
    // Feature names are enum-like identifiers; reject anything with content-ish characters.
    const safeFeature = /^[a-z0-9_]+$/.test(feature) ? feature : null;
    if (!safeFeature) return null;
    const out = {
      feature: safeFeature,
      count: Number.isFinite(+r.count) ? Math.max(1, Math.min(1e6, Math.round(+r.count))) : 1,
      mode: pickEnum(r.mode, USAGE_ENUMS.mode),
      businessType: pickEnum(r.businessType, USAGE_ENUMS.businessType),
      vatEnabled: !!r.vatEnabled,
      zatcaEnabled: !!r.zatcaEnabled,
      onlineEnabled: !!r.onlineEnabled,
      lanEnabled: !!r.lanEnabled,
      sessions: Number.isFinite(+r.sessions) ? Math.max(0, Math.round(+r.sessions)) : 0,
      appVersion: scrubText(String(r.appVersion || ''), 24),
      locale: pickEnum(r.locale, USAGE_ENUMS.locale) || 'en',
      channel: pickEnum(r.channel, USAGE_ENUMS.channel) || 'stable',
      installId: /^[a-f0-9-]{8,64}$/i.test(String(r.installId || '')) ? String(r.installId) : '',
      at: /^\d{4}-\d{2}-\d{2}$/.test(String(r.at || '')) ? String(r.at) : new Date().toISOString().slice(0, 10),
    };
    const gated = {};
    for (const k of USAGE_FIELDS) gated[k] = out[k];
    return gated;
  }

  /** Bound the offline queue: newest kept, oldest dropped. */
  function boundQueue(queue, maxEvents) {
    const cap = maxEvents || 200;
    const q = Array.isArray(queue) ? queue : [];
    return q.length > cap ? q.slice(q.length - cap) : q.slice();
  }

  /** Dedupe identical scrubbed crash stacks so a crash storm can't flood the queue. */
  function dedupeCrashes(queue) {
    const seen = new Set();
    const out = [];
    for (const e of (Array.isArray(queue) ? queue : [])) {
      if (!e || e.kind !== 'crash') { out.push(e); continue; }
      const key = (e.payload && e.payload.name) + '|' + (e.payload && e.payload.stack);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  }

  const api = {
    SECRET_MASK, REDACTED, MESSAGE_CAP, CRASH_FIELDS, USAGE_FIELDS,
    scrubPath, scrubPii, scrubText, scrubStack, scrubValue, isSecretKey,
    buildCrashReport, buildUsageEvent, boundQueue, dedupeCrashes,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.KhaytTelemetryScrub = api;
})();
