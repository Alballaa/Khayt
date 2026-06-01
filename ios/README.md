# Khayt iOS Companion (v1)

LAN-connected companion for iPhone/iPad. **Desktop is the source of truth** (`khayt-store.json` on Mac/PC). No cloud sync, no local business database.

## v1 features

| Area | Implementation |
|------|----------------|
| **Pairing** | Shop IP + port + owner LAN PIN; validated with `GET /api/queue` |
| **Connection health** | Polls `GET /api/status` + PIN check |
| **Production queue** | View kanban orders, advance or set status (`PATCH /api/orders/:id`) |
| **Inventory** | List spools, manual add, NFC add (`POST /api/inventory`) |
| **Machines** | Glance at printer status (`GET /api/machines`) |

## Out of scope (v1)

Calculator, ZATCA, invoicing, CRM, analytics, full settings, offline-first DB.

Use the **LAN PWA** (Add to Home Screen) for a zero-install alternative; native adds NFC, Keychain, and a future App Store path.

## Desktop setup (v2.2.1+)

1. **Settings → LAN API** → enable API  
2. **Listen on all network interfaces**  
3. Set **Owner LAN PIN** (required for queue/inventory)  
4. Note LAN IP and port (default **3219**)

## Build

```bash
open ios/KhaytCompanion.xcodeproj
```

Set Development Team, run on device (NFC needs hardware).

## API documentation

Canonical reference: **[docs/LAN_API.md](../docs/LAN_API.md)**  
Architecture: **[docs/IOS_COMPANION.md](../docs/IOS_COMPANION.md)**

## Prior work

Draft branch `claude/ios-app-mvwgj` used XcodeGen (`ios/Khayt/`). Current target: `ios/KhaytCompanion/`.
