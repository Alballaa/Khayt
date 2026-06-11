const { test } = require('node:test');
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
} = require('../lib/lan-server.js');

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
