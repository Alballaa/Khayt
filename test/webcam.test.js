const { test } = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/webcam.js');

const OCTO = { type: 'octoprint', host: '192.168.1.50' };
const MOON = { type: 'moonraker', host: '192.168.1.60:7125' };

test('defaultWebcam is off with no URLs', () => {
  const d = W.defaultWebcam();
  assert.equal(d.enabled, false);
  assert.equal(d.snapshotUrl, '');
  assert.equal(d.cloudRelay, false, 'never relays to cloud by default');
});

test('deriveWebcamUrls follows each project’s documented convention', () => {
  const o = W.deriveWebcamUrls(OCTO);
  assert.equal(o.snapshotUrl, 'http://192.168.1.50/webcam/?action=snapshot');
  assert.equal(o.streamUrl, 'http://192.168.1.50/webcam/?action=stream');
  const m = W.deriveWebcamUrls(MOON);
  assert.equal(m.snapshotUrl, 'http://192.168.1.60:8080/?action=snapshot', 'moonraker cam sits on :8080');
  const p = W.deriveWebcamUrls({ type: 'prusalink', host: '192.168.68.70' });
  assert.equal(p.snapshotUrl, 'http://192.168.68.70/api/v1/cameras/snap', 'PrusaLink serves stills on its own port');
  assert.equal(p.streamUrl, '', 'no documented continuous stream endpoint — do not invent one');
  assert.deepEqual(W.deriveWebcamUrls({ type: 'bambu', host: '1.2.3.4' }), { snapshotUrl: '', streamUrl: '' });
  assert.deepEqual(W.deriveWebcamUrls({ type: 'octoprint' }), { snapshotUrl: '', streamUrl: '' }, 'no host → nothing');
});

test('normalizeWebcamUrl resolves relative paths against the printer host', () => {
  assert.equal(W.normalizeWebcamUrl('/webcam/?action=snapshot', OCTO), 'http://192.168.1.50/webcam/?action=snapshot');
  assert.equal(W.normalizeWebcamUrl('webcam/?action=snapshot', OCTO), 'http://192.168.1.50/webcam/?action=snapshot');
  assert.equal(W.normalizeWebcamUrl('http://other.local/cam', OCTO), 'http://other.local/cam', 'absolute kept as-is');
  assert.equal(W.normalizeWebcamUrl('', OCTO), '');
  assert.equal(W.normalizeWebcamUrl('/cam', {}), '', 'no host → cannot resolve');
});

test('parseOctoprintSettings reads the reported webcam config', () => {
  const out = W.parseOctoprintSettings({ webcam: { snapshotUrl: '/webcam/?action=snapshot', streamUrl: '/webcam/?action=stream', flipH: true, rotate90: true } }, OCTO);
  assert.equal(out.snapshotUrl, 'http://192.168.1.50/webcam/?action=snapshot');
  assert.equal(out.flipH, true);
  assert.equal(out.rotate, 90);
  assert.equal(W.parseOctoprintSettings({}, OCTO), null);
  assert.equal(W.parseOctoprintSettings({ webcam: {} }, OCTO), null, 'no urls → null');
});

test('parseMoonrakerWebcams reads the first registered camera', () => {
  const body = { result: { webcams: [{ snapshot_url: '/webcam?action=snapshot', stream_url: '/webcam?action=stream', flip_horizontal: true, rotation: 180 }] } };
  const out = W.parseMoonrakerWebcams(body, MOON);
  assert.equal(out.snapshotUrl, 'http://192.168.1.60:7125/webcam?action=snapshot');
  assert.equal(out.flipH, true);
  assert.equal(out.rotate, 180);
  assert.equal(W.parseMoonrakerWebcams({ result: { webcams: [] } }, MOON), null);
  assert.equal(W.parseMoonrakerWebcams({}, MOON), null);
});

test('SSRF GUARD: a snapshot may only be fetched from the machine’s own printer host', () => {
  assert.equal(W.assertSameHostAsPrinter('http://192.168.1.50/webcam/?action=snapshot', OCTO).ok, true);
  // The classic pivot attempts — all refused because the host isn't the printer's.
  for (const evil of [
    'http://127.0.0.1:8080/admin',
    'http://169.254.169.254/latest/meta-data/',   // cloud metadata
    'http://192.168.1.99/other-device',
    'http://internal.corp/secrets',
    'https://evil.example.com/collect',
  ]) {
    const r = W.assertSameHostAsPrinter(evil, OCTO);
    assert.equal(r.ok, false, `SSRF NOT BLOCKED: ${evil}`);
    assert.equal(r.reason, 'host_mismatch');
  }
  assert.equal(W.assertSameHostAsPrinter('file:///etc/passwd', OCTO).ok, false, 'non-http scheme refused');
  assert.equal(W.assertSameHostAsPrinter('not a url', OCTO).reason, 'invalid_url');
  assert.equal(W.assertSameHostAsPrinter('http://x/y', {}).reason, 'no_printer_host');
});

