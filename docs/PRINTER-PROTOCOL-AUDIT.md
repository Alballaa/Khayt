# Printer protocol audit — what each vendor actually says

**Last run: 2026-08-27.** Method, sources, and every finding. The first run was
2026-08-25; both are kept, because what the second one found is mostly a comment on
what the first one missed.

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
six defects in the first run were invisible when reading Khayt's code, because
Khayt's code is reasonable — it is the assumed payload that was wrong. Every one
of them reproduced immediately once the payload was right.

The second run added two questions, because the first run's four found nothing
the second time and these found three defects between them:

5. **Which CALL is this field on?** A payload audit reads the body that arrived
   and cannot see a field sitting on an endpoint nobody asked for. Repetier
   splits machine state and job state across two calls and the response does not
   say so; reading an absent field returns `undefined`, which normalises to `0`,
   which renders as a plausible number.
6. **What arrives when NOTHING arrives?** Every vendor has ordinary, non-fault
   conditions it reports as a non-2xx — no printer connected, firmware
   restarting, wrong key — and a poller that turns those into `HTTP <status>`
   has taken a diagnosis and thrown it away at the last step. Check the status
   codes on the guard clauses, not only the fields in the happy path.

## Findings, 2026-08-27 — the second run

Triggered by a vendor shipping a major line: **OctoPrint 2.0** entered release
candidate (`2.0.0rc5`, 2026-08-24), and 2.0 rewrites the printer communication
layer entirely — printers are now reached through *connectors*, with Moonraker
and Bambu connectors alongside the bundled serial one.

That turned out to be the least of it. **Three defects, all in the same blind
spot, and one of them is a row this file marked fixed two days earlier.**

| Protocol | Symptom | Root cause | Tier |
|---|---|---|---|
| Repetier | STILL Idle / 0% / no filename, on every machine | `done` and `job` are on `listPrinter`, not `stateList` | 2 + 3 |
| Repetier | A machine with no heated bed reports a bed at 0 °C | `Number(null)` is `0`, and `0` is finite | — |
| OctoPrint | Any printer not connected to OctoPrint reads as an ERROR | `GET /api/printer` is `abort(409)`, and it was awaited bare | 1 |
| Moonraker | Klipper restarting reads as `HTTP 503` | the status code was rendered raw to the shop | 1 |

### The blind spot, named — because it is what this run is actually about

The 2026-08-25 pass audited **what is inside the payload**: field names, units,
and — its own best lesson — provenance. Every one of its six findings was a
value being read wrongly out of a body that arrived.

Nothing in it asked **which call the value is on**, or **what happens when no
body arrives at all**. Both are ways to be wrong that a payload audit cannot
see, and all four findings above are one or the other. So the method below now
has a fourth and fifth question, and they are the ones that found things this
time.

### Repetier — the right fix, applied to the wrong cause

The last run reported this adapter fixed. The symptom it described —
"always Idle, 0%, no temperatures" — was real, and the cause it found was real:
`stateList` answers as an object keyed by printer slug and was being indexed
`data.data[0]`, which is always `undefined`. Fixing that recovered the
temperatures.

It did not recover progress or the filename, because **those two fields were
never on that call.** Repetier splits its API in a way nothing in the response
announces:

| Call | Answers about | Fields |
|---|---|---|
| `?a=stateList` | the MACHINE | `activeExtruder`, `extruder[]`, `heatedBeds[]`, `heatedChambers[]`, `layer`, `x/y/z`, fans, `speedMultiply`, `flowMultiply`, `firmware`, `sdcardMounted` |
| `?a=listPrinter` | the JOB | `done`, `job`, `jobid`, `paused`, `pauseState`, `online`, `printStart`, `printTime`, `printedTimeComp`, `start`, `totalLines`, `linesSend`, `ofLayer` |

Khayt asked only the first and read `state.done` and `state.job` off it. Absent
fields do not throw: `undefined` normalises to `0`, an empty filename reads as
"no job", and the adapter concluded Idle. **So the exact sentence this file
crossed off two days ago was still true of every Repetier printer in the
field** — a printer at 42% with a 212 °C nozzle still looked idle, and now it
looked idle with correct temperatures next to it.

Settled by Repetier's own API reference, which lists the `stateList` fields and
includes neither `done` nor `job`, and by RepetierSharp — a typed C# client
whose `PrinterState` model matches that list field for field while `done` and
`job` sit on its `Printer` model, which is what `listPrinter` returns. That
`done` is a percentage rather than a 0–1 fraction is settled by Home Assistant's
`repetier` component, which publishes it as `PERCENTAGE` rounded to two decimals.

