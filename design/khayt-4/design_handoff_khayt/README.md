# Handoff: Khayt — Print-Studio Management App (8 UI Directions)

## Overview
Khayt is a desktop management app for a 3D-printing studio: it tracks the printer
fleet, the production queue, materials inventory, job costing/quoting, business
analytics, and clients. This bundle contains **eight complete UI directions** for
the app — six are fully-styled "production-realistic" systems that all render the
same screens, plus one multi-skin system and one set of experimental concepts.

The goal of this handoff is to let a developer (or coding agent) **recreate the
chosen direction(s) in the real application codebase**.

## About the design files
Every file in this bundle is a **design reference built in HTML + React (via
in-browser Babel)** — a prototype that shows intended look, layout, and behavior.
**It is not production code to copy verbatim.** Recreate the design in the target
codebase using its established framework, component library, and patterns (React,
Vue, SwiftUI, Electron/vanilla, etc.). If no front-end environment exists yet,
pick the most appropriate framework for the project and implement there.

The React-via-Babel setup, the `tweaks-panel.jsx` control panel, and
`design-canvas.jsx` are **prototyping scaffolds only — do NOT port them.** They
exist so the designs could be previewed and tweaked; they are not part of the app.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, shadows, and
interactions are all specified. Recreate the chosen direction pixel-faithfully
using the codebase's libraries. (The lone exception is **Direction H · Frontier**,
which is a set of *concept screens* — directional, not final.)

---

## The eight directions

| # | Name | Entry file | Paradigm | Theme | Source folder | Status |
|---|------|-----------|----------|-------|---------------|--------|
| A | **Production Studio** | `Khayt Redesign.html` | Grouped left sidebar + top bar, multi-screen | Dark-first (+ light) | `khayt/` | Full app — 6 screens |
| B | **Workshop Ledger** | `Khayt Alternative.html` | Masthead + horizontal tabs / icon rail | Light "paper" (+ "ink" dark) | `alt/` (reuses `khayt/` screens) | Full app — 6 screens |
| C | **Control Room** | `Khayt Console.html` | Command bar + icon code-rail, dense flat console | Dark "graphite" (+ "paperwhite") | `console/` | Full app — 6 screens |
| D | **Atelier** | `Khayt Atelier.html` | Soft sidebar, gallery layout | Light "gallery" (+ "evening" dark) | `atelier/` | Full app — 6 screens |
| E | **Vitrine** | `Khayt Vitrine.html` | Floating glass sidebar, spatial | Dark "night" (+ "day" frosted) | `vitrine/` | Full app — 6 screens |
| F | **Cockpit** | `Khayt Cockpit.html` | Slim left icon rail, single-screen ops + sections | Light, print-shop poster | `cockpit/` | Full app — 6 sections |
| G | **Spectrum** | `Khayt Spectrum.html` | Same shell as Cockpit, **3 switchable skins** | Lumen (light) / Draft (dark) / Clay (light) | `spectrum/` (+ `cockpit/sections.jsx`) | Full app — 3 themes |
| H | **Frontier** | `Khayt Frontier.html` | **3 experimental concepts** on a comparison canvas | Near-black, per-concept accent | `frontier/` | Concept screens |

Directions **A–E** share an identical token + class contract (`--bg`, `--surface`,
`--text`, `--accent`, `.card`, `.btn`, `.badge`, `.metric`, etc.) and render the
**same six screens** from the same mock data — only the design system and shell
differ. Direction **F (Cockpit)** and **G (Spectrum)** use their own `ck-*` class
system. Direction **H (Frontier)** is bespoke per concept.

---

## Shared data model
All directions are driven by mock data in **`khayt/data.js`** (`window.KHAYT`).
Use it to understand the real entities the app manages:

