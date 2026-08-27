#!/usr/bin/env node
/**
 * The release docs must not lie about which release is current.
 *
 * On 2026-08-27, four files claimed four different things at once:
 *
 *   ROADMAP.md            named beta.9 as newest published in one paragraph and
 *                         beta.8 in the next — and the commit that "fixed" that
 *                         duplication a week earlier had introduced it again,
 *                         by rewriting the stale paragraph instead of removing it
 *   docs/RELEASE-HOLD.md  said all three manifests read 3.7.0-beta.8 after the
 *                         beta.9 publish; two of them read beta.9
 *   VERSIONING.md         still called beta.3 the latest — six cuts behind
 *   docs/BETA-RELEASE.md  still said beta.6 — four cuts behind
 *
 * None of that is carelessness. It is that ONE fact — which release is current —
 * is written out in prose in five places, and prose does not fail a build. Every
 * one of those four was found by a human re-reading the files at cut time, which
 * is the most expensive way to find them and the one most likely to be skipped.
 *
 * ── What this checks, and what it deliberately does not ─────────────────────
 *
 * These files are full of legitimate references to old versions: shipped tables,
 * "the 3.6.0 line ran beta.1–beta.19", the beta.4 trap. Flagging every mention of
 * an old version would fail on every honest history paragraph, so this does not
 * do that. It checks four narrow properties instead, each one traceable to a real
 * defect above:
 *
 *   1. Each file NAMES the version in package.json. A file that has never heard
 *      of the release being cut cannot be current. Catches VERSIONING (six cuts
 *      behind) and BETA-RELEASE (four).
 *   2. No file names a PRERELEASE ON THE CURRENT LINE that is newer than
 *      package.json — a doc that has run ahead of the bump, which is how a
 *      release gets announced before it can exist. Deliberately scoped to the
 *      open line: these files also name the line's own target (`3.7.0`, which
 *      semver ranks above every `3.7.0-beta.N`), the bump table's hypothetical
 *      `4.0.0`, and Electron's `42.8.1`. None of those is a claim about a Khayt
 *      release, and flagging them taught the first draft of this check to cry
 *      wolf on six lines of correct prose.
 *   3. "newest published" is claimed AT MOST ONCE PER FILE. Catches the ROADMAP
 *      defect directly: the rule that kept being broken is that a cut replaces
 *      that paragraph rather than writing a new one above it.
 *   4. All such claims, across all files, name the SAME version. Two files
 *      quietly disagreeing is the same defect spread out far enough that nobody
 *      reading either one notices.
 *
 * It does NOT reach the network. Whether the tag was actually pushed and the
 * manifests actually serve is a different question with a different answer at
 * different moments, and CI is the wrong place to ask it — `gh release list` and
 * a fetched manifest are, at cut time. This checks internal consistency only:
 * that the repo agrees with itself.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** The files that make claims about which release is current. */
const TRACKED = [
  'ROADMAP.md',
  'VERSIONING.md',
  'docs/BETA-RELEASE.md',
  'docs/RELEASE-HOLD.md',
];

/**
 * A claim that some version is the newest one published. Deliberately loose about
 * the markdown in the middle — these files bold and italicise it every way going
 * ("newest *published* pre-release", "**newest published**") — and deliberately
 * strict about the words, so ordinary prose about publishing does not match.
 */
const NEWEST_CLAIM = /newest[\s*_]+(?:\*+)?published(?:\*+)?/gi;

/**
 * Quoted spans are removed before looking for a claim, because these files
 * explain their own rules and quoting a rule is not asserting it. ROADMAP.md
 * carries a paragraph reading `said it had collapsed the duplicated "newest
 * published" paragraphs` — a note ABOUT the claim, with no version anywhere near
 * it. The first draft of this check counted that as a second claim and demanded
 * a version for it, which would have made the file unfixable without deleting
 * the explanation.
 */
function withoutQuotes(line) {
  return line.replace(/"[^"]*"/g, '').replace(/[“][^”]*[”]/g, '');
}

/** `3.7.0-beta.10`, `v3.6.0`, `3.6.0-rc.4`. Captures the version without the v. */
const VERSION_TOKEN = /\bv?(\d+\.\d+\.\d+(?:-(?:beta|rc|alpha)\.\d+)?)\b/g;

/** Semver-compare enough for this repo's shapes: X.Y.Z with an optional -kind.N. */
function compare(a, b) {
  const parse = (v) => {
    const [core, pre] = v.split('-');
    const nums = core.split('.').map(Number);
    if (!pre) return { nums, kind: null, n: 0 };
    const [kind, n] = pre.split('.');
    return { nums, kind, n: Number(n) };
  };
  const A = parse(a);
  const B = parse(b);
  for (let i = 0; i < 3; i++) {
    if (A.nums[i] !== B.nums[i]) return A.nums[i] - B.nums[i];
  }
  // A release without a prerelease tag outranks any prerelease of the same core.
  if (A.kind === null && B.kind !== null) return 1;
  if (A.kind !== null && B.kind === null) return -1;
  if (A.kind === null && B.kind === null) return 0;
  // alpha < beta < rc, which is both semver's own ordering and this repo's.
  const RANK = { alpha: 0, beta: 1, rc: 2 };
  if (A.kind !== B.kind) return (RANK[A.kind] ?? 0) - (RANK[B.kind] ?? 0);
  return A.n - B.n;
}

