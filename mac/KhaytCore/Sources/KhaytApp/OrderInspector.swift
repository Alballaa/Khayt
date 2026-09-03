import SwiftUI
import KhaytCore

/// The selected job, in detail.
///
/// The money here is not arithmetic written in Swift. `lib/tax.js` decides how a
/// price divides into what the shop keeps and what it is only holding for the
/// tax authority, and it does it differently by country — inclusive in the Gulf
/// and most of Europe, added on top in the US and Canada. A second
/// implementation would be a second chance to get that backwards.
struct OrderInspector: View {
    let shop: Shop
    @State private var split: TaxSplit?

    var body: some View {
        Group {
            if let job = shop.selected {
                Detail(job: job, shop: shop, split: split)
                    .task(id: job.id) { split = await shop.taxSplit(job.price) }
            } else {
                ContentUnavailableView("No job selected", systemImage: "sidebar.trailing",
                                       description: Text("Pick a row to see its parts and its money."))
            }
        }
    }
}

private struct Detail: View {
    let job: Order
    let shop: Shop
    let split: TaxSplit?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                Divider()
                money
                if !job.parts.isEmpty {
                    Divider()
                    parts
                }
                if !job.notes.isEmpty {
                    Divider()
                    Section("Note") { Text(job.notes).textSelection(.enabled) }
                }
            }
            .padding(16)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(job.project)
                .font(.title3.weight(.semibold))
                .textSelection(.enabled)
            HStack(spacing: 6) {
                Text(job.id).monospacedDigit()
                if let s = Stage.of(job) {
                    Text("·")
                    Label(s.title, systemImage: s.symbol).labelStyle(.titleAndIcon)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            if !job.client.isEmpty {
                Label(job.client, systemImage: "person")
                    .font(.callout)
                    .padding(.top, 2)
            }
        }
    }

    private var money: some View {
        Section("Money") {
            Line("Total", Money.text(job.price, job.currency))
            if let split {
                // Only shown for a registered shop: an unregistered one has no
                // split, and inventing a zero-rate line would imply otherwise.
                Line("Shop keeps", Money.text(split.subtotal, job.currency), dim: true)
                Line(shop.taxSummary.map { String($0.prefix(while: { !$0.isNumber })).trimmingCharacters(in: .whitespaces) } ?? "Tax",
                     Money.text(split.taxTotal, job.currency), dim: true)
            }
            Line("Paid", Money.text(job.paidAmount, job.currency))
            Line("Owed", Money.text(job.owed, job.currency), strong: !job.isSettled)
            if let due = Order.day(job.dueDate) {
                Line("Due", due.formatted(date: .abbreviated, time: .omitted),
                     warn: job.isOverdue())
            }
        }
    }

    private var parts: some View {
        Section("Parts") {
            ForEach(job.parts) { part in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(part.name).lineLimit(1)
                        Text(part.colour.isEmpty ? part.material : "\(part.material) · \(part.colour)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("×\(part.qty)").monospacedDigit()
                        Text("\(Money.figure(part.printWeight)) g")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }
            Line("Machine time", String(format: "%.1f h", job.printTime), dim: true)
        }
    }
}

/// A labelled figure. The label is secondary and the value is aligned to the
/// right edge, so a column of them reads as a column.
private struct Line: View {
    let label: String
    let value: String
    var dim = false
    var strong = false
    var warn = false

    init(_ label: String, _ value: String, dim: Bool = false, strong: Bool = false, warn: Bool = false) {
        self.label = label; self.value = value
        self.dim = dim; self.strong = strong; self.warn = warn
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.callout)
                .foregroundStyle(dim ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.secondary))
            Spacer(minLength: 12)
            Text(value)
                .font(.callout.weight(strong ? .semibold : .regular))
                .monospacedDigit()
                .foregroundStyle(warn ? AnyShapeStyle(.orange)
                                 : dim ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
        }
    }
}

private struct Section<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    init(_ title: String, @ViewBuilder content: () -> Content) {
        self.title = title; self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(.tertiary)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
