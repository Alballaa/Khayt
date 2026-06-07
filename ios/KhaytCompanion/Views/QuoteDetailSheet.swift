import SwiftUI

struct QuoteDetailSheet: View {
    let entry: OrderLogEntry
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var linkInfo: QuoteLinkInfo?
    @State private var isLoading = true
    @State private var isApproving = false
    @State private var errorMessage: String?

    var onChanged: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if let errorMessage {
                    Section {
                        Text(errorMessage).foregroundStyle(.red).font(.subheadline)
                    }
                }

                Section {
                    LabeledContent(L10n.tr("order.create.project"), value: entry.displayTitle)
                    LabeledContent(L10n.tr("order.create.client"), value: entry.displayClient)
                    if let price = entry.price {
                        LabeledContent(L10n.tr("order.price"), value: String(format: "%.2f", price))
                    }
                    if let exp = entry.quoteExpiresAt ?? linkInfo?.quoteExpiresAt, !exp.isEmpty {
                        LabeledContent(L10n.tr("quote.expires"), value: exp)
                    }
                }

                if isLoading {
                    Section { ProgressView() }
                } else if let link = linkInfo {
                    Section(header: Text(L10n.tr("quote.approval_link"))) {
                        if link.alreadyApproved == true {
                            Label(L10n.tr("quote.already_approved"), systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        } else if link.expired == true {
                            Text(L10n.tr("quote.expired"))
                                .foregroundStyle(.orange)
                        }
                        if let url = URL(string: link.quoteUrl) {
                            ShareLink(item: url) {
                                Label(L10n.tr("quote.share_link"), systemImage: "square.and.arrow.up")
                            }
                            Link(L10n.tr("quote.open_preview"), destination: url)
                        }
                    }

                    if link.canApprove == true {
                        Section {
                            Button {
                                Task { await approve() }
                            } label: {
                                if isApproving {
                                    ProgressView().frame(maxWidth: .infinity)
                                } else {
                                    Label(L10n.tr("quote.approve_owner"), systemImage: "checkmark.seal")
                                        .frame(maxWidth: .infinity)
                                }
                            }
                            .disabled(isApproving)
                        } footer: {
                            Text(L10n.tr("quote.approve_footer"))
                                .font(.caption)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(KhaytDesign.sheetBg)
            .navigationTitle(L10n.tr("quote.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.tr("common.done")) { dismiss() }
                }
            }
            .task { await loadLink() }
        }
    }

    private func loadLink() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            linkInfo = try await api.fetchQuoteLink(orderId: entry.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func approve() async {
        isApproving = true
        errorMessage = nil
        defer { isApproving = false }
        do {
            try await api.approveQuote(orderId: entry.id)
            CompanionHaptics.success()
            onChanged()
            await loadLink()
        } catch {
            errorMessage = error.localizedDescription
            CompanionHaptics.warning()
        }
    }
}
