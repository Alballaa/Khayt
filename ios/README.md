# Khayt iOS Companion (v2)

LAN-connected companion for iPhone/iPad. **Desktop is the source of truth** (`khayt-store.json` on Mac/PC). No cloud sync, no local business database.

## v2 features

| Area | Implementation |
|------|----------------|
| **Pairing** | Shop IP + port + owner LAN PIN; validated with `GET /api/queue` |
| **Connection health** | Polls `GET /api/status` + PIN check |
| **Production queue** | View kanban orders, advance or set status, **assign machine** (`PATCH /api/orders/:id`) |
| **New order** | Create orders from the app (`POST /api/orders`) |
| **Live monitoring** | Real-time printer progress / temps (`GET /api/machines/live`) |
| **Inventory** | List, manual/NFC add, **edit remaining / delete spool** (`POST` / `PATCH` / `DELETE /api/inventory`) |
| **Clients** | Client list + history (`GET /api/clients`) |
| **Intake** | Walk-in / waiting-list triage (`GET` / `PATCH /api/waiting-list`) |
| **Machines** | Printer status (`GET /api/machines`) |
| **Widget** | Home Screen queue widget (bundled extension target) |

## Out of scope (v2)

Calculator, ZATCA, invoicing, analytics, full settings, offline-first DB.

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
