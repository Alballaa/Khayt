'use strict';

/**
 * Minimal Bambu Lab LAN client (main-process, Node-only).
 *
 * Bambu printers expose NO HTTP REST API on the local network — they speak:
 *   • MQTT over TLS on :8883  (status push + commands)   — this file
 *   • FTPS (implicit TLS) on :990  (upload .3mf/.gcode)  — lib/bambu-ftp.js
 *
 * Rather than pull in the `mqtt` package, we hand-roll the tiny slice of
 * MQTT 3.1.1 we need (CONNECT / SUBSCRIBE / PUBLISH / PINGREQ / DISCONNECT),
 * consistent with the codebase's no-SDK approach (see lib/s3.js, VAPID). The
 * wire codec is pure + unit-tested; only fetchBambuStatus()/bambuSendPrint()
 * touch a real TLS socket.
 *
 * Auth: MQTT username is always "bblp"; the password is the printer's LAN
 * "Access Code" (Settings → WLAN on the printer). Topics are scoped by the
 * device serial: device/{serial}/report (subscribe) + /request (publish).
 */

const MQTT_DEFAULT_PORT = 8883;

// ---- pure MQTT 3.1.1 wire codec (no I/O) -----------------------------------

/** Encode the MQTT "Remaining Length" variable-byte integer. */
function encodeRemainingLength(n) {
  if (n < 0) throw new Error('negative length');
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return Buffer.from(out);
}

/** Decode a Remaining Length starting at `offset`. → { value, bytes } or null if incomplete. */
function decodeRemainingLength(buf, offset) {
  let multiplier = 1, value = 0, bytes = 0;
  for (;;) {
    if (offset + bytes >= buf.length) return null; // need more data
    const b = buf[offset + bytes];
    value += (b & 0x7f) * multiplier;
    bytes += 1;
    if ((b & 0x80) === 0) break;
    multiplier *= 128;
    if (multiplier > 128 * 128 * 128) throw new Error('malformed remaining length');
  }
  return { value, bytes };
}

/** Length-prefixed UTF-8 string (2-byte big-endian length + bytes). */
function mqttString(s) {
  const b = Buffer.from(String(s), 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length, 0);
  return Buffer.concat([len, b]);
}

/** Build a fixed header for a packet given its (type<<4|flags) byte + body. */
function packet(typeFlags, body) {
  return Buffer.concat([Buffer.from([typeFlags]), encodeRemainingLength(body.length), body]);
}

/** CONNECT with username + password, clean session. */
function encodeConnect(clientId, username, password, keepalive = 60) {
  const varHeader = Buffer.concat([
    mqttString('MQTT'),       // protocol name
    Buffer.from([0x04]),      // protocol level 4 (3.1.1)
    Buffer.from([0xc2]),      // flags: username|password|clean-session
    (() => { const k = Buffer.alloc(2); k.writeUInt16BE(keepalive, 0); return k; })(),
  ]);
  const payload = Buffer.concat([mqttString(clientId), mqttString(username), mqttString(password)]);
  return packet(0x10, Buffer.concat([varHeader, payload]));
}

/** SUBSCRIBE to one topic at QoS 0. */
function encodeSubscribe(packetId, topic) {
  const pid = Buffer.alloc(2); pid.writeUInt16BE(packetId, 0);
  const body = Buffer.concat([pid, mqttString(topic), Buffer.from([0x00])]);
  return packet(0x82, body); // SUBSCRIBE requires flags 0010
}

/** PUBLISH at QoS 0 (no packet id). */
function encodePublish(topic, payloadStr) {
  const body = Buffer.concat([mqttString(topic), Buffer.from(String(payloadStr), 'utf8')]);
  return packet(0x30, body);
}

const PINGREQ = Buffer.from([0xc0, 0x00]);
const DISCONNECT = Buffer.from([0xe0, 0x00]);

/**
 * Pull complete MQTT packets out of a rolling buffer.
 * → { packets: [{ type, flags, body }], rest: Buffer } (rest = leftover bytes).
 */
function parsePackets(buf) {
  const packets = [];
  let off = 0;
  while (off < buf.length) {
    const first = buf[off];
    const rl = decodeRemainingLength(buf, off + 1);
    if (!rl) break; // incomplete length field
    const headerLen = 1 + rl.bytes;
    const total = headerLen + rl.value;
    if (off + total > buf.length) break; // body not fully arrived
    packets.push({ type: first >> 4, flags: first & 0x0f, body: buf.slice(off + headerLen, off + total) });
    off += total;
  }
  return { packets, rest: buf.slice(off) };
}

/** Decode a PUBLISH body (QoS 0) → { topic, payload(string) }. */
function decodePublish(body) {
  const tlen = body.readUInt16BE(0);
  const topic = body.slice(2, 2 + tlen).toString('utf8');
  const payload = body.slice(2 + tlen).toString('utf8');
  return { topic, payload };
}

// ---- Bambu report parsing --------------------------------------------------

/** Map Bambu's gcode_state to a human label matching the other printer types. */
function bambuStateLabel(s) {
  const map = { IDLE: 'Idle', PREPARE: 'Preparing', RUNNING: 'Printing', PAUSE: 'Paused', FINISH: 'Finished', FAILED: 'Failed', SLICING: 'Slicing' };
  return map[String(s || '').toUpperCase()] || (s || 'Connected');
}

