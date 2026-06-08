# Changelog

All notable changes to Khayt are documented here. Version format: [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

### Added

- **Platform decision doc** — [docs/PLATFORM-MIGRATION.md](./docs/PLATFORM-MIGRATION.md): stay on Electron; when/how to revisit Tauri or shared core (not Swift+C++ per OS).
- **Online option** — Settings and setup wizard toggle to enable customer quote requests via LAN intake link (`/intake`); panel on Job Intake with copy link; no Khayt cloud.
- **Online hub** — Settings panel lists intake, quote-approval, and tracking links (copy per order) when LAN server is running.
- **Intake → calculator** — Job Intake “Quote in calculator” pre-fills client, part name, and notes (creates client when needed).
- **Solo maker dashboard** — Simple mode shows a focused “Your shop today” row; farm-style KPI/machine load stays in Professional mode.
- **iOS Companion** — Home quick actions, low-stock alerts, order preview; Orders tab (active filters + recent history); order/spool detail sheets; inventory search and low-stock filter; [IOS_UI_REDESIGN_PROMPT.md](./docs/IOS_UI_REDESIGN_PROMPT.md) for AI UI redesign.
- **iOS Companion (full v1)** — English/Arabic + RTL, connection banner, kanban strip, overdue filter, local notifications, home screen widget sources, Siri shortcuts, App Group widget snapshot.
- **iOS Companion (v2)** — LAN API extensions (intake, clients, inventory edit, create order, quote links, live printer telemetry); offline tools mode (scan/NFC without desktop); cached data when LAN unreachable.

### Changed

- **Check for updates (source builds)** — Explains that new work is on `main` via `git pull`, not the DMG feed, while release hold is active.
- **Online settings discoverability** — Dedicated **Settings → Online** sidebar item (enable quote requests, intake link, LAN server); no longer buried at the bottom of Data & Locale.
- **iOS Companion** — add spool from Inventory (+) with method picker (scan label, NFC, manual); removed separate Add spool tab. Optional SKU, batch/lot, print/bed temps on review form. Label parser supports more non-English patterns (AR/DE/FR/ES).

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
