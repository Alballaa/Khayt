/**
 * Outbound SMS/WhatsApp provider request builders. Pure (no network) — asserts
 * each provider's URL, auth header, and body shape so a wrong field is caught
 * without hitting a real gateway.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, buildSmsRequest, sendSms } = require('../lib/sms.js');

test('normalizePhone keeps digits, optional leading +', () => {
  assert.equal(normalizePhone('+966 50 123 4567'), '+966501234567');
  assert.equal(normalizePhone('966-50-123-4567', { plus: false }), '966501234567');
});

test('twilio SMS: Messages.json URL, Basic auth, From/To/Body form', () => {
  const r = buildSmsRequest('twilio', { accountSid: 'AC1', authToken: 'tok', from: '+15550001111' },
    { to: '+966500000000', message: 'Hi', channel: 'sms' });
  assert.match(r.url, /Accounts\/AC1\/Messages\.json$/);
  assert.equal(r.contentType, 'application/x-www-form-urlencoded');
  assert.equal(r.headers.Authorization, 'Basic ' + Buffer.from('AC1:tok').toString('base64'));
  const p = new URLSearchParams(r.body);
  assert.equal(p.get('From'), '+15550001111');
  assert.equal(p.get('To'), '+966500000000');
  assert.equal(p.get('Body'), 'Hi');
});

test('twilio WhatsApp: From/To get the whatsapp: prefix', () => {
  const r = buildSmsRequest('twilio', { accountSid: 'AC1', authToken: 'tok', from: '+15550001111' },
    { to: '+966500000000', message: 'Hi', channel: 'whatsapp' });
  const p = new URLSearchParams(r.body);
  assert.equal(p.get('From'), 'whatsapp:+15550001111');
  assert.equal(p.get('To'), 'whatsapp:+966500000000');
});

test('whatsapp_cloud: graph URL, Bearer token, JSON text body, digits-only to', () => {
  const r = buildSmsRequest('whatsapp_cloud', { phoneNumberId: '12345', token: 'EAA' },
    { to: '+966500000000', message: 'Ready!', channel: 'whatsapp' });
  assert.match(r.url, /graph\.facebook\.com\/v\d+\.\d+\/12345\/messages$/);
  assert.equal(r.headers.Authorization, 'Bearer EAA');
  const j = JSON.parse(r.body);
  assert.equal(j.messaging_product, 'whatsapp');
  assert.equal(j.to, '966500000000'); // no +
  assert.equal(j.text.body, 'Ready!');
});

test('unifonic: REST URL, AppSid + SenderID + Recipient form', () => {
  const r = buildSmsRequest('unifonic', { appSid: 'APP', senderId: 'Acme' },
    { to: '966500000000', message: 'Done', channel: 'sms' });
  assert.match(r.url, /unifonic\.com\/rest\/SMS\/messages$/);
  const p = new URLSearchParams(r.body);
  assert.equal(p.get('AppSid'), 'APP');
  assert.equal(p.get('SenderID'), 'Acme');
  assert.equal(p.get('Recipient'), '966500000000');
  assert.equal(p.get('Body'), 'Done');
});

test('webhook: posts JSON {to,message,channel} + optional secret header', () => {
  const r = buildSmsRequest('webhook', { url: 'https://hook.example.com/sms', secret: 's3cr3t' },
    { to: '+966500000000', message: 'Hi', channel: 'whatsapp' });
  assert.equal(r.url, 'https://hook.example.com/sms');
  assert.equal(r.headers['X-Khayt-Secret'], 's3cr3t');
  const j = JSON.parse(r.body);
  assert.equal(j.channel, 'whatsapp');
  assert.equal(j.message, 'Hi');
});

test('misconfiguration + unknown provider throw', () => {
  assert.throws(() => buildSmsRequest('twilio', {}, { to: '+1', message: 'x' }), /Account SID/);
  assert.throws(() => buildSmsRequest('whatsapp_cloud', { token: 'x' }, { to: '+1', message: 'x' }), /Phone Number ID/);
  assert.throws(() => buildSmsRequest('webhook', { url: 'ftp://x' }, { to: '+1', message: 'x' }), /http/);
  assert.throws(() => buildSmsRequest('nope', {}, { to: '+1', message: 'x' }), /Unknown SMS provider/);
  assert.throws(() => buildSmsRequest('twilio', { accountSid: 'AC', authToken: 't' }, { to: '', message: 'x' }), /recipient/);
});

test('sendSms surfaces a non-ok HTTP response as an error (no throw)', async () => {
  const fake = async () => ({ ok: false, status: 401, text: async () => 'bad creds' });
  const r = await sendSms('twilio', { accountSid: 'AC', authToken: 't', from: '+1' },
    { to: '+966500000000', message: 'Hi' }, { fetchImpl: fake });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.match(r.error, /bad creds/);
});

test('sendSms returns ok on a 2xx', async () => {
  const fake = async () => ({ ok: true, status: 201, text: async () => '' });
  const r = await sendSms('webhook', { url: 'https://h/x' },
    { to: '+1', message: 'Hi' }, { fetchImpl: fake });
  assert.deepEqual(r, { ok: true, status: 201 });
});
