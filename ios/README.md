# Khayt iOS

Native SwiftUI companion app for the Khayt desktop. Talks to the embedded
LAN REST API on the desktop (Settings → LAN Server → Start) over Wi-Fi or
the optional internet tunnel.

## Roles

- **Owner** — dashboard, orders list, order detail, machines, inventory.
- **Operator** — Kanban queue with status transitions, add filament spools.
- **Customer** — track an order, approve a quote (web view onto `/order/:id`).

## Requirements

- Xcode 15 or later
- iOS 17 deployment target
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) to generate the Xcode project from `project.yml`

## Generate & open

```bash
cd ios
brew install xcodegen      # one-time
xcodegen generate
open Khayt.xcodeproj
```

Build & run on the iOS Simulator or a paired device.

## Pairing with the desktop

1. On the desktop app, open **Settings → LAN Server**, set a PIN, click **Start**.
2. Note the LAN URL (e.g. `http://192.168.1.42:3219`) or tunnel URL.
3. Launch the iOS app, paste the URL + PIN, tap **Connect**.

PIN and server URL are stored in the iOS Keychain.

## Layout

```
ios/
├── project.yml                 # XcodeGen project definition
├── Khayt/
│   ├── Sources/
│   │   ├── KhaytApp.swift      # @main
│   │   ├── AppState.swift      # connection + role, @Observable
│   │   ├── Models/             # Order, Machine, Spool, QueueStatus
│   │   ├── Networking/         # APIClient, KeychainStore
│   │   └── Views/              # Pair / Owner / Operator / Customer
│   └── Resources/
│       ├── Info.plist
│       └── Assets.xcassets/
```
