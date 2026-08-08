/**
 * Zip import, as wired in.
 *
 * The planning is tested in zip-intake.test.js and the extraction against real
 * archives in zip-intake-roundtrip.test.js. What can only go wrong HERE is the
 * plumbing, and the failures are quiet:
 *
 *   1. Writing the zip member's own path instead of the plan's basename. That is
 *      zip slip, and it is one identifier's difference.
 *   2. A second ingest path. The whole point of unpacking to a temp folder is
 *      that every file still goes through hub:printlib-copy-path — the one that
 *      hashes, names, mirrors and makes a record. A handler that made records
 *      itself would be a second, untested intake.
 *   3. A recursive delete that is not confined. The cleanup handler removes a
 *      directory tree; if the path it accepts is not pinned to our own temp
 *      prefix, the renderer could hand it anything.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const mainJs = read('main.js');
const preload = read('preload.js');
const pf = read('renderer/printfiles.js');

const handler = (name) => {
  const at = mainJs.indexOf(`ipcMain.handle('hub:${name}'`);
  assert.ok(at > -1, `hub:${name} went missing`);
  const next = mainJs.indexOf('\nipcMain.handle(', at + 10);
  return mainJs.slice(at, next > -1 ? next : at + 4000);
};

test('the name written to disk comes from the plan, never from the archive', () => {
  // One identifier apart from zip slip. t.from is the member's own path.
  const body = handler('printlib-unpack-zip');
  assert.match(body, /path\.join\(dir, t\.name\)/, 'the destination is not built from the plan');
  assert.doesNotMatch(body, /path\.join\([^)]*t\.from/, 'the archive path is used to build a destination');
});

test('unpacking makes no records — the ordinary intake still does', () => {
  const body = handler('printlib-unpack-zip');
  for (const forbidden of ['printLibItemDir', 'modelContentHash', 'printLibMirrorFile']) {
    assert.ok(!body.includes(forbidden),
      `the unpack handler calls ${forbidden} — that is a second intake path, untested`);
  }
  // And the renderer feeds each unpacked file through the tested one.
  assert.match(pf, /hub\.printLibCopyPath\(zid, f\.path\)/,
    'unpacked files do not go through the single-file intake');
});

test('the recursive delete cannot be pointed anywhere', () => {
  const body = handler('printlib-unpack-cleanup');
  assert.match(body, /recursive: true/, 'the cleanup does not actually remove the tree');
  assert.match(body, /startsWith\(path\.join\(os\.tmpdir\(\), 'khayt-zip-'\)\)/,
    'the cleanup accepts any path — the renderer could hand it anything');
});

test('os is required where it is used, not assumed', () => {
  // main.js does NOT require os at module scope; it is scoped inside functions.
  // Assuming a global here is a ReferenceError at the moment a shop drops a zip.
  assert.doesNotMatch(mainJs, /^const os = require\('os'\);$/m,
    'os became module-scoped — this guard can go, but check the handlers first');
  for (const h of ['printlib-unpack-zip', 'printlib-unpack-cleanup']) {
    assert.match(handler(h), /const os = require\('os'\)/, `${h} uses os without requiring it`);
  }
});

test('the guard runs before the file is read', () => {
  // A large archive should not be pulled into memory only to be refused.
  const body = handler('printlib-unpack-zip');
  const guard = body.indexOf('requirePrintLib()');
  const readAt = body.indexOf('fs.promises.readFile');
  assert.ok(guard > -1 && guard < readAt, 'the archive is read before the library is checked');
});

test('an archive with nothing printable is refused, not silently empty', () => {
  const body = handler('printlib-unpack-zip');
  assert.match(body, /empty: true/, 'an archive with no print files reads as a plain failure');
  assert.match(pf, /z\.empty/, 'the renderer never tells the shop the archive had nothing in it');
});

test('a partly-imported archive says so instead of counting as a success', () => {
  // A budget that drops files quietly is the bug lib/mf-convert.js shipped once.
  // Not "the message exists" — that survives deleting the line that sets the
  // flag. The flag must actually be carried from the handler's answer.
  assert.match(pf, /truncated = truncated \|\| !!z\.truncated/,
    'the handler says the archive was truncated and the renderer never reads it');
  assert.match(pf, /if \(truncated\)/, 'truncation is folded into the added count');
  assert.match(pf, /plib\.zip_truncated/, 'there is no message for a truncated archive');
});

test('the temp folder is cleaned up', () => {
  assert.match(pf, /printLibUnpackCleanup\(z\.dir\)/, 'temp folders accumulate on every import');
});

test('the bridges exist and the picker offers zips', () => {
  assert.match(preload, /printLibUnpackZip:\s+\(srcPath\)\s+=> ipcRenderer\.invoke\('hub:printlib-unpack-zip'/);
  assert.match(preload, /printLibUnpackCleanup:\s+\(dir\)\s+=> ipcRenderer\.invoke\('hub:printlib-unpack-cleanup'/);
  // Both pickers, not just whichever one a loose match happens to find first.
  const withZip = (mainJs.match(/extensions: \['stl', '3mf', 'obj', 'gcode', 'gco', 'zip'\]/g) || []).length;
  const withoutZip = (mainJs.match(/extensions: \['stl', '3mf', 'obj', 'gcode', 'gco'\]/g) || []).length;
  assert.ok(withZip >= 2, `expected every print-file picker to offer zips, found ${withZip}`);
  assert.equal(withoutZip, 0, 'a picker still refuses zips, so that route silently cannot take one');
});

test('the messages are translated everywhere', () => {
  for (const code of ['en', 'ar', 'de', 'es', 'fr', 'ja', 'pt-BR', 'tr', 'zh']) {
    const loc = read(`renderer/locales/${code}.js`);
    for (const k of ['plib.zip_empty', 'plib.zip_truncated', 'plib.zip_skipped']) {
      assert.ok(loc.includes(`"${k}":`), `${code} is missing ${k}`);
    }
  }
});
