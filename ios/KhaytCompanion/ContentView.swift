import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: ConnectionSettings

    var body: some View {
        Group {
            if settings.isConfigured {
                MainTabView()
            } else {
                NavigationStack {
                    SettingsView(isOnboarding: true)
                }
            }
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "gauge.with.dots.needle.67percent") }
            QueueView()
                .tabItem { Label("Queue", systemImage: "rectangle.stack") }
            InventoryView()
                .tabItem { Label("Inventory", systemImage: "cylinder.split.1x2") }
            ScanView()
                .tabItem { Label("Scan NFC", systemImage: "wave.3.right") }
            SettingsView(isOnboarding: false)
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
