import SwiftUI

struct ConnectionBadge: View {
    @EnvironmentObject private var health: ConnectionHealth

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(dotColor)
                .frame(width: 7, height: 7)
                .shadow(color: dotColor.opacity(health.state == .connected ? 0.8 : 0), radius: 4)
            Text(health.state.label)
                .font(.caption.bold())
                .foregroundStyle(KhaytDesign.textDim)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(KhaytDesign.surface2, in: Capsule())
        .overlay(Capsule().stroke(KhaytDesign.border, lineWidth: 1))
    }

    private var dotColor: Color {
        switch health.state {
        case .connected: return KhaytDesign.ok
        case .unauthorized: return KhaytDesign.warn
        case .unknown: return KhaytDesign.textMuted
        case .unreachable: return KhaytDesign.danger
        }
    }
}
