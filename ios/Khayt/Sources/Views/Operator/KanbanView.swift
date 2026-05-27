import SwiftUI

struct KanbanView: View {
    @Environment(AppState.self) private var appState
    @State private var orders: [Order] = []
    @State private var error: String?
    @State private var selectedColumn: OrderStatus = .printing

    private var grouped: [OrderStatus: [Order]] {
        Dictionary(grouping: orders, by: { $0.status })
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Column", selection: $selectedColumn) {
                ForEach(OrderStatus.kanbanColumns) { col in
                    Text(col.label).tag(col)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            if let error { ErrorBanner(message: error) }

            let columnOrders = grouped[selectedColumn] ?? []
            if columnOrders.isEmpty {
                EmptyStateView(icon: "tray", title: "Nothing in \(selectedColumn.label)")
                    .frame(maxHeight: .infinity)
            } else {
                List(columnOrders) { order in
                    KanbanCard(order: order) { newStatus in
                        await transition(order: order, to: newStatus)
                    }
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Production Queue")
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        guard let api = appState.api else { return }
        do {
            orders = try await api.queue()
            error = nil
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func transition(order: Order, to status: OrderStatus) async {
        guard let api = appState.api else { return }
        do {
            try await api.updateOrderStatus(id: order.id, status: status)
            await load()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct KanbanCard: View {
    let order: Order
    let onTransition: (OrderStatus) async -> Void

    private var nextStatuses: [OrderStatus] {
        OrderStatus.kanbanColumns.filter { $0 != order.status }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(order.project ?? order.id).font(.body.weight(.semibold))
                Spacer()
                StatusBadge(status: order.status)
            }
            HStack(spacing: 12) {
                if let client = order.client { Label(client, systemImage: "person") }
                if let machine = order.machine { Label(machine, systemImage: "printer") }
                if let due = order.dueDate { Label(due, systemImage: "calendar") }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            Menu {
                ForEach(nextStatuses) { status in
                    Button {
                        Task { await onTransition(status) }
                    } label: {
                        Label("Move to \(status.label)", systemImage: "arrow.right")
                    }
                }
                Divider()
                Button(role: .destructive) {
                    Task { await onTransition(.onHold) }
                } label: {
                    Label("Put on hold", systemImage: "pause.fill")
                }
            } label: {
                Label("Move", systemImage: "arrow.right.circle.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(.tint.opacity(0.15), in: .capsule)
            }
        }
        .padding()
        .background(.regularMaterial, in: .rect(cornerRadius: 12))
    }
}
