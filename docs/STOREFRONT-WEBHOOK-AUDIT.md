# Storefront webhook audit — what each platform actually sends

**Last run: 2026-08-27.** Method, sources, and every finding.

This is the printer protocol audit's method
([docs/PRINTER-PROTOCOL-AUDIT.md](./PRINTER-PROTOCOL-AUDIT.md)) pointed at a
different surface, because the method turned out not to be about printers. Khayt
takes orders from storefronts it cannot install, run, or place a test order on,
so the platform's own documentation and published sample code **are** the test
fixture — exactly as a printer's firmware source is.

The stakes are higher here than on a printer. A wrong temperature is a wrong
number on a card. A wrong total is the column the business is measured in.

## Findings, 2026-08-27

| Platform | Symptom | Root cause | Tier |
|---|---|---|---|
| Salla | **Every imported order priced at 0.00**, since the integration shipped | `data.total` does not exist; the total is `data.amounts.total.amount` | 1 |
| Salla | Every order titled "Salla: Order" | `data.name` does not exist either | 1 |
| Zid | Payload shape never verified | assumed an `{order:{…}}` wrapper nobody confirmed | — |

### Salla — the guard turned "unreadable" into "free"

```js
const sallaPrice = Number(parsed.data?.total);
price: isFinite(sallaPrice) ? sallaPrice : 0,
```

`data.total` **does not exist in a Salla webhook.** Salla's own published sample
handler (`SallaApp/webhook-actions-js`, `example/Actions/order/created.js`)
documents the whole payload, and `data`'s top-level keys are:

```
id  reference_id  urls  date  draft  read  source  source_device
source_details  status  receipt_image  payment_method  currency
amounts  shipping  items  customer
```

No `total`. The order total is **`data.amounts.total.amount`** — and it is an
**object** (`{amount, currency}`), so a bare `Number()` could not have worked
even against the right key.

`Number(undefined)` is `NaN`. `isFinite(NaN)` is false. So the guard wrote **0**,
on every Salla order, from the day the integration shipped. Revenue, margin and
every report built on them have been wrong for those orders, and nothing threw.

**The lesson, which is not Salla-specific: a fallback that turns "I could not
read this" into a valid-looking value is worse than no fallback.** `0` is a
number a shop can act on. It is indistinguishable from a free order and it sits
in the money column. `orderPriceFrom()` now returns `null` for unknown and the
caller decides — which is what makes the difference visible at all.

Sub-total is also present (`amounts.sub_total`, 186 against a total of 196), and
would have looked perfectly plausible on an invoice. A test asserts the total is
taken and not merely the first amount that parses.

**Existing orders are deliberately not rewritten.** A figure a shop may already
have invoiced against is not Khayt's to change retroactively; the release note
says so and asks for a manual correction.

### Salla — "Salla: Order", every time

`data.name` is not in that key list either, so `(parsed.data?.name || 'Order')`
was always `'Order'` and every order in the queue was titled identically. The
first line item's name is what a shop would call the job (`items[0].name`, with
`+N` when there are more), and the order reference is the fallback — a number
identifies an order, the word "Order" does not.

### Zid — a shape nobody had confirmed

Khayt read `parsed.order.total`, `parsed.order.name`, `parsed.order.customer_name`
and `parsed.order.reference_id || parsed.order.id`. **This audit could not
confirm any of it.** Zid renders its webhook schema through a documentation
component that does not come out as text, its sample apps
(`zidsa/express-sample-app`, `zidsa/laravel-sample-app`, `zidsa/demo-app-python`)
carry no payload fixture, and the shape is not otherwise published.

Guessing would have been the wrong move in both directions — leaving it alone
keeps a possibly-wrong bet, and changing it makes a new one. So the reader now
**accepts both shapes**: the `{order:{…}}` wrapper it assumed, and an order
posted at the top level. If the wrapper is real nothing changes; if it never
was, Zid stops recording unnamed orders priced at zero with no reference to
deduplicate on. Several attested spellings of the total are accepted for the
same reason, and only one is ever present, so it cannot pick the wrong one of
two that both exist.

An unwrapped body must look like an order (`id`, `reference_id`, `code`, `total`
or `order_total`) before its fields are used, so an unrelated payload cannot
donate stray values.

