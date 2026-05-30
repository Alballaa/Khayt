# Changelog

All notable changes to Khayt are documented here. Version format: [VERSIONING.md](./VERSIONING.md).

## [Unreleased]

### Added

- Versioning policy (`VERSIONING.md`), release checklist, and `npm run version:*` helpers.
- Maintainer guide (`CONTRIBUTING.md`) and engineering roadmap (`ROADMAP.md`).
- `npm run lint`, `npm run check`, and `npm test` (unit tests for `lib/` helpers).
- Unit tests for ZATCA ASN.1 DER encoding and CSR building.
- `renderer/format.js` with tests for `num`, `fmtMoney`, `computeUnitPrice`, and CSV neutralization.
- Split from `app.js`: `app-state.js`, `shell.js`, `util.js`, `currency.js`, `calculator-cost.js`, `build.js` (calculator tab, quote cart, presets, quote templates), `wire-events.js` (initial render + DOM listeners), `app-boot.js` (setup wizard + `DOMContentLoaded`), `app-exports.js` (auto-backup, quote approval, milestones, work orders), `integrations.js` (Telegram, iCal, referral analytics, shipping tracking), `inventory.js` (spools, catalog, POs, NFC import, material forecast), `machines.js`, `clients.js`, `expenses.js`, `waste.js`, `kanban.js`, `invoicing.js`, `logs.js`, `settings.js`, `order-flows.js`, `waiting-list.js`, `dashboard.js`, `analytics.js` (with unit tests).

### Changed

- `safeJsonParse`, `isBlockedHost`, and ZATCA ASN.1 helpers moved from `main.js` into `lib/` for reuse and testing.

## [2.0.15] - (current)

Ongoing production line. See [GitHub Releases](https://github.com/Alballaa/Khayt/releases) for prior `2.0.x` notes.
