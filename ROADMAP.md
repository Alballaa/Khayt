# Khayt engineering roadmap

Living priorities for maintainers. Not a public commitment calendar — reorder as the product needs.

## Now (1.1.x patch series)

- [x] Document versioning (`VERSIONING.md`) and reset baseline to **1.1.0**
- [x] Align CI Node version with README (22 LTS)
- [ ] Add `npm run lint` for `main.js`, `preload.js`, `renderer/*.js`
- [ ] Remove or relocate unused root Vite/React scaffold (`src/`, root `index.html`)

## Next (1.2.0 — significant)

- [ ] Split `renderer/app.js` into feature modules (store, calculator, kanban, invoicing, settings)
- [ ] Unit tests for pure logic: ZATCA ASN.1, `safeJsonParse`, costing helpers, `isBlockedHost`
- [ ] Finish CSP hardening: drop `script-src 'unsafe-inline'` after all dynamic handlers use `data-act`
- [ ] Split `main.js` into `lan-server`, `store-io`, `zatca-crypto`, `updater`

## Later (1.x / 2.0.0 when justified)

- [ ] Locale files per language instead of monolithic `i18n.js`
- [ ] Playwright smoke test: launch app, save store, LAN PIN gate
- [ ] Typed store contract (JSDoc or JSON Schema) validated on load
- [ ] LAN tunnel: require PIN + in-app risk warning before exposing via localtunnel

## Versioning reminder

| Type | Example |
|------|---------|
| Patch | `1.1.3` → `1.1.4` |
| Minor (significant) | `1.1.4` → `1.2.0` |
| Major | `1.9.0` → `2.0.0` |

Details: [VERSIONING.md](./VERSIONING.md).
