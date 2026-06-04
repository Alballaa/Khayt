import Foundation

@MainActor
final class OrdersNavigationState: ObservableObject {
    @Published var pendingStatusFilter: OrderStatus?
}
