# Khayt engineering roadmap

Living priorities for maintainers. Not a public commitment calendar — reorder as the product needs.

## Now (2.2.x)

- [ ] Triage post-2.2.0 feedback; plan 2.2.x patches or 2.3.0

## Shipped (2.2.0 — 2026-05-30)

| Bundle | Theme | Status |
|--------|--------|--------|
| **A** | Production shop | LAN printer polling, gift card checkout, WIP hard limits |
| **B** | ZATCA & email | Auto-submit, submission log, custom SMTP |
| **C** | Customer portal | LAN quote approval links, portal survey |
| **D** | Platform hardening | E2E critical flows, ensure-electron, stale branch helper |

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
