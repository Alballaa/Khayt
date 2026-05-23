# Khayt · خيط

> **⚠️ BETA SOFTWARE** — This app is under active development. Back up your data regularly. Verify all invoice figures before sending to clients. [Report bugs here](https://github.com/Alballaa/Khayt/issues).

A free, offline-first desktop app for running a 3D printing business — quoting, production tracking, filament inventory, ZATCA-compliant invoicing, and analytics. Runs on macOS, Windows, and Linux.

Built with **Electron** · Vanilla JS · No cloud, no subscription, your data stays on your machine.

---

## Screenshots

> Coming soon — PRs welcome!

---

## Features

### 💰 Calculator & Quoting
Multi-part cart with live cost breakdown: material weight, machine time, electricity, labour, overhead, failure rate, margin. Volume pricing tiers. Resin (mL-based) and FDM (gram-based) support. G-code / 3MF metadata auto-extraction.

### 📋 Production Queue (Kanban)
Drag-and-drop board: Pending → Printing → Post-Processing → QC → Completed. Multi-machine scheduling view. On-hold with reason. Live printer API (OctoPrint / Moonraker / Bambu). Part-level colour assignment.

### 🧾 Invoicing (ZATCA Phase 1)
Bilingual EN/AR invoices with TLV-encoded QR code. Proforma invoices. Milestone-based partial invoicing. Quote approval page (shareable link). Quote revision history. PDF export. WhatsApp sharing. Email delivery (SendGrid / Mailgun).

### 📦 Inventory
Filament spools (FDM + Resin) with auto-deduction on completion. Colour variants library. Spool drying log. Test print results. Reorder points and alerts. Price history. Overcommit warnings.

### 👥 Clients & CRM
Client profiles (bilingual, VAT, CR). Credit limits. Address book. Loyalty tiers with automatic discounts. Intake forms. Client portal export. Aged receivables report.

### 📊 Analytics
Revenue, orders, hours, waste tracking. Machine profit/loss. Operator performance. Retention rates. Production heatmap. Cost trends (per-gram / per-hour). Break-even dashboard card. NPS survey (generated page + manual recording). Simple and Professional reporting modes.

### 🏭 Machines
Maintenance log with service intervals and alerts. Nozzle tracking (material, diameter, replacement threshold). Downtime logging. Live printer API with temperature and progress display.

### 💸 Expenses & Purchases
Recurring expenses (monthly / quarterly / annually). Budget tracking. Receipt attachments. Purchase orders with partial receiving and supplier invoice matching (AP). Accounting CSV export (double-entry journal format).

### ⚙️ Settings & Integrations
- 6 UI languages: English, Arabic, German, Spanish, French, Chinese
- Dark / Light / System theme
- Outbound webhooks (HMAC-signed) for order events
- Embedded LAN REST API (PIN-protected) — view queue from any device on your network
- Operator lock with PIN and role-based access (Admin / Technician / Sales)
- Invoice number prefix, gap detection, auto-reset
- Working hours schedule and public holidays
- Auto-backup (local + iCloud on macOS)
- Simple / Professional UI modes

---

## Installation

### Download (recommended)

Go to [Releases](https://github.com/Alballaa/Khayt/releases) and download the latest build for your platform:

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Khayt-*-arm64.dmg` |
| macOS (Intel) | `Khayt-*-x64.dmg` |
| Windows | `Khayt-*-Setup.exe` |
| Linux (AppImage) | `Khayt-*.AppImage` |
| Linux (deb) | `Khayt-*.deb` |

> **macOS note:** The app is unsigned. Right-click → Open the first time, or run:
> ```bash
> xattr -cr "/Applications/Khayt.app"
> ```

### Build from source

Requires **Node.js 18+**.

```bash
git clone https://github.com/Alballaa/Khayt.git
cd Khayt
npm install
npm start          # development (live reload with ⌘R)
npm run dist       # build DMG / EXE / AppImage for your current platform
```

---

## Data & Privacy

- All data is stored locally in `~/Library/Application Support/Khayt/khayt-store.json` (macOS) or the equivalent on Windows/Linux.
- No telemetry. No analytics. No network calls unless you configure webhooks or email.
- Use **Settings → Export all data** for a JSON backup. **Settings → Restore backup** to recover.
- Auto-backup saves daily snapshots to `~/Library/Application Support/Khayt/backups/`.

---

## ZATCA Phase 1 Compliance

Each invoice includes a TLV-encoded base64 QR code with:

| Tag | Field |
|----:|-------|
| 1 | Seller name |
| 2 | VAT registration number |
| 3 | Timestamp (ISO 8601) |
| 4 | Invoice total with VAT |
| 5 | VAT total |

Enable VAT and enter your 15-digit VAT number in **Settings → Business Information**.

---

## Project Structure

```
Khayt/
├── main.js              # Electron main process — IPC handlers, file I/O, LAN server
├── preload.js           # Context bridge — exposes hubAPI to renderer
├── renderer/
│   ├── index.html       # Single-page app shell, all tab HTML
│   ├── styles.css       # Dark theme, RTL support, print styles
│   ├── i18n.js          # 6-language string table + t() helper
│   └── app.js           # All app logic (~14,500 lines)
├── assets/
│   ├── icon.icns        # macOS icon
│   └── ...              # Other platform icons
└── .github/workflows/
    └── release.yml      # CI: build DMG + EXE + AppImage on version tags
```

---

## Contributing

Issues and pull requests are welcome. This is a solo side project — response times may vary.

If you find a bug, please include:
1. Your OS and app version (shown in Settings → About)
2. Steps to reproduce
3. What you expected vs what happened

---

## License

**MIT + Commons Clause** — free to use (including for running your 3D printing business), but you may not sell, repackage, or charge others for this software. See [LICENSE](./LICENSE) for full terms.

---

*Khayt (خيط) means "thread" in Arabic — the filament that ties everything together.*
