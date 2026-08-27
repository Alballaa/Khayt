/**
 * Job control — pause, resume, cancel — per printer protocol.
 *
 * Khayt could start a print and watch it, but never stop one: there was no
 * pause/resume/cancel path for any of the six adapters. This module holds the
 * per-protocol request shapes so they can be tested without a printer on the
 * bench; main.js performs the fetch.
 *
 * Each builder returns a descriptor:
 *   { method, path, headers?, body?, contentType? }
 * or { unsupported: reason } when the protocol genuinely cannot do it.
 *
 * PrusaLink additionally sets { needsJobId: true } — its endpoints are keyed by
 * the current job id, which must be fetched immediately before the call.
 */

const COMMANDS = Object.freeze(['pause', 'resume', 'cancel']);

// Duet's two transports live in lib/duet.js, next to the poller that already
// speaks both. Requiring it here rather than restating the paths is the whole
// point: the defect this fixes was the same knowledge written down twice.
const KhaytDuet = (typeof require !== 'undefined')
  ? require('./duet')
  : (typeof globalThis !== 'undefined' ? globalThis.KhaytDuet : undefined);

/** Moonraker: plain POSTs, response wrapped as {"result": "ok"}. */
function moonraker(command) {
  return { method: 'POST', path: `/printer/print/${command}` };
}

/**
 * OctoPrint: one endpoint, command in the body.
 *
 * The `action` is always sent explicitly. OctoPrint's default when it is
 * omitted is *toggle*, which for an unattended shop panel means "pause" and
 * "resume" become the same button and the result depends on state the caller
 * may not have. Never rely on that default.
 */
function octoprint(command) {
  const body = command === 'cancel'
    ? { command: 'cancel' }
    : { command: 'pause', action: command === 'pause' ? 'pause' : 'resume' };
  return { method: 'POST', path: '/api/job', body, contentType: 'application/json' };
}

/**
 * PrusaLink: endpoints keyed by the current job id.
 *
 * Buddy returns 404 when the id does not match the job actually running, so the
 * id must be read immediately before use and never cached across jobs.
 */
function prusalink(command, jobId) {
  if (jobId == null || jobId === '') return { unsupported: 'no active job' };
  const id = encodeURIComponent(String(jobId));
  if (command === 'cancel') return { method: 'DELETE', path: `/api/v1/job/${id}`, needsJobId: true };
  return { method: 'PUT', path: `/api/v1/job/${id}/${command}`, needsJobId: true };
}

/**
 * Duet: no REST job control — it is G-code. M25 pause, M24 resume, M0 stop.
 *
 * TWO THINGS THIS GOT WRONG, BOTH FOUND IN THE 2026-08-27 COMMAND-PATH AUDIT.
 *
 * **The transport.** This built `/rr_gcode?…` unconditionally, which is the
 * RepRapFirmware standalone surface. A Duet 3 with an SBC attached does not
 * have it — DSF's REST documentation says outright that "these endpoints differ
 * from those provided by RepRapFirmware's native network interface" — so on a
 * machine the poller had been watching happily since the SBC transport landed,
 * every pause and every cancel 404'd. The transports are now asked for by name,
 * from the same table in lib/duet.js the poller reads, so there is one place to
 * be wrong rather than two to drift.
 *
 * **Cancel is two codes, not one.** Duet's own web interface renders pause and
 * resume as M25 / M24 — and renders the cancel button ONLY when the machine is
 * already paused (`v-if="isPaused"`, `code="M0"`). It never offers M0 to a
 * running print. Khayt sent a bare M0 into one regardless, so the sanctioned
 * sequence is followed instead: M25, then M0.
 *
 * Sent as two requests rather than one newline-joined code, deliberately.
 * Whether both surfaces split a multi-code payload the same way is not
 * something this bench can test, and there is no Duet here — two requests need
 * no such assumption. If the second fails, the machine is left PAUSED, which is
 * a safe place for a print to sit and is reported rather than hidden.
 */
function duet(command, flavour) {
  const build = (gcode) => KhaytDuet.duetCodeRequest(flavour || 'standalone', gcode);
  if (command === 'cancel') {
    const steps = [build('M25'), build('M0')];
    const bad = steps.find((s) => s.unsupported);
    return bad || { sequence: steps };
  }
  return build(command === 'pause' ? 'M25' : 'M24');
}

/**
 * Build the request for a command, or explain why it cannot be built.
 *
 * `jobId` is only consulted for PrusaLink, and `opts.duetFlavour` only for Duet.
 *
 * A descriptor may carry `sequence: [descriptor, …]` instead of a single
 * request, for a command that is genuinely more than one call. The caller runs
 * them in order and stops at the first failure.
 */
function buildCommand(type, command, jobId, opts = {}) {
  if (!COMMANDS.includes(command)) return { unsupported: `unknown command: ${command}` };
  switch (type) {
    case 'moonraker': return moonraker(command);
    case 'octoprint': return octoprint(command);
    case 'prusalink': return prusalink(command, jobId);
    case 'duet':      return duet(command, opts.duetFlavour);
    // Repetier's control commands are documented only in a manual I could not
    // verify against source; guessing at them risks sending a wrong command to
    // a running print, which is worse than declining.
    case 'repetier':  return { unsupported: 'Repetier job control is not supported yet' };
    // Bambu speaks MQTT, not HTTP, and Bambu now requires their own connector to
    // start or control a job from third-party software. Status still works.
    case 'bambu':     return { unsupported: 'Bambu requires Bambu Connect for remote job control' };
    default:          return { unsupported: `unknown printer type: ${type || 'none'}` };
  }
}

/** Does this protocol need the current job id fetched first? */
function requiresJobId(type) {
  return type === 'prusalink';
}

module.exports = { COMMANDS, buildCommand, requiresJobId };
