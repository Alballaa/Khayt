'use strict';

/**
 * The one backup that exists specifically to survive a bad upgrade.
 *
 * Khayt already protects the store well against crashes: writes are atomic with
 * an fsync'd temp swap, there is a one-generation `.prev` rollback,
 * recoverStoreRaw() heals from a half-finished write, and a store written by a
 * NEWER build is refused rather than saved over (see the guard in main.js).
 *
 * None of that covers the case this module exists for: a build whose own
 * migration is wrong. Then nothing crashes and nothing is refused — the app
 * reads the old store, transforms it, and writes the result. `.prev` holds the
 * good copy for exactly one save, and the daily auto-backup is keyed by DATE, so
 * the first backup after the upgrade overwrites the last good one from the same
 * day. The shop discovers the damage on Tuesday and finds Monday's backup, minus
 * everything it did on Monday.
 *
 * So: the first time a build opens a store written by an OLDER schema, copy that
 * store aside, verbatim, before anything in this build has touched it. It is
 * taken from the raw bytes read off disk rather than the normalized snapshot,
 * because normalizeStoreSnapshot is an allowlist and dropping an unrecognised
 * collection is one of the failures being insured against.
 *
 * These backups are never rotated away — see isProtectedBackup. There is one per
 * schema version the shop has ever upgraded through, which is a handful of files
 * over the life of an install, not a growing pile.
 *
 * Pure (no fs, no Electron) so the decision and the naming are testable without
 * a filesystem; main.js does the writing.
 */

/** Marks a backup that rotation must never delete. */
const PROTECTED_PREFIX = 'pre-upgrade-';

/**
 * Should this build take a pre-upgrade backup of what it just read?
 *
 * @param {number|null|undefined} diskVersion  `version` from the store on disk
 * @param {number} buildVersion                STORE_VERSION of this build
 * @param {boolean} existed                    whether a store file was actually there
 *
 * A store with NO version was written before versioning existed, which is the
 * oldest upgrade of all and the one most worth insuring — so a missing version
 * counts as older, not as "unknown, skip it". A fresh install has nothing to
 * back up, which is what `existed` distinguishes.
 *
 * A NEWER disk version returns false: that store is not being upgraded, it is
 * being refused, and the save guard already protects it.
 */
function needsPreUpgradeBackup(diskVersion, buildVersion, existed = true) {
  if (!existed) return false;
  if (!Number.isFinite(buildVersion)) return false;
  const from = Number.isFinite(diskVersion) ? diskVersion : 0;
  return from < buildVersion;
}

/**
 * Filename for the backup, carrying both versions so the shop (and support) can
 * see what it is without opening it.
 *
 * @param {number|null|undefined} diskVersion
 * @param {number} buildVersion
 * @param {string} isoTimestamp  an ISO-8601 instant; ':' is not legal in a
 *                               Windows filename, so it is replaced
 */
function preUpgradeBackupName(diskVersion, buildVersion, isoTimestamp) {
  const from = Number.isFinite(diskVersion) ? diskVersion : 0;
  const stamp = String(isoTimestamp || '').replace(/[:.]/g, '-');
  return `${PROTECTED_PREFIX}v${from}-to-v${buildVersion}-${stamp}.json`;
}

/**
 * Is this a backup rotation must keep?
 *
 * The daily rotation keeps the most recent 30 files in the backups directory.
 * Without this test a shop that opened the app on 30 consecutive days would have
 * its upgrade insurance quietly deleted by routine housekeeping — the backup
 * would exist for exactly as long as nobody needed it.
 */
function isProtectedBackup(filename) {
  return String(filename || '').startsWith(PROTECTED_PREFIX);
}

/**
 * Split a directory listing into the files rotation may delete and those it may
 * not, preserving order.
 */
function partitionForRotation(filenames) {
  const list = Array.isArray(filenames) ? filenames : [];
  const protectedFiles = [];
  const rotatable = [];
  for (const f of list) (isProtectedBackup(f) ? protectedFiles : rotatable).push(f);
  return { protectedFiles, rotatable };
}

const api = {
  PROTECTED_PREFIX,
  needsPreUpgradeBackup,
  preUpgradeBackupName,
  isProtectedBackup,
  partitionForRotation,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytUpgradeBackup = api;
