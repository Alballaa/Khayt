import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @EnvironmentObject private var api: KhaytAPIClient

    @State private var status: ShopStatus?
    @State private var queuePreview: [QueueOrder] = []
    @State private var lowStockCount = 0
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var showAddSpool = false

    var body: some View {
        NavigationStack {
            Group {
                if let status {
                    ScrollView {
                        VStack(spacing: 20) {
                            headerBlock

                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                StatCard(title: "In queue", value: "\(status.queued)", icon: "tray.full", tint: .blue)
                                StatCard(title: "Printing", value: "\(status.printing)", icon: "printer.fill", tint: .orange)
                                StatCard(title: "Post-proc.", value: "\(status.post)", icon: "paintbrush", tint: .purple)
                                StatCard(title: "QC", value: "\(status.qc)", icon: "checkmark.seal", tint: .teal)
                            }

                            completedRow(status)

                            if lowStockCount > 0 {
                                alertBanner
                            }

                            quickActions

                            if !queuePreview.isEmpty {
                                queuePreviewSection
                            }
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
            .toolbar { ToolbarItem(placement: .topBarTrailing) { ConnectionBadge() } }
            .refreshable { await load() }
            .task { await load() }
            .sheet(isPresented: $showAddSpool) {
                AddSpoolSheet { Task { await load() } }
            }
        }
    }

    private var headerBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(settings.shopLabel)
                .font(.title2.bold())
            Text("Live from your Khayt desktop")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func completedRow(_ status: ShopStatus) -> some View {
        HStack {
            Label("Completed today", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
            Spacer()
            Text("\(status.completedToday)")
                .font(.title3.bold())
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var alertBanner: some View {
        NavigationLink {
            InventoryView()
        } label: {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Text("\(lowStockCount) spool\(lowStockCount == 1 ? "" : "s") low on filament")
                    .font(.subheadline.bold())
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Quick actions")
                .font(.headline)
            HStack(spacing: 12) {
                QuickActionButton(title: "Add spool", icon: "plus.circle.fill") {
                    showAddSpool = true
                }
                NavigationLink {
                    OrdersView()
                } label: {
                    QuickActionLabel(title: "Orders", icon: "rectangle.stack.fill")
                }
                NavigationLink {
                    InventoryView()
                } label: {
                    QuickActionLabel(title: "Inventory", icon: "cylinder.split.1x2.fill")
                }
            }
        }
    }

    private var queuePreviewSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Active orders")
                    .font(.headline)
                Spacer()
                NavigationLink("See all", destination: OrdersView())
                    .font(.caption.bold())
            }
            ForEach(queuePreview.prefix(5)) { order in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(order.displayTitle)
                            .font(.subheadline.bold())
                        Text(order.displayClient)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    CompanionStatusBadge(status: order.status, compact: true)
                }
                .padding(.vertical, 6)
                if order.id != queuePreview.prefix(5).last?.id {
                    Divider()
                }
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let statusTask = api.fetchStatus()
            async let queueTask = api.fetchQueue()
            async let inventoryTask = api.fetchInventory()
            let (s, q, inv) = try await (statusTask, queueTask, inventoryTask)
            status = s
            queuePreview = q
            lowStockCount = inv.filter(\.isLowStock).count
        } catch {
            status = nil
            queuePreview = []
            lowStockCount = 0
            errorMessage = error.localizedDescription
        }
    }
}

private struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    var tint: Color = .accentColor

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(tint)
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

private struct QuickActionButton: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            QuickActionLabel(title: title, icon: icon)
        }
        .buttonStyle(.plain)
    }
}

private struct QuickActionLabel: View {
    let title: String
    let icon: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(CompanionTheme.brand)
            Text(title)
                .font(.caption.bold())
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
