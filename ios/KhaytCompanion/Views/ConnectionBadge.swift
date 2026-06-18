import SwiftUI

struct ConnectionBadge: View {
    @EnvironmentObject private var health: ConnectionHealth

    var body: some View {
        let connected = health.state == .connected
        let color = connected ? KhaytDesign.ok : KhaytDesign.danger
        // No own capsule/border: in the nav bar the system already provides a
        // container (a glass pill on iOS 26), so a second one looks like nested
        // frames. Just a status dot + label.
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(health.state.label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(color)
        }
    }
}
