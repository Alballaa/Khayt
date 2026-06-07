# Khayt LAN REST API

Reference for the embedded HTTP server in `lib/lan-server.js`. Used by the **LAN PWA**, **kiosk**, and **iOS Companion** — not a public cloud API.

**Source of truth:** `khayt-store.json` on the desktop (Mac/PC). All writes persist to disk and notify the Electron renderer via IPC.

## Enable on desktop

1. Khayt → **Settings** → **LAN API**
2. Enable **LAN REST API**
3. **Listen on all network interfaces** (required for phone/tablet on Wi‑Fi)
4. Set **Owner LAN PIN** (required for companion queue/inventory; max 256 chars)
5. Default port **3219** (configurable)

Base URL: `http://<desktop-lan-ip>:<port>`

## Authentication

| Mechanism | Details |
|-----------|---------|
| Header | `x-khayt-pin: <owner-pin>` (preferred for native clients) |
| Query | `?pin=<owner-pin>` (used by some PWA links) |

**Owner PIN** is `settings.lanApi.pin` in the store — same as kiosk / queue API.

### PIN rules

- If an owner PIN **is configured**, sensitive `GET` routes and all mutating routes require a matching PIN.
- If **no** owner PIN is configured, sensitive `GET` routes return **401** (queue/inventory/machines are unavailable until a PIN is set).
- **Writes** without a configured PIN return **403**.
- **Brute force:** 10 failed attempts per client IP → **429** for 1 minute.

### Public routes (no owner PIN)

- `GET /api/status`
- `GET /order/:id` (customer portal)
- Quote approval, intake (separate intake PIN/token), webhooks, static PWA assets

Companion apps should call `GET /api/status` first (reachability), then `GET /api/queue` with PIN to confirm pairing.

## Companion v1 endpoints

### `GET /api/status`

Public aggregate counts for the active queue.

**Response 200**

```json
{
  "queued": 12,
  "pending": 4,
  "printing": 3,
  "post": 2,
  "qc": 3,
  "completed_today": 7,
  "waiting": 2
}
```

`waiting` — active job intake / waiting-list entries (excludes declined).

### `GET /api/queue`

Active kanban orders (`pending`, `printing`, `post`, `qc`). **Requires owner PIN** when configured.

**Response 200** — array:

```json
[
  {
    "id": "ord-123",
    "project": "Bracket v2",
    "client": "Acme Co",
    "status": "printing",
    "machine": "P1S-01",
    "dueDate": "2026-06-05",
    "priority": "normal"
  }
]
```

### `GET /api/orders`

Order log slice. **Requires owner PIN.**

| Query | Description |
|-------|-------------|
| `limit` | Max rows (default 50, cap 200) |
| `status` | Filter by status |

**Response 200** — array with `id`, `project`, `client`, `status`, `material`, `price`, `dueDate`, `date`, `paymentStatus`.

### `PATCH /api/orders/:id`

Update order status. **Requires owner PIN.**

**Body** (at least one field required)

```json
{ "status": "printing" }
```

```json
{ "machineId": "m1" }
```

```json
{ "status": "printing", "machineId": "m1" }
```

Pass `"machineId": null` to unassign a printer.

**Valid status values:** `pending`, `printing`, `post`, `qc`, `completed`, `on_hold`

**Response 200:** `{ "ok": true }`  
**Response 404:** order not found  
**Response 400:** invalid status

**Desktop side effect:** `lan-order-updated` IPC → renderer updates `printLog` and UI.

### `GET /api/inventory`

Full inventory array from store. **Requires owner PIN.**

**Response 200:** JSON array of spool objects (same shape as `store.inventory[]`).

### `POST /api/inventory`

Append a spool. **Requires owner PIN.**

**Body:** spool object (partial OK). Server sets:

- `id` — `spool-<timestamp>` if omitted
- `addedAt` — ISO timestamp
- `remaining` — from `weightRemaining` or `weightTotal` or `1000`

**Response 201:** `{ "ok": true, "spool": { ... } }`

**Desktop side effect:** `lan-spool-added` IPC.

### `PATCH /api/inventory/:id`

Update spool remaining weight. **Requires owner PIN.**

**Body**

```json
{ "remaining": 450 }
```

**Response 200:** `{ "ok": true, "spool": { ... } }`  
**Desktop side effect:** `lan-spool-updated` IPC.

### `DELETE /api/inventory/:id`

Remove a spool. **Requires owner PIN.**

**Response 200:** `{ "ok": true, "id": "spool-…" }`  
**Desktop side effect:** `lan-spool-deleted` IPC.

### `GET /api/waiting-list`

Active intake / waiting-list entries (excludes declined). **Requires owner PIN.**

**Response 200:** array of waiting-list objects (`id`, `project`, `clientName`, `notes`, `priority`, `status`, …).

### `PATCH /api/waiting-list/:id`

Update intake item status. **Requires owner PIN.**

**Body:** `{ "status": "reminded" }` or `{ "status": "declined" }`  
Declining moves the item to `waitingListHistory` on desktop.

**Desktop side effect:** `lan-waiting-updated` IPC.

### `GET /api/clients`

Read-only client list from store. **Requires owner PIN.**

**Response 200:** array with `id`, `nameEn`, `nameAr`, `phone`, `email`.

### `GET /api/machines`

Machine list glance. **Requires owner PIN.**

**Response 200** — array:

```json
[
  { "id": "m1", "name": "P1S", "type": "fdm", "status": "printing" }
]
```

## Errors

| HTTP | Meaning |
|------|---------|
| 401 | Missing or wrong PIN |
| 403 | Write blocked (no PIN configured on server) |
| 413 | Body &gt; 1 MB |
| 429 | PIN lockout |
| 404 | Unknown path or order |

Body: `{ "error": "message" }`

## Desktop IPC (mobile → UI sync)

Defined in `preload.js`:

| Event | When |
|-------|------|
| `lan-spool-added` | After `POST /api/inventory` |
| `lan-spool-updated` | After `PATCH /api/inventory/:id` |
| `lan-spool-deleted` | After `DELETE /api/inventory/:id` |
| `lan-order-updated` | After `PATCH /api/orders/:id` |
| `lan-waiting-updated` | After `PATCH /api/waiting-list/:id` |
| `lan-kanban-advanced` | Printer webhooks / auto-advance |

Renderer handlers: `renderer/app-boot.js` (`onLanSpoolAdded`, `onLanOrderUpdated`).

## Out of scope for companion v1

Calculator, ZATCA, invoicing, CRM, analytics, settings editor, cloud sync, local offline DB. Use the desktop app or LAN PWA for those flows.

## Related docs

- [IOS_COMPANION.md](./IOS_COMPANION.md) — SwiftUI app architecture
- [ios/README.md](../ios/README.md) — build and run
