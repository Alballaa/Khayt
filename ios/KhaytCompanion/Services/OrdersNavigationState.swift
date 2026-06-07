import Foundation

@MainActor
final class OrdersNavigationState: ObservableObject {
    enum Segment: String {
        case active, quotes, recent, intake
    }

    @Published var pendingStatusFilter: OrderStatus?
    @Published var pendingSegment: Segment?
    /// When set, MainTabView switches to this tab index on the next navigation request.
    @Published var requestedTab: Int?
    /// Bumped when any screen requests tab navigation.
    @Published private(set) var ordersTabRequest = 0

    func openOrders(filter: OrderStatus? = nil) {
        pendingStatusFilter = filter
        pendingSegment = .active
        requestedTab = 1
        ordersTabRequest += 1
    }

    func openIntake() {
        pendingStatusFilter = nil
        pendingSegment = .intake
        requestedTab = 1
        ordersTabRequest += 1
    }

    func openInventory() {
        requestedTab = 2
        ordersTabRequest += 1
    }
}
