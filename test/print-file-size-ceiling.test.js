/**
 * One ceiling for reading a print file, and a refusal that reaches the shop.
 *
 * Reported as "when adding print files, [it] can't be read when the file is
 * big". FOUR separate numbers governed the same act of reading the same file:
 *
 *   hub:intake-model-bytes   150 MB  (drop a file on the calculator)
 *   hub:parse-print-file      50 MB  (Browse…, and every library import)
 *   hub:printlib-read-bytes   60 MB  (an STL's mesh, identity and thumbnail)
 *   hub:extract-thumbnail     50 MB  (a 3MF's embedded picture)
 *
 * So a 60 MB STL was read when dropped and refused when picked — while the
 * handler that refused it carried a comment saying Browse… and drag-drop "read
 * the identical file through the identical intake". The fourth was not in the
 * report and not in the first pass either; it turned up because this test
 * counts the literals rather than the handlers somebody thought to look at.
 *
 * Worse than the disagreement was what happened past the line. Both refusals
 * are shaped like answers — `{ok:false, …}` is truthy, and `null` is what a
 * missing file returns too — and both callers took them as answers:
 *
 *   - enrichPrintFile wrote `undefined` over printTimeMins, filamentGrams,
 *     filamentType and slicer, so the file joined the library looking imported
 *     and holding nothing, with no message anywhere;
 *   - the calculator reported `calc.parse_failed`, which reads as a BROKEN
 *     file, so the shop re-exports a file that was never the problem.
 *
 * Source-text assertions, because the handlers need Electron to run. What they
 * pin is the shape of the mistake, not the wording.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const mainJs = read('main.js');
const printfiles = read('renderer/printfiles.js');
const intakeView = read('lib/intake-view.js');

test('there is one ceiling, and every reader of a print file uses it', () => {
  assert.match(mainJs, /const PRINT_FILE_MAX_BYTES = 150 \* 1024 \* 1024;/,
    'the ceiling must be named once');

  // 150 MB is written once. The other two literals are gone from the file, and
  // 50_000_000 survives only where it means something else entirely — the
  // recovered-store size, which is not a print file.
  assert.equal(mainJs.split('150 * 1024 * 1024').length - 1, 1,
    'the ceiling is written twice — that is how the three of them happened');
  assert.equal(mainJs.split('60_000_000').length - 1, 0);

  /* Every handler that reads a print file measures against the shared name.
   * The fourth one, extract-thumbnail, is the one this test found: it had its
   * own 50 MB line, so a big 3MF also silently lost its picture. */
  const readers = {
    'hub:intake-model-bytes': 6000,
    'hub:parse-print-file': 8000,
    'hub:printlib-read-bytes': 2000,
    'hub:extract-thumbnail': 3000,
  };
  for (const [handler, span] of Object.entries(readers)) {
    const from = mainJs.indexOf(`ipcMain.handle('${handler}'`);
    assert.ok(from > 0, `${handler} is gone`);
    const body = mainJs.slice(from, from + span);
    assert.match(body, /PRINT_FILE_MAX_BYTES|INTAKE_MAX_BYTES/,
      `${handler} does not measure against the shared ceiling`);
    assert.doesNotMatch(body, /_000_000/,
      `${handler} still carries a size limit of its own`);
  }
});

test('a refusal is shaped so a caller cannot mistake it for an answer', () => {
  // parse-print-file: `warnings` is what makes it presentable — intake-view
  // says WHICH kind of nothing it got, and only this kind has an action.
  const parseFrom = mainJs.indexOf("ipcMain.handle('hub:parse-print-file'");
  const parseBody = mainJs.slice(parseFrom, parseFrom + 6000);
  assert.match(parseBody, /warnings: \['too-large'\]/,
    'a file past the ceiling must say so in a form the presenter reads');

  // extract-thumbnail answers `empty` for a 3MF that simply has no picture, so
  // a refusal has to be marked or it is invisible by construction.
  const thFrom = mainJs.indexOf("ipcMain.handle('hub:extract-thumbnail'");
  assert.match(mainJs.slice(thFrom, thFrom + 3000), /tooLarge: true/);

  // read-bytes returned a bare string or null, and null meant four things.
  const rbFrom = mainJs.indexOf("ipcMain.handle('hub:printlib-read-bytes'");
  const rbBody = mainJs.slice(rbFrom, mainJs.indexOf('});', rbFrom));
  assert.doesNotMatch(rbBody, /return null/,
    'null cannot distinguish "too big" from "not here", and the caller could not either');
  assert.match(rbBody, /reason: 'too-large'/);
  assert.match(rbBody, /reason: 'unavailable'/);
});

test('the library import says so instead of filing a record full of nothing', () => {
  const from = printfiles.indexOf('async function enrichPrintFile');
  assert.ok(from > 0);
  const body = printfiles.slice(from, printfiles.indexOf('\n  }\n', from));

  // The exact shape of the bug: a truthy refusal reaching Object.assign.
  assert.doesNotMatch(body, /(?<!else )if \(p\) rec\.parsed = Object\.assign/,
    'a refusal is truthy — this overwrote every parsed field with undefined');
  assert.match(body, /p\.ok === false/, 'the parse refusal has to be recognised');
  assert.match(body, /rb\.reason === 'too-large'/, 'and so does the reader refusal');
  assert.match(body, /th\.tooLarge/, 'and the thumbnail one, where empty is otherwise ordinary');

  // And it has to be said out loud. Silence is the whole complaint.
  assert.match(body, /toast\(t\('intake\.too_large'\)/,
    'a file that could not be read must tell the shop, not just leave blanks');

  // The record is KEPT on purpose: the file is in the vault and it prints. Only
  // the numbers are missing, and the shop can type those.
  assert.doesNotMatch(body, /printFiles\s*=\s*printFiles\.filter/,
    'a file too big to measure is still a file the shop owns');
});

test('the reason is translated everywhere, not English in nine languages', () => {
  assert.match(intakeView, /w\.includes\('too-large'\)/);
  for (const loc of ['en', 'ar', 'de', 'es', 'fr', 'ja', 'pt-BR', 'tr', 'zh']) {
    const src = read(`renderer/locales/${loc}.js`);
    assert.match(src, /"intake\.too_large":\s*"/, `${loc} has no intake.too_large`);
  }
  // Not the same string in all nine, which is how "translated" has been faked
  // here before.
  const texts = ['ar', 'de', 'ja', 'zh'].map((loc) =>
    (read(`renderer/locales/${loc}.js`).match(/"intake\.too_large":\s*"([^"]*)"/) || [])[1]);
  const english = (read('renderer/locales/en.js').match(/"intake\.too_large":\s*"([^"]*)"/) || [])[1];
  for (const [i, txt] of texts.entries()) {
    assert.notEqual(txt, english, `locale ${['ar', 'de', 'ja', 'zh'][i]} still carries the English string`);
  }
});
