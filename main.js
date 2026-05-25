const { app, BrowserWindow, Menu, shell, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');

function encryptStoreField(val) {
  if (!val || typeof val !== 'string' || !safeStorage.isEncryptionAvailable()) return val;
  return '__enc__' + safeStorage.encryptString(val).toString('base64');
}

function decryptStoreField(val) {
  if (!val || typeof val !== 'string' || !val.startsWith('__enc__')) return val;
  if (!safeStorage.isEncryptionAvailable()) return val;
  try { return safeStorage.decryptString(Buffer.from(val.slice(7), 'base64')); }
  catch { return val; }
}

// ── ZATCA Phase 2 — ASN.1 DER utilities ─────────────────────────────────────
function asn1Len(n) {
  if (n < 0x80) return Buffer.from([n]);
  if (n < 0x100) return Buffer.from([0x81, n]);
  return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]);
}
function asn1TL(tag, content) {
  return Buffer.concat([Buffer.from([tag]), asn1Len(content.length), content]);
}
const asn1Seq    = (items) => asn1TL(0x30, Array.isArray(items) ? Buffer.concat(items) : items);
const asn1Set    = (items) => asn1TL(0x31, Array.isArray(items) ? Buffer.concat(items) : items);
const asn1OStr   = (b)     => asn1TL(0x04, b);
const asn1BitStr = (b)     => asn1TL(0x03, Buffer.concat([Buffer.from([0x00]), b]));
const asn1Int    = (n)     => asn1TL(0x02, Buffer.from([n]));
const asn1Utf8   = (s)     => asn1TL(0x0c, Buffer.from(s, 'utf8'));
const asn1Print  = (s)     => asn1TL(0x13, Buffer.from(s, 'ascii'));
const asn1CtxX   = (n, b)  => asn1TL(0xa0 | n, b);  // [n] EXPLICIT/IMPLICIT constructed

function asn1OID(oidStr) {
  const p = oidStr.split('.').map(Number);
  const bytes = [40 * p[0] + p[1]];
  for (let i = 2; i < p.length; i++) {
    let n = p[i]; if (n < 0x80) { bytes.push(n); continue; }
    const chunk = [];
    while (n > 0) { chunk.unshift(n & 0x7f); n >>>= 7; }
    for (let j = 0; j < chunk.length - 1; j++) chunk[j] |= 0x80;
    bytes.push(...chunk);
  }
  return asn1TL(0x06, Buffer.from(bytes));
}

function buildZatcaCsrDer({ privateKey, pubDer, cn, org, vat, invoiceType = '1100', location = 'Riyadh', industry = '3D Printing' }) {
  const rdn = (oidStr, val, strTag = 0x0c) =>
    asn1Set([asn1Seq([asn1OID(oidStr), asn1TL(strTag, Buffer.from(val, 'utf8'))])]);

  const subject = asn1Seq([
    rdn('2.5.4.6',  'SA',  0x13),
    rdn('2.5.4.10', org),
    rdn('2.5.4.11', vat),
    rdn('2.5.4.3',  cn),
  ]);

  // OtherName inside GeneralName: [0] IMPLICIT { OID, [0] EXPLICIT UTF8String }
  const otherName = (typeOid, val) =>
    asn1CtxX(0, Buffer.concat([asn1OID(typeOid), asn1CtxX(0, asn1Utf8(val))]));

  const sanContent = asn1Seq([
    otherName('2.16.682.1.35.1.1.2', invoiceType),
    otherName('2.16.682.1.35.1.1.3', location),
    otherName('2.16.682.1.35.1.1.4', industry),
  ]);

  const extensions = asn1Seq([
    asn1Seq([asn1OID('2.5.29.17'), asn1OStr(sanContent)]),
  ]);

  const extReqAttr = asn1Seq([
    asn1OID('1.2.840.113549.1.9.14'),
    asn1Set([extensions]),
  ]);

  const crInfo = asn1Seq([
    asn1Int(0),
    subject,
    Buffer.from(pubDer),
    asn1CtxX(0, extReqAttr),  // [0] IMPLICIT attributes
  ]);

  const signer = crypto.createSign('SHA256');
  signer.update(crInfo);
  const sig = signer.sign(privateKey);

  const sigAlg = asn1Seq([asn1OID('1.2.840.10045.4.3.2')]);
  return asn1Seq([crInfo, sigAlg, asn1BitStr(sig)]);
}

