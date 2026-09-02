#!/usr/bin/env node
'use strict';
/**
 * Print one version's CHANGELOG entry, for use as a release's notes.
 *
 * Every release this repo has ever published carries the same body:
 *
 *     See [README](https://github.com/KhaytApp/Khayt#readme) for full release notes.
 *
 * which is what `release.yml` passes to `gh release create --notes`. That string
 * is also what electron-updater hands the app, so Khayt's own update dialog —
 * which has a panel built for release notes and a heading that says "Review what
 * is new before installing" — has never had anything to put in it, and falls
 * back to "Release notes were not included with this update."
 *
 * A shop cannot agree to changes it is not shown, so the consent gate in
 * lib/major-changes.js is impossible until this exists.
 *
 *   node scripts/changelog-section.js 3.7.0-beta.23
 *
 * Exits non-zero when the version has no section, rather than printing nothing:
 * a release whose notes are silently empty is the state this replaces.
 */
const fs = require('fs');
const path = require('path');

function sectionFor(changelog, version) {
  const lines = String(changelog).split(/\r?\n/);
  // `## [3.7.0-beta.23] - 2026-09-02`, and tolerant of a missing date or the
  // brackets being dropped — the heading is written by hand at cut time.
  const wanted = String(version).trim().replace(/^v/, '');
  const isVersionHeading = (l) => /^##\s+/.test(l);
  const versionOf = (l) => {
    const m = l.match(/^##\s+\[?([^\]\s]+)\]?/);
    return m ? m[1].trim() : '';
  };

  const start = lines.findIndex((l) => isVersionHeading(l) && versionOf(l) === wanted);
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex(isVersionHeading);
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
  return body || null;
}

module.exports = { sectionFor };

if (require.main === module) {
  const version = process.argv[2];
  if (!version) {
    console.error('usage: changelog-section.js <version>');
    process.exit(2);
  }
  const file = path.join(__dirname, '..', 'CHANGELOG.md');
  const body = sectionFor(fs.readFileSync(file, 'utf8'), version);
  if (!body) {
    console.error(`No CHANGELOG section for ${version}.`);
    console.error('A release with no notes cannot tell anyone what changed, and a release');
    console.error('carrying a "Before you update" section cannot ask them to agree to it.');
    process.exit(1);
  }
  process.stdout.write(body + '\n');
}
