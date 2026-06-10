# Khayt theme system

Khayt separates **appearance** (dark / light / system) from **design theme** (visual identity).

## Built-in themes

| ID | Name | Shell | Default appearance |
|----|------|-------|-------------------|
| `studio` | Studio | Grouped left sidebar | Dark |
| `ledger` | Workshop Ledger | Masthead + horizontal tabs | Light |
| `console` | Control Room *(coming soon)* | Command bar + code rail | Dark |
| `atelier` | Atelier *(coming soon)* | Soft sidebar | Light |
| `vitrine` | Vitrine *(coming soon)* | Glass sidebar | Dark |
| `cockpit` | Cockpit *(coming soon)* | Ops icon rail | Light |

Reserved themes appear as “Coming soon” in Settings until art direction and tokens land.

## Architecture

```
renderer/themes/
  registry-core.js    # Theme definitions + custom registration API
  themes.js             # applyDesignSettings(), Settings UI
  custom-loader.js      # Loads themes/custom/*/manifest.json at boot
  _template/            # Copy-paste starter for new themes
  custom/               # Community themes (index.json registry)
  ledger/               # Ledger tokens, shell CSS, screen polish
```

**Shell types**

- `studio` — sidebar navigation (`body.khayt-studio`)
- `ledger` — masthead + horizontal tab strip (`body.khayt-ledger`)
- `default` — legacy horizontal layout without Studio chrome

**Token contract**

Themes override CSS variables on `html[data-design="<id>"]`:

`--bg`, `--surface`, `--text`, `--accent-h/s/l`, `--primary`, `--radius`, `--font-sans`, `--font-num`, etc.

Status colors should not follow the brand accent.

## Creating a custom theme

1. Copy `renderer/themes/_template/` → `renderer/themes/custom/<id>/`
2. Edit `manifest.json` and `tokens.css` (replace `my-shop` with your id)
3. Add `{ "id": "<id>", "folder": "<id>" }` to `renderer/themes/custom/index.json`
4. Restart Khayt — theme appears under **Settings → Preferences → Design → Community**

Custom theme CSS is loaded at runtime. Built-in theme CSS is linked from `index.html`.

## Fonts

UI fonts are vendored under `renderer/fonts/` for CSP compliance. Re-run:

```bash
node scripts/vendor-theme-fonts.mjs
```

after updating `@fontsource/*` devDependencies.

## Adding a built-in theme (maintainers)

1. Add tokens + optional shell CSS under `renderer/themes/<id>/`
2. Register in `registry-core.js` (`BUILTIN_THEMES` or `RESERVED_THEMES`)
3. Add locale keys `theme.design.<id>` and accent labels
4. Link stylesheets in `index.html` if always loaded
5. Set `shell`, `bodyClass`, `defaultAccent`, `defaultAppearance`

## Handoff screen layer

Themes with shell `studio`, `ledger`, `console`, `atelier`, or `vitrine` set `body.khayt-handoff` and share screen polish via `renderer/themes/handoff-screens.css` + `KhaytStudio.useHandoffScreens()`.

## Roadmap

- **Control Room, Atelier, Vitrine, Cockpit** — Khayt-4 directions C–F (coming soon in picker)
- Theme import/export (zip manifest + CSS)
- Theme preview thumbnails in Settings
