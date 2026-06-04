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
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let status {
                        headerBlock
                        KanbanStripView(status: status) { stage in
                            ordersNav.pendingStatusFilter = stage
                        }
                        if overdueCount > 0 { overdueBanner }
                        kpiGrid(status)
                        completedCard(status)
                        if lowStockCount > 0 { lowStockBanner }
                        quickActions
                        if !queuePreview.isEmpty { ordersCard }
                    } else if isLoading {
                        ProgressView(L10n.tr("connection.checking"))
                            .frame(maxWidth: .infinity, minHeight: 200)
                    } else {
                        emptyState
                    }
                }
                .padding(KhaytDesign.pad)
                .padding(.bottom, 8)
            }
            .scrollIndicators(.hidden)
            .background(Color.clear)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 10) {
                        KhaytLogoMark(size: 28)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(settings.shopLabel)
                                .font(.headline)
                                .foregroundStyle(KhaytDesign.text)
                            Text(L10n.tr("home.subtitle"))
                                .font(.caption2)
                                .foregroundStyle(KhaytDesign.textMuted)
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) { ConnectionBadge() }
            }
            .toolbarBackground(KhaytDesign.bg2, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .refreshable { await load() }
            .task { await load() }
            .sheet(isPresented: $showAddSpool) {
                AddSpoolSheet { Task { await load() } }
            }
        }
    }

    private var headerBlock: some View {
        EmptyView()
    }

    private func kpiGrid(_ status: ShopStatus) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            kpiCell(L10n.tr("stat.printing"), "\(status.printing)", KhaytDesign.ok)
            kpiCell(L10n.tr("stat.post"), "\(status.post)", KhaytDesign.violet)
            kpiCell(L10n.tr("stat.qc"), "\(status.qc)", KhaytDesign.accent)
            kpiCell(L10n.tr("stat.in_queue"), "\(status.queued)", KhaytDesign.info)
        }
    }

    private func kpiCell(_ label: String, _ value: String, _ color: Color) -> some View {
        KhaytCard(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                KhaytEyebrow(text: label)
                Text(value)
                    .font(.system(size: 26, weight: .semibold, design: .rounded))
                    .foregroundStyle(KhaytDesign.text)
            }
            .overlay(alignment: .topTrailing) {
                Circle().fill(color).frame(width: 8, height: 8)
            }
        }
    }

    private func completedCard(_ status: ShopStatus) -> some View {
        KhaytCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    KhaytEyebrow(text: L10n.tr("home.completed_today"))
                    KhaytMetric(value: "\(status.completedToday)", unit: nil)
                }
                Spacer()
                Image(systemName: "checkmark.circle.fill")
                    .font(.title)
                    .foregroundStyle(KhaytDesign.ok)
            }
        }
    }

    private var overdueBanner: some View {
        Button {
            UserDefaults.standard.set("orders_overdue", forKey: "khayt.orders.filter")
            ordersNav.pendingStatusFilter = nil
        } label: {
            KhaytCard(padding: 12) {
                HStack {
                    Image(systemName: "calendar.badge.exclamationmark")
                        .foregroundStyle(KhaytDesign.danger)
                    Text(String(format: L10n.tr("home.overdue"), overdueCount))
                        .font(.subheadline.bold())
                        .foregroundStyle(KhaytDesign.text)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.bold())
                        .foregroundStyle(KhaytDesign.textMuted)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var lowStockBanner: some View {
        NavigationLink {
            InventoryView()
        } label: {
            KhaytCard(padding: 12) {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(KhaytDesign.warn)
                    Text(String(format: L10n.tr("home.low_stock"), lowStockCount))
                        .font(.subheadline.bold())
                        .foregroundStyle(KhaytDesign.text)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundStyle(KhaytDesign.textMuted)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 10) {
            KhaytSectionTitle(text: L10n.tr("home.quick_actions"))
            HStack(spacing: 10) {
                quickTile(L10n.tr("home.action.add_spool"), "plus.circle.fill") { showAddSpool = true }
                NavigationLink { OrdersView() } label: {
                    quickTileLabel(L10n.tr("home.action.orders"), "rectangle.stack.fill")
                }
                NavigationLink { InventoryView() } label: {
                    quickTileLabel(L10n.tr("home.action.inventory"), "cylinder.split.1x2.fill")
                }
            }
        }
    }

    private func quickTile(_ title: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            quickTileLabel(title, icon)
        }
        .buttonStyle(.plain)
    }

    private func quickTileLabel(_ title: String, _ icon: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(KhaytDesign.accent)
            Text(title)
                .font(.caption.bold())
                .foregroundStyle(KhaytDesign.textDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(KhaytDesign.surface, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusMD))
        .overlay(RoundedRectangle(cornerRadius: KhaytDesign.radiusMD).stroke(KhaytDesign.border, lineWidth: 1))
    }

    private var ordersCard: some View {
        KhaytCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    KhaytSectionTitle(text: L10n.tr("home.active_orders"))
                    Spacer()
                    NavigationLink(L10n.tr("home.see_all"), destination: OrdersView())
                        .font(.caption.bold())
                        .foregroundStyle(KhaytDesign.accent)
                }
                KhaytThreadDivider()
                ForEach(queuePreview.prefix(5)) { order in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(order.displayTitle)
                                .font(.subheadline.bold())
                                .foregroundStyle(KhaytDesign.text)
                            Text(order.displayClient)
                                .font(.caption)
                                .foregroundStyle(KhaytDesign.textMuted)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            CompanionStatusBadge(status: order.status, compact: true)
                            if order.isOverdue {
                                Text(L10n.tr("orders.overdue"))
                                    .font(.caption2.bold())
                                    .foregroundStyle(KhaytDesign.danger)
                            }
                        }
                    }
                    if order.id != queuePreview.prefix(5).last?.id {
                        Divider().overlay(KhaytDesign.hairline)
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        KhaytCard {
            VStack(spacing: 12) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.largeTitle)
                    .foregroundStyle(KhaytDesign.textMuted)
                Text(L10n.tr("connection.unreachable"))
                    .font(.headline)
                    .foregroundStyle(KhaytDesign.text)
                Text(errorMessage ?? L10n.tr("connection.banner.unreachable"))
                    .font(.caption)
                    .foregroundStyle(KhaytDesign.textMuted)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
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
                status: s, queue: q, lowStockCount: lowStockCount, settings: settings
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
