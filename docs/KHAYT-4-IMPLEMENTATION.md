# Khayt-4 design implementation plan

Design reference: `design/khayt-4/design_handoff_khayt/` (see README there).

This document maps the **eight handoff directions** to the production theme system and breaks implementation into shippable phases.

## Direction → registry mapping

| Handoff | Name | Folder | Production ID (proposed) | Shell type | Status in app |
|---------|------|--------|--------------------------|------------|---------------|
| A | Production Studio | `khayt/` | `studio` | `studio` (sidebar) | **~75%** — shell, tokens, 5/6 screens |
| B | Workshop Ledger | `alt/` | `ledger` | `ledger` (masthead + tabs) | **~40%** — shell strong, screens weak |
| C | Control Room | `console/` | `console` | `console` (command bar + code rail) | **Shipped** — tokens, shell, screens, picker |
| D | Atelier | `atelier/` | `atelier` | `atelier` (soft sidebar) | Not started |
| E | Vitrine | `vitrine/` | `vitrine` | `vitrine` (glass sidebar) | Not started |
| F | Cockpit | `cockpit/` | `cockpit` | `cockpit` (icon rail + ops layout) | Not started |
| G | Spectrum | `spectrum/` | `spectrum` (+ skins) | `cockpit` + `data-skin` | Not started |
| H | Frontier | `frontier/` | concepts only | bespoke per concept | Experimental — not v1 |

**Legacy reserved IDs** (`blueprint`, `atlas` in `registry-core.js`) should be renamed or aliased:

- `blueprint` → likely **Spectrum Draft** skin or **Control Room** (pick one; avoid two “blueprint” meanings)
- `atlas` → **Frontier · Atlas** concept (spatial floor map) — keep reserved until paradigm is chosen

## Architecture decisions

### Two shell families

1. **Classic multi-screen** (A–E): same six screens (`khayt/*.jsx`), different DS + shell per folder.
2. **Cockpit family** (F–G): `ck-*` classes, icon rail, Overview = fleet + Gantt + attention; other sections in `cockpit/sections.jsx`.

Production needs new shell types in `registry-core.js`:

```
studio | ledger | console | atelier | vitrine | cockpit
```

Each shell = tokens + shell CSS/JS under `renderer/themes/<id>/`.

### Screen enhancement layer

Today, polished render paths live in `renderer/studio/studio.js` and are **Studio-gated** (`isStudio()`).

**Required refactor:** theme-agnostic screen APIs used by all A–E themes (and Cockpit sections where applicable):

- `renderer/themes/screens/` or extend `KhaytStudio` → `KhaytScreens` with `getActiveDesign()` checks
- Dashboard KPI grid, queue filters/folds, calculator breakdown, inventory stats, client cards, analytics layout

### Fonts per direction

Vendor only fonts for shipped themes. Khayt-4 adds:

| Direction | UI | Mono | Display |
|-----------|-----|------|---------|
| A Studio | Hanken Grotesk | Geist Mono | — |
| B Ledger | Archivo | IBM Plex Mono | — |
| C Console | IBM Plex Sans | JetBrains Mono | — |
| D Atelier | Albert Sans | Spline Sans Mono | Newsreader |
| E Vitrine | Outfit | Geist Mono | — |
| F/G Cockpit | Bricolage Grotesque / Plus Jakarta / Space Grotesk / Quicksand | IBM Plex Mono / DM Mono | — |

Run `node scripts/vendor-theme-fonts.mjs` after adding `@fontsource/*` deps.

### Do not port

- `tweaks-panel.jsx`, `design-canvas.jsx`
- React/Babel prototype runtime
- `window.KHAYT` mock data (use real app data)

## Phased rollout

### Phase 0 — Handoff ingest (this PR)

- [x] Commit `design/khayt-4/design_handoff_khayt/`
- [ ] This implementation plan
- [ ] Align `docs/THEMES.md` with Khayt-4 naming

### Phase 1 — Finish A + B (ship what users can pick today) — **complete**