**This closes with one real delivery.** One Zid order webhook body, logged once,
settles it permanently.

## Findings, 2026-08-27 (second pass) — MEDUSA, and it is nearly clean

Medusa is the one integration on this surface whose source is fully open, so it
is the one place the audit gets tier 1 rather than tier 2. It came back nearly
clean, and the two real findings are the same shape as each other.

| Symptom | Root cause | Tier |
|---|---|---|
| The order ref falls through to a raw internal id | `custom_display_id` is read by the mapper and was never requested | 1 |
| A line item with no quantity of its own counts as 1 | `items.detail.*` likewise | 1 |

### Two fallbacks that could never fire

`lib/medusa-subscriber.js` generates the subscriber a shop pastes into its own
Medusa project, and its `fields` list is what the graph query asks for. The
cloud mapper reads `custom_display_id` when `display_id` is empty, and
`it.detail.quantity` when a line item carries no quantity of its own. **Neither
field was in the list, so neither could ever arrive.**

Nothing breaks loudly. The ref falls through to the raw internal id instead of
the number the shop and the buyer both say out loud, and a quantity falls
through to 1. Both read, in the mapper, as handled cases — which is the point
worth keeping: **a fallback that cannot be reached is worse than no fallback,
because the code says the case is covered.** Same family as the Salla guard that
turned an unreadable price into 0.

`items.*` does not imply `items.detail.*`: the wildcard selects the line item's
own columns and not a nested relation. Medusa's own shipped subscriber
(`packages/plugins/loyalty/src/subscribers/create-gift-card.ts`) lists
`items.product.is_giftcard` explicitly *alongside* `items.*` for exactly that
reason, which is what settles it.

### A latent compile break, fixed while here

The generated file imported `SubscriberArgs` as a **value**
(`import { SubscriberArgs, type SubscriberConfig }`). That compiles under the
default Medusa starter, which sets neither `verbatimModuleSyntax` nor
`isolatedModules` — and stops compiling the moment a shop turns either on.
Medusa's own subscribers write `import type { SubscriberArgs, SubscriberConfig }`.
This is a file Khayt hands someone to paste into a repository it will never see
again, so matching the vendor's own form costs nothing and removes a failure
Khayt could never observe.

### Verified correct — Medusa

- **`order.placed` and its payload.** Medusa's `OrderWorkflowEvents` declares
  `PLACED: "order.placed"` with an `@eventPayload` of `{ id }`. If either
  changed, the subscriber would sit in a shop's repository firing never, and
  nothing on either side would say so — which is why it is pinned in a test.
- **The query API.** `container.resolve(ContainerRegistrationKeys.QUERY)` and
  `query.graph({ entity: "order", filters, fields })` match Medusa's own shipped
  subscriber call for call.
- **Not throwing on a failed POST.** A subscriber that throws is retried by
  Medusa, and a retry is a second order in the queue.
- **The cloud import route carries no money, for any platform, by design.** The
  mapper produces an order *request* to be quoted, not a priced order, so the
  absence of a total in Medusa's field list is correct rather than the Salla
  defect repeating. Recorded because it is exactly what a later pass would
  otherwise flag as missing.

## Findings, 2026-08-27 (third pass) — the remaining import branches

