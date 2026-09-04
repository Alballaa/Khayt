const dns = require('dns');
// The syntactic half of the printer guard, split out so the Mac app — which
// polls the same machines and has no `dns` — shares the same rule rather than
// writing a second, more forgiving one in Swift.
const { canonicalizeIpv4, isAllowedPrinterHost, sanitizePrinterHost } = require('./printer-host.js');


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

module.exports = {
  isBlockedHost, isAllowedPrinterHost, isBlockedLoopbackOrMetadata, sanitizeMailgunDomain,
  resolvesToBlockedHost, canonicalizeIpv4, sanitizePrinterHost,
};
