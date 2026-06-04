import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var ordersNav: OrdersNavigationState

    @State private var status: ShopStatus?
    @State private var queuePreview: [QueueOrder] = []
    @State private var lowStockCount = 0
    @State private var overdueCount = 0
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

                            KanbanStripView(status: status) { stage in
                                ordersNav.pendingStatusFilter = stage
                            }

                            if overdueCount > 0 {
                                overdueBanner
                            }

                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                StatCard(title: L10n.tr("stat.in_queue"), value: "\(status.queued)", icon: "tray.full", tint: .blue)
                                StatCard(title: L10n.tr("stat.printing"), value: "\(status.printing)", icon: "printer.fill", tint: .orange)
                                StatCard(title: L10n.tr("stat.post"), value: "\(status.post)", icon: "paintbrush", tint: .purple)
                                StatCard(title: L10n.tr("stat.qc"), value: "\(status.qc)", icon: "checkmark.seal", tint: .teal)
                            }

                            completedRow(status)

                            if lowStockCount > 0 {
                                lowStockBanner
                            }

                            quickActions

                            if !queuePreview.isEmpty {
                                queuePreviewSection
                            }
                        }
                        .padding()
                    }
                } else if isLoading {
                    ProgressView(L10n.tr("connection.checking"))
                } else {
                    ContentUnavailableView(
                        L10n.tr("connection.unreachable"),
                        systemImage: "wifi.exclamationmark",
                        description: Text(errorMessage ?? L10n.tr("connection.banner.unreachable"))
                    )
                }
            }
            .navigationTitle(L10n.tr("tab.home"))
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
            Text(L10n.tr("home.subtitle"))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func completedRow(_ status: ShopStatus) -> some View {
        HStack {
            Label(L10n.tr("home.completed_today"), systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
            Spacer()
            Text("\(status.completedToday)")
                .font(.title3.bold())
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var lowStockBanner: some View {
        NavigationLink {
            InventoryView()
        } label: {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Text(String(format: L10n.tr("home.low_stock"), lowStockCount))
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

    private var overdueBanner: some View {
        Button {
            ordersNav.pendingStatusFilter = nil
            UserDefaults.standard.set("orders_overdue", forKey: "khayt.orders.filter")
        } label: {
            HStack {
                Image(systemName: "calendar.badge.exclamationmark")
                    .foregroundStyle(.red)
                Text(String(format: L10n.tr("home.overdue"), overdueCount))
                    .font(.subheadline.bold())
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(Color.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L10n.tr("home.quick_actions"))
                .font(.headline)
            HStack(spacing: 12) {
                QuickActionButton(title: L10n.tr("home.action.add_spool"), icon: "plus.circle.fill") {
                    showAddSpool = true
                }
                NavigationLink {
                    OrdersView()
                } label: {
                    QuickActionLabel(title: L10n.tr("home.action.orders"), icon: "rectangle.stack.fill")
                }
                NavigationLink {
                    InventoryView()
                } label: {
                    QuickActionLabel(title: L10n.tr("home.action.inventory"), icon: "cylinder.split.1x2.fill")
                }
            }
        }
    }

    private var queuePreviewSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(L10n.tr("home.active_orders"))
                    .font(.headline)
                Spacer()
                NavigationLink(L10n.tr("home.see_all"), destination: OrdersView())
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
                    VStack(alignment: .trailing, spacing: 4) {
                        CompanionStatusBadge(status: order.status, compact: true)
                        if order.isOverdue {
                            Text(L10n.tr("orders.overdue"))
                                .font(.caption2.bold())
                                .foregroundStyle(.red)
                        }
                    }
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
            overdueCount = q.filter(\.isOverdue).count
            CompanionNotifications.shared.handleDashboardSnapshot(
                status: s,
                queue: q,
                lowStockCount: lowStockCount,
                settings: settings
            )
        } catch {
            status = nil
            queuePreview = []
            lowStockCount = 0
            overdueCount = 0
            errorMessage = error.localizedDescription
            CompanionNotifications.shared.saveDisconnectedSnapshot(shopName: settings.shopLabel)
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