/**
 * Both versions are prereleases of the same X.Y.Z — i.e. two cuts of the release
 * line currently open. Only those are comparable as "did a doc run ahead"; a bare
 * `3.7.0`, a `4.0.0` in the bump table and Electron's `42.8.1` are not.
 */
function sameLine(a, b) {
  const core = (v) => v.split('-')[0];
  return a.includes('-') && b.includes('-') && core(a) === core(b);
}

/**
 * The version a claim is about: the first version token on the same line, or —
 * because these paragraphs wrap and the version very often lands on the next
 * line — the first one in the two lines that follow.
 *
 * ROADMAP's own claim is split exactly that way today:
 *
 *     **The newest *published* pre-release is
 *     `v3.7.0-beta.9`** (2026-08-27) — tagged from ...
 *
 * so a same-line-only search would find nothing and silently pass.
 */
function versionNear(lines, index, after) {
  for (let i = index; i < Math.min(index + 3, lines.length); i++) {
    // On the claim's own line, look only AFTER the claim. ROADMAP's paragraph
    // opens `The 3.7.0 line is open. The newest *published* pre-release is` —
    // searching the whole line returns the LINE's name, `3.7.0`, which is not a
    // release at all and which two files could then "agree" on while disagreeing
    // about the actual version. Read forward from the claim, the way a person does.
    const hay = i === index ? lines[i].slice(after) : lines[i];
    VERSION_TOKEN.lastIndex = 0;
    const m = VERSION_TOKEN.exec(hay);
    if (m) return m[1];
  }
  return null;
}

/**
 * Collect every failure for `root`, rather than throwing on the first. A
 * maintainer fixing these wants the whole list in one pass — four files were
 * wrong on the day this was written, and finding them one CI run at a time is
 * the slow version of the problem it exists to solve.
 *
 * Exported so the tests can drive it over fixture directories and prove it FAILS
 * on each of the four defects, which is the half a passing repo cannot show.
 */
function checkReleaseClaims(root = ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const current = pkg.version;
  const failures = [];

  /** Every "newest published" claim found anywhere, for check 4. */
  const claims = [];

  for (const rel of TRACKED) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`${rel}: tracked by this check but not present`);
      continue;
    }
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split('\n');

    // 1 — the current version is named at all.
    if (!text.includes(current)) {
      failures.push(
        `${rel}: never mentions ${current}, the version in package.json.\n` +
        `    A release doc that has not heard of the current cut is stale by ` +
        `construction. Say what this cut is, or say why it does not belong here.`
      );
    }

    // 2 — nothing newer than the current version, ON THIS LINE. See the note at
    // the top: a bare `3.7.0` is the name of the line being built, not a release.
    VERSION_TOKEN.lastIndex = 0;
    let m;
    const ahead = new Set();
    while ((m = VERSION_TOKEN.exec(text)) !== null) {
      if (sameLine(m[1], current) && compare(m[1], current) > 0) ahead.add(m[1]);
    }
    if (ahead.size) {
      failures.push(
        `${rel}: names ${[...ahead].join(', ')}, newer than package.json's ` +
        `${current} on the same line.\n` +
        `    Either the bump has not landed yet or the doc announced a release ` +
        `that cannot exist.`
      );
    }

    // 3 and 4 — the "newest published" claims.
    lines.forEach((line, i) => {
      NEWEST_CLAIM.lastIndex = 0;
      const hit = NEWEST_CLAIM.exec(withoutQuotes(line));
      if (!hit) return;
      const after = hit.index + hit[0].length;
      claims.push({ file: rel, line: i + 1, version: versionNear(lines, i, after) });
    });

    const mine = claims.filter((c) => c.file === rel);
    if (mine.length > 1) {
      failures.push(
        `${rel}: claims a "newest published" release ${mine.length} times ` +
        `(lines ${mine.map((c) => c.line).join(', ')}).\n` +
        `    Only the top paragraph may say it. A cut adds one by REPLACING ` +
        `that paragraph, never by writing a new one above it — writing above it ` +
        `is how this file came to name two different newest releases at once.`
      );
    }
  }

  // 4 — and they all name the same release.
  const named = claims.filter((c) => c.version);
  const distinct = [...new Set(named.map((c) => c.version))];
  if (distinct.length > 1) {
    failures.push(
      `The files disagree about which release is newest: ` +
      `${named.map((c) => `${c.file}:${c.line} says ${c.version}`).join('; ')}.`
    );
  }
  const unresolved = claims.filter((c) => !c.version);
  if (unresolved.length) {
    failures.push(
      `A "newest published" claim names no version: ` +
      `${unresolved.map((c) => `${c.file}:${c.line}`).join(', ')}.\n` +
      `    The version must be on the same line or within the two lines after it.`
    );
  }

  return { current, failures, claims };
}

function main() {
  const { current, failures, claims } = checkReleaseClaims();

  if (failures.length) {
    console.error(`release-claims check FAILED — package.json is ${current}\n`);
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    console.error(
      `These files are the ones a maintainer trusts at cut time. Fix the docs\n` +
      `rather than this check, unless the rule itself is wrong — in which case\n` +
      `say why in the commit, because each rule here is a defect that shipped.\n`
    );
    process.exit(1);
  }

  const versions = [...new Set(claims.map((c) => c.version).filter(Boolean))];
  const where = versions.length ? ` (newest published: ${versions[0]})` : '';
  console.log(`release-claims check ok — ${TRACKED.length} files agree on ${current}${where}`);
}

if (require.main === module) main();

module.exports = { checkReleaseClaims, TRACKED, compare, sameLine };
