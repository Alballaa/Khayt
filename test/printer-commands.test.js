const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { COMMANDS, buildCommand, requiresJobId } = require('../lib/printer-commands.js');

/**
 * Khayt could start a print and watch it, but never stop one — there was no
 * pause/resume/cancel path for any of the six adapters. These pin the per-
 * protocol request shapes, which are otherwise only verifiable with hardware.
 */

test('Moonraker uses its dedicated print endpoints', () => {
  assert.deepEqual(buildCommand('moonraker', 'pause'), { method: 'POST', path: '/printer/print/pause' });
  assert.deepEqual(buildCommand('moonraker', 'resume'), { method: 'POST', path: '/printer/print/resume' });
  assert.deepEqual(buildCommand('moonraker', 'cancel'), { method: 'POST', path: '/printer/print/cancel' });
});

test('OctoPrint always sends an explicit action, never relying on toggle', () => {
  // With no `action`, OctoPrint TOGGLES. For an unattended shop panel that makes
  // pause and resume the same button, with the outcome depending on state the
  // caller may not have. This is the single most important detail here.
  const pause = buildCommand('octoprint', 'pause');
  assert.equal(pause.path, '/api/job');
  assert.deepEqual(pause.body, { command: 'pause', action: 'pause' });

  const resume = buildCommand('octoprint', 'resume');
  assert.deepEqual(resume.body, { command: 'pause', action: 'resume' },
    'resume is the same command with a different action, not a different command');

  assert.deepEqual(buildCommand('octoprint', 'cancel').body, { command: 'cancel' });
});

test('PrusaLink keys its endpoints by the live job id', () => {
  assert.deepEqual(buildCommand('prusalink', 'pause', 42),
    { method: 'PUT', path: '/api/v1/job/42/pause', needsJobId: true });
  assert.deepEqual(buildCommand('prusalink', 'resume', 42),
    { method: 'PUT', path: '/api/v1/job/42/resume', needsJobId: true });
  assert.deepEqual(buildCommand('prusalink', 'cancel', 42),
    { method: 'DELETE', path: '/api/v1/job/42', needsJobId: true });
});

test('PrusaLink declines rather than guessing when no job is running', () => {
  // Buddy 404s on a stale id, so a missing one must not be papered over.
  for (const id of [null, undefined, '']) {
    assert.match(buildCommand('prusalink', 'pause', id).unsupported, /no active job/);
  }
});

test('a job id is escaped, not interpolated raw', () => {
  const req = buildCommand('prusalink', 'cancel', '7/../../admin');
  assert.ok(!req.path.includes('../'), `path traversal survived: ${req.path}`);
});

test('only PrusaLink needs a job id fetched first', () => {
  assert.equal(requiresJobId('prusalink'), true);
  for (const t of ['moonraker', 'octoprint', 'duet', 'repetier', 'bambu']) {
    assert.equal(requiresJobId(t), false, `${t} should not need a job id`);
  }
});

test('Duet has no REST job control — it is G-code', () => {
  assert.equal(buildCommand('duet', 'pause').path, '/rr_gcode?gcode=M25');
  assert.equal(buildCommand('duet', 'resume').path, '/rr_gcode?gcode=M24');
  assert.equal(buildCommand('duet', 'cancel').path, '/rr_gcode?gcode=M0');
});

test('protocols that genuinely cannot do this say why', () => {
  // An honest refusal beats a request built on a guess and sent at a running print.
  assert.match(buildCommand('repetier', 'pause').unsupported, /not supported yet/);
  assert.match(buildCommand('bambu', 'pause').unsupported, /Bambu Connect/);
  assert.match(buildCommand('', 'pause').unsupported, /unknown printer type/);
});

test('an unknown command is refused before any request is built', () => {
  for (const bad of ['stop', 'DROP TABLE', '', null, 'start']) {
    const r = buildCommand('moonraker', bad);
    assert.ok(r.unsupported, `built a request for "${bad}"`);
  }
  assert.deepEqual([...COMMANDS], ['pause', 'resume', 'cancel']);
});

test('the handler is wired through main and the preload bridge', () => {
  // Renderer files are plain scripts and main/preload are separate contexts, so
  // a module that exists but is never reachable is a real failure mode here.
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  assert.match(main, /ipcMain\.handle\('hub:printer-command'/, 'no IPC handler in main');
  assert.match(main, /require\('\.\/lib\/printer-commands'\)/, 'main never requires the module');
  assert.match(preload, /hub:printer-command/, 'not exposed on the preload bridge');
});

test('the command path reuses the SSRF host allowlist', () => {
  // This reaches a LAN device on the user's behalf; it must not be steerable off
  // the validated address any more than the status poller is.
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const fn = main.slice(main.indexOf('async function sendPrinterCommand'),
                        main.indexOf("ipcMain.handle('hub:printer-command'"));
  assert.match(fn, /isAllowedPrinterHost/, 'no host allowlist check');
  assert.match(fn, /redirect: 'manual'/, 'redirects are not pinned');
});
