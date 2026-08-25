'use strict';

(function (global) {
/**
 * Duet / RepRapFirmware — the two ways a Duet answers, and the one object model
 * behind both.
 *
 * A Duet is reachable over two entirely different HTTP surfaces depending on how
 * it was built, and Khayt only ever spoke one of them:
 *
 *   STANDALONE   RepRapFirmware serves the network itself.
 *                `rr_connect`, `rr_model?key=…&flags=…`, `rr_status`.
 *
 *   SBC          A Duet 3 with a Raspberry Pi attached. DuetWebServer serves the
 *                network and Duet Software Framework talks to the board.
 *                `machine/connect`, `machine/model`.
 *                Its own documentation is blunt about it: "these endpoints
 *                differ from those provided by RepRapFirmware's native network
 *                interface", and there is no `rr_*` compatibility layer.
 *
 * So every `rr_model` request Khayt sent to a Duet 3 + SBC — a common and
 * officially supported configuration — 404'd, both of them, and the machine read
 * as unreachable. Not degraded. Absent.
 *
 * WHAT IS SHARED, AND WHY THAT IS THE WHOLE TRICK
 *
 * The transports differ; the OBJECT MODEL does not. `job`, `heat`, `state` and
 * `tools` mean the same things and carry the same field names either way. The
 * only structural difference is the envelope: `rr_model` answers
 * `{key, flags, result:{…}}` and `machine/model` answers the model bare.
 *
 * So this file parses the model once, and the transports are reduced to "get me
 * a model". That is deliberate: two parsers would drift, and the last time two
 * implementations of one contract sat in this codebase without a test comparing
 * them, three storefronts quietly lost half their fields.
 *
 * SESSIONS
 *
 * Both surfaces are session-based and neither says so loudly.
 *
 *   Standalone   "Every request except for rr_connect returns HTTP status code
 *                401 if the client does not have a valid session." A machine with
 *                NO password auto-creates one on any request, which is why this
 *                has worked for everybody who never set `M551` — and why a shop
 *                that did set one found Khayt could not poll it at all, with no
 *                field to type the password into.
 *
 *   SBC          `machine/connect` returns a `sessionKey`; every other request
 *                needs it in `X-Session-Key` and answers 403 without it. The
 *                session lasts "at least 8 seconds", so it expires between polls
 *                as a matter of course and re-authenticating is normal operation
 *                rather than an error path.
 *
 * Field names, status codes and session behaviour here are from Duet3D's own
 * HTTP-requests wiki, the DuetSoftwareFramework REST-API wiki, and
 * RepRapFirmware's source. See docs/PRINTER-PROTOCOL-AUDIT.md.
 *
 * NOT VERIFIED AGAINST HARDWARE. There is no Duet on this bench. Every branch
 * below is reachable from a test with an injected fetch, which is the most that
 * can honestly be claimed — the same standard R7's socket layer is held to.
 */

/** `rr_connect` err codes, per the RepRapFirmware HTTP wiki. */
const RR_CONNECT_ERR = {
  0: null,                        // ok
  1: 'Duet refused the password',
  2: 'The Duet has no free client sessions — close a browser tab pointed at it',
};

/**
 * Read an `rr_connect` reply.
 *
 * `err: 0` is success and everything else is not, but the two failures need
 * different words: a wrong password is the shop's to fix, and "no more sessions"
 * is a Duet Web Control tab left open on somebody's laptop, which is not
 * obviously a Khayt problem unless Khayt says so.
 *
 * @returns {{ok: boolean, sessionKey: string|null, error: string|null}}
 */
function rrConnectResult(json) {
  // `Number(json && json.err)` would be 0 — a SUCCESS code — for a null reply,
  // because `null && …` is null and `Number(null)` is 0. That is the same trap
  // that had Klipper's "layer not set" reading as layer zero, and here it would
  // turn "the Duet said nothing" into "the Duet let us in". So `err` has to
  // arrive as an actual number on an actual object.
  const err = (json && typeof json === 'object' && typeof json.err === 'number') ? json.err : NaN;
  if (!Number.isFinite(err)) return { ok: false, sessionKey: null, error: 'Duet gave no answer to rr_connect' };
  if (err !== 0) {
    return { ok: false, sessionKey: null, error: RR_CONNECT_ERR[err] || `Duet refused the connection (err ${err})` };
  }
  // sessionKey only exists in RRF 3.5-b4 and later, and only when it was asked
  // for. Older firmware authenticates by IP, so no key is not a failure.
  const key = json && json.sessionKey;
  return { ok: true, sessionKey: key === undefined || key === null ? null : String(key), error: null };
}

/**
 * Read a `machine/connect` reply.
 *
 * DSF signals a bad password with HTTP 403 rather than a body field, so by the
 * time a body is being read the password was accepted; what remains is whether a
 * key came back at all.
 */
function dsfConnectResult(json) {
  const key = json && json.sessionKey;
  if (key === undefined || key === null || key === '') {
    return { ok: false, sessionKey: null, error: 'Duet (SBC) returned no session key' };
  }
  return { ok: true, sessionKey: String(key), error: null };
}

/**
 * Unwrap whatever a transport returned into a bare object model.
 *
 * `rr_model` wraps in `result`; `machine/model` does not. Accepting both here
 * means neither transport has to remember which it is.
 */
function objectModel(payload) {
  if (!payload || typeof payload !== 'object') return {};
  // `result` is rr_model's envelope. A bare model has no `result` key at the top
  // level — the object model's own top-level keys are boards, fans, heat, job,
  // move, network, sensors, seqs, spindles, state, tools, volumes.
  if (payload.result && typeof payload.result === 'object') return payload.result;
  return payload;
}

/**
 * A Duet's bed or tool temperature, resolved the way RepRapFirmware describes it
 * rather than by index convention.
 *
 * `heat.heaters[0]` is the bed and `heat.heaters[1]` is the hotend on a stock
 * single-tool config, and that is all it is — a stock config. RRF publishes the
 * real mapping: `heat.bedHeaters[]` holds the bed heaters' indices (documented as
 * "may be -1 if unconfigured"), and each tool lists its own in
 * `tools[].heaters[]`. A tool-only machine with the hotend on heater 0 was being
 * shown its hotend temperature labelled "bed", and its bed temperature — which it
 * does not have — labelled with whatever sat at index 1.
 *
 * Falls back to the old indices when the machine publishes no mapping, because a
 * plausible number beats a blank for the common case that was already working.
 *
 * @param {object} heat   the object model's `heat` key
 * @param {Array}  tools  the object model's `tools` key
 * @param {'bed'|'tool'} which
 * @returns {number|null} degrees C, or null when nothing is configured
 */
function duetHeaterTemp(heat, tools, which) {
  const heaters = (heat && Array.isArray(heat.heaters)) ? heat.heaters : [];
  const at = (i) => {
    const h = Number.isInteger(i) && i >= 0 ? heaters[i] : null;
    const t = h && Number(h.current);
    return Number.isFinite(t) ? t : null;
  };

  if (which === 'bed') {
    const beds = (heat && Array.isArray(heat.bedHeaters)) ? heat.bedHeaters : null;
    if (beds) {
      // -1 entries mean "not configured"; a machine with no bed reports no bed
      // rather than borrowing heater 0 from whatever else is on it.
      const idx = beds.find((i) => Number.isInteger(i) && i >= 0);
      return idx === undefined ? null : at(idx);
    }
    return at(0);
  }

  // The first heater belonging to the first configured tool. Multi-tool machines
  // get the first tool's, which is the same thing every other adapter here shows
  // and is at least a heater the machine actually has.
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      const list = tool && Array.isArray(tool.heaters) ? tool.heaters : null;
      if (!list || !list.length) continue;
      const idx = list.find((i) => Number.isInteger(i) && i >= 0);
      if (idx !== undefined) return at(idx);
    }
    // Tools published, none of them heated — say so rather than falling through
    // to an index that belongs to something else.
    if (tools.length) return null;
  }
  return at(1);
}

