# Printer protocol audit — what each vendor actually says

**Last run: 2026-08-25.** Method, sources, and every finding.

Khayt talks to seven printer protocols and there is one printer on the bench: a
Snapmaker U1, plus a Prusa CORE One on the LAN. Everything else — every Duet,
every Repetier server, every Bambu, every Elegoo resin machine — is reached on
the strength of what its manufacturer says about it. That is not a temporary
state waiting for a hardware budget. It is the permanent condition of this
integration, so the vendor's documentation *is* the test fixture, and it needs
auditing the way a fixture does.

This file records what was checked, against what, and what came back. Redo it
when a vendor ships a major firmware line, and when you do, **write the date at
the top and the source you used per row** — an audit nobody can retrace is a
rumour.

## The method, and why it has three tiers

Ranked by how much a claim is worth. Prefer the lowest tier available.

1. **Vendor firmware or server source.** What the machine does. Unambiguous and
   cannot be out of date with itself.
2. **Vendor specification or API reference.** What the machine is meant to do.
   Usually right, occasionally aspirational, sometimes describing an older
   version.
3. **Third-party reports from real hardware.** What the machine did for somebody
   with one. The only tier that catches a vendor documenting something it does
   not implement — and the only tier available at all for behaviour, as opposed
   to shape.

**Never** rely on an AI-generated documentation mirror. One such site states
flatly that PrusaLink's `/api/v1/*` endpoints are HTTP-Digest-only and reject
`X-Api-Key`. Prusa's own firmware source says otherwise (see below), and acting
on the mirror would have broken working Prusa support in the name of fixing it.

The step that actually finds things is the fourth one: **run Khayt's shipped code
against a payload shaped the way the source says it really arrives.** Four of the
six defects below were invisible when reading Khayt's code, because Khayt's code
is reasonable — it is the assumed payload that was wrong. Every one of them
reproduced immediately once the payload was right.

## Findings, 2026-08-25

Six defects. Five of them produced a wrong number on screen indefinitely; none of
them threw, which is why all six survived so long.

| Protocol | Symptom | Root cause | Tier |
|---|---|---|---|
| OctoPrint | Slicer's estimate recorded as the measured weight; every variance 0% | `job.filament` is gcode-analysis metadata | 1 |
| Duet | Progress always 0%, filename always blank | `flags=f` filters out `job.file` | 1 |
| Repetier | Always "Idle, 0%, no temperatures" | `stateList` is keyed by slug, read as an array | 2 |
| PrusaLink | Filename always blank | `/api/v1/status` carries no `file` | 1 |
| Klipper | Nozzle temp always toolhead 0 | `extruder` is head 0; live one is `toolhead.extruder` | 1 |
| Bambu | Timeout blamed three settings that were correct | Developer Mode is a second switch | 2 |

### OctoPrint — an estimate stored somewhere that reads like a measurement

`job.filament.tool0.{length,volume}` is per-tool, is in mm and cm³, both units
correct and documented, and is described as "Length of filament used". It is the
gcode analysis OctoPrint runs when the file is uploaded:

```python
# octoprint/printer/standard.py
if fileData["analysis"].get("filament"):
    filament = fileData["analysis"]["filament"]
```

Whole-file predicted total. Identical at 1% and 99%. Unchanged by cancelling at
layer three. OctoPrint core tracks no cumulative extrusion, so there is nothing
behind the field that could make it a reading.

`lib/printer-actuals.js` already refuses this exact thing for PrusaLink, in those
words. The difference is placement: Prusa keeps its estimate somewhere that looks
like an estimate (`file.meta`), OctoPrint keeps its estimate somewhere that looks
like a reading. Units were never the tell, and checking units was the whole of
the 2026-07-31 pass.

**The lesson worth carrying: verify a field's PROVENANCE, not its units.** "Is
this in mm?" is answerable from documentation. "Is this measured or predicted?"
usually is not, and is the question that matters.

### Duet — asking for the frequently-changing values excludes the file

