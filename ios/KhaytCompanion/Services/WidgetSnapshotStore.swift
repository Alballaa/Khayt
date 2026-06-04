import Foundation

/// Data shared with the Khayt home screen widget (App Group).
struct WidgetSnapshot: Codable {
    var shopName: String
    var queued: Int
    var printing: Int
    var post: Int
    var qc: Int
    var completedToday: Int
    var connected: Bool
    var updatedAt: Date
}

enum WidgetSnapshotStore {
    static let appGroupID = "group.com.khaytapp.companion"
    private static let key = "khayt.widget.snapshot"

    static func save(_ snapshot: WidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults(suiteName: appGroupID)?.set(data, forKey: key)
    }

    static func load() -> WidgetSnapshot? {
        guard let data = UserDefaults(suiteName: appGroupID)?.data(forKey: key),
              let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else { return nil }
        return snap
    }
}
