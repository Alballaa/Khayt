import SwiftUI

struct DashboardView: View {
    @Environment(AppState.self) private var appState
    @State private var status: QueueStatus = .empty
    @State private var machines: [Machine] = []
    @State private var error: String?
    @State private var isLoading = false

    private let grid = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let error { ErrorBanner(message: error) }

                LazyVGrid(columns: grid, spacing: 12) {
                    StatTile(title: "In queue", value: status.queued, tint: .blue, icon: "tray.full.fill")
                    StatTile(title: "Printing", value: status.printing, tint: .indigo, icon: "scribble")
                    StatTile(title: "Post-proc.", value: status.post, tint: .orange, icon: "paintbrush.fill")
                    StatTile(title: "QC", value: status.qc, tint: .purple, icon: "checkmark.seal.fill")
                    StatTile(title: "Pending", value: status.pending, tint: .gray, icon: "hourglass")
                    StatTile(title: "Done today", value: status.completedToday, tint: .green, icon: "checkmark.circle.fill")
                }

                if !machines.isEmpty {
                    Text("Machines")
                        .font(.title3.weight(.semibold))
                        .padding(.top, 8)
                    VStack(spacing: 8) {
                        ForEach(machines) { machine in
                            MachineRow(machine: machine)
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Dashboard")
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        guard let api = appState.api else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            async let s = api.status()
            async let m = api.machines()
            self.status = try await s
            self.machines = try await m
            self.error = nil
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct StatTile: View {
    let title: String
    let value: Int
    let tint: Color
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(tint)
                Spacer()
            }
            Text("\(value)")
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .contentTransition(.numericText())
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.1), in: .rect(cornerRadius: 14))
    }
}

struct MachineRow: View {
    let machine: Machine
    var body: some View {
        HStack {
            Circle().fill(machine.statusTint).frame(width: 10, height: 10)
            VStack(alignment: .leading) {
                Text(machine.name).font(.body.weight(.medium))
                if let type = machine.type {
                    Text(type).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text((machine.status ?? "—").capitalized)
                .font(.caption.weight(.semibold))
                .foregroundStyle(machine.statusTint)
        }
        .padding()
        .background(.regularMaterial, in: .rect(cornerRadius: 10))
    }
}
