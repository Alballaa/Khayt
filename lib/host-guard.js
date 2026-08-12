const dns = require('dns');

/**
 * Rewrite the legal-but-unusual spellings of an IPv4 address into a dotted quad.
 *
 * `connect()` goes through inet_aton, which accepts far more than four decimal
 * octets: a bare 32-bit integer, hex, octal, and short forms where the last part
 * absorbs the remaining bytes. All of these reach 127.0.0.1 —
 *
 *     2130706433      0x7f000001      127.1      0177.0.0.1
 *
 * — and none of them matches a `\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}` test. Before
 * this, they fell past the dotted-quad branch in isAllowedPrinterHost and landed
 * on the permissive "bare hostname" return at the bottom, so the guard blocked
 * `127.0.0.1` and allowed three other ways of writing it. Verified by connecting:
 * the first three reach loopback.
 *
 * The webhook path was never exposed — resolvesToBlockedHost() resolves the name
 * and catches all of them — but the printer path has only the syntactic check,
 * so the syntactic check has to be honest about what a host string means.
 *
 * @returns {string|null} dotted quad, or null when this is not numeric IPv4 at
 *   all (a real hostname), which the caller must keep treating as a hostname.
 */
function canonicalizeIpv4(host) {
  const s = String(host || '').trim();
  if (!s || !/^[0-9a-fx.]+$/i.test(s)) return null;
  const parts = s.split('.');
  if (parts.length < 1 || parts.length > 4) return null;

  const nums = [];
  for (const p of parts) {
    if (p === '') return null;
    let n;
    if (/^0[xX][0-9a-fA-F]+$/.test(p)) n = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^[0-9]+$/.test(p)) n = parseInt(p, 10);
    else return null;                      // e.g. "0x" alone, or "1a"
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }
  // Every part but the last is one octet; the last absorbs what remains.
  const last = nums.pop();
  if (nums.some((n) => n > 255)) return null;
  const remaining = 4 - nums.length;
  if (last > Math.pow(256, remaining) - 1) return null;
  const bytes = [...nums];
  for (let i = remaining - 1; i >= 0; i--) bytes.push((last >>> (8 * i)) & 255);
  return bytes.join('.');
}

/**
 * True when host is valid for local printer API polling. Printers are LAN
 * devices, so only RFC1918 + link-local (and IPv6 ULA/link-local) ranges are
 * permitted — public IPs are rejected to stop a malicious renderer pointing
 * the poller at an arbitrary internet host (SSRF). Bare hostnames (e.g. the
 * mDNS "octopi.local") are allowed but unresolved here; that is a deliberate
 * trust boundary documented at the caller.
 */
function isAllowedPrinterHost(h) {
  if (!h) return false;
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(h)) return false;
  // Numeric spellings first: 2130706433 and 127.1 are 127.0.0.1, and must be
  // judged as the address they are rather than fall through as "a hostname".
  const canon = canonicalizeIpv4(h);
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(canon || h);
  if (v4) {
    const [, a, b, c, d] = v4.map(Number);
    // Loopback / unspecified / broadcast / reserved — never a printer.
    if (a === 0 || a === 127 || a === 255 || a === 240) return false;
    // Link-local 169.254.x.x is fine for mDNS/direct printers, but never the
    // cloud metadata endpoint.
    if (a === 169 && b === 254) return !(c === 169 && d === 254);
    // RFC1918 private ranges only.
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    // Anything else is a public/unexpected IPv4 — not a LAN printer.
    return false;
  }
  if (/^::1$|^::$/i.test(h)) return false;     // IPv6 loopback / unspecified
  if (/^::ffff:/i.test(h)) return false;       // IPv4-mapped — treat as untrusted
  if (/^fe80:/i.test(h)) return true;          // IPv6 link-local (LAN)
  if (/^fc|^fd/i.test(h)) return true;         // IPv6 ULA (LAN)
  return /^[a-zA-Z0-9.\-]+$/.test(h);
}

