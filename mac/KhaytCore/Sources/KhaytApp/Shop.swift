import Foundation
import Observation
import KhaytCore

/// Everything on screen comes from here: one store, opened once, read only.
@MainActor @Observable
final class Shop {

    /// Where the book being shown comes from. Named on screen at all times —
    /// looking at the sample and thinking it is the shop's real position is the
    /// one mistake this app must not let anyone make.
    enum Source: Hashable, Identifiable {
        case sample
        case store(StoreReader.Build)

        var id: String {
            switch self {
            case .sample: "sample"
            case .store(let b): b.rawValue
            }
        }
        var title: String {
            switch self {
            case .sample: "Sample shop"
            case .store(.development): "This Mac — development"
            case .store(.shipped): "This Mac — Khayt"
            }
        }
        var symbol: String {
            switch self {
            case .sample: "theatermasks"
            case .store: "internaldrive"
            }
        }
        var isReal: Bool { if case .store = self { true } else { false } }
        var build: StoreReader.Build? { if case .store(let b) = self { b } else { nil } }
    }

    private(set) var source: Source
    private(set) var orders: [Order] = []
    private(set) var files: [LibraryFile] = []
    private(set) var machines: [Machine] = []
    private(set) var spools: [Spool] = []
    /// Wear per machine, keyed by id. `nozzleWear` answers for one machine at
    /// a time, so this is one call each — a handful of printers, not a table.
    private(set) var wear: [String: NozzleWear] = [:]
    /// Where this shop's models live. Resolved once per book, because it reads
    /// settings and probes the disk, and every cell asks about it.
    private(set) var libraryRoots: LibraryLocation.Roots?
    /// Who has this book open, when that is somebody else. Nil when nothing
    /// claims it — which is the ordinary case, and says nothing on screen.
    private(set) var owner: String?
    /// The dashboard, from the shared modules. Nil until the book has loaded,
    /// or when the engine could not start — the screen says so rather than
    /// showing zeros, which would be a statement about the shop.
    private(set) var facts: DashboardFacts?
    /// The period's figures, from the shared modules. Nil when the engine could
    /// not start; the screen then shows nothing rather than zeros.
    private(set) var kpis: Kpis?
    /// Which period those figures cover. `month` is what the Electron app's
    /// executive summary opens on.
    var kpiRange = "month" {
        didSet { Task { await recomputeKpis() } }
    }
    var attention: DashboardFacts.Attention? { facts?.attn }
    /// The ownership record this app holds, when the book was free to take.
    /// Nil means read-only: somebody else has it, or this is the sample.
    private(set) var ownership: StoreLock.Record?
    /// What this shop calls things. Loaded with the book, because the language
    /// is a property of the shop rather than of the Mac.
    let words = Words()
    private var heartbeat: Task<Void, Never>?

    /// May this app change anything? False for the sample, and false whenever
    /// the Electron app has the book.
    var canWrite: Bool { ownership != nil }
    /// The last refusal, for the screen to say out loud. A write that fails
    /// silently is worse than one that never ran.
    var writeProblem: String?
    private(set) var shopName = "Khayt"
    private(set) var currency = "SAR"
    private(set) var skipped: [String] = []
    private(set) var problem: String?
    private(set) var taxSummary: String?
    private(set) var settingsValue: JSONValue = .object([:])

    var selection: Order.ID?
    var fileSelection: Set<LibraryFile.ID> = []
    var customerSelection: Customer.ID?
    var shelf: Shelf = .dashboard
    /// Opens the way Khayt opens. See `LibrarySort`.
    var librarySort: LibrarySort = .khayt
    var search = ""

    /// Which shelf of the book is open. One selection rather than two, because
    /// "a stage is chosen" and "the library is showing" are not independent —
    /// holding them separately is how a screen ends up filtering jobs by a stage
    /// nobody can see.
    enum Shelf: Hashable {
        /// nil is every job.
        case jobs(Stage?)
        /// nil is every model; a string is one group.
        case library(String?)
        case customers
        case dashboard
        case machines
        case inventory
        case board
    }

    var stage: Stage? { if case .jobs(let s) = shelf { s } else { nil } }
    var showingLibrary: Bool { if case .library = shelf { true } else { false } }
    var showingCustomers: Bool { shelf == .customers }
    var showingDashboard: Bool { shelf == .dashboard }
    var showingMachines: Bool { shelf == .machines }
    var showingInventory: Bool { shelf == .inventory }
    var showingBoard: Bool { shelf == .board }

    /// The open jobs, grouped by the stage they are in.
    ///
    /// Computed once per read rather than filtered per column: four passes over
    /// the book to draw four columns is three too many, and the board is the
    /// screen most likely to be left open all day.
    var board: [Stage: [Order]] {
        var out: [Stage: [Order]] = [:]
        // The search box is one box for the whole window. A board that ignored
        // it left somebody typing a customer's name into a field that visibly
        // did nothing.
        for order in matching(orders) {
            guard let stage = Stage.of(order) else { continue }
            out[stage, default: []].append(order)
        }
        for (stage, jobs) in out {
            // Urgent first, then by due date, then by what has been waiting
            // longest — the order someone would work through them in.
            out[stage] = jobs.sorted { a, b in
                if a.priority != b.priority { return a.priority }
                let da = Order.day(a.dueDate), db = Order.day(b.dueDate)
                if let da, let db, da != db { return da < db }
                if (da == nil) != (db == nil) { return da != nil }
                return (a.day ?? .distantPast) < (b.day ?? .distantPast)
            }
        }
        return out
    }

