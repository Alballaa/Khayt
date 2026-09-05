import SwiftUI

/// The book. A real `Table`, which means AppKit's column resizing, column
/// reordering, click-to-sort, type-select, and rows that stay put under the
/// keyboard — none of which the web version manages convincingly.
struct OrdersTable: View {
    @Bindable var shop: Shop
    // Sort order and column layout both survive a relaunch. A Mac table whose
    // columns snap back to the developer's idea of the right ones every morning
    // is a table nobody bothers to arrange.
    @SceneStorage("jobs.sort") private var storedSort = "date:down"
    @SceneStorage("jobs.columns") private var columns: TableColumnCustomization<Order>
    @State private var order: [KeyPathComparator<Order>] = [
        .init(\.date, order: .reverse)
    ]

    private var rows: [Order] { shop.shown.sorted(using: order) }

    var body: some View {
        Table(rows, selection: $shop.selection, sortOrder: $order,
              columnCustomization: $columns) {
            TableColumn(shop.words.callIt("mac.job"), value: \.project) { job in
                HStack(spacing: 6) {
                    if job.priority {
                        Image(systemName: "flag.fill")
                            .foregroundStyle(.orange)
                            .help(shop.words.callIt("mac.is_urgent"))
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(job.project).lineLimit(1)
                        Text(job.id)
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            .width(min: 170, ideal: 240)

            TableColumn(shop.words.callIt("doc.client"), value: \.client) { job in
                Text(job.client.isEmpty ? "—" : job.client)
                    .foregroundStyle(job.client.isEmpty ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.primary))
                    .lineLimit(1)
            }
            .width(min: 120, ideal: 180)

            TableColumn(shop.words.callIt("mac.stage"), value: \.status) { job in
                if let s = Stage.of(job) {
                    Label(shop.words.callIt(s.key), systemImage: s.symbol)
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(.secondary)
                } else {
                    Text(job.status).foregroundStyle(.tertiary)
                }
            }
            .width(min: 100, ideal: 130)

            TableColumn(shop.words.callIt("doc.due")) { job in
                DueDate(words: shop.words, job: job)
            }
            .width(min: 78, ideal: 96)

            TableColumn(shop.words.callIt("common.total"), value: \.price) { job in
                Text(Money.figure(job.price)).moneyStyle()
            }
            .width(min: 80, ideal: 100)
            .alignment(.trailing)

            TableColumn(shop.words.callIt("flow.owed"), value: \.owed) { job in
                Owed(job: job, words: shop.words)
            }
            .width(min: 96, ideal: 120)
            .alignment(.trailing)
        }
        .tableStyle(.inset(alternatesRowBackgrounds: true))
        // Right-click, which every other table in this app already answered and
        // the one holding the shop's jobs did not. Same actions as the Job
        // menu, reached where the hand already is.
        .contextMenu(forSelectionType: Order.ID.self) { ids in
            if let id = ids.first, let job = shop.orders.first(where: { $0.id == id }) {
                JobActions(shop: shop, job: job)
            }
        } primaryAction: { ids in
            // Double-click opens what a double-click opens everywhere else
            // here: the thing itself.
            if let id = ids.first { shop.showInvoice(id) }
        }
        .overlay {
            if rows.isEmpty { EmptyBook(shop: shop) }
        }
    }
}

/// What can be done to a job, wherever it is asked for.
///
/// The Job menu's items are built with the menu bar and their titles are frozen
/// there (see `ModelMenu`); these are built fresh each time the menu opens, so
/// they can say which job they are about.
struct JobActions: View {
    let shop: Shop
    let job: Order

    var body: some View {
        Button(shop.words.callIt("mac.edit_job")) {
            shop.pendingEdit = Shop.PendingHold(id: job.id, project: job.project)
        }
        .disabled(!shop.canMoveJobs)
        Button(shop.words.callIt("pay.modal_title")) {
            shop.pendingPayment = Shop.PendingHold(id: job.id, project: job.project)
        }
        .disabled(!shop.canMoveJobs)
        Button(shop.words.callIt("ord.hold_btn")) {
            shop.pendingHold = Shop.PendingHold(id: job.id, project: job.project)
        }
        .disabled(!shop.canMoveJobs || job.status == "on_hold")
        Divider()
        Button(shop.words.callIt("queue.delivered")) {
            Task { await shop.markDelivered(job.id) }
        }
        .disabled(!shop.canMoveJobs || job.status != "completed" || job.deliveredAt != nil)
        Divider()
        // Not gated on the book being ours: showing a shop what it would hand a
        // customer changes nothing, and refusing to draw the sample's invoice
        // would hide the thing this app is for.
        Button(shop.words.callIt("doc.invoice")) { shop.showInvoice(job.id) }
    }
}

/// A due date, or nothing.
///
/// Late is stated in words rather than by colour alone — a colour-only signal is
/// unreadable to a good number of people, and this is the cell that decides
/// whether someone gets a phone call today.
private struct DueDate: View {
    let words: Words
    let job: Order

    var body: some View {
        if let due = Order.day(job.dueDate) {
            let late = job.isOverdue()
            Text(due, format: .dateTime.day().month(.abbreviated))
                .monospacedDigit()
                .foregroundStyle(late ? AnyShapeStyle(.orange) : AnyShapeStyle(.secondary))
                .help(late
                      ? words.callIt("mac.overdue_unpaid")
                      : words.callIt("mac.due_on",
                                     ["date": .string(due.formatted(date: .abbreviated, time: .omitted))]))
        } else {
            Text("—").foregroundStyle(.quaternary)
        }
    }
}

/// What is still owed on this job, and how far through paying the customer is.
///
/// The one piece of decoration in the table, and it is carrying information: the
/// bar is the fraction already paid. A shop scanning this column can see at a
/// glance the difference between a job with a deposit down and one that has not
/// paid a riyal — which the number alone does not tell you without the total
/// next to it.
private struct Owed: View {
    let job: Order
    let words: Words

    private var paidFraction: Double {
        guard job.price > 0 else { return 0 }
        return min(1, max(0, job.paidAmount / job.price))
    }

    var body: some View {
        if job.isSettled {
            Text(words.callIt("mac.settled"))
                .font(.caption)
                .foregroundStyle(.tertiary)
                .frame(maxWidth: .infinity, alignment: .trailing)
        } else {
            VStack(alignment: .trailing, spacing: 3) {
                Text(Money.figure(job.owed))
                    .monospacedDigit()
                Capsule()
                    .fill(.quaternary)
                    .frame(height: 2)
                    .overlay(alignment: .leading) {
                        GeometryReader { geo in
                            Capsule()
                                .fill(job.isOverdue() ? AnyShapeStyle(.orange) : AnyShapeStyle(.tint))
                                .frame(width: geo.size.width * paidFraction)
                        }
                    }
                    .help(paidFraction > 0
                          ? words.callIt("mac.pct_paid",
                                         ["n": .number((paidFraction * 100).rounded())])
                          : words.callIt("mac.nothing_paid"))
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}

private struct EmptyBook: View {
    let shop: Shop

    var body: some View {
        if let problem = shop.problem {
            ContentUnavailableView {
                Label(shop.words.callIt("mac.book_wont_open"), systemImage: "exclamationmark.octagon")
            } description: {
                Text(problem)
            }
        } else if !shop.search.isEmpty {
            ContentUnavailableView.search(text: shop.search)
        } else if shop.stage != nil {
            ContentUnavailableView(shop.words.callIt("mac.nothing_at_stage"), systemImage: "tray",
                                   description: Text(shop.words.callIt("mac.stage_hint")))
        } else {
            ContentUnavailableView(shop.words.callIt("mac.no_jobs"), systemImage: "tray")
        }
    }
}
