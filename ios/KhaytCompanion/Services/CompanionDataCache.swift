import Foundation

/// Persists the last successful LAN API payloads for offline / stale-data display.
enum CompanionDataCache {
    private static let key = "khayt.data.cache.v1"

    struct Snapshot: Codable {
        var status: ShopStatus?
        var queue: [QueueOrder]?
        var inventory: [InventorySpool]?
        var machines: [MachineInfo]?
        var recentOrders: [OrderLogEntry]?
        var quotes: [OrderLogEntry]?
        var waitingList: [WaitingListEntry]?
        var clients: [ClientInfo]?
        var savedAt: Date
    }

    static func load() -> Snapshot? {
        guard let data = UserDefaults.standard.data(forKey: key),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return nil }
        return snap
    }

    static func save(_ mutate: (inout Snapshot) -> Void) {
        var snap = load() ?? Snapshot(savedAt: Date())
        mutate(&snap)
        snap.savedAt = Date()
        guard let data = try? JSONEncoder().encode(snap) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}

extension ConnectionHealth {
    var isDesktopReachable: Bool { state == .connected }
}
