# Khayt for macOS — native

A native Mac app, replacing the Electron build **on macOS only**. Windows and
Linux stay on Electron: this exists because Electron cannot be made to feel like
a Mac app, not because the Electron app is going away.

## The architecture, and why

Khayt is ~97,000 lines of JavaScript. This does not rewrite all of it.

| | Lines | Here |
|---|---|---|
| Pure `lib/` — tax, pricing, payment plans, split-order, loyalty, estimator | 29,121 | **reused**, run in JavaScriptCore |
| `renderer/` — the interface | 52,855 | **rewritten** in SwiftUI. This is the point of the exercise |
| `main.js` — 192 IPC handlers | 5,904 | rewritten in Swift |
| Impure `lib/` — store-io, printer protocols, LAN server | 9,583 | rewritten in Swift |

**The business logic is not rewritten, and that is deliberate.** macOS ships
JavaScriptCore as a system framework, so those modules run here unchanged, with
nothing bundled and no Node. A Swift `computeTax` would earn the right to be
wrong in a second, different way, and every future fix would have to be made
twice — in an app whose whole recent history is money bugs found one at a time.

Proven, not assumed:

```
                Swift (JavaScriptCore)     Node              match
tax         →   347826.08 / 52173.92       same              ✓
instalments →   [666.67, 666.67, 666.66]   same              ✓
quote total →   187.5                      same              ✓
```

`MoneyParityTests` runs every case a review pass got wrong — the nil VAT return,
exclusive pricing, the instalment remainder, the split-order deposit, the
customer progress tracker — through both engines and compares the values.

## Layout

```
mac/
  KhaytCore/                     Swift package
    Sources/KhaytCore/           the JS bridge + typed money API
    Sources/KhaytCore/JS/        copies of lib/*.js  ← never edit; run mac/sync-js.sh
    Sources/KhaytApp/            the interface (SwiftUI) — reads, never writes
  sync-js.sh                     re-copy from lib/
  verify-safestorage.sh          confirm the Keychain link against a live store
```

## The copies are guarded twice

SPM resources must live inside the package, so `JS/` holds copies of `lib/`.
That is a fork waiting to happen, so:

* `test/mac-core-is-not-a-fork.test.js` — byte comparison, runs on Linux CI, free.
* `MoneyParityTests` — the same check *plus* Swift-vs-Node values. Needs macOS,
  so it is not in CI: a macOS runner bills at 10×, which is a decision rather
  than a detail. Run it locally before touching anything in `lib/`.

```bash
cd mac/KhaytCore && swift test
```

## Secrets

The store file is plain JSON; three fields inside it are not. The AI key, the
cloud token and the S3 secret are `__enc__` + base64 of Electron `safeStorage`,
which on macOS is Chromium's OSCrypt. `SafeStorage.swift` implements it, and the
shape was measured rather than assumed:

```
ai.apiKey            total 115  prefix "v10"  body 112  body % 16 == 0
cloud.token          total  83  prefix "v10"  body  80  body % 16 == 0
s3.secretAccessKey   total  35  prefix "v10"  body  32  body % 16 == 0
```

Swift and Node are held to identical bytes across the padding edges, and `seal`
refuses to return a field it cannot itself open — the failure it guards is
overwriting a working secret with bytes nothing can decrypt.

One link is deliberately not in the suite: that the Keychain item holds the
PBKDF2 password. Confirming it means reading a live secret, so it is a command
you run, not a test that runs itself:

```bash
./mac/verify-safestorage.sh          # dev store
./mac/verify-safestorage.sh Khayt    # packaged app
KEYCHAIN_WAIT=120 ./mac/verify-safestorage.sh    # slow to answer the prompt
```

It waits a minute for the Keychain and then gives up saying so. `security` blocks
on that permission prompt with no limit of its own, and the prompt can open
behind another window — or never, in a shell with no window server session (ssh,
CI, a git hook). If the password does not arrive, the script checks nothing and
says nothing about your store: an unanswered prompt used to be reported as every
secret failing to decrypt, which is a permission problem wearing the costume of a
corrupt store.

Two traps it will show you:

* **The Keychain item is named after `app.getName()`, which is not constant.**
  A dev run uses `khayt` (package.json `name`); a packaged build uses `Khayt`
  (electron-builder `productName`). Different items, different keys, different
  store files. Mixing them looks exactly like a corrupt store.
* **A native binary has a different code signature, so macOS treats it as a
  different application** and prompts before granting access to Electron's key.
  Expected, once per binary — but it means an unsigned debug build and the
  shipped app are two separate grants.

