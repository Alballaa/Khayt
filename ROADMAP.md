# Khayt engineering roadmap

Living priorities for maintainers. Not a public commitment calendar — reorder as the product needs.

## Now (post-3.6.0-beta.1 — on `main`)

**Stable is v3.5.3** (2026-08-01, a security patch cut from the
`release/3.5.x` maintenance branch). **`main` is `3.6.0-beta.1`**, open and
soaking. No hold is active — see [docs/RELEASE-HOLD.md](./docs/RELEASE-HOLD.md).

Everything below needs a switched-on printer or real shop use. **There is no
queue of code waiting to be written** — that is the honest state of this file.

- [ ] **Soak `v3.6.0-beta.1`, then promote to stable.** It changes what
      customers are quoted and how every geometry-based time estimate is
      computed, so it needs real use against a real shop's settings before a
      stable cut — not just a green suite.
- [ ] **Verify the actuals reader against real hardware.**
      `npm run verify:printer -- moonraker <ip>`, **run mid-print**.
      `lib/printer-actuals.js` has only ever met hand-written fixtures, and a
      fixture built from the same misreading as the code agrees with it forever.
      An idle printer proves nothing; the script says so rather than passing.
- [ ] **The 3.2-era hardware pass is still outstanding** — see
      [docs/PRELAUNCH-QA.md](./docs/PRELAUNCH-QA.md). Two items need hardware:
      the **printer camera** live image path, and carrier **API** shipping
      (manual shipping is fully working and tested).
- [ ] **R7 — SDCP resin printers.** Protocol layer built and tested
      ([#529](https://github.com/KhaytApp/Khayt/pull/529)); needs the socket
      layer, then an Elegoo Mars/Saturn to verify against.
      See [docs/KHAYT-COMPETITIVE-ROADMAP.md](./docs/KHAYT-COMPETITIVE-ROADMAP.md).

**Multi-shop is no longer deferred.** Organisations shipped in **3.5.0** (create
one, add branches, one passphrase for all) and **3.5.1** (*Across the branches* —
the cross-branch view). This file previously listed it as pending "the Cloud
decision"; that decision was made and shipped. What remains beyond it is the
wider Phase-3 HQ surface, still unscheduled —
[docs/MULTI-SHOP-CLOUD.md](./docs/MULTI-SHOP-CLOUD.md).

### Known gaps, deliberately not built

These are recorded so nobody assumes they exist:

| Gap | Why |
|-----|-----|
| **Telemetry transport** | No endpoint exists. Events are scrubbed and queued locally; nothing is transmitted. Build the endpoint before wiring a sender. |
| **Timelapse capture/encoding** | Needs ffmpeg + a real printer. `machine.webcam` carries the fields; no capture runs. |
| **Zapier / Make connectors** | External publishing artefacts, not code in this repo. |
| **Cloud-relayed public API**, remote-mobile PWA, cloud infra | Live in the separate `khayt-cloud` repo. |
| **Phase 3 — multi-shop HQ** | The organisation layer it was waiting on shipped in 3.5.0/3.5.1. The HQ surface on top of it is unscheduled, not blocked. |

## Shipped (3.3 → 3.6 — 2026-07 to 2026-08)

Four stable lines and one open beta since 3.2.0. Full detail per release is in
[CHANGELOG.md](./CHANGELOG.md); this is the index.

| Version | Date | What it was |
|---------|------|-------------|
| **3.6.0-beta.1** | 2026-07-31 | **Khayt learns what prints actually cost.** A model becomes a quote ([#531]), a customer can upload one and get a price ([#532]), the printer reports real filament and duration on completion ([#533]), the settings that worked are remembered against the file ([#534]), duplicate models are recognised ([#535]), a finished job is joined to the file that produced it ([#536]), and the estimator calibrates itself from finished jobs ([#537]). Also fixed two things that had never worked: 3MF files never gave up their slicer figures, and Bambu/Orca print times were silently dropped. Closes **R1–R6** of the competitive roadmap. |
| **3.5.3** | 2026-08-01 | **Security.** Every per-IP brute-force lockout in the LAN server was inert and had been since v2.2.5 — the counter reset on every attempt, so it never reached the limit. Cut from `release/3.5.x`, not `main`. ([#548]) |
| **3.5.2** | 2026-07-30 | Two customer-facing places that could name the wrong currency. |
| **3.5.1** | 2026-07-30 | *Across the branches* — the cross-branch view 3.5.0 described but did not include. |
| **3.5.0** | 2026-07-30 | **Organisations** — one passphrase for every branch. Plus an operator-lock recovery code that was being wiped off screen before it could be read. |
| **3.4.x** | 2026-07-29/30 | The 3.4.0 beta line released as stable, then two patches. |
| **3.3.0** | 2026-07-26 | The 3.3.0 beta line released as stable. |

[#529]: https://github.com/KhaytApp/Khayt/pull/529
[#531]: https://github.com/KhaytApp/Khayt/pull/531
[#532]: https://github.com/KhaytApp/Khayt/pull/532
[#533]: https://github.com/KhaytApp/Khayt/pull/533
[#534]: https://github.com/KhaytApp/Khayt/pull/534
[#535]: https://github.com/KhaytApp/Khayt/pull/535
[#536]: https://github.com/KhaytApp/Khayt/pull/536
[#537]: https://github.com/KhaytApp/Khayt/pull/537
[#548]: https://github.com/KhaytApp/Khayt/pull/548

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
