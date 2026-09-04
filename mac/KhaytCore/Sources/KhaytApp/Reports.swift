import SwiftUI
import KhaytCore

/// The shop's quarters: what it earned, what it spent, what it kept.
///
/// The figures are `lib/pnl-report.js`'s `pnlByPeriod` — which orders count,
/// which are voided, how the tax is worked out, and how a quarter in progress
/// is charged its share of the overhead. All of it was inline in the Electron
/// analytics screen, so this app had no P&L and no way to have one without a
/// second opinion about the shop's money.
///
/// A table and not a chart, deliberately: this is the screen a shop reads at
/// the end of a quarter to decide something, and a bar it cannot read a figure
/// off is decoration.
struct Reports: View {
    @Bindable var shop: Shop
    @State private var rows: [PnlPeriod] = []
    @State private var owed: Receivables?
    @State private var order: [KeyPathComparator<PnlPeriod>] = [.init(\.period, order: .reverse)]
    @SceneStorage("reports.columns") private var columns: TableColumnCustomization<PnlPeriod>

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $shop.reportPage) {
                ForEach(ReportPage.allCases) { p in Text(shop.words.callIt(p.key)).tag(p) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()
            .padding(.vertical, 8)

            if shop.reportPage == .owing {
                Owing(shop: shop, owed: owed)
            } else if rows.isEmpty {
                ContentUnavailableView(shop.words.callIt("an.pnl_empty"), systemImage: "chart.bar.doc.horizontal")
                    .frame(maxHeight: .infinity)
            } else {
                HSplitView {
                    table
                    Totals(shop: shop, rows: rows)
                        .frame(minWidth: 240, idealWidth: 280, maxWidth: 360)
                }
            }
        }
        .task(id: shop.orderRows.count + shop.expenseRows.count) { await recompute() }
    }

    private var table: some View {
        Table(rows.sorted(using: order), sortOrder: $order, columnCustomization: $columns) {
            TableColumn(shop.words.callIt("an.pnl_period"), value: \.period) { r in
                Text(r.period).font(.body.weight(.semibold)).monospacedDigit()
            }
            .width(min: 80, ideal: 100)
            TableColumn(shop.words.callIt("an.pnl_orders"), value: \.orders) { r in
                Text("\(r.orders)").monospacedDigit()
            }
            .width(min: 60, ideal: 80)
            TableColumn(shop.words.callIt("an.revenue"), value: \.revenue) { r in
                Text(Money.text(r.revenue, shop.currency)).monospacedDigit()
            }
            .width(min: 110, ideal: 140)
            TableColumn(shop.words.callIt("an.pnl_expenses"), value: \.expenses) { r in
                // What was spent AND the overhead charged to the period, which
                // is the figure the net is worked out from. Two numbers in one
                // column, because the shop is owed the one it can check.
                VStack(alignment: .trailing, spacing: 1) {
                    let spent = r.expenses + r.fixed
                    // A quarter that spent nothing shows nothing, rather than
                    // "−0.00", which reads as a figure somebody worked out.
                    // Negated rather than prefixed with a minus glyph: the
                    // formatter's own sign is the one the net column uses, and
                    // two different minus signs in one table is a typo.
                    Text(spent > 0 ? Money.text(-spent, shop.currency) : "—")
                        .monospacedDigit()
                        .foregroundStyle(spent > 0 ? AnyShapeStyle(.orange) : AnyShapeStyle(.tertiary))
                    if r.fixed > 0 {
                        Text(shop.words.callIt("mac.of_which_fixed") + " " + Money.text(r.fixed, shop.currency))
                            .font(.caption).foregroundStyle(.tertiary).monospacedDigit()
                    }
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 120, ideal: 160)
            TableColumn(shop.words.callIt("an.pnl_vat"), value: \.vatCollected) { r in
                Text(Money.text(r.vatCollected, shop.currency))
                    .monospacedDigit().foregroundStyle(.secondary)
            }
            .width(min: 100, ideal: 130)
            TableColumn(shop.words.callIt("an.pnl_net"), value: \.net) { r in
                Text(Money.text(r.net, shop.currency))
                    .font(.body.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(r.net >= 0 ? AnyShapeStyle(.primary) : AnyShapeStyle(.orange))
            }
            .width(min: 110, ideal: 140)
        }
    }

    private func recompute() async {
        guard let engine = shop.engine else { rows = []; owed = nil; return }
        rows = (try? await engine.pnlByPeriod(
            orders: shop.orderRows, expenses: shop.expenseRows,
            settings: shop.settingsDict, clients: shop.clientRows,
            currencies: Invoice.currencyTable(shop), now: Date())) ?? []
        owed = try? await engine.receivables(
            orders: shop.orderRows, settings: shop.settingsDict, clients: shop.clientRows,
            currencies: Invoice.currencyTable(shop), language: shop.words.language, now: Date())
    }

    /// What the shop is still owed, and since when.
    ///
    /// Oldest first, because what a shop chases is the top of this list — and
    /// the four ages across the top, because "how much of this is really old"
    /// is the question the totals cannot answer.
    private struct Owing: View {
        let shop: Shop
        let owed: Receivables?
        @State private var order: [KeyPathComparator<Receivables.Row>] = [.init(\.days, order: .reverse)]

        var body: some View {
            if let owed, !owed.rows.isEmpty {
                VStack(spacing: 0) {
                    HStack(spacing: 10) {
                        ForEach(owed.buckets) { bucket in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(shop.words.callIt("an.aged_bucket_days", ["label": .string(bucket.label)]))
                                    .font(.caption).foregroundStyle(.secondary)
                                Text(Money.text(bucket.total, shop.currency))
                                    .font(.title3.weight(.semibold)).monospacedDigit()
                                    .foregroundStyle(Self.tint(bucket.label))
                                Text(shop.words.callIt("an.aged_orders_n", ["n": .number(Double(bucket.count))]))
                                    .font(.caption2).foregroundStyle(.tertiary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)

                    Table(owed.rows.sorted(using: order), sortOrder: $order) {
                        TableColumn(shop.words.callIt("an.aged_col_order"), value: \.id) { row in
                            Text(row.id).monospacedDigit().foregroundStyle(.secondary)
                        }
                        .width(min: 90, ideal: 120)
                        TableColumn(shop.words.callIt("an.aged_col_project"), value: \.project) { row in
                            HStack(spacing: 5) {
                                Text(row.project.isEmpty ? "—" : row.project).lineLimit(1)
                                // An instalment is one payment of a plan, not
                                // the whole order — the row is aged by its own
                                // due date and shows only its own amount.
                                if row.instalment {
                                    Image(systemName: "calendar.badge.clock")
                                        .font(.caption).foregroundStyle(.tertiary)
                                }
                            }
                        }
                        .width(min: 120, ideal: 200)
                        TableColumn(shop.words.callIt("an.aged_col_client"), value: \.client) { row in
                            Text(row.client.isEmpty ? "—" : row.client)
                                .foregroundStyle(row.client.isEmpty ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.primary))
                                .lineLimit(1)
                        }
                        .width(min: 110, ideal: 170)
                        TableColumn(shop.words.callIt("an.aged_col_owed"), value: \.owed) { row in
                            Text(Money.text(row.owed, shop.currency))
                                .monospacedDigit().foregroundStyle(.orange)
                        }
                        .width(min: 100, ideal: 130)
                        TableColumn(shop.words.callIt("an.aged_col_days"), value: \.days) { row in
                            Text("\(row.days)").monospacedDigit()
                                .foregroundStyle(Self.tint(row.bucket))
                        }
                        .width(min: 60, ideal: 80)
                    }
                }
            } else {
                ContentUnavailableView(shop.words.callIt("an.aged_none"),
                                       systemImage: "checkmark.circle")
                    .frame(maxHeight: .infinity)
            }
        }

        /// Older is louder. The oldest bucket is the one a shop acts on.
        static func tint(_ bucket: String) -> AnyShapeStyle {
            switch bucket {
            case "90+": AnyShapeStyle(.red)
            case "61-90": AnyShapeStyle(.orange)
            case "31-60": AnyShapeStyle(.yellow)
            default: AnyShapeStyle(.secondary)
            }
        }
    }

    /// Every quarter added up, and the last one on its own.
    private struct Totals: View {
        let shop: Shop
        let rows: [PnlPeriod]

        var body: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    DetailSection(shop.words.callIt("an.pnl_title")) {
                        DetailLine(shop.words.callIt("an.revenue"),
                                   Money.text(rows.reduce(0) { $0 + $1.revenue }, shop.currency))
                        DetailLine(shop.words.callIt("an.pnl_expenses"),
                                   Money.text(rows.reduce(0) { $0 + $1.expenses + $1.fixed }, shop.currency), dim: true)
                        DetailLine(shop.words.callIt("an.pnl_vat"),
                                   Money.text(rows.reduce(0) { $0 + $1.vatCollected }, shop.currency), dim: true)
                        DetailLine(shop.words.callIt("an.pnl_net"),
                                   Money.text(rows.reduce(0) { $0 + $1.net }, shop.currency), strong: true)
                    }
                    if let latest = rows.first {
                        DetailSection(latest.period) {
                            DetailLine(shop.words.callIt("an.pnl_orders"), "\(latest.orders)")
                            DetailLine(shop.words.callIt("an.revenue"),
                                       Money.text(latest.revenue, shop.currency))
                            DetailLine(shop.words.callIt("an.pnl_net"),
                                       Money.text(latest.net, shop.currency), strong: true)
                            // The quarter in progress is charged only the part
                            // of its overhead that has elapsed, so its net is
                            // comparable with the finished ones beside it.
                            if latest.fixed > 0 {
                                Text(shop.words.callIt("mac.quarter_in_progress"))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .padding(14)
            }
        }
    }
}
