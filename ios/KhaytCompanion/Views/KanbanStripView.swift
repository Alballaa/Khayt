import SwiftUI

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
        KhaytCard(padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    KhaytSectionTitle(text: L10n.tr("tab.orders"))
                    Spacer()
                    KhaytPill(text: "\(status.queued) " + L10n.tr("stat.in_queue").lowercased(), color: KhaytDesign.accent)
                }
                KhaytThreadDivider()
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
}

private struct KanbanChip: View {
    let stage: OrderStatus
    let count: Int
    private var color: Color { KhaytDesign.statusColor(for: stage.rawValue) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(stage.localizedLabel)
                .font(.caption.bold())
                .foregroundStyle(color)
            KhaytMetric(value: "\(count)", unit: nil)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: KhaytDesign.radiusMD))
        .overlay(
            RoundedRectangle(cornerRadius: KhaytDesign.radiusMD)
                .stroke(color.opacity(0.28), lineWidth: 1)
        )
    }
}
