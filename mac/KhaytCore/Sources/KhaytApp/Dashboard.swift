import SwiftUI
import KhaytCore

/// The screen a shop opens on.
///
/// Every figure here comes from `lib/dashboard-facts.js` and `lib/kpi.js`,
/// bundled and run. Not one of them is arithmetic written in Swift — a margin
/// this app worked out for itself would be a second answer to a question the
/// shop's other app already answers, and the two would disagree in a way nobody
/// could see until an accountant did.
struct Dashboard: View {
    let shop: Shop

    private let columns = [GridItem(.adaptive(minimum: 210, maximum: 320), spacing: 14)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let attention = shop.attention, !attention.items.isEmpty {
                    // First, and above the figures. A shop that opens this app
                    // is asking "is anything wrong" before it asks "how are we
                    // doing", and a late job under a revenue tile is a late job
                    // nobody sees.
                    NeedsAttention(items: attention.items, shop: shop)
                }
                if let facts = shop.facts {
                    Work(facts: facts, shop: shop)
                }
                if shop.facts?.showsMoney != false {
                    MoneyTiles(shop: shop)
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(.background)
        .overlay {
            if shop.facts == nil {
                ContentUnavailableView(shop.words.callIt("mac.no_figures"),
                                       systemImage: "chart.bar",
                                       description: Text(shop.words.callIt("mac.no_figures_hint")))
            }
        }
    }
}

/// What is late, wrong, or about to be.
private struct NeedsAttention: View {
    let items: [DashboardFacts.Item]
    let shop: Shop

    var body: some View {
        DetailSection(shop.words.callIt("mac.needs_attention")) {
            VStack(spacing: 0) {
                ForEach(items) { item in
                    HStack(spacing: 10) {
                        Image(systemName: symbol(item.kind))
                            .foregroundStyle(item.severity == "bad" ? .red : .orange)
                            .frame(width: 18)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(item.name ?? item.id).lineLimit(1)
                            Text(item.id)
                                .font(.caption2)
                                .monospacedDigit()
                                .foregroundStyle(.tertiary)
                        }
                        Spacer(minLength: 8)
                        if let late = item.daysLate, late > 0 {
                            // Said in words, not by colour alone. This is the
                            // line that decides whether someone gets a phone
                            // call today.
                            Text(shop.words.callIt("mac.days_late").replacingOccurrences(
                                of: "{n}", with: "\(late)"))
                                .font(.callout)
                                .monospacedDigit()
                                .foregroundStyle(.orange)
                        }
                    }
                    .padding(.vertical, 7)
                    if item.id != items.last?.id { Divider() }
                }
            }
            .padding(.horizontal, 12)
            .background(.quinary, in: RoundedRectangle(cornerRadius: 8))
        }
    }

    private func symbol(_ kind: String) -> String {
        switch kind {
        case "machine": "printer.dotmatrix"
        case "nozzle": "wrench.adjustable"
        default: "clock.badge.exclamationmark"
        }
    }
}

/// What the shop is doing.
private struct Work: View {
    let facts: DashboardFacts
    let shop: Shop

    var body: some View {
        DetailSection(shop.words.callIt("mac.the_floor")) {
            HStack(spacing: 14) {
                Tile(value: "\(facts.printingCount)", label: shop.words.callIt("queue.printing"),
                     symbol: "printer", tint: .blue)
                Tile(value: "\(facts.activeCount)", label: shop.words.callIt("mac.open_count"),
                     symbol: "tray.full", tint: .secondary)
                Tile(value: "\(facts.lateCount)", label: shop.words.callIt("mac.late_tile"),
                     symbol: "exclamationmark.triangle",
                     tint: facts.lateCount > 0 ? .orange : .secondary)
                Tile(value: "\(facts.fleet.live)/\(facts.fleet.total)",
                     label: shop.words.callIt("mac.machines"),
                     symbol: "server.rack", tint: .secondary)
            }
        }
    }
}

/// The money, when this shop deals in money.
///
/// ONE figure, and it is the one the app computes itself: what is still owed,
/// which is `price - paid` summed over the open jobs — the same arithmetic the
/// toolbar shows, so the two cannot disagree.
///
/// Revenue, margin and average job are NOT here. `lib/kpi.js` computes them, but
/// from rows a caller has already scoped to a period and converted to base
/// currency, and that normalising lives inside `renderer/analytics.js` rather
/// than in `lib/`. Calling it with raw orders returns zeros — which this screen
/// briefly showed, beside a toolbar reading 52,691.57 SAR. A dashboard that
/// contradicts itself is worse than one with fewer tiles on it.
private struct MoneyTiles: View {
    let shop: Shop

    var body: some View {
        DetailSection(shop.words.callIt("mac.money")) {
            HStack(spacing: 14) {
                Tile(value: Money.short(shop.owed, shop.currency),
                     label: shop.words.callIt("flow.owed"), symbol: "clock.arrow.circlepath",
                     tint: shop.owed > 0 ? .orange : .secondary)
                // No second "Late" tile here. The floor already has one, from
                // the attention engine, and this one counted something else —
                // unpaid AND overdue rather than simply overdue. Two tiles with
                // the same label and different numbers on one screen is the
                // fault this section was just rewritten to remove.
                Tile(value: "\(shop.customers.count)", label: shop.words.callIt("tab.clients"),
                     symbol: "person.2", tint: .secondary)
                Tile(value: "\(shop.files.count)", label: shop.words.callIt("mac.library"),
                     symbol: "square.grid.2x2", tint: .secondary)
            }
        }
    }
}

/// A figure worth reading from across the room.
private struct Tile: View {
    let value: String
    let label: String
    let symbol: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(label, systemImage: symbol)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
                .labelStyle(.titleAndIcon)
                .lineLimit(1)
            Text(value)
                .font(.system(size: 24, weight: .medium))
                .monospacedDigit()
                .foregroundStyle(tint == .secondary ? AnyShapeStyle(.primary) : AnyShapeStyle(tint))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(.quinary, in: RoundedRectangle(cornerRadius: 8))
    }
}