Shopify, WooCommerce, Etsy, Shopware and PrestaShop. The stakes on this route
are different from Salla's: the cloud mapper carries no money, so what a wrong
field costs here is **`ref`** — and `ref` is what suppresses duplicate orders.
Duplicates have bitten this codebase twice already ([#745] on the LAN path,
khayt-cloud#22 on the cloud path), so a branch reading the wrong id field means
that platform silently gets a duplicate on every provider retry.

| Platform | Result |
|---|---|
| Shopify | Verified correct |
| WooCommerce | Verified correct (tier 1) |
| **Etsy** | **One paid order became a pile of blank rows** |
| Shopware / PrestaShop | Field names plausible, unverified |

### Etsy — the notification that is not an order

**Etsy has webhooks now**, which is itself the finding behind the finding: for
years the documented answer was that it never would, and developers were told to
poll. It shipped `ORDER_PAID`, with signing secrets and retry-with-backoff. So
"the Etsy branch is unreachable" — which is what this audit was about to
conclude from memory — was two years out of date. *The thing you already know is
the thing most likely to have expired.*

The payload does not carry the order. It carries a pointer to it:

```json
{ "event_type": "ORDER_PAID",
  "resource_url": "https://api.etsy.com/v3/application/shops/{id}/receipts/{id}",
  "shop_id": 123 }
```

Fetching that needs an Etsy OAuth token the cloud does not have. So a shop
wiring Etsy's own webhook straight at the import URL produced an intake with no
name, no contact, no items — and **no `ref`**. No ref means no duplicate
suppression, and Etsy retries with exponential backoff, so **one paid order
became a growing pile of identical blank rows** in the shop's queue. Nothing
threw at any point.

**Why the existing guard could not catch it.** `sanitizeIntake` refuses a
payload whose title *and* description are both empty, and `mapPlatformOrder`
fills both in unconditionally — `"Etsy order"` / `"Imported from Etsy"`. By the
time it looks, nothing looks blank. The question has to be asked while the
source fields are still in scope, which is where `carriedNoOrder` now lives.

Refusing beats storing: a retry cannot fix a body that never contained the
order, and a rejected delivery shows up in the platform's own webhook dashboard,
which is where a misconfiguration belongs. A blank imported order is visible
nowhere but the shop's queue. Fixed in khayt-cloud#23, in **both** backends, and
verified against the deployed PHP one rather than only the Node twin.

The guard is narrow on purpose — name, contact, ref, items, note and link all
empty — with a test per field so it cannot be quietly widened. It is not
Etsy-specific: any id-only notification, and any body POSTed at the wrong
platform's route, produced the same blank undeduplicatable row.

### Shopify — correct, and incidentally future-proof

`name` ("#1001"), `order_number` (1001), `id`, `email`, `phone`, `note`,
`order_status_url`, `customer.first_name`/`last_name`, `line_items[].title`/
`quantity` all exist and are read correctly.

Worth recording: **the REST Admin API is legacy as of 2024-10-01**, and new
public apps must use GraphQL from 2025-04-01. Merchant-configured webhooks still
deliver REST-shaped JSON, so nothing is broken — and the `ref` fallback order
happens to be resilient if that ever changes, because it prefers `name` (which
survives) over `id` (which becomes a `gid://shopify/Order/…` string under
GraphQL). Luck rather than design, but worth knowing before anyone "tidies" that
order.

### WooCommerce — correct, tier 1

WooCommerce is open source, so this is the second place on this surface where
the audit gets tier 1. `number` is in the order REST schema
(`class-wc-rest-orders-v2-controller.php`, described as "Order number."), along
with `billing`, `line_items` and `customer_note`. Woo webhooks deliver that same
REST representation. Every field the branch reads is real.

### Shopware and PrestaShop — plausible, unverified

`orderNumber` / `lineItems[].label` are the right shapes for Shopware 6, and
`reference` is right for PrestaShop, but neither was confirmed against a payload
or source in this pass. They share a branch with `base`, and the fallback chains
are wide enough that a wrong guess degrades to the raw `id` rather than to
nothing — the failure would be a less recognisable order, not a lost one. Left
as a known gap rather than claimed.

## Verified correct — do not re-litigate

- **Salla's envelope.** `{event, merchant, created_at, data:{…}}`, and
  `data.reference_id` is the order reference Khayt deduplicates on — both
  confirmed against Salla's published sample.
- **Salla's customer fields.** `data.customer.first_name` / `last_name`.
- **The duplicate check itself.** Keyed on the platform's own order id against
  the persisted print log, so it survives the restart, the eviction and the
  ten-minute TTL that the in-memory signature cache does not. An empty id is
  never a match — two payloads that both failed to name themselves are not
  thereby the same order.
- **A duplicate answers 200**, so the provider stops retrying rather than
  escalating a delivery that worked.

## Not yet audited

Still unaudited: the customer intake form (Khayt's own surface, so this is a
correctness and abuse review rather than a payload audit), and the carrier
shipping-status webhooks (SMSA / Aramex / SPL) — whose documentation is
partner-gated, so those may not be settleable from public sources at all.
Shopware and PrestaShop are audited only as far as "plausible"; see above. The same
questions apply — which field, on which call, and what arrives when nothing
does.

[#745]: https://github.com/KhaytApp/Khayt/pull/745
