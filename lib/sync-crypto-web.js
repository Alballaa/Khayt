'use strict';
(function () {

/**
 * Browser-side DECRYPT path for Khayt Cloud E2E — the foundation for the
 * remote-mobile PWA (read-only first). Byte-compatible with lib/sync-crypto.js:
 *   - AES-256-GCM via WebCrypto `crypto.subtle` (available in browsers + Node 16+).
 *   - The scrypt KDF is INJECTED (`scrypt(secretBytes, saltBytes, kdf) -> bytes`)
 *     so this module stays dependency-free; the PWA passes a JS scrypt
 *     (e.g. scrypt-js), and tests pass Node's scryptSync. Same params + salt ⇒
 *     identical KEK, so it unwraps exactly what the desktop wrapped.
 *
 * Decrypt-only by design: the mobile client reads the encrypted store; writes
 * (re-encrypt + push) come in a later phase and reuse the desktop crypto.
 */

const subtle = (globalThis.crypto && globalThis.crypto.subtle) || null;

function unb64(s) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(s), 'base64'));
  const bin = atob(String(s));
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function toBytes(x) {
  if (x instanceof Uint8Array) return x;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(x)) return new Uint8Array(x);
  return new Uint8Array(x);
}
const utf8 = (s) => new TextEncoder().encode(String(s));
const fromUtf8 = (bytes) => new TextDecoder().decode(bytes);

/** AES-256-GCM decrypt of a { iv, ct, tag } envelope (all base64). Throws on
 *  wrong key / tamper (GCM auth). WebCrypto wants ct||tag concatenated. */
async function gcmDecrypt(blob, keyBytes) {
  if (!subtle) throw new Error('WebCrypto subtle unavailable');
  const key = await subtle.importKey('raw', toBytes(keyBytes), { name: 'AES-GCM' }, false, ['decrypt']);
  const ct = unb64(blob.ct);
  const tag = unb64(blob.tag);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct, 0);
  combined.set(tag, ct.length);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv), tagLength: 128 }, key, combined);
  return new Uint8Array(pt);
}

/** Unwrap the DEK from a keyset using the sync passphrase. `scrypt` is injected:
 *  async|sync (secretBytes, saltBytes, kdf{N,r,p,keyLen}) -> 32 bytes. */
async function unlockDek(opts) {
  const keyset = opts.keyset || {};
  const w = keyset.wrappedByPassphrase;
  if (!w) throw new Error('keyset missing wrappedByPassphrase');
  const kdf = keyset.kdf || {};
  if (kdf.algo && kdf.algo !== 'scrypt') throw new Error('unsupported KDF: ' + kdf.algo);
  if (typeof opts.scrypt !== 'function') throw new Error('scrypt function required');
  const kek = await opts.scrypt(utf8(opts.passphrase), unb64(w.salt), kdf);
  return gcmDecrypt(w, toBytes(kek)); // throws on wrong passphrase (GCM tag)
}

/** Decrypt a store blob ({ v, iv, ct, tag }) with the DEK → the store object. */
async function decryptStore(blob, dek) {
  const pt = await gcmDecrypt(blob, dek);
  return JSON.parse(fromUtf8(pt));
}

const api = { gcmDecrypt, unlockDek, decryptStore, _unb64: unb64 };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.KhaytSyncWeb = api;

})();
