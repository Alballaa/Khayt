/**
 * CSV bundle — turn a Khayt store snapshot into a set of CSV files for a
 * one-click "Export all data (CSV)" backup. Pure (no DOM / no I/O) so it is
 * unit-testable and reusable from the main process; the renderer hands the
 * result to hub:export-csv-bundle, which writes each file into a chosen folder.
 *
 * Spreadsheet-friendly and injection-safe: every cell is quoted, embedded
 * quotes are doubled, and a leading =,+,-,@ is neutralized so a CSV opened in
 * Excel/Sheets can't execute a formula.
 */
(function (global) {
  function neutralize(v) {
    const s = v == null ? '' : String(v);
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  }
  function cell(v) {
    if (Array.isArray(v)) v = v.join(', ');
    return '"' + neutralize(v).replace(/\n/g, ' ').replace(/"/g, '""') + '"';
  }
  function toCsv(headers, rows) {
    const lines = [headers.map(cell).join(',')];
    for (const r of rows) lines.push(r.map(cell).join(','));
    // BOM so Excel reads UTF-8; CRLF line endings.
    return '﻿' + lines.join('\r\n');
  }

  // Each table: a header row + a mapper from one record to a row array.
  // Keyed by the snapshot collection name. Only collections that exist and are
  // non-empty get a file.
  const TABLES = {
    printLog: {
      file: 'orders.csv',
      headers: ['ID', 'Date', 'Client', 'Material', 'Print Time (hrs)', 'Price', 'Status', 'Payment', 'Paid Amount', 'Due Date', 'Tags', 'Notes'],
      row: (o) => [o.id, o.date, o.project || '', o.material || '', o.printTime, o.price, o.status, o.paymentStatus || '', o.paidAmount || 0, o.dueDate || '', o.tags || [], o.notes || ''],
    },
    clients: {
      file: 'clients.csv',
      headers: ['ID', 'Name', 'Phone', 'Email', 'Company', 'Address', 'Notes', 'Tags'],
      row: (c) => [c.id, c.name || '', c.phone || '', c.email || '', c.company || '', c.address || '', c.notes || '', c.tags || []],
    },
    products: {
      file: 'products.csv',
      headers: ['ID', 'Name', 'Category', 'Price', 'Material', 'Print Time (hrs)', 'Notes'],
      row: (p) => [p.id, p.name || '', p.category || '', p.price ?? '', p.material || '', p.printTime ?? '', p.notes || ''],
    },
    inventory: {
      file: 'inventory.csv',
      headers: ['ID', 'Material', 'Color', 'Brand', 'Remaining (g)', 'Total (g)', 'Cost', 'Location', 'Notes'],
      row: (s) => [s.id, s.material || s.type || '', s.color || '', s.brand || '', s.remaining ?? s.remainingGrams ?? '', s.total ?? s.totalGrams ?? '', s.cost ?? '', s.location || '', s.notes || ''],
    },
    expenses: {
      file: 'expenses.csv',
      headers: ['ID', 'Date', 'Category', 'Description', 'Amount', 'Vendor'],
      row: (e) => [e.id, e.date || '', e.category || '', e.description || e.note || '', e.amount ?? '', e.vendor || ''],
    },
    machines: {
      file: 'machines.csv',
      headers: ['ID', 'Name', 'Model', 'Status', 'Notes'],
      row: (m) => [m.id, m.name || '', m.model || '', m.status || '', m.notes || ''],
    },
    suppliers: {
      file: 'suppliers.csv',
      headers: ['ID', 'Name', 'Phone', 'Email', 'Notes'],
      row: (s) => [s.id, s.name || '', s.phone || '', s.email || '', s.notes || ''],
    },
    purchaseOrders: {
      file: 'purchase-orders.csv',
      headers: ['ID', 'Date', 'Supplier', 'Status', 'Total'],
      // A purchase order records its date as `orderedAt` and its money as
      // `qty` × `unitPrice`; the `date` and `total` this reached for first are
      // written by nothing, so the accountant's copy of every order carried a
      // blank date and a blank total. The old names stay as fallbacks for an
      // externally-shaped snapshot, behind the ones the app actually writes.
      row: (po) => [
        po.id,
        po.orderedAt || po.date || po.createdAt || '',
        po.supplierName || po.supplier || '',
        po.status || '',
        po.total ?? (Math.round((+po.qty || 0) * (+po.unitPrice || 0) * 100) / 100 || ''),
      ],
    },
  };

  /**
   * Build the CSV files for a snapshot.
   * @param {object} snapshot store collections (printLog, clients, …)
   * @returns {Array<{name: string, content: string}>}
   */
  function buildCsvBundle(snapshot) {
    snapshot = snapshot || {};
    const out = [];
    for (const key of Object.keys(TABLES)) {
      const rows = snapshot[key];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const t = TABLES[key];
      out.push({ name: t.file, content: toCsv(t.headers, rows.map(t.row)) });
    }
    return out;
  }

  const api = { buildCsvBundle, TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.KhaytCsvBundle = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