## The interface

```bash
./mac/make-app.sh --open      # build Khayt.app and launch it
cd mac/KhaytCore && swift run Khayt    # or the bare binary, for working on it
```

`make-app.sh` assembles a real, double-clickable application: the release binary,
the SwiftPM resource bundles, the Khayt icon, an `Info.plist`, and an ad-hoc
signature. `--install` puts a copy in `/Applications` as **Khayt Native.app**, so
it sits beside the Electron app rather than on top of it.

**It is not the shipping build.** Ad-hoc signing means this Mac will run it and no
other will; a Developer ID, a hardened runtime and notarisation are what make it
something a shop can download, and none of that exists yet.

**⌘R reloads from disk.** The store is read once, at launch, so anything the
Electron app writes after that is invisible here until asked for — and while this
is a reader, the two are expected to be open at the same time.

Two things the bundle changes:

* Its identifier is `app.khayt.mac`, **not** `app.khayt.hub`. Two applications
  sharing an identifier confuse Launch Services, the defaults domain, and the
  Keychain's idea of who is asking. It also means the bundled app and `swift run`
  remember their windows separately — `app.khayt.mac` against the bare `Khayt`
  domain — and each needs its own Keychain grant, since they are two signatures.
* `swift run` has to tell AppKit it is a windowed app, or the window opens behind
  everything. A bundle says so itself, so the app now asks only when it has no
  bundle identifier. An app that shoves itself in front of your work on every
  launch is one people learn to resent.

It can change a model's favourite star and file models into groups, and only
while it owns the book. Select several — click, ⌘-click, ⇧-click — and the whole
selection is filed in ONE write: seven kings filed one at a time would be seven
read-modify-writes and six windows in which a crash leaves the collection half
made.

Group names go through `lib/organise.js`, bundled and run rather than ported,
because the rule that matters is that a name matching one already in use IS that
name and adopts its spelling. "Saudi Kings" and "saudi kings" as two chips, each
holding part of one collection, is exactly what that module exists to prevent. See **Who owns the store**; the star is a control when this app holds
ownership and a plain mark when the Electron app does, because a disabled toggle
invites people to keep pressing it.

Three shelves off one sidebar: the pipeline as a real `Table` of jobs, the
customers derived from those jobs, and the print library as a grid of models with
the shop's groups beneath it. Each has an inspector. It opens on the shop's own
book if there is one, falling back to the sample only when there is not.

**Put `.inspector` on the `NavigationSplitView`, never inside `detail`.** Inside
it, the detail content is laid out against the window *minus the inspector* with
the sidebar's width never taken off — so a `Table` stretches its columns across
200pt it does not have, and the right-hand ones are clipped away rather than
compressed. The Owed column vanished twice that way before the cause was found,
and column `max` widths do not save you: the stretch ignores them.

It opens a store **read-only**, and there is no code in `KhaytApp` that writes — that is the constraint at the foot of this file
honoured rather than worked around.

A reader can still be wrong in the way that matters: showing a figure the app
the shop actually bills from disagrees with. So the money on screen is not
arithmetic written in Swift. The tax split in the inspector comes from
`lib/tax.js` through `KhaytEngine`, and the sidebar's stage order comes from
`lib/order-progress.js`. What the app works out for itself is what any table
works out — sort keys, filters, and `price - paid`.

Three books, and which one is open is stated in the toolbar and again at the
foot of the sidebar. Mistaking the sample for the shop's real position is the
one error this app must not allow.

| Source | Where |
|---|---|
| Sample shop | 42 jobs bundled in the app; subtitled *sample data — not a real shop* |
| This Mac — development | `~/Library/Application Support/khayt/khayt-store.json` |
| This Mac — Khayt | `~/Library/Application Support/Khayt/khayt-store.json` |

A store that is not on this Mac is not offered: a menu item that leads nowhere
is a dead end dressed up as a choice.

### Photographing it

Judging a design by reading its source is guessing.

```bash
KHAYT_SNAPSHOT_DIR=/tmp/shots swift run Khayt     # writes 01-shop.png, then quits
```

It photographs the window's *theme frame* rather than its content view, because
a unified toolbar lives in the title bar — a sibling of the content, not a child
of it — and a picture without the toolbar is missing most of the chrome.

Two things the picture cannot show. Both are artefacts of drawing a window into
an offline bitmap, not faults to go and fix:

