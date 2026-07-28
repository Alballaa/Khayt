# The Org Data Key — design before code

Phase 3 lets one owner run several branches. The unavoidable crypto question is
how Branch B reads Branch A's clients when Phase 1 derives the key from one
shop's passphrase.

[PHASE3-DESIGN](./KHAYT-3.0-PHASE3-DESIGN.md) called this "the part most likely
to go wrong, because a mistake is silent". That is the reason this document
exists before any implementation: a bug in delta merging shows up as a wrong
number someone notices; a bug in key wrapping shows up as data nobody can
decrypt, or data the server can read. Neither announces itself.

Everything below is checked against `lib/sync-crypto.js` as it stands on
2026-07-28. Where it says the code does something, the function is named.

---

## What already exists

More than the Phase 3 spec assumes, which changes the recommendation.

`lib/sync-crypto.js` is already a proper envelope scheme:

- A random 256-bit **DEK** encrypts the store (`createKeyset`, `DEK_BYTES`).
- The DEK is wrapped twice with AES-256-GCM — once under a KEK derived from the
  sync passphrase, once under a KEK derived from a one-time recovery key
  (`wrapDek`, `deriveKek`, scrypt N=32768, r=8, p=1).
- The server stores only salts, IVs and wrapped DEKs. GCM's auth tag doubles as
  the wrong-secret check, so there is no verifier token to leak.
- Changing the passphrase re-wraps the DEK; the store blob is untouched, because
  the DEK itself never changes.
- The keyset carries `version` (`KEYSET_VERSION = 1`), so it can be migrated.

**The thing to notice: there are no per-device keys today.** A device gets the
DEK by knowing the passphrase. Nothing is wrapped to a device.

## The decision this forces

The Phase 3 spec says the ODK should be "held by each device and wrapped to that
device's public key". That is a real design, but it is **not the smallest one
that works**, and per-device public keys buy exactly one property:

> revoking a single device without making every other device re-enter a new
> passphrase.

Everything else multi-shop needs — several shops readable by the same owner on
several machines — the existing envelope already does.

### Recommendation: the ODK is a third wrapping slot, not a new key system

An org gets its own random 256-bit key. Each shop's keyset gains a slot:

```
keyset.version = 2
keyset.wrappedByPassphrase   // unchanged — a single-shop owner never notices
keyset.wrappedByRecovery     // unchanged
keyset.wrappedByOrg          // NEW: this shop's DEK, wrapped under the ODK
orgKeyset                    // the ODK itself, wrapped by passphrase + recovery
```

A device unlocks the org passphrase once, unwraps the ODK, and uses it to unwrap
every branch's DEK. Per-shop DEKs stay per-shop, so a branch's blob is still only
decryptable by someone holding a key for that branch.

What this uses: `wrapDek` / `unwrapDek` / `deriveKek`, unchanged. **No new
primitives, no key agreement, no device identity.** The new code is a keyset
migration and one extra unwrap, both of which are testable without a server.

What it does not give you is per-device revocation — see below, where that is
argued to be the honest trade rather than an oversight.

## Rotation on revoke — and why v1 should not pretend

Removing a device today revokes its **token**, so it can no longer reach the
server. It does not remove the key material that device already holds. With an
ODK the same is true, and it is more consequential: a removed device that kept a
copy of the ODK can read every branch, not one.

Truly revoking means rotating the ODK, which means re-encrypting every branch's
blob under a new key. That is expensive, has to be **resumable** (an interrupted
rotation must not leave half the org unreadable), and needs every other device to
learn the new ODK before it can sync again.

**Recommendation: do not ship rotation in the first release, and say so in the
UI in plain words.** "This device can no longer connect" is true. "This device
can no longer read your data" would not be, and implying it is worse than
admitting the limit. The Phase 1 UI already takes this position for token
revocation; the ODK does not change the honesty requirement, it raises the
stakes.

If and when rotation is built, per-device wrapping becomes worth its cost,
because it turns rotation from "everyone re-enters a passphrase" into "drop one
wrapped copy". That is the moment to add device keys — not before.

## Recovery

Today the recovery key is per-shop, produced once by `createKeyset` and shown to
the owner. With an org there are two options and only one is defensible:

- **One recovery key for the org.** Losing it loses everything; keeping it safe
  is a single job the owner can actually do.
- Per-shop recovery keys *plus* an org key — more artefacts, more to lose, and
  the failure mode is a shop that recovers three of its four branches.

**Recommendation: one org recovery key**, and the existing per-shop recovery keys
keep working for shops that never join an org. A single-shop owner's experience
must not change at all.

The migration matters here: an existing shop that later joins an org already has
a recovery key in the owner's hands, possibly printed. It must keep working for
that shop, which the third-slot design preserves — `wrappedByRecovery` is
untouched.

## Threat model, stated plainly

| Actor | Can | Cannot |
|---|---|---|
| The server / anyone who dumps its DB | See how many shops, how big, how often each syncs | Read any shop's contents — it holds only wrapped keys and ciphertext |
| A revoked device (v1, no rotation) | Read anything it synced before removal | Reach the server, or receive anything new |
| A device with the org passphrase | Read every branch | Read another org |
| Someone with one branch's DEK but not the ODK | Read that branch | Read the others — DEKs stay per-shop |

The middle row is the one to be honest about in the UI, because it is the only
row where a user's intuition ("I removed it, so it's cut off") is wrong.

## What to build, in order

The ordering is chosen so the silent-failure risk is retired first.

1. ~~Property tests on the envelope~~ — **already done, and better than assumed.**
   `test/sync-crypto.test.js` and `test/sync-crypto-web.test.js` between them
   cover wrap/unwrap round-trips, recovery-key unlock, wrong passphrase, wrong
   recovery key, wrong DEK, tampered ciphertext, `changePassphrase`, desktop↔web
   interoperation, and that two keysets for the same passphrase yield different
   DEKs. Critically they include **"server-can't-decrypt by construction: the
   keyset carries no usable key"** — the check the whole product rests on, which
   would fail loudly if the envelope were ever inverted. Do not rewrite these;
   extend them.

2. **The v1 → v2 keyset migration**, with the invariant that a single-shop user's
   keyset opens identically before and after — asserted, not assumed. This is
   where step 1's suite gets extended: the same battery of wrong-secret and
   tampering cases, run against a v2 keyset, plus a v1 keyset that must still
   open unchanged.

3. **`wrappedByOrg` plus the org keyset**, with a test that a second shop's DEK
   unwraps from the ODK and that a shop *outside* the org does not — the negative
   case being the one that matters, since a too-permissive unwrap is exactly the
   silent failure this whole document is written around.

4. Only then the desktop plumbing that passes a real shop id to the per-shop
   change-index (already built — see `stampChanges(snapshot, scope)` and
   `test/phase3-delta-roundtrip.test.js`).

The useful conclusion from step 1 being already complete: **the risky half is
better defended than the Phase 3 design assumed.** The remaining exposure is not
the primitives, it is the migration and the org-scoped unwrap — both of which are
pure functions over local state, testable with no server and no network.

## What is deliberately not decided here

- **Which passphrase an org uses** — a new org passphrase, or promoting one
  shop's. This is a product question about what the owner types, not a crypto
  one, and it should be answered with the onboarding flow in front of you.
- **Whether HQ aggregate data is under the ODK or separate.** The spec wants
  consented plaintext for aggregates; mixing that into the ODK would weaken the
  "server sees nothing" claim for everything else. It deserves its own key.
