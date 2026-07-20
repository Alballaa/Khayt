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