* **The sidebar comes out black and empty.** `NSVisualEffectView` draws nothing
  into a cached bitmap, and `.listStyle(.sidebar)` is one. To see those rows,
  run once with `.listStyle(.plain)`, which has no material.
The run also writes `*-paneN.png`, each scrolling pane photographed on its own,
for when the window shot leaves a doubt. It has the opposite blind spot — it
loses what a pane draws into its own layer, so thumbnails go missing there.

**A correction, since the wrong version stood here for a day.** The library
inspector once photographed as a solid black column and this file blamed the
capture, claiming that two `NSScrollView`s on screen meant one came back black.
That was not it. The inspector was attached inside `detail`, the content was laid
out against a width that never subtracted the sidebar, and the inspector had
nowhere to draw. Moving `.inspector` onto the `NavigationSplitView` fixed the
picture and the app at once. A capture limitation is a comfortable thing to
blame — check the layout first.
* `ImageRenderer` is not the way round it. It returns a "cannot render"
  placeholder for `NavigationSplitView`, `Table` and the toolbar alike — which
  is to say for everything that makes this a Mac window rather than a page.

**Sheets photograph without their words.** `cacheDisplay` asks each view to
draw itself, and SwiftUI does not draw itself: every `10-…`–`16-…` sheet shot
shows the AppKit-backed controls (fields, pickers, the default button) and none
of the labels around them. Rendering the layer tree instead was tried and gets
the same text back — none of it, upside down. So `SnapshotTests` renders the
same sheets through `ImageRenderer` as `20-…`–`24-…-words.png`, which shows the
words and blanks the controls. Between the two there is a picture of each.

The window frame is restored from the `Khayt` defaults domain, so `.defaultSize`
applies on a first run and never again. `defaults delete Khayt` to see what a
new shop sees. (That domain belongs to this binary; the Electron app's is
`app.khayt.hub`, and deleting one does not touch the other.)

## The invoice

⌘P on a job, or *Invoice* beside the money in the inspector. The document is
`lib/invoice-document.js` — the same four hundred lines the Electron window
prints — drawn in a `WKWebView` with `renderer/invoice.css`, which
`sync-js.sh` copies into `KhaytApp/Resources` beside the modules. Two
stylesheets would be two documents that agree until one is edited.

What is assembled in Swift, and why each piece is not in the module:

* **The money** — `Shop.taxSplit` applies the shop's inclusive-or-exclusive
  rule and the document is handed the answer, not the setting.
* **The ZATCA QR** — the TLV payload is `lib/zatca-qr.js`; only the pixels are
  CoreImage. A shop missing a required field gets the refusal printed in words
  rather than an empty box.
* **The PDF** — `printOperation(with:)`, not `createPDF`. `createPDF`
  photographs the view at whatever width the sheet happens to be, and the first
  export was one endless 480-point strip with the totals off the edge. Printing
  renders in print media — `@page { size: A4 }`, the margins — and MUST be run
  with `runModal(for:…)`: WebKit lays the pages out in the web process, and
  `run()` waits for them on the run loop they need. It hung a test for ten
  minutes before the documentation was read.

Two shared rules moved into the document while building this, because the Mac
had no copy of either and printed six invoices without them: the contact line
under the bill-to name (`contactLine`) and the printed date (`lib/print-date.js`,
which also now owns `LOCALE_TAGS`). Both default inside the module now, so a
host that forgets to pass them gets the right document rather than a blank.

## Settings

⌘, — five panes: Business, Invoice & Tax, Payments, Operations, Preferences.
Each pane is its own draft with its own Save, and a pane saves ONLY the keys
it shows. The rule is `lib/settings-edit.js`, lifted out of the 240-line
literal in `renderer/settings.js` and proven against it field for field over
3000 generated saves; its one deliberate difference — a key the form does not
carry keeps its value — is what lets the Business pane save a phone number
without zeroing the WIP limits it never displayed. Choosing a country for tax
rules goes through `chooseCountry`, the same rule Khayt's picker applies on
the change, so name, registration label, convention and rate land together.

`SettingsTests` round-trips every field of every pane through the rule and
reads it back: a form key the rule does not know leaves the stored value in
place, and that is the test that notices, for every field rather than a
sample. Two small tables are spelled out in Swift because the field list is
built while a view draws (`Shop.contentKey`, `Shop.languageNames`); both are
pinned to `lib/content-languages.js` by a test.

**The shop's name is `bizEn`/`bizAr`**, read through the shared fallback, not
`settings.shopName` — which nothing in Khayt writes. This app read `shopName`
for six weeks, fell back to the build's title, and would have issued this
shop's invoice from "Khayt". Found by opening the Business pane on the sample
and seeing every field empty.

