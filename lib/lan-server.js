'use strict';

const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { renderLanQuoteApprovalPage, applyQuoteApprovalToStore, isQuoteExpired } = require('./lan-quote-page');

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

function parseRequestCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return [part.trim(), ''];
    return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
  }).filter(([k]) => k));
}

function normalizePrinterEvent(body) {
  if (typeof body.topic === 'string') {
    const t = body.topic.toLowerCase();
    if (t.includes('done') || t.includes('finished') || t.includes('complete')) return 'print_done';
    if (t.includes('started') || t.includes('start')) return 'print_started';
    if (t.includes('cancel') || t.includes('fail') || t.includes('error')) return 'print_cancelled';
  }
  if (typeof body.event === 'string') {
    const e = body.event.toLowerCase();
    if (e.includes('done') || e.includes('complete') || e.includes('finish')) return 'print_done';
    if (e.includes('start')) return 'print_started';
    if (e.includes('cancel') || e.includes('fail') || e.includes('error')) return 'print_cancelled';
    return body.event;
  }
  if (typeof body.state === 'string') {
    const s = body.state.toLowerCase();
    if (s === 'complete' || s === 'completed' || s === 'standby') return 'print_done';
    if (s === 'printing') return 'print_started';
    if (s === 'cancelled' || s === 'error') return 'print_cancelled';
  }
  return null;
}

