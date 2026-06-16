# iOS Companion (v1)

Native **LAN-only** client. The desktop app remains the source of truth (`khayt-store.json`).

## Feature set

| Area | Features |
|------|----------|
| **Pairing** | 4-step wizard (IP, port, LAN PIN, test) |
| **Home** | Queue stats, kanban strip, completed today, low-stock & overdue alerts, quick actions, order preview |
| **Orders** | Active queue + filters (status, overdue) + recent history; detail sheet; advance / set status; haptics |
| **Inventory** | List, search, low-stock filter, sort, spool detail (SKU, lot, temps), add spool (photo OCR / NFC / manual) |
| **Machines** | Printer list + status |
| **Settings** | Connection, language (EN / AR / system), notification toggles, widget guide, unpair |
| **Connection** | Polling health, top banner when offline/wrong PIN, badge in toolbar |
| **Notifications** | Local alerts: queue changes, LAN disconnect, overdue orders, low filament |
| **Widget** | Home Screen queue widget (see [ios/XCODE_WIDGET.md](../ios/XCODE_WIDGET.md)) |
| **Shortcuts** | Siri / Shortcuts: open queue, open inventory |
| **Localization** | English + Arabic strings, RTL layout for Arabic |

## LAN API

| Feature | Endpoint |
|---------|----------|
| Status | `GET /api/status` |
| Queue | `GET /api/queue`, `PATCH /api/orders/:id` |
| Order log | `GET /api/orders?limit=` |
| Inventory | `GET /api/inventory`, `POST /api/inventory` |
| Machines | `GET /api/machines` |

See [LAN_API.md](./LAN_API.md).

## Out of scope (v1)

Calculator, ZATCA, invoicing, full desktop settings, cloud sync, remote push server.

## UI redesign

Copy the prompt in [IOS_UI_REDESIGN_PROMPT.md](./IOS_UI_REDESIGN_PROMPT.md) into a design AI.

## Repo layout

```
ios/KhaytCompanion/          SwiftUI app
ios/KhaytWidget/             Widget extension source (add target in Xcode)
ios/KhaytCompanion.xcodeproj
docs/LAN_API.md
```

## Security

- Owner PIN in iOS Keychain  
- HTTP on trusted LAN only  
- App Group `group.com.khaytapp.companion` for widget snapshot (optional capability)
