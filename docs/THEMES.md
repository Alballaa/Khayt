# Khayt theme system

Khayt separates **appearance** (dark / light / system) from **design theme** (visual identity).

## Built-in themes

Khayt 2.6 ships three redesigned, light-default themes with a native-app feel:

| ID | Name | Shell | Default appearance |
|----|------|-------|-------------------|
| `workbench` | **Workbench** _(default)_ | Grouped left sidebar | Light |
| `command` | Command | Command bar + rail | Light |
| `vivid` | Vivid | Colorful sidebar | Light |

### Legacy themes

The earlier themes remain selectable under **Settings → Preferences → Design**:
`studio` (Studio), `ledger` (Workshop Ledger), `console` (Control Room),
`atelier`, `vitrine`, `cockpit`, and `atlas`. Saved selections of the older
default themes (`studio` / `ledger` / `console`) migrate to **Workbench** on
upgrade.

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

- `workbench` — grouped sidebar, light-default (`body.khayt-workbench`) — the default
- `command` — command bar + rail (`body.khayt-command`)
- `vivid` — colorful sidebar (`body.khayt-vivid`)
- `studio` — sidebar navigation (`body.khayt-studio`, legacy)
- `ledger` — masthead + horizontal tab strip (`body.khayt-ledger`, legacy)
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

- Theme import/export (zip manifest + CSS)
- Theme preview thumbnails in Settings
