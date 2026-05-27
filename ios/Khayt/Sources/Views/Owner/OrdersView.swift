import SwiftUI

struct OrdersView: View {
    @Environment(AppState.self) private var appState
    @State private var orders: [Order] = []
    @State private var filter: OrderStatus? = nil
    @State private var error: String?
    @State private var isLoading = false

    var body: some View {
        List {
            Section {
                Picker("Status", selection: $filter) {
                    Text("All").tag(OrderStatus?.none)
                    ForEach(OrderStatus.allCases) { s in
                        Text(s.label).tag(OrderStatus?.some(s))
                    }
                }
                .pickerStyle(.menu)
            }

            if let error {
                Section { Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red) }
            }

            if orders.isEmpty && !isLoading {
                Section {
                    EmptyStateView(icon: "tray", title: "No orders", message: "Pull down to refresh.")
                }
            }

            ForEach(orders) { order in
                NavigationLink(value: order) {
                    OrderRow(order: order)
                }
            }
        }
        .navigationTitle("Orders")
        .navigationDestination(for: Order.self) { OrderDetailView(order: $0) }
        .refreshable { await load() }
        .task(id: filter) { await load() }
    }

    private func load() async {
        guard let api = appState.api else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            self.orders = try await api.orders(limit: 100, status: filter)
            self.error = nil
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct OrderRow: View {
    let order: Order

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(order.project ?? order.id)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                StatusBadge(status: order.status)
            }
            HStack(spacing: 8) {
                if let client = order.client, !client.isEmpty {
                    Label(client, systemImage: "person")
                }
                if let material = order.material, !material.isEmpty {
                    Label(material, systemImage: "drop")
                }
                if let price = order.price {
                    Text(price, format: .currency(code: "SAR"))
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}
