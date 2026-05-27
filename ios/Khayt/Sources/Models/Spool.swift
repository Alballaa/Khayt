import Foundation

struct Spool: Codable, Identifiable, Hashable {
    let id: String
    let material: String?
    let color: String?
    let brand: String?
    let weightTotal: Double?
    let weightRemaining: Double?
    let remaining: Double?
    let costPerKg: Double?
    let addedAt: String?

    var displayName: String {
        let parts = [brand, material, color].compactMap { $0?.isEmpty == false ? $0 : nil }
        return parts.isEmpty ? id : parts.joined(separator: " · ")
    }

    var grams: Double {
        remaining ?? weightRemaining ?? weightTotal ?? 0
    }

    var fillRatio: Double {
        let total = weightTotal ?? 1000
        guard total > 0 else { return 0 }
        return min(1, max(0, grams / total))
    }
}

struct NewSpool: Encodable {
    var material: String
    var color: String
    var brand: String
    var weightTotal: Double
    var weightRemaining: Double
    var costPerKg: Double
}
