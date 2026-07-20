# Khayt engineering roadmap

Living priorities for maintainers. Not a public commitment calendar — reorder as the product needs.

## Now (3.2.x — on `main`, **no public release** until [RELEASE-HOLD.md](./RELEASE-HOLD.md) lifted)

Stable is held at **v3.1.0**; the 3.2 line ships as betas (currently **v3.2.0-beta.22**).

- [ ] Real-world verification pass on the 3.2 features before a stable cut — see
      [docs/PRELAUNCH-QA.md](./docs/PRELAUNCH-QA.md). Two items specifically need hardware:
      the **printer camera** live image path, and carrier **API** shipping (manual shipping
      is fully working and tested).
- [ ] Decide whether to cut **stable 3.2.0** or continue the beta line.
- [ ] **Multi-shop shared data (Khayt Cloud)** — still deferred; design:
      [docs/MULTI-SHOP-CLOUD.md](./docs/MULTI-SHOP-CLOUD.md)

### Known gaps, deliberately not built

These are recorded so nobody assumes they exist:

| Gap | Why |
|-----|-----|
| **Telemetry transport** | No endpoint exists. Events are scrubbed and queued locally; nothing is transmitted. Build the endpoint before wiring a sender. |
| **Timelapse capture/encoding** | Needs ffmpeg + a real printer. `machine.webcam` carries the fields; no capture runs. |
| **Zapier / Make connectors** | External publishing artefacts, not code in this repo. |
| **Cloud-relayed public API**, remote-mobile PWA, cloud infra | Live in the separate `khayt-cloud` repo. |
| **Phase 3 — multi-shop HQ** | Depends on the Cloud decision above. |

## Shipped (3.2.0 beta line — 2026-07)

Every item below is on `main` with unit tests **and** a live Electron smoke wired into CI.

| Beta | Feature | Spec |
|------|---------|------|
| beta.11 | Maker-tools depth (print-file folders/tags/bulk import, M600 colour-swap, Orca-family install) | — |
| beta.12 | **QC / reprint / RMA** — inspection gate, defects, linked reprints, warranty | [QC](./docs/KHAYT-3.0-QC-SPEC.md) |
| beta.13 | **Printer catalog** + machine→calculator auto-fill + auto-priced catalog products | — |
| beta.14 | **Shipping & fulfillment** — Saudi carriers, manual-first, portal tracking | [SHIPPING](./docs/KHAYT-3.0-SHIPPING-SPEC.md) |
| beta.15 | **BOM / assembly** — components, cost rollup, stock deduction | [BOM](./docs/KHAYT-3.0-BOM-SPEC.md) |
| beta.16 | **Privacy / PDPL** — intake consent, DSAR export, erasure modes, retention | [PRIVACY](./docs/KHAYT-3.0-PRIVACY-COMPLIANCE-SPEC.md) |
| beta.17 | **Assembly tracking** — per-part QC, completion gate, per-part reprint | [BOM §5](./docs/KHAYT-3.0-BOM-SPEC.md) |
| beta.18 | **Public API** — scoped bearer tokens + versioned `/v1` | [PUBLIC-API §1](./docs/KHAYT-3.0-PUBLIC-API-SPEC.md) · [openapi.yaml](./docs/openapi.yaml) |
| beta.19 | **Webhook event bus** — subscriptions, fan-out, retry, delivery log | [PUBLIC-API §2](./docs/KHAYT-3.0-PUBLIC-API-SPEC.md) |
| beta.20 | **Telemetry** — opt-in, PII-free by construction (no transport yet) | [TELEMETRY](./docs/KHAYT-3.0-TELEMETRY-SPEC.md) |
| beta.21 | **Durable webhook retries** — survive an app restart | [PUBLIC-API §2](./docs/KHAYT-3.0-PUBLIC-API-SPEC.md) |
| beta.22 | **Printer cameras** — LAN-only, host-pinned snapshot proxy | [WEBCAM](./docs/KHAYT-3.0-WEBCAM-SPEC.md) |

**Already complete (verify before re-planning):** the Phase-0 sync foundation
(`renderer/sync.js` — change stamper, tombstones, delta extract) is implemented, wired
into the save choke point, and covered by tests. It was previously mis-recorded as a gap.

## Earlier

## Shipped (2.2.0 — 2026-05-30)

| Bundle | Theme | PR | Highlights |
|--------|--------|-----|------------|
| **A** | Production shop | [#49](https://github.com/khaytapp/Khayt/pull/49) | LAN printer polling (RFC1918), gift card checkout, WIP hard limits |
| **B** | ZATCA & email | [#50](https://github.com/khaytapp/Khayt/pull/50) | Auto-submit pipeline, submission log, custom SMTP |
| **C** | Customer portal | [#51](https://github.com/khaytapp/Khayt/pull/51) | LAN quote approval links, portal survey, share modal |
| **D** | Platform hardening | [#53](https://github.com/khaytapp/Khayt/pull/53) | E2E critical flows, ensure-electron, stale PR cleanup |

### Superseded / closed

| PR | Reason |
|----|--------|
| [#3](https://github.com/khaytapp/Khayt/pull/3) | Early sidebar shell; **Studio shell on `main`** replaced it. Close without merging. |
| [#11](https://github.com/khaytapp/Khayt/pull/11) | Lint scope; superseded by `npm run lint` / `npm run check` on `main`. |
| [#31](https://github.com/khaytapp/Khayt/pull/31) | `test/store-io.test.js` already on `main`; branch is an old refactor stack. |
| [#52](https://github.com/khaytapp/Khayt/pull/52) | Wrong Bundle D scope (daily ops). Replaced by platform-hardening branch. |
| [#59](https://github.com/khaytapp/Khayt/pull/59)–[#60](https://github.com/khaytapp/Khayt/pull/60) | Security scans consolidated in **v2.3.0** (`release-hardening`). |

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
