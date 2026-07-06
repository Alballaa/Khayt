# Bed Ready — app build (shared-core split)

> **Read this first.** This file is the brief for building the **Bed Ready** desktop app
> inside the Khayt repo. It's meant to bootstrap a fresh Claude Code chat.

## What Bed Ready is

**Bed Ready is the owner's own product/brand** (his website). Khayt's converter / Colour
Studio / print-file "BedReady-style" tooling was originally derived **from** Bed Ready.
We are now shipping Bed Ready as its **own standalone desktop app** — essentially the
maker toolset on its own — while **Khayt keeps those same tools** as ordinary features.

Two apps, **one repo, one shared core, no duplicated work.**

## Why two apps (owner's goals)

1. **Different download sizes** — Bed Ready ships none of Khayt's business code.
2. **Stop fighting the mode gating** — no more "what goes where" (`.biz-only` /
   `body.mode-enthusiast`). The boundary becomes the *app* boundary, not a runtime toggle.

Hard constraint: **do not duplicate the maker code.** It lives once, in the shared core,
and both apps consume it — a converter fix lands in both automatically.

## The three layers

| Layer | Examples | Ships in |
|---|---|---|
| **Shared core** | `lib/` (`mf-convert`, `zip-read`, `zip-write`, `stl-parse`, `color-mix`, `printer-profiles`, `slicers`, `mf-write`, `feature-tiers`) + framework (`store`, `store-validate`, `sync`, `app-state`, `i18n`, `shell`, `themes`, `util`, `format`, `currency`, `app-helpers`) + **maker UI** (`renderer/converter.js`, `colorstudio.js`, `printfiles.js`, `color-planner.js`, `inventory.js`, `machines.js`, `kanban.js`, `calculator-cost.js`, `build.js`) | **Both** |
| **Business** | invoicing, clients, POs/suppliers, ZATCA, analytics, storefront, portal, subscriptions, accounting, marketing | **Khayt only** |
| **App shell** | entry HTML + branding (name/icon/appId) + electron-builder target | one each |

The maker feature set is already enumerated in `lib/feature-tiers.js` → `SIMPLE_CORE`
(`quote`, `queue`, `printFiles`, `colorMix`, `inventory`, `printers`). **That list is
effectively the Bed Ready surface.**

## Build approach (no bundler — plain `<script>` tags)

The app is vanilla JS with `<script src>` tags in `renderer/index.html`; `main.js` does
`mainWindow.loadFile('renderer/index.html')` (main.js:2299). To get **two apps of
different sizes from one repo:**

1. **Flavor constant.** Add `lib/flavor.js` exporting `FLAVOR` (`'khayt' | 'bedready'`),
   defaulting to `'khayt'`. `main.js` reads it to pick the entry HTML, the app name, and
   to skip registering business-only IPC handlers.
2. **Bed Ready entry HTML.** New `renderer/bedready.html` that `<script>`-includes **only**
   shared + maker scripts (omit the business `.js` entirely — that's what makes the
   package smaller). Keep it in lockstep with the shared script block of `index.html`.
   - Maker script tags today live at `renderer/index.html`: `lib/stl-parse` (2423),
     `lib/color-mix` (2433), `lib/slicers` (2434), `lib/printer-profiles` (2435),
     `printfiles.js` (2475), `colorstudio.js` (2476), `color-planner.js` (2477),
     `converter.js` (2478) — plus the framework tags above them.
3. **Second build target.** Add a Bed Ready electron-builder config (own `productName`,
   `appId`, icon, and a `files:` glob that **excludes** business renderer/main files so
   the download is genuinely smaller). Either a second config file or a
   `electron-builder --config` variant driven by `FLAVOR`.
4. **main.js flavor-awareness.** Guard business-only `require()`s and IPC registration
   behind `if (FLAVOR !== 'bedready')` so Bed Ready doesn't pull business main-process
   code into its package.

Bed Ready boots straight into the maker experience — no mode switcher, no business nav.

## Phase 1 checklist (this is the new chat's job)

- [ ] `lib/flavor.js` + wire `main.js` to read `FLAVOR` (default `khayt`, unchanged behavior).
- [ ] `renderer/bedready.html` = shared + maker script tags only; maker nav; no business surfaces.
- [ ] Bed Ready electron-builder target: name/appId/icon + trimmed `files:` glob → smaller build.
- [ ] `main.js`: gate business-only IPC + requires behind the flavor check.
- [ ] `npm run check` green; add a Bed Ready smoke path (boots, converter + colour + print-files work, **no** business nav/IPC present).
- [ ] Build the Bed Ready target locally; confirm it launches and is meaningfully smaller than Khayt.
- [ ] Branch `bedready/phase-1-app-shell`; ship as its own release/tag lane (decide Bed Ready versioning separately from Khayt's `3.2.0-beta.N`).

**Phase 2 (Khayt chat, later):** retire `enthusiast` as a *mode* in `feature-tiers.js`
(→ `simple | professional`), drop `.biz-only`/`mode-enthusiast` gating, keep every maker
tool as a normal simple/pro feature. The standalone maker experience now lives in Bed Ready.

## Working conventions (two chats, one repo)

- **This split's canonical memory:** the `bedready-split` memory entry. Memory is shared
  between both chats (keyed by repo dir), so keep entries prefixed `bedready-*` vs
  `khayt-*`/`beta32-*`.
- **Branches by product:** Bed Ready → `bedready/*`; Khayt → `beta32-*`. Merge to `main`
  deliberately.
- **Don't run both chats at the same moment** on overlapping files; commit or stash before switching.
- **Shared-core edits touch BOTH apps.** If you change `lib/` or the framework, say so in
  memory so the Khayt chat knows.

## Key files to start from

- `lib/feature-tiers.js` — `SIMPLE_CORE` = the Bed Ready surface; mode boundary lives here.
- `renderer/index.html` — the script block to mirror (shared + maker subset) into `bedready.html`.
- `main.js:2299` — `loadFile(...)` entry point to make flavor-aware.
- `package.json` `build` — clone into a Bed Ready target with a trimmed `files:` glob.
- `lib/mf-convert.js`, `renderer/converter.js`, `colorstudio.js`, `printfiles.js`,
  `color-planner.js` — the maker tooling (shared; do not fork).