## What the shop spent, and what it wasted

Two shelves under *Money*, each with a period menu, the search box wired to
what is actually on screen, and a form. The rules are `lib/expense-book.js`,
`lib/waste-entry.js` and `lib/date-range.js`, all lifted from renderer
handlers and proved against them; the app builds a form, hands it over, and
writes what comes back.

Logging a failed print writes **two collections in one swap** — the log and
the shelf — because a log saying a print wasted 200g while the spool still
holds them has told the shop it has filament it has already thrown away. The
spools the deduction touched are stamped and the ones it did not are left
alone: `rev` is what the cloud's sync baseline reads, so an unstamped edit
never leaves this Mac and a needlessly stamped one sends the whole shelf up.

`Shop.inPeriod` is the one shared rule this app spells out in Swift, because
it decides whether to draw a row and is asked once per record while a list
lays out — a bridge crossing each time would be thousands of them.
`SpendingTests` runs it against `lib/date-range.js` over every period, two
years of dates and four clocks. That parity run is what found the partial-date
case: the renderer's original filed a record dated "2026" under *this year*
and nowhere else, because `"2026".slice(0, 4)` is the year. The shared rule
now refuses a date that is not `YYYY-MM-DD`, which is what both apps say.

**Two toolbar findings, both only visible in a photograph.** A `Picker` in a
toolbar draws as a popup labelled with its selected value and came out
completely empty — a chevron with nothing beside it — in every style and
sizing tried; a `Menu` with a bare `Text` label works. And a toolbar `Menu`
draws a `Label` as its icon alone, which `.labelStyle(.titleAndIcon)` does not
change.

## The floor

＋ adds a printer, ⌘-click or double-click its name to correct one. The record
and what picking a model fills in are `lib/machine-edit.js`.

**An honest note on that lift.** The Electron machine editor mutates a draft
through thirty separate event handlers, so most of it is not a function that
can be copied and run beside a module. What IS lifted verbatim, and compared
over every printer in the catalogue, is `fillSpecs` — the piece where the
decisions are, including both rules it carries in capitals: the nozzle MATERIAL
is the point of the catalogue knowing it (an X1C ships hardened steel and an
MK4S ships brass, a ten-fold difference in expected life), and a threshold the
shop has typed is NEVER rewritten, because the app cannot tell a default from a
decision. The rest is a new rule assembled from those handlers and tested on
its behaviour; said plainly, because a weak guarantee described as a strong one
is worse than a weak one nobody relied on.

**What the sheet deliberately does not offer:** the printer's API, its webcam
and its downtime blocks. Those belong with the polling this app does not do
yet, and a screen that writes connection settings it cannot test is worse than
one that does not offer them. `MachineTests` asserts an edit made here carries
all three through untouched.

Two things this found. `printer-facts.js` has to be bundled BEFORE
`printer-catalog.js`: the catalogue reaches it through a global and falls back
to nothing, so without it every printer came back with no nozzle material and
no hotend limit — it does not raise, it just knows less. And the nozzle
fitments are read from `lib/nozzle-wear-data.js` rather than listed in Swift,
because a hand-written list said "steel" where the data says "stainless", the
sample shop's U1 matched nothing, and the picker photographed blank. That also
turned up a bad value in the sample itself — "hardened steel", which the wear
data does not know — so its X1C had a maintenance threshold worked out from the
wrong life.

## The shelf

⌘-click or double-click a spool to correct it, ＋ to add one. The record and
the correction are `lib/spool-edit.js`, lifted from `addInventoryItem` and the
spool editor's `onSave` and proved against both. What the rule settles: a blank
optional field is ABSENT rather than empty; a spool weighs at least a gram (one
weighing nothing divides into every cost-per-gram in the app); zero for a print
temperature means "not set", not "print at zero"; **an edit changes only what
it was given**, which is what lets a smaller editor exist without wiping the
fields it never showed; and a COST CHANGE IS REMEMBERED, because "what did this
material cost last time" is the question a shop asks when a supplier's invoice
looks wrong.

Two things come back from an edit: the spool, and the settings — the shop's
colour library is a setting, and naming a variant adds to it. They are written
in one swap, or the next editor offers a list that has forgotten what was just
typed. An edit is stamped; a new record is not.

Deleting is undoable through its own path: `registerMoveUndo` restores fields
onto records that are still there, and a deleted spool is not one — it would
take its price history and its usage with it, and nothing else in the book can
reconstruct them.

