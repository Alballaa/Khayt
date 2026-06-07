import SwiftUI

/// Job intake / waiting list — triage leads from web intake or desktop.
struct IntakeView: View {
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var items: [WaitingListEntry] = []
    @State private var errorMessage: String?
    @State private var updatingId: String?
    @State private var selected: WaitingListEntry?

    var body: some View {
        Group {
            if items.isEmpty && errorMessage == nil {
                ProgressView()
            } else if items.isEmpty {
                ContentUnavailableView(
                    L10n.tr("intake.title"),
                    systemImage: "tray.and.arrow.down",
                    description: Text(errorMessage ?? L10n.tr("intake.empty"))
                )
            } else {
                List(items) { item in
                    Button {
                        selected = item
                    } label: {
                        IntakeRow(item: item)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Task { await decline(item) }
                        } label: {
                            Label(L10n.tr("intake.decline"), systemImage: "xmark")
                        }
                    }
                    .swipeActions(edge: .leading) {
                        Button {
                            Task { await markReminded(item) }
                        } label: {
                            Label(L10n.tr("intake.remind"), systemImage: "bell")
                        }
                        .tint(KhaytDesign.brand)
                    }
                }
                .listStyle(.plain)
            }
        }
            .refreshable { await reload() }
            .task { await reload() }
            .sheet(item: $selected) { item in
            IntakeDetailSheet(
                item: item,
                isUpdating: updatingId == item.id,
                onDecline: { Task { await decline(item); selected = nil } },
                onRemind: { Task { await markReminded(item); selected = nil } }
            )
        }
    }

    func reload() async {
        errorMessage = nil
        do {
            items = try await api.fetchWaitingList()
        } catch {
            items = []
            errorMessage = error.localizedDescription
        }
    }

    private func decline(_ item: WaitingListEntry) async {
        updatingId = item.id
        defer { updatingId = nil }
        do {
            try await api.updateWaitingItem(id: item.id, status: "declined")
            CompanionHaptics.success()
            await reload()
        } catch {
            errorMessage = error.localizedDescription
            CompanionHaptics.warning()
        }
    }

    private func markReminded(_ item: WaitingListEntry) async {
        updatingId = item.id
        defer { updatingId = nil }
        do {
            try await api.updateWaitingItem(id: item.id, status: "reminded")
            CompanionHaptics.success()
            await reload()
        } catch {
            errorMessage = error.localizedDescription
            CompanionHaptics.warning()
        }
    }
}

private struct IntakeRow: View {
    let item: WaitingListEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(item.displayTitle)
                    .font(.headline)
                    .foregroundStyle(KhaytDesign.text)
                Spacer()
                Text(item.priorityLabel)
                    .font(.caption2.bold())
                    .foregroundStyle(KhaytDesign.textMuted)
            }
            Text(item.displayClient)
                .font(.subheadline)
                .foregroundStyle(KhaytDesign.textDim)
            if let notes = item.notes, !notes.isEmpty {
                Text(notes)
                    .font(.caption)
                    .foregroundStyle(KhaytDesign.textMuted)
                    .lineLimit(2)
            }
            if let date = item.submittedAt?.prefix(10) {
                Text(String(date))
                    .font(.caption2)
                    .foregroundStyle(KhaytDesign.textMuted)
            }
        }
        .padding(.vertical, 4)
    }
}

struct IntakeDetailSheet: View {
    let item: WaitingListEntry
    let isUpdating: Bool
    let onDecline: () -> Void
    let onRemind: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    LabeledContent(L10n.tr("intake.project"), value: item.displayTitle)
                    LabeledContent(L10n.tr("intake.client"), value: item.displayClient)
                    LabeledContent(L10n.tr("intake.priority"), value: item.priorityLabel)
                    if let material = item.material, !material.isEmpty {
                        LabeledContent(L10n.tr("intake.material"), value: material)
                    }
                    if let est = item.estValue, est > 0 {
                        LabeledContent(L10n.tr("intake.est_value"), value: String(format: "%.0f", est))
                    }
                }
                if let notes = item.notes, !notes.isEmpty {
                    Section(L10n.tr("intake.notes")) {
                        Text(notes)
                            .font(.subheadline)
                    }
                }
                if let email = item.email, !email.isEmpty {
                    Section(L10n.tr("intake.contact")) {
                        LabeledContent(L10n.tr("intake.email"), value: email)
                        if let phone = item.phone, !phone.isEmpty {
                            LabeledContent(L10n.tr("intake.phone"), value: phone)
                        }
                    }
                }
                Section {
                    Button(action: onRemind) {
                        Label(L10n.tr("intake.remind"), systemImage: "bell")
                    }
                    .disabled(isUpdating)
                    Button(role: .destructive, action: onDecline) {
                        Label(L10n.tr("intake.decline"), systemImage: "xmark")
                    }
                    .disabled(isUpdating)
                }
            }
            .navigationTitle(L10n.tr("intake.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.tr("nfc.write.done")) { dismiss() }
                }
            }
        }
    }
}
