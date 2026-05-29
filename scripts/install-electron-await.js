#!/usr/bin/env node
/**
 * Reliable Electron binary install (waits for download + extract).
 * The stock install.js can return before the async download finishes.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const pathTxt = path.join(electronDir, 'path.txt');

function platformPath() {
  const p = process.platform;
  if (p === 'darwin') return 'Electron.app/Contents/MacOS/Electron';
  if (p === 'win32') return 'electron.exe';
  if (p === 'linux' || p === 'freebsd' || p === 'openbsd') return 'electron';
  throw new Error('Unsupported platform: ' + p);
}

function resolveArch() {
  let arch = process.env.ELECTRON_INSTALL_ARCH || process.arch;
  if (process.platform === 'darwin') {
    try {
      const out = execSync('sysctl -in sysctl.proc_translated', { encoding: 'utf8' });
      if (out.trim() === '1') arch = 'arm64';
    } catch { /* Intel Mac or sysctl unavailable */ }
  }
  return arch;
}

async function main() {
  if (!fs.existsSync(electronDir)) {
    console.error('Missing node_modules/electron — run: npm install');
    process.exit(1);
  }

  const { version } = require(path.join(electronDir, 'package.json'));
  const platPath = platformPath();
  const distExe = path.join(electronDir, 'dist', platPath);

  if (fs.existsSync(pathTxt) && fs.existsSync(distExe)) {
    console.log('Electron already installed.');
    return;
  }

  console.log(`Installing Electron ${version} for ${process.platform}-${resolveArch()}…`);
  console.log('(About 150MB — can take several minutes on a slow connection.)\n');

  const { downloadArtifact } = require('@electron/get');
  const extract = require('extract-zip');

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.env.ELECTRON_INSTALL_PLATFORM || process.platform,
    arch: resolveArch(),
    checksums: require(path.join(electronDir, 'checksums.json')),
  });

  console.log('Extracting…');
  const distDir = path.join(electronDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  await extract(zipPath, { dir: distDir });

  await fs.promises.writeFile(path.join(electronDir, 'dist', 'version'), 'v' + version);
  await fs.promises.writeFile(pathTxt, platPath);

  console.log('\nSuccess. Run: npm start\n');
}

main().catch((err) => {
  console.error('\nElectron install failed:\n', err.message || err);
  console.error('\nTry a mirror (then run this script again):');
  console.error('  export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/');
  process.exit(1);
});
