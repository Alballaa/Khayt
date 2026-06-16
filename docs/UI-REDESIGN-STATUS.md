# UI Redesign — status & how to continue (local Mac session)

## Goal
Replace the 7 themes with **3** new ones — **Workbench** (default), **Command**
(renamed from the prototype "Cockpit" to avoid clashing with the existing
`cockpit` theme), **Vivid**. Light-default, colorful, native-app feel. **Phased**
rollout: build the 3 behind the picker → switch default + migrate → remove old 7.

User decision: **rebuild the screen *interiors* to match the mockups** (not just a
chrome re-skin).

## Where things are
- **Prototypes (approved design targets):** `design/proto-a-workbench.html`,
  `design/proto-b-cockpit.html`, `design/proto-c-vivid.html` (+ proposal
  `docs/UI-REDESIGN.md`). Open in a browser.
- **Branch `claude/theme-workbench`** (PR #102): the real Workbench theme.
  - `renderer/themes/workbench/{tokens,shell}.css` + `shell.js` — chrome (sidebar
    grouping, toolbar, status bar). Registered in `registry-core.js`, opt-in.
  - `renderer/themes/workbench/screens.{js,css}` — **Dashboard interior** rebuilt
    to match the mockup, wired to real data via the `KhaytWorkbench.renderDashboard`
    hook (mirrors the `KhaytStudio.renderClientsStudioCards` pattern;
    `renderer/dashboard.js` delegates when `body.khayt-workbench`).

## The build pattern (reuse for every screen)
Each screen gets a `KhaytWorkbench.render<Screen>(host)` that emits the prototype
markup wired to real globals, and the existing `render<Screen>()` delegates to it
when the Workbench body class is set. Other themes stay untouched.

## Remaining work (screen-by-screen, with live screenshots each)
1. Verify Dashboard live; fix to match mockup.
2. Rebuild interiors: **Calculator → order**, **Queue (kanban)**, **Fleet**,
   **Inventory**, **Clients**, **Invoices & Orders**, **Analytics**, **Settings**.
3. Polish dark variant, RTL (Arabic), responsive.
4. Replace placeholder `renderer/themes/previews/workbench.png` with a real capture.
5. Once Workbench is signed off, clone the screens for **Command** + **Vivid**
   (same markup, different tokens/chrome/color).
6. Phase 2: default → Workbench + migrate saved `settings.designTheme`. Phase 3:
   delete the old 7 shells.

## How to run + self-review (local)
`npm install` then `npm start`; Settings → Preferences → Design → **Workbench**.
To self-review, capture the Electron window (e.g. an Electron `capturePage` script
or macOS `screencapture`) and read the PNG back, iterating until it matches the
prototype.

## Note
The current sandbox could not render/screenshot (no display/browser, blocked CDN),
which is why this moved to a local Mac session.
