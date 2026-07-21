const { test } = require('node:test');
const LAN = require('../lib/lan-server.js');
const assert = require('node:assert/strict');
const {
  lanEscapeHtml,
  safeTokenEqual,
  pickLanIPv4,
  uniqueLanId,
  pickLanSpoolFields,
  sanitizeLanHttpUrl,
  tunnelClientIp,
  scriptSafeJson,
  globalAuthThrottle,
  weakTunnelPinWarning,
} = require('../lib/lan-server.js');

test('globalAuthThrottle trips after N failures and blocks all attempts during cooldown', () => {
  const state = { count: 0, windowStart: 0, blockedUntil: 0 };
  const opts = { limit: 5, windowMs: 60_000, cooldownMs: 60_000 };
  const now = 1_000;
  // First 4 failures within the window do not trip the gate.
  for (let i = 0; i < 4; i++) {
    assert.equal(globalAuthThrottle(state, now, true, opts), false, `failure ${i + 1} should not block`);
  }
  // 5th failure trips the gate.
  assert.equal(globalAuthThrottle(state, now, true, opts), true);
  // While in cooldown, even a non-failing probe is blocked.
  assert.equal(globalAuthThrottle(state, now + 1, false, opts), true);
  assert.equal(globalAuthThrottle(state, now + 30_000, true, opts), true);
  // After cooldown elapses, attempts are allowed again.
  assert.equal(globalAuthThrottle(state, now + 60_001, false, opts), false);
});

test('globalAuthThrottle rolling window resets the failure count', () => {
  const state = { count: 0, windowStart: 0, blockedUntil: 0 };
  const opts = { limit: 3, windowMs: 10_000, cooldownMs: 10_000 };
  assert.equal(globalAuthThrottle(state, 1_000, true, opts), false); // count 1
  assert.equal(globalAuthThrottle(state, 2_000, true, opts), false); // count 2
  // Jump past the window — counter resets, so these start a fresh count.
  assert.equal(globalAuthThrottle(state, 20_000, true, opts), false);
  assert.equal(globalAuthThrottle(state, 21_000, true, opts), false);
  assert.equal(globalAuthThrottle(state, 22_000, true, opts), true); // now 3 → trips
});

test('globalAuthThrottle never trips on successful (non-failed) attempts alone', () => {
  const state = { count: 0, windowStart: 0, blockedUntil: 0 };
  const opts = { limit: 2, windowMs: 60_000, cooldownMs: 60_000 };
  for (let i = 0; i < 50; i++) {
    assert.equal(globalAuthThrottle(state, 1_000 + i, false, opts), false);
  }
});

test('weakTunnelPinWarning only warns when tunnel active and PIN is weak (never blocks)', () => {
  // Tunnel off → never warns regardless of PIN strength.
  assert.equal(weakTunnelPinWarning('123', false), null);
  // Short PIN under tunnel → warns.
  assert.ok(weakTunnelPinWarning('1234', true));
  assert.ok(weakTunnelPinWarning('abc', true));
  // All-digit 7-char under tunnel → still weak.
  assert.ok(weakTunnelPinWarning('1234567', true));
  // Strong alphanumeric PIN → no warning.
  assert.equal(weakTunnelPinWarning('a1b2c3d4', true), null);
});

test('tunnelClientIp trusts X-Forwarded-For only when tunnelling a loopback socket', () => {
  // Direct LAN connection — always trust the real socket, never XFF (spoofable).
  assert.equal(tunnelClientIp('192.168.1.5', '1.2.3.4', false), '192.168.1.5');
  assert.equal(tunnelClientIp('192.168.1.5', '1.2.3.4', true), '192.168.1.5');
  // Behind the tunnel the socket is loopback — fall back to the XFF first hop.
  assert.equal(tunnelClientIp('127.0.0.1', '203.0.113.9, 10.0.0.1', true), '203.0.113.9');
  assert.equal(tunnelClientIp('::ffff:127.0.0.1', '203.0.113.9', true), '203.0.113.9');
  assert.equal(tunnelClientIp('::1', '203.0.113.9', true), '203.0.113.9');
  // Loopback but no tunnel, or no XFF present — keep the direct address.
  assert.equal(tunnelClientIp('127.0.0.1', '203.0.113.9', false), '127.0.0.1');
  assert.equal(tunnelClientIp('127.0.0.1', '', true), '127.0.0.1');
});

