/**
 * lib/telegram-message.js is what a shop's bot says, lifted.
 *
 * THE PROOF: the original `sendTelegramForOrder` is copied below VERBATIM,
 * with its transport replaced by a recorder, and run beside the module over
 * thousands of generated orders and bot settings. What was going to be SENT is
 * compared — the token, the chat and the text.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TG = require('../lib/telegram-message.js');

const ORIGINAL = `
function run(order, newStatus, settings, fmtPrice, sent) {
  const window = { hubAPI: { sendTelegram: (opts) => { sent.push(opts); return Promise.resolve(); } } };
function sendTelegramForOrder(order, newStatus) {
  const tg = settings.telegram;
  if (!tg || !tg.botToken || !tg.chatId) return;
  let shouldSend = false;
  let message = '';
  // tgSafe: strip control chars and truncate to prevent message manipulation
  const tgSafe = s => String(s ?? '').replace(/[\\r\\n\\t]/g, ' ').slice(0, 200);
  if (newStatus === 'completed' && tg.notifyOnComplete) {
    shouldSend = true;
    message = \`✅ Order completed: \${tgSafe(order.project || order.id)} (\${fmtPrice(order.price)})\`;
  } else if (newStatus === 'on_hold' && tg.notifyOnHold) {
    shouldSend = true;
    message = \`⏸ Order on hold: \${tgSafe(order.project || order.id)}\${order.holdReason ? ' — ' + tgSafe(order.holdReason) : ''}\`;
  }
  if (!shouldSend) return;
  window.hubAPI?.sendTelegram?.({ botToken: tg.botToken, chatId: tg.chatId, message })
    .catch(e => console.warn('Telegram notify failed:', e));
}

  sendTelegramForOrder(order, newStatus);
  return sent[0] || null;
}
return run;`;

const run = new Function(ORIGINAL)();
const fmtPrice = (n) => `${Number(n || 0).toFixed(2)} SAR`;

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

test('the module and the original send the same thing, over 3000 generated moves', () => {
  const r = rng(5150);
  for (let i = 0; i < 3000; i++) {
    const order = {
      id: 'ORD-' + i,
      project: pick(r, ['', 'Bracket', 'Lids 2/3', 'Line\nbreak', 'Tab\there', 'x'.repeat(400)]),
      price: pick(r, [0, 120, 999.5, null]),
      holdReason: pick(r, [undefined, '', 'Waiting on filament', 'a\rb']),
    };
    const telegram = pick(r, [
      undefined, {},
      { botToken: '', chatId: '123' },
      { botToken: '123:abc', chatId: '' },
      { botToken: '123:abc', chatId: '456' },
      { botToken: '123:abc', chatId: '456', notifyOnComplete: true },
      { botToken: '123:abc', chatId: '456', notifyOnHold: true },
      { botToken: '123:abc', chatId: '456', notifyOnComplete: true, notifyOnHold: true },
    ]);
    const settings = telegram === undefined ? {} : { telegram };
    const newStatus = pick(r, ['completed', 'on_hold', 'printing', 'pending', 'qc']);

    const theirs = run(order, newStatus, settings, fmtPrice, []);
    const ours = TG.forStatus(order, newStatus, { settings, fmtPrice });
    assert.deepEqual(ours, theirs, `case ${i}: ${newStatus} ${JSON.stringify(telegram)}`);
  }
});

test('a project name cannot forge a second line', () => {
  // Customer-supplied text going into a message somebody reads on a phone.
  const out = TG.forStatus({ id: 'O1', project: 'Bracket\n✅ Order completed: Something else', price: 10 },
                           'completed',
                           { settings: { telegram: { botToken: '1:a', chatId: '2', notifyOnComplete: true } },
                             fmtPrice });
  assert.ok(!out.message.includes('\n'), 'newlines are stripped');
  assert.ok(!out.message.includes('\r') && !out.message.includes('\t'),
    'and so are carriage returns and tabs');
  assert.equal(out.message.split('\n').length, 1,
    'so the whole thing stays one line, whatever the customer typed');
});

test('nothing is sent when the shop has not asked for it', () => {
  const ctx = { settings: { telegram: { botToken: '1:a', chatId: '2' } }, fmtPrice };
  assert.equal(TG.forStatus({ id: 'O1' }, 'completed', ctx), null, 'the toggle is off');
  assert.equal(TG.forStatus({ id: 'O1' }, 'printing',
    { settings: { telegram: { botToken: '1:a', chatId: '2', notifyOnComplete: true } }, fmtPrice }), null,
    'and no message exists for this move');
  assert.equal(TG.forStatus({ id: 'O1' }, 'completed', { settings: {}, fmtPrice }), null, 'no bot at all');
});

test('a bot token is checked for a shape Telegram could accept', () => {
  // The same check the Electron main process makes before it sends. Finding a
  // mistyped setting here rather than from a 401 is the difference between a
  // message a shop can act on and a silence.
  assert.ok(TG.isBotToken('123456:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw'));
  assert.ok(!TG.isBotToken(''));
  assert.ok(!TG.isBotToken('nope'));
  assert.ok(!TG.isBotToken('123456'));
  assert.ok(!TG.isBotToken('123456:has space'));
});

test('a chat id keeps only what a chat id can be', () => {
  assert.equal(TG.chatId(' -100123456 '), '-100123456', 'a group id, spaces taken off');
  assert.equal(TG.chatId('123; rm -rf /'), '123-', 'and nothing that is not a chat id survives');
  /* A @USERNAME DOES NOT SURVIVE, AND THAT IS KHAYT'S BEHAVIOUR, NOT A CHOICE
   * MADE HERE. The Electron main process has always stripped chat ids with
   * `[^0-9@-]`, which keeps the @ and throws the name away — so a shop that
   * typed "@khaytshop" has been sending to "@" and getting nothing, in Khayt,
   * for as long as the feature has existed.
   *
   * Copied unchanged because a lift whose job is to change nothing does not
   * quietly fix a bug on the way past: fixing it is a separate change, with
   * its own test, that a shop can be told about. Written down here so it is
   * not mistaken for an accident of the lift. */
  assert.equal(TG.chatId('@khaytshop'), '@', 'a @username is NOT usable — see the comment');
});

test('the renderer builds no message of its own any more', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'integrations.js'), 'utf8');
  const at = src.indexOf('function sendTelegramForOrder(');
  const body = src.slice(at, src.indexOf('\n}\n', at));
  assert.match(body, /forStatus\(/, 'the message must come from the shared rule');
  assert.doesNotMatch(body, /Order completed:/,
    'and the renderer must not carry its own text, or the two apps say different things');
});