    /// The jobs that match what is typed in the search box, or all of them.
    ///
    /// Project, customer and job number — the three things somebody standing at
    /// the bench actually has to hand.
    func matching(_ rows: [Order]) -> [Order] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return rows }
        return rows.filter {
            $0.project.lowercased().contains(q) || $0.client.lowercased().contains(q)
                || $0.id.lowercased().contains(q)
        }
    }

    /// Jobs the board has no column for.
    ///
    /// A `split` parent, or a status a later version of Khayt introduces. They
    /// are counted rather than dropped: the board's job is to show where the
    /// work is, and quietly leaving some of it out is the one thing it must not
    /// do.
    var unplaced: [Order] { matching(orders).filter { Stage.of($0) == nil } }

    /// The sources that can actually be opened on this Mac. A menu offering a
    /// store that is not there is a dead end dressed up as a choice.
    static var available: [Source] {
        // Most recently written first. Guessing between "khayt" and "Khayt" by
        // name means guessing whether this Mac belongs to a developer or a
        // shop; the file dates already know.
        let stores = StoreReader.Build.allCases
            .filter(\.exists)
            .sorted { ($0.lastWritten ?? .distantPast) > ($1.lastWritten ?? .distantPast) }
            .map(Source.store)
        return [.sample] + stores
    }

    /// The shared business logic, started once. Building a JSContext and
    /// loading eight modules takes a few milliseconds — trivial once, wasteful
    /// per row, and this is the object rows ask about money.
    private var engine: KhaytEngine?

    init(source: Source = .sample) {
        self.source = source
    }

    func load(_ next: Source) async {
        source = next
        problem = nil
        skipped = []
        do {
            let root: [String: JSONValue]
            switch next {
            case .sample:
                guard let url = Bundle.module.url(forResource: "sample-shop", withExtension: "json"),
                      let data = try? Data(contentsOf: url) else {
                    throw Failure.missingSample
                }
                root = try JSONDecoder().decode([String: JSONValue].self, from: data)
            case .store(let build):
                root = try StoreReader(build: build).raw
            }
            let decoded = try Self.decodeOrders(root)
            orders = decoded.items
            skipped = decoded.skipped
            machines = Self.decode(root, "machines", as: Machine.self)
            spools = Self.decode(root, "inventory", as: Spool.self)
            let library = Self.decodeFiles(root)
            files = library.items
            skipped += library.skipped
            libraryRoots = next.build.map { build in
                LibraryLocation.resolveRoots(settings: Self.librarySettings(root),
                                             defaultRoot: LibraryLocation.defaultRoot(for: build))
            }
            fileSelection = []
            // Read, never taken. This app does not write, and a reader that
            // claimed ownership would lock a shop out of its own app for
            // nothing. When writing arrives, this is the check that gates it.
            owner = next.build.flatMap { StoreLock.describe(StoreLock.verdict(for: $0)) }
            takeOwnership(of: next.build)
            if case .object(let settings)? = root["settings"] {
                if case .string(let n)? = settings["shopName"], !n.isEmpty { shopName = n }
                else { shopName = next.title }
                if case .string(let c)? = settings["currency"] { currency = c }
            }
            if engine == nil { engine = try? KhaytEngine() }
            // `settings.lang` and not the system language: a Riyadh shop on an
            // English Mac still keeps its book in Arabic, and the book is what
            // this window shows. (The Electron app keeps the live choice in
            // localStorage, which nothing outside it can read — settings.lang is
            // the copy that travels with the store.)
            var wanted: String?
            if case .object(let settings)? = root["settings"], case .string(let l)? = settings["lang"] {
                wanted = l
            }
            // KHAYT_LANG forces a language for one run. There is no other way to
            // photograph the Arabic layout from a shop whose book is in English,
            // and a right-to-left screen that nobody has looked at is a
            // right-to-left screen that is wrong.
            if let forced = ProcessInfo.processInfo.environment["KHAYT_LANG"] { wanted = forced }
            await words.load(wanted, engine: engine)
            settingsValue = root["settings"] ?? .object([:])
            if case .array(let shelf)? = root["inventory"] { inventoryRows = shelf } else { inventoryRows = [] }
            taxSummary = await describeTax(root["settings"])
            await computeDashboard(root)
        } catch {
            orders = []
            files = []
            machines = []
            spools = []
            wear = [:]
            libraryRoots = nil
            owner = nil
            facts = nil
            problem = String(describing: error)
        }
    }

    /// One call per load, not one per tile. Building the arguments means
    /// crossing the bridge with every order, which is cheap once and absurd
    /// four times over for four figures on one screen.
    private func computeDashboard(_ root: [String: JSONValue]) async {
        guard let engine else { facts = nil; return }
        let orders: [JSONValue]
        if case .array(let rows)? = root["printLog"] { orders = rows } else { orders = [] }
        let machines: [JSONValue]
        if case .array(let rows)? = root["machines"] { machines = rows } else { machines = [] }
        let clients: [JSONValue]
        if case .array(let rows)? = root["clients"] { clients = rows } else { clients = [] }
        var settings: [String: JSONValue] = [:]
        if case .object(let dict)? = root["settings"] { settings = dict }
        facts = try? await engine.dashboardFacts(orders: orders, machines: machines, settings: settings)
        var perMachine: [String: NozzleWear] = [:]
        for machine in machines {
            guard case .object(let record) = machine,
                  case .string(let id)? = record["id"] else { continue }
            if let w = try? await engine.nozzleWear(orders: orders, machine: machine, settings: settings) {
                perMachine[id] = w
            }
        }
        wear = perMachine
        kpiOrders = orders
        kpiClients = clients
        kpiSettings = settings
        await recomputeKpis()

    }

    private var kpiOrders: [JSONValue] = []
    private var kpiClients: [JSONValue] = []
    private var kpiSettings: [String: JSONValue] = [:]

    /// One call for the whole period. Changing the range does not re-read the
    /// book — the orders are already here; only the arithmetic changes.
    private func recomputeKpis() async {
        guard let engine, !kpiOrders.isEmpty else { kpis = nil; return }
        kpis = try? await engine.kpis(orders: kpiOrders, clients: kpiClients,
                                      settings: kpiSettings, range: kpiRange)
    }

    enum Failure: Error { case missingSample }

    /// Claim the book if nothing else has it.
    ///
    /// Symmetrical with Electron's own claim, and deliberately weaker: Electron
    /// takes ownership whatever it finds, because refusing to open a shop's own
    /// app is worse than the collision. This app defers — it is the newcomer,
    /// and it has somewhere to fall back to, which is reading.
    private func takeOwnership(of build: StoreReader.Build?) {
        heartbeat?.cancel()
        heartbeat = nil
        StoreLock.release(ownership, for: previousBuild)
        ownership = nil
        previousBuild = build
        guard let build else { return }
        guard let record = StoreLock.take(for: build) else { return }
        ownership = record
        heartbeat = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled, let self, let held = self.ownership else { return }
                self.ownership = StoreLock.beat(held, for: build)
            }
        }
    }

    private var previousBuild: StoreReader.Build?

    /// Hand the book back on the way out. A crash skips this and leaves a record
    /// whose pid is dead, which the next reader resolves on its own.
    func relinquish() {
        heartbeat?.cancel()
        heartbeat = nil
        StoreLock.release(ownership, for: previousBuild)
        ownership = nil
    }

    // MARK: - Changing something

    // MARK: - What the menus ask for

    /// The menu bar acts on the selection, not on a row it was handed. These
    /// are the same actions the context menu and the inspector use, named once
    /// so the two can never drift into meaning different things.
    func reload() { Task { await load(source) } }
    func open(_ next: Source) { Task { await load(next) } }

    var canEditSelection: Bool { canWrite && !fileSelection.isEmpty }

    var selectionIsOnThisMac: Bool {
        guard let one = selectedFile else { return false }
        return modelFile(for: one) != nil
    }

    func toggleFavouriteOnSelection() {
        guard let one = selectedFile else { return }
        toggleFavourite(one)
    }

    func revealSelection() {
        guard let one = selectedFile, let url = modelFile(for: one) else { return }
        FileActions.reveal(url)
    }

    func openSelection() {
        guard let one = selectedFile, let url = modelFile(for: one) else { return }
        FileActions.open(url)
    }

    /// Mark a model a favourite, or stop. The first thing this app ever wrote.
    func toggleFavourite(_ file: LibraryFile) {
        let wanted = !file.isFavourite
        editFiles([file.id], named: wanted ? "Add to Favourites" : "Remove from Favourites") { record in
            record["favorite"] = .bool(wanted)
        }
    }

    /// File every selected model under one name, or clear it.
    ///
    /// One write for the whole selection, not one per model. Seven kings filed
    /// one at a time is seven read-modify-writes, seven `.prev` generations, and
    /// six windows in which a crash leaves the collection half made.
    func fileSelection(under name: String) async {
        guard !fileSelection.isEmpty else { return }
        let ids = fileSelection
        // Through the engine, so a name matching one the shop already uses
        // adopts that spelling rather than becoming a second chip holding part
        // of the same collection.
        guard let engine, let patch = try? await engine.fileUnderGroup(name, known: groups) else {
            writeProblem = "Could not work out which group that is."
            return
        }
        let named = name.isEmpty ? "Remove from Group" : "File in \(name)"
        editFiles(ids, named: named) { record in
            for (key, value) in patch { record[key] = value }
        }
    }

    /// The Mac's undo stack, handed over by the window.
    ///
    /// Weak: it belongs to the window, and a Shop outliving one must not keep
    /// it alive. Nil is a supported state — the environment says so when a
    /// context has no undo — and every registration below is guarded.
    weak var undoManager: UndoManager?

    /// Change some print files, and be able to put them back.
    ///
    /// The Edit menu has always shown Undo and Redo; until now they did
    /// nothing, which is worse than their being absent — a menu item that is
    /// enabled and inert teaches people not to trust the menu.
    ///
    /// What is captured is the WHOLE record as it was, not the fields about to
    /// change. An undo then restores everything, including a field some later
    /// version of this method starts touching and forgets to snapshot.
    ///
    /// What is NOT restored is `rev`. An undo is an edit like any other: it
    /// stamps a new revision, because a record that went backwards would look
    /// to the next sync like the change never happened and the other machine's
    /// copy would win.
    private func editFiles(_ ids: Set<LibraryFile.ID>, named actionName: String,
                           change: @escaping (inout [String: JSONValue]) -> Void) {
        guard let build = source.build, !ids.isEmpty else { return }
        var before: [String: [String: JSONValue]] = [:]
        do {
            try StoreWriter.update(build) { root in
                guard case .array(var rows)? = root["printFiles"] else { return }
                for i in rows.indices {
                    guard case .object(var record) = rows[i],
                          case .string(let id)? = record["id"], ids.contains(id) else { continue }
                    before[id] = record
                    change(&record)
                    StoreWriter.stamp(&record)
                    rows[i] = .object(record)
                }
                root["printFiles"] = .array(rows)
            }
            writeProblem = nil
            registerUndo(of: before, named: actionName)
            Task { await load(source) }
        } catch {
            writeProblem = String(describing: error)
        }
    }

    /// Put those records back exactly as they were, and make THAT undoable too.
    private func registerUndo(of before: [String: [String: JSONValue]], named actionName: String) {
        guard let undoManager, !before.isEmpty else { return }
        undoManager.setActionName(actionName)
        undoManager.registerUndo(withTarget: self) { shop in
            shop.restore(before, named: actionName)
        }
    }

    private func restore(_ snapshot: [String: [String: JSONValue]], named actionName: String) {
        guard let build = source.build else { return }
        var before: [String: [String: JSONValue]] = [:]
        do {
            try StoreWriter.update(build) { root in
                guard case .array(var rows)? = root["printFiles"] else { return }
                for i in rows.indices {
                    guard case .object(let current) = rows[i],
                          case .string(let id)? = current["id"],
                          let wanted = snapshot[id] else { continue }
                    before[id] = current
                    rows[i] = .object(StoreWriter.restoring(wanted, over: current))
                }
                root["printFiles"] = .array(rows)
            }
            writeProblem = nil
            registerUndo(of: before, named: actionName)
            Task { await load(source) }
        } catch {
            // An undo that cannot be applied — the book changed hands while the
            // menu was open — must say so rather than fail quietly.
            writeProblem = String(describing: error)
        }
    }


    // MARK: - Moving a job

    /// The job waiting for someone to say why it is being held.
    ///
    /// A hold is the one move that asks a question first. The answer is
    /// optional — a shop that just needs the job out of the way should not have
    /// to invent a reason — but the question is worth asking, because "waiting
    /// on filament" three weeks later is the difference between a record and a
    /// gap.
    var pendingHold: PendingHold?

    /// The job waiting for someone to say what went wrong.
    var pendingQcFail: PendingHold?

    /// The failure categories, from `lib/qc-failure.js`. A category not on this
    /// list reaches the waste screen as a value it cannot name.
    static let failureTypes = ["bed_adhesion", "nozzle_jam", "warping", "stringing",
                               "operator_error", "design_issue", "power_failure",
                               "material_quality", "other"]

    /// Record a QC failure and send the job back to be printed again.
    ///
    /// THREE RECORDS, ONE SWAP: the fields on the order that the metrics count,
    /// the defect the analytics table is built from, and the waste row. A book
    /// where the job says it failed and the waste log has never heard of it is
    /// a shop whose scrap costs are quietly understated.
    func recordQcFailure(_ id: Order.ID, failureType: String, reason: String,
                         weight: Double) async {
        moveProblem = nil
        moveNotices = []
        guard let build = source.build else {
            moveProblem = words.callIt("mac.move_sample"); return
        }
        guard let engine else {
            moveProblem = words.callIt("mac.move_no_engine"); return
        }

        var undo: [ChangedRecord] = []
        do {
            try await StoreWriter.update(
                storeURL: build.storeURL,
                owns: { StoreLock.weOwnIt(build) },
                whoHasIt: { StoreLock.describe(StoreLock.verdict(for: build)) }
            ) { root in
                let orders = Self.rows(root, "printLog")
                guard let target = orders.first(where: { Self.recordId($0) == id }) else {
                    throw MoveRefused(sentence: self.words.callIt("mac.move_gone"))
                }
                let out = try await engine.recordQcFailure(
                    order: target, failureType: failureType, severity: "major",
                    reason: reason, weight: weight, inspector: nil,
                    inventory: Self.rows(root, "inventory"), now: Date(),
                    wasteId: Self.uid("WASTE"),
                    defaultReason: self.words.callIt("ord.qc_fail"))

                Self.write(&root, "printLog", changed: [out.order], before: orders, into: &undo)

                // Newest first, the way the waste screen reads it. A new row is
                // not an edit to an existing one, so nothing is stamped.
                var waste = Self.rows(root, "wasteLog")
                waste.insert(out.waste, at: 0)
                root["wasteLog"] = .array(waste)
            }
            registerMoveUndo(undo, named: words.callIt("ord.qc_fail"))
            await load(source)
            // Back to be printed again — the move Khayt and Bed Ready both make
            // after a failure, and it carries its own gate and effects.
            await moveJob(id, to: .pending)
        } catch let refusal as MoveRefused {
            moveProblem = refusal.sentence
        } catch {
            moveProblem = String(describing: error)
        }
    }

    /// The job waiting for someone to say it passed inspection.
    ///
    /// A job leaving QC for completed is an INSPECTION, and `qcStatusOf` reads
    /// the record off the order. A completion that skipped it is not counted as
    /// failed — it is not counted at all, so the shop's pass rate would be
    /// quietly computed over a shrinking subset of its work.
    var pendingQC: PendingHold?

    struct PendingHold: Identifiable, Sendable {
        let id: Order.ID
        let project: String
    }

    // MARK: - Taking a job

    /// True while the new-job sheet is up.
    var takingAJob = false

    /// The job this app just created, so the table can select it.
    private(set) var lastCreated: Order.ID?

    /// The margin this shop quotes at, or thirty per cent.
    ///
    /// Its own number, not a Swift opinion about what a print shop charges —
    /// and the same default the Electron calculator opens on.
    var defaultMargin: Double {
        if case .object(let s) = settingsValue, case .number(let m)? = s["defaultMargin"] { return m }
        return 30
    }

    /// What one part costs to make, through the shared cost model.
    ///
    /// The spool supplies the material and what it cost — the shelf already
    /// knows, and asking a shop to retype it is asking twice. Everything the
    /// screen does not ask for (wear, power, labour, the failure allowance) is
    /// the shop's own default, so a job taken here is costed exactly as the same
    /// job typed into Electron.
    func costOfPart(spoolId: String?, grams: Double, hours: Double, qty: Int) async -> Double {
        guard let engine else { return 0 }
        var part: [String: JSONValue] = [
            "printWeight": .number(max(0, grams)),
            "printTime": .number(max(0, hours)),
            "qty": .number(Double(max(1, qty))),
        ]
        if let spoolId, let spool = spools.first(where: { $0.id == spoolId }) {
            part["filamentId"] = .string(spool.id)
            part["material"] = .string(spool.material)
            part["spoolCost"] = .number(spool.cost ?? 0)
            // At least one gram: the cost model divides by this.
            part["spoolWeight"] = .number(max(1, spool.weight ?? 1000))
        }
        for (key, setting) in ["wearRate": "defaultWearRate", "powerDraw": "defaultPowerDraw",
                               "elecRate": "defaultElecRate", "laborRate": "defaultLaborRate",
                               "failureRate": "defaultFailureRate"] {
            if case .object(let all) = settingsValue, case .number(let v)? = all[setting] {
                part[key] = .number(v)
            }
        }
        return (try? await engine.partCost(.object(part), inventory: inventoryRows,
                                           settings: settingsDict)) ?? 0
    }

    /// What the cart comes to, before anything is written.
    ///
    /// The same `quoteTotal` the record will use, so the figure on the screen is
    /// the figure in the book.
    func previewQuote(baseCost: Double, margin: Double, discountPct: Double,
                      shippingCost: Double, rush: Bool) async -> QuoteTotal? {
        guard let engine else { return nil }
        var input: [String: JSONValue] = [
            "baseCost": .number(baseCost), "qty": .number(1),
            "margin": .number(margin), "discountPct": .number(discountPct),
            "shippingCost": .number(shippingCost),
            "rushEnabled": .bool(rush), "business": .bool(true),
        ]
        // The shop's own rush percentage, or Khayt's default of twenty-five.
        if rush {
            var pct = 25.0
            if case .object(let all) = settingsValue, case .number(let own)? = all["rushFeePct"] { pct = own }
            input["rushPct"] = .number(pct)
        }
        return try? await engine.quoteTotal(input)
    }

    /// The cart and the money, in the shape `lib/order-new.js` takes.
    func newJobInput(parts: [NewJobSheet.Draft], project: String, clientId: String?,
                     margin: Double, discountPct: Double, shippingCost: Double,
                     deposit: Double, rush: Bool, asQuote: Bool) -> [String: JSONValue] {
        var rows: [JSONValue] = []
        for p in parts {
            var row: [String: JSONValue] = [
                "name": .string(p.name.isEmpty ? words.callIt("mac.a_part") : p.name),
                "printWeight": .number(Double(p.grams) ?? 0),
                "printTime": .number(Double(p.hours) ?? 0),
                "qty": .number(Double(max(1, p.qty))),
                // What the shared cost model said, frozen: a job priced today
                // must not re-cost itself at next year's filament prices.
                "unitCost": .number(p.cost),
                "baseCost": .number(p.cost * Double(max(1, p.qty))),
            ]
            if let spoolId = p.spoolId, let spool = spools.first(where: { $0.id == spoolId }) {
                row["filamentId"] = .string(spool.id)
                row["material"] = .string(spool.material)
                row["spoolCost"] = .number(spool.cost ?? 0)
                row["spoolWeight"] = .number(max(1, spool.weight ?? 1000))
            }
            rows.append(.object(row))
        }
        var input: [String: JSONValue] = [
            "parts": .array(rows),
            "project": .string(project),
            "margin": .number(margin),
            "discountPct": .number(discountPct),
            "shippingCost": .number(shippingCost),
            "depositAmount": .number(deposit),
            "rushEnabled": .bool(rush),
            "asQuote": .bool(asQuote),
        ]
        if let clientId { input["clientId"] = .string(clientId) }
        return input
    }

    /// The shelf and the settings, as the shared modules take them.
    ///
    /// The RAW rows, not this app's decoded `Spool` re-encoded: the cost model
    /// reads `materialType` to tell resin from filament, and `Spool` does not
    /// carry it. Re-encoding would silently cost every resin part as if it were
    /// filament.
    private(set) var inventoryRows: [JSONValue] = []

    var settingsDict: [String: JSONValue] {
        if case .object(let s) = settingsValue { return s }
        return [:]
    }

    /// Take a new job, or quote for one.
    ///
    /// THE ORDER AND THE SETTINGS ARE WRITTEN TOGETHER. Creating a job consumes
    /// an invoice number from a counter the shop owns; saving the order without
    /// the counter hands the same number to the next job, and saving the counter
    /// without the order burns one for nothing. One swap, both records.
    func createJob(_ input: [String: JSONValue]) async {
        moveProblem = nil
        moveNotices = []
        guard let build = source.build else {
            moveProblem = words.callIt("mac.move_sample"); return
        }
        guard let engine else {
            moveProblem = words.callIt("mac.move_no_engine"); return
        }

        var created: String?
        do {
            try await StoreWriter.update(
                storeURL: build.storeURL,
                owns: { StoreLock.weOwnIt(build) },
                whoHasIt: { StoreLock.describe(StoreLock.verdict(for: build)) }
            ) { root in
                let orders = Self.rows(root, "printLog")
                let out = try await engine.newOrder(
                    input, orders: orders, settings: Self.settings(root), now: Date(),
                    tokens: (tracking: Self.randomBytes(16), quoteApproval: Self.randomBytes(16)))

                guard case .object(let record) = out.order,
                      case .string(let id)? = record["id"] else {
                    throw MoveRefused(sentence: self.words.callIt("mac.move_refused"))
                }
                // Newest first, the way every screen reads the book.
                root["printLog"] = .array([out.order] + orders)
                root["settings"] = .object(out.settings)
                Self.appendActivity(&root,
                                    text: "\(id)" + (record["project"].flatMap(Self.plainString).map { $0.isEmpty ? "" : " · \($0)" } ?? ""),
                                    ref: id, settings: out.settings, root: root,
                                    action: Self.plainString(record["status"]) == "quote"
                                            ? "quote_created" : "order_created")
                created = id
            }
            lastCreated = created
            await load(source)
            // Put the person on the job they just took.
            if let created {
                selection = created
                shelf = .jobs(nil)
            }
        } catch let refusal as MoveRefused {
            moveProblem = refusal.sentence
        } catch {
            moveProblem = String(describing: error)
        }
    }

    static func plainString(_ value: JSONValue?) -> String? {
        if case .string(let s)? = value { return s }
        return nil
    }

    /// Bytes for the tokens the shared rule cannot mint itself.
    static func randomBytes(_ n: Int) -> [UInt8] {
        (0..<n).map { _ in UInt8.random(in: 0...255) }
    }

    // MARK: - Money received

    /// The job waiting for someone to say what was paid.
    var pendingPayment: PendingHold?

    /// The payment methods Khayt offers, in its own order.
    ///
    /// Not a Swift opinion about how a Saudi shop is paid: the list is
    /// `renderer/order-flows.js`'s, and the words are Khayt's own
    /// (`pay.method.*`), so the two apps offer one set of choices.
    static let paymentMethods = ["cash", "mada", "transfer", "stcpay", "applepay", "visa", "other"]

    /// Record what a customer has paid.
    ///
    /// One record changes, not three — but through the same door as a move, so
    /// the ownership check, the atomic swap and the undo are the ones already
    /// proven rather than a second set written for money.
    func recordPayment(_ id: Order.ID, amount: Double, method: String, paidAt: Date) async {
        await writeToOneOrder(id, named: words.callIt("pay.modal_title")) { order, engine, root in
            let reaches = (try? await engine.paymentOutbound(
                order: order, settings: Self.settings(root), clients: Self.rows(root, "clients"))) ?? []
            if !reaches.isEmpty { throw MoveRefused(sentence: self.words.outboundRefusal(reaches)) }

            // A payment is not a status change and Khayt writes no log line for
            // one, so neither does this.
            return OneOrderEdit(order: try await engine.recordPayment(
                order: order, amount: amount, method: method,
                paidAt: Self.localDay(paidAt), today: Self.localDay()).order)
        }
    }

    /// The job being edited.
    var pendingEdit: PendingHold?

    /// The priority a job is at, however old its record is.
    ///
    /// Read through the shared rule rather than off `order.priority`, because
    /// an older record carries only the boolean and a newer one only the level.
    func priorityOf(_ job: Order?) -> String {
        guard let job else { return "normal" }
        if let level = job.priorityLevel, Self.priorityLevels.contains(level) { return level }
        return job.priority ? "high" : "normal"
    }

    /// The priority levels, in the order a shop escalates.
    static let priorityLevels = ["normal", "high", "urgent"]

    /// Change a job's due date and priority.
    ///
    /// Two fields, not thirty: the ones a shop floor actually adjusts. Every
    /// other field the order editor writes is left exactly as it was, which the
    /// shared rule guarantees rather than this app promising it.
    func editJob(_ id: Order.ID, dueDate: Date?, priorityLevel: String) async {
        await writeToOneOrder(id, named: words.callIt("mac.edit_job")) { order, engine, _ in
            let out = try await engine.editJob(
                order: order,
                dueDate: dueDate.map(Self.localDay),
                priorityLevel: priorityLevel,
                now: Date(), editId: Self.uid("edit"))
            // Nothing moved: return the order untouched so the write path finds
            // no change, stamps nothing and syncs nothing.
            return OneOrderEdit(order: out.order)
        }
    }

    /// Hand a finished job over.
    ///
    /// Not a status change: a delivered job stays `completed` and carries a
    /// `deliveredAt`. Setting a status here would take it out of the very
    /// column the action feeds — see `KhaytOrderStatus.stageOf`.
    func markDelivered(_ id: Order.ID) async {
        await writeToOneOrder(id, named: words.callIt("queue.delivered")) { order, engine, _ in
            let out = try await engine.markDelivered(order: order, now: Date())
            guard out.ok, let changed = out.order else {
                throw MoveRefused(sentence: self.words.callIt("mac.not_finished_yet"))
            }
            // The same line Khayt and Bed Ready write.
            return OneOrderEdit(order: changed, activity: "\(id) → delivered")
        }
    }

    /// Undo a payment: the money was never received, or was recorded against
    /// the wrong job. Nothing leaves the shop, so nothing is refused.
    func clearPayment(_ id: Order.ID) async {
        await writeToOneOrder(id, named: words.callIt("mac.clear_payment")) { order, engine, _ in
            OneOrderEdit(order: try await engine.clearPayment(order: order).order)
        }
    }

    /// The shape both money edits share: one order, changed by the shared rules,
    /// written and stamped inside the same swap every other edit uses.
    private func writeToOneOrder(_ id: Order.ID, named actionName: String,
                                 change: @escaping (JSONValue, KhaytEngine, [String: JSONValue])
                                 async throws -> OneOrderEdit) async {
        moveProblem = nil
        moveNotices = []
        guard let build = source.build else {
            moveProblem = words.callIt("mac.move_sample"); return
        }
        guard let engine else {
            moveProblem = words.callIt("mac.move_no_engine"); return
        }

        var undo: [ChangedRecord] = []
        do {
            try await StoreWriter.update(
                storeURL: build.storeURL,
                owns: { StoreLock.weOwnIt(build) },
                whoHasIt: { StoreLock.describe(StoreLock.verdict(for: build)) }
            ) { root in
                let orders = Self.rows(root, "printLog")
                guard let target = orders.first(where: { Self.recordId($0) == id }) else {
                    throw MoveRefused(sentence: self.words.callIt("mac.move_gone"))
                }
                let edit = try await change(target, engine, root)
                Self.write(&root, "printLog", changed: [edit.order], before: orders, into: &undo)
                // The shared rules ask for this and it is the app's to write. A
                // handover that reached the book but not the log would be the
                // one status change a shop most often has to explain later,
                // recorded nowhere.
                if let text = edit.activity {
                    Self.appendActivity(&root, text: text, ref: id,
                                        settings: Self.settings(root), root: root)
                }
            }
            registerMoveUndo(undo, named: actionName)
            await load(source)
        } catch let refusal as MoveRefused {
            moveProblem = refusal.sentence
        } catch {
            moveProblem = String(describing: error)
        }
    }

    /// One order after a rule changed it, and the line it asked for in the log.
    struct OneOrderEdit {
        let order: JSONValue
        var activity: String? = nil
    }

    static func settings(_ root: [String: JSONValue]) -> [String: JSONValue] {
        if case .object(let s)? = root["settings"] { return s }
        return [:]
    }

    /// The question this move has to ask before it can happen, if any.
    ///
    /// Two moves are not just a change of column. Putting a job on hold starts a
    /// clock somebody will want explained; finishing a job that was IN QC is an
    /// inspection, and the record of it is what the shop's pass rate is computed
    /// from. Every other move is a move.
    func questionFor(_ id: Order.ID, moving to: Stage) -> (() -> Void)? {
        guard let job = orders.first(where: { $0.id == id }) else { return nil }
        let subject = PendingHold(id: id, project: job.project)
        if to == .on_hold { return { self.pendingHold = subject } }
        if to == .completed && Stage.of(job) == .qc { return { self.pendingQC = subject } }
        // A job leaving inspection for anywhere else FAILED it. Sending it back
        // without recording that is how a shop's scrap costs go unrecorded and
        // its pass rate is computed over the jobs that happened to pass.
        if Stage.of(job) == .qc { return { self.pendingQcFail = subject } }
        return nil
    }

    func clearQuestion() {
        pendingHold = nil
        pendingQC = nil
        pendingPayment = nil
        pendingEdit = nil
        pendingQcFail = nil
    }

    /// Whether a job may be moved at all: a real book, held by this app, with
    /// the shared rules running. The sample shop is for looking at.
    var canMoveJobs: Bool { source.isReal && ownership != nil }

    /// What stopped a move, when something did. Cleared by the next attempt.
    var moveProblem: String?
    /// What the last move had to say — the due date it pushed out, the spools
    /// it emptied, the ones that are now low.
    var moveNotices: [String] = []

    /// Move a job to a stage, and take what it costs off the shelf.
    ///
    /// Three collections change together and are written in one swap: the job,
    /// the spools its filament came off, and the consumables it spent. A book
    /// where the job says "completed" and the spools still hold its filament
    /// has told the shop it has stock it has already used.
    ///
    /// Read `Kanban` for what a person sees; this is what happens.
    func moveJob(_ id: Order.ID, to stage: Stage,
                 holdReason: String? = nil, qcNotes: String? = nil) async {
        moveProblem = nil
        moveNotices = []
        guard let build = source.build else {
            moveProblem = words.callIt("mac.move_sample")
            return
        }
        guard let engine else {
            moveProblem = words.callIt("mac.move_no_engine")
            return
        }

        var undoSnapshot: [ChangedRecord] = []
        var said: [String] = []
        do {
            try await StoreWriter.update(
                storeURL: build.storeURL,
                owns: { StoreLock.weOwnIt(build) },
                whoHasIt: { StoreLock.describe(StoreLock.verdict(for: build)) }
            ) { root in
                (undoSnapshot, said) = try await Self.applyMove(
                    to: &root, id: id, stage: stage, engine: engine, words: self.words,
                    holdReason: holdReason, qcNotes: qcNotes)
            }
            // Only once the swap has happened. The last ownership check is after
            // the mutation, so a book that changed hands mid-move throws here —
            // and a shop told which spools were emptied by a move that was
            // refused would be worse than being told nothing.
            moveNotices = said
            registerMoveUndo(undoSnapshot, named: words.callIt("mac.move_action"))
            await load(source)
        } catch let refusal as MoveRefused {
            moveProblem = refusal.sentence
        } catch {
            moveProblem = String(describing: error)
        }
    }

    /// One record as it was before a move, and where it lives.
    ///
    /// A move changes three collections, so an undo has to put three
    /// collections back — including the spools. Undoing a completion that
    /// emptied a spool without returning the filament would be an undo that
    /// lies about the shelf.
    struct ChangedRecord: Sendable {
        let collection: String
        let id: String
        let was: [String: JSONValue]
    }

    /// A move the rules refused, said in the shop's own words.
    struct MoveRefused: Error { let sentence: String }

    /// The move itself, against the book as it is ON DISK.
    ///
    /// Static and taking `root` because it runs inside the write: everything it
    /// reads — the other jobs the WIP limit counts, the spools it draws from,
    /// the settings that decide whether it deducts at all — must be what is in
    /// the file, not what this app last drew on screen.
    static func applyMove(to root: inout [String: JSONValue],
                                  id: Order.ID, stage: Stage,
                                  engine: KhaytEngine, words: Words,
                                  holdReason: String? = nil, qcNotes: String? = nil)
    async throws -> (undo: [ChangedRecord], notices: [String]) {

        let orders = rows(root, "printLog")
        let inventory = rows(root, "inventory")
        let consumables = rows(root, "consumables")
        let machines = rows(root, "machines")
        let clients = rows(root, "clients")
        var settings: [String: JSONValue] = [:]
        if case .object(let s)? = root["settings"] { settings = s }

        guard let target = orders.first(where: { recordId($0) == id }) else {
            throw MoveRefused(sentence: words.callIt("mac.move_gone"))
        }

        // Asked BEFORE anything is written. A webhook, a Telegram message, an
        // email or a portal refresh cannot be sent from here and cannot be sent
        // afterwards, so a move that would trigger one is refused whole rather
        // than made with a piece missing.
        let reaches = (try? await engine.outbound(order: target, to: stage.rawValue,
                                                  settings: settings, clients: clients)) ?? []
        if !reaches.isEmpty {
            throw MoveRefused(sentence: words.outboundRefusal(reaches))
        }

        let move = try await engine.moveJob(
            order: target, to: stage.rawValue, orders: orders, settings: settings,
            inventory: inventory, consumables: consumables, machines: machines,
            now: Date(), today: localDay(), holdReason: holdReason, qcNotes: qcNotes)

        guard move.ok else {
            throw MoveRefused(sentence: words.gateRefusal(move.gate))
        }
        // An effect nobody classified is a gap, and a gap in a status change is
        // how something goes missing on this Mac and nowhere else. Refuse.
        if let unhandled = move.unhandled, !unhandled.isEmpty {
            throw MoveRefused(sentence: words.callIt("mac.move_unhandled")
                              + " (" + unhandled.joined(separator: ", ") + ")")
        }
        guard var changedOrder = move.order.flatMap(asObject) else {
            throw MoveRefused(sentence: words.callIt("mac.move_gone"))
        }

        // A completion asks for a survey token, and a random source is exactly
        // what a pure module does not have. The FORMAT is shared, so the token
        // this app mints is the token Khayt would have minted.
        if move.performed?.contains("ensure_survey_token") == true, changedOrder["surveyToken"] == nil {
            changedOrder["surveyToken"] = .string(surveyToken())
        }

        var undo: [ChangedRecord] = []
        write(&root, "printLog", changed: [.object(changedOrder)], before: orders, into: &undo)
        write(&root, "inventory", changed: move.inventory ?? [], before: inventory, into: &undo)
        write(&root, "consumables", changed: move.consumables ?? [], before: consumables, into: &undo)

        if let text = move.activity {
            appendActivity(&root, text: text, ref: id, settings: settings, root: root)
        }

        let notices = (move.notices ?? []).map { words.sentence(for: $0) }
        return (undo, notices)
    }

    // MARK: - Reading and writing rows

    static func rows(_ root: [String: JSONValue], _ collection: String) -> [JSONValue] {
        if case .array(let r)? = root[collection] { return r }
        return []
    }

    static func asObject(_ value: JSONValue) -> [String: JSONValue]? {
        if case .object(let o) = value { return o }
        return nil
    }

    static func recordId(_ value: JSONValue) -> String? {
        guard case .object(let o) = value, case .string(let id)? = o["id"] else { return nil }
        return id
    }

    /// Put changed rows back, stamping only the ones that actually changed.
    ///
    /// Stamping a row that did not change would push it to the cloud as an edit
    /// nobody made, and on a shop with two machines that is how the older build
    /// gets to win with a stale copy.
    static func write(_ root: inout [String: JSONValue], _ collection: String,
                              changed: [JSONValue], before: [JSONValue],
                              into undo: inout [ChangedRecord]) {
        guard !changed.isEmpty else { return }
        var byId: [String: JSONValue] = [:]
        for row in changed { if let id = recordId(row) { byId[id] = row } }

        var out = before
        var touched = false
        for i in out.indices {
            guard let id = recordId(out[i]), let next = byId[id], next != out[i] else { continue }
            guard case .object(let was) = out[i], case .object(var now) = next else { continue }
            undo.append(ChangedRecord(collection: collection, id: id, was: was))
            StoreWriter.stamp(&now)
            out[i] = .object(now)
            touched = true
        }
        guard touched else { return }
        root[collection] = .array(out)
    }

    /// The team's activity log — the same collection, shape and cap Khayt uses.
    static func appendActivity(_ root: inout [String: JSONValue], text: String,
                                       ref: String, settings: [String: JSONValue],
                                       root snapshot: [String: JSONValue],
                                       action: String = "status") {
        var log = rows(snapshot, "auditLog")
        var operatorId: JSONValue = .null
        var operatorName = ""
        if case .string(let opId)? = settings["activeOperatorId"] {
            operatorId = .string(opId)
            if let op = rows(snapshot, "operators").first(where: { recordId($0) == opId }),
               case .object(let o) = op, case .string(let name)? = o["name"] {
                operatorName = name
            }
        }
        log.append(.object([
            "id": .string(uid("AL")),
            "at": .string(StoreWriter.iso(Date())),
            "action": .string(action),
            "detail": .string(text),
            "ref": .string(ref),
            "operatorId": operatorId,
            "operatorName": .string(operatorName),
        ]))
        // Khayt keeps two thousand and drops the oldest. A log that grew for
        // ever would be the one collection that could push a book past the size
        // every backup is built to hold.
        if log.count > 2000 { log = Array(log.suffix(2000)) }
        root["auditLog"] = .array(log)
    }

    /// `YYYY-MM-DD` in this Mac's own timezone, the way `localDateStr` in
    /// renderer/util.js writes it. A spool's usage history records the local
    /// DAY a job drew from it, not an instant, so UTC would put a Riyadh
    /// evening on the wrong date.
    static func localDay(_ date: Date = Date()) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// `uid()` from renderer/util.js: prefix, base-36 milliseconds, three random
    /// base-36 characters upper-cased. Matched so an entry written here is
    /// indistinguishable from one Khayt wrote.
    static func uid(_ prefix: String) -> String {
        let ms = Int(Date().timeIntervalSince1970 * 1000)
        let stamp = String(ms, radix: 36)
        let alphabet = Array("0123456789abcdefghijklmnopqrstuvwxyz")
        let tail = String((0..<3).map { _ in alphabet.randomElement()! }).uppercased()
        return "\(prefix)-\(stamp)\(tail)"
    }

    /// `srv-` and twelve random bytes in hex, the format `lib/order-status.js`
    /// defines and both apps read.
    static func surveyToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 12)
        for i in bytes.indices { bytes[i] = UInt8.random(in: 0...255) }
        return "srv-" + bytes.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Undo

    private func registerMoveUndo(_ before: [ChangedRecord], named actionName: String) {
        guard let undoManager, !before.isEmpty else { return }
        undoManager.setActionName(actionName)
        undoManager.registerUndo(withTarget: self) { shop in
            shop.restoreMove(before, named: actionName)
        }
    }

    /// Put every collection back exactly as it was, and make THAT undoable.
    ///
    /// The deductions come back with it: undoing a completion that emptied a
    /// spool has to put the filament back, or the undo is a lie about the shelf.
    private func restoreMove(_ snapshot: [ChangedRecord], named actionName: String) {
        guard let build = source.build else { return }
        var before: [ChangedRecord] = []
        do {
            try StoreWriter.update(build) { root in
                for (collection, wanted) in Dictionary(grouping: snapshot, by: \.collection) {
                    guard case .array(var rows)? = root[collection] else { continue }
                    let byId = Dictionary(wanted.map { ($0.id, $0.was) }, uniquingKeysWith: { a, _ in a })
                    var touched = false
                    for i in rows.indices {
                        guard case .object(let current) = rows[i],
                              case .string(let id)? = current["id"],
                              let was = byId[id] else { continue }
                        before.append(ChangedRecord(collection: collection, id: id, was: current))
                        rows[i] = .object(StoreWriter.restoring(was, over: current))
                        touched = true
                    }
                    if touched { root[collection] = .array(rows) }
                }
            }
            moveProblem = nil
            registerMoveUndo(before, named: actionName)
            Task { await load(source) }
        } catch {
            moveProblem = String(describing: error)
        }
    }

    /// The shared shape of every edit: check we may write, do it, re-read.
    private func write(_ change: (inout [String: JSONValue]) -> Void) {
        guard let build = source.build else { return }
        do {
            try StoreWriter.update(build) { root in change(&root) }
            writeProblem = nil
            // Read the whole book back rather than patching what is on screen.
            // The screen must show what is on disk, not what this app believes
            // it just put there.
            Task { await load(source) }
        } catch {
            writeProblem = String(describing: error)
        }
    }

    /// Change some print-file records in place, stamping each.
    private static func edit(_ root: inout [String: JSONValue], ids: Set<LibraryFile.ID>,
                             change: (inout [String: JSONValue]) -> Void) {
        guard case .array(var rows)? = root["printFiles"] else { return }
        for i in rows.indices {
            guard case .object(var record) = rows[i],
                  case .string(let id)? = record["id"], ids.contains(id) else { continue }
            change(&record)
            StoreWriter.stamp(&record)
            rows[i] = .object(record)
        }
        root["printFiles"] = .array(rows)
    }

    private static func decodeOrders(_ root: [String: JSONValue]) throws -> (items: [Order], skipped: [String]) {
        guard case .array(let rows)? = root["printLog"] else { return ([], []) }
        let encoder = JSONEncoder(), decoder = JSONDecoder()
        var items: [Order] = [], skipped: [String] = []
        for row in rows {
            do { items.append(try decoder.decode(Order.self, from: try encoder.encode(row))) }
            catch {
                var id = "(no id)"
                if case .object(let o) = row, case .string(let s)? = o["id"] { id = s }
                skipped.append(id)
            }
        }
        return (items, skipped)
    }

    private static func decodeFiles(_ root: [String: JSONValue]) -> (items: [LibraryFile], skipped: [String]) {
        guard case .array(let rows)? = root["printFiles"] else { return ([], []) }
        let encoder = JSONEncoder(), decoder = JSONDecoder()
        var items: [LibraryFile] = [], skipped: [String] = []
        for row in rows {
            do { items.append(try decoder.decode(LibraryFile.self, from: try encoder.encode(row))) }
            catch {
                var id = "(no id)"
                if case .object(let o) = row, case .string(let s)? = o["id"] { id = s }
                skipped.append(id)
            }
        }
        return (items, skipped)
    }

    /// Decode one collection, skipping records that do not fit rather than
    /// losing the collection. Same reasoning as the orders and the library: a
    /// newer build will put fields here this app has never heard of.
    private static func decode<T: Decodable>(_ root: [String: JSONValue], _ key: String,
                                             as type: T.Type) -> [T] {
        guard case .array(let rows)? = root[key] else { return [] }
        let encoder = JSONEncoder(), decoder = JSONDecoder()
        return rows.compactMap { row in
            guard let data = try? encoder.encode(row) else { return nil }
            return try? decoder.decode(T.self, from: data)
        }
    }

    private static func librarySettings(_ root: [String: JSONValue]) -> JSONValue? {
        guard case .object(let settings)? = root["settings"] else { return nil }
        return settings["printLibrary"]
    }

    /// Read the shop's tax setup through the shared engine rather than the
    /// settings dictionary. `lib/tax.js` is what decides whether a shop is
    /// registered, at what rate, and whether its prices include the tax — and
    /// the answer differs by country, which is exactly the sort of thing a
    /// second implementation gets subtly wrong.
    private func describeTax(_ settings: JSONValue?) async -> String? {
        guard case .object(let dict)? = settings, let engine else { return nil }
        guard let profile = try? await engine.taxProfile(settings: dict), profile.isRegistered else { return nil }
        let mode = profile.mode == .inclusive ? "included in the price" : "added on top"
        return "\(profile.name) \(Money.figure(profile.totalPercent))% \(mode)"
    }

    /// A price split into what the shop keeps and what it is only holding for
    /// the tax authority. Computed by `lib/tax.js`, not here.
    func taxSplit(_ amount: Double) async -> TaxSplit? {
        guard let engine, case .object(let dict) = settingsValue else { return nil }
        guard let profile = try? await engine.taxProfile(settings: dict), profile.isRegistered else { return nil }
        return try? await engine.computeTax(amount, profile: profile)
    }

    // MARK: - What the table shows

    var shown: [Order] {
        var rows = orders
        if let stage { rows = rows.filter { Stage.of($0) == stage } }
        return matching(rows)
    }

    func count(_ stage: Stage) -> Int { orders.count { Stage.of($0) == stage } }

    // MARK: - What the library shows

    /// The groups a shop has actually made, in the order it reads them.
    var groups: [String] {
        var seen = Set<String>(), out: [String] = []
        for g in files.compactMap(\.groupName) where !seen.contains(g) {
            seen.insert(g); out.append(g)
        }
        return out.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }

    var ungroupedCount: Int { files.count { $0.groupName == nil } }

    var shownFiles: [LibraryFile] {
        var rows = files
        if case .library(let group) = shelf, let group {
            rows = rows.filter { $0.groupName == group }
        }
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty {
            rows = rows.filter {
                $0.title.lowercased().contains(q)
                    || ($0.material ?? "").lowercased().contains(q)
                    || ($0.tags ?? []).contains { $0.lowercased().contains(q) }
            }
        }
        return rows.sorted(by: librarySort.order)
    }

    /// The inspector shows one model. More than one selected is a different
    /// screen — what they have in common, and what can be done to all of them.
    var selectedFile: LibraryFile? {
        fileSelection.count == 1 ? files.first { fileSelection.contains($0.id) } : nil
    }
    var selectedFiles: [LibraryFile] { shownFiles.filter { fileSelection.contains($0.id) } }

    /// Click, ⌘-click, ⇧-click. Written out because a grid is not a `List` and
    /// gets none of this for free — and a Mac app where ⌘-click does not extend
    /// a selection is one that reads as a web page however it is drawn.
    func select(_ file: LibraryFile, modifiers: SelectionModifier) {
        switch modifiers {
        case .replace:
            fileSelection = [file.id]
            anchor = file.id
            cursor = file.id
        case .toggle:
            if fileSelection.contains(file.id) { fileSelection.remove(file.id) }
            else { fileSelection.insert(file.id); anchor = file.id }
            cursor = file.id
        case .extend:
            let rows = shownFiles
            guard let end = rows.firstIndex(where: { $0.id == file.id }) else { return }
            let start = anchor.flatMap { a in rows.firstIndex { $0.id == a } } ?? end
            let range = start <= end ? start...end : end...start
            fileSelection.formUnion(rows[range].map(\.id))
            cursor = file.id
        }
    }

    enum SelectionModifier { case replace, toggle, extend }
    /// Where a selection run started, and where the keyboard is standing.
    private var anchor: LibraryFile.ID?
    private var cursor: LibraryFile.ID?

    /// Move the selection by `step` places in reading order.
    ///
    /// Reading order, not screen order: in a mirrored window the next model is
    /// to the LEFT. The caller has already turned the key into a direction;
    /// this only counts.
    ///
    /// TWO POSITIONS, NOT ONE. `anchor` is where a selection run started and
    /// `cursor` is where the keyboard is standing. Computing the next place from
    /// the anchor — which is what this did first — means a second shift-arrow
    /// lands where the first one did and the selection never grows past two.
    ///
    /// Returns whether it moved, so a key at either end is left unhandled and
    /// the system beep can do its job.
    @discardableResult
    func moveSelection(by step: Int, extending: Bool) -> Bool {
        let rows = shownFiles
        guard !rows.isEmpty else { return false }

        guard let here = cursor.flatMap({ c in rows.firstIndex { $0.id == c } }) else {
            // Nothing chosen yet: the first press picks an end rather than doing
            // nothing, which is what a Finder window does.
            let landing = step >= 0 ? rows.first! : rows.last!
            fileSelection = [landing.id]
            anchor = landing.id
            cursor = landing.id
            return true
        }

        let next = here + step
        guard rows.indices.contains(next) else { return false }
        cursor = rows[next].id
        if extending {
            let start = anchor.flatMap { a in rows.firstIndex { $0.id == a } } ?? here
            let range = start <= next ? start...next : next...start
            fileSelection = Set(rows[range].map(\.id))
        } else {
            fileSelection = [rows[next].id]
            anchor = rows[next].id
        }
        return true
    }

    func selectAllShown() {
        fileSelection = Set(shownFiles.map(\.id))
        anchor = shownFiles.first?.id
        cursor = anchor
    }

    /// The one the keyboard is standing on, for scrolling into view.
    var focusedFile: LibraryFile.ID? { cursor ?? fileSelection.first }

    // MARK: - What the customers screen shows

    var customers: [Customer] { Customer.from(orders) }

    var shownCustomers: [Customer] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return customers }
        return customers.filter {
            $0.name.lowercased().contains(q) || $0.orders.contains { $0.project.lowercased().contains(q) }
        }
    }

    var selectedCustomer: Customer? { customers.first { $0.id == customerSelection } }

    func count(group: String) -> Int { files.count { $0.groupName == group } }

    /// The record's folder on this Mac, if it is on this Mac at all.
    func directory(for file: LibraryFile) -> URL? {
        guard let roots = libraryRoots else { return nil }
        return LibraryLocation.directory(for: file.id, roots: roots.roots)
    }

    func fileIsPresent(_ file: LibraryFile) -> Bool { directory(for: file) != nil }

    /// The model file itself, if it is on this Mac.
    ///
    /// The record names it (`sourceFile.filename`), but a folder that has one
    /// model in it and a differently-named record is a state this app should
    /// survive rather than shrug at, so a single model file in the folder is
    /// taken as the model.
    func modelFile(for file: LibraryFile) -> URL? {
        guard let dir = directory(for: file) else { return nil }
        if let named = file.sourceFile?.filename, !named.isEmpty {
            let url = dir.appending(path: named)
            if FileManager.default.fileExists(atPath: url.path) { return url }
        }
        let contents = (try? FileManager.default.contentsOfDirectory(at: dir,
            includingPropertiesForKeys: nil)) ?? []
        let models = contents.filter { !["jpg", "jpeg", "png"].contains($0.pathExtension.lowercased()) }
        return models.count == 1 ? models[0] : nil
    }

    /// A photograph the shop took beats a generated thumbnail: it is the print
    /// as it came off the bed, which is what someone is trying to recognise.
    func thumbnail(for file: LibraryFile) -> ThumbnailSource? {
        if let photo = file.userPhoto, photo.hasPrefix("data:") { return .inlineData(photo) }
        guard let dir = directory(for: file) else { return nil }
        let name = file.thumbFile ?? "thumb.jpg"
        let url = dir.appending(path: name)
        return FileManager.default.fileExists(atPath: url.path) ? .file(url) : nil
    }

    /// What the shop is owed across everything still open. The one number an
    /// owner looks for, so it is on screen without being asked for.
    var owed: Double { orders.filter { !$0.isSettled }.reduce(0) { $0 + $1.owed } }
    var overdueCount: Int { orders.count { $0.isOverdue() } }

    var selected: Order? { orders.first { $0.id == selection } }
}
