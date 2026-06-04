# Khayt Companion UI mockup

If you have **`Khayt Companion.html`** from a design tool (Figma AI, v0, etc.), add it here so the team can diff against the app:

```bash
cp ~/Downloads/Khayt\ Companion.html design/Khayt\ Companion.html
git add design/Khayt\ Companion.html
git commit -m "Add companion UI mockup HTML"
```

## Implemented in iOS (Studio design system)

The companion app on branch `cursor/ios-companion-app-2e93` uses tokens from **`design/khayt/ds.css`**:

- Dark surfaces (`#0b0d12` / `#14181f`)
- Cyan accent `hsl(187 76% 53%)`
- خ logo mark, thread dividers, KPI cards, custom tab bar
- Files: `ios/KhaytCompanion/Theme/KhaytDesign.swift`, `KhaytTabBar.swift`

If your HTML differs (e.g. light mode, different accent), paste the file into `design/` or describe deltas and we can align SwiftUI.
