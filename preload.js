// Preload — bridges a tiny, safe API to the renderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hubAPI', {
  // QR + meta
  generateQR: (text, options) => ipcRenderer.invoke('hub:generate-qr', text, options),
  appVersion: () => ipcRenderer.invoke('hub:app-version'),

  // Product images (full-resolution on disk in userData/products/)
  saveProductImage:   (productId, dataUrl) => ipcRenderer.invoke('hub:save-product-image', productId, dataUrl),
  loadProductImage:   (filename) => ipcRenderer.invoke('hub:load-product-image', filename),
  deleteProductImage: (filename) => ipcRenderer.invoke('hub:delete-product-image', filename),
  revealProductsFolder: () => ipcRenderer.invoke('hub:reveal-products-folder'),

  // Order print photos (userData/order-photos/)
  saveOrderPhoto:   (orderId, idx, dataUrl) => ipcRenderer.invoke('hub:save-order-photo', orderId, idx, dataUrl),
  loadOrderPhoto:   (filename) => ipcRenderer.invoke('hub:load-order-photo', filename),
  deleteOrderPhoto: (filename) => ipcRenderer.invoke('hub:delete-order-photo', filename),

  // PDF + sharing
  exportPDF:        (opts) => ipcRenderer.invoke('hub:export-pdf', opts),
  revealInFinder:   (path) => ipcRenderer.invoke('hub:reveal-in-finder', path),
  openPath:         (path) => ipcRenderer.invoke('hub:open-path', path),
  shareWhatsApp:    (opts) => ipcRenderer.invoke('hub:share-whatsapp', opts),

  revealOrderPhotosFolder: () => ipcRenderer.invoke('hub:reveal-order-photos-folder'),

  // Order file attachments (STL, 3MF, G-code, etc.)
  pickAndSaveOrderFile:   (orderId) => ipcRenderer.invoke('hub:pick-and-save-order-file', orderId),
  openOrderFile:          (filename) => ipcRenderer.invoke('hub:open-order-file', filename),
  deleteOrderFile:        (filename) => ipcRenderer.invoke('hub:delete-order-file', filename),
  revealOrderFilesFolder: () => ipcRenderer.invoke('hub:reveal-order-files-folder'),

  // Backups (local)
  writeBackup:        (json) => ipcRenderer.invoke('hub:write-backup', json),
  lastBackupDate:     () => ipcRenderer.invoke('hub:last-backup-date'),
  revealBackupsFolder:() => ipcRenderer.invoke('hub:reveal-backups-folder'),
  listBackups:        () => ipcRenderer.invoke('hub:list-backups'),
  restoreBackup:      (backupPath) => ipcRenderer.invoke('hub:restore-backup', backupPath),

  // iCloud backup (macOS)
  icloudAvailable:    () => ipcRenderer.invoke('hub:icloud-available'),
  writeIcloudBackup:  (json) => ipcRenderer.invoke('hub:write-icloud-backup', json),

  // Safe external URL opener (mailto:, https://)
  openExternal: (url) => ipcRenderer.invoke('hub:open-external', url),

  // Feature 5: Receipt file picker + open file
  pickFile:  (opts) => ipcRenderer.invoke('hub:pick-file', opts),
  openFile:  (filePath) => ipcRenderer.invoke('hub:open-file', filePath),

  // Feature 7: Save HTML to temp file and open
  saveHtml:  (html, filename, opts) => ipcRenderer.invoke('hub:save-html', html, filename, opts),
  encryptionAvailable: () => ipcRenderer.invoke('hub:encryption-available'),

  // Feature 2 (new): File vault
  copyFileToVault: (srcPath, orderId) => ipcRenderer.invoke('hub:copy-file-to-vault', { srcPath, orderId }),
  listVaultFiles:  (orderId) => ipcRenderer.invoke('hub:list-vault-files', orderId),
  deleteVaultFile: (fullPath) => ipcRenderer.invoke('hub:delete-vault-file', fullPath),

  // Feature 8 (new): Status page auto-export
  writeStatusPage: (html, orderId) => ipcRenderer.invoke('hub:write-status-page', { html, orderId }),

  // Task 0: File-based data store (replaces localStorage)
  loadStore:     ()       => ipcRenderer.invoke('hub:load-store'),
  saveStore:     (data)   => ipcRenderer.invoke('hub:save-store', data),
  storeSize:     ()       => ipcRenderer.invoke('hub:store-size'),
  revealStoreFile: ()     => ipcRenderer.invoke('hub:reveal-store-file'),
  clipboardWrite: (text)  => ipcRenderer.invoke('hub:clipboard-write', text),
  saveTextFile: (opts)    => ipcRenderer.invoke('hub:save-text-file', opts),
  requestFullWipe: ()     => ipcRenderer.invoke('hub:request-full-wipe'),
  verifyOperatorPin: (opts) => ipcRenderer.invoke('hub:verify-operator-pin', opts),

  // Feature 1 (new batch): G-code / 3MF metadata extraction
  parsePrintFile: (filePath) => ipcRenderer.invoke('hub:parse-print-file', filePath),

  // Feature 2 (new batch): Live printer API polling
  startPrinterPolling: (machines) => ipcRenderer.invoke('hub:start-printer-polling', machines),
  stopPrinterPolling:  ()         => ipcRenderer.invoke('hub:stop-printer-polling'),
  getPrinterStatus:    ()         => ipcRenderer.invoke('hub:get-printer-status'),
  onPrinterStatusUpdate: (() => {
    // Single persistent listener — swaps the callback instead of stacking listeners
    let _cb = null;
    ipcRenderer.on('printer-status-update', (_e, data) => { if (_cb) _cb(data); });
    return (cb) => { _cb = cb; };
  })(),

  // Feature 5 (new batch): Outbound email notifications
  sendEmail: (opts) => ipcRenderer.invoke('hub:send-email', opts),

  // Round 12: Outbound webhooks
  fireWebhook: (url, event, payload, secret) => ipcRenderer.invoke('hub:fire-webhook', { url, event, payload, secret }),

  // Round 12: Embedded LAN REST API
  startLanServer: (config) => ipcRenderer.invoke('hub:start-lan-server', config),
  stopLanServer:  ()       => ipcRenderer.invoke('hub:stop-lan-server'),
  getLanUrl:      ()       => ipcRenderer.invoke('hub:get-lan-url'),

  // iOS companion: live reload when phone adds a spool or changes an order
  onLanSpoolAdded:      (() => { let _cb=null; ipcRenderer.on('lan-spool-added',      (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onLanSpoolUpdated:    (() => { let _cb=null; ipcRenderer.on('lan-spool-updated',    (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onLanSpoolDeleted:    (() => { let _cb=null; ipcRenderer.on('lan-spool-deleted',    (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onLanOrderUpdated:    (() => { let _cb=null; ipcRenderer.on('lan-order-updated',    (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onLanOrderCreated:    (() => { let _cb=null; ipcRenderer.on('lan-order-created',    (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onLanWaitingUpdated:  (() => { let _cb=null; ipcRenderer.on('lan-waiting-updated',  (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onLanSurveySubmitted: (() => { let _cb=null; ipcRenderer.on('lan-survey-submitted', (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onLanStartFailed:     (() => { let _cb=null; ipcRenderer.on('lan-start-failed',     (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),

  // Printer webhook → Kanban auto-advance
  onLanKanbanAdvanced: (() => { let _cb=null; ipcRenderer.on('lan-kanban-advanced', (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),

  // LAN Tunnel
  startTunnel:  (port, opts = {}) => ipcRenderer.invoke('hub:start-tunnel', { port, acknowledgedRisk: !!opts.acknowledgedRisk }),
  stopTunnel:   ()     => ipcRenderer.invoke('hub:stop-tunnel'),
  getTunnelUrl: ()     => ipcRenderer.invoke('hub:get-tunnel-url'),
  onTunnelStatusChanged: (() => { let _cb=null; ipcRenderer.on('tunnel-status-changed', (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),

  // ZATCA Phase 2
  zatcaGenKeypair:    (opts)  => ipcRenderer.invoke('hub:zatca-gen-keypair', opts),
  zatcaGetPubkey:     ()      => ipcRenderer.invoke('hub:zatca-get-pubkey'),
  zatcaGenCsr:        (opts)  => ipcRenderer.invoke('hub:zatca-gen-csr', opts),
  zatcaSignInvoice:   (opts)  => ipcRenderer.invoke('hub:zatca-sign-invoice', opts),
  zatcaCompliance:    (opts)  => ipcRenderer.invoke('hub:zatca-compliance', opts),
  zatcaProductionCsid:(opts)  => ipcRenderer.invoke('hub:zatca-production-csid', opts),
  zatcaSubmit:        (opts)  => ipcRenderer.invoke('hub:zatca-submit', opts),
  // BNPL Payment Links
  bnplTabby:  (opts) => ipcRenderer.invoke('hub:bnpl-tabby',  opts),
  bnplTamara: (opts) => ipcRenderer.invoke('hub:bnpl-tamara', opts),
  bnplStripe: (opts) => ipcRenderer.invoke('hub:bnpl-stripe', opts),

  // Telegram notifications
  sendTelegram: (opts) => ipcRenderer.invoke('hub:send-telegram', opts),

  // LAN events — intake form submissions
  onLanIntakeSubmitted: (() => { let _cb=null; ipcRenderer.on('lan-intake-submitted', (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),

  // Auto-updater
  setUpdateOptions:     (opts)           => ipcRenderer.invoke('hub:set-update-options', opts),
  checkForUpdates:      ()               => ipcRenderer.invoke('hub:check-for-updates'),
  formatReleaseNotes:   (notes, opts)    => ipcRenderer.invoke('hub:format-release-notes', notes, opts),
  startUpdateDownload:  ()               => ipcRenderer.invoke('hub:start-update-download'),
  // Quit and install; pass null after flushSave() (avoid duplicate encrypt+write on large stores).
  installUpdate:        (storeSnapshot)  => ipcRenderer.invoke('hub:install-update', storeSnapshot),
  // Pre-update backup: pass '__COPY_STORE__' to copy the on-disk store file (fast).
  writeUpdateBackup:    (json, version)  => ipcRenderer.invoke('hub:write-update-backup', json, version),
  onUpdateAvailable:        (() => { let _cb=null; ipcRenderer.on('update-available',         (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onUpdateDownloadProgress: (() => { let _cb=null; ipcRenderer.on('update-download-progress', (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onUpdateDownloaded:       (() => { let _cb=null; ipcRenderer.on('update-downloaded',        (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
  onUpdateError:            (() => { let _cb=null; ipcRenderer.on('update-error',             (_e,d)=>{ if(_cb) _cb(d); }); return cb=>{ _cb=cb; }; })(),
});
