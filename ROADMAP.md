# Khayt engineering roadmap

Living priorities for maintainers. Not a public commitment calendar — reorder as the product needs.

## Release 2.2.0 (in progress)

Four feature bundles land as independent PRs off `main`. Merge order is flexible; run full `npm run check` and `npm run test:e2e` after combining.

| Bundle | Theme | Branch | PR | Status |
|--------|--------|--------|-----|--------|
| **A** | Production shop | `cursor/2-2-0-production-shop-d4c8` | [#49](https://github.com/Alballaa/Khayt/pull/49) | LAN printer polling (RFC1918), gift card checkout, WIP hard limits |
| **B** | ZATCA & email | `cursor/2-2-0-zatca-compliance-d4c8` | [#50](https://github.com/Alballaa/Khayt/pull/50) | Auto-submit pipeline, submission log, custom SMTP |
| **C** | Customer portal | `cursor/2-2-0-quote-approval-d4c8` | [#51](https://github.com/Alballaa/Khayt/pull/51) | LAN quote approval links, portal survey, share modal |
| **D** | Platform hardening | `cursor/2-2-0-platform-hardening-d4c8` | [#53](https://github.com/Alballaa/Khayt/pull/53) | E2E critical flows, ensure-electron, stale PR cleanup |

### Bundle D — Platform hardening (checklist)

- [x] Expand E2E: tab navigation (queue, calculator, logs), order lifecycle, store round-trip, LAN PIN gate
- [x] `pretest:e2e` / `prestart` → `scripts/ensure-electron.js`; add `install:electron` npm script
- [x] `scripts/list-stale-branches.mjs` — flag superseded/wrong Bundle D PR (#52 ops-fulfillment)
- [ ] Close superseded PR [#52](https://github.com/Alballaa/Khayt/pull/52) after this PR merges

### Superseded / close

| PR | Reason |
|----|--------|
| [#52](https://github.com/Alballaa/Khayt/pull/52) | Wrong Bundle D scope (daily ops). Replaced by platform-hardening branch. |

### After 2.2.0 ships

- [ ] Tag `v2.2.0` on `main`, update CHANGELOG release section
- [ ] Run `node scripts/list-stale-branches.mjs --merged-into main` and delete merged `cursor/*` branches
- [ ] Triage post-2.2.0 feedback for 2.2.x patches or 2.3.0 planning

## Completed (2.1.0 — 2026-05-30)

- [x] Document versioning (`VERSIONING.md`), lint, and test harness
- [x] Split `renderer/app.js` into feature modules (`app.js` is a thin entry shell)
- [x] Split `main.js` into `lib/store-io.js`, `lib/updater.js`, `lib/lan-server.js`, `lib/zatca-crypto.js`
- [x] Unit tests for pure logic (`npm test` — 120+ cases)
- [x] CSP hardening: drop `script-src 'unsafe-inline'` in Electron CSP
- [x] Locale files per language (`renderer/locales/*.js` + `npm run i18n:extract`)
- [x] E2E smoke test (`npm run test:e2e`)
- [x] Typed store contract validated on load (`renderer/store-validate.js`)
- [x] LAN tunnel: confirm dialog + risk acknowledgement before `localtunnel`

## Versioning reminder

| Type | Example |
|------|---------|
| Patch (minor updates) | `2.1.0` → `2.1.1` |
| Minor (significant) | `2.1.0` → `2.2.0` |
| Major | `2.x.x` → `3.0.0` |

Details: [VERSIONING.md](./VERSIONING.md).
