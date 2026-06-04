import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: ConnectionSettings
    @State private var selectedTab = 0

    var body: some View {
        Group {
            if settings.isPaired && settings.isConfigured {
                MainTabView(selectedTab: $selectedTab)
            } else {
                PairingView()
            }
        }
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
    @EnvironmentObject private var health: ConnectionHealth
    @EnvironmentObject private var ordersNav: OrdersNavigationState

    var body: some View {
        VStack(spacing: 0) {
            ConnectionBanner()
            TabView(selection: $selectedTab) {
                DashboardView()
                    .tabItem { Label(L10n.tr("tab.home"), systemImage: "house.fill") }
                    .tag(0)
                OrdersView()
                    .tabItem { Label(L10n.tr("tab.orders"), systemImage: "rectangle.stack.fill") }
                    .tag(1)
                InventoryView()
                    .tabItem { Label(L10n.tr("tab.inventory"), systemImage: "cylinder.split.1x2.fill") }
                    .tag(2)
                MachinesView()
                    .tabItem { Label(L10n.tr("tab.machines"), systemImage: "printer.fill") }
                    .tag(3)
                SettingsView()
                    .tabItem { Label(L10n.tr("tab.settings"), systemImage: "gearshape.fill") }
                    .tag(4)
            }
        }
        .tint(CompanionTheme.brand)
        .onAppear { health.startPolling() }
        .onDisappear { health.stopPolling() }
        .onChange(of: ordersNav.pendingStatusFilter) { _, filter in
            if filter != nil { selectedTab = 1 }
        }
    }
}
