import SwiftUI

/// Active production queue + recent order history.
struct OrdersView: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var ordersNav: OrdersNavigationState

    enum Segment: String, CaseIterable, Identifiable {
        case active
        case recent
        case intake
        var id: String { rawValue }
        var title: String {
            switch self {
            case .active: return L10n.tr("orders.active")
            case .recent: return L10n.tr("orders.recent")
            case .intake: return L10n.tr("intake.title")
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
    @State private var recentStatusFilter: String?
    @State private var errorMessage: String?
    @State private var updatingId: String?
    @State private var selectedOrder: QueueOrder?
    @State private var selectedLogEntry: OrderLogEntry?
    @State private var recentSearch = ""
    @State private var loadGeneration = 0

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

                switch segment {
                case .active:
                    activeContent
                case .recent:
                    recentContent
                case .intake:
                    IntakeView()
                }
            }
            .khaytScreen(title: L10n.tr("tab.orders"))
            .toolbar { ToolbarItem(placement: .topBarTrailing) { ConnectionBadge() } }
            .refreshable { await load() }
            .task(id: segment) { await load() }
            .onAppear { applyExternalFilters() }
            .onChange(of: ordersNav.pendingStatusFilter) { _, _ in applyExternalFilters() }
            .onChange(of: ordersNav.ordersTabRequest) { _, _ in applyExternalFilters() }
            .sheet(item: $selectedOrder) { order in
                OrderDetailSheet(
                    order: order,
                    isUpdating: updatingId == order.id,
                    onAdvance: { Task { await advance(order) } },
                    onSetStatus: { status in Task { await setStatus(order, status: status) } },
                    onAssignMachine: { machineId in Task { await assignMachine(order, machineId: machineId) } }
                )
            }
            .sheet(item: $selectedLogEntry) { entry in
                OrderLogDetailSheet(entry: entry)
            }
        }
    }

    private func applyExternalFilters() {
        if let pendingSegment = ordersNav.pendingSegment {
            segment = {
                switch pendingSegment {
                case .active: return .active
                case .recent: return .recent
                case .intake: return .intake
                }
            }()
            ordersNav.pendingSegment = nil
        }
        if let pending = ordersNav.pendingStatusFilter {
            if pending == .completed {
                segment = .recent
                recentStatusFilter = OrderStatus.completed.rawValue
                activeFilter = .all
            } else {
                activeFilter = .status(pending)
                segment = .active
                recentStatusFilter = nil
            }
            ordersNav.pendingStatusFilter = nil
            Task { await load() }
        } else if UserDefaults.standard.string(forKey: "khayt.orders.filter") == "orders_overdue" {
            activeFilter = .overdue
            segment = .active
            recentStatusFilter = nil
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
                    ForEach([OrderStatus.pending, .printing, .post, .qc], id: \.self) { st in
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
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .environment(\.defaultMinListRowHeight, 56)
            }
        }
    }

    private var filteredRecent: [OrderLogEntry] {
        let q = recentSearch.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return recent }
        return recent.filter {
            $0.displayTitle.lowercased().contains(q)
                || $0.displayClient.lowercased().contains(q)
                || $0.id.lowercased().contains(q)
                || ($0.material ?? "").lowercased().contains(q)
        }
    }

    @ViewBuilder
    private var recentContent: some View {
        Group {
            if recent.isEmpty && errorMessage == nil {
                ProgressView()
            } else if filteredRecent.isEmpty {
                ContentUnavailableView(
                    L10n.tr("orders.recent"),
                    systemImage: "clock",
                    description: Text(errorMessage ?? "—")
                )
            } else {
                List(filteredRecent) { entry in
                    Button {
                        selectedLogEntry = entry
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(entry.displayTitle)
                                    .font(.headline)
                                    .foregroundStyle(KhaytDesign.text)
                                Spacer()
                                CompanionStatusBadge(status: entry.status, compact: true)
                            }
                            Text(entry.displayClient)
                                .font(.subheadline)
                                .foregroundStyle(KhaytDesign.textDim)
                            HStack {
                                if let date = entry.date ?? entry.dueDate {
                                    Text(date)
                                        .font(.caption)
                                        .foregroundStyle(KhaytDesign.textMuted)
                                }
                                if let payment = entry.paymentStatus, !payment.isEmpty {
                                    Text(payment.capitalized)
                                        .font(.caption2)
                                        .foregroundStyle(KhaytDesign.textMuted)
                                }
                                if entry.isOverdue {
                                    Text(L10n.tr("orders.overdue"))
                                        .font(.caption2.bold())
                                        .foregroundStyle(KhaytDesign.danger)
                                }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(KhaytDesign.surface)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .environment(\.defaultMinListRowHeight, 56)
            }
        }
        .searchable(text: $recentSearch, prompt: L10n.tr("orders.search"))
    }

    private func load() async {
        let generation = loadGeneration + 1
        loadGeneration = generation
        errorMessage = nil
        do {
            switch segment {
            case .active:
                let data = try await api.fetchQueue()
                guard generation == loadGeneration else { return }
                queue = data
            case .recent:
                let data = try await api.fetchRecentOrders(limit: 40, status: recentStatusFilter)
                guard generation == loadGeneration else { return }
                recent = data
                recentStatusFilter = nil
            case .intake:
                break
            }
        } catch {
            guard generation == loadGeneration else { return }
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
            if let id = selectedOrder?.id,
               let updated = queue.first(where: { $0.id == id }) {
                selectedOrder = updated
            }
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

    private func assignMachine(_ order: QueueOrder, machineId: String?) async {
        updatingId = order.id
        defer { updatingId = nil }
        do {
            try await api.assignOrderMachine(orderId: order.id, machineId: machineId)
            CompanionHaptics.success()
            await load()
            if let id = selectedOrder?.id,
               let updated = queue.first(where: { $0.id == id }) {
                selectedOrder = updated
            }
        } catch {
            errorMessage = error.localizedDescription
            CompanionHaptics.warning()
        }
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
                .padding(.vertical, 10)
                .frame(minHeight: 44)
                .background(selected ? KhaytDesign.brand : KhaytDesign.surface2, in: Capsule())
                .foregroundStyle(selected ? Color.white : KhaytDesign.textDim)
        }
        .buttonStyle(.plain)
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
                    .foregroundStyle(KhaytDesign.text)
                Spacer()
                CompanionStatusBadge(status: order.status, compact: true)
            }
            Text(order.displayClient)
                .font(.subheadline)
                .foregroundStyle(KhaytDesign.textDim)
            if let machine = order.machine, !machine.isEmpty {
                Label(machine, systemImage: "printer")
                    .font(.caption)
                    .foregroundStyle(KhaytDesign.textMuted)
            }
            HStack {
                if let due = order.formattedDueDate {
                    Label(String(format: L10n.tr("orders.due"), due), systemImage: "calendar")
                        .font(.caption2)
                        .foregroundStyle(order.isOverdue ? KhaytDesign.danger : KhaytDesign.textMuted)
                }
                if order.isOverdue {
                    Text(L10n.tr("orders.overdue"))
                        .font(.caption2.bold())
                        .foregroundStyle(KhaytDesign.danger)
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
                .frame(minHeight: 44, alignment: .leading)
                .foregroundStyle(KhaytDesign.brand)
                .disabled(isUpdating)
            }
        }
        .padding(.vertical, 4)
    }
}
