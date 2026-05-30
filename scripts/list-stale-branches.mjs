#!/usr/bin/env node
/**
 * List remote cursor/* branches that are likely stale (superseded or abandoned).
 * Active 2.2.0 release branches are excluded. Run after merging PRs to find cleanup candidates.
 *
 * Usage:
 *   node scripts/list-stale-branches.mjs
 *   node scripts/list-stale-branches.mjs --merged-into main
 *   node scripts/list-stale-branches.mjs --all
 */
import { execSync } from 'child_process';

const ACTIVE_22 = new Set([
  'cursor/2-2-0-production-shop-d4c8',
  'cursor/2-2-0-zatca-compliance-d4c8',
  'cursor/2-2-0-quote-approval-d4c8',
  'cursor/2-2-0-platform-hardening-d4c8',
]);

const SUPERSEDED = {
  'cursor/2-2-0-ops-fulfillment-d4c8': 'Superseded by Bundle D platform-hardening — close PR #52',
};

const showAll = process.argv.includes('--all');
const mergedIdx = process.argv.indexOf('--merged-into');
const mergedInto = mergedIdx >= 0 ? process.argv[mergedIdx + 1] || 'main' : null;

function git(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

let branches;
try {
  branches = git('git branch -r --format="%(refname:short)"')
    .split('\n')
    .filter(Boolean)
    .map(b => b.replace(/^origin\//, ''))
    .filter(b => b.startsWith('cursor/'));
} catch {
  console.error('Could not list remote branches. Run: git fetch origin');
  process.exit(1);
}

const stale = [];
const active = [];

for (const branch of branches.sort()) {
  if (ACTIVE_22.has(branch)) {
    active.push(branch);
    continue;
  }
  if (SUPERSEDED[branch]) {
    stale.push({ branch, reason: SUPERSEDED[branch] });
    continue;
  }
  if (mergedInto) {
    try {
      git(`git merge-base --is-ancestor origin/${branch} origin/${mergedInto}`);
      stale.push({ branch, reason: `Merged into ${mergedInto}` });
    } catch { /* not merged — skip unless --all */ }
  }
  if (showAll && !ACTIVE_22.has(branch) && !stale.some(s => s.branch === branch)) {
    stale.push({ branch, reason: 'Review manually — not in active 2.2.0 list' });
  }
}

console.log('Active 2.2.0 bundle branches:');
for (const b of active) console.log(`  ✓ ${b}`);

if (stale.length === 0) {
  console.log('\nNo stale branches flagged (use --merged-into main or --all for more).');
} else {
  console.log('\nStale / cleanup candidates:');
  for (const { branch, reason } of stale) {
    console.log(`  • ${branch}`);
    console.log(`    ${reason}`);
  }
}

console.log('\nTo delete a merged remote branch:');
console.log('  git push origin --delete <branch-name>');
