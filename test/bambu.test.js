/**
 * Bambu Lab LAN client tests — the pure wire codecs (MQTT 3.1.1 slice + FTPS
 * reply parsing). The live TLS paths (fetchBambuStatus / bambuFtpUpload) aren't
 * exercised here (no printer), but everything that builds/parses bytes is.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const b = require('../lib/bambu.js');
const ftp = require('../lib/bambu-ftp.js');

test('remaining-length varint round-trips across byte boundaries', () => {
  for (const n of [0, 1, 127, 128, 16383, 16384, 2097151]) {
    const enc = b.encodeRemainingLength(n);
    const dec = b.decodeRemainingLength(enc, 0);
    assert.equal(dec.value, n);
    assert.equal(dec.bytes, enc.length);
  }
  // 127 fits in one byte; 128 needs two (continuation bit).
  assert.equal(b.encodeRemainingLength(127).length, 1);
  assert.equal(b.encodeRemainingLength(128).length, 2);
});

test('decodeRemainingLength returns null when the length field is incomplete', () => {
  // 0x80 sets the continuation bit but there is no following byte.
  assert.equal(b.decodeRemainingLength(Buffer.from([0x80]), 0), null);
});

test('mqttString is a 2-byte big-endian length prefix + UTF-8', () => {
  const s = b.mqttString('MQTT');
  assert.equal(s.readUInt16BE(0), 4);
  assert.equal(s.slice(2).toString('utf8'), 'MQTT');
});

test('encodeConnect carries protocol MQTT/4, user+pass flags, and the creds', () => {
  const pkt = b.encodeConnect('cid', 'bblp', 'SECRET');
  assert.equal(pkt[0], 0x10); // CONNECT
  // skip fixed header (1 + remaining-length bytes)
  const rl = b.decodeRemainingLength(pkt, 1);
  const body = pkt.slice(1 + rl.bytes);
  assert.equal(body.slice(2, 6).toString('utf8'), 'MQTT');
  assert.equal(body[6], 0x04);   // protocol level
  assert.equal(body[7], 0xc2);   // username|password|clean
  assert.ok(pkt.includes(Buffer.from('bblp')));
  assert.ok(pkt.includes(Buffer.from('SECRET')));
});

test('encodeSubscribe uses the required 0x82 header and QoS 0', () => {
  const pkt = b.encodeSubscribe(1, 'device/X/report');
  assert.equal(pkt[0], 0x82);
  assert.equal(pkt[pkt.length - 1], 0x00); // requested QoS
});

test('publish encode → parsePackets → decodePublish round-trips', () => {
  const wire = b.encodePublish('device/X/request', '{"hi":1}');
  const { packets, rest } = b.parsePackets(wire);
  assert.equal(rest.length, 0);
  assert.equal(packets.length, 1);
  assert.equal(packets[0].type, 3); // PUBLISH
  const dp = b.decodePublish(packets[0].body);
  assert.equal(dp.topic, 'device/X/request');
  assert.equal(dp.payload, '{"hi":1}');
});

test('parsePackets splits multiple packets and keeps a partial tail as rest', () => {
  const two = Buffer.concat([b.encodePublish('a', '1'), b.encodePublish('b', '22')]);
  const partial = two.slice(0, two.length - 1);
  const { packets, rest } = b.parsePackets(partial);
  assert.equal(packets.length, 1);             // first whole, second incomplete
  assert.ok(rest.length > 0);
  // feeding the rest of the bytes completes the second
  const done = b.parsePackets(Buffer.concat([rest, two.slice(two.length - 1)]));
  assert.equal(done.packets.length, 1);
});

test('parseBambuReport maps a pushall snapshot to the common status shape', () => {
  const payload = JSON.stringify({ print: {
    gcode_state: 'RUNNING', mc_percent: 42, mc_remaining_time: 12,
    nozzle_temper: 215.3, bed_temper: 60, subtask_name: 'bracket.3mf',
    layer_num: 30, total_layer_num: 120,
  } });
  const s = b.parseBambuReport(payload);
  assert.equal(s.state, 'Printing');
  assert.equal(s.progress, 42);
  assert.equal(s.timeRemaining, 720); // 12 min → 720 s
  assert.equal(s.tempNozzle, 215.3);
  assert.equal(s.filename, 'bracket.3mf');
  assert.equal(s.totalLayers, 120);
  assert.equal(s.type, 'bambu');
});

test('parseBambuReport ignores deltas without print state and bad JSON', () => {
  assert.equal(b.parseBambuReport('{"print":{"command":"push_status"}}'), null);
  assert.equal(b.parseBambuReport('not json'), null);
  assert.equal(b.parseBambuReport('{"system":{}}'), null);
});

test('bambuStateLabel normalizes the known states', () => {
  assert.equal(b.bambuStateLabel('FINISH'), 'Finished');
  assert.equal(b.bambuStateLabel('PAUSE'), 'Paused');
  assert.equal(b.bambuStateLabel('weird'), 'weird');
});

// ---- FTPS reply parsing ----

test('readFtpReply returns the first complete reply and leftover', () => {
  const r = ftp.readFtpReply('220 Welcome\r\n331 need pw\r\n');
  assert.equal(r.code, 220);
  assert.match(r.text, /Welcome/);
  // the leftover still parses as the next reply
  const r2 = ftp.readFtpReply(r.rest);
  assert.equal(r2.code, 331);
});

test('readFtpReply handles a multi-line reply (NNN- … NNN <final>)', () => {
  const r = ftp.readFtpReply('230-first\r\n230-second\r\n230 done\r\n');
  assert.equal(r.code, 230);
  assert.match(r.text, /done/);
});

test('readFtpReply returns null until a final line arrives', () => {
  assert.equal(ftp.readFtpReply('150-transfer starting\r\n'), null);
});

test('parsePasv extracts host + computes the port from the high/low bytes', () => {
  const { host, port } = ftp.parsePasv('227 Entering Passive Mode (192,168,1,50,200,21).');
  assert.equal(host, '192.168.1.50');
  assert.equal(port, 200 * 256 + 21);
});

test('parsePasv throws on a malformed reply', () => {
  assert.throws(() => ftp.parsePasv('227 nope'));
});
