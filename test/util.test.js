const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeHtml,
  parseCsvString,
  safeCssColor,
  initials,
  buildLanOrderTrackingUrl,
  buildLanQuoteApprovalUrl,
} = require('../renderer/util.js');

test('escapeHtml encodes special characters', () => {
  assert.equal(escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
});

test('parseCsvString handles quoted commas', () => {
  const { headers, rows } = parseCsvString('name,qty\n"foo, bar",2\nx,1');
  assert.deepEqual(headers, ['name', 'qty']);
  assert.deepEqual(rows[0], ['foo, bar', '2']);
});

test('safeCssColor accepts hex only', () => {
  assert.equal(safeCssColor('#abc'), '#abc');
  assert.equal(safeCssColor('red'), '#5E2E14');
});

test('initials from name', () => {
  assert.equal(initials('Ada Lovelace'), 'AL');
  assert.equal(initials(''), '?');
});

test('buildLanOrderTrackingUrl includes token query', () => {
  const order = { id: 'O-1' };
  const url = buildLanOrderTrackingUrl('http://127.0.0.1:3219/', order);
  assert.match(url, /^http:\/\/127\.0\.0\.1:3219\/order\/O-1\?token=[0-9a-f]{32}$/);
});

test('buildLanQuoteApprovalUrl includes token query', () => {
  const order = { id: 'Q-1', status: 'quote' };
  const url = buildLanQuoteApprovalUrl('http://127.0.0.1:3219', order);
  assert.match(url, /^http:\/\/127\.0\.0\.1:3219\/order\/Q-1\/quote\?token=[0-9a-f]{32}$/);
});
