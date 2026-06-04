const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  redactStatusHtmlClientRow,
  prepareStatusHtmlForServe,
} = require('../lib/status-html');

test('redactStatusHtmlClientRow removes client info row', () => {
  const html = '<div class="info-row"><span class="info-label">Client</span><span class="info-value">Secret</span></div><div class="info-row"><span class="info-label">Status</span></div>';
  const out = redactStatusHtmlClientRow(html);
  assert.doesNotMatch(out, /Secret/);
  assert.match(out, /Status/);
});

test('prepareStatusHtmlForServe strips script tags', () => {
  const html = '<script>alert(1)</script><p>ok</p>';
  const out = prepareStatusHtmlForServe(html);
  assert.doesNotMatch(out, /<script/i);
  assert.match(out, /ok/);
});
