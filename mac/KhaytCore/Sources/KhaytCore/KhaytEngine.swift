import Foundation

/// Khayt's business logic, typed, on one serialised queue.
///
/// Every screen in the Mac app asks this for a number. Nothing above it ever
/// sees a `JSValue`, and nothing below it is written twice: the arithmetic is
/// the same code the Electron app runs, and `MoneyParityTests` fails if the two
/// ever disagree.
///
/// A `JSContext` must be touched from one thread at a time, so the runtime is
/// confined to an actor. Calls are cheap — JSON across a boundary in the same
/// process — and none of them do I/O.
public actor KhaytEngine {
    private let runtime: JSRuntime

    /// The modules this engine exposes, in dependency order.
    static let modules = [
        "tax",
        "pricing",
        "payment-plan",
        "split-order",
        "business-scope",
        "order-progress",
        "loyalty",
        // How long a nozzle lasts, and what wears it out.
        //
        // THE DATA MODULE MUST COME FIRST. `nozzle-wear` reads it through
        // `require`, and under JavaScriptCore there is no require — it falls
        // back to `global.KhaytNozzleWearData`, which only exists if that file
        // has already run. Without it the module still LOADS and then throws on
        // the first call, which is a failure that arrives from inside a screen
        // with no clue why. Verified identical to Node's answer with it.
        "nozzle-wear-data",
        "nozzle-wear",
        // `filament-dryness` is NOT here. It reads `driedAt` — when a spool
        // was last DRIED — and belongs to Bed Ready's dry log, whose records
        // the `inventory` collection does not carry. Wiring it to the filament
        // shelf produced a column of dashes and would have produced a column of
        // wrong answers the moment anything filled that field in.
        // What one order is worth and what is owed on it, and which orders
        // count towards a period. Both lifted out of the renderer so this app
        // could use the same rules rather than invent a second opinion about
        // revenue.
        "order-money",
        "kpi-rows",
        "kpi",
        // What needs a shop's attention, and the figures on the dashboard.
        // Pure, zero requires, and already assigning onto globalThis — so the
        // screen a shop opens on is the same arithmetic the Electron app shows,
        // not a Swift opinion about which orders are late.
        "attention",
        "dashboard-facts",
        // Groups and categories. Pure, and bundled rather than ported because
        // the rule that matters is not the reading — it is that a name matching
        // one already in use IS that name and adopts its spelling. "Saudi Kings"
        // and "saudi kings" as two groups, each holding part of one collection,
        // is precisely the mess this module exists to prevent.
        "organise",
        // Not business logic — the one list of which store fields hold
        // credentials. Bundling it is what stops the Mac app from becoming a
        // sixth hand-maintained copy; SafeStorage encrypts exactly these.
        "store-secret-paths",
        // What happens to a job when its stage changes: what may move, and what
        // moving it costs. Lifted out of renderer/order-flows.js so this app can
        // move a job by the same rules rather than reimplement the most
        // consequential write in Khayt a second way.
        //
        // ASSEMBLY MUST COME FIRST. `order-status` consults `KhaytAssembly`
        // through a `typeof` guard, so without it the completion gate does not
        // crash — it silently stops gating, and this app would let a shop
        // complete an assembly whose parts have not passed QC while the Electron
        // app refuses. A missing module that changes an answer instead of
        // raising is the worst kind, so it is listed rather than guarded against.
        "assembly",
        "order-status",
        // What a finished job takes off the shelf: the grams, the hourly
        // consumables, the bought-in components, the packaging. Lifted out of
        // renderer/inventory.js because the move being shared is not enough —
        // a completion that silently failed to deduct would leave a shop
        // ordering filament it does not have.
        "order-deduction",
        // What a shop has been paid, and what that makes an order. One answer
        // to "is this paid" instead of the three that had drifted apart — the
        // smallest of which was the one that WROTE the field the others read.
        "order-payment",
        // Changing a job's own details, and remembering that it changed. Five
        // fields are recorded because those are the ones a customer can be told
        // a different answer about later.
        "order-edit",
        // A job that failed inspection: the fields the metrics count, the
        // defect the analytics table is built from, and the waste row.
        "qc-failure",
        // What one part of a job costs to make, and what a new job IS. The
        // record was written inline in logPrint, reading twenty form controls,
        // which is why only the Electron window could create one — and why this
        // app could not replace it.
        //
        // WORKING-WEEK FIRST: order-new estimates a due date from it and reaches
        // it through a global, so listing it after would give every new job a
        // default eight-hour day instead of the shop's own.
        "working-week",
        "calculator-cost",
        "order-new",
        // Which language a shop writes its customers' names in, and which of
        // them to show. Not the interface language: a shop that writes only
        // Arabic must not be shown the stale English name left over from setup.
        "content-languages",
        // The document a customer is handed, and the QR a Saudi tax invoice
        // must carry. INVOICE-LANGUAGE FIRST: the document asks it whether to
        // print a second language, through a global, so listing it after would
        // give every invoice the English-only answer.
        "invoice-language",
        "zatca-qr",
        // PRINT-DATE FIRST: the document's own date formatter reaches it
        // through a global, and without it every invoice this app printed
        // showed the raw ISO timestamp under DATE.
        "print-date",
        "invoice-document",
        // The currencies a shop can price in, and how a settings form is
        // saved. The save was a 240-line literal inside the Electron settings
        // page, which is why only that page could change a setting; lifted so
        // the Mac's Settings window writes the same record by the same clamps.
        "currencies",
        "settings-edit",
        // The expense book, a failed print written down by hand, and which
        // records fall in "this month". The three rules the Expenses, Waste
        // and Reports screens are built on; each was inline in a renderer
        // handler before, which is why only the Electron window had them.
        "date-range",
        "expense-book",
        "waste-entry",
        // A spool, as the shelf records it, and what correcting one means.
        // The two writers were inline in renderer/inventory.js, so only the
        // Electron window could add a spool or fix a weight — and a shop's
        // shelf drifts every day.
        "spool-edit",
        // The shop's quarters. ORDER-MONEY AND TAX ARE ALREADY ABOVE, and both
        // must be: this consults them through their globals, and without them
        // it does not raise — it reports every order at its gross price and no
        // tax collected at all.
        "pnl-report",
    ]

    /// The languages whose strings are bundled.
    ///
    /// Two, not nine: these are 200KB each and the app only shows one at a time.
    /// English because it is the fallback, Arabic because it is the language the
    /// other half of this shop's customers read — and because right-to-left is a
    /// layout property, not a translation, so it has to be exercised now rather
    /// than retrofitted across a dozen finished screens.
    static let locales = ["en", "ar"]

    public init(bundle: Bundle? = nil) throws {
        runtime = try JSRuntime(modules: Self.modules, locales: Self.locales, bundle: bundle)
    }

    // MARK: - Words

    /// Khayt's own translation of a key, or nil when it has none.
    ///
    /// Never invents. A key this app needs and Khayt does not have belongs in the
    /// Mac app's own small catalogue, where it is visibly the app's own word
    /// rather than something silently diverging from the Electron build's.
    /// Every string Khayt has in a language.
    ///
    /// Fetched whole and once, rather than a key at a time: this crosses the
    /// bridge with four thousand strings, which is cheap once and absurd per
    /// label. The caller holds the result for the life of the language.
    public func translations(language: String) throws -> [String: String] {
        try raw("(globalThis.KhaytLocales||{})['\(language)']||{}", as: [String: String].self)
    }

    // MARK: - Tax

    /// The shop's tax profile, resolved the way every invoice resolves it.
    public func taxProfile(settings: [String: JSONValue]) throws -> TaxProfile {
        try runtime.call("KhaytTax", "profileFromSettings", [settings], as: TaxProfile.self)
    }

    /// Split a price into net and tax, honouring the profile's mode.
    public func computeTax(_ amount: Double, profile: TaxProfile) throws -> TaxSplit {
        try runtime.call("KhaytTax", "computeTax", [amount, profile], as: TaxSplit.self)
    }

    // MARK: - Payment plans

    /// A dated schedule. `total` is what is OUTSTANDING, never the gross price:
    /// passing the gross bills a deposit the customer has already handed over.
    public func buildSchedule(total: Double, deposit: Double = 0, installments: Int,
                              firstDueDate: String, intervalDays: Int) throws -> [Installment] {
        let arg: [String: JSONValue] = [
            "total": .number(total), "depositAmount": .number(deposit),
            "installments": .number(Double(installments)),
            "firstDueDate": .string(firstDueDate), "intervalDays": .number(Double(intervalDays)),
        ]
        return try runtime.call("KhaytPaymentPlan", "buildSchedule", [arg], as: [Installment].self)
    }

    // MARK: - Splitting a job

    /// Divide price, deposit and credit notes across machines by cost weight.
    /// The last share absorbs every remainder, so the parts add back up exactly.
    public func splitMoney(price: Double, paid: Double, credited: Double,
                           costs: [Double]) throws -> [SplitShare] {
        let arg: [String: JSONValue] = [
            "price": .number(price), "paid": .number(paid),
            "credited": .number(credited), "costs": .array(costs.map { .number($0) }),
        ]
        return try runtime.call("KhaytSplitOrder", "splitMoney", [arg], as: [SplitShare].self)
    }

    // MARK: - Quoting

    public func quoteTotal(_ input: [String: JSONValue]) throws -> QuoteTotal {
        try runtime.call("KhaytPricing", "quoteTotal", [input], as: QuoteTotal.self)
    }

    // MARK: - The dashboard

    /// What a shop needs to look at, and the state of the fleet.
    ///
    /// `attention` is passed IN because `dashboard-facts` is pure and refuses to
    /// reach for a global — the module says so, and honouring it here is what
    /// keeps one attention engine rather than two.
    public func dashboardFacts(orders: [JSONValue], machines: [JSONValue],
                               settings: [String: JSONValue]) throws -> DashboardFacts {
        try runtime.call2("KhaytDashboardFacts.dashboardFacts({orders: ARG0, machines: ARG1,"
                        + " settings: ARG2, attention: globalThis.KhaytAttention})",
                          [.array(orders), .array(machines), .object(settings)],
                          as: DashboardFacts.self)
    }

    /// The headline figures for a period.
    ///
    /// Three shared modules in one expression, which is the point:
    /// `order-money` says what an order earned and what is owed on it,
    /// `kpi-rows` says which orders count and what "on time" means, and `kpi`
    /// adds them up. None of it is arithmetic written in Swift.
    ///
    /// The money function is written HERE, in JavaScript, because a function
    /// cannot cross the JSON bridge — and because these are the same calls the
    /// renderer makes, from the same module.
    public func kpis(orders: [JSONValue], clients: [JSONValue],
                     settings: [String: JSONValue], range: String) throws -> Kpis {
        let script = KPI_SCRIPT
        return try runtime.call2(script,
                                 [.array(orders), .array(clients), .object(settings),
                                  .string(range), .string("\u{2014}")],
                                 as: Kpis.self)
    }

    // A note kept from when this was not yet possible:
    //
    // It takes rows a caller has already scoped to a date range, converted to
    // base currency and marked completed/on-time — `renderer/analytics.js` does
    // that in `rowsFor(range)`, which is private to the renderer. Handing it
    // `{orders, settings}` compiles, runs, and returns every figure as ZERO,
    // which is how this app briefly showed a shop "0 SAR revenue" beside a
    // toolbar reading 52,691.57.
    //
    // Revenue and margin wait until that normalising is lifted into `lib/`
    // where both apps can share it. A bridge method that quietly answers zero
    // is worse than no bridge method.

    // MARK: - The shop floor

    /// How worn ONE machine's nozzle is, from the grams it has actually printed.
    ///
    /// `nozzleWear(printLog, machine, settings)` — POSITIONAL, and one machine at
    /// a time. Handed a single options object instead it takes that object as
    /// the print log, finds it is not an array, loops over nothing, and reports
    /// every nozzle as 0 of the DEFAULT 5,000g threshold rather than the one the
    /// machine actually carries. It looked right on screen. Checked against the
    /// source, not inferred from the name, after `KhaytKpi.computeKpis` had
    /// already cost this app a screenful of zeros the same way.
    public func nozzleWear(orders: [JSONValue], machine: JSONValue,
                           settings: [String: JSONValue]) throws -> NozzleWear {
        try runtime.call2("KhaytNozzleWear.nozzleWear(ARG0, ARG1, ARG2)",
                          [.array(orders), machine, .object(settings)], as: NozzleWear.self)
    }

    // MARK: - Groups

    /// One of the shop's group names, and how many things carry it.
    ///
    /// `counts` returns pairs — `["Saudi Kings", 7]` — rather than objects, so
    /// this decodes positionally. Keeping the JS shape rather than reshaping it
    /// in the bridge means one less place for the two to drift.
    public struct GroupCount: Decodable, Sendable, Equatable {
        public let name: String
        public let count: Int
        public init(from decoder: any Decoder) throws {
            var row = try decoder.unkeyedContainer()
            name = try row.decode(String.self)
            count = try row.decode(Int.self)
        }
    }

    /// The names a shop has actually used, most-used first, with counts.
    ///
    /// One call for the whole library rather than one per row: building a
    /// JSContext call is cheap and doing it four hundred times to draw a sidebar
    /// is not.
    public func groupCounts(_ records: [JSONValue]) throws -> [GroupCount] {
        try runtime.call("KhaytOrganise", "counts", [JSONValue.array(records), "group"],
                         as: [GroupCount].self)
    }

    /// The patch that files a record under a name — `{group, folder}`, both set.
    ///
    /// Shared rather than ported precisely because of `unify`: a name matching
    /// one the shop already uses adopts that spelling, so "saudi kings" typed
    /// into the box files a model with the Saudi Kings rather than beside them.
    /// `folder` is written alongside `group` because records from earlier builds
    /// have only `folder`, and `bedready-library.js` still reads it directly.
    public func fileUnderGroup(_ name: String, known: [String]) throws -> [String: JSONValue] {
        let patch: [String: JSONValue] = ["group": .string(name)]
        let knownNames: [String: JSONValue] = ["group": .array(known.map { .string($0) })]
        return try runtime.call("KhaytOrganise", "assign",
                                [JSONValue.object([:]), patch, knownNames],
                                as: [String: JSONValue].self)
    }

    /// The name one record is filed under. `folder` wins over `group` — see the
    /// module header: it is a sync decision, not an accident.
    public func groupOf(_ record: JSONValue) throws -> String {
        try runtime.call("KhaytOrganise", "groupOf", [record], as: String.self)
    }

    // MARK: - Order progress

    /// How far along an order is, for the tracker a customer sees. An unknown
    /// status reports "started" rather than "nothing has happened".
    public func progressIndex(status: String) throws -> Int {
        try runtime.call("KhaytOrderProgress", "progressIndex", [status], as: Int.self)
    }

    /// Escape hatch for logic not yet given a typed method. Deliberately
    /// awkward to reach for: anything a screen needs twice belongs above.
    /// Every store field that holds a credential, from the same list the
    /// Electron app encrypts from. Not a Swift copy: a Swift copy is how the
    /// two apps come to disagree about which secrets are protected, and being
    /// on one list and not another has already leaked a webhook key here.
    ///
    /// `machines[].printerApi.apiKey` means "for every element of machines".
    public func secretPaths() throws -> [String] {
        try runtime.value("KhaytStoreSecretPaths", "SECRET_PATHS", as: [String].self)
    }

    // MARK: - Moving a job

    /// May this job move to `status`?
    ///
    /// This is the half of the status rules a screen that only SHOWS work
    /// needs: it is what greys out a drop target before anything is dragged
    /// onto it. Performing the move — stamping `completedAt`, deducting the
    /// filament and the packaging, settling the hold, moving the customer's
    /// tier — is `apply()` in the same module, and this app does not call it
    /// yet. The board shows where the work is piling up; the rules it would
    /// need to move a card now exist in one place rather than two.
    ///
    /// `orders` is the whole log because a WIP limit is a fact about a column,
    /// not about a job.
    public func statusGate(order: JSONValue, to status: String,
                           orders: [JSONValue],
                           settings: [String: JSONValue]) throws -> StatusGate {
        let ctx: JSONValue = .object(["orders": .array(orders), "settings": .object(settings)])
        return try runtime.call("KhaytOrderStatus", "gate",
                                [order, status, ctx], as: StatusGate.self)
    }

    /// Where this move would reach outside the shop's own book.
    ///
    /// Ask BEFORE moving anything. A webhook, a Telegram message, an email or a
    /// portal refresh cannot be sent from here and cannot be sent later, so a
    /// move that would trigger one has to be refused rather than half-made. An
    /// empty list is the common case: a shop with no integrations configured.
    public func outbound(order: JSONValue, to status: String,
                         settings: [String: JSONValue],
                         clients: [JSONValue]) throws -> [Outbound] {
        try runtime.call2("KhaytOrderStatus.outboundFor(ARG0, ARG1, {settings: ARG2, clients: ARG3})",
                          [order, .string(status), .object(settings), .array(clients)],
                          as: [Outbound].self)
    }

    /// Move a job to a stage, and take what it costs off the shelf.
    ///
    /// Both shared modules in one expression, which is the point: `order-status`
    /// says what happens to the job and asks for the deductions, `order-deduction`
    /// performs them on the spools and consumable rows it is handed. None of it
    /// is arithmetic written in Swift, and none of it is a second opinion about
    /// whether a job is finished.
    ///
    /// The three collections come back changed. Write all three or none — the
    /// job saying "completed" while the spools still hold its filament is a shop
    /// that has been told it has stock it has already used.
    ///
    /// `holdReason` is why a job is being put on hold, and is only ever read
    /// when it is. Nil means "say nothing about it"; an empty string means "no
    /// reason given", which is a different thing from the last hold's reason
    /// being left behind.
    ///
    /// `qcNotes` records a PASS on a job leaving inspection. Nil means the
    /// completion was not an inspection and the QC fields are left alone —
    /// pretending otherwise would make a shop's pass rate a fiction.
    public func moveJob(order: JSONValue, to status: String,
                        orders: [JSONValue], settings: [String: JSONValue],
                        inventory: [JSONValue], consumables: [JSONValue],
                        machines: [JSONValue],
                        now: Date, today: String,
                        holdReason: String? = nil,
                        qcNotes: String? = nil) throws -> JobMove {
        let qc: JSONValue = qcNotes.map {
            .object(["outcome": .string("pass"), "notes": .string($0)])
        } ?? .null
        return try runtime.call2(MOVE_SCRIPT,
                          [order, .string(status), .array(orders), .object(settings),
                           .array(inventory), .array(consumables), .array(machines),
                           .number(now.timeIntervalSince1970 * 1000), .string(today),
                           holdReason.map(JSONValue.string) ?? .null, qc],
                          as: JobMove.self)
    }

    /// Hand a finished job over: `deliveredAt`, and the status left alone.
    public func markDelivered(order: JSONValue, now: Date) throws -> Handover {
        try runtime.call2(
            "(function(){ var o = ARG0;"
          + " var r = KhaytOrderStatus.markDelivered(o, { now: ARG1 });"
          + " return { ok: r.ok, order: r.ok ? o : null }; })()",
            [order, .number(now.timeIntervalSince1970 * 1000)], as: Handover.self)
    }

    /// Change a job's due date and priority, and write the edit down.
    ///
    /// `dueDate` nil clears it — a job with no due date is a real answer.
    /// Returns the order unchanged and no effects when nothing actually moved,
    /// so an editor opened and closed again writes no revision.
    public func editJob(order: JSONValue, dueDate: String?, priorityLevel: String,
                        now: Date, editId: String) throws -> JobEdited {
        try runtime.call2(
            "(function(){ var o = ARG0;"
          + " var r = KhaytOrderEdit.applyEdit(o, { dueDate: ARG1, priorityLevel: ARG2 },"
          + "                                 { now: ARG3, id: ARG4 });"
          + " return { order: o, changed: Object.keys(r.changes).length > 0 }; })()",
            [order, dueDate.map(JSONValue.string) ?? .null, .string(priorityLevel),
             .number(now.timeIntervalSince1970 * 1000), .string(editId)],
            as: JobEdited.self)
    }

    /// The priority a job is at, however old the record is.
    public func priority(of order: JSONValue) throws -> String {
        try runtime.call("KhaytOrderEdit", "priorityOf", [order], as: String.self)
    }

    /// Record a QC failure: the order, the defect, and the waste row.
    ///
    /// The waste row comes BACK rather than being pushed into a list, because
    /// this app writes the collection itself, inside the same swap as the
    /// order — three records that must land together or not at all.
    public func recordQcFailure(order: JSONValue, failureType: String, severity: String,
                                reason: String, weight: Double, inspector: String?,
                                inventory: [JSONValue], now: Date,
                                wasteId: String, defaultReason: String) throws -> QcFailure {
        try runtime.call2(QC_FAILURE_SCRIPT,
                          [order, .string(failureType), .string(severity), .string(reason),
                           .number(weight), inspector.map(JSONValue.string) ?? .null,
                           .array(inventory), .number(now.timeIntervalSince1970 * 1000),
                           .string(wasteId), .string(defaultReason)],
                          as: QcFailure.self)
    }

    // MARK: - The document a customer is handed

    /// May a ZATCA QR be drawn for this shop, and if not, which field is missing?
    ///
    /// A QR missing a required tag SCANS and is invalid, which is worse than no
    /// QR at all: a code that reads invites no question.
    public func zatcaReadiness(settings: [String: JSONValue],
                               sellerName: String) throws -> StatusGate.Reason? {
        struct Readiness: Decodable { let ok: Bool; let missing: [String] }
        let r = try runtime.call2("KhaytZatcaQr.readiness(ARG0, ARG1)",
                                  [.object(settings), .string(sellerName)], as: Readiness.self)
        guard !r.ok else { return nil }
        return StatusGate.Reason(code: "zatca_not_ready",
                                 params: ["missing": .array(r.missing.map(JSONValue.string))])
    }

    /// The QR payload: five BER-TLV tags, base64'd.
    public func zatcaPayload(sellerName: String, vatNumber: String, timestamp: String,
                             total: String, vatAmount: String) throws -> String {
        try runtime.call2(
            "KhaytZatcaQr.buildTLV({sellerName: ARG0, vatNumber: ARG1, timestamp: ARG2,"
          + " total: ARG3, vatAmount: ARG4}, {})",
            [.string(sellerName), .string(vatNumber), .string(timestamp),
             .string(total), .string(vatAmount)], as: String.self)
    }

    /// The invoice, as HTML.
    ///
    /// The same four hundred lines the Electron window prints.
    ///
    /// The document takes FUNCTIONS — how to escape, how to format money, what
    /// a label is called — and a function cannot cross a JSON bridge. So they
    /// are built in JavaScript, from the locale catalogue this runtime already
    /// has loaded, and only the DATA comes from Swift. See `INVOICE_SCRIPT`.
    public func invoiceHtml(order: JSONValue, settings: [String: JSONValue],
                            clients: [JSONValue], currencies: [String: JSONValue],
                            language: String, money: [String: JSONValue],
                            sellerName: String, sellerAddress: String) throws -> InvoiceDocument {
        try runtime.call2(INVOICE_SCRIPT,
                          [order, .object(settings), .array(clients), .object(currencies),
                           .string(language), .object(money),
                           .string(sellerName), .string(sellerAddress)],
                          as: InvoiceDocument.self)
    }

    // MARK: - The shop's own settings

    /// The settings as a save leaves them.
    ///
    /// `form` carries only the keys a screen showed; every other setting keeps
    /// its value. That is the rule's one deliberate difference from the
    /// Electron page, and it is what lets a Business tab save the phone number
    /// without zeroing the WIP limits it never displayed.
    public func applySettings(_ settings: [String: JSONValue], form: [String: JSONValue],
                              year: Int) throws -> [String: JSONValue] {
        try runtime.call2("KhaytSettingsEdit.apply(ARG0, ARG1, {year: ARG2})",
                          [.object(settings), .object(form), .number(Double(year))],
                          as: [String: JSONValue].self)
    }

    /// The settings after a country is chosen for tax rules: name, rate,
    /// pricing convention and registration label together, with the legacy
    /// VAT fields kept in step.
    public func chooseTaxCountry(_ settings: [String: JSONValue], code: String) throws -> [String: JSONValue] {
        try runtime.call2("KhaytSettingsEdit.chooseCountry(ARG0, ARG1)",
                          [.object(settings), .string(code)], as: [String: JSONValue].self)
    }

    /// The tax rules Khayt knows by country, keyed by ISO code.
    public func taxPresets() throws -> [String: TaxProfile] {
        try runtime.value("KhaytTax", "PRESETS", as: [String: TaxProfile].self)
    }

    /// The currencies a shop can price in.
    public func currencies() throws -> [String: Currency] {
        try runtime.value("KhaytCurrencies", "CURRENCIES", as: [String: Currency].self)
    }

    /// The languages the shop writes its own text in — one or two, never none.
    public func contentLanguages(settings: [String: JSONValue]) throws -> [String] {
        try runtime.call2("KhaytContentLanguages.contentLangs(ARG0)", [.object(settings)], as: [String].self)
    }

    /// The store key for one of the shop's text fields in one language:
    /// `bizEn`, `bizAr`, `biz_fr`. Asked rather than assumed, because the
    /// suffix rule is the whole back-compatibility story of that module.
    public func fieldKey(_ base: String, language: String) throws -> String {
        try runtime.call2("KhaytContentLanguages.fieldKey(ARG0, ARG1)",
                          [.string(base), .string(language)], as: String.self)
    }

    /// One of the shop's own text fields — its name, tagline, address — in the
    /// language asked for, by the same fallback every Khayt document uses:
    /// that language only if the shop writes in it, then the shop's own
    /// languages, then anything filled in at all.
    public func shopText(_ base: String, settings: [String: JSONValue], language: String) throws -> String {
        try runtime.call2("(KhaytContentLanguages.read(ARG0, ARG1, ARG2, ARG0) || '')",
                          [.object(settings), .string(base), .string(language)], as: String.self)
    }

    /// A language's own name — "Deutsch", not "German".
    public func languageName(_ code: String) throws -> String {
        try runtime.call2("KhaytContentLanguages.languageName(ARG0)", [.string(code)], as: String.self)
    }

    // MARK: - What the shop spent, and what it wasted

    /// Whether a record's date falls in a period — the same rule every list in
    /// Khayt filters through.
    public func inRange(_ date: String, period: String, now: Date) throws -> Bool {
        try runtime.call2("KhaytDateRange.inRange(ARG0, ARG1, {now: new Date(ARG2)})",
                          [.string(date), .string(period), .number(now.timeIntervalSince1970 * 1000)],
                          as: Bool.self)
    }

    /// One expense, as the book records it. `refused` names the field when the
    /// rule will not build one — an amount that is not positive is the only case.
    public func newExpense(_ input: [String: JSONValue], id: String, today: String) throws -> Written {
        try runtime.call2("KhaytExpenseBook.newExpense(ARG0, {id: ARG1, today: ARG2})",
                          [.object(input), .string(id), .string(today)], as: Written.self)
    }

    /// Whether a category has gone past its monthly budget, AFTER the expense
    /// is in the list handed here. Nil when it has not, or has no budget.
    public func overBudget(_ expenses: [JSONValue], category: String, month: String,
                           budgets: [String: JSONValue]) throws -> Overspend? {
        try runtime.call2("KhaytExpenseBook.overBudget(ARG0, ARG1, ARG2, ARG3)",
                          [.array(expenses), .string(category), .string(month), .object(budgets)],
                          as: Overspend?.self)
    }

    /// Budget against actual, one row per category that has a budget.
    public func budgetProgress(_ byCategory: [String: Double],
                               budgets: [String: JSONValue]) throws -> [BudgetRow] {
        try runtime.call2("KhaytExpenseBook.budgetProgress(ARG0, ARG1)",
                          [.object(byCategory.mapValues(JSONValue.number)), .object(budgets)],
                          as: [BudgetRow].self)
    }

    /// A failed print written down by hand.
    ///
    /// `inventory` COMES BACK CHANGED when the entry deducts: the grams come
    /// off the spool it names, and the entry records which spool, so deleting
    /// it can put them back. Write both, or the shelf and the log disagree.
    public func newWasteEntry(_ input: [String: JSONValue], id: String, today: String,
                              inventory: [JSONValue]) throws -> WasteWritten {
        try runtime.call2(
            "(function(){var inv = ARG3; var out = KhaytWasteEntry.newEntry(ARG0, {id: ARG1, today: ARG2, inventory: inv});"
          + " return {entry: out.entry, refused: out.refused, inventory: inv};})()",
            [.object(input), .string(id), .string(today), .array(inventory)], as: WasteWritten.self)
    }

    /// What wasted grams of a material cost, from the spool they came off.
    public func wasteCost(material: String, grams: Double, inventory: [JSONValue]) throws -> Double {
        try runtime.call2("KhaytWasteEntry.costOf(ARG0, ARG1, ARG2)",
                          [.string(material), .number(grams), .array(inventory)], as: Double.self)
    }

    /// Take an entry out of the log and put its grams back on its spool.
    /// Both collections come back changed.
    public func removeWasteEntry(_ wasteLog: [JSONValue], id: String,
                                 inventory: [JSONValue]) throws -> WasteRemoved {
        try runtime.call2(
            "(function(){var log = ARG0, inv = ARG2;"
          + " var gone = KhaytWasteEntry.removeEntry(log, ARG1, {inventory: inv});"
          + " return {removed: !!gone, wasteLog: log, inventory: inv};})()",
            [.array(wasteLog), .string(id), .array(inventory)], as: WasteRemoved.self)
    }

    /// The shop's quarters: what it earned, what it spent, what it kept.
    public func pnlByPeriod(orders: [JSONValue], expenses: [JSONValue],
                            settings: [String: JSONValue], clients: [JSONValue],
                            currencies: [String: JSONValue], now: Date) throws -> [PnlPeriod] {
        try runtime.call2(
            "KhaytPnl.pnlByPeriod(ARG0, ARG1, {settings: ARG2, clients: ARG3, currencies: ARG4, now: new Date(ARG5)})",
            [.array(orders), .array(expenses), .object(settings), .array(clients),
             .object(currencies), .number(now.timeIntervalSince1970 * 1000)],
            as: [PnlPeriod].self)
    }

    // MARK: - The shelf

    /// A new spool, as the shelf records it. `refused` is `material` when it
    /// has none — a spool no job can be matched to.
    public func newSpool(_ input: [String: JSONValue], id: String, today: String) throws -> SpoolWritten {
        try runtime.call2("KhaytSpoolEdit.newSpool(ARG0, {id: ARG1, today: ARG2})",
                          [.object(input), .string(id), .string(today)], as: SpoolWritten.self)
    }

    /// Correct a spool.
    ///
    /// BOTH COME BACK CHANGED. The spool is corrected, and the shop's colour
    /// library — a setting — learns any colour variant that was named. Write
    /// them together, or the next editor offers a list that has forgotten what
    /// was just typed.
    public func editSpool(_ spool: JSONValue, input: [String: JSONValue],
                          settings: [String: JSONValue], today: String) throws -> SpoolEdited {
        try runtime.call2(
            "(function(){var s = ARG0, set = ARG2;"
          + " var out = KhaytSpoolEdit.applyEdit(s, ARG1, {today: ARG3, settings: set});"
          + " return {spool: s, settings: set, refused: out.refused, colourAdded: out.colourAdded};})()",
            [spool, .object(input), .object(settings), .string(today)], as: SpoolEdited.self)
    }

    /// The colour variants a shop has named for a material.
    public func spoolColours(settings: [String: JSONValue], material: String) throws -> [String] {
        try runtime.call2("KhaytSpoolEdit.coloursFor(ARG0, ARG1)",
                          [.object(settings), .string(material)], as: [String].self)
    }

    // MARK: - Who the shop's customers are

    /// A customer's name, in the language the shop writes.
    ///
    /// Not the interface language. `read` tries the language asked for ONLY if
    /// the shop writes in it, then the shop's own languages, then anything
    /// filled in at all — so an English interface shows a Turkish shop its
    /// Turkish name rather than the stale `nameEn` from setup.
    public func customerName(_ client: JSONValue, language: String,
                             settings: [String: JSONValue]) throws -> String {
        try runtime.call2("(KhaytContentLanguages.read(ARG0, 'name', ARG1, ARG2) || '')",
                          [client, .string(language), .object(settings)], as: String.self)
    }

    /// The other language's name, for the second line. Empty for a
    /// single-language shop, and empty when that field was left blank — where
    /// repeating the primary name would just look like a bug.
    public func customerAltName(_ client: JSONValue, language: String,
                                settings: [String: JSONValue]) throws -> String {
        try runtime.call2("(KhaytContentLanguages.readAlt(ARG0, 'name', ARG1, ARG2) || '')",
                          [client, .string(language), .object(settings)], as: String.self)
    }

    // MARK: - Taking a job

    /// What one part of a job costs to make.
    ///
    /// Material, machine wear, electricity, labour and the failure allowance —
    /// the figure every price is built on top of, and the same function the
    /// calculator screen and the phone's quote endpoint both call.
    public func partCost(_ part: JSONValue, inventory: [JSONValue],
                         settings: [String: JSONValue]) throws -> Double {
        try runtime.call2("KhaytCalculatorCost.computePartBaseCost(ARG0, {inventory: ARG1, settings: ARG2})",
                          [part, .array(inventory), .object(settings)], as: Double.self)
    }

    /// A new job, as the book records it.
    ///
    /// `settings` COMES BACK CHANGED: allocating an invoice number and a quote
    /// sequence advances counters the shop owns, and an allocation nobody
    /// writes down hands the same number to the next job. Write both.
    public func newOrder(_ input: [String: JSONValue], orders: [JSONValue],
                         settings: [String: JSONValue], now: Date,
                         tokens: (tracking: [UInt8], quoteApproval: [UInt8])) throws -> NewOrder {
        let bytes = { (b: [UInt8]) in JSONValue.array(b.map { .number(Double($0)) }) }
        return try runtime.call2(NEW_ORDER_SCRIPT,
                                 [.object(input), .array(orders), .object(settings),
                                  .number(now.timeIntervalSince1970 * 1000),
                                  .object(["tracking": bytes(tokens.tracking),
                                           "quoteApproval": bytes(tokens.quoteApproval)])],
                                 as: NewOrder.self)
    }

    // MARK: - Money received

    /// Whether this order counts as paid, partly paid or unpaid.
    ///
    /// The stored `paymentStatus` field is an answer that was true when it was
    /// written. This is the answer now, by the rule every report reads it with.
    public func paymentStatus(of order: JSONValue) throws -> String {
        try runtime.call("KhaytOrderPayment", "statusOf", [order], as: String.self)
    }

    /// Where recording a payment would reach outside the shop's own book.
    ///
    /// Ask before writing anything, for the same reason a status change does: a
    /// `payment_received` webhook or a receipt email cannot be sent from here
    /// and cannot be sent afterwards.
    public func paymentOutbound(order: JSONValue, settings: [String: JSONValue],
                                clients: [JSONValue]) throws -> [Outbound] {
        try runtime.call2("KhaytOrderPayment.outboundFor(ARG0, {settings: ARG1, clients: ARG2})",
                          [order, .object(settings), .array(clients)], as: [Outbound].self)
    }

    /// Record what a customer has paid, and what that makes the order.
    ///
    /// The status is DERIVED here, never taken from the caller — a stored
    /// status that disagrees with the arithmetic is how an order sits in
    /// receivables after it was settled.
    public func recordPayment(order: JSONValue, amount: Double, method: String,
                              paidAt: String, today: String) throws -> PaymentRecorded {
        try runtime.call2(PAYMENT_SCRIPT,
                          [order, .number(amount), .string(method), .string(paidAt), .string(today)],
                          as: PaymentRecorded.self)
    }

    /// Undo a payment: the money was never received, or was recorded against
    /// the wrong job.
    public func clearPayment(order: JSONValue) throws -> PaymentRecorded {
        try runtime.call2("(function(){var o = ARG0; var r = KhaytOrderPayment.clearPayment(o);"
                        + " return { order: o, effects: r.effects.map(function(e){ return e.type; }) };})()",
                          [order], as: PaymentRecorded.self)
    }

    public func raw<T: Decodable>(_ script: String, as type: T.Type) throws -> T {
        let value = try runtime.evaluate("JSON.stringify(\(script))")
        guard let json = value.toString(), let data = json.data(using: .utf8) else {
            throw KhaytJSError.unexpectedResult(script)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

/// The invoice, and the vocabulary it is written in.
///
/// Every helper here is the smallest honest version of the renderer's: `t`
/// reads the catalogue this runtime already loaded, `escapeHtml` escapes the
/// five characters that matter in an attribute, and money is two decimals.
///
/// `shopField` answers with what Swift resolved through the content languages,
/// because which language a shop writes in is the app's question and it has
/// already asked it.
///
/// `safeCssColor` and `safeBizLogo` REFUSE rather than pass through: a document
/// that goes to a customer must not carry an arbitrary URL or an unvalidated
/// colour out of the settings file.
private let INVOICE_SCRIPT = """
(function () {
  var order = ARG0, settings = ARG1, clients = ARG2, currencies = ARG3;
  var language = ARG4, money = ARG5, sellerName = ARG6, sellerAddress = ARG7;

  var ARABIC_DIGITS = '\u{0660}\u{0661}\u{0662}\u{0663}\u{0664}\u{0665}\u{0666}\u{0667}\u{0668}\u{0669}';
  var locales = globalThis.KhaytLocales || {};
  function say(lang, key, vars) {
    var table = locales[lang] || locales.en || {};
    var s = table[key] || (locales.en || {})[key] || key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function money2(n) {
    var v = +n;
    return (isFinite(v) ? v : 0).toFixed(2);
  }

  var ctx = {
    settings: settings, clients: clients, CURRENCIES: currencies,
    i18n: { current: language, tIn: function (l, k, v) { return say(l, k, v); } },
    t: function (k, v) { return say(language, k, v); },
    escapeHtml: esc,
    fmtMoney: money2,
    // formatPrintDate is NOT overridden: turning an ISO string into a date a
    // customer reads is the document's own rule, and this app printed
    // "2026-07-02T14:32:00.000Z" under DATE for as long as it had its own.
    shopField: function (base) { return base === 'addr' ? sellerAddress : sellerName; },
    // Refused rather than passed through: this document goes to a customer.
    safeBizLogo: function () { return ''; },
    safeCssColor: function (v, fallback) {
      return /^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? String(v) : fallback;
    },
    // renderClientSub is NOT overridden: the contact line under the bill-to
    // name is the document's own rule, and a host that supplies its own prints
    // a different invoice. Khayt stopped passing one for the same reason.
    BRAND_MARK_SVG: '',
    orderCurrency: function (o) { return o.currency || settings.currency || 'SAR'; },
    clientCurrency: function () { return settings.currency || 'SAR'; },
    payStatus: function (o) {
      return globalThis.KhaytOrderPayment
        ? globalThis.KhaytOrderPayment.statusOf(o)
        : (o.paymentStatus || 'unpaid');
    },
    hijriDate: function () { return ''; },
    toArabicNumerals: function (s) {
      return String(s).replace(/[0-9]/g, function (d) { return ARABIC_DIGITS[+d]; });
    },
  };
  for (var key in money) ctx[key] = money[key];
  return KhaytInvoiceDocument.invoiceHtml(order, ctx);
})()
"""

/// A new job, and the counters taking it advanced.
private let NEW_ORDER_SCRIPT = """
(function () {
  var settings = ARG2;
  var order = KhaytOrderNew.newOrder(ARG0,
    { settings: settings, orders: ARG1, now: ARG3, tokens: ARG4 });
  return { order: order, settings: settings };
})()
"""

/// A failed inspection, as the shared rule writes it.
private let QC_FAILURE_SCRIPT = """
(function () {
  var order = ARG0;
  var r = KhaytQcFailure.record(order, {
    failureType: ARG1, severity: ARG2, reason: ARG3, weight: ARG4, inspector: ARG5
  }, { inventory: ARG6, now: ARG7, wasteId: ARG8, defaultReason: ARG9 });
  return { order: order, waste: r.waste };
})()
"""

/// Recording a payment, and what the order becomes.
private let PAYMENT_SCRIPT = """
(function () {
  var order = ARG0, amount = ARG1, method = ARG2, paidAt = ARG3, today = ARG4;
  var r = KhaytOrderPayment.recordPayment(order, { amount: amount, method: method, paidAt: paidAt },
                                          { today: today });
  return { order: order, effects: r.effects.map(function (e) { return e.type; }) };
})()
"""

/// Moving a job, as the two shared modules do it between them.
///
/// EVERY EFFECT IS CLASSIFIED, and the default case is `unhandled` rather than
/// "ignore". `apply()` returns an ordered list of what a move asks for, and a
/// list this app silently walked past would be how a future effect — a new
/// notification, a new record — goes missing on the Mac and nowhere else.
///
///   performed  this app does it, here or in the write that follows
///   cosmetic   a toast or a redraw; nothing outside this book depends on it
///   outbound   leaves the shop entirely — see below
///   unhandled  reported to the caller, which refuses the move
///
/// `apply()` asks for the webhook, the Telegram message, the email and the
/// portal refresh on EVERY move, because whether any of them reaches anybody
/// depends on what the shop has configured and it is not this module's business
/// to know. `outboundFor()` is what knows, and the caller asks it first: a move
/// that would actually reach somebody is refused before this runs. So finding
/// them here means the shop has none of it switched on, and they are named
/// rather than dropped.
private let MOVE_SCRIPT = """
(function () {
  var order = ARG0, status = ARG1, orders = ARG2, settings = ARG3;
  var inventory = ARG4, consumables = ARG5, machines = ARG6, now = ARG7, today = ARG8;
  var holdReason = ARG9, qc = ARG10;

  var gate = KhaytOrderStatus.gate(order, status, { orders: orders, settings: settings });
  if (!gate.ok) return { ok: false, gate: gate };

  var moveCtx = { now: now, inventory: inventory };
  // Present only when there is something to say, because the rules distinguish
  // "no reason given" from "nobody mentioned the reason".
  if (holdReason !== null) moveCtx.holdReason = holdReason;
  // Only a pass reaches here. A failure is a waste entry and a decision about
  // scrapping or reprinting, and it does not end in `completed`.
  if (qc !== null) moveCtx.qc = qc;
  var moved = KhaytOrderStatus.apply(order, status, moveCtx);
  var notices = moved.notices.slice();
  var performed = [], cosmetic = [], outbound = [], unhandled = [], activity = null;

  var COSMETIC = {
    render: 1, toast_updated: 1, toast_updated_undoable: 1,
    // A congratulation when a customer reaches a new tier. Nothing is written.
    tier_check: 1,
    // Writes a local HTML file for the customer to look at. Going stale is not
    // the same as being missed, and it reaches nobody.
    export_status_page: 1
  };
  // Asked for on every move; reaches somebody only when the shop has it
  // configured, which the caller has already checked.
  var OUTBOUND = { webhook: 1, order_webhook: 1, telegram: 1, email: 1, republish_portal: 1 };

  for (var i = 0; i < moved.effects.length; i++) {
    var e = moved.effects[i];
    if (e.type === 'deduct_filament') {
      var d = KhaytOrderDeduction.deductForOrder(order, {
        settings: settings, inventory: inventory, consumables: consumables,
        machines: machines, today: today
      });
      notices = notices.concat(d.notices);
      performed.push(e.type);
    } else if (e.type === 'deduct_packaging') {
      var p = KhaytOrderDeduction.deductPackaging(order, { consumables: consumables });
      notices = notices.concat(p.notices);
      performed.push(e.type);
    } else if (e.type === 'activity_log') {
      activity = e.text;
      performed.push(e.type);
    } else if (e.type === 'save') {
      performed.push(e.type);
    } else if (e.type === 'ensure_survey_token') {
      // The token is minted by the caller, which has a random source.
      performed.push(e.type);
    } else if (COSMETIC[e.type]) {
      cosmetic.push(e.type);
    } else if (OUTBOUND[e.type]) {
      outbound.push(e.type);
    } else {
      unhandled.push(e.type);
    }
  }

  return {
    ok: true, gate: gate, order: order, inventory: inventory, consumables: consumables,
    notices: notices, activity: activity,
    performed: performed, cosmetic: cosmetic, outbound: outbound, unhandled: unhandled
  };
})()
"""

/// The one expression that puts the three modules together.
///
/// `cost` is the parts, the way the renderer computes it. The renderer adds
/// shipping through `convertToBase`; this does not, because an order in this
/// store has no `shippingCost` and inventing a conversion for a field that is
/// never set would be a difference waiting to appear.
private let KPI_SCRIPT = """
(function () {
  var ctx = { settings: ARG2, clients: ARG1 };
  var M = globalThis.KhaytOrderMoney;
  var b = globalThis.KhaytKpiRows.bounds(ARG3);
  return globalThis.KhaytKpi.computeKpis(globalThis.KhaytKpiRows.kpiRows({
    orders: ARG0, from: b[0], to: b[1],
    money: function (o) {
      return {
        revenue: M.orderNetRevenueBase(o, ctx),
        cost: (o.parts || []).reduce(function (s, p) {
          return s + (+p.unitCost || 0) * (+p.qty || 1);
        }, 0),
        outstanding: M.orderOwedBase(o, ctx)
      };
    },
    clientName: function (o) { return o.client || ""; },
    unassigned: ARG4
  }));
})()
"""
