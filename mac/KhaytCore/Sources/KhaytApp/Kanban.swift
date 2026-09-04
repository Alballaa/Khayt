import SwiftUI

/// The book as a board: every open job, in the column its stage puts it in.
///
/// The table answers "what is the state of this job". The board answers "where
/// is the work piling up", which is the question a shop asks standing in the
/// middle of the room — and it is the one a list of forty rows sorted by date
/// cannot answer at a glance.
///
/// READ-ONLY, AND THAT IS DELIBERATE. Dragging a card between columns would be
/// a status change, and a status change in Khayt is not a field write: it stamps
/// completedAt, moves the customer's progress tracker, and can settle an
/// instalment plan — 3,200 lines of `renderer/order-flows.js` worth of rules.
/// A Swift reimplementation of the most consequential write in the app is
/// exactly what this project refuses to do, so the board shows and does not
/// move. Dragging arrives when those rules are shared, the way the money rules
/// now are.
struct Kanban: View {
    @Bindable var shop: Shop

    /// Delivered and cancelled are off the board on purpose: they are where
    /// work goes to stop being work, and a column of two hundred delivered jobs
    /// buries the four that need doing.
    private var columns: [Stage] { [.quote, .pending, .printing, .completed] }

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            HStack(alignment: .top, spacing: 14) {
                ForEach(columns) { stage in
                    Column(stage: stage, jobs: shop.board[stage] ?? [], shop: shop)
                }
            }
            .padding(16)
        }
        .background(.background)
        .overlay {
            if shop.orders.isEmpty {
                ContentUnavailableView(shop.words.callIt("mac.no_jobs"), systemImage: "rectangle.split.3x1")
            }
        }
    }
}

private struct Column: View {
    let stage: Stage
    let jobs: [Order]
    let shop: Shop

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: stage.symbol).foregroundStyle(.secondary)
                Text(shop.words.callIt(stage.key)).font(.headline)
                Spacer(minLength: 6)
                Text("\(jobs.count)")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 4)

            if jobs.isEmpty {
                // An empty column keeps its width and says so. A board whose
                // columns collapse as work moves is a board you cannot learn.
                Text(shop.words.callIt("mac.nothing_here"))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 18)
            } else {
                ForEach(jobs) { job in
                    JobCard(job: job, shop: shop)
                }
            }
        }
        .frame(width: 240, alignment: .leading)
        .padding(10)
        .background(.quinary, in: RoundedRectangle(cornerRadius: 10))
    }
}

private struct JobCard: View {
    let job: Order
    let shop: Shop

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 5) {
                if job.priority {
                    Image(systemName: "flag.fill").font(.caption2).foregroundStyle(.orange)
                }
                Text(job.project).font(.callout.weight(.medium)).lineLimit(2)
            }
            if !job.client.isEmpty {
                Text(job.client).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            HStack(spacing: 6) {
                if let due = Order.day(job.dueDate) {
                    // Said in words as well as colour — this is the line that
                    // decides whether someone gets a phone call today.
                    Label(due.formatted(.dateTime.day().month(.abbreviated)),
                          systemImage: job.isOverdue() ? "exclamationmark.triangle" : "calendar")
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(job.isOverdue() ? AnyShapeStyle(.orange) : AnyShapeStyle(.tertiary))
                }
                Spacer(minLength: 4)
                if !job.isSettled {
                    Text(Money.figure(job.owed))
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 7))
        .onTapGesture {
            // The board is for seeing; the table is for reading one job. A tap
            // takes you there rather than opening a panel the board has no room
            // for.
            shop.selection = job.id
            shop.shelf = .jobs(nil)
        }
        .help(job.id)
    }
}
