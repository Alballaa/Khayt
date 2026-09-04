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

    public func raw<T: Decodable>(_ script: String, as type: T.Type) throws -> T {
        let value = try runtime.evaluate("JSON.stringify(\(script))")
        guard let json = value.toString(), let data = json.data(using: .utf8) else {
            throw KhaytJSError.unexpectedResult(script)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

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
