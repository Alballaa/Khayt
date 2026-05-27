import SwiftUI

struct OrderDetailView: View {
    @Environment(AppState.self) private var appState
    @State var order: Order
    @State private var error: String?
    @State private var isUpdating = false

    var body: some View {
        Form {
            Section {
                LabeledContent("Project", value: order.project ?? "—")
                LabeledContent("Client", value: order.client ?? "—")
                LabeledContent("ID", value: order.id)
            }

            Section("Status") {
                Picker("Status", selection: $order.status) {
                    ForEach(OrderStatus.allCases) { s in
                        Text(s.label).tag(s)
                    }
                }
                .onChange(of: order.status) { _, new in
                    Task { await update(to: new) }
                }
                if isUpdating { ProgressView() }
            }

            Section("Details") {
                if let material = order.material { LabeledContent("Material", value: material) }
                if let price = order.price {
                    LabeledContent("Price") {
                        Text(price, format: .currency(code: "SAR"))
                    }
                }
                if let machine = order.machine { LabeledContent("Machine", value: machine) }
                if let priority = order.priority { LabeledContent("Priority", value: priority.capitalized) }
                if let dueDate = order.dueDate { LabeledContent("Due", value: dueDate) }
                if let date = order.date { LabeledContent("Created", value: date) }
                if let payment = order.paymentStatus { LabeledContent("Payment", value: payment.capitalized) }
            }

            if let error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red)
                }
            }
        }
        .navigationTitle(order.project ?? order.id)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func update(to status: OrderStatus) async {
        guard let api = appState.api else { return }
        isUpdating = true
        defer { isUpdating = false }
        do {
            try await api.updateOrderStatus(id: order.id, status: status)
            error = nil
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
