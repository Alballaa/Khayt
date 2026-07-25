const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('../renderer/util.js');

const ROOT = path.join(__dirname, '..');

/**
 * `new Date().toISOString().slice(0, 10)` is not "today". toISOString() converts
 * to UTC, so the calendar date it yields is wrong for part of every day:
 *
 *   Riyadh (UTC+3)   — before 03:00 local it returns YESTERDAY
 *   New York (UTC-4) — after  20:00 local it returns TOMORROW
 *
 * 85 call sites across the renderer did this, on a product whose primary market
 * is the Gulf. Concretely: todayPlusDays(0) returned yesterday, the payments-due
 * window was 6 days instead of 7, and the "last quarter" analytics range both
 * dropped the last day of the quarter and pulled in the last day of the one
 * before it. renderer/util.js already had localDateStr() — a local-calendar
 * formatter — and app-helpers.js even carried a comment about avoiding exactly
 * this bug, but the call sites bypassed it.
 */

/** Every renderer source file, so the ban cannot be dodged by adding a new one. */
function rendererSources() {
  const out = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel))) {
      const r = path.join(rel, entry);
      const st = fs.statSync(path.join(ROOT, r));
      if (st.isDirectory()) walk(r);
      else if (entry.endsWith('.js') && !r.includes('locales')) out.push(r);
    }
  };
  walk('renderer');
  return out;
}

test('no renderer file derives a calendar date from toISOString()', () => {
  // The whole point of the sweep: this must stay at zero, in every file.
  const bad = [];
  for (const rel of rendererSources()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/toISOString\(\)\s*\.\s*(slice\(0,\s*10\)|split\('T'\)\[0\]|substring\(0,\s*10\))/.test(line)) {
        bad.push(`${rel}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(bad, [], `use localDateStr() instead of toISOString() for calendar dates:\n  ${bad.join('\n  ')}`);
});

test('localDateStr returns the LOCAL calendar date, not the UTC one', () => {
  // A moment that is a different calendar day in UTC than in a UTC+ zone.
  const d = new Date(2026, 6, 25, 1, 30); // 01:30 local on Jul 25
  assert.equal(localDateStr(d), '2026-07-25');
  // Pin the actual defect: in any UTC+ zone the ISO form disagrees.
  const offsetMin = -d.getTimezoneOffset();
  if (offsetMin > 90) {
    assert.notEqual(d.toISOString().slice(0, 10), '2026-07-25',
      'this test only proves something in a UTC+ zone; it is a no-op elsewhere');
  }
});

test('localDateStr pads month and day', () => {
  assert.equal(localDateStr(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(localDateStr(new Date(2026, 11, 31)), '2026-12-31');
});

test('todayPlusDays(0) is today, not yesterday', () => {
  // The regression this replaced: inventory.js:1365 normalised to local midnight
  // and then serialised via UTC, so n=0 returned yesterday east of Greenwich and
  // the dashboard "payments due" card ran a 6-day window instead of 7.
  const todayPlusDays = (n) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
    return localDateStr(d);
  };
  assert.equal(todayPlusDays(0), localDateStr(new Date()));

  const seven = new Date(); seven.setHours(0, 0, 0, 0); seven.setDate(seven.getDate() + 7);
  assert.equal(todayPlusDays(7), localDateStr(seven));
});

test('the last-quarter range covers the whole quarter', () => {
  // From 2026-07-25, "last quarter" is Q2: 2026-04-01 .. 2026-06-30 inclusive.
  const now = new Date(2026, 6, 25);
  const lastQEnd = new Date(now.getFullYear(), now.getMonth() - (now.getMonth() % 3), 0);
  const lastQStart = new Date(lastQEnd.getFullYear(), Math.floor(lastQEnd.getMonth() / 3) * 3, 1);
  assert.equal(localDateStr(lastQStart), '2026-04-01');
  assert.equal(localDateStr(lastQEnd), '2026-06-30', 'the last day of the quarter must be inside the range');
});

test('an instalment plan generated on the 31st does not skip a month', () => {
  // new Date(2026, 1, 31) rolls over into March, so a plan generated on Jan 31
  // put its first instalment in March and February vanished.
  const firstDue = (today) => {
    const y = today.getFullYear(), m = today.getMonth() + 1;
    const lastDay = new Date(y, m + 1, 0).getDate();
    return localDateStr(new Date(y, m, Math.min(today.getDate(), lastDay)));
  };
  assert.equal(firstDue(new Date(2026, 0, 31)), '2026-02-28');
  assert.equal(firstDue(new Date(2024, 0, 31)), '2024-02-29', 'leap year');
  assert.equal(firstDue(new Date(2026, 6, 25)), '2026-08-25', 'a normal day is unchanged');
});
