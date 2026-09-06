import SwiftUI
import KhaytCore

/// A job's due date and how urgent it is.
///
/// Two fields, not thirty. These are the two a shop floor actually adjusts —
/// "it slipped a week", "this one first" — and the two whose changes Khayt
/// writes into the job's edit history, because they are what a customer can be
/// told a different answer about later.
///
/// Everything else the order editor writes is left exactly as it was. That is
/// the shared rule's guarantee, not this sheet's promise: `applyEdit` touches
/// only the fields it is handed.
struct EditJobSheet: View {
    /// How wide this sheet is. A CONSTANT rather than a number in the body,
    /// because `SnapshotTests` photographs the sheet at a size of its own and
    /// the two silently disagreed: the sheet grew and the picture kept the old
    /// width, so the render came back cropped down the middle with no failure.
    static let width: CGFloat = 360

    let shop: Shop
    let subject: Shop.PendingHold

    @State private var hasDueDate = false
    @State private var dueDate = Date()
    @State private var priority = "normal"
    @State private var started = false

    private var job: Order? { shop.orders.first { $0.id == subject.id } }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(shop.words.callIt("mac.edit_job")).font(.headline)
            Text(subject.project).font(.callout).foregroundStyle(.secondary).lineLimit(1)

            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    Text(shop.words.callIt("doc.due")).foregroundStyle(.secondary)
                    // A job with no due date is a real answer, so the sheet has
                    // to be able to say it — a date picker alone cannot.
                    Toggle(isOn: $hasDueDate) {
                        if hasDueDate {
                            DatePicker("", selection: $dueDate, displayedComponents: .date)
                                .labelsHidden()
                        } else {
                            Text(shop.words.callIt("mac.no_due_date")).foregroundStyle(.secondary)
                        }
                    }
                    .toggleStyle(.checkbox)
                }
                GridRow {
                    Text(shop.words.callIt("oe.priority")).foregroundStyle(.secondary)
                    Picker("", selection: $priority) {
                        ForEach(Shop.priorityLevels, id: \.self) { level in
                            Text(shop.words.callIt(Self.wordFor(level))).tag(level)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                }
            }

            HStack {
                Spacer()
                Button(shop.words.callIt("common.cancel")) { shop.clearQuestion() }
                    .keyboardShortcut(.cancelAction)
                Button(shop.words.callIt("common.save"), action: commit)
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(18)
        .frame(width: Self.width)
        .onAppear {
            guard !started else { return }
            started = true
            if let day = Order.day(job?.dueDate) {
                hasDueDate = true
                dueDate = day
            }
            priority = shop.priorityOf(job)
        }
    }

    /// Khayt names the two raised levels and not the ordinary one, so this app
    /// supplies only the word Khayt has never needed.
    static func wordFor(_ level: String) -> String {
        switch level {
        case "urgent": "ord.priority_urgent"
        case "high": "ord.priority_high"
        default: "mac.priority_normal"
        }
    }

    private func commit() {
        let id = subject.id
        let when = hasDueDate ? dueDate : nil
        let level = priority
        shop.clearQuestion()
        Task { await shop.editJob(id, dueDate: when, priorityLevel: level) }
    }
}
