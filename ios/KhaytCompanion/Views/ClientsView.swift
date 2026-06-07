import SwiftUI

struct ClientsView: View {
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var clients: [ClientInfo] = []
    @State private var errorMessage: String?
    @State private var searchText = ""

    private var displayed: [ClientInfo] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return clients }
        return clients.filter {
            $0.displayName.lowercased().contains(q)
                || ($0.phone ?? "").lowercased().contains(q)
                || ($0.email ?? "").lowercased().contains(q)
        }
    }

    var body: some View {
        Group {
            if clients.isEmpty && errorMessage == nil {
                ProgressView()
            } else if displayed.isEmpty {
                ContentUnavailableView(
                    L10n.tr("clients.title"),
                    systemImage: "person.2",
                    description: Text(errorMessage ?? L10n.tr("clients.empty"))
                )
            } else {
                List(displayed) { client in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(client.displayName)
                            .font(.headline)
                            .foregroundStyle(KhaytDesign.text)
                        if let phone = client.phone, !phone.isEmpty {
                            Label(phone, systemImage: "phone")
                                .font(.caption)
                                .foregroundStyle(KhaytDesign.textDim)
                        }
                        if let email = client.email, !email.isEmpty {
                            Label(email, systemImage: "envelope")
                                .font(.caption)
                                .foregroundStyle(KhaytDesign.textDim)
                        }
                    }
                    .padding(.vertical, 2)
                    .listRowBackground(KhaytDesign.surface)
                }
                .khaytPlainList()
            }
        }
        .khaytScreen(title: L10n.tr("clients.title"))
        .searchable(text: $searchText, prompt: L10n.tr("clients.search"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        errorMessage = nil
        do {
            clients = try await api.fetchClients()
        } catch {
            clients = []
            errorMessage = error.localizedDescription
        }
    }
}
