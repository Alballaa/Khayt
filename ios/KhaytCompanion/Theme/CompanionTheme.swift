import SwiftUI

/// Shared visual language for Khayt Companion (until a full redesign ships).
enum CompanionTheme {
    static let brand = Color(red: 0.39, green: 0.40, blue: 0.95)
    static let lowStockThresholdGrams = 200.0

    static func statusColor(for status: String) -> Color {
        switch status.lowercased() {
        case "pending": return .blue
        case "printing": return .orange
        case "post": return .purple
        case "qc": return .teal
        case "completed": return .green
        case "on_hold": return .gray
        case "idle", "ready": return .green
        case "busy", "printing": return .orange
        default: return .secondary
        }
    }

    static func statusIcon(for status: String) -> String {
        switch status.lowercased() {
        case "pending": return "clock"
        case "printing": return "printer.fill"
        case "post": return "paintbrush"
        case "qc": return "checkmark.seal"
        case "completed": return "checkmark.circle.fill"
        case "on_hold": return "pause.circle"
        default: return "circle"
        }
    }
}

struct CompanionStatusBadge: View {
    let status: String
    var compact = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: CompanionTheme.statusIcon(for: status))
            Text(OrderStatus(rawValue: status)?.label ?? status.capitalized)
        }
        .font(compact ? .caption2.bold() : .caption.bold())
        .padding(.horizontal, compact ? 6 : 8)
        .padding(.vertical, compact ? 3 : 4)
        .foregroundStyle(CompanionTheme.statusColor(for: status))
        .background(CompanionTheme.statusColor(for: status).opacity(0.15), in: Capsule())
    }
}

enum CompanionHaptics {
    static func success() {
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif
    }

    static func warning() {
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        #endif
    }
}
