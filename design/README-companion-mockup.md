# Khayt Companion UI mockup

Add your mockup under **`design/iOS UI/`**, then **push**:

```bash
cd ~/Documents/Khayt
git add "design/iOS UI"
git commit -m "Add iOS Companion UI mockup"
git push origin cursor/ios-companion-app-2e93
```

(Also works from `~/Khayt` if that is your clone — use the repo that contains `design/iOS UI`.)

Verify tokens locally:

```bash
python3 scripts/sync-companion-design-from-html.py
```

## Implemented in iOS (Studio design system)

The companion app on branch `cursor/ios-companion-app-2e93` uses tokens from **`design/khayt/ds.css`**:

- Dark surfaces (`#0b0d12` / `#14181f`)
- Cyan accent `hsl(187 76% 53%)`
- خ logo mark, thread dividers, KPI cards, custom tab bar
- Files: `ios/KhaytCompanion/Theme/KhaytDesign.swift`, `KhaytTabBar.swift`

If your HTML differs (e.g. light mode, different accent), paste the file into `design/` or describe deltas and we can align SwiftUI.
