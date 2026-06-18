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

const KEYSET_VERSION = 1;
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
  const kek = deriveKek(secret, unb64(wrapped.salt), kdf);
  return gcmDecrypt(wrapped, kek);
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
  return { v: KEYSET_VERSION, ...gcmEncrypt(Buffer.from(JSON.stringify(obj), 'utf8'), dek) };
}

/** Decrypt a store blob with the DEK; throws on wrong key/tamper. */
function decryptStore(blob, dek) {
  return JSON.parse(gcmDecrypt(blob, dek).toString('utf8'));
}

module.exports = {
  KEYSET_VERSION,
  DEFAULT_KDF,
  createKeyset,
  unlockWithPassphrase,
  unlockWithRecovery,
  changePassphrase,
  encryptStore,
  decryptStore,
  encodeRecovery,
  decodeRecovery,
  // low-level (exposed for tests / reuse by the Phase 3 org-data-key model)
  deriveKek,
  wrapDek,
  unwrapDek,
};
