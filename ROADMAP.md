# Khayt engineering roadmap

Living priorities for maintainers. Not a public commitment calendar — reorder as the product needs.

## Now (2.3.x)

- [ ] **Multi-shop shared data (Khayt Cloud)** — design: [docs/MULTI-SHOP-CLOUD.md](./docs/MULTI-SHOP-CLOUD.md); needs product answers before Phase 1 (org/auth API)
- [ ] Triage post-2.3.1 feedback; plan next patch or 2.4.0 features
- [x] Stabilization patch **v2.3.1** (portal tracking URL, operator PIN, UTC recurring dates, npm audit overrides)
- [x] Run `node scripts/list-stale-branches.mjs --merged-into main` and delete merged `cursor/*` branches (maintainer cleanup, 2026-06-04)

## Shipped (2.2.0 — 2026-05-30)

| Bundle | Theme | PR | Highlights |
|--------|--------|-----|------------|
| **A** | Production shop | [#49](https://github.com/Alballaa/Khayt/pull/49) | LAN printer polling (RFC1918), gift card checkout, WIP hard limits |
| **B** | ZATCA & email | [#50](https://github.com/Alballaa/Khayt/pull/50) | Auto-submit pipeline, submission log, custom SMTP |
| **C** | Customer portal | [#51](https://github.com/Alballaa/Khayt/pull/51) | LAN quote approval links, portal survey, share modal |
| **D** | Platform hardening | [#53](https://github.com/Alballaa/Khayt/pull/53) | E2E critical flows, ensure-electron, stale PR cleanup |

### Superseded / closed

| PR | Reason |
|----|--------|
| [#3](https://github.com/Alballaa/Khayt/pull/3) | Early sidebar shell; **Studio shell on `main`** replaced it. Close without merging. |
| [#11](https://github.com/Alballaa/Khayt/pull/11) | Lint scope; superseded by `npm run lint` / `npm run check` on `main`. |
| [#31](https://github.com/Alballaa/Khayt/pull/31) | `test/store-io.test.js` already on `main`; branch is an old refactor stack. |
| [#52](https://github.com/Alballaa/Khayt/pull/52) | Wrong Bundle D scope (daily ops). Replaced by platform-hardening branch. |
| [#59](https://github.com/Alballaa/Khayt/pull/59)–[#60](https://github.com/Alballaa/Khayt/pull/60) | Security scans consolidated in **v2.3.0** (`release-hardening`). |

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
