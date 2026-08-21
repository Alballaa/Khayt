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

**So the gate must refuse with 404 or 405.** If it does, `DELTA_WRITES` can be
flipped at partial adoption — un-eligible shops quietly keep blob-syncing and
adoption then decides only how much of the saving is realised, not whether the
flip is safe. If it refuses any other way, the flip has to wait for
`shops.blocked` to reach zero.

**Check which one khayt-cloud#16 actually shipped before flipping anything.**
That is one grep in the server and it changes the whole rollout plan.

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

**`DELTA_WRITES`** — flip when `deltaWrites.shops.blocked` is `0`, or when §5
confirms the gate refuses with 404/405, in which case flip whenever the saving is
worth having. Blocked shops are not harmed by the flip in that case; they are
just not helped by it yet.

**The portal read gate** — flip when `wouldRefuse.byCaller.desktopBearer` has
been `0` for a **full `windowDays`**, not merely at the instant of reading. A
shop that opens its Messages tab once a month is exactly the shop this protects.
`lastAt` older than the window is the signal to look for. The flip stays
reversible; `config.php` `portal_read_gate` back to `false` undoes it.

Neither flip should be automated off this endpoint. It reports; a person decides.

---

**Status:** specified here, not yet implemented. The desktop side needs nothing
further for either flip — this is the last piece, and it is entirely server-side.
