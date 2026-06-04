# Add Khayt home screen widget (one-time in Xcode)

The widget source is in `ios/KhaytWidget/`. Xcode needs a **Widget Extension** target:

1. Open `ios/KhaytCompanion.xcodeproj`
2. **File → New → Target → Widget Extension**
3. Product name: **KhaytWidget**, include Live Activity: **off**
4. Delete the auto-generated Swift files in the new group
5. Drag `ios/KhaytWidget/KhaytQueueWidget.swift` into the **KhaytWidget** target (check target membership)
6. Replace the extension `Info.plist` with `ios/KhaytWidget/Info.plist` if needed
7. Set extension **entitlements** to `ios/KhaytWidget/KhaytWidget.entitlements`
8. Main app **KhaytCompanion** target → **Signing & Capabilities → + App Groups** → `group.com.khaytapp.companion` (same on widget target)
9. Build & run app on device, then add **Khayt Queue** widget from home screen

The main app writes queue stats via `WidgetSnapshotStore` whenever LAN health refresh succeeds.
