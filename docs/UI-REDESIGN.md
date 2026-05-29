# Khayt UI redesign (v2 shell)

## What shipped in this branch

- **Sidebar navigation** — grouped sections (Overview, Production, Business, Insights)
- **Top bar** — page title, unified toolbar buttons, preserved IDs for JS
- **Design tokens** — `renderer/shell.css` (sidebar width, accent colors, card radius)
- **Collapse** — sidebar state stored in `localStorage` (`hub_sidebar_collapsed`)

All existing tab IDs (`dashboard-tab`, `calculator-tab`, …) and `.tab-btn` hooks are unchanged so `app.js` logic keeps working.

## Your design

To match your mockup precisely, please share one of:

- Figma link (view access) or exported PNG/PDF per screen
- Color tokens (hex), font family, corner radius, spacing scale
- Which screens to prioritize (Dashboard, Queue, Calculator, Settings)

We can then tune `shell.css` and per-screen markup without rewriting business logic.

## Recommended next phases

| Phase | Scope |
|-------|--------|
| **2.0.16** | Shell only (this PR) + bug fixes |
| **2.1.0** | Screen templates: Dashboard cards, Kanban columns, Calculator layout |
| **2.1.x** | Settings + modals; replace inline styles with utility classes |
| **2.2.0** | Split `app.js` by feature; optional component partials |

## Recommendations

1. **Do not migrate to React** for the desktop app unless you need a separate web product — Electron + vanilla JS matches offline-first and keeps the bundle small.
2. **One design system file** — extend `:root` in `shell.css` (or merge into `styles.css` later) for all new UI.
3. **Icons** — replace Unicode nav icons with a single SVG sprite (`public/icons.svg`) for a consistent look.
4. **Simple mode** — hide whole nav groups via CSS (`body.mode-simple .nav-group.insights`) instead of many `pro-only` buttons.
5. **Accessibility** — add `aria-current="page"` on active nav item in `switchTab`.
