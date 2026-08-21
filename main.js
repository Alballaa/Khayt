const { app, BrowserWindow, Menu, shell, ipcMain, dialog, safeStorage, clipboard, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { FLAVOR, isBedReady, productName: FLAVOR_NAME } = require('./lib/flavor');

// Bed Ready is a fully independent product that shares Khayt's codebase: give it its OWN Electron
// userData dir (…/BedReady) instead of sharing Khayt's (…/khayt, which app.name still derives to).
// One-time migration copies any existing Bed Ready data across. MUST run before app is ready and before
// anything reads app.getPath('userData'), so it sits here at the very top.
// Defer to an explicit --user-data-dir (dev / e2e / CI isolation) — otherwise we'd override it and every
// test instance would collide on the single real …/BedReady dir (and its single-instance lock).
const hasExplicitUserDataDir = process.argv.some((a) => a === '--user-data-dir' || a.startsWith('--user-data-dir='));
if (isBedReady && !hasExplicitUserDataDir) {
  try {
    app.setPath('userData', require('./lib/bedready-data').migrateAndResolveUserData(app.getPath('appData')));
  } catch (e) {
    console.warn('[bedready] userData independence setup failed, using default:', e && e.message);
  }
}

// Crash/error reporting (Sentry). The DSN is publishable, so it's baked in for
// official builds. Active in PACKAGED installs by default; in dev only when
// SENTRY_DSN is set (so day-to-day development doesn't flood the project).
// PII is off and the E2E store is never sent. Init early to catch startup errors.
// Bed Ready is a separate product and does NOT report to Khayt's Sentry project;
// the SDK is also excluded from its build (see electron-builder.bedready.js).
const SENTRY_DSN = process.env.SENTRY_DSN
  || 'https://7b05dbab160d7a1825f5b2fceab06122@o4511599597977600.ingest.de.sentry.io/4511599624126544';
let sentry = null;
if (!isBedReady && SENTRY_DSN && (app.isPackaged || process.env.SENTRY_DSN)) {
  try {
    sentry = require('@sentry/electron/main');
    sentry.init({
      dsn: SENTRY_DSN,
      release: `khayt@${app.getVersion()}`,
      environment: app.isPackaged ? 'production' : 'development',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      // Crash reporting is OPT-IN. Settings offers it as a checkbox that
      // defaults to off, and the app tells the user "Khayt sends nothing by
      // default" — but Sentry was initialised purely on app.isPackaged and
      // captured regardless of that choice, so stack traces left the device
      // without consent.
      //
      // The gate has to be at send time: init runs at module load, long before
      // the store is read. beforeSend fires when the event does, by which point
      // lanServerStore is populated. Fails CLOSED — if consent is unknown, such
      // as a crash during startup, the event is dropped rather than sent.
      beforeSend: (event) => (telemetryConsent().crash ? event : null),
    });
  } catch (e) { console.error('Sentry init:', e && e.message); sentry = null; }
}

// Optional portable / multi-instance data dir override. Set KHAYT_USER_DATA to
// run an isolated second instance (e.g. to test cloud sync between "devices").
// Must run before any app.getPath('userData') call.
if (process.env.KHAYT_USER_DATA) {
  try { app.setPath('userData', process.env.KHAYT_USER_DATA); } catch (e) { console.error('KHAYT_USER_DATA:', e && e.message); }
}
const crypto = require('crypto');
const QRCode = require('qrcode');
const { safeJsonParse } = require('./lib/safe-json');
const { isBlockedHost, isAllowedPrinterHost, sanitizeMailgunDomain, resolvesToBlockedHost } = require('./lib/host-guard');
const { sendCustomSmtp } = require('./lib/custom-smtp');
const { mergePollSuccess, mergePollFailure } = require('./lib/printer-poll-cache');
const { normalizeProgress, fileProgressPct, etaSeconds, moonrakerProgress } = require('./lib/printer-status');
const printerCommands = require('./lib/printer-commands');
const { normalizeStoreSnapshot, STORE_VERSION } = require('./lib/store-validate');
const upgradeBackup = require('./lib/upgrade-backup');
const { createStoreIo } = require('./lib/store-io');
const { parseGcodeText } = require('./lib/gcode-parse');
const { createSilhouette } = require('./lib/gcode-geometry');
const { intake: intakeModel } = require('./lib/model-intake');
const { extractActuals } = require('./lib/printer-actuals');
const { contentHash: modelContentHash } = require('./lib/model-identity');
const { extract: extractPrintThumb } = require('./lib/thumbnail-extract');
const bambu = require('./lib/bambu');
const { bambuFtpUpload } = require('./lib/bambu-ftp');
const { sendSms } = require('./lib/sms');
const cloudClient = require('./lib/cloud-client');
const { summarizeBranch, totalBranches } = require('./lib/branch-summary');
const aiTools = require('./lib/ai-tools');
const aiPrivacy = require('./lib/ai-privacy');
const bedreadyLibrary = require('./lib/bedready-library');
const calibProfile = require('./lib/calibration-profile');
const orcaFila = require('./lib/orca-filament-install');
// Login-CSRF guard for the bedready:// sign-in handoff: only honour a deep link the app itself just
// initiated (user clicked "Connect"). Armed by hub:bedready-open-signin, checked in handleBedreadyLink.
let bedreadyLinkArmedAt = 0;
const BEDREADY_LINK_ARM_WINDOW_MS = 10 * 60 * 1000; // 10 min to finish signing in on the website
// Per-handshake nonce: minted when the user opens the sign-in page (passed as ?state=), echoed back in
// the bedready:// link. Binds the returned link to THIS app's own sign-in click — a drive-by link from a
// different tab can't be consumed even inside the arm window. '' before any sign-in attempt.
let bedreadyLinkNonce = '';
const { registerZatcaCrypto } = require('./lib/zatca-crypto');
const { wrapHubIpc } = require('./lib/ipc-guard');
const { sanitizeHtmlForFile, redactStatusHtmlClientRow } = require('./lib/status-html');
const { hashPin: hashPinSalted, verifyPin, isManagedHash } = require('./lib/pin-hash');

// FLAVOR / isBedReady / FLAVOR_NAME are resolved at the top of this file (needed
// before the Sentry block). 'bedready' = the standalone maker app (no business
// surfaces); anything else = the full Khayt business app. They drive the entry
// HTML, window branding, and which business-only main-process code gets wired up.
// Entry document, relative to renderer/. Used BOTH for loadFile and the navigation
// lock below — they must agree, or in-app reloads of the Bed Ready page get blocked.
const ENTRY_HTML = isBedReady ? 'bedready.html' : 'index.html';

let mainWindow;
let lanServerStore = {};

/** Only the main app window may invoke privileged hub:* IPC (blocks stray webContents). */
function isTrustedRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return !!(event && event.sender === mainWindow.webContents);
}

wrapHubIpc(ipcMain, isTrustedRenderer);

// Renderer → main error forwarding for Sentry (the renderer is non-bundled with a
// strict CSP, so it can't run the SDK directly). No-op unless Sentry is active.
ipcMain.handle('hub:report-error', (_e, info = {}) => {
  if (!sentry) return false;
  // Same opt-in gate as beforeSend. Checked here too so a renderer error is
  // dropped before an Error object is even constructed from it.
  if (!telemetryConsent().crash) return false;
  try {
    const err = new Error(String((info && info.message) || 'renderer error').slice(0, 500));
    if (info && info.stack) err.stack = String(info.stack).slice(0, 8000);
    sentry.captureException(err, { tags: { source: 'renderer' }, extra: { url: info && info.url, line: info && info.line } });
  } catch { /* ignore */ }
  return true;
});
const {
  encryptStoreField,
  decryptStoreField,
  encryptForDisk,
  hasPlaintextSecrets,
  maskStoreSecretsForRenderer,
  mergeStoreSecretsFromDisk,
  writeStoreToDisk,
  atomicWriteStore,
  recoverStoreRaw,
  syncLanServerStoreFromDisk,
  migrateLanApiSecrets,
  ensureLanIntakeToken,
  ensureLanIntakePin,
  ensureLanCalendarToken,
  isEncryptionAvailable,
  persistLanStoreUpdate,
  resolveStoreSecret,
  isStoreSecretMasked,
  readStoreDecryptedFromDisk,
  dataFilePath,
} = createStoreIo({
  app,
  fs,
  safeStorage,
  safeJsonParse,
  crypto,
  onStoreUpdated(data) { lanServerStore = data; },
});

// ZATCA e-invoicing is a business-only surface — skip its IPC on the Bed Ready flavor.
if (!isBedReady) {
  registerZatcaCrypto({ app, fs, crypto, ipcMain, encryptStoreField, decryptStoreField });
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== 64 || b.length !== 64) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

