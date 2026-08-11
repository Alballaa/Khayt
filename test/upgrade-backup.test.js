const { test } = require('node:test');
const assert = require('node:assert/strict');

const U = require('../lib/upgrade-backup.js');

/**
 * Khayt survives crashes well — atomic writes, a `.prev` generation, crash
 * recovery, and a guard that refuses to save over a store written by a newer
 * build. The gap this covers is the one where nothing crashes and nothing is
 * refused: a build whose own migration is wrong reads the old store, transforms
 * it, and writes the result. `.prev` covers exactly one save, and the daily
 * backup is keyed by DATE, so the first backup after the upgrade overwrites the
 * last good one from the same day.
 */

test('an older store on disk is backed up before this build touches it', () => {
  assert.equal(U.needsPreUpgradeBackup(9, 10), true);
  assert.equal(U.needsPreUpgradeBackup(1, 10), true);
});

test('a store from before versioning existed counts as older, not as unknown', () => {
  // The store carried no `version` at all until v10. Those are the oldest
  // installs in the field and the ones with most to lose, so a missing version
  // must not read as "cannot tell — skip the backup".
  for (const missing of [undefined, null, NaN, 'x']) {
    assert.equal(U.needsPreUpgradeBackup(missing, 10), true, `version=${String(missing)}`);
  }
});

test('a fresh install has nothing to back up', () => {
  assert.equal(U.needsPreUpgradeBackup(null, 10, false), false);
  assert.equal(U.needsPreUpgradeBackup(9, 10, false), false);
});

test('the same version is not an upgrade', () => {
  assert.equal(U.needsPreUpgradeBackup(10, 10), false);
});

test('a NEWER store is not backed up — it is refused', () => {
  // main.js declines to save over a store written by a newer build, so nothing
  // is at risk and a backup would only be noise. Backing it up would also imply
  // the upgrade is proceeding, which it is not.
  assert.equal(U.needsPreUpgradeBackup(11, 10), false);
});

test('the filename carries both versions and is legal on Windows', () => {
  const name = U.preUpgradeBackupName(9, 10, '2026-08-11T09:30:00.000Z');
  assert.ok(name.includes('v9-to-v10'), `both versions are visible: ${name}`);
  assert.ok(!name.includes(':'), 'a colon is not a legal Windows filename character');
  assert.ok(name.endsWith('.json'));
  // The rotation filter only looks at .json files, so the extension is load-bearing.
  assert.equal(U.isProtectedBackup(name), true);
});

test('an unversioned store is named v0 rather than vundefined', () => {
  assert.ok(U.preUpgradeBackupName(undefined, 10, '2026-08-11T09:30:00Z').includes('v0-to-v10'));
});

test('rotation may delete daily backups and may never delete upgrade ones', () => {
  const files = [
    '2026-08-01.json',
    'pre-upgrade-v9-to-v10-2026-08-02T00-00-00-000Z.json',
    '2026-08-03.json',
  ];
  const { protectedFiles, rotatable } = U.partitionForRotation(files);
  assert.deepEqual(rotatable, ['2026-08-01.json', '2026-08-03.json']);
  assert.deepEqual(protectedFiles, ['pre-upgrade-v9-to-v10-2026-08-02T00-00-00-000Z.json']);
});

test('a shop that opens the app for 30 days does not lose its upgrade backup', () => {
  // The failure this prevents: rotation counts 30 files including the upgrade
  // backup, so the oldest — which is the upgrade backup — is the first deleted.
  const daily = Array.from({ length: 40 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}.json`);
  const files = ['pre-upgrade-v9-to-v10-2026-06-01T00-00-00-000Z.json', ...daily];
  const { rotatable } = U.partitionForRotation(files);
  const doomed = rotatable.slice(0, rotatable.length - 30);
  assert.equal(doomed.length, 10, 'ten oldest daily backups rotate out');
  assert.ok(!doomed.some(U.isProtectedBackup), 'and none of them is the upgrade backup');
});

test('malformed input is safe', () => {
  assert.deepEqual(U.partitionForRotation(null), { protectedFiles: [], rotatable: [] });
  assert.equal(U.isProtectedBackup(null), false);
  assert.equal(U.isProtectedBackup(undefined), false);
  assert.equal(U.needsPreUpgradeBackup(9, NaN), false);
});
