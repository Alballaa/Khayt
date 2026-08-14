# Khayt engineering roadmap

Living priorities for maintainers. Not a public commitment calendar — reorder as the product needs.

## Now (post-3.6.0-rc.4 — on `main`)

**Stable is v3.5.3** (2026-08-01, a security patch cut from the
`release/3.5.x` maintenance branch). **`main` is `3.6.0-rc.4`** (2026-08-14) —
the candidate for v3.6.0, on the pre-release channel, awaiting a soak. rc.1,
rc.2 and rc.3 are superseded, each replaced rather than promoted because a
candidate is meant to *be* what stable will be. No hold is active — see
[docs/RELEASE-HOLD.md](./docs/RELEASE-HOLD.md).

**Bed Ready is on its own line and is current: `1.1.0`** (2026-08-12), built by
CI from this repo and published to `KhaytApp/bedready`. It had sat on 1.0.0 for
nine days with Kits and an accessibility fix unreleased, because the lane was
believed to be blocked on a token that in fact already existed.

Everything below needs a switched-on printer or real shop use. **There is no
queue of code waiting to be written** — that is the honest state of this file.

- [ ] **Soak the current candidate, then promote it to `v3.6.0` stable.** It
      changes what customers are quoted and how every geometry-based time
      estimate is computed, so it needs real use against a real shop's settings
      before a stable cut — not just a green suite.
      **The candidate exists so this is testable rather than assumed.** It is
      the exact code proposed as v3.6.0, installable from the pre-release
      channel, and it reaches nobody on stable. The green-suite half of this
      gate is met on that tree — unit and e2e suites including
      file-to-estimate-to-quote and estimator calibration — so re-running the
      suite adds nothing. **What is missing is the half CI cannot supply**, and
      naming the candidate does not supply it either.
      **Decide replace-vs-promote first, every time.** `main` is level with
      `rc.4` — nothing has landed since the tag and `[Unreleased]` is empty — so
      this is the first candidate on the line that can simply be promoted.
      Promoting a candidate that `main` has overtaken makes stable out of code
      no candidate carried, which is why rc.2, rc.3 and rc.4 were each cut
      rather than promoted. Re-check on the day rather than trusting this file:
      `main` moves several times an hour on an active day, and if it has moved
      again, cut the next rc from it or promote from it instead.
      **This promotion is the only thing two server-side flips are waiting
      on** — the portal read gate and `DELTA_WRITES`. Both are built and
      dormant, and both count adoption in *stable* builds, so no prerelease
      moves them. Neither has any desktop work left.
      *When it is satisfied*, the promotion is: `node scripts/bump-version.js
      set 3.6.0` — **not** `npm run version:minor`, which increments the minor
      unconditionally and from a prerelease yields `3.7.0` — then `BUILD_MAC` on
      for the tag and off again after, since anything intended for stable should
      carry a mac build and the variable is sticky.
      **Soak the newest beta, always.** beta.1 still quotes a 100 mm part at
      roughly double, and beta.2 still shows a five-hour print as 1% done with
      a 178-hour ETA. Both were found after their own tag; soaking an older one
      means judging Khayt by a bug that is already fixed.
      **And soak it in a theme you actually use.** beta.18's low-stock colour
      was legible on every dark theme and failed WCAG AA on all seven light
      ones ([#680]); the e2e that covered it asserted a literal on the default
      theme, so a green suite said nothing. Fixed in beta.19.
- [x] **Verify the actuals reader against real hardware.** ~~Never met a
      printer.~~ **Done 2026-08-01** — read live and mid-print from the
      Snapmaker U1 on stock firmware; every field name correct, and
      `print_duration` vs `total_duration` differed by 571 s on that job, so
      preferring the former is now measured rather than argued. Doing it
      surfaced two further defects that no fixture could have
      ([#556], [#557]).
- [x] **`captureCompletion` against a real finish.** ~~Never seen one.~~
      **Done 2026-08-02** — 641 samples across a five-hour job, capture verified
      on the printing→complete transition at 140.96 g / 18,517 s, against the
      slicer's own 5h17m estimate: 2.6% apart. The chain is now verified end to
      end. Starting the NEXT print immediately then exposed a further defect
      no fixture had imagined ([#566]).
      *Still unexercised:* the fallback for firmware that clears its stats on
      finish. This U1 retained them, so the primary path ran.
- [ ] **Three finished jobs, then print time stops being a guess.**
      `throughputMm3PerS` is the last assumed constant in the chain;
      `lib/estimate-calibration.js` replaces it from measured jobs once there
      are three.
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

Four stable lines, nineteen beta releases and four release candidates since 3.2.0. Full detail per release is in
[CHANGELOG.md](./CHANGELOG.md); this is the index.

| Version | Date | What it was |
|---------|------|-------------|
| **3.6.0-rc.4** | 2026-08-14 | **A restore can no longer overwrite newer data.** Restoring a backup, a restore point, or an imported file *while the app was running* could push that older copy to the cloud as the latest, and every other device would take it — silently, with the newer records gone. A restore is now treated like a fresh start: forget what the server was thought to hold, refetch, merge ([#708]). Also the organisation overview showing what each branch earned and is still owed, each in its own currency and never summed across them ([#707]), and a launch sync that asks only for what changed ([#705]). The current candidate ([#710]). |
| **3.6.0-rc.3** | 2026-08-14 | **Sync failures explain themselves.** A failed sync said "Sync error" and nothing else, forever ([#698]). Cut because thirteen commits had landed after rc.2 ([#704]). |
| **3.6.0-rc.2** | 2026-08-13 | **The copy buttons work.** rc.1 shipped with every "Copy link" button copying nothing ([#688]) — the reason a candidate is soaked rather than assumed. Cut to replace rc.1 ([#691]). |
| **3.6.0-rc.1** | 2026-08-12 | **The candidate for v3.6.0 stable**, and no behaviour change over `beta.19`. Cut because the promotion gate is real shop use and `beta.19` was 87 minutes old when promotion came up — so rather than assume a soak, the exact proposed code got a name, a mac build and a place on the pre-release channel where it can be installed and used on purpose. Stable stays on v3.5.3 ([#684]). |
| **3.6.0-beta.19** | 2026-08-12 | **Low stock follows the theme again.** beta.18 gave "low stock" its own colour token so recolouring it would not also recolour overdue jobs and spool age — right idea, wrong default: the token was a literal amber while every theme darkens its warning colour for the light appearance. Low stock rendered at 1.77–2.03:1 where the theme's own colour measured 4.71–5.93:1, on all seven light themes ([#680]). Found by running the app, not by a failing test. |
| **3.6.0-beta.18** | 2026-08-12 | **Cloud sync starts writing compressed** — 59 KB down to 9 KB on a real shop, the second half of the rollout beta.17 began; a second machine on beta.16 or earlier must be updated or it stops syncing ([#679]). Also documents that travel with a product, listed on the work order and — only if ticked to ship — the delivery note ([#678]); and marketplace fees in one click, including Etsy's two percentages *and* its 0.20 listing fee ([#677]). |
| **3.6.0-beta.17** | 2026-08-12 | **The release that opens the app outside the Gulf.** Sales tax added to a price rather than included in it, thirty country presets, and documents that print in the language the shop chose instead of that language and Arabic ([#664], [#666]). Also a security fix — a printer address written as a decimal integer could point Khayt at its own network ([#673]) — cloud backups readable when compressed, ahead of writing them, and a copy of the shop's data taken before any update touches it. |
| **3.6.0-beta.16** | 2026-08-10 | **Consumables reach the reorder list and purchase orders**, which until now only filament could. Plus a consumable PO no longer accused of being priced 1000× too high, receiving a filament PO records what it cost, and Electron 42.2.0 → 42.8.1. |
| **3.6.0-beta.15** | 2026-08-09 | A planned Bed Ready maintenance window no longer looks like a broken sync. |
| **3.6.0-beta.14** | 2026-08-09 | **Kits — several prints that are one object**, and they reach Bed Ready, the app whose users print things in parts ([#645], [#646], [#647]). A fee can now be a percentage rather than only a fixed amount — the groundwork marketplace fees later stood on. Also `.zip` straight into the print library ([#648]), consumable categories, and the last route that could read a message thread without proving the link. |
| **3.6.0-beta.13** | 2026-08-07 | **Anyone with a portal link could read the whole message thread on it.** Also: a re-sliced g-code file came back a stranger so its quotes never learned ([#632]), an "Identify" button for files Khayt cannot recognise ([#634]), 3MF recognition, and a print library that can live on a network drive or back up to object storage. |
| **3.6.0-beta.12** | 2026-08-06 | The filament library talked over itself and could strand a keyboard user ([#624]). "Slice for exact quote" gave a print time but no weight. |
| **3.6.0-beta.11** | 2026-08-04 | Signing in to the cloud could sit on "Connecting…" for half a minute and then fail; waiting for a verification code said nothing while you waited. |
| **3.6.0-beta.10** | 2026-08-04 | **A model you have printed before is priced from its own prints.** The estimate note stops stating the printer's rate as though it were measured. Also a printer reporting negative hours since its last service, and two empty Bed Ready sidebar headings. |
| **3.6.0-beta.9** | 2026-08-03 | **Security: the converter could be made to write a file anywhere the app could read.** Also packaging Bed Ready could leave the source checkout broken, a beta build could not find its own updates, and the shop's default infill was used to quote customers but not itself. |
| **3.6.0-beta.8** | 2026-08-03 | **A large 3MF could convert into a model missing most of itself**, and the converter stopped the app while it worked — that work now runs off the only thread the UI has. Plus HueForge FLAT mode, colour by region instead of by height. |
| **3.6.0-beta.7** | 2026-08-02 | **Two real files that did not work, and a feature nobody could find.** A 229 MB six-colour 3MF read as colourless because the member budget was spent on meshes before reaching the configs that identify it ([#571]). An update check on a local build showed a raw ENOENT instead of saying the build cannot self-update ([#572]). And the kanban the website advertises now opens by default in every theme rather than hiding behind a toggle ([#569], [#570]). Plus tests for solveHeightfield, the last large untested surface in the HueForge path ([#568]). |
| **3.6.0-beta.6** | 2026-08-02 | **A measured figure now names the job it was measured on.** Khayt keeps a completion offerable for a day; a shop starting its next print inside that window could be shown the previous job's figures wearing a green *Measured* label, with nothing to reveal it — and those figures train the estimator ([#566]). Also the first real-hardware fixtures for the completion capture ([#565]) and the U1 catalogue entry pinned to the machine ([#564]). |
| **3.6.0-beta.5** | 2026-08-02 | **Two Bed Ready print-quality fixes**, both found by diffing Khayt's colour plan against a 3MF the U1 was actually printing. The top colour band ended at the model's exact height, so the topmost layers belonged to no band and printed in the base colour ([#561]). And the opaque base printed at the same fine layer height as the colour bands — 57 layers where a real export used 28 ([#562]). |
| **3.6.0-beta.4** | 2026-08-01 | **Bed Ready input guards.** A layer height of `Infinity` was accepted and produced a stack of infinitely-tall colours; a thickness that was not a number would have poisoned every blend. Also the first tests for `lib/hueforge.js` — 434 lines, fifteen exports, previously none. The mesh itself proved correct ([#559]). |
| **3.6.0-beta.3** | 2026-08-01 | **What a live printer showed.** A five-hour job was displayed as 1% done with a 178-hour ETA — progress came from file position, not layers ([#557]). A Klipper machine could be configured as the wrong make and silently record nothing ([#556]). And the actuals reader met real hardware for the first time: every field correct. |
| **3.6.0-beta.2** | 2026-08-01 | **Quoting corrected, and honest about its limits.** A part's walls are derived from its surface rather than a flat share of its volume ([#551]) — a 100 mm part was being quoted at roughly double. Khayt now says outright when a shape is one it cannot price ([#553]), scored against a real slicer ([#552]). Carries the v3.5.3 lockout fix ([#548]), a Help menu ([#549]), and camera auto-detect that asks the printer ([#554]). |
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
[#549]: https://github.com/KhaytApp/Khayt/pull/549
[#551]: https://github.com/KhaytApp/Khayt/pull/551
[#552]: https://github.com/KhaytApp/Khayt/pull/552
[#553]: https://github.com/KhaytApp/Khayt/pull/553
[#554]: https://github.com/KhaytApp/Khayt/pull/554
[#556]: https://github.com/KhaytApp/Khayt/pull/556
[#557]: https://github.com/KhaytApp/Khayt/pull/557
[#559]: https://github.com/KhaytApp/Khayt/pull/559
[#561]: https://github.com/KhaytApp/Khayt/pull/561
[#562]: https://github.com/KhaytApp/Khayt/pull/562
[#564]: https://github.com/KhaytApp/Khayt/pull/564
[#565]: https://github.com/KhaytApp/Khayt/pull/565
[#566]: https://github.com/KhaytApp/Khayt/pull/566
[#568]: https://github.com/KhaytApp/Khayt/pull/568
[#569]: https://github.com/KhaytApp/Khayt/pull/569
[#570]: https://github.com/KhaytApp/Khayt/pull/570
[#571]: https://github.com/KhaytApp/Khayt/pull/571
[#572]: https://github.com/KhaytApp/Khayt/pull/572
[#624]: https://github.com/KhaytApp/Khayt/pull/624
[#632]: https://github.com/KhaytApp/Khayt/pull/632
[#634]: https://github.com/KhaytApp/Khayt/pull/634
[#645]: https://github.com/KhaytApp/Khayt/pull/645
[#646]: https://github.com/KhaytApp/Khayt/pull/646
[#647]: https://github.com/KhaytApp/Khayt/pull/647
[#648]: https://github.com/KhaytApp/Khayt/pull/648
[#664]: https://github.com/KhaytApp/Khayt/pull/664
[#666]: https://github.com/KhaytApp/Khayt/pull/666
[#673]: https://github.com/KhaytApp/Khayt/pull/673
[#677]: https://github.com/KhaytApp/Khayt/pull/677
[#678]: https://github.com/KhaytApp/Khayt/pull/678
[#679]: https://github.com/KhaytApp/Khayt/pull/679
[#680]: https://github.com/KhaytApp/Khayt/pull/680
[#684]: https://github.com/KhaytApp/Khayt/pull/684
[#688]: https://github.com/KhaytApp/Khayt/pull/688
[#691]: https://github.com/KhaytApp/Khayt/pull/691
[#698]: https://github.com/KhaytApp/Khayt/pull/698
[#704]: https://github.com/KhaytApp/Khayt/pull/704
[#705]: https://github.com/KhaytApp/Khayt/pull/705
[#707]: https://github.com/KhaytApp/Khayt/pull/707
[#708]: https://github.com/KhaytApp/Khayt/pull/708
[#710]: https://github.com/KhaytApp/Khayt/pull/710

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
