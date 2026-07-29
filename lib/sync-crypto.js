'use strict';

/**
 * End-to-end encryption for Khayt Cloud sync (Phase 1). See
 * docs/KHAYT-3.0-PHASE1-SPEC.md §3 and docs/KHAYT-3.0-SECURITY-MODEL.md §4.
 *
 * Envelope model — the server NEVER sees a usable key:
 *   - A random 256-bit Data Encryption Key (DEK) actually encrypts the store.
 *   - The DEK is wrapped (AES-256-GCM) twice: once under a key derived from the
 *     user's sync passphrase, once under a key derived from a one-time recovery
 *     key. Either can unwrap the DEK; losing both => the cloud copy is
 *     unrecoverable (the local store is unaffected — it stays the source of truth).
 *   - Changing the passphrase re-wraps the DEK only; the encrypted store blob is
 *     untouched (the DEK never changes).
 *
 * The server stores only: the keyset (salts, IVs, wrapped DEKs — all opaque) and
 * the encrypted store blob. No passphrase, no recovery key, no DEK ever leaves
 * the client in the clear. GCM's auth tag doubles as the wrong-secret check, so
 * no separate verifier token is needed.
 */
const crypto = require('crypto');

/**
 * Two versions that used to be one constant, and must not move together.
 *
 * KEYSET_VERSION describes the shape of the keyset — which wrapping slots it
 * carries. STORE_BLOB_VERSION describes the encrypted store itself, which is
 * still AES-256-GCM under the same DEK and has NOT changed. They were the same
 * number, so bumping the keyset for org support would silently have relabelled
 * every store blob as a new format that does not exist.
 *
 * Nothing in the app reads either field today (checked: no comparison against
 * `keyset.version` or `blob.v` anywhere), which is what makes adding a slot safe
 * for older clients — they ignore fields they do not know. That tolerance is
 * load-bearing, so test/sync-crypto-org.test.js asserts it rather than trusting
 * it to stay true.
 */
const KEYSET_VERSION = 2;
const STORE_BLOB_VERSION = 1;
const DEK_BYTES = 32;            // AES-256
const RECOVERY_BYTES = 32;       // 256-bit recovery key
const GCM_IV_BYTES = 12;         // standard GCM nonce length

// scrypt cost parameters (memory-hard). 2^15 is a sane desktop default; exposed
// in the keyset so they can be raised over time without breaking old blobs.
const DEFAULT_KDF = { algo: 'scrypt', N: 32768, r: 8, p: 1, keyLen: 32 };
const SCRYPT_MAXMEM = 96 * 1024 * 1024;

function b64(buf) { return Buffer.from(buf).toString('base64'); }
function unb64(str) { return Buffer.from(String(str), 'base64'); }

/** Derive a 32-byte key-encryption key from a secret + salt using scrypt. */
function deriveKek(secret, saltBuf, kdf = DEFAULT_KDF) {
  if (kdf.algo !== 'scrypt') throw new Error(`unsupported KDF: ${kdf.algo}`);
  const secretBuf = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret), 'utf8');
  return crypto.scryptSync(secretBuf, saltBuf, kdf.keyLen, {
    N: kdf.N, r: kdf.r, p: kdf.p, maxmem: SCRYPT_MAXMEM,
  });
}

/** AES-256-GCM encrypt → { iv, ct, tag } (all base64). */
function gcmEncrypt(plaintextBuf, key) {
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: b64(iv), ct: b64(ct), tag: b64(tag) };
}

/** AES-256-GCM decrypt; throws if the key is wrong or the data was tampered. */
function gcmDecrypt(blob, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, unb64(blob.iv));
  decipher.setAuthTag(unb64(blob.tag));
  return Buffer.concat([decipher.update(unb64(blob.ct)), decipher.final()]);
}

/** Wrap (encrypt) the DEK under a secret; returns { salt, iv, ct, tag } (base64). */
function wrapDek(dek, secret, kdf = DEFAULT_KDF) {
  const salt = crypto.randomBytes(16);
  const kek = deriveKek(secret, salt, kdf);
  return { salt: b64(salt), ...gcmEncrypt(dek, kek) };
}

/** Unwrap the DEK using a secret + a wrapped entry; throws on wrong secret. */
function unwrapDek(secret, wrapped, kdf = DEFAULT_KDF) {
  if (!wrapped || typeof wrapped !== 'object') throw new Error('missing wrapped key');
  // A key-wrapped entry carries no salt. Without this it would derive a KEK from
  // `unb64(undefined)` — an empty buffer — and fail later with a GCM auth error
  // that says nothing about the real mistake.
  if (wrapped.kek === 'direct' || wrapped.salt == null) {
    throw new Error('this entry is key-wrapped; use unwrapWithKey');
  }
  const kek = deriveKek(secret, unb64(wrapped.salt), kdf);
  return gcmDecrypt(wrapped, kek);
}

/**
 * Wrap a key under ANOTHER KEY rather than a passphrase — no KDF.
 *
 * scrypt exists to turn something a human chose into something with 256 bits of
 * entropy. The Org Data Key already is 256 uniform random bits, so stretching it
 * buys nothing and costs 32 MB of memory and ~100 ms on every unwrap — paid once
 * per shop, on a device that may belong to several.
 *
 * `kek: 'direct'` is recorded in the entry so the shape is self-describing and
 * cannot be fed to the passphrase path by accident.
 */
