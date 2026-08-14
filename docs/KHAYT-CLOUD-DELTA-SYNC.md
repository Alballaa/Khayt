# Entity-level delta sync — the contract, and the hazard that sets its rollout

Blob-first sync costs `store size × saves`, so a shop pays for its entire history
on every card it drags and its bill grows quadratically with age.
[COST-PER-SHOP §4](./KHAYT-CLOUD-COST-PER-SHOP.md) measures what that is worth:
the heaviest modelled shop drops from **84 GB/month to 13.6 MB**, and the spread
between the lightest and heaviest shop collapses from **12,151× to 80×** — the
ratio of how *active* two shops are, which is all it should ever have been.

Compression (beta.18) lowered the bill by 6.17× but left it quadratic, because a
uniform multiplier cannot change a shape. This is the change that does.

**Status:** the desktop **reader** is built and tested, and the **server is live**
— KhaytApp/khayt-cloud#16 implements the contract in both backends, and production
is serving it. Verified rather than assumed, using the build marker the README
documents for exactly this:

```
shasum -a 256 index.php | cut -c1-12                       # 2cda2d3dbf8c
curl -s https://cloud.khaytapp.com/v1/health               # "build":"2cda2d3dbf8c"
curl -s -o /dev/null -w '%{http_code}' -X POST \
  https://cloud.khaytapp.com/v1/shops/probe/deltas         # 401, not 404
```

The 401 is the point: an unknown route answers 404 there, so "missing bearer
token" means the route exists and is guarded.

Nothing writes deltas — `DELTA_WRITES` in
[`lib/cloud-backend.js`](../lib/cloud-backend.js) is `false`, and §3 is why. Two
things still stand between here and flipping it: the reader has to reach the field
(§3 step 2), and the warm pull does not exist (§7).

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
3. ~~**Build the server**, including the gate in §4~~ — done and deployed
   (KhaytApp/khayt-cloud#16). Without the gate step 4 would be unsafe no matter
   how long step 2 waits, which is why it shipped in the same change.
4. **Flip `DELTA_WRITES`** — still blocked on step 2, on §7, and on §8.

Step 2 is now the long pole. The gate cannot open for a shop until every device
that reads its store has announced itself, and only builds carrying
KhaytApp/Khayt#697 do that — so adoption is what decides when any shop becomes
eligible, exactly as intended.

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
| `POST /deltas` + chain storage | khayt-cloud (PHP **and** Node) | **done** — KhaytApp/khayt-cloud#16 |
| `?since=` on `GET /store` | khayt-cloud | **done** — same PR |
| Per-device capability + per-shop gate | khayt-cloud | **done** — same PR |
| Announce `X-Delta-Capable` | desktop | **done** |
| Fold a branch's chain in the org roll-up | desktop | **done** |
| Compaction policy (when to force a full push) | desktop | **done** — §6 |
| Ask for `?since=` on pull | desktop | **not started** — see §7 |
| Fold a chain in the remote-mobile PWA | khayt-cloud `mobile/` | **not started** — see §8 |
| Flip `DELTA_WRITES` | desktop | blocked on adoption + §7 |

The claim that what remained was "entirely server-side" was **wrong on one point**,
and §7 is that point. Everything else server-side is built and merged-pending.

## 7. The pull half is not free, and it is still open

`?since=` exists on the server. **The desktop never sends it**, and it cannot
usefully start: `pull()` in [`lib/cloud-backend.js`](../lib/cloud-backend.js)
unconditionally decrypts `ciphertext`, and a warm reply deliberately does not
carry a base. Folding onto what the caller already holds is the whole point, and
that needs somewhere to fold *onto*.

The obvious target — the local store — is the wrong one, and quietly so. Records
arrive by reference (`applyDeltas` does `arr[i] = incoming`), and the local store
carries edits the server has never seen; folding onto it and then calling
`markAllPushed` would mark those local-only records as already sent, so they would
never ship. That is a data-loss bug wearing the costume of an optimisation.

What it actually needs is a **retained server-view snapshot** — the store as of
`lastServerRev`, held apart from local state and cloned on the way in and out.

And the case the cost model cares about is the *launch* pull, which this still
would not fix: `cloudBackend` is rebuilt on every unlock, so `lastServerRev`
starts at 0 and the first pull of a session is always cold. Making launch warm
means **persisting** the server view and its rev across restarts, which is a
feature, not a flag.

Until then the shape of the bill is: pushes drop by the full factor, and a cold
pull costs up to `1 + R` (3× at R = 2) of a blob pull. Pulls are rare — one per
launch, plus the occasional 409 — so the trade is still strongly positive, but it
is not the number in §1 and should not be quoted as one.

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

---

## 8. The mobile PWA is a blob-only client, and the gate is right to say so

`mobile/app.js` in khayt-cloud pulls `{ ciphertext, rev }` and pushes a whole
store. It has no merge engine, so it cannot fold a chain — and if it pushed a full
store over one it would flatten it, which is the §3 hazard exactly.

The gate therefore does the correct thing and holds any shop that uses `/m` to
blob sync forever. **That is not a bug to route around; it is the design working.**
But it has a consequence worth stating before anyone plans the flip:

> A shop whose owner uses the remote-mobile PWA will never get deltas, no matter
> how long adoption runs.

So §3 step 2 is not purely a waiting game. Adoption gets every *desktop* onto a
build that announces itself; it does nothing for `/m`, because there is no version
of `/m` that can fold a chain yet. Whatever share of shops use it is a share the
saving does not reach.

Making it capable means giving the PWA a merge engine. `renderer/sync.js` is pure
logic with no DOM — `lib/lan-server.js` already reaches across for
`calculator-cost.js`, and `lib/cloud-client.js` loads the same file into the main
process for exactly this reason — so the shape is known. It is still a real piece
of work in a client that handles end-to-end-encrypted data, and it cannot be
exercised end-to-end until `DELTA_WRITES` is on, which is why it is written down
here rather than half-built.
