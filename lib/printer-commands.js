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

/** Duet: no REST job control — it is G-code. M25 pause, M24 resume, M0 stop. */
function duet(command) {
  const gcode = { pause: 'M25', resume: 'M24', cancel: 'M0' }[command];
  return { method: 'GET', path: `/rr_gcode?gcode=${encodeURIComponent(gcode)}` };
}

/**
 * Build the request for a command, or explain why it cannot be built.
 *
 * `jobId` is only consulted for PrusaLink.
 */
function buildCommand(type, command, jobId) {
  if (!COMMANDS.includes(command)) return { unsupported: `unknown command: ${command}` };
  switch (type) {
    case 'moonraker': return moonraker(command);
    case 'octoprint': return octoprint(command);
    case 'prusalink': return prusalink(command, jobId);
    case 'duet':      return duet(command);
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
