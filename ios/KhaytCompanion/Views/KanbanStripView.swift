import SwiftUI

/// Horizontal kanban stage summary for Home.
struct KanbanStripView: View {
    let status: ShopStatus
    var onSelect: ((OrderStatus) -> Void)?

    private var stages: [(OrderStatus, Int)] {
        [
            (.pending, status.pending),
            (.printing, status.printing),
            (.post, status.post),
            (.qc, status.qc)
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.tr("tab.orders"))
                .font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(stages, id: \.0) { stage, count in
                        Button {
                            onSelect?(stage)
                        } label: {
                            KanbanChip(stage: stage, count: count)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private struct KanbanChip: View {
    let stage: OrderStatus
    let count: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: CompanionTheme.statusIcon(for: stage.rawValue))
                    .font(.caption)
                Text(stage.localizedLabel)
                    .font(.caption.bold())
            }
            .foregroundStyle(CompanionTheme.statusColor(for: stage.rawValue))
            Text("\(count)")
                .font(.title2.bold())
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(CompanionTheme.statusColor(for: stage.rawValue).opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }
}