const zatcaKeyPath = () => path.join(app.getPath('userData'), 'zatca-keypair.enc');

// Prepare a store object for writing to disk: deep-clone + encrypt sensitive fields.
function encryptForDisk(data) {
  const d = JSON.parse(JSON.stringify(data));
  if (d?.settings?.emailConfig?.apiKey)
    d.settings.emailConfig.apiKey = encryptStoreField(d.settings.emailConfig.apiKey);
  if (Array.isArray(d?.machines))
    d.machines = d.machines.map(m =>
      m?.printerApi?.apiKey
        ? { ...m, printerApi: { ...m.printerApi, apiKey: encryptStoreField(m.printerApi.apiKey) } }
        : m
    );
  if (d?.settings?.zatcaPhase2?.csid)  d.settings.zatcaPhase2.csid  = encryptStoreField(d.settings.zatcaPhase2.csid);
  if (d?.settings?.zatcaPhase2?.pcsid) d.settings.zatcaPhase2.pcsid = encryptStoreField(d.settings.zatcaPhase2.pcsid);
  return d;
}

let mainWindow;

/* ---------- Main data store (file-based, replaces localStorage) ---------- */
function dataFilePath() {
  return path.join(app.getPath('userData'), 'khayt-store.json');
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
  const text = encodeURIComponent(String(message || ''));
  const url = clean ? `https://wa.me/${clean}?text=${text}` : `https://wa.me/?text=${text}`;
  await shell.openExternal(url);
  if (pdfPath && fs.existsSync(pdfPath)) shell.showItemInFolder(pdfPath);
  return true;
});

// --- iCloud Drive backup (new in 1.4) ---
ipcMain.handle('hub:icloud-available', async () => {
  if (process.platform !== 'darwin') return false;
  const icloudBase = path.join(app.getPath('home'), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  return fs.existsSync(icloudBase);
});

ipcMain.handle('hub:write-icloud-backup', async (_e, jsonString) => {
  if (process.platform !== 'darwin') return null;
  const icloudBase = path.join(app.getPath('home'), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  if (!fs.existsSync(icloudBase)) return null;
  const backupDir = path.join(icloudBase, 'Khayt', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const filename = `${new Date().toISOString().split('T')[0]}.json`;
  const fullPath = path.join(backupDir, filename);
  const encrypted = JSON.stringify(encryptForDisk(JSON.parse(jsonString)));
  await fs.promises.writeFile(fullPath, encrypted, 'utf8');
  return fullPath;
});

// --- Daily auto-backup (new in 1.3) ---
ipcMain.handle('hub:write-backup', async (_e, jsonString) => {
  const filename = `${new Date().toISOString().split('T')[0]}.json`;
  const fullPath = path.join(backupsDir(), filename);
  const encrypted = JSON.stringify(encryptForDisk(JSON.parse(jsonString)));
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
    return { name: f.replace('.json', ''), path: fullPath, mtime: stat.mtimeMs };
  }));
});

