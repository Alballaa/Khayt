import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: ConnectionSettings

    var body: some View {
        Group {
            if settings.isPaired && settings.isConfigured {
                MainTabView()
            } else {
                PairingView()
            }
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject private var health: ConnectionHealth

    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Home", systemImage: "house.fill") }
            OrdersView()
                .tabItem { Label("Orders", systemImage: "rectangle.stack.fill") }
            InventoryView()
                .tabItem { Label("Inventory", systemImage: "cylinder.split.1x2.fill") }
            MachinesView()
                .tabItem { Label("Machines", systemImage: "printer.fill") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
        .tint(CompanionTheme.brand)
        .onAppear { health.startPolling() }
        .onDisappear { health.stopPolling() }
    }
}
