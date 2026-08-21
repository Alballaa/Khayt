# The adoption endpoint — the contract khayt-cloud has to implement

Two safety gates are built, deployed and **dormant**: the portal read gate
(khayt-cloud#14) and the per-shop delta gate (khayt-cloud#16). Both were waiting
on the 3.6 line reaching stable; it did, on 2026-08-21. Both now wait on
**adoption** — enough field devices actually running the build that carries the
new behaviour.

**Nothing measures that.** The server holds the state that decides eligibility
and nothing surfaces it, so "has adoption happened" is answered by guessing. That
is the only thing standing between here and two flips, one of which closes a
security exposure that is currently *closable* rather than closed.

This document specifies the endpoint that answers it. It is written in the Khayt
repo on purpose: the desktop is what the gates act on, so the desktop is where
the contract can be stated and pinned. Implementation belongs to a khayt-cloud
session. See [KHAYT-CLOUD-DELTA-SYNC.md](./KHAYT-CLOUD-DELTA-SYNC.md) for the
same split on the sync protocol, which worked.

---

## 1. The two gates do not share a signal

The instinct is that "adoption" is one number — what fraction of the field runs
3.6.x. It is not, and a version census would answer neither question well.

| | Delta gate | Portal read gate |
|---|---|---|
| Eligibility is | per **shop**: every device on it must be delta-capable | per **shop**: no owner desktop still reads the legacy route |
| The server already knows | **yes** — the per-device capability column and the per-shop derived flag shipped in khayt-cloud#16 | **no** — nothing records who reads the legacy route |
| So the work is | *exposure* of state that exists | *recording*, then exposure |
| Measured from | `X-Delta-Capable: 1`, announced per credential | traffic on `GET /v1/p/{token}/messages` |

The delta half is nearly free. The portal half needs one new counter — and it can
be measured **exactly** rather than estimated, because the gate is already
deployed and switched off. Evaluate the gate's predicate on every request and
count what it *would* have refused, instead of refusing. Shadow mode turns the
guess into a measurement at zero risk to anyone.

## 2. The route

```
GET /v1/admin/adoption?staleDays=45&limit=50
```

Authenticate it **exactly as `/v1/admin/stats` already does** — do not invent a
second admin scheme. On build `b7424d4e71e5` that route answers `403` without
credentials, and `/v1/admin/adoption` answers `404`, so the name is free:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://cloud.khaytapp.com/v1/admin/adoption   # 404 today, 403 once it exists
```

That 404 → 403 flip is how you verify the deploy, the same way the delta doc
verifies `POST /deltas` by its 401. Both backends must implement it — PHP and
Node — or `test/route-parity.test.js` will say so.

**Parameters**

| Name | Default | Meaning |
|---|---|---|
| `staleDays` | `45` | A device not seen for this long is reported as **stale** and counted separately. It does not change eligibility — see §4. |
| `limit` | `50` (max `500`) | Cap on each per-shop list. Set `truncated` when it bites. |

## 3. The response

```json
{
  "generatedAt": "2026-08-21T12:34:56Z",
  "build": "b7424d4e71e5",
  "staleDays": 45,
  "deltaWrites": {
    "shops":   { "total": 128, "eligible": 91, "blocked": 37, "blockedOnlyByStale": 12 },
    "devices": { "total": 216, "capable": 180, "unknown": 36, "unknownStale": 14 },
    "blocked": [
      { "shopId": "shp_7f3a", "devices": 3, "unknown": 1, "unknownStale": 0,
        "oldestUnknownSeenAt": "2026-08-19T08:02:11Z" }
    ],
    "truncated": false
  },
  "portalReadGate": {
    "enabled": false,
    "windowDays": 30,
    "wouldRefuse": {
      "requests": 402,
      "shops": 6,
      "lastAt": "2026-08-20T19:41:03Z",
      "byCaller": { "desktopBearer": 397, "expiredSession": 4, "anonymous": 1 }
    },
    "byShop": [ { "shopId": "shp_7f3a", "requests": 311, "lastAt": "2026-08-20T19:41:03Z" } ],
    "truncated": false
  }
}
```

`byCaller` is what makes the portal number actionable, and it is cheap to record.
An un-upgraded desktop reads the legacy route carrying **its shop bearer token**
and no portal session — `lib/cloud-client.js` attaches the bearer to every
request it makes. So:

- **`desktopBearer`** — a bearer token, no portal session. Almost certainly a
  desktop that has not been updated. This is the number the flip waits on.
- **`expiredSession`** — a portal session was presented and was invalid or
  lapsed. A real customer, and gating them is the *intended* behaviour.
- **`anonymous`** — neither. A stale link, a crawler, or someone probing.

Counting these together would keep the total permanently above zero and the gate
would never look safe to flip. That is the failure mode this split exists to
prevent.

## 4. Three semantics that decide whether the numbers can be trusted

**Eligibility must call the gate's own predicate.** Do not re-derive "is this
shop eligible" in the reporting query. The moment there are two implementations
they drift, and the one the operator reads is not the one that decides. Pin it
with a test: a shop this endpoint reports `eligible` must actually be served a
delta chain, and a `blocked` one must actually be refused.

**Unknown fails closed, here as everywhere.** A device that has never announced
capability counts as blob-only. §4 of the delta doc is explicit about why —
"unknown must not mean permitted, or the first shop to sync from an un-upgraded
laptop is the one that loses data" — and a report that quietly counted unknown as
capable would make the field look ready when it is not.

**Stale is a lever, not a default.** `blockedOnlyByStale` is the count of shops
that would become eligible if devices dormant beyond `staleDays` were counted
out. Report it; never apply it. A laptop that has been shut in a drawer for two
months is still a laptop that can be opened, sync, and flatten a chain. The
decision to write those shops off is a human one, taken with the number in front
of them — which is exactly what "or on those shops being counted out" in the
portal gate's notes was always pointing at.

## 5. The refusal status is load-bearing, and the contract never named it

The delta doc says the server "must refuse `POST /deltas` for a shop that still
has a device capable only of blob reads." It does not say **with what status**,
and that omission decides how much adoption is needed before `DELTA_WRITES` can
be flipped at all.

`lib/cloud-backend.js` treats **only 404 and 405** as "this server cannot take
deltas" and falls back to a whole-store push. Every other status throws.

Both branches are now pinned in
[`test/cloud-delta-push.test.js`](../test/cloud-delta-push.test.js):

- *a gated shop falls back to the blob, as long as the refusal is a 404* — the
  shop simply pays blob prices, round-trips correctly, and other shops keep
  getting chains.
- *a gated shop whose refusal is a 403 errors instead* — every save fails, and
  the backend goes to `error`. Loud, not lossy: the cursor does not advance, so
  the edit is still in the next payload. A rollout hazard, not a data hazard.

**Checked 2026-08-21, and the answer is the good one: it refuses with 404.**
Identical in both backends, with the same sentence —
`send(404, ['error' => 'This shop has a device that cannot read deltas'])` in
`index.php`, `send(res, 404, {...})` in `src/server.js`. khayt-cloud#16's README
says why in as many words: 404 is "the documented *this server takes no deltas*
answer, so the desktop's existing fallback sends whole stores for the rest of the
session with no new client code and no version negotiation."

**Therefore `DELTA_WRITES` does not need full adoption.** A gated shop quietly
keeps blob-syncing; adoption decides only how much of the saving is realised.
The endpoint's `deltaWrites` section is a *savings* report, not a safety gate —
which is a different and much less urgent thing than it looked before checking.

### The second refusal, which the desktop contract never mentioned either

There is a backstop the other way round. `PUT /store` from a device that has
**not** announced capability, while a chain exists, is refused with **412** and
the sentence *"This shop has unsynced changes this build cannot read. Update
Khayt to sync again."* That is deliberate: it is the loud failure that replaces
THE HAZARD's silent data loss.

The desktop already handles it well, by accident of a different fix —
`httpFailure` in `lib/cloud-backend.js` leads with the server's sentence rather
than the status code (the #698 fix for "a failed sync said Sync error and nothing
else"), and `test/cloud-backend.test.js` pins exactly this 412. So the owner is
told to update Khayt, which is the one action that resolves it.

It is also hard to reach. `shopTakesDeltas()` fails closed on more than the
obvious case: a device known to be blob-only, *and* a live token nobody has been
observed using, *and* org siblings, since HQ reads a branch's store through
`/org/branches/{id}/store`. So a chain cannot normally form while any un-upgraded
device could still show up. The 412 covers what is left — a token minted after
the chain formed — and self-clears, because that device has now reported itself
blob-only and the next full push from a modern device compacts the chain away.

## 6. What never appears in the response

- **No portal tokens**, hashed or otherwise. A portal token is a capability — the
  entire point of the gate is that holding one should not be enough. Putting them
  in an admin response would recreate the exposure at a different address. Shop
  ids and counts answer the question; if a distinct-link count ever proves
  necessary, HMAC it with a server-side secret and store only the digest.
- **No customer identifiers** — no emails, no names, no order references.
- **Nothing from the store itself.** It is end-to-end encrypted and the server
  cannot read it; this endpoint reports metadata about devices and requests only.

Record the portal counter as an aggregate row per `(shop, day, caller-kind)`,
not a row per request — it sits on a request path, and a write per read is how a
counter becomes an outage. Prune beyond `windowDays`.

## 7. When to flip, once the numbers exist

**`DELTA_WRITES`** — **flipped 2026-08-21**, on the §5 reasoning: the gate
refuses with 404, so a blocked shop is not harmed by the flip, just not helped by
it yet. `deltaWrites.shops.blocked` therefore reports how much saving is still
unrealised, not whether anything is safe. It takes effect in the next release.

**The portal read gate** — flip when `wouldRefuse.byCaller.desktopBearer` has
been `0` for a **full `windowDays`**, not merely at the instant of reading. A
shop that opens its Messages tab once a month is exactly the shop this protects.
`lastAt` older than the window is the signal to look for. The flip stays
reversible; `config.php` `portal_read_gate` back to `false` undoes it.

Neither flip should be automated off this endpoint. It reports; a person decides.

### Until the endpoint exists, there is a crude proxy — use it rather than guessing

GitHub counts asset downloads per release, and auto-update goes through those
same assets. The manifest every stable desktop polls to discover an update is
`latest.yml` **on whichever release is currently latest**, so its count is a live
read on whether the field has even noticed a release:

```bash
gh api repos/KhaytApp/Khayt/releases/tags/vX.Y.Z \
  --jq '.assets[] | select(.name|test("yml$")) | "\(.download_count)\t\(.name)"'
gh api repos/KhaytApp/Khayt/releases/tags/vX.Y.Z --jq '[.assets[].download_count] | add'
```

It undercounts (mirrors, re-installs, a shop that never opens the app) and it
cannot tell you *which* shop updated, which is the whole reason the endpoint is
worth building. But it is decisive in the direction that matters: **zero means
zero**, and a flip against zero is a flip against the entire field.

Worked example, 2026-08-21 — the day v3.6.0 shipped. Three hours after
publication every v3.6.0 asset stood at **0**, including `latest.yml`, while
v3.5.3's `latest.yml` had taken 38 fetches over its 20 days as latest and rc.4's
had taken 6. The counter works; nobody had picked the release up yet. The portal
gate flip was **held** on that basis rather than on a feeling about how long a
day is. Re-run it before proposing the flip again.

---

**Status:** specified here, not yet implemented. `DELTA_WRITES` was flipped on
2026-08-21 without it, which §5 explains; the **portal gate** is what still needs
it, and that gate is the one holding a security exposure open.
