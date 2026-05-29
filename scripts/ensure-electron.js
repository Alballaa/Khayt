#!/usr/bin/env node
/**
 * Ensure Electron binary is downloaded (path.txt exists) before launching.
 * Run automatically via npm start.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const pathTxt = path.join(root, 'node_modules', 'electron', 'path.txt');
const awaitInstaller = path.join(__dirname, 'install-electron-await.js');

if (fs.existsSync(pathTxt)) {
  process.exit(0);
}

if (!fs.existsSync(awaitInstaller)) {
  console.error('Electron is not installed. Run: npm install');
  process.exit(1);
}

console.log('Khayt: downloading Electron (one-time, ~150MB). Please wait…\n');
try {
  execSync(`node "${awaitInstaller}"`, { stdio: 'inherit', cwd: root, env: process.env });
} catch (e) {
  console.error('\nElectron install failed.');
  console.error('Try manually:\n  node scripts/install-electron-await.js');
  console.error('If download is blocked, set a mirror then retry:\n  export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/');
  process.exit(1);
}

if (!fs.existsSync(pathTxt)) {
  console.error('\nElectron install finished but path.txt is still missing.');
  console.error('Try: rm -rf node_modules/electron && npm install');
  process.exit(1);
}

console.log('\nElectron ready.\n');
