# Khayt engineering roadmap

Living priorities for maintainers. Not a public commitment calendar — reorder as the product needs.

## Now (2.0.x patch series)

- [x] Document versioning (`VERSIONING.md`) — continue from **2.0.15**, no version reset
- [x] Align CI Node version with README (22 LTS)
- [x] Add `npm run lint` for `main.js`, `preload.js`, `renderer/*.js` (includes `store.js`, `studio/*.js`, `lib/*.js`)
- [x] Remove or relocate unused root Vite/React scaffold — gone; app is `renderer/` only

## Next (2.1.0 — significant)

- [ ] Split `renderer/app.js` into feature modules (started: `format`, `util`, `currency`, `calculator-cost`, `kanban`, `invoicing`, `logs`, `settings`, `order-flows`, `waiting-list`, `dashboard`, `analytics` (incl. capacity/break-even/receivables); next: `main.js` or build/calculator tab)
- [ ] Unit tests for pure logic: more `app.js` splits (started: `lib/store-io` + `renderer/*` + `store.js` / `store-validate` + `npm test`)
- [x] Finish CSP hardening: drop `script-src 'unsafe-inline'` in Electron CSP (renderer uses `data-act`; LAN/export HTML may still use inline scripts)
- [x] Split `main.js` into feature modules (`lib/store-io.js`, `lib/updater.js`, `lib/lan-server.js`, `lib/zatca-crypto.js`)

## Later (2.x / 3.0.0 when justified)

- [x] Locale files per language (`renderer/locales/*.js` + thin `i18n.js` loader; `npm run i18n:extract`)
- [x] E2E smoke test: launch app, store round-trip, LAN PIN gate (`npm run test:e2e`, CI with xvfb)
- [x] Typed store contract (JSDoc + `renderer/store-validate.js`) validated on load
- [x] LAN tunnel: require PIN + confirm dialog before exposing via localtunnel

## Versioning reminder

| Type | Example |
|------|---------|
| Patch (minor updates) | `2.0.15` → `2.0.16` |
| Minor (significant) | `2.0.16` → `2.1.0` |
| Major | `2.0.x` → `3.0.0` |

Details: [VERSIONING.md](./VERSIONING.md).
