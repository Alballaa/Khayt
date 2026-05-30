# Changelog

All notable changes to Khayt are documented here. Version format: [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

### Added (2.2.0 — Bundle D: Platform hardening)

- **E2E critical flows** — tab navigation (queue, calculator, logs), order create → kanban → status change → logs, plus existing boot/store/LAN PIN tests (`scripts/e2e/helpers.mjs`).
- **ensure-electron** — `prestart` and `pretest:e2e` run `scripts/ensure-electron.js`; new `npm run install:electron`; empty `path.txt` triggers re-download.
- **Stale branch helper** — `node scripts/list-stale-branches.mjs` flags superseded PR branches (e.g. wrong Bundle D #52).
- **`npm run check`** — now runs lint + unit tests (E2E remains separate: `npm run test:e2e`).
- **ROADMAP.md** — full 2.2.0 bundle table (A–D) and superseded PR notes.

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
