# Khayt — competitive landscape and roadmap (July 2026)

**Status:** proposal. Nothing here is committed work. Written after reading 13
products Turki collected, plus PrintStash from the earlier review.

Companion to [KHAYT-3.0-ROADMAP.md](./KHAYT-3.0-ROADMAP.md), which remains the
platform north-star. That document answers *"where does Khayt run"*. This one
answers *"what does Khayt do that the field does not"*.

---

## 0. What was actually read

Facts below come from each product's own pages, read July 2026. Three could not
be read and are marked — they are **not** guessed at.

| Product | Category | Model | Read? |
|---|---|---|---|
| [FoxTrack](https://foxtrack.studio/) | **Shop management** — orders, inventory, invoicing, CRM, printer logs | Free / $9 / $29 per month | ✅ |
| [CalcMyPrint](https://calcmyprint.com/) | "3D Printing Business Management Platform" | unknown | ⚠️ JS-only; tagline is all that could be read |
| [Printago](https://printago.io/) | **Print-farm automation** — routing, cloud slicing, Shopify/Etsy | Freemium, unlimited printers | ✅ |
| [Quote3D](https://quote3d.com/) | **Instant-quote widget** for service bureaus | API + embed widget | ✅ |
| [3D Print Price Calculator](https://3dprintpricecalculator.com/) | File → price, very deep cost model | Free web tool | ✅ |
| [3D Price Lab](https://3dpricelab.pamelesxi.gr/) | File → price, 90+ printers, 80+ filaments, in-browser | Free alpha, Pro planned | ✅ |
| [MeshVault](https://www.meshvault.app/) | **Model library** + browser capture from Printables/Thingiverse | $19.99 one-time | ✅ |
| [Meshory](https://meshory.com/) | **Model library**, local-first, 40k models tested | $34.99 one-time | ✅ |
| [PrintStash](https://github.com/xiao-villamor/PrintStash) | Self-hosted asset manager + Moonraker | AGPL, self-host | ✅ |
| [MeshTune](https://meshtune.com/) | Mesh repair/analysis, WASM, nothing uploaded | Free | ✅ |
| [STLMaid](https://www.chapterfour.de/stlmaid/index.html) | Meshmixer replacement — cut, repair, connectors | Paid, 7-day trial | ✅ |
| [Obloid](https://obloid.app/tools/stl-splitter) | Browser tools — splitter, converters, AI generate | Freemium | ✅ |
| [Layova](https://layova.ca/) | unknown | unknown | ❌ 403 |
| RIGHTPrint | unknown | unknown | ❌ not findable |

### The field sorts into four buckets, and Khayt sits in only one

1. **Shop management** — FoxTrack, CalcMyPrint. *Khayt's actual competitors.*
2. **Pricing calculators** — 3DPPC, 3D Price Lab, Quote3D.
3. **Model libraries** — MeshVault, Meshory, PrintStash.
4. **Mesh tools** — MeshTune, STLMaid, Obloid.

Printago is its own thing: farm automation at 3–300 printers. Not Khayt's buyer.

---

## 1. The one finding that matters most

**Every pricing calculator in this list starts from a file. Khayt starts from
numbers the user must already know.**

Verified, not remembered: `renderer/calculator-cost.js` takes `printWeight`,
`printTime`, `spoolCost` and `spoolWeight`, and hands a `baseCost` to
`pricing.quoteTotal`. The user supplies the two hardest numbers. 3D Price Lab,
3DPPC and Quote3D all take an STL/3MF/OBJ upload and derive weight and time
themselves — 3D Price Lab in-browser, against 90+ printer profiles and 80+
filaments.

So the insertion point is precise: produce `printWeight` and `printTime` from a
file, and the rest of the chain — cost, margin, tier, quote, order, invoice —
already exists and is already tested.

That is a real gap, and it is the *cheapest* one Khayt can close, because the
machinery is already in the repo and unrelated to it:

- `lib/mf-mesh.js` (402 lines) — parses 3MF into triangle arrays
- `lib/gcode-parse.js` — already reads slicer metadata
- `lib/mf-convert.js` (1,079 lines, 74 tests) — the converter
- `lib/pricing.js` — the cost engine, extracted this month, already pure

Nobody has to invent geometry code. The work is wiring what exists into the
quote, and being honest about the difference between a *sliced* estimate and a
*geometric* one.

**Khayt's unfair advantage here:** the calculators are anonymous one-shot web
tools. Khayt already knows this shop's filament prices, printers, electricity
rate, labour rate and margin — from `settings`. A file-derived estimate in Khayt
is priced with *the shop's own numbers*, and the resulting quote becomes an order,
an invoice and a ZATCA-compliant document. None of them can follow through.

---

## 2. Where Khayt is already ahead, and should stay

Worth naming, because a roadmap that only lists gaps distorts the picture.

- **Money that survives scrutiny** — ZATCA, credit notes netted out of revenue,
  voids and refunds subtracting properly. No calculator does invoicing at all;
  FoxTrack does PDFs, not tax compliance.
- **Nine languages, RTL-first.** The entire field above is English-only.
- **Local-first with opt-in E2E cloud** — Meshory and MeshVault are local-first
  but have no shop layer; FoxTrack and Printago are cloud-only.
- **Organisations** — one passphrase across branches, shipped this month. Nothing
  in this list does multi-branch.
- **A phone companion that works over LAN** with no account.

---

## 3. Roadmap

Ordered by *value per unit of risk*, not by size. Each item says what already
exists, so none of them starts from zero.

### Now — closes the clearest gap

**R1. File → estimate → quote.** Drop an STL/3MF/OBJ on the calculator; Khayt
derives volume and bounding box, applies the shop's own filament density, waste
and margin, and produces the quote it already produces.
*Exists:* `mf-mesh.js`, `pricing.js`, the whole settings model.
*Risk:* a geometric estimate is not a sliced estimate. It must be labelled as an
estimate and never presented as slicer truth — the same discipline as the
currency work: no number that looks more certain than it is.
*Wedge:* for 3MF from Orca/Bambu/Prusa, `gcode-parse.js` can read the slicer's
*actual* time and filament, which is exact. Do that first — it is strictly better
and less work than estimating.

**R2. Browse the Bed Ready library properly.** The panel today is a 560px modal
with a list and "download all" — no search, no filter, no preview, no thumbnails.
Meshory and MeshVault show what this should be.
*Exists:* the whole data path — `lib/bedready-library.js`, seven IPC channels
including `bedreadyImportToLib(item, vaultId)`, cover fetching, SSRF-guarded
downloads. Only the browsing surface is missing.
*This is the highest ratio of value to new code in the entire document.*

### Next — differentiates rather than catches up

**R3. Measured cost, not estimated cost.** PrintStash pulls *actual* grams and
duration from Moonraker on completion. Khayt logs waste and estimates cost, but
never learns what a job really cost. For a shop, estimate-versus-actual is the
margin question — and Khayt is the only product here that could put both numbers
on the same invoice.
*Exists:* printer polling, `wasteLog`, the full cost engine.

**R4. Settings that worked, remembered.** PrintStash keeps G-code revisions per
model with `known_good` / `needs_test` / `failed`, one recommended at a time.
Khayt has `printFiles` and reprints but no memory of *which settings succeeded*.
A shop reprinting a part six months later is guessing today.

**R5. Customer uploads a file and gets a price.** Quote3D's whole business.
Khayt already has `/api/intake` (a customer request form), `/api/quote`, a
storefront catalog and a portal — the pipeline exists, but a customer cannot
attach a model and see a number.
*Depends on R1.* Do not start before it.

### Later — worth doing, not worth rushing

**R6. Model library as a first-class surface.** Extend R2 beyond Bed Ready:
thumbnails, tags, collections, dedup by content hash, 3D preview. Meshory charges
$34.99 for exactly this. It is a real product on its own — which is the warning:
it is also a *different* product, and Khayt's buyer is a shop, not a hoarder.

**R7. SDCP resin printers.** Protocol layer built and tested (PR #529); needs
sockets and hardware. Reaches Elegoo Mars/Saturn. Deliberately small scope.

### Deliberately not doing

- **Print-farm automation** (Printago). Different buyer, enormous surface.
- **Mesh repair / splitting** (MeshTune, STLMaid, Obloid). Real craft, adjacent
  business, and MeshTune gives it away free. Link out; do not build.
- **AI model generation** (Obloid). Not a shop-management problem.
- **Self-hosting, RBAC, S3, Postgres** (PrintStash). Khayt is a desktop app with
  an opt-in encrypted cloud. That was a decision, not an omission.

---

## 4. On pricing

FoxTrack is the only directly comparable product with public numbers:
**free / $9 / $29 per month.** The library tools are one-time: $19.99 and $34.99.
The calculators are free.

That is a data point about the *field's* anchor, not a recommendation. Khayt does
ZATCA invoicing and nine languages; comparing it to a $9 order tracker on price
alone would undersell it. Positioning is Turki's call — this document only
records what the field charges.

---

## 5. What would make this roadmap wrong

Stated so it can be checked rather than assumed:

- **If shops do not actually want file-based quoting**, R1 and R5 collapse. The
  evidence is that five products in this list are built on it — that is strong,
  but it is evidence about *the market for calculators*, not proof about Khayt's
  existing users. Worth asking a real shop before building R5.
- **If Bed Ready's library is small in practice**, R2's payoff shrinks to a nicer
  modal. Worth checking real library sizes first — one query.
- **Layova and RIGHTPrint are unread.** Either could invalidate a section here.
