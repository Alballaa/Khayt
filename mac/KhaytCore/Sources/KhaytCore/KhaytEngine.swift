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
    ]

    public init(bundle: Bundle? = nil) throws {
        runtime = try JSRuntime(modules: Self.modules, bundle: bundle)
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

    public func raw<T: Decodable>(_ script: String, as type: T.Type) throws -> T {
        let value = try runtime.evaluate("JSON.stringify(\(script))")
        guard let json = value.toString(), let data = json.data(using: .utf8) else {
            throw KhaytJSError.unexpectedResult(script)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