/**
 * Parse a `device/{serial}/report` JSON payload into the common status shape.
 * Returns null if the message has no `print` object (Bambu sends partial deltas).
 */
function parseBambuReport(payloadStr) {
  let obj;
  try { obj = JSON.parse(payloadStr); } catch { return null; }
  const p = obj && obj.print;
  if (!p || typeof p !== 'object') return null;
  // Only a full "pushall" snapshot carries gcode_state; ignore tiny deltas.
  if (p.gcode_state === undefined && p.mc_percent === undefined && p.subtask_name === undefined) return null;
  return {
    ok: true,
    state: bambuStateLabel(p.gcode_state),
    progress: typeof p.mc_percent === 'number' ? p.mc_percent : 0,
    filename: p.subtask_name || p.gcode_file || '',
    timeRemaining: typeof p.mc_remaining_time === 'number' ? p.mc_remaining_time * 60 : null, // min → sec
    tempNozzle: typeof p.nozzle_temper === 'number' ? p.nozzle_temper : null,
    tempBed: typeof p.bed_temper === 'number' ? p.bed_temper : null,
    layer: typeof p.layer_num === 'number' ? p.layer_num : null,
    totalLayers: typeof p.total_layer_num === 'number' ? p.total_layer_num : null,
    type: 'bambu',
  };
}

// ---- live TLS connection ---------------------------------------------------

/**
 * Connect over MQTT/TLS, run `onReady(send, topics)` once subscribed, and
 * resolve with whatever `onMessage(topic, payload, resolve)` produces. Closes
 * the socket on resolve/reject/timeout. `tls` is injected for testability.
 */
function _withConnection({ host, port, accessCode, serial, timeoutMs = 8000, tls }, onMessage, onReady) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, val) => {
      if (settled) return; settled = true;
      clearTimeout(timer);
      try { socket.write(DISCONNECT); } catch { /* ignore */ }
      try { socket.end(); socket.destroy(); } catch { /* ignore */ }
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish(new Error('Bambu timed out — check IP, access code & that LAN mode is on')), timeoutMs);

    const reportTopic = `device/${serial}/report`;
    const requestTopic = `device/${serial}/request`;
    const socket = tls.connect({ host, port, rejectUnauthorized: false, servername: undefined, timeout: timeoutMs }, () => {
      socket.write(encodeConnect(`khayt-${Math.floor(Date.now() % 1e7).toString(36)}`, 'bblp', String(accessCode || '')));
    });
    socket.on('error', (e) => finish(new Error(`Bambu connection failed: ${e.message}`)));

    let buf = Buffer.alloc(0);
    const send = (b) => socket.write(b);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { packets, rest } = parsePackets(buf);
      buf = rest;
      for (const pk of packets) {
        if (pk.type === 2) { // CONNACK
          const code = pk.body.length >= 2 ? pk.body[1] : 0xff;
          if (code !== 0) return finish(new Error(`Bambu rejected the access code (CONNACK ${code})`));
          send(encodeSubscribe(1, reportTopic));
        } else if (pk.type === 9) { // SUBACK → ready
          try { onReady(send, { reportTopic, requestTopic }); } catch (e) { return finish(e); }
        } else if (pk.type === 3) { // PUBLISH
          const { topic, payload } = decodePublish(pk.body);
          try { onMessage(topic, payload, (val) => finish(null, val)); } catch (e) { return finish(e); }
        }
      }
    });
  });
}

/** Poll a Bambu printer's status (one-shot: connect → pushall → first snapshot). */
async function fetchBambuStatus(opts) {
  const tls = opts.tls || require('node:tls');
  return _withConnection({ ...opts, tls },
    (topic, payload, done) => { const s = parseBambuReport(payload); if (s) done(s); },
    (send, { requestTopic }) => {
      send(encodePublish(requestTopic, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } })));
    });
}

/**
 * Tell a Bambu printer to start an already-uploaded file (via FTPS) from its
 * SD/cache. `fileName` is the name on the printer (e.g. "khayt-xxxx.3mf").
 */
async function bambuSendPrint(opts) {
  const tls = opts.tls || require('node:tls');
  const { fileName } = opts;
  const cmd = {
    print: {
      sequence_id: '0', command: 'project_file', param: 'Metadata/plate_1.gcode',
      url: `file:///sdcard/${fileName}`, subtask_name: fileName,
      use_ams: false, timelapse: false, bed_leveling: true, flow_cali: false, vibration_cali: false, layer_inspect: false,
    },
  };
  return _withConnection({ ...opts, tls },
    (topic, payload, done) => {
      // Ack any report after we publish the command.
      try { const o = JSON.parse(payload); if (o && o.print) done({ ok: true, fileName }); } catch { /* ignore */ }
    },
    (send, { requestTopic }) => {
      send(encodePublish(requestTopic, JSON.stringify(cmd)));
      // Resolve shortly even without an explicit ack — the command is fire-and-forget.
      setTimeout(() => { try { send(PINGREQ); } catch { /* ignore */ } }, 200);
    });
}

module.exports = {
  MQTT_DEFAULT_PORT,
  // pure codec (unit-tested)
  encodeRemainingLength, decodeRemainingLength, mqttString,
  encodeConnect, encodeSubscribe, encodePublish, parsePackets, decodePublish,
  bambuStateLabel, parseBambuReport,
  PINGREQ, DISCONNECT,
  // live
  fetchBambuStatus, bambuSendPrint,
};
