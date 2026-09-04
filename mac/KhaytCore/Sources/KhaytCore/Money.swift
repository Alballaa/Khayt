import Foundation

/// A shop's tax setup, as `lib/tax.js` models it.
///
/// Thirty country presets, in two modes. `inclusive` means the price a shop
/// types already contains the tax — true in the Gulf and most of Europe;
/// `exclusive` means it is added on top, as in the US and Canada. Getting that
/// backwards understates the tax due on every American and Canadian shop, so it
/// is a first-class part of the type rather than a flag someone might miss.
public struct TaxProfile: Codable, Sendable, Equatable {
    public enum Mode: String, Codable, Sendable { case inclusive, exclusive }

    public struct Rate: Codable, Sendable, Equatable {
        public let id: String
        public let label: String
        public let percent: Double
        public let compound: Bool?
    }

    public let name: String
    public let mode: Mode
    public let registration: String
    public let rates: [Rate]

    /// The combined percentage across every rate.
    public var totalPercent: Double { rates.reduce(0) { $0 + $1.percent } }
    /// A shop with no rate is not registered, whatever else is configured.
    public var isRegistered: Bool { totalPercent > 0 }
}

/// A price split into what the shop keeps and what it merely collects.
public struct TaxSplit: Codable, Sendable, Equatable {
    public let subtotal: Double
    public let taxTotal: Double
}

/// One dated instalment.
public struct Installment: Codable, Sendable, Equatable {
    public let dueDate: String
    public let amount: Double
    public let paidAt: String?
}

/// The money a job's price, deposit and credit notes divide into when it is
/// split across machines.
public struct SplitShare: Codable, Sendable, Equatable {
    public let price: Double
    public let paidAmount: Double
    public let credited: Double
}

/// Everything a quote resolves to.
public struct QuoteTotal: Codable, Sendable, Equatable {
    public let priceBeforeDiscount: Double
    public let discountAmount: Double
    public let subtotal: Double
    public let rushFee: Double
    public let total: Double
}


// MARK: - The dashboard

/// What `lib/dashboard-facts.js` says about a shop right now.
///
/// Decoded loosely on purpose: this module answers six different themes and
/// carries fields the Mac app has no screen for. A stricter decoder would fail
/// the whole dashboard over a key it never reads.
public struct DashboardFacts: Decodable, Sendable {
    public let showsMoney: Bool
    public let activeCount: Int
    public let printingCount: Int
    public let lateCount: Int
    public let owed: Double?
    public let fleet: Fleet
    public let attn: Attention

    public struct Fleet: Decodable, Sendable {
        public let total: Int
        public let live: Int
        public let offline: Int
        public let idle: Int
    }

    public struct Attention: Decodable, Sendable {
        public let count: Int
        public let items: [Item]
    }

    /// One thing that needs looking at. `kind` is `order`, `machine` or
    /// `nozzle`; `severity` is the module's word, not a colour chosen here.
    public struct Item: Decodable, Sendable, Identifiable, Hashable {
        public let severity: String
        public let kind: String
        public let id: String
        public let name: String?
        public let dueDate: String?
        public let daysLate: Int?
    }
}