`rr_model?key=&flags=d99fn`. The `f` flag is documented as "return only those
values in the object model that typically change frequently during a job", which
is exactly what a poller wants. RRF implements it as:

```cpp
case 'f': includeNonLive = false;                                  // ObjectModel.cpp
const bool wanted = includeNonLive || ((uint8_t)f & (uint8_t)ObjectModelEntryFlags::live) != 0 || …
```

and `PrintMonitor.cpp` tags the job entries:

```cpp
{ "duration",     …, ObjectModelEntryFlags::live }            // included
{ "filePosition", …, ObjectModelEntryFlags::live }            // included
{ "rawExtrusion", …, ObjectModelEntryFlags::liveNotPanelDue } // included
{ "file",         …, ObjectModelEntryFlags::none }            // NOT included
{ "fileName",     …, ObjectModelEntryFlags::none }            // NOT included
{ "size",         …, ObjectModelEntryFlags::none }            // NOT included
```

So `filePosition` arrived faithfully with nothing to be a percentage of, and
`fileProgressPct` — written to stop a missing size rendering as 50,000,000% —
correctly returned 0 on every poll for every Duet, forever. The guard was right.
The query was wrong. `job.file` is static for the life of a job, so it now has
its own query without `f`.

Also fixed: heater slots 0 and 1 were assumed to be bed and tool. RRF publishes
`heat.bedHeaters[]` (documented as "may be -1 if unconfigured") and
`tools[].heaters[]`.

Also confirmed **correct** and worth not re-litigating: `job.duration` excludes
pause time — `GetPrintDuration()` returns `now - printStartTime - pauseTime` —
which matches the `print_duration`-not-`total_duration` choice made for
Moonraker. And `rawExtrusion` really is "without extrusion factors applied", so a
machine running non-unity flow carries that bias, as the code comment already
said.

### Repetier — an object read as an array

Repetier's API reference: the first level of every response is
`{error:"", data:…}`, and `stateList` answers for *every* printer the server
knows, as **an object keyed by printer slug**. Khayt read `data.data?.[0]`.
Indexing an object with a number is `undefined`, so the state object was always
`{}` and the adapter reported Idle / 0% / no temperatures no matter what the
machine was doing. It never threw.

Two smaller things came with it. `heated_bed` is a spelling that appears in no
Repetier version — the vendor example shows `heatedBed`, and the client Home
Assistant ships reads a plural `heatedbeds` list; with no server here to settle
which version uses which, both are accepted. And `job` is the literal string
`"none"` when idle, which is truthy, so an idle printer was showing "none" in the
queue as a filename.

### PrusaLink — the status endpoint has no filename, and never has

Buddy firmware renders `/api/v1/status`'s job object as exactly this:

```cpp
JSON_FIELD_OBJ("job");
    JSON_FIELD_INT("id", …); JSON_FIELD_FFIXED("progress", …);
    JSON_FIELD_INT("time_remaining", …); JSON_FIELD_INT("filament_change_in", …);
    JSON_FIELD_INT("time_printing", …);
```

No `file`, at any firmware version; the OpenAPI `StatusJob` schema agrees. The
name lives on `/api/v1/job`, where `file.display_name` is the long form and
`file.name` is 8.3 — Prusa's own spec illustrates it as `SPICE~1.gco`.

**`X-Api-Key` does work on `/api/v1/*`.** Buddy's `req_parser.cpp` holds
`std::variant<DigestAuthParams, ApiKeyAuthParams>` and dispatches `check_auth` on
whichever scheme the client sent, with no per-path tier. Prusa's own integration
tests authenticate with `{'X-Api-Key': PRUSALINK_PASSWORD}`. On firmware 5.0+ the
key is called **Password**, shown at Settings → Network → PrusaLink.

### Klipper — `extruder` is toolhead zero

The live one is `toolhead.extruder`, naming `extruder`, `extruder1`, `extruder2`…
The U1 has four heads, so a job on the third showed a nozzle at room temperature
for its whole duration.

Confirmed **correct** in the same pass: `print_stats.filament_used` is a running
total *across* toolchanges, not per-head. `print_stats.py` registers
`extruder:activate_extruder` and rebases `last_epos` on it, so the jump between
heads is not counted as extrusion. Multi-colour measurements on the U1 are sound.

