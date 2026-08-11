# What one shop actually costs to host

Measured 2026-08-11, to replace [CLOUD-INFRA-SPEC §10](./KHAYT-3.0-CLOUD-INFRA-SPEC.md),
whose cost envelope prices a Node + Postgres + Redis stack that production does
not run. Production is PHP 8.3 + MySQL on shared hosting.

Re-run it yourself — the model is a script, not a table:

```bash
node scripts/cloud-cost-model.mjs --plan-price 25 --bandwidth-gb 500 --storage-gb 100
```

**The finding, before the numbers: bandwidth is the binding resource, and it is
the one thing not metered.** `limits.maxStoreBytes` — the limit already built
into `/v1/billing/me` and already displayed by the desktop — meters storage,
which by measurement will never be what runs out. On a 100 GB / 500 GB plan,
storage holds about **9,890** busy shops; bandwidth holds **8**.

---

## 1. What was measured, and what was assumed

Measured from a real store:

| | bytes |
|---|---|
| per order (`printLog`) | **1,557** |
| per print file | 658 |
| per inventory item | 111 |
| settings (fixed) | 4,877 |

Measured from the protocol (`lib/cloud-backend.js`):

- **Blob-first.** `push()` encrypts and sends the **whole store**, every time. So
  bandwidth is store size × how often a shop saves, not the size of the change.
- **No compression**, and the ciphertext is base64 inside a JSON body: 55,593 B
  of store went out as **74,124 B** on the wire. Gzipped first it would have been
  **7,556 B**.

Measured in the running app: **one save per user action.** Logging an order,
moving a kanban card, and receiving stock each produce exactly one `saveAll()`,
so "saves per day" is simply meaningful actions per day rather than a mystery
multiplier. That was the model's one soft input, and it is now grounded.

---

## 2. Per shop, per month

| profile | orders held | store | per push | bandwidth/mo | if gzipped |
|---|---|---|---|---|---|
| Hobbyist | 120 | 213 KB | 284 KB | 42.6 MB | 5.8 MB |
| Side shop | 960 | 1.7 MB | 2.2 MB | 1.99 GB | 271 MB |
| Busy shop | 6,000 | 10.1 MB | 13.5 MB | **60.7 GB** | 8.3 GB |
| Small farm | 19,200 | 32.4 MB | 43.2 MB | **518 GB** | 70.5 GB |

Two things to sit with:

**A single "small farm" shop exceeds a 500 GB plan on its own.** Not a hundred of
them — one.

**The spread between the lightest and heaviest shop is about 12,000×.** They pay
the same subscription.

---

## 3. Why storage is a red herring

On a 100 GB storage / 500 GB bandwidth plan:

| profile | fits by bandwidth | fits by storage | binding |
|---|---|---|---|
| Hobbyist | 11,726 | 469,071 | bandwidth |
| Side shop | 251 | 60,269 | bandwidth |
| Busy shop | 8 | 9,890 | bandwidth |
| Small farm | 0 | 3,087 | bandwidth |

Bandwidth binds in every profile, by three to four orders of magnitude. **The
meter that exists measures the resource that does not run out**, which means the
plan limit a shop sees today (`up to N MB`) is not the limit that will actually
stop them.

---

## 4. The number is dominated by an implementation choice, not by shops

Because sync is blob-first and uncompressed, a shop's bandwidth is
`store size × edits`. Both grow over time, so **cost per shop grows quadratically
with age** — a three-year-old shop pays for three years of history on every card
it drags.

Two changes break that, and both are cheap:

| change | effect | measured |
|---|---|---|
| **gzip before encrypting** | ~7× less bandwidth | 60.7 GB → 8.3 GB for a busy shop |
| **entity-level deltas on push** | bandwidth stops scaling with store size at all | — |

The second one is closer than it looks: `KhaytSync.applyDeltas` already merges on
the **pull** side ([renderer/cloud-sync.js:148](../renderer/cloud-sync.js)) and
`test/phase3-delta-roundtrip.test.js` proves two stores converge byte-identically
through it. Only the push is blob-only.

---

## 5. What this means for pricing

**A per-shop price cannot be set responsibly until at least gzip ships.** Today
the same subscription buys 42 MB/month from one shop and 518 GB from another, and
the heavy end alone exceeds a whole plan. Any flat price is therefore either
priced for the hobbyist and bankrupted by the farm, or priced for the farm and
uncompetitive for everyone else.

This is not an argument for usage pricing. It is an argument that **the
engineering fix comes first**: compression plus deltas collapse the 12,000×
spread toward something a flat per-shop price can absorb, and they cost far less
than the revenue they protect.

Concretely, in order:

1. **gzip the store before encrypting.** One-line-ish, measured 7×, no protocol
   change and no server change. Do this before quoting anyone a price.
2. **Entity deltas on push.** Removes the size × frequency coupling, and is the
   same work Phase 3 needs anyway.
3. **Then meter bandwidth, not bytes stored** — or having done 1 and 2, stop
   metering and set one flat price, which is a much better product.
4. **Then** put a number on the tiers in
   [KHAYT-CLOUD-FEATURES-AND-PRICING.md](./KHAYT-CLOUD-FEATURES-AND-PRICING.md).

---

## 6. What is still an input

The plan's price and caps are parameters, not findings — the defaults in the
script (25 USD, 500 GB, 100 GB) are placeholders chosen to make the arithmetic
legible. Supply the real Hostinger figures and every table above recomputes:

```bash
node scripts/cloud-cost-model.mjs --plan-price <real> --bandwidth-gb <real> --storage-gb <real>
```

Also unmeasured, and worth checking before launch: whether shared hosting caps
**entry processes or concurrent requests** tightly enough to bind before
bandwidth does. That is a plan-specific limit and cannot be derived from the
desktop code.