## Profit and loss

The shop's quarters, from `lib/pnl-report.js`'s `pnlByPeriod` — lifted out of
the Electron analytics screen, where the whole aggregation was inline. A table
rather than a chart: this is the screen a shop reads at the end of a quarter to
decide something, and a bar it cannot read a figure off is decoration.

What the rule settles, each of which was a comment on the original: a VOIDED
invoice is not revenue and not VAT collected (voiding keeps `status:
'completed'` and only sets `voidedAt`); revenue is the price less credit notes,
in the shop's own currency; VAT is `computeTax(...).taxTotal`, which extracts
under inclusive pricing and ADDS under exclusive, rather than tax pulled out of
the revenue; and the fixed overhead is charged to EVERY quarter with activity,
pro-rated for the one in progress.

**The engine failing was silent, and a photograph is what caught it.** Bundling
`pnl-report.js` — whose file is named for what it produces rather than for the
`KhaytPnl` global it assigns — made the loader's own check throw, `Shop.load`
swallowed it with `try?`, and every screen carried on with no words (the
catalogue is loaded through the runtime, so every label rendered as its own
key), no tax, no reports and no writes. `Shop.engineProblem` now says so in the
sidebar, `EngineStartTests` asserts the runtime starts and that a handful of
labels are not their own keys, and the loader's exception list has a comment
saying a NEW module should be named for its global instead.

## Not yet built

The rest of analytics, the catalog, gift cards, the portfolio,
the colour studio, the converter, the cloud portal, the LAN server, and the
printer protocols. `KhaytCore` came first because the alternative, screens
against a half-trusted engine, is how the two apps come to disagree about a
shop's money.

### The dashboard

The screen the app opens on. `lib/attention.js` and `lib/dashboard-facts.js` are
bundled and run, so what counts as late here is what counts as late in the shop's
other app — both pure, zero requires, already assigning onto `globalThis`.

**`lib/kpi.js` is deliberately NOT bundled.** It takes rows a caller has already
scoped to a date range, converted to base currency and marked completed and
on-time; `renderer/analytics.js` does that in a private `rowsFor(range)`. Handed
`{orders, settings}` it compiles, runs, and returns **every figure as zero** —
which is how this screen briefly showed "0 SAR revenue" beside a toolbar reading
52,691.57. Revenue and margin wait until that normalising is lifted into `lib/`
where both apps can share it. A bridge method that quietly answers zero is worse
than no bridge method.

That is fixed. `lib/kpi-rows.js` and `lib/order-money.js` were lifted out of the
renderer, and the money section now shows revenue, gross profit, margin, average
job and on-time — all from the shared modules, for a period you choose. The
margin here is the margin the Electron app shows, because it is the same three
functions: `order-money` prices an order, `kpi-rows` says which orders count,
`kpi` adds them up.

The money function is written in JavaScript inside `KhaytEngine.kpis` — a
function cannot cross the JSON bridge — and it is the renderer's own three calls.

**Two tiles are deliberately absent.** There is no second "Late": the floor
already has one from the attention engine, and the money section's counted
something subtly different (unpaid *and* overdue). And there is no "Owed": `kpi`
scopes outstanding to the period, while the toolbar shows what the whole book is
owed, unscoped and always visible — two figures under one word, inches apart,
differing by an order of magnitude.

### The board

Every open job in the column its stage puts it in. The table answers "what is
the state of this job"; the board answers "where is the work piling up", which is
the question a shop asks standing in the middle of the room and the one a list of
forty rows sorted by date cannot answer at a glance.

Cards sort urgent first, then by due date, then by what has been waiting longest
— the order someone would work through them in. Delivered and cancelled are off
the board on purpose: a column of two hundred delivered jobs buries the four that
need doing. An empty column keeps its width and says "nothing here", because a
board whose columns collapse as work moves is a board you cannot learn.

**READ-ONLY, AND THAT IS THE POINT.** Dragging a card between columns would be a
status change, and a status change in Khayt is not a field write: it stamps
`completedAt`, moves the customer's progress tracker, and can settle an
instalment plan — 3,200 lines of `renderer/order-flows.js` worth of rules. A
Swift reimplementation of the most consequential write in the app is exactly what
this project refuses to do. Dragging arrives when those rules are shared, the way
the money rules now are.

### The shop floor

Machines as cards — a shop has a handful of printers, not four hundred, and what
you want from one does not line up into columns worth scanning. Filament as a
table, with the per-kilo cost worked out, which is the number that compares two
suppliers.

