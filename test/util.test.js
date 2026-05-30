const { test } = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, parseCsvString, safeCssColor, initials } = require('../renderer/util.js');

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
