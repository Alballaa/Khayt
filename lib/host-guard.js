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

module.exports = { isBlockedHost };
