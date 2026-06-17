const dns = require('dns');

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
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
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
  const h = String(hostname || '').trim();
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

/** True when host must not be used for outbound requests (loopback, RFC1918, metadata, etc.). */
function isBlockedHost(h) {
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
function isBlockedLoopbackOrMetadata(h) {
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