test('SSRF guard ignores port/scheme differences but pins the hostname', () => {
  // Same host on the camera's own port is legitimate (Moonraker cam on :8080).
  assert.equal(W.assertSameHostAsPrinter('http://192.168.1.60:8080/?action=snapshot', MOON).ok, true);
  // A different host on the printer's port is still refused.
  assert.equal(W.assertSameHostAsPrinter('http://192.168.1.61:7125/?action=snapshot', MOON).ok, false);
});

test('sanitizeWebcam clamps enums and normalizes URLs', () => {
  const s = W.sanitizeWebcam({ enabled: 1, snapshotUrl: '/cam', streamType: 'evil', rotate: 47, timelapse: 'evil', cloudRelay: 'yes' }, OCTO);
  assert.equal(s.enabled, true);
  assert.equal(s.snapshotUrl, 'http://192.168.1.50/cam');
  assert.equal(s.streamType, 'mjpeg', 'unknown stream type clamped');
  assert.equal(s.rotate, 0, 'invalid rotation clamped');
  assert.equal(s.timelapse, 'snapshot');
  assert.equal(s.cloudRelay, true);
});

test('renderTransform builds a CSS transform without re-encoding', () => {
  assert.equal(W.renderTransform({ rotate: 90, flipH: true }), 'rotate(90deg) scaleX(-1)');
  assert.equal(W.renderTransform({ flipV: true }), 'scaleY(-1)');
  assert.equal(W.renderTransform({ rotate: 0 }), '');
  assert.equal(W.renderTransform(null), '');
});

test('hasCamera requires opt-in AND a URL', () => {
  assert.equal(W.hasCamera({ webcam: { enabled: true, snapshotUrl: 'http://x/y' } }), true);
  assert.equal(W.hasCamera({ webcam: { enabled: false, snapshotUrl: 'http://x/y' } }), false, 'off means off');
  assert.equal(W.hasCamera({ webcam: { enabled: true } }), false, 'enabled but no URL → nothing to show');
  assert.equal(W.hasCamera({}), false);
});

/* ── Snapshot proxy hardening ───────────────────────────────────── */

test('snapshotUrlFor never falls back to the stream (an MJPEG stream has no end)', () => {
  const streamOnly = { webcam: { enabled: true, snapshotUrl: '', streamUrl: 'http://192.168.1.50/webcam/?action=stream' } };
  assert.equal(W.hasCamera(streamOnly), true, 'the card can still show a stream');
  assert.equal(W.snapshotUrlFor(streamOnly), '', 'but the proxy refuses to buffer it as a snapshot');
  const both = { webcam: { enabled: true, snapshotUrl: 'http://h/s', streamUrl: 'http://h/st' } };
  assert.equal(W.snapshotUrlFor(both), 'http://h/s');
  assert.equal(W.snapshotUrlFor({ webcam: { enabled: false, snapshotUrl: 'http://h/s' } }), '', 'off means off');
  assert.equal(W.snapshotUrlFor({}), '');
});

test('checkSnapshotHeaders rejects oversized responses BEFORE the body is read', () => {
  const big = String(W.MAX_SNAPSHOT_BYTES + 1);
  assert.deepEqual(W.checkSnapshotHeaders(200, 'image/jpeg', big), { ok: false, reason: 'too_large' });
  assert.equal(W.checkSnapshotHeaders(200, 'image/jpeg', String(W.MAX_SNAPSHOT_BYTES)).ok, true, 'at the cap is fine');
});

test('checkSnapshotHeaders enforces image content-type, success status and no redirects', () => {
  assert.equal(W.checkSnapshotHeaders(200, 'image/jpeg', '1024').ok, true);
  assert.equal(W.checkSnapshotHeaders(200, 'image/png; charset=binary', null).ok, true, 'params tolerated');
  assert.deepEqual(W.checkSnapshotHeaders(302, 'image/jpeg', '10'), { ok: false, reason: 'redirect_refused' });
  assert.deepEqual(W.checkSnapshotHeaders(200, 'text/html', '10'), { ok: false, reason: 'not_an_image' });
  assert.deepEqual(W.checkSnapshotHeaders(200, null, '10'), { ok: false, reason: 'not_an_image' }, 'missing type is not an image');
  assert.equal(W.checkSnapshotHeaders(404, 'image/jpeg', '10').ok, false);
  assert.equal(W.checkSnapshotHeaders(500, 'image/jpeg', '10').reason, 'HTTP 500');
});

