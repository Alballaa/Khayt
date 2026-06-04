# Khayt Companion — iOS UI mockup

Place your design export here (HTML, CSS, images from Figma / v0 / etc.).

**From your Mac (Documents clone):**

```bash
cd ~/Documents/Khayt
# You already have: design/iOS UI/
git add "design/iOS UI"
git commit -m "Add iOS Companion UI mockup"
git push origin cursor/ios-companion-app-2e93
```

After push, the cloud agent reads this folder and aligns `ios/KhaytCompanion/` SwiftUI to match.

Verify locally:

```bash
python3 scripts/sync-companion-design-from-html.py
ls -la "design/iOS UI"
```
