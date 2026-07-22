# Changelog

All notable changes to Khayt are documented here. Version format: [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

## [3.2.0-beta.59] - 2026-07-22

### Fixed

- **Arabic showed Eastern Arabic numerals where Saudi apps use Western ones.** Dates and times in the Arabic interface rendered as ٢٢ يوليو ٢٠٢٦ rather than 22 يوليو 2026. Large numbers — revenue, profit, stock weight — also followed the computer's regional settings rather than Khayt's, so an English interface on a machine set to Saudi Arabia showed Arabic digits.

## [3.2.0-beta.58] - 2026-07-22

### Fixed

- **In Arabic, short English names sat on the wrong side of the column.** A follow-on from the truncation fix in beta.56: names that were short enough to fit jumped to the left while Arabic names stayed right, leaving the column edge ragged.

## [3.2.0-beta.57] - 2026-07-22

### Fixed

- **A printer briefly dropping off the network was shown as offline.** One missed check was enough to turn a working printer red and blank out the job it was running — common on Wi-Fi, and normal for a Prusa CORE One, which takes 20–30 seconds to answer after a power cycle. The dashboard now keeps showing the last known job and reports "Reconnecting", and only marks a printer offline once it has genuinely stopped answering.

## [3.2.0-beta.56] - 2026-07-22

### Fixed

- **In Arabic, names were shortened from the wrong end.** A job called "Gearbox housing batch" appeared as "…ousing batch" instead of "Gearbox hous…", hiding the part of the name you actually read. The same fault affected machine names, client names and file paths anywhere they were too long to fit.

## [3.2.0-beta.55] - 2026-07-21

### Fixed

- **The Analytics screen failed to load once you had printers and completed orders.** A fault introduced in beta.40 broke the printer-utilisation chart, and because it only triggered on real data it was invisible on a new or empty account.

## [3.2.0-beta.54] - 2026-07-21

### Fixed

- **A printer added after Khayt was already running never went live until you restarted the app.** Live status was only ever started once, at launch, using the printers that existed at that moment — so a machine you just added with "Scan network" stayed blank no matter how long you waited. It now connects the moment you save it.

## [3.2.0-beta.53] - 2026-07-21

### Fixed

- **A malformed 3MF whose parts reference each other in a loop no longer produces a broken preview.** Khayt now stops following the loop instead of reporting far more geometry than it actually loaded.

## [3.2.0-beta.52] - 2026-07-21

### Fixed

- **Full Spectrum could print the wrong colours on large palettes.** Above about eighteen colours the file format cannot record the extra slots, and Khayt silently substituted a different filament instead. It now declines those palettes and falls back to a plain conversion rather than producing a wrong print.

## [3.2.0-beta.51] - 2026-07-21

### Fixed

- **Band-swap prints could pause at the very first layer for no reason**, asking you to load filament that was already on the head. This happened whenever the first colour printed wasn't the lowest-numbered one.
- **A Bambu printer check could hang for eight seconds and then report the wrong reason.** A malformed reply from the network crashed the reader internally and surfaced as "check IP, access code & LAN mode" instead of a protocol error.

## [3.2.0-beta.50] - 2026-07-21

### Fixed

- **Converting a four-colour model could corrupt the printer's bed outline.** When reordering filaments for band swapping or Full Spectrum, Khayt also reshuffled any other setting that happened to have four values — including the bed's four corners, which turned the print area into a crossed shape. Only filament settings are reordered now.

## [3.2.0-beta.49] - 2026-07-21

### Fixed

- **The converter contradicted itself about filament swaps.** It could announce "2 filament swaps" directly above a line saying no manual swap was needed. The count was based on how many colour bands the model had rather than how many distinct colours — a model alternating between two colours up its height needs no swaps at all on a four-head printer, and needs one at every change on a single-extruder machine. The figure now matches the swap plan exactly.

## [3.2.0-beta.48] - 2026-07-21

### Fixed

- **Some 3MF files previewed as empty or converted with the wrong colours.** The preview read only one of the several ways a 3MF may legally be written, so a file from another slicer could show nothing — or convert incorrectly with no warning — while the converter read it fine. Both now read files identically.
- **A model could disappear entirely** depending on the order of attributes in the file.

### Changed

- Two source files contained a raw control character that made search tools treat them as binary and skip them silently. Written differently now, with no change in behaviour.

## [3.2.0-beta.47] - 2026-07-21

### Fixed

- **Printer alerts never fired for anyone who set up Telegram before this feature existed.** The settings screen showed the alert boxes ticked while the alerts were actually switched off. Turning them off explicitly still works as expected.
- **Revenue forecasting put some sales in the wrong month.** Orders completed between midnight and 3am were credited to the previous month, and opening Khayt in those hours shifted the whole forecast window back a month.

## [3.2.0-beta.46] - 2026-07-21

### Security

- **Outbound address blocking did not work for IPv6.** Khayt refuses to send webhooks and other outbound requests to your own machine or private network, but the check only ever worked for ordinary IPv4 addresses — the IPv6 equivalents passed straight through. Anyone able to set a webhook or accounting URL in your settings (including via a restored or synced backup) could have used it to reach services running on your computer. Now blocked in every form.

### Fixed

- **The remote-access PIN could be guessed without limit.** The lockout on read requests could be sidestepped by a caller changing one header, and repeated attempts also grew memory without bound — a way to slow or crash the app from outside. Read requests now use the same global lockout the write side already had, and stale lockout records are cleaned up.
- Deleting a restore point reported success even when the file could not be removed.

## [3.2.0-beta.45] - 2026-07-21

### Changed

- Added internal checks that catch a whole class of wiring fault before release — the kind that made printer alerts and the scheduled digest email silently never run. No change to how the app behaves.

## [3.2.0-beta.44] - 2026-07-21

### Fixed

- **Quitting while Khayt was still starting up could skip the final save.** The shutdown now allows more time for the save to finish, and still never prevents the app from closing.

## [3.2.0-beta.43] - 2026-07-21

### Fixed

- **Adding a fee to a quote made the margin go down.** Extra charges were counted as both income and cost, so a 100 fee on a 30%-margin job showed 17.6% instead of 58.8%.
- **Deleting from the print library said "File deleted" even when the file could not be removed** — it disappeared from the library while staying on disk.

## [3.2.0-beta.42] - 2026-07-21

### Fixed

- **The live price shown while filling in a part didn't match what landed in the cart.** Packaging wasn't spread across the quantity in the preview, so a 20-unit part could preview at 17.00 and be added at 7.50. Resin parts could also change price on being added.
- **Editing a part in the cart silently discarded eight of its details** — including support weight, which changed the price. Colour, note, layer height, infill, profile, attached file and spool were all lost too.
- **An attached model file carried over to the next part you added**, so the second item in an order referenced the first item's file.

## [3.2.0-beta.41] - 2026-07-21

### Fixed

- **Printer alert notifications never worked** — the feature was never loaded into the app at all.
- **The accounting journal export labelled foreign-currency invoices with your home currency**, left credit notes out entirely (so a credited invoice stayed booked as revenue), and repeated the VAT figure on two rows so the column double-counted.
- **Customer statements didn't add up** when a gift card or credit note was involved — charges minus payments didn't match the balance shown, with no line explaining the difference. Both now appear as their own settlement figures.
- **The acquisition-sources chart understated every channel.** Orders from the online intake form counted toward the total but never appeared as a bar, so the percentages didn't sum to 100%.

## [3.2.0-beta.40] - 2026-07-21

### Fixed

- **Adding a product from the catalogue to a quote undercharged by the quantity.** A 50-unit line was priced as one unit while all 50 still printed. This is the same fault fixed for duplicated and reprinted orders in beta.30 — the catalogue path was a third place it occurred.
- **The scheduled digest email never sent.** It failed silently every five minutes and looked like a mail-server problem.
- **Failed accounting pushes were still never retried on restart** — the retry added in beta.33 could not actually run.
- **Machine profit charged a whole year of maintenance against any period.** Picking "This month" subtracted January's servicing from July's revenue, which could make a profitable printer look like a loss.
- **Machine utilisation was wrong on "All time" and custom ranges** — it always divided by 30 days, so three years of printing showed as 100% busy.
- **Quarterly profit only charged rent and overheads to the current quarter**, so every past quarter looked more profitable than it was.
- The new printer's colour palette, the calendar's "back to this month" reset, the dashboard's copy-intake-link button, and form labelling at startup were all silently inert.

## [3.2.0-beta.39] - 2026-07-21

### Fixed

- **Tax invoices could be a penny out of balance at VAT rates other than 15%.** The tax-exclusive and tax amounts were each rounded separately, so they did not always add up to the total — which makes the invoice XML invalid. Saudi invoices at 15% were never affected; shops using other rates were, on about one total in eight at 20%.
- **Calendar chips now say which machine and status they represent** instead of relying on colour alone.

## [3.2.0-beta.38] - 2026-07-21

### Fixed

- **The ⌘K / Ctrl+K search shortcut never opened search.** It raised an internal error instead — as did every other keypress in the app. Both are fixed; the shortcut now works.
- **The low-stock alerts panel can be expanded with the keyboard**, so the "Draft PO" buttons inside it are reachable.
- Price-list and address tables in the customer window now scroll on a narrow window instead of being cut off.

## [3.2.0-beta.37] - 2026-07-21

### Fixed

- **Order webhooks are no longer lost on a temporary network blip.** Order events (paid, shipped) feeding your automations were sent once with no retry, while other webhooks already had durable retry. They now use the same queue: retries with backoff, resumed after a restart, and a warning if delivery finally fails.
- **The event-webhook signing secret is now stored encrypted** and hidden from the app window, matching every other credential. It was already hidden from backups, but not at rest.
- **Calendar days, the add-photo tile and the copy-webhook-URL control can be used with the keyboard.**
- Order photos are now described to screen readers instead of being skipped.

## [3.2.0-beta.36] - 2026-07-21

### Fixed

- **"No backups found" no longer appears when the backups folder simply couldn't be read.** That message showed up exactly when someone was trying to recover, and could convince them their data was gone when it wasn't.
- **A camera that errors now shows "Camera offline"** instead of leaving the tile stuck on "Camera…" indefinitely.
- **Customers submitting a request are no longer told their form was invalid when the shop's computer failed to save it.** They were being asked to correct a form that was already correct.
- Starting the LAN server from the Online panel now reports failure instead of leaving the panel unchanged.

## [3.2.0-beta.35] - 2026-07-21

### Fixed

- **Resin wash, cure and "complete post-processing" can now be used with the keyboard** — they were plain blocks that only responded to a mouse, despite the label saying "tap to log".
- **Per-part status can be changed with the keyboard**, and now announces which part and what state.
- **Every button in the app has a proper name.** Icon-only controls such as the feedback button previously announced as the emoji itself.
- **Currency rates, operator PINs and storefront product rows are now identified individually.** Previously every row in those lists was announced identically, with no way to tell which currency, operator or product it belonged to.
- **Printer status changes are announced** — a print entering an error state was previously silent.

## [3.2.0-beta.34] - 2026-07-21

### Fixed

- **Opening your data with an older Khayt could delete part of it.** Data files now record which version wrote them, and an older build refuses to save over a newer file instead of quietly dropping whatever it doesn't recognise.
- **Payment plans created late at night were immediately overdue.** Between midnight and 3am local time the deposit and first instalment were dated the previous day. Dates now follow your own timezone.
- **Reserved filament ignored support material**, so the queued-grams figure under-reserved stock on support-heavy jobs.
- **Labels and packing slips printed left-to-right even in Arabic.** They now follow the app's language.
- Coloured accent stripes on cards now sit on the correct side in Arabic.

## [3.2.0-beta.33] - 2026-07-20

### Fixed

- **Attaching a customer's model file could report success without attaching anything.** Files on a NAS, an external drive or a USB stick were rejected for security reasons, but the confirmation appeared anyway. The real reason is now shown.
- **Deleting a file said "deleted" even when it wasn't.** A file locked by another program stayed on disk while disappearing from the list — which matters, because customers are told their files can be deleted on request.
- **Invoice emails reported success when sending had failed.** An expired mail-provider key silently fell back to opening your mail app — with no invoice attached — and still said "sent". The real error is now shown, and the fallback no longer claims the email went out.
- **Invoices could quietly never reach your accounting system.** If the connection failed at the moment an order was marked paid, nothing was reported and it was never retried. Failures are now shown and retried the next time Khayt starts.
- **Printer tiles could show stale information as if it were live** — a finished printer could keep reading "Printing 47%" indefinitely if updates stopped. Tiles now say how long it has been since the last update.
- **Batch invoice export claimed every invoice succeeded.** If one failed you were told all of them exported. It now reports how many succeeded and which failed.
- A failed photo save no longer leaves an order pointing at a photo that does not exist.

## [3.2.0-beta.32] - 2026-07-20

### Fixed

- **Arabic text no longer has its letters prised apart.** Arabic is a connected script, but ~55 letter-spacing rules applied to it and none were ever cancelled — headings, figures and menu labels all rendered with broken letterforms.
- **Latin names and codes now read correctly in the Arabic interface.** A printer saved as "Prusa CORE One+" displayed as "+Prusa CORE One". Text fields now take their direction from their own content, so models, emails, IBANs and IDs read properly either way.
- **Arrows point the right way in Arabic.** The calendar's previous/next arrows and the sidebar and column collapse arrows kept pointing left after the layout mirrored, contradicting where they had moved to.
- **The filament catalogue can be used without a mouse.** Its cards were plain blocks, so a keyboard user could search the catalogue but not choose anything.
- **Machine colours can be picked with the keyboard**, and the selected one is now announced.
- **Cards can be reordered in every column, by keyboard.** The up/down buttons existed only in "Pending" — and their handler ignored every other column even when they were shown.
- Around 30 icon-only buttons across the app announced as their symbol's name ("multiplication sign", "clipboard") instead of what they do. They now carry proper labels, translated.

## [3.2.0-beta.31] - 2026-07-20

### Fixed

- **Your whole database could be destroyed by two saves happening at once.** If a phone or tablet used the LAN features while the app was saving, both writes went through the same temporary file and could shred each other — leaving no usable data file and a corrupted backup. Khayt then read that as a brand-new installation and showed the setup wizard, and the next save overwrote the last surviving copy. Saves are now queued and each uses its own temporary file, and a surviving backup is never mistaken for a fresh install.
- **Five saved credentials were wiped the first time settings were saved.** SMS/WhatsApp, accounting sync, the AI key and the **Khayt Cloud token** were blanked out on a normal save — so off-site backup silently stopped working. Credentials are now protected by construction rather than by a hand-kept list.
- **Restoring a backup or importing a file wiped everything *before* checking the file.** Choosing the wrong file emptied the app and reported "restored successfully". Khayt now validates first and leaves your data untouched if the file cannot be read.
- **Work done in the last moment before quitting is no longer lost.** Khayt now finishes saving before it exits.

## [3.2.0-beta.30] - 2026-07-20

### Fixed

- **Duplicating or reprinting an order quoted it far too cheaply.** The rebuilt cart priced the job as a *single unit* while still printing — and deducting filament for — the full quantity. A repeat of a 100-unit order was quoted at about 1% of its true cost. Re-quote any order you duplicated or reprinted.
- **Profit, margin and the P&L export were wildly overstated on multi-unit orders.** Cost of goods counted one unit per line against the whole order's revenue, so a job with a real 28% margin reported 99%. This affected the analytics dashboards, per-machine and per-product profitability, the KPI rows and the exported P&L CSV. Figures correct themselves once this update is installed; previously exported P&L files should be re-exported.
- **Save failures were completely silent.** If a save could not be written — disk full, permissions, or a store too large — Khayt showed no warning and the work was lost at next launch. Failures now surface with the reason.
- **Dragging a card to reorder it only worked in the "Pending" column.** In the other five columns the new order was written to disk and then visually reverted on the next refresh.

## [3.2.0-beta.29] - 2026-07-20

### Added

- **The Snapmaker U1 works now.** It runs Klipper and serves a standard Moonraker API, so Khayt's existing Moonraker support drives it — live status, job name, progress and temperatures. Discovery sets it up automatically. The previous release said Khayt could not connect to it; that was wrong.

### Fixed

- **Printer cameras behind a login could never load.** The snapshot fetch sent no credentials, so a PrusaLink camera returned "unauthorized" every time. It now uses the same key already saved for that printer.
- **Removed an incorrect warning** telling owners to switch a cloud-linked printer to LAN mode for local status. Local status works either way.
- Discovery no longer assumes the port a printer advertises is the port its API listens on — the U1 announces one port and serves its API on another.

## [3.2.0-beta.28] - 2026-07-20

### Added

- **Find printers on your network instead of typing IP addresses.** The machine dialog has a **Scan network** button: printers that announce themselves are listed with their model, and picking one fills in the build volume, nozzle, colour slots and power draw from the built-in catalog, plus the connection type and address. Verified against a Prusa CORE One and a Snapmaker U1.
- **PrusaLink webcam support.** Camera URLs are now derived for PrusaLink printers, not just OctoPrint and Moonraker.

### Changed

- The PrusaLink connection option now names the **CORE One** alongside MK4 / XL / Mini+, so Core One owners can tell it applies to them.

### Notes

- Discovery reports honestly when Khayt cannot yet drive a printer it found: the Snapmaker U1 is identified and its specs filled in, but it is listed as not connectable rather than offered a connection that would never report status. A printer in vendor-cloud mode is flagged, since its local interface stays silent until switched to LAN mode.

## [3.2.0-beta.27] - 2026-07-20

### Changed

- **Backup exports now mask credentials for any shipping carrier or BNPL provider, including ones added in future versions.** Redaction previously named the three carriers and three providers explicitly, so a carrier added later would have had its API key and webhook secret written into an unredacted export. No shipped version was affected — the lists happened to match — but the guarantee no longer depends on the two being kept in sync by hand.

## [3.2.0-beta.26] - 2026-07-20

### Fixed

- **Crash reports could carry a credential or a customer's name.** Crash telemetry is opt-in and scrubs paths and personal data, but it only masked secrets stored under a recognised *field name* — a credential quoted inside an error *message* (a printer API key in a request URL, an auth header, a ZATCA certificate password, the LAN PIN) was passed through as written. Filenames were also kept in full, and an exported document is often named after a customer. Both are now masked, while module names and line numbers in stack traces are preserved so crash reports stay useful.

## [3.2.0-beta.25] - 2026-07-20

### Fixed

- **Customer data export and deletion could reach the wrong customer.** When two customers shared a contact detail — a family email, a company phone, or just a common name — exporting one customer's data could include the *other* customer's intake submissions, and a full erase could delete them. Khayt now treats a submission's own customer link as final, and only falls back to matching an unlinked submission by email or phone — never by name alone. If you have used **Export this customer's data** or **Full erase** on customers with shared contact details, the results may have been wider than intended.

## [3.2.0-beta.24] - 2026-07-20

### Fixed

- **Camera: a stream-only printer no longer strains the app.** If you configured a camera with only a stream address (no still-image address), Khayt tried to read the never-ending video stream as if it were a single photo, holding it in memory until the request timed out. Those cameras now display the live stream directly, which is what they were always meant to do. Khayt also checks a camera's response size *before* loading it, rather than after.

## [3.2.0-beta.23] - 2026-07-20

**Pre-release (beta) — security hardening.**

### Fixed

- **An API token could reach pages outside its permissions.** Tokens correctly enforced their scopes on data (an orders token could never touch clients), but a valid token also satisfied the owner-PIN check on pages that sit outside the permission model — so a token granted only "machines: read", for example, could open the LAN kiosk page. No shop data was exposed (every data endpoint was, and remains, scope-checked), but it was wider access than intended. A token now stands in for your PIN **only** on the endpoints its scopes actually cover; anything else still asks for the PIN.

## [3.2.0-beta.22] - 2026-07-20

**Pre-release (beta) — printer cameras.** See what your printers are doing, without your video leaving your network.

### Added

- **Per-printer camera view.** Each machine can now show a **live snapshot on its card**. Turn the camera on per printer in the machine editor, hit **Detect from printer** to fill in the addresses automatically for OctoPrint and Moonraker/Klipper setups, and rotate or flip the image if your camera is mounted sideways. The video **stays on your own network** — Khayt reads it directly from the printer's own address and never routes it through any cloud. Cameras are **off by default**, per machine.

## [3.2.0-beta.21] - 2026-07-20

**Pre-release (beta) — webhook retries now survive a restart.**

### Changed

- **Webhook retries are no longer lost when you close Khayt.** Previously a delivery waiting to be retried lived only in memory, so quitting the app dropped it. Pending retries are now saved with your data and **resumed the next time Khayt starts** — including any whose turn came around while the app was closed. A retry whose destination you've since deleted is discarded rather than retried forever.

## [3.2.0-beta.20] - 2026-07-20

**Pre-release (beta) — optional crash reports.** Off by default, separately consented, and scrubbed of anything personal.

### Added

- **Optional crash reports and anonymous usage counts.** Khayt still sends **nothing by default**. If you want to help fix bugs, **Settings → Crash Reports & Usage** offers two independent switches: share scrubbed crash reports, and/or share anonymous usage counts. Before anything is even written to disk it passes a scrubber that strips emails, phone numbers, IBANs, long digit runs and file paths, masks anything key-shaped like an API key or PIN, and then rebuilds the report field-by-field from a fixed allowlist — so your orders, customers, prices, files and secrets can't be included even by mistake. There's no account or user id, just a random install identifier created when you opt in and **erased the moment you opt out** (which also deletes anything queued, straight away). **"View what's collected"** shows you the exact payload. See docs/KHAYT-3.0-TELEMETRY-SPEC.md.

## [3.2.0-beta.19] - 2026-07-20

**Pre-release (beta) — webhook subscriptions.** Send the same shop event to as many places as you like, with automatic retries.

### Added

- **Webhook subscriptions with retries and a delivery log.** Outbound webhooks are no longer one URL per event — you can now point a single event (an order shipped, a payment received) at **several destinations at once**: Slack, a Google Sheet via Zapier, and your own endpoint, all together. Each subscription gets its own signing secret, listens to whichever events you choose, and can be switched off without deleting it. **Failed deliveries retry automatically** with a widening gap (immediately, then 30 seconds, 2 minutes, 10 minutes, an hour), and a destination that replies "gone" is disabled rather than retried forever. Every attempt is written to a **delivery log** so you can see what was sent, what came back, and resend by hand. Your existing webhook setup migrates across automatically — nothing to reconfigure. See docs/KHAYT-3.0-PUBLIC-API-SPEC.md.

## [3.2.0-beta.18] - 2026-07-20

**Pre-release (beta) — automation API.** Give a script or automation tool scoped access to your shop, without handing over your PIN.

### Added

- **Scoped API tokens + a versioned `/v1` API.** You can now connect automation tools (Zapier, Make, your own scripts) to Khayt over the local API without sharing your owner PIN. Mint a token in **Settings → API Tokens**, tick exactly the permissions it should have — orders, clients, inventory or machines, read or write — and it gets nothing else. A read-only token that tries to write is refused with a clear message naming the permission it would need. Tokens are shown **once** and stored only as a hash, so a leaked backup can't be replayed; revoking one takes effect immediately. All existing routes are now also served under a documented, stable `/v1` path, while the old `/api` paths keep working unchanged for the iOS companion and the LAN web app. Works fully offline on your own network. See docs/LAN_API.md.

## [3.2.0-beta.17] - 2026-07-20

**Pre-release (beta) — assembly tracking.** Track each printed part of an assembly through QC, and only complete the order once it's genuinely assembled.

### Added

- **Assembly production tracking.** Products built from several printed parts plus components now track **each part's progress** — pending, printing, printed, QC passed or failed — from a new **Assembly** panel on the job card. The order shows a rolled-up state (in progress → printed → assembled), and an assembly **can't be marked complete until every part has passed QC and you've ticked "Assembled"** — with a message naming exactly which parts are still outstanding. If one part fails QC you can **reprint just that part**; the rest of the assembly is untouched. Ordinary single-part and multi-part orders are completely unaffected. Completes docs/KHAYT-3.0-BOM-SPEC.md §5.

## [3.2.0-beta.16] - 2026-07-19

**Pre-release (beta) — customer privacy.** Consent at intake, one-click customer data export, and a clear choice when erasing a customer.

### Added

- **Customer privacy tools (PDPL / GDPR-ready).** Khayt now gives you the tools to meet your obligations as the data controller for your customers' details. Your public intake form asks customers to **agree to a plain-language privacy notice** before submitting, and records that consent with a timestamp and the exact wording shown. In Clients you can **export one customer's complete data** as a portable JSON file (their record, orders, communications and intake submissions), and **deleting a customer now offers a clear choice**: *unlink* — remove the customer but keep the orders you may be legally required to retain — or *full erase*, which also blanks their name on those orders and purges their intake submissions and communication log. An optional **retention setting** anonymizes the contact details on old intake submissions while keeping the request record. All local, on your machine. See docs/KHAYT-3.0-PRIVACY-COMPLIANCE-SPEC.md.

## [3.2.0-beta.15] - 2026-07-19

**Pre-release (beta) — assemblies.** Products can now be built from printed parts *plus* real components, with the cost and stock handled for you.

### Added

- **Assemblies: products made of printed parts *plus* real components.** A catalog product can now list **non-printed components** — magnets, screws, threaded inserts, packaging — alongside its printed parts. Pick them from your consumables with a quantity per assembly, and Khayt folds their cost into the product's price automatically and **draws the right stock when the order completes** (quantity × the number of assemblies), warning when a consumable runs low. Quoting an assembly carries its component list onto the order. Products with no components behave exactly as before. Runs locally. See docs/KHAYT-3.0-BOM-SPEC.md.

## [3.2.0-beta.14] - 2026-07-19

**Pre-release (beta) — shipping & fulfillment.** Close the order lifecycle with carrier tracking and live customer shipping status, manual-first and fully offline.

### Added

- **Shipping & fulfillment (Saudi carriers).** Close the order lifecycle: a **Ship** action on completed orders records the carrier, tracking number and shipping status right on the order, and the customer sees live shipping status on the same tracking link they already use. **Manual-first and fully offline** — type a carrier + tracking number by hand with zero setup — with an **opt-in** path for **SMSA, Aramex and Saudi Post (SPL)** to auto-create labels (when configured) and receive live status updates via signed carrier webhooks. Shipping status advances through label-created → in transit → out for delivery → delivered (a delivered update also marks the order delivered), never regressing on an out-of-order update. Carrier credentials are encrypted and masked on export; the customer tracking page shows only status, carrier, tracking number and a carrier deep link — never internal cost or notes. Adding a fourth carrier is a one-entry drop-in. Runs locally; carrier APIs are opt-in. See docs/KHAYT-3.0-SHIPPING-SPEC.md.

## [3.2.0-beta.13] - 2026-07-19

**Pre-release (beta) — less typing, smarter defaults.** Pick your printer from a built-in catalog, stop re-entering it in the calculator, and get automatic pricing on catalog products.

### Added

- **Pick your printer from a built-in catalog.** Adding a machine now offers a searchable **Printer model** field covering popular printers (Bambu, Prusa, Creality, Anycubic, Elegoo, Sovol, Snapmaker, QIDI, Voron and more) — choosing one auto-fills the nozzle size, build volume, colour slots, extruder type and typical power draw so you no longer hand-enter specs. If you have a slicer installed, its full printer list (2000+) is folded in too. Runs locally.

### Changed

- **Assign a machine, skip re-typing the printer.** Selecting a machine in the calculator now auto-fills the printer name and its power draw from that machine, so a printer you already defined isn't entered a second time. Saved presets still override.
- **Catalog products get a price automatically.** The product editor now computes a **default price** live from the parts' cost and your margin (the same math as the calculator) and stores it with the product — adding a product no longer needs a separate quoting step. Runs locally.

## [3.2.0-beta.12] - 2026-07-19

**Pre-release (beta) — quality control, reprints & warranty.** The QC stage becomes a real inspection gate, with defect logging, correctly-accounted linked reprints, and customer warranty (RMA) claims.

### Added

- **Quality control, reprints & warranty (RMA).** The existing QC stage becomes a real inspection gate. Record a **pass** (optionally with the inspector who signed off) or a defect-tagged **fail** (failure type, severity, notes, wasted weight) right on the order. A failed job can be **scrapped** or turned into a **linked reprint** — a fresh order that points back at the one it replaces, so material accounting never double-counts: the wasted filament stays booked as waste, and the reprint deducts its own filament only when *it* passes. Reprints are **shop-cost** (no charge — our defect) or **billable** (customer-caused) at a click. For a delivered order, **Open RMA** records a warranty claim (auto-suggesting whether it's within your warranty window) and can spin off a no-charge replacement reprint. New Analytics tiles show QC pass rate, first-pass yield (reprint chains collapse to one job), defect categories, and warranty cost. All opt-in via **Settings → QC**, fully offline, and off by default — with QC off the stage behaves exactly as before. See docs/KHAYT-3.0-QC-SPEC.md.

## [3.2.0-beta.11] - 2026-07-19

**Pre-release (beta) — maker-tools depth.** Following beta.10's "maker tools for everyone," the print-file library, converter and colour tools gained organization, single-extruder colour work, and wider slicer support.

### Added

- **Print-file library: folders and tags.** Print files can now be organized two ways — a single **folder** per file (one-per-file collections) and multiple **tags** (labels a file can share). A filter bar above the grid browses by folder — with per-folder counts and an "Unfiled" bucket — and tags filter alongside it. Folder chips on each card are clickable to filter, and a filter that loses its last matching file clears itself so the grid can't stick on an empty view. Runs locally.
- **Bulk import to the print-file library.** The library's **Add** action now takes a multi-file selection, so you can pull in a whole batch of print files in one step (each gets an auto-generated preview) instead of adding them one at a time. Runs locally.
- **Single-extruder colour-swap plan (M600).** A vertically colour-banded 3MF could previously only get a swap plan for the Snapmaker U1's four heads. A new **Colour-swap plan…** action in the Converter now produces an exact-colour plan for any single-extruder (or pause-capable) printer: the starting colour, a list of swap heights with colour swatches, and a ready-to-use OrcaSlicer `custom_gcode_per_layer.xml` to save or copy. It explains clearly when a model can't be reproduced this way (colours that share layers need a multi-material printer). Runs locally.
- **Colour Studio matches against a bundled filament catalog.** Colour matching no longer dead-ends on an empty inventory — it falls back to a built-in filament catalog so you always get a suggested match to start from. Runs locally.

### Changed

- **Calibration Assistant writes a tuned OrcaSlicer filament profile.** After a calibration pass, the assistant can now save the dialled-in values (temperature, flow, retraction, first layer) straight to an OrcaSlicer filament profile, so the tuning lands in your slicer instead of staying on screen. Runs locally.
- **Filament-profile install supports any Orca-family slicer.** Installing Khayt's filament profiles is no longer limited to Snapmaker Orca — it now targets any Orca-family slicer and printer, and the copy no longer implies Snapmaker-only. Runs locally.

### Fixed

- **Converter batch hardening.** A batch conversion now guards against mixing source ecosystems (files from another printer's slicer are saved as a Generic 3MF with a clear note rather than silently mis-targeted), and the batch panel's controls are locked while a run is in progress so a mid-run change can't corrupt the queue. Runs locally.

## [3.2.0-beta.10] - 2026-07-09

**Pre-release (beta) — maker tools for everyone, plus a tougher converter.** The 3D-printing toolset that used to live behind "Enthusiast" mode is now simply part of Khayt, and the converter gained a 3D preview, a calibration helper, and real hardening against malformed files.

### Added

- **3D model preview.** The Converter and Print-File library now render a rotatable 3D view of a model (WebGL, with a mesh fallback) so you can see what you're about to convert or print — no slicer round-trip. Runs locally.
- **Calibration Assistant.** A new guided helper for dialling in a printer (temperature towers, flow, retraction and first-layer checks) is now available in Khayt. Runs locally.
- **Full Spectrum on custom printers.** If you define a **custom printer profile** for a mixing-capable machine, you can now opt it into Full Spectrum (mixed-filament) conversion — previously only the built-in Snapmaker U1 could mix.

### Changed

- **"Enthusiast" is retired as a mode — its tools are now core features.** The 3MF converter, Colour Studio, print-file library, slicer detection and printer profiles are available in **both Simple and Professional** modes; there's no separate hobbyist mode to pick. Any existing Enthusiast user is migrated to Simple automatically (nothing is lost — the maker tools all stay). The mode picker is now a clean Simple / Professional choice.
- **Bed-fit check now works on "split" 3MF files.** Files that keep their geometry in separate model parts (common in Bambu/Orca exports) now get a proper does-it-fit-the-bed verdict instead of none.

### Fixed

- **Hardened the converter against malformed 3MF files.** A crafted file could previously make the converter do an enormous amount of work (a self-referencing component "bomb", or a palette declaring thousands of colours) and stall the app. The converter now bails safely and quickly on both, and a real painted mesh is verified to survive Full Spectrum with its geometry and colours intact.

> Note: the maker toolset in this release also ships as **Bed Ready**, a separate standalone app for makers. Khayt itself is unchanged in scope — it just no longer hides these tools behind a mode.

## [3.2.0-beta.9] - 2026-07-05

**Pre-release (beta) — prune archived orders.** Keep the app fast as your history grows into the thousands.

### Added

- **Prune archived orders (Settings → Data).** A new maintenance action exports every **archived** order to a dated JSON file and then removes those orders from the live store — so a long-running shop can keep its working data lean without losing history. The export always runs first (the file is your keepsake copy), the removal is behind a clear confirmation, and it only ever touches orders you already archived. The cleanup syncs like any other change (removed orders won't reappear on other devices). Runs locally.

## [3.2.0-beta.8] - 2026-07-05

**Pre-release (beta) — 3MF → STL.** Round out the converter: pull the raw mesh back out of any 3MF.

### Added

- **Export a 3MF to STL.** A new **3MF → STL** action in the Converter tab extracts the mesh geometry from a 3MF — resolving nested components, build transforms, and units — and saves it as a standard binary STL. Pairs with beta.7's STL → 3MF so you can move a model both directions without a slicer. Geometry is preserved exactly; runs locally.

## [3.2.0-beta.7] - 2026-07-05

**Pre-release (beta) — STL → 3MF.** Bring plain STL files into the 3MF workflow.

### Added

- **Convert an STL to a 3MF.** A new **STL → 3MF** action in the Converter tab wraps any STL's mesh into a clean, standard 3MF and adds it to your Print-File library (with an auto-generated preview). The result opens in any slicer, and — like every conversion — your geometry is never altered, only re-packaged. Works locally.

**Pre-release (beta) — saved conversion presets.** Stop re-picking the same target and colour mapping every time.

### Added

- **Conversion presets.** In the convert dialog you can now **save** your chosen target printer (and colour→slot mapping) as a named preset, then **apply** it with one click on any file — the colour mapping is reused when it fits the file's colour count. Manage your presets (list and remove) in the Converter tab. Saved locally.

**Pre-release (beta) — a smarter, safer converter.** Two converter improvements: it now tells you which spool to load for each colour, and it double-checks its own output.

### Added

- **"Nearest in stock" hint per colour.** When you map a multicolour file's colours to slots, each colour now shows the closest filament **you actually have in stock** (by perceptual colour distance, ΔE) — so you know which spool to load into each slot. Uses your inventory's colours and the same colour-matching maths as the Colour Studio.
- **Output self-check.** After converting, Khayt re-opens the file it just wrote and confirms it still parses with its geometry (and, for a retarget, its colours) intact. If anything looks off, it warns you to check in your slicer before printing — cheap insurance behind the "it always opens" guarantee.

**Pre-release (beta) — scale & performance.** Follow-up to the store audit: keep the app fast as your order history grows into the thousands, and stop internal sync data from growing without bound.

### Changed

- **Faster lists and reports with large datasets.** Order, dashboard, kanban and analytics views used to scan the whole client list once for every row/section they drew — so with thousands of orders and clients, rendering slowed down noticeably. Lookups now use fast in-memory indexes, so drawing a list is roughly proportional to what's on screen, not to the size of your whole database. The lead-source revenue breakdown in Analytics in particular went from re-scanning every order for every source to a single pass.
- **Sync delete-markers no longer grow without limit.** Internal "tombstone" records (used to propagate deletions to your other devices during cloud sync) are now capped to the most recent set, so they can't slowly bloat your data file over time.

**Pre-release (beta) — data-safety hardening.** Follow-up to the store audit: make the local data file resilient to crashes and power loss, and stop a bad read from ever overwriting good data.

### Fixed

- **A corrupted or half-written data file can no longer be overwritten with empty data.** Previously, if the store failed to read (a disk hiccup, a partial write), the app started on empty state and the next save would clobber the original — losing everything. Now an unreadable file is **quarantined** (renamed aside, never overwritten) so it's kept for recovery, and the app **automatically recovers** from a completed-but-unswapped temporary write or the previous saved version, with a message confirming your data was restored.
- **The app no longer starts fresh after a crash that left the file mid-swap.** Loading now also checks the temp and previous-generation files, so an interrupted save is recovered instead of looking like a brand-new install.

### Changed

- **Every store write is now atomic and durable.** The data file is written to a temp file and **flushed to disk (fsync) before** being swapped into place, so a power loss can't leave a truncated store; and the previous version is kept as a one-generation rollback (`khayt-store.prev.json`) on every save.

**Pre-release (beta) — correctness & safety pass.** A comprehensive research audit of the data store and the 3MF converter turned up a real data-loss bug and several converter correctness gaps. This release fixes them.

### Fixed

- **Subscriptions and the team activity log now persist.** Retainer/subscription plans (and their recurring-revenue totals) and the entire team **activity log** were being silently dropped on save and came back empty after every restart — the store's save routine only wrote a fixed list of collections and these two weren't on it. Both are now saved and reloaded correctly. (Existing plans/logs that were lost can't be recovered, but new ones stick.)
- **The converter no longer offers incoherent cross-ecosystem conversions.** Retargeting a Bambu/Orca file to a Prusa printer (or vice-versa) can't be done by rewriting metadata — the slicer settings are fundamentally different — but the app used to offer it and produce a file that opened but targeted nothing. The target list now shows only printers compatible with the source file's format; to move between ecosystems, convert to **Generic 3MF** and set the printer up in your slicer. (If a cross-format conversion is triggered another way, the colours are still remapped but the printer settings are left alone, with a clear warning, instead of writing a bad profile.)
- **Retarget now writes the full build volume it promised.** Prusa conversions now rewrite **bed shape and max print height** (not just the model + nozzle), and Bambu/Orca conversions now also write the **printable height** — so the "what changes" summary matches what actually ends up in the file.
- **The bed-fit check is now unit-aware and assembly-aware.** It honours the file's declared unit (a micron- or inch-unit model is no longer mis-measured by 1000×/25×), and it correctly measures multi-part **assemblies** built from components — so it can no longer show a false "Fits" for a model that's actually too big. When the geometry can't be fully measured it now shows no verdict rather than a wrong one.

### Security

- **3MF reader now caps decompression** (guards against a maliciously crafted "zip-bomb" member inflating to gigabytes and crashing the app).

### Changed

- **Deleting a supplier or product now cleans up references.** Removing a supplier un-links it from inventory items and purchase orders; removing a product un-links it from past orders and drops it from any quote bundles — no more dangling references (with one-tap **undo**).

**Pre-release (beta) — a better, more capable 3MF Converter.** Opens the 3.2 cycle by making the converter far more useful before you hit Convert, and adding batch and custom-printer support.

### Added

- **Pre-convert summary + live "what changes" diff.** The convert dialog now reads the source file properly — original **printer, bed, nozzle, layer height, per-colour grams, total material and estimated print time** — and shows a side-by-side **what-will-change** panel (printer → target, bed, nozzle, colours vs the target's slots) that updates as you pick a target, instead of only warning you after the fact.
- **Bed-fit check.** Khayt computes the model's real footprint from the mesh and tells you up front whether it **fits the target printer's build volume** ("Fits" / "May not fit"), with a warning if the footprint or height is too large — so you catch it before slicing, not after.
- **Many more target printers.** The built-in list grew from 8 to 22: added **Bambu H2D, X1E, A1 mini**, **Prusa Core One, MK4S, MK3S+ & MMU2S**, **Creality K1C / K1 Max**, **Qidi Plus4 / X-Max 3**, **Sovol SV08**, **Anycubic Kobra 3**, **FlashForge Adventurer 5M Pro** and **Elegoo Centauri Carbon**.
- **Custom printers.** Define your own printer (name, brand, slicer format, bed X/Y/Z, nozzle, colour slots, model id) in the Converter tab. It's saved locally and offered as a target everywhere the built-ins are — so you can convert for a machine that isn't on the list.
- **Batch conversion.** Pick several 3MF files at once and convert them all to one target printer (or to Generic) in a single run, saving them to a folder or adding them all to your Print-File library, with a per-file progress list and a summary.

### Notes

Geometry is still never touched — the converter only rewrites slicer metadata, so a conversion can't corrupt your model. Everything runs locally.

**Stable release — Khayt for makers, not just print shops.** 3.1 opens the app up to hobbyists and gives everyone a full suite of colour and print-file tools, while keeping the promise that nothing here needs the cloud. It's the culmination of the 3.1 beta cycle (beta.1–beta.15), which also ran a top-to-bottom, three-mode interface review and a final security/correctness hardening pass.

### Added

- **Enthusiast mode** — a third experience alongside Simple and Professional, for personal/hobby printing. It hides everything commercial (orders, clients, invoicing & ZATCA e-invoicing, payments, storefront, customer portal, gift cards) and keeps the personal core: production queue, cost-per-print calculator, filament inventory, printers & monitoring, print-file library, waste log and personal reports. Switch modes anytime with no data loss.
- **Print-File Library** — a standalone, searchable catalogue of your STL / 3MF / G-code files, each with a real preview thumbnail (the slicer's own embedded preview, or a software-rendered 3D view for STL — no cloud), parsed metadata, an optional photo, tags, a tested-settings note, an attached slicer profile, and parsed **multicolour 3MF info** (colours used and swap count). Open any file into your slicer in one click.
- **Colour Mixer suite** — a new **Colour Studio** tab with a **stock matcher** (rank the filaments you own by perceptual closeness / ΔE CIEDE2000, with grams-in-stock and low-stock flags) and a gamma-correct **blend & gradient** tool; a **multicolour print planner** that assigns each of a file's colours to a spool you own, shows per-colour cost and swaps live, and pushes the job into the calculator as one part with the exact blended cost (deducting from each colour's own spool on completion); and a **filament hex input** for pasting exact colour codes.
- **Multiple slicers** — Settings → Slicer holds a list of slicers (name, path, optional command) with a default and per-slicer test, and a **chooser on "Open in slicer"** when more than one is configured. **"Detect installed slicers"** scans your machine (macOS / Windows / Linux) and adds every supported slicer it finds — PrusaSlicer, OrcaSlicer, Bambu Studio, Cura, SuperSlicer, ideaMaker, Simplify3D, Creality Print, Lychee, CHITUBOX, FlashPrint — and runs automatically on first setup.
- **3MF Converter** — a **Converter** tab and a **Convert** action on every 3MF: retarget a multicolour file to another printer (Snapmaker U1, Bambu X1C/P1S/A1, Prusa MK4+MMU3/XL, Creality K2 Plus, Anycubic Kobra S1) with per-colour slot remapping, or produce a clean **Generic 3MF**. Only slicer metadata is rewritten — your geometry is never touched. Converted files stay in-app, attached to the source print file, by default.

### Changed

- **Three-mode interface review.** Every surface was audited for the Enthusiast / Simple / Professional split. Enthusiast mode no longer leaks any commerce (dashboards, themed dashboards, queue cards, calculator, global search, waste log, notifications); Simple gained a focused sales-reports view and no longer showed Professional-only machine-maintenance tools; the profit-margin tile is Professional-only. Every tab is now reachable in all nine themes (Atlas gained a "More" menu).

### Fixed

- **Full UI review** across correctness, visual polish, accessibility (focus-trapped dialogs, accessible names on icon buttons, focus outlines) and RTL, plus dead-code cleanup. **All 3.1 features are now translated in all eight languages** (the parity check was tightened from Arabic-only to all eight), and the in-app updater no longer produces erratic, duplicate or downgrade prompts.

### Security

- Final hardening pass: **SSRF guards on the accounting webhook** (matching the other senders) and a **shell/interpreter blocklist on slicer launch**, so a restored/synced URL or slicer path can't become a request to an internal host or arbitrary code execution.

## [3.1.0-beta.15] - 2026-07-05

**Pre-release (beta) — pre-1.0 hardening pass.** A comprehensive bug, security and UI audit ahead of promoting 3.1 to a stable release. No data-loss or crash bugs were found; the fixes below close real edge-case and mode-separation gaps.

### Fixed

- **Enthusiast (hobbyist) mode no longer shows any pricing in the cost calculator.** The target profit margin, the "✨ Suggest" price helper, the discount field, shipping/extra-charge fees, price tiers, the rush-fee toggle, and the marked-up "Project total" were all still visible. Enthusiast mode now shows **Total cost** only (margin/discount/fees are treated as zero); business modes are unchanged.
- **ZATCA Phase 2 (cryptographic e-invoicing) no longer appears in Simple mode.** It is a Professional-only feature but its onboarding panel was rendering in the Simple invoice settings. (Phase 1 QR invoicing stays available in Simple.)
- **Multicolour planner cost with a resin dominant spool.** A blended multicolour part whose fallback filament happened to be a resin spool was mis-costed by ~1000× (it hit the resin per-kg formula). Blended parts now always use the correct pre-summed material cost.
- **Filament forecast now splits multicolour jobs per spool.** The material-depletion forecast and "queued" totals charged all of a multicolour part's grams to one spool (and zero to the others); they now use the same colour-aware split as reservation and over-commit checks.
- **3MF converter warns when two colours map to the same target slot** (previously one colour was silently dropped).
- **Colour Studio "from filament" picker** now updates the colour swatch for 3- and 8-digit hex inventory colours.
- **RTL polish:** dashboard accent stripes, Atlas floor-card markers and the chart "Download PNG" button now use logical (`inset-inline`/`border-inline`) properties so they mirror correctly in Arabic.

### Security

- **`hub:accounting-push` now applies the same SSRF hardening as the other webhook senders** — private/loopback/cloud-metadata targets, DNS-rebinding and redirects are blocked (the accounting webhook URL comes from the store, which can arrive via restore/sync).
- **Slicer launch rejects shells/interpreters.** The slicer executable (from `settings.slicers[]`, which can be restored/synced) is checked against a blocklist of shells/interpreters (bash, sh, cmd, powershell, python, node, …) before spawning, so a poisoned slicer path can't become code execution on Slice / Open-in-slicer.

## [3.1.0-beta.14] - 2026-07-05

**Pre-release (beta) — dashboard due-date fix + refreshed marketing screenshots.**

### Fixed

- **The Workbench and Vivid dashboards showed a literal "Due in {n}d"** in the "Today's work" list instead of the actual number of days (e.g. "Due in 2d"). The `{n}` placeholder wasn't being substituted for the due-date and overdue labels. Now fixed in both themes.

### Internal

- Screenshot tooling overhauled for the marketing site: the demo store seeds a Print-File library (with real PNG preview thumbnails) so the new 3.1 screens capture non-empty; the capture scripts gate on the demo data actually landing (fixing empty dashboards/queues); and new scripts capture the full website gallery (Workbench/Command/Vivid × EN/AR, including Print Files and Colour Studio) plus a three-modes dashboard showcase.

## [3.1.0-beta.13] - 2026-07-05

**Pre-release (beta) — every installed slicer, not just one.** Khayt now finds the slicers already on your computer instead of expecting you to type a program path by hand.

### Added

- **"Detect installed slicers" in Settings → Slicer.** One click scans your machine for every supported slicer (PrusaSlicer, OrcaSlicer, Bambu Studio, Cura, SuperSlicer, ideaMaker, Simplify3D, Creality Print, Lychee, CHITUBOX, FlashPrint) and adds each one it finds — so when you open a print file, **all** of them are offered, not just a single default.
  - The first time you open the Slicer settings with nothing configured, this scan runs **automatically** and populates the list for you. You can still remove any you don't want, or add one manually.
  - Detection is cross-platform: macOS `/Applications` (resolving each app bundle to its real executable), Windows Program Files / Local App Data, and Linux `PATH`, common bin directories, Flatpak exports and `.AppImage` files.
  - Merging never creates duplicates — a slicer already in your list (by path) is skipped.

## [3.1.0-beta.12] - 2026-07-05

**Pre-release (beta) — converted 3MFs stay with your print file.** Converting a 3MF used to always pop a save dialog and drop the result in whatever folder you picked. Now the conversion is kept **in-app, with the file it came from** by default.

### Changed

- **The 3MF converter now asks where the result should go** — "Keep it with this print file", "Add it to my Print-File library", or "Save to a folder…". The in-app options are the default.
  - Converting from a **library card** attaches the converted 3MF to that same print file. It appears under the card with its own **Open-in-slicer** and remove buttons, and is stored alongside the original in the file's vault.
  - Converting from the standalone **Converter tab** (in-app option) adds the result to your Print-File library as a new entry, with a preview generated automatically.
  - "Save to a folder…" keeps the previous behaviour (choose a location on disk).

## [3.1.0-beta.11] - 2026-07-05

**Pre-release (beta) — mode separation in themed dashboards.** Follow-up to the earlier three-mode work: each visual theme draws its **own** dashboard, and those bespoke dashboards were still showing business figures (revenue, receivables, and a profit-margin %) to **Enthusiast (hobbyist)** users, who should see none. This release cleanly separates the three experiences everywhere.

### Fixed

- **Themed dashboards no longer show revenue, receivables or profit margin in Enthusiast mode.** The **Command, Cockpit, Workbench and Vivid** theme dashboards (and Command's status bar, Cockpit's stats bar) hid revenue "today"/"this month", the "booked"/"unpaid" totals, quote follow-ups, and — on Command — the average **profit-margin %**. Where a money figure sat in a fixed grid, it's replaced with a personal stat (prints today, print hours, prints this month) so the dashboard stays complete rather than leaving a gap. The profit-margin tile is now **Professional-only**; revenue is shown in Simple and Professional.
- **The cost calculator's margin strip** (in the studio/default theme) now shows only the **cost** in Enthusiast mode — the margin %, the "at margin" selling price and the project total are hidden (a hobbyist prices nothing).
- **Customer identity and sale values removed from Enthusiast queue surfaces.** The **Job-Intake funnel** no longer shows client names, per-item estimated value, or the sales "Pipeline value"; the **kiosk display** and every themed queue card drop the client name; and the **quotes-awaiting-approval** strip is hidden entirely in Enthusiast mode.

## [3.1.0-beta.10] - 2026-07-05

**Pre-release (beta) — full UI review, part 3: localization.** The final pass from the interface review closes a translation gap.

### Fixed

- **The whole 3.1 feature set was only in English and Arabic.** The Colour Studio, Print-File Library, 3MF Converter, colour planner and multi-slicer picker — 97 interface strings in total — showed in English for users running the app in **German, Spanish, French, Japanese, Turkish or Chinese** (the parity check only covered Arabic, so the gap went unnoticed). All 97 strings are now translated in every one of the eight languages.

### Internal

- The locale parity check was tightened from "Arabic only" to **all eight languages** — every English string must now be translated in every locale (and keep its `{placeholders}`), so a feature can't ship half-localized again.

## [3.1.0-beta.9] - 2026-07-05

**Pre-release (beta) — full UI review, part 2: visual polish, accessibility & cleanup.** The second pass from the interface review fixes rendering bugs, improves keyboard/screen-reader support, and removes dead code.

### Fixed

- **Kiosk cards and Waiting-list items rendered with no background** in every theme (an undefined colour variable) — now use the standard surface colour.
- **Print-file thumbnails and part-status indicators looked wrong in light themes** — a hardcoded near-black thumbnail placeholder and a couple of hardcoded greys now follow the active theme.
- **The favorite ⭐ button on print-file cards** sat on the wrong side in Arabic (RTL) — now mirrors correctly.
- **A duplicate "quote" status-badge style** (one of two conflicting definitions never applied) was removed.

### Accessibility

- **Pop-up dialogs now trap keyboard focus, move focus into the dialog on open, and restore it on close** (reorder, recovery-code, PIN, delete-confirmation and update dialogs) — previously you could Tab out of them into the page behind.
- **Icon-only delete buttons (× / ✕) across the app now have accessible names** so screen readers announce them.
- Added focus outlines to the studio sliders and the global-search box, an accessible name to the Settings side navigation, and hid a decorative check-mark from screen readers.

### Cleanup

- Removed ~90 lines of dead CSS (old language/theme toggles, superseded badge/grid/mode styles), a dead invoice-number helper, a broken PDF-export progress hook (now wired to the real button), and two leftover debug log lines. No behaviour change.

## [3.1.0-beta.8] - 2026-07-05

**Pre-release (beta) — full UI review, part 1: correctness.** A comprehensive review of the whole interface (mode split, theme shells, RTL, event wiring) turned up a set of real bugs. This release fixes the functional ones; visual/accessibility polish and localization follow in the next betas.

### Fixed

- **Some themes made features unreachable.** In the **Atlas** and **Cockpit** themes several tabs (including the new Print-File Library, Colour Studio and 3MF Converter) had no way to be opened, and in **Workbench / Command / Vivid** those three tools appeared as unlabelled orphan buttons. All tabs are now reachable in every theme — Atlas gained a **"More" menu** for its minimal top bar, Cockpit shows the full set, and the three tools are grouped correctly (and added to Command's icon rail). Switching away from Cockpit no longer leaves its renamed labels on the other themes.
- **Business features leaked into Enthusiast (hobbyist) mode.** The **Production Queue** cards showed Invoice / Mark-paid / Buy-Now-Pay-Later buttons, payment badges, the customer name and the sale price for hobbyists — all now hidden in Enthusiast mode (the cost, hours, parts and delivery controls stay). **Global search** no longer returns orders, clients, products or expenses in Enthusiast mode, and can no longer open the Pro-only Expenses tab from a search result in Simple mode. The **Waste Log** no longer shows the "% of revenue" figure or the per-order table for hobbyists.
- **Waste Log "top orders" table had mismatched headers** — the columns showed order ID and project under "Status" and "Client" headings. Headers now read **Order** and **Product**, matching the data.
- **"Auto-draft POs" toggle** in Inventory is now hidden in Simple/Enthusiast, where the Purchase-Orders surface it feeds is unavailable.

## [3.1.0-beta.7] - 2026-07-04

**Pre-release (beta) — Simple & Professional mode review.** Following the Enthusiast-mode cleanup, the same three-mode review was extended to **Simple** and **Professional**. It found the Analytics/reports tab unreachable in Simple, Pro-only machine maintenance leaking into Simple, and a dashboard widget hidden in the wrong mode.

### Fixed

- **Sales reports now reachable in Simple mode.** The **Analytics** tab was gated Professional-only, so small shops on Simple mode had no reports at all. It now opens in Simple as a focused **sales-reports** view (month revenue, orders, receivables, top products); Professional keeps the full analytics dashboard, and Enthusiast still hides it entirely.
- **Machine maintenance is now Professional-only, everywhere.** The **maintenance log**, **nozzle-change logging**, **service-due / downtime badges** and the **downtime scheduler** were showing on printer rows in Simple mode even though machine maintenance is a Professional feature — they're now hidden unless you're in Professional mode.
- **Production forecast now shows in Simple mode.** The per-printer "estimated time to clear the queue" widget on the dashboard was shown in Enthusiast and Professional but hidden in Simple. It's a personal planning widget (no revenue figures), so it now appears in all three modes.
- **Expense tracking documented as Professional.** The in-app tier comparison now correctly lists **Expense tracking** and **Sales reports** under the right tiers.

## [3.1.0-beta.6] - 2026-07-04

**Pre-release (beta) — Enthusiast mode cleanup.** A review of the three-mode split (Enthusiast / Simple / Professional) found several business features still showing in **Enthusiast (hobbyist)** mode. Enthusiast mode is meant to have no commerce at all; these are now hidden.

### Fixed

- **Business features no longer appear in Enthusiast mode.** The **Product Catalog** and **Analytics** tabs (both commerce surfaces) were visible to hobbyists and are now hidden. The **dashboard** no longer shows unpaid/receivables, aging, quote follow-ups, order revenue or the monthly revenue goal in Enthusiast mode — only your printers, filament, production forecast and today's prints. The **notification bell** no longer raises quote-expiry, recurring-order or installment-payment alerts for hobbyists (overdue jobs, low stock and maintenance reminders still do). The **cost calculator** hides the client picker, client PO/reference, deposit field and "Save as Quote" — leaving the cost maths, printer assignment and "send to queue". Simple and Professional modes are unchanged.

## [3.1.0-beta.5] - 2026-07-04

**Pre-release (beta) — the multi-printer 3MF converter.** The last of the BedReady-style colour tools: take a multicolour 3MF sliced for one printer and retarget it to another, or clean it up into a standard file any slicer opens.

### Added

- **3MF Converter** — a new **Converter** tab (personal core, every mode) plus a **Convert** action on every 3MF in your Print-File library. Pick a target printer — **Snapmaker U1, Bambu Lab (X1C / P1S / A1), Prusa (MK4 + MMU3, XL), Creality K2 Plus, Anycubic Kobra S1** — and Khayt rewrites the file's printer profile (model, bed size, nozzle) for it. For multicolour files you can **remap each source colour to a specific slot** on the target printer. Or choose **Generic 3MF** to strip vendor-locked slicer settings and produce a clean standard file. Your model geometry is never touched by the conversion — only the slicer metadata is rewritten — so a converted file can't come out corrupted; worst case you fine-tune a setting in your slicer. Everything runs locally.

## [3.1.0-beta.4] - 2026-07-04

**Pre-release (beta) — update-system reliability fix.** The in-app updater could behave erratically; this release makes the automatic check as strict and consistent as the manual one.

### Fixed

- **Erratic / duplicate update prompts** — the automatic update notification now goes through the exact same checks as the manual **Check for updates** button. Previously the automatic path could pop the update window for a beta when beta updates were switched off, prompt inconsistently with the manual check, offer an *older* release as a "downgrade update" when running a beta build, or — on a manual check — briefly stack two update windows at once. All of these are resolved; the updater will never offer a downgrade and only prompts for a genuinely newer, allowed release.

## [3.1.0-beta.3] - 2026-07-04

**Pre-release (beta) — multiple slicers.** Many makers run more than one slicer (PrusaSlicer for FDM, a vendor slicer for a particular printer, a resin slicer). Khayt now supports a list of them instead of a single program.

### Added

- **Multiple slicers** — Settings → Slicer now holds a list. Add each slicer you use (name, program path, optional slice command), mark one as the **default**, and test each one. Your existing single-slicer setup is migrated automatically and keeps working everywhere it did before (slice-and-print from the queue, machine slice, quote slicing all use the default).
- **Slicer chooser on open** — when you have more than one slicer configured and hit **Open in slicer** on a print-file library card, Khayt asks which one to launch and remembers your choice for that file. With a single slicer configured, it opens straight away as before.

## [3.1.0-beta.2] - 2026-07-04

**Pre-release (beta) — the Colour Mixer suite.** Turns the colour every filament already stores, and the multicolour data parsed from 3MF files, into a set of colour tools for makers. Personal core: available in every mode, including Enthusiast.

### Added

- **Colour studio** — a new **Colour** tab (personal core, in every mode). It has two panels: a **stock matcher** that takes any target colour and ranks the filaments you actually own by perceptual closeness (ΔE / CIEDE2000 — the same distance metric print shops use), showing each one's grams in stock and a low-stock flag; and a **blend & gradient** tool that mixes two colours (gamma-correct, in linear light) and builds an N-step gradient for ombré or colour-swap plans, annotating every step with its nearest in-stock filament. Click any swatch to copy its hex.
- **Multicolour print planner** — from any print-file library card that carries more than one colour (or from the Colour tab), assign each of the file's colours to a filament you own — defaulting to the closest ΔE match — tune the grams per colour, and see per-colour cost and the file's swap count live. **Add to calculator** pushes the whole thing into the cost calculator as a single part with the exact blended material cost, and remembers the assignment on the file. When that job later completes, filament is deducted from *each* colour's own spool (with same-material fallback), not just one.
- **Filament hex input** — the colour picker in the add-filament form and the edit dialog now has a paired hex text field, so you can paste an exact colour code (e.g. from a filament maker's spec) instead of eyeballing the swatch.

## [3.1.0-beta.1] - 2026-07-04

**Pre-release (beta) — opens the 3.1 cycle for 3D-printing enthusiasts.** Two foundation features that make Khayt work for hobbyists, not just print shops.

### Added

- **Enthusiast mode** — a new third experience alongside Simple and Professional, chosen in the first-run wizard or Settings → Preferences. Enthusiast mode is for personal/hobby printing: it hides everything commercial (customer orders, clients, invoicing & ZATCA e-invoicing, payments, the online storefront & customer portal, gift cards) and keeps just the personal core — the production queue, cost-per-print calculator, filament inventory, printers & monitoring, the new print-file library, waste log and personal reports. Switch modes anytime; no data is lost.
- **Print-File Library** — a standalone, searchable catalogue of your STL, 3MF and G-code files, independent of any order. Each file gets a **real preview thumbnail** (the slicer's own embedded preview for G-code/3MF, or a software-rendered 3D view for STL — no cloud, no extra dependencies), parsed metadata (print time, filament grams, slicer, dimensions), an optional photo, tags, a "tested settings" note and an attached slicer profile, plus **multicolour 3MF info** (filament colours used and swap count). Open any file straight into your installed slicer in one click. Everything stays on your machine.

**Khayt 3.0 — stable release.** The 3.0 platform is now stable and generally available. Built on the fully-offline core (quoting, Kanban production queue, ZATCA Phase 2 e-invoicing, live printer monitoring, filament inventory and analytics), 3.0 adds an **optional, end-to-end-encrypted cloud** layer — sync, team accounts, an online storefront with checkout and deposits, a customer portal, remote mobile access, and an AI assistant — none of which is required to run the app. This release is the culmination of the 3.0 beta cycle (beta.1–beta.21): it ships all 8 interface languages fully translated, a fixed first-run onboarding wizard, and a full release-candidate hardening pass that verified fresh-install, large-dataset (3,000 orders), all-10-designs, and all-locale rendering with zero runtime errors.

### Added

- **All 8 interface languages now fully translated** — German, Spanish, French, Japanese and Chinese join English, Arabic and Turkish at full coverage (every one of the ~3,150 UI strings). Previously these five each fell back to English for ~210 strings; now the entire interface renders in your chosen language. A 1.0 readiness step toward a polished international release.

### Fixed

- **First-run onboarding** — a brand-new install now correctly shows the setup wizard. (The default starter inventory was making a fresh shop look "already set up", which skipped onboarding for first-time users.)

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
