/* ============================================================
   Khayt — main app logic
   Renderer state, persisted to localStorage. Full product images
   stored on disk via hubAPI (preload). Thumbnails live inline.
   ============================================================ */

/* Collections and persistence — renderer/app-state.js; UI shell — renderer/shell.js */


let logOperatorFilter = '';
let logDisplayLimit = 100;      // pagination: rows shown in log table
let _lastLogFilterHash = '';    // detects filter/sort changes to reset page


// Undo stack — pushed when a destructive action runs; popped if user clicks "Undo"
const undoStack = [];

/* util, currency — renderer/util.js, renderer/currency.js */
/* num, clampPositive, fmtMoney, computeUnitPrice — renderer/format.js */

/* Shared helpers, date filters, locale — renderer/app-helpers.js */

/* ============================================================
   Orders, Kanban, Logs, Analytics
   ============================================================ */
/* Order flows — renderer/order-flows.js */
/* exportAnalyticsReport — renderer/analytics.js */

/* Waiting list (job intake) — renderer/waiting-list.js */

/* Schedule, calendar, kiosk, portfolio, post-process presets — renderer/views.js */
/* Notification centre, tab badges, due-date alerts — renderer/notifications.js */

/* ============================================================
   PDF export + WhatsApp share
   ============================================================ */






/* ============================================================
   Feature 8: Order Edit History / Audit Trail
   ============================================================ */

/* ============================================================
   Feature 5: Capacity Forecast
   ============================================================ */

/* Email, webhooks, BNPL, LAN, status pages, surveys — renderer/integrations.js */

/* ============================================================
   ZATCA Phase 1 — TLV-encoded base64 QR
   ============================================================ */

/* ============================================================
   Invoice void / cancel
   ============================================================ */



/* ============================================================
   Feature 4 (this batch): AP — supplier invoice recording
   ============================================================ */

/* ============================================================
   Feature 6 (this batch): Client portal export
   ============================================================ */


/* Shift checklist, gift cards, VAT, slicer profiles, env logs — renderer/operations-extras.js */