- **`clients`** — `{ id, name, tag (VAT/B2C), tier (Gold/Silver/Bronze), color, orders, ltv, credit, balance, currency }`
- **`printers`** — `{ id, name, tech (FDM/Resin), status (printing/idle/error/maint), job, progress, nozzle, bed, eta, color }`
- **`orders`** — `{ id, client, parts, color, colorHex, machine, stage (pending/printing/post/qc/done), due, priority (high/med/low), value, weight, time, progress }`
- **`stages`** / **`stageMeta`** — kanban columns: pending → printing → post → qc → done
- **`filaments`** — `{ id, name, brand, type, grams, spools, hex, reorder, cost, drying }`
- **`kpis`** — dashboard metrics with 12-point sparklines (revenue, active orders, utilisation, margin)
- **`cart`** + **`costBreak`** — calculator parts + cost breakdown (material / machine / electricity / labour / overhead / failure buffer)

Currency is **SAR**; locale strings use Arabic-script brand glyph **خ** (the logo).
The app is **bilingual (English + Arabic RTL)** — every direction supports
`dir="rtl"` with `IBM Plex Sans Arabic`. RTL must be a first-class concern.

---

## The six screens (Directions A–G)
Each screen below is rendered by a component in `khayt/*.jsx` (A, B) and re-styled
per direction. Use these as the canonical feature spec.

1. **Dashboard / Overview** (`khayt/dashboard.jsx`)
   - 4 KPI cards with sparklines (revenue MTD, active orders, utilisation, avg margin)
   - Printer-fleet status list (6 machines, live status dot, progress bar, temps, ETA)
   - Today's schedule / activity, attention items (faults, low stock, finishing soon), invoices
2. **Production Queue** (`khayt/queue.jsx`)
   - Kanban board across 5 stages (Pending → Printing → Post-Processing → QC → Done)
   - Order cards: id, client, part count, material swatch + name, assigned machine, due, priority, value, progress bar (while printing)
3. **Cost Calculator** (`khayt/calculator.jsx`)
   - Multi-part cart (qty, filament, grams, print hours, cost)
   - Cost breakdown (material/machine/electricity/labour/overhead/failure buffer) as a stacked bar + legend
   - Quote summary: unit cost → target margin → quote price; "Generate quote" CTA
4. **Inventory** (`khayt/inventory.jsx`)
   - Material table: color swatch, name + brand, type (FDM/Resin) tag, stock bar (grams vs reorder threshold), spool count, cost/kg, status (OK / DRYING / REORDER)
   - Filter by type
5. **Analytics** (`khayt/analytics.jsx`)
   - KPI row with sparklines, 12-month revenue bar chart, printer-utilisation bars, top clients by LTV
6. **Clients** (`khayt/clients.jsx`)
   - Account cards/table: avatar (initials, brand color), VAT/B2C + tier, orders, LTV, outstanding balance (highlighted when > 0), credit usage bar
   - Filter All / VAT / B2C

Navigation set per direction: Dashboard, Production Queue, Cost Calculator,
Inventory, Analytics, Clients, + Settings (placeholder). A global **⌘K search** and
**"New order"** action live in the top bar/masthead.

---

## Design tokens per direction

> All directions follow the same variable contract. Status colors
> (success/warning/danger/info/violet) are **fixed** and must NOT follow the
> accent. All numerics use the mono face with `font-feature-settings:"tnum" 1`.

### A · Production Studio — `khayt/ds.css`
- **Dark (default):** bg `#0b0d12`, bg-2 `#0f1218`, surface `#14181f`; text `#eef1f6`, dim `#a4adbb`, muted `#6c7689`
- **Light:** bg `#ece8e1`, bg-2 `#f4f1ea`, surface `#ffffff`; text `#20242c`
- **Accent:** cyan `hsl(187 76% 53%)` (≈`#34c5e0`), on-accent `#04181c` (hue is Tweakable)
- **Type:** UI `Hanken Grotesk`; mono `Geist Mono`; Arabic `IBM Plex Sans Arabic`
- **Radius:** xs 5 / sm 7 / md 10 / lg 14 / xl 20 px · **nav-w** 232px
- **Shell:** grouped left sidebar (`khayt/shell.jsx`, nav model `NAV`), full or rail mode

