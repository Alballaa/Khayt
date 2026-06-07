import SwiftUI

/// Shown when a screen is displaying persisted data because the desktop is unreachable.
struct CachedDataBanner: View {
    let savedAt: Date?

    var body: some View {
        if let savedAt {
            HStack(spacing: 8) {
                Image(systemName: "clock.arrow.circlepath")
                    .foregroundStyle(KhaytDesign.warn)
                Text(String(format: L10n.tr("offline.cached_at"), savedAt.formatted(date: .abbreviated, time: .shortened)))
                    .font(.caption)
                    .foregroundStyle(KhaytDesign.textDim)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, KhaytDesign.pad)
            .padding(.vertical, 6)
            .background(KhaytDesign.warnSoft)
        }
    }
}
