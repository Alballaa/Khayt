# Changelog

All notable changes to Khayt are documented here. Version format: [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

### Added

- **Online option** — Settings and setup wizard toggle to enable customer quote requests via LAN intake link (`/intake`); panel on Job Intake with copy link; no Khayt cloud.
- **Online hub** — Settings panel lists intake, quote-approval, and tracking links (copy per order) when LAN server is running.
- **Intake → calculator** — Job Intake “Quote in calculator” pre-fills client, part name, and notes (creates client when needed).
- **Solo maker dashboard** — Simple mode shows a focused “Your shop today” row; farm-style KPI/machine load stays in Professional mode.

### Changed

- **Check for updates (source builds)** — Explains that new work is on `main` via `git pull`, not the DMG feed, while release hold is active.

- **Online settings discoverability** — Dedicated **Settings → Online** sidebar item (enable quote requests, intake link, LAN server); no longer buried at the bottom of Data & Locale.

### Fixed

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
