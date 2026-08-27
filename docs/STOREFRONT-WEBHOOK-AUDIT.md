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

Still unaudited: the rest of the cloud import mapper's platform branches
(Shopify, WooCommerce, Etsy, Shopware, PrestaShop), the customer intake form,
and the carrier shipping-status webhooks (SMSA / Aramex / SPL) — whose vendor
documentation is partner-gated, so those may not be settleable from sources at
all. The same
questions apply — which field, on which call, and what arrives when nothing
does.
