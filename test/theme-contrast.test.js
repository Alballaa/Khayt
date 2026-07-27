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

/**
 * Colours here are written however the theme's author preferred: the older
 * designs use hex, Flow uses space-separated hsl(). Understanding only hex made
 * this guard skip an entire theme in silence — the mutation that should have
 * failed it passed — so it parses both, and refuses to measure nothing (see the
 * coverage assertion at the end).
 */
function parseColor(raw) {
  const c = String(raw || '').trim();
  if (c.startsWith('#')) return hex(c);
  const m = c.match(/^hsla?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/i);
  if (!m) return null;
  const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toRgb = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [toRgb(h + 1 / 3), toRgb(h), toRgb(h - 1 / 3)].map((v) => Math.round(v * 255));
}
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
  const measured = new Set();
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
      // Themes name their muted ink differently; both are the same role.
      const mutedRaw = decl(blk, 'ink-3') || decl(blk, 'text-muted');
      // No declaration at all is fine — the variant inherits the base's ink.
      // A declaration this cannot read is NOT fine: that is an unguarded colour
      // wearing the appearance of a guarded one.
      if (!mutedRaw) continue;
      const muted = parseColor(mutedRaw);
      assert.ok(muted,
        `${id}[${name}]: muted ink "${mutedRaw}" is in a notation this guard cannot measure — `
        + 'add support for it rather than leaving the colour unchecked');
      // Backgrounds fall back to the base block when the override omits them.
      const bg = decl(blk, 'bg') || decl(base, 'bg');
      const surface = decl(blk, 'surface') || decl(base, 'surface');
      const grounds = [bg, surface].map((c) => [c, parseColor(c)]).filter(([, v]) => v);
      assert.ok(grounds.length, `${id}[${name}]: no resolvable background to measure against`);
      for (const [label, g] of grounds) {
        measured.add(id);
        const r = ratio(muted, g);
        if (r < 4.5) failures.push(`${id}[${name}] muted ${mutedRaw} on ${label} = ${r.toFixed(2)}:1`);
      }
    }
  }
  assert.deepEqual(failures, [],
    `muted text below WCAG AA 4.5:1:\n  ${failures.join('\n  ')}`);

  // A theme this cannot read is a theme it cannot protect. Flow shipped past
  // this guard unmeasured — its tokens sit on a different custom property, in a
  // different colour notation — and nothing said so. Skipping is now a failure.
  const unmeasured = reg.listSelectableThemes()
    .filter((t) => !t.startsWith('custom:'))
    .filter((id) => fs.existsSync(path.join(ROOT, `renderer/themes/${id}/tokens.css`)))
    .filter((id) => !measured.has(id));
  assert.deepEqual(unmeasured, [],
    `these themes have a tokens.css this guard could not measure: ${unmeasured.join(', ')}`);
});
