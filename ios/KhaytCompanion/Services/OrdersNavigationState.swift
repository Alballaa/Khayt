import Foundation

@MainActor
final class OrdersNavigationState: ObservableObject {
    enum Segment: String {
        case active, recent, intake
    }

    @Published var pendingStatusFilter: OrderStatus?
    @Published var pendingSegment: Segment?
    /// Bumped when any screen requests the Orders tab (including “see all” with no filter).
    @Published private(set) var ordersTabRequest = 0

    func openOrders(filter: OrderStatus? = nil) {
        pendingStatusFilter = filter
        pendingSegment = .active
        ordersTabRequest += 1
    }

    func openIntake() {
        pendingStatusFilter = nil
        pendingSegment = .intake
        ordersTabRequest += 1
    }
}
