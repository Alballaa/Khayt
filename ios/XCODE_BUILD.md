# Xcode build troubleshooting

## “Personal team does not support NFC Tag Reading”

The default project uses an **empty** entitlements file so **free Apple IDs** and the **Simulator** can build.

- Queue, dashboard, inventory, and pairing work without NFC.
- The **Scan NFC** tab needs a **paid** Apple Developer account ($99/year) and `KhaytCompanion-NFC.entitlements` (see below).

## Recommended first build: Simulator

1. Top bar → **iPhone 16** (Simulator), not your physical iPhone.
2. **Product → Clean Build Folder** (⇧⌘K).
3. **Signing & Capabilities** → Team = your Apple ID.
4. Press **⌘R**.

## See the real error

1. Press **⌘9** to open the Report navigator.
2. Click the latest **Build** entry.
3. Expand the red error — copy the first line.

## Still failing?

```bash
cd ~/Khayt
git pull origin cursor/ios-companion-app-2e93
```

Then in Xcode: **File → Close Project**, reopen `ios/KhaytCompanion.xcodeproj`, Clean, Run.

## Enable NFC later (paid developer account)

1. Signing & Capabilities → **+ Capability** → Near Field Communication Tag Reading.
2. Or set **Code Signing Entitlements** to `KhaytCompanion/KhaytCompanion-NFC.entitlements`.