// Read a backup file by path (Feature 6)
ipcMain.handle('hub:restore-backup', async (_e, backupPath) => {
  const safe = path.join(backupsDir(), path.basename(String(backupPath || '')));
  if (!fs.existsSync(safe)) return null;
  const content = await fs.promises.readFile(safe, 'utf8');
  return content;
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
ipcMain.handle('hub:save-html', async (_e, html, filename) => {
  const tmpDir = app.getPath('temp');
  const safeName = (String(filename || 'status.html')).replace(/[^a-zA-Z0-9._-]/g, '_');
  const fullPath = path.join(tmpDir, safeName);
  await fs.promises.writeFile(fullPath, String(html || ''), 'utf8');
  await shell.openPath(fullPath);
  return fullPath;
});

// --- Main data store (file-based) ---
ipcMain.handle('hub:load-store', async () => {
  const fp = dataFilePath();
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const data = JSON.parse(raw);
    // Decrypt sensitive fields
    if (data?.settings?.emailConfig?.apiKey) {
      data.settings.emailConfig.apiKey = decryptStoreField(data.settings.emailConfig.apiKey);
    }
    if (Array.isArray(data?.machines)) {
      data.machines = data.machines.map(m => {
        if (m?.printerApi?.apiKey) {
          return { ...m, printerApi: { ...m.printerApi, apiKey: decryptStoreField(m.printerApi.apiKey) } };
        }
        return m;
      });
    }
    if (data?.settings?.zatcaPhase2?.csid)  data.settings.zatcaPhase2.csid  = decryptStoreField(data.settings.zatcaPhase2.csid);
    if (data?.settings?.zatcaPhase2?.pcsid) data.settings.zatcaPhase2.pcsid = decryptStoreField(data.settings.zatcaPhase2.pcsid);
    return data;
  } catch (e) {
    console.error('hub:load-store error:', e);
    return { __corrupt: true, error: String(e.message || e) };
  }
});

ipcMain.handle('hub:save-store', async (_e, data) => {
  const fp = dataFilePath();
  const tmp = fp + '.tmp';
  try {
    await fs.promises.writeFile(tmp, JSON.stringify(encryptForDisk(data)), 'utf8');
    await fs.promises.rename(tmp, fp);
    lanServerStore = data;  // keep LAN server in sync (plaintext in-memory)
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
  await fs.promises.writeFile(fullPath, String(html || ''), 'utf8');
  return fullPath;
});

// --- Safe external URL opener (mailto, https) ---
ipcMain.handle('hub:open-external', async (_e, url) => {
  const s = String(url || '');
  // Only allow safe URL schemes — no http:// to prevent local network exploit attempts
  if (!s.startsWith('mailto:') && !s.startsWith('https://')) return false;
  await shell.openExternal(s);
  return true;
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
  const poll = async () => {
    for (const machine of (machines || [])) {
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
  const printerHost = String(host || '');
  if (/^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0)$/i.test(printerHost)) {
    return { ok: false, error: 'Printer host cannot be localhost' };
  }
  const baseUrl = `http://${printerHost}:${port || defaultPrinterPort(type)}`;
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
    const data = await get(`/printer/api/${slug}?a=stateList`);
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
  if (smtpConfig?.provider === 'sendgrid' && smtpConfig?.apiKey) {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${smtpConfig.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: smtpConfig.fromEmail || 'noreply@khayt.app', name: smtpConfig.fromName || 'Khayt' },
          subject,
          content: [{ type: 'text/html', value: body }]
        })
      });
      return { ok: res.ok, status: res.status };
    } catch(e) {
      return { ok: false, error: String(e) };
    }
  }
  if (smtpConfig?.provider === 'mailgun' && smtpConfig?.apiKey && smtpConfig?.domain) {
    try {
      const formData = new URLSearchParams({
        from: `${smtpConfig.fromName||'Khayt'} <mailgun@${smtpConfig.domain}>`,
        to, subject, html: body
      });
      const res = await fetch(`https://api.mailgun.net/v3/${smtpConfig.domain}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${Buffer.from(`api:${smtpConfig.apiKey}`).toString('base64')}` },
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

// ── LAN Tunnel (localtunnel) ─────────────────────────────────────────────────
let _tunnelInstance = null;

ipcMain.handle('hub:start-tunnel', async (_e, port) => {
  if (_tunnelInstance) {
    try { _tunnelInstance.close(); } catch {}
    _tunnelInstance = null;
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
let lanServerStore = {};  // reference to current store, updated via hub:save-store

ipcMain.handle('hub:start-lan-server', async (_e, { port = 3219, pin = '' } = {}) => {
  const portNum = parseInt(port, 10);
  if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
    return { ok: false, error: 'Invalid port number (must be 1024–65535)' };
  }
  port = portNum;
  if (lanServer) { lanServer.close(); lanServer = null; }
  // Brute-force tracking: { ip -> { count, resetAt } }
  const failedAttempts = new Map();
  const LOCKOUT_MS = 60_000;     // 1-minute lockout after 10 failures
  const MAX_BODY   = 1_048_576; // 1 MB body limit
  return new Promise(resolve => {
    try {
      lanServer = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);
        const ip = req.socket.remoteAddress || '';
        const isWriteRequest = req.method !== 'GET' && req.method !== 'HEAD';
        const pathname = url.pathname.replace(/\/$/, '');

        // Routes that are always public regardless of PIN configuration
        const isAlwaysPublic = pathname === '/api/status' || pathname === '/api/queue' ||
          pathname === '/api/machines' || pathname.startsWith('/status/') ||
          pathname === '/' || pathname === '/manifest.json' || pathname === '/sw.js' ||
          pathname === '/icon-192.png' || pathname === '/icon-512.png' ||
          pathname.startsWith('/api/webhook/printer/');
        const isSurveyEndpoint = pathname === '/api/survey' && req.method === 'POST';
        const requirePin = isWriteRequest && !isSurveyEndpoint && !isAlwaysPublic;
        if (!isAlwaysPublic && (requirePin || (pin && !isSurveyEndpoint))) {
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
            if (provided !== pin) {
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
        res.setHeader('Content-Type', 'application/json');

        // H3: helper to enforce PIN for sensitive GET routes
        const checkPinForGet = () => {
          if (!pin) return true; // no PIN configured — allow (read-only)
          const provided = (url.searchParams.get('pin') || req.headers['x-khayt-pin'] || '').trim();
          const now = Date.now();
          const ipData = failedAttempts.get(ip) || { count: 0, resetAt: 0 };
          if (now < ipData.resetAt && ipData.count >= 10) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many attempts — try again in 1 minute' }));
            return false;
          }
          if (provided !== pin) {
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
          res.writeHead(200);
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
          let orders = (store.printLog || []).slice(0, limit);
          if (status) orders = orders.filter(o => o.status === status);
          res.writeHead(200);
          res.end(JSON.stringify(orders.map(o => ({
            id: o.id, project: o.project, client: o.client, status: o.status,
            material: o.material, price: o.price, dueDate: o.dueDate, date: o.date,
            paymentStatus: o.paymentStatus
          }))));
        } else if (pathname === '/api/queue') {
          const queue = (store.printLog || []).filter(o =>
            ['pending','printing','post','qc'].includes(o.status));
          res.writeHead(200);
          res.end(JSON.stringify(queue.map(o => ({
            id: o.id, project: o.project, client: o.client, status: o.status,
            machine: o.machine, dueDate: o.dueDate, priority: o.priority
          }))));
        } else if (pathname === '/api/machines') {
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
              storeData.inventory = [...(storeData.inventory || []), spool];
              lanServerStore = storeData;
              const fp = dataFilePath();
              await fs.promises.writeFile(fp + '.tmp', JSON.stringify(encryptForDisk(storeData)), 'utf8');
              await fs.promises.rename(fp + '.tmp', fp);
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
              const idx = (storeData.printLog || []).findIndex(o => o.id === orderId);
              if (idx === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Order not found' }));
                return;
              }
              storeData.printLog[idx] = { ...storeData.printLog[idx], status };
              lanServerStore = storeData;
              const fp = dataFilePath();
              await fs.promises.writeFile(fp + '.tmp', JSON.stringify(encryptForDisk(storeData)), 'utf8');
              await fs.promises.rename(fp + '.tmp', fp);
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
              const idx = (storeData.printLog || []).findIndex(o => o.surveyToken === token);
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
                }
              };
              lanServerStore = storeData;
              const fp = dataFilePath();
              await fs.promises.writeFile(fp + '.tmp', JSON.stringify(encryptForDisk(storeData)), 'utf8');
              await fs.promises.rename(fp + '.tmp', fp);
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
          if (!expectedToken || !safeTokenEqual(providedToken, expectedToken)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized — set webhook token in Khayt LAN settings' }));
            return;
          }
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
                  lanServerStore = storeData;
                  const fp = dataFilePath();
                  await fs.promises.writeFile(fp + '.tmp', JSON.stringify(encryptForDisk(storeData)), 'utf8');
                  await fs.promises.rename(fp + '.tmp', fp);
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

        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found', endpoints: ['/api/status','/api/orders','/api/queue','/api/machines','/api/inventory','/api/webhook/printer/:machineId'] }));
        }
      });
      lanServer.listen(port, '0.0.0.0', () => {
        const ifaces = os.networkInterfaces();
        let localIp = '127.0.0.1';
        for (const iface of Object.values(ifaces)) {
          for (const addr of iface) {
            if (addr.family === 'IPv4' && !addr.internal) { localIp = addr.address; break; }
          }
          if (localIp !== '127.0.0.1') break;
        }
        resolve({ ok: true, url: `http://${localIp}:${port}`, localIp, port });
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
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

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

  // Grant camera access so the filament label scanner can use getUserMedia
  const { session } = require('electron');
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
