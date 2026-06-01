import Foundation

struct ShopStatus: Codable, Sendable {
    let queued: Int
    let pending: Int
    let printing: Int
    let post: Int
    let qc: Int
    let completedToday: Int

    enum CodingKeys: String, CodingKey {
        case queued, pending, printing, post, qc
        case completedToday = "completed_today"
    }
}

struct QueueOrder: Codable, Identifiable, Sendable {
    let id: String
    let project: String?
    let client: String?
    let status: String
    let machine: String?
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

struct MachineInfo: Codable, Identifiable, Sendable {
    let id: String
    let name: String?
    let type: String?
    let status: String?
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

    var displayLabel: String {
        let parts = [brand, material, color].compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return parts.isEmpty ? id : parts.joined(separator: " · ")
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

    var materialLabel: String {
        [manufacturer, material, colorName].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " – ")
    }
}

enum OrderStatus: String, CaseIterable, Sendable {
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
