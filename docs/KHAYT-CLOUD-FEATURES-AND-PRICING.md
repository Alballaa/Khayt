# Khayt Cloud — what exists, what to add, and what can actually be charged for

Research pass, 2026-08-11. Every "exists" claim below was checked against code or
a live endpoint, and the evidence is named so it can be re-checked rather than
trusted. It extends [§7 of the roadmap](./KHAYT-3.0-ROADMAP.md#7-business-model-because-cloud-is-a-service-not-just-code),
which sketched the business model and left one item explicitly open:

> **Still genuinely open (need the user, later)** — Subscription pricing per shop
> — *before Phase 1 launch*.

**Phase 1 launched.** [CLOUD-STATUS](./KHAYT-3.0-CLOUD-STATUS.md) records it as
done, and `cloud.khaytapp.com` is serving build `d9ffd8be69ad`. So that decision
is not upcoming, it is overdue.

**The headline finding: billing is already half-built, and nobody has to design
the metering from scratch.** The second finding is the harder one — end-to-end
encryption removes most of the dimensions a SaaS would normally price on, and
that constraint is not negotiable without giving up the privacy promise.

---

## 1. What is already built

### Billing — scaffolded, dormant

`GET /v1/billing/me` already returns a plan for a shop:

```js
// lib/cloud-client.js:501
/** GET /v1/billing/me → the shop's plan + limits (or { billingEnabled:false }). */
```

The desktop already **reads and renders it** — `showCloudPlan()` in
[renderer/settings.js:1660](../renderer/settings.js) paints
`Plan: <label> · up to <N> MB` into the cloud card, greys it when `active` is
false, and stays silent when `billingEnabled` is false. Which it currently is:
the endpoint answers `401` without a token, and no shop sees a plan today.

So the shape already committed to, in code, is:

| field | meaning |
|---|---|
| `plan` / `label` | tier id and its display name |
| `active` | subscription in good standing |
| `limits.maxStoreBytes` | **the metered dimension that already exists** |

That last row matters more than it looks: storage-in-bytes is already the unit
the server tracks and the desktop displays. A storage-tiered plan needs no new
concept, only a number.

### Shipped and live

Taken from the export list of `lib/cloud-client.js` — the definitive list of what
the desktop can ask the cloud to do.

| Capability | Endpoints / functions |
|---|---|
| **Identity** | `register`, `signup`, `login`, `verifyEmail`, `requestVerify`, `requestReset`, `resetPassword` |
| **E2E encrypted store sync** | `backendFor`, keyset put/get, `unlockWithPassphrase`, `unlockWithRecovery`, `changePassphrase` |
| **Team accounts** (several people, ONE shop) | `inviteMember`, `acceptInvite`, `listMembers`, `removeMember`, with roles |
| **Customer portal** | `publishPortal`, `unpublishPortal`, `listPublished`, `portalMessages`, `portalReply` |
| **Storefront** | `putCatalog`, `getCatalog`, `storefrontStats` (views / carts / orders), `getReviewSummary` |
| **Order intake** | `listIntake`, `deleteIntake` — customers submitting work |
| **Marketplace links** | per-platform import webhook + product feed URLs (Shopify, Etsy, Salla, Zid, WooCommerce…) |
| **Cameras** | `/v1/cameras`, `/v1/cameras/snap` |
| **Organisations** | `getOrg`, `putOrg`, `createOrgInvite`, `joinOrgRemote`, `listOrgMembers`, `getOrgKeysets`, `getBranchStore`, plus org keyset crypto |
| **Billing** | `billingMe` |

### Not built — Phase 3

Per [CLOUD-STATUS](./KHAYT-3.0-CLOUD-STATUS.md), all four pillars of multi-shop
tenancy are unbuilt: no `org_id` in the schema (19 tables key on `shop_id`), no
HQ aggregate dashboard, no shared inventory, and sync is still **blob-first** —
one ciphertext per shop.

The easy mistake here, and the doc calls it out: **team accounts already exist
and look like multi-shop.** They are multi-*user* within one shop. Phase 3 is one
owner running several branches, and it changes the sync protocol rather than
adding endpoints.

**One asset is further along than the status table suggests.** The delta engine
is real, tested, and already used on the *pull* side: `KhaytSync.applyDeltas` is
what merges an incoming payload in
[renderer/cloud-sync.js:148](../renderer/cloud-sync.js), and
`test/phase3-delta-roundtrip.test.js` proves two stores converge byte-identically
through it with no server and no crypto. What is blob-only is the **push**. So
Phase 3's hardest-sounding prerequisite is mostly plumbing, not research.

---

## 2. The constraint that shapes pricing

**Khayt cannot see a shop's business.** The store is end-to-end encrypted, so the
server holds ciphertext and its length. That rules out the pricing models a
vertical SaaS would normally reach for first:

- ❌ **Per order / per job** — the server cannot count orders.
- ❌ **Percentage of revenue** — it cannot see revenue.
- ❌ **Per invoice** — it cannot see invoices.

This is not an implementation gap to close; it is the privacy promise working as
designed. Roadmap decision #2 anticipates a way round it — an *owner-consented
aggregate* pushed alongside the ciphertext for the HQ dashboard — but that is
opt-in by construction, so it can inform a dashboard and can never be a reliable
billing meter.

What the server **can** observe, today, without weakening anything:

| Dimension | Already tracked? |
|---|---|
| Stored bytes per shop | **Yes** — `limits.maxStoreBytes` |
| Team members per shop | **Yes** — `listMembers` |
| Shops / branches per owner | Once Phase 3 lands |
| Portal + storefront traffic | **Yes** — `storefrontStats` |
| Intake submissions | **Yes** — `listIntake` |
| AI proxy tokens | Only if a Khayt-billed proxy is built |

**Everything priceable is a platform dimension, not a business-volume one.** That
is a genuinely good position to be in: a shop's bill does not rise because it had
a good month, which is an easy promise to make and a rare one in this category.

---

## 3. Worth adding

Ordered by leverage, not size. Each names what it builds on.

1. **Off-site encrypted backup.** The desktop now keeps a pre-upgrade snapshot
   locally (#665), which protects against a bad update but not against a lost
   laptop or a failed disk. The store is already encrypted client-side and
   already uploaded; retaining N historical versions server-side is close to
   free and is the single most obvious reason a solo maker would pay. It also
   prices naturally on the dimension that already exists — bytes.
2. **Entity-level push.** Finish what the pull side already does. Cuts sync cost
   and latency for every shop, and unblocks Phase 3.
3. **Phase 3 multi-shop + HQ dashboard.** The clearest step up in willingness to
   pay, and the one that justifies a per-branch price.
4. **Khayt-billed AI.** Roadmap decision #3 defers this until "Cloud billing
   exists". It now half-exists, and BYO-key remains the free path.
5. **Portal payments.** Rails (Stripe/Tabby/Tamara) are already integrated
   locally; taking a deposit through the portal closes the quote→cash loop.
6. **Cloud-side scheduling.** Every automation today is a renderer `setInterval`,
   so it only runs while the app is open. Quote follow-ups and reminders that
   fire with the laptop shut is a real difference, and it needs a server.

---

## 4. Pricing — a proposal to react to

Consistent with §0 of the roadmap: **the desktop stays 100% functional with no
account, no internet, forever.** Nothing below moves an existing local feature
behind a paywall — that would break the principle and the trust that comes with
it.

| | **Free** | **Cloud** | **Branches** |
|---|---|---|---|
| Local app, LAN, BYO-key AI | ✅ everything | ✅ | ✅ |
| Encrypted sync + off-site backup | — | ✅ | ✅ |
| Devices per shop | 1 | several | several |
| Team members | — | small cap | higher cap |
| Customer portal + storefront | — | ✅ | ✅ |
| Multi-branch + HQ dashboard | — | — | ✅ |
| Storage | — | tier 1 | tier 2 |

Three deliberate choices in that table:

- **Free is the whole product, not a trial.** It is what the app is today and it
  keeps working forever with no account. The paid line begins where Khayt starts
  paying for hosting on the shop's behalf.
- **Priced per shop, not per order.** Forced by §2, and worth saying out loud in
  the marketing: the bill does not grow because business was good.
- **Storage is the meter**, because it is the one already built.

**Numbers are deliberately absent.** They depend on hosting cost per shop, which
[CLOUD-INFRA-SPEC](./KHAYT-3.0-CLOUD-INFRA-SPEC.md) prices for a Node/Postgres
stack that production does not use — production is PHP + MySQL on shared hosting.
Establishing real cost-per-shop on the actual stack is the prerequisite for a
credible number, and is the recommended next step.

---

## 5. Open questions for the owner

1. **A currency and a figure per tier**, once cost-per-shop on the real stack is
   known.
2. **Free-tier sync: none, or one device?** One device makes free users into
   backup-protected users and is the strongest funnel into paying; none is
   cheaper to host and a cleaner line.
3. **Bed Ready** ships from its own repo on its own 1.0.0 line
   ([BEDREADY-APP](./BEDREADY-APP.md)) and is commerce-free by design. Does it
   get cloud at all, and is it billed separately?
4. **Regional hosting for ZATCA shops** (roadmap decision #4) is a cost the KSA
   tier carries. Is it a price difference or absorbed?
5. **Does the free tier get the customer portal?** It is the most visible feature
   to a shop's own customers, so it is both the best advertisement and the most
   expensive thing to give away.
