# Athar Tuwaiq Hub

A desktop app for running a 3D printing business: estimating quotes, tracking production, managing filament inventory, and issuing ZATCA-compliant bilingual (English / Arabic) invoices.

Built with **Electron** so it runs as a native macOS app from your Dock.

## What's inside

```
athar-tuwaiq-hub/
├── package.json          # dependencies + electron-builder config
├── main.js               # Electron main process (window, menu, QR IPC)
├── preload.js            # Secure bridge — exposes hubAPI.generateQR()
├── renderer/
│   ├── index.html        # All tabs (Calculator, Queue, Analytics, Inventory, Logs, Settings)
│   ├── styles.css        # Modern dark theme with light + RTL support
│   ├── i18n.js           # EN / AR translations + language switcher
│   └── app.js            # All app logic, state, ZATCA TLV encoder
├── assets/
│   └── icon.icns         # (you'll add this — see below)
└── build/                # electron-builder output (DMG goes here)
```

## Setup (one time)

You need **Node.js 18+** installed. Get it from [nodejs.org](https://nodejs.org) if you don't have it.

Open Terminal in this folder and run:

```bash
npm install
```

This downloads Electron, the QR generator, and the build tooling. Takes ~1–2 minutes.

## Running it (development)

```bash
npm start
```

The app window opens with a real macOS title bar and your Dock icon. Edit any file in `renderer/` and reload with **⌘R** to see changes.

## Building the Mac app (DMG)

```bash
npm run dist
```

Output lands in `build/` — you'll get an `Athar Tuwaiq Hub-1.0.0.dmg` you can drag to Applications, plus an `.app` bundle if you want to skip the DMG step.

For a universal binary that runs on both Apple Silicon and Intel:

```bash
npm run dist:universal
```

> macOS will quarantine the unsigned `.app` the first time you open it. Right-click → Open the first time, or run `xattr -cr "/Applications/Athar Tuwaiq Hub.app"` if Gatekeeper blocks it. To ship without that friction you'd need an Apple Developer ID; let me know and we can add code signing later.

## App icon

Drop a `512x512` PNG of your logo into `assets/icon.png`, then convert it to `.icns`:

```bash
cd assets
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
cp icon.png       icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -rf icon.iconset
```

Without it, electron-builder uses the default Electron icon — the app still works.

## Features

**Calculator & Estimator** — material, machine, labor, overhead. Multi-part builds via a cart. Live preview.

**Catalog** *(new in 1.1)* — save recurring prints with a photo, multi-part parts list, and default margin. One click loads the whole product into the cart, ready to quote. Each card shows print count, last print date, and lifetime revenue per product.

**Clients** *(new in 1.1)* — saved client list with bilingual names, phone, email, CR, and VAT. Autocomplete in the calculator's client field; per-client revenue and order count; top-clients leaderboard in Analytics. Past orders that referenced a client are preserved even if you delete that client.

**Templates** — save single-part configurations (all rates) and reload them. Use catalog for full multi-part products; templates for parts you reuse across products.

**Production Queue** — Kanban board (Pending → Printing → Post → Completed). Completing an order auto-deducts material from inventory if you have that setting on.

**Inventory** — filament spool tracking; selected filament auto-fills cost/weight in the calculator. Low-stock spools are flagged with a warning badge.

**Auto filament deduction + low-stock alerts** *(new in 1.1)* — when an order is marked complete, the renderer deducts each part's printed weight from its filament spool and warns you if a spool drops below your threshold. Toggle and threshold both live in Settings.

**Orders Log** — full history with searchable rows, status + date-range filters, badges, and "print invoice" per order.

**Analytics** — revenue, completed orders, total print hours, in-progress count, plus a date-range filter (this month / last month / quarter / year / all time), most-printed products, and top clients by revenue.

**Settings**
- Business info (English + Arabic name, address, phone, email, VAT, CR)
- Language (default English; toggle anytime via the **EN / ع** chip in the header)
- Theme (dark / light / system)
- Stock: auto-deduction toggle and low-stock threshold (grams)
- Invoice number prefix and bilingual footer
- Data export / import (JSON, includes products + clients), reveal product photos folder, full reset

## ZATCA Phase 1 invoice

Each invoice includes the **TLV-encoded base64 QR code** required by ZATCA Phase 1:

| Tag | Field |
|----:|-------|
| 1 | Seller name (UTF-8) |
| 2 | VAT registration number (15 digits, if registered) |
| 3 | Timestamp (ISO 8601) |
| 4 | Invoice total with VAT |
| 5 | VAT total |

The QR is generated in the Electron main process (using the `qrcode` npm package) and rendered as inline SVG, so it scans crisply at any print size.

Because the business isn't VAT-registered yet, **VAT = 0.00** and the VAT field in the QR is empty. When you register, fill in the VAT number under **Settings → Business Information** and the QR will pick it up automatically. The invoice template already shows the bilingual VAT line — when you switch on VAT later you'll just need to add the 15% calculation (one line in `app.js`, happy to do it).

The invoice itself is bilingual end-to-end: English + Arabic side-by-side for the business name, addresses, headers, line item descriptions, totals, and footer.

## Switching language

The header has an **EN / ع** pill — click to switch. The whole UI flips, including the print layout direction. The choice is remembered between sessions.

## Data persistence

Everything is stored in your browser-engine `localStorage` (inside the Electron app's data folder on disk: `~/Library/Application Support/Athar Tuwaiq Hub/`). Use **Settings → Export all data** for a JSON backup, **Import** to restore.

**Product photos** are different — full-resolution images are saved as JPEG files in `~/Library/Application Support/Athar Tuwaiq Hub/products/` so they don't bloat localStorage. The catalog cards use a small embedded thumbnail. **Settings → Reveal product photos folder** opens the directory in Finder.

## Bug fixes vs. the original web version

Stuff I fixed while porting:

- `switchTab` no longer relies on the global `event` object — uses `data-tab` attributes and proper handlers.
- Filament dropdown selection is preserved across re-renders (was being wiped when inventory updated).
- Templates now persist **all** input values (the original lost spool cost, wear rate, power draw, electricity, labor rate, failure rate).
- `alert()` / `confirm()` calls replaced with non-blocking toasts and a proper modal.
- Invoice IDs are now sequential (`INV-2026-0001`) instead of random 4-digit numbers that could collide.
- Invoice generation properly handles the print-area visibility hack via a print-only stylesheet, so the dev preview no longer flashes when generating.
- Added input validation — negative numbers no longer slip through.
- The "Add part" flow no longer pushes empty/zero parts to the cart.

## Where things are if you want to tweak

- Change colors / spacing → `renderer/styles.css` (CSS variables at the top)
- Add a translation key → add to `STRINGS.en` and `STRINGS.ar` in `renderer/i18n.js`
- Change the calculator math → `calculateLivePartCost()` in `renderer/app.js`
- Change the invoice layout → `renderInvoice()` in `renderer/app.js`
- Switch on 15% VAT later → in `generateInvoice()` change `vatAmount = '0.00'` to compute 15% of subtotal

## Troubleshooting

**`npm install` fails on Electron** — usually a network or proxy issue. Try `npm install --verbose`.

**App opens but is blank** — open **View → Toggle Developer Tools** from the menu and look at the console.

**QR doesn't appear in invoice** — confirm `qrcode` installed correctly: `npm ls qrcode`.

**Print dialog shows the whole UI instead of just the invoice** — make sure the print CSS hasn't been edited. The `@media print` block in `styles.css` hides everything except `#invoice-print-area`.