**Two attested shapes for `job`, and both are now accepted.** Repetier documents
the printer listing's `job` as a STATE — `none | paused | printing | waitstart` —
while RepetierSharp types it as the job's NAME beside a separate `jobstate`.
There is no Repetier server on this bench to settle which version answers which,
so the four state words are treated as a state and anything else as a filename.
Betting on the name would have put the literal word "printing" in a shop's queue
as though somebody had sliced a file called it.

**How the test suite helped it survive.** The Repetier test written with the
last fix built its own fixture with `done` and `job` sitting on the `stateList`
entry — a payload Repetier does not send — and asserted against a copy of the
adapter's logic written inline in the test. It passed, and could not have
failed: a fixture agreeing with itself. It has been replaced; `lib/repetier.js`
is now driven with the two payloads separately in `test/repetier.test.js`, and a
test asserts that putting `done` and `job` on the state object changes nothing.

**Found while writing those tests, in code moved across unchanged:** `num()` was
`Number.isFinite(Number(v)) ? Number(v) : null`, and `Number(null)` is `0`. A
machine with no heated bed, or a poll that returned no temperatures at all,
therefore reported a bed sitting at **0 °C** — a reading about a heater that
does not exist. Absent has to stay absent.

### OctoPrint — "no printer connected" is not an error, and 2.0 changes less than it looks

`GET /api/printer` opens with `abort(409, description="Printer is not
operational")`. Not an edge case: it is OctoPrint running with the printer
switched off, unplugged, or simply not connected in OctoPrint — most of any
working day, and the state a shop is in when it opens the app to check.

Khayt awaited `/api/printer` and `/api/job` together, so that 409 failed the
whole poll, and the raw string **`HTTP 409`** was rendered on the dashboard card.
It also threw away the `/api/job` response, which arrives perfectly well in that
state — its GET carries no operational guard — and whose `state` reads `Offline`
straight from the connection's own string (`CLOSED = gettext("Offline")`).

So the job is now asked for unconditionally and the printer tolerantly. Only 409
is survived; every other status is still a fault.

**On 2.0 itself, the answer is reassuring and worth writing down so the next run
does not re-derive it:**

- **API versioning is opt-in, and the default is the old behaviour.** 2.0 adds an
  `X-OctoPrint-Api-Version` header; the documentation is explicit that "if the
  header is left out, the API will behave according to its documented pre-2.0.0
  behaviour". Khayt sends no header and therefore keeps the shape it parses.
  `server/api/job.py` shows the mechanism — the un-versioned handler builds an
  `ApiJobResponse_pre_2_0_0` explicitly, with `>=2.0.0` as a separate handler.
- **`job.filament` is still the estimate**, and 2.0 stops pretending otherwise:
  1.11 filled it from `fileData["analysis"]["filament"]`, and 2.0 fills it from
  `job.filament_estimate`. The field the last run caught Khayt trusting is now
  named "estimate" in the vendor's own source. Khayt's refusal stands.
- **`sd` becomes `storage`, `/api/printer/sd` becomes `/api/printer/storage`**,
  both with backwards-compatible routes, and the rename only takes effect when a
  client asks for `>=2.0.0`. Khayt reads neither.
- **New in `progress.printTimeLeftOrigin`: `printer`** — an estimate supplied by
  the connector rather than computed by OctoPrint. Khayt reads `printTimeLeft`
  and not its origin, so nothing changes; but this is the field to watch if
  connector-supplied numbers ever need distinguishing from OctoPrint's own.

### Moonraker — a restart is not a failure, and the status code says which it is

`ServerError("Klippy Host not connected", 503)` and `ServerError("Klippy
Disconnected", 503)` in `moonraker/klippy_connection.py` are what a query gets
while Klipper restarts — and permanently after a config error stops it coming
back. A shop saw `HTTP 503`.

Both this and the OctoPrint case are the same failure at the last step: the
poller threw `HTTP <status>` and that string is rendered verbatim on the
dashboard card and in the machine dialog's *Test connection*. The comment above
the dashboard's own render call already states the principle it was breaking —
the raw status is "the symptom in the vocabulary of a socket", where what is
needed is "the same fact in the vocabulary of the person who has to fix it" —
and `lib/makerrun-maintenance.js` records the same lesson again, learned from a
503 the library sent. The printer poller had not learned it either time.

`explainPrinterHttp()` now turns the statuses whose meaning is in a vendor's own
source into a sentence naming the fix, and quotes the vendor's message beside it
rather than paraphrasing. A status with no known meaning still reports as
`HTTP <status>`: useless but true beats a confident sentence about the wrong
cause.

### Bambu — found, recorded, NOT fixed: the poll is shaped wrongly for the P1 line