Nozzle wear comes from `lib/nozzle-wear.js` — bundled with
`lib/nozzle-wear-data.js`, **which must load first**: `nozzle-wear` reads it
through `require`, and under JavaScriptCore there is none, so it falls back to
`global.KhaytNozzleWearData`. Without that file the module still LOADS and then
throws on the first call. Verified identical to Node's answer.

**The machine's address is shown; its key never is.** The store keeps that
encrypted and a screen saying where a printer lives has no business opening it.

### Three shared modules, three signatures I got wrong by assuming

All in one afternoon, and the pattern is worth the space:

| Module | What I passed | What it wanted | What it did |
|---|---|---|---|
| `kpi.computeKpis` | `{orders, settings}` | rows already scoped and converted | returned every figure as **zero** |
| `nozzleWear` | one options object | `(printLog, machine, settings)`, positional, **per machine** | reported every nozzle at the default 5,000g threshold instead of its own |
| `filament-dryness` | inventory rows | Bed Ready dry-log records keyed on `driedAt` | a column of dashes — the module does not apply to this collection at all |

None of the three failed. Each returned a plausible object that rendered
perfectly and was wrong. **Read the function, not the name** — and when a module
turns out not to fit the data, unbundle it rather than keeping a column that
would go wrong the moment somebody filled the field in.

### How the library is ordered

**The default is not "by name".** `renderer/printfiles.js` sorts favourites
first, then most recently updated, and a shop that switches between the two apps
and finds its models in a different order has been given two libraries. This app
opens the same way round, and View ▸ Sort Library By offers name, size, last run
and times printed. The choice is remembered.

Two small decisions inside those orders, both tested: **by size is biggest
first**, because the reason to sort by size is to find what is filling the disk;
and **a model that has never run sorts last**, because an absent date must read
as "long ago" rather than "now" — otherwise the least useful models would be the
first thing a shop sees under "Last run".

### The keyboard in the library

Arrow keys move the selection, ⇧ extends it, ⌘A selects everything on the shelf,
⏎ opens, ⎋ clears. A `List` gets all of that free; a `LazyVGrid` gets none of it,
and a grid you cannot walk with the arrow keys is the most un-Mac thing an
otherwise native window can do.

Three things it turns on:

* **The columns are fixed, not `.adaptive`.** Moving down is moving forward by
  one row, so the count has to be known — and `.adaptive` decides it privately.
  `LibraryGrid.columns(across:)` is that count, and is tested for being
  monotonic and never zero.
* **The arrows follow reading order, not the screen.** In a mirrored window the
  next model is to the LEFT. `LibraryGrid.step(for:columns:layout:)` is that
  rule, alone and tested, because a right arrow that walks backwards is the kind
  of thing nobody notices until an Arabic shop does. It was also written first as
  `case forward:` inside the key handler — one character from `case let forward:`,
  which would have matched everything.
* **Two positions, not one.** `anchor` is where a selection run started and
  `cursor` is where the keyboard is standing. Computing the next place from the
  anchor — which is what it did first — means a second ⇧-arrow lands where the
  first did and the selection never grows past two. Caught by its own test.

A key at either end is left **unhandled** rather than clamped, so the system beep
still means "there is nothing that way". And there is no focus ring around the
pane: Finder, Photos and Music all show keyboard focus through the selection, and
a blue rectangle enclosing the grid reads as an error state.

### Undo

Every edit is reversible — ⌘Z, with the Edit menu naming what it will undo
("Undo Add to Favourites", "Undo File in Saudi Kings"). Those items have always
been in the menu; until now they did nothing, which is worse than their being
absent: an item that is enabled and inert teaches people not to trust the menu.

What is captured is the WHOLE record as it was, not the fields about to change,
so an undo also puts back a field some later version of the edit starts touching
and forgets to snapshot.

**`rev` is the exception and does not go backwards.** An undo is an edit like
any other and stamps a new revision. A record whose revision went back would
look to the next sync exactly like the change never happened, and the other
machine's copy would win — the undo undone, by a laptop, quietly.
`StoreWriter.restoring(_:over:)` is that rule, alone and tested.

Verified end to end on the real store, with a backup: `false → true → false`,
one record touched, only `rev` and `updatedAt` left different, rev 3 → 5 (the
edit and the undo, both forward), secrets byte-identical, store restored
afterwards.

## The menu bar

Everything the app can do is in the menu bar with a key for it — ⌘1/2/3 for the
three shelves, ⌘R reload, ⌘D favourite, ⇧⌘R reveal, ⌘O open. A menu you have to
know is there is a feature for the person who wrote it.

