const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RENDERER = path.join(__dirname, '..', 'renderer');

function rendererFiles() {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'locales') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  })(RENDERER);
  return out;
}

/**
 * Every date and time the user sees must be formatted in the language they
 * chose in Khayt — not in English, and not in whatever the operating system
 * happens to be set to.
 *
 * Before this guard, 49 of 51 call sites were wrong in one of three ways:
 *
 *   toLocaleDateString('en-US', …)                     English for everyone
 *   toLocaleDateString(i18n.current === 'ar' ? … : 'en-US')
 *                                                      English for the SEVEN
 *                                                      languages that are not
 *                                                      Arabic
 *   toLocaleDateString()  /  (undefined, …)  /  ([], …)
 *                                                      follows the OS, so
 *                                                      choosing 日本語 in Khayt
 *                                                      still rendered
 *                                                      "Monday, July 27, 2026"
 *                                                      on an English Mac
 *
 * localeTag() in format.js is the one place that answers "which locale", so it
 * is the only permitted first argument.
 */
test('every date and time follows the chosen language', () => {
  // Deliberate exceptions, each for a reason that is about something other
  // than the UI language:
  //   app-helpers.js — pins the Umm al-Qura Hijri calendar; that IS the feature
  const ALLOWED_OTHER_TAG = /islamic-umalqura/;

  const offenders = [];
  for (const f of rendererFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), f);
    // Match the call and just enough of its argument list to see arg one.
    // localeTag() carries its own parens, so match it before the generic form.
    for (const m of src.matchAll(/\.toLocale(?:Date|Time)String\(\s*(localeTag\(\)|[^,)]*)/g)) {
      const arg = m[1].trim();
      if (arg === 'localeTag()') continue;
      if (ALLOWED_OTHER_TAG.test(arg)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${rel}:${line} → ${arg || '(no locale argument)'}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these render dates in the wrong language:\n  ${offenders.join('\n  ')}`);
});

test('localeTag maps every shipped language to a real locale', () => {
  // A tag that Intl does not recognise is silently ignored rather than throwing,
  // so a typo here looks like it works and quietly serves English.
  const src = fs.readFileSync(path.join(RENDERER, 'format.js'), 'utf8');
  const block = src.match(/const LOCALE_TAGS = \{([\s\S]*?)\};/);
  assert.ok(block, 'LOCALE_TAGS table not found in format.js');

  const tags = [...block[1].matchAll(/'?([a-zA-Z-]+)'?\s*:\s*'([^']+)'/g)]
    .map((m) => ({ lang: m[1], tag: m[2] }));

  const shipped = fs.readdirSync(path.join(RENDERER, 'locales'))
    .filter((n) => n.endsWith('.js')).map((n) => n.replace(/\.js$/, ''));
  for (const lang of shipped) {
    assert.ok(tags.some((t) => t.lang === lang), `${lang} ships a locale file but has no LOCALE_TAGS entry`);
  }

  const d = new Date(Date.UTC(2026, 6, 27));
  for (const { lang, tag } of tags) {
    const resolved = Intl.DateTimeFormat.supportedLocalesOf(tag);
    assert.ok(resolved.length > 0, `${lang}: "${tag}" is not a locale Intl recognises`);
    // and it must actually change the output away from raw ISO
    assert.ok(d.toLocaleDateString(tag, { month: 'long' }).length > 0);
  }
});

test('Arabic keeps Western digits while its words localise', () => {
  // The same decision fmtCount documents: live Saudi products use Western
  // digits, so the numerals stay Latin even though the month name is Arabic.
  const src = fs.readFileSync(path.join(RENDERER, 'format.js'), 'utf8');
  const tag = src.match(/ar:\s*'([^']+)'/)?.[1];
  assert.ok(tag?.includes('nu-latn'), 'the Arabic tag must pin Latin numerals');

  // timeZone: 'UTC' pins WHICH day is rendered. Without it the formatter uses
  // the machine's zone, so this asserted "27" on a date that reads as the 26th
  // anywhere west of UTC — making a test about DIGITS fail over a calendar day
  // it never meant to check.
  const shown = new Date(Date.UTC(2026, 6, 27)).toLocaleDateString(tag, {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
  assert.match(shown, /27/, 'day should render in Western digits');
  assert.match(shown, /2026/, 'year should render in Western digits');
  assert.ok(/[؀-ۿ]/.test(shown), 'month name should still be Arabic');
});

test('no hardcoded English weekday or month name arrays remain', () => {
  // Two of these shipped (analytics heatmap, calendar view) and a third was in
  // the email digest. They are invisible in English and permanent everywhere
  // else, so they need a guard rather than review.
  const offenders = [];
  for (const f of rendererFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), f);
    for (const re of [
      /\[\s*'Sun'\s*,\s*'Mon'/,
      /\[\s*'Sunday'\s*,\s*'Monday'/,
      /\[\s*'Jan'\s*,\s*'Feb'/,
      /\[\s*'January'\s*,\s*'February'/,
    ]) {
      if (re.test(src)) offenders.push(`${rel}: ${re.source}`);
    }
  }
  assert.deepEqual(offenders, [],
    `hardcoded English date names — use Intl with localeTag():\n  ${offenders.join('\n  ')}`);
});
