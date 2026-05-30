'use strict';

const path = require('path');
const { buildZatcaCsrDer } = require('./zatca-asn1');

/**
 * ZATCA Phase 2 keypair, CSR, signing, and Fatoorah API IPC handlers.
 * @param {{ app: import('electron').App, fs: typeof import('fs'), crypto: typeof import('crypto'), ipcMain: import('electron').IpcMain, encryptStoreField: Function, decryptStoreField: Function }} deps
 */
function registerZatcaCrypto({ app, fs, crypto, ipcMain, encryptStoreField, decryptStoreField }) {
  const zatcaKeyPath = () => path.join(app.getPath('userData'), 'zatca-keypair.enc');

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
}

module.exports = { registerZatcaCrypto };