**The items are Views, and the shop is handed to them.** Two problems, and the
fix for the second is what fixes the first:

* A `Commands` body does not re-run when an `@Observable` it read changes, so
  items built straight into `Commands` freeze in the state they had at launch.
  The developer forums' answer — put the items in a `View` — is right, because a
  View body does re-run.
* `focusedSceneValue` / `@FocusedValue` is the documented way to tell those views
  which shop to act on, and it **delivers nil here**. Tried under `Window` and
  `WindowGroup`, declared with `@Entry` and with an explicit `FocusedValueKey`,
  read from a `Commands` type and from a `View`. So the shop is handed down; the
  indirection starts paying for itself at the second window.

**⌘A is the system's.** Adding a rival "Select All Models" to the Edit menu
simply loses — SwiftUI drops the shortcut on the second claimant, and the item
ends up with no key at all. The grid handles the standard command when it has
focus, which is how a Finder window does it.

### Reading the menu bar in a snapshot run

`KHAYT_SNAPSHOT_DIR` runs print the menu bar as AppKit built it — titles and
shortcuts.

**They deliberately do not print enabled state, and that cost two afternoons.**
AppKit validates items against the responder chain when a menu is about to open,
and a snapshot run never establishes one, so every item reads as disabled —
including Cut, Copy and Paste. That looks exactly like a broken focused value and
is nothing of the kind. Both times, the thing that was actually true came from
STRUCTURE: the Book menu's picker is built inside an `if let shop`, so its
presence says the shop reached the menu and its absence says it did not.

**No `Settings` scene yet**, so ⌘, does nothing. An empty preferences window
would be worse — there is no setting this app owns that is not either the shop's
(which lives in the book) or the Book menu's.

## Who owns the store

The constraint below is now written down on disk rather than assumed.

`lib/store-lock.js` decides who owns `khayt-store.json`; Electron takes ownership
for its whole session, refreshes a heartbeat, and drops it on quit.
`StoreLock.swift` reads that record and the Mac app says who has the book — it
never takes the lock, because it does not write, and a reader claiming ownership
would shut a shop out of its own app for nothing. When writing arrives, that
check is what gates it.

**Ownership, not a lock around each write.** Per-write locking looks smaller and
does not work: `updateStoreOnDisk` reads the in-memory `getStore()` in preference
to the disk, so a second process could take a perfectly correct lock, write,
release, and have its change overwritten by the incumbent's next save from
memory. What has to be exclusive is the session.

**Liveness beats time.** A lock is broken because its process is gone, not
because a clock says so — an app paused at a breakpoint or busy through a long
import is still the owner. The heartbeat is consulted in exactly one case: a
record written by another machine, where there is no pid to ask about.

Two traps, both found by running the two implementations against each other
rather than by reading either:

* **Node and Swift spell this machine differently.** `os.hostname()` gives
  `Turkis-MacBook-Air.local`; `ProcessInfo.hostName` gives
  `turkis-macbook-air.local`. Compared raw, the Mac app reads Electron's lock as
  foreign, stops checking liveness, and judges a live holder on the clock. Both
  sides fold case before comparing.
* **A heartbeat from the future is not stale.** Two machines never agree on the
  time, and treating a negative age as old breaks a live holder's lock instantly.

`test/store-lock.test.js` covers the rules; `StoreLockParityTests` runs sixteen
cases through Node and Swift and compares; and the E2E smoke asserts the running
app actually wrote a record naming its own live process — delete
`acquireStoreOwnership()` from main.js and that fails.

### Writing

`StoreWriter` is the only code in this app that can lose a shop's data, so it is
built around three rules:

* **It never decrypts.** The secrets on disk are already `__enc__` strings, so an
  edit to another field carries them through untouched and `SafeStorage` is never
  involved — decrypting to re-encrypt would put a working credential one bad round
  trip away from unreadable, for nothing. The price is that the whole store goes
  through a JSON decode and encode, so `StoreRoundTripTests` proves a real store
  survives that value for value. If it did not, every record's fingerprint would
  move and `stampChanges` would push the entire book to the cloud as changes
  nobody made.
* **It reads from disk, inside the write** — never from anything already held.
  `updateStoreOnDisk` learned that one the hard way.
* **It writes only while it owns the book**, checked before the read and again
  immediately before the swap, so the window in which Electron could take over is
  one serialisation wide rather than a whole edit.

