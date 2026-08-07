# Khayt Cloud — what is actually built

The five phase specs describe what the cloud *should* do. None of them records
what it *does*, so "what is left" has been guesswork. This is the reconciliation:
every claim below was checked against code or a passing test on 2026-07-27, and
the evidence is named so the next person can re-check rather than trust it.

**Verify this file rather than believe it.** Where it says a thing is covered, a
named test covers it; where it says something is not built, the grep that found
nothing is stated too.

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Sync foundation (local change-tracking, deltas) | **Done** |
| 1 | Identity + single-shop E2E sync | **Done** |
| 2 | Remote mobile + customer portal | **Done**, beyond spec |
| 3 | Multi-shop tenancy | **Not started** |
| 4 | Franchise / separate shops | Not started (outline only) |

---

## Phase 0 — sync foundation

Definition of done, item by item:

| Requirement | Evidence |
|---|---|
| Saves stamp `rev`/`updatedAt` | `test/cloud-sync.test.js` |
| Deletes write tombstones | `test/cloud-sync.test.js` |
| `KhaytSync` interface + `LocalBackend`, no cloud code | `test/sync-foundation.test.js` |
| Cloud-off users see zero behaviour change | golden-snapshot test in `test/sync-foundation.test.js` |

42 tests across `test/sync*.test.js`, all passing.

## Phase 1 — identity + single-shop sync

| Requirement | Evidence |
|---|---|
| Tenant isolation: shop A's token cannot read shop B | `contract.test.js` — "tenant isolation" |
| Round-trip: push → pull → decrypt matches | `contract.test.js` — "full contract" |
| Server payload is opaque ciphertext | `contract.test.js`, asserted by construction |
| 409 stale push → pull-merge-retry | `contract.test.js` — rev-guard |
| Auth: verify, rotation, revoked device rejected | `contract.test.js` — "removal revokes the token immediately" |
| Disconnect leaves the local store byte-identical | desktop `test/cloud-sync.test.js` |
| Offline edits → one reconciling push | desktop `test/cloud-sync.test.js` |

Live at `cloud.khaytapp.com`. Since 2026-07-27 the contract suite runs against
the **PHP** backend in CI as well as Node — before that only Node, which is not
deployed, was ever tested.

## Phase 2 — remote mobile + customer portal

Built, and past what the spec asked for:

| Feature | Where |
|---|---|
| iOS companion over the internet | `mobile/` PWA, served at `/m` |
| Customer portal (track / approve / pay) | `/v1/portal/*`, `/v1/p/{token}` |
| Per-order public projection (consented) | `/v1/p/{token}` — only the projection is public; the bulk store stays E2E |
| Web push notifications | `/v1/push/*` + VAPID |
| Portal messaging (shop ↔ customer) | customer: `/v1/p/{token}/messages` · shop: `/v1/shops/{id}/published/{token}/messages` (read) and `/message` (reply) — the owner side is authenticated, so the customer route can be gated on their portal session |
| Storefront + catalog feed + order import | `/v1/shops/{id}/catalog`, `/feed/{platform}`, `/import/{platform}` |
| Reviews | `/v1/shops/{id}/reviews` |
| Snapshot history + restore | `/v1/shops/{id}/snapshots` |
| Billing plans + storage caps | `/v1/billing/*`, `/v1/admin/set-plan` |

## Phase 3 — multi-shop tenancy: **not started**

A design that reconciles the spec with the code, and states the choices it needs,
is in [PHASE3-DESIGN](./KHAYT-3.0-PHASE3-DESIGN.md). Its headline: the entity-level
delta engine Phase 3 needs already exists and is tested — `lib/cloud-backend.js`
just ignores it and pushes the whole store as one blob.

The spec's four pillars, and what searching for them finds:

| Pillar | Status |
|---|---|
| Org → many shops (`org_id` on every row) | **Not built** — no `org_id` anywhere in the schema; the 19 tables key on `shop_id` |
| HQ aggregate dashboard | **Not built** — the only `aggregate` in the code is review scoring and storefront analytics |
| Shared inventory with concurrent-draw merge | **Not built** |
| Entity-level deltas (vs one blob per shop) | **Not built** — sync is still blob-first, one ciphertext per shop |

What *does* exist and is easy to mistake for it: **team accounts** — several
people inside ONE shop (`/v1/shops/{id}/members`, invite / list / remove, with
roles). That is multi-USER, not multi-SHOP. Phase 3 is about one owner running
several branches.

Phase 3 is also the phase that breaks the current storage model: blob-first
single-writer sync cannot express two branches editing different records
concurrently, which is why the spec calls conflict resolution "the deferred hard
part". Starting it means changing the sync protocol, not adding endpoints.

---

## Where the specs are now wrong

- **The infra spec prescribes Node/Fastify + PostgreSQL + Redis.** Production is
  **PHP 8.3 + MySQL on shared hosting (Hostinger/LiteSpeed)**, with the Node
  implementation kept as a VPS option. The pragmatic choice looks right — PHP
  runs per request, so there is no process to keep alive — but the spec now
  misleads anyone reading it as a description of the system.

- **Phase 1 §7 says "Postgres, every row carries `org_id`".** Neither is true:
  MySQL, and no `org_id` until Phase 3.

## Decisions that were open, and how they closed (2026-07-28)

- **Registration is open — deliberately now.** It used to be open by *omission*:
  the gate read "allowed unless `register_secret` happens to be set", so a config
  that never mentioned registration handed a shop and a token to anyone who
  asked. It now refuses unless the operator has chosen — a secret to require, or
  `open_registration => true` to invite anyone. Production is set to open, which
  is the same behaviour as before but for the opposite reason.

- **A shop can be deleted.** `DELETE /v1/admin/shops/{shopId}`, admin-gated,
  removes the 13 shop-keyed tables plus the owner's reset and verify tokens. It
  deliberately leaves customer portal sessions (keyed on the customer's email
  with no shop link — deleting would sign them out of a shop that still exists)
  and IP rate events (clearing them would hand a spammer a fresh allowance).
