import Foundation

struct ShopStatus: Codable, Sendable {
    let queued: Int
    let pending: Int
    let printing: Int
    let post: Int
    let qc: Int
    let completedToday: Int
    let waiting: Int?

    enum CodingKeys: String, CodingKey {
        case queued, pending, printing, post, qc, waiting
        case completedToday = "completed_today"
    }

    var waitingCount: Int { waiting ?? 0 }
}

struct QueueOrder: Codable, Identifiable, Sendable {
    let id: String
    let project: String?
    let client: String?
    let status: String
    let machine: String?
    let machineId: String?
    let dueDate: String?
    let priority: String?

    var displayTitle: String {
        (project?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
            ?? id
    }

    var displayClient: String {
        client?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "—"
    }
}

struct WaitingListEntry: Codable, Identifiable, Sendable {
    let id: String
    let project: String?
    let clientName: String?
    let notes: String?
    let email: String?
    let phone: String?
    let material: String?
    let priority: String?
    let status: String?
    let estValue: Double?
    let reminderDate: String?
    let source: String?
    let submittedAt: String?

    var displayTitle: String {
        (project?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
            ?? L10n.tr("waiting.untitled")
    }

    var displayClient: String {
        (clientName?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? "—"
    }

    var priorityLabel: String {
        switch priority?.lowercased() {
        case "urgent": return L10n.tr("waiting.priority.urgent")
        case "high": return L10n.tr("waiting.priority.high")
        case "low": return L10n.tr("waiting.priority.low")
        default: return L10n.tr("waiting.priority.normal")
        }
    }
}

struct ClientInfo: Codable, Identifiable, Sendable {
    let id: String
    let nameEn: String?
    let nameAr: String?
    let phone: String?
    let email: String?

    var displayName: String {
        let en = nameEn?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let ar = nameAr?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if L10n.usesArabicLayout, !ar.isEmpty { return ar }
        if !en.isEmpty { return en }
        if !ar.isEmpty { return ar }
        return id
    }
}

struct MachineInfo: Codable, Identifiable, Sendable {
    let id: String
    let name: String?
    let type: String?
    let status: String?
    let hasPrinterApi: Bool?

    var supportsLiveTelemetry: Bool { hasPrinterApi == true }
}

struct MachineLiveStatus: Codable, Identifiable, Sendable {
    let id: String
    let name: String?
    let hasPrinterApi: Bool?
    let state: String?
    let progress: Int?
    let filename: String?
    let timeRemaining: Int?
    let tempNozzle: Int?
    let tempBed: Int?
    let error: String?
    let lastUpdated: Double?
    let apiType: String?

    var etaLabel: String? {
        guard let secs = timeRemaining, secs > 0 else { return nil }
        let mins = secs / 60
        if mins >= 60 { return "\(mins / 60)h \(mins % 60)m" }
        return "\(mins)m"
    }
}

struct QuoteLinkInfo: Codable, Sendable {
    let quoteUrl: String
    let statusUrl: String
    let canApprove: Bool?
    let expired: Bool?
    let quoteExpiresAt: String?
    let alreadyApproved: Bool?
}

struct NewOrderDraft: Sendable {
    var project: String = ""
    var client: String = ""
    var material: String = ""
    var price: String = ""
    var notes: String = ""
    var dueDate: String = ""
    var machineId: String = ""
    var asQuote: Bool = false
}

struct InventorySpool: Codable, Identifiable, Sendable {
    let id: String
    var material: String?
    var brand: String?
    var color: String?
    var weight: Double?
    var remaining: Double?
    var cost: Double?
    var purchasedAt: String?
    var addedAt: String?
    var materialType: String?
    var lot: String?
    var sku: String?
    var printTemp: Int?
    var bedTemp: Int?

    enum CodingKeys: String, CodingKey {
        case id, material, brand, color, weight, remaining, cost, purchasedAt, addedAt
        case materialType, lot, sku, printTemp, bedTemp
        case weightRemaining, weightTotal
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        material = try c.decodeIfPresent(String.self, forKey: .material)
        brand = try c.decodeIfPresent(String.self, forKey: .brand)
        color = try c.decodeIfPresent(String.self, forKey: .color)
        cost = try c.decodeIfPresent(Double.self, forKey: .cost)
        purchasedAt = try c.decodeIfPresent(String.self, forKey: .purchasedAt)
        addedAt = try c.decodeIfPresent(String.self, forKey: .addedAt)
        materialType = try c.decodeIfPresent(String.self, forKey: .materialType)
        lot = try c.decodeIfPresent(String.self, forKey: .lot)
        sku = try c.decodeIfPresent(String.self, forKey: .sku)
        printTemp = try c.decodeIfPresent(Int.self, forKey: .printTemp)
        bedTemp = try c.decodeIfPresent(Int.self, forKey: .bedTemp)
        remaining = try c.decodeIfPresent(Double.self, forKey: .remaining)
            ?? c.decodeIfPresent(Double.self, forKey: .weightRemaining)
        weight = try c.decodeIfPresent(Double.self, forKey: .weight)
            ?? c.decodeIfPresent(Double.self, forKey: .weightTotal)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(material, forKey: .material)
        try c.encodeIfPresent(brand, forKey: .brand)
        try c.encodeIfPresent(color, forKey: .color)
        try c.encodeIfPresent(weight, forKey: .weight)
        try c.encodeIfPresent(remaining, forKey: .remaining)
        try c.encodeIfPresent(cost, forKey: .cost)
        try c.encodeIfPresent(purchasedAt, forKey: .purchasedAt)
        try c.encodeIfPresent(addedAt, forKey: .addedAt)
        try c.encodeIfPresent(materialType, forKey: .materialType)
        try c.encodeIfPresent(lot, forKey: .lot)
        try c.encodeIfPresent(sku, forKey: .sku)
        try c.encodeIfPresent(printTemp, forKey: .printTemp)
        try c.encodeIfPresent(bedTemp, forKey: .bedTemp)
    }

    var displayLabel: String {
        let parts = [brand, material, color].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return parts.isEmpty ? id : parts.joined(separator: " · ")
    }

    var isLowStock: Bool {
        let grams = remaining ?? weight ?? 0
        return grams > 0 && grams <= 200
    }

    var hasOptionalMeta: Bool {
        !(sku ?? "").isEmpty || !(lot ?? "").isEmpty || printTemp != nil || bedTemp != nil
    }
}

struct OrderLogEntry: Codable, Identifiable, Sendable {
    let id: String
    let project: String?
    let client: String?
    let status: String
    let material: String?
    let price: Double?
    let dueDate: String?
    let date: String?
    let paymentStatus: String?
    let quoteExpiresAt: String?
    let quoteAcceptedAt: String?

    var displayTitle: String {
        (project?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? id
    }

    var displayClient: String {
        client?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "—"
    }
}

struct NFCFilamentTag: Sendable {
    let standard: String
    let manufacturer: String?
    let material: String?
    let colorName: String?
    let hex: String?
    let weight: Int?
    let printTemp: Int?
    let bedTemp: Int?
    let sku: String?
    let lot: String?

    var materialLabel: String {
        [manufacturer, material, colorName].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " – ")
    }
}

enum OrderStatus: String, CaseIterable, Hashable, Sendable {
    case pending, printing, post, qc, completed, on_hold

    var label: String {
        switch self {
        case .pending: return "Pending"
        case .printing: return "Printing"
        case .post: return "Post-processing"
        case .qc: return "QC"
        case .completed: return "Completed"
        case .on_hold: return "On hold"
        }
    }

    var nextInQueue: OrderStatus? {
        switch self {
        case .pending: return .printing
        case .printing: return .post
        case .post: return .qc
        case .qc: return .completed
        default: return nil
        }
    }
}

struct APIErrorResponse: Codable, Sendable {
    let error: String?
}

enum KhaytAPIError: LocalizedError, Sendable {
    case notConfigured
    case invalidURL
    case unauthorized
    case server(String)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Connect to your Khayt desktop app in Settings."
        case .invalidURL: return "Invalid server address."
        case .unauthorized: return "Wrong LAN PIN. Check Settings → LAN API on desktop."
        case .server(let msg): return msg
        case .transport(let err): return err.localizedDescription
        }
    }
}
