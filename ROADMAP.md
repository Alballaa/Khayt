# Khayt engineering roadmap

Living priorities for maintainers. Not a public commitment calendar — reorder as the product needs.

## Now (2.0.x patch series)

- [x] Document versioning (`VERSIONING.md`) — continue from **2.0.15**, no version reset
- [x] Align CI Node version with README (22 LTS)
- [ ] Add `npm run lint` for `main.js`, `preload.js`, `renderer/*.js`
- [ ] Remove or relocate unused root Vite/React scaffold (`src/`, root `index.html`)

## Next (2.1.0 — significant)

- [ ] Split `renderer/app.js` into feature modules (store, calculator, kanban, invoicing, settings)
- [ ] Unit tests for pure logic: ZATCA ASN.1, `safeJsonParse`, costing helpers, `isBlockedHost`
- [ ] Finish CSP hardening: drop `script-src 'unsafe-inline'` after all dynamic handlers use `data-act`
- [ ] Split `main.js` into `lan-server`, `store-io`, `zatca-crypto`, `updater`

## Later (2.x / 3.0.0 when justified)

- [ ] Locale files per language instead of monolithic `i18n.js`
- [ ] Playwright smoke test: launch app, save store, LAN PIN gate
- [ ] Typed store contract (JSDoc or JSON Schema) validated on load
- [ ] LAN tunnel: require PIN + in-app risk warning before exposing via localtunnel

## Superseded branches

Do not merge or revive these without a deliberate re-plan — `main` already contains the shipped replacement.

| PR | Branch | Superseded by |
|----|--------|---------------|
| [#3](https://github.com/Alballaa/Khayt/pull/3) | `cursor/ui-shell-redesign-c86e` | Studio shell on `main` (`renderer/studio/*`, `khayt-studio` layout) via PRs [#4](https://github.com/Alballaa/Khayt/pull/4)–[#8](https://github.com/Alballaa/Khayt/pull/8) and publish cleanup [#9](https://github.com/Alballaa/Khayt/pull/9) (v2.0.16). Early sidebar prototype; conflicts in `renderer/app.js`, `renderer/index.html`, `renderer/i18n.js`, and `design/README.md`. **Close without merging.** |

## Versioning reminder

| Type | Example |
|------|---------|
| Patch (minor updates) | `2.0.15` → `2.0.16` |
| Minor (significant) | `2.0.16` → `2.1.0` |
| Major | `2.0.x` → `3.0.0` |

Details: [VERSIONING.md](./VERSIONING.md).
