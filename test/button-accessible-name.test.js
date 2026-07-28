/**
 * Every button must say something to a screen reader.
 *
 * A button whose entire content is an icon — `🗑`, `×`, `⌫` — is a blank button
 * to anyone not looking at it. Nothing breaks, nothing throws, and the two found
 * when this check was written were both DELETE controls, which is the worst kind
 * to leave unlabelled: the user cannot tell it apart from any other unnamed
 * button until after they press it.
 *
 * The check works the way a screen reader does. It takes what is announced —
 * `aria-label`, `data-i18n-aria`, `aria-labelledby`, `title` — and otherwise
 * falls back to the visible text with markup, HTML entities, emoji and template
 * expressions stripped out. What remains is what a user actually hears. If that
 * is empty, the button has no name.
 *
 * Deliberately not an "accessibility test suite". It checks one thing that is
 * cheap to verify and expensive to get wrong, which is what makes it a guard
 * rather than an aspiration.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'renderer');

function sources() {
  const files = [];
  for (const html of ['index.html', 'bedready.html']) {
    const p = path.join(RENDERER, html);
    if (fs.existsSync(p)) files.push(p);
  }
  for (const f of fs.readdirSync(RENDERER)) {
    if (f.endsWith('.js')) files.push(path.join(RENDERER, f));
  }
  return files;
}

// Emoji, arrows, dingbats, the multiplication sign used as a close button, and
// the zero-width joiner — none of which a screen reader announces usefully.
const DECORATIVE = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200D}\u{00D7}\u{2026}]/gu;

/** What a screen reader would announce for this button, or '' if nothing. */
function accessibleName(attrs, inner) {
  if (/aria-label|data-i18n-aria|aria-labelledby|title=/.test(attrs)) return 'labelled';
  return inner
    .replace(/<[^>]*>/g, ' ')          // nested markup contributes its own text
    .replace(/&[a-z#0-9]+;/gi, ' ')    // &times; &nbsp; &#8230;
    .replace(/\$\{[^}]*\}/g, 'X')      // a template expression may well be text
    .replace(DECORATIVE, '')
    .trim();
}

function namelessButtons() {
  const out = [];
  for (const file of sources()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<button\b([^>]*)>([\s\S]{0,300}?)<\/button>/g)) {
      if (!accessibleName(m[1], m[2])) {
        out.push(`${path.basename(file)}: ${m[0].slice(0, 100).replace(/\s+/g, ' ')}`);
      }
    }
  }
  return out;
}

test('no button is silent to a screen reader', () => {
  const nameless = namelessButtons();
  assert.deepEqual(nameless, [],
    `these buttons announce nothing:\n  ${nameless.join('\n  ')}`);
});

test('the check is actually looking at the buttons', () => {
  // Guards the guard. If the <button> regex or the source list ever stopped
  // matching, the test above would pass on an empty set and quietly protect
  // nothing — which is how the settings-export list drifted in the first place.
  let total = 0;
  for (const file of sources()) {
    total += [...fs.readFileSync(file, 'utf8').matchAll(/<button\b/g)].length;
  }
  assert.ok(total > 500, `expected the app's many buttons, scanned ${total}`);
});

test('an icon-only button is recognised as nameless, a labelled one is not', () => {
  // Pins the rule itself, so the emoji/entity stripping cannot silently relax.
  assert.equal(accessibleName('', '🗑'), '', 'a bare emoji says nothing');
  assert.equal(accessibleName('', '×'), '', 'nor does a multiplication sign');
  assert.equal(accessibleName('', '&times;'), '', 'nor its entity');
  assert.equal(accessibleName('', '⌫'), '', 'nor a backspace glyph');
  assert.ok(accessibleName('', 'Save'), 'plain text is a name');
  assert.ok(accessibleName('', '🗑 Delete'), 'an icon beside text is fine');
  assert.ok(accessibleName('aria-label="Delete"', '🗑'), 'an aria-label is a name');
  assert.ok(accessibleName('data-i18n-aria="common.delete"', '🗑'), 'and so is the i18n form');
});
