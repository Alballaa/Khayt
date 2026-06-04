/** True when host is valid for local printer API polling (RFC1918, hostnames, public IPs). */
function isAllowedPrinterHost(h) {
  if (!h) return false;
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(h)) return false;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [, a, b, c, d] = v4.map(Number);
    if (a === 0 || a === 255 || a === 240) return false;
    if (a === 127) return false;
    // Block cloud metadata only — allow link-local 169.254.x.x for mDNS/direct printers
    if (a === 169 && b === 254 && c === 169 && d === 254) return false;
    return true;
  }
  if (/^::1$|^::$|^fe80:/i.test(h)) return false;
  if (/^fc|^fd/i.test(h)) return false;
  if (/^::ffff:/i.test(h)) return false;
  return /^[a-zA-Z0-9.\-]+$/.test(h);
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

module.exports = { isBlockedHost, isAllowedPrinterHost, isBlockedLoopbackOrMetadata };
