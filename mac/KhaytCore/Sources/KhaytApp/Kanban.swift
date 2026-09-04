import SwiftUI
import UniformTypeIdentifiers
import KhaytCore

/// The book as a board: every open job, in the column its stage puts it in.
///
/// The table answers "what is the state of this job". The board answers "where
/// is the work piling up", which is the question a shop asks standing in the
/// middle of the room — and it is the one a list of forty rows sorted by date
/// cannot answer at a glance.
///
/// A CARD CAN BE MOVED NOW, and what moving it means is not written here. A
/// status change stamps the completion, deducts the filament and the packaging,
/// clears a hold and pushes the due date out by the days it waited, and fixes
/// the cost the job is judged on ever after. Those rules live in
/// `lib/order-status.js` and `lib/order-deduction.js` — the same JavaScript the
/// Electron app runs — and `Shop.moveJob` performs them. This file decides what
/// a person sees and nothing else.
///
/// A move that would send a webhook, a Telegram message, an email or a portal
/// refresh is REFUSED rather than half-made, and says which. None of those can
/// be sent from here and none of them can be sent afterwards.
struct Kanban: View {
    @Bindable var shop: Shop

    /// Delivered and cancelled are off the board on purpose: they are where
    /// work goes to stop being work, and a column of two hundred delivered jobs
    /// buries the four that need doing.
    private var columns: [Stage] { [.quote, .pending, .printing, .completed] }

    var body: some View {
        VStack(spacing: 0) {
            if let problem = shop.moveProblem {
                Banner(text: problem, symbol: "exclamationmark.triangle", tint: .orange)
            }
            // By position, not by text: two spools running low can produce the
            // same sentence, and a ForEach with two identical ids draws one.
            ForEach(Array(shop.moveNotices.enumerated()), id: \.offset) { _, notice in
                Banner(text: notice, symbol: "info.circle", tint: .secondary)
            }

            ScrollView([.horizontal, .vertical]) {
                HStack(alignment: .top, spacing: 14) {
                    ForEach(columns) { stage in
                        Column(stage: stage, jobs: shop.board[stage] ?? [], shop: shop)
                    }
                }
                .padding(16)
            }
        }
        .background(.background)
        .overlay {
            if shop.orders.isEmpty {
                ContentUnavailableView(shop.words.callIt("mac.no_jobs"), systemImage: "rectangle.split.3x1")
            }
        }
    }
}

/// What the last move had to say, above the board rather than in a sheet.
///
/// A modal would have to be dismissed before the next card could be dragged,
/// which turns "move four jobs" into eight gestures. This is read where it is
/// noticed and ignored where it is not, and the next move replaces it.
private struct Banner: View {
    let text: String
    let symbol: String
    let tint: Color

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.callout)
            .foregroundStyle(tint)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 7)
            .background(.quinary)
    }
}

/// A job on its way from one column to another.
///
/// A typed payload rather than a bare String: a board that accepted any dragged
/// text would move a job because someone dropped a word on it.
struct DraggedJob: Codable, Transferable {
    let id: String

    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .khaytJob)
    }
}

extension UTType {
    /// Declared in the bundle's Info.plist so the drag is this app's own and
    /// nothing else on the Mac claims to understand it.
    static let khaytJob = UTType(exportedAs: "app.khayt.mac.job")
}

private struct Column: View {
    let stage: Stage
    let jobs: [Order]
    let shop: Shop
    @State private var isTarget = false

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
        .overlay {
            // Only while something is over it: a permanently outlined column
            // reads as selected, and four selected columns read as none.
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(.tint, lineWidth: 2)
                .opacity(isTarget && shop.canMoveJobs ? 1 : 0)
        }
        .dropDestination(for: DraggedJob.self) { dropped, _ in
            guard let job = dropped.first else { return false }
            // A card dropped back where it started is not a move. Performing it
            // would stamp a status history entry and a revision for nothing.
            guard Stage.of(job: job.id, in: shop) != stage else { return false }
            Task { await shop.moveJob(job.id, to: stage) }
            return true
        } isTargeted: { isTarget = $0 }
        .animation(.easeOut(duration: 0.12), value: isTarget)
    }
}

private extension Stage {
    /// The stage a job is in right now, by id.
    @MainActor
    static func of(job id: String, in shop: Shop) -> Stage? {
        shop.orders.first { $0.id == id }.flatMap(Stage.of)
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
        .contentShape(RoundedRectangle(cornerRadius: 7))
        .onTapGesture {
            // The board is for seeing; the table is for reading one job. A tap
            // takes you there rather than opening a panel the board has no room
            // for.
            shop.selection = job.id
            shop.shelf = .jobs(nil)
        }
        .help(job.id)
        // A read-only book is not draggable at all. Offering the gesture and
        // then refusing every drop teaches nothing except that the app is
        // unreliable.
        .modifier(Draggable(enabled: shop.canMoveJobs, id: job.id))
    }
}

/// `.draggable` applied only where the book can actually be changed.
private struct Draggable: ViewModifier {
    let enabled: Bool
    let id: String

    func body(content: Content) -> some View {
        if enabled {
            content.draggable(DraggedJob(id: id))
        } else {
            content
        }
    }
}
