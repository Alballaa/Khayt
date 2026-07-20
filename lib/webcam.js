'use strict';
/**
 * Per-printer webcam configuration — URL derivation, provider auto-detect parsing, and
 * the host constraint that keeps the snapshot proxy from becoming an SSRF pivot.
 * Implements the camera half of docs/KHAYT-3.0-WEBCAM-SPEC.md.
 *
 * Pure: no network, no DOM. The actual image fetch happens in the main process, which
 * calls `assertSameHostAsPrinter` before every request.
 *
 * SECURITY NOTE. Unlike outbound webhooks — which are https-only and explicitly BLOCK
 * private/loopback addresses — a webcam lives on the LAN, so private addresses must be
 * allowed. That would be an open SSRF hole if the URL were free-form, so instead the
 * proxy is pinned: a snapshot may only be fetched from the SAME HOST already configured
 * as that machine's printer API. The owner cannot point it at an arbitrary internal
 * service, because the host is not theirs to choose at fetch time.
 */
(function () {
  const STREAM_TYPES = ['mjpeg', 'hls'];
  const TIMELAPSE_MODES = ['host', 'snapshot', 'off'];
  const ROTATIONS = [0, 90, 180, 270];

  function defaultWebcam() {
    return {
      enabled: false, streamUrl: '', snapshotUrl: '', streamType: 'mjpeg',
      flipH: false, flipV: false, rotate: 0, timelapse: 'snapshot', cloudRelay: false,
    };
  }

  /** Normalize whatever the owner typed into an absolute http(s) URL against the printer host. */
  function normalizeWebcamUrl(value, printerApi) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    const host = String((printerApi && printerApi.host) || '').trim();
    if (!host) return '';
    const scheme = /^https:\/\//i.test(host) ? 'https' : 'http';
    const bare = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const path = v.startsWith('/') ? v : '/' + v;
    return `${scheme}://${bare}${path}`;
  }

  /**
   * Best-effort defaults per printer family, using each project's documented convention.
   * These are a starting point the owner confirms — never assumed correct.
   */
  function deriveWebcamUrls(printerApi) {
    const type = String((printerApi && printerApi.type) || '').toLowerCase();
    const host = String((printerApi && printerApi.host) || '').trim();
    if (!host) return { snapshotUrl: '', streamUrl: '' };
    const bare = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const scheme = /^https:\/\//i.test(host) ? 'https' : 'http';
    if (type === 'octoprint') {
      return {
        snapshotUrl: `${scheme}://${bare}/webcam/?action=snapshot`,
        streamUrl: `${scheme}://${bare}/webcam/?action=stream`,
      };
    }
    if (type === 'moonraker') {
      // crowsnest / mjpg-streamer commonly sits on :8080 alongside Moonraker.
      const hostNoPort = bare.replace(/:\d+$/, '');
      return {
        snapshotUrl: `${scheme}://${hostNoPort}:8080/?action=snapshot`,
        streamUrl: `${scheme}://${hostNoPort}:8080/?action=stream`,
      };
    }
    return { snapshotUrl: '', streamUrl: '' };
  }

  /** Parse OctoPrint's GET /api/settings → its configured webcam URLs. */
  function parseOctoprintSettings(body, printerApi) {
    const wc = body && body.webcam;
    if (!wc) return null;
    const snapshotUrl = normalizeWebcamUrl(wc.snapshotUrl || wc.snapshot || '', printerApi);
    const streamUrl = normalizeWebcamUrl(wc.streamUrl || wc.stream || '', printerApi);
    if (!snapshotUrl && !streamUrl) return null;
    return { snapshotUrl, streamUrl, flipH: !!wc.flipH, flipV: !!wc.flipV, rotate: wc.rotate90 ? 90 : 0 };
  }

  /** Parse Moonraker's GET /server/webcams/list → the first configured camera. */
  function parseMoonrakerWebcams(body, printerApi) {
    const list = (body && (body.webcams || (body.result && body.result.webcams))) || [];
    const cam = Array.isArray(list) ? list[0] : null;
    if (!cam) return null;
    const snapshotUrl = normalizeWebcamUrl(cam.snapshot_url || cam.snapshotUrl || '', printerApi);
    const streamUrl = normalizeWebcamUrl(cam.stream_url || cam.streamUrl || '', printerApi);
    if (!snapshotUrl && !streamUrl) return null;
    return {
      snapshotUrl, streamUrl,
      flipH: !!(cam.flip_horizontal ?? cam.flipH),
      flipV: !!(cam.flip_vertical ?? cam.flipV),
      rotate: ROTATIONS.includes(+cam.rotation) ? +cam.rotation : 0,
    };
  }

  function hostOf(url) {
    try { return new URL(String(url)).hostname.toLowerCase(); } catch { return ''; }
  }

  /** The printer host, with any scheme/port/path stripped. */
  function printerHost(printerApi) {
    const raw = String((printerApi && printerApi.host) || '').trim();
    if (!raw) return '';
    const withScheme = /^https?:\/\//i.test(raw) ? raw : 'http://' + raw;
    return hostOf(withScheme);
  }

  /**
   * THE SSRF GUARD. A snapshot/stream may only be fetched from the same host already
   * configured as this machine's printer API. Returns { ok, reason }.
   */
  function assertSameHostAsPrinter(url, printerApi) {
    const target = hostOf(url);
    if (!target) return { ok: false, reason: 'invalid_url' };
    const expected = printerHost(printerApi);
    if (!expected) return { ok: false, reason: 'no_printer_host' };
    if (target !== expected) return { ok: false, reason: 'host_mismatch' };
    if (!/^https?:$/i.test((() => { try { return new URL(url).protocol; } catch { return ''; } })())) {
      return { ok: false, reason: 'bad_scheme' };
    }
    return { ok: true, reason: null };
  }

  /** Sanitize an owner-edited webcam block before persisting. */
  function sanitizeWebcam(input, printerApi) {
    const w = input || {};
    return {
      enabled: !!w.enabled,
      snapshotUrl: normalizeWebcamUrl(w.snapshotUrl, printerApi),
      streamUrl: normalizeWebcamUrl(w.streamUrl, printerApi),
      streamType: STREAM_TYPES.includes(w.streamType) ? w.streamType : 'mjpeg',
      flipH: !!w.flipH,
      flipV: !!w.flipV,
      rotate: ROTATIONS.includes(+w.rotate) ? +w.rotate : 0,
      timelapse: TIMELAPSE_MODES.includes(w.timelapse) ? w.timelapse : 'snapshot',
      cloudRelay: !!w.cloudRelay,
    };
  }

  /** CSS transform for the render-time flip/rotate (never re-encodes the image). */
  function renderTransform(webcam) {
    const w = webcam || {};
    const parts = [];
    if (ROTATIONS.includes(+w.rotate) && +w.rotate) parts.push(`rotate(${+w.rotate}deg)`);
    if (w.flipH) parts.push('scaleX(-1)');
    if (w.flipV) parts.push('scaleY(-1)');
    return parts.join(' ');
  }

  /** Is this machine actually showable? */
  function hasCamera(machine) {
    const w = machine && machine.webcam;
    return !!(w && w.enabled && (w.snapshotUrl || w.streamUrl));
  }

  const api = {
    STREAM_TYPES, TIMELAPSE_MODES, ROTATIONS,
    defaultWebcam, normalizeWebcamUrl, deriveWebcamUrls,
    parseOctoprintSettings, parseMoonrakerWebcams,
    printerHost, assertSameHostAsPrinter, sanitizeWebcam, renderTransform, hasCamera,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.KhaytWebcam = api;
})();
