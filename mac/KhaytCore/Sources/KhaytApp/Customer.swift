import Foundation

/// A customer, assembled from the jobs done for them.
///
/// Khayt has a `clients` collection, and on this shop's book it is empty: every
/// order carries a `client` name and a `clientId` that is null throughout. So
/// the people here are derived from the work, which is also the honest reading —
/// a customer a shop has never billed is not yet a customer.
///
/// Grouped by name, case- and whitespace-insensitively. "Nouf Al-Dossari" and
/// "nouf al-dossari " are one person who has been typed in twice, and showing
/// them as two hides exactly the total someone opened this screen to find.
struct Customer: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let orders: [Order]

    var jobCount: Int { orders.count }
    var billed: Double { orders.reduce(0) { $0 + $1.price } }
    var paid: Double { orders.reduce(0) { $0 + $1.paidAmount } }
    var owed: Double { orders.filter { !$0.isSettled }.reduce(0) { $0 + $1.owed } }
    var overdueCount: Int { orders.count { $0.isOverdue() } }
    var isSettled: Bool { owed < 0.005 }

    /// The most recent job, by date. What "last seen" means for a shop.
    var lastJob: Date? { orders.compactMap(\.day).max() }

    /// Live work — anything not delivered or cancelled. The number that decides
    /// whether this person is expecting a call from you.
    var openCount: Int {
        orders.count {
            guard let stage = Stage.of($0) else { return true }
            return stage != .delivered && stage != .cancelled
        }
    }

    static func from(_ orders: [Order]) -> [Customer] {
        var buckets: [String: (name: String, orders: [Order])] = [:]
        for order in orders {
            let name = order.client.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { continue }
            let key = name.lowercased()
            // The first spelling seen wins the display name, so the screen does
            // not change what it calls someone as jobs are added.
            buckets[key, default: (name, [])].orders.append(order)
        }
        return buckets.map { Customer(id: $0.key, name: $0.value.name, orders: $0.value.orders) }
    }
}
