# Changelog

All notable changes to Khayt are documented here. Version format: [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

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

**Pre-release (beta)** — Khayt-4 design themes ship beside stable **v2.3.2**. Install from [GitHub Releases → Pre-releases](https://github.com/Alballaa/Khayt/releases). Stable installs do not auto-update to beta; see [docs/BETA-RELEASE.md](./docs/BETA-RELEASE.md).

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

Patch line preceding 2.1.0. See [GitHub Releases](https://github.com/Alballaa/Khayt/releases) for prior `2.0.x` notes.