function registerLanServer(deps) {
  const {
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
    writeStoreToDisk,
    persistLanStoreUpdate,
    getLanServerStore,
    setLanServerStore,
    getMainWindow,
    statusPagesDir,
    appRoot,
  } = deps;
  const STORE = getLanServerStore;

// ── LAN Tunnel (localtunnel) ─────────────────────────────────────────────────
let _tunnelInstance = null;

ipcMain.handle('hub:start-tunnel', async (_e, arg) => {
  const opts = (arg && typeof arg === 'object') ? arg : { port: arg };
  const { port, acknowledgedRisk } = opts;
  if (!acknowledgedRisk) {
    return { ok: false, error: 'Tunnel risk acknowledgement required' };
  }
  syncLanServerStoreFromDisk();
  const lanPin = resolveStoreSecret(STORE()?.settings?.lanApi?.pin, d => d?.settings?.lanApi?.pin);
  if (!lanPin) return { ok: false, error: 'Configure a LAN PIN before enabling remote tunnel' };
  if (_tunnelInstance) {
    try { _tunnelInstance.close(); } catch {}
    _tunnelInstance = null;
  }
  syncLanServerStoreFromDisk();
  const ownerPin = STORE()?.settings?.lanApi?.pin || '';
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
      if (getMainWindow() && !getMainWindow().isDestroyed())
        getMainWindow().webContents.send('tunnel-status-changed', { active: false, error: String(err) });
    });
    tunnel.on('close', () => {
      _tunnelInstance = null;
      if (getMainWindow() && !getMainWindow().isDestroyed())
        getMainWindow().webContents.send('tunnel-status-changed', { active: false });
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

ipcMain.handle('hub:start-lan-server', async (_e, { port = 3219, pin = '', bindLan = 'loopback' } = {}) => {
  const portNum = parseInt(port, 10);
  if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
    return { ok: false, error: 'Invalid port number (must be 1024–65535)' };
  }
  port = portNum;
  syncLanServerStoreFromDisk();
  if (!STORE() || !Object.keys(STORE()).length) setLanServerStore({});
  migrateLanApiSecrets(STORE());
  const storedPin = STORE()?.settings?.lanApi?.pin || '';
  if (!pin || isStoreSecretMasked(pin)) pin = storedPin;
  pin = String(pin || '').slice(0, 256); // cap PIN length to prevent DoS via giant string comparisons
  let intakeTokenGenerated = false;
  let intakePinGenerated = false;
  try {
    const tokResult = ensureLanIntakeToken(STORE());
    if (tokResult.generated) intakeTokenGenerated = true;
    const pinResult = ensureLanIntakePin(STORE());
    if (pinResult.generated) intakePinGenerated = true;
    if (intakeTokenGenerated || intakePinGenerated) await writeStoreToDisk(STORE());
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
        // NOTE: /order/:id/approve POST is public (quote → pending only).
        // Legacy POST /order/:id with {action:"approve"} is also public for compatibility.
        const isIntakePublicGet = pathname === '/intake' && req.method === 'GET';
        const isIntakeSessionPost = pathname === '/api/intake/session' && req.method === 'POST';
        const isIntakeSubmitPost = pathname === '/api/intake' && req.method === 'POST';
        const isQuoteApprovePost = req.method === 'POST' && /^\/order\/[^/]+\/approve$/.test(pathname);
        const isLegacyQuoteApprovePost = req.method === 'POST' && /^\/order\/[^/]+$/.test(pathname);
        const isQuotePageGet = req.method === 'GET' && /^\/order\/[^/]+\/quote$/.test(pathname);
        const isAlwaysPublic = pathname === '/api/status' || pathname.startsWith('/status/') ||
          (pathname.startsWith('/order/') && req.method === 'GET') ||
          isQuoteApprovePost || isLegacyQuoteApprovePost || isQuotePageGet ||
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
        const store = STORE();
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
        const getIntakePin = () => STORE()?.settings?.lanApi?.intakePin || '';
        const getIntakeToken = () => STORE()?.settings?.lanApi?.intakeToken || '';
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
              const storeData = { ...STORE() };
              storeData.inventory = [...(STORE().inventory || []), spool];
              await persistLanStoreUpdate(storeData);
              // Notify renderer to reload
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-spool-added', spool);
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
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const idx = storeData.printLog.findIndex(o => o.id === orderId);
              if (idx === -1) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Order not found' }));
                return;
              }
              storeData.printLog[idx] = { ...storeData.printLog[idx], status };
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', { id: orderId, status });
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
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
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
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-survey-submitted', {
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

        } else if (pathname.match(/^\/order\/[^/]+\/quote$/) && req.method === 'GET') {
          const rawId = pathname.replace(/^\/order\//, '').replace(/\/quote$/, '');
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          const order = (store.printLog || []).find(o => o.id === safeId);
          const shopName = store.settings?.shopName || store.settings?.bizEn || 'Khayt';
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          if (!order) {
            res.writeHead(404);
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found</title></head><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Quote not found</h2></body></html>`);
          } else {
            const alreadyApproved = order.status !== 'quote' && !(order.status === 'on_hold' && order.hasQuote);
            res.writeHead(200);
            res.end(renderLanQuoteApprovalPage({
              order,
              shopName,
              approvePath: `/order/${safeId}/approve`,
              alreadyApproved,
              expired: !alreadyApproved && isQuoteExpired(order),
            }));
          }

        } else if (pathname.match(/^\/order\/[^/]+\/approve$/) && req.method === 'POST') {
          const rawId = pathname.replace(/^\/order\//, '').replace(/\/approve$/, '');
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
              if (body.trim()) {
                const parsed = JSON.parse(body);
                if (parsed.action && parsed.action !== 'approve') {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Invalid action' }));
                  return;
                }
              }
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const result = applyQuoteApprovalToStore(storeData, safeId);
              if (!result) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Order not found</h2></body></html>`);
                return;
              }
              if (result.error === 'cannot_approve') {
                res.writeHead(409, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;text-align:center;padding:48px;background:#0f172a;color:#e2e8f0"><h2>Cannot approve</h2><p>This quote is no longer awaiting approval.</p></body></html>`);
                return;
              }
              await persistLanStoreUpdate(storeData);
              const approved = result.order;
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', {
                  id: safeId,
                  status: 'pending',
                  clientApprovedAt: approved.clientApprovedAt,
                  quoteAcceptedAt: approved.quoteAcceptedAt,
                  quoteApproved: true,
                });
              }
              const projectName = lanEscapeHtml(approved.project || approved.id);
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.writeHead(200);
              res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote Approved</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#6366f1}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Quote Approved!</h2><p>Your approval for <strong>${projectName}</strong> has been received. We'll start working on your order shortly.</p></div></body></html>`);
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
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
          const rawId = pathname.replace(/^\/order\//, '').replace(/\/status\/?$/, '').replace(/\/quote\/?$/, '');
          const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
          const order = (store.printLog || []).find(o => o.id === safeId);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          if (!order) {
            res.writeHead(404);
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Not Found</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Order Not Found</h2><p>We couldn't find an order with that ID. Please check the link and try again.</p></div></body></html>`);
          } else if (order.status === 'quote') {
            res.writeHead(302, { Location: `/order/${safeId}/quote` });
            res.end();
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

            let surveyHtml = '';
            if ((order.status === 'completed' || order.status === 'delivered') && order.surveyToken && !order.survey) {
              const tokJs = JSON.stringify(order.surveyToken);
              const oidJs = JSON.stringify(order.id);
              surveyHtml = `<div class="card" id="surveyCard"><div class="card-title">Rate Your Experience</div><p style="color:#94a3b8;font-size:.85rem;margin-bottom:12px;">How was your order?</p><div id="stars" style="display:flex;justify-content:center;gap:6px;font-size:28px;margin-bottom:12px">${[1, 2, 3, 4, 5].map(n => `<span data-v="${n}" style="cursor:pointer">☆</span>`).join('')}</div><textarea id="surveyComment" placeholder="Optional comment" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;padding:10px;font-size:.85rem;min-height:72px;margin-bottom:10px;box-sizing:border-box;"></textarea><button id="surveyBtn" style="width:100%;padding:10px;border:none;border-radius:8px;background:#6366f1;color:#fff;font-weight:600;cursor:pointer;">Submit Feedback</button><p id="surveyThanks" style="display:none;color:#4ade80;margin-top:10px;text-align:center;">Thank you!</p></div><script>(function(){let r=0;document.querySelectorAll('#stars span').forEach(s=>s.addEventListener('click',()=>{r=+s.dataset.v;document.querySelectorAll('#stars span').forEach((st,i)=>st.textContent=i<r?'\\u2605':'\\u2606');}));document.getElementById('surveyBtn').addEventListener('click',async()=>{if(!r){alert('Please select a rating');return;}const btn=document.getElementById('surveyBtn');btn.disabled=true;try{const res=await fetch('/api/survey',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${tokJs},orderId:${oidJs},rating:r,comment:document.getElementById('surveyComment').value.trim()})});if(res.ok){btn.style.display='none';document.getElementById('surveyThanks').style.display='block';}else{btn.disabled=false;alert('Could not submit — try again');}}catch(e){btn.disabled=false;}});})();</script>`;
            } else if (order.survey) {
              surveyHtml = `<div class="card"><p style="color:#4ade80;text-align:center;font-size:.9rem;">⭐ Thank you for your feedback!</p></div>`;
            }

            res.writeHead(200);
            res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Status — ${projectName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;padding:24px 16px}.container{max-width:480px;margin:0 auto}.header{text-align:center;margin-bottom:28px}.header h1{font-size:1.5rem;font-weight:700;color:#f1f5f9;margin-bottom:4px}.header .subtitle{color:#94a3b8;font-size:.9rem}.card{background:#1e293b;border-radius:16px;padding:24px;margin-bottom:16px}.card-title{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:16px}.status-badge{display:inline-block;padding:6px 14px;border-radius:20px;font-size:.85rem;font-weight:600;background:${accentColor}22;color:${accentColor};margin-bottom:12px}.status-desc{color:#94a3b8;font-size:.9rem;line-height:1.5}.progress{display:flex;align-items:flex-start;gap:0;margin-top:8px}.step{flex:1;display:flex;flex-direction:column;align-items:center;position:relative}.step:not(:last-child)::after{content:'';position:absolute;top:10px;left:50%;width:100%;height:2px;background:#334155;z-index:0}.step.active:not(:last-child)::after{background:#6366f1}.dot{width:20px;height:20px;border-radius:50%;background:#334155;border:2px solid #334155;position:relative;z-index:1;transition:all .2s}.step.active .dot{background:#6366f1;border-color:#6366f1}.step.current .dot{box-shadow:0 0 0 4px #6366f133}.step-label{font-size:.65rem;color:#64748b;margin-top:6px;text-align:center;line-height:1.3}.step.active .step-label{color:#a5b4fc}.detail{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #0f172a}.detail:last-child{border-bottom:none}.detail-label{font-size:.8rem;color:#64748b}.detail-val{font-size:.85rem;color:#e2e8f0;font-weight:500;text-align:right;max-width:60%}.footer{text-align:center;margin-top:24px;color:#475569;font-size:.8rem;line-height:1.6}</style></head><body><div class="container"><div class="header"><h1>${projectName}</h1><div class="subtitle">Order Status</div></div><div class="card"><div class="card-title">Current Status</div><div class="status-badge">${statusLabel}</div><p class="status-desc">${statusDesc}</p>${!isWarning ? `<div class="progress" style="margin-top:20px">${stepsHtml}</div>` : ''}</div>${detailsHtml ? `<div class="card"><div class="card-title">Order Details</div>${detailsHtml}</div>` : ''}${surveyHtml}<div class="footer"><p>Thank you for choosing ${shopName}</p><p style="margin-top:4px;font-size:.75rem;color:#334155">Auto-refreshes every 30s</p></div></div><script>setTimeout(()=>location.reload(),30000);</script></body></html>`);
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
          const iconPath = path.join(appRoot, 'assets', 'icon_preview.png');
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
              const storeData = { ...STORE() };
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
                  if (getMainWindow() && !getMainWindow().isDestroyed()) {
                    getMainWindow().webContents.send('lan-kanban-advanced', advancedOrder);
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
              const storeData = { ...STORE() };
              storeData.waitingList = [...(STORE().waitingList || []), entry];
              await persistLanStoreUpdate(storeData);
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-intake-submitted', entry);
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
              const parsed = body.trim() ? JSON.parse(body) : {};
              if (parsed.action && parsed.action !== 'approve') {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(400);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bad Request</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Invalid Action</h2><p>Unknown action. Only "approve" is supported.</p></div></body></html>`);
                return;
              }
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
              const result = applyQuoteApprovalToStore(storeData, safeId);
              if (!result) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(404);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Not Found</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Order Not Found</h2><p>We could not find an order with that ID.</p></div></body></html>`);
                return;
              }
              if (result.error === 'cannot_approve') {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.writeHead(409);
                res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cannot Approve</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#1e293b;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;width:100%}h2{font-size:1.4rem;margin-bottom:12px;color:#f1f5f9}p{color:#94a3b8;line-height:1.6}</style></head><body><div class="card"><h2>Cannot Approve</h2><p>This order is not in a state that can be approved.</p></div></body></html>`);
                return;
              }
              await persistLanStoreUpdate(storeData);
              const approved = result.order;
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', {
                  id: safeId,
                  status: 'pending',
                  clientApprovedAt: approved.clientApprovedAt,
                  quoteAcceptedAt: approved.quoteAcceptedAt,
                  quoteApproved: true,
                });
              }
              const projectName = lanEscapeHtml(approved.project || approved.id);
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
              const sallaSecret = STORE().settings?.lanApi?.sallaWebhookSecret;
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
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
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
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', newOrder);
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
              const zidSecret = STORE().settings?.lanApi?.zidWebhookSecret;
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
              const storeData = { ...STORE() };
              storeData.printLog = [...(STORE().printLog || [])];
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
              if (getMainWindow() && !getMainWindow().isDestroyed()) {
                getMainWindow().webContents.send('lan-order-updated', newOrder);
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
        if (getMainWindow() && !getMainWindow().isDestroyed()) {
          getMainWindow().webContents.send('lan-start-failed', { error: String(e) });
        }
        resolve({ ok: false, error: String(e) });
      });
    } catch(e) {
      console.error('LAN server failed to start:', e);
      if (getMainWindow() && !getMainWindow().isDestroyed()) {
        getMainWindow().webContents.send('lan-start-failed', { error: String(e) });
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
}

module.exports = { registerLanServer, lanEscapeHtml, safeTokenEqual, normalizePrinterEvent };