test('checkSnapshotHeaders allows a missing content-length (body cap is the backstop)', () => {
  assert.equal(W.checkSnapshotHeaders(200, 'image/jpeg', null).ok, true);
  assert.equal(W.checkSnapshotHeaders(200, 'image/jpeg', 'not-a-number').ok, true);
});

test('a snapshot fetch carries the machine’s own printer credential', () => {
  // PrusaLink's camera endpoint 401s without a key, so an unauthenticated proxy derives
  // a correct URL that can never load — verified against a real CORE One.
  assert.deepEqual(W.authHeadersFor({ type: 'prusalink', apiKey: 'K1' }), { 'X-Api-Key': 'K1' });
  assert.deepEqual(W.authHeadersFor({ type: 'octoprint', apiKey: 'K2' }), { 'X-Api-Key': 'K2' });
  assert.deepEqual(W.authHeadersFor({ type: 'bambu', accessCode: 'AC' }), { Authorization: 'Bearer AC' });
  // Moonraker is unauthenticated on the LAN — sending nothing is correct, not an omission.
  assert.deepEqual(W.authHeadersFor({ type: 'moonraker' }), {});
  // Never leak a credential to a type that did not configure one, and never return
  // undefined (callers spread the result).
  assert.deepEqual(W.authHeadersFor({ type: 'prusalink' }), {}, 'no key configured → no header');
  assert.deepEqual(W.authHeadersFor(null), {});
  assert.deepEqual(W.authHeadersFor({ type: 'bambu', apiKey: 'WRONG' }), {}, 'bambu uses accessCode, not apiKey');
});

/**
 * The half that was missing.
 *
 * parseMoonrakerWebcams and parseOctoprintSettings were exported and tested
 * from the day the webcam feature landed, and NOTHING in the product ever
 * called either of them. The tests above proved the parsing was correct; not
 * one of them could notice there was no caller. These cover the route from a
 * printer to a parser, which is the part that did not exist.
 */
test('a printer is asked at the endpoint its own project documents', () => {
  assert.equal(W.detectUrlFor({ type: 'moonraker', host: '192.168.1.9:7125' }),
    'http://192.168.1.9:7125/server/webcams/list');
  assert.equal(W.detectUrlFor({ type: 'octoprint', host: '192.168.1.8' }),
    'http://192.168.1.8/api/settings');
  // https must survive; a shop using TLS on the LAN must not be downgraded.
  assert.equal(W.detectUrlFor({ type: 'moonraker', host: 'https://printer.local' }),
    'https://printer.local/server/webcams/list');
});

test('printers with nothing to ask return no URL rather than a guessed path', () => {
  // Duet, PrusaLink and Bambu publish no equivalent list. Inventing a path
  // would turn "we cannot ask" into a 404 reported as "no camera".
  for (const type of ['duet', 'prusalink', 'bambu', 'none', '']) {
    assert.equal(W.detectPathFor({ type, host: '1.2.3.4' }), '', `${type} should have no detect path`);
    assert.equal(W.detectUrlFor({ type, host: '1.2.3.4' }), '');
  }
});

test('the reply is routed to the parser that matches the printer', () => {
  const moon = { type: 'moonraker', host: '10.0.0.5' };
  const octo = { type: 'octoprint', host: '10.0.0.6' };
  const moonBody = { result: { webcams: [{ snapshot_url: '/webcam/?action=snapshot', rotation: 180 }] } };
  const octoBody = { webcam: { snapshotUrl: '/webcam/?action=snapshot', streamUrl: '/webcam/?action=stream' } };

  assert.equal(W.parseDetected(moonBody, moon).rotate, 180);
  assert.ok(W.parseDetected(octoBody, octo).streamUrl);
  // Cross-wiring must yield nothing, not a half-parsed object: an OctoPrint
  // body through the Moonraker parser has no `webcams` key at all.
  assert.equal(W.parseDetected(octoBody, moon), null);
  assert.equal(W.parseDetected(moonBody, octo), null);
});

