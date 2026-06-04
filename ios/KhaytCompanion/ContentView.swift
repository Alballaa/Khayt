import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @State private var selectedTab = 0

    private let tabs: [KhaytTabItem] = [
        KhaytTabItem(id: 0, title: L10n.tr("tab.home"), icon: "house.fill"),
        KhaytTabItem(id: 1, title: L10n.tr("tab.orders"), icon: "rectangle.stack.fill"),
        KhaytTabItem(id: 2, title: L10n.tr("tab.inventory"), icon: "cylinder.split.1x2.fill"),
        KhaytTabItem(id: 3, title: L10n.tr("tab.machines"), icon: "printer.fill"),
        KhaytTabItem(id: 4, title: L10n.tr("tab.settings"), icon: "gearshape.fill")
    ]

    var body: some View {
        Group {
            if settings.isPaired && settings.isConfigured {
                MainTabView(selectedTab: $selectedTab, tabs: tabs)
            } else {
                PairingView()
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { applyPendingTab() }
    }

    private func applyPendingTab() {
        guard let key = UserDefaults.standard.string(forKey: "khayt.pending.tab") else { return }
        UserDefaults.standard.removeObject(forKey: "khayt.pending.tab")
        switch key {
        case "orders": selectedTab = 1
        case "inventory": selectedTab = 2
        default: break
        }
    }
}

struct MainTabView: View {
    @Binding var selectedTab: Int
    let tabs: [KhaytTabItem]
    @EnvironmentObject private var health: ConnectionHealth
    @EnvironmentObject private var ordersNav: OrdersNavigationState

    var body: some View {
        ZStack {
            KhaytScreenBackground()
            VStack(spacing: 0) {
                ConnectionBanner()
                tabContent
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            KhaytTabBar(selection: $selectedTab, items: tabs)
        }
        .tint(KhaytDesign.accent)
        .onAppear { health.startPolling() }
        .onDisappear { health.stopPolling() }
        .onChange(of: ordersNav.pendingStatusFilter) { _, filter in
            if filter != nil { selectedTab = 1 }
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case 0: DashboardView()
        case 1: OrdersView()
        case 2: InventoryView()
        case 3: MachinesView()
        case 4: SettingsView()
        default: DashboardView()
        }
    }
}