No defect in what Khayt parses. The report fields were checked and are right:
`mc_percent`, `mc_remaining_time` (minutes → seconds), `nozzle_temper`,
`bed_temper`, `layer_num`, `total_layer_num`, `subtask_name`, `gcode_state`. The
`pushall` request Khayt sends is byte-for-byte the one `ha-bambulab` sends. And
**Bambu's LAN report carries no cumulative extrusion of any kind**, so
`printer-actuals.js` refusing to claim a weight for Bambu is confirmed correct
rather than merely cautious.

What is wrong is the SHAPE of the poll, and it needs a Bambu to fix responsibly:

- **`pushall` every 30 seconds, against documented guidance of no more often
  than 5 minutes on the P1P** — "as it may cause lag due to its hardware
  limitations". Khayt opens a fresh MQTT connection each poll, sends `pushall`,
  takes the first snapshot and disconnects; that is 10× the documented rate, on
  the cheapest and most numerous machine in the line.
- **The P1 line is reported to serve only one local MQTT client correctly** —
  "only the last connection gets data" — so a reconnect every 30 seconds may be
  repeatedly evicting Bambu Studio, Handy, or Home Assistant, and being evicted
  by them. Attested twice (`bambulab/BambuStudio#2404`, `ha-bambulab#174`) but
  **against firmware 01.04 and not re-verified on a current line**, which is
  exactly why it is not in the timeout message: naming an unverified cause is the
  mistake that message already exists to correct.

The shape that matches every real-hardware client: hold the connection, `pushall`
once on connect, merge the deltas the printer pushes, and re-`pushall` only when
a watchdog says nothing has arrived (`ha-bambulab` uses 60 s). That is a real
change to `lib/bambu.js` with no Bambu here to test it against, so it is written
down rather than guessed at — the same standard the Duet SBC transport and R7's
socket layer were held to.

## Findings, 2026-08-25 — the first run

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

> **Superseded on 2026-08-27, and read the newer section before trusting this
> one.** Everything below is true and the fix was real, but it was only half the
> cause: `done` and `job` are not on `stateList` at all, so this adapter went on
> reporting Idle / 0% for every machine after being marked fixed here.


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
- **OctoPrint 2.0 (checked 2026-08-27).** The new `X-OctoPrint-Api-Version`
  header is opt-in and its absence means pre-2.0.0 behaviour, so Khayt's parsing
  is unaffected by the 2.0 line; `job.filament` is filled from
  `job.filament_estimate` there, which confirms the first run's provenance
  finding in the vendor's own naming; the `sd` → `storage` rename applies only to
  clients asking for `>=2.0.0`, and Khayt reads neither.
- **Bambu report fields (checked 2026-08-27).** `mc_percent`,
  `mc_remaining_time` (minutes — Khayt converts), `nozzle_temper`, `bed_temper`,
  `layer_num`, `total_layer_num`, `subtask_name`, `gcode_state`. The `pushall`
  payload Khayt sends is identical to `ha-bambulab`'s. There is **no cumulative
  extrusion field of any kind**, so claiming no weight for Bambu is correct, not
  merely careful.
- **Repetier temperatures.** `extruder[].tempRead` / `heatedBeds[].tempRead` are
  what RepetierSharp models and what Home Assistant's client reads. The plural
  `heatedBeds` is the attested spelling; `heatedBed` and `heatedbeds` stay
  accepted, `heated_bed` was never any version's.
- **SDCP (Elegoo resin).** Matches `cbd-tech/SDCP-…-V3.0.0` on every field
  checked: UDP `M99999` on 3000, WebSocket `ws://IP:3030/websocket`, the six
  topics, both status enums, the error enum, `PrintScreen` in seconds (Khayt
  converts to hours), `CurrentTicks`/`TotalTicks` in ms, and `CurrentStatus`
  arriving as an array. Nothing to fix.

## Known gaps — real, and deliberately not closed here

Not defects in what Khayt does; limits on what it reaches. Recorded so nobody
assumes otherwise.

- ~~**A password-protected Duet cannot be polled at all.**~~ **Closed
  2026-08-25.** `rr_connect?password=…&sessionKey=yes` is sent when the machine
  has a secret configured, and the returned key travels in `X-Session-Key`. The
  handshake only happens after a request is actually refused, so a password-less
  Duet — the common case — costs exactly what it did before. The machine dialog
  now says the API-key field is where a Duet password goes, which is the half
  that was really missing: "API key" is precisely the label that stops someone
  typing an `M551` password into it.