### B · Workshop Ledger — `alt/ds.css`
- **Paper (default, light):** bg `#e9e4da`, bg-2 `#f1ede5`, surface `#faf8f3`; text `#211c14`, dim `#57503f`, muted `#8a8270`
- **Ink (dark):** warm soot variant
- **Accent:** burnt orange `hsl(24 88% 48%)` (≈`#e6730f`), on-accent `#fdf8f2`
- **Status:** ok `#2e7d4f` · warn `#a96f0e` · danger `#bd3a2d` · info `#2f5ea8` · violet `#6a51b2`
- **Type:** UI `Archivo`; mono `IBM Plex Mono`; eyebrows set in mono, uppercase
- **Radius:** squared/machined — xs 2 / sm 3 / md 4 / lg 6 / xl 10 px
- **Shadows:** hard 1–2px offset (`--shadow-1/2`) — ledger/print feel
- **Shell:** masthead (brand + search + location + actions) above horizontal tabs, or 86px icon rail (`alt/shell.jsx`)

### C · Control Room — `console/ds.css`
- **Graphite (default, dark):** bg `#0c0d0c`, bg-2 `#101110`, surface `#141614`
- **Paperwhite (light):** bg `#ebebe5`, e-ink terminal
- **Accent / signal:** green `hsl(135 62% 52%)` (≈`#34c759`), single signal color (Tweakable hue)
- **Type:** UI `IBM Plex Sans`; mono `JetBrains Mono` (mono-dominant)
- **Look:** dense flat, **hard 1px panel grid, no soft shadows**, square corners
- **Shell:** command bar + 64px icon "code rail" (`console/shell.jsx`), statusbar

### D · Atelier — `atelier/ds.css`
- **Gallery (default, light):** bg `#f3efe8`, bg-2 `#ece7de`, surface `#fdfcf9`
- **Evening (dark):** warm charcoal bg `#1b1916`
- **Accent:** muted clay `hsl(18 55% 47%)` (≈`#ba6a40`), on-accent `#fdf9f5`
- **Type:** UI `Albert Sans`; **display serif `Newsreader`** (headers); mono `Spline Sans Mono`
- **Look:** soft-shadow white cards, **pill buttons** (radius 100px), generous air, serif display
- **Shell:** soft left sidebar, nav-w 230px (`atelier/shell.jsx`)

### E · Vitrine — `vitrine/ds.css`
- **Night (default):** bg `#0d0f16`; surfaces are **translucent** `rgba(255,255,255,0.05–0.08)` with `backdrop-filter: blur(22px)`
- **Day:** bright frosted, bg `#d8dce6`, white-glass surfaces
- **Accent:** glowing cyan `hsl(187 80% 60%)` (≈`#4dd2ee`), on-accent `#061318`; primary buttons use a vertical gradient + glow shadow
- **Type:** UI `Outfit`; mono `Geist Mono`
- **Look:** spatial glass, floating chrome, glowing meters (`box-shadow` accent glow)
- **Shell:** floating glass sidebar, nav-w 218px (`vitrine/shell.jsx`)

