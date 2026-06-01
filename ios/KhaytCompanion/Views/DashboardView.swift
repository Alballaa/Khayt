import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var status: ShopStatus?
    @State private var errorMessage: String?
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            Group {
                if let status {
                    ScrollView {
                        VStack(spacing: 16) {
                            Text(settings.shopLabel)
                                .font(.title2.bold())
                                .frame(maxWidth: .infinity, alignment: .leading)

                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                StatCard(title: "In queue", value: "\(status.queued)", icon: "tray.full")
                                StatCard(title: "Printing", value: "\(status.printing)", icon: "printer.fill")
                                StatCard(title: "Post-proc.", value: "\(status.post)", icon: "paintbrush")
                                StatCard(title: "QC", value: "\(status.qc)", icon: "checkmark.seal")
                            }

                            HStack {
                                Label("Completed today", systemImage: "checkmark.circle")
                                Spacer()
                                Text("\(status.completedToday)")
                                    .font(.title3.bold())
                            }
                            .padding()
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                        }
                        .padding()
                    }
                } else if isLoading {
                    ProgressView("Connecting…")
                } else {
                    ContentUnavailableView(
                        "Not connected",
                        systemImage: "wifi.exclamationmark",
                        description: Text(errorMessage ?? "Pull to refresh or check Settings.")
                    )
                }
            }
            .navigationTitle("Dashboard")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            status = try await api.fetchStatus()
        } catch {
            status = nil
            errorMessage = error.localizedDescription
        }
    }
}

private struct StatCard: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title.bold())
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
