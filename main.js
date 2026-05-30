const { app, BrowserWindow, Menu, shell, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { safeJsonParse } = require('./lib/safe-json');
const { isBlockedHost } = require('./lib/host-guard');
const { normalizeStoreSnapshot } = require('./lib/store-validate');
const { buildZatcaCsrDer } = require('./lib/zatca-asn1');
const { createStoreIo } = require('./lib/store-io');

let lanServerStore = {};
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
  persistLanStoreUpdate,
  resolveStoreSecret,
  dataFilePath,
} = createStoreIo({
  app,
  fs,
  safeStorage,
  safeJsonParse,
  crypto,
  onStoreUpdated(data) { lanServerStore = data; },
});

const zatcaKeyPath = () => path.join(app.getPath('userData'), 'zatca-keypair.enc');

function parseRequestCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return [part.trim(), ''];
    return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
  }).filter(([k]) => k));
}


let mainWindow;

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
function lanEscapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function safeTokenEqual(a, b) {
  if (!a || !b) return false;
  try {
    const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

function normalizePrinterEvent(body) {
  // OctoPrint Webhooks plugin format
  if (typeof body.topic === 'string') {
    const t = body.topic.toLowerCase();
    if (t.includes('done') || t.includes('finished') || t.includes('complete')) return 'print_done';
    if (t.includes('started') || t.includes('start')) return 'print_started';
    if (t.includes('cancel') || t.includes('fail') || t.includes('error')) return 'print_cancelled';
  }
  // Moonraker / generic event field
  if (typeof body.event === 'string') {
    const e = body.event.toLowerCase();
    if (e.includes('done') || e.includes('complete') || e.includes('finish')) return 'print_done';
    if (e.includes('start')) return 'print_started';
    if (e.includes('cancel') || e.includes('fail') || e.includes('error')) return 'print_cancelled';
    return body.event; // pass through
  }
  // Moonraker state field
  if (typeof body.state === 'string') {
    const s = body.state.toLowerCase();
    if (s === 'complete' || s === 'completed' || s === 'standby') return 'print_done';
    if (s === 'printing') return 'print_started';
    if (s === 'cancelled' || s === 'error') return 'print_cancelled';
  }
  return null;
}

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
ipcMain.handle('hub:generate-qr', async (_e, text, options = {}) => QRCode.toString(String(text || ''), {
  type: 'svg',
  errorCorrectionLevel: options.errorCorrectionLevel || 'M',
  margin: options.margin ?? 1,
  width: options.width || 180
}));
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

ipcMain.handle('hub:write-icloud-backup', async (_e, jsonString) => {
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
  try { parsed = JSON.parse(jsonString); } catch(e) { return null; }
  const encrypted = JSON.stringify(encryptForDisk(parsed));
  await fs.promises.writeFile(fullPath, encrypted, 'utf8');
  return fullPath;
});

// --- Daily auto-backup (new in 1.3) ---
ipcMain.handle('hub:write-backup', async (_e, jsonString) => {
  if (!jsonString || typeof jsonString !== 'string' || jsonString.length > 20_000_000) {
    return { ok: false, error: 'Backup data too large or invalid' };
  }
  const filename = `${new Date().toISOString().split('T')[0]}.json`;
  const fullPath = path.join(backupsDir(), filename);
  let parsed;
  try { parsed = JSON.parse(jsonString); } catch(e) { return { ok: false, error: 'Invalid JSON in backup data' }; }
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
ipcMain.handle('hub:restore-backup', async (_e, backupPath) => {
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

// Strip <script> blocks and inline event handlers before writing any HTML to disk.
// Defense-in-depth: renderer already escapes user data, but this prevents XSS if
// a future escaping gap lets malicious content reach the template.
function sanitizeHtmlForFile(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*/gi, '')
    .replace(/\bon\w+\s*=/gi, 'data-removed=');
}

// --- Save HTML to temp and open (Feature 7) ---
ipcMain.handle('hub:save-html', async (_e, html, filename) => {
  const tmpDir = app.getPath('temp');
  const safeName = (String(filename || 'status.html')).replace(/[^a-zA-Z0-9._-]/g, '_');
  const fullPath = path.join(tmpDir, safeName);
  await fs.promises.writeFile(fullPath, sanitizeHtmlForFile(html), 'utf8');
  await shell.openPath(fullPath);
  return fullPath;
});

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

  await dialog.showMessageBox(win, {
    type: 'information',
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
    icon: undefined,
  });

  fs.writeFileSync(flagPath, '1');
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

ipcMain.handle('hub:save-store', async (_e, data) => {
  const fp = dataFilePath();
  const tmp = fp + '.tmp';
  try {
    const merged = mergeStoreSecretsFromDisk(data);
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
ipcMain.handle('hub:write-status-page', async (_e, { html, orderId }) => {
  const safeId = path.basename(String(orderId || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = statusPagesDir();
  const fullPath = path.join(dir, `${safeId}.html`);
  await fs.promises.writeFile(fullPath, sanitizeHtmlForFile(html), 'utf8');
  return fullPath;
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
  if (isBlockedHost(printerHost)) {
    return { ok: false, error: 'Blocked host — cannot connect to loopback or private addresses' };
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
ipcMain.handle('hub:send-email', async (_e, { to, subject, body, smtpConfig }) => {
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
      const formData = new URLSearchParams({
        from: `${cfg.fromName||'Khayt'} <mailgun@${cfg.domain}>`,
        to, subject, html: body
      });
      const res = await fetch(`https://api.mailgun.net/v3/${cfg.domain}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}` },
        body: formData
      });
      return { ok: res.ok, status: res.status };
    } catch(e) {
      return { ok: false, error: String(e) };
    }
  }
  // Fallback: mailto link
  return { ok: false, fallback: true, mailtoUrl: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
});

// ── Feature R12-1: Outbound Webhooks ────────────────────────────────────────
ipcMain.handle('hub:fire-webhook', async (_e, { url, event, payload, secret }) => {
  // Restrict to https:// only — prevents SSRF to localhost and internal network
  if (!url || !url.startsWith('https://')) return { ok: false, error: 'Invalid URL — only https:// allowed' };
  try {
    const parsedWebhook = new URL(url);
    if (isBlockedHost(parsedWebhook.hostname)) return { ok: false, error: 'Blocked URL — cannot send webhooks to private/loopback addresses' };
  } catch { return { ok: false, error: 'Invalid webhook URL' }; }
  try {
    const body = JSON.stringify({ event, payload, timestamp: Date.now() });
    const headers = { 'Content-Type': 'application/json', 'X-Khayt-Event': event };
    if (secret) headers['X-Khayt-Signature'] = require('crypto')
      .createHmac('sha256', secret).update(body).digest('hex');
    const res = await fetch(url, { method: 'POST', headers, body });
    return { ok: res.ok, status: res.status };
  } catch(e) { return { ok: false, error: String(e) }; }
});

// ── ZATCA Phase 2 — IPC handlers ────────────────────────────────────────────

ipcMain.handle('hub:zatca-gen-keypair', async () => {
  try {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pubPem  = publicKey.export({ type: 'spki',  format: 'pem' });
    const stored  = JSON.stringify({ privateKey: encryptStoreField(privPem), publicKey: pubPem });
    await fs.promises.writeFile(zatcaKeyPath(), stored, 'utf8');
    return { ok: true, publicKey: pubPem };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('hub:zatca-get-pubkey', async () => {
  try {
    if (!fs.existsSync(zatcaKeyPath())) return { ok: false };
    const d = JSON.parse(fs.readFileSync(zatcaKeyPath(), 'utf8'));
    return { ok: true, publicKey: d.publicKey };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('hub:zatca-gen-csr', async (_e, { cn, org, vat, invoiceType = '1100', location = 'Riyadh', industry = '3D Printing' } = {}) => {
  try {
    if (!fs.existsSync(zatcaKeyPath())) return { ok: false, error: 'No key pair — generate keys first' };
    const d = JSON.parse(fs.readFileSync(zatcaKeyPath(), 'utf8'));
    const privPem    = decryptStoreField(d.privateKey);
    const privateKey = crypto.createPrivateKey(privPem);
    const publicKey  = crypto.createPublicKey(privateKey);
    const pubDer     = publicKey.export({ type: 'spki', format: 'der' });
    const csrDer     = buildZatcaCsrDer({ privateKey, pubDer, cn, org, vat, invoiceType, location, industry });
    const csrB64     = csrDer.toString('base64');
    const lines      = csrB64.match(/.{1,64}/g).join('\n');
    const csrPem     = `-----BEGIN CERTIFICATE REQUEST-----\n${lines}\n-----END CERTIFICATE REQUEST-----`;
    return { ok: true, csr: csrPem, csrBase64: csrB64 };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('hub:zatca-sign-invoice', async (_e, { canonicalData }) => {
  try {
    if (!fs.existsSync(zatcaKeyPath())) return { ok: false, error: 'No key pair' };
    const d = JSON.parse(fs.readFileSync(zatcaKeyPath(), 'utf8'));
    const privPem    = decryptStoreField(d.privateKey);
    const privateKey = crypto.createPrivateKey(privPem);
    const hash       = crypto.createHash('SHA256').update(String(canonicalData)).digest();
    const signer     = crypto.createSign('SHA256');
    signer.update(hash);
    const sig = signer.sign(privateKey);
    return { ok: true, hashBase64: hash.toString('base64'), signatureBase64: sig.toString('base64'), publicKey: d.publicKey };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('hub:zatca-compliance', async (_e, { csrBase64, otp, environment = 'sandbox' }) => {
  const base = environment === 'production'
    ? 'https://gw-fatoorah.zatca.gov.sa/e-invoicing/core'
    : 'https://gw-apic-gov.gazt.gov.sa/e-invoicing/developer-portal';
  try {
    const res = await fetch(`${base}/compliance`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Accept-Version': 'V2', 'Accept-Language': 'en', 'Content-Type': 'application/json', 'OTP': String(otp || '') },
      body: JSON.stringify({ csr: csrBase64 }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.binarySecurityToken) {
      return { ok: true, csid: `${body.binarySecurityToken}:${body.secret}`, requestId: body.requestId };
    }
    return { ok: false, status: res.status, body };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('hub:zatca-production-csid', async (_e, { csid, environment = 'sandbox' }) => {
  const base = environment === 'production'
    ? 'https://gw-fatoorah.zatca.gov.sa/e-invoicing/core'
    : 'https://gw-apic-gov.gazt.gov.sa/e-invoicing/developer-portal';
  try {
    const res = await fetch(`${base}/production/csids`, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Accept-Version': 'V2', 'Accept-Language': 'en', 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(csid).toString('base64')}` },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.binarySecurityToken) {
      return { ok: true, pcsid: `${body.binarySecurityToken}:${body.secret}` };
    }
    return { ok: false, status: res.status, body };
  } catch (e) { return { ok: false, error: String(e) }; }
});

ipcMain.handle('hub:zatca-submit', async (_e, { xmlBase64, invoiceHash, uuid, invoiceNumber, invoiceType = 'simplified', environment = 'sandbox', pcsid, csid }) => {
  const base = environment === 'production'
    ? 'https://gw-fatoorah.zatca.gov.sa/e-invoicing/core'
    : 'https://gw-apic-gov.gazt.gov.sa/e-invoicing/developer-portal';
  const cred = pcsid || csid;
  if (!cred) return { ok: false, error: 'No CSID configured' };
  const apiPath = invoiceType === 'standard' ? '/invoices/clearance/single' : '/invoices/reporting/single';
  try {
    const res = await fetch(`${base}${apiPath}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json', 'Accept-Version': 'V2', 'Accept-Language': 'en',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(cred).toString('base64')}`,
        'Clearance-Status': '1',
      },
      body: JSON.stringify({ invoiceHash, uuid, invoice: xmlBase64 }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  } catch (e) { return { ok: false, error: String(e) }; }
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

// ── LAN Tunnel (localtunnel) ─────────────────────────────────────────────────
let _tunnelInstance = null;

ipcMain.handle('hub:start-tunnel', async (_e, port) => {
  syncLanServerStoreFromDisk();
  const lanPin = resolveStoreSecret(lanServerStore?.settings?.lanApi?.pin, d => d?.settings?.lanApi?.pin);
  if (!lanPin) return { ok: false, error: 'Configure a LAN PIN before enabling remote tunnel' };
  if (_tunnelInstance) {
    try { _tunnelInstance.close(); } catch {}
    _tunnelInstance = null;
  }
  syncLanServerStoreFromDisk();
  const ownerPin = lanServerStore?.settings?.lanApi?.pin || '';
  if (!ownerPin || isStoreSecretMasked(ownerPin)) {
    return { ok: false, error: 'Set an owner LAN PIN before enabling the remote tunnel' };
  }
  if (!lanServer) {
    return { ok: false, error: 'Start the LAN server before enabling the tunnel' };
  }
  const portNum = parseInt(port, 10) || (lanServer?.address?.()?.port) || 3219;
  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({ port: portNum });
    _tunnelInstance = tunnel;
    tunnel.on('error', (err) => {
      _tunnelInstance = null;
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('tunnel-status-changed', { active: false, error: String(err) });
    });
    tunnel.on('close', () => {
      _tunnelInstance = null;
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('tunnel-status-changed', { active: false });
    });
    return { ok: true, url: tunnel.url };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('hub:stop-tunnel', async () => {
  if (_tunnelInstance) {
    try { _tunnelInstance.close(); } catch {}
    _tunnelInstance = null;
  }
  return { ok: true };
});

ipcMain.handle('hub:get-tunnel-url', async () => {
  if (!_tunnelInstance) return { ok: false };
  return { ok: true, url: _tunnelInstance.url };
});

// ── Feature R12-7: Embedded LAN REST API ────────────────────────────────────
let lanServer = null;
// lanServerStore: in-memory plaintext store (see createStoreIo onStoreUpdated at top)

ipcMain.handle('hub:start-lan-server', async (_e, { port = 3219, pin = '', bindLan = 'loopback' } = {}) => {
  const portNum = parseInt(port, 10);
  if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
    return { ok: false, error: 'Invalid port number (must be 1024–65535)' };
  }
  port = portNum;
  syncLanServerStoreFromDisk();
  if (!lanServerStore || !Object.keys(lanServerStore).length) lanServerStore = {};
  migrateLanApiSecrets(lanServerStore);
  const storedPin = lanServerStore?.settings?.lanApi?.pin || '';
  if (!pin || isStoreSecretMasked(pin)) pin = storedPin;
  pin = String(pin || '').slice(0, 256); // cap PIN length to prevent DoS via giant string comparisons
  let intakeTokenGenerated = false;
  let intakePinGenerated = false;
  try {
    const tokResult = ensureLanIntakeToken(lanServerStore);
    if (tokResult.generated) intakeTokenGenerated = true;
    const pinResult = ensureLanIntakePin(lanServerStore);
    if (pinResult.generated) intakePinGenerated = true;
    if (intakeTokenGenerated || intakePinGenerated) await writeStoreToDisk(lanServerStore);
  } catch (e) {
    console.error('ensureLanIntakeToken/ensureLanIntakePin failed:', e);
  }
  const bindHost = (bindLan === 'lan' || bindLan === 'all') ? '0.0.0.0' : '127.0.0.1';
  if (lanServer) { lanServer.close(); lanServer = null; }
  // Brute-force tracking: { ip -> { count, resetAt } }
  const failedAttempts = new Map();
  const intakePinAttempts = new Map();
  const intakeSubmitAttempts = new Map();
  const INTAKE_SUBMIT_LIMIT = 20;
  const INTAKE_SUBMIT_WINDOW_MS = 60 * 60 * 1000;
  const intakeSessions = new Map();
  const INTAKE_COOKIE = 'khayt_intake';
  const INTAKE_SESSION_MS = 4 * 60 * 60 * 1000;
  const LOCKOUT_MS = 60_000;     // 1-minute lockout after 10 failures
  const MAX_BODY   = 1_048_576; // 1 MB body limit
  return new Promise(resolve => {
    try {
      lanServer = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const ip = req.socket.remoteAddress || '';
        const isWriteRequest = req.method !== 'GET' && req.method !== 'HEAD';
        const pathname = url.pathname.replace(/\/$/, '');

        // Routes that are always public regardless of PIN configuration.
        // NOTE: /order/:id POST (quote approval) is intentionally excluded so that
        // unauthenticated write access cannot transition order state.  GET is public
        // (customer-facing tracking page) but POST requires a PIN when one is set.
        const isIntakePublicGet = pathname === '/intake' && req.method === 'GET';
        const isIntakeSessionPost = pathname === '/api/intake/session' && req.method === 'POST';
        const isIntakeSubmitPost = pathname === '/api/intake' && req.method === 'POST';
        const isAlwaysPublic = pathname === '/api/status' || pathname.startsWith('/status/') ||
          (pathname.startsWith('/order/') && req.method === 'GET') ||
          pathname === '/manifest.json' || pathname === '/sw.js' ||
          pathname === '/icon-192.png' || pathname === '/icon-512.png' ||
          pathname.startsWith('/api/webhook/printer/') ||
          (pathname === '/calendar.ics' && !pin) ||
          pathname === '/api/webhook/salla' ||
          pathname === '/api/webhook/zid';
        const isSurveyEndpoint = pathname === '/api/survey' && req.method === 'POST';
        const requirePin = isWriteRequest && !isSurveyEndpoint && !isAlwaysPublic && !isIntakeSessionPost && !isIntakeSubmitPost;
        if (!isAlwaysPublic && !isIntakePublicGet && !isIntakeSessionPost && !isIntakeSubmitPost && (requirePin || (pin && !isSurveyEndpoint))) {
          const provided = (url.searchParams.get('pin') || req.headers['x-khayt-pin'] || '').trim();
          if (!pin) {
            // No PIN configured — block all write requests (survey is exempt via isSurveyEndpoint)
            if (isWriteRequest) {
              res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Write requests require a PIN to be configured in settings' }));
              return;
            }
          } else {
            // Brute-force lockout check
            const now = Date.now();
            const ipData = failedAttempts.get(ip) || { count: 0, resetAt: 0 };
            if (now < ipData.resetAt && ipData.count >= 10) {
              res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
              return;
            }
            if (!safeTokenEqual(provided, pin)) {
              const newCount = (now >= ipData.resetAt ? 0 : ipData.count) + 1;
              failedAttempts.set(ip, { count: newCount, resetAt: newCount >= 10 ? now + LOCKOUT_MS : ipData.resetAt });
              res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Unauthorized' }));
              return;
            }
            failedAttempts.delete(ip); // reset on success
          }
        }
        const store = lanServerStore;
        // H4: restrict CORS — sensitive API routes get no wildcard
        const reqOrigin = req.headers['origin'] || null;
        const isPublicRoute = isAlwaysPublic;
        if (isPublicRoute) {
          res.setHeader('Access-Control-Allow-Origin', '*');
        } else if (!reqOrigin || reqOrigin.startsWith('http://')) {
          // Electron renderer (no origin) or same-LAN http:// origin — allow
          res.setHeader('Access-Control-Allow-Origin', reqOrigin || 'null');
        }
        if (!isIntakePublicGet) res.setHeader('Content-Type', 'application/json');

        // H3: helper to enforce PIN for sensitive GET routes
        const getIntakePin = () => lanServerStore?.settings?.lanApi?.intakePin || '';
        const getIntakeToken = () => lanServerStore?.settings?.lanApi?.intakeToken || '';
        const checkIntakeSubmitRate = () => {
          const now = Date.now();
          const rec = intakeSubmitAttempts.get(ip) || { count: 0, resetAt: now + INTAKE_SUBMIT_WINDOW_MS };
          if (now >= rec.resetAt) { rec.count = 0; rec.resetAt = now + INTAKE_SUBMIT_WINDOW_MS; }
          if (rec.count >= INTAKE_SUBMIT_LIMIT) return false;
          rec.count += 1;
          intakeSubmitAttempts.set(ip, rec);
          return true;
        };
        const validateIntakeSession = (token) => {
          const sess = intakeSessions.get(token);
          if (!sess) return false;
          if (Date.now() - sess.created > INTAKE_SESSION_MS) {
            intakeSessions.delete(token);
            return false;
          }
          return true;
        };
        const hasIntakeSession = (request) => {
          const cookies = parseRequestCookies(request);
          const token = cookies[INTAKE_COOKIE];
          return token && validateIntakeSession(token);
        };
        const checkIntakePost = (request) => {
          if (hasIntakeSession(request)) return true;
          const intakeTok = getIntakeToken();
          const providedPin = (url.searchParams.get('pin') || request.headers['x-khayt-pin'] || '').trim();
          const providedIntake = (request.headers['x-khayt-intake-token'] || '').trim();
          if (pin && safeTokenEqual(providedPin, pin)) return true;
          if (intakeTok && providedIntake && safeTokenEqual(providedIntake, intakeTok)) return true;
          return false;
        };
        const intakeSharedStyles = '*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;min-height:100vh;padding:24px 16px}.container{max-width:520px;margin:0 auto}.header{text-align:center;margin-bottom:28px}.header h1{font-size:1.5rem;font-weight:700;color:#f1f5f9;margin-bottom:4px}.header p{color:#94a3b8;font-size:.9rem}.card{background:#1e293b;border-radius:16px;padding:24px;margin-bottom:16px}.form-group{margin-bottom:16px}label{display:block;font-size:.8rem;font-weight:600;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}input,textarea,select{width:100%;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:10px 12px;font-size:.9rem;outline:none;transition:border-color .2s}input:focus,textarea:focus,select:focus{border-color:#6366f1}textarea{resize:vertical;min-height:100px}select option{background:#1e293b}.req{color:#f87171}button[type=submit]{width:100%;background:#6366f1;color:#fff;border:none;border-radius:10px;padding:13px;font-size:1rem;font-weight:600;cursor:pointer;transition:background .2s}button[type=submit]:hover{background:#4f46e5}button[type=submit]:disabled{background:#334155;cursor:not-allowed}.thankyou{display:none;text-align:center;padding:40px 24px}.thankyou h2{font-size:1.3rem;color:#6366f1;margin-bottom:12px}.thankyou p{color:#94a3b8;line-height:1.6}.error-msg{color:#f87171;font-size:.8rem;margin-top:6px;display:none}';
        const renderIntakePinPage = (shopName) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Intake Access — ${shopName}</title><style>${intakeSharedStyles}</style></head><body><div class="container"><div class="header"><h1>${shopName}</h1><p>Enter your intake PIN to submit an order request</p></div><div class="card"><form id="pinForm"><div class="form-group"><label>Intake PIN <span class="req">*</span></label><input type="password" name="pin" required maxlength="256" autocomplete="current-password" placeholder="Intake PIN from the shop"></div><div class="error-msg" id="errMsg">Invalid PIN. Please try again.</div><button type="submit">Continue</button></form></div></div><script>document.getElementById('pinForm').addEventListener('submit',async function(e){e.preventDefault();const btn=this.querySelector('button[type=submit]');const err=document.getElementById('errMsg');err.style.display='none';btn.disabled=true;btn.textContent='Checking…';const pin=this.querySelector('[name=pin]').value;try{const r=await fetch('/api/intake/session',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})});if(r.ok){location.href='/intake';return;}err.style.display='block';btn.disabled=false;btn.textContent='Continue';}catch(ex){err.textContent='Network error. Please try again.';err.style.display='block';btn.disabled=false;btn.textContent='Continue';}});<\/script></body></html>`;
        const renderIntakeFormPage = (shopName) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Intake — ${shopName}</title><style>${intakeSharedStyles}</style></head><body><div class="container"><div class="header"><h1>${shopName}</h1><p>Submit a new order request</p></div><div class="card"><form id="intakeForm"><div class="form-group"><label>Name <span class="req">*</span></label><input type="text" name="name" required maxlength="200" placeholder="Your full name"></div><div class="form-group"><label>Email</label><input type="email" name="email" maxlength="500" placeholder="your@email.com"></div><div class="form-group"><label>Phone</label><input type="tel" name="phone" maxlength="500" placeholder="+966 5x xxx xxxx"></div><div class="form-group"><label>Project Description <span class="req">*</span></label><textarea name="description" required maxlength="2000" placeholder="Describe your 3D printing project in detail..."></textarea></div><div class="form-group"><label>Reference / Link</label><input type="url" name="referenceLink" maxlength="500" placeholder="https://..."></div><div class="form-group"><label>Preferred Material</label><input type="text" name="material" maxlength="500" placeholder="e.g. PLA, PETG, Resin"></div><div class="form-group"><label>Budget Range</label><select name="budget"><option value="">— Select —</option><option value="&lt;100">Less than 100 SAR</option><option value="100-500">100 – 500 SAR</option><option value="500-1000">500 – 1,000 SAR</option><option value="1000+">1,000+ SAR</option></select></div><div class="form-group"><label>Preferred Due Date</label><input type="date" name="dueDate" maxlength="500"></div><div class="error-msg" id="errMsg">An error occurred. Please try again.</div><button type="submit">Submit Request</button></form><div class="thankyou" id="thankYou"><h2>Thank you!</h2><p>Your request has been received. We'll get back to you as soon as possible.</p></div></div></div><script>document.getElementById('intakeForm').addEventListener('submit',async function(e){e.preventDefault();const btn=this.querySelector('button[type=submit]');const err=document.getElementById('errMsg');err.style.display='none';btn.disabled=true;btn.textContent='Submitting…';const data={};new FormData(this).forEach((v,k)=>{if(v)data[k]=v;});try{const r=await fetch('/api/intake',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(r.ok){this.style.display='none';document.getElementById('thankYou').style.display='block';}else{const j=await r.json().catch(()=>({}));err.textContent=j.error||'Submission failed.';err.style.display='block';btn.disabled=false;btn.textContent='Submit Request';}}catch(ex){err.textContent='Network error. Please try again.';err.style.display='block';btn.disabled=false;btn.textContent='Submit Request';}});<\/script></body></html>`;
        const checkPinForGet = () => {
          if (!pin) return false; // owner/queue data requires a configured PIN
          const provided = (url.searchParams.get('pin') || req.headers['x-khayt-pin'] || '').trim();
          const now = Date.now();
          const ipData = failedAttempts.get(ip) || { count: 0, resetAt: 0 };
          if (now < ipData.resetAt && ipData.count >= 10) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
            return false;
          }
          if (!safeTokenEqual(provided, pin)) {
            const newCount = (now >= ipData.resetAt ? 0 : ipData.count) + 1;
            failedAttempts.set(ip, { count: newCount, resetAt: newCount >= 10 ? now + LOCKOUT_MS : ipData.resetAt });
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return false;
          }
          failedAttempts.delete(ip);
          return true;
        };

        if (pathname === '/api/status') {
          const queue = (store.printLog || []).filter(o => o.status !== 'completed');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            queued: queue.length,
            pending:    queue.filter(o => o.status === 'pending').length,
            printing:   queue.filter(o => o.status === 'printing').length,
            post:       queue.filter(o => o.status === 'post').length,
            qc:         queue.filter(o => o.status === 'qc').length,
            completed_today: (store.printLog || []).filter(o => o.completedAt &&
              o.completedAt.startsWith(new Date().toISOString().split('T')[0])).length
          }));
        } else if (pathname === '/api/orders') {
          if (!checkPinForGet()) return;
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
          const status = url.searchParams.get('status');
          let orders = store.printLog || [];
          if (status) orders = orders.filter(o => o.status === status);
          orders = orders.slice(0, limit);
          res.writeHead(200);
          res.end(JSON.stringify(orders.map(o => ({
            id: o.id, project: o.project, client: o.client, status: o.status,
            material: o.material, price: o.price, dueDate: o.dueDate, date: o.date,
            paymentStatus: o.paymentStatus
          }))));
        } else if (pathname === '/api/queue') {
          // Owner data (client + project names): require PIN when one is configured.
          if (!checkPinForGet()) return;
          const queue = (store.printLog || []).filter(o =>
            ['pending','printing','post','qc'].includes(o.status));
          res.writeHead(200);
          res.end(JSON.stringify(queue.map(o => ({
            id: o.id, project: o.project, client: o.client, status: o.status,
            machine: o.machine, dueDate: o.dueDate, priority: o.priority
          }))));
        } else if (pathname === '/api/machines') {
          // Owner data (machine names): require PIN when one is configured.
          if (!checkPinForGet()) return;
          res.writeHead(200);
          res.end(JSON.stringify((store.machines || []).map(m => ({
            id: m.id, name: m.name, type: m.type, status: m.status
          }))));

        // ── iOS companion: inventory ────────────────────────────
        } else if (pathname === '/api/inventory' && req.method === 'GET') {
          if (!checkPinForGet()) return;
          res.writeHead(200);
          res.end(JSON.stringify(store.inventory || []));

        } else if (pathname === '/api/inventory' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const spool = JSON.parse(body);
              spool.id = spool.id || `spool-${Date.now()}`;
              spool.addedAt = new Date().toISOString();
              spool.remaining = spool.weightRemaining ?? spool.weightTotal ?? 1000;
              // Write back to store on disk
              const storeData = { ...lanServerStore };
              storeData.inventory = [...(lanServerStore.inventory || []), spool];
              await persistLanStoreUpdate(storeData);
              // Notify renderer to reload
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lan-spool-added', spool);
              }
              res.writeHead(201);
              res.end(JSON.stringify({ ok: true, spool }));
            } catch (e) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── iOS companion: update order status ──────────────────
        } else if (pathname.startsWith('/api/orders/') && req.method === 'PATCH') {
          const orderId = decodeURIComponent(pathname.split('/api/orders/')[1].split('/')[0]);
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { status } = JSON.parse(body);
              const valid = ['pending','printing','post','qc','completed','on_hold'];
              if (!valid.includes(status)) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid status' }));
                return;
              }
              const storeData = { ...lanServerStore };
              storeData.printLog = [...(lanServerStore.printLog || [])];
              const idx = storeData.printLog.findIndex(o => o.id === orderId);
              if (idx === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Order not found' }));
                return;
              }
              storeData.printLog[idx] = { ...storeData.printLog[idx], status };
              await persistLanStoreUpdate(storeData);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lan-order-updated', { id: orderId, status });
              }
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── Customer survey submission (public — protected by one-time token) ──
        } else if (pathname === '/api/survey' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body);
              if (typeof parsed.comment === 'string' && parsed.comment.length > 2000) {
                parsed.comment = parsed.comment.slice(0, 2000);
              }
              const { token, orderId, rating, comment } = parsed;
              if (!token || typeof rating !== 'number' || rating < 1 || rating > 5) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Invalid payload — token and rating (1-5) are required' }));
                return;
              }
              const storeData = { ...lanServerStore };
              storeData.printLog = [...(lanServerStore.printLog || [])];
              const idx = storeData.printLog.findIndex(o => o.surveyToken && safeTokenEqual(o.surveyToken, token));
              if (idx === -1) {
                res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Invalid or expired survey token' }));
                return;
              }
              storeData.printLog[idx] = {
                ...storeData.printLog[idx],
                survey: {
                  rating,
                  comment: (comment || '').trim(),
                  submittedAt: new Date().toISOString()
                },
                surveyToken: undefined,
              };
              await persistLanStoreUpdate(storeData);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lan-survey-submitted', {
                  orderId: storeData.printLog[idx].id,
                  rating
                });
              }
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        } else if (pathname.startsWith('/status/')) {
          const rawId = path.basename(decodeURIComponent(pathname.slice('/status/'.length)).replace(/\.html$/, ''));
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          const statusDir = statusPagesDir();
          const filePath = path.join(statusDir, `order-status-${safeId}.html`);
          fs.promises.readFile(filePath, 'utf8').then(html => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.writeHead(200);
            res.end(html);
          }).catch(() => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(404);
            res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;color:#666;"><h2>Order not found</h2><p>The tracking page for this order is not available yet.</p></body></html>`);
          });
        } else if (pathname.startsWith('/order/') && req.method === 'GET') {
          const rawId = pathname.replace(/^\/order\//, '').replace(/\/status\/?$/, '');
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          const order = (store.printLog || []).find(o => o.id === safeId);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          if (!order) {
            res.writeHead(404);
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Not Found</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Order Not Found</h2><p>We couldn't find an order with that ID. Please check the link and try again.</p></div></body></html>`);
          } else {
            const shopName = lanEscapeHtml(store.settings?.shopName || 'Khayt');
            const projectName = lanEscapeHtml(order.project || order.id);
            const clientName = order.client ? lanEscapeHtml(order.client) : null;
            const material = order.material ? lanEscapeHtml(order.material) : null;
            const dueDate = order.dueDate ? lanEscapeHtml(order.dueDate) : null;
            const status = (order.status || 'pending').toLowerCase();

            const statusLabels = {
              pending: 'Waiting to Start',
              printing: 'Printing',
              post: 'Post-Processing',
              qc: 'Quality Check',
              completed: 'Ready for Pickup / Completed',
              on_hold: 'On Hold',
              cancelled: 'Cancelled'
            };
            const statusDescriptions = {
              pending: 'Your order is in the queue and will start soon.',
              printing: 'Your order is currently being printed.',
              post: 'Your print is finished — post-processing is underway.',
              qc: 'Your order is going through a quality check.',
              completed: 'Your order is complete and ready for pickup!',
              on_hold: 'Your order is temporarily on hold. We\'ll update you soon.',
              cancelled: 'This order has been cancelled. Please contact us if you have questions.'
            };
            const steps = ['Pending', 'Printing', 'Post-Processing', 'Quality Check', 'Ready / Completed'];
            const stepMap = { pending: 0, printing: 1, post: 2, qc: 3, completed: 4 };
            const currentStep = stepMap[status] !== undefined ? stepMap[status] : (status === 'on_hold' || status === 'cancelled' ? -1 : 0);
            const isWarning = status === 'on_hold' || status === 'cancelled';
            const accentColor = isWarning ? (status === 'cancelled' ? '#ef4444' : '#f59e0b') : '#6366f1';
            const statusLabel = lanEscapeHtml(statusLabels[status] || status);
            const statusDesc = lanEscapeHtml(statusDescriptions[status] || 'We are working on your order.');

            const stepsHtml = steps.map((label, i) => {
              const active = !isWarning && i <= currentStep;
              const isCurrent = !isWarning && i === currentStep;
              return `<div class="step${active ? ' active' : ''}${isCurrent ? ' current' : ''}"><div class="dot"></div><div class="step-label">${lanEscapeHtml(label)}</div></div>`;
            }).join('');

            const detailsHtml = [
              clientName ? `<div class="detail"><span class="detail-label">Customer</span><span class="detail-val">${clientName}</span></div>` : '',
              material ? `<div class="detail"><span class="detail-label">Material</span><span class="detail-val">${material}</span></div>` : '',
              dueDate ? `<div class="detail"><span class="detail-label">Est. Due Date</span><span class="detail-val">${dueDate}</span></div>` : ''
            ].filter(Boolean).join('');

            res.writeHead(200);
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Status — ${projectName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;padding:24px 16px}.container{max-width:480px;margin:0 auto}.header{text-align:center;margin-bottom:28px}.header h1{font-size:1.5rem;font-weight:700;color:#f1f5f9;margin-bottom:4px}.header .subtitle{color:#94a3b8;font-size:.9rem}.card{background:#1e293b;border-radius:16px;padding:24px;margin-bottom:16px}.card-title{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:16px}.status-badge{display:inline-block;padding:6px 14px;border-radius:20px;font-size:.85rem;font-weight:600;background:${accentColor}22;color:${accentColor};margin-bottom:12px}.status-desc{color:#94a3b8;font-size:.9rem;line-height:1.5}.progress{display:flex;align-items:flex-start;gap:0;margin-top:8px}.step{flex:1;display:flex;flex-direction:column;align-items:center;position:relative}.step:not(:last-child)::after{content:'';position:absolute;top:10px;left:50%;width:100%;height:2px;background:#334155;z-index:0}.step.active:not(:last-child)::after{background:#6366f1}.dot{width:20px;height:20px;border-radius:50%;background:#334155;border:2px solid #334155;position:relative;z-index:1;transition:all .2s}.step.active .dot{background:#6366f1;border-color:#6366f1}.step.current .dot{box-shadow:0 0 0 4px #6366f133}.step-label{font-size:.65rem;color:#64748b;margin-top:6px;text-align:center;line-height:1.3}.step.active .step-label{color:#a5b4fc}.detail{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #0f172a}.detail:last-child{border-bottom:none}.detail-label{font-size:.8rem;color:#64748b}.detail-val{font-size:.85rem;color:#e2e8f0;font-weight:500;text-align:right;max-width:60%}.footer{text-align:center;margin-top:24px;color:#475569;font-size:.8rem;line-height:1.6}</style></head><body><div class="container"><div class="header"><h1>${projectName}</h1><div class="subtitle">Order Status</div></div><div class="card"><div class="card-title">Current Status</div><div class="status-badge">${statusLabel}</div><p class="status-desc">${statusDesc}</p>${!isWarning ? `<div class="progress" style="margin-top:20px">${stepsHtml}</div>` : ''}</div>${detailsHtml ? `<div class="card"><div class="card-title">Order Details</div>${detailsHtml}</div>` : ''}<div class="footer"><p>Thank you for choosing ${shopName}</p><p style="margin-top:4px;font-size:.75rem;color:#334155">Auto-refreshes every 30s</p></div></div><script>setTimeout(()=>location.reload(),30000);</script></body></html>`);
          }

        } else if (pathname === '/manifest.json' && req.method === 'GET') {
          const shopName = (store.settings?.shopName || 'Khayt').replace(/"/g, '\\"');
          res.setHeader('Content-Type', 'application/manifest+json');
          res.writeHead(200);
          res.end(JSON.stringify({
            name: shopName + ' Queue',
            short_name: shopName,
            start_url: '/',
            display: 'standalone',
            background_color: '#0f172a',
            theme_color: '#6366f1',
            icons: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
          }));

        } else if ((pathname === '/icon-192.png' || pathname === '/icon-512.png') && req.method === 'GET') {
          const iconPath = path.join(__dirname, 'assets', 'icon_preview.png');
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          if (fs.existsSync(iconPath)) {
            const iconBuf = fs.readFileSync(iconPath);
            res.writeHead(200);
            res.end(iconBuf);
          } else {
            res.writeHead(200);
            res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
          }

        } else if (pathname === '/sw.js' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Service-Worker-Allowed', '/');
          res.writeHead(200);
          res.end(`const CACHE='khayt-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/']))));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));`);

        } else if (pathname === '/' && req.method === 'GET') {
          if (!checkPinForGet()) return;
          const shopName = lanEscapeHtml(store.settings?.shopName || 'Khayt');
          const queue = (store.printLog || []).filter(o => ['pending','printing','post','qc','on_hold'].includes(o.status));
          const pending  = queue.filter(o => o.status === 'pending').length;
          const printing = queue.filter(o => o.status === 'printing').length;
          const post     = queue.filter(o => o.status === 'post').length;
          const qc       = queue.filter(o => o.status === 'qc').length;
          const onHold   = queue.filter(o => o.status === 'on_hold').length;
          const badgeMap = { pending:'#374151|#d1d5db', printing:'#1d4ed8|#bfdbfe', post:'#065f46|#a7f3d0', qc:'#7c3aed|#ddd6fe', on_hold:'#92400e|#fde68a' };
          const orderCards = queue.slice(0, 30).map(o => {
            const [bg, fg] = (badgeMap[o.status] || '#374151|#d1d5db').split('|');
            return `<div class="oc"><div><div class="on">${lanEscapeHtml(o.project || o.id)}</div><div class="cl">${lanEscapeHtml(o.client || '')}</div></div><span class="bd" style="background:${bg};color:${fg}">${lanEscapeHtml(o.status)}</span></div>`;
          }).join('') || '<div class="empty">No active orders</div>';
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const html = `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-touch-icon" href="/icon-192.png">
<meta name="theme-color" content="#6366f1">
<link rel="manifest" href="/manifest.json">
<title>${shopName} Queue</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,system-ui,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:16px;max-width:480px;margin:0 auto}
h1{font-size:20px;color:#6366f1;margin-bottom:2px}
.sub{font-size:12px;color:#64748b;margin-bottom:18px;display:flex;align-items:center;gap:6px}
.dot{width:7px;height:7px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite;display:inline-block}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:18px}
.sc{background:#1e293b;border-radius:10px;padding:12px 14px}
.sn{font-size:26px;font-weight:700}
.sl{font-size:11px;color:#64748b;margin-top:2px}
.oc{background:#1e293b;border-radius:10px;padding:11px 14px;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.on{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.cl{font-size:11px;color:#94a3b8;margin-top:2px}
.bd{padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}
.empty{text-align:center;padding:32px 20px;color:#475569;font-size:13px}
.rf{text-align:center;font-size:11px;color:#475569;margin-top:14px}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
</style></head><body>
<div class="hdr"><div><h1>${shopName}</h1><div class="sub"><span class="dot"></span>Live Queue</div></div></div>
<div class="stats">
<div class="sc"><div class="sn">${pending}</div><div class="sl">Pending</div></div>
<div class="sc"><div class="sn">${printing}</div><div class="sl">Printing</div></div>
<div class="sc"><div class="sn">${post}</div><div class="sl">Post-Processing</div></div>
<div class="sc"><div class="sn">${qc + onHold}</div><div class="sl">QC / On Hold</div></div>
</div>
${orderCards}
<div class="rf">Auto-refreshes every 30s &middot; Updated ${now}</div>
<script>
if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}
setTimeout(()=>location.reload(),30000);
</script>
</body></html>`;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.writeHead(200);
          res.end(html);

        } else if (pathname.startsWith('/api/webhook/printer/') && req.method === 'POST') {
          const machineId = decodeURIComponent(pathname.slice('/api/webhook/printer/'.length).split('/')[0]);
          const providedToken = url.searchParams.get('token') || req.headers['x-khayt-webhook-token'] || '';
          const expectedToken = store.settings?.lanApi?.webhookToken || '';
          // Rate-limit webhook token attempts (reuse the same failedAttempts map)
          const wh_now = Date.now();
          const wh_ipData = failedAttempts.get(ip) || { count: 0, resetAt: 0 };
          if (wh_now < wh_ipData.resetAt && wh_ipData.count >= 10) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
            return;
          }
          if (!expectedToken || !safeTokenEqual(providedToken, expectedToken)) {
            const wh_newCount = (wh_now >= wh_ipData.resetAt ? 0 : wh_ipData.count) + 1;
            failedAttempts.set(ip, { count: wh_newCount, resetAt: wh_newCount >= 10 ? wh_now + LOCKOUT_MS : wh_ipData.resetAt });
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized — set webhook token in Khayt LAN settings' }));
            return;
          }
          failedAttempts.delete(ip);
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = body ? JSON.parse(body) : {};
              const event = normalizePrinterEvent(parsed);
              // Find the order currently printing on this machine
              const storeData = { ...lanServerStore };
              const orders = storeData.printLog || [];
              // Find by machineId (order.machine === machine.name where machine.id === machineId)
              const machine = (storeData.machines || []).find(m => m.id === machineId);
              const machineName = machine?.name || machineId;
              let advancedOrder = null;
              if (event === 'print_done' || event === 'print_started' || event === 'print_cancelled') {
                const targetStatus = event === 'print_done' ? 'printing'
                                   : event === 'print_started' ? 'pending'
                                   : 'printing';
                const newStatus   = event === 'print_done' ? 'post'
                                  : event === 'print_started' ? 'printing'
                                  : 'on_hold';
                const idx = orders.findIndex(o => o.status === targetStatus &&
                  (o.machine === machineName || o.machineId === machineId));
                if (idx !== -1) {
                  const prev = orders[idx];
                  storeData.printLog = [...orders];
                  storeData.printLog[idx] = {
                    ...prev,
                    status: newStatus,
                    ...(newStatus === 'printing' ? { printStartedAt: new Date().toISOString() } : {}),
                    ...(newStatus === 'post'     ? { printDoneAt:    new Date().toISOString() } : {}),
                  };
                  await persistLanStoreUpdate(storeData);
                  advancedOrder = { id: prev.id, from: targetStatus, to: newStatus, project: prev.project };
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('lan-kanban-advanced', advancedOrder);
                  }
                }
              }
              res.setHeader('Content-Type', 'application/json');
              res.writeHead(200);
              res.end(JSON.stringify({ ok: true, event, advanced: advancedOrder }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── iCal feed ───────────────────────────────────────────
        } else if (pathname === '/calendar.ics' && req.method === 'GET') {
          const calOrders = (store.printLog || []).filter(o =>
            o.dueDate && o.status !== 'completed' && o.status !== 'cancelled'
          );
          const formatIcalDate = (dateStr) => {
            // Parse YYYY-MM-DD → YYYYMMDD
            const d = new Date(dateStr + 'T00:00:00Z');
            if (isNaN(d.getTime())) return null;
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dy = String(d.getUTCDate()).padStart(2, '0');
            return `${y}${m}${dy}`;
          };
          const calStatusMap = {
            printing: 'CONFIRMED', post: 'CONFIRMED', qc: 'CONFIRMED',
            pending: 'TENTATIVE', on_hold: 'CANCELLED'
          };
          const vevents = calOrders.map(o => {
            const dtstart = formatIcalDate(o.dueDate);
            if (!dtstart) return '';
            // DTEND = dueDate + 1 day
            const dEnd = new Date(o.dueDate + 'T00:00:00Z');
            dEnd.setUTCDate(dEnd.getUTCDate() + 1);
            const ye = dEnd.getUTCFullYear();
            const me = String(dEnd.getUTCMonth() + 1).padStart(2, '0');
            const de = String(dEnd.getUTCDate()).padStart(2, '0');
            const dtend = `${ye}${me}${de}`;
            const icalEscape = s => String(s || '').replace(/[\r\n]+/g, ' ').replace(/[\\;,]/g, '\\$&');
            const summary = `${icalEscape(o.project || o.id)} (${icalEscape(o.client || 'No client')})`;
            const icalStatus = calStatusMap[o.status] || 'TENTATIVE';
            return [
              'BEGIN:VEVENT',
              `UID:khayt-${o.id}@khayt.app`,
              `DTSTART;VALUE=DATE:${dtstart}`,
              `DTEND;VALUE=DATE:${dtend}`,
              `SUMMARY:${summary}`,
              `STATUS:${icalStatus}`,
              'END:VEVENT'
            ].join('\r\n');
          }).filter(Boolean).join('\r\n');
          const shopName = (store.settings?.shopName || 'Khayt').replace(/[\r\n]+/g, ' ').replace(/[\\;,]/g, '\\$&');
          const icalBody = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Khayt//Khayt//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:${shopName} Orders`,
            vevents,
            'END:VCALENDAR'
          ].join('\r\n');
          res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="khayt-orders.ics"');
          res.setHeader('Cache-Control', 'no-cache');
          res.writeHead(200);
          res.end(icalBody);

        // ── Online intake form ──────────────────────────────────
        } else if (pathname === '/intake' && req.method === 'GET') {
          const shopName = lanEscapeHtml(store.settings?.shopName || 'Khayt');
          res.setHeader('Cache-Control', 'no-cache');
          const intakePin = getIntakePin();
          if (!intakePin) {
            res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Intake Unavailable</title><style>${intakeSharedStyles}</style></head><body><div class="container"><div class="card"><h2 style="margin-bottom:12px;color:#f1f5f9">Intake unavailable</h2><p style="color:#94a3b8;line-height:1.6">The shop has not configured intake access yet.</p></div></div></body></html>`);
          } else if (hasIntakeSession(req)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderIntakeFormPage(shopName));
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderIntakePinPage(shopName));
          }

        // ── Intake session (PIN gate) ───────────────────────────
        } else if (pathname === '/api/intake/session' && req.method === 'POST') {
          const intakePin = getIntakePin();
          if (!intakePin) {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Intake PIN not configured' }));
            return;
          }
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const providedPin = typeof parsed.pin === 'string' ? parsed.pin.trim() : '';
              const now = Date.now();
              const ipData = intakePinAttempts.get(ip) || { count: 0, resetAt: 0 };
              if (now < ipData.resetAt && ipData.count >= 10) {
                res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
                return;
              }
              if (!safeTokenEqual(providedPin, intakePin)) {
                const newCount = (now >= ipData.resetAt ? 0 : ipData.count) + 1;
                intakePinAttempts.set(ip, { count: newCount, resetAt: newCount >= 10 ? now + LOCKOUT_MS : ipData.resetAt });
                res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
              }
              intakePinAttempts.delete(ip);
              const sessionToken = crypto.randomBytes(32).toString('hex');
              intakeSessions.set(sessionToken, { created: Date.now(), ip });
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Set-Cookie': `${INTAKE_COOKIE}=${sessionToken}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(INTAKE_SESSION_MS / 1000)}`,
              });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Invalid request' }));
            }
          });

        // ── Intake form submission ──────────────────────────────
        } else if (pathname === '/api/intake' && req.method === 'POST') {
          if (!checkIntakePost(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              if (!checkIntakeSubmitRate()) {
                res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'Too many submissions — try again later' }));
                return;
              }
              const parsed = JSON.parse(body);
              // Validate required fields
              const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 200) : '';
              const description = typeof parsed.description === 'string' ? parsed.description.trim().slice(0, 2000) : '';
              if (!name) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'name is required' }));
                return;
              }
              if (!description) {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: 'description is required' }));
                return;
              }
              // Optional fields — sanitize
              const sanitize = (v) => typeof v === 'string' ? v.trim().slice(0, 500) : undefined;
              const email = sanitize(parsed.email);
              const phone = sanitize(parsed.phone);
              const material = sanitize(parsed.material);
              const budget = sanitize(parsed.budget);
              const dueDate = sanitize(parsed.dueDate);
              const referenceLink = sanitize(parsed.referenceLink);
              // Store in renderer-compatible waiting-list format
              const entry = {
                id: `intake-${Date.now()}`,
                project: description.slice(0, 80),  // first 80 chars as project name
                clientName: name,
                notes: description,
                email, phone, material, budget, referenceLink,
                reminderDate: dueDate || null,
                priority: 'normal',
                status: 'active',
                estValue: 0,
                source: 'intake_form',
                submittedAt: new Date().toISOString(),
              };
              // Remove undefined keys
              Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);
              const storeData = { ...lanServerStore };
              storeData.waitingList = [...(lanServerStore.waitingList || []), entry];
              await persistLanStoreUpdate(storeData);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lan-intake-submitted', entry);
              }
              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Invalid request — please check your submission and try again' }));
            }
          });

        // ── Quote approval ──────────────────────────────────────
        } else if (pathname.startsWith('/order/') && req.method === 'POST') {
          const rawId = pathname.replace(/^\/order\//, '').replace(/\/?$/, '').split('/')[0];
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          let body = '';
          req.on('data', chunk => {
            if (Buffer.byteLength(body) + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body);
              if (parsed.action !== 'approve') {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(400);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bad Request</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Invalid Action</h2><p>Unknown action. Only "approve" is supported.</p></div></body></html>`);
                return;
              }
              const storeData = { ...lanServerStore };
              storeData.printLog = [...(lanServerStore.printLog || [])];
              const idx = storeData.printLog.findIndex(o => o.id === safeId);
              if (idx === -1) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(404);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Not Found</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Order Not Found</h2><p>We could not find an order with that ID.</p></div></body></html>`);
                return;
              }
              const order = storeData.printLog[idx];
              const canApprove = order.status === 'quote' || (order.status === 'on_hold' && order.hasQuote);
              if (!canApprove) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(409);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cannot Approve</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Cannot Approve</h2><p>This order is not in a state that can be approved (current status: ${lanEscapeHtml(order.status || '')}).</p></div></body></html>`);
                return;
              }
              storeData.printLog[idx] = {
                ...order,
                status: 'pending',
                clientApprovedAt: new Date().toISOString()
              };
              await persistLanStoreUpdate(storeData);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lan-order-updated', { id: safeId, status: 'pending', clientApprovedAt: storeData.printLog[idx].clientApprovedAt });
              }
              const projectName = lanEscapeHtml(order.project || order.id);
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.writeHead(200);
              res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote Approved</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#6366f1}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Quote Approved!</h2><p>Your approval for <strong>${projectName}</strong> has been received. We'll start working on your order shortly.</p></div></body></html>`);
            } catch (e) {
              res.setHeader('Content-Type', 'application/json');
              res.writeHead(400);
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── Salla inbound order webhook ─────────────────────────
        } else if (pathname === '/api/webhook/salla' && req.method === 'POST') {
          let bodyBuf = Buffer.alloc(0);
          req.on('data', chunk => {
            if (bodyBuf.length + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            bodyBuf = Buffer.concat([bodyBuf, chunk]);
          });
          req.on('end', async () => {
            try {
              const sallaSecret = lanServerStore.settings?.lanApi?.sallaWebhookSecret;
              // Always require a configured secret — reject without one to prevent
              // unauthenticated order injection from any LAN host.
              if (!sallaSecret) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Salla webhook secret not configured in LAN settings' }));
                return;
              }
              const sigHeader = req.headers['x-salla-signature'] || '';
              const expected = 'sha256=' + crypto.createHmac('sha256', sallaSecret).update(bodyBuf).digest('hex');
              if (!safeTokenEqual(sigHeader, expected)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid signature' }));
                return;
              }
              const parsed = safeJsonParse(bodyBuf.toString('utf8'));
              const storeData = { ...lanServerStore };
              storeData.printLog = [...(lanServerStore.printLog || [])];
              const clientFirst = (parsed.data?.customer?.first_name || '').trim().slice(0, 100);
              const clientLast  = (parsed.data?.customer?.last_name  || '').trim().slice(0, 100);
              const sallaPrice  = Number(parsed.data?.total);
              const newOrder = {
                id:      `salla-${Date.now()}`,
                project: `Salla: ${(parsed.data?.name || 'Order').slice(0, 100)}`,
                client:  [clientFirst, clientLast].filter(Boolean).join(' ').slice(0, 200),
                status:  'pending',
                date:    new Date().toISOString().split('T')[0],
                price:   isFinite(sallaPrice) ? sallaPrice : 0,
                notes:   `Salla order #${String(parsed.data?.reference_id || '').slice(0, 100)}`,
                source:  'salla'
              };
              storeData.printLog.unshift(newOrder);
              await persistLanStoreUpdate(storeData);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lan-order-updated', newOrder);
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        // ── Zid inbound order webhook ───────────────────────────
        } else if (pathname === '/api/webhook/zid' && req.method === 'POST') {
          let bodyBuf = Buffer.alloc(0);
          req.on('data', chunk => {
            if (bodyBuf.length + chunk.length > MAX_BODY) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              req.socket.destroy();
              return;
            }
            bodyBuf = Buffer.concat([bodyBuf, chunk]);
          });
          req.on('end', async () => {
            try {
              const zidSecret = lanServerStore.settings?.lanApi?.zidWebhookSecret;
              // Always require a configured secret — reject without one to prevent
              // unauthenticated order injection from any LAN host.
              if (!zidSecret) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Zid webhook secret not configured in LAN settings' }));
                return;
              }
              const sigHeader = req.headers['x-zid-signature'] || '';
              const expected = 'sha256=' + crypto.createHmac('sha256', zidSecret).update(bodyBuf).digest('hex');
              if (!safeTokenEqual(sigHeader, expected)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid signature' }));
                return;
              }
              const parsed = safeJsonParse(bodyBuf.toString('utf8'));
              const storeData = { ...lanServerStore };
              storeData.printLog = [...(lanServerStore.printLog || [])];
              const zidPrice = Number(parsed.order?.total);
              const newOrder = {
                id:      `zid-${Date.now()}`,
                project: `Zid: ${(parsed.order?.name || 'Order').slice(0, 100)}`,
                client:  (parsed.order?.customer_name || '').trim().slice(0, 200),
                status:  'pending',
                date:    new Date().toISOString().split('T')[0],
                price:   isFinite(zidPrice) ? zidPrice : 0,
                notes:   `Zid order #${String(parsed.order?.reference_id || parsed.order?.id || '').slice(0, 100)}`,
                source:  'zid'
              };
              storeData.printLog.unshift(newOrder);
              await persistLanStoreUpdate(storeData);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lan-order-updated', newOrder);
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(e) }));
            }
          });

        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found', endpoints: ['/api/status','/api/orders','/api/queue','/api/machines','/api/inventory','/api/webhook/printer/:machineId','/calendar.ics','/intake','/api/intake','/api/webhook/salla','/api/webhook/zid'] }));
        }
      });
      lanServer.listen(port, bindHost, () => {
        const ifaces = os.networkInterfaces();
        let localIp = '127.0.0.1';
        for (const iface of Object.values(ifaces)) {
          for (const addr of iface) {
            if (addr.family === 'IPv4' && !addr.internal) { localIp = addr.address; break; }
          }
          if (localIp !== '127.0.0.1') break;
        }
        resolve({ ok: true, url: `http://${localIp}:${port}`, localIp, port, intakeTokenGenerated, intakePinGenerated });
      });
      lanServer.on('error', e => {
        console.error('LAN server failed to start:', e);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('lan-start-failed', { error: String(e) });
        }
        resolve({ ok: false, error: String(e) });
      });
    } catch(e) {
      console.error('LAN server failed to start:', e);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lan-start-failed', { error: String(e) });
      }
      resolve({ ok: false, error: String(e) });
    }
  });
});

ipcMain.handle('hub:stop-lan-server', async () => {
  if (lanServer) { lanServer.close(); lanServer = null; }
  return { ok: true };
});

ipcMain.handle('hub:send-telegram', async (_e, { botToken, chatId, message } = {}) => {
  botToken = resolveStoreSecret(botToken, d => d?.settings?.telegram?.botToken);
  if (!botToken || !chatId || !message) return { ok: false, error: 'Missing params' };
  if (!/^[0-9]+:[A-Za-z0-9_-]+$/.test(botToken)) return { ok: false, error: 'Invalid bot token format' };
  const chatIdStr = String(chatId).replace(/[^0-9@-]/g, '');
  // isBlockedHost check — api.telegram.org is a public host, should pass
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

ipcMain.handle('hub:get-lan-url', async () => {
  if (!lanServer?.listening) return { ok: false };
  const addr = lanServer.address();
  const ifaces = os.networkInterfaces();
  let localIp = '127.0.0.1';
  for (const iface of Object.values(ifaces)) {
    for (const a of iface) {
      if (a.family === 'IPv4' && !a.internal) { localIp = a.address; break; }
    }
    if (localIp !== '127.0.0.1') break;
  }
  return { ok: true, url: `http://${localIp}:${addr?.port || 3219}`, port: addr?.port };
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
  buildMenu();
  createWindow();
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
            "script-src 'self' 'unsafe-inline'",  // TODO: remove 'unsafe-inline' after replacing inline onclick= handlers in dynamically-generated HTML (app.js) with data-act delegation
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
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
