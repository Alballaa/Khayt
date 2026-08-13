# Entity-level delta sync — the contract, and the hazard that sets its rollout

Blob-first sync costs `store size × saves`, so a shop pays for its entire history
on every card it drags and its bill grows quadratically with age.
[COST-PER-SHOP §4](./KHAYT-CLOUD-COST-PER-SHOP.md) measures what that is worth:
the heaviest modelled shop drops from **84 GB/month to 13.6 MB**, and the spread
between the lightest and heaviest shop collapses from **12,151× to 80×** — the
ratio of how *active* two shops are, which is all it should ever have been.

Compression (beta.18) lowered the bill by 6.17× but left it quadratic, because a
uniform multiplier cannot change a shape. This is the change that does.

**Status:** the desktop **reader** is built and tested. Nothing writes deltas —
`DELTA_WRITES` in [`lib/cloud-backend.js`](../lib/cloud-backend.js) is `false`,
and §3 is why. No server implements the contract yet.

---

## 1. The wire contract

Validated against a reference server in
[`test/cloud-delta-push.test.js`](../test/cloud-delta-push.test.js) before being
written in PHP, because it is far cheaper to find the shape wrong there than in
two server implementations that `test/route-parity.test.js` pins together.

```
POST /v1/shops/{shopId}/deltas
     body { ciphertext, baseRev }
     200 { rev, deltaCount }      appended; rev is the new head
     409 { rev }                  baseRev is not the head — pull, merge, retry
     404 / 405                    server is blob-only

GET  /v1/shops/{shopId}/store[?since={rev}]
     200 { ciphertext?, rev, deltas: [{ rev, ciphertext }] }
     204                          nothing stored yet

     Without `since`: the base plus the whole chain — what a cold device needs.
     With `since`:    only entries newer than that rev; `ciphertext` is omitted
                      unless the caller is behind the current base.
```

**`?since=` is a requirement, not an optimisation.** Without it every launch
re-downloads the base *and* the entire chain, which makes pulls **worse** than
blob-only and can wipe out the push saving on its own. A warm client that already
holds rev N must be able to ask for N+1 onward.

- **The server never decrypts anything.** A delta is its own ciphertext; the
  server learns that something changed and how big it was, which is what it
  already learns from a blob push.
- **One base plus an ordered chain.** `PUT /store` replaces the base and
  **compacts** the chain to empty. That is the only compaction mechanism, and it
  is also the fallback for anything a delta cannot express.
- **`settings` is not an array collection**, so a settings change is not covered
  by a delta and needs a full push. Worth knowing before assuming deltas cover
  every save.
- **Old clients need no flag and no negotiation.** A Phase 1 server answers 404
  to `POST /deltas`; the client remembers that and sends blobs for the rest of
  the session, one wasted round trip per session rather than per save.

## 2. The desktop side, and one thing that had to change

`extractDeltas(snapshot, cursor)` looked like the obvious way to ask "what has
changed since my last push". **It cannot answer that question**, and the reason
is worth recording because it is not visible from the function's signature.

`rev` is a **per-record** counter, not a global sequence. `maxCursor` returns the
largest rev in the store. So in a store whose records sit at rev 1, a brand-new
record also arrives at rev 1, and `rec.rev > since.rev` is `1 > 1` — false. The
new record is invisible and never ships.

Every existing test extracts from `{rev: 0}`, which selects everything and never
exercises the comparison, so nothing caught it.

The backend therefore keeps a **push index** — `collection:id -> rev` of what it
last sent — rather than a cursor. It asks "is this the version they have?", which
is the actual question and needs nothing global. The engine is untouched.

## 3. The hazard, and why `DELTA_WRITES` is off

**A blob-only desktop silently destroys every delta.** Pinned by the last test in
`test/cloud-delta-push.test.js`, which is written to fail if this ever stops
being true.

The old client is not broken and cannot tell anything is wrong. It pulls, gets a
`200` with a base blob, ignores the `deltas` field it has never heard of, merges
into it, and pushes a well-formed full store with a **correct** `baseRev`.
Nothing rejects it. The newer edits are simply gone.

