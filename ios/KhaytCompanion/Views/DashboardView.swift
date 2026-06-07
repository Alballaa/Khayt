import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var health: ConnectionHealth
    @EnvironmentObject private var ordersNav: OrdersNavigationState

    @State private var status: ShopStatus?
    @State private var queuePreview: [QueueOrder] = []
    @State private var lowStockCount = 0
    @State private var overdueCount = 0
    @State private var waitingCount = 0
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var showAddSpool = false
    @State private var usingCachedData = false
    @State private var cacheSavedAt: Date?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if usingCachedData {
                        CachedDataBanner(savedAt: cacheSavedAt)
                    }
                    if !health.isDesktopReachable {
                        offlineToolsSection
                    }
                    if let status {
                        statsRow(status)
                        pipelineSection(status)
                        if waitingCount > 0 { waitingBanner }
                        if overdueCount > 0 { overdueBanner }
                        if lowStockCount > 0 { lowStockBanner }
                        quickActions
                        if !queuePreview.isEmpty { activeOrdersSection }
                    } else if isLoading {
                        ProgressView(L10n.tr("connection.checking"))
                            .frame(maxWidth: .infinity, minHeight: 200)
                    } else if settings.prefersOfflineTools && !health.isDesktopReachable {
                        offlineWelcome
                    } else {
                        emptyState
                    }
                }
                .padding(.bottom, 8)
            }
            .scrollIndicators(.hidden)
            .background(Color.clear)
            .navigationTitle(settings.shopLabel)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { ConnectionBadge() }
            }
            .toolbarBackground(KhaytDesign.navBg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .refreshable { await load() }
            .task { await load() }
            .sheet(isPresented: $showAddSpool) {
                AddSpoolSheet { Task { await load() } }
            }
        }
    }

    private func statsRow(_ status: ShopStatus) -> some View {
        HStack(spacing: 10) {
            KhaytStatBlock(
                value: "\(status.queued)",
                label: L10n.tr("stat.in_queue"),
                color: KhaytDesign.statusColor(for: "pending")
            )
            KhaytStatBlock(
                value: "\(status.printing)",
                label: L10n.tr("stat.printing"),
                color: KhaytDesign.statusColor(for: "printing"),
                subtitle: status.printing > 0 ? nil : L10n.tr("home.no_printing")
            )
            KhaytStatBlock(
                value: "\(status.completedToday)",
                label: L10n.tr("home.completed_today"),
                color: KhaytDesign.statusColor(for: "completed")
            )
        }
        .padding(.horizontal, KhaytDesign.pad)
        .padding(.top, 4)
    }

    private func pipelineSection(_ status: ShopStatus) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            KhaytSectionHeader(text: L10n.tr("home.pipeline"), actionTitle: L10n.tr("home.all_orders")) {
                ordersNav.openOrders()
            }
            KhaytCard(padding: 0) {
                KanbanStripView(status: status) { stage in
                    ordersNav.openOrders(filter: stage)
                }
            }
            .padding(.horizontal, KhaytDesign.pad)
        }
    }

    private var overdueBanner: some View {
        Button {
            UserDefaults.standard.set("orders_overdue", forKey: "khayt.orders.filter")
            ordersNav.openOrders()
        } label: {
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
            .padding(12)
            .background(KhaytDesign.dangerSoft, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusLG))
            .overlay(RoundedRectangle(cornerRadius: KhaytDesign.radiusLG).stroke(KhaytDesign.danger.opacity(0.2), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, KhaytDesign.pad)
    }

    private var waitingBanner: some View {
        Button {
            ordersNav.openIntake()
        } label: {
            HStack {
                Image(systemName: "tray.and.arrow.down.fill")
                    .foregroundStyle(KhaytDesign.brand)
                Text(String(format: L10n.tr("home.waiting"), waitingCount))
                    .font(.subheadline.bold())
                    .foregroundStyle(KhaytDesign.text)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(KhaytDesign.textMuted)
            }
            .padding(12)
            .background(KhaytDesign.accentSoft, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusLG))
            .overlay(RoundedRectangle(cornerRadius: KhaytDesign.radiusLG).stroke(KhaytDesign.brand.opacity(0.2), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, KhaytDesign.pad)
    }

    private var lowStockBanner: some View {
        Button {
            ordersNav.openInventory()
        } label: {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(KhaytDesign.warn)
                Text(String(format: L10n.tr("home.low_stock"), lowStockCount))
                    .font(.subheadline.bold())
                    .foregroundStyle(KhaytDesign.text)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(KhaytDesign.textMuted)
            }
            .padding(12)
            .background(KhaytDesign.warnSoft, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusLG))
            .overlay(RoundedRectangle(cornerRadius: KhaytDesign.radiusLG).stroke(KhaytDesign.warn.opacity(0.2), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, KhaytDesign.pad)
    }

    private var offlineToolsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            KhaytSectionHeader(text: L10n.tr("offline.tools_title"))
            Text(L10n.tr("offline.tools_subtitle"))
                .font(.caption)
                .foregroundStyle(KhaytDesign.textMuted)
                .padding(.horizontal, KhaytDesign.pad)
            HStack(spacing: 10) {
                quickTile(L10n.tr("home.action.scan_label"), "barcode.viewfinder") { showAddSpool = true }
                quickTile(L10n.tr("home.action.nfc_tools"), "wave.3.right") { showAddSpool = true }
            }
            .padding(.horizontal, KhaytDesign.pad)
        }
    }

    private var offlineWelcome: some View {
        KhaytCard {
            VStack(spacing: 12) {
                Image(systemName: "iphone.gen3")
                    .font(.largeTitle)
                    .foregroundStyle(KhaytDesign.brand)
                Text(L10n.tr("offline.welcome.title"))
                    .font(.headline)
                    .foregroundStyle(KhaytDesign.text)
                Text(L10n.tr("offline.welcome.body"))
                    .font(.caption)
                    .foregroundStyle(KhaytDesign.textMuted)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, KhaytDesign.pad)
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 10) {
            KhaytSectionHeader(text: L10n.tr("home.quick_actions"))
            HStack(spacing: 10) {
                quickTile(L10n.tr("home.action.add_spool"), "plus.circle.fill") { showAddSpool = true }
                quickTile(L10n.tr("home.action.orders"), "rectangle.stack.fill") { ordersNav.openOrders() }
                quickTile(L10n.tr("home.action.inventory"), "cylinder.split.1x2.fill") { ordersNav.openInventory() }
            }
            .padding(.horizontal, KhaytDesign.pad)
            if health.isDesktopReachable {
                NavigationLink { ClientsView() } label: {
                    quickTileLabel(L10n.tr("clients.title"), "person.2.fill")
                }
                .padding(.horizontal, KhaytDesign.pad)
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
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(KhaytDesign.brand)
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(KhaytDesign.text)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .background(KhaytDesign.surface, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusLG))
    }

    private var activeOrdersSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            KhaytSectionHeader(text: L10n.tr("home.active_orders"), actionTitle: L10n.tr("home.see_all")) {
                ordersNav.openOrders()
            }
            ForEach(queuePreview.prefix(4)) { order in
                miniOrderRow(order)
            }
        }
    }

    private func miniOrderRow(_ order: QueueOrder) -> some View {
        let stageColor = KhaytDesign.statusColor(for: order.status)
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(order.displayTitle)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(KhaytDesign.text)
                        .lineLimit(1)
                    if order.isOverdue {
                        Text(L10n.tr("orders.overdue"))
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(KhaytDesign.danger)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(KhaytDesign.dangerSoft, in: RoundedRectangle(cornerRadius: 6))
                    }
                }
                Text(order.displayClient)
                    .font(.system(size: 12))
                    .foregroundStyle(KhaytDesign.textDim)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 5) {
                CompanionStatusBadge(status: order.status, compact: true)
                Text(order.id)
                    .font(.system(size: 11))
                    .foregroundStyle(KhaytDesign.textMuted)
            }
        }
        .padding(12)
        .background(KhaytDesign.surface, in: RoundedRectangle(cornerRadius: 14))
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2)
                .fill(stageColor)
                .frame(width: 3)
                .padding(.vertical, 8)
        }
        .padding(.horizontal, KhaytDesign.pad)
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
        .padding(.horizontal, KhaytDesign.pad)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        usingCachedData = false
        defer { isLoading = false }
        guard api.isConfigured else {
            _ = applyCacheFallback()
            return
        }
        do {
            async let statusTask = api.fetchStatus()
            async let queueTask = api.fetchQueue()
            async let inventoryTask = api.fetchInventory()
            let (s, q, inv) = try await (statusTask, queueTask, inventoryTask)
            status = s
            queuePreview = q.filter { $0.status.lowercased() != "completed" }
            lowStockCount = inv.filter(\.isLowStock).count
            overdueCount = q.filter(\.isOverdue).count
            waitingCount = s.waitingCount
            cacheSavedAt = nil
            CompanionDataCache.save {
                $0.status = s
                $0.queue = q
                $0.inventory = inv
            }
            CompanionNotifications.shared.handleDashboardSnapshot(
                status: s, queue: q, lowStockCount: lowStockCount, settings: settings
            )
        } catch {
            if !applyCacheFallback() {
                status = nil
                queuePreview = []
                lowStockCount = 0
                overdueCount = 0
                waitingCount = 0
                errorMessage = error.localizedDescription
            }
            CompanionNotifications.shared.saveDisconnectedSnapshot(shopName: settings.shopLabel)
        }
    }

    @discardableResult
    private func applyCacheFallback() -> Bool {
        guard let cached = CompanionDataCache.load(),
              cached.status != nil || !(cached.queue ?? []).isEmpty else { return false }
        status = cached.status
        let q = cached.queue ?? []
        queuePreview = q.filter { $0.status.lowercased() != "completed" }
        lowStockCount = (cached.inventory ?? []).filter(\.isLowStock).count
        overdueCount = q.filter(\.isOverdue).count
        waitingCount = cached.status?.waitingCount ?? 0
        usingCachedData = true
        cacheSavedAt = cached.savedAt
        errorMessage = nil
        return true
    }
}
