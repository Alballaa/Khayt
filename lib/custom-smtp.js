'use strict';

const net = require('net');
const tls = require('tls');
const { isBlockedLoopbackOrMetadata } = require('./host-guard');

function readReply(socket) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) {
        socket.off('data', onData);
        socket.off('error', onErr);
        const code = parseInt(last.slice(0, 3), 10);
        if (code >= 400) reject(new Error(last.trim()));
        else resolve(buf.trim());
      }
    };
    const onErr = (e) => reject(e);
    socket.on('data', onData);
    socket.on('error', onErr);
  });
}

function writeCmd(socket, cmd) {
  socket.write(`${cmd}\r\n`);
}

/** Strip CR/LF and other control chars so addresses/subjects can't inject SMTP commands or headers. */
function sanitizeHeader(value) {
  // eslint-disable-next-line no-control-regex
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}

/** Dot-stuff message data per RFC 5321 so body lines beginning with "." can't terminate DATA early. */
function dotStuff(data) {
  return String(data || '')
    .replace(/\r\n|\r|\n/g, '\r\n')   // normalize line endings
    .replace(/^\./gm, '..');          // escape leading dots on every line
}

async function smtpDialog(sock, { user, pass, from, fromName, to, subject, html }) {
  const safeFrom = sanitizeHeader(from);
  const safeTo = sanitizeHeader(to);
  const safeFromName = sanitizeHeader(fromName);
  const safeSubject = sanitizeHeader(subject);
  if (user && pass) {
    writeCmd(sock, 'AUTH LOGIN');
    await readReply(sock);
    writeCmd(sock, Buffer.from(String(user)).toString('base64'));
    await readReply(sock);
    writeCmd(sock, Buffer.from(String(pass)).toString('base64'));
    await readReply(sock);
  }
  writeCmd(sock, `MAIL FROM:<${safeFrom}>`);
  await readReply(sock);
  writeCmd(sock, `RCPT TO:<${safeTo}>`);
  await readReply(sock);
  writeCmd(sock, 'DATA');
  await readReply(sock);
  const fromLine = safeFromName ? `${safeFromName} <${safeFrom}>` : safeFrom;
  const headers = [
    `From: ${fromLine}`,
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
  ].join('\r\n');
  // Dot-stuff the full message data; the trailing "\r\n." terminator is added by writeCmd.
  writeCmd(sock, `${dotStuff(`${headers}\r\n${html}`)}\r\n.`);
  await readReply(sock);
  writeCmd(sock, 'QUIT');
  try { await readReply(sock); } catch { /* ignore */ }
  sock.end();
}

/** Minimal SMTP send for custom relay (STARTTLS + AUTH LOGIN). */
async function sendCustomSmtp({ host, port = 587, user, pass, secure = false, from, fromName, to, subject, html }) {
  if (!host || !from || !to) return { ok: false, error: 'Missing host, from, or to' };
  const smtpHost = String(host).trim().toLowerCase();
  if (isBlockedLoopbackOrMetadata(smtpHost)) {
    return { ok: false, error: 'SMTP host not allowed (loopback or metadata address)' };
  }

  const socket = await new Promise((resolve, reject) => {
    const s = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: true }, () => resolve(s))
      : net.connect({ host, port }, () => resolve(s));
    s.setTimeout(20000, () => { s.destroy(); reject(new Error('SMTP timeout')); });
    s.on('error', reject);
  });

  try {
    await readReply(socket);
    writeCmd(socket, 'EHLO khayt.local');
    const ehlo = await readReply(socket);

    if (!secure) {
      // Never send AUTH credentials over a plaintext socket. If the server
      // doesn't advertise STARTTLS (or an active MITM stripped it from EHLO),
      // refuse rather than leak the password in cleartext.
      if (!/STARTTLS/i.test(ehlo)) {
        throw new Error('SMTP server did not offer STARTTLS — refusing to send credentials over an unencrypted connection. Use a TLS port (465) or a server that supports STARTTLS.');
      }
      writeCmd(socket, 'STARTTLS');
      await readReply(socket);
      const tlsSocket = await new Promise((resolve, reject) => {
        const ts = tls.connect({ socket, servername: host, rejectUnauthorized: true }, () => resolve(ts));
        ts.on('error', reject);
      });
      writeCmd(tlsSocket, 'EHLO khayt.local');
      await readReply(tlsSocket);
      await smtpDialog(tlsSocket, { user, pass, from, fromName, to, subject, html });
      return { ok: true };
    }

    await smtpDialog(socket, { user, pass, from, fromName, to, subject, html });
    return { ok: true };
  } catch (e) {
    try { socket.destroy(); } catch { /* ignore */ }
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = { sendCustomSmtp, sanitizeHeader, dotStuff };
