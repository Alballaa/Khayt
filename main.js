const { app, BrowserWindow, Menu, shell, ipcMain, dialog, safeStorage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { safeJsonParse } = require('./lib/safe-json');
const { isBlockedHost, isAllowedPrinterHost, sanitizeMailgunDomain } = require('./lib/host-guard');
const { sendCustomSmtp } = require('./lib/custom-smtp');
const { normalizeStoreSnapshot } = require('./lib/store-validate');
const { createStoreIo } = require('./lib/store-io');
const { registerZatcaCrypto } = require('./lib/zatca-crypto');
const { wrapHubIpc } = require('./lib/ipc-guard');
const { sanitizeHtmlForFile, redactStatusHtmlClientRow } = require('./lib/status-html');

let mainWindow;
let lanServerStore = {};

/** Only the main app window may invoke privileged hub:* IPC (blocks stray webContents). */
function isTrustedRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return !!(event && event.sender === mainWindow.webContents);
}

wrapHubIpc(ipcMain, isTrustedRenderer);
const {
  encryptStoreField,
  decryptStoreField,
  encryptForDisk,
  maskStoreSecretsForRenderer,
  mergeStoreSecretsFromDisk,
  writeStoreToDisk,
  syncLanServerStoreFromDisk,
  migrateLanApiSecrets,
  ensureLanIntakeToken,
  ensureLanIntakePin,
  ensureLanCalendarToken,
  isEncryptionAvailable,
  persistLanStoreUpdate,
  resolveStoreSecret,
  isStoreSecretMasked,
  dataFilePath,
} = createStoreIo({
  app,
  fs,
  safeStorage,
  safeJsonParse,
  crypto,
  onStoreUpdated(data) { lanServerStore = data; },
});

registerZatcaCrypto({ app, fs, crypto, ipcMain, encryptStoreField, decryptStoreField });

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== 64 || b.length !== 64) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

function appIconPath() {
  const png = path.join(__dirname, 'assets', 'icon_preview.png');
  if (fs.existsSync(png)) return png;
  return undefined;
}

function applyDockIcon() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const icon = appIconPath();
  if (icon) app.dock.setIcon(icon);
}

/* ---------- On-disk locations under app userData ---------- */
function ensureDir(name) {
  const dir = path.join(app.getPath('userData'), name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const productsDir    = () => ensureDir('products');
const orderPhotosDir = () => ensureDir('order-photos');
const orderFilesDir  = () => ensureDir('order-files');
const invoicesDir    = () => ensureDir('invoices');
const backupsDir     = () => ensureDir('backups');

const { registerUpdater } = require('./lib/updater');
const { setupAutoUpdater } = registerUpdater({
  app,
  fs,
  ipcMain,
  BrowserWindow,
  encryptForDisk,
  dataFilePath,
  backupsDir,
});

/* ---------- Shared helpers ---------- */
function decodeDataUrl(dataUrl) {
  const m = /^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Unsupported image format');
  return { ext: m[2] === 'jpg' ? 'jpg' : m[2], buffer: Buffer.from(m[3], 'base64') };
}
async function imageToDataUrl(fullPath) {
  if (!fs.existsSync(fullPath)) return null;
  const buf = await fs.promises.readFile(fullPath);
  const ext = path.extname(fullPath).slice(1).toLowerCase() || 'jpeg';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buf.toString('base64')}`;
}

/* ============================================================
   IPC handlers
   ============================================================ */

// --- QR / version (existing) ---
const PENDING_WIPE_FLAG = '.pending-full-wipe';

function completePendingFullWipe() {
  const userData = app.getPath('userData');
  const flag = path.join(userData, PENDING_WIPE_FLAG);
  if (!fs.existsSync(flag)) return false;
  try {
    fs.unlinkSync(flag);
    for (const entry of fs.readdirSync(userData)) {
      fs.rmSync(path.join(userData, entry), { recursive: true, force: true });
    }
    console.log('Khayt: full data wipe completed on restart');
    return true;
  } catch (e) {
    console.error('completePendingFullWipe failed:', e);
    return false;
  }
}

ipcMain.handle('hub:clipboard-write', async (_e, text) => {
  const s = String(text ?? '').slice(0, 500_000);
  clipboard.writeText(s);
  return { ok: true };
});

ipcMain.handle('hub:save-text-file', async (_e, { content, defaultName } = {}) => {
  const win = BrowserWindow.getFocusedWindow();
  const { filePath, canceled } = await dialog.showSaveDialog(win || undefined, {
    defaultPath: defaultName || 'khayt-recovery.txt',
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  await fs.promises.writeFile(filePath, String(content || ''), 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('hub:request-full-wipe', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { response } = await dialog.showMessageBox(win || undefined, {
    type: 'warning',
    buttons: ['Cancel', 'Delete everything'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Full wipe',
    message: 'Delete ALL Khayt data on this computer?',
    detail: 'Store, photos, invoices, backups, and keys will be removed. The app will restart empty. This cannot be undone.',
  });
  if (response !== 1) return { ok: false, canceled: true };
  const flag = path.join(app.getPath('userData'), PENDING_WIPE_FLAG);
  fs.writeFileSync(flag, new Date().toISOString());
  app.relaunch();
  app.exit(0);
  return { ok: true };
});

ipcMain.handle('hub:generate-qr', async (_e, text, options = {}) => {
  const svgStr = await QRCode.toString(String(text || '').slice(0, 4000), {
    type: 'svg',
    errorCorrectionLevel: options.errorCorrectionLevel || 'M',
    margin: options.margin ?? 1,
    width: options.width || 180,
  });
  // When caller wants a data URL (for <img src=...>) return base64-encoded SVG
  if (options.dataUrl) {
    return 'data:image/svg+xml;base64,' + Buffer.from(svgStr).toString('base64');
  }
  return svgStr;
});
ipcMain.handle('hub:app-version', async () => app.getVersion());

// --- Product images (existing) ---
ipcMain.handle('hub:save-product-image', async (_e, productId, dataUrl) => {
  const { ext, buffer } = decodeDataUrl(dataUrl);
  const safeId = path.basename(String(productId || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeId}.${ext}`;
  await fs.promises.writeFile(path.join(productsDir(), filename), buffer);
  return filename;
});
ipcMain.handle('hub:load-product-image', async (_e, filename) =>
  imageToDataUrl(path.join(productsDir(), path.basename(filename || ''))));
