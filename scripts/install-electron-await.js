#!/usr/bin/env node
/**
 * Reliable Electron binary install (waits for download + extract).
 * Uses system unzip on macOS/Linux because extract-zip hangs on Node 24.16+ / 26+
 * (https://github.com/electron/electron/issues/51619).
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const electronDir = path.join(root, 'node_modules', 'electron');
const pathTxt = path.join(electronDir, 'path.txt');

function platformPath() {
  const p = process.env.ELECTRON_INSTALL_PLATFORM || process.platform;
  if (p === 'darwin' || p === 'mas') return 'Electron.app/Contents/MacOS/Electron';
  if (p === 'win32') return 'electron.exe';
  if (p === 'linux' || p === 'freebsd' || p === 'openbsd') return 'electron';
  throw new Error('Unsupported platform: ' + p);
}

function resolveArch() {
  let arch = process.env.ELECTRON_INSTALL_ARCH || process.arch;
  const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.platform;
  if (
    platform === 'darwin' &&
    process.platform === 'darwin' &&
    arch === 'x64' &&
    !process.env.ELECTRON_INSTALL_ARCH
  ) {
    try {
      const out = execSync('sysctl -in sysctl.proc_translated', { encoding: 'utf8' });
      if (out.trim() === '1') arch = 'arm64';
    } catch { /* Intel Mac or sysctl unavailable */ }
  }
  return arch;
}

function hasUnzip() {
  const r = spawnSync('unzip', ['-v'], { stdio: 'ignore' });
  return r.status === 0;
}

async function extractZipArchive(zipPath, distDir) {
  fs.mkdirSync(distDir, { recursive: true });
  const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.platform;

  if (
    (platform === 'darwin' || platform === 'linux' || platform === 'freebsd' || platform === 'openbsd') &&
    hasUnzip()
  ) {
    const r = spawnSync('unzip', ['-o', '-q', zipPath, '-d', distDir], { stdio: 'inherit' });
    if (r.status !== 0) {
      throw new Error('unzip failed with exit code ' + (r.status ?? r.error?.message ?? 'unknown'));
    }
    return;
  }

  if (platform === 'win32') {
    const ps = [
      'powershell',
      '-NoProfile',
      '-Command',
      `Expand-Archive -Force -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${distDir.replace(/'/g, "''")}'`,
    ];
    const r = spawnSync(ps[0], ps.slice(1), { stdio: 'inherit' });
    if (r.status !== 0) {
      throw new Error('Expand-Archive failed with exit code ' + (r.status ?? r.error?.message ?? 'unknown'));
    }
    return;
  }

  const extract = require('extract-zip');
  await extract(zipPath, { dir: distDir });
}

function postExtract(electronDir, distDir, platPath, version) {
  const srcTypeDef = path.join(distDir, 'electron.d.ts');
  const targetTypeDef = path.join(electronDir, 'electron.d.ts');
  if (fs.existsSync(srcTypeDef)) {
    fs.renameSync(srcTypeDef, targetTypeDef);
  }

  const distExe = path.join(distDir, platPath);
  if (!fs.existsSync(distExe)) {
    throw new Error(
      'Electron binary not found after extract: ' + distExe + '\n' +
      'If you use Node 24.16+, ensure `unzip` is available (macOS: Xcode CLI tools) or use Node 22.15 LTS.'
    );
  }

  fs.writeFileSync(path.join(distDir, 'version'), 'v' + version);
  fs.writeFileSync(pathTxt, platPath);
}

function ensureElectronPackage() {
  if (fs.existsSync(electronDir)) return;

  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error('Run this from the Khayt project root (where package.json lives).');
    process.exit(1);
  }

  console.log('node_modules/electron is missing — installing the electron npm package…\n');
  const r = spawnSync('npm', ['install', 'electron', '--save-dev'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error('\nFailed. From the project folder run: npm install');
    process.exit(1);
  }
  if (!fs.existsSync(electronDir)) {
    console.error('\nStill missing node_modules/electron after npm install.');
    console.error('Try: rm -rf node_modules package-lock.json && npm install');
    process.exit(1);
  }
}

async function main() {
  ensureElectronPackage();

  const { version } = require(path.join(electronDir, 'package.json'));
  const platPath = platformPath();
  const distDir = path.join(electronDir, 'dist');
  const distExe = path.join(distDir, platPath);

  if (fs.existsSync(pathTxt) && fs.existsSync(distExe)) {
    console.log('Electron already installed.');
    return;
  }

  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  const extractZipBroken = nodeMajor >= 26 || nodeMajor > 24 || (nodeMajor === 24 && nodeMinor >= 16);

  console.log(`Installing Electron ${version} for ${process.platform}-${resolveArch()}…`);
  if (extractZipBroken && process.platform === 'darwin' && !hasUnzip()) {
    console.warn(
      'Note: Node ' + process.versions.node + ' breaks npm extract-zip. Install unzip: xcode-select --install'
    );
  }
  console.log('(About 150MB — can take several minutes on a slow connection.)\n');

  const { downloadArtifact } = require('@electron/get');

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.env.ELECTRON_INSTALL_PLATFORM || process.platform,
    arch: resolveArch(),
    checksums: require(path.join(electronDir, 'checksums.json')),
  });

  console.log('Extracting…');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  await extractZipArchive(zipPath, distDir);
  postExtract(electronDir, distDir, platPath, version);

  console.log('\nSuccess. Run: npm start\n');
}

main().catch((err) => {
  console.error('\nElectron install failed:\n', err.message || err);
  console.error('\nTry a mirror (then run this script again):');
  console.error('  export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/');
  console.error('\nOr use Node 22.15 LTS until extract-zip is fixed upstream.');
  process.exit(1);
});