function appIconPath() {
  // Prefer a flavor-specific icon, else fall back to the shared Khayt preview so
  // the window and dock always have one. This was marked as outstanding Bed
  // Ready branding work long after assets/bedready-preview.png shipped — the
  // fallback has not fired for Bed Ready in a while, and the note only made
  // finished work look unfinished.
  const candidates = [];
  if (isBedReady) candidates.push(path.join(__dirname, 'assets', 'bedready-preview.png'));
  candidates.push(path.join(__dirname, 'assets', 'icon_preview.png'));
  for (const png of candidates) {
    if (fs.existsSync(png)) return png;
  }
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
const productDocsDir = () => ensureDir('product-docs');
const orderPhotosDir = () => ensureDir('order-photos');
const orderFilesDir  = () => ensureDir('order-files');
const invoicesDir    = () => ensureDir('invoices');
const backupsDir     = () => ensureDir('backups');
// Receipts photographed on the phone. Under userData like every other attachment
// directory, which also means hub:open-path will open them — its allow-list
// covers userData, and a receipt written anywhere else would be unopenable.
const receiptsDir    = () => ensureDir('receipts');

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

ipcMain.handle('hub:save-text-file', async (_e, { content, defaultName, filters } = {}) => {
  const win = BrowserWindow.getFocusedWindow();
  const okFilters = Array.isArray(filters) && filters.length
    ? filters.filter((f) => f && f.name && Array.isArray(f.extensions))
    : [{ name: 'Text', extensions: ['txt'] }];
  const { filePath, canceled } = await dialog.showSaveDialog(win || undefined, {
    defaultPath: defaultName || 'khayt-recovery.txt',
    filters: okFilters.length ? okFilters : [{ name: 'Text', extensions: ['txt'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  await fs.promises.writeFile(filePath, String(content || ''), 'utf8');
  return { ok: true, filePath };
});

// Write a set of CSV files (one-click "Export all data") into a chosen folder.
ipcMain.handle('hub:export-csv-bundle', async (_e, files) => {
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: 'nothing-to-export' };
  const win = BrowserWindow.getFocusedWindow();
  const { filePaths, canceled } = await dialog.showOpenDialog(win || undefined, {
    title: 'Choose a folder for the CSV export',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join(filePaths[0], `khayt-export-${stamp}`);
  await fs.promises.mkdir(dir, { recursive: true });
  let written = 0;
  for (const f of files) {
    if (!f || typeof f.name !== 'string') continue;
    // Guard against path traversal in the supplied file name.
    const safe = path.basename(f.name);
    await fs.promises.writeFile(path.join(dir, safe), String(f.content || ''), 'utf8');
    written++;
  }
  return { ok: true, dir, count: written };
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

// --- Live exchange rates (free, no-key FX API) ---
// Renderer CSP forbids outbound fetch, so the main process pulls rates on demand.
// open.er-api.com returns "1 BASE = rates[X] FOREIGN"; we store base-units-per-1
// -foreign (= 1/rate) to match settings.exchangeRates' convention.
ipcMain.handle('hub:fetch-exchange-rates', async (_e, base) => {
  const code = String(base || 'SAR').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (code.length !== 3) return { ok: false, error: 'Invalid base currency' };
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${code}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.result !== 'success' || !body.rates || typeof body.rates !== 'object') {
      return { ok: false, error: body['error-type'] || `HTTP ${res.status}` };
    }
    const rates = {};
    for (const [cur, r] of Object.entries(body.rates)) {
      const n = +r;
      if (cur !== code && Number.isFinite(n) && n > 0) rates[cur] = 1 / n;
    }
    return { ok: true, base: code, rates, updatedAt: body.time_last_update_utc || null };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

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

// --- Product documents (assembly instructions, safety sheets, drawings) ------
//
// Attached to a PRODUCT rather than to a part or an order, and that is the whole
// design decision. A safety sheet is a property of the thing being made, not of
// one order for it — file it against the part and the shop re-attaches the same
// PDF every time somebody orders that product. Filed here, it follows any order
// that names the product, onto the work order the floor reads and the delivery
// note that goes in the box.
//
// Their own directory rather than orderFilesDir(): these outlive any single
// order, and deleting an order's files must never take a product's documents
// with it.
ipcMain.handle('hub:pick-and-save-product-doc', async (event, productId) => {
  const wc = event.sender;
  const win = BrowserWindow.fromWebContents(wc);
  const result = await dialog.showOpenDialog(win, {
    title: 'Attach Document',
    filters: [
      { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'md', 'doc', 'docx'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const src = result.filePaths[0];
  const originalName = path.basename(src);
  const ext = path.extname(originalName).slice(1).toLowerCase() || 'bin';
  const safeId = path.basename(String(productId || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeId}-${Date.now().toString(36)}.${ext}`;
  await fs.promises.copyFile(src, path.join(productDocsDir(), filename));
  const stat = await fs.promises.stat(src);
  return { filename, originalName, size: stat.size };
});

ipcMain.handle('hub:open-product-doc', async (_e, filename) => {
  const full = path.join(productDocsDir(), path.basename(filename || ''));
  if (filename && fs.existsSync(full)) await shell.openPath(full);
  return true;
});

ipcMain.handle('hub:delete-product-doc', async (_e, filename) => {
  const full = path.join(productDocsDir(), path.basename(filename || ''));
  if (filename && fs.existsSync(full)) await fs.promises.unlink(full);
  return true;
});



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
  let finalPath = null;
  if (savePath) {
    // Silent (no-dialog) writes are confined to the app's own invoices dir under
    // userData. A renderer-supplied savePath can therefore only ever land inside
    // userData/invoices (with a sanitized basename) — it can never overwrite an
    // arbitrary file under Documents/Downloads/Desktop. To save elsewhere the
    // caller must request the save dialog (askWhere: true) below.
    const invDir = path.resolve(invoicesDir());
    const safeName = path.basename(String(savePath)).replace(/[^a-zA-Z0-9._-]/g, '_') || 'invoice.pdf';
    finalPath = path.join(invDir, safeName);
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
  const backupDir = path.join(icloudBase, isBedReady ? 'Bed Ready' : 'Khayt', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const filename = `${new Date().toISOString().split('T')[0]}.json`;
  const fullPath = path.join(backupDir, filename);
  let parsed;
  try { parsed = safeJsonParse(jsonString); } catch (e) { return null; }
  const encrypted = JSON.stringify(encryptForDisk(parsed));
  await fs.promises.writeFile(fullPath, encrypted, 'utf8');
  return fullPath;
});

/**
 * Copy the store aside, verbatim, the first time a newer build opens it.
 *
 * Runs once per schema version: the filename carries both versions, so if one
 * already exists for this hop the shop has already been upgraded and the
 * original pre-upgrade state is the one worth keeping — never overwrite it with
 * a later, possibly already-damaged, copy.
 */
function writePreUpgradeBackup(raw, diskVersion) {
  if (!upgradeBackup.needsPreUpgradeBackup(diskVersion, STORE_VERSION, true)) return null;
  const dir = backupsDir();
  const from = Number.isFinite(diskVersion) ? diskVersion : 0;
  const already = fs.readdirSync(dir).some((f) =>
    upgradeBackup.isProtectedBackup(f) && f.includes(`v${from}-to-v${STORE_VERSION}-`));
  if (already) return null;
  const name = upgradeBackup.preUpgradeBackupName(diskVersion, STORE_VERSION, new Date().toISOString());
  const fullPath = path.join(dir, name);
  fs.writeFileSync(fullPath, JSON.stringify(encryptForDisk(raw)), 'utf8');
  console.warn(`store upgrade v${from} → v${STORE_VERSION}: kept a pre-upgrade backup at ${fullPath}`);
  return fullPath;
}

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
  // Rotation keeps the 30 most recent DAILY backups. Pre-upgrade backups are
  // excluded from both the count and the deletion: a shop that opens the app on
  // 30 consecutive days would otherwise have its upgrade insurance deleted by
  // routine housekeeping, so the backup would survive exactly as long as nobody
  // needed it.
  const listed = (await fs.promises.readdir(backupsDir())).filter(f => f.endsWith('.json')).sort();
  const { rotatable } = upgradeBackup.partitionForRotation(listed);
  if (rotatable.length > 30) {
    for (const f of rotatable.slice(0, rotatable.length - 30)) {
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
    // Restoring a backup decrypts its secrets → a real keychain read. Explain once first.
    await maybeShowKeychainExplanation(BrowserWindow.fromWebContents(event.sender));
    const decrypted = decryptStoreSecrets(JSON.parse(JSON.stringify(parsed)));
    return JSON.stringify(decrypted);
  } catch (e) {
    console.error('hub:restore-backup error:', e);
    return null;
  }
});
ipcMain.handle('hub:reveal-order-photos-folder', async () => shell.openPath(orderPhotosDir()));
ipcMain.handle('hub:reveal-backups-folder', async () => shell.openPath(backupsDir()));

// --- Named restore points (disaster recovery) ---
// Stored in a separate folder from the dated auto-backups so they are never
// auto-pruned; each carries a user label. Encrypted on disk like backups.
const restorePointsDir = () => ensureDir('restore-points');
const sanitizeRpLabel = (s) => String(s || 'Restore point').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'Restore point';

ipcMain.handle('hub:create-restore-point', async (_e, { json, label } = {}) => {
  if (!json || typeof json !== 'string' || json.length > 20_000_000) return { ok: false, error: 'Invalid data' };
  let parsed;
  try { parsed = safeJsonParse(json); } catch (e) { return { ok: false, error: 'Invalid JSON' }; }
  const safeLabel = sanitizeRpLabel(label);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${stamp}__${safeLabel.replace(/\s+/g, '_')}.json`;
  await fs.promises.writeFile(path.join(restorePointsDir(), filename), JSON.stringify(encryptForDisk(parsed)), 'utf8');
  // Keep the most recent 50 restore points.
  const all = (await fs.promises.readdir(restorePointsDir())).filter(f => f.endsWith('.json')).sort();
  for (const f of all.slice(0, Math.max(0, all.length - 50))) {
    await fs.promises.unlink(path.join(restorePointsDir(), f)).catch(() => {});
  }
  return { ok: true, filename, label: safeLabel };
});

ipcMain.handle('hub:list-restore-points', async () => {
  const dir = restorePointsDir();
  const files = (await fs.promises.readdir(dir)).filter(f => f.endsWith('.json')).sort().reverse();
  return Promise.all(files.map(async (f) => {
    const stat = await fs.promises.stat(path.join(dir, f));
    const label = (f.replace(/\.json$/, '').split('__')[1] || 'Restore point').replace(/_/g, ' ');
    return { filename: f, label, mtime: stat.mtimeMs };
  }));
});

ipcMain.handle('hub:read-restore-point', async (event, filename) => {
  const safe = path.join(restorePointsDir(), path.basename(String(filename || '')));
  if (!fs.existsSync(safe)) return null;
  try {
    const parsed = safeJsonParse(await fs.promises.readFile(safe, 'utf8'));
    // Reading a restore point decrypts its secrets → a keychain read. Explain once first.
    await maybeShowKeychainExplanation(BrowserWindow.fromWebContents(event.sender));
    return JSON.stringify(decryptStoreSecrets(JSON.parse(JSON.stringify(parsed))));
  } catch (e) { console.error('hub:read-restore-point error:', e); return null; }
});

ipcMain.handle('hub:delete-restore-point', async (_e, filename) => {
  const safe = path.join(restorePointsDir(), path.basename(String(filename || '')));
  // The third of these delete handlers. hub:delete-vault-file and hub:printlib-delete were
  // fixed to report the truth; this one still swallowed the error and always claimed
  // success, so a locked file on Windows silently stayed while the list re-rendered.
  try {
    await fs.promises.unlink(safe);
  } catch (e) {
    if (!e || e.code !== 'ENOENT') {   // already gone is the desired end state
      console.error('hub:delete-restore-point:', e);
      return { ok: false, error: String((e && e.message) || e) };
    }
  }
  return { ok: true };
});

// --- Receipt file picker (Feature 5) ---
ipcMain.handle('hub:pick-file', async (event, opts = {}) => {
  const wc = event.sender;
  const win = BrowserWindow.fromWebContents(wc);
  const filters = opts.filters || [{ name: 'All Files', extensions: ['*'] }];
  const result = await dialog.showOpenDialog(win, { filters, properties: ['openFile'] });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// --- Slice a model with the user's INSTALLED slicer and return its own time +
//     filament estimate (accurate quoting). We never bundle a slicer engine
//     (keeps the license clean); we shell out to one the user installed and parse
//     its G-code summary via lib/gcode-parse. spawn(shell:false) — no injection. ---
function tokenizeSliceArgs(template) {
  const out = []; let cur = ''; let q = null; let has = false;
  for (const ch of String(template || '')) {
    if (q) { if (ch === q) q = null; else { cur += ch; has = true; } }
    else if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (/\s/.test(ch)) { if (has) { out.push(cur); cur = ''; has = false; } }
    else { cur += ch; has = true; }
  }
  if (has) out.push(cur);
  return out;
}

// Slice a model with the user's installed slicer. Returns { ok, gcodePath, outDir,
// meta, error } WITHOUT cleaning up outDir — the caller decides (parse only, or
// also upload to a printer, then remove outDir).
// Reject shells/interpreters posing as a "slicer" executable. The slicer path
// comes from settings.slicers[] which can arrive via a restored/synced snapshot,
// so a poisoned path (e.g. /bin/bash with an -c arg template) must not become
// arbitrary code execution when the user clicks Slice / Open-in-slicer. spawn is
// already shell:false (no metachar injection); this blocks the interpreter path.
const DISALLOWED_SLICER_BINARIES = new Set([
  'bash', 'sh', 'zsh', 'dash', 'ksh', 'csh', 'tcsh', 'fish', 'cmd', 'command',
  'powershell', 'pwsh', 'python', 'python2', 'python3', 'node', 'nodejs', 'deno',
  'bun', 'ruby', 'perl', 'php', 'osascript', 'wscript', 'cscript', 'env', 'sudo',
  'doas', 'xterm', 'open', 'start', 'rundll32', 'regsvr32', 'mshta',
]);
function isSafeSlicerBinary(p) {
  const base = path.basename(String(p || '')).toLowerCase()
    .replace(/\.(exe|app|appimage|bat|cmd|com|scr|ps1)$/i, '');
  return base.length > 0 && !DISALLOWED_SLICER_BINARIES.has(base);
}

async function runSlice({ modelPath, slicerPath, args, densityGPerCm3 }) {
  const { spawn } = require('node:child_process');
  const os = require('os');
  if (!slicerPath || !fs.existsSync(slicerPath)) return { ok: false, error: 'Slicer not found — set its path in Settings → Slicer.' };
  if (!isSafeSlicerBinary(slicerPath)) return { ok: false, error: 'That program is not allowed as a slicer.' };
  if (!modelPath || !fs.existsSync(modelPath)) return { ok: false, error: 'Model file not found.' };
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'khayt-slice-'));
  const outPath = path.join(outDir, 'out.gcode');
  const argv = tokenizeSliceArgs(args || '--export-gcode -o {output} {model}')
    .map((a) => a.replace(/\{model\}/g, modelPath).replace(/\{output\}/g, outPath).replace(/\{outdir\}/g, outDir));
  const result = await new Promise((resolve) => {
    let stderr = '';
    let child;
    try { child = spawn(slicerPath, argv, { timeout: 180000, windowsHide: true }); }
    catch (err) { return resolve({ code: -1, stderr: String(err && err.message || err) }); }
    child.stderr?.on('data', (d) => { stderr = (stderr + d.toString()).slice(-4000); });
    child.on('error', (err) => resolve({ code: -1, stderr: String(err && err.message || err) }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
  let gpath = fs.existsSync(outPath) ? outPath : null;
  if (!gpath) {
    const gc = fs.readdirSync(outDir).filter((f) => /\.gcode$/i.test(f)).sort();
    if (gc.length) gpath = path.join(outDir, gc[gc.length - 1]);
  }
  if (!gpath) {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return { ok: false, error: 'No G-code produced. ' + String(result.stderr || `exit ${result.code}`).slice(0, 300) };
  }
  const buf = fs.readFileSync(gpath);
  const head = buf.subarray(0, 65536).toString('utf8');
  const tail = buf.subarray(Math.max(0, buf.length - 65536)).toString('utf8');
  // The shop's density lets a profile-less slice still be weighed: PrusaSlicer
  // reports the volume exactly but writes 0.00 g when no filament profile is
  // loaded, which is most of the time from a bare STL.
  return { ok: true, gcodePath: gpath, outDir, meta: parseGcodeText(head + '\n' + tail, { densityGPerCm3 }) };
}
const rmDir = (d) => { try { if (d) fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } };

ipcMain.handle('hub:slice', async (_e, opts = {}) => {
  try {
    const r = await runSlice(opts);
    if (!r.ok) return r;
    rmDir(r.outDir);
    return { ok: true, ...r.meta };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Quick "does this slicer binary run?" check for Settings → Slicer.
ipcMain.handle('hub:slice-test', async (_e, { slicerPath } = {}) => {
  try {
    const { spawn } = require('node:child_process');
    if (!slicerPath || !fs.existsSync(slicerPath)) return { ok: false, error: 'Slicer not found at that path.' };
    if (!isSafeSlicerBinary(slicerPath)) return { ok: false, error: 'That program is not allowed as a slicer.' };
    return await new Promise((resolve) => {
      let out = '';
      let child;
      try { child = spawn(slicerPath, ['--help'], { timeout: 15000, windowsHide: true }); }
      catch (err) { return resolve({ ok: false, error: String(err && err.message || err) }); }
      child.stdout?.on('data', (d) => { out = (out + d.toString()).slice(0, 4000); });
      child.stderr?.on('data', (d) => { out = (out + d.toString()).slice(0, 4000); });
      child.on('error', (err) => resolve({ ok: false, error: String(err && err.message || err) }));
      child.on('close', () => resolve({ ok: true, info: (out.split('\n').find((l) => l.trim()) || '').slice(0, 120) }));
    });
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Resolve a macOS .app bundle to the inner Mach-O binary that spawn() needs
// (spawning the .app directory itself does not launch it).
function macAppBinary(appPath, preferred) {
  const macos = path.join(appPath, 'Contents', 'MacOS');
  if (preferred && fs.existsSync(path.join(macos, preferred))) return path.join(macos, preferred);
  try {
    const files = fs.readdirSync(macos);
    const exe = files.find((f) => !/helper|crashpad|update|renderer|gpu/i.test(f)) || files[0];
    if (exe) return path.join(macos, exe);
  } catch (_) {}
  return null;
}

// Scan the machine for every installed slicer so Settings can offer them all,
// not just a single hard-coded default. Returns [{ name, path }] (path = the
// executable spawn() can launch directly).
function detectInstalledSlicers() {
  const home = require('node:os').homedir();
  const out = [];
  const seen = new Set();
  const add = (name, p) => {
    if (!p) return;
    const rp = path.resolve(p);
    if (seen.has(rp) || !fs.existsSync(rp)) return;
    seen.add(rp);
    out.push({ name, path: rp });
  };
  const plat = process.platform;

  // Any .app whose name looks like a slicer — catches vendor OrcaSlicer forks (Snapmaker Orca,
  // QIDIStudio, Elegoo, Anker, Creality/Bambu variants…) and Cura builds that aren't in the list below.
  const SLICER_APP_RE = /(slic|orca|snapmaker|bambu|prusa|cura|creality|chitubox|lychee|flashprint|ideamaker|simplify|qidi|elegoo|anycubic|anker|eufymake|photon|satellite|voxeldance|icesl|kisslicer|sovol)/i;
  if (plat === 'darwin') {
    // macOS Contents/MacOS/ executable names verified from each project's build config / bundle.
    // Orca/Bambu C++ forks use a CamelCase app-key on macOS (OrcaSlicer, BambuStudio, QIDIStudio,
    // ElegooSlicer, CrealityPrint); Snapmaker's .app has a space but its binary an underscore.
    const apps = [
      { name: 'PrusaSlicer', app: 'PrusaSlicer.app', bin: 'PrusaSlicer' },
      { name: 'OrcaSlicer', app: 'OrcaSlicer.app', bin: 'OrcaSlicer' },
      { name: 'Snapmaker Orca', app: 'Snapmaker Orca.app', bin: 'Snapmaker_Orca' },
      { name: 'Bambu Studio', app: 'BambuStudio.app', bin: 'BambuStudio' },
      { name: 'Bambu Studio', app: 'Bambu Studio.app', bin: 'BambuStudio' },
      { name: 'UltiMaker Cura', app: 'UltiMaker-Cura.app', bin: 'UltiMaker-Cura' },
      { name: 'Elegoo Slicer', app: 'ElegooSlicer.app', bin: 'ElegooSlicer' },
      { name: 'QIDIStudio', app: 'QIDIStudio.app', bin: 'QIDIStudio' },
      { name: 'Creality Print', app: 'CrealityPrint.app', bin: 'CrealityPrint' },
      { name: 'SuperSlicer', app: 'SuperSlicer.app', bin: 'SuperSlicer' },
      { name: 'Slic3r', app: 'Slic3r.app', bin: 'Slic3r' },
      { name: 'ideaMaker', app: 'ideaMaker.app', bin: 'ideaMaker' },
      { name: 'Simplify3D', app: 'Simplify3D.app', bin: 'Simplify3D' },
      { name: 'Lychee Slicer', app: 'LycheeSlicer.app', bin: 'LycheeSlicer' },
      { name: 'Lychee Slicer', app: 'Lychee Slicer.app', bin: 'LycheeSlicer' },
      { name: 'CHITUBOX', app: 'CHITUBOX.app', bin: 'CHITUBOX' },
      { name: 'FlashPrint', app: 'FlashPrint.app', bin: 'FlashPrint' },
    ];
    let displayName = null;
    try { displayName = require('./lib/slicers').slicerDisplayName; } catch (_) {}
    const dirs = ['/Applications', path.join(home, 'Applications')];
    for (const d of dirs) {
      for (const k of apps) {
        const appPath = path.join(d, k.app);
        if (fs.existsSync(appPath)) add(k.name, macAppBinary(appPath, k.bin));
      }
      let entries = [];
      try { entries = fs.readdirSync(d); } catch (_) {}
      for (const e of entries) {
        if (!/\.app$/i.test(e) || !SLICER_APP_RE.test(e)) continue;
        const stem = e.replace(/\.app$/i, '');
        add((displayName && displayName(e)) || stem, macAppBinary(path.join(d, e)));
      }
    }
  } else if (plat === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const lad = process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');
    // Windows/Linux binaries for the Orca/Bambu forks use the lowercase-dash SLIC3R_APP_CMD
    // (orca-slicer, bambu-studio, qidi-studio, elegoo-slicer, snapmaker-orca); Creality is CamelCase.
    const cands = [
      { name: 'PrusaSlicer', rels: ['Prusa3D\\PrusaSlicer\\prusa-slicer.exe'] },
      { name: 'OrcaSlicer', rels: ['OrcaSlicer\\orca-slicer.exe', 'OrcaSlicer\\OrcaSlicer.exe'] },
      { name: 'Snapmaker Orca', rels: ['Snapmaker Orca\\snapmaker-orca.exe', 'Snapmaker Orca\\Snapmaker Orca.exe', 'Snapmaker Orca\\snapmaker_orca.exe', 'Snapmaker_Orca\\Snapmaker_Orca.exe'] },
      { name: 'Bambu Studio', rels: ['Bambu Studio\\bambu-studio.exe', 'Bambu Studio\\BambuStudio.exe'] },
      { name: 'Elegoo Slicer', rels: ['ElegooSlicer\\elegoo-slicer.exe', 'ElegooSlicer\\ElegooSlicer.exe'] },
      { name: 'QIDIStudio', rels: ['QIDIStudio\\qidi-studio.exe', 'QIDIStudio\\QIDIStudio.exe'] },
      { name: 'Sovol Slicer', rels: ['SovolSlicer\\sovol-slicer.exe'] },
      { name: 'SuperSlicer', rels: ['SuperSlicer\\superslicer.exe'] },
      { name: 'ideaMaker', rels: ['Raise3D\\ideaMaker\\ideaMaker.exe'] },
      { name: 'Simplify3D', rels: ['Simplify3D\\Simplify3D.exe'] },
      { name: 'Creality Print', rels: ['Creality\\Creality Print\\CrealityPrint.exe', 'CrealityPrint\\CrealityPrint.exe'] },
      { name: 'FlashPrint', rels: ['FlashForge\\FlashPrint 5\\FlashPrint.exe', 'FlashForge\\FlashPrint\\FlashPrint.exe'] },
      { name: 'Lychee Slicer', rels: ['LycheeSlicer\\LycheeSlicer.exe'] },
      { name: 'CHITUBOX', rels: ['ChiTuBox\\CHITUBOX.exe'] },
    ];
    const roots = [pf, pfx86, path.join(lad, 'Programs')];
    for (const c of cands) for (const root of roots) for (const rel of c.rels) add(c.name, path.join(root, rel));
    // Folder layout varies by version for some vendors — scan for Cura / Creality Print dirs.
    for (const root of [pf, pfx86]) {
      let entries = [];
      try { entries = fs.readdirSync(root); } catch (_) {}
      for (const e of entries) {
        if (/cura/i.test(e)) {
          for (const bin of ['UltiMaker-Cura.exe', 'Ultimaker Cura.exe', 'Cura.exe']) add(e, path.join(root, e, bin));
        } else if (/creality/i.test(e)) {
          for (const bin of ['CrealityPrint.exe', 'Creality Print\\CrealityPrint.exe']) add('Creality Print', path.join(root, e, bin));
        }
      }
    }
  } else {
    const bins = [
      { name: 'PrusaSlicer', cmds: ['prusa-slicer', 'PrusaSlicer'] },
      { name: 'OrcaSlicer', cmds: ['orca-slicer', 'OrcaSlicer'] },
      { name: 'Snapmaker Orca', cmds: ['snapmaker-orca', 'Snapmaker_Orca', 'SnapmakerOrca'] },
      { name: 'Bambu Studio', cmds: ['bambu-studio', 'BambuStudio'] },
      { name: 'Elegoo Slicer', cmds: ['elegoo-slicer', 'ElegooSlicer'] },
      { name: 'QIDIStudio', cmds: ['qidi-studio', 'qidi-slicer', 'QIDIStudio'] },
      { name: 'Creality Print', cmds: ['CrealityPrint', 'creality-print'] },
      { name: 'UltiMaker Cura', cmds: ['cura', 'UltiMaker-Cura'] },
      { name: 'SuperSlicer', cmds: ['superslicer', 'SuperSlicer'] },
      { name: 'Slic3r', cmds: ['slic3r'] },
      { name: 'ideaMaker', cmds: ['ideaMaker', 'ideamaker'] },
      { name: 'Lychee Slicer', cmds: ['lycheeslicer', 'LycheeSlicer'] },
    ];
    const dirs = ['/usr/bin', '/usr/local/bin', path.join(home, '.local', 'bin'),
      '/var/lib/flatpak/exports/bin', path.join(home, '.local', 'share', 'flatpak', 'exports', 'bin')];
    for (const b of bins) for (const cmd of b.cmds) for (const d of dirs) add(b.name, path.join(d, cmd));
    let dn = null;
    try { dn = require('./lib/slicers').slicerDisplayName; } catch (_) {}
    for (const d of [path.join(home, 'Applications'), path.join(home, 'Downloads'), path.join(home, '.local', 'bin')]) {
      let entries = [];
      try { entries = fs.readdirSync(d); } catch (_) {}
      for (const e of entries) {
        if (!/\.AppImage$/i.test(e)) continue;
        if (!/slic|cura|prusa|orca|bambu|snapmaker|elegoo|qidi|creality|lychee|ideamaker|anycubic|sovol/i.test(e)) continue;
        add((dn && dn(e)) || e.replace(/\.AppImage$/i, ''), path.join(d, e));
      }
    }
  }
  return out;
}

// Settings → Slicer: find every slicer installed on this computer.
ipcMain.handle('hub:detect-slicers', async () => {
  try { return { ok: true, slicers: detectInstalledSlicers() }; }
  catch (e) { return { ok: false, error: String(e && e.message || e), slicers: [] }; }
});

// Upload a G-code file to a printer (OctoPrint / Moonraker / PrusaLink) and
// optionally start it. Uses the same host allowlist as the status poller (SSRF-safe).
async function uploadGcodeToPrinter(machine, gcodePath, startPrint) {
  const { type, host, port, apiKey, accessCode, serial, printerSlug } = (machine && machine.printerApi) || {};
  const printerHost = String(host || '').replace(/[^a-zA-Z0-9.\-]/g, '');
  if (!isAllowedPrinterHost(printerHost)) return { ok: false, error: 'Invalid printer host' };
  const portNum = parseInt(port || defaultPrinterPort(type), 10);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return { ok: false, error: 'Invalid port' };
  const bytes = fs.readFileSync(gcodePath);
  // Bambu Lab: upload over FTPS (:990), then start it over MQTT (:8883).
  if (type === 'bambu') {
    const dev = String(serial || printerSlug || '').trim();
    if (!dev) return { ok: false, error: 'Bambu needs the printer serial number.' };
    if (!accessCode) return { ok: false, error: 'Bambu needs the LAN access code.' };
    const ext = /\.3mf$/i.test(gcodePath) ? '3mf' : 'gcode';
    const remoteName = `khayt-${Date.now().toString(36)}.${ext}`;
    try {
      await bambuFtpUpload({ host: printerHost, accessCode, remoteName, data: bytes });
      if (startPrint) await bambu.bambuSendPrint({ host: printerHost, accessCode, serial: dev, fileName: remoteName });
      return { ok: true, started: !!startPrint, filename: remoteName };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }
  const base = `http://${printerHost}:${portNum}`;
  const name = `khayt-${Date.now().toString(36)}.gcode`;
  const ok = (res) => (res.status >= 200 && res.status < 300) ? { ok: true, started: !!startPrint, filename: name } : { ok: false, error: `Printer responded ${res.status}` };
  try {
    if (type === 'octoprint' || type === 'moonraker') {
      const fd = new FormData();
      fd.set('file', new Blob([bytes], { type: 'text/plain' }), name);
      let url, headers = {};
      if (type === 'octoprint') { fd.set('select', 'true'); fd.set('print', startPrint ? 'true' : 'false'); url = `${base}/api/files/local`; headers['X-Api-Key'] = apiKey || ''; }
      else { fd.set('root', 'gcodes'); fd.set('print', startPrint ? 'true' : 'false'); url = `${base}/server/files/upload`; if (apiKey) headers['X-Api-Key'] = apiKey; }
      return ok(await fetch(url, { method: 'POST', headers, body: fd, signal: AbortSignal.timeout(60000) }));
    }
    if (type === 'prusalink') {
      // PrusaLink v1: PUT raw G-code to USB storage; Print-After-Upload auto-starts.
      return ok(await fetch(`${base}/api/v1/files/usb/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'X-Api-Key': apiKey || '', 'Content-Type': 'application/octet-stream', 'Print-After-Upload': startPrint ? '1' : '0' },
        body: bytes, signal: AbortSignal.timeout(60000),
      }));
    }
    return { ok: false, error: `Send-to-printer isn't supported for ${type || 'this printer'} yet (OctoPrint, Moonraker, PrusaLink, Bambu Lab).` };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// Send an already-sliced G-code file straight to a printer (no slicing).
ipcMain.handle('hub:printer-send-gcode', async (_e, { machine, gcodePath, startPrint } = {}) => {
  try {
    if (!gcodePath || !fs.existsSync(gcodePath)) return { ok: false, error: 'G-code file not found.' };
    return await uploadGcodeToPrinter(machine, gcodePath, startPrint);
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:slice-and-print', async (_e, { modelPath, slicerPath, args, machine, startPrint } = {}) => {
  let outDir;
  try {
    const r = await runSlice({ modelPath, slicerPath, args });
    if (!r.ok) return r;
    outDir = r.outDir;
    const up = await uploadGcodeToPrinter(machine, r.gcodePath, startPrint);
    return up.ok ? { ok: true, meta: r.meta, ...up } : up;
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  finally { rmDir(outDir); }
});

// Print an order's attached file straight to a machine: resolve the file inside
// the order-files folder (confined), slice it if it's a model or upload directly
// if it's already G-code, then start the print.
ipcMain.handle('hub:print-order-file', async (_e, { orderFile, machine, slicerPath, args, startPrint } = {}) => {
  let outDir;
  try {
    const full = path.join(orderFilesDir(), path.basename(String(orderFile || '')));
    if (!orderFile || !fs.existsSync(full)) return { ok: false, error: 'Attached file not found.' };
    if (/\.(gcode|gco|g|nc)$/i.test(full)) return await uploadGcodeToPrinter(machine, full, startPrint);
    const r = await runSlice({ modelPath: full, slicerPath, args });
    if (!r.ok) return r;
    outDir = r.outDir;
    const up = await uploadGcodeToPrinter(machine, r.gcodePath, startPrint);
    return up.ok ? { ok: true, meta: r.meta, ...up } : up;
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  finally { rmDir(outDir); }
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
  // Force a .html extension. The file is written then shell.openPath'd, so a
  // renderer-supplied name like "x.hta" / "x.url" / "x.command" would otherwise
  // be launched by a native OS handler (e.g. mshta) → host code execution.
  // Stripping the extension and appending .html makes it open in the browser.
  const baseName = String(filename || 'status').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]*$/, '');
  const safeName = (baseName || 'status') + '.html';
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
      title: `${FLAVOR_NAME} — Secure Storage`,
      message: 'Your API keys are encrypted',
      detail:
        `${FLAVOR_NAME} encrypts sensitive credentials — ZATCA keys, printer API tokens, ` +
        `payment gateway secrets, and email passwords — using ${storeName}.\n\n` +
        `This is the same secure storage that protects your browser passwords and ` +
        `iCloud data. Nothing is sent to any server.\n\n` +
        `${process.platform === 'darwin'
          ? `macOS will ask for permission once. Click "Always Allow" so ${FLAVOR_NAME} can read these keys each time it opens.`
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
  // No keychain explanation here. This handler reads raw JSON, validates it and
  // MASKS secrets for the renderer — it never decrypts, so it never touches the
  // keychain. The explanation used to await a modal on this path, which meant a
  // fresh install hung at boot forever if the dialog was missed or dismissed by
  // the OS. It now gates the operations that actually reach the keychain: save
  // (encrypt) and restore (decrypt), below.
  try {
    // Read the best available copy, transparently recovering from a crash (completed .tmp
    // or previous-generation .prev) and quarantining an unreadable primary so it's never
    // overwritten. This closes the window where a corrupt/partial read led the app to run
    // on empty state and then overwrite the good file on the next save.
    const rec = recoverStoreRaw(50_000_000);
    if (!rec.data) {
      if (!rec.existed) return null; // genuinely a fresh install
      console.error('hub:load-store: store unreadable; quarantined to', rec.quarantined);
      return { __corrupt: true, error: 'Store unreadable', quarantined: rec.quarantined };
    }
    if (rec.source !== 'primary') console.warn('hub:load-store: recovered store from', rec.source, rec.quarantined ? `(quarantined ${rec.quarantined})` : '');
    // Remember which schema wrote this file, so a save cannot truncate a newer store.
    _diskStoreVersion = (rec.data && typeof rec.data.version === 'number') ? rec.data.version : null;
    // Insurance against THIS build's own migrations being wrong. Taken from
    // rec.data — the raw bytes just read — because the normalize step below is an
    // allowlist, and losing an unrecognised collection is one of the things being
    // insured against. Best-effort: a shop must still be able to open its app if
    // the backups directory is unwritable, so a failure here is logged, not fatal.
    try { writePreUpgradeBackup(rec.data, _diskStoreVersion); }
    catch (e) { console.error('hub:load-store: pre-upgrade backup failed:', e && e.message || e); }
    syncLanServerStoreFromDisk();
    const { normalized, warnings, errors } = normalizeStoreSnapshot(rec.data);
    if (!normalized) {
      console.error('hub:load-store: unrecoverable store shape:', errors.join('; '));
      return { __corrupt: true, error: errors[0] || 'Invalid store' };
    }
    if (errors.length) console.warn('hub:load-store: recovered with issues:', errors.join('; '));
    if (warnings.length) console.warn('hub:load-store:', warnings.join('; '));
    // Mask secrets — renderer must not receive plaintext credentials
    const masked = maskStoreSecretsForRenderer(normalized);
    if (rec.source && rec.source !== 'primary') masked.__recovered = rec.source;
    return masked;
  } catch (e) {
    console.error('hub:load-store error:', e);
    return { __corrupt: true, error: String(e.message || e) };
  }
});

// ── Printer discovery (mDNS) ────────────────────────────────────────────────
// Owner-initiated LAN scan: multicast a DNS-SD query for the printer service types and
// collect answers for a few seconds. Nothing leaves the local network, nothing runs on a
// timer, and nothing is written to the store — the renderer shows candidates and the
// owner picks. See lib/mdns.js for why this is hand-rolled rather than a dependency.
ipcMain.handle('hub:discover-printers', async (_e, { timeoutMs } = {}) => {
  const dgram = require('dgram');
  const Mdns = require('./lib/mdns.js');
  const Discovery = require('./lib/printer-discovery.js');
  // Bounded so a wedged socket can't hold the dialog open indefinitely.
  const window_ = Math.max(2000, Math.min(15000, Number(timeoutMs) || 6000));

  return await new Promise((resolve) => {
    let socket;
    let settled = false;
    const records = [];
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { socket && socket.close(); } catch { /* already closed */ }
      resolve(result);
    };
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch (e) {
      return finish({ ok: false, error: 'socket_failed', detail: String(e.message || e) });
    }
    socket.on('error', (e) => finish({ ok: false, error: 'socket_error', detail: String(e.message || e) }));
    socket.on('message', (msg) => {
      try { records.push(...Mdns.decodeMessage(msg)); } catch { /* ignore junk */ }
    });
    socket.bind(Mdns.MDNS_PORT, () => {
      // Joining the group is what makes this reliable: some responders (the Prusa CORE
      // One among them) only ever answer by multicast and ignore the unicast-response
      // bit, so a query-and-listen-on-our-own-port scan silently misses them.
      try { socket.addMembership(Mdns.MDNS_ADDR); } catch { /* not fatal */ }
      const query = Mdns.encodeQuery(Discovery.SERVICE_NAMES);
      const send = () => {
        try { socket.send(query, 0, query.length, Mdns.MDNS_PORT, Mdns.MDNS_ADDR); } catch { /* closed */ }
      };
      // Retransmit: responders suppress answers they have already given recently, so a
      // single query can miss a printer that replied moments ago. Observed on real
      // hardware — one query found the Snapmaker but not the Prusa.
      [0, 900, 2200, 4000].filter(d => d < window_).forEach(d => setTimeout(send, d));
      setTimeout(() => {
        let printers = [];
        try { printers = Discovery.discoverFromRecords(records); } catch { printers = []; }
        finish({ ok: true, printers });
      }, window_);
    });
  });
});

// ── Webcam snapshot proxy ───────────────────────────────────────────────────
// A webcam lives on the LAN, so unlike outbound webhooks we CANNOT blanket-block private
// addresses here. The safety property instead is that the URL is pinned: a snapshot may
// only be fetched from the same host already configured as that machine's printer API, so
// this cannot be used as an SSRF pivot to arbitrary internal services.
/**
 * Ask a printer what camera it has, instead of making the owner type two URLs.
 *
 * lib/webcam.js has been able to read both Moonraker's and OctoPrint's answers
 * since the webcam feature landed, and nothing ever asked them — the parsers
 * were exported and unit-tested with no caller anywhere in the product.
 *
 * Reads only. Same host pinning as the snapshot proxy below: the URL is derived
 * from the machine's OWN printerApi and never taken from the renderer, so this
 * cannot be pointed at an arbitrary address.
 */
ipcMain.handle('hub:webcam-detect', async (_e, { machineId } = {}) => {
  try {
    const Webcam = require('./lib/webcam.js');
    const machines = (lanServerStore && lanServerStore.machines) || [];
    const m = machines.find(x => x && x.id === machineId);
    if (!m) return { ok: false, error: 'unknown_machine' };
    const url = Webcam.detectUrlFor(m.printerApi);
    // Duet, PrusaLink and Bambu publish no equivalent list; say so rather than
    // guessing a path and reporting the 404 as "no camera".
    if (!url) return { ok: false, error: 'unsupported_printer' };
    const res = await fetch(url, {
      redirect: 'manual',
      headers: Webcam.authHeadersFor(m.printerApi),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const body = await res.json().catch(() => null);
    if (!body) return { ok: false, error: 'bad_response' };
    const found = Webcam.parseDetected(body, m.printerApi);
    // A Snapmaker U1 on STOCK firmware lands here: the endpoint exists and
    // answers with an empty list. That is a real answer — "this printer has no
    // camera registered" — not a failure, and the caller says so.
    if (!found) return { ok: false, error: 'no_camera_registered' };
    const guard = Webcam.assertSameHostAsPrinter(found.snapshotUrl || found.streamUrl, m.printerApi);
    if (!guard.ok) return { ok: false, error: guard.reason };
    return { ok: true, webcam: found };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('hub:webcam-snapshot', async (_e, { machineId } = {}) => {
  try {
    const Webcam = require('./lib/webcam.js');
    const machines = (lanServerStore && lanServerStore.machines) || [];
    const m = machines.find(x => x && x.id === machineId);
    if (!m) return { ok: false, error: 'unknown_machine' };
    if (!Webcam.hasCamera(m)) return { ok: false, error: 'camera_off' };
    // Snapshot ONLY — never fall back to streamUrl. An MJPEG stream has no end, so
    // buffering one here would just accumulate memory until the timeout fires.
    const url = Webcam.snapshotUrlFor(m);
    if (!url) return { ok: false, error: 'no_snapshot_url' };
    const guard = Webcam.assertSameHostAsPrinter(url, m.printerApi);
    if (!guard.ok) return { ok: false, error: guard.reason };
    // Cameras behind an authenticated API need the machine's own credential — PrusaLink
    // returns 401 for /api/v1/cameras/snap without one, so an unauthenticated proxy
    // derives a perfectly correct URL that can never load. Only ever sent to the pinned
    // printer host checked immediately above, never to an arbitrary URL.
    const res = await fetch(url, {
      redirect: 'manual',
      headers: Webcam.authHeadersFor(m.printerApi),
      signal: AbortSignal.timeout(6000),
    });
    // Decide from headers BEFORE reading the body, so an oversized or non-image response
    // is refused without being buffered into memory first.
    const pre = Webcam.checkSnapshotHeaders(res.status, res.headers.get('content-type'), res.headers.get('content-length'));
    if (!pre.ok) return { ok: false, error: pre.reason };
    const buf = Buffer.from(await res.arrayBuffer());
    // Backstop for a response that declared no content-length.
    if (buf.length > Webcam.MAX_SNAPSHOT_BYTES) return { ok: false, error: 'too_large' };
    const type = String(res.headers.get('content-type') || '');
    return { ok: true, dataUrl: `data:${type.split(';')[0]};base64,${buf.toString('base64')}` };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// ── Telemetry (TELEMETRY-SPEC) ──────────────────────────────────────────────
// OFF by default and gated on explicit per-stream consent. Scrubbing happens HERE — the
// single trusted choke point — and the transport only ever accepts scrubber output, so an
// unscrubbed send is impossible by construction. There is no endpoint yet: events are
// queued locally only. Nothing is transmitted anywhere.
const TELEMETRY_QUEUE_FILE = () => path.join(app.getPath('userData'), 'telemetry-queue.json');

function telemetryConsent() {
  const tm = (lanServerStore && lanServerStore.settings && lanServerStore.settings.telemetry) || {};
  return { crash: !!tm.crashOptIn, usage: !!tm.usageOptIn, installId: tm.installId || '' };
}

function readTelemetryQueue() {
  try { return JSON.parse(fs.readFileSync(TELEMETRY_QUEUE_FILE(), 'utf8')) || []; } catch { return []; }
}

function enqueueTelemetry(kind, rawPayload) {
  try {
    const consent = telemetryConsent();
    if (kind === 'crash' && !consent.crash) return;
    if (kind === 'usage' && !consent.usage) return;
    const Scrub = require('./lib/telemetry-scrub.js');
    // Fail closed: a scrubber throw drops the event rather than risking raw data.
    const payload = kind === 'crash'
      ? Scrub.buildCrashReport({ ...rawPayload, installId: consent.installId })
      : Scrub.buildUsageEvent({ ...rawPayload, installId: consent.installId });
    if (!payload) return;
    let q = readTelemetryQueue();
    q.push({ kind, payload, at: new Date().toISOString() });
    q = Scrub.dedupeCrashes(Scrub.boundQueue(q, 200));
    fs.writeFileSync(TELEMETRY_QUEUE_FILE(), JSON.stringify(q), 'utf8');
  } catch (_) { /* telemetry must never break or crash the app */ }
}

// Opt-out purges everything queued locally, immediately.
ipcMain.handle('hub:telemetry-purge', async () => {
  try { fs.unlinkSync(TELEMETRY_QUEUE_FILE()); } catch (_) {}
  return { ok: true };
});

ipcMain.handle('hub:telemetry-record', async (_e, { kind, payload } = {}) => {
  enqueueTelemetry(kind === 'usage' ? 'usage' : 'crash', payload || {});
  return { ok: true };
});

// Never crash the app in order to report a crash.
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  enqueueTelemetry('crash', {
    type: 'uncaughtException', name: err && err.name, message: err && err.message,
    stack: err && err.stack, process: 'main', appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    osFamily: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osMajor: String(require('os').release() || '').split('.')[0],
  });
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  const err = reason instanceof Error ? reason : new Error(String(reason));
  enqueueTelemetry('crash', {
    type: 'unhandledRejection', name: err.name, message: err.message, stack: err.stack,
    process: 'main', appVersion: app.getVersion(), electronVersion: process.versions.electron,
    osFamily: process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux',
    osMajor: String(require('os').release() || '').split('.')[0],
  });
});

// Mint a scoped API token. Crypto + hashing live in the main process; the renderer
// receives the plaintext ONCE (to show the owner) plus the hash-only record to persist.
ipcMain.handle('hub:mint-api-token', async (_e, { label, scopes } = {}) => {
  try {
    const ApiTokens = require('./lib/api-tokens.js');
    const { token, record } = ApiTokens.generateToken({ label, scopes });
    return { ok: true, token, record };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

// Set at load time from the store actually on disk. A store written by a NEWER Khayt
// contains collections this build does not know about, and normalizeStoreSnapshot is an
// allowlist — it drops them. Loading such a store and saving once would therefore delete
// that version's data permanently, with only a console warning. Refuse instead.
let _diskStoreVersion = null;

ipcMain.handle('hub:save-store', async (event, data) => {
  try {
    if (typeof _diskStoreVersion === 'number' && _diskStoreVersion > STORE_VERSION) {
      const msg = `This data file was written by a newer version of Khayt (v${_diskStoreVersion}); this build supports v${STORE_VERSION}. Not saving, so nothing is lost — please update Khayt.`;
      console.error('hub:save-store:', msg);
      return { ok: false, error: msg };
    }
    // Once the quit flush has completed the renderer's state is already on disk.
    // Anything arriving after it is redundant — in practice the `pagehide`
    // backstop in app-boot.js firing as the window tears down — and it is not
    // harmless: atomicWriteStore renames the primary to .prev BEFORE moving the
    // new temp into place, so a write killed by app.quit() between those two
    // renames leaves no khayt-store.json at all. recoverStoreRaw() heals that on
    // next launch from .tmp/.prev, but the window should not exist. Refusing
    // costs nothing (the snapshot is identical) and closes it.
    if (_flushedForQuit) return { ok: true, skipped: 'quit-flush-already-completed' };

    const { normalized, errors } = normalizeStoreSnapshot(data);
    if (!normalized) {
      console.error('hub:save-store: unrecoverable store shape:', errors.join('; '));
      return { ok: false, error: errors[0] || 'Invalid store' };
    }
    if (errors.length) console.warn('hub:save-store: salvaged with issues:', errors.join('; '));
    const merged = mergeStoreSecretsFromDisk(normalized);
    // First real keychain write. Explain once, before encryptForDisk triggers
    // the OS permission prompt — but only when there is actually a plaintext
    // secret to encrypt, so a shop that never configures a credential is never
    // asked. Never awaited on the load path, so it cannot stall boot.
    // ...but NOT while quitting. This handler is also what the quit flush runs
    // through, and a modal here has no one to dismiss it: the renderer waits on
    // a reply that cannot come, before-quit's 10s bound fires, and app.quit()
    // runs with the write never started — the pending edit is lost, which is
    // precisely what the quit handshake exists to prevent. The explanation is
    // informational; losing the save is not. Explain next launch instead.
    if (!_quittingNow && hasPlaintextSecrets(merged)) {
      await maybeShowKeychainExplanation(BrowserWindow.fromWebContents(event.sender));
    }
    const serialized = JSON.stringify(encryptForDisk(merged));
    // Write-side guard: mirror the 50 MB read-side limit from hub:load-store.
    // Prevents runaway data-URL or blob embedding from silently bloating the store.
    if (serialized.length > 50_000_000) {
      console.error('hub:save-store: refusing to write store exceeding 50 MB');
      return { ok: false, error: 'Store too large' };
    }
    // Atomic + durable: fsync'd temp swap, with a one-generation .prev rollback.
    await atomicWriteStore(serialized);
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
  // Report the truth. Swallowing the error and returning true removed the entry from the
  // UI and told the owner the file was deleted while it remained on disk — a locked file
  // on Windows, or a permissions error, both common. Khayt promises customers in the
  // intake notice that their data can be deleted on request, so a delete that only
  // pretends to succeed undermines that.
  try { await fs.promises.unlink(safe); } catch (e) {
    if (e && e.code === 'ENOENT') return true; // already gone — the desired end state
    console.error('hub:delete-vault-file:', e);
    return false;
  }
  return true;
});

// --- 3.1: Print-file library (standalone, order-independent) ---
// A per-record subfolder under userData/print-files-vault/<id>/ holds the model
// file plus its generated thumbnail/photo. All handlers are path-confined to that
// root; nothing here touches the network (offline contract).
const PLL = require('./lib/print-library-location');
const PLM = require('./lib/print-library-migrate');
const ZIPR = require('./lib/zip-read');
const ZIPI = require('./lib/zip-intake');
const S3C = require('./lib/s3-client');

/** The built-in vault — where the library lived when it could only live here. */
const printLibDefaultRoot = () => ensureDir('print-files-vault');

/** settings.printLibrary, from main's live copy of the store, or off disk on the
 *  first call before the renderer has saved anything. */
function printLibSettings() {
  const cached = lanServerStore && lanServerStore.settings && lanServerStore.settings.printLibrary;
  if (cached) return cached;
  try { return readStoreDecryptedFromDisk()?.settings?.printLibrary || {}; } catch (_) { return {}; }
}

const printLibRoots = () => PLL.resolveRoots(printLibSettings(), printLibDefaultRoot());

/**
 * Can the library be written to right now?
 *
 * Probed rather than assumed: a share that was mounted at launch can be gone by
 * the time someone adds a file. Returns the verdict AND the folder, because a
 * message that does not name the folder sends the shop to the app's settings
 * when the problem is in the Finder.
 */
function printLibStatus() {
  const { primary, isCustom } = printLibRoots();
  // The built-in folder is ours to create; a folder the shop chose is not, and
  // silently creating it would hide a mistyped path or an unmounted share.
  if (!isCustom) { printLibDefaultRoot(); return { ok: true, reason: 'ok', root: primary }; }
  let probe = { exists: false, isDirectory: false, writable: false };
  try {
    const st = fs.statSync(primary);
    probe = { exists: true, isDirectory: st.isDirectory(), writable: false };
    fs.accessSync(primary, fs.constants.W_OK);
    probe.writable = true;
  } catch (_) { /* leave the probe as it stands */ }
  const v = PLL.verdict(probe);
  return { ok: v.ok, reason: v.reason, root: primary, error: PLL.explain(v.reason, primary) };
}

/** Throws a message worth showing when the library cannot be written to. */
function requirePrintLib() {
  const st = printLibStatus();
  if (!st.ok) throw new Error(st.error || 'The print library folder is unavailable.');
  return st.root;
}

// Reads do NOT go through requirePrintLib(). A read that throws when the share is
// away turns "no files here" into an unhandled rejection in every caller that
// merely wanted to know whether a record has a file. Writes refuse loudly;
// reads simply find nothing, and hub:printlib-status is what tells the shop why
// the library looks empty.
const printLibDir = () => printLibRoots().primary;
const printLibItemDir = (id) => path.join(printLibRoots().primary, PLL.itemDirName(id));

/** Is this path part of the library, wherever the library has ever lived? */
const printLibContains = (p) => PLL.insideLibrary(p, printLibRoots().roots);

/** The same record folder under the mirror, or null when no mirror is set. */
function printLibMirrorItemDir(id) {
  const { mirror } = printLibRoots();
  return mirror ? path.join(mirror, PLL.itemDirName(id)) : null;
}

/** The bucket the library is backed up to, or null. */
function printLibS3() {
  const cfg = (printLibSettings() || {}).s3;
  if (!cfg || !cfg.enabled || !S3C.isConfigured(cfg)) return null;
  return { client: S3C.createS3(cfg), prefix: cfg.prefix || '' };
}

/**
 * Copy a file that was just written to wherever the shop keeps its backups.
 *
 * A folder and a bucket are the same job here — write-through, after the primary
 * has succeeded — so they share one function and one report. Both are
 * best-effort and NEITHER is ever read from: a backup you read from is a second
 * primary, and the two drift.
 *
 * Best-effort, but not silent. A backup that can fail a save is a second thing
 * to go wrong; a backup that fails without saying so is worse, because the shop
 * believes it has one. The primary write stands and the handler reports what
 * landed.
 *
 * @returns {null|{folder: boolean|null, s3: boolean|null}} null when no backup
 *   is configured at all.
 */
async function printLibMirrorFile(id, filename, srcPath) {
  const dir = printLibMirrorItemDir(id);
  const s3 = printLibS3();
  if (!dir && !s3) return null;
  const out = { folder: null, s3: null };
  if (dir) {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.copyFile(srcPath, path.join(dir, filename));
      out.folder = true;
    } catch (e) {
      console.error('printlib mirror (folder):', e.message);
      out.folder = false;
    }
  }
  if (s3) {
    try {
      // Read once, here, rather than streaming: these are model files, the
      // upload is already bounded by INTAKE_MAX_BYTES upstream, and a Buffer is
      // what keeps the bytes intact — a string round trip corrupts binary.
      const buf = await fs.promises.readFile(srcPath);
      await s3.client.put(S3C.objectKey(s3.prefix, id, filename), buf);
      out.s3 = true;
    } catch (e) {
      console.error('printlib mirror (s3):', e.message);
      out.s3 = false;
    }
  }
  return out;
}

/**
 * Where the library is, and whether it can be reached right now.
 *
 * The renderer asks this to show the shop why the library looks empty, which is
 * the counterpart to writes failing loudly: refusing a save without ever saying
 * the NAS is unmounted just moves the confusion somewhere else.
 */
ipcMain.handle('hub:printlib-status', async () => {
  const { primary, mirror, isCustom, roots } = printLibRoots();
  const st = printLibStatus();
  let mirrorOk = null;
  if (mirror) {
    try { mirrorOk = fs.statSync(mirror).isDirectory(); } catch (_) { mirrorOk = false; }
  }
  const s3cfg = (printLibSettings() || {}).s3 || {};
  const s3 = !!(s3cfg.enabled && S3C.isConfigured(s3cfg));
  return { ok: st.ok, reason: st.reason, error: st.error || '', root: primary, isCustom, mirror, mirrorOk, roots, s3, s3Bucket: s3 ? s3cfg.bucket : '' };
});

/** Choose a folder for the library, or for its mirror. */
/**
 * Prove the bucket works, with a real round trip.
 *
 * Credentials that look right and a bucket that refuses writes are
 * indistinguishable until the first model fails to upload — by which time the
 * shop believes it has a backup. Writes, reads back, compares, deletes.
 */
ipcMain.handle('hub:printlib-s3-test', async () => {
  const cfg = (printLibSettings() || {}).s3;
  if (!cfg || !S3C.isConfigured(cfg)) return { ok: false, error: 'Fill in the endpoint, bucket, key and secret first.' };
  const key = S3C.objectKey(cfg.prefix || '', '_khayt-check', `probe-${Date.now().toString(36)}.bin`);
  const payload = crypto.randomBytes(64);
  const s3 = S3C.createS3(cfg);
  try {
    await s3.put(key, payload);
    const back = await s3.get(key);
    await s3.del(key);
    if (!back || !Buffer.from(back).equals(payload)) {
      return { ok: false, error: 'The bucket accepted the file but returned something different.' };
    }
    return { ok: true, bucket: cfg.bucket, endpoint: cfg.endpoint };
  } catch (e) {
    try { await s3.del(key); } catch (_) { /* nothing to clean up */ }
    return { ok: false, error: String((e && e.message) || e) };
  }
});

/**
 * Every file under a root, as paths relative to it.
 *
 * Relative, because that is what makes the destination obvious: the same
 * relative path under the new root. Item folders hold thumbnails and photos
 * beside the models, and nothing here needs to know which is which.
 */
async function printLibWalk(root, rel = '', out = []) {
  let entries;
  try {
    entries = await fs.promises.readdir(path.join(root, rel), { withFileTypes: true });
  } catch (_) { return out; }              // an unmounted share scans as empty
  for (const e of entries) {
    if (e.name === '.DS_Store') continue;
    const childRel = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) { await printLibWalk(root, childRel, out); continue; }
    if (!e.isFile()) continue;             // symlinks are not ours to relocate
    try {
      const st = await fs.promises.stat(path.join(root, childRel));
      out.push({ root, rel: childRel, size: st.size });
    } catch (_) { /* vanished mid-scan */ }
  }
  return out;
}

/** Streamed, because a library holds files far larger than we want in memory. */
function printLibHashFile(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(p);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

/** Free bytes on the volume holding a path, or null when we cannot tell. */
async function printLibFreeSpace(dir) {
  try {
    const st = await fs.promises.statfs(dir);       // Node 18.15+
    return Number(st.bavail) * Number(st.bsize);
  } catch (_) { return null; }
}

/** The real filesystem, in the shape PLM.moveOne takes it. */
const printLibMoveIO = {
  hash: printLibHashFile,
  exists: async (p) => fs.existsSync(p),
  readdir: async (d) => { try { return await fs.promises.readdir(d); } catch (_) { return []; } },
  mkdir: (d) => fs.promises.mkdir(d, { recursive: true }),
  copy: (a, b) => fs.promises.copyFile(a, b),
  unlink: (p) => fs.promises.unlink(p),
};

/** Everything sitting somewhere the library no longer reads from. */
async function printLibStrandedFiles() {
  const { primary, mirror, roots } = printLibRoots();
  const from = PLM.sources(roots, primary, mirror);
  const items = [];
  for (const root of from) items.push(...await printLibWalk(root));
  return items;
}

/**
 * What is stranded, and whether it will fit.
 *
 * A preview, not a plan to execute later: the run re-scans. Acting on a list
 * gathered minutes ago would move files the shop has since deleted and miss the
 * ones they added.
 */
ipcMain.handle('hub:printlib-migrate-scan', async () => {
  try {
    const { primary } = printLibRoots();
    const items = await printLibStrandedFiles();
    const sum = PLM.summarize(items);
    const free = await printLibFreeSpace(path.dirname(primary));
    return { ok: true, ...sum, to: primary, space: PLM.enoughSpace(sum.bytes, free) };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// One at a time. Two runs over the same files would each see the other's
// half-finished copies, and "the destination already exists" is a branch that
// ends in a deleted source.
let printLibMigrating = false;

/**
 * Move the stranded files in.
 *
 * Copy, read back, compare hashes, and only then remove the source. Not rename:
 * across volumes it fails outright (EXDEV), and where it does work it leaves no
 * window in which to check that the bytes arrived. A copy that returns without
 * throwing is not proof — a short write to a share that dropped mid-transfer
 * does exactly that.
 *
 * Nothing is overwritten, and no source is removed unless its bytes are proven
 * to exist at the destination. Anything that fails is left exactly as it was
 * and reported by name.
 */
ipcMain.handle('hub:printlib-migrate-run', async (event) => {
  if (printLibMigrating) return { ok: false, error: 'A move is already running.' };
  printLibMigrating = true;
  const report = { ok: true, moved: 0, duplicates: 0, collisions: 0, failed: 0, bytes: 0, errors: [] };
  try {
    requirePrintLib();                                   // refuse before touching anything
    const { primary } = printLibRoots();
    const items = await printLibStrandedFiles();
    const space = PLM.enoughSpace(PLM.summarize(items).bytes, await printLibFreeSpace(path.dirname(primary)));
    if (!space.ok) {
      return { ok: false, error: `Not enough room in ${primary} — ${Math.ceil(space.shortBy / 1e6)} MB short.` };
    }
    const send = (p) => { try { event.sender.send('hub:printlib-migrate-progress', p); } catch (_) { /* window gone */ } };

    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      const src = path.join(it.root, it.rel);
      send({ done: i, total: items.length, file: path.basename(it.rel) });
      try {
        const r = await PLM.moveOne(printLibMoveIO, src, path.join(primary, path.dirname(it.rel)), path.basename(it.rel));
        if (r.action === PLM.SAME) { report.duplicates += 1; continue; }
        if (r.action === PLM.COLLISION) report.collisions += 1;
        report.moved += 1;
        report.bytes += it.size;
      } catch (e) {
        report.failed += 1;
        report.errors.push(`${it.rel}: ${String((e && e.message) || e)}`);
      }
    }
    send({ done: items.length, total: items.length, file: '' });

    // Tidy the folders we emptied. Only ever empty ones, and never a root.
    for (const root of PLM.sources(printLibRoots().roots, primary, printLibRoots().mirror)) {
      const dirs = new Set(items.filter((i) => i.root === root).map((i) => path.dirname(i.rel)).filter((d) => d && d !== '.'));
      for (const d of dirs) {
        try { await fs.promises.rmdir(path.join(root, d)); } catch (_) { /* not empty, and that is fine */ }
      }
    }
    return report;
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    printLibMigrating = false;
  }
});

/**
 * Fold the root we are leaving into the ones this install remembers.
 *
 * The renderer owns the store, so it does the saving — but the decision lives in
 * a tested module rather than in four lines of renderer that nothing checks.
 * Called before the new root is saved, so printLibSettings() still reports the
 * old one. Pass '' to go back to the built-in folder.
 */
ipcMain.handle('hub:printlib-remember-root', async (_e, nextRoot) => (
  { history: PLM.rememberRoot(printLibSettings(), String(nextRoot || ''), printLibDefaultRoot()).history }
));

ipcMain.handle('hub:printlib-pick-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose a folder for the print library',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths.length) return null;
  const dir = r.filePaths[0];
  try {
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (_) {
    return { ok: false, error: `No permission to write to ${dir}.` };
  }
  return { ok: true, path: dir };
});

ipcMain.handle('hub:printlib-pick-and-copy', async (event, id) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Add print file',
    filters: [
      { name: '3D Print Files', extensions: ['stl', '3mf', 'obj', 'gcode', 'gco', 'zip'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const src = result.filePaths[0];
  const originalName = path.basename(src);
  const ext = path.extname(originalName).slice(1).toLowerCase() || 'bin';
  let contentHash = null;
  try { contentHash = modelContentHash(await fs.promises.readFile(src)); } catch (_) { contentHash = null; }
  requirePrintLib();                       // refuses, by name, before anything is copied
  const dir = printLibItemDir(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `model-${Date.now().toString(36)}.${ext}`;
  const destPath = path.join(dir, filename);
  await fs.promises.copyFile(src, destPath);
  const stat = await fs.promises.stat(destPath);
  const mirrored = await printLibMirrorFile(id, filename, destPath);
  return { filename, originalName, size: stat.size, ext, fullPath: destPath, contentHash, mirrored };
});

// Pick MANY print files at once — returns the chosen source paths (no copy). The renderer then copies
// each into its own record's vault via printlib-copy-path, reusing the drag-and-drop ingest path.
ipcMain.handle('hub:printlib-pick-multi', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Add print files',
    filters: [
      { name: '3D Print Files', extensions: ['stl', '3mf', 'obj', 'gcode', 'gco', 'zip'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  return { ok: true, paths: result.filePaths };
});

// Copy a KNOWN file path (e.g. from a drag-and-drop) into a record's vault — the no-dialog twin of
// pick-and-copy. Extension-gated to real print files so a stray drop can't smuggle in something else.
ipcMain.handle('hub:printlib-copy-path', async (_e, { id, srcPath } = {}) => {
  try {
    const src = path.resolve(String(srcPath || ''));
    if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) return { ok: false, error: 'File not found.' };
    const originalName = path.basename(src);
    const ext = path.extname(originalName).slice(1).toLowerCase();
    if (!/^(stl|3mf|obj|gcode|gco)$/.test(ext)) return { ok: false, error: 'Not a print file (need STL, 3MF, OBJ or G-code).' };
    // Hash the SOURCE, before the copy. A file the shop already has should be
    // recognised without first writing a second copy of it into the library.
    let contentHash = null;
    try { contentHash = modelContentHash(await fs.promises.readFile(src)); } catch (_) { contentHash = null; }

    requirePrintLib();
    const dir = printLibItemDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `model-${Date.now().toString(36)}.${ext}`;
    const destPath = path.join(dir, filename);
    await fs.promises.copyFile(src, destPath);
    const stat = await fs.promises.stat(destPath);
    const mirrored = await printLibMirrorFile(id, filename, destPath);
    return { ok: true, filename, originalName, size: stat.size, ext, fullPath: destPath, contentHash, mirrored };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

/**
 * Unpack the print files from a .zip into a temp folder.
 *
 * Model packs arrive as archives — a Drive download, a Patreon bundle — and
 * every file had to be unzipped by hand and dragged in one at a time.
 *
 * This does NOT create records. It extracts, and the renderer then feeds each
 * file through hub:printlib-copy-path — the ordinary single-file intake, which
 * already hashes, names, mirrors and makes a record. So a six-part pack becomes
 * six records exactly as if they had been unzipped and dropped, which is the
 * hand work this removes, and there is still only one path that ingests a file.
 *
 * The first version of this wrote every member into ONE record's folder while
 * the renderer minted a record per file — leaving records 2..n pointing at files
 * inside record 1's directory, where deleting record 1 would take them.
 *
 * Two things it must not get wrong:
 *
 *   The name on disk comes from the PLAN, never from the zip member. That is the
 *   zip-slip defence — lib/zip-intake.js returns a basename with nothing left to
 *   traverse with, so path.join below cannot escape the temp folder.
 *
 *   Everything not extracted is reported. A budget or filter that drops files
 *   silently is the bug lib/mf-convert.js shipped once.
 */
ipcMain.handle('hub:printlib-unpack-zip', async (_e, { srcPath } = {}) => {
  try {
    const src = path.resolve(String(srcPath || ''));
    if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) return { ok: false, error: 'File not found.' };
    if (!/\.zip$/i.test(src)) return { ok: false, error: 'Not a zip archive.' };

    requirePrintLib();                                  // refuse before reading a large file
    const buf = await fs.promises.readFile(src);
    const entries = ZIPR.listEntries(buf);              // never throws; [] on junk
    const plan = ZIPI.plan(entries);
    if (ZIPI.summarize(plan).empty) {
      return { ok: false, empty: true, skipped: plan.skipped,
        error: 'No STL, 3MF, OBJ or G-code files in that archive.' };
    }

    const os = require('os');   // not module-scoped in this file; see the requires at the top
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'khayt-zip-'));
    const files = [];
    const failed = [];
    for (const t of plan.take) {
      let bytes = null;
      try { bytes = ZIPR.readEntry(buf, t.entry); } catch (_) { bytes = null; }
      // null for an unsupported method (zip64, encrypted) or a member over its
      // own cap. Named, not swallowed.
      if (!bytes) { failed.push(t.from); continue; }
      try {
        // t.name, NOT t.from — the plan's basename is the zip-slip defence.
        const dest = path.join(dir, t.name);
        await fs.promises.writeFile(dest, bytes);
        files.push({ path: dest, name: t.name, from: t.from });
      } catch (_) { failed.push(t.from); }
    }
    return { ok: files.length > 0, dir, files, failed,
      skipped: plan.skipped, truncated: plan.truncated };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

/** Remove a folder made by hub:printlib-unpack-zip, once its files are in. */
ipcMain.handle('hub:printlib-unpack-cleanup', async (_e, dir) => {
  try {
    const os = require('os');
    const safe = path.resolve(String(dir || ''));
    // Confined to our own temp prefix: this deletes recursively, so it must be
    // impossible to point at anything else.
    if (!safe.startsWith(path.join(os.tmpdir(), 'khayt-zip-'))) return false;
    await fs.promises.rm(safe, { recursive: true, force: true });
    return true;
  } catch (_) { return false; }
});

ipcMain.handle('hub:printlib-list', async (_e, id) => {
  const dir = printLibItemDir(id);
  if (!fs.existsSync(dir)) return [];
  const files = await fs.promises.readdir(dir);
  return Promise.all(files.map(async (f) => {
    const fullPath = path.join(dir, f);
    const stat = await fs.promises.stat(fullPath);
    return { filename: f, fullPath, size: stat.size };
  }));
});

ipcMain.handle('hub:printlib-delete', async (_e, fullPath) => {
  const safe = path.resolve(String(fullPath || ''));
  if (!printLibContains(safe)) return false; // confine to the library, wherever it lives
  // Report the truth, like hub:delete-vault-file. Swallowing the error and returning true
  // removed the entry from the library while the file stayed on disk.
  try {
    const stat = await fs.promises.stat(safe);
    if (stat.isDirectory()) await fs.promises.rm(safe, { recursive: true, force: true });
    else await fs.promises.unlink(safe);
  } catch (e) {
    if (e && e.code === 'ENOENT') return true; // already gone — the desired end state
    console.error('hub:printlib-delete:', e);
    return false;
  }
  return true;
});

// Save a generated thumbnail / user photo (data URL from the renderer) into the item folder.
ipcMain.handle('hub:printlib-save-image', async (_e, { id, name, dataUrl } = {}) => {
  try {
    const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return { ok: false, error: 'Unsupported image data' };
    requirePrintLib();
    const dir = printLibItemDir(id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = path.basename(String(name || 'img')).replace(/[^a-zA-Z0-9_.-]/g, '_');
    const dest = path.join(dir, safeName);
    await fs.promises.writeFile(dest, Buffer.from(m[2], 'base64'));
    return { ok: true, filename: safeName, fullPath: dest };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Load a saved image back as a data URL for display.
ipcMain.handle('hub:printlib-load-image', async (_e, fullPath) => {
  const safe = path.resolve(String(fullPath || ''));
  if (!printLibContains(safe)) return null;
  try {
    const buf = await fs.promises.readFile(safe);
    const ext = path.extname(safe).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (_) { return null; }
});

// Open a library model in the user's installed slicer GUI (detached — outlives us).
ipcMain.handle('hub:printlib-open-in-slicer', async (_e, { filePath, slicerPath } = {}) => {
  const safe = path.resolve(String(filePath || ''));
  if (!printLibContains(safe)) return { ok: false, error: 'File is outside the library.' };
  if (!fs.existsSync(safe)) return { ok: false, error: 'File not found.' };
  if (slicerPath && fs.existsSync(slicerPath) && isSafeSlicerBinary(slicerPath)) {
    try {
      const { spawn } = require('node:child_process');
      const child = spawn(slicerPath, [safe], { detached: true, stdio: 'ignore', windowsHide: false });
      child.on('error', () => {});
      child.unref();
      return { ok: true, opened: 'slicer' };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }
  // No slicer configured — fall back to the OS default handler for the file type.
  try { await shell.openPath(safe); return { ok: true, opened: 'os' }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Read a library model file's raw bytes (base64) so the renderer can parse/render an
// STL preview. Confined to the library vault; capped so a giant file can't blow up IPC.
ipcMain.handle('hub:printlib-read-bytes', async (_e, fullPath) => {
  const safe = path.resolve(String(fullPath || ''));
  if (!printLibContains(safe)) return null;
  try {
    const stat = await fs.promises.stat(safe);
    if (stat.size > 60_000_000) return null; // too big to render a thumbnail for
    const buf = await fs.promises.readFile(safe);
    return buf.toString('base64');
  } catch (_) { return null; }
});

// The expensive 3MF/STL work now lives in lib/mf-jobs.js and normally runs in a
// utilityProcess (lib/mf-worker.js) so it can't stop the thread drawing the app.
// mfRun() below is the client every 3MF handler goes through.
const mfJobs = require('./lib/mf-jobs');

// ── the converter's worker process ──────────────────────────────────────────
// One long-lived utilityProcess, forked on first use and reused. Jobs are correlated by
// id, so several can be in flight; the child answers them in order and none of them are
// on this thread.
//
// If the fork fails, jobs run HERE instead — the app converts exactly as it did before,
// freeze and all, rather than losing the feature to a process that wouldn't start. Same
// code either way (lib/mf-jobs.js), so the fallback can't drift from the real path.
//
// The bookkeeping moved to lib/mf-client.js so it could be tested: living here, it
// shipped without a guard for a child that HANGS rather than exits, which left the
// renderer waiting on a promise that would never settle. See test/mf-client.test.js.
const mfClient = require('./lib/mf-client').createMfClient({
  fork: () => utilityProcess.fork(path.join(__dirname, 'lib', 'mf-worker.js'), [], {
    serviceName: 'khayt-3mf',
    stdio: 'ignore',
  }),
  inline: (op, args) => mfJobs.run(op, args),
  onWarn: (m) => { try { console.warn('[3mf]', m); } catch (_) {} },
});

/** Run a lib/mf-jobs op off this thread, or on it if there's no child to run it on. */
function mfRun(op, args) {
  return mfClient.run(op, args);
}

app.on('will-quit', () => { try { mfClient.dispose(); } catch (_) {} });

/**
 * Jobs that produce a file write it to a temp path; this puts it where it belongs once the
 * destination is known (which, for a save dialog, is only after the work is done). Rename
 * when it can, copy when the temp and the destination are on different volumes.
 */
async function mfFinalize(tmpPath, finalPath) {
  try {
    await fs.promises.rename(tmpPath, finalPath);
  } catch (_) {
    await fs.promises.copyFile(tmpPath, finalPath);
    try { await fs.promises.unlink(tmpPath); } catch (_) {}
  }
}
function mfTempPath(ext) {
  return path.join(app.getPath('temp'), `khayt-3mf-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}.${ext}`);
}
async function mfDiscard(tmpPath) {
  if (tmpPath) { try { await fs.promises.unlink(tmpPath); } catch (_) {} }
}

// Mesh for a print file in the vault (STL or 3MF). Confined to the vault, like read-bytes.
ipcMain.handle('hub:printlib-mesh', async (_e, fullPath) => {
  const safe = path.resolve(String(fullPath || ''));
  if (!printLibContains(safe)) return { ok: false };
  try {
    const stat = await fs.promises.stat(safe);
    if (stat.size > 200_000_000) return { ok: false, error: 'too-large' };
    return await mfRun('mesh', { src: safe, maxBytes: 200_000_000 });
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// ── 3MF converter (multi-printer) ───────────────────────────────────────────
// Reading is confined to the app's own folders + any source the user explicitly
// picked through our own open dialog (approved for this session).
//
// Writing is a SEPARATE question, and conflating the two was a hole. Writing needs
// consent for that destination: either the path came back from our own save dialog
// in this same call, or it sits under a folder the user chose in the output-folder
// picker. "The file happens to live somewhere we are allowed to read" is not consent
// to write there — see mfWriteAllowed below.
// A ceiling on the file we're willing to pull into memory at all. 200 MB turned out to be
// under what people actually download: a 229 MB multi-plate poster was refused at every
// converter entry point with "File is too large", which reads as a broken app rather than
// a deliberate limit. 600 MB clears that class of file. What the limit is really guarding —
// unbounded INFLATION — is bounded separately and much more tightly by mf-convert's member
// budget, and normalizing no longer inflates geometry at all.
const MF_MAX_BYTES = 600_000_000;
const approvedConvertSources = new Set();
const approvedConvertDirs = new Set(); // user-picked output folders (batch) — writes allowed under these
function mfAllowedDirs() {
  return [
    app.getPath('userData'), app.getPath('documents'), app.getPath('downloads'),
    app.getPath('desktop'), app.getPath('temp'),
  ].map((d) => path.resolve(d));
}
const convertPaths = require('./lib/convert-paths');

function mfReadAllowed(p) {
  return convertPaths.readAllowed(p, {
    approvedSources: approvedConvertSources,
    approvedDirs: approvedConvertDirs,
    appDirs: mfAllowedDirs(),
  });
}

/**
 * May the renderer have us WRITE here, without asking the user first?
 *
 * Only under a folder the user picked in the output-folder dialog — see
 * lib/convert-paths.js for why that is a different question from reading.
 *
 * Symlinks are resolved on the PARENT directory before the check, and a parent we
 * cannot resolve is refused rather than allowed: the destination file itself usually
 * does not exist yet (that is the point), so it is the directory that has to be real.
 * Without this, a link planted inside an approved output folder would carry the write
 * back out of it.
 */
function mfWriteAllowed(p) {
  const safe = path.resolve(String(p || ''));
  let realParent;
  try {
    realParent = fs.realpathSync(path.dirname(safe));
  } catch (_) {
    return false; // fail closed — an unresolvable destination is not an approved one
  }
  const target = path.join(realParent, path.basename(safe));
  const dirs = [];
  for (const d of approvedConvertDirs) {
    try { dirs.push(fs.realpathSync(d)); } catch (_) { /* dropped folder — no longer approved */ }
  }
  return convertPaths.writeAllowed(target, { approvedDirs: dirs });
}

/**
 * Ask the user where to put a finished file. The answer is theirs, so it needs no
 * further gate; returns null when they cancel.
 */
async function mfAskWhereToSave(sender, { defaultPath, filters }) {
  const win = BrowserWindow.fromWebContents(sender);
  const result = await dialog.showSaveDialog(win, { defaultPath, filters });
  if (result.canceled || !result.filePath) return null;
  return path.resolve(result.filePath);
}

ipcMain.handle('hub:mf-pick', async (_e) => {
  const win = BrowserWindow.fromWebContents(_e.sender);
  const result = await dialog.showOpenDialog(win, {
    filters: [{ name: '3MF model', extensions: ['3mf'] }], properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  const p = path.resolve(result.filePaths[0]);
  approvedConvertSources.add(p);
  return { ok: true, path: p, name: path.basename(p) };
});

// Multi-select 3MF picker for batch conversion.
ipcMain.handle('hub:mf-pick-multi', async (_e) => {
  const win = BrowserWindow.fromWebContents(_e.sender);
  const result = await dialog.showOpenDialog(win, {
    filters: [{ name: '3MF model', extensions: ['3mf'] }], properties: ['openFile', 'multiSelections'],
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  const files = result.filePaths.map((fp) => path.resolve(fp));
  files.forEach((fp) => approvedConvertSources.add(fp));
  return { ok: true, files: files.map((fp) => ({ path: fp, name: path.basename(fp) })) };
});

// Output-folder picker for batch conversion (grants write access under the chosen dir).
ipcMain.handle('hub:mf-pick-outdir', async (_e) => {
  const win = BrowserWindow.fromWebContents(_e.sender);
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  const dir = path.resolve(result.filePaths[0]);
  approvedConvertDirs.add(dir);
  return { ok: true, dir };
});

ipcMain.handle('hub:mf-analyze', async (_e, { path: srcPath } = {}) => {
  try {
    if (!srcPath || !mfReadAllowed(srcPath)) return { ok: false, error: 'File is outside an allowed folder.' };
    return await mfRun('analyze', { src: srcPath, maxBytes: MF_MAX_BYTES });
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// Decimated mesh for a converter SOURCE file (STL or 3MF) — for the "what am I
// converting?" 3D preview. Same allow-list as analyze/convert (picked sources only).
ipcMain.handle('hub:convert-mesh', async (_e, { path: srcPath } = {}) => {
  try {
    if (!srcPath || !mfReadAllowed(srcPath)) return { ok: false, error: 'outside-allowed' };
    return await mfRun('mesh', { src: srcPath, maxBytes: MF_MAX_BYTES });
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

ipcMain.handle('hub:mf-convert', async (_e, { path: srcPath, targetId, mode, slotMap, outPath, intoVaultId, targetProfile, fullSpectrum, fsPhysical, fsPhysicalHex, filaments, process, bandSwap } = {}) => {
  try {
    if (!srcPath || !mfReadAllowed(srcPath)) return { ok: false, error: 'Source file is outside an allowed folder.' };
    // The converted file lands in temp first. The save dialog can only be answered after
    // the work is done, and a 228 MB result has no business travelling back down a pipe
    // just to be written out again from here.
    const tmp = mfTempPath('3mf');
    const r = await mfRun('convert', {
      src: srcPath, maxBytes: MF_MAX_BYTES, tmpOut: tmp,
      opts: { targetId, mode, slotMap, targetProfile, fullSpectrum, fsPhysical, fsPhysicalHex, filaments, process, bandSwap },
    });
    if (!r.ok) { await mfDiscard(tmp); return r; }

    // In-app destination: move the converted 3MF straight into a print-file
    // record's vault (userData/print-files-vault/<id>/), no save dialog.
    if (intoVaultId) {
      const dir = printLibItemDir(intoVaultId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tag = String(targetId || 'out').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) || 'out';
      const filename = `converted-${Date.now().toString(36)}-${tag}.3mf`;
      const dest = path.join(dir, filename);
      await mfFinalize(r.tmpPath, dest);
      const stat = await fs.promises.stat(dest);
      return { ok: true, vault: true, filename, ext: '3mf', size: stat.size, outPath: dest, report: r.report };
    }

    // A renderer-chosen destination is only honoured under a folder the user picked in
    // the output-folder dialog (batch conversion). Anything else asks.
    let finalPath = outPath ? path.resolve(String(outPath)) : null;
    if (finalPath && !mfWriteAllowed(finalPath)) {
      await mfDiscard(r.tmpPath);
      return { ok: false, error: 'Output path is outside the folder you chose for converted files.' };
    }
    if (!finalPath) {
      const base = path.basename(String(srcPath)).replace(/\.3mf$/i, '') + `-${targetId || 'converted'}.3mf`;
      finalPath = await mfAskWhereToSave(_e.sender, {
        defaultPath: base, filters: [{ name: '3MF model', extensions: ['3mf'] }],
      });
      if (!finalPath) { await mfDiscard(r.tmpPath); return { ok: false, canceled: true }; }
    }
    await mfFinalize(r.tmpPath, finalPath);
    return { ok: true, outPath: finalPath, report: r.report };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// Filament presets from the maker's installed Snapmaker Orca / OrcaSlicer, for the converter's
// per-slot "what's loaded" picker. Empty list → the converter falls back to "Generic <type>".
ipcMain.handle('hub:orca-filaments', async () => {
  try {
    const db = require('./lib/orca-db');
    return { ok: true, available: db.available(), filaments: db.listU1Filaments(),
      processes: db.listU1Processes(), defaultProcess: db.defaultU1Process() };
  } catch (e) { return { ok: false, available: false, filaments: [], processes: [], error: String((e && e.message) || e) }; }
});

// The maker's installed-slicer printer catalogue (Snapmaker Orca + OrcaSlicer), for the converter's
// "target any printer" list. Names only — cheap; details resolved on selection via hub:orca-machine-info.
ipcMain.handle('hub:orca-printers', async () => {
  try { const db = require('./lib/orca-db'); return { ok: true, available: db.available(), printers: db.listMachines() }; }
  catch (e) { return { ok: false, available: false, printers: [], error: String((e && e.message) || e) }; }
});

// Resolved details (bed, nozzle, colour slots, process presets) for one catalogue printer.
ipcMain.handle('hub:orca-machine-info', async (_e, { name } = {}) => {
  try {
    const db = require('./lib/orca-db');
    const n = String(name || '');
    return { ok: true, info: db.machineInfo(n), processes: db.listProcessesFor(n), defaultProcess: db.defaultProcessFor(n) };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// Full Spectrum plan preview: which filaments load physically + how the extra colours are mixed.
ipcMain.handle('hub:fs-plan', async (_e, { path: srcPath, targetId, targetProfile, fsPhysical, fsPhysicalHex } = {}) => {
  try {
    if (!srcPath || !mfReadAllowed(srcPath)) return { available: false, error: 'Source file is outside an allowed folder.' };
    return await mfRun('fsPlan', { src: srcPath, maxBytes: MF_MAX_BYTES, opts: { targetId, targetProfile, fsPhysical, fsPhysicalHex } });
  } catch (e) { return { available: false, error: String((e && e.message) || e) }; }
});

// Colour-band analysis: is this painted model cleanly VERTICALLY banded, so a swap-capable printer can
// print every colour EXACTLY via M600 filament-swap pauses (instead of Full-Spectrum mixing)? Read-only.
ipcMain.handle('hub:mf-bands', async (_e, { path: srcPath, heads, pauseGcode } = {}) => {
  try {
    if (!srcPath || !mfReadAllowed(srcPath)) return { available: false, error: 'Source file is outside an allowed folder.' };
    // heads omitted → U1 4-head default (existing converter flow). heads:1 → single-extruder M600 plan.
    return await mfRun('bands', {
      src: srcPath, maxBytes: MF_MAX_BYTES,
      opts: { heads: heads || undefined, pauseGcode: pauseGcode || undefined },
    });
  } catch (e) { return { available: false, error: String((e && e.message) || e) }; }
});

// STL → 3MF: pick an STL and wrap its mesh into a clean generic 3MF any slicer opens.
ipcMain.handle('hub:stl-pick', async (_e) => {
  const win = BrowserWindow.fromWebContents(_e.sender);
  const result = await dialog.showOpenDialog(win, {
    filters: [{ name: 'STL model', extensions: ['stl'] }], properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  const p = path.resolve(result.filePaths[0]);
  approvedConvertSources.add(p);
  return { ok: true, path: p, name: path.basename(p) };
});

ipcMain.handle('hub:stl-to-3mf', async (_e, { path: srcPath, intoVaultId } = {}) => {
  try {
    if (!srcPath || !mfReadAllowed(srcPath)) return { ok: false, error: 'Source file is outside an allowed folder.' };
    const tmp = mfTempPath('3mf');
    const r = await mfRun('stlTo3mf', { src: srcPath, maxBytes: MF_MAX_BYTES, tmpOut: tmp });
    if (!r.ok) { await mfDiscard(tmp); return r; }
    const report = r.report;
    if (intoVaultId) {
      const dir = printLibItemDir(intoVaultId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `stl2mf-${Date.now().toString(36)}.3mf`;
      const dest = path.join(dir, filename);
      await mfFinalize(r.tmpPath, dest);
      const stat = await fs.promises.stat(dest);
      return { ok: true, vault: true, filename, ext: '3mf', size: stat.size, outPath: dest, report };
    }
    const base = path.basename(String(srcPath)).replace(/\.stl$/i, '') + '.3mf';
    const finalPath = await mfAskWhereToSave(_e.sender, { defaultPath: base, filters: [{ name: '3MF model', extensions: ['3mf'] }] });
    if (!finalPath) { await mfDiscard(r.tmpPath); return { ok: false, canceled: true }; }
    await mfFinalize(r.tmpPath, finalPath);
    return { ok: true, outPath: finalPath, report };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// 3MF → STL: extract the raw mesh from a 3MF and save it as a binary STL.
ipcMain.handle('hub:mf-to-stl', async (_e, { path: srcPath } = {}) => {
  try {
    if (!srcPath || !mfReadAllowed(srcPath)) return { ok: false, error: 'Source file is outside an allowed folder.' };
    const tmp = mfTempPath('stl');
    const r = await mfRun('mfToStl', { src: srcPath, maxBytes: MF_MAX_BYTES, tmpOut: tmp });
    if (!r.ok) { await mfDiscard(tmp); return r; }
    const base = path.basename(String(srcPath)).replace(/\.3mf$/i, '') + '.stl';
    const finalPath = await mfAskWhereToSave(_e.sender, { defaultPath: base, filters: [{ name: 'STL model', extensions: ['stl'] }] });
    if (!finalPath) { await mfDiscard(r.tmpPath); return { ok: false, canceled: true }; }
    await mfFinalize(r.tmpPath, finalPath);
    return { ok: true, outPath: finalPath, triangleCount: r.triangleCount };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// HueForge → U1: build a zero-slicer Snapmaker-Orca 3MF from a solved heightfield + a
// per-band head plan (colour swaps encoded as layer_config_ranges). The relief is rebuilt
// in-process from the compact heightfield (lighter over IPC than the full triangle soup).
ipcMain.handle('hub:hf-export-3mf', async (_e, { heights, width, height, layerH, widthMm, bands, filaments, name, thumbPng, thumbSmallPng } = {}) => {
  try {
    if (!Array.isArray(heights) || !width || !height || !Array.isArray(bands) || !bands.length) return { ok: false, error: 'Nothing to export yet.' };
    const HF = require('./lib/hueforge');
    const HF3 = require('./lib/hueforge-3mf');
    const solve = { heights: Uint16Array.from(heights), width, height };
    const mesh = HF.heightfieldToMesh(solve, { layerH, widthMm });
    if (!mesh.triangleCount) return { ok: false, error: 'Empty model.' };
    const b64ToBuf = (b64) => { try { return b64 ? Buffer.from(String(b64), 'base64') : null; } catch (_) { return null; } };
    const buf = HF3.buildU1_3mf({
      triangles: mesh.triangles, bands, filaments, layerH, name, sizeMm: mesh.sizeMm, bed: { x: 270, y: 270 },
      thumbnailPng: b64ToBuf(thumbPng), thumbnailSmallPng: b64ToBuf(thumbSmallPng),
    });
    if (!buf) return { ok: false, error: 'Failed to build the 3MF.' };
    const base = String(name || 'hueforge').replace(/[^\w.-]+/g, '_') + '-U1.3mf';
    const finalPath = await mfAskWhereToSave(_e.sender, { defaultPath: base, filters: [{ name: '3MF model', extensions: ['3mf'] }] });
    if (!finalPath) return { ok: false, canceled: true };
    await fs.promises.writeFile(finalPath, buf);
    return { ok: true, outPath: finalPath, triangleCount: mesh.triangleCount, sizeMm: mesh.sizeMm };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// HueForge FLAT → U1: the toolchanger mode. Where the relief encodes colour as height and
// ships one mesh plus a Z-band table, this ships one mesh PART per colour, each tagged with
// its head, and no layer ranges at all.
//
// Only the label field crosses IPC, not the geometry. The renderer already computed it for
// the preview, and rebuilding the parts here from labels + palette is far cheaper than
// sending a triangle soup — the same reason the relief path sends a heightfield.
ipcMain.handle('hub:hf-export-flat-3mf', async (_e, { labels, palette, width, height, widthMm, heightMm, capMm, layerH, filaments, baseHead, name, thumbPng, thumbSmallPng } = {}) => {
  try {
    if (!Array.isArray(labels) || !labels.length || !Array.isArray(palette) || !palette.length || !width || !height) {
      return { ok: false, error: 'Nothing to export yet.' };
    }
    const FLAT = require('./lib/hueforge-flat');
    const HF3 = require('./lib/hueforge-3mf');
    const built = FLAT.buildFlatParts({ labels, palette, width, height }, { widthMm, heightMm, capMm });
    if (!built || !built.parts.length) return { ok: false, error: 'Empty model.' };
    const b64ToBuf = (b64) => { try { return b64 ? Buffer.from(String(b64), 'base64') : null; } catch (_) { return null; } };
    const buf = HF3.buildFlatU1_3mf({
      parts: built.parts,
      // The renderer's slot colours win when it sent them: they are what the maker pinned in
      // the stack. buildFlatParts' own palette is the quantiser's, which may differ.
      filaments: (Array.isArray(filaments) && filaments.length) ? filaments : built.filaments,
      sizeMm: built.sizeMm,
      baseHead: Number.isInteger(baseHead) ? baseHead : built.baseHead,
      layerH, name, bed: { x: 270, y: 270 },
      thumbnailPng: b64ToBuf(thumbPng), thumbnailSmallPng: b64ToBuf(thumbSmallPng),
    });
    if (!buf) return { ok: false, error: 'Failed to build the 3MF.' };
    const base = String(name || 'hueforge-flat').replace(/[^\w.-]+/g, '_') + '-flat-U1.3mf';
    const finalPath = await mfAskWhereToSave(_e.sender, { defaultPath: base, filters: [{ name: '3MF model', extensions: ['3mf'] }] });
    if (!finalPath) return { ok: false, canceled: true };
    await fs.promises.writeFile(finalPath, buf);
    return { ok: true, outPath: finalPath, partCount: built.parts.length, sizeMm: built.sizeMm };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});

// Extract an embedded preview + (3MF) colour/swap info from a print file. Local only.
ipcMain.handle('hub:extract-thumbnail', async (_e, filePath) => {
  const empty = { pngBase64: null, colors: [], swapCount: 0, source: null };
  const safe = path.resolve(String(filePath || ''));
  const allowed = [app.getPath('userData'), app.getPath('documents'), app.getPath('downloads'), app.getPath('desktop'), app.getPath('temp')];
  if (!allowed.some(d => safe.startsWith(path.resolve(d) + path.sep) || safe === path.resolve(d))) return empty;
  try {
    const ext = path.extname(safe).slice(1).toLowerCase();
    if (ext === 'gcode' || ext === 'gco') {
      const stat = fs.statSync(safe);
      const HEAD = 32 * 1024, TAIL = 64 * 1024;
      let text;
      if (stat.size <= HEAD + TAIL) text = fs.readFileSync(safe, 'latin1');
      else {
        const fd = fs.openSync(safe, 'r');
        try {
          const h = Buffer.alloc(HEAD), tb = Buffer.alloc(TAIL);
          fs.readSync(fd, h, 0, HEAD, 0);
          fs.readSync(fd, tb, 0, TAIL, stat.size - TAIL);
          text = h.toString('latin1') + '\n' + tb.toString('latin1');
        } finally { fs.closeSync(fd); }
      }
      return extractPrintThumb({ ext, text });
    }
    if (ext === '3mf') {
      const stat = fs.statSync(safe);
      if (stat.size > 50_000_000) return empty;
      return extractPrintThumb({ ext, buf: fs.readFileSync(safe) });
    }
  } catch (_) { /* silent */ }
  return empty;
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
  // Verify against either the salted PBKDF2 format or a legacy SHA-256 hash.
  // Unrecognized formats (the very old base64 scheme) report legacy_pin so the
  // renderer re-prompts to set a fresh PIN.
  if (!isManagedHash(op.pinHash)) return { ok: false, error: 'legacy_pin' };
  return { ok: verifyPin(String(pin || ''), op.pinHash) };
});

// Hash a PIN/secret in the salted PBKDF2 format (renderer delegates here so all
// hashing uses Node crypto + a fresh salt).
ipcMain.handle('hub:hash-pin', async (_e, pin) => hashPinSalted(String(pin ?? '')));

// Verify a plaintext against a stored hash (salted PBKDF2 or legacy SHA-256),
// using the salt embedded in the stored hash. Used for admin-PIN + recovery-code.
ipcMain.handle('hub:verify-pin', async (_e, plain, stored) => verifyPin(String(plain ?? ''), stored));

ipcMain.handle('hub:write-status-page', async (_event, { html, orderId }) => {
  const safeId = path.basename(String(orderId || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = statusPagesDir();
  const fullPath = path.join(dir, `order-status-${safeId}.html`);
  await fs.promises.writeFile(fullPath, sanitizeHtmlForFile(html), 'utf8');
  return fullPath;
});

// Shared with LAN API live telemetry endpoint (hub:start-printer-polling fills this)
let printerStatusCache = {};

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
  getPrinterStatusCache: () => printerStatusCache,
  // Injected rather than derived inside lan-server, which has no access to
  // Electron's app paths — and so tests can point it at a temp directory.
  receiptsDir,
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

// Resolved file:// URL of the app's own entry page. Navigation is locked to
// exactly this document — not just any file:// URL — so a compromised renderer
// cannot navigate to other local files and read them under the privileged origin.
const APP_INDEX_PATHNAME = (() => {
  try { return decodeURIComponent(require('url').pathToFileURL(path.join(__dirname, 'renderer', ENTRY_HTML)).pathname); }
  catch { return null; }
})();

function isAppIndexNavigation(navigationUrl) {
  if (!APP_INDEX_PATHNAME) return false;
  try {
    const u = new URL(navigationUrl);
    if (u.protocol !== 'file:') return false;
    // Compare only the resolved pathname (ignore query/hash so in-app reloads work).
    return decodeURIComponent(u.pathname) === APP_INDEX_PATHNAME;
  } catch { return false; }
}

// --- Safe external URL opener (mailto, https, private LAN http) ---
ipcMain.handle('hub:open-external', async (_e, url) => {
  const s = String(url || '');
  if (!isAllowedExternalUrl(s)) return { ok: false, error: 'Blocked URL' };
  await shell.openExternal(s);
  return { ok: true };
});

// Parse a model the user DROPPED on the calculator. Takes bytes, not a path:
// hub:parse-print-file restricts which directories it will read so a renderer
// cannot name an arbitrary file, and a dropped path arrives from that same
// untrusted renderer. Bytes the OS already gave the page grant nothing new.
const INTAKE_MAX_BYTES = 150 * 1024 * 1024;
ipcMain.handle('hub:intake-model-bytes', async (_e, payload) => {
  const filename = String((payload && payload.filename) || '');
  const raw = payload && payload.bytes;
  if (!raw) return { ok: false, error: 'No file data' };
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (!buf.length) return { ok: false, error: 'Empty file' };
  if (buf.length > INTAKE_MAX_BYTES) return { ok: false, error: 'File too large (max 150 MB)' };
  try {
    const r = intakeModel({ filename, bytes: buf });
    return {
      ok: true,
      filename: path.basename(filename),
      exact: r.exact,
      source: r.source,
      printTimeMins: r.printTimeMins,
      filamentGrams: r.filamentGrams,
      filamentType: r.filamentType,
      filamentCost: r.filamentCost,
      slicer: r.slicer,
      geometry: r.geometry
        ? { volumeMm3: r.geometry.volumeMm3, bbox: r.geometry.bbox, triangleCount: r.geometry.triangleCount }
        : null,
      warnings: r.warnings,
    };
  } catch (e) {
    return { ok: false, error: 'Could not read that file' };
  }
});

/**
 * The printed envelope of a g-code file — see lib/gcode-geometry.js for what it
 * is and why the usual identity keys cannot survive a re-slice.
 *
 * Best-effort: a file that cannot be read, or is larger than any real print,
 * yields null and the record simply keeps no geometry key, exactly as before.
 */
const SILHOUETTE_MAX_BYTES = 256 * 1024 * 1024;
async function gcodeSilhouette(fullPath, size) {
  if (Number.isFinite(size) && size > SILHOUETTE_MAX_BYTES) return null;
  try {
    const sil = createSilhouette();
    const rl = readline.createInterface({
      input: fs.createReadStream(fullPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) sil.push(line);
    return sil.result();
  } catch (_) {
    return null;
  }
}

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
      // Read HEAD + TAIL: PrusaSlicer/SuperSlicer/OrcaSlicer write their summary
      // in the footer config block, so a head-only read misses most slicers.
      const stat = fs.statSync(resolvedParse);
      const HEAD = 32 * 1024;
      const TAIL = 64 * 1024;
      let text;
      if (stat.size <= HEAD + TAIL) {
        text = fs.readFileSync(resolvedParse, 'utf8');
      } else {
        const fd = fs.openSync(resolvedParse, 'r');
        try {
          const headBuf = Buffer.alloc(HEAD);
          const tailBuf = Buffer.alloc(TAIL);
          fs.readSync(fd, headBuf, 0, HEAD, 0);
          fs.readSync(fd, tailBuf, 0, TAIL, stat.size - TAIL);
          text = headBuf.toString('utf8') + '\n' + tailBuf.toString('utf8');
        } finally {
          fs.closeSync(fd);
        }
      }
      // The envelope needs the whole toolpath, which the head/tail read above
      // deliberately does not have — that read is for the slicer's summary, and
      // it stops well short of the moves. Streamed rather than slurped so a
      // 60 MB file costs one line at a time, and capped so a pathological one
      // costs a bounded amount of work instead of the app's responsiveness.
      result.silhouette = await gcodeSilhouette(resolvedParse, stat.size);
      const parsed = parseGcodeText(text);
      result.printTimeMins = parsed.printTimeMins;
      result.filamentGrams = parsed.filamentGrams;
      result.filamentType = parsed.filamentType;
      result.filamentCost = parsed.filamentCost;
      result.slicer = parsed.slicer;
      // Same provenance contract as the 3MF/STL/OBJ branch, so the renderer has
      // one shape to reason about rather than two.
      result.exact = !!(parsed.printTimeMins > 0 && parsed.filamentGrams > 0);
      result.source = result.exact ? 'slicer' : null;
    } else if (ext === '.3mf' || ext === '.stl' || ext === '.obj') {
      // A 3MF is a ZIP — its slicer summary lives in a DEFLATE'd member and is
      // not present in the raw bytes, so it has to be unzipped. STL and OBJ
      // carry no slicer data at all and yield a geometric ESTIMATE, which the
      // caller must label as one; `exact` says which kind of answer this is.
      const mfStat = fs.statSync(resolvedParse);
      if (mfStat.size > 50_000_000) return { ok: false, error: 'File too large (max 50 MB)' };
      const r = intakeModel({ filename: path.basename(filePath), bytes: fs.readFileSync(resolvedParse) });
      result.printTimeMins = r.printTimeMins;
      result.filamentGrams = r.filamentGrams;
      result.filamentType = r.filamentType;
      result.filamentCost = r.filamentCost;
      result.slicer = r.slicer;
      result.exact = r.exact;
      result.source = r.source;
      result.geometry = r.geometry
        ? { volumeMm3: r.geometry.volumeMm3, bbox: r.geometry.bbox, triangleCount: r.geometry.triangleCount }
        : null;
      result.warnings = r.warnings;
    }
  } catch(e) { /* silent fail */ }
  return result;
});

// --- Feature 2 (new batch): Printer API polling infrastructure ---
let printerPollInterval = null;

ipcMain.handle('hub:start-printer-polling', async (_e, machines) => {
  if (printerPollInterval) clearInterval(printerPollInterval);
  // TRUST BOUNDARY: the `machines` array is renderer-supplied and is NOT
  // re-validated against the persisted store here (doing so would require
  // threading the store + machine identity through this handler). The SSRF
  // surface is instead contained downstream in fetchPrinterStatus(), where
  // isAllowedPrinterHost() now restricts every target to RFC1918 / link-local
  // LAN ranges — so even a forged machine entry can only reach a LAN device,
  // never an arbitrary public host or cloud metadata endpoint.
  const machineList = Array.isArray(machines) ? machines : [];
  const poll = async () => {
    for (const machine of machineList) {
      if (!machine.printerApi?.type || machine.printerApi.type === 'none') continue;
      try {
        const status = await fetchPrinterStatus(machine);
        printerStatusCache[machine.id] = mergePollSuccess(
          printerStatusCache[machine.id], status, Date.now(),
        );
      } catch(e) {
        printerStatusCache[machine.id] = mergePollFailure(
          printerStatusCache[machine.id], e.message, Date.now(),
        );
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

/**
 * Pause / resume / cancel the job on a printer.
 *
 * Same host allowlist and no-redirect rule as the status poller: this reaches a
 * LAN device on the user's behalf, so it must not be steerable off the validated
 * address.
 */
async function sendPrinterCommand(machine, command) {
  const { type, host, port, apiKey } = (machine && machine.printerApi) || {};
  const printerHost = String(host || '').replace(/[^a-zA-Z0-9.\-]/g, '');
  if (!isAllowedPrinterHost(printerHost)) return { ok: false, error: 'Invalid printer host' };
  const portNum = parseInt(port || defaultPrinterPort(type), 10);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return { ok: false, error: 'Invalid port number' };
  }
  const base = `http://${printerHost}:${portNum}`;
  const headers = {};
  if (apiKey) {
    if (type === 'octoprint' || type === 'prusalink' || type === 'moonraker') headers['X-Api-Key'] = apiKey;
    if (type === 'repetier') headers['x-api-key'] = apiKey;
  }

  // PrusaLink keys its endpoints by the running job's id, and returns 404 if the
  // id is stale — so read it now rather than trusting anything cached.
  let jobId = null;
  if (printerCommands.requiresJobId(type)) {
    try {
      const res = await fetch(`${base}/api/v1/job`, { headers, redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ok: false, error: 'No job is running on this printer' };
      jobId = (await res.json())?.id ?? null;
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  const req = printerCommands.buildCommand(type, command, jobId);
  if (req.unsupported) return { ok: false, error: req.unsupported };

  try {
    const init = { method: req.method, headers: { ...headers }, redirect: 'manual', signal: AbortSignal.timeout(10000) };
    if (req.body) {
      init.headers['Content-Type'] = req.contentType || 'application/json';
      init.body = JSON.stringify(req.body);
    }
    const res = await fetch(`${base}${req.path}`, init);
    if (res.status >= 300 && res.status < 400) return { ok: false, error: 'Unexpected redirect from printer' };
    // OctoPrint answers 409 when there is no active job — say so rather than
    // reporting a bare status code the user cannot act on.
    if (res.status === 409) return { ok: false, error: 'No job is running on this printer' };
    if (!res.ok) return { ok: false, error: `Printer responded ${res.status}` };
    return { ok: true, command };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

ipcMain.handle('hub:printer-command', async (_e, { machine, command } = {}) =>
  sendPrinterCommand(machine, command));

/**
 * The filament stock a machine runs, for turning extruded millimetres into
 * grams. Falls back to lib/printer-actuals' documented defaults when the machine
 * has not been told.
 */
function stockOptsFor(machine) {
  const api = (machine && machine.printerApi) || {};
  return {
    diameterMm: api.filamentDiameterMm,
    densityGPerCm3: api.filamentDensityGPerCm3,
  };
}

async function fetchPrinterStatus(machine) {
  const { type, host, port, apiKey, accessCode, printerSlug, serial } = machine.printerApi || {};
  // Strip any characters that aren't valid in a hostname/IP (prevents URL injection via @, /, etc.)
  const printerHost = String(host || '').replace(/[^a-zA-Z0-9.\-]/g, '');
  if (!isAllowedPrinterHost(printerHost)) {
    return { ok: false, error: 'Invalid printer host' };
  }
  const portNum = parseInt(port || defaultPrinterPort(type), 10);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return { ok: false, error: 'Invalid port number' };
  }
  // Bambu Lab: MQTT-over-TLS, not HTTP. Needs the device serial for its topics.
  if (type === 'bambu') {
    const dev = String(serial || printerSlug || '').trim();
    if (!dev) return { ok: false, error: 'Bambu needs the printer serial number (Settings → Device on the printer).' };
    if (!accessCode) return { ok: false, error: 'Bambu needs the LAN access code.' };
    return bambu.fetchBambuStatus({ host: printerHost, port: portNum, accessCode, serial: dev });
  }
  const baseUrl = `http://${printerHost}:${portNum}`;
  const headers = {};
  // Moonraker was missing here. It accepts X-Api-Key from untrusted clients, and
  // without it Khayt only works when the printer happens to list this machine in
  // `trusted_clients` — any shop running `force_logins: True`, or an app on a
  // subnet the printer doesn't trust, got a blanket 401 with nothing to explain it.
  //
  // Guarded on a non-empty key: an unset one previously sent the literal string
  // "undefined" as the header value, and Moonraker in trusted-client mode needs
  // no key at all, so sending a junk one is worse than sending none.
  if (apiKey) {
    if (type === 'octoprint' || type === 'prusalink' || type === 'moonraker') headers['X-Api-Key'] = apiKey;
    if (type === 'repetier') headers['x-api-key'] = apiKey;
  }

  const get = async (p) => {
    // redirect:'manual' so a compromised/misconfigured printer host can't 302 the poller off the
    // validated LAN address to loopback/metadata (the response here IS returned to the renderer).
    const res = await fetch(`${baseUrl}${p}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if (res.status >= 300 && res.status < 400) throw new Error('Unexpected redirect from printer');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  if (type === 'octoprint') {
    const [printer, job] = await Promise.all([get('/api/printer'), get('/api/job')]);
    return {
      state: printer.state?.text || 'Unknown',
      progress: normalizeProgress(job.progress?.completion),
      filename: job.job?.file?.name || '',
      timeRemaining: job.progress?.printTimeLeft || null,
      tempNozzle: printer.temperature?.tool0?.actual || null,
      tempBed: printer.temperature?.bed?.actual || null,
      // What the job has ACTUALLY used so far. Already in this payload; Khayt
      // fetched it and threw it away until now.
      actuals: extractActuals('octoprint', job, stockOptsFor(machine)),
      type: 'octoprint'
    };
  }
  if (type === 'moonraker') {
    const data = await get('/printer/objects/query?print_stats&virtual_sdcard&extruder&heater_bed');
    const ps = data.result?.status?.print_stats || {};
    const vs = data.result?.status?.virtual_sdcard || {};
    // Layers where Klipper reports them, bytes otherwise — see moonrakerProgress
    // for the measurement that settled it. And the ETA goes through etaSeconds,
    // which has existed (with a test saying "under 1% is noise, not a signal")
    // since the shared helpers were written and had never once been called: this
    // adapter is the only one that extrapolates an ETA itself, and it was doing
    // the arithmetic inline without the guard.
    const prog = moonrakerProgress(ps, vs);
    return {
      state: ps.state || 'Unknown',
      progress: prog.percent,
      progressSource: prog.source,
      filename: ps.filename || '',
      // print_duration, not total_duration: the latter includes heating and
      // idling either side of the job, which is the same reason the actuals
      // reader prefers it.
      timeRemaining: etaSeconds(ps.print_duration, prog.percent / 100),
      tempNozzle: data.result?.status?.extruder?.temperature || null,
      tempBed: data.result?.status?.heater_bed?.temperature || null,
      actuals: extractActuals('moonraker', data, stockOptsFor(machine)),
      type: 'moonraker'
    };
  }
  if (type === 'prusalink') {
    const data = await get('/api/v1/status');
    const job = data.job || {};
    return {
      state: data.printer?.state || 'Unknown',
      progress: normalizeProgress(job.progress),
      filename: job.file?.name || '',
      timeRemaining: job.time_remaining || null,
      tempNozzle: data.printer?.temp_nozzle || null,
      tempBed: data.printer?.temp_bed || null,
      actuals: extractActuals('prusalink', data, stockOptsFor(machine)),
      type: 'prusalink'
    };
  }
  // (Bambu is handled above via MQTT before the HTTP branches.)
  if (type === 'duet') {
    try {
      const data = await get('/rr_model?key=&flags=d99fn');
      const job = data.result?.job || {};
      return {
        state: data.result?.state?.status || 'Unknown',
        progress: fileProgressPct(job.filePosition, job.file?.size),
        filename: job.file?.fileName || '',
        timeRemaining: job.timesLeft?.file || null,
        tempNozzle: data.result?.heat?.heaters?.[1]?.current || null,
        tempBed: data.result?.heat?.heaters?.[0]?.current || null,
        actuals: extractActuals('duet', data, stockOptsFor(machine)),
        type: 'duet'
      };
    } catch(e) {
      const data = await get('/rr_status?type=3');
      return {
        state: data.status || 'Unknown',
        progress: normalizeProgress((data.fractionPrinted || 0) * 100),
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
      progress: normalizeProgress(state.done),
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
  const ports = { octoprint: 80, moonraker: 7125, bambu: 8883, prusalink: 80, duet: 80, repetier: 3344 };
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
          from: { email: cfg.fromEmail || 'noreply@khaytapp.com', name: cfg.fromName || 'Khayt' },
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
      from: cfg.fromEmail || cfg.smtpUser || 'noreply@khaytapp.com',
      fromName: cfg.fromName || 'Khayt',
      to,
      subject,
      html: body,
    });
  }
  // Fallback: mailto link
  return { ok: false, fallback: true, mailtoUrl: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
});

// Outbound SMS / WhatsApp via a configured provider (Twilio / WhatsApp Cloud /
// Unifonic / webhook). Provider secrets resolve from the encrypted store so they
// never round-trip the renderer in plaintext after first save.
ipcMain.handle('hub:send-sms', async (_e, { to, message, channel, smsConfig } = {}) => {
  const cfg = smsConfig ? { ...smsConfig } : {};
  const provider = cfg.provider;
  cfg.authToken = resolveStoreSecret(cfg.authToken, d => d?.settings?.smsConfig?.authToken);
  cfg.token     = resolveStoreSecret(cfg.token,     d => d?.settings?.smsConfig?.token);
  cfg.appSid    = resolveStoreSecret(cfg.appSid,    d => d?.settings?.smsConfig?.appSid);
  cfg.secret    = resolveStoreSecret(cfg.secret,    d => d?.settings?.smsConfig?.secret);
  return sendSms(provider, cfg, { to, message, channel });
});

// One-way accounting sync: POST a canonical invoice/expense payload to the
// owner's webhook (bridge to QuickBooks/Zoho/Xero via Zapier/Make/own endpoint).
// Idempotent by payload.idempotencyKey; secret resolves from the encrypted store.
ipcMain.handle('hub:accounting-push', async (_e, { url, secret, payload } = {}) => {
  if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, error: 'Accounting webhook needs an http(s) URL' };
  // Same SSRF hardening as hub:webhook-post — the URL comes from the store
  // (settings.accountingSync.webhookUrl), which can arrive via restore/sync, so
  // block private/loopback/metadata targets, DNS-rebinding and redirects.
  let parsed;
  try {
    parsed = new URL(url);
    if (isBlockedHost(parsed.hostname)) return { ok: false, error: 'Blocked URL — cannot send to private/loopback addresses' };
  } catch { return { ok: false, error: 'Invalid accounting webhook URL' }; }
  if (await resolvesToBlockedHost(parsed.hostname)) {
    return { ok: false, error: 'Blocked URL — hostname resolves to a private/loopback address' };
  }
  secret = resolveStoreSecret(secret, d => d?.settings?.accountingSync?.secret);
  try {
    const headers = { 'content-type': 'application/json' };
    if (secret) headers['X-Khayt-Secret'] = String(secret);
    if (payload && payload.idempotencyKey) headers['Idempotency-Key'] = String(payload.idempotencyKey);
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload || {}), redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (res.status >= 300 && res.status < 400) return { ok: false, error: 'Blocked redirect from accounting webhook' };
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const txt = await res.text(); if (txt) detail += ` — ${txt.slice(0, 200)}`; } catch { /* ignore */ }
      return { ok: false, status: res.status, error: detail };
    }
    return { ok: true, status: res.status };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Generic outbound event webhook poster: signs the body with HMAC-SHA256
// (X-Khayt-Signature: sha256=<hex>) so the receiver can verify authenticity, and
// sends an Idempotency-Key (the event id) so retries dedupe. Same SSRF hardening
// as hub:fire-webhook — https-only, blocked-host string + DNS-rebinding checks,
// no redirects.
ipcMain.handle('hub:webhook-post', async (_e, { url, secret, payload } = {}) => {
  if (!url || !String(url).startsWith('https://')) return { ok: false, error: 'Webhook needs an https:// URL' };
  let parsed;
  try {
    parsed = new URL(url);
    if (isBlockedHost(parsed.hostname)) return { ok: false, error: 'Blocked URL — cannot send webhooks to private/loopback addresses' };
  } catch { return { ok: false, error: 'Invalid webhook URL' }; }
  if (await resolvesToBlockedHost(parsed.hostname)) {
    return { ok: false, error: 'Blocked URL — hostname resolves to a private/loopback address' };
  }
  secret = resolveStoreSecret(secret, d => d?.settings?.eventWebhooks?.secret);
  try {
    const body = JSON.stringify(payload || {});
    const headers = { 'content-type': 'application/json' };
    if (payload && payload.id) headers['Idempotency-Key'] = String(payload.id);
    if (secret) {
      const sig = require('crypto').createHmac('sha256', String(secret)).update(body).digest('hex');
      headers['X-Khayt-Signature'] = 'sha256=' + sig;
    }
    const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (res.status >= 300 && res.status < 400) return { ok: false, error: 'Webhook redirects are not allowed' };
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// ── Feature R12-1: Outbound Webhooks ────────────────────────────────────────
// AI quote extraction (BYO Anthropic key) — opt-in; fails safe (renderer falls
// back to the manual quote form on any error). Key resolved from the encrypted
// store so it never round-trips the renderer in plaintext after first save.
ipcMain.handle('hub:ai-extract', async (_e, { apiKey, model, system, request, image, schema, task } = {}) => {
  apiKey = resolveStoreSecret(apiKey, d => d?.settings?.ai?.apiKey);
  if (!apiKey) return { ok: false, error: 'No AI key configured' };
  if (!request || !String(request).trim()) return { ok: false, error: 'Empty request' };

  // The tool name/description must describe the CALLING feature — the model
  // leans on them heavily, and one shared 'quote_extract' definition was
  // mis-framing price, reply and assistant calls. See lib/ai-tools.js.
  const { tool, maxTokens, task: resolvedTask } = aiTools.resolveTool(task, schema);

  // Consent is enforced HERE, not only in the renderer. This is the single
  // point where shop data leaves the device, so a call site that forgets to
  // check (or a future one that never knew to) still cannot transmit a feature
  // the owner has not agreed to. See lib/ai-privacy.js.
  const storeAi = readStoreDecryptedFromDisk()?.settings?.ai;
  if (!aiPrivacy.isFeatureEnabled(storeAi, resolvedTask)) {
    return { ok: false, error: 'AI_FEATURE_NOT_CONSENTED', feature: resolvedTask };
  }
  const content = [{ type: 'text', text: String(request) }];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: String(image) } });
  const body = JSON.stringify({
    model: model || 'claude-opus-5',
    max_tokens: maxTokens,
    system: String(system || ''),
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content }],
  });

  // Retry transient faults (429/529/5xx) with backoff. Raw fetch gives us none
  // of this for free, so a single rate-limit reply used to kill the feature.
  const MAX_ATTEMPTS = 3;
  let lastError = 'AI request failed';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body,
        // 60s, not 30s: the default model thinks before it answers, and thinking
        // happens before the first byte of the reply. A 30s ceiling was set when
        // the default model did not think, and would now abort a good answer
        // mid-flight — which the shop would see as a network error.
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      // Network fault or timeout — transient by nature, so it retries too.
      lastError = String(e && e.message || e);
      if (attempt + 1 >= MAX_ATTEMPTS) return { ok: false, error: lastError };
      await new Promise(r => setTimeout(r, aiTools.retryDelayMs(attempt)));
      continue;
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      lastError = aiTools.describeHttpError(res.status, errBody);
      if (!aiTools.shouldRetry(res.status) || attempt + 1 >= MAX_ATTEMPTS) return { ok: false, error: lastError };
      await new Promise(r => setTimeout(r, aiTools.retryDelayMs(attempt, res.headers.get('retry-after'))));
      continue;
    }

    const data = await res.json();
    const toolUse = (data.content || []).find(c => c && c.type === 'tool_use');
    // Hand back the usage block. It arrives on every response and used to be
    // discarded, so a shop on its own key had no way to know what the AI
    // features were costing them — see lib/ai-usage.js.
    if (toolUse && toolUse.input) {
      return { ok: true, draft: toolUse.input, usage: data.usage || null, model: data.model || null };
    }
    // A 200 with no tool call: stop_reason says whether the model refused, ran
    // out of room, or paused — three different fixes, previously one message.
    return { ok: false, error: aiTools.describeStop(data.stop_reason) || 'No structured output returned' };
  }
  return { ok: false, error: lastError };
});

// ── Khayt Cloud sync (opt-in, E2E) ────────────────────────────────────────────
// The unlocked backend (with the in-memory DEK) lives only for the session; the
// passphrase is never stored, so the renderer re-unlocks each launch.
let cloudBackend = null;

ipcMain.handle('hub:cloud-health', (_e, url) => cloudClient.health(url));
// Same probe, but says WHY it failed — timeout, unreachable, wrong server, bad
// address — so the user is told which of those to go and fix.
ipcMain.handle('hub:cloud-health-detail', (_e, url) => cloudClient.healthDetail(url));

ipcMain.handle('hub:cloud-create-keyset', (_e, passphrase) => {
  try { return { ok: true, ...cloudClient.createKeyset(String(passphrase || '')) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-register', async (_e, { url, registerSecret } = {}) => {
  try { return { ok: true, ...(await cloudClient.register(url, registerSecret)) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-signup', async (_e, { url, email, password, registerSecret } = {}) => {
  try { return { ok: true, ...(await cloudClient.signup(url, { email, password, registerSecret })) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-login', async (_e, { url, email, password } = {}) => {
  try {
    const r = await cloudClient.login(url, { email, password });
    if (!r) return { ok: false, error: 'Wrong email or password' };
    return { ok: true, ...r };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-accept-invite', async (_e, { url, email, password, code } = {}) => {
  try { return { ok: true, ...(await cloudClient.acceptInvite(url, { email, password, code })) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-member-invite', async (_e, { url, shopId, token, email, role } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.inviteMember(url, shopId, token, email, role)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-members-list', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, members: await cloudClient.listMembers(url, shopId, token) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-member-remove', async (_e, { url, shopId, token, email } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.removeMember(url, shopId, token, email)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-catalog-publish', async (_e, { url, shopId, token, catalog } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.putCatalog(url, shopId, token, catalog)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-catalog-get', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.getCatalog(url, shopId, token)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// ── BedReady library sync (site ↔ app) — pull the user's saved designs from bedready.io. Separate from
// Khayt Cloud above: read-only, no encryption, no shop token; just the user's BedReady access token.
ipcMain.handle('hub:bedready-linked', () => {
  try { return { ok: true, linked: bedreadyAccount.isLinked(app.getPath('userData')) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:bedready-library', async () => {
  try {
    const token = await bedreadyAccount.getAccessToken(app.getPath('userData')); // refreshes if needed
    return { ok: true, items: await bedreadyLibrary.fetchLibrary(token) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:bedready-unlink', () => {
  try { bedreadyAccount.clear(app.getPath('userData')); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:bedready-download-all', async (_e, { items } = {}) => {
  try {
    const { app, shell } = require('electron');
    const dest = require('path').join(app.getPath('downloads'), 'BedReady-Library');
    const r = await bedreadyLibrary.downloadAll(items, dest);
    if (r.saved.length) shell.openPath(dest).catch(() => {});
    return { ok: true, dest, ...r };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Download one library design straight into a Print-File Library record's vault folder, so a synced
// design lands IN the app (with a thumbnail) instead of orphaned in ~/Downloads. Renderer mints the
// vaultId, calls this, then creates the print-file record via importConvertedAsNew().
ipcMain.handle('hub:bedready-download-into-vault', async (_e, { item, vaultId } = {}) => {
  try {
    if (!vaultId) return { ok: false, error: 'Missing library id.' };
    const dir = printLibItemDir(vaultId);
    fs.mkdirSync(dir, { recursive: true });
    const out = await bedreadyLibrary.downloadItem(item, dir);
    if (!out) return { ok: false, skipped: true };
    const stat = fs.statSync(out);
    return { ok: true, filename: path.basename(out), ext: path.extname(out).slice(1).toLowerCase() || '3mf', size: stat.size };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Fetch a design cover as a data: URI (the renderer CSP forbids remote img-src). SSRF-guarded in the lib.
ipcMain.handle('hub:bedready-cover', async (_e, { url } = {}) => {
  try { return { ok: true, dataUrl: await bedreadyLibrary.fetchCoverDataUrl(url) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:bedready-open-signin', () => {
  try {
    bedreadyLinkArmedAt = Date.now(); // arm: the next bedready:// link is user-initiated and expected
    bedreadyLinkNonce = crypto.randomBytes(16).toString('hex'); // bind the handshake to this click
    const url = bedreadyLibrary.signInUrl() + '?state=' + encodeURIComponent(bedreadyLinkNonce);
    require('electron').shell.openExternal(url);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// ── Orca filament installer (Bed Ready) — install OrcaSlicer profiles into any Orca-family slicer ──
ipcMain.handle('hub:orca-fila-slicers', () => {
  try { return { ok: true, slicers: orcaFila.targets() }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:orca-fila-manifest', async () => {
  try { return { ok: true, manifest: await orcaFila.fetchManifest() }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:orca-fila-install', async (_e, { item, slicerId, printerLabel } = {}) => {
  try {
    const r = await orcaFila.installProfile(item, { slicerId, printerLabel });
    return { ok: true, path: r.path, slicer: r.slicer, printer: r.printer };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:orca-fila-reveal', async (_e, { slicerId } = {}) => {
  try {
    const { shell } = require('electron');
    const dir = orcaFila.filamentDirFor(slicerId);
    if (!dir) return { ok: false, error: 'No slicer detected yet.' };
    require('fs').mkdirSync(dir, { recursive: true });
    // openPath resolves with an error STRING (not a rejection) when it can't open — surface it so the
    // renderer can tell the user instead of the click silently doing nothing.
    const err = await shell.openPath(dir);
    if (err) return { ok: false, error: err };
    return { ok: true, dir };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:orca-fila-installed', (_e, { slicerId } = {}) => {
  try { return { ok: true, names: orcaFila.installedFilamentNames(slicerId) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Calibration → tuned OrcaSlicer filament profile (Bed Ready). Targets = detected slicers with their
// printers + the user's own filament presets (bases to tune from); save writes the tuned preset in.
ipcMain.handle('hub:calib-targets', () => {
  try { return { ok: true, targets: calibProfile.calibrationTargets() }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('hub:calib-save-profile', (_e, opts = {}) => {
  try { return calibProfile.saveCalibratedProfile(opts); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-review-summary', async (_e, { url, shopId } = {}) => {
  try { return { ok: true, summary: await cloudClient.getReviewSummary(url, shopId) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-request-reset', async (_e, { url, email } = {}) => {
  try { return { ok: true, ...(await cloudClient.requestReset(url, { email })) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-reset-password', async (_e, { url, email, code, newPassword } = {}) => {
  try { return { ok: true, ...(await cloudClient.resetPassword(url, { email, code, newPassword })) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-request-verify', async (_e, { url, email } = {}) => {
  try { return { ok: true, ...(await cloudClient.requestVerify(url, { email })) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-verify-email', async (_e, { url, email, code } = {}) => {
  try { return { ok: true, ...(await cloudClient.verifyEmail(url, { email, code })) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Customer portal: publish/unpublish an owner-curated (plaintext) item; list actions.
ipcMain.handle('hub:cloud-publish', async (_e, { url, shopId, token, pubToken, kind, payload, customerEmail } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.publishPortal(url, shopId, token, pubToken, kind, payload, customerEmail)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-unpublish', async (_e, { url, shopId, token, pubToken } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.unpublishPortal(url, shopId, token, pubToken)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-published-list', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, items: await cloudClient.listPublished(url, shopId, token) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-intake-list', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, items: await cloudClient.listIntake(url, shopId, token) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-intake-delete', async (_e, { url, shopId, token, id } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.deleteIntake(url, shopId, token, id)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-storefront-stats', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, stats: await cloudClient.storefrontStats(url, shopId, token) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-portal-messages', async (_e, { url, shopId, token, authToken } = {}) => {
  try {
    authToken = resolveStoreSecret(authToken, d => d?.settings?.cloud?.token);
    return { ok: true, messages: await cloudClient.portalMessages(url, shopId, token, authToken) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-portal-reply', async (_e, { url, shopId, token, authToken, text } = {}) => {
  try {
    authToken = resolveStoreSecret(authToken, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.portalReply(url, shopId, token, authToken, text)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-billing-me', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.billingMe(url, shopId, token)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Store the (already-encrypted) keyset server-side so other devices can fetch it.
ipcMain.handle('hub:cloud-put-keyset', async (_e, { url, shopId, token, keyset } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.putKeyset(url, shopId, token, keyset)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-get-keyset', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, keyset: await cloudClient.getKeyset(url, shopId, token) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-unlock', (_e, { url, shopId, token, keyset, passphrase } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    const dek = cloudClient.unlockWithPassphrase(String(passphrase || ''), keyset);
    cloudBackend = cloudClient.backendFor(url, shopId, token, dek, {
      // Warm launch: let this session start from the server view the last one
      // left behind, so the first pull asks for a slice instead of the base and
      // the whole chain. docs/KHAYT-CLOUD-DELTA-SYNC.md §7.
      cacheDir: ensureDir('cloud-cache'),
      // The store as it is ON DISK, which is what the cached view was last
      // reconciled against. Unsaved renderer edits only make local NEWER than
      // disk, and the check refuses on local being OLDER — so reading the file
      // here errs toward a cold pull, never toward adopting a view it should not.
      getLocalSnapshot: () => {
        try { return recoverStoreRaw(50_000_000).data || null; } catch (e) { return null; }
      },
    });
    return { ok: true };
  } catch (e) { cloudBackend = null; return { ok: false, error: 'Wrong passphrase or invalid keyset' }; }
});

/* ── Organisations (multi-shop) ───────────────────────────────────────────────
 *
 * One org key opens every branch, so the owner unlocks once. See
 * docs/KHAYT-3.0-ORG-DATA-KEY.md.
 *
 * The Org Data Key is held for the session, exactly like a shop DEK: never
 * written to disk, gone when the app closes. Branch backends are built LAZILY —
 * on the first call that names a branch, not all at once on unlock. A branch
 * that is unreachable, or whose keyset is missing, then fails only the work that
 * touched it, instead of failing the unlock and taking every other branch with
 * it. It also matches how the sync loop already works: one shop at a time.
 */
let orgKey = null;                  // Buffer | null — the session's ODK
let orgId = null;                   // which org it belongs to

/** Drop every org-derived secret. Called on lock and on leaving an org. */
function clearOrgSession() {
  orgKey = null;
  orgId = null;
}

ipcMain.handle('hub:org-create-keyset', (_e, passphrase) => {
  try {
    const { orgKeyset, orgKey: key, recoveryKey } = cloudClient.createOrgKeyset(String(passphrase || ''));
    // Hold the key for this session so the caller can enrol branches straight
    // away without a second scrypt pass; the recovery key is shown once and
    // never stored.
    orgKey = key;
    orgId = orgKeyset.orgId;
    return { ok: true, orgKeyset, recoveryKey };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:org-unlock', (_e, { orgKeyset, passphrase, recoveryKey } = {}) => {
  try {
    orgKey = recoveryKey
      ? cloudClient.unlockOrgWithRecovery(String(recoveryKey), orgKeyset)
      : cloudClient.unlockOrgWithPassphrase(String(passphrase || ''), orgKeyset);
    orgId = orgKeyset && orgKeyset.orgId;
    return { ok: true, orgId };
  } catch (e) {
    clearOrgSession();
    return { ok: false, error: recoveryKey ? 'Wrong recovery key for this organisation' : 'Wrong organisation passphrase' };
  }
});

ipcMain.handle('hub:org-status', () => ({ unlocked: !!orgKey, orgId }));
ipcMain.handle('hub:org-lock', () => { clearOrgSession(); return { ok: true }; });

/** Add this shop's DEK to the org, so the org key opens it too. */
ipcMain.handle('hub:org-enrol-shop', (_e, { keyset, passphrase } = {}) => {
  try {
    if (!orgKey) return { ok: false, error: 'locked' };
    const dek = cloudClient.unlockWithPassphrase(String(passphrase || ''), keyset);
    return { ok: true, keyset: cloudClient.joinOrg(keyset, dek, orgKey, orgId) };
  } catch (e) { return { ok: false, error: 'Wrong passphrase or invalid keyset' }; }
});

/** Remove the org's way into this shop. Its own passphrase still opens it. */
ipcMain.handle('hub:org-remove-shop', (_e, { keyset } = {}) => {
  try { return { ok: true, keyset: cloudClient.leaveOrg(keyset) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:org-change-passphrase', (_e, { orgKeyset, currentPassphrase, newPassphrase } = {}) => {
  try {
    const rotated = cloudClient.changeOrgPassphrase(orgKeyset, String(currentPassphrase || ''), String(newPassphrase || ''));
    // The ODK itself does not change, so every branch's wrappedByOrg stays valid
    // and nothing is re-encrypted — the session key is still the right one.
    return { ok: true, orgKeyset: rotated };
  } catch (e) { return { ok: false, error: 'Wrong organisation passphrase' }; }
});

/**
 * The organisation overview: what is happening at every branch.
 *
 * One call, because the interesting failures are per branch and the caller wants
 * them side by side. Each branch is fetched and opened on its own — a branch that
 * has never pushed, or whose keyset is missing, or which this org key cannot open,
 * reports against ITSELF and the rest still come back. That is what the lazy
 * design was for; doing it all-or-nothing would let one bad branch blank the
 * screen.
 *
 * Only the SUMMARY crosses back. A branch store can be megabytes and the overview
 * needs a handful of counts; see lib/branch-summary.js for what is deliberately
 * not counted (money, and anything needing a calendar day).
 */
// `today` is the READER's calendar day, passed in rather than computed here:
// branches may sit in other timezones, and the day that decides what is late is
// the day of the person looking at the screen. Omitted → no late counts at all.
ipcMain.handle('hub:org-overview', async (_e, { url, shopId, token, today } = {}) => {
  if (!orgKey) return { ok: false, error: 'locked' };
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    const members = await cloudClient.getOrgKeysets(url, shopId, token);
    const branches = [];
    for (const m of members) {
      const row = { shopId: m.shopId, isSelf: m.shopId === shopId };
      try {
        if (!m.keyset) throw new Error('this branch has not finished setting up sync');
        const dek = cloudClient.unlockWithOrg(orgKey, orgId, m.keyset);
        const blob = await cloudClient.getBranchStore(url, shopId, token, m.shopId);
        if (!blob) { row.empty = true; branches.push(row); continue; }
        row.rev = blob.rev;
        // decryptBranchStore, not decryptStore: a branch may hold a delta chain
        // on top of its base, and summarising the base alone would report figures
        // missing its newest orders with nothing saying so.
        row.summary = summarizeBranch(cloudClient.decryptBranchStore(blob, dek), { today });
      } catch (e) {
        row.error = String(e && e.message || e);
      }
      branches.push(row);
    }
    return { ok: true, branches, total: totalBranches(branches.map((b) => b.summary)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

/* Org membership on the server — the wrapped org keyset and which branches are in. */
ipcMain.handle('hub:org-get', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, org: await cloudClient.getOrg(url, shopId, token) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:org-put', async (_e, { url, shopId, token, orgId: id, keyset } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.putOrg(url, shopId, token, id, keyset)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:org-leave', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    const r = await cloudClient.leaveOrgRemote(url, shopId, token);
    clearOrgSession();
    return { ok: true, ...r };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:org-invite', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.createOrgInvite(url, shopId, token)) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:org-join', async (_e, { url, shopId, token, code } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, ...(await cloudClient.joinOrgRemote(url, shopId, token, String(code || '').trim())) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:org-members', async (_e, { url, shopId, token } = {}) => {
  try {
    token = resolveStoreSecret(token, d => d?.settings?.cloud?.token);
    return { ok: true, members: await cloudClient.listOrgMembers(url, shopId, token) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-lock', () => { cloudBackend = null; clearOrgSession(); return { ok: true }; });
ipcMain.handle('hub:cloud-status', () => ({ unlocked: !!cloudBackend, status: cloudBackend ? cloudBackend.status() : 'off' }));

ipcMain.handle('hub:cloud-push', async (_e, snapshot) => {
  if (!cloudBackend) return { ok: false, error: 'locked' };
  try { return { ok: true, ...(await cloudBackend.push(snapshot)) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-pull', async () => {
  if (!cloudBackend) return { ok: false, error: 'locked' };
  try { return { ok: true, ...(await cloudBackend.pull()) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

/**
 * A restore or import has replaced local state — make the next sync cold.
 *
 * The restore path is renderer-side: this process only reads and decrypts the
 * file, and `applyStoreFromSnapshot` does the replacing. So the backend cannot
 * notice on its own that local just moved BACKWARDS, and its retained view then
 * claims the server holds records local no longer has at those revs — the one
 * direction that pushes older data over newer, on every device.
 * docs/KHAYT-CLOUD-DELTA-SYNC.md §7.
 *
 * Locked is not an error: with no backend there is no in-memory claim to drop,
 * and the cache on disk is checked against the restored store by
 * `viewSafeForLocal` at the next unlock, which is what that guard is for.
 */
ipcMain.handle('hub:cloud-forget-view', () => {
  if (!cloudBackend) return { ok: true, forgotten: false };
  try { cloudBackend.forgetServerView(); return { ok: true, forgotten: true }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// Cloud snapshot history (cross-device restore). list returns metadata only;
// get decrypts the chosen version with the session DEK held in cloudBackend.
ipcMain.handle('hub:cloud-snapshots-list', async () => {
  if (!cloudBackend) return { ok: false, error: 'locked' };
  try { return { ok: true, snapshots: await cloudBackend.listSnapshots() }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:cloud-snapshot-get', async (_e, { id } = {}) => {
  if (!cloudBackend) return { ok: false, error: 'locked' };
  try {
    const snap = await cloudBackend.getSnapshot(id);
    if (!snap) return { ok: false, error: 'Snapshot not found' };
    return { ok: true, ...snap };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('hub:fire-webhook', async (event, { url, event: webhookEvent, payload, secret }) => {
  // Restrict to https:// only — prevents SSRF to localhost and internal network
  if (!url || !url.startsWith('https://')) return { ok: false, error: 'Invalid URL — only https:// allowed' };
  let parsedWebhook;
  try {
    parsedWebhook = new URL(url);
    if (isBlockedHost(parsedWebhook.hostname)) return { ok: false, error: 'Blocked URL — cannot send webhooks to private/loopback addresses' };
  } catch { return { ok: false, error: 'Invalid webhook URL' }; }
  // DNS-rebinding defence: the string check above only inspects the hostname,
  // so a public-looking name (e.g. evil.example.com) could still resolve to an
  // internal IP. Resolve it and reject if ANY answer is in a blocked range.
  // NOTE: best-effort / TOCTOU — fetch() resolves again at connect time and
  // Node does not expose the resolved peer address for a post-connect re-check.
  if (await resolvesToBlockedHost(parsedWebhook.hostname)) {
    return { ok: false, error: 'Blocked URL — hostname resolves to a private/loopback address' };
  }
  try {
    const body = JSON.stringify({ event: webhookEvent, payload, timestamp: Date.now() });
    const headers = { 'Content-Type': 'application/json', 'X-Khayt-Event': webhookEvent };
    if (secret) headers['X-Khayt-Signature'] = require('crypto')
      .createHmac('sha256', secret).update(body).digest('hex');
    const res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(10000) });
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
        success: 'https://khaytapp.com/success',
        cancel:  'https://khaytapp.com/cancel',
        failure: 'https://khaytapp.com/failure',
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
        success:      'https://khaytapp.com/success',
        failure:      'https://khaytapp.com/failure',
        cancel:       'https://khaytapp.com/cancel',
        notification: 'https://khaytapp.com/notify',
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
  const safeSuccessUrl = validateStripeRedirectUrl(successUrl, 'https://khaytapp.com/success');
  const safeCancelUrl  = validateStripeRedirectUrl(cancelUrl,  'https://khaytapp.com/cancel');
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
    title: FLAVOR_NAME,
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

  mainWindow.loadFile(path.join(__dirname, 'renderer', ENTRY_HTML));

  // Prevent same-frame navigation away from the local app file.
  // Without this, renderer JS could do location.href = 'https://evil.com' and retain
  // full access to the contextBridge-exposed hubAPI under a foreign origin.
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAppIndexNavigation(navigationUrl)) {
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
    if (!isAppIndexNavigation(navigationUrl)) {
      event.preventDefault();
    }
  });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
});

// Help-menu destinations. Kept as named constants so the menu below reads as a
// list of places rather than a wall of URLs, and so a typo is in one place.
const KHAYT_SITE = 'https://khaytapp.com';
const BEDREADY_SITE = 'https://bedready.io';
const KHAYT_SUBREDDIT = 'https://www.reddit.com/r/khayt';
const KHAYT_REPO = 'https://github.com/KhaytApp/Khayt';

/**
 * Open a Help-menu destination in the user's browser.
 *
 * Every caller passes a literal from the constants above, so this cannot
 * currently be handed anything hostile. The https check is here for the edit
 * that comes later: shell.openExternal will happily hand `file://` to the OS,
 * and a Help menu is an easy place for someone to wire up a local path without
 * thinking about it.
 */
function openHelpLink(url) {
  const target = String(url || '');
  if (!/^https:\/\//i.test(target)) {
    console.error('refusing to open a non-https help link:', target);
    return;
  }
  shell.openExternal(target).catch((e) => console.error('help link failed:', e));
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      // Electron derives app.name from package.json ("khayt"), so these role items would otherwise read
      // "About khayt" / "Hide khayt" / "Quit khayt" — even in Bed Ready. Override the name-bearing labels
      // with the flavor's product name (Bed Ready / Khayt). Deliberately NOT app.setName(): that would
      // repoint app.getPath('userData') from …/khayt and orphan every user's data.
      label: FLAVOR_NAME,
      submenu: [
        { role: 'about', label: `About ${FLAVOR_NAME}` }, { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide', label: `Hide ${FLAVOR_NAME}` }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
        { role: 'quit', label: `Quit ${FLAVOR_NAME}` }
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
    },
    {
      // There was no Help menu at all, so a shop that wanted the docs, the
      // release notes, or somewhere to report a bug had nowhere in the app to
      // find any of them.
      role: 'help',
      submenu: [
        { label: `${FLAVOR_NAME} Website`, click: () => openHelpLink(isBedReady ? BEDREADY_SITE : KHAYT_SITE) },
        // The subreddit belongs to Khayt. Bed Ready is a separate brand to the
        // people running it, and putting "r/khayt" in their Help menu would be
        // the first they had heard of the other product.
        ...(isBedReady ? [] : [
          { label: 'Community — r/khayt', click: () => openHelpLink(KHAYT_SUBREDDIT) },
        ]),
        { type: 'separator' },
        { label: 'Release Notes', click: () => openHelpLink(`${KHAYT_REPO}/releases`) },
        { label: 'Report an Issue', click: () => openHelpLink(`${KHAYT_REPO}/issues/new`) },
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── BedReady deep-link sign-in (bedready://auth#access_token=…&refresh_token=…) ────────────────────────
// Single-instance so a protocol activation (Windows/Linux relaunch) forwards its argv to the running app
// instead of opening a second window; macOS delivers the URL via 'open-url'. Also gives Khayt one instance
// (one data store), which is the desired behaviour for a business app.
const bedreadyAccount = require('./lib/bedready-account');
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
// Only the Bed Ready flavor owns the bedready:// scheme — Khayt has no BedReady-account UI and must
// not claim the scheme (it would cold-launch Khayt and write a token file it can't use).
if (isBedReady) { try { app.setAsDefaultProtocolClient('bedready'); } catch { /* unpackaged/dev — fine */ } }

function handleBedreadyLink(url) {
  if (!isBedReady) return; // defence in depth — never link a BedReady account on the Khayt flavor
  if (!url || String(url).indexOf('bedready://') !== 0) return;
  // Login-CSRF defence: accept only a link the app itself initiated within the arm window. A drive-by
  // bedready://auth#refresh_token=… fired by a random web page finds the app un-armed → ignored, so it
  // can't silently re-link the app to an attacker's account (session fixation).
  if (!bedreadyLinkArmedAt || Date.now() - bedreadyLinkArmedAt > BEDREADY_LINK_ARM_WINDOW_MS) return;
  bedreadyLinkArmedAt = 0; // single-use
  const tokens = bedreadyAccount.parseDeepLink(url);
  if (!tokens) return;
  // Nonce check (defence-in-depth over the arm window): the link MUST carry a `state` equal to the nonce
  // we minted when we opened this sign-in (the website always echoes it). This closes the login-CSRF
  // residual where a state-less link was accepted on the arm window alone. Timing-safe compare avoids
  // leaking the nonce via response timing.
  const expected = bedreadyLinkNonce;
  bedreadyLinkNonce = ''; // single-use regardless of outcome
  if (!tokens.state || !expected) return;
  const a = Buffer.from(tokens.state);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return;
  if (bedreadyAccount.link(app.getPath('userData'), tokens)) {
    const win = mainWindow || BrowserWindow.getAllWindows()[0];
    if (win) { try { if (win.isMinimized()) win.restore(); win.focus(); win.webContents.send('bedready-linked'); } catch { /* window gone */ } }
  }
}
const isBedreadyLink = (a) => typeof a === 'string' && a.indexOf('bedready://') === 0;
let pendingBedreadyLink = process.argv.find(isBedreadyLink) || null; // cold-start (Windows/Linux) via argv

app.on('second-instance', (_e, argv) => {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (win) { try { if (win.isMinimized()) win.restore(); win.focus(); } catch { /* window gone */ } }
  const link = (argv || []).find(isBedreadyLink);
  if (link) handleBedreadyLink(link);
});
app.on('open-url', (event, url) => { // macOS
  event.preventDefault();
  if (mainWindow) handleBedreadyLink(url); else pendingBedreadyLink = url;
});

app.whenReady().then(() => {
  completePendingFullWipe();
  applyDockIcon();
  buildMenu();
  createWindow();
  if (pendingBedreadyLink) { handleBedreadyLink(pendingBedreadyLink); pendingBedreadyLink = null; }
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
            "img-src 'self' data: blob: https://*.supabase.co",  // *.supabase.co: BedReady library cover thumbnails (Supabase storage) in the Bed Ready flavor
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

  // Grant camera access so the filament label scanner can use getUserMedia({video}).
  // Microphone is intentionally NOT granted — the app never captures audio, so this
  // keeps the permission surface to exactly what the scanner needs.
  //
  // 'clipboard-sanitized-write' is what Chromium asks for on every
  // navigator.clipboard.writeText(). Without it that call rejects with
  // NotAllowedError, which silently killed all ~25 "Copy link" buttons in the
  // renderer — the storefront import/feed links, portal and quote URLs, the
  // colour hex picker, print plans. Reading the clipboard is still denied: the
  // app never pastes on the user's behalf, and clipboard-read is the half that
  // could exfiltrate whatever else the user has copied.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'camera', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ── Flush the renderer's debounced save before quitting ─────────────────────
// saveAll() debounces ~300ms. With no quit handshake, any edit made within that window
// of Cmd+Q or a window close was simply lost, and an in-flight write was killed
// mid-flight. flushSave() already existed in the renderer; nothing ever called it on
// quit. Bounded so a wedged renderer can never make the app unquittable.
let _flushedForQuit = false;
// Set as soon as a quit begins, and read by hub:save-store so the quit flush is
// never blocked behind a modal nobody can dismiss. Module-level, so it is
// initialised long before any IPC callback can run.
let _quittingNow = false;
app.on('before-quit', (e) => {
  _quittingNow = true;
  if (_flushedForQuit) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.webContents.isDestroyed()) { _flushedForQuit = true; return; }
  e.preventDefault();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    _flushedForQuit = true;
    ipcMain.removeListener('hub:flush-save-done', finish);
    app.quit();
  };
  ipcMain.once('hub:flush-save-done', finish);
  try { win.webContents.send('hub:flush-save-request'); } catch (_) { return finish(); }
  // Quit anyway if the renderer doesn't answer — never trap the user in the app. 3s proved
  // too tight under load (a CI run quit before the write completed); 10s still bounds a
  // wedged renderer while leaving room for a large store to be serialised and fsynced.
  setTimeout(finish, 10_000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
