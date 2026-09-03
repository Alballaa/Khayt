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
    let printTime: Double
    let priority: Bool
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
    case quote, pending, printing, completed, delivered, cancelled

    var id: String { rawValue }

    var title: String {
        switch self {
        case .quote: "Quotes"
        case .pending: "Waiting"
        case .printing: "On the printer"
        case .completed: "Done"
        case .delivered: "Delivered"
        case .cancelled: "Cancelled"
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
        case .printing: "printer"
        case .completed: "checkmark.circle"
        case .delivered: "shippingbox"
        case .cancelled: "xmark.circle"
        }
    }

    static func of(_ order: Order) -> Stage? { Stage(rawValue: order.status) }
}
