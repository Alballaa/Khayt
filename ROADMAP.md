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
- [ ] Finish CSP hardening: drop `script-src 'unsafe-inline'` after all dynamic handlers use `data-act`
- [ ] Split `main.js` into `lan-server`, `zatca-crypto` (`lib/store-io.js`, `lib/updater.js` done)

## Later (2.x / 3.0.0 when justified)

- [ ] Locale files per language instead of monolithic `i18n.js`
- [ ] Playwright smoke test: launch app, save store, LAN PIN gate
- [x] Typed store contract (JSDoc + `renderer/store-validate.js`) validated on load
- [ ] LAN tunnel: require PIN + in-app risk warning before exposing via localtunnel

## Versioning reminder

| Type | Example |
|------|---------|
| Patch (minor updates) | `2.0.15` → `2.0.16` |
| Minor (significant) | `2.0.16` → `2.1.0` |
| Major | `2.0.x` → `3.0.0` |

Details: [VERSIONING.md](./VERSIONING.md).
