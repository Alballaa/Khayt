#!/usr/bin/env node
/* Verify the converter's 3D source preview end-to-end. Generates a real cube as both
 * STL and 3MF in the OS temp dir (which the converter's read guard allows), then:
 *  - calls hub.convertMesh({path}) for each and checks the flat mesh comes back,
 *  - opens the full openConverter modal on the 3MF and checks the preview canvas
 *    mounts + rasterizes (the "know what you're converting" panel). */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { _electron as electron } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const mfw = require(path.join(root, 'lib/mf-write.js'));

function assert(label, cond) { if (!cond) throw new Error(`ASSERT FAILED: ${label}`); console.log(`  ✓ ${label}`); }

// A 20mm cube as triangle soup [[x,y,z]×3].
function cubeTris(s = 20) {
  const v = (x, y, z) => [x, y, z];
  const q = (a, b, c, d) => [[a, b, c], [a, c, d]];
  let t = [];
  t = t.concat(q(v(0, 0, 0), v(s, 0, 0), v(s, s, 0), v(0, s, 0)));
  t = t.concat(q(v(0, 0, s), v(0, s, s), v(s, s, s), v(s, 0, s)));
  t = t.concat(q(v(0, 0, 0), v(0, 0, s), v(s, 0, s), v(s, 0, 0)));
  t = t.concat(q(v(0, s, 0), v(s, s, 0), v(s, s, s), v(0, s, s)));
  t = t.concat(q(v(0, 0, 0), v(0, s, 0), v(0, s, s), v(0, 0, s)));
  t = t.concat(q(v(s, 0, 0), v(s, 0, s), v(s, s, s), v(s, s, 0)));
  return t;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-conv-'));
  const tris = cubeTris(20);
  const stlPath = path.join(dir, 'cube.stl');
  const mfPath = path.join(dir, 'cube.3mf');
  fs.writeFileSync(stlPath, mfw.trianglesToStl(tris));
  fs.writeFileSync(mfPath, mfw.meshTo3mf(tris));
  assert('generated cube.stl + cube.3mf fixtures', fs.existsSync(stlPath) && fs.existsSync(mfPath) && fs.statSync(mfPath).size > 100);

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'br-conv-ud-'))}`], cwd: root,
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1', KHAYT_FLAVOR: 'bedready' }, timeout: 120_000,
  });
  const w = await app.firstWindow();
  const errs = [];
  w.on('pageerror', (e) => errs.push(String(e && e.message || e)));
  await w.waitForSelector('.khayt-app', { timeout: 60_000 });
  await w.waitForFunction(() => typeof window.openConverter === 'function'
    && typeof window.mountMeshViewer === 'function' && !!window.hubAPI?.convertMesh, { timeout: 60_000 });

  // 1) convertMesh IPC for both formats.
  for (const [label, p] of [['STL', stlPath], ['3MF', mfPath]]) {
    const m = await w.evaluate((p) => window.hubAPI.convertMesh({ path: p }), p);
    assert(`convertMesh(${label}) → ok mesh (${m && m.count} tri)`, m && m.ok && m.count === 12);
    assert(`convertMesh(${label}) bbox ≈ 20mm`, m && Math.round(m.bbox.x) === 20 && Math.round(m.bbox.z) === 20);
    const shades = await w.evaluate((mesh) => {
      const c = document.createElement('canvas'); c.width = c.height = 200; document.body.appendChild(c);
      window.mountMeshViewer(c, { verts: mesh.verts, count: mesh.count });
      const d = c.getContext('2d').getImageData(0, 0, 200, 200).data;
      const s = new Set(); for (let i = 0; i < d.length; i += 4 * 53) s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      c.remove(); return s.size;
    }, m);
    assert(`convertMesh(${label}) rasterizes (${shades} shades)`, shades >= 3);
  }

  // 2) full converter modal on the 3MF — preview canvas mounts + hint flips to "Drag to rotate".
  await w.evaluate(() => window.switchTab('converter-tab'));
  await w.waitForTimeout(200);
  await w.evaluate((p) => window.openConverter({ path: p, name: 'cube.3mf' }), mfPath);
  await w.waitForSelector('#convPreviewCanvas', { timeout: 8000 });
  await w.waitForFunction(() => {
    const h = document.querySelector('#convPreview .conv-preview-hint');
    return h && /rotate|درو|Drag|glisser|回転|döndür|Ziehen|rotar|旋转/i.test(h.textContent);
  }, { timeout: 8000 });
  assert('converter modal shows a live source preview', true);

  await w.screenshot({ path: path.join(root, 'scratch-converter-preview.png') });
  console.log('  screenshot → scratch-converter-preview.png');
  assert('no renderer errors', errs.length === 0);
  if (errs.length) console.log(errs);
  await app.close();
  console.log('\nOK — converter preview verified.');
}
main().catch((e) => { console.error(e); process.exit(1); });
