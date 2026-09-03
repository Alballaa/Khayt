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
