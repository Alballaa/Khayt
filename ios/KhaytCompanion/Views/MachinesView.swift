import SwiftUI

struct MachinesView: View {
    @EnvironmentObject private var api: KhaytAPIClient
    @EnvironmentObject private var health: ConnectionHealth

    @State private var machines: [MachineInfo] = []
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Group {
                if machines.isEmpty && errorMessage == nil {
                    ProgressView()
                } else if machines.isEmpty {
                    ContentUnavailableView(
                        "No machines",
                        systemImage: "printer",
                        description: Text(errorMessage ?? "Add printers in Khayt desktop.")
                    )
                } else {
                    List(machines) { machine in
                        MachineRow(machine: machine)
                            .listRowBackground(KhaytDesign.surface)
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .khaytScreen(title: L10n.tr("tab.machines"))
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        errorMessage = nil
        do {
            machines = try await api.fetchMachines()
        } catch {
            machines = []
            errorMessage = error.localizedDescription
        }
    }

}

private struct MachineRow: View {
    let machine: MachineInfo

    private var glyph: String {
        (machine.type ?? "").lowercased().contains("resin") ? "cube.transparent" : "printer.fill"
    }

    var body: some View {
        HStack(spacing: 12) {
            let color = machine.status.map { KhaytDesign.statusColor(for: $0) } ?? KhaytDesign.textMuted
            Image(systemName: glyph)
                .font(.system(size: 17))
                .foregroundStyle(color)
                .frame(width: 38, height: 38)
                .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 3) {
                Text(machine.name ?? machine.id)
                    .font(.headline)
                    .foregroundStyle(KhaytDesign.text)
                if let type = machine.type {
                    Text(type.uppercased())
                        .font(.caption)
                        .foregroundStyle(KhaytDesign.textDim)
                }
            }
            Spacer()
            if let status = machine.status {
                CompanionStatusBadge(status: status, compact: true)
            }
        }
        .padding(.vertical, 4)
    }
}
