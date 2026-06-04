import SwiftUI

/// Active production queue + recent order history.
struct OrdersView: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var ordersNav: OrdersNavigationState

    enum Segment: String, CaseIterable, Identifiable {
        case active
        case recent
        var id: String { rawValue }
        var title: String {
            switch self {
            case .active: return L10n.tr("orders.active")
            case .recent: return L10n.tr("orders.recent")
            }
        }
    }

    enum ActiveFilter: Equatable {
        case all
        case status(OrderStatus)
        case overdue
    }

    @State private var segment: Segment = .active
    @State private var queue: [QueueOrder] = []
    @State private var recent: [OrderLogEntry] = []
    @State private var activeFilter: ActiveFilter = .all
    @State private var errorMessage: String?
    @State private var updatingId: String?
    @State private var selectedOrder: QueueOrder?

    private var filteredQueue: [QueueOrder] {
        switch activeFilter {
        case .all: return queue
        case .status(let st): return queue.filter { $0.status == st.rawValue }
        case .overdue: return queue.filter(\.isOverdue)
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Orders", selection: $segment) {
                    ForEach(Segment.allCases) { s in
                        Text(s.title).tag(s)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 8)

                if segment == .active {
                    activeContent
                } else {
                    recentContent
                }
            }
            .navigationTitle(L10n.tr("tab.orders"))
            .toolbar { ToolbarItem(placement: .topBarTrailing) { ConnectionBadge() } }
            .refreshable { await load() }
            .task(id: segment) { await load() }
            .onAppear { applyExternalFilters() }
            .onChange(of: ordersNav.pendingStatusFilter) { _, _ in applyExternalFilters() }
            .sheet(item: $selectedOrder) { order in
                OrderDetailSheet(
                    order: order,
                    isUpdating: updatingId == order.id,
                    onAdvance: { Task { await advance(order) } },
                    onSetStatus: { status in Task { await setStatus(order, status: status) } }
                )
            }
        }
    }

    private func applyExternalFilters() {
        if let pending = ordersNav.pendingStatusFilter {
            activeFilter = .status(pending)
            segment = .active
            ordersNav.pendingStatusFilter = nil
        } else if UserDefaults.standard.string(forKey: "khayt.orders.filter") == "orders_overdue" {
            activeFilter = .overdue
            segment = .active
            UserDefaults.standard.removeObject(forKey: "khayt.orders.filter")
        }
    }

    @ViewBuilder
    private var activeContent: some View {
        if !queue.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    FilterChip(title: L10n.tr("orders.filter.all"), selected: activeFilter == .all) { activeFilter = .all }
                    FilterChip(title: L10n.tr("orders.overdue"), selected: activeFilter == .overdue) { activeFilter = .overdue }
                    ForEach([OrderStatus.pending, .printing, .post, .qc, .on_hold], id: \.self) { st in
                        FilterChip(title: st.localizedLabel, selected: activeFilter == .status(st)) {
                            activeFilter = .status(st)
                        }
                    }
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 4)
        }

        Group {
            if queue.isEmpty && errorMessage == nil && segment == .active {
                ProgressView()
            } else if filteredQueue.isEmpty {
                ContentUnavailableView(
                    L10n.tr("tab.orders"),
                    systemImage: "tray",
                    description: Text(errorMessage ?? "—")
                )
            } else {
                List(filteredQueue) { order in
                    Button {
                        selectedOrder = order
                    } label: {
                        QueueOrderRow(
                            order: order,
                            isUpdating: updatingId == order.id,
                            onAdvance: { Task { await advance(order) } }
                        )
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    @ViewBuilder
    private var recentContent: some View {
        Group {
            if recent.isEmpty && errorMessage == nil {
                ProgressView()
            } else if recent.isEmpty {
                ContentUnavailableView(
                    L10n.tr("orders.recent"),
                    systemImage: "clock",
                    description: Text(errorMessage ?? "—")
                )
            } else {
                List(recent) { entry in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(entry.displayTitle)
                                .font(.headline)
                            Spacer()
                            CompanionStatusBadge(status: entry.status, compact: true)
                        }
                        Text(entry.displayClient)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        HStack {
                            if let date = entry.date ?? entry.dueDate {
                                Text(date)
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                            if entry.isOverdue {
                                Text(L10n.tr("orders.overdue"))
                                    .font(.caption2.bold())
                                    .foregroundStyle(.red)
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    private func load() async {
        errorMessage = nil
        do {
            switch segment {
            case .active:
                queue = try await api.fetchQueue()
            case .recent:
                recent = try await api.fetchRecentOrders(limit: 40)
            }
        } catch {
            if segment == .active { queue = [] } else { recent = [] }
            errorMessage = error.localizedDescription
        }
    }

    private func setStatus(_ order: QueueOrder, status: String) async {
        updatingId = order.id
        defer { updatingId = nil }
        do {
            try await api.updateOrderStatus(orderId: order.id, status: status)
            CompanionHaptics.success()
            await load()
        } catch {
            errorMessage = error.localizedDescription
            CompanionHaptics.warning()
        }
    }

    private func advance(_ order: QueueOrder) async {
        guard let current = OrderStatus(rawValue: order.status),
              let next = current.nextInQueue else { return }
        await setStatus(order, status: next.rawValue)
    }
}

private struct FilterChip: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.bold())
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selected ? CompanionTheme.brand : Color.secondary.opacity(0.12), in: Capsule())
                .foregroundStyle(selected ? .white : .primary)
        }
    }
}

private struct QueueOrderRow: View {
    let order: QueueOrder
    let isUpdating: Bool
    let onAdvance: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(order.displayTitle)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
                CompanionStatusBadge(status: order.status, compact: true)
            }
            Text(order.displayClient)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if let machine = order.machine, !machine.isEmpty {
                Label(machine, systemImage: "printer")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack {
                if let due = order.formattedDueDate {
                    Label(String(format: L10n.tr("orders.due"), due), systemImage: "calendar")
                        .font(.caption2)
                        .foregroundStyle(order.isOverdue ? .red : .tertiary)
                }
                if order.isOverdue {
                    Text(L10n.tr("orders.overdue"))
                        .font(.caption2.bold())
                        .foregroundStyle(.red)
                }
            }
            if OrderStatus(rawValue: order.status)?.nextInQueue != nil {
                Button(action: onAdvance) {
                    if isUpdating {
                        ProgressView().controlSize(.small)
                    } else {
                        Label(L10n.tr("orders.advance"), systemImage: "arrow.right.circle")
                            .font(.caption.bold())
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(isUpdating)
            }
        }
        .padding(.vertical, 4)
    }
}