### F · Cockpit — `cockpit/cockpit.css`
- **Light, print-shop poster:** bg `#f4f3ef`, surface `#fdfdfb`, surface-2 `#f0efe9`; ink `#161511`, ink-2 `#4f4d45`, ink-3 `#8b887c`, ink-4 `#c0bdb1`
- **Accent:** electric blue `#2456f0` (Tweakable: also `#7c3aed`, `#0d9466`, `#e2333b`); has a dark theme too
- **Stage colors (fixed):** print = accent · done `#b9b5a8` · post `#eb9c0e` · ready `#1da153` · error `#e2333b` · maint `#8d46e8`
- **Type:** UI `Bricolage Grotesque`; mono `IBM Plex Mono`
- **Signature:** **chunky 1.5px borders** (`--bw`), hard offset shadow `4px 4px 0`, radii sm 9 / md 14 / lg 20
- **Shell:** 74px left icon rail + top bar; class system `ck-*`
  - Home/Overview = a single-screen 3-column ops cockpit: **Fleet | day-timeline (Gantt) | Attention feed**. Clicking a machine cross-highlights it across fleet + timeline.
  - Other sections (Queue/Inventory/Calculator/Analytics/Clients) in `cockpit/sections.jsx`

### G · Spectrum — `spectrum/themes.css` (+ `spectrum/spectrum.jsx`, reuses `cockpit/sections.jsx`)
Same shell/screens as Cockpit, but a **`data-skin` switch** swaps the entire look
via tokens. Three complete skins:
- **Lumen** (light SaaS): bg `#f5f6f9`, surface `#ffffff`; accent indigo `#4f46e5`; UI `Plus Jakarta Sans`, mono `IBM Plex Mono`; soft shadows, radii 10/14/20, 1px hairline borders
- **Draft** (blueprint, dark): bg `#081421`, surface `#0d1f33`; accent cyan `#38bdf8`; UI `Space Grotesk`, mono `IBM Plex Mono`; cyan hairline **grid background**, square radii 3/5/7, mono uppercase headers, no shadows
- **Clay** (tactile, light): bg `#ece3d6`, surface `#f8f2e9`; accent terracotta `#d2683f`; UI `Quicksand`, mono `DM Mono`; **big radii 14/20/28**, soft pillow shadows, borderless cards
- Switcher = top-bar pill (`.sk-skinswitch`). In a real app this maps to a theme setting.

### H · Frontier — `frontier/frontier.css` (concepts, not final)
Three radically different operating paradigms, each a single 1440×900 screen on a
comparison canvas. Shared: `Space Grotesk` + `IBM Plex Mono`, near-black bg.
- **Atlas** (`concept-atlas.jsx`) — spatial **top-down floor map**: machines are physical
  objects in zones (Print Farm → Finishing → QC·Ship), live status halos, jobs flow
  on animated SVG paths, click a machine → right inspector with a progress ring.
  Accent lime `#b6ff3d`.
- **Pulse** (`concept-pulse.jsx`) — **command-first**, near-chromeless: a thin live status
  line + a giant centered command palette with keyboard-driven results. Accent `#ff5c38`.
- **Stream** (`concept-stream.jsx`) — **conversational ops**: the floor reports as a chat
  "river"; an assistant triages faults / drafts POs, the user replies and approves inline;
  a context panel tracks the focused machine. Accents `#8b7bff` / `#4ad6c4`.

---

## Interactions & behavior (A–G)
- **Navigation:** click a nav item (sidebar / rail / tab) to switch screens; active item is highlighted. State is a single `active` string (see each `shell.jsx`). In Cockpit/Spectrum the rail is `ck-railbtn`.
- **Selection (Cockpit/Atlas):** clicking a machine selects it (cross-highlights related rows / opens an inspector); clicking again deselects.
- **Kanban:** order cards grouped by `stage`; printing cards show a progress bar. (Drag-reorder is implied, not wired in the prototype.)
- **Filters:** chips/segmented controls (e.g. Inventory type, Clients tag) filter the list in place.
- **Hover/active:** cards lift / borders strengthen on hover; buttons depress slightly on `:active`. Transitions are short (`.08–.16s`), ease-out.
- **Live feel:** status dots pulse (`@keyframes` blink/pulse); a "now" line marks current time on the Cockpit timeline. Keep these subtle and respect `prefers-reduced-motion`.
- **RTL:** layouts use logical properties (`inset-inline-start`, `margin-inline`, `border-inline-end`) so `dir="rtl"` mirrors cleanly.

