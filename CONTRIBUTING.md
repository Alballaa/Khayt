# Contributing to Khayt

Thank you for helping maintain Khayt. This document is the default workflow for changes landing in this repository.

## Prerequisites

- **Node.js 22+** (matches release CI and README)
- `npm ci` then `npm start` for local Electron development

## Branching

- `main` — stable; release tags are cut from here.
- Feature/fix branches: `cursor/<short-description>-c86e` or `fix/<topic>`, `feat/<topic>`.

## Before you open a PR

1. Run syntax checks (same as CI):

   ```bash
   node --check main.js preload.js renderer/app.js renderer/i18n.js
   ```

2. If you changed user-visible behavior, add a line under `CHANGELOG.md` → `[Unreleased]`.

3. Bump version only when preparing a **release** (see [VERSIONING.md](./VERSIONING.md)), not on every PR.

## Pull requests

- One logical change per PR when possible.
- Describe **what** changed and **why**.
- For bugs: steps to reproduce, expected vs actual.
- Screenshots for UI changes (light and dark if relevant).

## Code areas

| Path | Role |
|------|------|
| `main.js` | Electron main: IPC, disk store, LAN server, ZATCA crypto, updater |
| `preload.js` | `hubAPI` context bridge |
| `renderer/index.html` | App shell (shipped UI entry) |
| `renderer/app.js` | UI and business logic |
| `renderer/store.js` | Export/import and backup helpers |
| `renderer/i18n.js` | Translations |
| `renderer/studio/*.js` | Khayt Studio UI module (when `khayt-studio` is enabled) |
| `design/khayt/` | Browser design prototype — reference only, not shipped |

The desktop app has no root `src/` or root `index.html`; an old Vite scaffold was removed from the tree.

## Releases (maintainers)

See [VERSIONING.md](./VERSIONING.md). Summary: update `CHANGELOG.md` → `npm run version:patch|minor|major` → commit → tag `vX.Y.Z` on `main` → push tag to trigger installers.

## Security

Report sensitive issues privately to **support@khayt.app** rather than a public issue if exploitation is possible (LAN API, store format, ZATCA keys).
