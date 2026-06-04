import SwiftUI

struct ConnectionBanner: View {
    @EnvironmentObject private var health: ConnectionHealth

    var body: some View {
        if health.state != .connected {
            HStack(spacing: 10) {
                Image(systemName: health.state.systemImage)
                    .foregroundStyle(iconColor)
                Text(message)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(KhaytDesign.text)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, KhaytDesign.pad)
            .padding(.vertical, 10)
            .background(iconColor.opacity(0.12))
            .overlay(alignment: .bottom) { KhaytThreadDivider() }
        }
    }

    private var message: String {
        switch health.state {
        case .unknown: return L10n.tr("connection.banner.checking")
        case .unreachable: return L10n.tr("connection.banner.unreachable")
        case .unauthorized: return L10n.tr("connection.banner.pin")
        case .connected: return ""
        }
    }

    private var iconColor: Color {
        switch health.state {
        case .unauthorized: return KhaytDesign.warn
        case .unknown: return KhaytDesign.textMuted
        default: return KhaytDesign.danger
        }
    }
}
