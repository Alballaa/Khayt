# Khayt iOS Companion

Native SwiftUI app for iPhone and iPad that connects to the **Khayt desktop** app over your local network. It uses the embedded LAN REST API (`lib/lan-server.js`) — no cloud account required.

## Features

| Tab | What it does |
|-----|----------------|
| **Dashboard** | Live queue counts (`GET /api/status`) |
| **Queue** | View production board orders and advance status (`GET /api/queue`, `PATCH /api/orders/:id`) |
| **Inventory** | List filament spools (`GET /api/inventory`) |
| **Scan NFC** | Read OpenTag3D / OpenPrintTag tags and add spools (`POST /api/inventory`) |
| **Settings** | Host, port, LAN PIN (stored in Keychain) |

Changes from the phone sync to the desktop immediately (the Electron app listens for `lan-spool-added` and `lan-order-updated` events).

## Requirements

- **Khayt desktop** 2.2+ with LAN API enabled
- iPhone with NFC (for spool scanning)
- Same Wi‑Fi network as the computer running Khayt
- **Xcode 15+** and **iOS 17+** to build

## Desktop setup

1. Open Khayt → **Settings** → **LAN API**
2. Enable **LAN REST API**
3. Set **Listen on all network interfaces** (not localhost only)
4. Set a strong **Owner LAN PIN**
5. Note your computer’s LAN IP (e.g. `192.168.1.42`) — default port **3219**

## Build & run

```bash
open ios/KhaytCompanion.xcodeproj
```

1. Select the **KhaytCompanion** scheme and your iPhone or simulator
2. Set your **Development Team** in Signing & Capabilities
3. Run (⌘R)

On a physical device, NFC scanning requires a paid Apple Developer account with the NFC entitlement enabled.

## API reference

Authenticated requests send the PIN in the `x-khayt-pin` header (same as the LAN PWA).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Public shop stats |
| GET | `/api/queue` | Active kanban orders |
| GET | `/api/inventory` | All spools |
| POST | `/api/inventory` | Add spool (from NFC) |
| PATCH | `/api/orders/:id` | Update order status |

See [docs/IOS_COMPANION.md](../docs/IOS_COMPANION.md) for architecture notes.

## App Store

This target is source-first in the monorepo. App Store distribution (bundle ID, signing, TestFlight) is maintained separately by the Khayt project owners.