/**
 * One Duet object model → the status shape every adapter returns.
 *
 * @param {object} payload   what the transport returned (wrapped or bare)
 * @param {object} [fileOM]  a separately-fetched `job.file`, for the standalone
 *                           transport whose live query filters it out. Ignored
 *                           when the model already carries one.
 * @param {object} [helpers] {fileProgressPct, extractActuals, stockOpts} —
 *                           injected so this module stays free of its siblings
 *                           and can be tested on its own.
 */
function statusFromObjectModel(payload, fileOM, helpers = {}) {
  const om = objectModel(payload);
  const job = (om && om.job) || {};
  // A model that carries its own file wins: that is the SBC case, and the
  // standalone case once the second query has answered. `fileOM` is the
  // standalone fallback and is itself already unwrapped by the caller.
  const file = (job.file && typeof job.file === 'object') ? job.file : (fileOM || {});
  const heat = om.heat || {};

  const pct = helpers.fileProgressPct || ((p, s) => {
    const a = Number(p), b = Number(s);
    return (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) ? 0
      : Math.min(100, Math.max(0, Math.round((a / b) * 100)));
  });

  const out = {
    state: (om.state && om.state.status) || 'Unknown',
    progress: pct(job.filePosition, file.size),
    filename: file.fileName || '',
    timeRemaining: (job.timesLeft && job.timesLeft.file) || null,
    tempNozzle: duetHeaterTemp(heat, om.tools, 'tool'),
    tempBed: duetHeaterTemp(heat, om.tools, 'bed'),
    type: 'duet',
  };
  if (helpers.extractActuals) {
    out.actuals = helpers.extractActuals('duet', om, helpers.stockOpts || {});
  }
  return out;
}

/** Where each transport's endpoints live, so the paths exist in exactly one place. */
const ENDPOINTS = {
  standalone: {
    connect: (pw) => `/rr_connect?password=${encodeURIComponent(pw || '')}&sessionKey=yes`,
    // The live query. `f` is right for the numbers that move and wrong for the
    // file, which is why the file is fetched separately — see the audit doc.
    live: '/rr_model?key=&flags=d99fn',
    file: '/rr_model?key=job.file&flags=d99n',
    legacy: '/rr_status?type=3',
    // "Every request except for rr_connect returns 401 if the client does not
    // have a valid session."
    unauthorized: 401,
  },
  sbc: {
    // "If no password is expected, the `password` key can be omitted."
    connect: (pw) => (pw ? `/machine/connect?password=${encodeURIComponent(pw)}` : '/machine/connect'),
    // Returns the FULL model, so no separate file query and no `f` trap.
    live: '/machine/model',
    file: null,
    legacy: null,
    unauthorized: 403,
  },
};

const api = { rrConnectResult, dsfConnectResult, objectModel, duetHeaterTemp, statusFromObjectModel, ENDPOINTS, RR_CONNECT_ERR };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.KhaytDuet = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
