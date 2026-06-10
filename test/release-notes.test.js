const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  sanitizeReleaseNotesHtml,
  formatReleaseNotesText,
  formatReleaseNotesForDisplay,
} = require('../lib/release-notes');

test('sanitizeReleaseNotesHtml removes scripts and inline handlers', () => {
  const input = '<p onclick="alert(1)">Hi</p><script>alert(1)</script>';
  const out = sanitizeReleaseNotesHtml(input);
  assert.match(out, /<p>Hi<\/p>/);
  assert.doesNotMatch(out, /script/i);
  assert.doesNotMatch(out, /onclick/i);
});

test('formatReleaseNotesText converts markdown bullets to a list', () => {
  const html = formatReleaseNotesText('### Fixed\n- One\n- Two');
  assert.match(html, /<h4 class="update-notes-heading">Fixed<\/h4>/);
  assert.match(html, /<ul class="update-notes-list">/);
  assert.match(html, /<li>One<\/li>/);
  assert.match(html, /<li>Two<\/li>/);
});

test('formatReleaseNotesForDisplay falls back when notes are empty', () => {
  const { html, hasContent } = formatReleaseNotesForDisplay('', { version: '2.4.0' });
  assert.equal(hasContent, false);
  assert.match(html, /Khayt 2\.4\.0/);
  assert.match(html, /github\.com/i);
});
