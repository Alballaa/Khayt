# Khayt 3.0 — Platform roadmap

**Status:** Planning. This is the design north-star for the 3.0 major update; phases land incrementally across 3.x.

> **Vision:** *Run your shop from anywhere, with an assistant* — without ever being forced into the cloud.

3.0 is a change in **kind**, not amount. Khayt is already a deep *local* shop manager; 3.0 takes it from "one computer" to a **cloud-optional platform** with four pillars: **Cloud sync**, **remote mobile**, **AI assist**, and an **internet customer portal**.

---

## 0. The non-negotiable principle — cloud is optional

**The desktop app must remain 100% functional with zero cloud account, zero internet, forever.** This is a hard constraint, not a preference. It shapes every design decision below:

- **Local `store.json` stays the source of truth** — exactly as today. Cloud is a *sync peer*, never the authority.
- **Every cloud feature is opt-in** behind a Settings toggle (the same pattern as the existing LAN API toggle). Off by default.
- **Graceful degradation everywhere** — no key / no connection / no account → the feature hides or disables; the app never blocks.
- **No telemetry or silent upload.** Connecting to Khayt Cloud is an explicit, visible action.
- Privacy positioning evolves from *"data never leaves your machine"* → *"data leaves only when you say so, end-to-end encrypted."*

This principle is also a gift to engineering: it lets us build the **sync foundation entirely locally first** (Phase 0) with no backend, no auth, no ops.

---

## 1. The four pillars

| Pillar | What | Cloud-required? |
|--------|------|-----------------|
| **Cloud sync** | Opt-in offline-first sync of the local store to Khayt Cloud | The backbone (opt-in) |
| **Remote mobile** | iOS companion works over the internet, not just LAN | Yes (rides on sync) |
| **AI assist** | Quote-from-description, AR/EN message drafting, NL analytics | **No** — BYO API key, works fully offline-of-cloud |
| **Customer portal** | Customers track orders / approve quotes / pay from a link | Yes (inherently online) |

AI assist is deliberately **cloud-independent** so it can ship first and prove value without any platform investment.

---

## 2. Architecture — offline-first, cloud-as-peer

```
        ┌─────────────────────────────────────────┐
        │  Desktop (Electron) — SOURCE OF TRUTH     │
        │  store.json  ◀─────────  app (unchanged)  │
        │       ▲                                    │
        │       │  Sync Engine (opt-in)              │
        └───────┼────────────────────────────────────┘
                │  encrypted deltas, only when enabled
                ▼
        ┌─────────────────────────────────────────┐
        │  Khayt Cloud (optional)                   │
        │  HTTPS API · Postgres · multi-tenant      │
        │  orgId / shopId · JWT scoped per shop     │
        └───────┬───────────────────────┬───────────┘
                ▼                        ▼
          iOS companion          Customer portal (web)
          (over internet)        (track / approve / pay)
```