ipcMain.handle('hub:delete-product-image', async (_e, filename) => {
  const full = path.join(productsDir(), path.basename(filename || ''));
  if (filename && fs.existsSync(full)) await fs.promises.unlink(full);
  return true;
});
ipcMain.handle('hub:reveal-products-folder', async () => shell.openPath(productsDir()));

// --- Order print photos (new in 1.3) ---
ipcMain.handle('hub:save-order-photo', async (_e, orderId, idx, dataUrl) => {
  const { ext, buffer } = decodeDataUrl(dataUrl);
  const safeId = path.basename(String(orderId || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeId}-${parseInt(idx,10)||0}-${Date.now().toString(36)}.${ext}`;
  await fs.promises.writeFile(path.join(orderPhotosDir(), filename), buffer);
  return filename;
});
ipcMain.handle('hub:load-order-photo', async (_e, filename) =>
  imageToDataUrl(path.join(orderPhotosDir(), path.basename(filename || ''))));
ipcMain.handle('hub:delete-order-photo', async (_e, filename) => {
  const full = path.join(orderPhotosDir(), path.basename(filename || ''));
  if (filename && fs.existsSync(full)) await fs.promises.unlink(full);
  return true;
});

// --- Order file attachments (STL, 3MF, G-code, etc.) ---
ipcMain.handle('hub:pick-and-save-order-file', async (event, orderId) => {
  const wc = event.sender;
  const win = BrowserWindow.fromWebContents(wc);
  const result = await dialog.showOpenDialog(win, {
    title: 'Attach File',
    filters: [
      { name: '3D Print Files', extensions: ['stl', '3mf', 'obj', 'gcode', 'gco', 'nc'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  const src = result.filePaths[0];
  const originalName = path.basename(src);
  const ext = path.extname(originalName).slice(1).toLowerCase() || 'bin';
  const safeId = path.basename(String(orderId || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeId}-${Date.now().toString(36)}.${ext}`;
  await fs.promises.copyFile(src, path.join(orderFilesDir(), filename));
  const stat = await fs.promises.stat(src);
  return { filename, originalName, size: stat.size };
});

ipcMain.handle('hub:open-order-file', async (_e, filename) => {
  const full = path.join(orderFilesDir(), path.basename(filename || ''));
  if (filename && fs.existsSync(full)) await shell.openPath(full);
  return true;
});

ipcMain.handle('hub:delete-order-file', async (_e, filename) => {
  const full = path.join(orderFilesDir(), path.basename(filename || ''));
  if (filename && fs.existsSync(full)) await fs.promises.unlink(full);
  return true;
});

ipcMain.handle('hub:reveal-order-files-folder', async () => shell.openPath(orderFilesDir()));

// --- PDF export & sharing (new in 1.3) ---
// Pulls the current renderer page as a PDF using Chromium's print pipeline.
// The @media print rules in styles.css hide everything except the invoice area.
ipcMain.handle('hub:export-pdf', async (event, { savePath, askWhere = false, defaultName = 'invoice.pdf' } = {}) => {
  const wc = event.sender;
  const pdfBuffer = await wc.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { top: 0, right: 0, bottom: 0, left: 0 } // CSS @page handles margins
  });
  let finalPath = savePath;
  if (finalPath) {
    const allowed = [
      app.getPath('userData'),
      app.getPath('documents'),
      app.getPath('downloads'),
      app.getPath('desktop'),
    ];
    const resolvedFinal = path.resolve(finalPath);
    if (!allowed.some(d => resolvedFinal.startsWith(path.resolve(d) + path.sep) || resolvedFinal === path.resolve(d))) {
      finalPath = null; // reject the path, fall through to dialog or invoicesDir
    }
  }
  if (askWhere) {
    const win = BrowserWindow.fromWebContents(wc);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return null;
    finalPath = result.filePath;
  }
  if (!finalPath) {
    // Default location: userData/invoices/<safeName>
    const safeName = String(defaultName || 'invoice.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    finalPath = path.join(invoicesDir(), safeName);
  }
  await fs.promises.writeFile(finalPath, pdfBuffer);
  return finalPath;
});

ipcMain.handle('hub:reveal-in-finder', async (_e, filePath) => {
  if (!filePath) return { ok: false };
  const resolved = path.resolve(String(filePath));
  const allowedReveal = [path.resolve(app.getPath('userData'))];
  if (!allowedReveal.some(d => resolved.startsWith(d + path.sep) || resolved === d)) return { ok: false };
  if (fs.existsSync(resolved)) shell.showItemInFolder(resolved);
  return { ok: true };
});

ipcMain.handle('hub:open-path', async (_e, filePath) => {
  if (!filePath) return { ok: false };
  const resolved = path.resolve(String(filePath));
  const allowedOpen = [
    path.resolve(app.getPath('userData')),
    path.resolve(app.getPath('documents')),
    path.resolve(app.getPath('downloads')),
    path.resolve(app.getPath('desktop')),
  ];
  if (!allowedOpen.some(d => resolved.startsWith(d + path.sep) || resolved === d)) return { ok: false };
  if (fs.existsSync(resolved)) shell.openPath(resolved);
  return { ok: true };
});

// Share to WhatsApp. The Web/Desktop WhatsApp wa.me link can't actually
// attach a file via URL params — it only carries text. So we open WhatsApp
// with a pre-filled message AND reveal the PDF in Finder so the user can
// drag it into the conversation.
ipcMain.handle('hub:share-whatsapp', async (_e, { phone, message, pdfPath }) => {
  // Normalize: strip everything but digits. wa.me expects country code.
  const clean = (String(phone || '').replace(/[^\d]/g, ''));
  const text = encodeURIComponent(String(message || '').slice(0, 4096));
  const url = clean ? `https://wa.me/${clean}?text=${text}` : `https://wa.me/?text=${text}`;
  await shell.openExternal(url);
  // Path-confinement: only reveal files inside userData or known download locations
  if (pdfPath) {
    const resolvedPdf = path.resolve(String(pdfPath));
    const allowedPdfDirs = [
      path.resolve(app.getPath('userData')),
      path.resolve(app.getPath('documents')),
      path.resolve(app.getPath('downloads')),
      path.resolve(app.getPath('desktop')),
      path.resolve(app.getPath('temp')),
    ];
    const confined = allowedPdfDirs.some(d => resolvedPdf.startsWith(d + path.sep) || resolvedPdf === d);
    if (confined && fs.existsSync(resolvedPdf)) shell.showItemInFolder(resolvedPdf);
  }
  return true;
});

