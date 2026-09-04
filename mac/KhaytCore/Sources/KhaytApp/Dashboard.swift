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
    @Bindable var shop: Shop

    /// The ranges `renderer/analytics.js` offers, in its order.
    static let ranges: [(String, String)] = [
        ("month", "an.range.month"), ("last_month", "an.range.last_month"),
        ("quarter", "an.range.quarter"), ("year", "an.range.year"), ("all", "an.range.all"),
    ]

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
                // What the machines are ACTUALLY doing, under the count of how
                // many the book thinks are busy. The tile above is the book's
                // answer; this is the printers'. A shop opening this app to ask
                // "is it still going" should not have to change screens.
                RunningNow(shop: shop)
                // And what went wrong while nobody was looking. A notification
                // dismissed while the shop was making coffee is a notification
                // it never had, so the alerts are on the screen as well.
                WentWrong(shop: shop)
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

/// What the printers are doing, in one line each.
///
/// Only the ones that are actually running: a list of idle machines is the
/// machines screen, and this is the answer to "is it still going". Nothing at
/// all when nothing is printing, because an empty section under a heading reads
/// as a screen that failed to load.
private struct RunningNow: View {
    let shop: Shop

    private var running: [(Machine, KhaytEngine.PrinterStatus)] {
        shop.machines.compactMap { machine in
            guard let status = shop.printers.readings[machine.id]?.status,
                  status.state.lowercased() == "printing" else { return nil }
            return (machine, status)
        }
    }

    var body: some View {
        if !running.isEmpty {
            DetailSection(shop.words.callIt("mac.live")) {
                VStack(spacing: 10) {
                    ForEach(running, id: \.0.id) { machine, status in
                        Line(machine: machine, status: status, shop: shop)
                    }
                }
            }
        }
    }

    private struct Line: View {
        let machine: Machine
        let status: KhaytEngine.PrinterStatus
        let shop: Shop

        var body: some View {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(machine.name).font(.body.weight(.semibold)).lineLimit(1)
                    if !status.filename.isEmpty {
                        Text(status.filename)
                            .font(.caption).foregroundStyle(.secondary)
                            .lineLimit(1).truncationMode(.middle)
                    }
                    Spacer(minLength: 12)
                    if let left = status.timeRemaining, left > 0 {
                        Text(shop.words.callIt("mac.eta") + " " + PrinterWatch.spell(left))
                            .font(.caption).monospacedDigit().foregroundStyle(.secondary)
                    }
                    Text("\(status.progress)%")
                        .font(.callout.weight(.semibold)).monospacedDigit()
                        .frame(width: 46, alignment: .trailing)
                }
                ProgressView(value: Double(status.progress) / 100)
                    .progressViewStyle(.linear)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// What has gone wrong with a printer, since the app opened.
///
/// The alerts are `lib/printer-alerts.js`'s — its thresholds, its cooldowns,
/// its stall clock. This is only where they are put once raised, and it exists
/// because a macOS notification is gone the moment somebody swipes it away.
private struct WentWrong: View {
    let shop: Shop

    var body: some View {
        let notices = shop.printers.notices.raised
        if !notices.isEmpty {
            DetailSection(shop.words.callIt("mac.printer_trouble")) {
                VStack(spacing: 0) {
                    ForEach(notices.prefix(5)) { notice in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: notice.kind == "stall"
                                  ? "pause.circle" : "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(notice.title).font(.body)
                                if !notice.body.isEmpty {
                                    Text(notice.body).font(.caption).foregroundStyle(.secondary)
                                        .lineLimit(1).truncationMode(.middle)
                                }
                            }
                            Spacer(minLength: 12)
                            Text(notice.at.formatted(date: .omitted, time: .shortened))
                                .font(.caption).monospacedDigit().foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 5)
                        if notice.id != notices.prefix(5).last?.id { Divider() }
                    }
                }
            }
        }
    }
}

/// The money, when this shop deals in money.
///
/// Every figure comes from the shared modules — `order-money` for what an order
/// earned and what is owed on it, `kpi-rows` for which orders count, `kpi` for
/// the totals. The margin shown here is the margin the Electron app shows,
/// because it is the same three functions.
///
/// This screen showed zeros for ten minutes once, because `computeKpis` was
/// handed raw orders and answered politely. The figures came back only after
/// those rules were lifted out of `renderer/analytics.js` into `lib/`.
private struct MoneyTiles: View {
    @Bindable var shop: Shop

    var body: some View {
        DetailSection(shop.words.callIt("mac.money")) {
            // Which period, said next to the figures rather than assumed. An
            // owner reading "revenue" needs to know whether that is this month
            // or all time before the number means anything.
            Picker("", selection: $shop.kpiRange) {
                ForEach(Dashboard.ranges, id: \.0) { key, word in
                    Text(shop.words.callIt(word)).tag(key)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
            .padding(.bottom, 2)

            if let k = shop.kpis {
                HStack(spacing: 14) {
                    Tile(value: Money.short(k.revenue, shop.currency),
                         label: shop.words.callIt("mac.revenue"), symbol: "banknote", tint: .secondary)
                    Tile(value: Money.short(k.grossProfit, shop.currency),
                         label: shop.words.callIt("mac.gross"), symbol: "chart.line.uptrend.xyaxis",
                         tint: .secondary)
                    Tile(value: "\(Money.figure(k.grossMargin))%",
                         label: shop.words.callIt("mac.margin"), symbol: "percent", tint: .secondary)
                    Tile(value: Money.short(k.avgOrderValue, shop.currency),
                         label: shop.words.callIt("mac.avg_order"), symbol: "chart.bar", tint: .secondary)
                }
                HStack(spacing: 14) {
                    // NOT "Owed" here. `kpi` scopes outstanding to the rows in
                    // the period, and the toolbar shows what the whole book is
                    // owed, unscoped and always visible. Two figures under one
                    // word, inches apart, differing by an order of magnitude —
                    // the same trap this section was rewritten to remove once
                    // already.
                    Tile(value: "\(k.orderCount)", label: shop.words.callIt("mac.jobs_count"),
                         symbol: "tray.full", tint: .secondary)
                    // Nothing to judge against is "—", not 100%. A shop with no
                    // due dates has not delivered everything on time; it has
                    // promised nothing.
                    Tile(value: k.onTimePct.map { "\(Money.figure($0))%" } ?? "—",
                         label: shop.words.callIt("mac.on_time"), symbol: "checkmark.circle",
                         tint: .secondary)
                    Tile(value: "\(k.completedCount)", label: shop.words.callIt("queue.completed"),
                         symbol: "shippingbox", tint: .secondary)
                    Tile(value: "\(shop.files.count)", label: shop.words.callIt("mac.library"),
                         symbol: "square.grid.2x2", tint: .secondary)
                }
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

