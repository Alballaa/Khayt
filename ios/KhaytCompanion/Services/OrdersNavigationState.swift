import Foundation

@MainActor
final class OrdersNavigationState: ObservableObject {
    @Published var pendingStatusFilter: OrderStatus?
    /// Bumped when any screen requests the Orders tab (including “see all” with no filter).
    @Published private(set) var ordersTabRequest = 0

    func openOrders(filter: OrderStatus? = nil) {
        pendingStatusFilter = filter
        ordersTabRequest += 1
    }
}
