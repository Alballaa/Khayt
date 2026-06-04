import WidgetKit
import SwiftUI

struct KhaytQueueEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct KhaytQueueProvider: TimelineProvider {
    func placeholder(in context: Context) -> KhaytQueueEntry {
        KhaytQueueEntry(date: Date(), snapshot: WidgetSnapshot(
            shopName: "My Shop",
            queued: 8,
            printing: 2,
            post: 1,
            qc: 3,
            completedToday: 5,
            connected: true,
            updatedAt: Date()
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (KhaytQueueEntry) -> Void) {
        completion(KhaytQueueEntry(date: Date(), snapshot: WidgetSnapshotStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KhaytQueueEntry>) -> Void) {
        let entry = KhaytQueueEntry(date: Date(), snapshot: WidgetSnapshotStore.load())
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct KhaytQueueWidgetView: View {
    let entry: KhaytQueueEntry

    var body: some View {
        if let s = entry.snapshot {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(s.shopName)
                        .font(.caption.bold())
                        .lineLimit(1)
                    Spacer()
                    Circle()
                        .fill(s.connected ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                }
                HStack(spacing: 12) {
                    metric("Queue", s.queued)
                    metric("Print", s.printing)
                    metric("Done", s.completedToday)
                }
                Text(s.connected ? "LAN connected" : "Offline")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding()
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Khayt")
                    .font(.headline)
                Text("Open app on shop Wi‑Fi")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
    }

    private func metric(_ label: String, _ value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(.title3.bold())
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}

struct KhaytQueueWidget: Widget {
    let kind = "KhaytQueueWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KhaytQueueProvider()) { entry in
            KhaytQueueWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Khayt Queue")
        .description("Queue size and printing count from your desktop.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

@main
struct KhaytWidgetBundle: WidgetBundle {
    var body: some Widget {
        KhaytQueueWidget()
    }
}

/// Duplicate for widget target — keep in sync with app `WidgetSnapshotStore`.
enum WidgetSnapshotStore {
    static let appGroupID = "group.com.khaytapp.companion"
    private static let key = "khayt.widget.snapshot"

    static func load() -> WidgetSnapshot? {
        guard let data = UserDefaults(suiteName: appGroupID)?.data(forKey: key),
              let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else { return nil }
        return snap
    }
}

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
