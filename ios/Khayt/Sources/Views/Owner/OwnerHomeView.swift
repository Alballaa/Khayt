import SwiftUI

struct OwnerHomeView: View {
    var body: some View {
        TabView {
            NavigationStack { DashboardView() }
                .tabItem { Label("Dashboard", systemImage: "chart.bar.fill") }
            NavigationStack { OrdersView() }
                .tabItem { Label("Orders", systemImage: "list.bullet.rectangle") }
            NavigationStack { MachinesView() }
                .tabItem { Label("Machines", systemImage: "printer.fill") }
            NavigationStack { InventoryView() }
                .tabItem { Label("Inventory", systemImage: "shippingbox.fill") }
            NavigationStack {
                SettingsForm()
                    .navigationTitle("Settings")
            }
            .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}
