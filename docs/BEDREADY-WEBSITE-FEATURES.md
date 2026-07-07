# Bed Ready — Feature Catalogue (for the website)

> **Purpose.** This file is the single source of truth for the Bed Ready website copy. Each section
> gives a short marketing-ready blurb plus the factual details behind it, so the website can be updated
> without digging through the app. Written for the **public beta**. Keep claims honest — everything
> below reflects what actually ships.

**One-line pitch:** *Bed Ready is a free desktop workbench for solo 3D-printing makers — organise your
print files, preview them in 3D, retarget any model to the printer you own, and cost every print. It
works with your existing slicer; it doesn’t replace it.*

**Platforms:** macOS, Windows, Linux (Electron desktop app).
**Price:** Free during the public beta.
**Privacy:** Local-first. Works fully offline. No telemetry. Optional end-to-end-encrypted cloud sync.
**Status:** Public beta — actively gathering feedback.

---

## 1. 3MF Converter — retarget any model to your printer

**Blurb:** *Got a multicolour `.3mf` made for a printer you don’t own? Bed Ready rewrites it for your
printer — keeping the geometry and colours — so it opens cleanly in your slicer.*

Details:
- Converts/retargets a `.3mf` to a different printer: rewrites printer model, bed size, nozzle, and
  print settings while preserving the mesh, colours, and multi-plate layout.
- **Targets almost any printer.** Beyond a built-in shortlist, the target list includes **every printer
  in your installed OrcaSlicer / Snapmaker Orca profile library** (1,000+ models, grouped by vendor).
  Choosing one builds the file from that printer’s own machine profile + a matching print-quality preset.
- **Native output.** The converted file carries the target printer’s real start/end/tool-change G-code
  and print settings, so the slicer recognises it as that printer instead of flagging “customised”.
- **Correct plate layout.** Multi-plate files are re-tiled onto the target bed so plates stay centred
  (a model arranged for a 256 mm bed lays out correctly on a 270 mm bed, etc.).
- **Normalize mode.** Strip vendor lock-in and save a clean generic `.3mf` any slicer opens.
- **Batch convert** many files to one target in a single run.
- **Saved presets** for target + colour mapping you reuse often.
- Always verify the result in your own slicer before printing (shown in-app).

## 2. Full Spectrum — colour mixing on a 4-slot printer

**Blurb:** *Five colours, four slots? Full Spectrum keeps four filaments physical and reproduces the
rest by mixing — no colour left behind.*

Details:
- On a **Snapmaker U1** (4 slots), converting a file with more colours than slots offers **Full
  Spectrum**: keep four filaments physical, reproduce the extras as dithered mixes of those four.
- Shows exactly **which four filaments to load** and the **recipe for each extra colour**
  (e.g. “65% White + 35% Red”), with a **ΔE** perceptual-accuracy score per mix.
- Chooses which colours stay physical intelligently — a colour no mix can fake (a pure primary, white)
  stays a real filament; only genuinely mixable colours are virtualised.
- Writes the proper Snapmaker Orca mixed-filament definitions so the printer prints the mixes.

## 3. Interactive 3D preview

**Blurb:** *See your model before you slice it — orbit, zoom, flip between plates, and preview colour
changes live.*

Details:
- Real-time WebGL 3D preview for `.3mf` and `.stl` — drag to orbit, scroll to zoom, preset views.
- **Multi-plate** files get a plate picker.
- **Live recolour** — change a colour swatch and see it on the model instantly.
- Handles detailed multi-million-triangle models.
- Correctly decodes painted/multicolour 3MF colour data.

## 4. Slicer integration

**Blurb:** *Bed Ready finds the slicers you already have and hands off to them — it never bundles or
replaces your slicer.*

Details:
- **Auto-detect installed slicers** (Settings → Slicer integration): OrcaSlicer, Snapmaker Orca,
  PrusaSlicer, Bambu Studio, UltiMaker Cura, SuperSlicer, Creality Print, ideaMaker, Simplify3D,
  Lychee, CHITUBOX, FlashPrint, and more — plus vendor OrcaSlicer forks.
- Add slicers manually and pick a default.
- The converter reads printer/filament/print **profiles from your installed slicer** — nothing is
  downloaded; install/update the slicer and new printers/filaments appear.
- On a Snapmaker U1 you can choose the **exact filament in each slot** from your Orca library and the
  **print-quality preset**, written into the converted file.

## 5. Print-file library

**Blurb:** *A tidy home for every model — with notes, tags, the profile you slice it with, and its
converted versions.*

Details:
- Organise `.3mf`/`.stl` files with names, tags, material, notes, favourites.
- Attach the slicer profile you use and keep converted variants alongside the original.
- Fast search and previews.

## 6. Inventory & costing (Pro tools)

**Blurb:** *Know what a print costs and what’s on your shelf.*

Details:
- Track filament spools (material, colour, remaining weight).
- Per-print cost estimate (material + time + machine).
- Colour-matching: the converter can hint the nearest filament you have in stock for each slot.
- A lightweight print queue to see what’s next.

## 7. Simple / Pro modes

**Blurb:** *Start simple; grow into the full toolset when you want it.*

Details:
- **Simple** shows just the essentials; **Pro** adds inventory, costing, and the queue.
- Switching modes only changes what’s on screen — no data is lost.

## 8. Your data, backups & privacy

**Blurb:** *Your files, your computer. Offline by default, with easy backups.*

Details:
- **Local-first**: works fully offline; nothing is uploaded by default; **no analytics/telemetry**.
- **Backups & restore points**: export a full backup, set restore points before big changes.
- **Optional cloud sync**: opt-in, **end-to-end encrypted** — only you hold the key; no account needed
  to use the app.
- 8 UI languages (English, Arabic, German, Spanish, French, Japanese, Turkish, Chinese).

---

## Website checklist / notes

- Badge the product as **Public Beta**. Set expectations: rough edges, keep backups, feedback welcome.
- Include the safety line: *Always review a converted file in your own slicer before printing.*
- Trademarks: Snapmaker, Bambu Lab, Prusa, Creality, UltiMaker, etc. are trademarks of their owners;
  Bed Ready is **not affiliated with or endorsed by** them. Product names are used for compatibility
  reference only.
- Licensing: source-available under **FSL-1.1-Apache-2.0**. See `CREDITS.md` for third-party notices.
- Contact / feedback: the in-app **Feedback** button opens **bedready.io** (the site should host a feedback/contact route). Bed Ready does **not** route users to Khayt's support inbox.
- Do **not** claim Bed Ready slices or prints — it complements a slicer, it doesn’t replace one.
