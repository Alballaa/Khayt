import SwiftUI

struct OperatorHomeView: View {
    var body: some View {
        TabView {
            NavigationStack { KanbanView() }
                .tabItem { Label("Queue", systemImage: "rectangle.stack.fill") }
            NavigationStack { InventoryView() }
                .tabItem { Label("Spools", systemImage: "shippingbox.fill") }
            NavigationStack {
                SettingsForm()
                    .navigationTitle("Settings")
            }
            .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}
