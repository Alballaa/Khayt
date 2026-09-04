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