This is worse than the compression rollout it otherwise resembles. A beta.16
client meeting a gzipped blob **stops syncing, loudly**. This one keeps working
and eats data.

So the order is:

1. ~~**Ship the reader.**~~ Done — this change. A desktop that can fold
   `base + deltas`, and that refuses a delta response it cannot fold rather than
   returning a store missing its newest edits.
2. **Let it reach the field.** Same adoption wait the portal read gate is in
   ([PORTAL read gate](./KHAYT-3.0-CLOUD-STATUS.md)); a beta-only release does
   not satisfy it.
3. **Build the server**, including the gate in §4 — without which step 4 is
   unsafe no matter how long step 2 waits.
4. **Flip `DELTA_WRITES`.**

## 4. What the server has to do that this repo cannot

**The desktop cannot make this decision.** A client knows its own version; it
cannot know what other devices a shop has attached, so the refusal has to live
server-side:

> The server must refuse `POST /deltas` for a shop that still has a device
> capable only of blob reads.

That needs a per-device record of delta capability — sent at token
rotation or login — and a per-shop derived flag. Devices already register and
rotate tokens, so this is a column and a check rather than a new concept.

The conservative default matters: a shop whose devices have **not** all reported
capability is blob-only. Unknown must not mean permitted, or the first shop to
sync from an un-upgraded laptop is the one that loses data.

## 5. What is left

| Piece | Where | Status |
|---|---|---|
| Fold `base + deltas` on pull | desktop | **done** |
| Push index (not a cursor) | desktop | **done** |
| Contract proven against a reference server | desktop tests | **done** |
| `POST /deltas` + chain storage | khayt-cloud (PHP **and** Node) | not started |
| Per-device capability + per-shop gate | khayt-cloud | not started |
| Compaction policy (when to force a full push) | desktop | **done** — §6 |
| Flip `DELTA_WRITES` | desktop | blocked on all of the above |

What remains is entirely server-side. The compaction question that was open in
the first revision is answered in §6.

---

## 6. Compaction, derived rather than picked

A chain has to be reset by a full push, or a cold device pays for the base plus
every delta ever appended — each of which is a decrypt. Let **R** be the ratio at
which the client compacts: chain bytes ≤ R × base bytes. Per cycle a shop sends
`R × base / delta` deltas and then one base, so

```
push bytes/month = saves × delta × (1 + 1/R)
```

**The store size cancels.** That is the useful result: R alone fixes the push cost
as a multiple of the ideal delta cost — the same multiple for a hobbyist and a
farm — and what it trades against is the cold pull, bounded by `base × (1 + R)`.

| R | push vs ideal | cold pull vs blob |
|---|---|---|
| 0.5 | 3.00× | 1.5× |
| 1 | 2.00× | 2.0× |
| **2** | **1.50×** | **3.0×** |
| 4 | 1.25× | 5.0× |
| 10 | 1.10× | 11.0× |

**R = 2** is the knee. R = 10 saves a further 0.4× on push and costs 11× on a cold
pull, which is a bad trade for a rare-but-painful event.

The ratio self-scales by store size, which is right for bytes and wrong for
**time**: at R = 2 a busy shop reaches ~3,850 deltas, i.e. 3,850 decrypts on a
cold pull. So an absolute **`MAX_CHAIN_DELTAS = 1000`** bounds that latency for
every shop. For a small shop the ratio binds first and the cap never applies,
which is the intended division of labour.

Reproduce the table with `node scripts/cloud-cost-model.mjs`.

**One property fell out of this that is worth stating, because it makes the
policy safe to enable everywhere.** A delta and a whole *small* store are
dominated by the same ~1.1 KB crypto/base64 envelope, so for a tiny shop a delta
buys nothing — and the ratio notices without being told, because a single delta
already exceeds `R ×` a tiny base. Such a shop simply keeps sending blobs. The
saving scales with store size, and where there is no saving the client falls back
on its own. Pinned by a test; it was found by a test failing for what looked like
the wrong reason.
