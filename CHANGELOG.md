# Changelog

All notable changes to Khayt are documented here. Version format: [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

## [3.0.0-beta.20] - 2026-06-26

**Pre-release (beta)** — a stability & accessibility release from a full UI review: a form-label accessibility pass (every field now announces its purpose to screen readers), a fix for the Settings market/locale pickers, and corrected release screenshots. Verified clean for RTL/Arabic, narrow-window layout, and runtime errors across every screen.

### Accessibility

- **Form fields announce their purpose** — every input and dropdown is now programmatically tied to its label, so screen readers announce what each field is (previously ~39 fields across the calculator, inventory, logs, analytics, waste and settings had a visible label that wasn't linked to the control). Filter dropdowns also gained accessible names, and the Orders log status/payment filters now read **"All statuses" / "All payments"** instead of a bare "All" — clearer both on screen and to assistive tech.

### Fixed

- **Settings market & locale selectors** — fixed a startup error (`KhaytIntegrations.forLocale is not a function`) caused by two modules claiming the same global name, which left the storefront/payment **integration market pickers** in Settings empty. The market registry now owns that name; the integrations feature module no longer clobbers it.

- **Release/README screenshots** — the auto-captured headline **dashboard screenshot** could render blank because the capture started before the demo data finished loading. The capture now waits for the data to actually apply, so every published screen shows real content.

## [3.0.0-beta.19] - 2026-06-25

**Pre-release (beta)** — power-user & polish release: plate-nesting batch suggestions, a custom report builder, per-field coach tips, smart expense categorization, portal messaging, signed developer webhooks, cross-device cloud snapshot history, and a fully translated Turkish interface.

### Added

- **Complete Turkish interface** — the Türkçe locale is now **fully translated** (the whole UI, not just the core subset), so nothing falls back to English when you pick Turkish. Brings tr to parity with English and Arabic.

- **Cloud snapshot history** — your shop is now **versioned in the cloud** on every sync. Open **Settings → Khayt Cloud → 🕑 Snapshot history** to see prior versions and **restore any of them in one click** — the chosen version replaces local data on this device and syncs to your others. Still fully end-to-end encrypted; the server only ever stores opaque ciphertext. Extends beta.18's local restore points across devices. Requires cloud sync.

- **Signed event webhooks (for developers)** — point one HTTPS endpoint at Khayt and receive a clean, **HMAC-signed** `order.*` event stream (created / status changed / fully paid) with an idempotency key, so you can build your own integrations and trust each payload via the `X-Khayt-Signature` header. Configure under **Settings → Signed Event Webhooks**; off by default. Complements the existing per-event (Zapier/Make) webhooks.

- **Portal messaging** — customers can now message you right on their order/quote portal page, and you reply from the order menu (**💬 Portal messages**) — a simple shared thread for questions, approvals, and updates. You're notified (email + push) when a customer writes. Requires cloud sync.

- **Smart expense categorization** — when you type an expense note, Khayt suggests the right category (Filament, Electricity, Maintenance, Shipping, Tools) with one tap to apply. Works offline and understands English + common Arabic terms.

- **Coach tips** — small ⓘ help icons now sit next to key inputs (profit margin, failure rate, VAT %, machine wear) explaining what they mean and how to set them — handy when you're starting out. Toggle them off anytime in **Settings → Data**. Completes the onboarding work from the guided tour.

- **Custom report builder** — build your own order reports (Analytics → **Report builder**): pick the columns you want, filter by status and date range, preview live, and export to CSV. Save report definitions and re-run them with one click.

- **Plate nesting / batch suggestions** — the Batch Planner can now **auto-suggest build plates**: it packs your selected (or all pending) jobs into efficient batches by material and a configurable max print-time and weight per plate, so you can run several jobs per build instead of one at a time. Jobs too big for one plate are flagged.

## [3.0.0-beta.18] - 2026-06-24

**Pre-release (beta)** — a polish & launch-readiness release: invoice templates, a monthly email digest, overdue-invoice reminders, a guided tour, a Turkish interface, an accessibility pass, named restore points, and a Road-to-1.0 plan.

### Docs

- **1.0 launch-readiness pass** — refreshed the pre-launch QA checklist (`docs/PRELAUNCH-QA.md`) with the beta.16–18 features and current coverage counts, and added a **Road to 1.0** release-candidate plan (feature freeze → full QA → `rc.1` tag → soak → promote to `v3.0.0`). Full sweep verified green: 674 desktop tests, 61 cloud contract tests, e2e smoke, lint.

### Added

- **Named restore points** — save a **labeled snapshot** of all your data (Settings → Backups → Restore points…) before a risky change like a big import or month-end, and **roll back in one click** anytime. Restore points are kept separately from the dated auto-backups (so they're never auto-pruned), encrypted on disk, and capped at the most recent 50.

### Accessibility

- **Keyboard & screen-reader pass** — a visible keyboard **focus ring** now appears across all interactive controls (buttons, inputs, selects, links, tabs), and a **“Skip to main content”** link lets keyboard and screen-reader users jump past the nav. Mouse interaction is unchanged (focus rings show only for keyboard navigation).

### Added

- **Turkish (beta)** — Khayt now offers a **Türkçe** interface option (top-bar language switcher, Settings, and setup wizard). The core navigation, common actions, order statuses, and tour are translated; remaining strings fall back to English while translation continues — bringing the supported language count to 8.

- **Guided tour** — first-time owners now get a quick walkthrough after setup that steps through the dashboard, calculator, queue, inventory, clients, and analytics with a short explanation of each. Replay it anytime from **Settings → Data → Take a tour**. (Adapts to Simple/Pro mode and works in both English and Arabic/RTL.)

- **Overdue-invoice reminders** — opt in (Settings → Automation) and Khayt periodically flags unpaid invoices past their due date — with a configurable grace period, cooldown, and per-invoice cap — so you can send a payment reminder in one tap from the dashboard. Complements the existing quote follow-up automation; it never messages customers automatically.

- **Monthly email digest** — the automated email digest (Settings → Email digest) now supports a **Monthly** cadence on a day-of-month you choose, alongside daily and weekly. It emails the period's revenue, outstanding balance, completed orders, low-stock spools, and intake — so you get a month-end business summary in your inbox automatically.

- **Invoice templates** — pick a document look in **Settings → Business**: **Classic** (the current style), **Modern** (a bold accent-coloured header band), or **Minimal** (clean, no colour bar). It restyles your invoices, quotes, and receipts on top of the existing logo, tagline, accent colour, and terms — purely visual, so ZATCA fields and totals are unchanged.

## [3.0.0-beta.17] - 2026-06-24

**Pre-release (beta)** — a usability, finance & scale release: supplier price lists, downloadable portal invoices, mobile inventory, an executive KPI summary, per-location reports, a team activity log, more storefront/payment connectors, and one-click demo data.

### Added

- **Demo data to explore** — new shops can now **Settings → Data → Load demo data** to fill Khayt with realistic sample clients, products, spools, printers, and orders (across quote → printing → delivered) and try every tab before entering real data. One click to **Remove demo data** later — your real records are never touched.

- **More storefront & payment connectors** — the Storefronts & Payments directory grows from 3 to **5 per market**: added Wuilt & ExpandCart (Gulf), BigCommerce & Wix (US/Spain/France), Wix & Etsy (Germany), STORES & MakeShop (Japan), Pinduoduo & Weidian (China) — plus more payment options per market (Tamara, PayTabs, Apple/Google Pay, Redsys, Lydia, giropay, SOFORT, LINE Pay, Merpay, JD Pay, QQ Pay…). New storefronts work with the existing import links and catalog feeds.

- **Team activity log** — a new **Clients → Activity** view records who did what and when (orders & quotes created, status changes), attributed to the signed-in operator, filterable by team member. Pairs with the existing per-operator job assignment and roles, and syncs across devices. (Built on the existing operator sign-in.)

- **Per-location reports** — the Executive summary now has a **location switcher** (All locations / each site), so multi-site shops can see revenue, margin, on-time %, cash, and top clients/jobs for one branch at a time. It defaults to your currently active location and complements the existing per-location queue and inventory views.

- **Executive summary** — a one-screen KPI overview (Analytics → **Executive summary**) with quick date ranges (this month / last month / quarter / year / all): revenue, gross profit & margin, average order value, **on-time delivery %**, cash outstanding, and your **top clients & top jobs** for the period — at a glance, no scrolling through charts.

- **Inventory on your phone** — the mobile web app gains an **Inventory** tab: see every spool sorted by how much is left (low stock first, flagged), and tap one to **deduct or top up** grams on the spot — synced back to the desktop. Requires cloud sync.

- **Download invoice from the portal** — when you publish an order or quote to the customer portal, the page now offers a **Download invoice (PDF)** button that renders a clean printable invoice/receipt — your shop name, VAT & address, the reference, total, deposit/balance, and a PAID stamp — which the customer saves as a PDF straight from their browser.
- **Supplier price lists** — give each supplier a per-material price list (price per kg) in their profile. Reorder drafts and auto-draft purchase orders now use the **cheapest matching supplier price** (and assign that supplier) instead of the spool's own cost — so POs reflect what you'll actually pay and you can compare suppliers.

## [3.0.0-beta.16] - 2026-06-23

**Pre-release (beta)** — a storefront, mobile, operations & finance release: product options, storefront insights, portal balance payment, phone order-request triage, a scheduling forecast, auto-draft POs, subscriptions/retainers, and account/tax-code accounting exports.

### Added

- **Accounting exports: account & tax codes** — the Accounting CSV export (and the accounting-sync webhook) now let you set a **sales account code** and a **tax code**, written into the right columns for each provider — including Xero's `AccountCode`/`TaxType` and Zoho's `Account`/`Tax Name`, which their importers require. Your codes are remembered for next time.

- **Subscriptions & retainers** — bill clients a recurring fee on a schedule (Clients → 🔁 **Subscriptions**): set up plans like a monthly maintenance retainer or a print-credit package (daily → yearly), and Khayt auto-generates the invoice each cycle (catching up if the app was closed), pausing/ending on demand. The panel shows your **monthly recurring revenue (MRR)**. Distinct from recurring orders, which reprint a past job rather than billing a flat fee.

- **Auto-draft purchase orders** — turn on **Auto-draft POs** in Inventory and Khayt will automatically create *draft* purchase orders for materials that have hit their reorder point (based on the demand forecast), skipping anything that already has an open PO so nothing piles up. Drafts only — you review and send them. Runs at startup and when you enable it.

- **Schedule board with completion ETAs** — the Queue → **Schedule** view now estimates *when* each job will be ready: it sequences each printer's queue and projects completion dates from your working hours per day, shows a **"ready by …"** date per machine, and flags jobs that will **miss their due date** (outlined in red). Turns the load bars into an actual forecast.

- **Storefront insights** — your published storefront now tracks **views → add-to-cart → orders**, and the Storefront editor shows the funnel, a **conversion rate**, and your **top products** by orders/carts — so you can see what's drawing interest and what's selling. (Aggregate counts only; no visitor tracking.)

- **Pay outstanding balance from the portal** — when you publish an active order to the customer portal, the page now shows the **balance due** and a **Pay balance** button using your pay link (with the amount filled in), so customers can settle the remainder online — not just the upfront deposit on quotes. "Paid in full" is confirmed via your payment webhook.
- **Triage order requests from your phone** — the mobile web app gains a **Requests** tab (with a live count) where you can **Accept** an incoming order request — it's added to your orders as a quote and synced to the desktop — or **Decline** it, all without opening your computer. Requires cloud sync.
- **Storefront product options/variants** — give a published product selectable options (e.g. *Color: Black, White; Size: S, M*) in the Storefront editor. Customers pick their choices on each product card, the selection shows in the order summary, and it arrives with the order request — so you know exactly what they want.

## [3.0.0-beta.15] - 2026-06-23

**Pre-release (beta)** — a portability, intelligence & resilience release: full CSV data export, real remote control from your phone, a P&L export, AI price suggestions, deeper storefront checkout, per-quote currency, and self-healing offline sync.

### Fixed

- **Launch hardening** — duplicating or re-printing an order now carries its per-quote currency into the calculator (so it isn't silently reset on re-save). Refreshed the pre-launch QA checklist (`docs/PRELAUNCH-QA.md`) to cover all beta.15 features.

### Added

- **Resilient cloud sync (auto-retry when offline)** — if a background sync fails because you're offline or the network blips, your change is kept locally and the app now **automatically retries** with exponential backoff instead of waiting for your next edit. The moment connectivity returns (the device comes back online), pending changes are flushed immediately, and a fresh edit supersedes any queued retry so there's never a double-push.

- **Per-quote currency** — the calculator now has a **Currency** selector so an individual quote/order can be priced in any of the 27 supported currencies, independent of the client's default (handy for one-off international jobs or client-less quotes). "Auto" keeps the existing behavior (client currency, else your base). The chosen currency flows through the invoice/quote document (which already renders in the buyer's currency) and analytics conversions — building on the existing per-client currency and configurable FX rates.

- **Storefront checkout: shipping & tax** — your published storefront now supports **shipping methods** (name + price, e.g. Courier / Pickup) and a **tax/VAT rate**, set in the Storefront editor. Customers pick a shipping option at checkout; the order summary shows shipping, tax, and a correct grand total (deposit and the pay link follow the new total), and the choices carry into the request that lands in your inbox.
- **AI price suggestions** — the calculator's margin field gains a **✨ Suggest** button that recommends a target margin grounded in your shop's own realized history: it finds comparable completed jobs (same material, or all priced jobs when a material is new), shows the median margin and range, and — when AI assist is enabled — adds a one-line rationale and a suggested price. One tap applies the margin to the quote. Works without an API key too (data-driven median).
- **P&L summary export** — the Analytics tab gains a **P&L summary** button that exports a clean income-statement CSV for the **currently selected date range** (all time / this month / quarter / year / custom): orders, revenue, cost of goods sold, gross profit & margin, operating expenses broken down by category, VAT collected, and net profit. Cells are spreadsheet-safe for Excel/Sheets — hand it straight to your accountant.
- **Remote control from your phone** — the mobile web app (sign in at your Khayt Cloud address → unlock with your sync passphrase) gains real control, not just viewing: a new **Printers** tab shows each machine with a live "Printing now / Idle" badge and the job currently on it, and **quotes** can now be **approved or declined** right from the order sheet (approve moves it to pending; decline voids it) — syncing straight back to the desktop. Requires cloud sync.
- **Export all data (CSV)** — a one-click **Settings → Data → Export all data (CSV)** writes a clean CSV per collection (orders, clients, products, inventory, expenses, machines, suppliers, purchase orders) into a folder you choose, alongside the existing JSON backup. Every cell is quoted and formula-neutralized so the files open safely in Excel/Sheets — full data portability for spreadsheets, accountants, or migrating elsewhere.

## [3.0.0-beta.14] - 2026-06-23

**Pre-release (beta)** — a storefronts & payments integrations suite: a per-market directory, two-way storefront order import & catalog publishing, and guided setup.

### Added

- **Storefronts & Payments directory** — a new **Settings → Storefronts & Payments** section lists the top 3 storefronts and top 3 payment systems for each translated market (Saudi/Gulf, US/Global, Spain, France, Germany, Japan, China) — switchable by market. You can enable the payment methods you accept and save your own payment link for each, ready to use at checkout. (First part of the integrations suite; storefront order import & catalog publishing follow.)
- **Storefront order import (inbound)** — connect a store's order webhook to Khayt and new orders land directly in your **Order requests**. Each inbound-capable storefront in the directory now shows a **Copy import link** (once cloud sync is on); paste that URL as an order/checkout webhook in Shopify, WooCommerce, Etsy, Salla, Zid, Shopware, PrestaShop or BASE and incoming orders are mapped to a request automatically (customer, contact, line items, note), tagged with the source platform.
- **Catalog publish (outbound)** — publish your storefront catalog out to other shops. Each outbound-capable storefront now shows a **Copy feed link** (once cloud sync is on) that gives you a product-feed URL — CSV for Shopify/WooCommerce-style importers, an RSS/Google-Merchant feed for ad/marketplace catalogs, or JSON — to paste into the platform's "import products from URL" feature. The feed mirrors your published catalog (names, prices, categories, availability, photos) and refreshes automatically as you update it.

## [3.0.0-beta.13] - 2026-06-23

**Pre-release (beta)** — clearer Simple/Pro modes, onboarding, quote bundles, and a customer self-service portal.

### Added

- **Clearer Simple vs Professional modes** — the mode switch (Settings → Experience) now shows a side-by-side comparison of exactly what each tier includes: the Simple core (quoting, queue, invoices, inventory, clients) and everything Professional adds (full analytics & forecasting, ZATCA, proforma/milestone invoices, purchasing & A/P, multi-location, team accounts, maintenance, loyalty), with your current tier highlighted. Backed by a single canonical feature registry so the boundary is consistent.
- **First-run setup adds your first printer** — the setup wizard now lets you name your first printer during onboarding, so the queue and calculator have a machine ready to go from the start.
- **Quote bundles** — save a named set of catalog products as a **bundle** (e.g. "Desk set") and quote them all into the calculator in one tap (**Catalog → 🎁 Bundles**). Complements the existing per-part volume/tier pricing.
- **Customer self-service portal** — when a customer signs in to their orders link, they can now **re-order** a past job (it lands in your Order requests) and **leave a star review** right from the portal — on top of seeing their orders and statuses.

## [3.0.0-beta.12] - 2026-06-23

**Pre-release (beta)** — scan-in, a deeper storefront, a security/perf hardening pass, and a revenue forecast.

### Added

- **Scan-in workflow** — the camera/barcode scanner now recognises Khayt's own label QR codes: scan a **spool label** to open that spool (quick deduct/top-up), or an **order label** (or its customer tracking QR) to open that order. Works with the camera or a USB/Bluetooth barcode scanner (or just type/paste a code). Closes the loop with the QR labels added in beta.11.
- **Storefront depth** — the public storefront grew up: organise products into **categories** (shown as sections), set a **lead time** and a **minimum order**, and mark items **sold out** — all from **Khayt Cloud → 🏬 Storefront**. The shop page groups by category, shows the lead-time, blocks checkout below the minimum, and tightens the grid on small phones.
- **Revenue forecast** — Analytics now projects your **next three months** of revenue with a trend line fitted to recent months (least-squares regression, falling back to an average when history is thin), shown as a chart with a "projected next month ±%" headline. Distinct from the dashboard's month-to-date estimate.

### Fixed & hardened

- **Team-account security (cloud)** — only the **owner or a manager** can now invite or remove team members (previously any member could), and **removing a member revokes their access immediately** instead of waiting for a password reset.
- **Draft purchase orders** no longer over-state cost (a per-kg price was used as per-gram).
- **Recurring orders** can no longer double-create on a single launch, and a corrupt schedule interval no longer halts the recurring sweep.
- **Auto-assign** now also places `queued` jobs (not just pending).
- **Performance** — the inventory search and the campaign segment preview are debounced, so large shops (thousands of orders) stay smooth while typing.

## [3.0.0-beta.11] - 2026-06-23

**Pre-release (beta)** — grow + operate: marketing campaigns, QR labels, demand-aware reordering with draft POs, and customer reviews.

### Added

- **Marketing campaigns** — broadcast a message to a customer segment over email or WhatsApp/SMS (**Clients → 📣 Campaign**). Segment by minimum lifetime spend, "no order in N days" (win-back), tag, or loyalty tier; personalise with merge fields (`{{name}}`, `{{orders}}`, `{{spend}}`, `{{last_order}}`); see the live recipient count + a preview before sending. Sends are throttled, skip customers who lack the channel's contact, and respect a new per-client **"Exclude from marketing"** opt-out. Reuses your configured email + SMS providers.
- **Label & QR printing** — print QR labels for orders and spools. **Order labels** (🏷 on a queue card) carry a QR that opens the customer's tracking page; **spool labels** (Inventory → 🏷 Labels) encode a scan-in code for the spool. Labels print as an A4 grid on a normal or label printer.
- **Demand forecast & draft purchase orders** — reorder suggestions now subtract grams **already committed to open orders** from on-hand stock, so "days left" reflects the work in your queue (not just past usage) — and a material can surface for reorder when queued jobs alone would exhaust it. A new **"Draft purchase orders"** button turns the suggestions into draft POs (suggested quantity + your per-kg cost), ready to review and send.
- **Customer reviews & ratings** — collect remote reviews: share a review link (**Khayt Cloud → 🏬 Storefront → Copy review link**) after an order and the customer rates you 1–5 ★ with an optional comment on a simple page. Your **average rating + count** shows in the Storefront panel and on the **public storefront**. (Complements the existing on-site survey, which was local-network only.)

## [3.0.0-beta.10] - 2026-06-23

**Pre-release (beta)** — assist + automate: a conversational AI assistant, storefront promo codes, pause/skip/end for recurring orders, and one-way accounting sync.

### Added

- **AI shop assistant — conversational** — the "✨ Ask AI" assistant now holds a **conversation**: it remembers earlier answers in the session, so follow-ups like "and last month?" or "which of those is overdue?" work in context, shown as a chat transcript. Still grounded strictly in your own shop data (no invented numbers) and uses your own Anthropic key.
- **Storefront promo codes** — add discount codes to your storefront (**Khayt Cloud → 🏬 Storefront**): percentage or fixed amount, optional expiry, and an optional usage limit. Customers enter a code at checkout and the total + deposit update live; codes are validated on the server (expiry and usage count are enforced, not bypassable from the page). The applied code and discount are recorded on the order request.
- **Recurring orders — pause, skip, end & accurate scheduling** — recurring orders (per-client) can now be **paused** (keeps the schedule, stops creating), given a **stop-after date**, or **skipped one cycle** — all from the client editor. The next-due date now advances by true calendar months (no more month-end drift), and a background re-check creates due orders even if the app stays open for days (no restart needed). Paused subscriptions no longer show as "due".
- **Accounting sync** — push paid invoices (and a test payload) to a **webhook** so bookkeeping stays in sync without re-entry (**Settings → Accounting Sync**): pick a format hint (Generic / QuickBooks / Xero / Zoho), set the URL + optional shared secret, and choose to push automatically when an invoice is marked paid. Payloads carry VAT split + an idempotency key so re-sends are safe; bridge to your accounting software with Zapier/Make or your own endpoint. Complements the existing accounting CSV export.

## [3.0.0-beta.9] - 2026-06-23

**Pre-release (beta)** — selling + customer comms: storefront checkout & deposits, customer order tracking, automated SMS/WhatsApp updates, and print-farm auto-scheduling.

### Added

- **Storefront checkout & deposits** — your storefront now shows prices and a running cart total, and can request a deposit. Set a price per product, a deposit %, and paste a payment link from any provider (**Khayt Cloud → 🏬 Storefront**); at checkout the customer sees the total, the deposit due, and a **Pay deposit** button (your link, with `{amount}`/`{total}` filled in), then sends the order — which arrives in **Order requests** itemised with the total and deposit.
- **Customer order tracking** — a published order link now shows a visual progress timeline (Received → Printing → Finishing → Done → Ready for pickup) with the current step highlighted, in the customer's language, instead of just a status label. Updates automatically as you advance the order; quotes are unchanged.
- **SMS / WhatsApp notifications** — send automated order updates to customers over SMS or WhatsApp (**Settings → SMS / WhatsApp Notifications**). Pluggable provider — **Twilio**, the **WhatsApp Cloud API**, **Unifonic**, or your own **webhook** — with a Send-test button. Provider credentials are encrypted at rest like your other keys. (The manual "share to WhatsApp" link is unchanged; this adds true automated sending.)
- **Print-farm auto-scheduling** — beyond the existing "Suggest assignments" review, the queue now has a one-click **🪄 Assign** (apply the best machine for every unassigned job immediately) and an **Auto-assign** toggle that keeps queued jobs placed on free, compatible machines automatically (material- and nozzle-aware, load-balanced, skipping offline/in-downtime machines).

## [3.0.0-beta.8] - 2026-06-22

**Pre-release (beta)** — the four community-picked features: filament-at-a-glance, multi-user team accounts, a public storefront, and real Bambu Lab support.

### Added

- **Filament status on the dashboard** — an at-a-glance panel showing spools that are low or projected to run out soon (remaining grams + %, days-left), reusing the existing reorder engine. Complements the inventory tab and low-stock alerts so you spot shortages from the home screen.
- **Team accounts (multi-user)** — invite staff to your shop with a role (manager / operator / viewer). They join with their own email + password via an emailed invite code (and the shop's shared sync passphrase), then share the same cloud data. Manage everyone from **Khayt Cloud → 👥 Team**; roles drive in-app permissions.
- **Public storefront** — publish your product catalog as a shareable public page (**Khayt Cloud → 🏬 Storefront**). Customers browse your products, pick what they want with quantities, and send a request — which lands straight in **Order requests** as a draft quote. Owner-curated plaintext (no account or E2E key needed to view); unpublish anytime to take the link offline.
- **Bambu Lab printers (local network)** — real LAN monitoring + send-to-print for Bambu (P1/X1/A1). Status now comes over the printer's MQTT channel (state, progress, layer, nozzle/bed temps, time left) instead of the old non-working HTTP stub, and **🖨 Slice & print** uploads the file over FTPS and starts it. Set the printer's **IP, access code and serial** (Settings → machine → Live API). No cloud account or SDK required — it talks straight to the printer on your network.

## [3.0.0-beta.7] - 2026-06-21

**Pre-release (beta)** — reliability + project move.

### Added

- **Crash reporting (opt-in, privacy-safe)** — official builds report crashes and errors to Sentry so issues are caught fast. No personal data or your encrypted store is ever sent; it's active only in installed builds (off during local development) and off entirely in source/fork builds without the project key.

### Changed

- Khayt now lives in the **`khaytapp` GitHub organization**; release downloads and auto-updates moved with it (old links auto-redirect). The contact address is now on `khaytapp.com`.

## [3.0.0-beta.6] - 2026-06-20

**Pre-release (beta)** — the slice → print pipeline. Configure your slicer, then send jobs to the printer without leaving Khayt.

### Added

- **Slice & print** — on a machine with a printer API (OctoPrint / Moonraker / PrusaLink), a 🖨 button slices a chosen model with your installed slicer and **uploads + starts the print** on that machine. You can also send an already-sliced `.gcode` directly (no slicing).
- **Slice & print from the queue** — a pending order whose assigned machine has a printer API and an attached model/G-code gets a 🖨 action right on the kanban card: slices the attachment (or uploads it) and starts it on that printer.
- **Slicer "Test" button** (Settings → Slicer) — verifies the configured slicer program runs before you rely on it.

## [3.0.0-beta.5] - 2026-06-20

**Pre-release (beta).** Also relicensed to the Functional Source License (FSL-1.1-Apache-2.0): free to use (incl. for your business), source-available, no reselling/hosting, and each release auto-converts to Apache-2.0 after two years. See [LICENSE](./LICENSE).

### Added

- **Slicer integration** — point Khayt at your installed **PrusaSlicer / OrcaSlicer** (Settings → Slicer), then **"🧩 Slice for exact quote"** in the calculator slices an uploaded model and fills print weight + time from the slicer's *own* estimate (parses time/filament/cost from the G-code). Khayt never bundles a slicer — it shells out to yours, so it stays license-clean. Complements the offline STL geometry estimate.

## [3.0.0-beta.4] - 2026-06-20

**Pre-release (beta)** — four growth features: live printer monitoring, customer order intake, STL-based quoting, and web push.

### Added

- **Live printer panel on the dashboard** — an at-a-glance card showing every API-connected machine's state, print progress, hotend/bed temps, current file, and ETA, refreshing in place each poll (reuses the existing OctoPrint/Moonraker/Klipper/PrusaLink/Bambu poller). Complements the kanban's per-machine live status.
- **Customer order intake** — share a request link (`…/intake/<shop>`) and customers submit a print request (project, description, quantity, material, model link, photo, contact) with no login. New requests arrive in **Khayt Cloud → Order requests**; one click turns a request into a draft quote with a linked client. You're emailed when one comes in.
- **Estimate from a 3D model (STL)** — in the calculator, upload an STL and Khayt reads its geometry (volume + bounding box) to auto-fill print weight and time using your infill setting; it shows the size, solid vs estimated weight, and the assumptions so you can adjust before saving. Works fully offline; handles binary and ASCII STL.
- **Web push notifications** — install the remote-mobile app (PWA) and tap **Enable alerts** to get a push on your phone when a customer approves/declines a quote, pays a deposit, or submits an order request — even with the app closed. Payload-less (VAPID): the push service never sees your data. Requires the operator to set a VAPID key on the cloud.

## [3.0.0-beta.3] - 2026-06-20

**Pre-release (beta)** — a hardening pass from a full UI / language / security / bug audit. No new features; everything below makes 3.0 safer and more complete.

### Security (Khayt Cloud)

- **Customer portal sign-in required for quote decisions** — approving/declining a quote linked to a customer account now requires that signed-in customer, so a forwarded link can't be used to forge a decision. Unlinked links keep the one-tap flow.
- **Faster, abuse-resistant auth** — device-token and portal-session lookups no longer verify every stored hash (a denial-of-service hazard); they match a single indexed row.
- **Rate-limit hardening** — the limiter no longer trusts a spoofable `X-Forwarded-For`, so brute-force protection on sign-in / reset / portal can't be bypassed.
- Added HSTS + Content-Security-Policy + clickjacking protection to the portal and mobile pages; admin endpoints are header-only (no secret in the URL); `customerEmail` is validated before an item is linked to a customer.

### Fixed

- **Plan expiry** is now compared in UTC consistently, so a subscription can't read as expired (or active) by the server's timezone offset.
- **Billing plan updates** target the exact account (by email or id), never an unintended match.
- **Remote-mobile app** locks immediately when you switch away/lock the phone (it previously extended the unlock window).
- Dark-theme fix: the "email not verified" notice is now readable (was a light box on dark cards).

### Internationalization

- **Full translation parity across all 7 languages** — backfilled ~200 missing strings (cloud, AI assistant, quote estimator, maintenance, reorder, …) into German, Spanish, French, Japanese, and Chinese, plus 22 more previously-English strings (referral analytics, feedback modal, order notes, purchase-order headers). Nothing falls back to English anymore.
- **Customer portal + remote-mobile** are fully localized (English/Arabic with RTL); the server-rendered status page now matches the dark portal theme.

## [3.0.0-beta.2] - 2026-06-20

**Pre-release (beta)** — growth + customer-experience additions on top of the 3.0 platform. All opt-in; the app still runs fully offline.

### Added

- **AI shop assistant** — an **Ask AI** button (dashboard) answers questions from your own shop data (revenue this/last month, outstanding, overdue, top materials, low stock). Grounded in a curated summary — it won't invent numbers. Uses your Anthropic key.
- **Customer portal accounts** — customers sign in at `cloud.khaytapp.com/portal` with their email + a one-time code (no password) and see **all** their orders, quotes, and deposits in one place.
- **Deposit on quote approval** — when publishing a quote, attach a deposit amount + a payment link from **any** provider; the customer pays from the portal and "paid" is confirmed via a secret-gated webhook (Khayt stays provider-agnostic).
- **Owner notifications** — the cloud emails you when a customer approves/declines a quote or pays a deposit.

### Changed

- **Your plan** is shown in the desktop Khayt Cloud card and the mobile app; cloud plans are operator-defined and **runtime-managed** (no redeploy to change).

## [3.0.0-beta.1] - 2026-06-20

**Khayt 3.0 — first beta.** Version realignment: the cloud platform shipped under the `2.8.0-beta.1…5` line is the **Khayt 3.0** initiative, so the version now reflects that. No features were removed; this is `2.8.0-beta.5` renamed to the 3.0 line, plus the items below. The app still runs fully offline — every 3.0 capability is opt-in.

### The 3.0 platform (recap)

- **Khayt Cloud** — opt-in, end-to-end-encrypted sync: email+password accounts, multi-device, background auto-sync, password reset + email verification. The server only ever stores ciphertext.
- **Customer portal** — public, owner-curated order-status links and quote approve/decline (an approved quote advances the order). Auto-refreshes on status change.
- **AI assist** — quote-from-description, AI-drafted customer messages, and consumption-aware reorder suggestions (your own Anthropic key).
- **Remote mobile** — a PWA at `cloud.khaytapp.com/m`: read your shop and advance order status from your phone, decrypted in the browser, installable + offline + Arabic/RTL.
- **Billing (optional)** — a provider-agnostic plan/entitlement system: define plans + limits in config; wire any payment provider via one normalized webhook. Your plan shows in the app and the PWA.

### Added (since 2.8.0-beta.5)

- **Your plan** is shown in the desktop Khayt Cloud card and the mobile PWA (silent when the server has billing disabled).

## [2.8.0-beta.5] - 2026-06-20

**Pre-release (beta)** — **Khayt on your phone.** A mobile web app (PWA), served by Khayt Cloud, lets you check your shop anywhere — fully end-to-end encrypted.

### Added

- **Remote mobile (PWA)** — open `cloud.khaytapp.com/m` on your phone, log in, and unlock with your sync passphrase to see a read-only **Dashboard** (active orders, open quotes, low stock) and **Orders** list, plus **advance an order's status** from your phone. Everything is decrypted **in the browser** (the server only ever holds ciphertext); the passphrase never leaves your device. Installable, works offline (app shell), Arabic/RTL, and auto-locks when idle.

### Internal

- Browser-portable E2E crypto verified byte-compatible with the desktop: WebCrypto AES-256-GCM (`lib/sync-crypto-web.js`) + a pure-JS scrypt (`lib/scrypt-js.js`, matches Node incl. N=32768). The PWA + serving live in the cloud repo.

## [2.8.0-beta.4] - 2026-06-20

**Pre-release (beta)** — follow-up to beta.3: smarter restocking and a self-maintaining customer portal.

### Added

- **Reorder suggestions** — beyond the low-stock badge: the dashboard low-stock card now opens a consumption-aware list that estimates each spool's usage from the last 30 days of completed orders, projects **days until empty**, and suggests a **reorder quantity** to cover the next ~45 days. **Copy list** / **Share WhatsApp** turns it into a supplier-ready order.

### Changed

- **Customer portal links stay current** — a published order/quote status link now **auto-refreshes when the order's status changes** (no manual re-publish). An approved quote that advances to Pending updates the public page automatically.

## [2.8.0-beta.3] - 2026-06-19

**Pre-release (beta)** — the 3.0 platform comes alive: **Khayt Cloud** (opt-in, end-to-end-encrypted sync) goes from dormant foundation to a working multi-device service, plus a **customer portal** and **AI-drafted customer messages**. Everything is opt-in — with cloud off, the app behaves exactly as before and runs fully offline.

### Added

- **Khayt Cloud — opt-in E2E sync.** Sign up with an email + password and sync your shop across devices, end-to-end encrypted: the server only ever stores ciphertext (it can't read your data). Two independent secrets — an **account password** (sign-in, resettable) and a **sync passphrase** (encryption, never uploaded; backed by a one-time recovery key). Settings → Khayt Cloud.
  - **Multi-device** — log in on another device and pull your data; the encrypted keyset is delivered on login and unlocked locally with your passphrase.
  - **Auto-sync on save** — changes sync in the background (debounced) with automatic conflict resolution (last-write-wins by revision, append-only logs preserved, deletes honored). Manual **Sync now** / **Restore from cloud** also available.
  - **Account recovery** — **password reset** and **email verification** via an emailed code.
- **Customer portal.** Publish a public, owner-curated status link for an order (`/p/…`) that works anywhere — shows only what you choose (shop, order #, status, due date). For quotes, the customer can **Approve / Decline** from the link, and an approved quote advances the order to Pending. Share via QR / Copy / WhatsApp.
- **AI message drafting (BYO key).** A new **✨ Draft message (AI)** order action drafts a short, localized customer message — status update, ready-for-pickup, quote follow-up, payment reminder, or a custom note — from the order's facts. You edit before sending (Copy / WhatsApp / Email). Uses your own Anthropic key; never invents prices or dates.

### Internal

- Cloud backend (separate repo) with per-IP rate limiting, per-shop storage caps, admin usage stats, and CI (Node tests + PHP lint); runs on managed PHP/MySQL hosting with no process to babysit.
- Test suite 527 → 549 desktop tests; cloud backend 15 tests.

## [2.8.0-beta.2] - 2026-06-19

**Pre-release (beta)** — the first 2.8 desktop feature drop: AI-assisted quoting, recurring maintenance, team roles, accounting export, print-farm scheduling, and more. The 3.0 platform foundations are present but dormant (opt-in, no behavior change when off).

### Added

- **AI quote (BYO key)** — describe a job in plain language and the assistant fills the cost calculator (print time, weight, material); the existing calculator still computes the price. Opt-in, off by default, uses your own Anthropic API key (stored encrypted, redacted from exports), and falls back to the manual form on any error. *Set up via the "🤖 AI quote" button by the calculator.*
- **Maintenance scheduler** — recurring, hours- or date-based preventive-maintenance tasks per machine, with due/overdue reminders in notifications and mark-done logging.
- **Team roles (RBAC)** — operators get a structured access level (Owner / Manager / Operator / Viewer); tab visibility follows a permission matrix. Backward compatible with the existing operator lock; legacy roles map automatically.
- **Accounting export** — export invoices and expenses to CSV (generic / QuickBooks / Xero / Zoho), VAT-aware and multi-currency, from the analytics toolbar.
- **Print-farm scheduling** — an assistive "Suggest assignments" action proposes which printer prints which job (by material, capability, deadline, and load); you review and apply.
- **Recurring-order reminders** — robust due-date detection for recurring customers surfaces as queue reminders.
- **Loyalty points** — a per-client points balance (earned on completed orders) shown on the client card.

### Fixed

- **G-code parsing** — print time and filament weight are now read from the file **footer** too (PrusaSlicer / SuperSlicer / OrcaSlicer write their summary there), so auto-fill works for the common slicers; filament type is also detected.

### Internal

- 3.0 platform foundations (all opt-in, no behavior change when off): local sync engine with change-tracking + deltas, end-to-end sync crypto, and the cloud sync-protocol client. A jsdom render-path test harness and 8 feature-core libraries. Test suite 288 → 527.

## [2.8.0-beta.1] - 2026-06-18

**Pre-release (beta)** — opens the 2.8 line over 2.7.0. The desktop app is functionally **unchanged** from `2.7.0`; this cycle's work is the iOS companion and internal test infrastructure, so the desktop build here is a checkpoint rather than a feature drop.

### Added

- **iOS Companion v2** ([`ios/`](./ios/)) — native SwiftUI redesign plus: live printer monitoring (progress / temps), clients with history, walk-in intake triage, in-app order creation and machine assignment, inventory edit/delete, and a Home Screen queue widget. LAN-only; the desktop app remains the source of truth. (Companion ships via Xcode, not the desktop release artifacts.)

### Changed

- **Tests** — added a jsdom render-path harness (`test/helpers/dom.js`) that loads the real `renderer/index.html`, so DOM-rendering fixes get real regression coverage instead of throwaway scripts. Locks in the 2.7 invoicing/analytics render-path fixes; suite now 293 tests.

## [2.7.0] - 2026-06-18

Graduates the 2.7.0 beta line (`v2.7.0-beta.1` → `beta.3`) to a stable release over `2.6.0`. A correctness/quality pass across inventory, invoicing, the production queue, analytics, settings, and localization. Highlights, consolidated from the per-prerelease sections below:

### Fixed

- **Filament accounting** — corrected spool reservation / over-commit (it was inert for normal parts), double-counted split prints, lost partial shortfalls, valuation that overstated partly-used spools, and a "NaN d" forecast.
- **Invoicing** — milestone invoices no longer re-bill the full shipping / rush / extras on each milestone.
- **Production queue** — a requeued card no longer jumps the queue after a column move; a paused print no longer shows a false "Overdue".
- **Order status** — reopening a completed order resets its completion state; completing directly from on-hold clears the hold.
- **Analytics** — quote conversion rate can no longer exceed 100%; no `-Infinity%` margins; SLA on-time uses local dates; client-LTV ranks by actual time.
- **Settings** — nested config (BNPL/email/ZATCA/LAN) deep-merges, so a saved partial value keeps its defaults.

### Changed

- **Localization** — German, Spanish, French, Japanese, and Chinese brought to full key parity with English (previously English-only on newer surfaces), then reviewed for terminology consistency. Dead "orphan" keys removed.

### Security

- **`/api/survey`** is now per-IP rate-limited, and LAN **CORS** no longer reflects arbitrary origins on PIN-gated routes (limited to loopback / LAN).

## [2.7.0-beta.3] - 2026-06-18

**Pre-release (beta)** — accounting/inventory/UI correctness + CORS hardening, on top of 2.7.0-beta.2.

### Fixed

- **Inventory** — valuation no longer overstates the value of partly-used spools that lack a recorded original weight (M3); the days-remaining forecast no longer renders "NaN" for non-numeric weights (M8).
- **Invoicing** — milestone invoices no longer re-bill the full shipping / rush / extras / discount on top of each milestone amount (M1).
- **Settings** — nested config (BNPL, email, ZATCA, LAN, …) now deep-merges, so a saved partial value (e.g. one BNPL provider's key) keeps the sibling defaults instead of dropping them (M2).
- **Production queue** — a manually-reordered card no longer jumps the queue after moving to another column (queue order is now column-scoped, M6); a paused print's estimated-completion badge no longer shows "Overdue" while paused (M7).

### Security

- **LAN CORS** — PIN-gated routes no longer reflect an arbitrary `http://` Origin; the reflected origin is limited to loopback / LAN hosts.

### Changed

- **Localization** — German, Spanish, French, Japanese, and Chinese are at full key parity with English (removed dead "orphan" keys left over from past renames).

## [2.7.0-beta.2] - 2026-06-18

**Pre-release (beta)** — correctness fixes, on top of 2.7.0-beta.1.

### Fixed

- **Order status transitions** — reopening a completed order (e.g. dragging it back for a reprint) now resets its completion state, so the print timer restarts fresh and the reprint re-deducts filament; completing directly from on-hold now clears the hold flags.
- **Analytics** — the quote conversion rate no longer exceeds 100% (measured within the created cohort); product margin no longer shows `-Infinity%` for zero-revenue jobs; SLA on-time/late uses local dates (no day-boundary flips); client-LTV "last order" ranks by actual time rather than a mixed string compare.

### Security

- **`/api/survey`** is now per-IP rate-limited — it was the only store-mutating public LAN route without a throttle (token-gated only).

## [2.7.0-beta.1] - 2026-06-18

**Pre-release (beta)** — first 2.7 beta, on top of stable 2.6.0.

### Fixed

- **Filament accounting (inventory)** — three deduction bugs corrected:
  - the over-commit / reservation check keyed on the optional per-part spool and so was inert for normal parts (which carry only a material) — it now mirrors the actual deduction, so over-commit warnings and reserved-grams reflect real demand;
  - split prints recorded via the spool-switch flow no longer double-count filament (completion deducts only the remainder);
  - a partial shortfall on the chosen spool is now drawn from other same-material spools (location-preferred) instead of being silently lost.

### Changed

- **Localization** — German, Spanish, French, Japanese, and Chinese reach full key parity with English: 296 previously-English-only strings (the Workbench/Command/Vivid/Cockpit/Atlas dashboards, the updater dialog, quote follow-up, per-location inventory + transfers, electricity/exchange-rate helpers, label printing) are now translated. These are AI-generated and pending a native-speaker review pass.

## [2.6.0] - 2026-06-18

Graduates the 2.6.0 beta line (`v2.6.0-beta.1` → `beta.8`) to a stable release over `2.5.0`. Highlights, consolidated from the per-prerelease sections below:

### Added

- **Redesigned themes** — three new light-default, native-feel designs: **Workbench** (the new default), **Command**, and **Vivid**, replacing the previous default. The earlier themes remain selectable as legacy options.
- **Printer alerting** — notifications when a printer goes into error, offline, or stall, over Telegram / webhook / email, with per-printer cooldowns.
- **Per-location inventory** — assign spools to a branch; inventory, low-stock/reorder, valuation, and auto-deduction scope to the active location. Stock transfers and 62 mm spool QR labels.
- **Live currency rates** and **per-country electricity rates** in the calculator.
- **Quote follow-up automation** — opt-in expiring-quote nudges.

### Changed

- **Salted PBKDF2 PIN hashing** — operator/admin PINs and recovery codes now use salted PBKDF2-SHA256 (existing PINs upgrade transparently).

### Fixed

- **ZATCA Phase-2 signing** — invoice signatures are no longer double-hashed (would have been rejected by ZATCA).
- **Invoicing** — fixed a crash that broke all invoice rendering, and corrected credit-note accounting (was double-counted in balances/payment status).
- **Data safety** — a malformed collection no longer discards the whole store on load; saves no longer fail for shops with a stored ZATCA/BNPL/Telegram/LAN secret.
- **Localization** — restored dropped placeholders across Arabic confirm dialogs/toasts/badges and the de/es/fr/zh low-stock alert; RTL fixes.

## [2.6.0-beta.8] - 2026-06-17

**Pre-release (beta)** — QA pass: language review, security + bug scan, UI review.

### Fixed

- **Invoices failed to render** — a missing variable (`subtotalShown`) threw on every invoice generate/print/PDF/WhatsApp path. (regression)
- **Credit notes were double-counted** — a credit note reduced `paidAmount` *and* was subtracted again from the balance, so refunded/credited orders showed the wrong outstanding amount and payment status. Credit now reduces the amount **due** exactly once, consistently across balances, statements, and payment status.
- **Saving could fail (data loss) for some shops** — the secret-merge step crashed when a ZATCA / BNPL / Telegram / LAN secret was stored on disk but the incoming snapshot had no `settings`, so that save was dropped.
- **Analytics could show "NaN"** print-hours when an order lacked a print time.
- **Localization** — restored dropped `{placeholders}` in **28 Arabic** strings (credit-limit and over-commit confirm dialogs, capacity/tier/progress toasts and badges) that were showing without their amounts/dates/counts; restored the material + quantity in the **German / Spanish / French / Chinese** low-stock alert; fixed the Arabic "view queue" / "go" arrows to point the right way in RTL.
- **Command theme** — the status-bar clock now follows the app language instead of always rendering Western digits.

### Added

- CI guard (`locale-parity` test) that fails if an Arabic string drops an English `{placeholder}`.

## [2.6.0-beta.7] - 2026-06-17

**Pre-release (beta)** — theme-picker polish + documentation refresh, on top of 2.6.0-beta.6.

### Changed

- **Theme-picker previews** — Settings → Preferences → Design now shows real preview thumbnails for the **Workbench**, **Command**, and **Vivid** themes (they previously shipped as placeholders).
- Refreshed the README screenshots and theme documentation to the current Workbench design, and removed unused legacy screenshot galleries.

## [2.6.0-beta.6] - 2026-06-17

**Pre-release (beta)** — two features off the backlog plus repo cleanup, on top of 2.6.0-beta.5.

### Added

- **Printer alerting** — fires a notification when a printer goes into **error**, **offline** (after repeated failed polls), or **stall** (progress frozen mid-print), through the existing Telegram / webhook / email channels, with per-printer cooldowns. Toggle each under Settings → Telegram.
- **Per-location inventory + spool QR labels** — spools can be assigned to a branch; the inventory list, low-stock/reorder alerts, valuation, and auto-deduction scope to the active location (legacy/unassigned stock stays visible). Transfer stock between branches, and print a 62 mm QR label for a spool.

### Changed

- Repository cleanup: pruned ~60 merged/closed branches and removed leftover dev scripts.

## [2.6.0-beta.5] - 2026-06-17

**Pre-release (beta)** — security hardening, on top of 2.6.0-beta.4.

### Security

- **Salted PIN hashing** — operator/admin PINs and recovery codes are now hashed with salted PBKDF2-SHA256 instead of unsalted SHA-256, so a leaked store can't be brute-forced offline as easily. Existing PINs keep working (verified transparently) and upgrade to the salted format when next set.

## [2.6.0-beta.4] - 2026-06-17

**Pre-release (beta)** — a comprehensive security/correctness audit pass plus two new features, on top of 2.6.0-beta.3.

### Added

- **Live currency rates** — Settings → Payments → Exchange rates has a **Fetch live rates** button that pulls current FX from a free no-key service (with a "last updated" stamp); manual edits still work.
- **Electricity rate by location** — the Calculator's Electricity field has a **📍 Auto** button that asks for your country and fills a typical commercial rate, converting into your base currency via your saved exchange rates.

### Fixed

- **ZATCA Phase-2 signing (critical)** — invoice signatures were double-hashed and would have been rejected by ZATCA; they now sign `SHA256(canonical)` so the signature matches the reported invoice hash.
- **Data safety** — a single malformed collection no longer discards the whole store on load (valid data is salvaged); fully-credited orders no longer show as outstanding.
- **Invoicing** — invoice summary now reconciles (Subtotal + Rush + Shipping = Total, VAT shown as included); client statement is base-currency consistent and no longer double-counts gift-card-settled orders.
- **Calculator** — live price preview matches the committed cart cost (includes extras + packaging).
- **Inventory** — spool reservation, over-commit, and forecast now match actual deduction (support weight × quantity).
- **Orders** — order-completion webhooks + post-sale survey token now fire (were unreachable); priority badge shows the level, not "true"; assorted crash guards (due-date suggest, invoice timestamps).
- **macOS window controls** — the new themes' title strip is now macOS-only, so it doesn't add an empty strip on Windows/Linux.

### Security

- XSS escaping in the Command dashboard; `save-html` forced to a safe extension (RCE guard); CSS-injection sinks use a color sanitizer; SMTP refuses plaintext credential auth; webhook timeout + DNS-rebinding recheck; printer-poll host allowlist tightened; `export-pdf` write confinement; navigation locked to the app; tunnel refuses weak PINs; Salla/Zid webhook replay protection; webhook token header-only.

### Accessibility

- Vivid colored band contrast (dark scrim); nav group-label contrast and keyboard focus rings; status-chip contrast (light + dark); Command inspector exposed to screen readers when open; monochrome kanban/rail icons.

## [2.6.0-beta.3] - 2026-06-17

**Pre-release (beta)** — visual QA pass over the new design system, on top of 2.6.0-beta.2.

### Fixed

- **macOS window controls** — Workbench / Command / Vivid hid the title bar, so the traffic-light buttons overlapped the sidebar brand / icon rail. Restored a slim, draggable title strip that reserves room for them.
- **Workbench top bar** — the language/location selects could drop onto a second row; the bar is now a single non-wrapping row (the search shrinks first), and "All locations" is no longer cramped.
- **Command** — the open-tab strip no longer overlaps the ⌘K search, and is hidden when only one screen is open (it previously just echoed the page title).
- **Vivid** — white top-band controls stay legible on the lighter per-module hues (Orders / Analytics); the location/language selects now match the band's glass treatment.
- **All new themes** — the notification count badge is anchored to the bell instead of drifting to the toolbar edge; dark-mode colour swatches (filament dot, spool card) get a faint ring so near-black fills stay visible.

## [2.6.0-beta.2] - 2026-06-17

**Pre-release (beta)** — a new default design system plus UI fixes, on top of 2.6.0-beta.1.

### Added

- **New design system — Workbench / Command / Vivid** — three light-default, native-app designs replacing the previous theme line. **Workbench is the new default.** The seven legacy designs (Studio, Ledger, Console, Atelier, Vitrine, Cockpit, Atlas) are hidden from the picker (code retained for now), and existing installs auto-migrate to the nearest new design (studio/ledger/console → Workbench, cockpit/atlas → Command, vitrine/atelier → Vivid).

### Fixed

- **Top bar** — the language/location dropdown text was vertically clipped; the new shells also showed a duplicate search control and could wrap to multiple rows. Now a single, slim, one-row bar.
- **Calculator** — the primary button is correctly labelled “Create order & send to queue” (was mislabelled “Save quote”) and confirms before creating an order from a non-empty build.
- **Clients** — sortable columns and a display cap on large lists.

### Changed

- Form grids collapse to a single column below 600px, so inputs aren’t squeezed in narrow windows/modals.

## [2.6.0-beta.1] - 2026-06-16

**Pre-release (beta)** — UI usability & accessibility, the update-review modal, the iOS companion, print-farm multi-site, and new LAN write endpoints, on top of stable **2.5.0**.

### Added

- **iOS Companion app** — native SwiftUI app over the desktop LAN API: home quick actions, queue/kanban strip, orders (active filters + history), order/spool detail, inventory search + low-stock, English/Arabic + RTL, connection banner, local notifications, home-screen widget, Siri shortcuts. NFC tag **read**, and NFC tag **write** with an OpenTag3D / OpenPrintTag / OpenSpool standard picker (default OpenTag3D for desktop-reader compatibility).
- **Print farm — sites & location filter** — top-bar location filter scopes dashboard KPIs, production queue, machine queues, and orders log; **Sites overview** on the dashboard (Professional, 2+ locations); wizard **Print farm** preset (Professional mode, default WIP limits, second-site stub).
- **LAN write endpoints** — `GET`/`PATCH /api/waiting-list`, `GET /api/clients`, `PATCH`/`DELETE /api/inventory/:id`, `machineId` on `PATCH /api/orders/:id`, `POST /api/orders`, and live telemetry — all with field allowlists, prototype-safe JSON parsing, and tunnel-aware rate limiting.
- **Quote follow-up** — dashboard "Expiring quotes" card with one-click WhatsApp/email follow-up, plus an opt-in auto-nudge for quotes nearing expiry (off by default).
- **Global search** — fuzzy/subsequence matching plus printers, suppliers, and expenses results; main-nav arrow-key (and Home/End) tab switching.
- **Update changelog screen** — manual “Check for updates” and the automatic launch check show release notes in a review modal before download/install (keeps the pre-update backup and hardened install flow).

### Fixed

- **Setup wizard** — selecting **Print farm** / **Company B2B** now correctly saves Professional mode (was always saved as Simple); **Back** buttons no longer skip the security step.
- **Modals** — focus trap keeps Tab inside dialogs; focus restores to the previous element on close.
- **Settings save** — post-process presets are no longer wiped when saving other settings panels.
- **Global search** — client and product results navigate to the correct record; keyboard ↑/↓ + Enter works.
- **Help shortcut** — `?` opens help again (Shift was incorrectly blocked).
- **Delete safety** — locations and operators require confirmation before deletion.
- **Notifications** — bell exposes `aria-expanded`; toast container announces to screen readers.
- **Feedback** — toast when the email app cannot be opened (suggests the GitHub Issue button).
- **QC-fail analytics** — waste cost no longer divides by a depleted spool's zero weight (was writing `Infinity`/`NaN` into waste/profit totals).
- **Recurring expenses** — the next-due date stays on its anchor day instead of drifting each cycle.
- **ZATCA Phase-2 QR** — invoice fields over 255 bytes now encode a valid TLV length (no malformed signed QR).
- **Inventory low-stock** — one consistent threshold check so the banner and row badge agree; multi-part completion now shows a single summary toast so the low-stock warning isn't dropped by the toast cap.

### Changed

- **Preferences** — language and theme apply immediately when changed.
- **Settings on narrow windows** — section nav stacks/wraps on small screens.
- **Undo** on order status moves and on spool / client / waiting-list deletes; wide tables scroll horizontally instead of clipping columns.
- Removed dead wizard code/markup, 17 unused legacy locale keys, and 57 orphaned flat keys; new `upd.*`, `search.*`, `farm.*`, `loc.*`, and iOS/LAN strings added in English and Arabic; a `locale-parity` test now gates `ar ⊇ en`.

### Security

- **NFC tag parsing** — CBOR/NDEF decoders bound all counts/lengths, cap recursion, and limit paste size, so a malformed tag dump can't hang the app.
- **LAN tunnel** — added a global failed-auth throttle backstop (per-IP lockout can be bypassed via spoofed `X-Forwarded-For`) and a weak-PIN warning when exposing over a tunnel.
- **Dependencies** — pinned `form-data ^4.0.6` (GHSA-hmw2-7cc7-3qxx).

## [2.5.0] - 2026-06-16

Graduates the Khayt-4 beta line (`v2.4.0-beta.1` → `beta.4`) to a stable release: seven selectable design themes, the Settings redesign, the LAN/security hardening pass, and the beta→stable updater. Released as **2.5.0** (minor) over stable `2.3.3` — the `2.4.0` number was only ever published as pre-releases. Per-prerelease detail is consolidated in the sections below.

### Fixed

- **Beta → stable graduation (updater)** — `isVersionNewer` is now prerelease-aware: a stable release outranks its own prerelease (`2.4.0 > 2.4.0-beta.4 > 2.4.0-beta.1`, and `2.4.0-rc.1 > 2.4.0-beta.9`). Previously the prerelease suffix was stripped before comparison, so a final `2.4.0` would report "up to date" to every `2.4.0-beta.x` tester and never offer the graduation build.

### Added

- **Opt-in beta updates** — `applyUpdateOptions` / `hub:set-update-options` and an `allowBeta` flag on `interpretUpdateCheckResult`; prerelease offers are hidden from stable installs unless beta is opted in (Settings → Data & Locale → Include beta pre-releases).

## [2.4.0-beta.4] - 2026-06-11

**Pre-release (beta)** — Settings redesign.

### Changed

- **Settings navigation** — the in-Settings section list is now a horizontal tab strip across the top (instead of a second left sidebar), with the active section marked by an accent underline and a thin General/Advanced divider.
- **Settings layout** — every section is now a stack of themed cards (grouped sub-sections) with a readable, centered content width, replacing the full-width forms. All 11 sections (Business, Preferences, Inventory, Invoice & Tax, Payments, Printers, Online, Operations, Automation, Access, Data & Locale) follow the same pattern.
- New section/header strings added across all 7 locales.

## [2.4.0-beta.3] - 2026-06-11

**Pre-release (beta)** — Review follow-up: updater channel fixes, LAN hardening, SMTP injection fix, theme polish.

### Fixed

- **Beta channel applied at boot** — the saved *Include beta pre-releases* preference is now pushed to the updater during startup, so opted-in testers are offered beta builds on the automatic launch check (previously only synced after opening Settings).
- **Beta → stable graduation** — `isVersionNewer` is now prerelease-aware: a stable release outranks its own prerelease (`2.4.0 > 2.4.0-beta.2`), so beta testers are correctly offered the final release instead of being told they're up to date.
- **LAN no-PIN hang** — owner-data GET endpoints (`/api/orders`, `/api/queue`, `/api/machines`, `/api/inventory`, `/`) return `401` instead of leaving the socket open when no LAN PIN is configured.
- **Theme shell teardown** — ledger/console page-header is reclaimed by id (matching mount) on theme switch, removing a fragile class-only lookup.

### Security

- **SMTP header/command injection** — custom-SMTP `From`/`To`/`Subject` are stripped of CR/LF and control chars, and message bodies are dot-stuffed (RFC 5321), preventing injection via customer-influenced recipient/subject or body content.
- **Tunnel rate-limiting** — brute-force lockouts and intake limits derive the client IP from the tunnel's `X-Forwarded-For` first hop when a remote tunnel is active, so per-client limits no longer collapse into one shared bucket.
- **Survey page hardening** — inline-script JSON on the customer status page is `</script>`-safe (escapes `<`, `>`, `&`), closing a latent stored-XSS sink.

### Accessibility

- **Atlas nav** — active navigation item exposes `aria-current="page"` for screen readers.

## [2.4.0-beta.2] - 2026-06-05

**Pre-release (beta)** — Security hardening pass + stable **v2.3.3** updater parity.

### Added

- **Opt-in beta updates** — same as stable v2.3.3: Settings → Data & Locale → **Include beta pre-releases** (off by default).

### Security

- **Printer webhook lockout** — failed auth uses isolated `printer` channel key (no longer locks owner PIN).
- **LAN spool POST** — field allowlist on `/api/inventory/spools`; arbitrary keys dropped.
- **Intake reference links** — `http`/`https` only at ingestion (`javascript:` / `data:` rejected).
- **LAN HTML pages** — `CSP`, `X-Frame-Options`, `nosniff`, `Referrer-Policy` on customer-facing HTML.
- **Update flush** — `hub:install-update` normalizes store snapshot before disk write.
- **Confirm modal XSS** — `promptTypeConfirmModal` always escapes message text.
- **`safeJsonParse`** — strips `prototype` keys (defense in depth).

### Fixed

- **LAN IDs** — spool/intake/Salla/Zid IDs include random suffix (collision-safe).
- **PWA manifest** — `shopName` JSON escaping fixed (no double-escaped quotes).

## [2.4.0-beta.1] - 2026-06-05

**Pre-release (beta)** — Khayt-4 design themes ship beside stable **v2.3.2**. Install from [GitHub Releases → Pre-releases](https://github.com/khaytapp/Khayt/releases). Stable installs do not auto-update to beta; see [docs/BETA-RELEASE.md](./docs/BETA-RELEASE.md).

### Added

- **Design themes** — Settings → Preferences: **Studio** (sidebar) or **Workshop Ledger** (masthead + horizontal tabs); per-design accents from the Khayt-3 handoff. Reserved slots: **Blueprint**, **Atlas**.
- **Theme template system** — `renderer/themes/_template/` + `themes/custom/` registry for community themes; see [docs/THEMES.md](./docs/THEMES.md).
- **Local UI fonts** — Archivo, Hanken Grotesk, IBM Plex Mono/Arabic vendored under `renderer/fonts/` (CSP-safe, no Google Fonts).
- **Theme previews** — Visual theme picker with screenshots in Settings and setup wizard (`renderer/themes/previews/`, `npm run capture:theme-previews`).
- **Handoff screen parity** — Studio screen enhancements (KPI grid, queue filters, calculator breakdown, inventory stats, client cards) now apply to Workshop Ledger via shared `khayt-handoff` layer.
- **Handoff analytics** — Analytics tab KPI row, machine P&L bars, production heatmap, and top-clients table for Studio and Ledger themes.
- **Control Room theme** — Khayt-4 direction C: graphite console shell with command bar, 64px code rail (DSH/QUE/…), `//` page headers, and status bar; four signal accents (phosphor, amber, cyan, monochrome).
- **Atelier theme** — Khayt-4 direction D: cream gallery canvas, floating sidebar, serif display headers, pill controls; clay/sage/sea/violet accents.
- **Vitrine theme** — Khayt-4 direction E: ambient glass backdrop, frosted sidebar, glowing accents; aurora/iris/orchid/sunset presets.
- **Cockpit theme** — Khayt-4 direction F: 74px icon rail, ops dashboard (fleet + day timeline + attention feed), chunky poster chrome; electric/violet/emerald/flare accents.
- **Spectrum skins** — Cockpit sub-setting: Poster (default), Lumen, Draft, Clay via `data-skin`.
- **Atlas theme** — Khayt-4 Frontier direction H: spatial floor map with live machine stations, zone layout, and inspector panel; phosphor/ember/iris/signal accents.
- **Frontier reserved** — Pulse (command-first) and Stream (conversational ops) registered as coming-soon themes.
- **Khayt-4 QA** — `test/themes-qa.test.js` (previews, locale keys, shells); `npm run test:e2e:themes` (seven-theme nav + Atlas RTL); Arabic theme strings in `ar.js`.
- **Phase 1 complete** — Studio `ds.css` scoped to prevent Ledger bleed; app-only tabs and Settings use handoff polish (SVG nav icons, themed toolbars/tables).

### Fixed

- **Workshop Ledger tabs** — Studio sidebar CSS no longer leaks into Ledger (horizontal tab strip, active underline, Settings tab); grid layout and collapsed-sidebar state fixed for Ledger shell.

### Security

- **Tunnel rate-limiting** — Brute-force lockouts and intake rate limits now derive the client IP from the tunnel's `X-Forwarded-For` first hop when a remote tunnel is active, so per-client limits no longer collapse into one shared bucket (a single client could otherwise lock out everyone).
- **Webhook lockout isolation** — Printer-webhook auth failures use a dedicated lockout channel; a misconfigured printer spamming bad tokens can no longer lock the owner out of PIN/queue access (and vice versa).
- **Survey page hardening** — Inline-script JSON on the customer status page is now `</script>`-safe (escapes `<`, `>`, `&`), closing a latent stored-XSS sink.
- **Dead code removal** — Removed the unused intake-PIN page that implied the public intake form was PIN-gated.
- **Calendar feed** — `/calendar.ics` requires `?token=` (auto-generated `calendarToken`); iCal export copies the subscription link.
- **Intake abuse** — Rate limit on new intake session grants (40/hour per IP).
- **URL sinks** — Supplier website links and product/portfolio thumbnails sanitized via `safeHttpUrl` / `safeImageSrc`.
- **Keychain warning** — Boot toast when OS secure storage is unavailable.

### Fixed

- **LAN no-PIN hang** — Owner-data GET endpoints (`/api/orders`, `/api/queue`, `/api/machines`, `/api/inventory`, `/`) now return `401` instead of leaving the socket open when no LAN PIN is configured.
- **Fonts / CSP** — The runtime CSP header now matches the renderer's meta CSP, so the bundled web fonts (including IBM Plex Sans Arabic for RTL) load instead of silently falling back to system fonts.
- **Survey export** — Interactive HTML pages keep their scripts; `JSON.parse` replaces missing `safeJsonParse` in exported surveys.
- **Start Tunnel** — Syncs LAN form before start; owner PIN resolved from disk (not blocked by masked UI state).
- **Tunnel restore** — `tunnelEnabled` restores tunnel after LAN server starts on boot.
- **LAN status UI** — Online/LAN panels reflect live server state via `getLanUrl()`, not just saved config.
- **Email / webhooks** — Failures surface warning toasts instead of failing silently.
- **Machine secrets** — Secret merge uses machine ID only (no array-index fallback).

### Security

- **Quote approval** — `GET /order/:id/quote` now requires a valid `?token=`; order IDs alone no longer expose quote details or mint approval tokens.
- **Printer secrets** — Mask `printerApi.accessCode` in renderer even when `apiKey` is absent.
- **LAN tunnel** — Stopping or restarting the LAN server now closes an active remote tunnel.

### Added

- **Security audit doc** — [docs/SECURITY-AUDIT.md](./docs/SECURITY-AUDIT.md) with findings, fixes, and open items.

### Fixed

- **Settings panel Save** — Buttons in Preferences, Stock, Invoice, Online, etc. now save via `saveSettingsFromPanel()`.
- **Settings save data loss** — `saveSettingsFromForm()` no longer drops `onlineEnabled`, app security, or quote numbering fields.

- **Platform decision doc** — [docs/PLATFORM-MIGRATION.md](./docs/PLATFORM-MIGRATION.md): stay on Electron; when/how to revisit Tauri or shared core (not Swift+C++ per OS).
- **Online option** — Settings and setup wizard toggle to enable customer quote requests via LAN intake link (`/intake`); panel on Job Intake with copy link; no Khayt cloud.
- **Online hub** — Settings panel lists intake, quote-approval, and tracking links (copy per order) when LAN server is running.
- **Intake → calculator** — Job Intake “Quote in calculator” pre-fills client, part name, and notes (creates client when needed).
- **Solo maker dashboard** — Simple mode shows a focused “Your shop today” row; farm-style KPI/machine load stays in Professional mode.

### Changed

- **Check for updates (source builds)** — Explains that new work is on `main` via `git pull`, not the DMG feed, while release hold is active.

- **Online settings discoverability** — Dedicated **Settings → Online** sidebar item (enable quote requests, intake link, LAN server); no longer buried at the bottom of Data & Locale.

### Fixed

- **Intake — no customer PIN** — `/intake` always opens the order form when the LAN server is running; the intake PIN gate is removed.
- **Intake QR opens form** — Scanning the LAN QR opens the customer order form directly (no PIN gate). QR always points to `/intake`. The full URL is shown in a box above the QR. Any phone browser hitting `/api/status` (including old QRs) is redirected to `/intake`; API clients use `/api/status?format=json`.
- **Intake PIN visible** — The customer intake PIN is now displayed in plain text with a Copy button in Settings → Online (and as a visible field in LAN settings) so the shop owner can share it with customers. Previously it was masked immediately after server start, making the intake form inaccessible. The PIN value is now returned from the `hub:start-lan-server` IPC response and kept readable in memory.
- **LAN QR target** — In Settings, the LAN QR now opens `/intake` when Online is enabled (phone-friendly) instead of raw `/api/status` JSON; `/api/status` remains fallback when Online is off.
- **QR codes** — Customer portal, quote approval, and exported quote PDFs now show a real QR image; `hub:generate-qr` returns a base64 data URL when `{ dataUrl: true }` is passed (all `<img src>` callsites), raw SVG otherwise.
- **LAN / Online access** — Starting the server with Online enabled (or “Listen on LAN”) now binds to all interfaces; prefers Wi‑Fi IP (192.168.x) over VPN; warns if still localhost-only.
- **Settings sidebar** — Business / Online / Data & Locale (and other sections) switch correctly again; `openSettingsSection` is exported from the shell module (clicks had been failing silently).
- **Store load on macOS** — Keychain explanation dialog used invalid Electron `showMessageBox` type (`information` → `info`); load no longer fails if the dialog errors.
- **Check for updates** — Returns a real status from the updater (dev/source builds, errors, and version numbers) instead of assuming “up to date” after a timeout when the check failed or the app was not packaged.

## [2.3.2] - 2026-06-04

### Fixed

- **Setup wizard** — No longer reopens on every launch when the shop already has data or wizard completion was not persisted (`firstRunDone` / `flushSave` on finish; one-time flag normalization after load).

## [2.3.1] - 2026-06-04

Stabilization patch after **v2.3.0** — bug fixes and dependency hygiene, no new features.

### Fixed

- **Portal QR / tracking links** — Customer portal modal and exported quote PDFs now include `?token=` (portal previously used `/order/:id/status` without a token and returned 403).
- **Operator PIN** — Flush store to disk before main-process PIN verify; avoid stale disk read; renderer fallback if operator missing on disk snapshot.
- **Recurring expenses** — `calcNextDueDate` uses UTC calendar dates so monthly advance is consistent across timezones (off-by-one day outside UTC).

### Changed

- Shared `buildLanOrderTrackingUrl` / `buildLanQuoteApprovalUrl` helpers for consistent LAN links.
- **npm audit** — `overrides` for `localtunnel` nested `axios`/`debug` and build `tmp` (**0** reported vulnerabilities in `npm audit`).
- **155** unit tests in `npm run check`.

## [2.3.0] - 2026-06-04

Stability and security release — consolidate scan passes 4–6 and release hardening. Treat this as the gate before new features.

### Security

- **LAN order tracking** — `GET /order/:id` and static `/status/*.html` require a valid `?token=` matching the order `trackingToken`; new orders get a token at creation; legacy orders receive tokens on load via `ensureOrderTrackingTokens()`.
- **Quote approval** — Per-order `quoteApprovalToken` closes IDOR on public approve routes.
- **Privileged IPC** — Global `hub:*` guard (`lib/ipc-guard.js`): only the main `BrowserWindow` may invoke IPC; legacy per-handler checks retained where needed.
- **Operator PIN** — Verified in the main process via `hub:verify-operator-pin` (timing-safe compare against on-disk store).
- **Legacy status pages** — On-disk HTML scrubbed at startup and when served over LAN (client row removed, scripts stripped).
- **Import / restore** — Full replace via `replaceStoreFromSnapshot()` (no merge-with-old-data on import).
- **Operator PIN pad** — Stacked overlay (does not destroy open modals); timing-safe PIN compare.
- **Status HTML** — Exported and auto-exported pages omit client name (privacy).
- Prior 2.2.4–2.2.7 fixes retained: LAN persistence, serialized saves, webhook redirect block, intake/session hardening, renderer timing-safe secrets, calendar PIN, Mailgun domain sanitize, clipboard/QR limits, inventory POST validation, full-wipe main-process confirm, modal overlay stacking, dead handler wiring.

### Fixed

- Currency labels refresh after settings save; kanban WIP badge; reorder PO modal class; photo upload error toasts; schedule RTL and pause i18n.

### Changed

- **153** unit tests in `npm run check`.

## [2.2.3] - 2026-06-04

### Fixed

- **Mac auto-update stuck on "Saving data…"** — update install no longer re-encrypts the full store twice; pre-update backup copies the on-disk store file instead of sending a huge JSON blob over IPC. Flush and backup steps time out gracefully and continue to install.

## [2.2.2] - 2026-06-04

### Fixed

- **Form modals** — Add client, add printer, and all `openFormModal` dialogs scroll on short screens (sticky header/footer).
- **Currency labels** — Calculator, dashboard, and expense units follow Settings currency instead of locale defaults; labels refresh after language change and wizard setup.
- **LAN quote approval** — Expired quotes can no longer be approved via POST; LAN quote page shows shop currency code.
- **Intake sessions** — Session cookies are bound to the client IP that created them.
- **Store save** — `hub:save-store` normalizes snapshots before writing (same validation as load).
- **Custom SMTP** — Blocks loopback and cloud metadata hosts to reduce SSRF risk (LAN mail relays still allowed).
- **Recovery code modal** and **operator PIN pad** — Scroll when content exceeds viewport.

### Security

- LAN API POST bodies use `safeJsonParse` instead of raw `JSON.parse`.
- Intake PIN generation uses `crypto.randomInt` instead of `Math.random`.
- Recovery code verification uses timing-safe hash comparison.

## [2.2.1] - 2026-05-30

### Added

- **Setup wizard** — language first; optional admin PIN with recovery code (copy/download); re-runs after data reset.
- **App security** — optional admin PIN + recovery code; gates reset and full wipe when enabled.
- **Full wipe** — deletes all local app data and restarts (Settings → Data).

### Changed

- Default theme for new installs is **light**.
- **Reset data** clears inventory completely (no starter spools) and re-opens the setup wizard.

## [2.2.0] - 2026-05-30

Four-bundle release: production shop, ZATCA compliance, LAN quote approval, and platform hardening. Completes [ROADMAP.md](./ROADMAP.md) 2.2.0 goals.

### Added

- **Production shop (Bundle A)** — gift card checkout in payment modal; WIP hard-limit setting; LAN printer polling on private-network hosts.
- **ZATCA & email (Bundle B)** — Phase 2 FATOORA auto-submit on invoice, submission audit log, manual retry, custom SMTP provider.
- **LAN quote approval (Bundle C)** — public `GET/POST /order/:id/quote` approval page; share approval link modal; static export with LAN QR; client-approval sync with invoice numbering and webhooks; post-delivery portal survey.
- **Platform hardening (Bundle D)** — expanded E2E critical flows (tab navigation, order lifecycle, boot/store/LAN PIN via `scripts/e2e/helpers.mjs`); `prestart` / `pretest:e2e` run `scripts/ensure-electron.js` with `npm run install:electron`; `scripts/list-stale-branches.mjs` for superseded PR branches; `npm run check` runs lint + unit tests.

### Fixed

- LAN printer polling now connects to RFC1918 hosts (`192.168.x.x`, `10.x`, `octopi.local`). Previously `isBlockedHost` blocked all private addresses.

## [2.1.2] - 2026-05-30

### Fixed

- Ship Claude-designed app icon assets on `main` (export PNGs + wired `icon.icns` / iconset). Previous releases used the programmatic `make_icon.py` art because only the wire script was merged, not the export files.
- macOS Dock / window icon: set `BrowserWindow.icon` and `app.dock.setIcon()` from `assets/icon_preview.png` in dev.

## [2.1.1] - 2026-05-30

### Fixed

- **Critical:** Export `importClientsCsv` globally so app boot completes — fixes blank dashboard and non-working Settings sidebar links (`wireEvents` aborted mid-setup during 2.1.0 modular split).

### Changed

- Settings → About credits AI-assisted development; production queue toolbar actions lay out horizontally again.
- Removed optional GitHub Sponsors URL field — sponsor button links to the official profile.
- Added missing inventory and queue locale strings; README updated for 2.1.x.
- E2E smoke test now asserts dashboard render and Settings nav.

## [2.1.0] - 2026-05-30

Significant release: modular renderer and main process, store validation, expanded test suite, and CSP hardening. Completes [ROADMAP.md](./ROADMAP.md) 2.1.0 goals.

### Added

- Versioning policy (`VERSIONING.md`), release checklist, and `npm run version:*` helpers.
- Maintainer guide (`CONTRIBUTING.md`) and engineering roadmap (`ROADMAP.md`).
- `npm run lint`, `npm run check`, and `npm test` (120 unit tests).
- `npm run test:e2e` — Electron smoke (launch, store round-trip, LAN PIN gate).
- `npm run i18n:extract` — locale file extraction; per-language bundles in `renderer/locales/*.js`.
- `lib/store-io.js`, `lib/updater.js`, `lib/lan-server.js`, `lib/zatca-crypto.js` — split from `main.js`.
- `renderer/store-validate.js` — snapshot shape checks and normalization on load.
- Renderer modules split from `app.js`: `app-state`, `shell`, `app-helpers`, `app-boot`, `app-exports`, `wire-events`, `build`, `inventory`, `machines`, `clients`, `expenses`, `waste`, `views`, `notifications`, `ops-locations`, `integrations`, `operations-extras`, `kanban`, `invoicing`, `logs`, `settings`, `order-flows`, `waiting-list`, `dashboard`, `analytics`, and related helpers (`format`, `util`, `currency`, `calculator-cost`).
- Unit tests for ZATCA ASN.1, store I/O, store validation, LAN server helpers, invoicing TLV/XML, and renderer pure-logic helpers.

### Changed

- `renderer/app.js` is a thin entry shell (~7 lines); feature logic lives in `renderer/*.js`.
- Log operator filter and pagination state live in `app-state.js` with other log UI globals.
- `safeJsonParse`, `isBlockedHost`, and ZATCA ASN.1 helpers moved from `main.js` into `lib/` for reuse and testing.

### Security

- Electron CSP: drop `script-src 'unsafe-inline'` (renderer uses `data-act`; exported HTML may still use inline scripts).
- LAN tunnel: require explicit risk acknowledgement before starting `localtunnel`.

## [2.0.16] - 2026-05-30

Patch line preceding 2.1.0. See [GitHub Releases](https://github.com/khaytapp/Khayt/releases) for prior `2.0.x` notes.
