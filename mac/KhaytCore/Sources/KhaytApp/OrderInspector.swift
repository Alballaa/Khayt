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
                    DetailSection("Note") { Text(job.notes).textSelection(.enabled) }
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
        DetailSection("Money") {
            DetailLine("Total", Money.text(job.price, job.currency))
            if let split {
                // Only shown for a registered shop: an unregistered one has no
                // split, and inventing a zero-rate line would imply otherwise.
                DetailLine("Shop keeps", Money.text(split.subtotal, job.currency), dim: true)
                DetailLine(shop.taxSummary.map { String($0.prefix(while: { !$0.isNumber })).trimmingCharacters(in: .whitespaces) } ?? "Tax",
                     Money.text(split.taxTotal, job.currency), dim: true)
            }
            DetailLine("Paid", Money.text(job.paidAmount, job.currency))
            DetailLine("Owed", Money.text(job.owed, job.currency), strong: !job.isSettled)
            if let due = Order.day(job.dueDate) {
                DetailLine("Due", due.formatted(date: .abbreviated, time: .omitted),
                     warn: job.isOverdue())
            }
        }
    }

    private var parts: some View {
        DetailSection("Parts") {
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
            DetailLine("Machine time", String(format: "%.1f h", job.printTime), dim: true)
        }
    }
}
