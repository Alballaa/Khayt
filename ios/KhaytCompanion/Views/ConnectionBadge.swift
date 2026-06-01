import SwiftUI

struct ConnectionBadge: View {
    @EnvironmentObject private var health: ConnectionHealth

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: health.state.systemImage)
            Text(health.state.label)
                .font(.caption.bold())
        }
        .foregroundStyle(health.state == .connected ? .green : .orange)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(.ultraThinMaterial, in: Capsule())
    }
}
