import SwiftUI

struct ConnectionBadge: View {
    @EnvironmentObject private var health: ConnectionHealth

    var body: some View {
        let connected = health.state == .connected
        let color = connected ? KhaytDesign.ok : KhaytDesign.danger
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(health.state.label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(color)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 3)
        .background(color.opacity(0.16), in: Capsule())
        .overlay(Capsule().stroke(color.opacity(0.2), lineWidth: 1))
    }
}