test('scriptSafeJson neutralizes </script> and HTML metacharacters', () => {
  assert.equal(scriptSafeJson('a</script>b'), '"a\\u003c/script\\u003eb"');
  assert.equal(scriptSafeJson('x&y'), '"x\\u0026y"');
  assert.equal(JSON.parse(scriptSafeJson('a</script>b')), 'a</script>b');
  assert.ok(!scriptSafeJson('</script>').includes('</script>'));
});

test('lanEscapeHtml encodes HTML special characters', () => {
  assert.equal(lanEscapeHtml('<script>"&"'), '&lt;script&gt;&quot;&amp;&quot;');
  assert.equal(lanEscapeHtml(null), '');
});

test('safeTokenEqual compares tokens in constant time', () => {
  assert.equal(safeTokenEqual('secret-token', 'secret-token'), true);
  assert.equal(safeTokenEqual('secret-token', 'wrong-token'), false);
  assert.equal(safeTokenEqual('', 'x'), false);
  assert.equal(safeTokenEqual('abc', 'abcd'), false);
});

test('pickLanIPv4 prefers 192.168 over VPN 10.x', () => {
  const ip = pickLanIPv4({
    utun0: [{ family: 'IPv4', address: '10.8.0.2', internal: false }],
    en0: [{ family: 'IPv4', address: '192.168.1.42', internal: false }],
  });
  assert.equal(ip, '192.168.1.42');
});

test('uniqueLanId includes random suffix', () => {
  const a = uniqueLanId('spool');
  const b = uniqueLanId('spool');
  assert.match(a, /^spool-\d+-[0-9a-f]{4}$/);
  assert.notEqual(a, b);
});

test('pickLanSpoolFields allowlists inventory fields only', () => {
  const spool = pickLanSpoolFields({
    material: 'PLA',
    brand: 'Prusament',
    __proto__: { polluted: true },
    hack: 'drop-me',
    weightTotal: 1000,
  });
  assert.equal(spool.material, 'PLA');
  assert.equal(spool.weightTotal, 1000);
  assert.equal(Object.hasOwn(spool, 'hack'), false);
  assert.equal(Object.hasOwn(spool, '__proto__'), false);
});

test('sanitizeLanHttpUrl accepts http(s) only', () => {
  assert.equal(sanitizeLanHttpUrl('https://example.com/x'), 'https://example.com/x');
  assert.equal(sanitizeLanHttpUrl('javascript:alert(1)'), undefined);
  assert.equal(sanitizeLanHttpUrl('data:text/html,x'), undefined);
});

test('normalizePrinterEvent maps vendor payloads to canonical events', () => {
  const { normalizePrinterEvent } = require('../lib/lan-server.js');
  assert.equal(normalizePrinterEvent({ topic: 'Print Finished' }), 'print_done');
  assert.equal(normalizePrinterEvent({ event: 'job.started' }), 'print_started');
  assert.equal(normalizePrinterEvent({ state: 'printing' }), 'print_started');
  assert.equal(normalizePrinterEvent({ state: 'completed' }), 'print_done');
  assert.equal(normalizePrinterEvent({ event: 'custom_status' }), 'custom_status');
  assert.equal(normalizePrinterEvent({}), null);
});

