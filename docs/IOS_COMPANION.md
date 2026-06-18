# iOS Companion (v2)

Native **LAN-only** client. The desktop app remains the source of truth (`khayt-store.json`).

## Feature set

| Area | Features |
|------|----------|
| **Pairing** | 4-step wizard (IP, port, LAN PIN, test) |
| **Home** | Queue stats, kanban strip, completed today, low-stock & overdue alerts, quick actions, order preview |
| **Orders** | Active queue + filters (status, overdue) + recent history; detail sheet; advance / set status; **assign machine**; haptics |
| **New order** | Create an order from the app (client, item, material, qty, due date) — posts to the queue |
| **Live monitoring** | Real-time printer status (progress %, current job, nozzle/bed temps) from connected machines |
| **Inventory** | List, search, low-stock filter, sort, spool detail (SKU, lot, temps); **edit remaining grams**; **delete spool**; add spool (photo OCR / NFC / manual), **write NFC tag** (OpenSpool / OpenTag3D / OpenPrintTag) |
| **Clients** | Client list with order history and contact details |
| **Intake** | Walk-in / waiting-list triage — review incoming requests, advance or dismiss |
| **Machines** | Printer list + live status |
| **Settings** | Connection, language (EN / AR / system), notification toggles, widget guide, unpair |
| **Connection** | Polling health, top banner when offline/wrong PIN, badge in toolbar |
| **Notifications** | Local alerts: queue changes, LAN disconnect, overdue orders, low filament |
| **Widget** | Home Screen queue widget (bundled extension target — see [ios/XCODE_WIDGET.md](../ios/XCODE_WIDGET.md)) |
| **Shortcuts** | Siri / Shortcuts: open queue, open inventory |
| **Localization** | English + Arabic strings, RTL layout for Arabic |

## LAN API

| Feature | Endpoint |
|---------|----------|
| Status | `GET /api/status` |
| Queue | `GET /api/queue` |
| Orders | `GET /api/orders?limit=`, `POST /api/orders`, `PATCH /api/orders/:id` |
| Inventory | `GET /api/inventory`, `POST /api/inventory`, `PATCH /api/inventory/:id`, `DELETE /api/inventory/:id` |
| Machines | `GET /api/machines`, `GET /api/machines/live` |
| Clients | `GET /api/clients` |
| Waiting list | `GET /api/waiting-list`, `PATCH /api/waiting-list/:id` |

See [LAN_API.md](./LAN_API.md).

## NFC write

After reading a filament tag, scanning a label, or reviewing spool details, use **Write to NFC tag** to encode data onto a blank writable NTAG sticker.

| Standard | MIME type | Printers / firmware |
|----------|-----------|---------------------|
| **OpenSpool** | `application/json` | Snapmaker U1 **extended firmware** (community), Bambu via OpenSpool reader |
| **OpenTag3D** | `application/opentag3d` | Bambu Lab, Creality, generic |
| **OpenPrintTag** | `application/vnd.openprinttag` | Prusa MK4 / XL / MINI |

Encoding mirrors desktop `renderer/inventory.js` parsers (`NFCParser` / `NFCEncoder`). Requires a physical iPhone with NFC and paid Apple Developer entitlements (`NDEF` + `TAG`).

### Who can use NFC write?

Any individual with an **iPhone + blank NTAG tags** can write tags from the app. Whether the **printer recognizes** the tag depends on firmware:

| Setup | NFC write from Khayt | Printer reads tag |
|-------|----------------------|-------------------|
| **Bambu / Creality / generic** | Yes — pick **OpenTag3D** | If printer/firmware supports OpenTag3D |
| **Prusa** | Yes — pick **OpenPrintTag** | Prusa with OpenPrintTag support |
| **Snapmaker U1 stock firmware** | Tags can be written, but printer **won’t** read them | Official Snapmaker Mifare Classic tags only |
| **Snapmaker U1 extended firmware** | Yes — pick **OpenSpool** (NTAG215/216 recommended) | Yes, via [paxx12 extended firmware](https://snapmakeru1-extended-firmware.pages.dev/rfid_support) |

**Important:** Snapmaker U1 extended firmware is **not** issued by Snapmaker. It is **community/third-party** firmware (e.g. paxx12). Stock U1 firmware only reads proprietary Snapmaker tags. Installing extended firmware is optional and at your own risk.

## Out of scope (v2)

Calculator, ZATCA, invoicing, full desktop settings, cloud sync, remote push server.

## UI redesign

Copy the prompt in [IOS_UI_REDESIGN_PROMPT.md](./IOS_UI_REDESIGN_PROMPT.md) into a design AI.

## Repo layout

```
ios/KhaytCompanion/          SwiftUI app
ios/KhaytWidget/             Widget extension source (target bundled in project)
ios/KhaytCompanion.xcodeproj
docs/LAN_API.md
```

## Security

- Owner PIN in iOS Keychain  
- HTTP on trusted LAN only  
- App Group `group.com.khaytapp.companion` for widget snapshot