- **Sync Engine** is a desktop module with a pluggable backend. Backend `local` = no-op (today's behavior). Backend `cloud` = push/pull. Same interface either way, so the app is sync-shaped even when cloud is off.
- Confirmed direction from `MULTI-SHOP-CLOUD.md`: **Option A** (cloud hub + offline-first desktop sync). This doc supersedes its phasing; that doc keeps the deeper multi-shop tenancy detail.

---

## 3. Data-model foundation (Phase 0 — all local, no cloud)

The prerequisite for *any* sync, built and shipped with **no backend**:

- **Per-record change metadata** — add `updatedAt` (and a monotonic `rev`) to every store entity (orders, clients, inventory, …). Most already have `date`/`timestamp`; standardize.
- **Change log / tombstones** — track deletes so sync can propagate them (don't resurrect deleted records).
- **Delta export/import format** — "changes since cursor X" — useful immediately for faster backups and as the sync wire format.
- **Sync Engine abstraction** with the `local` no-op backend wired into the existing save path.
- **Conflict policy table** (per entity): last-write-wins for notes/free-text; field-merge for inventory deltas; orders are append-mostly (never silently deleted).

Ships in a 2.x point release as "internal plumbing + better backups." Zero user-visible cloud. De-risks everything after.

---

## 4. Phasing

Tenancy grows **1 → 2 → 3** per your call (single shop first).

### Phase 0 — Sync foundation (local only)
Data-model changes above. No cloud. **Cloud-independent by construction.**

### Phase 1 — Identity + single-shop cloud  *(tenancy 1)*
- Khayt Cloud API: sign up / sign in (email + magic link), one org = one shop.
- Desktop **"Connect to Khayt Cloud"** toggle in Settings (opt-in, encrypted credentials).
- Sync the store (start coarse: encrypted full-store blob with `rev` guard; refine to deltas).
- **Deliverable for the user:** their shop's data is securely backed up + reachable — the basis for mobile and portal.

### Phase 2 — Remote mobile + customer portal
- iOS companion gains a **"Cloud" connection mode** alongside LAN — same app, reaches the shop from anywhere.
- Customer portal web app: order tracking, quote approval, online payment (extends today's LAN quote-approval tokens to internet URLs).

### Phase 3 — Multiple branches, one owner  *(tenancy 2)*
- Org with several shops; shared clients/inventory pool; **HQ read-only dashboard** (revenue, queue, low-stock across shops).
- Per-shop `shopId` tagging on synced records.

### Phase 4 — Separate shops / franchise  *(tenancy 3)*
- Hard tenant isolation, per-tenant billing, franchisor HQ with audit log on cross-shop reads.

---

## 5. AI assist track (parallel, cloud-independent)

Ships independently of Cloud. **BYO Anthropic API key** in Settings (encrypted like other secrets); no key → features hidden, app unaffected.

1. **Quote from a description/photo** *(flagship)* — natural-language or image request → AI proposes material, print time, and price by driving the **existing calculator**. Owner reviews/edits before sending.
2. **Customer message drafting (AR/EN)** — quote / follow-up / ready-for-pickup messages in the shop's voice. Plugs into the existing quote-follow-up automation.
3. **Natural-language analytics** — "how did June compare to May, and why?" over already-computed metrics.
4. **Smart reorder & demand forecast** — from order history + spool burn-down.

Model default: latest Claude (e.g. Opus/Sonnet 4.x). Cost model: **BYO-key first** (zero liability/cost to Khayt); a Khayt-billed option can come later with Cloud.

---

## 6. Security & KSA compliance

- TLS everywhere; **tenant isolation** — `orgId` on every query, JWT scoped to `shopId`.
- **End-to-end encryption** of synced payloads where feasible (preserves the privacy promise; complicates server-side HQ aggregation — design per-field).
- **KSA-region hosting** option for ZATCA customers (e.g. AWS Bahrain / a KSA region); clarify data residency before onboarding ZATCA users.
- Encrypted secrets at rest on desktop (reuse the existing secret-masking pattern).
- Audit log for cross-shop (HQ) reads.

---

## 7. Business model (because Cloud is a *service*, not just code)

Cloud introduces ongoing hosting, auth, billing, support, and region-hosting cost. Honest framing:

- **Free, forever:** the full local desktop app + LAN + BYO-key AI. The product stands alone.
- **Paid (Khayt Cloud):** sync, remote mobile, customer portal, multi-shop HQ — recurring subscription, likely per-shop.
- This keeps the open, offline product intact while funding the platform.

---

## 8. Open decisions (revisit as we build)

1. **Sync granularity v1** — full-store encrypted blob (simple, safe) vs entity-level deltas (scalable). *Lean: blob first, deltas in 3.x.*
2. **E2E vs server-readable** — full E2E maximizes privacy but blocks server-side HQ aggregation. *Likely hybrid: E2E for sensitive fields, server-readable aggregates for HQ.*
3. **AI hosting** — BYO-key only (start) vs Khayt-proxied billing (later).
4. **Hosting/region & provider** — and whether to offer self-hosted Cloud for enterprises.
5. **Portal payments** — reuse existing Stripe/Tabby/Tamara rails over the internet.

---

## 9. Immediate next step

**Phase 0 — the sync foundation — is the right first move:** it's cloud-independent, ships value now (better backups, change tracking), and de-risks the entire platform. Recommended start:

1. Audit store entities for existing `updatedAt`/`timestamp` coverage; design the uniform change-metadata + tombstone scheme.
2. Spec the delta format and the Sync Engine interface (with the `local` no-op backend).
3. Land it behind the existing save path with tests — no user-visible cloud yet.

After Phase 0 proves out, stand up Khayt Cloud Phase 1 (identity + single-shop sync).