Also: Klipper reports `info.current_layer` and `info.total_layer` as **null**
until a slicer sends `SET_PRINT_STATS_INFO`. `Number(null)` is `0` and `0` is
finite, so "not set" was being read as "layer zero" — a slicer announcing only
`TOTAL_LAYER` pinned progress at 0% *and* suppressed the byte-position fallback,
because layers had "answered".

### Bambu — two switches, and the second one is the quiet one

LAN-only Mode is not sufficient. MQTT, FTP and the live stream sit behind a
separate **Developer Mode** toggle which "must be manually enabled on the
printer". With LAN mode on and Developer Mode off the printer accepts the TLS
connection and the CONNACK and then answers nothing — so there is no error, and
the poll just expires.

A timeout is therefore close to diagnostic: a wrong access code is refused with a
CONNACK, and a wrong IP never connects. Neither reaches the timeout. The old
message named IP, access code and LAN mode — three things that, by the time you
see it, are all usually correct.

| Model | Menu | Minimum firmware |
|---|---|---|
| X1 / X1C / X1E | Settings → LAN Mode | 01.08.03.00 |
| P1P / P1S | Settings → WLAN/Network | 01.08.02.00 |
| A1 / A1 mini | Settings → WLAN/Network | 01.05.00.00 |
| H2D / P2 series | Settings → LAN Mode | 01.01.00.01 |

Developer Mode takes the printer **off Bambu Cloud** — worth saying before a shop
flips it.

## Verified correct — do not re-litigate

Recorded so the next audit can skip them, with what settled each.

- **Moonraker.** `filament_used` in mm; `print_duration` is "Time spent printing
  the current job in seconds. Does not include time paused" against
  `total_duration` "Total job duration". The docs match `printer-actuals.js`'s
  header verbatim. `virtual_sdcard.progress` is a 0.0–1.0 fraction.
- **OctoPrint units.** `completion` is a percentage 0–100 (not the fraction its
  API *example* implies), `length` mm, `volume` cm³, `printTime` "Time already
  spent printing, in seconds". Only the provenance of `filament` was wrong.
- **PrusaLink.** `job.progress` percent, `time_remaining` / `time_printing`
  seconds, `printer.state` enum `IDLE BUSY PRINTING PAUSED FINISHED STOPPED ERROR
  ATTENTION READY`. Plus the `X-Api-Key` point above.
- **Duet.** `job.duration` and `rawExtrusion` as described above.
- **SDCP (Elegoo resin).** Matches `cbd-tech/SDCP-…-V3.0.0` on every field
  checked: UDP `M99999` on 3000, WebSocket `ws://IP:3030/websocket`, the six
  topics, both status enums, the error enum, `PrintScreen` in seconds (Khayt
  converts to hours), `CurrentTicks`/`TotalTicks` in ms, and `CurrentStatus`
  arriving as an array. Nothing to fix.

## Known gaps — real, and deliberately not closed here

Not defects in what Khayt does; limits on what it reaches. Recorded so nobody
assumes otherwise.

- **A password-protected Duet cannot be polled at all.** Every `rr_` request
  answers 401 without a session. "If no machine password is set, a user session
  is created whenever an arbitrary HTTP request is made" — which is why the
  default config works — but a shop that has set `M551` has no field in which to
  put that password. Fix would be `rr_connect?password=…` plus a Duet password
  field.
- **Duet 3 with an SBC is unreachable.** Duet Software Framework serves
  `/machine/*` (`/machine/connect` → `X-Session-Key` → `/machine/model`) and its
  REST API wiki states plainly that these "differ from those provided by
  RepRapFirmware's native network interface", with no `rr_` compatibility layer.
  Both of Khayt's Duet requests 404 there. This is a common configuration.
