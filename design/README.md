# Khayt UI design assets

Place your mockup files here so the agent and CI can reference them.

## Expected location on your machine

- **macOS:** `~/Downloads/design/`
- **Windows:** `%USERPROFILE%\Downloads\design\`
- **Linux:** `~/Downloads/design/`

## Add files to this repo

From your laptop (replace paths if needed):

```bash
cd /path/to/Khayt
mkdir -p design
cp -r ~/Downloads/design/* design/
git add design/
git commit -m "chore: add UI design mockups"
git push
```

Or in **Cursor**: drag PNG/PDF/SVG files from `Downloads/design` into this `design/` folder in the file tree, then commit.

## Useful formats

| Format | Notes |
|--------|--------|
| `.png` / `.jpg` | Full screens or components — best for implementation |
| `.pdf` | Export from Figma — include spec pages if any |
| `.svg` | Icons and logos |
| Figma link | Share view link in PR/issue if you prefer not to commit binaries |

## After upload

Tell the agent which file is the **source of truth** (e.g. `dashboard.png`, `home-dark.fig` export) and priority order for screens.