// --- iCloud Drive backup (new in 1.4) ---
ipcMain.handle('hub:icloud-available', async () => {
  if (process.platform !== 'darwin') return false;
  const icloudBase = path.join(app.getPath('home'), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  return fs.existsSync(icloudBase);
});

ipcMain.handle('hub:write-icloud-backup', async (event, jsonString) => {
  if (!jsonString || typeof jsonString !== 'string' || jsonString.length > 20_000_000) {
    return { ok: false, error: 'Backup data too large or invalid' };
  }
  if (process.platform !== 'darwin') return null;
  const icloudBase = path.join(app.getPath('home'), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  if (!fs.existsSync(icloudBase)) return null;
  const backupDir = path.join(icloudBase, 'Khayt', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const filename = `${new Date().toISOString().split('T')[0]}.json`;
  const fullPath = path.join(backupDir, filename);
  let parsed;
  try { parsed = safeJsonParse(jsonString); } catch (e) { return null; }
  const encrypted = JSON.stringify(encryptForDisk(parsed));
  await fs.promises.writeFile(fullPath, encrypted, 'utf8');
  return fullPath;
});

// --- Daily auto-backup (new in 1.3) ---
ipcMain.handle('hub:write-backup', async (event, jsonString) => {
  if (!jsonString || typeof jsonString !== 'string' || jsonString.length > 20_000_000) {
    return { ok: false, error: 'Backup data too large or invalid' };
  }
  const filename = `${new Date().toISOString().split('T')[0]}.json`;
  const fullPath = path.join(backupsDir(), filename);
  let parsed;
  try { parsed = safeJsonParse(jsonString); } catch (e) { return { ok: false, error: 'Invalid JSON in backup data' }; }
  const encrypted = JSON.stringify(encryptForDisk(parsed));
  await fs.promises.writeFile(fullPath, encrypted, 'utf8');
  // Keep only the most recent 30 backups
  const all = (await fs.promises.readdir(backupsDir())).filter(f => f.endsWith('.json')).sort();
  if (all.length > 30) {
    for (const f of all.slice(0, all.length - 30)) {
      await fs.promises.unlink(path.join(backupsDir(), f)).catch(() => {});
    }
  }
  return fullPath;
});
ipcMain.handle('hub:last-backup-date', async () => {
  const all = (await fs.promises.readdir(backupsDir())).filter(f => f.endsWith('.json')).sort();
  if (all.length === 0) return null;
  return all[all.length - 1].replace('.json', '');
});

// List recent backups (Feature 6)
ipcMain.handle('hub:list-backups', async () => {
  const dir = backupsDir();
  const files = (await fs.promises.readdir(dir)).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 10);
  return Promise.all(files.map(async (f) => {
    const fullPath = path.join(dir, f);
    const stat = await fs.promises.stat(fullPath);
    return { name: f.replace('.json', ''), filename: path.basename(fullPath), mtime: stat.mtimeMs };
  }));
});

// Read a backup file by path (Feature 6)
ipcMain.handle('hub:restore-backup', async (event, backupPath) => {
  const safe = path.join(backupsDir(), path.basename(String(backupPath || '')));
  if (!fs.existsSync(safe)) return null;
  try {
    const content = await fs.promises.readFile(safe, 'utf8');
    const parsed = safeJsonParse(content);
    const decrypted = decryptStoreSecrets(JSON.parse(JSON.stringify(parsed)));
    return JSON.stringify(decrypted);
  } catch (e) {
    console.error('hub:restore-backup error:', e);
    return null;
  }
});
ipcMain.handle('hub:reveal-order-photos-folder', async () => shell.openPath(orderPhotosDir()));
ipcMain.handle('hub:reveal-backups-folder', async () => shell.openPath(backupsDir()));

// --- Receipt file picker (Feature 5) ---
ipcMain.handle('hub:pick-file', async (event, opts = {}) => {
  const wc = event.sender;
  const win = BrowserWindow.fromWebContents(wc);
  const filters = opts.filters || [{ name: 'All Files', extensions: ['*'] }];
  const result = await dialog.showOpenDialog(win, { filters, properties: ['openFile'] });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// --- Open file path — restricted to app userData and system temp directories ---
ipcMain.handle('hub:open-file', async (_e, filePath) => {
  const s = path.resolve(String(filePath || ''));
  const allowed = [
    path.resolve(app.getPath('userData')),
    path.resolve(app.getPath('temp')),
  ];
  const confined = allowed.some(dir => s.startsWith(dir + path.sep) || s === dir);
  if (confined && fs.existsSync(s)) await shell.openPath(s);
  return true;
});

// --- Save HTML to temp and open (Feature 7) ---
ipcMain.handle('hub:save-html', async (_e, html, filename, opts = {}) => {
  const tmpDir = app.getPath('temp');
  const safeName = (String(filename || 'status.html')).replace(/[^a-zA-Z0-9._-]/g, '_');
  const fullPath = path.join(tmpDir, safeName);
  const content = opts?.interactive
    ? String(html || '').replace(/\bhref\s*=\s*["']?\s*javascript:/gi, 'href="blocked:')
    : sanitizeHtmlForFile(html);
  await fs.promises.writeFile(fullPath, content, 'utf8');
  await shell.openPath(fullPath);
  return fullPath;
});

ipcMain.handle('hub:encryption-available', async () => ({
  ok: true,
  available: isEncryptionAvailable(),
}));

// --- Main data store (file-based) ---
// ── One-time keychain explanation ──────────────────────────────────────────
// Shows a native dialog before the OS credential-store permission prompt so
// users understand why macOS/Windows is asking for keychain access.
async function maybeShowKeychainExplanation(win) {
  if (!safeStorage.isEncryptionAvailable()) return;
  const flagPath = path.join(app.getPath('userData'), 'khayt-keychain-ok.flag');
  if (fs.existsSync(flagPath)) return;

  const storeName = process.platform === 'darwin' ? 'macOS Keychain'
                  : process.platform === 'win32'  ? 'Windows Credential Manager'
                  : 'your system keyring';

  try {
    await dialog.showMessageBox(win || undefined, {
      type: 'info',
      title: 'Khayt — Secure Storage',
      message: 'Your API keys are encrypted',
      detail:
        `Khayt encrypts sensitive credentials — ZATCA keys, printer API tokens, ` +
        `payment gateway secrets, and email passwords — using ${storeName}.\n\n` +
        `This is the same secure storage that protects your browser passwords and ` +
        `iCloud data. Nothing is sent to any server.\n\n` +
        `${process.platform === 'darwin'
          ? 'macOS will ask for permission once. Click "Always Allow" so Khayt can read these keys each time it opens.'
          : 'Your OS may ask for permission to access the credential store — please allow it.'}`,
      buttons: ['Allow Secure Access'],
      defaultId: 0,
    });
    fs.writeFileSync(flagPath, '1');
  } catch (e) {
    console.warn('[keychain] explanation dialog failed:', e?.message || e);
    // Do not block store load if the dialog cannot be shown.
  }
}

ipcMain.handle('hub:load-store', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  await maybeShowKeychainExplanation(win);

  const fp = dataFilePath();
  if (!fs.existsSync(fp)) return null;
  try {
    // Guard: reject suspiciously large store files before parsing
    const stat = await fs.promises.stat(fp);
    if (stat.size > 50_000_000) {
      console.error('hub:load-store: store file exceeds 50 MB size limit');
      return { __corrupt: true, error: 'Store file too large' };
    }
    const raw = await fs.promises.readFile(fp, 'utf8');
    // Use safeJsonParse to strip __proto__ / constructor prototype-pollution keys
    const data = safeJsonParse(raw);
    syncLanServerStoreFromDisk();
    const { normalized, warnings, errors } = normalizeStoreSnapshot(data);
    if (errors.length) {
      console.error('hub:load-store: invalid store shape:', errors.join('; '));
      return { __corrupt: true, error: errors[0] || 'Invalid store' };
    }
    if (warnings.length) console.warn('hub:load-store:', warnings.join('; '));
    // Mask secrets — renderer must not receive plaintext credentials
    return maskStoreSecretsForRenderer(normalized || data);
  } catch (e) {
    console.error('hub:load-store error:', e);
    return { __corrupt: true, error: String(e.message || e) };
  }
});

ipcMain.handle('hub:save-store', async (event, data) => {
  const fp = dataFilePath();
  const tmp = fp + '.tmp';
  try {
    const { normalized, errors } = normalizeStoreSnapshot(data);
    if (errors.length) {
      console.error('hub:save-store: invalid store shape:', errors.join('; '));
      return { ok: false, error: errors[0] || 'Invalid store' };
    }
    const merged = mergeStoreSecretsFromDisk(normalized || data);
    const serialized = JSON.stringify(encryptForDisk(merged));
    // Write-side guard: mirror the 50 MB read-side limit from hub:load-store.
    // Prevents runaway data-URL or blob embedding from silently bloating the store.
    if (serialized.length > 50_000_000) {
      console.error('hub:save-store: refusing to write store exceeding 50 MB');
      return { ok: false, error: 'Store too large' };
    }
    await fs.promises.writeFile(tmp, serialized, 'utf8');
    await fs.promises.rename(tmp, fp);
    lanServerStore = merged;  // keep LAN server in sync (plaintext in-memory)
    return { ok: true };
  } catch (e) {
    console.error('hub:save-store error:', e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('hub:store-size', async () => {
  try {
    return fs.statSync(dataFilePath()).size;
  } catch { return 0; }
});

ipcMain.handle('hub:reveal-store-file', async () => {
  const fp = dataFilePath();
  if (fs.existsSync(fp)) shell.showItemInFolder(fp);
  else shell.openPath(path.dirname(fp));
  return true;
});

// --- Feature 2: File vault (per-order 3D files) ---
const fileVaultDir = () => ensureDir('file-vault');
ipcMain.handle('hub:copy-file-to-vault', async (_e, { srcPath, orderId }) => {
  const resolvedSrc = path.resolve(String(srcPath || ''));
  const allowedSrcDirs = [
    app.getPath('userData'),
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('desktop'),
    app.getPath('temp'),
  ];
  if (!allowedSrcDirs.some(d => resolvedSrc.startsWith(path.resolve(d) + path.sep) || resolvedSrc === path.resolve(d))) {
    return { ok: false, error: 'Source path is outside allowed directories' };
  }
  const src = resolvedSrc;
  const safeId = path.basename(String(orderId || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const orderVaultDir = path.join(fileVaultDir(), safeId);
  if (!fs.existsSync(orderVaultDir)) fs.mkdirSync(orderVaultDir, { recursive: true });
  const filename = path.basename(src);
  const destPath = path.join(orderVaultDir, filename);
  fs.copyFileSync(src, destPath);
  const stat = await fs.promises.stat(destPath);
  return { destPath, filename, size: stat.size };
});
ipcMain.handle('hub:list-vault-files', async (_e, orderId) => {
  const safeId = path.basename(String(orderId || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const orderVaultDir = path.join(fileVaultDir(), safeId);
  if (!fs.existsSync(orderVaultDir)) return [];
  const files = await fs.promises.readdir(orderVaultDir);
  return Promise.all(files.map(async (f) => {
    const fullPath = path.join(orderVaultDir, f);
    const stat = await fs.promises.stat(fullPath);
    return { filename: f, fullPath, size: stat.size };
  }));
});
ipcMain.handle('hub:delete-vault-file', async (_e, fullPath) => {
  const safe = path.resolve(String(fullPath || ''));
  const vaultRoot = path.resolve(fileVaultDir());
  // Path-confinement: only allow deletions inside the vault directory
  if (!safe.startsWith(vaultRoot + path.sep)) return false;
  try { await fs.promises.unlink(safe); } catch (_) {}
  return true;
});

// --- Feature 8: Auto-export status page ---
const statusPagesDir = () => ensureDir('status-pages');

async function migrateLegacyStatusPages() {
  const dir = statusPagesDir();
  let files;
  try {
    files = await fs.promises.readdir(dir);
  } catch {
    return;
  }
  for (const name of files) {
    if (!name.startsWith('order-status-') || !name.endsWith('.html')) continue;
    const fullPath = path.join(dir, name);
    try {
      const raw = await fs.promises.readFile(fullPath, 'utf8');
      const next = sanitizeHtmlForFile(redactStatusHtmlClientRow(raw));
      if (next !== raw) await fs.promises.writeFile(fullPath, next, 'utf8');
    } catch (e) {
      console.warn('migrateLegacyStatusPages:', name, e?.message || e);
    }
  }
}

ipcMain.handle('hub:verify-operator-pin', async (_event, { operatorId, pin } = {}) => {
  if (!lanServerStore?.operators?.length) syncLanServerStoreFromDisk();
  const op = (lanServerStore?.operators || []).find(o => o.id === operatorId);
  if (!op) return { ok: false, error: 'operator_not_found' };
  if (!op.pinHash) return { ok: true, noPin: true };
  const hash = crypto.createHash('sha256').update(String(pin || '')).digest('hex');
  if (op.pinHash.length !== 64) return { ok: false, error: 'legacy_pin' };
  return { ok: timingSafeEqualHex(hash, op.pinHash) };
});

ipcMain.handle('hub:write-status-page', async (_event, { html, orderId }) => {
  const safeId = path.basename(String(orderId || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = statusPagesDir();
  const fullPath = path.join(dir, `order-status-${safeId}.html`);
  await fs.promises.writeFile(fullPath, sanitizeHtmlForFile(html), 'utf8');
  return fullPath;
});

const { registerLanServer } = require('./lib/lan-server');
registerLanServer({
  fs,
  ipcMain,
  BrowserWindow,
  safeJsonParse,
  syncLanServerStoreFromDisk,
  resolveStoreSecret,
  isStoreSecretMasked,
  migrateLanApiSecrets,
  ensureLanIntakeToken,
  ensureLanIntakePin,
  ensureLanCalendarToken,
  writeStoreToDisk,
  persistLanStoreUpdate,
  getLanServerStore: () => lanServerStore,
  setLanServerStore(data) { lanServerStore = data; },
  getMainWindow: () => mainWindow,
  statusPagesDir,
  appRoot: __dirname,
});

function isAllowedExternalUrl(s) {
  if (s.startsWith('mailto:')) return true;
  if (s.startsWith('https://')) {
    try { return !isBlockedHost(new URL(s).hostname); } catch { return false; }
  }
  if (s.startsWith('http://')) {
    try {
      const h = new URL(s).hostname;
      if (/^localhost$/i.test(h)) return true;
      const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
      if (v4) {
        const a = +v4[1], b = +v4[2];
        if (a === 127) return true;
        if (a === 10) return true;
        if (a === 192 && b === 168) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
      }
    } catch { return false; }
  }
  return false;
}

// --- Safe external URL opener (mailto, https, private LAN http) ---
ipcMain.handle('hub:open-external', async (_e, url) => {
  const s = String(url || '');
  if (!isAllowedExternalUrl(s)) return { ok: false, error: 'Blocked URL' };
  await shell.openExternal(s);
  return { ok: true };
});

// --- Feature 1 (new batch): G-code / 3MF metadata extraction ---
ipcMain.handle('hub:parse-print-file', async (_e, filePath) => {
  const resolvedParse = path.resolve(String(filePath || ''));
  const allowedParseDirs = [
    app.getPath('userData'),
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('desktop'),
    app.getPath('temp'),
  ];
  if (!allowedParseDirs.some(d => resolvedParse.startsWith(path.resolve(d) + path.sep) || resolvedParse === path.resolve(d))) {
    return { ok: false, error: 'Path outside allowed directories' };
  }
  const result = { printTimeMins: null, filamentGrams: null, filename: path.basename(filePath) };
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.gcode' || ext === '.gco') {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(8192);
      fs.readSync(fd, buf, 0, 8192, 0);
      fs.closeSync(fd);
      const head = buf.toString('utf8');
      // PrusaSlicer / Slic3r
      const prusaTime = head.match(/estimated printing time[^=]*=\s*(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/i);
      if (prusaTime) {
        const d = parseInt(prusaTime[1]||0), h = parseInt(prusaTime[2]||0), m = parseInt(prusaTime[3]||0);
        result.printTimeMins = d*1440 + h*60 + m;
      }
      // Cura: ;TIME:12345 (seconds)
      const curaTime = head.match(/^;TIME:(\d+)/m);
      if (curaTime && !result.printTimeMins) result.printTimeMins = Math.round(parseInt(curaTime[1]) / 60);
      // Bambu Studio
      const bambuTime = head.match(/total estimated time\s*=\s*(?:(\d+)h)?(?:(\d+)m)?/i);
      if (bambuTime && !result.printTimeMins) {
        result.printTimeMins = parseInt(bambuTime[1]||0)*60 + parseInt(bambuTime[2]||0);
      }
      // PrusaSlicer filament grams
      const prusaGrams = head.match(/filament used \[g\]\s*=\s*([\d.]+)/i);
      if (prusaGrams) result.filamentGrams = parseFloat(prusaGrams[1]);
      // Cura FILAMENT_WEIGHT
      const curaGrams = head.match(/FILAMENT_WEIGHT\s*=\s*([\d.]+)/i);
      if (curaGrams && !result.filamentGrams) result.filamentGrams = parseFloat(curaGrams[1]);
    } else if (ext === '.3mf') {
      const mfStat = fs.statSync(resolvedParse);
      if (mfStat.size > 50_000_000) return { ok: false, error: '3MF file too large (max 50 MB)' };
      const buf2 = fs.readFileSync(filePath);
      const content = buf2.toString('latin1');
      const prusaTime2 = content.match(/estimated printing time[^=]*=\s*(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?/i);
      if (prusaTime2) {
        const d = parseInt(prusaTime2[1]||0), h = parseInt(prusaTime2[2]||0), m = parseInt(prusaTime2[3]||0);
        result.printTimeMins = d*1440 + h*60 + m;
      }
      const prusaGrams2 = content.match(/filament used \[g\]\s*=\s*([\d.]+)/i);
      if (prusaGrams2) result.filamentGrams = parseFloat(prusaGrams2[1]);
    }
  } catch(e) { /* silent fail */ }
  return result;
});

// --- Feature 2 (new batch): Printer API polling infrastructure ---
const printerStatusCache = {};
let printerPollInterval = null;

ipcMain.handle('hub:start-printer-polling', async (_e, machines) => {
  if (printerPollInterval) clearInterval(printerPollInterval);
  const machineList = Array.isArray(machines) ? machines : [];
  const poll = async () => {
    for (const machine of machineList) {
      if (!machine.printerApi?.type || machine.printerApi.type === 'none') continue;
      try {
        const status = await fetchPrinterStatus(machine);
        printerStatusCache[machine.id] = { ...status, lastUpdated: Date.now() };
      } catch(e) {
        printerStatusCache[machine.id] = { error: e.message, lastUpdated: Date.now() };
      }
    }
    const wins = BrowserWindow.getAllWindows();
    wins.forEach(w => w.webContents.send('printer-status-update', printerStatusCache));
  };
  await poll();
  printerPollInterval = setInterval(poll, 30000);
  return printerStatusCache;
});

ipcMain.handle('hub:stop-printer-polling', () => {
  if (printerPollInterval) { clearInterval(printerPollInterval); printerPollInterval = null; }
});

ipcMain.handle('hub:get-printer-status', () => printerStatusCache);

async function fetchPrinterStatus(machine) {
  const { type, host, port, apiKey, accessCode, printerSlug } = machine.printerApi || {};
  // Strip any characters that aren't valid in a hostname/IP (prevents URL injection via @, /, etc.)
  const printerHost = String(host || '').replace(/[^a-zA-Z0-9.\-]/g, '');
  if (!isAllowedPrinterHost(printerHost)) {
    return { ok: false, error: 'Invalid printer host' };
  }
  const portNum = parseInt(port || defaultPrinterPort(type), 10);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return { ok: false, error: 'Invalid port number' };
  }
  const baseUrl = `http://${printerHost}:${portNum}`;
  const headers = {};
  if (type === 'octoprint') headers['X-Api-Key'] = apiKey;
  if (type === 'prusalink') headers['X-Api-Key'] = apiKey;
  if (type === 'repetier')  headers['x-api-key']  = apiKey;
  if (type === 'bambu')     headers['Authorization'] = `Bearer ${accessCode}`;

  const get = async (p) => {
    const res = await fetch(`${baseUrl}${p}`, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  if (type === 'octoprint') {
    const [printer, job] = await Promise.all([get('/api/printer'), get('/api/job')]);
    return {
      state: printer.state?.text || 'Unknown',
      progress: job.progress?.completion || 0,
      filename: job.job?.file?.name || '',
      timeRemaining: job.progress?.printTimeLeft || null,
      tempNozzle: printer.temperature?.tool0?.actual || null,
      tempBed: printer.temperature?.bed?.actual || null,
      type: 'octoprint'
    };
  }
  if (type === 'moonraker') {
    const data = await get('/printer/objects/query?print_stats&virtual_sdcard&extruder&heater_bed');
    const ps = data.result?.status?.print_stats || {};
    const vs = data.result?.status?.virtual_sdcard || {};
    return {
      state: ps.state || 'Unknown',
      progress: Math.round((vs.progress || 0) * 100),
      filename: ps.filename || '',
      timeRemaining: ps.total_duration ? Math.round((ps.total_duration / (vs.progress||1)) * (1-(vs.progress||0))) : null,
      tempNozzle: data.result?.status?.extruder?.temperature || null,
      tempBed: data.result?.status?.heater_bed?.temperature || null,
      type: 'moonraker'
    };
  }
  if (type === 'prusalink') {
    const data = await get('/api/v1/status');
    const job = data.job || {};
    return {
      state: data.printer?.state || 'Unknown',
      progress: job.progress || 0,
      filename: job.file?.name || '',
      timeRemaining: job.time_remaining || null,
      tempNozzle: data.printer?.temp_nozzle || null,
      tempBed: data.printer?.temp_bed || null,
      type: 'prusalink'
    };
  }
  if (type === 'bambu') {
    const data = await get('/api/v1/info');
    let jobData = {};
    try { jobData = await get('/api/v1/print'); } catch(e) {}
    return {
      state: jobData.gcode_state || data.dev_product_name || 'Connected',
      progress: jobData.mc_percent || 0,
      filename: jobData.subtask_name || '',
      timeRemaining: jobData.mc_remaining_time ? jobData.mc_remaining_time * 60 : null,
      tempNozzle: jobData.nozzle_temper || null,
      tempBed: jobData.bed_temper || null,
      type: 'bambu'
    };
  }
  if (type === 'duet') {
    try {
      const data = await get('/rr_model?key=&flags=d99fn');
      const job = data.result?.job || {};
      return {
        state: data.result?.state?.status || 'Unknown',
        progress: Math.round((job.filePosition || 0) / (job.file?.size || 1) * 100),
        filename: job.file?.fileName || '',
        timeRemaining: job.timesLeft?.file || null,
        tempNozzle: data.result?.heat?.heaters?.[1]?.current || null,
        tempBed: data.result?.heat?.heaters?.[0]?.current || null,
        type: 'duet'
      };
    } catch(e) {
      const data = await get('/rr_status?type=3');
      return {
        state: data.status || 'Unknown',
        progress: Math.round((data.fractionPrinted || 0) * 100),
        filename: '',
        timeRemaining: null,
        tempNozzle: data.temps?.heads?.current?.[0] || null,
        tempBed: data.temps?.bed?.current || null,
        type: 'duet'
      };
    }
  }
  if (type === 'repetier') {
    const slug = printerSlug || 'default';
    const data = await get(`/printer/api/${encodeURIComponent(slug)}?a=stateList`);
    const state = data.data?.[0] || {};
    return {
      state: state.job ? 'Printing' : 'Idle',
      progress: state.done || 0,
      filename: state.job || '',
      timeRemaining: null,
      tempNozzle: state.extruder?.[0]?.tempRead || null,
      tempBed: state.heated_bed?.tempRead || null,
      type: 'repetier'
    };
  }
  throw new Error(`Unknown printer type: ${type}`);
}

function defaultPrinterPort(type) {
  const ports = { octoprint: 80, moonraker: 7125, bambu: 443, prusalink: 80, duet: 80, repetier: 3344 };
  return ports[type] || 80;
}

// --- Feature 5 (new batch): Outbound email notifications ---
ipcMain.handle('hub:send-email', async (event, { to, subject, body, smtpConfig }) => {
  const cfg = smtpConfig ? { ...smtpConfig } : {};
  cfg.apiKey = resolveStoreSecret(cfg.apiKey, d => d?.settings?.emailConfig?.apiKey);
  if (cfg?.provider === 'sendgrid' && cfg?.apiKey) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: cfg.fromEmail || 'noreply@khayt.app', name: cfg.fromName || 'Khayt' },
          subject,
          content: [{ type: 'text/html', value: body }]
        })
      });
      return { ok: res.ok, status: res.status };
    } catch(e) {
      return { ok: false, error: String(e) };
    }
  }
  if (cfg?.provider === 'mailgun' && cfg?.apiKey && cfg?.domain) {
    try {
      const mgDomain = sanitizeMailgunDomain(cfg.domain);
      if (!mgDomain) return { ok: false, error: 'Invalid Mailgun domain' };
      const formData = new URLSearchParams({
        from: `${cfg.fromName||'Khayt'} <mailgun@${mgDomain}>`,
        to, subject, html: body
      });
      const res = await fetch(`https://api.mailgun.net/v3/${mgDomain}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}` },
        body: formData
      });
      return { ok: res.ok, status: res.status };
    } catch(e) {
      return { ok: false, error: String(e) };
    }
  }
  if (cfg?.provider === 'custom' && cfg?.smtpHost) {
    cfg.smtpPassword = resolveStoreSecret(cfg.smtpPassword, d => d?.settings?.emailConfig?.smtpPassword);
    return sendCustomSmtp({
      host: cfg.smtpHost,
      port: cfg.smtpPort || 587,
      user: cfg.smtpUser || '',
      pass: cfg.smtpPassword || '',
      secure: !!cfg.smtpSecure,
      from: cfg.fromEmail || cfg.smtpUser || 'noreply@khayt.app',
      fromName: cfg.fromName || 'Khayt',
      to,
      subject,
      html: body,
    });
  }
  // Fallback: mailto link
  return { ok: false, fallback: true, mailtoUrl: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
});

// ── Feature R12-1: Outbound Webhooks ────────────────────────────────────────
ipcMain.handle('hub:fire-webhook', async (event, { url, event: webhookEvent, payload, secret }) => {
  // Restrict to https:// only — prevents SSRF to localhost and internal network
  if (!url || !url.startsWith('https://')) return { ok: false, error: 'Invalid URL — only https:// allowed' };
  try {
    const parsedWebhook = new URL(url);
    if (isBlockedHost(parsedWebhook.hostname)) return { ok: false, error: 'Blocked URL — cannot send webhooks to private/loopback addresses' };
  } catch { return { ok: false, error: 'Invalid webhook URL' }; }
  try {
    const body = JSON.stringify({ event: webhookEvent, payload, timestamp: Date.now() });
    const headers = { 'Content-Type': 'application/json', 'X-Khayt-Event': webhookEvent };
    if (secret) headers['X-Khayt-Signature'] = require('crypto')
      .createHmac('sha256', secret).update(body).digest('hex');
    const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, error: 'Webhook redirects are not allowed' };
    }
    return { ok: res.ok, status: res.status };
  } catch(e) { return { ok: false, error: String(e) }; }
});

// ── BNPL: Tabby ──────────────────────────────────────────────────────────────
ipcMain.handle('hub:bnpl-tabby', async (_e, { apiKey, merchantCode, amount, currency, description, buyer, orderId, itemName }) => {
  apiKey = resolveStoreSecret(apiKey, d => d?.settings?.bnpl?.tabby?.apiKey);
  if (!apiKey) return { ok: false, error: 'No API key configured' };
  try {
    const body = {
      payment: {
        amount:      (+amount || 0).toFixed(2),
        currency:    currency  || 'SAR',
        description: String(description || ''),
        buyer: {
          phone: String(buyer?.phone || ''),
          name:  String(buyer?.name  || ''),
          email: String(buyer?.email || ''),
        },
        buyer_history: { registered_since: '2024-01-01T00:00:00Z', loyalty_level: 0 },
        order: {
          reference_id: String(orderId || ''),
          items: [{ title: String(itemName || description || ''), unit_price: (+amount || 0).toFixed(2), qty: 1, category: '3D Printing', reference_id: String(orderId || '') }],
          tax_amount: '0.00', shipping_amount: '0.00',
        },
        meta: { order_id: String(orderId || ''), customer: String(buyer?.name || '') },
      },
      lang: 'en',
      merchant_code: String(merchantCode || ''),
      merchant_urls: {
        success: 'https://khayt.app/success',
        cancel:  'https://khayt.app/cancel',
        failure: 'https://khayt.app/failure',
      },
    };
    const res = await fetch('https://api.tabby.ai/api/v2/checkout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data?.error || JSON.stringify(data) };
    const url = data?.configuration?.available_products?.installments?.[0]?.web_url
             || data?.configuration?.available_products?.pay_now?.[0]?.web_url
             || null;
    return { ok: true, url, checkoutId: data?.id };
  } catch (e) { return { ok: false, error: String(e) }; }
});

// ── BNPL: Tamara ─────────────────────────────────────────────────────────────
ipcMain.handle('hub:bnpl-tamara', async (_e, { apiKey, amount, currency, country, description, buyer, orderId, itemName }) => {
  apiKey = resolveStoreSecret(apiKey, d => d?.settings?.bnpl?.tamara?.apiKey);
  if (!apiKey) return { ok: false, error: 'No API key configured' };
  try {
    const cur = (currency || 'SAR').toUpperCase();
    const body = {
      order_reference_id: String(orderId || ''),
      total_amount:       { amount: (+amount || 0).toFixed(2), currency: cur },
      description:        String(description || itemName || ''),
      country_code:       (country || 'SA').toUpperCase(),
      payment_type:       'PAY_BY_INSTALMENTS',
      instalments:        3,
      items: [{
        name:         String(itemName || description || ''),
        sku:          String(orderId  || ''),
        quantity:     1,
        unit_price:   { amount: (+amount || 0).toFixed(2), currency: cur },
        total_amount: { amount: (+amount || 0).toFixed(2), currency: cur },
        type:         'digital',
      }],
      consumer: {
        email:        String(buyer?.email || ''),
        first_name:   (String(buyer?.name || '')).split(' ')[0]             || '',
        last_name:    (String(buyer?.name || '')).split(' ').slice(1).join(' ') || '',
        phone_number: String(buyer?.phone || ''),
      },
      merchant_url: {
        success:      'https://khayt.app/success',
        failure:      'https://khayt.app/failure',
        cancel:       'https://khayt.app/cancel',
        notification: 'https://khayt.app/notify',
      },
    };
    const res = await fetch('https://api.tamara.co/checkout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data?.message || JSON.stringify(data) };
    return { ok: true, url: data?.checkout_url, checkoutId: data?.checkout_id };
  } catch (e) { return { ok: false, error: String(e) }; }
});

// ── BNPL: Stripe Checkout (supports Klarna/Afterpay/Affirm via dashboard) ────
ipcMain.handle('hub:bnpl-stripe', async (_e, { apiKey, amount, currency, description, successUrl, cancelUrl, customerEmail }) => {
  apiKey = resolveStoreSecret(apiKey, d => d?.settings?.bnpl?.stripe?.apiKey);
  if (!apiKey || !apiKey.startsWith('sk_')) return { ok: false, error: 'Invalid Stripe secret key (must start with sk_)' };
  // Validate redirect URLs — must be https:// and must not point to private/loopback addresses
  const validateStripeRedirectUrl = (u, fallback) => {
    const s = String(u || '');
    if (!s) return fallback;
    if (!s.startsWith('https://')) return fallback;
    try {
      const parsed = new URL(s);
      if (isBlockedHost(parsed.hostname)) return fallback;
      return s;
    } catch { return fallback; }
  };
  const safeSuccessUrl = validateStripeRedirectUrl(successUrl, 'https://khayt.app/success');
  const safeCancelUrl  = validateStripeRedirectUrl(cancelUrl,  'https://khayt.app/cancel');
  try {
    const params = new URLSearchParams({
      'mode':                                         'payment',
      'payment_method_types[]':                       'card',
      'line_items[0][price_data][currency]':          (currency || 'sar').toLowerCase(),
      'line_items[0][price_data][product_data][name]':String(description || 'Order'),
      'line_items[0][price_data][unit_amount]':       String(Math.round((+amount || 0) * 100)),
      'line_items[0][quantity]':                      '1',
      'success_url':                                  safeSuccessUrl,
      'cancel_url':                                   safeCancelUrl,
    });
    if (customerEmail) params.set('customer_email', String(customerEmail));
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data?.error?.message || JSON.stringify(data) };
    return { ok: true, url: data?.url, sessionId: data?.id };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('hub:send-telegram', async (_e, { botToken, chatId, message } = {}) => {
  botToken = resolveStoreSecret(botToken, d => d?.settings?.telegram?.botToken);
  if (!botToken || !chatId || !message) return { ok: false, error: 'Missing params' };
  if (!/^[0-9]+:[A-Za-z0-9_-]+$/.test(botToken)) return { ok: false, error: 'Invalid bot token format' };
  const chatIdStr = String(chatId).replace(/[^0-9@-]/g, '');
  if (isBlockedHost('api.telegram.org')) return { ok: false, error: 'Host is blocked' };
  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  const body = JSON.stringify({ chat_id: chatIdStr, text: message.slice(0, 4096) });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

/* ============================================================
   Window
   ============================================================ */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Khayt',
    icon: appIconPath(),
    backgroundColor: '#0f172a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,       // explicit — guards against accidental removal via build config
      navigateOnDragDrop: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Prevent same-frame navigation away from the local app file.
  // Without this, renderer JS could do location.href = 'https://evil.com' and retain
  // full access to the contextBridge-exposed hubAPI under a foreign origin.
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      try {
        const parsed = new URL(url);
        if (!isBlockedHost(parsed.hostname)) shell.openExternal(url);
      } catch { /* invalid URL — deny */ }
    } else if (url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// Block navigation and new-window creation for any web contents spawned after startup.
app.on('web-contents-created', (_event, wc) => {
  wc.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
});

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' }, { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    { label: 'File', submenu: [ isMac ? { role: 'close' } : { role: 'quit' } ] },
    {
      label: 'Edit', submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View', submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window', submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [ { type: 'separator' }, { role: 'front' } ] : [ { role: 'close' } ])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  completePendingFullWipe();
  applyDockIcon();
  buildMenu();
  createWindow();
  migrateLegacyStatusPages().catch((e) => console.warn('status page migration:', e?.message || e));
  setupAutoUpdater(mainWindow);

  const { session } = require('electron');

  // ── Content Security Policy ───────────────────────────────────────────────
  // Applied to every response served to the renderer. Tightens XSS impact:
  //   • script-src 'self'  — only scripts bundled with the app; no inline eval
  //   • connect-src 'self' + external APIs the app legitimately calls
  //   • object-src 'none'  — no Flash / plugin execution
  //   • base-uri 'none'    — prevents <base href="…"> attacks
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",  // Renderer uses data-act delegation; exported LAN/survey HTML may use inline scripts outside this CSP
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",  // keep in sync with renderer/index.html meta CSP
            "img-src 'self' data: blob:",
            "font-src 'self' data: https://fonts.gstatic.com",
            "connect-src 'self' https://api.telegram.org https://api.sendgrid.com https://api.mailgun.net https://api.tabby.ai https://api.tamara.co https://api.stripe.com https://gw-fatoorah.zatca.gov.sa https://gw-apic-gov.gazt.gov.sa",
            "media-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join('; ')
        ]
      }
    });
  });

  // Grant camera access so the filament label scanner can use getUserMedia
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'camera', 'microphone'];
    callback(allowed.includes(permission));
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
