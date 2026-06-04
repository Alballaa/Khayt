import SwiftUI

/// Shown app-wide when desktop LAN is not healthy.
struct ConnectionBanner: View {
    @EnvironmentObject private var health: ConnectionHealth

    var body: some View {
        if health.state != .connected {
            HStack(spacing: 10) {
                Image(systemName: health.state.systemImage)
                Text(message)
                    .font(.caption)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .foregroundStyle(.white)
            .background(bannerColor, in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal)
            .padding(.top, 6)
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

    private var bannerColor: Color {
        switch health.state {
        case .unauthorized: return .orange
        case .unknown: return .gray
        default: return .red
        }
    }
}
