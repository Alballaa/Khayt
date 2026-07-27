const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const reg = require('../renderer/themes/registry-core.js');

/**
 * Muted text must clear WCAG AA (4.5:1) in every theme, in both appearances.
 *
 * --text-muted aliases --ink-3 and is a TEXT colour: 192 CSS rules and 540
 * renderer call sites use it for hints, subtitles and metadata. It was failing
 * AA in ten of fourteen theme/appearance combinations — every light theme —
 * with Command at 2.75:1. That is a readability failure, not a taste question,
 * and it had been shipping since the 2.6 redesign.
 *
 * Contrast is measured against BOTH --bg and --surface, because muted text sits
 * on the page ground in some places and inside a card in others; passing on the
 * lighter of the two and failing on the other is still a failure.
 *
 * NOTE ON DARK-FIRST THEMES: a theme's FIRST block is not necessarily its light
 * one. Nocturne is dark-first, so its base block is dark and [data-theme="light"]
 * is the override. A pass that assumes base == light adjusts the wrong block and
 * leaves the light variant failing — which is exactly what happened, so this
 * test reads the blocks by selector rather than by position.
 */

const hex = (c) => {
  c = String(c).trim().replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
};
const luminance = (rgb) => {
  const f = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
};
const ratio = (a, b) => {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
};

/** Read a declaration block by its exact selector. */
function block(src, selector) {
  const i = src.indexOf(selector);
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  const close = src.indexOf('}', open);
  return open < 0 || close < 0 ? null : src.slice(open, close);
}
const decl = (blk, name) => {
  const m = blk && blk.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};

test('muted text clears WCAG AA in every theme and appearance', () => {
  const failures = [];
  for (const id of reg.listSelectableThemes().filter((t) => !t.startsWith('custom:'))) {
    const file = path.join(ROOT, `renderer/themes/${id}/tokens.css`);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');

    const base = block(src, `html[data-design="${id}"] {`) || block(src, `html[data-design="${id}"]{`);
    const dark = block(src, `html[data-design="${id}"][data-theme="dark"]`);
    const light = block(src, `html[data-design="${id}"][data-theme="light"]`);

    // Whichever blocks exist: base plus any explicit appearance override.
    const variants = [['base', base], ['dark', dark], ['light', light]].filter(([, b]) => b);
    for (const [name, blk] of variants) {
      const ink3 = decl(blk, 'ink-3');
      if (!ink3 || !ink3.startsWith('#')) continue;   // inherits from base
      // Backgrounds fall back to the base block when the override omits them.
      const bg = decl(blk, 'bg') || decl(base, 'bg');
      const surface = decl(blk, 'surface') || decl(base, 'surface');
      const grounds = [bg, surface].filter((c) => c && c.startsWith('#'));
      assert.ok(grounds.length, `${id}[${name}]: no resolvable background to measure against`);
      for (const g of grounds) {
        const r = ratio(hex(ink3), hex(g));
        if (r < 4.5) failures.push(`${id}[${name}] muted ${ink3} on ${g} = ${r.toFixed(2)}:1`);
      }
    }
  }
  assert.deepEqual(failures, [],
    `muted text below WCAG AA 4.5:1:\n  ${failures.join('\n  ')}`);
});
