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

async function smtpDialog(sock, { user, pass, from, fromName, to, subject, html }) {
  if (user && pass) {
    writeCmd(sock, 'AUTH LOGIN');
    await readReply(sock);
    writeCmd(sock, Buffer.from(String(user)).toString('base64'));
    await readReply(sock);
    writeCmd(sock, Buffer.from(String(pass)).toString('base64'));
    await readReply(sock);
  }
  writeCmd(sock, `MAIL FROM:<${from}>`);
  await readReply(sock);
  writeCmd(sock, `RCPT TO:<${to}>`);
  await readReply(sock);
  writeCmd(sock, 'DATA');
  await readReply(sock);
  const fromLine = fromName ? `${fromName} <${from}>` : from;
  const body = [
    `From: ${fromLine}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '.',
  ].join('\r\n');
  writeCmd(sock, body);
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

    if (!secure && /STARTTLS/i.test(ehlo)) {
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

module.exports = { sendCustomSmtp };
