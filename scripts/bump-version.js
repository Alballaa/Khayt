#!/usr/bin/env node
/**
 * Bump package.json + package-lock.json version (semver).
 * Usage: node scripts/bump-version.js patch|minor|major
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

const kind = process.argv[2];
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('Usage: node scripts/bump-version.js <patch|minor|major>');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const m = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.]+)?$/.exec(pkg.version);
if (!m) {
  console.error(`Invalid version in package.json: ${pkg.version}`);
  process.exit(1);
}

let [major, minor, patch] = [+m[1], +m[2], +m[3]].map(Number);
if (kind === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (kind === 'minor') {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const next = `${major}.${minor}.${patch}`;
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = next;
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

console.log(`Version bumped (${kind}): ${m[0]} → ${next}`);
console.log('Next: update CHANGELOG.md, commit, tag v' + next);