- **Duet actuals may vanish at the moment they are captured.** `job.duration` and
  `job.rawExtrusion` are `OBJECT_MODEL_FUNC_IF(self->IsPrinting(), …)`, so they
  disappear the instant the job stops being "printing" — which is the
  printing→complete transition `captureCompletion` fires on. The U1 retained its
  stats, which is why the primary path has only ever been exercised on a printer
  that does. By source, a Duet will not. Unproven either way; needs a Duet.
- **Repetier progress.** `done` is read from the state object, but Repetier's HTTP
  API documentation does not show a progress field on `stateList` — the vendor
  example is of an idle printer, and job-related fields appear in the websocket
  push. If a real server reports 0% while printing, that is where to look.

## Where R7 stands after this

R7 (Elegoo SDCP resin) is recorded across the roadmap as blocked on one unproven
step: whether a real mainboard answers the `M99999` broadcast and accepts the
request frame.

Third-party notes from an actual Saturn 4 Ultra confirm both: the UDP broadcast
answers with `Data.Attributes` / `Data.Status`, and `ws://<ip>:3030/websocket`
accepts the documented envelope `{Id, Data:{Cmd, Data, RequestID, MainboardID,
TimeStamp, From}, Topic}` with replies on `sdcp/response/<id>`.

That is tier 3, not a Khayt-on-hardware test, and it does not close R7. It does
mean the remaining risk is *integration*, not *protocol*. The same notes flag
behaviour no specification mentions and no fixture would have imagined:

- Commands 132, 133 and 260 return **no response at all** — not an error, not an
  Ack. `lib/sdcp-client.js` rejects on timeout and on close-before-answer, so
  this is already survivable.
- Cmd 128 immediately after an upload is refused `Ack:1` (BUSY) even once the
  file is listed; roughly 15 seconds of settling is needed.
- The RTSP camera stream is single-client and leaks sessions on unclean
  disconnect — `NumberOfVideoStreamConnected` climbs and only a power cycle
  clears it. Relevant before any resin camera work.

## Sources

Tier 1 — source:
`OctoPrint/OctoPrint` `src/octoprint/printer/standard.py` ·
`Duet3D/RepRapFirmware` `src/ObjectModel/ObjectModel.{cpp,h}`,
`src/PrintMonitor/PrintMonitor.cpp` ·
`prusa3d/Prusa-Firmware-Buddy` `lib/WUI/nhttp/status_renderer.cpp`,
`lib/WUI/nhttp/req_parser.{cpp,h}`, `tests/integration/test_prusa_link.py` ·
`Klipper3d/klipper` `klippy/extras/print_stats.py`

Tier 2 — specification:
[Moonraker printer objects](https://moonraker.readthedocs.io/en/latest/printer_objects/) ·
[OctoPrint datamodel](https://docs.octoprint.org/en/master/api/datamodel.html) ·
[PrusaLink OpenAPI](https://github.com/prusa3d/Prusa-Link-Web/blob/master/spec/openapi.yaml) ·
[Duet HTTP requests](https://github.com/Duet3D/RepRapFirmware/wiki/HTTP-requests) ·
[Duet object model](https://github.com/Duet3D/RepRapFirmware/wiki/Object-Model-Documentation) ·
[Duet Software Framework REST API](https://github.com/Duet3D/DuetSoftwareFramework/wiki/REST-API) ·
[Repetier-Server API](https://www.repetier-server.com/manuals/programming/API/index.html) ·
[SDCP V3.0.0](https://github.com/cbd-tech/SDCP-Smart-Device-Control-Protocol-V3.0.0) ·
[Bambu third-party integration](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/)

Tier 3 — real hardware, other people's:
[Saturn 4 Ultra SDCP V3 notes](https://github.com/alfiedennen/sdcp-saturn-4-ultra) ·
[Bambu LAN + Developer Mode, per model](https://help.simplyprint.io/en/article/bambu-lab-lan-only-mode-and-developer-mode-how-to-enable-xa0hch/) ·
`home-assistant/core` `components/repetier` ·
[Snapmaker's Moonraker fork](https://github.com/Snapmaker/u1-moonraker) — the U1
runs a Moonraker with roughly 15% of it modified, so it is the reference for that
machine rather than upstream.