function wrapWithKey(plaintextKey, key) {
  if (!Buffer.isBuffer(key) || key.length !== DEK_BYTES) {
    throw new Error(`key must be ${DEK_BYTES} raw bytes`);
  }
  return { kek: 'direct', ...gcmEncrypt(plaintextKey, key) };
}

/** Reverse wrapWithKey; throws on the wrong key or a tampered entry. */
function unwrapWithKey(key, wrapped) {
  if (!Buffer.isBuffer(key) || key.length !== DEK_BYTES) {
    throw new Error(`key must be ${DEK_BYTES} raw bytes`);
  }
  if (!wrapped || wrapped.kek !== 'direct') {
    throw new Error('not a key-wrapped entry');
  }
  return gcmDecrypt(wrapped, key);
}

/**
 * Format 32 raw bytes as a human-friendly recovery key: base32, grouped in
 * 4-char blocks (e.g. "K7F2-9QZ3-..."). Reverse with parseRecoveryKey.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encodeRecovery(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}
function decodeRecovery(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/**
 * Create a fresh keyset for a new cloud connection.
 *
 * Stamped v2 — the version describes the FORMAT (one that may carry a
 * `wrappedByOrg` slot), not the contents. A v2 keyset with no such slot is
 * simply a shop that is not in an organisation, which is every shop until
 * someone calls joinOrg.
 *
 * @returns {{ keyset: object, recoveryKey: string }} — show recoveryKey to the
 *   user ONCE; persist only `keyset` (server-safe, contains no usable secret).
 */
function createKeyset(passphrase, opts = {}) {
  if (!passphrase || typeof passphrase !== 'string') throw new Error('passphrase required');
  const kdf = { ...DEFAULT_KDF, ...(opts.kdf || {}) };
  const dek = crypto.randomBytes(DEK_BYTES);
  const recoveryRaw = crypto.randomBytes(RECOVERY_BYTES);
  const recoveryKey = encodeRecovery(recoveryRaw);
  const keyset = {
    version: KEYSET_VERSION,
    kdf,
    wrappedByPassphrase: wrapDek(dek, passphrase, kdf),
    wrappedByRecovery: wrapDek(dek, recoveryRaw, kdf),
  };
  return { keyset, recoveryKey };
}

function unlockWithPassphrase(passphrase, keyset) {
  return unwrapDek(String(passphrase), keyset.wrappedByPassphrase, keyset.kdf);
}

/* ── Organisations (multi-shop) ────────────────────────────────────────────
 *
 * See docs/KHAYT-3.0-ORG-DATA-KEY.md. An org owns one random 256-bit Org Data
 * Key. Each member shop's keyset gains a THIRD wrapping slot, `wrappedByOrg`,
 * holding that shop's own DEK wrapped under the ODK. Nothing else moves:
 * `wrappedByPassphrase` and `wrappedByRecovery` are untouched, so a printed
 * per-shop recovery key from before the shop joined still works afterwards, and
 * a single-shop owner never encounters any of this.
 *
 * DEKs stay per-shop on purpose. Holding one branch's DEK reveals that branch
 * and no other; only the ODK opens them all.
 *
 * What this deliberately does NOT do is per-device key wrapping, so removing a
 * device revokes its server token but not the key material it already holds.
 * That limit is real and belongs in the UI in plain words — see the doc's
 * threat-model table, the row about revoked devices.
 */

const ORG_KEYSET_VERSION = 1;
const ORG_ID_BYTES = 8;

/**
 * Create a new organisation.
 * @returns {{ orgKeyset: object, orgKey: Buffer, recoveryKey: string }} — persist
 *   only `orgKeyset` (server-safe); show `recoveryKey` to the owner ONCE.
 *   `orgKey` is the live ODK, returned so the caller can enrol shops right away
 *   without paying for a second scrypt derivation.
 */
function createOrgKeyset(passphrase, opts = {}) {
  if (!passphrase || typeof passphrase !== 'string') throw new Error('passphrase required');
  const kdf = { ...DEFAULT_KDF, ...(opts.kdf || {}) };
  const orgKey = crypto.randomBytes(DEK_BYTES);
  const recoveryRaw = crypto.randomBytes(RECOVERY_BYTES);
  const orgKeyset = {
    version: ORG_KEYSET_VERSION,
    // An opaque label, NOT a secret and NOT a security boundary — GCM's auth tag
    // is what actually stops a foreign ODK from opening a shop. It exists so the
    // common mistake (pointing a shop at the wrong org) reports itself as
    // "different organisation" instead of an unintelligible auth failure.
    orgId: b64(crypto.randomBytes(ORG_ID_BYTES)),
    kdf,
    wrappedByPassphrase: wrapDek(orgKey, passphrase, kdf),
    wrappedByRecovery: wrapDek(orgKey, recoveryRaw, kdf),
  };
  return { orgKeyset, orgKey, recoveryKey: encodeRecovery(recoveryRaw) };
}