## State management
- `activeScreen` (string) — current section
- `selectedMachine` / `selectedItem` (id | null) — inspector/cross-highlight
- `theme` / `skin` (string) — appearance (real app: persisted user setting)
- `filter` states per list screen
- `rtl` (bool) — language direction
- Data fetching: replace `window.KHAYT` mock with the app's real data layer (fleet
  telemetry, orders, inventory, clients, costing). KPIs/sparklines come from
  aggregated history.

## Assets
- **Logo:** the Arabic glyph **خ** set in `IBM Plex Sans Arabic` on an accent tile. No raster assets.
- **Icons:** a single inline-SVG stroke set in `khayt/icons.jsx` (`Icon` component, 1.7 stroke, `currentColor`). Map these to the codebase's icon library (names: dashboard, queue, calculator, inventory, analytics, clients, printer, spool, alert, clock, doc, search, bell, plus, settings, etc.).
- **Charts/sparklines:** drawn with divs/SVG (`khayt/charts.jsx`, and inline in Cockpit/Spectrum). Use the app's charting lib.
- **Fonts (Google Fonts):** Hanken Grotesk, Archivo, IBM Plex Sans, Albert Sans, Newsreader, Outfit, Bricolage Grotesque, Plus Jakarta Sans, Space Grotesk, Quicksand · monos: Geist Mono, JetBrains Mono, Spline Sans Mono, DM Mono, IBM Plex Mono · Arabic: IBM Plex Sans Arabic. (Only vendor the fonts for the direction you pick.)

## Files in this bundle
```
Khayt Redesign.html      A · Production Studio  → khayt/
Khayt Alternative.html   B · Workshop Ledger    → alt/ (+ khayt/ screens)
Khayt Console.html       C · Control Room       → console/
Khayt Atelier.html       D · Atelier            → atelier/
Khayt Vitrine.html       E · Vitrine            → vitrine/
Khayt Cockpit.html       F · Cockpit            → cockpit/
Khayt Spectrum.html      G · Spectrum           → spectrum/ (+ cockpit/sections.jsx)
Khayt Frontier.html      H · Frontier concepts  → frontier/

khayt/      ds.css, shell.css/.jsx, screens.css, data.js, icons.jsx, charts.jsx,
            dashboard/queue/calculator/inventory/analytics/clients .jsx
alt/        ds.css, shell.css/.jsx, screens.css
console/    ds.css, shell.css/.jsx, screens.css
atelier/    ds.css, shell.css/.jsx, screens.css
vitrine/    ds.css, shell.css/.jsx, screens.css
cockpit/    cockpit.css, cockpit.jsx, sections.jsx, sheet.css
spectrum/   themes.css, spectrum.jsx
frontier/   frontier.css, concept-atlas.jsx, concept-pulse.jsx, concept-stream.jsx, frontier-main.jsx

tweaks-panel.jsx, design-canvas.jsx   ← prototype scaffolds, DO NOT port
```

## Recommended path
1. **Pick a direction.** A–E are the most "app-ready" sidebar/tab layouts; **F (Cockpit)** and **G (Spectrum)** are the newest and most fully-built navigable systems (Spectrum gives you 3 themes from one structure). **H (Frontier)** is for choosing a bolder future paradigm.
2. Port the chosen direction's **tokens** into the codebase's variable names first (colors, fonts, radii, shadows, spacing).
3. Vendor the fonts; set the default theme + RTL support.
4. Restyle shared primitives (button, card, table, badge, input, progress meter).
5. Rebuild the shell/nav for that direction.
6. Implement screen-by-screen against the prototype (Dashboard → Queue → Calculator → Inventory → Analytics → Clients), wiring real data in place of `window.KHAYT`.
7. Drop the prototype scaffolds (`tweaks-panel.jsx`, `design-canvas.jsx`, Babel).

Open any entry `.html` in a browser to see the live reference.
