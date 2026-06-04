# Khayt Companion — security, bug, and UI audit

Multi-pass review of `ios/KhaytCompanion` against `design/iOS UI/` mockups and `lib/lan-server.js`.  
Branch: `cursor/ios-companion-app-2e93`.

## Security

| Severity | Finding | Status |
|----------|---------|--------|
| High | Cleartext HTTP + PIN in `x-khayt-pin` on LAN | **Accepted** (LAN-only product); document in pairing |
| High | No TLS / pinning | **Accepted** for v1 local Wi‑Fi |
| High | Host userinfo redirect (`192.168.1.1@evil.com`) | **Fixed** — `LANHostValidator` rejects `@`, builds URL via `URLComponents` |
| High | Order ID path / relative URL hijack | **Fixed** — reject `/` and `..`; strict encoding; absolute `URLComponents` |
| Medium | Keychain write unchecked | **Fixed** — check `SecItemAdd`; `kSecAttrService` |
| Medium | PIN retained after unpair | **Fixed** — `ConnectionSettings.unpair()` clears Keychain |
| Medium | NFC CBOR bomb | **Fixed** — depth/collection caps |
| Medium | Unbounded inventory POST strings | **Fixed** — `InputLimits.clamp` |
| Low | `GET /api/status` public | **By design** (desktop LAN API) |

## Bugs

| Severity | Finding | Status |
|----------|---------|--------|
| High | Overdue filter ignored when Orders tab already open | **Fixed** — `onChange(ordersTabRequest)` |
| High | Kanban “Done” shows empty active queue | **Fixed** — switches to Recent + `status=completed` |
| High | Order detail stale after PATCH | **Fixed** — refresh `selectedOrder` after load |
| Medium | Widget snapshot not reloaded | **Fixed** — `WidgetCenter.reloadTimelines` |
| Medium | Connected state with failed queue poll | **Fixed** — unreachable + disconnected snapshot |
| Medium | Stale pairing test after editing host/PIN | **Fixed** — invalidate on change |
| Medium | Inventory `weightRemaining` not decoded | **Fixed** — custom `InventorySpool` decode |
| Medium | ISO due dates not overdue | **Fixed** — `ISO8601DateFormatter` in `DueDateParser` |
| Medium | `on_hold` filter always empty on active queue | **Fixed** — removed from active chips (server queue omits it) |
| Low | Concurrent `load()` races | **Fixed** — generation counter in `OrdersView` |
| Low | NFC session after sheet dismiss | **Fixed** — `onDisappear { nfc.invalidate() }` |
| Low | Shortcut tab only on cold launch | **Fixed** — `scenePhase == .active` |

## UI

| Priority | Finding | Status |
|----------|---------|--------|
| P0 | Orders/Inventory/Add spool not mockup card layouts | **Open** — tokens applied; full card/swipe redesign deferred |
| P1 | System `.secondary` / `.primary` colors | **Partial** — Orders, Inventory rows, Settings |
| P1 | Filter chips / tab touch targets &lt; 44pt | **Fixed** — min heights on chips, kanban, tab bar |
| P2 | Arabic uppercase on section/kanban labels | **Fixed** — skip uppercase when Arabic layout |
| P2 | Status pills in RTL | **Fixed** — LTR on `CompanionStatusBadge` |
| P2 | `brandDim` naming | **Fixed** — alias on `KhaytDesign` |

## Remaining (optional)

- Rebuild Orders list as inset cards + swipe advance (`khayt-orders.jsx`)
- Inventory color swatch + progress bar (`khayt-inventory.jsx`)
- Custom bottom sheet for order detail and add spool
- Light mode (`LIGHT_TOKENS`)

## Verify on device

```bash
git pull origin cursor/ios-companion-app-2e93
open ios/KhaytCompanion.xcodeproj
```

Test: overdue banner → Orders filter; pipeline “Done” → Recent completed; unpair clears PIN; invalid host (with `@`) fails connection test.