function unlockOrgWithPassphrase(passphrase, orgKeyset) {
  return unwrapDek(String(passphrase), orgKeyset.wrappedByPassphrase, orgKeyset.kdf);
}

function unlockOrgWithRecovery(recoveryKey, orgKeyset) {
  return unwrapDek(decodeRecovery(recoveryKey), orgKeyset.wrappedByRecovery, orgKeyset.kdf);
}

/** Re-wrap the ODK under a new org passphrase; the ODK itself is unchanged, so
 *  every member shop's `wrappedByOrg` stays valid and nothing is re-encrypted. */
function changeOrgPassphrase(orgKeyset, currentPassphrase, newPassphrase) {
  const orgKey = unlockOrgWithPassphrase(currentPassphrase, orgKeyset);
  return {
    ...orgKeyset,
    wrappedByPassphrase: wrapDek(orgKey, String(newPassphrase), orgKeyset.kdf),
  };
}

/**
 * Enrol a shop in an org: add `wrappedByOrg` to its keyset.
 *
 * This is also the v1 → v2 keyset migration, and the only moment at which the
 * migration means anything — a version stamp on a keyset that gained no slot
 * would be a relabelling, not a change. Returns a new object; the caller's
 * keyset is not mutated, so a failed save cannot half-apply it.
 *
 * @param {object} keyset  the shop's existing keyset (v1 or v2)
 * @param {Buffer} dek     that shop's DEK, already unlocked by its owner
 * @param {Buffer} orgKey  the ODK
 * @param {string} orgId   `orgKeyset.orgId`
 */
function joinOrg(keyset, dek, orgKey, orgId) {
  if (!keyset || typeof keyset !== 'object') throw new Error('keyset required');
  if (!Buffer.isBuffer(dek) || dek.length !== DEK_BYTES) {
    throw new Error(`dek must be ${DEK_BYTES} raw bytes`);
  }
  if (!orgId || typeof orgId !== 'string') throw new Error('orgId required');
  return {
    ...keyset,
    version: KEYSET_VERSION,
    wrappedByOrg: { orgId, ...wrapWithKey(dek, orgKey) },
  };
}

/** Remove a shop from an org. The ODK can no longer open it; the shop's own
 *  passphrase and recovery key are untouched, so its owner never loses access. */
function leaveOrg(keyset) {
  const { wrappedByOrg, ...rest } = keyset || {};
  return { ...rest, version: KEYSET_VERSION };
}

/**
 * Unlock a member shop's DEK with the ODK — the whole point of an org: one
 * passphrase entry, then every branch opens without a further KDF pass.
 *
 * `orgId` is required rather than optional. An optional argument that silently
 * disables a check is the shape of bug this module cannot afford.
 */
function unlockWithOrg(orgKey, orgId, keyset) {
  if (!orgId || typeof orgId !== 'string') throw new Error('orgId required');
  const wrapped = keyset && keyset.wrappedByOrg;
  if (!wrapped) throw new Error('this shop is not part of an organisation');
  if (wrapped.orgId !== orgId) throw new Error('this shop belongs to a different organisation');
  return unwrapWithKey(orgKey, wrapped);
}

function unlockWithRecovery(recoveryKey, keyset) {
  return unwrapDek(decodeRecovery(recoveryKey), keyset.wrappedByRecovery, keyset.kdf);
}

/**
 * Re-wrap the DEK under a new passphrase (DEK unchanged → the store blob stays
 * valid). Requires the current passphrase (or recover + call with recovery DEK).
 */
function changePassphrase(keyset, currentPassphrase, newPassphrase) {
  const dek = unlockWithPassphrase(currentPassphrase, keyset);
  return { ...keyset, wrappedByPassphrase: wrapDek(dek, String(newPassphrase), keyset.kdf) };
}

/** Encrypt the store object with the DEK → an opaque blob for upload. */
function encryptStore(obj, dek) {
  return { v: STORE_BLOB_VERSION, ...gcmEncrypt(Buffer.from(JSON.stringify(obj), 'utf8'), dek) };
}

/** Decrypt a store blob with the DEK; throws on wrong key/tamper. */
function decryptStore(blob, dek) {
  return JSON.parse(gcmDecrypt(blob, dek).toString('utf8'));
}

module.exports = {
  KEYSET_VERSION,
  STORE_BLOB_VERSION,
  ORG_KEYSET_VERSION,
  DEFAULT_KDF,
  createKeyset,
  unlockWithPassphrase,
  unlockWithRecovery,
  changePassphrase,
  encryptStore,
  decryptStore,
  encodeRecovery,
  decodeRecovery,
  // organisations (docs/KHAYT-3.0-ORG-DATA-KEY.md)
  createOrgKeyset,
  unlockOrgWithPassphrase,
  unlockOrgWithRecovery,
  changeOrgPassphrase,
  joinOrg,
  leaveOrg,
  unlockWithOrg,
  // low-level (exposed for tests / reuse by the Phase 3 org-data-key model)
  deriveKek,
  wrapDek,
  unwrapDek,
  wrapWithKey,
  unwrapWithKey,
};