- ~~**Duet 3 with an SBC is unreachable.**~~ **Closed 2026-08-25.** Both
  surfaces are now spoken: standalone `rr_*` and DSF `machine/*`
  (`machine/connect` → `X-Session-Key` → `machine/model`). The transports differ
  and the OBJECT MODEL does not, so `lib/duet.js` parses it once and the
  transports are reduced to "get me a model" — two parsers would have drifted,
  and a test asserts the two produce an identical status from the same machine.
  Which surface an address answered on is remembered, so the wasted probe happens
  once rather than on every poll. **Not verified against hardware:** there is no
  Duet here, so every branch is reachable from a test with an injected fetch and
  that is all that is claimed — the standard R7's socket layer is held to.
  `machine/model` returns the FULL model, so the SBC transport needs no second
  file query and cannot hit the `f`-flag trap at all.
- **Duet actuals may vanish at the moment they are captured.** `job.duration` and
  `job.rawExtrusion` are `OBJECT_MODEL_FUNC_IF(self->IsPrinting(), …)`, so they
  disappear the instant the job stops being "printing" — which is the
  printing→complete transition `captureCompletion` fires on. The U1 retained its
  stats, which is why the primary path has only ever been exercised on a printer
  that does. By source, a Duet will not. Unproven either way; needs a Duet.
- ~~**Repetier progress.**~~ **Closed 2026-08-27 — and it should never have been
  filed here.** The 2026-08-25 entry read: "`done` is read from the state object,
  but Repetier's HTTP API documentation does not show a progress field on
  `stateList` … If a real server reports 0% while printing, that is where to
  look." That is the defect, stated correctly, filed as something only hardware
  could settle. It was not: the vendor's own field list plus one typed client
  settled it in an afternoon, and the answer was that every Repetier printer
  reported 0%. **A suspicion strong enough to write down is strong enough to
  chase to a second document before it is parked behind a printer nobody owns.**
- **Repetier time remaining, and actuals.** `printTime` and `printedTimeComp` are
  on `listPrinter` and are deliberately unused, because what they MEAN is
  documented nowhere this audit could find — RepetierSharp annotates
  `printedTimeComp` with a literal question mark. Total-versus-elapsed and
  compensated-versus-wall-clock are the same distinctions that made OctoPrint's
  `job.filament` an estimate in a measurement's clothes. Needs a Repetier server,
  or a vendor statement.
- **Bambu's poll is shaped for the X1 and used on the P1.** Fresh connection plus
  `pushall` every 30 s, against documented guidance of no more often than 5
  minutes on a P1P, and against two reports that the P1 line serves only one
  local MQTT client correctly. The fix is a persistent connection with a
  watchdog; it needs a Bambu to verify. See the 2026-08-27 findings.

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

Added 2026-08-27 — tier 1:
`OctoPrint/OctoPrint` (`dev` = the 2.0 line, `main` = 1.11)
`src/octoprint/server/api/{printer,job}.py`, `src/octoprint/schema/api/job.py`,
`src/octoprint/printer/{standard.py,connection.py}` ·
`Arksine/moonraker` `moonraker/klippy_connection.py`

Added 2026-08-27 — tier 2:
[OctoPrint API versioning](https://docs.octoprint.org/en/dev/api/general.html#api-versioning) ·
[OctoPrint 2.0.0rc1 release notes](https://github.com/OctoPrint/OctoPrint/releases/tag/2.0.0rc1) ·
[OpenBambuAPI `mqtt.md`](https://github.com/Doridian/OpenBambuAPI/blob/main/mqtt.md)

Tier 3 — real hardware, other people's:
[Saturn 4 Ultra SDCP V3 notes](https://github.com/alfiedennen/sdcp-saturn-4-ultra) ·
[Bambu LAN + Developer Mode, per model](https://help.simplyprint.io/en/article/bambu-lab-lan-only-mode-and-developer-mode-how-to-enable-xa0hch/) ·
`home-assistant/core` `components/repetier` (added 2026-08-27: `done` is published
as a PERCENTAGE, which settles its range) ·
[`Z0rdak/RepetierSharp`](https://github.com/Z0rdak/RepetierSharp) `Models/Common/{Printer,PrinterState}.cs`
— a typed client whose two models split exactly along the `listPrinter` /
`stateList` line ·
[`greghesp/ha-bambulab`](https://github.com/greghesp/ha-bambulab) `pybambu/{bambu_client,commands}.py`
— persistent connection, `pushall` on connect, 60 s watchdog ·
[P1 single-client reports](https://github.com/greghesp/ha-bambulab/issues/174) (with
`bambulab/BambuStudio#2404`; firmware 01.04, not re-verified since) ·
[Snapmaker's Moonraker fork](https://github.com/Snapmaker/u1-moonraker) — the U1
runs a Moonraker with roughly 15% of it modified, so it is the reference for that
machine rather than upstream.
