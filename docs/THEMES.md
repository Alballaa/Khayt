# Khayt theme system

Khayt separates **appearance** (dark / light / system) from **design theme** (visual identity).

## Built-in themes

Khayt 2.6 ships three redesigned, light-default themes with a native-app feel:

| ID | Name | Shell | Default appearance |
|----|------|-------|-------------------|
| `workbench` | **Workbench** _(default)_ | Grouped left sidebar | Light |
| `command` | Command | Command bar + rail | Light |
| `vivid` | Vivid | Colorful sidebar | Light |

### Legacy themes — removed in 3.3

`ledger`, `console`, `atelier`, `vitrine`, `cockpit` and `atlas` have been
deleted. They were never selectable (all seven legacy designs carry
`legacy: true`, which `listSelectableThemes()` filters out) — only a saved
setting from before the 2.6 consolidation could reach them.
`migrateLegacyDesignTheme()` maps those settings to their intended successor,
and `normalizeDesignId()` falls anything else back to **Workbench**.

`studio` is the one survivor, and it is not a Khayt theme any more: Bed Ready
pins to it (`applyDesignSettings()` in `themes.js`) and its whole look is
`renderer/studio/` skinned by `bedready-theme.css`. It stays until Bed Ready is
rebased onto a design of its own.

## Architecture

```
renderer/themes/
  registry-core.js    # Theme definitions + custom registration API
  themes.js             # applyDesignSettings(), Settings UI
  custom-loader.js      # Loads themes/custom/*/manifest.json at boot
  _template/            # Copy-paste starter for new themes
  custom/               # Community themes (index.json registry)
  workbench/            # Workbench tokens, shell CSS, dashboard screens
  command/              # Command tokens + shell CSS
  vivid/                # Vivid tokens, shell CSS, screens
  previews/             # Picker preview PNGs, one per selectable theme
```

**Shell types**

- `workbench` — grouped sidebar, light-default (`body.khayt-workbench`) — the default
- `command` — command bar + rail (`body.khayt-command`)
- `vivid` — colorful sidebar (`body.khayt-vivid`)
- `studio` — sidebar navigation (`body.khayt-studio`) — Bed Ready only, not selectable in Khayt
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

The `studio` shell sets `body.khayt-handoff` and pulls screen polish from `renderer/themes/handoff-screens.css` + `KhaytStudio.useHandoffScreens()`. It is the last handoff shell; the other four went with the 3.3 legacy-theme deletion.

## Roadmap

- Theme import/export (zip manifest + CSS)
- Theme preview thumbnails in Settings
