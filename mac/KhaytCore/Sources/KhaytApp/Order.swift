import Foundation

/// One job in the shop's book.
///
/// Decoded leniently on purpose. This store is written by the Electron app, and
/// a newer build will put fields here that this app has never heard of; a
/// stricter decoder would drop whole orders over a field it does not use. It is
/// also genuinely loose data: `clientId`, `dueDate` and `paymentMethod` are all
/// null across every order in the seed store, `price` arrives as an integer
/// where `costBasis` arrives as a double, and `priority` is a bool.
struct Order: Identifiable, Decodable, Hashable, Sendable {
    let id: String
    let date: String
    let status: String
    let project: String
    let client: String
    let currency: String
    let price: Double
    let paidAmount: Double
    let costBasis: Double
    let paymentStatus: String
    /// How the last payment arrived. Optional because an unpaid job has no
    /// answer, and "cash" is a claim rather than a default.
    let paymentMethod: String?
    let printTime: Double
    let priority: Bool
    /// 'normal' | 'high' | 'urgent'. Optional because an older record carries
    /// only the boolean above — `Shop.priorityOf` reads the pair.
    let priorityLevel: String?
    let notes: String
    let machineId: String?
    let completedAt: String?
    let deliveredAt: String?
    let dueDate: String?
    let parts: [Part]

    struct Part: Decodable, Hashable, Identifiable, Sendable {
        let id: String
        let name: String
        let material: String
        let qty: Int
        let printWeight: Double
        let unitCost: Double
        let colour: String
    }

    /// What the shop is still owed. Not a Swift opinion about money — the
    /// arithmetic that decides whether a customer gets chased lives in the
    /// shared core, and this is only the difference the table sorts on.
    var owed: Double { max(0, price - paidAmount) }

    var isSettled: Bool { owed < 0.005 }

    /// Absent, unparseable and future dates all mean "not overdue". A red badge
    /// on a job that is fine is worse than no badge at all.
    func isOverdue(now: Date = Date()) -> Bool {
        guard !isSettled, let due = Self.day(dueDate) else { return false }
        return due < now
    }

    var day: Date? { Self.day(date) }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func day(_ s: String?) -> Date? {
        guard let s, !s.isEmpty else { return nil }
        // Both shapes are in the store: "2026-08-08" and a full ISO timestamp.
        if let d = dayFormatter.date(from: String(s.prefix(10))) { return d }
        return ISO8601DateFormatter().date(from: s)
    }
}

/// The statuses Khayt uses, in the order a job moves through them.
///
/// Taken from `lib/order-progress.js`, which is bundled into KhaytCore — the
/// sidebar's order is the pipeline's order, not alphabetical and not whatever
/// the data happened to contain.
enum Stage: String, CaseIterable, Identifiable, Sendable {
    // In the order work moves through them, which is also the order the board
    // and the sidebar draw. `on_hold` sits between pending and printing because
    // that is where a job stops: nothing is held before it is accepted.
    case quote, pending, on_hold, printing, post, qc, completed, delivered, cancelled

    var id: String { rawValue }

    /// Khayt's own word for each stage, so the two apps call one thing one
    /// thing. `cancelled` is the exception: the shared catalogue has no word for
    /// it, so the Mac app's own is used and marked as such in `Words.own`.
    var key: String {
        switch self {
        case .quote: "queue.quote"
        case .pending: "queue.pending"
        case .on_hold: "queue.on_hold"
        case .printing: "queue.printing"
        case .post: "queue.post"
        case .qc: "queue.qc"
        case .completed: "queue.completed"
        case .delivered: "queue.delivered"
        case .cancelled: "mac.cancelled"
        }
    }

    /// SF Symbols, not emoji. The Electron app puts a coloured emoji next to
    /// almost every label, and it is a large part of why it reads as a web page:
    /// emoji do not take the text colour, do not thin at small sizes, and do not
    /// match the rest of the system.
    var symbol: String {
        switch self {
        case .quote: "doc.text"
        case .pending: "clock"
        case .on_hold: "pause.circle"
        case .printing: "printer"
        // Washing, curing, sanding — the work after the printer stops.
        case .post: "sparkles"
        // Inspection, not approval: a job in QC is being looked at.
        case .qc: "magnifyingglass"
        case .completed: "checkmark.circle"
        case .delivered: "shippingbox"
        case .cancelled: "xmark.circle"
        }
    }

    /// The columns the board draws, in the order work moves through them.
    ///
    /// Here rather than inside the view because `board` is keyed by EVERY stage
    /// — the dictionary is the whole book grouped, and the screen chooses. Two
    /// places deciding which stages are "on the board" is how a test comes to
    /// agree with a list nobody is looking at.
    ///
    /// Delivered and cancelled are off it on purpose: they are where work goes
    /// to stop being work, and a column of two hundred delivered jobs buries the
    /// four that need doing.
    static let boardColumns: [Stage] = [.quote, .pending, .on_hold, .printing, .post, .qc, .completed]

    /// The stage a job is in, or nil for a status this app has no column for.
    ///
    /// DELIVERED IS NOT A STATUS. A handed-over job stays `completed` and
    /// carries a `deliveredAt`; that pair is what Khayt's own board reads, and
    /// reading `status` alone filed every delivered job under Completed here.
    /// The rule is `KhaytOrderStatus.stageOf` — mirrored rather than called
    /// because it is two comparisons on a decoded row and this runs per cell,
    /// and `StageParityTests` runs the shared one against it.
    ///
    /// Nil is not "no stage" — it is a job that will not appear on the board, so
    /// every caller has to decide what to do about it rather than filtering it
    /// away. `split` reaches here: a parent order replaced by the sub-orders
    /// that carry its price between them.
    static func of(_ order: Order) -> Stage? {
        if order.status == "completed", order.deliveredAt != nil { return .delivered }
        return Stage(rawValue: order.status)
    }
}
