'use strict';

/** Strip scripts/iframes and inline handlers before writing or serving HTML. */
function sanitizeHtmlForFile(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<iframe\b[^>]*/gi, '')
    .replace(/\bon\w+\s*=/gi, 'data-removed=')
    .replace(/\bhref\s*=\s*["']?\s*javascript:/gi, 'href="blocked:');
}

/** Remove legacy client-name row from exported status pages (privacy). */
function redactStatusHtmlClientRow(html) {
  return String(html || '').replace(
    /<div class="info-row">\s*<span class="info-label">Client<\/span>[\s\S]*?<\/div>/gi,
    '',
  );
}

function prepareStatusHtmlForServe(html) {
  return sanitizeHtmlForFile(redactStatusHtmlClientRow(html));
}

module.exports = {
  sanitizeHtmlForFile,
  redactStatusHtmlClientRow,
  prepareStatusHtmlForServe,
};