test('a Snapmaker U1 on stock firmware answers, and the answer is "none"', () => {
  // The endpoint exists on stock and returns an empty list. That is a real
  // reply meaning the printer has no camera registered — distinct from a
  // printer that cannot be asked at all, which returns no URL above. The
  // community extended firmware runs a full Moonraker stack and fills this in.
  const u1 = { type: 'moonraker', host: '192.168.68.42:7125' };
  assert.ok(W.detectUrlFor(u1), 'a U1 can always be asked');
  assert.equal(W.parseDetected({ result: { webcams: [] } }, u1), null, 'stock: nothing registered');

  const extended = { result: { webcams: [{ snapshot_url: '/webcam/?action=snapshot', stream_url: '/webcam/?action=stream' }] } };
  const found = W.parseDetected(extended, u1);
  assert.ok(found && found.snapshotUrl.startsWith('http://192.168.68.42:7125/'),
    'extended: a real camera, resolved against the printer host');
});

/*
 * One guess is not enough, and a guess must not switch a camera on.
 *
 * Checked against a Snapmaker U1 on stock firmware, mid-print, on 2026-08-24:
 *
 *   /server/webcams/list          → {"webcams": []}   (auto-detect, correctly, finds nothing)
 *   :8080/?action=snapshot        → nothing listening; the only open ports are 80, 1884, 7125
 *   port 80 /webcam/?action=…     → 502 from the Fluidd/Mainsail nginx — the route exists,
 *                                   no camera service runs behind it on this firmware
 *
 * So the address `deriveWebcamUrls` derives for a Moonraker printer is one of two
 * real conventions, and on this machine it is the wrong one. The machine had
 * `webcam.enabled = true` pointing at it, which is why its card showed a tile
 * reading "Camera offline" indefinitely: an unverified guess had been switched on.
 */

test('webcamCandidates offers both Moonraker camera conventions, best first', () => {
  const c = W.webcamCandidates({ type: 'moonraker', host: '192.168.68.56', port: 7125 });
  assert.equal(c.length, 2, 'only one Moonraker convention was offered');
  // crowsnest listening for itself…
  assert.equal(c[0].snapshotUrl, 'http://192.168.68.56:8080/?action=snapshot');
  assert.equal(c[0].streamUrl, 'http://192.168.68.56:8080/?action=stream');
  // …and the same service behind the Fluidd/Mainsail proxy, which keeps working
  // when crowsnest is bound to localhost.
  assert.equal(c[1].snapshotUrl, 'http://192.168.68.56/webcam/?action=snapshot');
  assert.equal(c[1].streamUrl, 'http://192.168.68.56/webcam/?action=stream');
});

test('the API port is never carried into a camera URL', () => {
  // 7125 is Moonraker's, and a camera has never been on it. A candidate built by
  // pasting the configured port onto the host would probe the printer's own API
  // and get a JSON 404 that is not an image — a wasted probe that also looks like
  // a camera failure.
  for (const host of ['192.168.68.56:7125', 'http://192.168.68.56:7125', 'http://192.168.68.56:7125/']) {
    const c = W.webcamCandidates({ type: 'moonraker', host, port: 7125 });
    assert.ok(!c.some((x) => x.snapshotUrl.includes(':7125')), `API port leaked into a candidate from ${host}`);
    assert.equal(c[0].snapshotUrl, 'http://192.168.68.56:8080/?action=snapshot');
  }
});

test('candidates stay inside the host pinning that makes the proxy safe', () => {
  // Every candidate is fetched through assertSameHostAsPrinter, so one that could
  // not pass it would be a hole rather than a dead end.
  const api = { type: 'moonraker', host: '192.168.68.56', port: 7125 };
  for (const c of W.webcamCandidates(api)) {
    assert.equal(W.assertSameHostAsPrinter(c.snapshotUrl, api).ok, true, c.snapshotUrl);
    assert.equal(W.assertSameHostAsPrinter(c.streamUrl, api).ok, true, c.streamUrl);
  }
});

test('families with a single documented convention still offer exactly that one', () => {
  const p = W.webcamCandidates({ type: 'prusalink', host: '192.168.68.70' });
  assert.deepEqual(p, [{ snapshotUrl: 'http://192.168.68.70/api/v1/cameras/snap', streamUrl: '' }]);
  const o = W.webcamCandidates({ type: 'octoprint', host: '192.168.68.60' });
  assert.equal(o.length, 1);
  assert.equal(o[0].snapshotUrl, 'http://192.168.68.60/webcam/?action=snapshot');
});

test('nothing to guess yields nothing to probe, rather than a junk URL', () => {
  assert.deepEqual(W.webcamCandidates({ type: 'bambu', host: '1.2.3.4' }), [],
    'a family with no documented camera convention produced a candidate');
  assert.deepEqual(W.webcamCandidates({ type: 'moonraker' }), [], 'no host → nothing');
  assert.deepEqual(W.webcamCandidates(null), []);
  assert.deepEqual(W.webcamCandidates({}), []);
});
