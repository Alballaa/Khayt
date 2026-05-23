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
  saveHtml:  (html, filename) => ipcRenderer.invoke('hub:save-html', html, filename),

  // Task 0: File-based data store (replaces localStorage)
  loadStore:     ()       => ipcRenderer.invoke('hub:load-store'),
  saveStore:     (data)   => ipcRenderer.invoke('hub:save-store', data),
  storeSize:     ()       => ipcRenderer.invoke('hub:store-size'),
  revealStoreFile: ()     => ipcRenderer.invoke('hub:reveal-store-file'),
});
