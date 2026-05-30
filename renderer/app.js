/* ============================================================
   Khayt — thin app entry (feature logic lives in renderer/*.js)
   ============================================================ */

let supplierSearchTerm = '';

// Undo stack — pushed when a destructive action runs; popped if user clicks "Undo"
const undoStack = [];

/* util, currency — renderer/util.js, renderer/currency.js */
/* app-helpers, ops-locations, operations-extras, integrations — renderer/*.js */
/* document exports — renderer/app-exports.js */
/* boot — renderer/app-boot.js (DOMContentLoaded) */
