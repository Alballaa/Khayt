import SwiftUI

struct TrackOrderView: View {
    @Environment(AppState.self) private var appState
    @AppStorage("khayt.customer.lastOrderId") private var orderId: String = ""
    @State private var showTracker = false

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "shippingbox.and.arrow.backward.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
                .padding(.top, 40)

            Text("Track your order")
                .font(.title2.weight(.semibold))

            Text("Enter the order ID from your quote or invoice.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            TextField("Order ID", text: $orderId)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding()
                .background(.regularMaterial, in: .rect(cornerRadius: 12))
                .padding(.horizontal)

            Button {
                showTracker = true
            } label: {
                Text("Track")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(orderId.trimmingCharacters(in: .whitespaces).isEmpty)
            .padding(.horizontal)

            Spacer()
        }
        .navigationTitle("Track")
        .sheet(isPresented: $showTracker) {
            if let url = trackerURL {
                OrderWebView(url: url, title: "Order \(orderId)")
            }
        }
    }

    private var trackerURL: URL? {
        guard let base = appState.connection?.baseURL else { return nil }
        let trimmed = orderId.trimmingCharacters(in: .whitespaces)
        return base.appending(path: "order").appending(path: trimmed)
    }
}
