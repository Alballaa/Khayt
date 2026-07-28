import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var ordersNav: OrdersNavigationState
    // The banner already knows whether this is a network problem or a rejected
    // PIN; the dashboard card used to guess. See emptyState.
    @EnvironmentObject private var health: ConnectionHealth

    @State private var status: ShopStatus?
    @State private var queuePreview: [QueueOrder] = []
    @State private var lowStockCount = 0
    @State private var overdueCount = 0
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var showAddSpool = false

    private var navTitle: String {
        settings.shopLabel.isEmpty ? "Khayt" : settings.shopLabel
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let status {
                        statsRow(status)
                        pipelineSection(status)
                        if overdueCount > 0 { overdueBanner }
                        if lowStockCount > 0 { lowStockBanner }
                        quickActions
                        if !queuePreview.isEmpty { activeOrdersSection }
                    } else if isLoading {
                        ProgressView(L10n.tr("connection.checking"))
                            .frame(maxWidth: .infinity, minHeight: 200)
                    } else {
                        emptyState
                    }
                }
                .padding(.bottom, 8)
            }
            .scrollIndicators(.hidden)
            .background(KhaytDesign.bg.ignoresSafeArea())
            .navigationTitle(navTitle)
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { ConnectionBadge() }
            }
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

    private var lowStockBanner: some View {
        NavigationLink {
            InventoryView()
        } label: {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(KhaytDesign.warn)
                Text(String(format: L10n.tr("home.low_stock"), lowStockCount))
                    .font(.subheadline.bold())
                    .foregroundStyle(KhaytDesign.text)
                Spacer()
                Image(systemName: "chevron.forward")
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

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 10) {
            KhaytSectionHeader(text: L10n.tr("home.quick_actions"))
            HStack(spacing: 10) {
                quickTile(L10n.tr("home.action.add_spool"), "plus.circle.fill") { showAddSpool = true }
                NavigationLink { OrdersView() } label: {
                    quickTileLabel(L10n.tr("home.action.orders"), "rectangle.stack.fill")
                }
                NavigationLink { InventoryView() } label: {
                    quickTileLabel(L10n.tr("home.action.inventory"), "cylinder.split.1x2.fill")
                }
            }
            .padding(.horizontal, KhaytDesign.pad)
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
                .font(.system(size: 22))
                .foregroundStyle(KhaytDesign.brand)
                .frame(height: 26)
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(KhaytDesign.text)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(KhaytDesign.surface, in: RoundedRectangle(cornerRadius: KhaytDesign.radiusLG))
        .overlay(
            RoundedRectangle(cornerRadius: KhaytDesign.radiusLG)
                .stroke(KhaytDesign.border, lineWidth: 0.5)
        )
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
        // This card hardcoded "Desktop unreachable" and a Wi-Fi icon for every
        // failure, so a rejected LAN PIN sent the shop off to check their router
        // — while the banner two inches above it correctly said "Wrong LAN PIN".
        // ConnectionHealth already separates the two and carries the right
        // wording and icon for each; the card just wasn't asking.
        //
        // Anything that is not a diagnosed auth failure still reads as
        // unreachable: `.connected` here means the fetch failed for some other
        // reason, and "Connected" over an empty dashboard would be a worse lie
        // than the one being fixed.
        let failure: ConnectionHealthState = health.state == .unauthorized ? .unauthorized : .unreachable
        return KhaytCard {
            VStack(spacing: 12) {
                Image(systemName: failure.systemImage)
                    .font(.largeTitle)
                    .foregroundStyle(KhaytDesign.textMuted)
                Text(failure.label)
                    .font(.headline)
                    .foregroundStyle(KhaytDesign.text)
                Text(errorMessage ?? L10n.tr(failure == .unauthorized
                                             ? "connection.banner.pin"
                                             : "connection.banner.unreachable"))
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
        defer { isLoading = false }
        do {
            async let statusTask = api.fetchStatus()
            async let queueTask = api.fetchQueue()
            async let inventoryTask = api.fetchInventory()
            // Best-effort live printer data for the home screen widget — fetched
            // concurrently so it isn't in the cancellable tail of the task.
            async let liveTask: [MachineLiveStatus] = (try? await api.fetchMachinesLive()) ?? []
            let (s, q, inv) = try await (statusTask, queueTask, inventoryTask)
            let livePrints = await liveTask
                .filter { $0.isPrinting }
                .map { WidgetPrint(id: $0.id, name: $0.displayName, progress: $0.progress ?? 0, eta: $0.etaText) }
            status = s
            queuePreview = q.filter { $0.status.lowercased() != "completed" }
            lowStockCount = inv.filter(\.isLowStock).count
            overdueCount = q.filter(\.isOverdue).count
            CompanionNotifications.shared.handleDashboardSnapshot(
                status: s, queue: q, lowStockCount: lowStockCount, settings: settings, livePrints: livePrints
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