/**
 * DNS-rebinding defence for outbound requests. Resolves a hostname to ALL of
 * its A/AAAA addresses and reports whether ANY resolved IP falls in a blocked
 * range (loopback/private/link-local/metadata), reusing isBlockedHost for the
 * range logic. A literal IP is checked directly.
 *
 * Best-effort only: this is a TOCTOU check — the OS resolver may return a
 * different answer when the socket actually connects, and Node's fetch does
 * not expose the resolved peer address for a post-connect re-check. Resolution
 * failures fail closed (treated as blocked).
 */
async function resolvesToBlockedHost(hostname) {
  const h = normalizeHostForCheck(hostname);
  if (!h) return true;
  // Literal IPs (v4 or v6) are already fully covered by the string check.
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) || h.includes(':')) {
    return isBlockedHost(h);
  }
  try {
    const addrs = await dns.promises.lookup(h, { all: true });
    return addrs.some(a => isBlockedHost(a.address));
  } catch {
    return true; // fail closed — cannot verify, so refuse
  }
}

/**
 * Normalise a hostname for the checks below.
 *
 * Every production caller passes `new URL(url).hostname`, which returns an IPv6 literal
 * WRAPPED IN BRACKETS — "[::1]", "[fd00::1]". The IPv6 patterns here test bare literals
 * ("^::1$", "^fc", "^fd", "^::ffff:"), so none of them ever matched a real caller and the
 * function fell through to "not blocked". IPv4 was unaffected, which is why this went
 * unnoticed: 127.0.0.1 was blocked while http://[::1]:PORT/ sailed through to fetch().
 * The unit tests passed the bare form, the only shape that worked.
 *
 * Also lowercases, since the IPv6 tests are otherwise case-sensitive in places.
 */
function normalizeHostForCheck(h) {
  const bare = String(h || '').trim().replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  // Unwrap IPv4-mapped IPv6 to its dotted form so the IPv4 range logic applies. WHATWG URL
  // normalises "[::ffff:127.0.0.1]" to "[::ffff:7f00:1]" (hex), so both spellings must be
  // decoded — otherwise ::ffff:127.0.0.1 slipped past isBlockedLoopbackOrMetadata, which
  // has no IPv6 branch for it at all.
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(bare);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(bare);
  if (hex) {
    const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  // Numeric IPv4 spellings resolve to the same address a dotted quad does, so
  // the range tests below must see the dotted quad. Shared by isBlockedHost and
  // isBlockedLoopbackOrMetadata — the latter guards outbound SMTP and, like the
  // printer path, has no DNS-resolving second layer behind it.
  return canonicalizeIpv4(bare) || bare;
}

/** True when host must not be used for outbound requests (loopback, RFC1918, metadata, etc.). */
function isBlockedHost(rawHost) {
  const h = normalizeHostForCheck(rawHost);
  if (!h) return true;
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(h)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [, a, b, c, d] = v4.map(Number);
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 240) return true;
    if (a === 255) return true;
  }
  if (/^::1$|^::$|^fe80:/i.test(h)) return true;
  if (/^fc|^fd/i.test(h)) return true;
  if (/^::ffff:/i.test(h)) return true;
  return false;
}

/** Block loopback and cloud metadata — used for outbound SMTP (allows LAN mail relays). */
function isBlockedLoopbackOrMetadata(rawHost) {
  const h = normalizeHostForCheck(rawHost);
  if (!h) return true;
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(h)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [, a, b, c, d] = v4.map(Number);
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254 && c === 169 && d === 254) return true;
  }
  if (/^::1$|^::$|^fe80:/i.test(h)) return true;
  return false;
}

/** Allow only a plain hostname for Mailgun API path (blocks slashes, userinfo, ports). */
function sanitizeMailgunDomain(domain) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d || d.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null;
  return d;
}

module.exports = { isBlockedHost, isAllowedPrinterHost, isBlockedLoopbackOrMetadata, sanitizeMailgunDomain, resolvesToBlockedHost };