It stamps `rev` and `updatedAt` the way `renderer/sync.js` does. That is not
politeness: the renderer's sync baseline is an in-memory index seeded from the
store on load, so an unstamped edit would look to the next Electron launch
exactly like the state the book had always been in, and would never reach the
cloud.

Verified on a copy of a real store, and once on the real one with a backup: of 34
collections only `printFiles` changed, of its records only the one named, and of
its fields only `favorite`, `rev` and `updatedAt`. Secrets byte-identical.

### Reading a group

`groupOf` is the one part of `organise.js` written twice, because asking a
JSContext for the group of every row to draw a sidebar of four hundred models is
a call per row for an answer that is two field reads. `OrganiseParityTests` holds
the copy to the original, and caught two things I had wrong:

* **The PRESENCE of `folder` decides, not whether it holds anything.** A shop
  clearing the box on an older build leaves `folder: ''`, and that empty string is
  the instruction. Falling back to `group` there brings back the name they just
  deleted.
* **`normalise` does not strip control characters.** A NUL in this field has
  caused trouble elsewhere in Khayt and the instinct is to strip it — but
  JavaScript's `\s` does not match NUL, so neither may this. Whatever the two
  apps do here they must do identically.

A third was in the test rather than the code: it restated the rule instead of
calling it, and so agreed with the mistake. It calls `LibraryFile.groupName` now.

## Words

The app speaks Khayt's own vocabulary. `renderer/locales/en.js` and `ar.js` are
bundled and run in JavaScriptCore alongside the logic modules, so a stage this
app calls "قيد الطباعة" is called that because the Electron app calls it that. An
app that invents its own word for "Owed" has given one shop two vocabularies, and
the person reading the second has to work out that it means the first.

`Words.own` holds the handful of things Khayt has never needed a word for — "On
this Mac", "Opened read-only". They are kept there rather than added to the
shared catalogue because that one is nine languages wide and guarded for
completeness: adding a key there means adding it in nine, and an English value
sitting in `ar.js` is exactly what `test/locale-quality.test.js` exists to catch.
`WordsTests` proves every borrowed key exists in both bundled languages, every
own key carries both, and that neither catalogue shadows the other.

Language comes from `settings.lang`. Not the system: a Riyadh shop on an English
Mac still keeps its book in Arabic, and the book is what this window shows. (The
Electron app keeps the live choice in `localStorage`, which nothing outside it
can read; `settings.lang` is the copy that travels with the store.)
`KHAYT_LANG=ar` forces one run, which is the only way to photograph a language
the shop does not use.

### Right to left

An Arabic shop gets a mirrored window: sidebar on the right, columns reversed,
inspector on the left, traffic lights on the right.

**Not via `.environment(\\.layoutDirection, .rightToLeft)`.** That line sends
SwiftUI's `NavigationSplitView` into an unbounded layout loop on macOS 26 —
`SplitViewChildController.hostingView(_:didUpdateMinSize:maxSize:)` re-invalidates
every pass, the window grows past 3000pt, and AppKit aborts with *"more Update
Constraints in Window passes than there are views in the window"*. It is not the
sidebar's or the inspector's width constraint; removing either changes nothing.

The way that works is the way AppKit has always done it. `Direction.settle()`
sets `NSForceRightToLeftWritingDirection` and `AppleTextDirection` — the two
defaults Apple documents for [testing right-to-left
layout](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPInternational/TestingYourInternationalApp/TestingYourInternationalApp.html)
— and the whole application flips. SwiftUI is never asked to mirror anything, so
there is nothing for it to loop over.

**AppKit reads those once, on the way up**, so this has to happen before
`NSApplicationMain`. That is why there is a `main.swift` and why `KhaytApp` is
not `@main`. When the answer differs from last launch the app `execv`s itself
once — guarded by an environment variable so it can never do it twice — which is
also why changing a shop's language takes effect at the next launch rather than
immediately.

Both keys are always written, never only the true one: a shop moving from Arabic
to English would otherwise keep a mirrored window for ever, because the value it
set last time is still in its own defaults. Round-trip verified — ar → en → ar,
mirrored, unmirrored, mirrored, no crash in any direction.

Resolving the language reads the store before AppKit exists: 3ms on a real 958KB
book, bounded by the 50MB cap.

## The one hard constraint

**Only one app may own the store at a time.** Khayt's write serialisation is
per-process: two processes on one `khayt-store.json` race exactly the way two
shop-floor tablets did before #898. Either the Mac app replaces Electron on that
machine, or the second one opens read-only behind a lock.