test('tunnelClientIp trusts X-Forwarded-For only when tunnelling a loopback socket', () => {
  const { tunnelClientIp } = require('../lib/lan-server.js');
  // Direct LAN connection — always trust the real socket, never XFF (spoofable).
  assert.equal(tunnelClientIp('192.168.1.5', '1.2.3.4', false), '192.168.1.5');
  assert.equal(tunnelClientIp('192.168.1.5', '1.2.3.4', true), '192.168.1.5');
  // Behind the tunnel the socket is loopback — fall back to the XFF first hop.
  assert.equal(tunnelClientIp('127.0.0.1', '203.0.113.9, 10.0.0.1', true), '203.0.113.9');
  assert.equal(tunnelClientIp('::ffff:127.0.0.1', '203.0.113.9', true), '203.0.113.9');
  assert.equal(tunnelClientIp('::1', '203.0.113.9', true), '203.0.113.9');
  // Loopback but no tunnel, or no XFF present — keep the direct address.
  assert.equal(tunnelClientIp('127.0.0.1', '203.0.113.9', false), '127.0.0.1');
  assert.equal(tunnelClientIp('127.0.0.1', '', true), '127.0.0.1');
});

test('scriptSafeJson neutralizes </script> and HTML metacharacters', () => {
  const { scriptSafeJson } = require('../lib/lan-server.js');
  assert.equal(scriptSafeJson('a</script>b'), '"a\\u003c/script\\u003eb"');
  assert.equal(scriptSafeJson('x&y'), '"x\\u0026y"');
  // Output must still parse back to the original value.
  assert.equal(JSON.parse(scriptSafeJson('a</script>b')), 'a</script>b');
  assert.ok(!scriptSafeJson('</script>').includes('</script>'));
});

/* ── Auth throttling under a spoofable client id ────────────────────────── */

test('the per-IP bucket is bypassable, which is why the global gate exists', () => {
  // tunnelClientIp trusts the FIRST X-Forwarded-For entry, and that value is supplied by
  // the remote caller — so rotating it hands the attacker a fresh bucket every request.
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    seen.add(LAN.tunnelClientIp('127.0.0.1', `10.0.0.${i % 256}, 1.2.3.4`, true));
  }
  assert.ok(seen.size > 100, 'a caller can mint many distinct per-IP buckets');

  // The global gate does not depend on the client id at all, so it still trips.
  const state = { count: 0, windowStart: 0, blockedUntil: 0 };
  const now = Date.now();
  let blocked = 0;
  for (let i = 0; i < 1000; i++) {
    if (LAN.globalAuthThrottle(state, now + i, false)) blocked++;
    else LAN.globalAuthThrottle(state, now + i, true);
  }
  assert.ok(blocked > 900, `global gate must block the flood, blocked only ${blocked}`);
});

test('sweepFailedAttempts evicts expired buckets so the map cannot grow without bound', () => {
  // Entries used to be removed only by a SUCCESSFUL auth on that exact key, so a flood of
  // spoofed client ids left one permanent entry each — remote memory exhaustion.
  const map = new Map();
  const now = Date.now();
  for (let i = 0; i < 10_000; i++) {
    map.set('ip-' + i, { count: 1, resetAt: now - 1 });   // already expired
  }
  assert.equal(map.size, 10_000);
  LAN.sweepFailedAttempts(map, now);
  assert.equal(map.size, 0, 'expired buckets must be evicted');
});

test('sweepFailedAttempts hard-caps even when every bucket is still live', () => {
  const map = new Map();
  const now = Date.now();
  for (let i = 0; i < 9000; i++) {
    map.set('ip-' + i, { count: 1, resetAt: now + 60_000 });  // all unexpired
  }
  LAN.sweepFailedAttempts(map, now, 5000);
  assert.ok(map.size <= 5000, `hard cap not applied, size ${map.size}`);
  // Oldest-inserted dropped first, so the most recent attackers stay tracked.
  assert.ok(map.has('ip-8999'), 'most recent bucket must survive');
  assert.ok(!map.has('ip-0'), 'oldest bucket should have been dropped');
});
