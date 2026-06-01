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
                .tabItem { Label("Dashboard", systemImage: "gauge.with.dots.needle.67percent") }
            QueueView()
                .tabItem { Label("Queue", systemImage: "rectangle.stack") }
            MachinesView()
                .tabItem { Label("Machines", systemImage: "printer") }
            InventoryView()
                .tabItem { Label("Inventory", systemImage: "cylinder.split.1x2") }
            AddFilamentView()
                .tabItem { Label("Add spool", systemImage: "plus.viewfinder") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .onAppear { health.startPolling() }
        .onDisappear { health.stopPolling() }
    }
}