1. ~~Theme-agnostic screen layer (`body.khayt-handoff`, `KhaytStudio.useHandoffScreens()`)~~
2. ~~Ledger gets KPI/queue/calc/inventory/clients polish~~
3. ~~Handoff analytics overview (KPI row, machine P&L, heatmap, top clients)~~
4. ~~Scope `renderer/studio/ds.css` to `html[data-design="studio"]`; shared primitives in `handoff-screens.css`~~
5. ~~App-only tabs + Settings: handoff CSS, SVG settings nav icons, Ledger page subtitles~~
6. ~~Theme preview PNGs for studio + ledger~~

**Exit:** Switching Studio ↔ Ledger feels like two complete apps on all six handoff screens.

### Phase 2 — Registry expansion + one new theme — **Control Room complete**

Shipped **Control Room** (`console`) as third selectable built-in:

1. ~~Port `console/ds.css` → `renderer/themes/console/tokens.css`~~
2. ~~Port shell → `renderer/themes/console/shell.css` + `shell.js` (`KhaytConsoleShell`)~~
3. ~~Register in `registry-core.js`, locale keys, IBM Plex Sans + JetBrains Mono fonts~~
4. ~~Handoff screens via `body.khayt-handoff` + `screens.css`~~
5. Preview: `themes/previews/console.png` via `npm run capture:theme-previews`

**Remaining Phase 2+:** Atelier, Vitrine (same checklist per theme).

### Phase 3 — Remaining A–E themes

Ship C, D, E in order of product priority. Reuse Phase 1 screen layer; only tokens + shell differ.

### Phase 4 — Cockpit + Spectrum

Largest structural change:

1. New `cockpit` shell (74px rail, `ck-*` primitives, chunky borders)
2. Overview: fleet list + day Gantt + attention feed (`cockpit/cockpit.jsx`)
3. Wire Queue/Inventory/Calculator/Analytics/Clients via `cockpit/sections.jsx`
4. Spectrum: `data-skin` = `lumen` | `draft` | `clay` as sub-setting or separate registry entries

### Phase 5 — Frontier (optional / vNext)

Concept screens only — requires paradigm decision:

- **Atlas** — spatial floor map + machine inspector
- **Pulse** — command palette first
- **Stream** — conversational ops feed

Not interchangeable with classic tab/sidebar shells; treat as separate product exploration.

### Phase 6 — QA

- E2e: tab/nav per shell type
- Screenshot capture per selectable theme
- RTL (AR) + light/dark per theme
- Locale sweep for new UI strings

## File reference (handoff → app)

| Handoff | App target |
|---------|------------|
| `khayt/ds.css` | `renderer/studio/ds.css` (A) |
| `alt/ds.css` | `renderer/themes/ledger/tokens.css` (B) |
| `console/ds.css` | `renderer/themes/console/tokens.css` |
| `atelier/ds.css` | `renderer/themes/atelier/tokens.css` |
| `vitrine/ds.css` | `renderer/themes/vitrine/tokens.css` |
| `cockpit/cockpit.css` | `renderer/themes/cockpit/cockpit.css` |
| `spectrum/themes.css` | `renderer/themes/spectrum/themes.css` |
| `khayt/*.jsx` screens | `renderer/dashboard.js`, `kanban.js`, `build.js`, etc. |
| `khayt/icons.jsx` | `renderer/studio/icons.js` (+ per-theme hydration) |
| `khayt/charts.jsx` | `renderer/studio/charts.js` |

## Recommended pick order (product)

If shipping incrementally for users:

1. **Finish A + B** — already in Settings; highest ROI
2. **C Control Room** or **D Atelier** — distinct third option
3. **F Cockpit** — flagship “ops” experience (new default candidate?)
4. **G Spectrum** — three skins without three shells
5. **E Vitrine** — glass aesthetic (more CSS complexity)
6. **H Frontier** — after paradigm choice

## Open questions

1. Which directions should appear in **Settings → Design** for v1? (All 6 production-realistic? Cockpit only? Spectrum skins as separate entries?)
2. Is **Cockpit** intended to **replace** classic multi-screen nav long-term?
3. Should **Frontier · Atlas** keep the reserved `atlas` registry ID?
4. Merge order: land Phase 1 on `main` via PR #74 before new theme PRs?
